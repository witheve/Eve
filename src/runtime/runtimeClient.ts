//---------------------------------------------------------------------
// RuntimeClient
//---------------------------------------------------------------------

import {Evaluation, Database} from "./runtime";
import * as join from "./join";
import * as parser from "./parser";
import * as builder from "./builder";
import {ActionImplementations} from "./actions";
import {BrowserSessionDatabase, BrowserEventDatabase, BrowserViewDatabase, BrowserEditorDatabase, BrowserInspectorDatabase} from "./databases/browserSession";
import * as system from "./databases/system";
import * as analyzer from "./analyzer";
import {ids} from "./id";

//---------------------------------------------------------------------
// Responder
//---------------------------------------------------------------------

export abstract class RuntimeClient {
  lastParse: any;
  evaluation: Evaluation;
  extraDBs: any;

  constructor(extraDBs:any = {}) {
    this.extraDBs = extraDBs;
  }

  abstract send(json): void;

  load(code:string, context:string) {
    code = code || "";
    let {results, errors} : {results: any, errors: any[]} = parser.parseDoc(code, context);
    if(errors && errors.length) console.error(errors);
    results.code = code;
    this.lastParse = results;
    this.makeEvaluation();
    this.evaluation.fixpoint();
  }

  makeEvaluation() {
    if(this.evaluation) {
      this.evaluation.close();
      this.evaluation = undefined;
    }
    let parse = this.lastParse;
    let build = builder.buildDoc(parse);
    let {blocks, errors} = build;
    this.sendErrors(errors);
    // TODO: What is the right way to gate analysis? This seems hacky, but I'm not sure
    // that the RuntimeClient should really know/care about whether or not the editor is
    // hooked up. Maybe there should be a flag for analysis instead?
    if(this.extraDBs["editor"]) {
      analyzer.analyze(blocks.map((block) => block.parse), parse.spans, parse.extraInfo);
    }

    let ev = new Evaluation();
    let session = new Database();
    session.blocks = blocks;
    ev.registerDatabase("session", session);

    let extraDBs = this.extraDBs;
    if(!extraDBs["browser"]) {
      ev.registerDatabase("browser", new BrowserSessionDatabase(this));
    }
    if(!extraDBs["event"]) {
      ev.registerDatabase("event", new BrowserEventDatabase());
    }

    if(!extraDBs["system"]) {
      ev.registerDatabase("system", system.instance);
    }

    for(let dbName of Object.keys(this.extraDBs)) {
      let db = extraDBs[dbName];
      ev.registerDatabase(dbName, db);
    }

    ev.errorReporter = (kind, error) => {
      this.send(JSON.stringify({type: "error", kind, message: error}));
    }

    this.evaluation = ev;

    return ev;
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

  enabledCss() {
      var css = "";
      this.lastParse.code.replace(/(?:```|~~~)css\n([\w\W]*?)\n(?:```|~~~)/g, (g0, g1) => { // \n excludes disabled blocks
        css += g1;
      });

      // remove whitespace before open braces, and add a newline after open brace
      css = css.replace(/\s*{\s*/g, " {\n");

      css = css.split("\n").map(function(line) {
        var trimmedLine = line.trim();
        if ((line.indexOf("{") !== -1) && (trimmedLine[0] !== "@") && (["from", "to"].indexOf(trimmedLine.split(" ")[0]) === -1)) {
          return trimmedLine.split(",").map(function(section) {
            return ".application-container > .program " + section;
          }).join(", ");
        }

        return trimmedLine;
      }).join("\n");

      return css;
  }

  handleEvent(json:string) {
    let data = JSON.parse(json);

    // Events are expected to be objects that have a type property
    // if they aren't, we toss the event out
    if(typeof data !== "object" || data.type === undefined) {
      console.error("Got invalid JSON event: " + json);
      return;
    }

    if(data.type === "event") {
      if(!this.evaluation) return;
      // console.info("EVENT", json);
      let scopes = ["event"];
      let actions = [];
      for(let insert of data.insert) {
        let [e, a, v] = insert;
        // @TODO: this is a hack to deal with external ids. We should really generate
        // a local id for them
        if(e[0] === "⍦") e = ids.get([e]);
        if(v[0] === "⍦") v = ids.get([v]);
        actions.push(new ActionImplementations["+="]("event", e, a, v, "event", scopes));
      }
      this.evaluation.executeActions(actions);
    } else if(data.type === "close") {
      if(!this.evaluation) return;
      this.evaluation.close();
      this.evaluation = undefined;
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
      this.send(JSON.stringify({type: "parse", generation: data.generation, text, spans, extraInfo, css: this.enabledCss()}));
    } else if(data.type === "eval") {
      if(this.evaluation !== undefined && data.persist) {
        let changes = this.evaluation.createChanges();
        let session = this.evaluation.getDatabase("session");
        for(let block of session.blocks) {
          if(block.bindActions.length) {
            block.updateBinds({positions: {}, info: []}, changes);
          }
        }
        let build = builder.buildDoc(this.lastParse);
        let {blocks, errors} = build;
        let spans = [];
        let extraInfo = {};
        if(this.extraDBs["editor"]) {
          analyzer.analyze(blocks.map((block) => block.parse), spans, extraInfo);
        }
        this.sendErrors(errors);
        for(let block of blocks) {
          if(block.singleRun) block.dormant = true;
        }
        session.blocks = blocks;
        this.evaluation.unregisterDatabase("session");
        this.evaluation.registerDatabase("session", session);
        changes.commit();
        this.evaluation.fixpoint(changes);
      } else {
        let spans = [];
        let extraInfo = {};
        this.makeEvaluation();
        this.evaluation.fixpoint();
      }
    } else if(data.type === "tokenInfo") {
      let spans = [];
      let extraInfo = {};
      analyzer.tokenInfo(this.evaluation, data.tokenId, spans, extraInfo)
      this.send(JSON.stringify({type: "comments", spans, extraInfo}))
    } else if(data.type === "findNode") {
      let {recordId, node} = data;
      let spans = [];
      let extraInfo = {};
      let spanId = analyzer.nodeIdToRecord(this.evaluation, data.node, spans, extraInfo);
      this.send(JSON.stringify({type: "findNode", recordId, spanId}));
    } else if(data.type === "findSource") {
      let spans = [];
      let extraInfo = {};
      let spanId = analyzer.findSource(this.evaluation, data, spans, extraInfo);
      this.send(JSON.stringify(data));
    } else if(data.type === "findRelated") {
      let spans = [];
      let extraInfo = {};
      let spanId = analyzer.findRelated(this.evaluation, data, spans, extraInfo);
      this.send(JSON.stringify(data));
    } else if(data.type === "findValue") {
      let spans = [];
      let extraInfo = {};
      let spanId = analyzer.findValue(this.evaluation, data, spans, extraInfo);
      this.send(JSON.stringify(data));
    } else if(data.type === "findCardinality") {
      let spans = [];
      let extraInfo = {};
      let spanId = analyzer.findCardinality(this.evaluation, data, spans, extraInfo);
      this.send(JSON.stringify(data));
    } else if(data.type === "findAffector") {
      let spans = [];
      let extraInfo = {};
      let spanId = analyzer.findAffector(this.evaluation, data, spans, extraInfo);
      this.send(JSON.stringify(data));
    } else if(data.type === "findFailure") {
      let spans = [];
      let extraInfo = {};
      let spanId = analyzer.findFailure(this.evaluation, data, spans, extraInfo);
      this.send(JSON.stringify(data));
    } else if(data.type === "findRootDrawers") {
      let spans = [];
      let extraInfo = {};
      let spanId = analyzer.findRootDrawers(this.evaluation, data, spans, extraInfo);
      this.send(JSON.stringify(data));
    } else if(data.type === "findMaybeDrawers") {
      let spans = [];
      let extraInfo = {};
      let spanId = analyzer.findMaybeDrawers(this.evaluation, data, spans, extraInfo);
      this.send(JSON.stringify(data));
    } else if(data.type === "findPerformance") {
      let perf = this.evaluation.perf;
      let userBlocks = {};
      for(let block of this.evaluation.getDatabase("session").blocks) {
        userBlocks[block.id] = true;
      }
      let perfInfo = perf.asObject(userBlocks) as any;
      perfInfo.type = "findPerformance";
      perfInfo.requestId = data.requestId;
      this.send(JSON.stringify(perfInfo));
    } else if(data.type === "findRecordsFromToken") {
      let spans = [];
      let extraInfo = {};
      let spanId = analyzer.findRecordsFromToken(this.evaluation, data, spans, extraInfo);
      this.send(JSON.stringify(data));
    } else if(data.type === "dumpState") {
      let dbs = this.evaluation.save() as any;
      let code = this.lastParse.code;
      let output = JSON.stringify({code, databases: {"session": dbs.session}});
      this.send(JSON.stringify({type: "dumpState", state: output}));
    } else if(data.type === "load") {
      let spans = [];
      let extraInfo = {};
      this.makeEvaluation();
      let blocks = this.evaluation.getDatabase("session").blocks;
      for(let block of blocks) {
        if(block.singleRun) {
          block.dormant = true;
        }
      }
      this.evaluation.load(data.info.databases);
    } else {
      console.error("Unhandled message type: " + json);
    }
  }
}
