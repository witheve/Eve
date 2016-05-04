import app = require("./app");
import {autoFocus} from "./utils";
// import * as CodeMirror from "codemirror";
import {Element, Handler, RenderHandler, Renderer} from "./microReact";

declare var CodeMirror;

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
  HISTORY,
  NONE,
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

export interface ResultMessage {
  type: string,
  id: string,
  timestamp?: number,
  fields: Array<string>,
  insert: Array<Array<any>>,
  remove: Array<Array<any>>,
}

interface Query {
  id: string,
  query: string,
  result: QueryResult,
  info: QueryInfo,
  message: string,
}

interface QueryResult {
  fields: Array<string>,
  values: Array<Array<any>>,
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
  history: Array<ResultMessage>,
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

interface Chat {
  visible: boolean,
  unread: number,
  messages: Array<{
    id: string,
    user: string,
    message: string,
    time: number,
  }>,
}

interface Repl {
  init: boolean,
  user: {
    id: string,
    name?: string,
    username?: string,
  },
  chat: Chat,
  system: {
    entities: Query,  
    tags: Query,
    //queries?: Query,
    users: Query,
    messages: Query,
  },
  decks: Array<Deck>,
  deck: Deck,
  promisedQueries: Array<Query>,
  modal: any,
  server: ServerConnection,
}

// ------------------
// Storage functions
// ------------------

function saveReplCard(card: ReplCard) {
  localStorage.setItem("everepl-" + card.id, JSON.stringify(card));  
}

function loadReplCards(): Array<ReplCard> {
  let storedCards: Array<ReplCard> = [];
  for (let item in localStorage) {
    if (item.substr(0,7) === "everepl") {
      let storedReplCard = JSON.parse(localStorage[item]);
      storedCards.push(storedReplCard);
    }
  }
  // Reset card properties
  if (storedCards.length > 0) {
    storedCards.map((r) => r.focused = false);
  }
  return storedCards;
}

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
  let host = location.host || "localhost:8081";
  let wsAddress = `ws://${host}`;
  let ws: WebSocket = new WebSocket(wsAddress, []);
  repl.server.ws = ws;
    
  ws.onopen = function(e: Event) {    
    repl.server.state = ConnectionState.CONNECTED;
    // Initialize the repl state
    if (repl.init === false) {
      objectToArray(repl.system).map(sendQuery);
      // Retrieve the object from storage
      let userID = localStorage.getItem('repl-user');
      if (userID !== null) {
        repl.user = {id: userID};  
      }    
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
    repl.init = false;
    objectToArray(repl.system).map((q: Query) => q.result = undefined);
    rerender();
  }

  ws.onclose = function(error) {  
    repl.server.state = ConnectionState.DISCONNECTED;
    repl.init = false;
    objectToArray(repl.system).map((q: Query) => q.result = undefined);
    /*repl.deck.cards.map((c) => {
      c.state = CardState.PENDING
      c.query.result = undefined;
      c.display = CardDisplay.QUERY;
    });*/
    reconnect();
    rerender();
  }

  ws.onmessage = function(message) {
    //console.log("message")
    //console.log(message.data);    
    let parsed = JSON.parse(message.data.replace(/\n/g,'\\\\n').replace(/\r/g,'\\\\r').replace(/\t/g,'  ').replace(/\\\\"/g,'\\"'));
    // Update the result of the correct repl card
    let targetCard = repl.deck.cards.filter((r) => r.id === parsed.id).shift();
    if (targetCard !== undefined) {
      if (parsed.type === "result") {
        let resultMsg: ResultMessage = parsed;
        resultMsg.timestamp = new Date().getTime();
        if (resultMsg.fields.length > 0) {         
          // If the card is pending, it was submitted manually, 
          // so we replace the values with the inserts          
          if (targetCard.state === CardState.PENDING) {
            targetCard.display = CardDisplay.BOTH;
            targetCard.resultDisplay = ResultsDisplay.TABLE;
            targetCard.query.result = undefined;
          }
          if (resultMsg.insert.length > 0 || resultMsg.remove.length > 0) {
            targetCard.history.push(resultMsg);
          }
          updateQueryResult(targetCard.query, resultMsg);
        } else {
          targetCard.resultDisplay = ResultsDisplay.NONE;
        }
        targetCard.state = CardState.GOOD;
        //saveReplCard(targetCard);
      } else if (parsed.type === "error") {
        targetCard.state = CardState.ERROR;
        targetCard.query.message = parsed.cause;
        targetCard.display = CardDisplay.BOTH;
        targetCard.resultDisplay = ResultsDisplay.MESSAGE;
        targetCard.query.info = undefined;
        targetCard.query.result = undefined;
        //saveReplCard(targetCard);
      } else if (parsed.type === "close") {
        /*let removeIx = repl.deck.cards.map((r) => r.id).indexOf(parsed.id);
        if (removeIx >= 0) {
          replCards[removeIx].state = CardState.CLOSED;
        }*/
        rerender();
      } else if (parsed.type === "query-info") {
        let info: QueryInfo = {
          id: parsed.id,
          raw: parsed.raw,
          smil: parsed.smil,
          weasl: parsed.weasl,
        };
        targetCard.query.info = info;
        if (targetCard.resultDisplay === ResultsDisplay.NONE) {
          targetCard.resultDisplay = ResultsDisplay.INFO;
        }
      } else {
        return;
      }
    // If the query ID was not matched to a repl card, then it should 
    // match a system query
    } else {
      let targetSystemQuery: Query = objectToArray(repl.system).filter((q) => q.id === parsed.id).shift();
      if (targetSystemQuery !== undefined) {
        if (parsed.type === "result") {
          let resultMsg: ResultMessage = parsed;
          updateQueryResult(targetSystemQuery, resultMsg);
          // Update the repl based on these new system queries
          /* @NOTE Disabled for now
          if (repl.system.queries !== undefined && parsed.id === repl.system.queries.id && parsed.insert !== undefined) {
            parsed.insert.forEach((n) => {
              let replCard = getCard(n[1], n[2]);
              if (replCard === undefined) {
                replCard = newReplCard(n[1], n[2]);
                repl.deck.cards.push(replCard);
              }
              replCard.id = n[0];
              replCard.query.id = replCard.id;
              replCard.query.query = n[4];
              if (replCard.state === CardState.NONE) {
                submitCard(replCard);  
              }              
            });
          }*/  
        } else {
          return;
        }
        // If we have an update to the user query, match it against the stored ID to validate
        if (targetSystemQuery.id === repl.system.users.id && repl.user !== undefined && repl.user.name === undefined) {
          // Check if the stored user is in the database
          let dbUsers = repl.system.users.result.values;
          let ix = dbUsers.map((u) => u[0]).indexOf(repl.user.id)
          if (ix >= 0) {
            repl.user = {id: dbUsers[ix][0], name: dbUsers[ix][1], username: dbUsers[ix][2] };
            // We found a user! Ask for all the queries by that user
            /* @NOTE Disabled for now
            if (repl.system.queries === undefined) {
              repl.system.queries = newQuery(`(query [id row col display query]
                                                (fact id :tag "repl-card"
                                                        :tag "system"
                                                        :user "${repl.user.id}" 
                                                        :row row 
                                                        :col col
                                                        :display display 
                                                        :query query))`);
              sendQuery(repl.system.queries);             
            }*/
          }
        // Decode a chat message and put it in the system
        } else if (targetSystemQuery.id === repl.system.messages.id) {
          let newMessages = parsed.insert.map((m) => {return {id: m[0], user: m[1], message: m[2], time: m[3]}; });
          repl.chat.messages = repl.chat.messages.concat(newMessages);
          if (repl.chat.visible === false) {
            repl.chat.unread += newMessages.length;
          }          
        }
        // Mark the repl as initialized if all the system queries have been populated
        if (repl.init === false && objectToArray(repl.system).every((q: Query) => q.result !== undefined)) {
          if (repl.system.users.result.values.length === 0) {
            let addUsers = `(query []
                              (insert-fact! "9f546210-20aa-460f-ab7b-55800bec82f0" :tag "repl-user" :tag "system" :name "Corey" :username "corey" :password "corey")
                              (insert-fact! "3037e028-3395-4d8c-a0a7-0e92368c9ec3" :tag "repl-user" :tag "system" :name "Eric" :username "eric" :password "eric")
                              (insert-fact! "62741d3b-b94a-4417-9794-1e6f86e262b6" :tag "repl-user" :tag "system" :name "Josh" :username "josh" :password "josh")
                              (insert-fact! "d4a6dc56-4b13-41d5-be48-c656541cfac1" :tag "repl-user" :tag "system" :name "Chris" :username "chris" :password "chris"))`
            sendAnonymousQuery(addUsers);
          } else {
            repl.init = true;
            // @NOTE temporary: submit all the repl cards for evaluation
            repl.deck.cards.filter((c) => c.query !== undefined && c.query.query !== "").map(submitCard);
          }
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

function sendClose(query: Query): boolean {
  let closeMessage: CloseMessage = {
    type: "close",
    id: query.id,
  }
  return sendMessage(closeMessage);
}

function sendAnonymousQuery(query: string) {
  let anonID = uuid();
  let queryMessage: QueryMessage = {
    type: "query",
    id: anonID,
    query: query,
  };
  let closeMessage: CloseMessage = {
    type: "close",
    id: anonID,
  }
  sendMessage(queryMessage);
  sendMessage(closeMessage);
}

// ---------------------
// Card/Query functions
// ---------------------

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
    history: [],
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

function submitCard(card: ReplCard) {
  let query = card.query;
 
  // If it does exist, remove the previous repl-card row and close the old query
  if (card.state !== CardState.NONE) {
    // Delete a row from the repl-card table
    let delQuery = `(query []
                      (fact-btu "${card.id}" :tick t)
                      (remove-by-t! t))`;
    sendAnonymousQuery(delQuery);
    // Close the old query
    if (card.state === CardState.GOOD) {
      sendClose(card.query);  
    }
  }
  
  // Insert a row in the repl-card table
  /* @NOTE Disable for now
  let rcQuery = `(query []
                   (insert-fact! "${card.id}" :tag "repl-card"
                                              :tag "system"
                                              :row ${card.row} 
                                              :col ${card.col}
                                              :user "${repl.user.id}"
                                              :query "${card.query.query.replace(/"/g,'\\"')}"
                                              :display ${card.display}))`;
  sendAnonymousQuery(rcQuery);*/
  saveReplCard(card);
  
  // Send the actual query
  let sent = sendQuery(card.query);
  card.state = CardState.PENDING;
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
  }
  rerender();
}

function updateQueryResult(query: Query, message: ResultMessage) {
  if (query.result === undefined || query.result.fields.length !== message.fields.length) {
    query.result = {
      fields: message.fields,
      values: message.insert,
    };
  } else {
    // Apply inserts
    query.result.values = query.result.values.concat(message.insert);
    // Apply removes
    message.remove.forEach((row) => {
      removeRow(row,query.result.values);
    });
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

function deleteCard(card: ReplCard) {
  // Delete a row from the repl-card table
  let delQuery = `(query []
                    (fact-btu "${card.id}" :tick t)
                    (remove-by-t! t))`;
  sendAnonymousQuery(delQuery);
  // find the index in the deck
  let ix = repl.deck.cards.map((c) => c.id).indexOf(card.id);
  // remove the card from the deck
  repl.deck.cards.splice(ix,1);
  // Renumber the cards
  repl.deck.cards.filter((r) => r.col === card.col).forEach((c,i) => c.row = i);
  // send a remove to the server
  sendClose(card.query);
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
    //console.log(cm);
    if (cm !== undefined) {
      cm.focus()
    } else {
      /*setTimeout(function() {
        cm = getCodeMirrorInstance(replCard);
        if (cm !== undefined) {
          cm.focus();           
        }
      }, 100);*/  
    }
  }
}

function submitChatMessage(message: string) {
  let d = new Date();
  let t = d.getTime();
  let messageInsert = `(query []
                         (insert-fact! "${uuid()}" :tag "system"
                                                   :tag "repl-chat"
                                                   :message "${message}"
                                                   :user "${repl.user.id}"
                                                   :timestamp "${t}"))`;
  sendAnonymousQuery(messageInsert);
}

// ------------------
// Event handlers
// ------------------

// Register some global event handlers on the window
window.onkeydown = function(event) {
  let thisReplCard = repl.deck.focused;
  let modified = event.ctrlKey || event.metaKey;
  // Catch ctrl + arrow up or page up
  if (event.keyCode === 38 && modified || event.keyCode === 33) {
    // Set the focus to the previous repl card
    let previousReplCard = getReplCard(thisReplCard.row - 1, thisReplCard.col);
    focusCard(previousReplCard);
  // Catch ctrl + arrow down or page down
  } else if (event.keyCode === 40 && modified || event.keyCode === 34) {
    // Set the focus to the next repl card
    let nextReplCard = getReplCard(thisReplCard.row + 1, thisReplCard.col);
    //console.log(nextReplCard.query);
    focusCard(nextReplCard);
  // Catch ctrl + arrow left
  } else if (event.keyCode === 37 && modified) {
    let leftReplCard = getReplCard(thisReplCard.row, thisReplCard.col - 1);
    if (leftReplCard !== undefined) {
      focusCard(leftReplCard); 
    } else {
      let rowsInPrevCol = repl.deck.cards.filter((r) => r.col === thisReplCard.col - 1).length - 1;
      leftReplCard = getReplCard(rowsInPrevCol, thisReplCard.col - 1);
      focusCard(leftReplCard);
    }    
  // Catch ctrl + arrow right
  } else if (event.keyCode === 39 && modified) {
    let rightReplCard = getReplCard(thisReplCard.row, thisReplCard.col + 1);
    if (rightReplCard !== undefined) {
      focusCard(rightReplCard); 
    } else {
      let rowsInNextCol = repl.deck.cards.filter((r) => r.col === thisReplCard.col + 1).length - 1;
      rightReplCard = getReplCard(rowsInNextCol, thisReplCard.col + 1);
      focusCard(rightReplCard);
    }
  // Catch ctrl + r
  } else if (event.keyCode === 82 && event.ctrlKey) {
    addColumn();
  // Catch ctrl + e
  } else if (event.keyCode === 69 && modified) {
    addCardToColumn(repl.deck.focused.col);
  } else {
    return;
  }
  event.preventDefault();
  rerender();
}

window.onbeforeunload = function(event) {
  // Close all open queries before we close the window
  repl.deck.cards.filter((c) => c.state === CardState.GOOD).map((c) => sendClose(c.query));
  // Close all system queries
  objectToArray(repl.system).map(sendClose);
}

function queryInputKeydown(event, elem) {
  let thisReplCard: ReplCard = elemToReplCard(elem);
  let modified = event.ctrlKey || event.metaKey;
  // Submit the query with ctrl + enter or ctrl + s
  if ((event.keyCode === 13 || event.keyCode === 83) && modified) {
    submitCard(thisReplCard);
  // Catch ctrl + delete to remove a card
  } else if (event.keyCode === 46 && modified) {
    deleteCard(thisReplCard);
  // Catch ctrl + home  
  } else if (event.keyCode === 36 && modified) {
    //focusCard(replCards[0]);
  // Catch ctrl + end
  } else if (event.keyCode === 35 && modified) {
    //focusCard(replCards[replCards.length - 1]);
  // Catch ctrl + b
  } else if (event.keyCode === 66 && modified) {
    thisReplCard.query.query = "(query [e a v]\n\t(fact-btu e a v))";
  // Catch ctrl + q
  } else if (event.keyCode === 81 && modified) {
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

function inputKeydown(event, elem) {
  // Capture enter
  if (event.keyCode === 13) {
    let inputs: any = document.querySelectorAll(".login input");
    let username = inputs[0].value;
    let password = inputs[1].value;
    inputs[0].value = "";
    inputs[1].value = "";
    login(username, password); 
  } else {
    return;
  }
  event.preventDefault();
}

function loginSubmitClick(event, elem) {
  let inputs: any = document.querySelectorAll(".login input");
  let username = inputs[0].value;
  let password = inputs[1].value;
  login(username, password);
}

function login(username,password) {
  let users = repl.system.users.result.values;
  for (let user of users) {
    if (username === user[2] && password === user[3]) {
      repl.user = {id: user[0], name: user[1], username: user[2]};
      // Put the user into local storage
      localStorage.setItem('repl-user', user[0]);
      break;
    }  
  }
  if (repl.user !== undefined) {
    rerender();    
  }
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

function deleteCardClick(event, elem) {
  let card = repl.deck.focused;
  deleteCard(card);
  rerender();
}

function addColumnClick(event, elem) {
  addColumn();
  rerender();
}

function addCardClick(event, elem) {
  addCardToColumn(repl.deck.focused.col);
  rerender();
}

function toggleChatClick(event, elem) {
  if (repl.chat.visible) {
    repl.chat.visible = false;
  } else {
    repl.chat.unread = 0;
    repl.chat.visible = true;
  }
}

function chatInputKeydown(event, elem) {
  if (event.keyCode === 13) {
    let message = event.target.value;
    submitChatMessage(message);  
    event.target.value = "";
  }  
}

function queryInputChange(event, elem) {
  let card = elemToReplCard(elem);
  let cm = getCodeMirrorInstance(card);
  card.query.query = cm.getValue();
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
    // If we can't see the query results, close the query
    if (card.display === CardDisplay.QUERY) {
      //sendClose(card.query);
    // If we can see the query results, open the query
    } else {
      // @TODO
    }
    event.preventDefault(); 
    rerender();  
  }
}

function resultSwitchClick(event, elem) {
  let card = elemToReplCard(elem);
  card.resultDisplay = elem.data;
  event.preventDefault();
  rerender();
}

function entityListClick(event, elem) {
  // Filter out results for only the current entity 
  let result: QueryResult = {
    fields: ["Attribute", "Value"],
    values: repl.system.entities.result.values.filter((e) => e[0] === elem.text).map((e) => [e[1], e[2]]),
  };
  // Generate the table
  let table = generateResultTable(result);
  repl.modal = {c: "modal", left: 110, top: event.y, children: [table]};
  // Prevent click event from propagating to another layer
  event.stopImmediatePropagation();
  rerender();
}

function tagsListClick(event, elem) {
  // Filter out results for only the current entity 
  let result: QueryResult = {
    fields: ["Members"],
    values: repl.system.tags.result.values.filter((e) => e[0] === elem.text).map((e) => [e[1]]),
  };
  // Generate the table
  let table = generateResultTable(result);
  repl.modal = {c: "modal", left: 110, top: event.target.offsetTop, children: [table]};
  // Prevent click event from propagating to another layer
  event.stopImmediatePropagation();
  rerender();
}

function rootClick(event, elem) {
  // Causes the open modal to close
  repl.modal = undefined;
  rerender();
}

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
    //mousedown: function(event) {event.preventDefault();},
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
  let tableSwitch   = {c: `button ${card.resultDisplay === ResultsDisplay.TABLE   ? "" : "disabled "}ion-grid`, text: " Table", data: ResultsDisplay.TABLE, row: card.row, col: card.col, click: resultSwitchClick };
  let graphSwitch   = {c: `button ${card.resultDisplay === ResultsDisplay.GRAPH   ? "" : "disabled "}ion-stats-bars`, data: ResultsDisplay.GRAPH, row: card.row, col: card.col, text: " Graph"};
  let messageSwitch = {c: `button ${card.resultDisplay === ResultsDisplay.MESSAGE ? "" : "disabled "}ion-quote`, data: ResultsDisplay.MESSAGE, row: card.row, col: card.col, text: " Message"};
  let historySwitch = {c: `button ${card.resultDisplay === ResultsDisplay.HISTORY ? "" : "disabled "}ion-quote`, data: ResultsDisplay.HISTORY, row: card.row, col: card.col, text: " History", click: resultSwitchClick};
  let infoSwitch    = {c: `button ${card.resultDisplay === ResultsDisplay.INFO    ? "" : "disabled "}ion-help`, data: ResultsDisplay.INFO, row: card.row, col: card.col, text: " Info", click: resultSwitchClick};
  let switches = [];
  // Format card based on state
  if (card.state === CardState.GOOD) {
    resultcss += " good";      
    if (card.query.result !== undefined) {
      switches.push(tableSwitch);
    }
    if (card.history.length > 0) {
      switches.push(historySwitch);
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
    result = {c: "debug", children: [
      {t: "h1", text: "Raw"},
      {c: "code", text: card.query.info.raw},
      {t: "h1", text: "SMIL :)"},
      {c: "code", text: card.query.info.smil},
      {t: "h1", text: "WEASL"},
      {c: "code", text: card.query.info.weasl},
    ]};
              
  } else if (card.resultDisplay === ResultsDisplay.MESSAGE) {
    result = {text: card.query.message};  
  } else if (card.resultDisplay === ResultsDisplay.TABLE) {
    result = generateResultTable(card.query.result);  
  } else if (card.resultDisplay === ResultsDisplay.HISTORY) {
    let tables = card.history.map((h) => {
      let insertTable = h.insert.length > 0 ? generateResultTable({fields: h.fields, values: h.insert}) : false;
      let removeTable = h.remove.length > 0 ? generateResultTable({fields: h.fields, values: h.remove}) : false;
      let historyChildren = [];
      if(insertTable || removeTable) {
        historyChildren.push({t: "h1", text: `Received: ${formatDate(h.timestamp)} ${formatTime(h.timestamp)}`});
      }
      if(insertTable) {
        historyChildren.push({t: "h2", text: "Insert"}, insertTable);
      }
      if(removeTable) {
        historyChildren.push({t: "h2", text: "Remove"}, removeTable);
      }
      return {c: "", children: historyChildren};
    });
    result = {c: "", children: tables};
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

function generateResultTable(result: QueryResult): any {
  if (result === undefined) {
    return {};
  }
  if (result.fields.length > 0) {
    let tableHeader = {c: "header", children: result.fields.map((f: string) => {
      return {c: "cell", text: f};
    })};
    let tableBody = result.values.map((r: Array<any>) => {
      return {c: "row", children: r.map((c: any) => {
        return {c: "cell", text: `${`${c}`.replace(/\\t/g,'  ')}`};
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
  let eveLogo = {t: "img", c: "logo", src: "http://witheve.com/logo.png", width: 643/15, height: 1011/15};
  let deleteButton = {c: "button", text: "Delete Card", click: deleteCardClick};
  let addColumn = {c: "button", text: "Add Column", click: addColumnClick};
  let addCard = {c: "button", text: "Add Card", click: addCardClick};
  let unread = repl.chat.unread > 0 ? {c: "unread", text: `${repl.chat.unread}`} : {};
  let toggleChat = {c: "button", children: [{c: "inline", text: "Chat"}, unread], click: toggleChatClick};
  let buttonList = formListElement([deleteButton, addColumn, addCard, toggleChat]);
  
  // Build the entities table
  let entities: Array<any> = repl.system.entities.result !== undefined ? unique(repl.system.entities.result.values.map((e) => e[0])).map((e) => {
    return {c: "info-link", text: e, click: entityListClick };
  }) : [];
  let entitiesElement = {c: "info", children: [formListElement(entities)]};
  let entitiesTable = {c: "info-table", children: [{t: "h2", text: "Entities"}, entitiesElement]};
  
  // Build the tags table
  let tags: Array<any> = repl.system.tags.result !== undefined ? unique(repl.system.tags.result.values.map((e) => e[0])).map((e) => {
    return {c: "info-link", text: e, click: tagsListClick };
  }) : [];
  let tagsElement = {c: "info", children: [formListElement(tags)]};
  let tagsTable = {c: "info-table", children: [{t: "h2", text: "Tags"}, tagsElement]};
  
  // Build the status bar    
  let statusBar = {
    id: "status-bar",
    c: "status-bar",
    children: [eveLogo, buttonList, entitiesTable, tagsTable],
  };
  return statusBar;
}

function generateChatElement() {
  let chat = {};
  if (repl.chat.visible) {
    let messageElements = repl.chat.messages.map((m) => {
      let userIx = repl.system.users.result.values.map((u) => u[0]).indexOf(m.user);
      let userName = repl.system.users.result.values[userIx][1];
      return {c: "chat-message-box", children: [
               {c: `chat-user ${m.user === repl.user.id ? "me" : ""}`, text: `${userName}`},
               {c: "chat-time", text: `${formatTime(m.time)}`},
               {c: "chat-message", text: `${m.message}`},
             ]};  
    });
    let conversation = {c: "conversation", children: messageElements}; 
    let submitChat = {c: "button", text: "Submit"};
    let chatInput = {t: "input", c: "chat-input", keydown: chatInputKeydown};
    chat = {c: "chat-bar", children: [conversation, chatInput]};
  }
  return chat;
}

// -----------------
// Entry point
// -----------------

// Create an initial repl card
//let defaultCard = newReplCard();
let storedCards = loadReplCards();
if (storedCards.length === 0) {
  storedCards.push(newReplCard());
}
let replCards: Deck = {
  columns: storedCards.map((c) => c.col).sort().pop(),
  cards: storedCards,
  focused: storedCards[0],
}  

// Instantiate a repl instance
let repl: Repl = {
  init: false,
  user: undefined,
  system: {
    entities: newQuery(`(query [entities attributes values]
                          (fact-btu entities attributes values)
                            (not
                              (fact entities :tag "system")))`),  // get all entities that are not system entities
    tags: newQuery(`(query [tag entity], 
                      (fact entity :tag tag)
                        (not
                          (fact entity :tag "system")))`),        // get all tags that are not system tags
    users: newQuery(`(query [id name username password]
                       (fact id :tag "repl-user" 
                                :name name 
                                :username username 
                                :password password))`),           // get all users
    messages: newQuery(`(query [id user message time]
                          (fact id :tag "repl-chat" 
                                   :message message 
                                   :user user 
                                   :timestamp time))`),           // get the chat history
  },
  chat: {
    visible: false,
    unread: 0,
    messages: [],
  },
  decks: [replCards],
  deck: replCards,
  promisedQueries: [],
  modal: undefined,
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
  
  let replChildren;
  let eveLogo = {t: "img", c: "logo", src: "http://witheve.com/logo.png", width: 643/5, height: 1011/5};
  // If the system is ready and there is a user, load the repl 
  if (repl.init === true && repl.user !== undefined && repl.user.name !== undefined) {
    replChildren = [generateStatusBarElement(), generateChatElement(), generateCardRootElements(), repl.modal !== undefined ? repl.modal : {}];
  // If the system is ready but there is no user, show a login page
  } else if (repl.init === true && repl.user === undefined) {
    let username = {t: "input", id: "repl-username-input", placeholder: "Username", keydown: inputKeydown};
    let password = {t: "input", id: "repl-password-input", type: "password", placeholder: "Password", keydown: inputKeydown};
    let submit = {c: "button", text: "Submit", click: loginSubmitClick};
    let login = {c: "login", children: [eveLogo, username, password, submit]}
    replChildren = [login];
  // If the system is disconnected, show a reconnect page
  } else if (repl.server.state === ConnectionState.DISCONNECTED) {
    replChildren = [{c: "login", children: [eveLogo, 
                                            {text: "Disconnected from Eve server."},
                                            {c: "button", text: "Reconnect", click: connectToServer}]}];
  // If the system is not ready, display a loading page
  } else {
    replChildren = [{c: "login", children: [eveLogo, {text: "Loading Eve Database..."}]}];
  }
  //replChildren = [generateStatusBarElement(), generateChatElement(), generateCardRootElements(), repl.modal !== undefined ? repl.modal : {}];
  let root = {
    id: "repl",
    c: "repl",
    click: rootClick,
    children: replChildren,
  };  
  return root;
}

// -----------------
// Utility Functions
// -----------------

function formatTime(timestamp: number): string {
  let d = new Date(0);
  d.setUTCMilliseconds(timestamp);
  let hrs = d.getHours() > 12 ? d.getHours() - 12 : d.getHours();
  let mins = d.getMinutes() < 10 ? `0${d.getMinutes()}` : d.getMinutes();
  let ampm = d.getHours() < 12 ? "AM" : "PM";
  let timeString = `${hrs}:${mins} ${ampm}`
  return timeString;
}

function formatDate(timestamp: number): string {
  let d = new Date(0);
  d.setUTCMilliseconds(timestamp);
  let day = d.getDate();
  let month = d.getMonth();
  let year = d.getFullYear();
  let date = `${month}/${day}/${year}`;
  return date;
}

function removeRow(row: Array<any>, array: Array<Array<any>>) {
  let ix;
  for (let i = 0; i < array.length; i++) {
    let value = array[i];
    if (arraysEqual(row,value)) {
      ix = i;
      break;
    }  
  }
  // If we found the row, remove it from the values
  if (ix !== undefined) {
    array.splice(ix,1);
  }
}

function arraysEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function unique(array: Array<any>): Array<any> {
  array = array.filter((e,i) => array.indexOf(e) === i);
  return array;
}

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

function rerender() {
  app.dispatch("rerender", {}).commit();
}

// Codemirror!

function getCodeMirrorInstance(replCard: ReplCard): CodeMirror.Editor {
  let targets = document.querySelectorAll(".query-input");
  //console.log(`Target ID: ${replCard.id}`);
  for (let i = 0; i < targets.length; i++) {
    let target = targets[i];
    //console.log(`Candidate ID: ${target.parentElement["_id"]}`);
    if (target.parentElement["_id"] === replCard.id) {
      //console.log(target);
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
        mode: elem.mode || "clojure",
        matchBrackets: true,
        autoCloseBrackets: true,
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
