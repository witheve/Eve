//---------------------------------------------------------------------
// Browser Session Database
//---------------------------------------------------------------------

import * as parser from "../parser";
import * as builder from "../builder";
import {InsertAction, SetAction} from "../actions";
import {Changes} from "../changes";
import {Evaluation, Database} from "../runtime";
import {NoopTripleIndex} from "../indexes";
import * as eveSource from "../eveSource";
import {ids} from "../id";

interface BrowserClient {
  send(json: string);
}

// because of the browser/server divide I have to make an
// interface that captures the parts of EveClient that are going to be
// used here. If we tried to import client.ts, we'd end up with a bunch
// of errors on the Server because it relies on browser provided objects
// like window.
interface EveClient {
  socketSend(json: string)
}

export class BrowserEventDatabase extends Database {
  constructor() {
    super();
    let source = eveSource.get("event.eve");
    if(source) {
      let {results, errors} = parser.parseDoc(source, "event");
      if(errors && errors.length) console.error("EVENT ERRORS", errors);
      let {blocks, errors: buildErrors} = builder.buildDoc(results);
      if(buildErrors && buildErrors.length) console.error("EVENT ERRORS", buildErrors);
      this.blocks = blocks;
    }
  }
}

export class BrowserViewDatabase extends Database {
  constructor() {
    super();
    let source = eveSource.get("view.eve");
    if(source) {
      let {results, errors} = parser.parseDoc(source, "view");
      if(errors && errors.length) console.error("View DB Errors", errors);
      let {blocks, errors: buildErrors} = builder.buildDoc(results);
      if(buildErrors && buildErrors.length) console.error("View DB Errors", buildErrors);
      this.blocks = blocks;
    }
  }
}

export class BrowserEditorDatabase extends Database {
  constructor() {
    super();
    let source = eveSource.get("editor.eve");
    if(source) {
      let {results, errors} = parser.parseDoc(source, "editor");
      if(errors && errors.length) console.error("Editor DB Errors", errors);
      let {blocks, errors: buildErrors} = builder.buildDoc(results);
      if(buildErrors && buildErrors.length) console.error("Editor DB Errors", buildErrors);
      this.blocks = blocks;
    }
  }
}

export class BrowserInspectorDatabase extends Database {
  constructor() {
    super();
    let source = eveSource.get("inspector.eve");
    if(source) {
      let {results, errors} = parser.parseDoc(source, "inspector");
      if(errors && errors.length) console.error("Inspector DB Errors", errors);
      let {blocks, errors: buildErrors} = builder.buildDoc(results);
      if(buildErrors && buildErrors.length) console.error("Inspector DB Errors", buildErrors);
      this.blocks = blocks;
    }
  }
}

export class BrowserServerDatabase extends Database {
  client: EveClient;
  constructor(client: EveClient) {
    super();
    this.client = client;
    // Since we're using this solely as a pipe between the client and server
    // at the moment, we don't want this database to be readable on the client
    this.index = new NoopTripleIndex(0);
  }

  onFixpoint(evaluation: Evaluation, changes: Changes) {
    super.onFixpoint(evaluation, changes);
    let name = evaluation.databaseToName(this);
    let result = changes.result({[name]: true}, true);
    if(result.insert.length || result.remove.length) {
      result["database"] = name;
      // since this is crossing the wire, we need to translate ids back
      // into their full form instead of our internal representation
      for(let insert of result.insert) {
        let [e, a, v] = insert;
        if(ids.isId(e)) insert[0] = ids.parts(e);
        if(ids.isId(v)) insert[2] = ids.parts(v);
      }
      for(let remove of result.remove) {
        let [e, a, v] = remove;
        if(ids.isId(e)) remove[0] = ids.parts(e);
        if(ids.isId(v)) remove[2] = ids.parts(v);
      }
      this.client.socketSend(JSON.stringify(result))
    }
  }
}

export class BrowserSessionDatabase extends Database {
  client: BrowserClient;

  constructor(client: BrowserClient) {
    super();
    this.client = client;
  }

  onFixpoint(evaluation: Evaluation, changes: Changes) {
    super.onFixpoint(evaluation, changes);
    let name = evaluation.databaseToName(this);
    let result = changes.result({[name]: true});
    if(result.insert.length || result.remove.length) {
      this.client.send(JSON.stringify(result));
    }
  }

  unregister(evaluation: Evaluation) {
    let ix = this.evaluations.indexOf(evaluation);
    if(ix > -1) {
      this.evaluations.splice(ix, 1);
    }
    if(this.evaluations.length === 0) {
      this.client.send(JSON.stringify({type: "result", insert: [], remove: this.index.toTriples()}))
    }
  }
}
