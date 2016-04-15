import app = require("./app");
import {autoFocus} from "./utils";
import * as CodeMirror from "codemirror";
import {codeMirrorElement} from "./ui";

let WebSocket = require('ws');
let uuid = require("uuid");

// ------------------
// Preamble
// ------------------

enum CardState {
  NONE,
  GOOD,
  PENDING,
  CLOSED,
  ERROR,
}

enum ConnectionState {
  CONNECTED,
  DISCONNECTED,
  CONNECTING,
}

enum CardDisplay {
  QUERY,
  RESULT,
  BOTH,  
}

export interface QueryMessage {
  type: string,
  query: string,
  id: string,
}

export interface CloseMessage {
  type: string,
  id: string,
}

interface ReplCard {
  id: string,
  row: number,
  col: number,
  state: CardState,
  focused: boolean,
  query: string,
  result: {
    fields: Array<string>,
    values: Array<Array<any>>,
  } | string;
  display: CardDisplay,
}

interface ServerConnection {
  state: ConnectionState,
  queue: Array<QueryMessage | CloseMessage>,
  ws: any,
  timer: any,
  timeout: number,
}

interface Deck {
  columns: number,
  focused: ReplCard,
  cards: Array<ReplCard>,
}

interface Repl {
  decks: Array<Deck>,
  deck: Deck,
  server: ServerConnection,
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
// Server functions
// ------------------

function connectToServer() {
  let wsAddress = "ws://localhost:8081";
  let ws: WebSocket = new WebSocket(wsAddress, []);
  repl.server.ws = ws;

  ws.onopen = function(e: Event) {    
    repl.server.state = ConnectionState.CONNECTED;
    repl.server.timeout = 0;
    while(repl.server.queue.length > 0) {
      let message = repl.server.queue.shift();
      sendMessage(message);
    }
    rerender()
  }

  ws.onerror = function(error) {
    repl.server.state = ConnectionState.DISCONNECTED;
    rerender()
  }

  ws.onclose = function(error) {  
    repl.server.state = ConnectionState.DISCONNECTED;
    reconnect();
    rerender()
  }

  ws.onmessage = function(message) {
    let parsed = JSON.parse(message.data);
    // Update the result of the correct repl card
    let targetCard = repl.deck.cards.filter((r) => r.id === parsed.id).shift();
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
        let removeIx = repl.deck.cards.map((r) => r.id).indexOf(parsed.id);
        if (removeIx >= 0) {
          replCards[removeIx].state = CardState.CLOSED;
        }
        rerender(true);
        
      }
    }
    rerender()
  };
}

function reconnect() {
  if(repl.server.state === ConnectionState.CONNECTED) {
    clearTimeout(repl.server.timer);
    repl.server.timer = undefined;
  } else {
    repl.server.timer = setTimeout(connectToServer, repl.server.timeout * 1000);
  }
  if (repl.server.timeout < 32) {
    repl.server.timeout += repl.server.timeout > 0 ? repl.server.timeout : 1;
  }
}

function sendMessage(message): boolean {
  if (repl.server.ws.readyState === repl.server.ws.OPEN) {
    repl.server.ws.send(JSON.stringify(message));
    return true;  
  } else {
    repl.server.queue.push(message);
    return false;
  }
}

// ------------------
// Card functions
// ------------------

function newReplCard(row?: number, col? :number): ReplCard {
  let replCard: ReplCard = {
    id: uuid(),
    row: row === undefined ? 0 : row,
    col: col === undefined ? 0 : col,
    state: CardState.NONE,
    focused: false,
    query: "",
    result: undefined,
    display: CardDisplay.BOTH,
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
  let query: QueryMessage = {
    id: replCard.id,
    type: "query",
    query: replCard.query.replace(/\s+/g,' '),
  }
  replCard.state = CardState.PENDING;    
  let sent = sendMessage(query);
  if (replCard.result === undefined) {
    if (sent) {
      replCard.result = "Waiting for response...";
    } else {
      replCard.result = "Message queued.";
    }
  }
  // Create a new card if we submitted the last one in replCards
  /*if (replCard.ix === repl.deck.cards.length - 1) {
    let nReplCard = newReplCard();
    repl.deck.cards.forEach((r) => r.focused = false);
    nReplCard.focused = true;
    repl.deck.cards.push(nReplCard);
  }*/
}

function addColumn() {
  let nCard = newReplCard(0,++repl.deck.columns);
  repl.deck.cards.push(nCard);
}
  
function addCardToColumn(col: number) {
  let row = repl.deck.cards.filter((r) => r.col === col).length;
  let nCard = newReplCard(row, col);
  repl.deck.cards.push(nCard);
}

function blurCard(replCard: ReplCard) {
  replCard.focused = false;
  let cm = getCodeMirrorInstance(replCard);
  if (cm !== undefined) {
    cm.getInputField().blur();
  }
}

function focusCard(replCard: ReplCard) {
  if (repl.deck.focused.id !== replCard.id) {
   blurCard(repl.deck.focused);    
  }
  
  if (replCard !== undefined) {
    repl.deck.cards.forEach((r) => r.focused = false);
    replCard.focused = true;
    repl.deck.focused = replCard;
    let cm = getCodeMirrorInstance(replCard);
    if (cm !== undefined) {
      cm.focus();
    }
  }
}
/*
function closeModals() {
  repl.blob = undefined;
  repl.delete = false;
  repl.load = false;
}*/

// ------------------
// Event handlers
// ------------------

// Register some global event handlers on the window
window.onkeydown = function(event) {
  let thisReplCard = repl.deck.focused;
  // Catch ctrl + arrow up or page up
  if (event.keyCode === 38 && event.ctrlKey === true || event.keyCode === 33) {
    // Set the focus to the previous repl card
    let previousReplCard = getReplCard(thisReplCard.row - 1, thisReplCard.col);
    focusCard(previousReplCard);
  // Catch ctrl + arrow down or page down
  } else if (event.keyCode === 40 && event.ctrlKey === true || event.keyCode === 34) {
    // Set the focus to the next repl card
    let nextReplCard = getReplCard(thisReplCard.row + 1, thisReplCard.col);
    focusCard(nextReplCard);
  // Catch ctrl + arrow left
  } else if (event.keyCode === 37 && event.ctrlKey === true) {
    let leftReplCard = getReplCard(thisReplCard.row, thisReplCard.col - 1);
    if (leftReplCard !== undefined) {
      focusCard(leftReplCard); 
    } else {
      let rowsInPrevCol = repl.deck.cards.filter((r) => r.col === thisReplCard.col - 1).length - 1;
      leftReplCard = getReplCard(rowsInPrevCol, thisReplCard.col - 1);
      focusCard(leftReplCard);
    }    
  // Catch ctrl + arrow right
  } else if (event.keyCode === 39 && event.ctrlKey === true) {
    let rightReplCard = getReplCard(thisReplCard.row, thisReplCard.col + 1);
    if (rightReplCard !== undefined) {
      focusCard(rightReplCard); 
    } else {
      let rowsInNextCol = repl.deck.cards.filter((r) => r.col === thisReplCard.col + 1).length - 1;
      rightReplCard = getReplCard(rowsInNextCol, thisReplCard.col + 1);
      focusCard(rightReplCard);
    }
  // Catch ctrl + r
  } else if (event.keyCode === 82 && event.ctrlKey === true) {
    addColumn();
  // Catch ctrl + e
  } else if (event.keyCode === 69 && event.ctrlKey === true) {
    addCardToColumn(repl.deck.focused.col);
  } else {
    return;
  }
  event.preventDefault();
  rerender();
}

function queryInputKeydown(event, elem) {
  let thisReplCard: ReplCard = elemToReplCard(elem);
  // Submit the query with ctrl + enter
  if ((event.keyCode === 13 || event.keyCode === 83) && event.ctrlKey === true) {
    submitReplCard(thisReplCard);
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

function queryInputBlur(event, elem) {
  //repl.deck.cards.map((r) => r.focused = false);
  //rerender();
}

function queryInputFocus(event, elem) {
  let focusedCard = elemToReplCard(elem);
  focusCard(focusedCard);
  rerender();
}

/*function queryInputBlur(event, elem) {
  let thisReplCard = replCards[elem.ix];
  thisReplCard.focused = false;
  rerender();
}*/

function replCardClick(event, elem) {
  let clickedCard = elemToReplCard(elem);
  if (clickedCard !== undefined) {
    focusCard(clickedCard);  
  }
  rerender();
}
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
  addColumn();
  rerender();
}

function addCardClick(event, elem) {
  addCardToColumn(repl.deck.focused.col);
  rerender();
}

function queryInputChange(event, elem) {
  let card = elemToReplCard(elem);
  let cm = getCodeMirrorInstance(card);
  card.query = cm.getValue();
  //submitReplCard(thisReplCard);
}

function queryResultDoubleClick(event, elem) {
  let card = elemToReplCard(elem);
  card.display = card.display === CardDisplay.BOTH ? CardDisplay.RESULT : CardDisplay.BOTH;
  event.preventDefault(); 
  rerender();
}

function queryInputDoubleClick(event, elem) {
  let card = elemToReplCard(elem);
  card.display = card.display === CardDisplay.BOTH ? CardDisplay.QUERY : CardDisplay.BOTH;
  event.preventDefault(); 
  rerender();
}

/*
function rootClick(event, elem) {
  closeModals();
  rerender();
}*/

// ------------------
// Element generation
// ------------------

function generateReplCardElement(replCard: ReplCard) { 
  let queryInput = {
    row: replCard.row,
    col: replCard.col, 
    key: `${replCard.id}${replCard.focused}`, 
    focused: replCard.focused,
    c: `query-input ${replCard.display === CardDisplay.RESULT ? "hidden" : ""} ${replCard.display === CardDisplay.QUERY ? "stretch" : ""}`,
    value: replCard.query,
    //contentEditable: true,
    //spellcheck: false,
    //text: replCard.query,
    keydown: queryInputKeydown, 
    blur: queryInputBlur, 
    focus: queryInputFocus,
    //postRender: focusQueryBox,
    change: queryInputChange,
    dblclick: queryInputDoubleClick,
    matchBrackets: true,
    lineNumbers: false,
  };
  
  // Set the css according to the card state
  let resultcss = `query-result ${replCard.display === CardDisplay.QUERY ? "hidden" : ""}`;
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
  
  let queryResult = {
    c: resultcss, 
    row: replCard.row,
    col: replCard.col,
    children: [result],
    dblclick: queryResultDoubleClick,
  };
  replClass += replCard.focused ? " focused" : "";
  
  let replCardElement = {
    id: replCard.id,
    row: replCard.row,
    col: replCard.col,
    c: replClass,
    click: replCardClick,
    mousedown: function(event) {event.preventDefault();},
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
  for (i = 0; i <= repl.deck.columns; i++) {
    let column = {
      id: `card-column-${i}`,
      c: "card-column",
      ix: i,
      children: repl.deck.cards.filter((r) => r.col === i).map(generateReplCardElement),
    };
    cardRoot.children.push(column);
  }
  return cardRoot;
}

function generateStatusBarElement() {
  let indicator = "connecting";
  if (repl.server.state === ConnectionState.CONNECTED) {
    indicator = "connected";
  } else if (repl.server.state === ConnectionState.DISCONNECTED) {
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

// -----------------
// Entry point
// -----------------

// Create an initial repl card
let defaultCard = newReplCard();
let replCards: Deck = {
  columns: 0,
  cards: [defaultCard],
  focused: defaultCard,
}  

// Instantiate a repl instance
let repl: Repl = {
  decks: [replCards],
  deck: replCards,
  server: {
    queue: [],
    state: ConnectionState.CONNECTING,
    ws: null,
    timer: undefined,
    timeout: 0,
  },
};
connectToServer();
app.renderRoots["repl"] = root;

function root() {
  let root = {
    id: "repl",
    c: "repl",
    children: [generateStatusBarElement(), generateCardRootElements()],
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

function getCodeMirrorInstance(replCard: ReplCard): CodeMirror.Editor {
  let targets = document.querySelectorAll(".query-input");
  for (let i = 0; i < targets.length; i++) {
    let target = targets[i];
    if (target.parentElement["_id"] === replCard.id) {
      return target["cm"];     
    }
  }  
  return undefined;
}

function elemToReplCard(elem): ReplCard {
  if (elem.col !== undefined && elem.row !== undefined) {
    return repl.deck.cards.filter((r) => r.col === elem.col && r.row === elem.row).pop();  
  }
  return undefined;
} 

function getReplCard(row: number, col: number): ReplCard {
  return repl.deck.cards.filter((r) => r.row === row && r.col === col).pop();
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
