import app = require("./app");
import {autoFocus} from "./utils";
import * as CodeMirror from "codemirror";
import {Element, Handler, RenderHandler, Renderer} from "./microReact";

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

enum ResultsDisplay {
  TABLE,
  GRAPH,
  INFO,
  MESSAGE,
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

interface Query {
  id: string,
  query: string,
  result: {
    fields: Array<string>,
    values: Array<Array<any>>,
  }
  info: QueryInfo,
  message: string,
}

interface QueryInfo {
  id: string,
  raw: string,
  smil: string,
  weasl: string,
}

interface ReplCard {
  id: string,
  row: number,
  col: number,
  state: CardState,
  focused: boolean,
  query: Query,
  display: CardDisplay,
  resultDisplay: ResultsDisplay,
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
  init: boolean,
  system: {
    entities: Query,  
    tags: Query,
    queries: Query,
  },
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
    // Initialize the repl state
    if (repl.init === false) {
      objectToArray(repl.system).map(sendQuery);
      repl.init = true;
    }
    // In the case of a reconnect, reset the timeout
    // and send queued messages
    repl.server.timeout = 0;    
    while(repl.server.queue.length > 0) {
      let message = repl.server.queue.shift();
      sendMessage(message);
    }
    rerender();
  }

  ws.onerror = function(error) {
    repl.server.state = ConnectionState.DISCONNECTED;
    rerender();
  }

  ws.onclose = function(error) {  
    repl.server.state = ConnectionState.DISCONNECTED;
    reconnect();
    rerender();
  }

  ws.onmessage = function(message) {
    //console.log("message")
    //console.log(message.data);    
    let parsed = JSON.parse(message.data.replace(/\n/g,'\\\\n').replace(/\r/g,'\\\\r').replace(/\t/g,'\\\\t'));
    //console.log(parsed);
    // Update the result of the correct repl card
    let targetCard = repl.deck.cards.filter((r) => r.id === parsed.id).shift();
    if (targetCard !== undefined) {
      if (parsed.type === "result") {
        if (parsed.fields.length > 0) {         
          let values: Array<Array<any>>;
          // If the card is pending, it was submitted manually, 
          // so we replace the values with the inserts
          if (targetCard.state === CardState.PENDING) {
            values = parsed.insert;
            targetCard.display = CardDisplay.BOTH;
            targetCard.resultDisplay = ResultsDisplay.TABLE;
          // If the card is Good, that means it already has results
          // and the current message is updating them
          } else if (targetCard.state === CardState.GOOD) {
            // Apply inserts
            values = targetCard.query.result.values.concat(parsed.insert);
            // Apply removes
            //@ TODO
          }
          targetCard.query.result = {
            fields: parsed.fields,
            values: values,
          };
        }
        targetCard.state = CardState.GOOD;
        //saveReplCard(targetCard);
      } else if (parsed.type === "error") {
        targetCard.state = CardState.ERROR;
        targetCard.query.message = parsed.cause;
        targetCard.display = CardDisplay.BOTH;
        targetCard.query.result = undefined;
        //saveReplCard(targetCard);
      } else if (parsed.type === "close") {
        let removeIx = repl.deck.cards.map((r) => r.id).indexOf(parsed.id);
        if (removeIx >= 0) {
          replCards[removeIx].state = CardState.CLOSED;
        }
        rerender(true);
      } else if (parsed.type === "query-info") {
        let info: QueryInfo = {
          id: parsed.id,
          raw: parsed.raw,
          smil: parsed.smil,
          weasl: parsed.weasl,
        };
        targetCard.query.info = info;
      } else {
        return;
      }
    // If the query ID was not matched to a repl card, then it should 
    // matche a system query
    } else {
      let targetSystemQuery: Query = objectToArray(repl.system).filter((q) => q.id === parsed.id).shift();
      if (targetSystemQuery !== undefined) {
        if (parsed.type === "result") {
          if (targetSystemQuery.result === undefined) {
            targetSystemQuery.result = {
              fields: parsed.fields,
              values: parsed.insert,
            };
          } else {
            // Apply inserts
            targetSystemQuery.result.values = targetSystemQuery.result.values.concat(parsed.insert);
            // Apply removes
            // @TODO
          }
          // Update the repl based on these new system queries
          // @TODO This will one day soon be replaced by a storing repl state in the DB
          if (parsed.id === repl.system.queries.id && parsed.insert !== undefined) {
            parsed.insert.forEach((n) => {
              /*let replCard = getCard(n[1], n[2]);
              if (replCard === undefined) {
                replCard = newReplCard(n[1], n[2]);
                repl.deck.cards.push(replCard);
              }
              replCard.query.query = n[4];
              submitReplCard(replCard);*/
            });
          }  
        } else {
          return;
        }
      }
    }
    rerender();
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
// Query functions
// ------------------

function newQuery(queryString: string): Query {
  let query: Query = {
    id: uuid(),
    query: queryString,
    result: undefined,
    message: "",
    info: undefined,
  };
  return query;
}

function sendQuery(query: Query): boolean {
  let queryMessage: QueryMessage = {
    type: "query",
    id: query.id,
    query: query.query,
  };
  return sendMessage(queryMessage);
}

function sendAnonymousQuery(query: string, foo): boolean {
  let queryMessage: QueryMessage = {
    type: "query",
    id: `query-${foo.row}-${foo.col}`,
    query: query,
  };
  return sendMessage(queryMessage);  
}

// ------------------
// Card functions
// ------------------

function newReplCard(row?: number, col? :number): ReplCard {
  let id = uuid();
  let replCard: ReplCard = {
    id: id,
    row: row === undefined ? 0 : row,
    col: col === undefined ? 0 : col,
    state: CardState.NONE,
    focused: false,
    query: {
      id: id,
      query: "",
      result: undefined,
      message: "",
      info: undefined,
    },
    display: CardDisplay.QUERY,
    resultDisplay: ResultsDisplay.MESSAGE,
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

function getCard(row: number, col: number): ReplCard {
  return repl.deck.cards.filter((r) => r.row === row && r.col === col).shift();
}

function submitReplCard(card: ReplCard) {
  let query = card.query;
  card.state = CardState.PENDING;
  card.query.result = undefined;
  card.query.message = ""; 
  let sent = sendQuery(card.query);
  let rcQuery = `(query []
                   (insert-fact! "${card.id}" :tag "repl-card"
                                              :row ${card.row} 
                                              :col ${card.col} 
                                              :query "${card.query.query.replace(/\"/g,'\\"')}"
                                              :display ${card.display}))`;
  //console.log(rcQuery);
  //sendAnonymousQuery(rcQuery, card);
  if (card.query.result === undefined) {
    if (sent) {
      card.query.message = "Waiting for response...";
    } else {
      card.query.message = "Message queued.";
    }
  }
  // Create a new card if we submitted the last one in the col
  let emptyCardsInCol = repl.deck.cards.filter((r) => r.col === card.col && r.state === CardState.NONE);
  if (emptyCardsInCol.length === 0) {
    addCardToColumn(repl.deck.focused.col);
    rerender();
  }
}

function addColumn() {
  let nCard = newReplCard(0,++repl.deck.columns);
  repl.deck.cards.push(nCard);
}
  
function addCardToColumn(col: number): ReplCard {
  let row = repl.deck.cards.filter((r) => r.col === col).length;
  let nCard = newReplCard(row, col);
  repl.deck.cards.push(nCard);
  focusCard(nCard);
  return nCard;
}

function blurCard(replCard: ReplCard) {
  replCard.focused = false;
  let cm = getCodeMirrorInstance(replCard);
  if (cm !== undefined) {
    cm.getInputField().blur();
  }
}

function focusCard(replCard: ReplCard) {
  if (replCard !== undefined) {
    if (repl.deck.focused.id !== replCard.id) {
      blurCard(repl.deck.focused);    
    }
    repl.deck.cards.forEach((r) => r.focused = false);
    replCard.focused = true;
    repl.deck.focused = replCard;
    // @HACK The timeout allows the CM instance time to render
    // otherwise, I couldn't focus it, because it didn't exist
    // when the call was made
    let cm = getCodeMirrorInstance(replCard);
    if (cm !== undefined) {
      cm.focus()
    } else {
      setTimeout(function() {
        cm = getCodeMirrorInstance(replCard);
        cm.focus();
      }, 50);  
    }
  }
}

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
  // Submit the query with ctrl + enter or ctrl + s
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
  // Catch ctrl + q
  } else if (event.keyCode === 81 && event.ctrlKey === true) {
    thisReplCard.query.query = "(query [] \n\t\n)";
    let cm = getCodeMirrorInstance(thisReplCard);
    // @HACK Wait for CM to render
    setTimeout(function () {cm.getDoc().setCursor({line: 1, ch: 1});},10);
  } else {
    return;
  }
  event.preventDefault();
  rerender();
}

function queryInputBlur(event, elem) {
  let cm = getCodeMirrorInstance(elemToReplCard(elem));
  cm.getDoc().setCursor({line: 0, ch: 0});
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
  card.query.query = cm.getValue();
  //submitReplCard(thisReplCard);
}

function queryResultClick(event, elem) {
  if (event.button === 1) {
    let card = elemToReplCard(elem);
    card.display = card.display === CardDisplay.BOTH ? CardDisplay.RESULT : CardDisplay.BOTH;
    event.preventDefault(); 
    rerender();
  }
}

function queryInputClick(event, elem) {
  if (event.button === 1) {
    let card = elemToReplCard(elem);
    card.display = card.display === CardDisplay.BOTH ? CardDisplay.QUERY : CardDisplay.BOTH;
    event.preventDefault(); 
    rerender();  
  }
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
    value: replCard.query.query,
    //contentEditable: true,
    //spellcheck: false,
    //text: replCard.query,
    keydown: queryInputKeydown, 
    blur: queryInputBlur, 
    focus: queryInputFocus,
    change: queryInputChange,
    mouseup: queryInputClick,
    matchBrackets: true,
    lineNumbers: false,
  };
  
  let replCardElement = {
    id: replCard.id,
    row: replCard.row,
    col: replCard.col,
    c: `repl-card ${replCard.focused ? " focused" : ""}`,
    click: replCardClick,
    mousedown: function(event) {event.preventDefault();},
    children: [codeMirrorElement(queryInput), generateResultElement(replCard)],
  };   
  return replCardElement;
}

function generateResultElement(card: ReplCard) {
// Set the css according to the card state
  let resultcss = `query-result ${card.display === CardDisplay.QUERY ? "hidden" : ""}`;
  let result = undefined;
  let replClass = "repl-card";
  
  // Build the results switches
  let tableSwitch   = {c: `button ${card.resultDisplay === ResultsDisplay.TABLE   ? "" : "disabled "}ion-grid`, text: " Table"};
  let graphSwitch   = {c: `button ${card.resultDisplay === ResultsDisplay.GRAPH   ? "" : "disabled "}ion-stats-bars`, text: " Graph"};
  let messageSwitch = {c: `button ${card.resultDisplay === ResultsDisplay.MESSAGE ? "" : "disabled "}ion-quote`, text: " Message"};
  let infoSwitch    = {c: `button ${card.resultDisplay === ResultsDisplay.INFO    ? "" : "disabled "}ion-help`, text: " Info"};
  let switches = [];
  
  // Format card based on state
  if (card.state === CardState.GOOD) {
    resultcss += " good";      
    if (card.query.result !== undefined) {
      switches.push(tableSwitch);
    }
  } else if (card.state === CardState.ERROR) {
    resultcss += " error";
    switches.push(messageSwitch);
  } else if (card.state === CardState.PENDING) {
    resultcss += " pending";
    switches.push(messageSwitch);
  } else if (card.state === CardState.CLOSED) {
    resultcss += " closed";    
    switches.push(messageSwitch);
  }
  // Pick the results to display
  if (card.resultDisplay === ResultsDisplay.GRAPH) {
    // @TODO
    result = {};
  } else if (card.resultDisplay === ResultsDisplay.INFO) {
    result = {text: card.query.info.smil};    
  } else if (card.resultDisplay === ResultsDisplay.MESSAGE) {
    result = {text: card.query.message};  
  } else if (card.resultDisplay === ResultsDisplay.TABLE) {
    result = generateResultsTable(card.query);  
  }

  // Add the info switch if there is info to be had
  if (card.query.info !== undefined) {
    switches.push(infoSwitch); 
  }
  // Build the results switch container
  let resultViewSwitch = {
    c: "results-switch",
    children: switches,
  };
  
  let queryResult = {
    c: resultcss, 
    row: card.row,
    col: card.col,
    children: [resultViewSwitch, result],
    mouseup: queryResultClick,
  };  
  
  return queryResult;
}

function generateResultsTable(query: Query) {
  if (query.result.fields.length > 0) {
    let tableHeader = {c: "header", children: query.result.fields.map((f: string) => {
      return {c: "cell", text: f};
    })};
    let tableBody = query.result.values.map((r: Array<any>) => {
      return {c: "row", children: r.map((c: any) => {
        return {c: "cell", text: `${c}`};
      })};
    });
    let tableRows = [tableHeader].concat(tableBody);
    return {c: "table", children: tableRows};
  }  
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
      children: repl.deck.cards.filter((r) => r.col === i).sort((a,b) => a.row - b.row).map(generateReplCardElement),
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
  let entities: Array<any> = repl.system.entities.result !== undefined ? repl.system.entities.result.values.map((e) => { return {text: e[0] }; }) : []; 
  let entitiesList = {c: "entities", children: [formListElement(entities)]};
  // Build the status bar    
  let statusBar = {
    id: "status-bar",
    c: "status-bar",
    children: [eveLogo, buttonList, statusIndicator, entitiesList],
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
  init: false,
  system: {
    entities: newQuery(`(query [entities] (fact-btu entities))`), // get all entities in the database
    tags: newQuery(`(query [tags], (fact-btu e "tag" tags))`),    // get all tags in the database
    queries: newQuery(`(query [id row col display query]
                         (fact id :tag "repl-card" :row row :col col :display display :query query))` // Get all the open queries
    ),
  },
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

function resultToObject(result): Object {
  // @TODO
  return {};
}

function objectToArray(obj: Object): Array<any> {
  return Object.keys(obj).map(key => obj[key]);
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
  //console.log(repl);
  app.dispatch("rerender", {}).commit();
}

// Codemirror!

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

interface CMNode extends HTMLElement { cm: any }

interface CMEvent extends Event {
  editor: CodeMirror.Editor
  value: string
}

export function codeMirrorElement(elem: CMElement): CMElement {
  elem.postRender = codeMirrorPostRender(elem.postRender);
  elem["cmChange"] = elem.change;
  elem["cmBlur"] = elem.blur;
  elem["cmFocus"] = elem.focus;
  elem.change = undefined;
  elem.blur = undefined;
  elem.focus = undefined;
  return elem;
}

interface CMElement extends Element {
  autoFocus?: boolean
  lineNumbers?: boolean,
  lineWrapping?: boolean,
  mode?: string,
  shortcuts?: {[shortcut:string]: Handler<any>}
};

let _codeMirrorPostRenderMemo = {};

function handleCMEvent(handler:Handler<Event>, elem:CMElement):(cm:CodeMirror.Editor) => void {
  return (cm:CodeMirror.Editor) => {
    let evt = <CMEvent><any>(new CustomEvent("CMEvent"));
    evt.editor = cm;
    evt.value = cm.getDoc().getValue();
    handler(evt, elem);
  }
}

function codeMirrorPostRender(postRender?: RenderHandler): RenderHandler {
  let key = postRender ? postRender.toString() : "";
  if(_codeMirrorPostRenderMemo[key]) return _codeMirrorPostRenderMemo[key];
  return _codeMirrorPostRenderMemo[key] = (node:CMNode, elem:CMElement) => {
    let cm = node.cm;
    if(!cm) {
      let extraKeys = {};
      if(elem.shortcuts) {
        for(let shortcut in elem.shortcuts)
          extraKeys[shortcut] = handleCMEvent(elem.shortcuts[shortcut], elem);
      }
      cm = node.cm = CodeMirror(node, {
        lineWrapping: elem.lineWrapping !== false ? true : false,
        lineNumbers: elem.lineNumbers,
        mode: elem.mode || "text",
        extraKeys
      });
      if(elem["cmChange"]) cm.on("change", handleCMEvent(elem["cmChange"], elem));
      if(elem["cmBlur"]) cm.on("blur", handleCMEvent(elem["cmBlur"], elem));
      if(elem["cmFocus"]) cm.on("focus", handleCMEvent(elem["cmFocus"], elem));
      if(elem.autoFocus) cm.focus();
    }

    if(cm.getDoc().getValue() !== elem.value) {
      cm.setValue(elem.value || "");
      if(elem["cursorPosition"] === "end") {
        cm.setCursor(100000);
      }
    }
    if(postRender) postRender(node, elem);
  }
}
