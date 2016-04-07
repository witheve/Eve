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
  } | string;
}

function rerender(removeCards?: boolean) {
  if (removeCards === undefined) {
    removeCards = false;
  }
  // Batch delete closed cards on rerender
  if (removeCards === true) {
    let closedCards = editorCards.filter((r) => r.state === CardState.CLOSED);
    if (editor.timer !== undefined) {
      clearTimeout(editor.timer);
    }
    let focusedCard = editorCards.filter((r) => r.focused).shift();
    let focusIx = 0;
    if (focusedCard !== undefined) {
      focusIx = focusedCard.ix;
    }
    focusedCard = editorCards[focusIx + 1 > editorCards.length - 1 ? editorCards.length - 1 : focusIx + 1];
    focusCard(focusedCard);
    editor.timer = setTimeout(() => {
      for (let card of closedCards) {
        deleteStoredReplCard(card);
        editorCards.splice(editorCards.map((r) => r.id).indexOf(card.id),1);
      }
      if (closedCards !== undefined) {
        editorCards.forEach((r,i) => r.ix = i);    
      }
      rerender(false);
    }, 250);
  }
  app.dispatch("rerender", {}).commit();
}

// ------------------
// Storage functions
// ------------------

function saveReplCard(editorCard: ReplCard) {
  localStorage.setItem("eveeditor-" + editorCard.id, JSON.stringify(editorCard));  
}

function loadReplCards(): Array<ReplCard> {
  let storedReplCards: Array<ReplCard> = [];
  for (let item in localStorage) {
    if (item.substr(0,7) === "eveeditor") {
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

function deleteStoredReplCard(editorCard: ReplCard) {
  localStorage.removeItem("eveeditor-" + editorCard.id);
}

function saveCards() {
  let serialized = JSON.stringify(editorCards.filter((r) => r.state !== CardState.NONE).map((r) => r.query));
  let blob = new Blob([serialized], {type: "application/json"});
  let url = URL.createObjectURL(blob);
  editor.blob = url;
}

function saveTable() {
  let editorCard = editorCards.filter((r) => r.focused).pop();
  if (editorCard !== undefined) {
    // If the card has results, form the csv  
    if (typeof editorCard.result === 'object') {
      let result: any = editorCard.result;
      let fields:string = result.fields.join(",");
      let rows: Array<string> = result.values.map((row) => {
        return row.join(",");
      });
      let csv: string = fields + "\r\n" + rows.join("\r\n");
      let blob = new Blob([csv], {type: "text/csv"});
      let url = URL.createObjectURL(blob);
      editor.csv = url;
    } else {
      editor.csv = undefined;
    }
  }
}

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
    editorCards = cards;
    editorCards.forEach((r,i) => r.ix = i);
    editorCards.forEach((r) => submitReplCard(r));
    rerender();
  };
  reader.readAsText(file);
  event.stopPropagation();
  closeModals();
  rerender();
}

// ------------------
// Repl functions
// ------------------

let editor = { 
  state: ReplState.CONNECTING, 
  blob: undefined, 
  csv: undefined, 
  load: false, 
  delete: false, 
  queue: [], 
  ws: null, 
  timer: undefined, 
  timeout: 0 
};

app.renderRoots["eveeditor"] = root;
connectToServer();

function connectToServer() {
  let wsAddress = "ws://localhost:8081";
  let ws: WebSocket = new WebSocket(wsAddress, []);
  editor.ws = ws;

  ws.onopen = function(e: Event) {    
    editor.state = ReplState.CONNECTED;
    editor.timeout = 0;
    while(editor.queue.length > 0) {
      let message = editor.queue.shift();
      sendMessage(message);
    }
    rerender()
  }

  ws.onerror = function(error) {
    editor.state = ReplState.DISCONNECTED;
    rerender()
  }

  ws.onclose = function(error) {  
    editor.state = ReplState.DISCONNECTED;
    reconnect();
    rerender()
  }

  ws.onmessage = function(message) {
    let parsed = JSON.parse(message.data);
    // Update the result of the correct editor card
    let targetCard = editorCards.filter((r) => r.id === parsed.id).shift();
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
        let removeIx = editorCards.map((r) => r.id).indexOf(parsed.id);
        if (removeIx >= 0) {
          editorCards[removeIx].state = CardState.CLOSED;
        }
        rerender(true);
      }
    }
    rerender()
  };
}

let checkReconnectInterval = undefined;
function reconnect() {
  if(editor.state === ReplState.CONNECTED) {
    clearTimeout(checkReconnectInterval);
    checkReconnectInterval = undefined;
  } else {
    checkReconnectInterval = setTimeout(connectToServer, editor.timeout * 1000);
  }
  if (editor.timeout < 32) {
    editor.timeout += editor.timeout > 0 ? editor.timeout : 1;
  }
}

function sendMessage(message): boolean {
  if (editor.ws.readyState === editor.ws.OPEN) {
    editor.ws.send(JSON.stringify(message));
    return true;  
  } else {
    editor.queue.push(message);
    return false;
  }
}

// ------------------
// Card functions
// ------------------

function newReplCard(): ReplCard {
  let editorCard: ReplCard = {
    id: uuid(),
    ix: editorCards.length > 0 ? editorCards.map((r) => r.ix).pop() + 1 : 0,
    state: CardState.NONE,
    focused: false,
    query: "",
    result: undefined,
  }
  return editorCard;
}

function deleteReplCard(editorCard: ReplCard) {
  if (editorCard.state !== CardState.NONE) {
    let closemessage = {
      type: "close",
      id: editorCard.id,
    };
    sendMessage(closemessage);
    editorCard.state = CardState.PENDING;
    editorCard.result = "Deleting card...";
  } 
}

function submitReplCard(editorCard: ReplCard) {
  let query: Query = {
    id: editorCard.id,
    type: "query",
    query: editorCard.query.replace(/\s+/g,' '),
  }
  editorCard.state = CardState.PENDING;    
  let sent = sendMessage(query);
  if (editorCard.result === undefined) {
    if (sent) {
      editorCard.result = "Waiting on response from server...";
    } else {
      editorCard.result = "Message queued.";
    }
  }
  // Create a new card if we submitted the last one in editorCards
  if (editorCard.ix === editorCards.length - 1) {
    let nReplCard = newReplCard();
    editorCards.forEach((r) => r.focused = false);
    nReplCard.focused = true;
    editorCards.push(nReplCard);
  }
}

function focusCard(editorCard: ReplCard) {
  editorCards.forEach((r) => r.focused = false);
  editorCard.focused = true;
}

function closeModals() {
  editor.blob = undefined;
  editor.delete = false;
  editor.load = false;
}

// ------------------
// Event handlers
// ------------------

function queryInputKeydown(event, elem) {
  let thisReplCard = editorCards[elem.ix];
  // Submit the query with ctrl + enter
  if ((event.keyCode === 13 || event.keyCode === 83) && event.ctrlKey === true) {
    submitReplCard(thisReplCard);
  // Catch tab
  } else if (event.keyCode === 9) {
    let range = getSelection(event.target);
    //let value = event.target.innerText;
    //value = value.substring(0, range[0]) + "  " + value.substring(range[1]);
    //event.target.innerHTML = value;
    //setSelection(range[0] + 2,range[0] + 2);
  // Catch ctrl + arrow up or page up
  } else if (event.keyCode === 38 && event.ctrlKey === true || event.keyCode === 33) {
    // Set the focus to the previous editor card
    let previousIx = editorCards.filter((r) => r.ix < thisReplCard.ix && r.state !== CardState.CLOSED).map((r) => r.ix).pop();
    previousIx = previousIx === undefined ? 0 : previousIx;
    focusCard(editorCards[previousIx]);
  // Catch ctrl + arrow down or page down
  } else if (event.keyCode === 40 && event.ctrlKey === true || event.keyCode === 34) {
    // Set the focus to the next editor card
    let nextIx = thisReplCard.ix + 1 <= editorCards.length - 1 ? thisReplCard.ix + 1 : editorCards.length - 1;
    focusCard(editorCards[nextIx]);
  // Catch ctrl + delete to remove a card
  } else if (event.keyCode === 46 && event.ctrlKey === true) {
    deleteReplCard(thisReplCard);
  // Catch ctrl + home  
  } else if (event.keyCode === 36 && event.ctrlKey === true) {
    focusCard(editorCards[0]);
  // Catch ctrl + end
  } else if (event.keyCode === 35 && event.ctrlKey === true) {
    focusCard(editorCards[editorCards.length - 1]);
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
  let thisReplCard = editorCards[elem.ix];
  thisReplCard.query = event.target.innerText;
}

/*function queryInputBlur(event, elem) {
  let thisReplCard = editorCards[elem.ix];
  thisReplCard.focused = false;
  rerender();
}*/

function editorCardClick(event, elem) {
  focusCard(editorCards[elem.ix]);
  rerender();
}

function deleteAllCards(event, elem) {
  editorCards.forEach(deleteReplCard);
  closeModals();
  event.stopPropagation();
  rerender();
}

function focusQueryBox(node, element) {
  if (element.focused) {
    node.focus();
  }
}

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

function saveCardsClick(event, elem) {
  closeModals();
  saveCards();
  saveTable();
  event.stopPropagation();
  rerender();
}

function trashCardsClick(event, elem) {
  closeModals();
  editor.delete = true;
  event.stopPropagation();
  rerender();
}

function loadCardsClick(event, elem) {
  closeModals();
  editor.load = true;
  event.stopPropagation();
  rerender();
}

function rootClick(event, elem) {
  closeModals();
  rerender();
}

// ------------------
// Element generation
// ------------------

function generateReplCardElement(editorCard: ReplCard) { 
  let queryInput = {
    ix: editorCard.ix, 
    key: `${editorCard.id}${editorCard.focused}`, 
    focused: editorCard.focused,
    c: "query-input",
    contentEditable: true,
    spellcheck: false,
    text: editorCard.query,
    keydown: queryInputKeydown, 
    //blur: queryInputBlur, 
    keyup: queryInputKeyup,    
    postRender: focusQueryBox, 
  };
  // Set the css according to the card state
  let resultcss = "query-result"; 
  let result = undefined;
  let editorClass = "repl-card";
  // Format card based on state
  if (editorCard.state === CardState.GOOD || (editorCard.state === CardState.PENDING && typeof editorCard.result === 'object')) {
    if (editorCard.state === CardState.GOOD) {
      resultcss += " good";      
    } else if (editorCard.state === CardState.PENDING) {
      resultcss += " pending";
    }
    let cardresult: any = editorCard.result;
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
  } else if (editorCard.state === CardState.ERROR) {
    resultcss += " bad";
    result = {text: editorCard.result};
  } else if (editorCard.state === CardState.PENDING) {
    resultcss += " pending";
    result = {text: editorCard.result};
  } else if (editorCard.state === CardState.CLOSED) {
    resultcss += " closed";
    editorClass += " no-height";
    result = {text: `Query closed.`};
  }
  
  let queryResult = result === undefined ? {} : {c: resultcss, children: [result]};
  editorClass += editorCard.focused ? " selected" : "";
  
  let editorCardElement = {
    id: editorCard.id,
    c: editorClass,
    click: editorCardClick,
    children: [queryInput, queryResult],
  };   
  return editorCardElement;
}

function generateStatusBarElement() {
  let indicator = "connecting";
  if (editor.state === ReplState.CONNECTED) {
    indicator = "connected";
  } else if (editor.state === ReplState.DISCONNECTED) {
    indicator = "disconnected";
  }
  
  // Build the various callouts
  let saveAllLink = {t: "a", href: editor.blob, download: "save.evedb", text: "Save Cards", click: function(event) {closeModals(); event.stopPropagation(); rerender();}};
  let saveTableLink = {t: "a", href: editor.csv, download: "table.csv", text: "Export CSV", click: function(event) {closeModals(); event.stopPropagation(); rerender();}};
  let downloadLink = editor.blob === undefined ? {} : {
    c: "callout", children: [
      {c: "button no-width", children: [saveAllLink]},
      {c: `button ${editor.csv ? "" : "disabled"} no-width`, children: [saveTableLink]},
    ], 
  };
  let deleteConfirm = editor.delete === false ? {} : {
    c: "callout",
    children: [{c: "button no-width", text: "Delete All Cards", click: deleteAllCards}],
  };
  let fileSelector = editor.load === false ? {} : {
    c: "callout",
    children: [{
      c: "fileUpload",
      children: [
        {c: "button no-width", text: "Load Cards"},
        {t: "input", type: "file", c: "upload", change: loadCards},      
      ]
    }],
  }; 
  
  // Build the proper elements of the status bar
  let statusIndicator = {c: `indicator ${indicator} left`};
  let trash = {c: "ion-trash-a button right", click: trashCardsClick, children: [deleteConfirm]};
  let save = {c: "ion-ios-download-outline button right", click: saveCardsClick, children: [downloadLink]};
  let load = {c: "ion-ios-upload-outline button right", click: loadCardsClick, children: [fileSelector]};
  let dimmer = {c: `${localStorage["eveReplTheme"] === "light" ? "ion-ios-lightbulb" : "ion-ios-lightbulb-outline"} button right`, click: toggleTheme};
  let refresh = {c: `ion-refresh button ${editor.state !== ReplState.DISCONNECTED ? "no-opacity" : ""} left no-width`, text: " Reconnect", click: function () { editor.timeout = 0; reconnect(); } };
  // Build the status bar    
  let statusBar = {
    id: "status-bar",
    c: "status-bar",
    children: [statusIndicator, refresh, trash, save, load, dimmer],
  }
  return statusBar;
}

// Create an initial editor card
let editorCards: Array<ReplCard> = loadReplCards();
editorCards.push(newReplCard());
editorCards[0].focused = true;

function root() {
  let cardRoot = {
    id: "card-root",
    c: "card-root",
    children: editorCards.map(generateReplCardElement),
  }
  let editorRoot = {
    id: "editor_root",
    c: "editor-root",
    children: [generateStatusBarElement(), cardRoot],
  };
  let root = {
    id: "root",
    c: `root ${localStorage["eveReplTheme"] === undefined ? "light" : localStorage["eveReplTheme"]}`,
    children: [editorRoot],
    click: rootClick,
  };  
  return root;
}