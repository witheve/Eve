//---------------------------------------------------------------------
// Node Server Database
//---------------------------------------------------------------------
"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var actions_1 = require("../../actions");
var runtime_1 = require("../../runtime");
var ServerDatabase = (function (_super) {
    __extends(ServerDatabase, _super);
    function ServerDatabase() {
        _super.call(this);
        this.requestId = 0;
        this.receiving = false;
        this.requestToResponse = {};
    }
    ServerDatabase.prototype.handleHttpRequest = function (request, response) {
        if (!this.receiving) {
            // we need to 404
            response.writeHead(404, { "Content-Type": "text/plain" });
            return response.end("sad");
        }
        var scopes = ["server"];
        var requestId = "request|" + this.requestId++ + "|" + (new Date()).getTime();
        this.requestToResponse[requestId] = response;
        var actions = [
            new actions_1.InsertAction("server|tag", requestId, "tag", "request", undefined, scopes),
            new actions_1.InsertAction("server|url", requestId, "url", request.url, undefined, scopes),
        ];
        if (request.headers) {
            var headerId = requestId + "|body";
            for (var _i = 0, _a = Object.keys(request.headers); _i < _a.length; _i++) {
                var key = _a[_i];
                actions.push(new actions_1.InsertAction("server|header", headerId, key, request.headers[key], undefined, scopes));
            }
            actions.push(new actions_1.InsertAction("server|headers", requestId, "headers", headerId, undefined, scopes));
        }
        if (request.body) {
            var body = request.body;
            if (typeof body === "string") {
            }
            else {
                var bodyId = requestId + "|body";
                for (var _b = 0, _c = Object.keys(body); _b < _c.length; _b++) {
                    var key = _c[_b];
                    actions.push(new actions_1.InsertAction("server|request-body-entry", bodyId, key, body[key], undefined, scopes));
                }
                body = bodyId;
            }
            actions.push(new actions_1.InsertAction("server|request-body", requestId, "body", body, undefined, scopes));
        }
        var evaluation = this.evaluations[0];
        evaluation.executeActions(actions);
    };
    ServerDatabase.prototype.analyze = function (evaluation, db) {
        for (var _i = 0, _a = db.blocks; _i < _a.length; _i++) {
            var block = _a[_i];
            for (var _b = 0, _c = block.parse.scanLike; _b < _c.length; _b++) {
                var scan = _c[_b];
                if (scan.type === "record" && scan.scopes.indexOf("server") > -1) {
                    for (var _d = 0, _e = scan.attributes; _d < _e.length; _d++) {
                        var attribute = _e[_d];
                        if (attribute.attribute === "tag" && attribute.value.value === "request") {
                            this.receiving = true;
                        }
                    }
                }
            }
        }
    };
    ServerDatabase.prototype.sendResponse = function (requestId, status, body) {
        var response = this.requestToResponse[requestId];
        response.statusCode = status;
        response.end(body);
    };
    ServerDatabase.prototype.onFixpoint = function (evaluation, changes) {
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
                    var responses = index.asValues(e, "response");
                    if (responses === undefined)
                        continue;
                    var response = responses[0];
                    var _c = index.asObject(response), status_1 = _c.status, body = _c.body;
                    actions.push(new actions_1.InsertAction("server|sender", e, "tag", "sent", undefined, [name]));
                    this.sendResponse(e, status_1[0], body[0]);
                }
            }
        }
        if (actions.length) {
            process.nextTick(function () {
                evaluation.executeActions(actions);
            });
        }
        var _a;
    };
    return ServerDatabase;
}(runtime_1.Database));
exports.ServerDatabase = ServerDatabase;
//# sourceMappingURL=server.js.map