//---------------------------------------------------------------------
// Http Database
//---------------------------------------------------------------------

import {InsertAction} from "../actions"
import {Changes} from "../changes";
import {Evaluation, Database} from "../runtime";
import * as eavs from "../util/eavs";

export class HttpDatabase extends Database {

  sendRequest(evaluation, requestId, request) {
    var oReq = new XMLHttpRequest();
    oReq.addEventListener("load", () => {
      let body = oReq.responseText;
      let scope = "http";
      let responseId = `${requestId}|response`;
      let changes = evaluation.createChanges();
      changes.store(scope, requestId, "response", responseId, this.id);
      changes.store(scope, responseId, "tag", "response", this.id);
      changes.store(scope, responseId, "body", body, this.id);
      let contentType = oReq.getResponseHeader("content-type");
      if(contentType && contentType.indexOf("application/json") > -1) {
        let id = eavs.fromJS(changes, JSON.parse(body), this.id, scope, `${responseId}|json`);
        changes.store(scope, responseId, "json", id, this.id);
      }
      evaluation.executeActions([], changes);
    });
    let method = "GET";
    if(request.method) {
      method = request.method[0];
    }
    if(request.headers) {
      let headers = this.index.asObject(request.headers[0]);
      for(let header in headers) {
        oReq.setRequestHeader(header, headers[header][0]);
      }
    }

    oReq.open(method, request.url[0]);

    if(request.body) {
      oReq.send(request.body[0]);
    } else if(request.json) {
      let object = this.index.asObject(request.json[0], true, true);
      oReq.setRequestHeader("Content-Type", "application/json");
      oReq.send(JSON.stringify(object));
    } else {
      oReq.send();
    }
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
            actions.push(new InsertAction("http|sender", e, "tag", "sent", undefined, [name]));
            this.sendRequest(evaluation, e, request);
          }
        }
      }
    }
    if(actions.length) {
      setTimeout(() => {
        // console.log("actions", actions);
        evaluation.executeActions(actions);
      })
    }
  }
}
