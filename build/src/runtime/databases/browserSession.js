//---------------------------------------------------------------------
// Browser Session Database
//---------------------------------------------------------------------
"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var parser = require("../parser");
var builder = require("../builder");
var runtime_1 = require("../runtime");
var BrowserEventDatabase = (function (_super) {
    __extends(BrowserEventDatabase, _super);
    function BrowserEventDatabase() {
        _super.call(this);
        if (global["examples"]["event.eve"]) {
            var _a = parser.parseDoc(global["examples"]["event.eve"], "event"), results = _a.results, errors = _a.errors;
            if (errors && errors.length)
                console.error("EVENT ERRORS", errors);
            var _b = builder.buildDoc(results), blocks = _b.blocks, buildErrors = _b.errors;
            if (buildErrors && buildErrors.length)
                console.error("EVENT ERRORS", buildErrors);
            this.blocks = blocks;
        }
    }
    return BrowserEventDatabase;
}(runtime_1.Database));
exports.BrowserEventDatabase = BrowserEventDatabase;
var BrowserViewDatabase = (function (_super) {
    __extends(BrowserViewDatabase, _super);
    function BrowserViewDatabase() {
        _super.call(this);
        if (global["examples"]["view.eve"]) {
            var _a = parser.parseDoc(global["examples"]["view.eve"], "view"), results = _a.results, errors = _a.errors;
            if (errors && errors.length)
                console.error("View DB Errors", errors);
            var _b = builder.buildDoc(results), blocks = _b.blocks, buildErrors = _b.errors;
            if (buildErrors && buildErrors.length)
                console.error("View DB Errors", buildErrors);
            this.blocks = blocks;
        }
    }
    return BrowserViewDatabase;
}(runtime_1.Database));
exports.BrowserViewDatabase = BrowserViewDatabase;
var BrowserEditorDatabase = (function (_super) {
    __extends(BrowserEditorDatabase, _super);
    function BrowserEditorDatabase() {
        _super.call(this);
        if (global["examples"]["editor.eve"]) {
            var _a = parser.parseDoc(global["examples"]["editor.eve"], "editor"), results = _a.results, errors = _a.errors;
            if (errors && errors.length)
                console.error("Editor DB Errors", errors);
            var _b = builder.buildDoc(results), blocks = _b.blocks, buildErrors = _b.errors;
            if (buildErrors && buildErrors.length)
                console.error("Editor DB Errors", buildErrors);
            this.blocks = blocks;
        }
    }
    return BrowserEditorDatabase;
}(runtime_1.Database));
exports.BrowserEditorDatabase = BrowserEditorDatabase;
var BrowserInspectorDatabase = (function (_super) {
    __extends(BrowserInspectorDatabase, _super);
    function BrowserInspectorDatabase() {
        _super.call(this);
        if (global["examples"]["inspector.eve"]) {
            var _a = parser.parseDoc(global["examples"]["inspector.eve"], "inspector"), results = _a.results, errors = _a.errors;
            if (errors && errors.length)
                console.error("Inspector DB Errors", errors);
            var _b = builder.buildDoc(results), blocks = _b.blocks, buildErrors = _b.errors;
            if (buildErrors && buildErrors.length)
                console.error("Inspector DB Errors", buildErrors);
            this.blocks = blocks;
        }
    }
    return BrowserInspectorDatabase;
}(runtime_1.Database));
exports.BrowserInspectorDatabase = BrowserInspectorDatabase;
var BrowserSessionDatabase = (function (_super) {
    __extends(BrowserSessionDatabase, _super);
    function BrowserSessionDatabase(client) {
        _super.call(this);
        this.client = client;
    }
    BrowserSessionDatabase.prototype.onFixpoint = function (evaluation, changes) {
        _super.prototype.onFixpoint.call(this, evaluation, changes);
        var name = evaluation.databaseToName(this);
        var result = changes.result((_a = {}, _a[name] = true, _a));
        if (result.insert.length || result.remove.length) {
            this.client.send(JSON.stringify(result));
        }
        var _a;
    };
    BrowserSessionDatabase.prototype.unregister = function (evaluation) {
        console.log("UNREGISTERING!");
        var ix = this.evaluations.indexOf(evaluation);
        if (ix > -1) {
            this.evaluations.splice(ix, 1);
        }
        console.log("evals", this.evaluations);
        if (this.evaluations.length === 0) {
            console.log("TRIPLES", this.index.toTriples());
            this.client.send(JSON.stringify({ type: "result", insert: [], remove: this.index.toTriples() }));
        }
    };
    return BrowserSessionDatabase;
}(runtime_1.Database));
exports.BrowserSessionDatabase = BrowserSessionDatabase;
//# sourceMappingURL=browserSession.js.map