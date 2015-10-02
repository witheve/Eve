/// <reference path="api.ts" />
var client;
(function (client) {
    var ixer = Api.ixer;
    client.onReceive = function () { return undefined; };
    client.showNotice = function (notice) { return undefined; };
    client.hideNotice = function (notice) { return undefined; };
    function isUndefined(val) {
        return val === undefined;
    }
    /* Integrated Debugging Tooling */
    function nukeTable(viewId) {
        var fieldIds = Api.ixer.getFields(viewId);
        var toRemove = Api.ixer.facts(viewId);
        sendToServer({ changes: [[viewId, fieldIds, [], toRemove]] }, true);
    }
    client.nukeTable = nukeTable;
    function formatTime(time) {
        time = time || new Date();
        return pad("", time.getHours(), "0", 2) + ":" + pad("", time.getMinutes(), "0", 2) + ":" + pad("", time.getSeconds(), "0", 2);
    }
    function pad(left, right, pad, length) {
        if (right === void 0) { right = ""; }
        if (pad === void 0) { pad = " "; }
        if (length === void 0) { length = 120; }
        left = "" + left;
        right = "" + right;
        var padding = "";
        var delta = length - left.length - right.length;
        if (delta > 0) {
            padding = new Array(delta + 1).join(pad);
        }
        return left + padding + right;
    }
    function writeDataToConsole(data, verbosity) {
        verbosity = +verbosity;
        var consoleTable = console["table"].bind(console) || console.log.bind(console);
        data.changes.forEach(function (change) {
            if (change[2].length || change[3].length) {
                if (verbosity == 1) {
                    console.log(" ", change[0], "+" + change[2].length + "/-" + change[3].length);
                }
                if (verbosity == 2) {
                    console.log(" ", change[0], "+" + change[2].length + "/-" + change[3].length, { fields: change[1], inserts: change[2], removes: change[3] });
                }
                if (verbosity == 3) {
                    console.log(" ", change[0], "+" + change[2].length + "/-" + change[3].length);
                    console.groupCollapsed("   inserts " + change[1]);
                    consoleTable(change[2]);
                    console.groupEnd();
                    console.groupCollapsed("   removes " + change[1]);
                    consoleTable(change[3]);
                    console.groupEnd();
                }
            }
        });
    }
    // Generate debugging information on incoming or outgoing payloads.
    function getDataStats(data) {
        var totalAdds = 0;
        var totalRemoves = 0;
        var malformedDiffs = [];
        var badValues = [];
        data.changes.forEach(function (change) {
            totalAdds += change[2].length;
            totalRemoves += change[3].length;
            // Simple check to notify programmers of definitely unhealthy payloads they may be sending.
            var hasMalformedDiffs = false;
            var hasBadValues = false;
            change[2].forEach(function (diff) {
                hasMalformedDiffs = hasMalformedDiffs || (diff.length !== change[1].length);
                hasBadValues = hasBadValues || diff.some(isUndefined);
            });
            change[3].forEach(function (diff) {
                hasMalformedDiffs = hasMalformedDiffs || (diff.length !== change[1].length);
                hasBadValues = hasBadValues || diff.some(isUndefined);
            });
            if (hasMalformedDiffs) {
                malformedDiffs.push(change[0]);
            }
            if (hasBadValues) {
                badValues.push(change[0]);
            }
        });
        return { adds: totalAdds, removes: totalRemoves, malformedDiffs: malformedDiffs, badValues: badValues };
    }
    function filterFactsBySession(facts, sessionFieldIx, session) {
        var neue = [];
        for (var _i = 0; _i < facts.length; _i++) {
            var fact = facts[_i];
            if (fact[sessionFieldIx] !== session) {
                neue.push(fact);
            }
        }
        return neue;
    }
    var server = { connected: false, queue: [], initialized: false, lastSent: [], ws: null, dead: false };
    function connectToServer() {
        var queue = server.queue;
        var wsAddress = "ws://localhost:2794";
        if (window.location.protocol !== "file:") {
            wsAddress = "ws://" + window.location.hostname + ":2794";
        }
        var ws = new WebSocket(wsAddress, []);
        server.ws = ws;
        ws.onerror = ws.onclose = function (error) {
            server.connected = false;
            server.dead = true;
            reconnect();
            client.showNotice({ content: "Error: Cannot communicate with Eve Server!", type: "error", id: "server dead", duration: 0 });
        };
        ws.onopen = function () {
            server.connected = true;
            if (server.dead) {
                server.dead = false;
                client.hideNotice({ noticeId: "server dead" });
                client.showNotice({ content: "Reconnected to server!" });
            }
            for (var i = 0, len = queue.length; i < len; i++) {
                sendToServer(queue[i], false);
            }
        };
        ws.onmessage = function (e) {
            var start = Api.now();
            var time;
            var data = JSON.parse(e.data);
            var time = Api.now() - start;
            if (time > 5) {
                console.log("slow parse (> 5ms):", time);
            }
            var initializing = !server.initialized;
            if (data.commands) {
                for (var _i = 0, _a = data.commands; _i < _a.length; _i++) {
                    var _b = _a[_i], command = _b[0], args = _b.slice(1);
                    // If we are loading in this event, we should ignore tags and accept all diffs.
                    if (command === "loaded" || command === "events set") {
                        initializing = true;
                    }
                }
            }
            // For an explanation of what changes are synced, check: <https://github.com/witheve/Eve/blob/master/design/sync.md>
            var changes = [];
            var changedViews = [];
            for (var _c = 0, _d = data.changes; _c < _d.length; _c++) {
                var change = _d[_c];
                var view = change[0], fields = change[1], inserts = change[2], removes = change[3];
                if (!initializing && Api.code.hasTag(view, "client")) {
                    // If view is client-controlled, discard any changes originating from our session.
                    var sessionFieldIx;
                    for (var fieldIx = 0; fieldIx < fields.length; fieldIx++) {
                        if (Api.code.hasTag(fields[fieldIx], "session")) {
                            sessionFieldIx = fieldIx;
                            break;
                        }
                    }
                    changedViews.push(view);
                    changes.push([view,
                        fields,
                        filterFactsBySession(inserts, sessionFieldIx, data.session),
                        filterFactsBySession(removes, sessionFieldIx, data.session)]);
                }
                else if (!initializing && Api.code.hasTag(view, "editor")) {
                    // If view is editor controlled, we discard all changes.
                    continue;
                }
                else {
                    // If view is server controlled, accept all changes.
                    changes.push(change);
                }
            }
            if (DEBUG.RECEIVE) {
                var stats = getDataStats({ session: data.session, changes: changes, commands: data.commands });
                if (stats.adds || stats.removes) {
                    var header = "[client:received][+" + stats.adds + "/-" + stats.removes + "]";
                    console.groupCollapsed(pad(header, formatTime()));
                    if (stats.malformedDiffs.length) {
                        console.warn("The following views have malformed diffs:", stats.malformedDiffs);
                    }
                    if (stats.badValues.length) {
                        console.warn("The following views have bad values:", stats.badValues);
                    }
                    writeDataToConsole({ changes: changes }, DEBUG.RECEIVE);
                    console.groupEnd();
                }
                start = Api.now();
            }
            ixer.handleMapDiffs(changes);
            // If we haven't initialized the client yet, do so after we've handled the initial payload, so it can be accessed via the indexer.
            if (initializing) {
                var eventId = (ixer.facts("client event") || []).length; // Ensure eids are monotonic across sessions.
                // @NOTE: Is this the right behavior? Or should we GC the previous environment and initialize a new one?
                if (!server.initialized) {
                    for (var _e = 0; _e < afterInitFuncs.length; _e++) {
                        var initFunc = afterInitFuncs[_e];
                        initFunc();
                    }
                }
                server.initialized = true;
            }
            time = Api.now() - start;
            if (DEBUG.RECEIVE) {
                if (time > 5) {
                    console.log("slow handleDiffs (> 5ms):", time);
                }
            }
            client.onReceive(changedViews, data.commands);
        };
    }
    function sendToServer(message, formatted, commands) {
        if (!server.connected) {
            console.warn("Not connected to server, adding message to queue.");
            server.queue.push(message);
        }
        else {
            if (!formatted) {
                message = toMapDiffs(message);
            }
            var payload = message;
            if (commands) {
                payload.commands = commands;
            }
            if (DEBUG.SEND) {
                var stats = getDataStats(payload);
                if (stats.adds || stats.removes) {
                    var header = "[client:sent][+" + stats.adds + "/-" + stats.removes + "]";
                    console.groupCollapsed(pad(header, formatTime()));
                    if (stats.malformedDiffs.length) {
                        console.warn("The following views have malformed diffs:", stats.malformedDiffs);
                    }
                    if (stats.badValues.length) {
                        console.warn("The following views have bad values:", stats.badValues);
                    }
                    writeDataToConsole(payload, DEBUG.SEND);
                    console.groupEnd();
                }
            }
            if (payload.changes.length || payload.commands && payload.commands.length) {
                server.ws.send(CBOR.encode(payload));
            }
        }
    }
    client.sendToServer = sendToServer;
    function toMapDiffs(diffs) {
        // Deduplicate diffs prior to sending with last write wins.
        var deduped = [];
        outer: for (var ix = diffs.length - 1; ix >= 0; ix--) {
            var diff = diffs[ix];
            for (var needleIx = deduped.length - 1; needleIx >= 0; needleIx--) {
                if (Api.arraysIdentical(diff[2], deduped[needleIx][2]) && diff[0] === deduped[needleIx][0]) {
                    continue outer;
                }
            }
            deduped.push(diff);
        }
        diffs = deduped;
        var final = { field: null };
        for (var i = 0, len = diffs.length; i < len; i++) {
            var cur = diffs[i];
            var table = cur[0];
            var action = cur[1];
            var fact = cur[2];
            if (!final[table]) {
                final[table] = { inserted: [], removed: [] };
            }
            final[table][action].push(fact);
        }
        // If fields are added to a view at the same time as new data is, our local fields list will be out of sync.
        // neueFields will contain any additional fields we need to include in the mapping we send to the server.
        var neueFields = {};
        for (var fieldIx = 0; final.field && fieldIx < final.field.inserted.length; fieldIx++) {
            // @FIXME: These must be inserted in order to work.
            // @FIXME: Does not account for removed fields, only appended fields.
            var field = final.field.inserted[fieldIx];
            var fieldViewId = field[0];
            var fieldId = field[1];
            if (!neueFields[fieldViewId]) {
                neueFields[fieldViewId] = (ixer.index("view to fields")[fieldViewId] || []).slice();
            }
            neueFields[fieldViewId].push(fieldId);
        }
        var changes = [];
        for (var table in final) {
            if (!final[table])
                continue;
            var fieldIds = Api.ixer.getFields(table) || [];
            fieldIds = fieldIds.concat(neueFields[table] || []);
            changes.push([table, fieldIds, final[table].inserted, final[table].removed]);
        }
        return { changes: changes };
    }
    client.toMapDiffs = toMapDiffs;
    var afterInitFuncs = [];
    function afterInit(func) {
        afterInitFuncs.push(func);
    }
    client.afterInit = afterInit;
    // Try to reconnect to the server with linear falloff.
    var checkReconnectTimeout;
    var checkReconnectDelay = 0;
    function reconnect() {
        if (checkReconnectTimeout) {
            return;
        }
        checkReconnectTimeout = setTimeout(tryConnect, 2000 + checkReconnectDelay++ * 2000);
        connectToServer();
    }
    function tryConnect() {
        checkReconnectTimeout = undefined;
        if (server.connected) {
            checkReconnectDelay = 0;
        }
        else {
            reconnect();
        }
    }
    document.addEventListener("DOMContentLoaded", reconnect);
})(client || (client = {}));
//# sourceMappingURL=client.js.map