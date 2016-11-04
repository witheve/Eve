//---------------------------------------------------------------------
// Server
//---------------------------------------------------------------------

import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import * as ws from "ws";
import * as express from "express";
import * as bodyParser from "body-parser";

import {ActionImplementations} from "./actions";
import {PersistedDatabase} from "./databases/persisted";
import {HttpDatabase} from "./databases/node/http";
import {ServerDatabase} from "./databases/node/server";
import {RuntimeClient} from "./runtimeClient";

//---------------------------------------------------------------------
// Constants
//---------------------------------------------------------------------

const contentTypes = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".map": "application/javascript",
  ".css": "text/css",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
}

const BROWSER = false;
const PORT = process.env.PORT || 8080;
const serverDatabase = new ServerDatabase();
const shared = new PersistedDatabase();

global["browser"] = false;
global["fileFetcher"] = (name) => {
  return fs.readFileSync(path.join("./examples/", name)).toString();
}

//---------------------------------------------------------------------
// Express app
//---------------------------------------------------------------------

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

app.get("/build/examples.js", (request, response) => {
  let files = {};
  for(let file of fs.readdirSync("examples/")) {
    if(path.extname(file) === ".eve") {
      try {
        files[file] = fs.readFileSync(path.join("examples", file)).toString();
      } catch(err) {}
    }
  }

  fs.writeFileSync("build/examples.js", `var examples = ${JSON.stringify(files)}`)
  response.setHeader("Content-Type", `application/javascript; charset=utf-8`);
  response.end(`var examples = ${JSON.stringify(files)}`);
});

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

//---------------------------------------------------------------------
// Websocket
//---------------------------------------------------------------------

class ServerRuntimeClient extends RuntimeClient {
  socket: WebSocket;

  constructor(socket:WebSocket, withIDE = true) {
    const dbs = {
      "http": new HttpDatabase(),
      "shared": shared,
    }
    super(dbs, withIDE);
    this.socket = socket;
  }

  send(json) {
    this.socket.send(json);
  }
}

function initWebsocket(wss) {
  wss.on('connection', function connection(ws) {
    let client = new ServerRuntimeClient(ws);
    ws.on('message', function incoming(message) {
      let data = JSON.parse(message);
      if(data.type === "init") {
        let {url, hash} = data;
        let path = hash !== "" ? hash : url;
        console.log("PATH", path)
        fs.stat("." + path, (err, stats) => {
          if(err || !stats.isFile()) {
            ws.send(JSON.stringify({type: "initLocal"}));

          } else {
            let content = fs.readFileSync("." + path).toString();
            if(BROWSER) {
              ws.send(JSON.stringify({type: "initLocal", path, code: content}));
            } else {
              client.load(content, "user");
            }
          }
        });
      } else if(data.type === "save"){
        fs.stat("." + data.path, (err, stats) => {
          if(err || !stats.isFile()) {
            console.log("trying to save to bad file: " + data.path);

          } else {
            fs.writeFileSync("." + data.path, data.code);
          }
        });

      } else {
        client.handleEvent(message);
      }
      // console.log('received: %s', message);
    });
    ws.on("close", function() {
      client.evaluation.close();
    });
  });
}

//---------------------------------------------------------------------
// Go!
//---------------------------------------------------------------------

let server = http.createServer(app);

let WebSocketServer = require('ws').Server;
let wss = new WebSocketServer({server: server});
initWebsocket(wss);

server.listen(PORT, function(){
  console.log("Server listening on: http://localhost:%s", PORT);
});
