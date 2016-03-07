import app = require("./app");
import {autoFocus} from "./utils";

enum CardState {
  NONE,
  GOOD,
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
  query: string,
  result: {
    fields: Array<string>,
    data: Array<Array<any>>,
  } | string,
}

app.renderRoots["repl"] = root;

let WebSocket = require('ws');
var server;
let uuid = require("uuid");

let ws: WebSocket = new WebSocket("ws://localhost:8080");

ws.onopen = function(e: Event) {
  console.log("Opening websocket connection.");
  console.log(e);
}

ws.onmessage = function(message: MessageEvent) {
  let parsed = JSON.parse(message.data);
  console.log("Received message!");
  // Update the result of the correct repl card
  let targetCard = replCards.filter((r) => r.id === parsed.id).shift();
  if (targetCard !== undefined) {
    if (parsed.type === "result") {
      targetCard.state = CardState.GOOD;
      targetCard.result = {
        fields: parsed.fields,
        data: parsed.values,
      }
    } else if (parsed.type === "error") {
      targetCard.state = CardState.ERROR;
      targetCard.result = parsed.message;
    }
  }
  // Create a new card if we submitted the last one in replCards
  if (replCards[replCards.length - 1].state !== CardState.NONE) {
    replCards.push(newReplCard());
  }
  app.dispatch("rerender", {}).commit();
}

ws.onerror = function(e: Event) {
  console.log("Websocket error!");
}

ws.onclose = function(c: CloseEvent) {
  console.log("Closing websocket connection.");
}

function sendQuery(ws: WebSocket, query: Query) {
  console.log("Sending query:");
  console.log(query);
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(query));  
  }
}

function newReplCard(): ReplCard {
  let replCard: ReplCard = {
    id: uuid(),
    state: CardState.NONE,

    query: undefined,
    result: undefined,
  }
  return replCard;
}

function newReplCardElement(replCard: ReplCard) {
  
  function submitQuery(e) {
    let textArea = e.srcElement;
    let replCard = textArea.parentElement;
    // Submit the query with ctrl + enter
    if (e.keyCode === 13 && e.ctrlKey === true) {
      let queryString = textArea.value;
      let query: Query = {
        id: replCard._id,
        type: "query",
        query: queryString,
      }
      sendQuery(ws, query);
      replCard.query = query;
    // Catch tab
    } else if (e.keyCode === 9) {
      let start = textArea.selectionStart;
      let end = textArea.selectionEnd;
      let value = textArea.value;
      value = value.substring(0, start) + "  " + value.substring(end);
      textArea.value = value;
      textArea.selectionStart = textArea.selectionEnd = start + 2;
      e.preventDefault();
    // Catch ctrl + arrow up
    } else if (e.keyCode === 38 && e.ctrlKey === true) {
      console.log(e);
      // Find the previous repl card
      let thisReplCard = e.srcElement.parentElement;
      let replIDs = replCards.map((r) => r.id);
      let previousIx = replIDs.indexOf(thisReplCard._id) - 1 >= 0 ? replIDs.indexOf(thisReplCard._id) - 1 : 0;
      // Set the focus for the repl card
      let replCardElements: Array<any> = thisReplCard.parentElement.children;
      replCardElements[previousIx].focus();      
      console.log(replCardElements[previousIx]);
    }
  }
  let queryInput = {t: "textarea", c: "query-input", placeholder: "query", keydown: submitQuery, postRender: autoFocus};
  let queryResult = replCard.result === undefined ? {} : {c: "query-result", text: JSON.stringify(replCard.result)};
  let replCardElement = {
    id: replCard.id,
    c: "repl-card",
    children: [queryInput, queryResult],
  };
  return replCardElement;
}

// Create an initial repl card
let replCards: Array<ReplCard> = [newReplCard()];
function root() {
  let replroot = {
    id: "root",
    c: "repl-root",
    children: replCards.map(newReplCardElement),
  }; 
  return replroot;
}