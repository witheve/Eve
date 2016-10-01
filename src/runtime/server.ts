//---------------------------------------------------------------------
// Server
//---------------------------------------------------------------------

import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import * as ws from "ws";
import * as express from "express";
import * as bodyParser from "body-parser";

import {Evaluation} from "./runtime";
import * as join from "./join";
import * as client from "../client";
import * as parser from "./parser";
import * as builder from "./builder";
import {ActionImplementations} from "./actions";
import {BrowserSessionDatabase} from "./databases/browserSession";
import * as system from "./databases/system";
import {PersistedDatabase} from "./databases/persisted";
import {HttpDatabase} from "./databases/node/http";
import {ServerDatabase} from "./databases/node/server";

let contentTypes = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".map": "application/javascript",
  ".css": "text/css",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
}

const PORT= process.env.PORT || 8080;

let serverDatabase = new ServerDatabase();

var app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

app.get("*", (request, response) => {
  let url = request.url;
  if(url === "/" || url.indexOf(".eve") > -1) {
    url = "/index.html";
  }
  fs.stat("." + url, (err, result) => {
    if(err) {
      return serverDatabase.handleHttpRequest(request, response);
    }
    response.setHeader("Content-Type", `${contentTypes[path.extname(url)]}; charset=utf-8`);
    response.end(fs.readFileSync("." + url));
  });
});


app.post("*", (request, response) => {
  return serverDatabase.handleHttpRequest(request, response);
});

let server = http.createServer(app);

let WebSocketServer = require('ws').Server;
let wss = new WebSocketServer({server: server});

function handleEvent(evaluation, data) {
  let actions = [];
  for(let insert of data.insert) {
    actions.push(new ActionImplementations["+="](insert[0], insert[1], insert[2]));
  }
  evaluation.executeActions(actions);
}

let shared = new PersistedDatabase();

wss.on('connection', function connection(ws) {
  let queue = [];
  let evaluation;
  ws.on('message', function incoming(message) {
    let data = JSON.parse(message);
    if(data.type === "init") {
      let {url} = data;
      fs.stat("." + url, (err, result) => {
        let content = fs.readFileSync("." + url).toString();
        ws.send(JSON.stringify({type: "initLocal", code: content}));
        // let parsed = parser.parseDoc(content);
        // console.log(parsed.errors);
        // let {blocks} = builder.buildDoc(parsed.results);
        // console.log(blocks);
        // let session = new BrowserSessionDatabase(ws);
        // session.blocks = blocks;
        // evaluation = new Evaluation();
        // evaluation.registerDatabase("session", session);
        // evaluation.registerDatabase("system", system.instance);
        // evaluation.registerDatabase("shared", shared);
        // evaluation.registerDatabase("http", new HttpDatabase());
        // evaluation.registerDatabase("server", serverDatabase);
        // evaluation.fixpoint();
        // for(let queued of queue) {
        //   handleEvent(evaluation, queued);
        // }
      });
    } else if(data.type === "event") {
      if(!evaluation) {
        queue.push(data);
      } else {
        handleEvent(evaluation, data);
      }
    }
    // console.log('received: %s', message);
  });
  ws.on("close", function() {
    if(evaluation) {
      evaluation.close();
    }
  });
});

server.listen(PORT, function(){
  console.log("Server listening on: http://localhost:%s", PORT);
});
