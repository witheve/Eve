//---------------------------------------------------------------------
// Node HTTP Database
//---------------------------------------------------------------------

import {InsertAction} from "../../actions"
import {Changes} from "../../changes";
import {Evaluation, Database} from "../../runtime";
import * as eavs from "../../util/eavs";
import * as httpRequest from "request";

export class HttpDatabase extends Database {

  sendRequest(evaluation, requestId, request) {
    let options: any = {url: request.url[0], headers: {}};
    if(request.headers) {
      let headers = this.index.asObject(request.headers[0]);
      for(let header in headers) {
        options.headers[header] = headers[header];
      }
    }
    if(request.method) {
      options.method = request.method[0];
    }
    if(request.json) {
      let object = this.index.asObject(request.json[0], true, true);
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(object);
    }
    if(request.body) {
      options.body = request.body[0];
    }
    httpRequest(options, (error, response, body) => {
      // console.log("GOT RESPONSE", response.statusCode);
      // console.log(error);
      // console.log(response);
      // console.log(body);
      let scope = "http";
      let responseId = `${requestId}|response`;
      let changes = evaluation.createChanges();
      changes.store(scope, requestId, "response", responseId, this.id);
      changes.store(scope, responseId, "tag", "response", this.id);
      if(response.headers["content-type"].indexOf("application/json") > -1) {
        let id = eavs.fromJS(changes, JSON.parse(body), this.id, scope, `${responseId}|json`);
        changes.store(scope, responseId, "json", id, this.id);
      }
      changes.store(scope, responseId, "body", body, this.id);
      evaluation.executeActions([], changes);
    })
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
          let request = index.asObject(e);
          if(request.url) {
            actions.push(new InsertAction(e, "tag", "sent", undefined, [name]));
            this.sendRequest(evaluation, e, request);
          }
        }
      }
    }
    if(actions.length) {
      process.nextTick(() => {
        evaluation.executeActions(actions);
      })
    }
  }
}

