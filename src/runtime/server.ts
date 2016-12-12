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

import {config, Config, Owner} from "../config";
import {ActionImplementations} from "./actions";
import {PersistedDatabase} from "./databases/persisted";
import {HttpDatabase} from "./databases/node/http";
import {ServerDatabase} from "./databases/node/server";
import {Database} from "./runtime";
import {RuntimeClient} from "./runtimeClient";
import {BrowserViewDatabase, BrowserEditorDatabase, BrowserInspectorDatabase, BrowserServerDatabase} from "./databases/browserSession";
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
    response.setHeader("Content-Type", `application/javascript; charset=utf-8`);
    response.end(packaged);
  });

  app.get("/assets/*", handleStatic);
  app.get("/build/*", handleStatic);

  app.get("*", (request, response) => {
    let client;
    if ((config.runtimeOwner === Owner.both) || (config.runtimeOwner === Owner.server)) {
      client = new HTTPRuntimeClient();
      let content = "";
      if(filepath) content = fs.readFileSync(filepath).toString();
      client.load(content, "user");
      client.handle(request, response);
    }
    if(config.runtimeOwner === Owner.client || client && !client.server.handling) {
      response.setHeader("Content-Type", `${contentTypes["html"]}; charset=utf-8`);
      response.end(fs.readFileSync(path.join(config.eveRoot, "index.html")));
    }
  });

  app.post("*", (request, response) => {
    let client;
    if((config.runtimeOwner === Owner.both) || (config.runtimeOwner === Owner.server)) {
      client = new HTTPRuntimeClient();
      let content = "";
      if(filepath) content = fs.readFileSync(filepath).toString();
      client.load(content, "user");
      client.handle(request, response);
    }
    if(config.runtimeOwner === Owner.client || client && !client.server.handling) {
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

  constructor(socket:WebSocket, withIDE:boolean) {
    const dbs = {
      "http": new HttpDatabase(),
      "shared": shared,
    }
    if(withIDE) {
      dbs["view"] = new BrowserViewDatabase();
      dbs["editor"] = new BrowserEditorDatabase();
      dbs["inspector"] = new BrowserInspectorDatabase();
    }
    // in the case where we're running on both the client and the server,
    // we need to add a browser-session bag and also make our local browser bag
    // be a normal database that way we don't send UI that is already being handled
    // by the client
    if(config.runtimeOwner === Owner.both) {
      dbs["browser-session"] = new BrowserServerDatabase({socketSend: (json) => {this.send(json)}});
      dbs["browser"] = new Database();
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
    let {editor, runtimeOwner, controlOwner} = config;
    let {url, hash} = data;


    let path = url;
    let filepath = path;
    if(hash) {
      path = hash;
      filepath = hash.split("#")[0];
      if(filepath[filepath.length - 1] === "/") filepath = filepath.slice(0, -1);
    }

    if(config.controlOwner === Owner.client) {
      ws.send(JSON.stringify({type: "initProgram", runtimeOwner, controlOwner, path, withIDE: editor}));
      return;
    }

    let content = filepath && eveSource.find(filepath);

    if(!content && config.path && path.indexOf("gist:") === -1) {
      let workspace = "root";
      // @FIXME: This hard-coding isn't technically wrong right now, but it's brittle and poor practice.
      content = eveSource.get(config.path, workspace);
      if(content) path = eveSource.getRelativePath(config.path, workspace);
    }

    if(content) {
      ws.send(JSON.stringify({type: "initProgram", runtimeOwner, controlOwner, path, code: content, withIDE: editor}));
      if((runtimeOwner === Owner.server) || (runtimeOwner === Owner.both)) {
        client.load(content, "user");
      }
    } else {
      // @FIXME: Do we still need this fallback for anything? Cases where we need to run an eve file outside of a project?
      fs.stat("." + path, (err, stats) => {
        if(!err && stats.isFile()) {
          let content = fs.readFileSync("." + path).toString();
          ws.send(JSON.stringify({type: "initProgram", runtimeOwner, controlOwner, path, code: content, withIDE: editor}));
        } else {
          path = hash || url;
          ws.send(JSON.stringify({type: "initProgram", runtimeOwner, controlOwner, path, withIDE: editor}));
        }

        if(runtimeOwner === Owner.server || runtimeOwner === Owner.both) {
          client.load(content, "user");
        }
      });
    }
  } else if(data.type === "save"){
    eveSource.save(data.path, data.code);
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
    let {editor, runtimeOwner, controlOwner, path:filepath} = config;
    // we do nothing here since the server is in charge of handling init.
    let content = fs.readFileSync(filepath).toString();
    ws.send(JSON.stringify({type: "initProgram", runtimeOwner, controlOwner, path: filepath, code: content, withIDE: editor}));
    if(runtimeOwner === Owner.server || runtimeOwner === Owner.both) {
      client.load(content, "user");
    }
  } else if(data.type === "event") {
    client.handleEvent(message);
  } else if(data.type === "result") {
    client.handleEvent(message);
  } else if(data.type === "ping") {
    // we don't need to do anything with pings, they're just to make sure hosts like
    // Heroku don't shutdown our server.
  } else {
    console.error("Invalid message sent: " + message);
  }
}

function initWebsocket(wss, withIDE:boolean) {
  wss.on('connection', function connection(ws) {
    let client = new SocketRuntimeClient(ws, withIDE);
    let handler = withIDE ? IDEMessageHandler : MessageHandler;
    if(!withIDE) {
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
  // @FIXME: Split these out!
  eveSource.add("eve", path.join(config.eveRoot, "examples"));
  if(config.internal) {
    eveSource.add("root", path.join(config.eveRoot, "examples"));
    eveSource.add("examples", path.join(config.eveRoot, "examples"));
  } else {
    eveSource.add("root", config.root);
  }


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
      console.log(`ERROR: Eve couldn't start because port ${config.port} is already in use.\n\nYou can select a different port for Eve using the "port" argument.\nFor example:\n\n> eve --port 1234`);
    } else {
      throw err;
    }
    process.exit(1);
  });
}

if(require.main === module) {
  console.error("Please run eve using the installed eve binary.");
}
