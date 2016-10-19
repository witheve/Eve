//---------------------------------------------------------------------
// Browser
//---------------------------------------------------------------------

import {Evaluation, Database} from "./runtime";
import * as join from "./join";
import * as client from "../client";
import * as parser from "./parser";
import * as builder from "./builder";
import {ActionImplementations} from "./actions";
import {BrowserSessionDatabase, BrowserEventDatabase, BrowserViewDatabase, BrowserEditorDatabase, BrowserInspectorDatabase} from "./databases/browserSession";
import {HttpDatabase} from "./databases/http";
import * as system from "./databases/system";
import * as analyzer from "./analyzer";

let evaluation;

class Responder {
  socket: any;
  lastBuild: any;

  constructor(socket) {
    this.socket = socket;
  }

  send(json) {
    this.socket.onmessage({data: json});
  }

  sendErrors(errors) {
    if(!errors.length) return;
    let spans = [];
    let extraInfo = {};
    for(let error of errors) {
      error.injectSpan(spans, extraInfo);
    }
    this.send(JSON.stringify({type: "comments", spans, extraInfo}))
    return true;
  }

  handleEvent(json) {
    let data = JSON.parse(json);
    if(data.type === "event") {
      if(!evaluation) return;
      console.info("EVENT", json);
      let scopes = ["event"];
      let actions = [];
      for(let insert of data.insert) {
        actions.push(new ActionImplementations["+="](insert[0], insert[1], insert[2], "event", scopes));
      }
      evaluation.executeActions(actions);
    } else if(data.type === "close") {
      if(!evaluation) return;
      evaluation.close();
      evaluation = undefined;
    } else if(data.type === "parse") {
      join.nextId(0);
      let {results, errors} = parser.parseDoc(data.code || "", "editor");
      let {text, spans, extraInfo} = results;
      let build = builder.buildDoc(results);
      let {blocks, errors: buildErrors} = build;
      if(errors && errors.length) console.error(errors);
      this.lastBuild = build;
      for(let error of buildErrors) {
        error.injectSpan(spans, extraInfo);
      }
      this.send(JSON.stringify({type: "parse", generation: data.generation, text, spans, extraInfo}));
    } else if(data.type === "eval") {
      if(evaluation !== undefined && data.persist) {
        let changes = evaluation.createChanges();
        let session = evaluation.getDatabase("session");
        join.nextId(0);
        for(let block of session.blocks) {
          if(block.bindActions.length) {
            block.updateBinds({positions: {}, info: []}, changes);
          }
        }
        let {blocks, errors} = this.lastBuild;
        this.sendErrors(errors);
        for(let block of blocks) {
          if(block.singleRun) block.dormant = true;
        }
        session.blocks = blocks;
        evaluation.unregisterDatabase("session");
        evaluation.registerDatabase("session", session);
        changes.commit();
        evaluation.fixpoint(changes);
      } else {
        if(evaluation) evaluation.close();
        join.nextId(0);
        let {blocks, errors} = this.lastBuild;
        this.sendErrors(errors);
        // analyzer.analyze(results.blocks);
        let browser = new BrowserSessionDatabase(responder);
        let event = new BrowserEventDatabase();
        let view = new BrowserViewDatabase();
        let editor = new BrowserEditorDatabase();
        let inspector = new BrowserInspectorDatabase();
        let session = new Database();
        session.blocks = blocks;
        evaluation = new Evaluation();
        evaluation.registerDatabase("session", session);
        evaluation.registerDatabase("browser", browser);
        evaluation.registerDatabase("event", event);

        evaluation.registerDatabase("view", view);
        evaluation.registerDatabase("editor", editor);
        evaluation.registerDatabase("inspector", inspector);

        evaluation.registerDatabase("system", system.instance);
        evaluation.registerDatabase("http", new HttpDatabase());
        evaluation.fixpoint();

        client.socket.onopen();
      }
    } else if(data.type === "tokenInfo") {
      let spans = [];
      let extraInfo = {};
      analyzer.tokenInfo(evaluation, data.tokenId, spans, extraInfo)
      this.send(JSON.stringify({type: "comments", spans, extraInfo}))
    } else if(data.type === "analyzerQuery") {
      let parseBlocks = this.lastBuild.blocks.map((block) => block.parse);
      let spans = [];
      let extraInfo = {};
      analyzer.analyze(parseBlocks, spans, extraInfo);
      if(data.query === "nodeToRecord") {
        analyzer.nodeIdToRecord(data.nodeId);
      }
    }

  }
}

export var responder: Responder;

export function init(code) {
  responder = new Responder(client.socket);

  global["browser"] = true;
  let {results, errors} = parser.parseDoc(code || "", "editor");
  if(errors && errors.length) console.error(errors);
  let {text, spans, extraInfo} = results;
  responder.send(JSON.stringify({type: "parse", text, spans, extraInfo}));
  let build = builder.buildDoc(results);
  let {blocks, errors: buildErrors} = build;
  responder.lastBuild = results;
  console.log("BLOCKS", blocks);
  responder.sendErrors(buildErrors);
  // analyzer.analyze(results.blocks, spans, extraInfo);
  let browser = new BrowserSessionDatabase(responder);
  let event = new BrowserEventDatabase();
  let view = new BrowserViewDatabase();
  let editor = new BrowserEditorDatabase();
  let inspector = new BrowserInspectorDatabase();
  let session = new Database();
  session.blocks = blocks;
  evaluation = new Evaluation();
  evaluation.registerDatabase("session", session);
  evaluation.registerDatabase("browser", browser);
  evaluation.registerDatabase("event", event);

  evaluation.registerDatabase("view", view);
  evaluation.registerDatabase("editor", editor);
  evaluation.registerDatabase("inspector", inspector);

  evaluation.registerDatabase("system", system.instance);
  evaluation.registerDatabase("http", new HttpDatabase());
  evaluation.fixpoint();

  client.socket.onopen();
}
