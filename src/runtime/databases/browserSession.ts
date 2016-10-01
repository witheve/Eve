//---------------------------------------------------------------------
// Browser Session Database
//---------------------------------------------------------------------

import {InsertAction, SetAction} from "../actions";
import {Changes} from "../changes";
import {Evaluation, Database} from "../runtime";

interface BrowserClient {
  send(json: string);
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

}
