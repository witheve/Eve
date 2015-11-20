import fs = require("fs");
import path = require("path");
import express = require('express');
import * as runtime from "./runtime";

let WebSocketServer = require('ws').Server;
let wss = new WebSocketServer({ port: 8080 });

let eve = runtime.indexer();

try {
  fs.statSync("server.evedb");
  eve.load(fs.readFileSync("server.evedb").toString());
} catch(err) {}

let clients = {};

wss.on('connection', function connection(ws) {

  //when we connect, send them all the pages.
  ws.send(JSON.stringify({kind: "load", time: (new Date()).getTime(), me: "server", data: eve.serialize()}));

  ws.on('close', function() {
    delete clients[ws.me];
  });

  ws.on('message', function incoming(message) {
    console.log('received: %s', message);
    let parsed = JSON.parse(message);
    if(parsed.kind === "changeset") {
      let diff = eve.diff();
      diff.tables = parsed.data;
      eve.applyDiff(diff);
      // dispatch and store.
      for(let client in clients) {
        if(client === parsed.me) continue;
        if(!clients[client]) continue;
        clients[client].send(message);
      }
      // store
      fs.writeFileSync("server.evedb", eve.serialize());
    } else if(parsed.kind === "connect") {
      clients[parsed.data] = ws;
      ws.me = parsed.data;
    }
  });
});

var app = express();
app.use("/bin", express.static(__dirname + '/../bin'));
app.use("/css", express.static(__dirname + '/../css'));
app.use("/node_modules", express.static(__dirname + '/../node_modules'));
app.use("/vendor", express.static(__dirname + '/../vendor'));
app.use("/fonts", express.static(__dirname + '/../fonts'));

app.get("/", (req, res) => {
  res.sendFile(path.resolve(__dirname + "/../editor.html"));
})

app.listen(process.env.PORT || 3000);