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
import {ids} from "./id";

// we'll use this global to store the currently running eve evaluation
let evaluation;

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
// Make evaluation
//---------------------------------------------------------------------

function makeEvaluation(parse, spans, extraInfo) {
  if(evaluation) {
    evaluation.close();
    evaluation = undefined;
  }
  let build = builder.buildDoc(parse);
  let {blocks, errors} = build;
  console.log("PROGRAM BLOCKS", blocks);
  responder.sendErrors(errors);
  analyzer.analyze(blocks.map((block) => block.parse), spans, extraInfo);
  let browser = new BrowserSessionDatabase(responder);
  let event = new BrowserEventDatabase();
  let view = new BrowserViewDatabase();
  let editor = new BrowserEditorDatabase();
  let inspector = new BrowserInspectorDatabase();
  let session = new Database();
  session.blocks = blocks;
  let ev = new Evaluation();
  ev.registerDatabase("session", session);
  ev.registerDatabase("browser", browser);
  ev.registerDatabase("event", event);

  ev.registerDatabase("view", view);
  ev.registerDatabase("editor", editor);
  ev.registerDatabase("inspector", inspector);

  ev.registerDatabase("system", system.instance);
  ev.registerDatabase("http", new HttpDatabase());
  return ev;
}

//---------------------------------------------------------------------
// Responder
//---------------------------------------------------------------------

class Responder {
  socket: any;
  lastParse: any;

  constructor(socket) {
    this.socket = socket;
  }

  send(json) {
    setTimeout(() => {
      this.socket.onmessage({data: json});
    }, 0);
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
        let e = insert[0].substring(1);
        actions.push(new ActionImplementations["+="]("event", e, insert[1], insert[2], "event", scopes));
      }
      evaluation.executeActions(actions);
    } else if(data.type === "close") {
      if(!evaluation) return;
      evaluation.close();
      evaluation = undefined;
    } else if(data.type === "parse") {
      let {results, errors}: {results: any, errors: any[]} = parser.parseDoc(data.code || "", "user");
      let {text, spans, extraInfo} = results;
      let build = builder.buildDoc(results);
      let {blocks, errors: buildErrors} = build;
      results.code = data.code;
      this.lastParse = results;
      for(let error of buildErrors) {
        error.injectSpan(spans, extraInfo);
      }
      this.send(JSON.stringify({type: "parse", generation: data.generation, text, spans, extraInfo}));
    } else if(data.type === "eval") {
      if(evaluation !== undefined && data.persist) {
        let changes = evaluation.createChanges();
        let session = evaluation.getDatabase("session");
        for(let block of session.blocks) {
          if(block.bindActions.length) {
            block.updateBinds({positions: {}, info: []}, changes);
          }
        }
        let build = builder.buildDoc(this.lastParse);
        let {blocks, errors} = build;
        let spans = [];
        let extraInfo = {};
        analyzer.analyze(blocks.map((block) => block.parse), spans, extraInfo);
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
        let spans = [];
        let extraInfo = {};
        evaluation = makeEvaluation(this.lastParse, spans, extraInfo);
        evaluation.fixpoint();
        client.socket.onopen();
      }
    } else if(data.type === "tokenInfo") {
      let spans = [];
      let extraInfo = {};
      analyzer.tokenInfo(evaluation, data.tokenId, spans, extraInfo)
      this.send(JSON.stringify({type: "comments", spans, extraInfo}))
    } else if(data.type === "findNode") {
      let {recordId, node} = data;
      let spans = [];
      let extraInfo = {};
      let spanId = analyzer.nodeIdToRecord(evaluation, data.node, spans, extraInfo);
      this.send(JSON.stringify({type: "findNode", recordId, spanId}));
    } else if(data.type === "findSource") {
      let spans = [];
      let extraInfo = {};
      let spanId = analyzer.findSource(evaluation, data, spans, extraInfo);
      this.send(JSON.stringify(data));
    } else if(data.type === "findRelated") {
      let spans = [];
      let extraInfo = {};
      let spanId = analyzer.findRelated(evaluation, data, spans, extraInfo);
      this.send(JSON.stringify(data));
    } else if(data.type === "findValue") {
      let spans = [];
      let extraInfo = {};
      let spanId = analyzer.findValue(evaluation, data, spans, extraInfo);
      this.send(JSON.stringify(data));
    } else if(data.type === "findCardinality") {
      let spans = [];
      let extraInfo = {};
      let spanId = analyzer.findCardinality(evaluation, data, spans, extraInfo);
      this.send(JSON.stringify(data));
    } else if(data.type === "findAffector") {
      let spans = [];
      let extraInfo = {};
      let spanId = analyzer.findAffector(evaluation, data, spans, extraInfo);
      this.send(JSON.stringify(data));
    } else if(data.type === "findFailure") {
      let spans = [];
      let extraInfo = {};
      let spanId = analyzer.findFailure(evaluation, data, spans, extraInfo);
      this.send(JSON.stringify(data));
    } else if(data.type === "findRootDrawers") {
      let spans = [];
      let extraInfo = {};
      let spanId = analyzer.findRootDrawers(evaluation, data, spans, extraInfo);
      this.send(JSON.stringify(data));
    } else if(data.type === "findMaybeDrawers") {
      let spans = [];
      let extraInfo = {};
      let spanId = analyzer.findMaybeDrawers(evaluation, data, spans, extraInfo);
      this.send(JSON.stringify(data));
    } else if(data.type === "findPerformance") {
      let perf = evaluation.perf;
      let userBlocks = {};
      for(let block of evaluation.getDatabase("session").blocks) {
        userBlocks[block.id] = true;
      }
      let perfInfo = perf.asObject(userBlocks);
      perfInfo.type = "findPerformance";
      perfInfo.requestId = data.requestId;
      this.send(JSON.stringify(perfInfo));
    } else if(data.type === "findRecordsFromToken") {
      let spans = [];
      let extraInfo = {};
      let spanId = analyzer.findRecordsFromToken(evaluation, data, spans, extraInfo);
      this.send(JSON.stringify(data));
    } else if(data.type === "save") {
      let dbs = evaluation.save();
      let code = this.lastParse.code;
      let output = JSON.stringify({code, databases: {"session": dbs.session}});
      download("dump.evestate", output);
    } else if(data.type === "load") {
      let spans = [];
      let extraInfo = {};
      console.log("GOT LOAD", data);
      evaluation = makeEvaluation(this.lastParse, spans, extraInfo);
      let blocks = evaluation.getDatabase("session").blocks;
      for(let block of blocks) {
        if(block.singleRun) {
          block.dormant = true;
        }
      }
      evaluation.load(data.info.databases);
    }
  }
}

export var responder: Responder;

//---------------------------------------------------------------------
// Init a program
//---------------------------------------------------------------------

export function init(code) {
  global["browser"] = true;

  responder = new Responder(client.socket);

  let {results, errors} : {results: any, errors: any[]} = parser.parseDoc(code || "", "user");
  if(errors && errors.length) console.error(errors);
  let {text, spans, extraInfo} = results;
  results.code = code;
  responder.lastParse = results;
  responder.send(JSON.stringify({type: "parse", text, spans, extraInfo}));

  evaluation = makeEvaluation(results, spans, extraInfo);
  evaluation.fixpoint();

  global["evaluation"] = evaluation;

  evaluation.errorReporter = (kind, error) => {
    responder.send(JSON.stringify({type: "error", kind, message: error}));
  }

  global["save"] = () => {
    responder.handleEvent(JSON.stringify({type: "save"}));
  }

  client.socket.onopen();
  responder.handleEvent(JSON.stringify({type: "findPerformance", requestId: 2}));
}
