"use strict";
var util_1 = require("./util");
var renderer_1 = require("./renderer");
var ide_1 = require("./ide");
var browser = require("./runtime/browser");
var db_1 = require("./db");
function analyticsEvent(kind, label, value) {
    var ga = window["ga"];
    if (!ga)
        return;
    ga("send", "event", "ide", kind, label, value);
}
// @NOTE: Intrepid user: Please don't change this. It won't work just yet!
window["local"] = true;
//---------------------------------------------------------
// Utilities
//---------------------------------------------------------
function safeEav(eav) {
    if (eav[0].type == "uuid") {
        eav[0] = "\u2991" + eav[0].value + "\u2992";
    }
    if (eav[1].type == "uuid") {
        eav[1] = "\u2991" + eav[1].value + "\u2992";
    }
    if (eav[2].type == "uuid") {
        eav[2] = "\u2991" + eav[2].value + "\u2992";
    }
    return eav;
}
//---------------------------------------------------------
// Connect the websocket, send the ui code
//---------------------------------------------------------
exports.DEBUG = false;
exports.indexes = {
    records: new db_1.IndexScalar(),
    dirty: new db_1.IndexList(),
    byName: new db_1.IndexList(),
    byTag: new db_1.IndexList(),
    // renderer indexes
    byClass: new db_1.IndexList(),
    byStyle: new db_1.IndexList(),
    byChild: new db_1.IndexScalar() // child -> E
};
function handleDiff(state, diff) {
    var diffEntities = 0;
    var entitiesWithUpdatedValues = {};
    var records = exports.indexes.records;
    var dirty = exports.indexes.dirty;
    for (var _i = 0, _a = diff.remove; _i < _a.length; _i++) {
        var remove = _a[_i];
        var _b = safeEav(remove), e = _b[0], a = _b[1], v = _b[2];
        if (!records.index[e]) {
            console.error("Attempting to remove an attribute of an entity that doesn't exist: " + e);
            continue;
        }
        var entity = records.index[e];
        var values = entity[a];
        if (!values)
            continue;
        dirty.insert(e, a);
        if (values.length <= 1 && values[0] === v) {
            delete entity[a];
        }
        else {
            var ix = values.indexOf(v);
            if (ix === -1)
                continue;
            values.splice(ix, 1);
        }
        // Update indexes
        if (a === "tag")
            exports.indexes.byTag.remove(v, e);
        else if (a === "name")
            exports.indexes.byName.remove(v, e);
        else if (a === "class")
            exports.indexes.byClass.remove(v, e);
        else if (a === "style")
            exports.indexes.byStyle.remove(v, e);
        else if (a === "value")
            entitiesWithUpdatedValues[e] = true;
    }
    for (var _c = 0, _d = diff.insert; _c < _d.length; _c++) {
        var insert = _d[_c];
        var _e = safeEav(insert), e = _e[0], a = _e[1], v = _e[2];
        var entity = records.index[e];
        if (!entity) {
            entity = {};
            records.insert(e, entity);
            diffEntities++; // Nuke this and use records.dirty
        }
        dirty.insert(e, a);
        if (!entity[a])
            entity[a] = [];
        entity[a].push(v);
        // Update indexes
        if (a === "tag")
            exports.indexes.byTag.insert(v, e);
        else if (a === "name")
            exports.indexes.byName.insert(v, e);
        else if (a === "class")
            exports.indexes.byClass.insert(v, e);
        else if (a === "style")
            exports.indexes.byStyle.insert(v, e);
        else if (a === "children")
            exports.indexes.byChild.insert(v, e);
        else if (a === "value")
            entitiesWithUpdatedValues[e] = true;
    }
    // Update value syncing
    for (var e in entitiesWithUpdatedValues) {
        var a = "value";
        var entity = records.index[e];
        if (!entity[a]) {
            renderer_1.sentInputValues[e] = [];
        }
        else {
            if (entity[a].length > 1)
                console.error("Unable to set 'value' multiple times on entity", e, entity[a]);
            var value = entity[a][0];
            var sent = renderer_1.sentInputValues[e];
            if (sent && sent[0] === value) {
                dirty.remove(e, a);
                sent.shift();
            }
            else {
                renderer_1.sentInputValues[e] = [];
            }
        }
    }
    // Trigger all the subscribers of dirty indexes
    for (var indexName in exports.indexes) {
        exports.indexes[indexName].dispatchIfDirty();
    }
    // Clear dirty states afterwards so a subscriber of X can see the dirty state of Y reliably
    for (var indexName in exports.indexes) {
        exports.indexes[indexName].clearDirty();
    }
    // Finally, wipe the dirty E -> A index
    exports.indexes.dirty.clearIndex();
}
var prerendering = false;
var frameRequested = false;
function createSocket(local) {
    if (local === void 0) { local = false; }
    exports.socket;
    if (!local) {
        // socket = new WebSocket("ws://" + window.location.host + window.location.pathname, "eve-json");
        if (location.protocol.indexOf("https") > -1) {
            exports.socket = new WebSocket("wss://" + window.location.host + "/ws");
        }
        else {
            exports.socket = new WebSocket("ws://" + window.location.host + "/ws");
        }
    }
    else {
        exports.socket = {
            readyState: 1,
            send: function (json) {
                browser.responder.handleEvent(json);
            }
        };
    }
    exports.socket.onopen = onOpen;
    exports.socket.onclose = onClose;
    exports.socket.onmessage = onMessage;
    if (local) {
        browser.init("");
    }
    return exports.socket;
}
function onMessage(msg) {
    var data = JSON.parse(msg.data);
    if (data.type == "result") {
        var state = { entities: exports.indexes.records.index, dirty: exports.indexes.dirty.index };
        handleDiff(state, data);
        var diffEntities = 0;
        if (exports.DEBUG) {
            console.groupCollapsed("Received Result +" + data.insert.length + "/-" + data.remove.length + " (\u2202Entities: " + diffEntities + ")");
            if (exports.DEBUG === true || exports.DEBUG === "diff") {
                console.table(data.insert);
                console.table(data.remove);
            }
            if (exports.DEBUG === true || exports.DEBUG === "state") {
                // we clone here to keep the entities fresh when you want to thumb through them in the log later (since they are rendered lazily)
                var copy = util_1.clone(state.entities);
                console.info("Entities", copy);
                console.info("Indexes", exports.indexes);
            }
            console.groupEnd();
        }
        if (document.readyState === "complete") {
            renderer_1.renderEve();
        }
        else if (!prerendering) {
            prerendering = true;
            document.addEventListener("DOMContentLoaded", function () {
                renderer_1.renderEve();
            });
        }
    }
    else if (data.type == "initLocal") {
        exports.socket = createSocket(true);
        browser.init("");
    }
    else if (data.type == "parse") {
        _ide.loadDocument(data.generation, data.text, data.spans, data.extraInfo); // @FIXME
    }
    else if (data.type == "comments") {
        _ide.injectSpans(data.spans, data.extraInfo);
    }
    else if (data.type == "findNode") {
        _ide.attachView(data.recordId, data.spanId);
    }
    else if (data.type == "error") {
        _ide.injectNotice("error", data.message);
    }
    else if (_ide.languageService.handleMessage(data)) {
    }
    else {
        console.warn("UNKNOWN MESSAGE", data);
    }
}
function onOpen() {
    console.log("Connected to eve server!");
    initializeIDE();
    exports.socket.send(JSON.stringify({ type: "init", url: location.pathname }));
    onHashChange({});
    setInterval(function () {
        exports.socket.send("\"PING\"");
    }, 30000);
}
function onClose() {
    console.log("Disconnected from eve server!");
}
function renderOnChange(index, dirty) {
    renderer_1.renderRecords();
}
exports.indexes.dirty.subscribe(renderOnChange);
function printDebugRecords(index, dirty) {
    for (var recordId in dirty) {
        var record = exports.indexes.records.index[recordId];
        if (record.tag && record.tag.indexOf("debug") !== -1) {
            console.info(record);
        }
    }
}
exports.indexes.dirty.subscribe(printDebugRecords);
function subscribeToTagDiff(tag, callback) {
    exports.indexes.dirty.subscribe(function (index, dirty) {
        var records = {};
        var inserts = [];
        var removes = [];
        var dirtyOldRecords = exports.indexes.byTag.dirty[tag] || [];
        for (var _i = 0, dirtyOldRecords_1 = dirtyOldRecords; _i < dirtyOldRecords_1.length; _i++) {
            var recordId = dirtyOldRecords_1[_i];
            var record = exports.indexes.records.index[recordId];
            if (!record || !record.tag || record.tag.indexOf(tag) === -1) {
                removes.push(recordId);
            }
        }
        for (var recordId in dirty) {
            var record = exports.indexes.records.index[recordId];
            if (record.tag && record.tag.indexOf(tag) !== -1) {
                inserts.push(recordId);
                records[recordId] = record;
            }
        }
        callback(inserts, removes, records);
    });
}
subscribeToTagDiff("editor", function (inserts, removes, records) { return _ide.updateActions(inserts, removes, records); });
subscribeToTagDiff("view", function (inserts, removes, records) { return _ide.updateViews(inserts, removes, records); });
//---------------------------------------------------------
// Communication helpers
//---------------------------------------------------------
function recordToEAVs(record) {
    if (!record)
        return;
    var eavs = [];
    if (record.id && record.id.constructor === Array)
        throw new Error("Unable to apply multiple ids to the same record: " + JSON.stringify(record));
    if (!record.id)
        record.id = util_1.uuid();
    record.id = "" + record.id + "";
    var e = record.id;
    for (var a in record) {
        if (record[a] === undefined)
            continue;
        if (a === "id")
            continue;
        if (record[a].constructor === Array) {
            for (var _i = 0, _a = record[a]; _i < _a.length; _i++) {
                var v = _a[_i];
                if (typeof v === "object") {
                    eavs.push.apply(eavs, recordToEAVs(v));
                    eavs.push([e, a, v.id]);
                }
                else if (v !== undefined) {
                    eavs.push([e, a, v]);
                }
            }
        }
        else {
            var v = record[a];
            if (typeof v === "object") {
                eavs.push.apply(eavs, recordToEAVs(v));
                eavs.push([e, a, v.id]);
            }
            else if (v !== undefined) {
                eavs.push([e, a, v]);
            }
        }
    }
    return eavs;
}
function send(message) {
    if (exports.socket && exports.socket.readyState == 1) {
        exports.socket.send(JSON.stringify(message));
    }
}
exports.send = send;
function sendEvent(records) {
    if (!records || !records.length)
        return;
    var eavs = [];
    for (var _i = 0, records_1 = records; _i < records_1.length; _i++) {
        var record = records_1[_i];
        eavs.push.apply(eavs, recordToEAVs(record));
    }
    if (exports.socket && exports.socket.readyState == 1) {
        exports.socket.send(JSON.stringify({ type: "event", insert: eavs }));
    }
}
exports.sendEvent = sendEvent;
//---------------------------------------------------------
// Handlers
//---------------------------------------------------------
function onHashChange(event) {
    if (_ide.loaded)
        changeDocument();
    var hash = window.location.hash.split("#/")[2];
    if (hash) {
        var segments = hash.split("/").map(function (seg, ix) {
            return { id: util_1.uuid(), index: ix + 1, value: seg };
        });
        sendEvent([
            { tag: "url-change", "hash-segment": segments }
        ]);
    }
}
window.addEventListener("hashchange", onHashChange);
//---------------------------------------------------------
// Initialize an IDE
//---------------------------------------------------------
var _ide = new ide_1.IDE();
_ide.onChange = function (ide) {
    var generation = ide.generation;
    var md = ide.editor.toMarkdown();
    console.groupCollapsed("SENT " + generation);
    console.info(md);
    console.groupEnd();
    if (exports.socket && exports.socket.readyState == 1) {
        exports.socket.send(JSON.stringify({ scope: "root", type: "parse", generation: generation, code: md }));
    }
};
_ide.onEval = function (ide, persist) {
    if (exports.socket && exports.socket.readyState == 1) {
        exports.socket.send(JSON.stringify({ type: "eval", persist: persist }));
    }
};
_ide.onLoadFile = function (ide, documentId, code) {
    if (exports.socket && exports.socket.readyState == 1) {
        exports.socket.send(JSON.stringify({ type: "close" }));
        exports.socket.send(JSON.stringify({ scope: "root", type: "parse", code: code }));
        exports.socket.send(JSON.stringify({ type: "eval", persist: false }));
    }
    history.pushState({}, "", location.pathname + ("#/examples/" + documentId));
    analyticsEvent("load-document", documentId);
};
_ide.onTokenInfo = function (ide, tokenId) {
    if (exports.socket && exports.socket.readyState == 1) {
        exports.socket.send(JSON.stringify({ type: "tokenInfo", tokenId: tokenId }));
    }
};
_ide.loadWorkspace("examples", window["examples"]);
function initializeIDE() {
    changeDocument();
}
function changeDocument() {
    if (exports.socket.readyState == 1) {
        var docId = "quickstart.eve";
        var path = location.hash.split("#/")[1];
        if (path) {
            if (path[path.length - 1] === "/")
                path = path.slice(0, -1);
            docId = path.split("/").pop();
        }
        if (!docId)
            return;
        if (docId === _ide.documentId)
            return;
        try {
            _ide.loadFile(docId);
        }
        catch (err) {
            _ide.injectNotice("info", "Unable to load unknown file: " + docId);
        }
        _ide.render();
    }
    else {
        throw new Error("Cannot initialize until connected.");
    }
}
_ide.render();
console.log(_ide);
window.document.body.addEventListener("dragover", function (e) {
    e.preventDefault();
});
window.document.body.addEventListener("drop", function (e) {
    if (e.dataTransfer.files.length) {
        var reader_1 = new FileReader();
        reader_1.onload = function (event) {
            exports.socket.send("{\"type\": \"load\", \"info\": " + reader_1.result + "}");
        };
        reader_1.readAsText(e.dataTransfer.files[0]);
    }
    e.preventDefault();
    e.stopPropagation();
});
createSocket(global["local"]);
//# sourceMappingURL=client.js.map