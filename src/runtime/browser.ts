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

let evaluation;

export function handleEvent(json) {
  let data = JSON.parse(json);
  if(data.type === "event") {
    console.log("EVENT", json);
    let actions = [];
    for(let insert of data.insert) {
      actions.push(new ActionImplementations["+="](insert[0], insert[1], insert[2]));
    }
    evaluation.executeActions(actions);
  }
}

export function init(code) {
  let responder = {
    send: (json) => {
      client.socket.onmessage({data: json})
    }
  }

  global["browser"] = true;
  console.log("GOT CODE", code);
  let parsed = parser.parseDoc(code || "");
  console.log(parsed.errors);
  let {blocks} = builder.buildDoc(parsed.results);
  console.log(blocks);
  let session = new BrowserSessionDatabase(responder);
  session.blocks = blocks;
  evaluation = new Evaluation();
  evaluation.registerDatabase("session", session);
  evaluation.registerDatabase("system", system.instance);
  evaluation.registerDatabase("http", new HttpDatabase());
  evaluation.fixpoint();

  client.socket.onopen();
}
