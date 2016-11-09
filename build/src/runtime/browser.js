//---------------------------------------------------------------------
// Browser
//---------------------------------------------------------------------
"use strict";
var runtime_1 = require("./runtime");
var client = require("../client");
var parser = require("./parser");
var builder = require("./builder");
var actions_1 = require("./actions");
var browserSession_1 = require("./databases/browserSession");
var http_1 = require("./databases/http");
var system = require("./databases/system");
var analyzer = require("./analyzer");
var id_1 = require("./id");
// we'll use this global to store the currently running eve evaluation
var evaluation;
//---------------------------------------------------------------------
// Utils
//---------------------------------------------------------------------
// this makes me immensely sad...
function download(filename, text) {
    var element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}
//---------------------------------------------------------------------
// Make evaluation
//---------------------------------------------------------------------
function makeEvaluation(parse, spans, extraInfo) {
    if (evaluation) {
        evaluation.close();
        evaluation = undefined;
    }
    var build = builder.buildDoc(parse);
    var blocks = build.blocks, errors = build.errors;
    exports.responder.sendErrors(errors);
    analyzer.analyze(blocks.map(function (block) { return block.parse; }), spans, extraInfo);
    var browser = new browserSession_1.BrowserSessionDatabase(exports.responder);
    var event = new browserSession_1.BrowserEventDatabase();
    var view = new browserSession_1.BrowserViewDatabase();
    var editor = new browserSession_1.BrowserEditorDatabase();
    var inspector = new browserSession_1.BrowserInspectorDatabase();
    var session = new runtime_1.Database();
    session.blocks = blocks;
    // console.log(blocks);
    var ev = new runtime_1.Evaluation();
    ev.registerDatabase("session", session);
    ev.registerDatabase("browser", browser);
    ev.registerDatabase("event", event);
    ev.registerDatabase("view", view);
    ev.registerDatabase("editor", editor);
    ev.registerDatabase("inspector", inspector);
    ev.registerDatabase("system", system.instance);
    ev.registerDatabase("http", new http_1.HttpDatabase());
    return ev;
}
//---------------------------------------------------------------------
// Responder
//---------------------------------------------------------------------
var Responder = (function () {
    function Responder(socket) {
        this.socket = socket;
    }
    Responder.prototype.send = function (json) {
        var _this = this;
        setTimeout(function () {
            _this.socket.onmessage({ data: json });
        }, 0);
    };
    Responder.prototype.sendErrors = function (errors) {
        if (!errors.length)
            return;
        var spans = [];
        var extraInfo = {};
        for (var _i = 0, errors_1 = errors; _i < errors_1.length; _i++) {
            var error = errors_1[_i];
            error.injectSpan(spans, extraInfo);
        }
        this.send(JSON.stringify({ type: "comments", spans: spans, extraInfo: extraInfo }));
        return true;
    };
    Responder.prototype.handleEvent = function (json) {
        var data = JSON.parse(json);
        if (data.type === "event") {
            if (!evaluation)
                return;
            console.info("EVENT", json);
            var scopes = ["event"];
            var actions = [];
            for (var _i = 0, _a = data.insert; _i < _a.length; _i++) {
                var insert = _a[_i];
                var e = insert[0], a = insert[1], v = insert[2];
                // @TODO: this is a hack to deal with external ids. We should really generate
                // a local id for them
                if (e[0] === "⍦")
                    e = id_1.ids.get([e]);
                if (v[0] === "⍦")
                    v = id_1.ids.get([v]);
                actions.push(new actions_1.ActionImplementations["+="]("event", e, a, v, "event", scopes));
            }
            evaluation.executeActions(actions);
        }
        else if (data.type === "close") {
            if (!evaluation)
                return;
            evaluation.close();
            evaluation = undefined;
        }
        else if (data.type === "parse") {
            var _b = parser.parseDoc(data.code || "", "user"), results = _b.results, errors = _b.errors;
            var text = results.text, spans = results.spans, extraInfo = results.extraInfo;
            var build = builder.buildDoc(results);
            var blocks = build.blocks, buildErrors = build.errors;
            results.code = data.code;
            this.lastParse = results;
            for (var _c = 0, buildErrors_1 = buildErrors; _c < buildErrors_1.length; _c++) {
                var error = buildErrors_1[_c];
                error.injectSpan(spans, extraInfo);
            }
            this.send(JSON.stringify({ type: "parse", generation: data.generation, text: text, spans: spans, extraInfo: extraInfo }));
        }
        else if (data.type === "eval") {
            if (evaluation !== undefined && data.persist) {
                var changes = evaluation.createChanges();
                var session = evaluation.getDatabase("session");
                for (var _d = 0, _e = session.blocks; _d < _e.length; _d++) {
                    var block = _e[_d];
                    if (block.bindActions.length) {
                        block.updateBinds({ positions: {}, info: [] }, changes);
                    }
                }
                var build = builder.buildDoc(this.lastParse);
                var blocks = build.blocks, errors = build.errors;
                var spans = [];
                var extraInfo = {};
                analyzer.analyze(blocks.map(function (block) { return block.parse; }), spans, extraInfo);
                this.sendErrors(errors);
                for (var _f = 0, blocks_1 = blocks; _f < blocks_1.length; _f++) {
                    var block = blocks_1[_f];
                    if (block.singleRun)
                        block.dormant = true;
                }
                session.blocks = blocks;
                evaluation.unregisterDatabase("session");
                evaluation.registerDatabase("session", session);
                changes.commit();
                evaluation.fixpoint(changes);
            }
            else {
                var spans = [];
                var extraInfo = {};
                evaluation = makeEvaluation(this.lastParse, spans, extraInfo);
                evaluation.fixpoint();
                client.socket.onopen();
            }
        }
        else if (data.type === "tokenInfo") {
            var spans = [];
            var extraInfo = {};
            analyzer.tokenInfo(evaluation, data.tokenId, spans, extraInfo);
            this.send(JSON.stringify({ type: "comments", spans: spans, extraInfo: extraInfo }));
        }
        else if (data.type === "findNode") {
            var recordId = data.recordId, node = data.node;
            var spans = [];
            var extraInfo = {};
            var spanId = analyzer.nodeIdToRecord(evaluation, data.node, spans, extraInfo);
            this.send(JSON.stringify({ type: "findNode", recordId: recordId, spanId: spanId }));
        }
        else if (data.type === "findSource") {
            var spans = [];
            var extraInfo = {};
            var spanId = analyzer.findSource(evaluation, data, spans, extraInfo);
            this.send(JSON.stringify(data));
        }
        else if (data.type === "findRelated") {
            var spans = [];
            var extraInfo = {};
            var spanId = analyzer.findRelated(evaluation, data, spans, extraInfo);
            this.send(JSON.stringify(data));
        }
        else if (data.type === "findValue") {
            var spans = [];
            var extraInfo = {};
            var spanId = analyzer.findValue(evaluation, data, spans, extraInfo);
            this.send(JSON.stringify(data));
        }
        else if (data.type === "findCardinality") {
            var spans = [];
            var extraInfo = {};
            var spanId = analyzer.findCardinality(evaluation, data, spans, extraInfo);
            this.send(JSON.stringify(data));
        }
        else if (data.type === "findAffector") {
            var spans = [];
            var extraInfo = {};
            var spanId = analyzer.findAffector(evaluation, data, spans, extraInfo);
            this.send(JSON.stringify(data));
        }
        else if (data.type === "findFailure") {
            var spans = [];
            var extraInfo = {};
            var spanId = analyzer.findFailure(evaluation, data, spans, extraInfo);
            this.send(JSON.stringify(data));
        }
        else if (data.type === "findRootDrawers") {
            var spans = [];
            var extraInfo = {};
            var spanId = analyzer.findRootDrawers(evaluation, data, spans, extraInfo);
            this.send(JSON.stringify(data));
        }
        else if (data.type === "findMaybeDrawers") {
            var spans = [];
            var extraInfo = {};
            var spanId = analyzer.findMaybeDrawers(evaluation, data, spans, extraInfo);
            this.send(JSON.stringify(data));
        }
        else if (data.type === "findPerformance") {
            var perf = evaluation.perf;
            var userBlocks = {};
            for (var _g = 0, _h = evaluation.getDatabase("session").blocks; _g < _h.length; _g++) {
                var block = _h[_g];
                userBlocks[block.id] = true;
            }
            var perfInfo = perf.asObject(userBlocks);
            perfInfo.type = "findPerformance";
            perfInfo.requestId = data.requestId;
            this.send(JSON.stringify(perfInfo));
        }
        else if (data.type === "findRecordsFromToken") {
            var spans = [];
            var extraInfo = {};
            var spanId = analyzer.findRecordsFromToken(evaluation, data, spans, extraInfo);
            this.send(JSON.stringify(data));
        }
        else if (data.type === "save") {
            var dbs = evaluation.save();
            var code = this.lastParse.code;
            var output = JSON.stringify({ code: code, databases: { "session": dbs.session } });
            download("dump.evestate", output);
        }
        else if (data.type === "load") {
            var spans = [];
            var extraInfo = {};
            evaluation = makeEvaluation(this.lastParse, spans, extraInfo);
            var blocks = evaluation.getDatabase("session").blocks;
            for (var _j = 0, blocks_2 = blocks; _j < blocks_2.length; _j++) {
                var block = blocks_2[_j];
                if (block.singleRun) {
                    block.dormant = true;
                }
            }
            evaluation.load(data.info.databases);
        }
    };
    return Responder;
}());
//---------------------------------------------------------------------
// Init a program
//---------------------------------------------------------------------
function init(code) {
    global["browser"] = true;
    exports.responder = new Responder(client.socket);
    var _a = parser.parseDoc(code || "", "user"), results = _a.results, errors = _a.errors;
    if (errors && errors.length)
        console.error(errors);
    var text = results.text, spans = results.spans, extraInfo = results.extraInfo;
    results.code = code;
    exports.responder.lastParse = results;
    //responder.send(JSON.stringify({type: "parse", text, spans, extraInfo}));
    evaluation = makeEvaluation(results, spans, extraInfo);
    evaluation.errorReporter = function (kind, error) {
        exports.responder.send(JSON.stringify({ type: "error", kind: kind, message: error }));
    };
    evaluation.fixpoint();
    global["evaluation"] = evaluation;
    global["save"] = function () {
        exports.responder.handleEvent(JSON.stringify({ type: "save" }));
    };
    client.socket.onopen();
    // responder.handleEvent(JSON.stringify({type: "findPerformance", requestId: 2}));
}
exports.init = init;
//# sourceMappingURL=browser.js.map