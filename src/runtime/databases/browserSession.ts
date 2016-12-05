//---------------------------------------------------------------------
// Browser Session Database
//---------------------------------------------------------------------

import * as parser from "../parser";
import * as builder from "../builder";
import {InsertAction, SetAction} from "../actions";
import {Changes} from "../changes";
import {Evaluation, Database} from "../runtime";
import * as eveSource from "../eveSource";

interface BrowserClient {
  send(json: string);
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
