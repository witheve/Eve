import app = require("./app");

export interface Query {
  type: string,
  query: string,
  id: string,
}

interface ReplCard {
  id: string,
  submitted: boolean,
  query: string,
  result: {
    fields: Array<string>,
    data: Array<Array<any>>,
  }
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
  // Update the result of the correct repl card
  let targetCard = replCards.filter((r) => r.id === parsed.id).shift();
  targetCard.submitted = true;
  if (targetCard !== undefined) {
    targetCard.result = {
      fields: parsed.fields,
      data: parsed.values,
    } 
  }
  // Create a new card if we submitted the last one
  if (replCards[replCards.length - 1].submitted) {
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
    submitted: false,
    query: undefined,
    result: undefined,
  }
  return replCard;
}

function newReplCardElement(replCard: ReplCard) {
  
  function submitQuery(e) {
    let textArea = e.srcElement;
    let replCard = textArea.parentElement;
    // Submit the query
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
      textArea.value += "\t";
      e.preventDefault();
    }
  }
  let replCardElement = {
    id: replCard.id,
    c: "repl-card",
    submitted: false,
    children: [
      {t: "textarea", c: "", placeholder: "query", keydown: submitQuery},
      {c: "", text: JSON.stringify(replCard.result)},
    ],
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