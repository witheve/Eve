//---------------------------------------------------------------------
// Webworker client
//---------------------------------------------------------------------

import {Evaluation, Database} from "./runtime";
import * as join from "./join";
import * as parser from "./parser";
import * as builder from "./builder";
import * as eveSource from "./eveSource";
import {ids} from "./id";
import {RuntimeClient} from "./runtimeClient";
import {HttpDatabase} from "./databases/http";
import {BrowserViewDatabase, BrowserEditorDatabase, BrowserInspectorDatabase} from "./databases/browserSession";

//---------------------------------------------------------------------
// Responder
//---------------------------------------------------------------------

class WebworkerRuntimeClient extends RuntimeClient {

  constructor(showIDE) {
    let dbs = {
      "http": new HttpDatabase()
    }
    if(showIDE) {
      dbs["view"] = new BrowserViewDatabase();
      dbs["editor"] = new BrowserEditorDatabase();
      dbs["inspector"] = new BrowserInspectorDatabase();
    }
    super(dbs);
  }

  send(json) {
    postMessage(json, undefined);
  }

}

export var responder: WebworkerRuntimeClient;

//---------------------------------------------------------------------
// Init a program
//---------------------------------------------------------------------

export function init(code, showIDE) {
  global["browser"] = true;

  responder = new WebworkerRuntimeClient(showIDE);
  responder.load(code || "", "user");
}

//---------------------------------------------------------------------
// Messages
//---------------------------------------------------------------------

export function onmessage(event) {
  let data = JSON.parse(event.data);
  if(typeof data !== "object") {
    console.error("WORKER: Unknown message: " + data);
    return;
  }

  if(data.type === "init") {
    eveSource.loadWorkspaces(data.workspaces);
    global["_workspaceCache"] = data.workspaceCache;
    init(data.code, data.showIDE);
  } else if(data.type !== undefined) {
    responder.handleEvent(event.data);
  } else {
    console.error("WORKER: Unknown message type: " + data.type);
  }
}
