//---------------------------------------------------------------------
// Browser Session Database
//---------------------------------------------------------------------

import * as parser from "../parser";
import * as builder from "../builder";
import {InsertAction, SetAction} from "../actions";
import {Changes} from "../changes";
import {Evaluation, Database} from "../runtime";

interface BrowserClient {
  send(json: string);
}

export class BrowserEventDatabase extends Database {
  constructor() {
    super();
    if(global["examples"]["event.eve"]) {
      let {results, errors} = parser.parseDoc(global["examples"]["event.eve"]);
      if(errors && errors.length) console.error("EVENT ERRORS", errors);
      let {blocks, errors: buildErrors} = builder.buildDoc(results);
      if(buildErrors && buildErrors.length) console.error("EVENT ERRORS", errors);
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
    this.client.send(JSON.stringify(result));
  }

  unregister(evaluation: Evaluation) {
    console.log("UNREGISTERING!");
    let ix = this.evaluations.indexOf(evaluation);
    if(ix > -1) {
      this.evaluations.splice(ix, 1);
    }
    console.log("evals", this.evaluations);
    if(this.evaluations.length === 0) {
      console.log("TRIPLES", this.index.toTriples());
      this.client.send(JSON.stringify({type: "result", insert: [], remove: this.index.toTriples()}))
    }
  }
}
