//---------------------------------------------------------------------
// Browser
//---------------------------------------------------------------------

import {Evaluation} from "./runtime";
import * as join from "./join";
import * as client from "../client";
import * as parser from "./parser";
import * as builder from "./builder";
import {ActionImplementations} from "./actions";
import {BrowserSessionDatabase} from "./databases/browserSession";
import {HttpDatabase} from "./databases/http";
import * as system from "./databases/system";
import * as analyzer from "./analyzer";

let evaluation;

class Responder {
  socket: any;

  constructor(socket) {
    this.socket = socket;
  }

  send(json) {
    this.socket.onmessage({data: json});
  }

  handleEvent(json) {
    let data = JSON.parse(json);
    if(data.type === "event") {
      console.info("EVENT", json);
      let actions = [];
      for(let insert of data.insert) {
        actions.push(new ActionImplementations["+="](insert[0], insert[1], insert[2]));
      }
      evaluation.executeActions(actions);
    } else if(data.type === "parse") {
      let {results, errors} = parser.parseDoc(data.code || "");
      console.error(errors);
      let {text, spans, extraInfo} = results;
      this.send(JSON.stringify({type: "parse", text, spans, extraInfo}));
    }
  }
}

export var responder: Responder;

export function init(code) {
  responder = new Responder(client.socket);

  global["browser"] = true;
  let {results, errors} = parser.parseDoc(code || "");
  console.error(errors);
  let {text, spans, extraInfo} = results;
  responder.send(JSON.stringify({type: "parse", text, spans, extraInfo}));
  let {blocks} = builder.buildDoc(results);
  // analyzer.analyze(results.blocks);
  let session = new BrowserSessionDatabase(responder);
  session.blocks = blocks;
  evaluation = new Evaluation();
  evaluation.registerDatabase("session", session);
  evaluation.registerDatabase("system", system.instance);
  evaluation.registerDatabase("http", new HttpDatabase());
  evaluation.fixpoint();

  client.socket.onopen();
}
