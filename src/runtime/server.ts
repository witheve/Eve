//---------------------------------------------------------------------
// Server
//---------------------------------------------------------------------

import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import * as ws from "ws";
import * as express from "express";
import * as bodyParser from "body-parser";
import * as minimist from "minimist";

import {ActionImplementations} from "./actions";
import {PersistedDatabase} from "./databases/persisted";
import {HttpDatabase} from "./databases/node/http";
import {ServerDatabase} from "./databases/node/server";
import {Database} from "./runtime";
import {RuntimeClient} from "./runtimeClient";
import {BrowserViewDatabase, BrowserEditorDatabase, BrowserInspectorDatabase} from "./databases/browserSession";

//---------------------------------------------------------------------
// Constants
//---------------------------------------------------------------------

const argv = minimist(process.argv.slice(2));

const contentTypes = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".map": "application/javascript",
  ".css": "text/css",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
}

const BROWSER = !argv["server"];
const PORT = process.env.PORT || argv["port"] || 8080;
const shared = new PersistedDatabase();
const PATH = argv["_"][0] || "examples/clock.eve";

// If a file was passed in, we need to make sure it actually exists
// now instead of waiting for the user to submit a request and then
// blowing up
if(PATH) {
  try {
    fs.statSync(PATH);
  } catch(e) {
    throw new Error("Can't load " + PATH);
  }
}

const WITH_IDE = !argv["_"][0];

global["browser"] = false;
global["fileFetcher"] = (name) => {
  return fs.readFileSync(path.join("./", name)).toString();
}

//---------------------------------------------------------------------
// HTTPRuntimeClient
//---------------------------------------------------------------------

class HTTPRuntimeClient extends RuntimeClient {
  server: ServerDatabase;
  constructor() {
    let server = new ServerDatabase();
    const dbs = {
      "http": new HttpDatabase(),
      "server": server,
      "shared": shared,
      "browser": new Database(),
    }
    super(dbs);
    this.server = server;
  }

  handle(request, response) {
    this.server.handleHttpRequest(request, response);
  }

  send(json) {
    // there's nothing for this to do.
  }
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
        files["/examples/" + file] = fs.readFileSync(path.join("examples", file)).toString();
      } catch(err) {}
    }
  }

  fs.writeFileSync("build/examples.js", `var examples = ${JSON.stringify(files)}`)
  response.setHeader("Content-Type", `application/javascript; charset=utf-8`);
  response.end(`var examples = ${JSON.stringify(files)}`);
});

function handleStatic(request, response) {
  let url = request['_parsedUrl'].pathname;
  fs.stat("." + url, (err, result) => {
    if(err) {
      return response.status(404).send("Looks like that asset is missing.");
    }
    response.setHeader("Content-Type", `${contentTypes[path.extname(url)]}; charset=utf-8`);
    response.end(fs.readFileSync("." + url));
  });
}

app.get("/assets/*", handleStatic);
app.get("/build/*", handleStatic);
app.get("/src/*", handleStatic);
app.get("/css/*", handleStatic);
app.get("/fonts/*", handleStatic);

app.get("*", (request, response) => {
  let client = new HTTPRuntimeClient();
  let content = fs.readFileSync(PATH).toString();
  client.load(content, "user");
  client.handle(request, response);
  if(!client.server.handling) {
    response.setHeader("Content-Type", `${contentTypes["html"]}; charset=utf-8`);
    response.end(fs.readFileSync("index.html"));
  }
});

app.post("*", (request, response) => {
  let client = new HTTPRuntimeClient();
  let content = fs.readFileSync(PATH).toString();
  client.load(content, "user");
  client.handle(request, response);
  if(!client.server.handling) {
    return response.status(404).send("Looks like that asset is missing.");
  }
});

//---------------------------------------------------------------------
// Websocket
//---------------------------------------------------------------------

class SocketRuntimeClient extends RuntimeClient {
  socket: WebSocket;

  constructor(socket:WebSocket, withIDE = true) {
    const dbs = {
      "http": new HttpDatabase(),
      "shared": shared,
    }
    if(withIDE) {
      dbs["view"] = new BrowserViewDatabase();
      dbs["editor"] = new BrowserEditorDatabase();
      dbs["inspector"] = new BrowserInspectorDatabase();
    }
    super(dbs);
    this.socket = socket;
  }

  send(json) {
    if(this.socket && this.socket.readyState === 1) {
      this.socket.send(json);
    }
  }
}

function IDEMessageHandler(client, message) {
  let ws = client.socket;
  let data = JSON.parse(message);
  if(data.type === "init") {
    let {url, hash} = data;
    let path = hash !== "" ? hash : url;
    fs.stat("." + path, (err, stats) => {
      if(err || !stats.isFile()) {
        ws.send(JSON.stringify({type: "initProgram", local: true, withIDE: WITH_IDE}));

      } else {
        let content = fs.readFileSync("." + path).toString();
        ws.send(JSON.stringify({type: "initProgram", local: BROWSER, path, code: content, withIDE: WITH_IDE}));
        if(!BROWSER) {
          client.load(content, "user");
        }
      }
    });
  } else if(data.type === "save"){
    fs.stat("." + path.dirname(data.path), (err, stats) => {
      console.log(err, stats);
      if(err || !stats.isDirectory()) {
        console.log("trying to save to bad path: " + data.path);
      } else {
        fs.writeFileSync("." + data.path, data.code);
      }
    });
  } else if(data.type === "ping") {
    // we don't need to do anything with pings, they're just to make sure hosts like
    // Heroku don't shutdown our server.
  } else {
    client.handleEvent(message);
  }
}

function MessageHandler(client, message) {
  let ws = client.socket;
  let data = JSON.parse(message);
  if(data.type === "init") {
    // we do nothing here since the server is in charge of handling init.
    let content = fs.readFileSync(PATH).toString();
    ws.send(JSON.stringify({type: "initProgram", local: BROWSER, path: PATH, code: content, withIDE: WITH_IDE}));
    if(!BROWSER) {
      client.load(content, "user");
    }
  } else if(data.type === "event") {
    client.handleEvent(message);
  } else if(data.type === "ping") {
    // we don't need to do anything with pings, they're just to make sure hosts like
    // Heroku don't shutdown our server.
  } else {
    console.error("Invalid message sent: " + message);
  }
}

function initWebsocket(wss) {
  wss.on('connection', function connection(ws) {
    let client = new SocketRuntimeClient(ws, WITH_IDE);
    let handler = WITH_IDE ? IDEMessageHandler : MessageHandler;
    if(!WITH_IDE) {
      // we need to initialize
    }
    ws.on('message', (message) => {
      handler(client, message);
    })
    ws.on("close", function() {
      if(client.evaluation) {
        client.evaluation.close();
      }
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
  console.log(`Eve is available at http://localhost:${PORT}. Point your browser there to access the Eve editor.`);
});

// If the port is already in use, display an error message
process.on('uncaughtException', function(err) {
    if(err.errno === 'EADDRINUSE') {
      console.log(`ERROR: Eve couldn't start because port ${PORT} is already in use.\n\nYou can select a different port for Eve using the "port" argument.\nFor example:\n\n> npm start -- --port 1234`);
    }
    process.exit(1);
});
