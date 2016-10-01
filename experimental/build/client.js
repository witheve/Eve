"use strict";
var util_1 = require("./util");
var renderer_1 = require("./renderer");
var editor_1 = require("./editor");
var db_1 = require("./db");
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
        else if (a === "children")
            exports.indexes.byChild.remove(v, e);
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
var socket = new WebSocket("ws://" + window.location.host + window.location.pathname, "eve-json");
socket.onmessage = function (msg) {
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
                console.log("Entities", copy);
                console.log("Indexes", exports.indexes);
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
    else if (data.type == "error") {
        console.error(data.message, data);
    }
};
socket.onopen = function () {
    console.log("Connected to eve server!");
    onHashChange({});
};
socket.onclose = function () {
    console.log("Disconnected from eve server!");
};
;
;
exports.parseInfo = { blocks: [], lines: [], blockIds: {}, tokenIds: {} };
var updateEditorParse = util_1.debounce(editor_1.handleEditorParse, 1); // @FIXME: We need to listen for any changes to records with those tags
function tokensToParseInfo(tokenIds) {
    var records = exports.indexes.records.index;
    // @FIXME: we don't want to be incremental right now, it's tough.
    tokenIds = exports.indexes.byTag.index["token"];
    var lines = [];
    for (var _i = 0, tokenIds_1 = tokenIds; _i < tokenIds_1.length; _i++) {
        var tokenId = tokenIds_1[_i];
        // if(parseInfo.tokenIds[tokenId]) {
        //   let ix = parseInfo..indexOf(parseInfo.tokenIds[tokenId]);
        //   parseInfo.tokens.splice(ix, 1);
        //   parseInfo.tokenIds[tokenId] = undefined;
        // }
        var token = records[tokenId];
        if (!token)
            continue;
        var line = token.line[0];
        if (!lines[line]) {
            lines[line] = [];
        }
        exports.parseInfo.tokenIds[tokenId] = {
            id: token.id[0],
            type: token.type[0],
            sort: token.sort[0],
            line: token.line[0],
            surrogateOffset: token.surrogateOffset[0],
            surrogateLength: token.surrogateLength[0]
        };
        lines[line].push(exports.parseInfo.tokenIds[tokenId]);
    }
    for (var _a = 0, lines_1 = lines; _a < lines_1.length; _a++) {
        var line = lines_1[_a];
        if (!line)
            continue;
        line.sort(util_1.sortComparator);
    }
    exports.parseInfo.lines = lines;
    updateEditorParse(exports.parseInfo);
}
exports.indexes.byTag.subscribe(function (index, dirty) {
    if (!dirty["token"])
        return;
    tokensToParseInfo(dirty["token"]);
});
function blocksToParseInfo(blockIds) {
    var records = exports.indexes.records.index;
    // @FIXME: we don't want to be incremental right now, it's tough.
    blockIds = exports.indexes.byTag.index["block"];
    var blocks = [];
    for (var _i = 0, blockIds_1 = blockIds; _i < blockIds_1.length; _i++) {
        var blockId = blockIds_1[_i];
        // if(parseInfo.blockIds[blockId]) {
        //   let ix = parseInfo.blocks.indexOf(parseInfo.blockIds[blockId]);
        //   parseInfo.blocks.splice(ix, 1);
        //   parseInfo.blockIds[blockId] = undefined;
        // }
        var block = records[blockId];
        if (!block)
            continue;
        exports.parseInfo.blockIds[blockId] = { id: blockId, name: block.name[0], sort: block.sort[0], line: block.line[0] };
        blocks.push(exports.parseInfo.blockIds[blockId]);
    }
    blocks.sort(util_1.sortComparator);
    exports.parseInfo.blocks = blocks;
    updateEditorParse(exports.parseInfo);
}
exports.indexes.byTag.subscribe(function (index, dirty) {
    if (!dirty["block"])
        return;
    blocksToParseInfo(dirty["block"]);
});
function handleEditorUpdates(index, dirty) {
    var blockIds = [];
    var tokenIds = [];
    for (var recordId in dirty) {
        if (exports.parseInfo.blockIds[recordId])
            blockIds.push(recordId);
        if (exports.parseInfo.tokenIds[recordId])
            tokenIds.push(recordId);
    }
    if (blockIds.length)
        blocksToParseInfo(blockIds);
    if (tokenIds.length)
        tokensToParseInfo(tokenIds);
}
exports.indexes.dirty.subscribe(handleEditorUpdates);
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
                else {
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
            else {
                eavs.push([e, a, v]);
            }
        }
    }
    return eavs;
}
function sendEvent(records) {
    if (!records || !records.length)
        return;
    var eavs = [];
    for (var _i = 0, records_1 = records; _i < records_1.length; _i++) {
        var record = records_1[_i];
        eavs.push.apply(eavs, recordToEAVs(record));
    }
    if (socket && socket.readyState == 1) {
        socket.send(JSON.stringify({ type: "event", insert: eavs }));
    }
}
exports.sendEvent = sendEvent;
function sendSwap(query) {
    if (socket && socket.readyState == 1) {
        socket.send(JSON.stringify({ scope: "root", type: "swap", query: query }));
    }
}
exports.sendSwap = sendSwap;
function sendSave(query) {
    if (socket && socket.readyState == 1) {
        socket.send(JSON.stringify({ scope: "root", type: "save", query: query }));
    }
}
exports.sendSave = sendSave;
function sendParse(query) {
    if (socket && socket.readyState == 1) {
        socket.send(JSON.stringify({ scope: "root", type: "parse", query: query }));
    }
}
exports.sendParse = sendParse;
//---------------------------------------------------------
// Handlers
//---------------------------------------------------------
function onHashChange(event) {
    var hash = window.location.hash.substr(1);
    if (hash[0] == "/")
        hash = hash.substr(1);
    var segments = hash.split("/").map(function (seg, ix) {
        return { id: util_1.uuid(), index: ix + 1, value: seg };
    });
    sendEvent([
        { tag: "url-change", "hash-segment": segments }
    ]);
}
window.addEventListener("hashchange", onHashChange);
//# sourceMappingURL=client.js.map