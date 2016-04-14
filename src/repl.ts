import app = require("./app");
import {autoFocus} from "./utils";
import * as CodeMirror from "codemirror";
import {codeMirrorElement} from "./ui";

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
  col: number,
  state: CardState,
  focused: boolean,
  query: string,
  result: {
    fields: Array<string>,
    values: Array<Array<any>>,
  } | string;
}

function rerender(removeCards?: boolean) {
  /*
  if (removeCards === undefined) {
    removeCards = false;
  }
  // Batch delete closed cards on rerender
  if (removeCards === true) {
    let closedCards = replCards.filter((r) => r.state === CardState.CLOSED);
    if (repl.timer !== undefined) {
      clearTimeout(repl.timer);
    }
    let focusedCard = replCards.filter((r) => r.focused).shift();
    let focusIx = 0;
    if (focusedCard !== undefined) {
      focusIx = focusedCard.ix;
    }
    focusedCard = replCards[focusIx + 1 > replCards.length - 1 ? replCards.length - 1 : focusIx + 1];
    focusCard(focusedCard);
    repl.timer = setTimeout(() => {
      for (let card of closedCards) {
        deleteStoredReplCard(card);
        replCards.splice(replCards.map((r) => r.id).indexOf(card.id),1);
      }
      if (closedCards !== undefined) {
        replCards.forEach((r,i) => r.ix = i);    
      }
      rerender(false);
    }, 250);
  }*/
  app.dispatch("rerender", {}).commit();
}

// ------------------
// Storage functions
// ------------------

/*function saveReplCard(replCard: ReplCard) {
  localStorage.setItem("everepl-" + replCard.id, JSON.stringify(replCard));  
}*/

/*function loadReplCards(): Array<ReplCard> {
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
}*/

/*
function deleteStoredReplCard(replCard: ReplCard) {
  localStorage.removeItem("everepl-" + replCard.id);
}*/

/*
function saveCards() {
  let serialized = JSON.stringify(replCards.filter((r) => r.state !== CardState.NONE).map((r) => r.query));
  let blob = new Blob([serialized], {type: "application/json"});
  let url = URL.createObjectURL(blob);
  repl.blob = url;
}*/

/*
function saveTable() {
  let replCard = replCards.filter((r) => r.focused).pop();
  if (replCard !== undefined) {
    // If the card has results, form the csv  
    if (typeof replCard.result === 'object') {
      let result: any = replCard.result;
      let fields:string = result.fields.join(",");
      let rows: Array<string> = result.values.map((row) => {
        return row.join(",");
      });
      let csv: string = fields + "\r\n" + rows.join("\r\n");
      let blob = new Blob([csv], {type: "text/csv"});
      let url = URL.createObjectURL(blob);
      repl.csv = url;
    } else {
      repl.csv = undefined;
    }
  }
}*/

/*
function loadCards(event:Event, elem) {
  let target = <HTMLInputElement>event.target;
  if(!target.files.length) return;
  if(target.files.length > 1) throw new Error("Cannot load multiple files at once");
  let file = target.files[0];
  let reader = new FileReader();
  reader.onload = function(event:any) {
    let serialized = event.target.result;
    let queries = JSON.parse(serialized);
    let cards = queries.map((q) => {
      let card = newReplCard();
      card.query = q;
      return card;
    });
    replCards = cards;
    replCards.forEach((r,i) => r.ix = i);
    replCards.forEach((r) => submitReplCard(r));
    rerender();
  };
  reader.readAsText(file);
  event.stopPropagation();
  closeModals();
  rerender();
}*/

// ------------------
// Repl functions
// ------------------

let repl = { 
  state: ReplState.CONNECTING,
  columns: 0, 
  blob: undefined, 
  csv: undefined, 
  load: false, 
  delete: false, 
  queue: [], 
  ws: null, 
  timer: undefined, 
  timeout: 0 
};

app.renderRoots["repl"] = root;
connectToServer();

function connectToServer() {
  let wsAddress = "ws://localhost:8081";
  let ws: WebSocket = new WebSocket(wsAddress, []);
  repl.ws = ws;

  ws.onopen = function(e: Event) {    
    repl.state = ReplState.CONNECTED;
    repl.timeout = 0;
    while(repl.queue.length > 0) {
      let message = repl.queue.shift();
      sendMessage(message);
    }
    rerender()
  }

  ws.onerror = function(error) {
    repl.state = ReplState.DISCONNECTED;
    rerender()
  }

  ws.onclose = function(error) {  
    repl.state = ReplState.DISCONNECTED;
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
        //saveReplCard(targetCard);
      } else if (parsed.type === "error") {
        targetCard.state = CardState.ERROR;
        targetCard.result = parsed.cause;
        //saveReplCard(targetCard);
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
  if(repl.state === ReplState.CONNECTED) {
    clearTimeout(checkReconnectInterval);
    checkReconnectInterval = undefined;
  } else {
    checkReconnectInterval = setTimeout(connectToServer, repl.timeout * 1000);
  }
  if (repl.timeout < 32) {
    repl.timeout += repl.timeout > 0 ? repl.timeout : 1;
  }
}

function sendMessage(message): boolean {
  if (repl.ws.readyState === repl.ws.OPEN) {
    repl.ws.send(JSON.stringify(message));
    return true;  
  } else {
    repl.queue.push(message);
    return false;
  }
}

// ------------------
// Card functions
// ------------------

function newReplCard(col? :number): ReplCard {
  let replCard: ReplCard = {
    id: uuid(),
    ix: replCards.length > 0 ? replCards.map((r) => r.ix).pop() + 1 : 0,
    col: col === undefined ? 0 : col,
    state: CardState.NONE,
    focused: false,
    query: "",
    result: undefined,
  }
  return replCard;
}
/*
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
}*/

function submitReplCard(replCard: ReplCard) {
  let query: Query = {
    id: replCard.id,
    type: "query",
    query: replCard.query.replace(/\s+/g,' '),
  }
  replCard.state = CardState.PENDING;    
  let sent = sendMessage(query);
  if (replCard.result === undefined) {
    if (sent) {
      replCard.result = "Waiting on response from server...";
    } else {
      replCard.result = "Message queued.";
    }
  }
  // Create a new card if we submitted the last one in replCards
  if (replCard.ix === replCards.length - 1) {
    let nReplCard = newReplCard();
    replCards.forEach((r) => r.focused = false);
    nReplCard.focused = true;
    replCards.push(nReplCard);
  }
}

function focusCard(replCard: ReplCard) {
  replCards.forEach((r) => r.focused = false);
  replCard.focused = true;
}

function closeModals() {
  repl.blob = undefined;
  repl.delete = false;
  repl.load = false;
}

// ------------------
// Event handlers
// ------------------

function queryInputKeydown(event, elem) {
  let thisReplCard = replCards[elem.ix];
  // Submit the query with ctrl + enter
  if ((event.keyCode === 13 || event.keyCode === 83) && event.ctrlKey === true) {
    submitReplCard(thisReplCard);
  // Catch tab
  /*
  } else if (event.keyCode === 9) {
    let range = getSelection(event.target);
    //let value = event.target.innerText;
    //value = value.substring(0, range[0]) + "  " + value.substring(range[1]);
    //event.target.innerHTML = value;
    //setSelection(range[0] + 2,range[0] + 2);
  */
  // Catch ctrl + arrow up or page up
  } else if (event.keyCode === 38 && event.ctrlKey === true || event.keyCode === 33) {
    // Set the focus to the previous repl card
    //let previousIx = replCards.filter((r) => r.ix < thisReplCard.ix && r.state !== CardState.CLOSED).map((r) => r.ix).pop();
    //previousIx = previousIx === undefined ? 0 : previousIx;
    //focusCard(replCards[previousIx]);
  // Catch ctrl + arrow down or page down
  } else if (event.keyCode === 40 && event.ctrlKey === true || event.keyCode === 34) {
    // Set the focus to the next repl card
    //let nextIx = thisReplCard.ix + 1 <= replCards.length - 1 ? thisReplCard.ix + 1 : replCards.length - 1;
    //focusCard(replCards[nextIx]);
  // Catch ctrl + delete to remove a card
  } else if (event.keyCode === 46 && event.ctrlKey === true) {
    //deleteReplCard(thisReplCard);
  // Catch ctrl + home  
  } else if (event.keyCode === 36 && event.ctrlKey === true) {
    //focusCard(replCards[0]);
  // Catch ctrl + end
  } else if (event.keyCode === 35 && event.ctrlKey === true) {
    //focusCard(replCards[replCards.length - 1]);
  } else {
    return;
  }
  event.preventDefault();
  rerender();
}
/*
function getSelection(editableDiv): Array<number> {
  let sel: any = window.getSelection();
  let range = [sel.baseOffset, sel.extentOffset];
  range = range.sort();
  return range;
}*/
/*
function setSelection(start: number, stop: number) {
  let sel = window.getSelection();
  sel.setBaseAndExtent(sel.anchorNode, start, sel.anchorNode, stop);
}*/

function queryInputKeyup(event, elem) {
  let thisReplCard = replCards[elem.ix];
  let target = document.querySelectorAll(".query-input");
  let cm: CodeMirror.Editor = target[elem.ix]["cm"];  
  thisReplCard.query = cm.getValue();
  //submitReplCard(thisReplCard);
}

/*function queryInputBlur(event, elem) {
  let thisReplCard = replCards[elem.ix];
  thisReplCard.focused = false;
  rerender();
}*/
/*
function replCardClick(event, elem) {
  focusCard(replCards[elem.ix]);
  rerender();
}*/
/*
function deleteAllCards(event, elem) {
  replCards.forEach(deleteReplCard);
  closeModals();
  event.stopPropagation();
  rerender();
}*/
/*
function focusQueryBox(node, element) {
  if (element.focused) {
    node.focus();
  }
}*/
/*
function toggleTheme(event, elem) {
  var theme = localStorage["eveReplTheme"]; 
  if (theme === "dark") { 
    localStorage["eveReplTheme"] = "light"; 
  } else if(theme === "light") { 
    localStorage["eveReplTheme"] = "dark"; 
  } else { 
    localStorage["eveReplTheme"] = "dark"; 
  }
  rerender();
}
*/
/*
function saveCardsClick(event, elem) {
  closeModals();
  saveCards();
  saveTable();
  event.stopPropagation();
  rerender();
}*/
/*
function trashCardsClick(event, elem) {
  closeModals();
  repl.delete = true;
  event.stopPropagation();
  rerender();
}*/
/*
function loadCardsClick(event, elem) {
  closeModals();
  repl.load = true;
  event.stopPropagation();
  rerender();
}*/
function addColumnClick(event, elem) {
  replCards.push(newReplCard(++repl.columns));
  rerender();
}

function addCardClick(event, elem) {
  replCards.push(newReplCard(0));
  rerender();
}

function rootClick(event, elem) {
  closeModals();
  rerender();
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
    value: replCard.query,
    //contentEditable: true,
    //spellcheck: false,
    //text: replCard.query,
    keydown: queryInputKeydown, 
    //blur: queryInputBlur, 
    keyup: queryInputKeyup,    
    //postRender: focusQueryBox, 
    matchBrackets: true,
    lineNumbers: false,
  };
  
  // Set the css according to the card state
  let resultcss = "query-result"; 
  let result = undefined;
  let replClass = "repl-card";
  // Format card based on state
  if (replCard.state === CardState.GOOD || (replCard.state === CardState.PENDING && typeof replCard.result === 'object')) {
    if (replCard.state === CardState.GOOD) {
      resultcss += " good";      
    } else if (replCard.state === CardState.PENDING) {
      resultcss += " pending";
    }
    let cardresult: any = replCard.result;
    let tableHeader = {c: "header", children: cardresult.fields.map((f: string) => {
      return {c: "cell", text: f};
    })};
    let tableBody = cardresult.values.map((r: Array<any>) => {
      return {c: "row", children: r.map((c: any) => {
        return {c: "cell", text: `${c}`};
      })};
    });
    let tableRows = [tableHeader].concat(tableBody);
    result = {c: "table", children: tableRows};
  } else if (replCard.state === CardState.ERROR) {
    resultcss += " bad";
    result = {text: replCard.result};
  } else if (replCard.state === CardState.PENDING) {
    resultcss += " pending";
    result = {text: replCard.result};
  } else if (replCard.state === CardState.CLOSED) {
    resultcss += " closed";
    replClass += " no-height";
    result = {text: `Query closed.`};
  }
  
  let queryResult = {c: resultcss, children: [result]};
  replClass += replCard.focused ? " selected" : "";
  
  let replCardElement = {
    id: replCard.id,
    c: replClass,
    //click: replCardClick,
    children: [codeMirrorElement(queryInput), queryResult],
  };   
  return replCardElement;
}

function generateCardRootElements() {
  let cardRoot = {
    id: "card-root",
    c: "card-root",
    children: [],
  }
  // Build each column and add it to the card root
  let i;
  for (i = 0; i <= repl.columns; i++) {
    let column = {
      id: `card-column${i}`,
      c: "card-column",
      children: replCards.filter((r) => r.col === i).map(generateReplCardElement),
    }
    cardRoot.children.push(column);
  }
  return cardRoot;
}

function generateStatusBarElement() {
  let indicator = "connecting";
  if (repl.state === ReplState.CONNECTED) {
    indicator = "connected";
  } else if (repl.state === ReplState.DISCONNECTED) {
    indicator = "disconnected";
  }
  
  // Build the proper elements of the status bar
  let statusIndicator = {c: `indicator ${indicator} left`};
  let eveLogo = {t: "img", c: "logo", src: "../images/logo_only.png", width: 39, height: 45};
  let deleteButton = {c: "button", text: "Delete Cards"};
  let addColumn = {c: "button", text: "Add Column", click: addColumnClick};
  let addCard = {c: "button", text: "Add Card", click: addCardClick};
  let buttonList = formListElement([deleteButton, addColumn, addCard]);
  // Build the status bar    
  let statusBar = {
    id: "status-bar",
    c: "status-bar",
    children: [eveLogo, buttonList, statusIndicator], //, refresh, trash, save, load, dimmer],
  }
  return statusBar;
}

// Create an initial repl card
let replCards: Array<ReplCard> = [] //loadReplCards();
replCards.push(newReplCard(0));
replCards[0].focused = true;

function root() {
  let root = {
    id: "repl",
    c: "repl",
    children: [generateStatusBarElement(), generateCardRootElements()],
    click: rootClick,
  };  
  return root;
}

// -----------------
// Utility Functions
// -----------------

function formListElement(list: Array<any>) {
  let li = list.map((e) => {return {t: "li", children: [e]};});
  return {t: "ul", children: li};  
}