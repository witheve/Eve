//---------------------------------------------------------------------
// Browser
//---------------------------------------------------------------------

import {Evaluation, Database} from "./runtime";
import * as join from "./join";
import {EveClient, client} from "../client";
import * as parser from "./parser";
import * as builder from "./builder";
import {ids} from "./id";
import {RuntimeClient} from "./runtimeClient";
import {HttpDatabase} from "./databases/http";
import {BrowserViewDatabase, BrowserEditorDatabase, BrowserInspectorDatabase} from "./databases/browserSession";

//---------------------------------------------------------------------
// Utils
//---------------------------------------------------------------------

// this makes me immensely sad...
function download(filename, text) {
  var element = document.createElement('a');
  element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
  element.setAttribute('download', filename);
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}

//---------------------------------------------------------------------
// Responder
//---------------------------------------------------------------------

class BrowserRuntimeClient extends RuntimeClient {
  client: EveClient;

  constructor(client:EveClient) {
    let dbs = {
      "http": new HttpDatabase()
    }
    if(client.showIDE) {
      dbs["view"] = new BrowserViewDatabase();
      dbs["editor"] = new BrowserEditorDatabase();
      dbs["inspector"] = new BrowserInspectorDatabase();
    }
    super(dbs);
    this.client = client;
  }

  send(json) {
    setTimeout(() => {
      this.client.onMessage({data: json});
    }, 0);
  }

}

export var responder: BrowserRuntimeClient;

//---------------------------------------------------------------------
// Init a program
//---------------------------------------------------------------------

export function init(code) {
  global["browser"] = true;

  responder = new BrowserRuntimeClient(client);
  responder.load(code || "", "user");

  global["evaluation"] = responder;

  global["save"] = () => {
    responder.handleEvent(JSON.stringify({type: "dumpState"}));
  }

  // client.socket.onopen();
  // responder.handleEvent(JSON.stringify({type: "findPerformance", requestId: 2}));
}
