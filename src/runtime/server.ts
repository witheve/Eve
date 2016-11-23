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

import {config, Config} from "../config";
import {ActionImplementations} from "./actions";
import {PersistedDatabase} from "./databases/persisted";
import {HttpDatabase} from "./databases/node/http";
import {ServerDatabase} from "./databases/node/server";
import {Database} from "./runtime";
import {RuntimeClient} from "./runtimeClient";
import {BrowserViewDatabase, BrowserEditorDatabase, BrowserInspectorDatabase} from "./databases/browserSession";
import * as eveSource from "./eveSource";

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

const shared = new PersistedDatabase();


global["browser"] = false;

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

function handleStatic(request, response) {
  let url = request['_parsedUrl'].pathname;
  let roots = [".", config.eveRoot];
  let completed = 0;
  let results = {};
  for(let root of roots) {
    let filepath = path.join(root, url);
    fs.stat(filepath, (err, result) => {
      completed += 1;
      if(!err) results[root] = fs.readFileSync(filepath);

      if(completed === roots.length) {
        for(let root of roots) {
          if(results[root]) {
            response.setHeader("Content-Type", `${contentTypes[path.extname(url)]}; charset=utf-8`);
            response.end(results[root]);
            return;
          }
        }

        return response.status(404).send("Looks like that asset is missing.");
      }
    });
  };
}

function createExpressApp() {
  let filepath = config.path;
  const app = express();

  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({extended: true}));

  app.get("/build/workspaces.js", (request, response) => {
    let packaged = eveSource.pack();

    // @FIXME: Is rewriting the file really needed here..?
    fs.writeFileSync(path.join(config.eveRoot, "build/workspaces.js"), packaged);
    response.setHeader("Content-Type", `application/javascript; charset=utf-8`);
    response.end(packaged);
  });

  app.get("/assets/*", handleStatic);
  app.get("/build/*", handleStatic);
  app.get("/src/*", handleStatic);
  app.get("/css/*", handleStatic);
  app.get("/fonts/*", handleStatic);

  app.get("*", (request, response) => {
    let client = new HTTPRuntimeClient();
    let content = "";
    if(filepath) content = fs.readFileSync(filepath).toString();
    client.load(content, "user");
    client.handle(request, response);
    if(!client.server.handling) {
      response.setHeader("Content-Type", `${contentTypes["html"]}; charset=utf-8`);
      response.end(fs.readFileSync(path.join(config.eveRoot, "index.html")));
    }
  });

  app.post("*", (request, response) => {
    let client = new HTTPRuntimeClient();
    let content = "";
    if(filepath) content = fs.readFileSync(filepath).toString();
    client.load(content, "user");
    client.handle(request, response);
    if(!client.server.handling) {
      return response.status(404).send("Looks like that asset is missing.");
    }
  });

  return app;
}

//---------------------------------------------------------------------
// Websocket
//---------------------------------------------------------------------



class SocketRuntimeClient extends RuntimeClient {
  socket: WebSocket;

  constructor(socket:WebSocket, inEditor:boolean) {
    const dbs = {
      "http": new HttpDatabase(),
      "shared": shared,
    }
    if(inEditor) {
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

function IDEMessageHandler(client:SocketRuntimeClient, message) {
  let ws = client.socket;
  let data = JSON.parse(message);
  if(data.type === "init") {
    let {editor, browser} = config;
    let {url, hash} = data;
    let path = hash !== "" ? hash : url;

    // @FIXME: get doesn't really work this way atm.
    // We need to be able to match the url to any workspace,
    // not just eve.
    let content = eveSource.get(path);
    if(content) {
      ws.send(JSON.stringify({type: "initProgram", local: browser, path, code: content, withIDE: editor}));
      if(!browser) {
        client.load(content, "user");
      }
    } else {
      fs.stat("." + path, (err, stats) => {
        if(!err && stats.isFile()) {
          let content = fs.readFileSync("." + path).toString();
          ws.send(JSON.stringify({type: "initProgram", local: browser, path, code: content, withIDE: editor}));
        } else if(config.internal) {
          ws.send(JSON.stringify({type: "initProgram", local: browser, path: "/examples/quickstart.eve", code: eveSource.get("quickstart.eve", "examples"), withIDE: editor}));
        } else {
          ws.send(JSON.stringify({type: "initProgram", local: true, withIDE: editor}));
        }

        if(!browser) {
          client.load(content, "user");
        }
      });
    }
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

function MessageHandler(client:SocketRuntimeClient, message) {
  let ws = client.socket;
  let data = JSON.parse(message);
  if(data.type === "init") {
    let {editor, browser, path:filepath} = config;
    // we do nothing here since the server is in charge of handling init.
    let content = fs.readFileSync(filepath).toString();
    ws.send(JSON.stringify({type: "initProgram", local: browser, path: filepath, code: content, withIDE: editor}));
    if(!browser) {
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

function initWebsocket(wss, inEditor:boolean) {
  wss.on('connection', function connection(ws) {
    let client = new SocketRuntimeClient(ws, inEditor);
    let handler = inEditor ? IDEMessageHandler : MessageHandler;
    if(!inEditor) {
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

export function run() {
  if(!config.internal) {
    eveSource.add(config.root.split(path.sep).pop(), config.root);
  } else {
    eveSource.add("examples", path.join(config.eveRoot, "examples"));
  }
  // @FIXME: Split these out!
  eveSource.add("eve", path.join(config.eveRoot, "examples"));

  // If a file was passed in, we need to make sure it actually exists
  // now instead of waiting for the user to submit a request and then
  // blowing up
  if(config.path) {
    try {
      fs.statSync(config.path);
    } catch(e) {
      throw new Error("Can't load " + config.path);
    }
  }

  let app = createExpressApp();
  let server = http.createServer(app);

  let WebSocketServer = require('ws').Server;
  let wss = new WebSocketServer({server});
  initWebsocket(wss, config.editor);

  server.listen(config.port, function(){
    console.log(`Eve is available at http://localhost:${config.port}. Point your browser there to access the Eve editor.`);
  });

  // If the port is already in use, display an error message
  process.on('uncaughtException', function handleAddressInUse(err) {
    if(err.errno === 'EADDRINUSE') {
      console.log(`ERROR: Eve couldn't start because port ${config.port} is already in use.\n\nYou can select a different port for Eve using the "port" argument.\nFor example:\n\n> npm start -- --port 1234`);
    } else {
      console.error(err);
    }
    process.exit(1);
  });
}

if(require.main === module) {
  console.error("Please run eve using the installed eve binary.");
}
