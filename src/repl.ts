import app = require("./app");
import {autoFocus} from "./utils";

let WebSocket = require('ws');
let uuid = require("uuid");

enum CardState {
  NONE,
  GOOD,
  PENDING,
  CLOSED,
  ERROR,
}

enum ReplState {
  CONNECTED,
  DISCONNECTED,
  CONNECTING,
}

export interface Query {
  type: string,
  query: string,
  id: string,
}

interface ReplCard {
  id: string,
  ix: number,
  state: CardState,
  focused: boolean,
  query: string,
  result: {
    fields: Array<string>,
    values: Array<Array<any>>,
  } | string,
}

function rerender(removeCards?: boolean) {
  if (removeCards === undefined) {
    removeCards = false;
  }
  // Batch delete closed cards on rerender
  if (removeCards) {
    let closedCards = replCards.filter((r) => r.state === CardState.CLOSED);
    if (server.timer !== undefined) {
      clearTimeout(server.timer);
    }
    let focusedCard = replCards.filter((r) => r.focused).shift();
    let focusIx = 0;
    if (focusedCard !== undefined) {
      focusIx = focusedCard.ix;
    }
    focusedCard = replCards[focusIx + 1 > replCards.length - 1 ? replCards.length - 1 : focusIx + 1];
    focusCard(focusedCard);
    server.timer = setTimeout(() => {
      for (let card of closedCards) {
        deleteStoredReplCard(card);
        replCards.splice(replCards.map((r) => r.id).indexOf(card.id),1);
      }
      if (closedCards !== undefined) {
        replCards.forEach((r,i) => r.ix = i);    
      }
      rerender(false);
    }, 250);
  }
  app.dispatch("rerender", {}).commit();
}

function delayedRerender(timeout: number) {
  setTimeout(() => {
    rerender()
  }, timeout);  
}

// ------------------
// Storage functions
// ------------------

function saveReplCard(replCard: ReplCard) {
  localStorage.setItem("everepl-" + replCard.id, JSON.stringify(replCard));  
}

function loadReplCards(): Array<ReplCard> {
  let storedReplCards: Array<ReplCard> = [];
  for (let item in localStorage) {
    if (item.substr(0,7) === "everepl") {
      let storedReplCard = JSON.parse(localStorage[item]);
      storedReplCards.push(storedReplCard);
    }
  }
  if (storedReplCards.length > 0) {
    storedReplCards.map((r) => r.focused = false);
    storedReplCards = storedReplCards.sort((a,b) => a.ix - b.ix);
    storedReplCards.forEach((r,i) => r.ix = i);
  }
  return storedReplCards;
}

function deleteStoredReplCard(replCard: ReplCard) {
  localStorage.removeItem("everepl-" + replCard.id);
}

// ------------------
// Server functions
// ------------------

let server = { state: ReplState.CONNECTING, queue: [], ws: null, timer: undefined, timeout: 0};

app.renderRoots["repl"] = root;
connectToServer();

function connectToServer() {
  let wsAddress = "ws://localhost:8081";
  let ws: WebSocket = new WebSocket(wsAddress, []);
  server.ws = ws;

  ws.onopen = function(e: Event) {    
    server.state = ReplState.CONNECTED;
    server.timeout = 0;
    while(server.queue.length > 0) {
      let message = server.queue.shift();
      sendMessage(message);
    }
    rerender()
  }

  ws.onerror = function(error) {
    server.state = ReplState.DISCONNECTED;
    rerender()
  }

  ws.onclose = function(error) {  
    server.state = ReplState.DISCONNECTED;
    reconnect();
    rerender()
  }

  ws.onmessage = function(message) {
    let parsed = JSON.parse(message.data);
    // Update the result of the correct repl card
    let targetCard = replCards.filter((r) => r.id === parsed.id).shift();
    if (targetCard !== undefined) {
      if (parsed.type === "result") {
        targetCard.state = CardState.GOOD;
        targetCard.result = {
          fields: parsed.fields,
          values: parsed.values,
        }
        saveReplCard(targetCard);
      } else if (parsed.type === "error") {
        targetCard.state = CardState.ERROR;
        targetCard.result = parsed.cause;
        saveReplCard(targetCard);
      } else if (parsed.type === "close") {
        let removeIx = replCards.map((r) => r.id).indexOf(parsed.id);
        if (removeIx >= 0) {
          replCards[removeIx].state = CardState.CLOSED;
        }
        rerender(true);
      }
    }
    rerender()
  };
}

let checkReconnectInterval = undefined;
function reconnect() {
  if(server.state === ReplState.CONNECTED) {
    clearTimeout(checkReconnectInterval);
    checkReconnectInterval = undefined;
  } else {
    checkReconnectInterval = setTimeout(connectToServer, server.timeout * 1000);
  }
  if (server.timeout < 32) {
    server.timeout += server.timeout > 0 ? server.timeout : 1;
  }
}

function sendMessage(message): boolean {
  if (server.ws.readyState === server.ws.OPEN) {
    server.ws.send(JSON.stringify(message));
    return true;  
  } else {
    server.queue.push(message);
    return false;
  }
}

// ------------------
// Card functions
// ------------------

function newReplCard(): ReplCard {
  let replCard: ReplCard = {
    id: uuid(),
    ix: replCards.length > 0 ? replCards.map((r) => r.ix).pop() + 1 : 0,
    state: CardState.NONE,
    focused: false,
    query: "",
    result: undefined,
  }
  return replCard;
}

function deleteReplCard(replCard: ReplCard) {
  if (replCard.state !== CardState.NONE) {
    let closemessage = {
      type: "close",
      id: replCard.id,
    };
    sendMessage(closemessage);
    replCard.state = CardState.PENDING;
    replCard.result = "Deleting card...";
  } 
}

function focusCard(replCard: ReplCard) {
  replCards.forEach((r) => r.focused = false);
  replCard.focused = true;
}

// ------------------
// Event handlers
// ------------------

function queryInputKeydown(event, elem) {
  let thisReplCard = replCards[elem.ix];
  // Submit the query with ctrl + enter
  if (event.keyCode === 13 && event.ctrlKey === true) {
    let query: Query = {
      id: thisReplCard.id,
      type: "query",
      query: thisReplCard.query.replace(/\s+/g,' '),
    }
    thisReplCard.state = CardState.PENDING;    
    let sent = sendMessage(query);
    if (sent) {
      thisReplCard.result = "Waiting on response from server...";
    } else {
      thisReplCard.result = "Message queued.";
    }
    // Create a new card if we submitted the last one in replCards
    if (thisReplCard.ix === replCards.length - 1) {
      let nReplCard = newReplCard();
      replCards.forEach((r) => r.focused = false);
      nReplCard.focused = true;
      replCards.push(nReplCard);
    }
  // Catch tab
  } else if (event.keyCode === 9) {
    let range = getSelection(event.target);
    //let value = event.target.innerText;
    //value = value.substring(0, range[0]) + "  " + value.substring(range[1]);
    //event.target.innerHTML = value;
    //setSelection(range[0] + 2,range[0] + 2);
  // Catch ctrl + arrow up or page up
  } else if (event.keyCode === 38 && event.ctrlKey === true || event.keyCode === 33) {
    // Set the focus to the previous repl card
    let previousIx = replCards.filter((r) => r.ix < thisReplCard.ix && r.state !== CardState.CLOSED).map((r) => r.ix).pop();
    previousIx = previousIx === undefined ? 0 : previousIx;
    focusCard(replCards[previousIx]);
  // Catch ctrl + arrow down or page down
  } else if (event.keyCode === 40 && event.ctrlKey === true || event.keyCode === 34) {
    // Set the focus to the next repl card
    let nextIx = thisReplCard.ix + 1 <= replCards.length - 1 ? thisReplCard.ix + 1 : replCards.length - 1;
    focusCard(replCards[nextIx]);
  // Catch ctrl + delete to remove a card
  } else if (event.keyCode === 46 && event.ctrlKey === true) {
    deleteReplCard(thisReplCard);
  } else {
    return;
  }
  event.preventDefault();
  rerender();
}
  
function getSelection(editableDiv): Array<number> {
  let sel: any = window.getSelection();
  let range = [sel.baseOffset, sel.extentOffset];
  range = range.sort();
  return range;
}

function setSelection(start: number, stop: number) {
  let sel = window.getSelection();
  sel.setBaseAndExtent(sel.anchorNode, start, sel.anchorNode, stop);
}

function queryInputKeyup(event, elem) {
  let thisReplCard = replCards[elem.ix];
  thisReplCard.query = event.target.innerText;
}

function queryInputBlur(event, elem) {
  let thisReplCard = replCards[elem.ix];
  thisReplCard.focused = false;
  rerender();
}

function replCardClick(event, elem) {
  focusCard(replCards[elem.ix]);
  rerender();
}

function deleteAllCards(event, elem) {
  replCards.forEach(deleteReplCard);
}

function focusQueryBox(node, element) {
  if (element.focused) {
    node.focus();
  }
}

// ------------------
// Element generation
// ------------------

function generateReplCardElement(replCard: ReplCard) { 
  let queryInput = {
    ix: replCard.ix, 
    key: `${replCard.id}${replCard.focused}`, 
    focused: replCard.focused,
    c: "query-input",
    contentEditable: true,
    text: replCard.query,
    keydown: queryInputKeydown, 
    blur: queryInputBlur, 
    keyup: queryInputKeyup,    
    postRender: focusQueryBox, 
  };
  // Set the css according to the card state
  let resultcss = "query-result"; 
  let resultText = undefined;
  let resultTable = undefined;
  let replClass = "repl-card";
  // Format card based on state
  if (replCard.state === CardState.GOOD) {
    resultcss += " good";
    let result: any = replCard.result; 
    let tableHeader = {c: "header", children: result.fields.map((f: string) => {
      return {c: "cell", text: f};
    })};
    let tableBody = result.values.map((r: Array<any>) => {
      return {c: "row", children: r.map((c: any) => {
        return {c: "cell", text: `${c}`};
      })};
    });
    let tableRows = [tableHeader].concat(tableBody);
    resultTable = {c: "table", children: tableRows};
  } else if (replCard.state === CardState.ERROR) {
    resultcss += " bad";
    resultText = `${replCard.result}`;
  } else if (replCard.state === CardState.PENDING) {
    resultcss += " pending";
    resultText = `${replCard.result}`;
  } else if (replCard.state === CardState.CLOSED) {
    resultcss += " closed";
    replClass += " noheight";
    resultText = `Query closed.`;
  }
  
  let queryResult = replCard.result === undefined ? {} : {c: resultcss, text: resultText ? resultText : "", children: resultTable ? [resultTable] : []};
  replClass += replCard.focused ? " selected" : "";
  
  let replCardElement = {
    id: replCard.id,
    c: replClass,
    click: replCardClick,
    children: [queryInput, queryResult],
  };
  return replCardElement;
}

function generateStatusBarElement() {
  let indicator = "connecting";
  if (server.state === ReplState.CONNECTED) {
    indicator = "connected";
  } else if (server.state === ReplState.DISCONNECTED) {
    indicator = "disconnected";
  }
  let statusIndicator = {c: `indicator ${indicator} left`};
  let trash = {c: "ion-trash-a button right", click: deleteAllCards};
  let save = {c: "ion-ios-download-outline button right"};
  let load = {c: "ion-ios-upload-outline button right"};
  let darkmode = {c: "ion-ios-lightbulb button right"};
  let refresh = {c: `ion-refresh button ${server.state !== ReplState.DISCONNECTED ? "hidden" : ""} left`, text: " Reconnect", click: function () { server.timeout = 0; reconnect(); } };    
  let statusBar = {
    id: "status-bar",
    c: "status-bar",
    children: [statusIndicator, refresh, trash, save, load, darkmode],
  }
  return statusBar;
}

// Create an initial repl card
let replCards: Array<ReplCard> = loadReplCards();
replCards.push(newReplCard());
replCards[0].focused = true;

function root() {
  let replRoot = {
    id: "card-root",
    c: "card-root",
    children: replCards.map(generateReplCardElement),
  }
  let root = {
    id: "repl-root",
    c: "repl-root",
    children: [generateStatusBarElement(), replRoot],
  };
  return root;
}