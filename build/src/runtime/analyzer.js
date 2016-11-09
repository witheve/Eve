//---------------------------------------------------------------------
// Analyzer
//---------------------------------------------------------------------
"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var parser_1 = require("./parser");
var runtime_1 = require("./runtime");
var parser = require("./parser");
var builder = require("./builder");
var browser = require("./browser");
var browserSession_1 = require("./databases/browserSession");
var ActionType;
(function (ActionType) {
    ActionType[ActionType["Bind"] = 0] = "Bind";
    ActionType[ActionType["Commit"] = 1] = "Commit";
})(ActionType || (ActionType = {}));
//---------------------------------------------------------------------
// AnalysisContext
//---------------------------------------------------------------------
var AnalysisContext = (function () {
    function AnalysisContext(spans, extraInfo) {
        this.ScanId = 0;
        this.spans = spans;
        this.extraInfo = extraInfo;
    }
    AnalysisContext.prototype.record = function (parseNode, kind) {
        var changes = this.changes;
        var recordId = parseNode.id;
        var _a = parser_1.nodeToBoundaries(parseNode), start = _a[0], stop = _a[1];
        changes.store("session", recordId, "tag", "record", "analyzer");
        changes.store("session", recordId, "block", this.block.id, "analyzer");
        changes.store("session", recordId, "start", start, "analyzer");
        changes.store("session", recordId, "stop", stop, "analyzer");
        changes.store("session", recordId, "entity", parseNode.variable.id, "analyzer");
        changes.store("session", recordId, "kind", kind, "analyzer");
        for (var _i = 0, _b = parseNode.scopes; _i < _b.length; _i++) {
            var scope = _b[_i];
            changes.store("session", recordId, "scopes", scope, "analyzer");
        }
        return recordId;
    };
    AnalysisContext.prototype.scan = function (parseNode, scopes, entity, attribute, value) {
        var changes = this.changes;
        var scanId = parseNode.id;
        var _a = parser_1.nodeToBoundaries(parseNode, this.block.start), start = _a[0], stop = _a[1];
        changes.store("session", scanId, "tag", "scan", "analyzer");
        changes.store("session", scanId, "block", this.block.id, "analyzer");
        changes.store("session", scanId, "start", start, "analyzer");
        changes.store("session", scanId, "stop", stop, "analyzer");
        changes.store("session", scanId, "entity", entity.id, "analyzer");
        if (attribute !== undefined) {
            changes.store("session", scanId, "attribute", attribute, "analyzer");
        }
        if (parseNode.buildId !== undefined) {
            changes.store("session", scanId, "build-node", parseNode.buildId, "analyzer");
        }
        if (value && value.id !== undefined) {
            changes.store("session", scanId, "value", value.id, "analyzer");
            changes.store("session", value.id, "tag", "variable", "analyzer");
        }
        else if (value !== undefined) {
            changes.store("session", scanId, "value", value, "analyzer");
        }
        for (var _i = 0, scopes_1 = scopes; _i < scopes_1.length; _i++) {
            var scope = scopes_1[_i];
            changes.store("session", scanId, "scopes", scope, "analyzer");
        }
        return scanId;
    };
    AnalysisContext.prototype.provide = function (parseNode, scopes, entity, attribute, value) {
        var changes = this.changes;
        var actionId = parseNode.id;
        var _a = parser_1.nodeToBoundaries(parseNode, this.block.start), start = _a[0], stop = _a[1];
        changes.store("session", actionId, "tag", "action", "analyzer");
        changes.store("session", actionId, "block", this.block.id, "analyzer");
        changes.store("session", actionId, "start", start, "analyzer");
        changes.store("session", actionId, "stop", stop, "analyzer");
        changes.store("session", actionId, "entity", entity.id, "analyzer");
        changes.store("session", actionId, "attribute", attribute, "analyzer");
        if (parseNode.buildId !== undefined) {
            changes.store("session", actionId, "build-node", parseNode.buildId, "analyzer");
        }
        if (value.id !== undefined) {
            changes.store("session", actionId, "value", value.id, "analyzer");
            changes.store("session", value.id, "tag", "variable", "analyzer");
        }
        else {
            changes.store("session", actionId, "value", value, "analyzer");
        }
        for (var _i = 0, scopes_2 = scopes; _i < scopes_2.length; _i++) {
            var scope = scopes_2[_i];
            changes.store("session", actionId, "scopes", scope, "analyzer");
        }
        return actionId;
    };
    AnalysisContext.prototype.value = function (node) {
        if (node.type === "constant")
            return node.value;
        if (node.type === "variable")
            return node;
        throw new Error("Trying to get value of non-value type: " + node.type);
    };
    return AnalysisContext;
}());
//---------------------------------------------------------------------
// Analysis
//---------------------------------------------------------------------
var Analysis = (function () {
    function Analysis(changes) {
        this.changes = changes;
    }
    //---------------------------------------------------------------------
    // Scans
    //---------------------------------------------------------------------
    Analysis.prototype._scans = function (context, scans) {
        for (var _i = 0, scans_1 = scans; _i < scans_1.length; _i++) {
            var scan = scans_1[_i];
            if (scan.type === "record") {
                this._scanRecord(context, scan);
            }
            else if (scan.type === "scan") {
                this._scanScan(context, scan);
            }
            else if (scan.type === "ifExpression") {
                this._scanIf(context, scan);
            }
            else if (scan.type === "not") {
                this._scanNot(context, scan);
            }
        }
    };
    Analysis.prototype._scanRecord = function (context, node) {
        context.record(node, "scan");
        for (var _i = 0, _a = node.attributes; _i < _a.length; _i++) {
            var attr = _a[_i];
            if (attr.value.type === "parenthesis") {
                for (var _b = 0, _c = attr.value.items; _b < _c.length; _b++) {
                    var item = _c[_b];
                    var id = context.scan(item, node.scopes, node.variable, attr.attribute, context.value(item));
                }
            }
            else {
                var id = context.scan(attr, node.scopes, node.variable, attr.attribute, context.value(attr.value));
            }
        }
    };
    Analysis.prototype._scanScan = function (context, node) {
        if (node.attribute === undefined || node.attribute.type === "variable") {
            var value = void 0;
            if (node.value !== undefined) {
                value = context.value(node.value);
            }
            var id = context.scan(node, node.scopes, context.value(node.entity), undefined, value);
        }
        else {
            var id = context.scan(node, node.scopes, context.value(node.entity), context.value(node.attribute), context.value(node.value));
        }
    };
    Analysis.prototype._scanIf = function (context, ifExpression) {
    };
    Analysis.prototype._scanNot = function (context, not) {
    };
    //---------------------------------------------------------------------
    // Expressions
    //---------------------------------------------------------------------
    Analysis.prototype._expressions = function (context, expressions) {
        for (var _i = 0, expressions_1 = expressions; _i < expressions_1.length; _i++) {
            var expression = expressions_1[_i];
            if (expression.type === "expression") {
            }
            else if (expression.type === "functionRecord") {
            }
        }
    };
    //---------------------------------------------------------------------
    // Actions
    //---------------------------------------------------------------------
    Analysis.prototype._actions = function (context, type, actions) {
        for (var _i = 0, actions_1 = actions; _i < actions_1.length; _i++) {
            var action = actions_1[_i];
            if (action.type === "record") {
                this._actionRecord(context, action);
            }
            else if (action.type === "action") {
                this._actionAction(context, action);
            }
        }
    };
    Analysis.prototype._actionRecord = function (context, node) {
        context.record(node, "action");
        for (var _i = 0, _a = node.attributes; _i < _a.length; _i++) {
            var attr = _a[_i];
            if (attr.value.type === "parenthesis") {
                for (var _b = 0, _c = attr.value.items; _b < _c.length; _b++) {
                    var item = _c[_b];
                    var id = context.provide(item, node.scopes, node.variable, attr.attribute, context.value(item));
                }
            }
            else {
                var id = context.provide(attr, node.scopes, node.variable, attr.attribute, context.value(attr.value));
            }
        }
    };
    Analysis.prototype._actionAction = function (context, node) {
        if (node.action === "erase") {
        }
        else {
            var attribute = typeof node.attribute === "string" ? node.attribute : context.value(node.attribute);
            if (node.value.type === "parenthesis") {
                for (var _i = 0, _a = node.value.items; _i < _a.length; _i++) {
                    var item = _a[_i];
                    var id = context.provide(item, node.scopes, node.entity, attribute, context.value(item));
                }
            }
            else {
                var id = context.provide(node, node.scopes, node.entity, attribute, context.value(node.value));
            }
        }
    };
    //---------------------------------------------------------------------
    // Variables
    //---------------------------------------------------------------------
    Analysis.prototype._variables = function (context, variables) {
        var changes = context.changes;
        for (var _i = 0, _a = Object.keys(variables); _i < _a.length; _i++) {
            var name_1 = _a[_i];
            var variable = variables[name_1];
            changes.store("session", variable.id, "tag", "variable");
            changes.store("session", variable.id, "name", variable.name);
            changes.store("session", variable.id, "block", context.block.id);
            if (variable.register !== undefined) {
                changes.store("session", variable.id, "register", variable.register);
            }
            if (variable.generated) {
                changes.store("session", variable.id, "tag", "generated");
            }
            if (variable.nonProjecting) {
                changes.store("session", variable.id, "tag", "non-projecting");
            }
        }
    };
    //---------------------------------------------------------------------
    // Equalities
    //---------------------------------------------------------------------
    Analysis.prototype._equalities = function (context, equalities) {
        var changes = context.changes;
        var ix = 0;
        for (var _i = 0, equalities_1 = equalities; _i < equalities_1.length; _i++) {
            var _a = equalities_1[_i], a = _a[0], b = _a[1];
            var equalityId = context.block.id + "|equality|" + ix++;
            a = context.value(a);
            b = context.value(b);
            var aId = a.id ? a.id : a;
            var bId = b.id ? b.id : b;
            changes.store("session", equalityId, "tag", "equality");
            changes.store("session", equalityId, "block", context.block.id);
            changes.store("session", equalityId, "a", aId);
            changes.store("session", equalityId, "b", bId);
        }
    };
    //---------------------------------------------------------------------
    // Links
    //---------------------------------------------------------------------
    Analysis.prototype._link = function (context, aId, bId) {
        var changes = context.changes;
        if (!aId || !bId)
            throw new Error("WAT");
        var linkId = context.block.id + "|link|" + context.ScanId++;
        changes.store("session", linkId, "tag", "link");
        changes.store("session", linkId, "block", context.block.id);
        changes.store("session", linkId, "a", aId);
        changes.store("session", linkId, "b", bId);
    };
    Analysis.prototype._links = function (context, links) {
        for (var ix = 0, len = links.length; ix < len; ix += 2) {
            var aId = links[ix];
            var bId = links[ix + 1];
            this._link(context, aId, bId);
        }
    };
    //---------------------------------------------------------------------
    // Tokens
    //---------------------------------------------------------------------
    Analysis.prototype._tokens = function (context, tokens) {
        var changes = context.changes;
        for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
            var token = tokens_1[_i];
            var tokenId = token.id;
            changes.store("session", tokenId, "tag", "token");
            changes.store("session", tokenId, "block", context.block.id);
            changes.store("session", tokenId, "start", token.startOffset);
            changes.store("session", tokenId, "stop", token.endOffset);
        }
    };
    //---------------------------------------------------------------------
    // Block
    //---------------------------------------------------------------------
    Analysis.prototype._block = function (context, block) {
        context.changes.store("session", block.id, "tag", "block");
        this._links(context, block.links);
        this._tokens(context, block.tokens);
        this._variables(context, block.variables);
        this._equalities(context, block.equalities);
        this._scans(context, block.scanLike);
        this._expressions(context, block.expressions);
        this._actions(context, ActionType.Bind, block.binds);
        this._actions(context, ActionType.Commit, block.commits);
    };
    //---------------------------------------------------------------------
    // Public
    //---------------------------------------------------------------------
    Analysis.prototype.block = function (block, spans, extraInfo) {
        var context = this.createContext(block, spans, extraInfo);
        this._block(context, block);
    };
    Analysis.prototype.createContext = function (block, spans, extraInfo) {
        var context = new AnalysisContext(spans, extraInfo);
        context.block = block;
        context.changes = this.changes;
        return context;
    };
    return Analysis;
}());
var EditorDatabase = (function (_super) {
    __extends(EditorDatabase, _super);
    function EditorDatabase(spans, extraInfo) {
        _super.call(this);
        this.spans = spans;
        this.extraInfo = extraInfo;
    }
    EditorDatabase.prototype.onFixpoint = function (evaluation, changes) {
        _super.prototype.onFixpoint.call(this, evaluation, changes);
        var name = evaluation.databaseToName(this);
        var index = this.index;
        var comments = index.alookup("tag", "comment");
        if (comments) {
            for (var _i = 0, _a = Object.keys(comments.index); _i < _a.length; _i++) {
                var commentId = _a[_i];
                var comment = index.asObject(commentId, false, true);
                this.spans.push(comment.start, comment.stop, "document_comment", commentId);
                comment.spanId = commentId;
                this.extraInfo[commentId] = comment;
            }
        }
    };
    return EditorDatabase;
}(runtime_1.Database));
exports.EditorDatabase = EditorDatabase;
function makeEveAnalyzer() {
    if (eve)
        return eve;
    var _a = parser.parseDoc(global["examples"]["analyzer.eve"], "analyzer"), results = _a.results, errors = _a.errors;
    var text = results.text, spans = results.spans, extraInfo = results.extraInfo;
    var _b = builder.buildDoc(results), blocks = _b.blocks, buildErrors = _b.errors;
    if (errors.length || buildErrors.length) {
        console.error("ANALYZER CREATION ERRORS", errors, buildErrors);
    }
    var browserDb = new browserSession_1.BrowserSessionDatabase(browser.responder);
    var session = new runtime_1.Database();
    session.blocks = blocks;
    var evaluation = new runtime_1.Evaluation();
    evaluation.registerDatabase("session", session);
    evaluation.registerDatabase("browser", browserDb);
    return evaluation;
}
var eve;
function analyze(blocks, spans, extraInfo) {
    console.time("load analysis");
    eve = makeEveAnalyzer();
    var session = new runtime_1.Database();
    var prev = eve.getDatabase("session");
    session.blocks = prev.blocks;
    // console.log("ANALYZER BLOCKS", session.blocks);
    eve.unregisterDatabase("session");
    eve.registerDatabase("session", session);
    var editorDb = new EditorDatabase(spans, extraInfo);
    eve.unregisterDatabase("editor");
    eve.registerDatabase("editor", editorDb);
    eve.fixpoint();
    var changes = eve.createChanges();
    var analysis = new Analysis(changes);
    for (var _i = 0, blocks_1 = blocks; _i < blocks_1.length; _i++) {
        var block = blocks_1[_i];
        analysis.block(block, spans, extraInfo);
    }
    changes.commit();
    console.log(changes);
    console.timeEnd("load analysis");
    // eve.executeActions([], changes);
}
exports.analyze = analyze;
var prevQuery;
function doQuery(queryId, query, spans, extraInfo) {
    eve = makeEveAnalyzer();
    var editorDb = new EditorDatabase(spans, extraInfo);
    eve.unregisterDatabase("editor");
    eve.registerDatabase("editor", editorDb);
    var changes = eve.createChanges();
    if (prevQuery) {
        changes.unstoreObject(prevQuery.queryId, prevQuery.query, "analyzer", "session");
    }
    changes.storeObject(queryId, query, "analyzer", "session");
    eve.executeActions([], changes);
    prevQuery = { queryId: queryId, query: query };
    return eve;
}
function tokenInfo(evaluation, tokenId, spans, extraInfo) {
    var queryId = "query|" + tokenId;
    var query = { tag: "query", token: tokenId };
    var eve = doQuery(queryId, query, spans, extraInfo);
    // look at the results and find out which action node we were looking
    // at
    var sessionIndex = eve.getDatabase("session").index;
    var queryInfo = sessionIndex.alookup("tag", "query");
    var evSession = evaluation.getDatabase("session");
    if (queryInfo) {
        for (var _i = 0, _a = Object.keys(queryInfo.index); _i < _a.length; _i++) {
            var entity = _a[_i];
            var info = sessionIndex.asObject(entity);
            console.log("INFO", info);
            // why is this failing?
            var nodeArray = info.scan || info.action;
            if (nodeArray) {
                var node = sessionIndex.asObject(nodeArray[0]);
                var blockId = node["block"][0];
                var found = void 0;
                for (var _b = 0, _c = evSession.blocks; _b < _c.length; _b++) {
                    var block = _c[_b];
                    console.log("BLOCK ID", block.id, node["block"]);
                    if (block.id === blockId) {
                        found = block;
                        break;
                    }
                }
                console.log("NODE BLOCK", blockId, found);
                console.log("FAILING SCAN", blockToFailingScan(found));
                console.log("CARDINALITIES", resultsToCardinalities(found.results));
                console.log("SPECIFIC ROWS", findResultRows(found.results, 2, "cherry"));
            }
            // look for the facts that action creates
            if (info.action) {
                for (var _d = 0, _e = info.action; _d < _e.length; _d++) {
                    var actionId = _e[_d];
                    var action = sessionIndex.asObject(actionId);
                    var evIndex = evaluation.getDatabase(action.scopes[0]).index;
                    var nodeItems = evIndex.nodeLookup(action["build-node"][0]);
                    if (nodeItems) {
                        console.log("ACTION", action["build-node"][0]);
                        console.log(evIndex.toTriples(false, nodeItems.index));
                    }
                }
            }
        }
    }
}
exports.tokenInfo = tokenInfo;
function findCardinality(evaluation, info, spans, extraInfo) {
    var queryId = "query|" + info.requestId;
    var query = { tag: ["query", "findCardinality"], token: info.variable };
    var eve = doQuery(queryId, query, spans, extraInfo);
    var sessionIndex = eve.getDatabase("session").index;
    var evSession = evaluation.getDatabase("session");
    var lookup = {};
    var blockId;
    var cardinalities;
    var queryInfo = sessionIndex.alookup("tag", "query");
    if (queryInfo) {
        var entity = queryInfo.toValues()[0];
        var obj = sessionIndex.asObject(entity);
        if (obj.register) {
            for (var _i = 0, _a = obj.register; _i < _a.length; _i++) {
                var variable = _a[_i];
                var varObj = sessionIndex.asObject(variable);
                if (varObj) {
                    if (!blockId) {
                        var found = void 0;
                        blockId = varObj.block[0];
                        for (var _b = 0, _c = evSession.blocks; _b < _c.length; _b++) {
                            var block = _c[_b];
                            if (block.id === blockId) {
                                found = block;
                                break;
                            }
                        }
                        cardinalities = resultsToCardinalities(found.results);
                    }
                    lookup[varObj.token[0]] = cardinalities[varObj.register[0]].cardinality;
                }
            }
        }
    }
    info.cardinality = lookup;
    return info;
}
exports.findCardinality = findCardinality;
function findValue(evaluation, info, spans, extraInfo) {
    var queryId = "query|" + info.requestId;
    var query = { tag: ["query", "findValue"], token: info.variable };
    var eve = doQuery(queryId, query, spans, extraInfo);
    var sessionIndex = eve.getDatabase("session").index;
    var evSession = evaluation.getDatabase("session");
    var lookup = {};
    var blockId, found;
    var rows = [];
    var varToRegister = {};
    var names = {};
    var queryInfo = sessionIndex.alookup("tag", "query");
    if (queryInfo) {
        var entity = queryInfo.toValues()[0];
        var obj = sessionIndex.asObject(entity);
        if (obj.register) {
            for (var _i = 0, _a = obj.register; _i < _a.length; _i++) {
                var variable = _a[_i];
                var varObj = sessionIndex.asObject(variable);
                if (varObj) {
                    if (!blockId) {
                        blockId = varObj.block[0];
                        for (var _b = 0, _c = evSession.blocks; _b < _c.length; _b++) {
                            var block = _c[_b];
                            if (block.id === blockId) {
                                found = block;
                                break;
                            }
                        }
                    }
                    if (varObj.attribute) {
                        for (var _d = 0, _e = varObj.attribute; _d < _e.length; _d++) {
                            var attribute = _e[_d];
                            varToRegister[attribute] = varObj.register[0];
                        }
                    }
                    lookup[varObj.token[0]] = varObj.register[0];
                    names[varObj.token[0]] = varObj.name[0];
                }
            }
        }
    }
    if (info.given) {
        var keys = Object.keys(info.given);
        var registers = [];
        var registerValues = [];
        for (var _f = 0, keys_1 = keys; _f < keys_1.length; _f++) {
            var key = keys_1[_f];
            var reg = varToRegister[key];
            if (reg !== undefined && registers.indexOf(reg) === -1) {
                registers.push(reg);
                registerValues.push(info.given[key][0]);
            }
        }
        rows = findResultRows(found.results, registers, registerValues);
    }
    else {
        rows = found.results;
    }
    info.rows = rows.slice(0, 100);
    info.totalRows = rows.length;
    info.variableMappings = lookup;
    info.variableNames = names;
    return info;
}
exports.findValue = findValue;
function nodeIdToRecord(evaluation, nodeId, spans, extraInfo) {
    var queryId = "query|" + nodeId;
    var query = { tag: "query", "build-node": nodeId };
    var eve = doQuery(queryId, query, spans, extraInfo);
    var sessionIndex = eve.getDatabase("session").index;
    var queryInfo = sessionIndex.alookup("tag", "query");
    if (queryInfo) {
        var entity = queryInfo.toValues()[0];
        var obj = sessionIndex.asObject(entity);
        if (obj.pattern) {
            return obj.pattern[0];
        }
    }
    return;
}
exports.nodeIdToRecord = nodeIdToRecord;
function findRecordsFromToken(evaluation, info, spans, extraInfo) {
    var queryId = "query|" + info.requestId;
    var query = { tag: ["findRecordsFromToken"] };
    if (info.token)
        query.token = info.token;
    var evSession = evaluation.getDatabase("session");
    var evBrowser = evaluation.getDatabase("browser");
    evSession.nonExecuting = true;
    evBrowser.nonExecuting = true;
    eve.registerDatabase("evaluation-session", evSession);
    eve.registerDatabase("evaluation-browser", evBrowser);
    doQuery(queryId, query, spans, extraInfo);
    eve.unregisterDatabase("evaluation-session");
    eve.unregisterDatabase("evaluation-browser");
    evSession.nonExecuting = false;
    evBrowser.nonExecuting = false;
    var sessionIndex = eve.getDatabase("session").index;
    var queryInfo = sessionIndex.alookup("tag", "findRecordsFromToken");
    if (queryInfo) {
        var entity = queryInfo.toValues()[0];
        var obj = sessionIndex.asObject(entity);
        console.log("FIND RECORDS", obj);
        if (obj.record) {
            return info.record = obj.record;
        }
        else {
            info.record = [];
            return info;
        }
    }
    return;
}
exports.findRecordsFromToken = findRecordsFromToken;
function findSource(evaluation, info, spans, extraInfo) {
    var queryId = "query|" + info.requestId;
    var query = { tag: ["query", "findSource"] };
    if (info.record)
        query.recordId = info.record;
    if (info.attribute)
        query.attribute = info.attribute;
    if (info.span)
        query.span = info.span;
    var evSession = evaluation.getDatabase("session");
    var evBrowser = evaluation.getDatabase("browser");
    evSession.nonExecuting = true;
    evBrowser.nonExecuting = true;
    eve.registerDatabase("evaluation-session", evSession);
    eve.registerDatabase("evaluation-browser", evBrowser);
    doQuery(queryId, query, spans, extraInfo);
    eve.unregisterDatabase("evaluation-session");
    eve.unregisterDatabase("evaluation-browser");
    evSession.nonExecuting = false;
    evBrowser.nonExecuting = false;
    var sessionIndex = eve.getDatabase("session").index;
    var queryInfo = sessionIndex.alookup("tag", "findSource");
    if (queryInfo) {
        var entity = queryInfo.toValues()[0];
        var obj = sessionIndex.asObject(entity);
        console.log("FIND SOURCE", obj);
        if (obj.source) {
            info.source = obj.source.map(function (source) { return sessionIndex.asObject(source, false, true); });
            return info;
        }
        else if (obj.block) {
            info.block = obj.block;
            return info;
        }
        else {
            info.block = [];
            info.source = [];
            return info;
        }
    }
    return;
}
exports.findSource = findSource;
function findRelated(evaluation, info, spans, extraInfo) {
    var queryId = "query|" + info.requestId;
    var query = { tag: ["query", "findRelated"] };
    var queryType;
    if (info.span) {
        query.span = info.span;
        queryType = "span";
    }
    if (info.variable) {
        query.variable = info.variable;
        queryType = "variable";
    }
    query.for = queryType;
    var evSession = evaluation.getDatabase("session");
    eve.registerDatabase("evaluation-session", evSession);
    doQuery(queryId, query, spans, extraInfo);
    eve.unregisterDatabase("evaluation-session");
    var sessionIndex = eve.getDatabase("session").index;
    var queryInfo = sessionIndex.alookup("tag", "findRelated");
    if (queryInfo) {
        var entity = queryInfo.toValues()[0];
        var obj = sessionIndex.asObject(entity);
        if (queryType === "span" && obj.variable) {
            info.variable = obj.variable;
        }
        else if (queryType === "variable" && obj.span) {
            info.span = obj.span;
        }
        else {
            info.variable = [];
            info.span = [];
        }
        return info;
    }
    return;
}
exports.findRelated = findRelated;
function findAffector(evaluation, info, spans, extraInfo) {
    var queryId = "query|" + info.requestId;
    var query = { tag: ["query", "findAffector"] };
    if (info.record)
        query.recordId = info.record;
    if (info.attribute)
        query.attribute = info.attribute;
    if (info.span)
        query.span = info.span;
    var evSession = evaluation.getDatabase("session");
    var evBrowser = evaluation.getDatabase("browser");
    evSession.nonExecuting = true;
    evBrowser.nonExecuting = true;
    eve.registerDatabase("evaluation-session", evSession);
    eve.registerDatabase("evaluation-browser", evBrowser);
    doQuery(queryId, query, spans, extraInfo);
    eve.unregisterDatabase("evaluation-session");
    eve.unregisterDatabase("evaluation-browser");
    evSession.nonExecuting = false;
    evBrowser.nonExecuting = false;
    var sessionIndex = eve.getDatabase("session").index;
    var queryInfo = sessionIndex.alookup("tag", "findAffector");
    if (queryInfo) {
        var entity = queryInfo.toValues()[0];
        var obj = sessionIndex.asObject(entity);
        console.log("FIND AFFECTOR", obj);
        if (obj.affector) {
            info.affector = obj.affector.map(function (affector) { return sessionIndex.asObject(affector, false, true); });
            return info;
        }
        else {
            info.affector = [];
            return info;
        }
    }
    return;
}
exports.findAffector = findAffector;
function findFailure(evaluation, info, spans, extraInfo) {
    var evSession = evaluation.getDatabase("session");
    var failingSpans = info.span = [];
    var sessionIndex = eve.getDatabase("session").index;
    for (var _i = 0, _a = info.block; _i < _a.length; _i++) {
        var queryBlockId = _a[_i];
        var found = void 0;
        for (var _b = 0, _c = evSession.blocks; _b < _c.length; _b++) {
            var block = _c[_b];
            if (block.id === queryBlockId) {
                found = block;
                break;
            }
        }
        var scan = blockToFailingScan(found);
        if (scan) {
            var level = sessionIndex.alookup("build-node", scan.id);
            if (level) {
                var analyzerScanId = level.toValues()[0];
                var analyzerScan = sessionIndex.asObject(analyzerScanId, false, true);
                failingSpans.push({ id: analyzerScanId, buildId: scan.id, block: found.id, start: analyzerScan.start, stop: analyzerScan.stop });
            }
        }
    }
    return info;
}
exports.findFailure = findFailure;
function findRootDrawers(evaluation, info, spans, extraInfo) {
    var queryId = "query|" + info.requestId;
    var query = { tag: "findRootDrawers" };
    var eve = doQuery(queryId, query, spans, extraInfo);
    var sessionIndex = eve.getDatabase("session").index;
    var queryInfo = sessionIndex.alookup("tag", "findRootDrawers");
    if (queryInfo) {
        var entity = queryInfo.toValues()[0];
        var obj = sessionIndex.asObject(entity);
        if (obj.drawer) {
            info.drawers = obj.drawer.map(function (id) { return sessionIndex.asObject(id, false, true); });
        }
        else {
            info.drawers = [];
        }
    }
    return info;
}
exports.findRootDrawers = findRootDrawers;
function findMaybeDrawers(evaluation, info, spans, extraInfo) {
    var queryId = "query|" + info.requestId;
    var query = { tag: "findMaybeDrawers" };
    var eve = doQuery(queryId, query, spans, extraInfo);
    var sessionIndex = eve.getDatabase("session").index;
    var queryInfo = sessionIndex.alookup("tag", "findMaybeDrawers");
    if (queryInfo) {
        var entity = queryInfo.toValues()[0];
        var obj = sessionIndex.asObject(entity);
        if (obj.drawer) {
            info.drawers = obj.drawer.map(function (id) { return sessionIndex.asObject(id, false, true); });
        }
        else {
            info.drawers = [];
        }
    }
    return info;
}
exports.findMaybeDrawers = findMaybeDrawers;
function blockToFailingScan(block) {
    var scan;
    for (var _i = 0, _a = block.strata; _i < _a.length; _i++) {
        var stratum = _a[_i];
        if (stratum.resultCount === 0) {
            var solverInfo = stratum.solverInfo;
            var scanIx = 0;
            var maxFailures = 0;
            var maxIx = 0;
            for (var _b = 0, solverInfo_1 = solverInfo; _b < solverInfo_1.length; _b++) {
                var failures = solverInfo_1[_b];
                if (failures > maxFailures) {
                    maxFailures = failures;
                    maxIx = scanIx;
                }
                scanIx++;
            }
            scan = stratum.scans[maxIx];
            break;
        }
    }
    return scan;
}
function resultsToCardinalities(results) {
    var cardinalities = [];
    var ix = 0;
    while (ix < results[0].length) {
        cardinalities[ix] = { cardinality: 0, values: {} };
        ix++;
    }
    for (var _i = 0, results_1 = results; _i < results_1.length; _i++) {
        var result = results_1[_i];
        var ix_1 = 0;
        for (var _a = 0, result_1 = result; _a < result_1.length; _a++) {
            var value = result_1[_a];
            var info = cardinalities[ix_1];
            if (!info.values[value]) {
                info.values[value] = true;
                info.cardinality++;
            }
            ix_1++;
        }
    }
    return cardinalities;
}
function findResultRows(results, registers, values) {
    var found = [];
    for (var _i = 0, results_2 = results; _i < results_2.length; _i++) {
        var result = results_2[_i];
        var skip = void 0;
        var ix = 0;
        for (var _a = 0, registers_1 = registers; _a < registers_1.length; _a++) {
            var register = registers_1[_a];
            if (result[register] !== values[ix]) {
                skip = true;
                break;
            }
            ix++;
        }
        if (!skip) {
            found.push(result);
        }
    }
    return found;
}
//# sourceMappingURL=analyzer.js.map