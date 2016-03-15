import app = require("./app");
import {autoFocus} from "./utils";

let WebSocket = require('ws');
let uuid = require("uuid");

enum CardState {
  NONE,
  GOOD,
  PENDING,
  ERROR,
}

export interface Query {
  type: string,
  query: string,
  id: string,
}

interface ReplCard {
  id: string,
  state: CardState,
  focused: boolean,
  query: string,
  result: {
    fields: Array<string>,
    values: Array<Array<any>>,
  } | string,
}

let server = { connected: false, queue: [], ws: null, timeout: 1};

app.renderRoots["repl"] = root;
connectToServer();

function connectToServer() {
  let wsAddress = "ws://localhost:8081";
  let ws: WebSocket = new WebSocket(wsAddress, []);
  server.ws = ws;

  ws.onopen = function(e: Event) {
    server.connected = true;
    server.timeout = 1;
    while(server.queue.length > 0) {
      let message = server.queue.shift();
      sendMessage(message);
    }
  }

  ws.onerror = function(error) {
    server.connected = false;
  }

  ws.onclose = function(error) {  
    server.connected = false;
    reconnect();
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
      } else if (parsed.type === "error") {
        targetCard.state = CardState.ERROR;
        targetCard.result = parsed.cause;
      } else if (parsed.type === "close") {
        let removeIx = replCards.map((r) => r.id).indexOf(parsed.id);
        if (removeIx >= 0) {
          let cardToDelete = replCards[removeIx];
          let newFocusIx;
          if (cardToDelete.focused) {
            newFocusIx = removeIx - 1 < 0 ? 0 : removeIx - 1;
          }
          replCards.splice(removeIx,1);
          if (newFocusIx !== undefined) {
            replCards[newFocusIx].focused = true;
          }
        }
      }
    }
    app.dispatch("rerender", {}).commit();
  };
}

let checkReconnectInterval = undefined;
function reconnect() {
  if(server.connected) {
    clearTimeout(checkReconnectInterval);
    checkReconnectInterval = undefined;
  } else {
    checkReconnectInterval = setTimeout(connectToServer, server.timeout * 1000);
  }
  if (server.timeout < 32) {
    server.timeout += server.timeout;
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

function newReplCard(): ReplCard {
  let replCard: ReplCard = {
    id: uuid(),
    state: CardState.NONE,
    focused: false,
    query: undefined,
    result: undefined,
  }
  return replCard;
}

function queryInputKeydown(event, elem) {
  let textArea = event.srcElement;
  let thisReplCard = textArea.parentElement;
  let replIDs = replCards.map((r) => r.id);
  let thisReplCardIx = replIDs.indexOf(thisReplCard._id);
  // Submit the query with ctrl + enter
  if (event.keyCode === 13 && event.ctrlKey === true) {
    let queryString = textArea.value;
    let query: Query = {
      id: thisReplCard._id,
      type: "query",
      query: queryString,
    }
    replCards[thisReplCardIx].state = CardState.PENDING;    
    let sent = sendMessage(query);
    if (sent) {
      replCards[thisReplCardIx].result = "Waiting on response from server...";
    } else {
      replCards[thisReplCardIx].result = "Message queued.";
    }
    // Create a new card if we submitted the last one in replCards
    if (thisReplCardIx === replCards.length - 1) {
      let nReplCard = newReplCard();
      replCards.forEach((r) => r.focused = false);
      nReplCard.focused = true;
      replCards.push(nReplCard);
    }
    event.preventDefault();
    app.dispatch("rerender", {}).commit();
  // Catch tab
  } else if (event.keyCode === 9) {
    let start = textArea.selectionStart;
    let end = textArea.selectionEnd;
    let value = textArea.value;
    value = value.substring(0, start) + "  " + value.substring(end);
    textArea.value = value;
    textArea.selectionStart = textArea.selectionEnd = start + 2;
    event.preventDefault();
  // Catch ctrl + arrow up or page up
  } else if (event.keyCode === 38 && event.ctrlKey === true || event.keyCode === 33) {
    // Set the focus to the previous repl card
    let previousIx = thisReplCardIx - 1 >= 0 ? thisReplCardIx - 1 : 0;
    replCards.forEach((r) => r.focused = false);
    replCards[previousIx].focused = true;
    event.preventDefault();
    app.dispatch("rerender", {}).commit();
  // Catch ctrl + arrow down or page down
  } else if (event.keyCode === 40 && event.ctrlKey === true || event.keyCode === 34) {
    // Set the focus to the next repl card
    let nextIx = thisReplCardIx + 1 <= replIDs.length - 1 ? thisReplCardIx + 1 : replIDs.length - 1;
    replCards.forEach((r) => r.focused = false);
    replCards[nextIx].focused = true;
    event.preventDefault();
    app.dispatch("rerender", {}).commit();
  // Catch ctrl + delete to remove a card
  } else if (event.keyCode === 46 && event.ctrlKey === true) {
    if (replCards[thisReplCardIx].state !== CardState.NONE) {
      let closemessage = {
        type: "close",
        id: replCards[thisReplCardIx].id,
      };
      sendMessage(closemessage);
      replCards[thisReplCardIx].state = CardState.PENDING;
      replCards[thisReplCardIx].result = "Deleting card...";
      event.preventDefault();
      app.dispatch("rerender", {}).commit();
    }
  }
}

function replCardClick(event, elem) {
  let thisReplCardIx = elem.ix;
  replCards.forEach((r) => r.focused = false);
  replCards[elem.ix].focused = true;
  app.dispatch("rerender", {}).commit();
}

function focusQueryBox(node,element) {
  if (element.focused) {
    node.focus();
  }
}

function newReplCardElement(replCard: ReplCard) { 
  let queryInput = {t: "textarea", c: "query-input", placeholder: "query", keydown: queryInputKeydown, key: `${replCard.id}${replCard.focused}`, postRender: focusQueryBox, focused: replCard.focused};
  // Set the css according to the card state
  let resultcss = "query-result"; 
  let resultText = undefined;
  let resultTable = undefined;
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
  }
  
  let queryResult = replCard.result === undefined ? {} : {c: resultcss, text: resultText ? resultText : "", children: resultTable ? [resultTable] : []};
  let replClass = "repl-card";
  replClass += replCard.focused ? " selected" : "";
  
  let replCardElement = {
    id: replCard.id,
    c: replClass,
    click: replCardClick,
    children: [queryInput, queryResult],
  };
  return replCardElement;
}

// Create an initial repl card
let replCards: Array<ReplCard> = [newReplCard()];
replCards[0].focused = true;

function root() {
  let replroot = {
    id: "root",
    c: "repl-root",
    children: replCards.map(newReplCardElement),
  };
  return replroot;
}
