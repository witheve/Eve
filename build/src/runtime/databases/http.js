//---------------------------------------------------------------------
// Http Database
//---------------------------------------------------------------------
"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var actions_1 = require("../actions");
var runtime_1 = require("../runtime");
var eavs = require("../util/eavs");
var HttpDatabase = (function (_super) {
    __extends(HttpDatabase, _super);
    function HttpDatabase() {
        _super.apply(this, arguments);
    }
    HttpDatabase.prototype.sendRequest = function (evaluation, requestId, request) {
        var _this = this;
        var oReq = new XMLHttpRequest();
        oReq.addEventListener("load", function () {
            var body = oReq.responseText;
            var scope = "http";
            var responseId = requestId + "|response";
            var changes = evaluation.createChanges();
            changes.store(scope, requestId, "response", responseId, _this.id);
            changes.store(scope, responseId, "tag", "response", _this.id);
            changes.store(scope, responseId, "body", body, _this.id);
            var contentType = oReq.getResponseHeader("content-type");
            if (contentType && contentType.indexOf("application/json") > -1 && body) {
                var id = eavs.fromJS(changes, JSON.parse(body), _this.id, scope, responseId + "|json");
                changes.store(scope, responseId, "json", id, _this.id);
            }
            evaluation.executeActions([], changes);
        });
        var method = "GET";
        if (request.method) {
            method = request.method[0];
        }
        if (request.headers) {
            var headers = this.index.asObject(request.headers[0]);
            for (var header in headers) {
                oReq.setRequestHeader(header, headers[header][0]);
            }
        }
        oReq.open(method, request.url[0]);
        if (request.body) {
            oReq.send(request.body[0]);
        }
        else if (request.json) {
            var object = this.index.asObject(request.json[0], true, true);
            oReq.setRequestHeader("Content-Type", "application/json");
            oReq.send(JSON.stringify(object));
        }
        else {
            oReq.send();
        }
    };
    HttpDatabase.prototype.onFixpoint = function (evaluation, changes) {
        var name = evaluation.databaseToName(this);
        var result = changes.result((_a = {}, _a[name] = true, _a));
        var handled = {};
        var index = this.index;
        var actions = [];
        for (var _i = 0, _b = result.insert; _i < _b.length; _i++) {
            var insert = _b[_i];
            var e = insert[0], a = insert[1], v = insert[2];
            if (!handled[e]) {
                handled[e] = true;
                if (index.lookup(e, "tag", "request") && !index.lookup(e, "tag", "sent")) {
                    var request = index.asObject(e);
                    if (request.url) {
                        actions.push(new actions_1.InsertAction("http|sender", e, "tag", "sent", undefined, [name]));
                        this.sendRequest(evaluation, e, request);
                    }
                }
            }
        }
        if (actions.length) {
            setTimeout(function () {
                // console.log("actions", actions);
                evaluation.executeActions(actions);
            });
        }
        var _a;
    };
    return HttpDatabase;
}(runtime_1.Database));
exports.HttpDatabase = HttpDatabase;
//# sourceMappingURL=http.js.map