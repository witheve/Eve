import * as parser from "./parser";

export interface Query {
  type: string,
  query: string,
  id: string,
}

let WebSocket = require('ws');
var server;
let uuid = require("uuid");

let ws: WebSocket = new WebSocket("ws://localhost:8080");

ws.onopen = function(e: Event) {
  console.log("Opening websocket connection.");
  console.log(e);
  let query: Query = {
    id: uuid(),
    type: "query",
    query: "",
  }
  ws.send(JSON.stringify(query));
}

ws.onmessage = function(message: MessageEvent) {
  console.log(message);
  let parsed = JSON.parse(message.data);
  console.log(parsed);
}

ws.onerror = function(e: Event) {
  console.log("Websocket error!");
}

ws.onclose = function(c: CloseEvent) {
  console.log("Closing websocket connection.");
}