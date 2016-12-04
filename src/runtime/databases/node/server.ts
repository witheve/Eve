//---------------------------------------------------------------------
// Node Server Database
//---------------------------------------------------------------------

import {InsertAction} from "../../actions"
import {Changes} from "../../changes";
import {Evaluation, Database} from "../../runtime";
import * as request from "request";

export class ServerDatabase extends Database {

  handling: boolean;
  receiving: boolean;
  requestId: number;
  requestToResponse: any;

  constructor() {
    super();
    this.handling = false;
    this.requestId = 0;
    this.receiving = false;
    this.requestToResponse = {};
  }

  handleHttpRequest(request, response) {
    if(!this.receiving) return;

    let scopes = ["server"];
    let requestId = `request|${this.requestId++}|${(new Date()).getTime()}`
    this.requestToResponse[requestId] = response;
    let actions = [
      new InsertAction("server|tag", requestId, "tag", "request", undefined, scopes),
      new InsertAction("server|url", requestId, "url", request.url, undefined, scopes),
    ];
    if(request.headers) {
      let headerId = `${requestId}|body`;
      for(let key of Object.keys(request.headers)) {
        actions.push(new InsertAction("server|header", headerId, key, request.headers[key], undefined, scopes));
      }
      actions.push(new InsertAction("server|headers", requestId, "headers", headerId, undefined, scopes))
    }
    if(request.body) {
      let body = request.body;
      if(typeof body === "string") {
        // nothing we need to do
      } else {
        let bodyId = `${requestId}|body`;
        for(let key of Object.keys(body)) {
          actions.push(new InsertAction("server|request-body-entry", bodyId, key, body[key], undefined, scopes));
        }
        body = bodyId;
      }
      actions.push(new InsertAction("server|request-body", requestId, "body", body, undefined, scopes))
    }
    let evaluation = this.evaluations[0];
    evaluation.executeActions(actions);
  }

  analyze(evaluation: Evaluation, db: Database) {
    for(let block of db.blocks) {
      for(let scan of block.parse.scanLike) {
        if(scan.type === "record" && scan.scopes.indexOf("server") > -1) {
          for(let attribute of scan.attributes) {
            if(attribute.attribute === "tag" && attribute.value.value === "request") {
              this.receiving = true;
            }
          }
        }
      }
    }
  }

  sendResponse(evaluation, requestId, status, body) {
    let response = this.requestToResponse[requestId];
    response.statusCode = status;
    response.end(body);
  }

  onFixpoint(evaluation: Evaluation, changes: Changes) {
    let name = evaluation.databaseToName(this);
    let result = changes.result({[name]: true});
    let handled = {};
    let index = this.index;
    let actions = [];
    for(let insert of result.insert) {
      let [e,a,v] = insert;
      if(!handled[e]) {
        handled[e] = true;
        if(index.lookup(e,"tag", "request") && !index.lookup(e, "tag", "sent")) {
          let responses = index.asValues(e, "response");
          if(responses || index.lookup(e, "tag", "handling")) this.handling = true;
          if(responses === undefined) continue;
          let [response] = responses;
          let {status, body} = index.asObject(response);
          actions.push(new InsertAction("server|sender", e, "tag", "sent", undefined, [name]));
          this.sendResponse(evaluation, e, status[0], body[0]);
        }
      }
    }
    if(actions.length) {
      process.nextTick(() => {
        evaluation.executeActions(actions);
        // because this database is created per http request, we need to destroy this
        // evaluation once a response has been sent and we've dealt with any consequences
        // of the send.
        evaluation.close();
      })
    }
  }
}


