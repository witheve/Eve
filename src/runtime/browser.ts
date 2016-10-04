//---------------------------------------------------------------------
// Browser
//---------------------------------------------------------------------

import {Evaluation, Database} from "./runtime";
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
  lastParse: any;

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
      join.nextId(0);
      let {results, errors} = parser.parseDoc(data.code || "", "editor");
      // analyzer.analyze(results.blocks);
      if(errors && errors.length) console.error(errors);
      this.lastParse = results;
      let {text, spans, extraInfo} = results;
      this.send(JSON.stringify({type: "parse", text, spans, extraInfo}));
    } else if(data.type === "eval") {
      let changes = evaluation.createChanges();
      let session = evaluation.getDatabase("session");
      join.nextId(0);
      for(let block of session.blocks) {
        if(block.bindActions.length) {
          block.updateBinds({positions: {}, info: []}, changes);
        }
      }
      if(data.persist) {
        let {blocks} = builder.buildDoc(this.lastParse);
        for(let block of blocks) {
          if(block.singleRun) block.dormant = true;
        }
        session.blocks = blocks;
      } else {
        let session = new Database();
        let {blocks} = builder.buildDoc(this.lastParse);
        session.blocks = blocks;
        evaluation.unregisterDatabase("session");
        evaluation.registerDatabase("session", session);
      }
      evaluation.executeActions([], changes);
      evaluation.fixpoint();
    }
  }
}

export var responder: Responder;

export function init(code) {
  responder = new Responder(client.socket);

  global["browser"] = true;
  let {results, errors} = parser.parseDoc(code || "", "editor");
  if(errors && errors.length) console.error(errors);
  responder.lastParse = results;
  let {text, spans, extraInfo} = results;
  responder.send(JSON.stringify({type: "parse", text, spans, extraInfo}));
  let {blocks} = builder.buildDoc(results);
  // analyzer.analyze(results.blocks);
  let browser = new BrowserSessionDatabase(responder);
  let session = new Database();
  session.blocks = blocks;
  evaluation = new Evaluation();
  evaluation.registerDatabase("session", session);
  evaluation.registerDatabase("browser", browser);
  evaluation.registerDatabase("system", system.instance);
  evaluation.registerDatabase("http", new HttpDatabase());
  evaluation.fixpoint();

  client.socket.onopen();
}
