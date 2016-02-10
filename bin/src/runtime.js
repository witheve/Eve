var utils_1 = require("./utils");
var runtime = exports;
exports.MAX_NUMBER = 9007199254740991;
exports.INCREMENTAL = false;
function objectsIdentical(a, b) {
    var aKeys = Object.keys(a);
    for (var _i = 0; _i < aKeys.length; _i++) {
        var key = aKeys[_i];
        //TODO: handle non-scalar values
        if (a[key] !== b[key])
            return false;
    }
    return true;
}
function indexOfFact(haystack, needle) {
    var ix = 0;
    for (var _i = 0; _i < haystack.length; _i++) {
        var fact = haystack[_i];
        if (fact.__id === needle.__id) {
            return ix;
        }
        ix++;
    }
    return -1;
}
function removeFact(haystack, needle) {
    var ix = indexOfFact(haystack, needle);
    if (ix > -1)
        haystack.splice(ix, 1);
    return haystack;
}
exports.removeFact = removeFact;
function diffAddsAndRemoves(adds, removes) {
    var localHash = {};
    var hashToFact = {};
    var hashes = [];
    for (var _i = 0; _i < adds.length; _i++) {
        var add = adds[_i];
        var hash = add.__id;
        if (localHash[hash] === undefined) {
            localHash[hash] = 1;
            hashToFact[hash] = add;
            hashes.push(hash);
        }
        else {
            localHash[hash]++;
        }
        add.__id = hash;
    }
    for (var _a = 0; _a < removes.length; _a++) {
        var remove = removes[_a];
        var hash = remove.__id;
        if (localHash[hash] === undefined) {
            localHash[hash] = -1;
            hashToFact[hash] = remove;
            hashes.push(hash);
        }
        else {
            localHash[hash]--;
        }
        remove.__id = hash;
    }
    var realAdds = [];
    var realRemoves = [];
    for (var _b = 0; _b < hashes.length; _b++) {
        var hash = hashes[_b];
        var count = localHash[hash];
        if (count > 0) {
            var fact = hashToFact[hash];
            realAdds.push(fact);
        }
        else if (count < 0) {
            var fact = hashToFact[hash];
            realRemoves.push(fact);
        }
    }
    return { adds: realAdds, removes: realRemoves };
}
function generateEqualityFn(keys) {
    return new Function("a", "b", "return " + keys.map(function (key, ix) {
        if (key.constructor === Array) {
            return "a['" + key[0] + "']['" + key[1] + "'] === b['" + key[0] + "']['" + key[1] + "']";
        }
        else {
            return "a[\"" + key + "\"] === b[\"" + key + "\"]";
        }
    }).join(" && ") + ";");
}
function generateStringFn(keys) {
    var keyStrings = [];
    for (var _i = 0; _i < keys.length; _i++) {
        var key = keys[_i];
        if (key.constructor === Array) {
            keyStrings.push("a['" + key[0] + "']['" + key[1] + "']");
        }
        else {
            keyStrings.push("a['" + key + "']");
        }
    }
    var final = keyStrings.join(' + "|" + ');
    return new Function("a", "return " + final + ";");
}
function generateUnprojectedSorterCode(unprojectedSize, sorts) {
    var conditions = [];
    var path = [];
    var distance = unprojectedSize;
    for (var _i = 0; _i < sorts.length; _i++) {
        var sort = sorts[_i];
        var condition = "";
        for (var _a = 0; _a < path.length; _a++) {
            var prev = path[_a];
            var table_1 = prev[0], key_1 = prev[1];
            condition += "unprojected[j-" + (distance - table_1) + "]['" + key_1 + "'] === item" + table_1 + "['" + key_1 + "'] && ";
        }
        var table = sort[0], key = sort[1], dir = sort[2];
        var op = ">";
        if (dir === "descending") {
            op = "<";
        }
        condition += "unprojected[j-" + (distance - table) + "]['" + key + "'] " + op + " item" + table + "['" + key + "']";
        conditions.push(condition);
        path.push(sort);
    }
    var items = [];
    var repositioned = [];
    var itemAssignments = [];
    for (var ix = 0; ix < distance; ix++) {
        items.push("item" + ix + " = unprojected[j+" + ix + "]");
        repositioned.push("unprojected[j+" + ix + "] = unprojected[j - " + (distance - ix) + "]");
        itemAssignments.push(("unprojected[j+" + ix + "] = item" + ix));
    }
    return "for (var i = 0, len = unprojected.length; i < len; i += " + distance + ") {\n      var j = i, " + items.join(", ") + ";\n      for(; j > " + (distance - 1) + " && (" + conditions.join(" || ") + "); j -= " + distance + ") {\n        " + repositioned.join(";\n") + "\n      }\n      " + itemAssignments.join(";\n") + "\n  }";
}
function generateCollector(keys) {
    var code = "var runtime = this;\n";
    var ix = 0;
    var checks = "";
    var removes = "var cur = index";
    for (var _i = 0; _i < keys.length; _i++) {
        var key = keys[_i];
        if (key.constructor === Array) {
            removes += "[remove['" + key[0] + "']['" + key[1] + "']]";
        }
        else {
            removes += "[remove['" + key + "']]";
        }
    }
    removes += ";\nruntime.removeFact(cur, remove);";
    for (var _a = 0; _a < keys.length; _a++) {
        var key = keys[_a];
        ix++;
        if (key.constructor === Array) {
            checks += "value = add['" + key[0] + "']['" + key[1] + "']\n";
        }
        else {
            checks += "value = add['" + key + "']\n";
        }
        var path = "cursor[value]";
        checks += "if(!" + path + ") " + path + " = ";
        if (ix === keys.length) {
            checks += "[]\n";
        }
        else {
            checks += "{}\n";
        }
        checks += "cursor = " + path + "\n";
    }
    code += "\nfor(var ix = 0, len = removes.length; ix < len; ix++) {\nvar remove = removes[ix];\n" + removes + "\n}\nfor(var ix = 0, len = adds.length; ix < len; ix++) {\nvar add = adds[ix];\nvar cursor = index;\nvar value;\n" + checks + "  cursor.push(add);\n}\nreturn index;";
    return (new Function("index", "adds", "removes", code)).bind(runtime);
}
function generateCollector2(keys) {
    var hashParts = [];
    for (var _i = 0; _i < keys.length; _i++) {
        var key = keys[_i];
        if (key.constructor === Array) {
            hashParts.push("add['" + key[0] + "']['" + key[1] + "']");
        }
        else {
            hashParts.push("add['" + key + "']");
        }
    }
    var code = "\n    var ixCache = cache.ix;\n    var idCache = cache.id;\n    for(var ix = 0, len = removes.length; ix < len; ix++) {\n      var remove = removes[ix];\n      var id = remove.__id;\n      var key = idCache[id];\n      var factIx = ixCache[id];\n      var facts = index[key];\n      //swap the last fact with this one to prevent holes\n      var lastFact = facts.pop();\n      if(lastFact && lastFact.__id !== remove.__id) {\n        facts[factIx] = lastFact;\n        ixCache[lastFact.__id] = factIx;\n      } else if(facts.length === 0) {\n        delete index[key];\n      }\n      delete idCache[id];\n      delete ixCache[id];\n    }\n    for(var ix = 0, len = adds.length; ix < len; ix++) {\n      var add = adds[ix];\n      var id = add.__id;\n      var key = idCache[id] = " + hashParts.join(" + '|' + ") + ";\n      if(index[key] === undefined) index[key] = [];\n      var arr = index[key];\n      ixCache[id] = arr.length;\n      arr.push(add);\n    }\n    return index;";
    return new Function("index", "adds", "removes", "cache", code);
}
function mergeArrays(as, bs) {
    var ix = as.length;
    var start = ix;
    for (var _i = 0; _i < bs.length; _i++) {
        var b = bs[_i];
        as[ix] = bs[ix - start];
        ix++;
    }
    return as;
}
var Diff = (function () {
    function Diff(ixer) {
        this.ixer = ixer;
        this.tables = {};
        this.length = 0;
        this.meta = {};
    }
    Diff.prototype.ensureTable = function (table) {
        var tableDiff = this.tables[table];
        if (!tableDiff) {
            tableDiff = this.tables[table] = { adds: [], removes: [] };
        }
        return tableDiff;
    };
    Diff.prototype.add = function (table, obj) {
        var tableDiff = this.ensureTable(table);
        this.length++;
        tableDiff.adds.push(obj);
        return this;
    };
    Diff.prototype.addMany = function (table, objs) {
        var tableDiff = this.ensureTable(table);
        this.length += objs.length;
        mergeArrays(tableDiff.adds, objs);
        return this;
    };
    Diff.prototype.removeFacts = function (table, objs) {
        var tableDiff = this.ensureTable(table);
        this.length += objs.length;
        mergeArrays(tableDiff.removes, objs);
        return this;
    };
    Diff.prototype.remove = function (table, query) {
        var tableDiff = this.ensureTable(table);
        var found = this.ixer.find(table, query);
        this.length += found.length;
        mergeArrays(tableDiff.removes, found);
        return this;
    };
    Diff.prototype.merge = function (diff) {
        for (var table in diff.tables) {
            var tableDiff = diff.tables[table];
            this.addMany(table, tableDiff.adds);
            this.removeFacts(table, tableDiff.removes);
        }
        return this;
    };
    Diff.prototype.reverse = function () {
        var reversed = new Diff(this.ixer);
        for (var table in this.tables) {
            var diff = this.tables[table];
            reversed.addMany(table, diff.removes);
            reversed.removeFacts(table, diff.adds);
        }
        return reversed;
    };
    return Diff;
})();
exports.Diff = Diff;
var Indexer = (function () {
    function Indexer() {
        this.tables = {};
        this.globalCount = 0;
        this.edbTables = {};
    }
    Indexer.prototype.addTable = function (name, keys) {
        if (keys === void 0) { keys = []; }
        var table = this.tables[name];
        keys = keys.filter(function (key) { return key !== "__id"; });
        if (table && keys.length) {
            table.fields = keys;
            table.stringify = generateStringFn(keys);
        }
        else {
            table = this.tables[name] = { table: [], hashToIx: {}, factHash: {}, indexes: {}, triggers: {}, fields: keys, stringify: generateStringFn(keys), keyLookup: {} };
            this.edbTables[name] = true;
        }
        for (var _i = 0; _i < keys.length; _i++) {
            var key = keys[_i];
            if (key.constructor === Array) {
                table.keyLookup[key[0]] = key;
            }
            else {
                table.keyLookup[key] = key;
            }
        }
        return table;
    };
    Indexer.prototype.clearTable = function (name) {
        var table = this.tables[name];
        if (!table)
            return;
        table.table = [];
        table.factHash = {};
        for (var indexName in table.indexes) {
            table.indexes[indexName].index = {};
            table.indexes[indexName].cache = { id: {}, ix: {} };
        }
    };
    Indexer.prototype.updateTable = function (tableId, adds, removes) {
        var table = this.tables[tableId];
        if (!table || !table.fields.length) {
            var example = adds[0] || removes[0];
            table = this.addTable(tableId, Object.keys(example));
        }
        var stringify = table.stringify;
        var facts = table.table;
        var factHash = table.factHash;
        var hashToIx = table.hashToIx;
        var localHash = {};
        var hashToFact = {};
        var hashes = [];
        for (var _i = 0; _i < adds.length; _i++) {
            var add = adds[_i];
            var hash = add.__id || stringify(add);
            if (localHash[hash] === undefined) {
                localHash[hash] = 1;
                hashToFact[hash] = add;
                hashes.push(hash);
            }
            else {
                localHash[hash]++;
            }
            add.__id = hash;
        }
        for (var _a = 0; _a < removes.length; _a++) {
            var remove = removes[_a];
            var hash = remove.__id || stringify(remove);
            if (localHash[hash] === undefined) {
                localHash[hash] = -1;
                hashToFact[hash] = remove;
                hashes.push(hash);
            }
            else {
                localHash[hash]--;
            }
            remove.__id = hash;
        }
        var realAdds = [];
        var realRemoves = [];
        for (var _b = 0; _b < hashes.length; _b++) {
            var hash = hashes[_b];
            var count = localHash[hash];
            if (count > 0 && !factHash[hash]) {
                var fact = hashToFact[hash];
                realAdds.push(fact);
                facts.push(fact);
                factHash[hash] = fact;
                hashToIx[hash] = facts.length - 1;
            }
            else if (count < 0 && factHash[hash]) {
                var fact = hashToFact[hash];
                var ix = hashToIx[hash];
                //swap the last fact with this one to prevent holes
                var lastFact = facts.pop();
                if (lastFact && lastFact.__id !== fact.__id) {
                    facts[ix] = lastFact;
                    hashToIx[lastFact.__id] = ix;
                }
                realRemoves.push(fact);
                delete factHash[hash];
                delete hashToIx[hash];
            }
        }
        return { adds: realAdds, removes: realRemoves };
    };
    Indexer.prototype.collector = function (keys) {
        return {
            index: {},
            cache: { id: {}, ix: {} },
            hasher: generateStringFn(keys),
            collect: generateCollector2(keys),
        };
    };
    Indexer.prototype.factToIndex = function (table, fact) {
        var keys = Object.keys(fact);
        if (!keys.length)
            return table.table.slice();
        var index = this.index(table, keys);
        var result = index.index[index.hasher(fact)];
        if (result) {
            return result.slice();
        }
        return [];
    };
    Indexer.prototype.execDiff = function (diff) {
        var triggers = {};
        var realDiffs = {};
        var tableIds = Object.keys(diff.tables);
        for (var _i = 0; _i < tableIds.length; _i++) {
            var tableId = tableIds[_i];
            var tableDiff = diff.tables[tableId];
            if (tableDiff.adds.length === 0 && tableDiff.removes.length === 0)
                continue;
            var realDiff = this.updateTable(tableId, tableDiff.adds, tableDiff.removes);
            // go through all the indexes and update them.
            var table = this.tables[tableId];
            var indexes = Object.keys(table.indexes);
            for (var _a = 0; _a < indexes.length; _a++) {
                var indexName = indexes[_a];
                var index = table.indexes[indexName];
                index.collect(index.index, realDiff.adds, realDiff.removes, index.cache);
            }
            var curTriggers = Object.keys(table.triggers);
            for (var _b = 0; _b < curTriggers.length; _b++) {
                var triggerName = curTriggers[_b];
                var trigger = table.triggers[triggerName];
                triggers[triggerName] = trigger;
            }
            realDiffs[tableId] = realDiff;
        }
        return { triggers: triggers, realDiffs: realDiffs };
    };
    Indexer.prototype.execTrigger = function (trigger) {
        var table = this.table(trigger.name);
        // since views might be changed during the triggering process, we want to favor
        // just using the view itself as the trigger if it is one. Otherwise, we use the
        // trigger's exec function. This ensures that if a view is recompiled and added
        // that any already queued triggers will use the updated version of the view instead
        // of the old queued one.
        var _a = (table.view ? table.view.exec() : trigger.exec(this)) || {}, _b = _a.results, results = _b === void 0 ? undefined : _b, _c = _a.unprojected, unprojected = _c === void 0 ? undefined : _c;
        if (!results)
            return;
        var prevResults = table.factHash;
        var prevHashes = Object.keys(prevResults);
        table.unprojected = unprojected;
        if (results) {
            var diff = new Diff(this);
            this.clearTable(trigger.name);
            diff.addMany(trigger.name, results);
            var triggers = this.execDiff(diff).triggers;
            var newHashes = table.factHash;
            if (prevHashes.length === Object.keys(newHashes).length) {
                var same = true;
                for (var _i = 0; _i < prevHashes.length; _i++) {
                    var hash = prevHashes[_i];
                    if (!newHashes[hash]) {
                        same = false;
                        break;
                    }
                }
                return same ? undefined : triggers;
            }
            else {
                return triggers;
            }
        }
        return;
    };
    Indexer.prototype.transitivelyClearTriggers = function (startingTriggers) {
        var cleared = {};
        var remaining = Object.keys(startingTriggers);
        for (var ix = 0; ix < remaining.length; ix++) {
            var trigger = remaining[ix];
            if (cleared[trigger])
                continue;
            this.clearTable(trigger);
            cleared[trigger] = true;
            remaining.push.apply(remaining, Object.keys(this.table(trigger).triggers));
        }
        return cleared;
    };
    Indexer.prototype.execTriggers = function (triggers) {
        var newTriggers = {};
        var retrigger = false;
        for (var triggerName in triggers) {
            // console.log("Calling:", triggerName);
            var trigger = triggers[triggerName];
            var nextRound = this.execTrigger(trigger);
            if (nextRound) {
                retrigger = true;
                for (var trigger_1 in nextRound) {
                    // console.log("Queuing:", trigger);
                    newTriggers[trigger_1] = nextRound[trigger_1];
                }
            }
        }
        if (retrigger) {
            return newTriggers;
        }
    };
    //---------------------------------------------------------
    // Indexer Public API
    //---------------------------------------------------------
    Indexer.prototype.serialize = function (asObject) {
        var dump = {};
        for (var tableName in this.tables) {
            var table = this.tables[tableName];
            if (!table.isView) {
                dump[tableName] = table.table;
            }
        }
        if (asObject) {
            return dump;
        }
        return JSON.stringify(dump);
    };
    Indexer.prototype.load = function (serialized) {
        var dump = JSON.parse(serialized);
        var diff = this.diff();
        for (var tableName in dump) {
            diff.addMany(tableName, dump[tableName]);
        }
        if (exports.INCREMENTAL) {
            this.applyDiffIncremental(diff);
        }
        else {
            this.applyDiff(diff);
        }
    };
    Indexer.prototype.diff = function () {
        return new Diff(this);
    };
    Indexer.prototype.applyDiff = function (diff) {
        if (exports.INCREMENTAL) {
            return this.applyDiffIncremental(diff);
        }
        var _a = this.execDiff(diff), triggers = _a.triggers, realDiffs = _a.realDiffs;
        var cleared;
        var round = 0;
        if (triggers)
            cleared = this.transitivelyClearTriggers(triggers);
        while (triggers) {
            for (var trigger in triggers) {
                cleared[trigger] = false;
            }
            // console.group(`ROUND ${round}`);
            triggers = this.execTriggers(triggers);
            round++;
        }
        for (var _i = 0, _b = Object.keys(cleared); _i < _b.length; _i++) {
            var trigger = _b[_i];
            if (!cleared[trigger])
                continue;
            var view = this.table(trigger).view;
            if (view) {
                this.execTrigger(view);
            }
        }
    };
    Indexer.prototype.table = function (tableId) {
        var table = this.tables[tableId];
        if (table)
            return table;
        return this.addTable(tableId);
    };
    Indexer.prototype.index = function (tableOrId, keys) {
        var table;
        if (typeof tableOrId === "string")
            table = this.table(tableOrId);
        else
            table = tableOrId;
        keys.sort();
        var indexName = keys.filter(function (key) { return key !== "__id"; }).join("|");
        var index = table.indexes[indexName];
        if (!index) {
            var tableKeys = [];
            for (var _i = 0; _i < keys.length; _i++) {
                var key = keys[_i];
                tableKeys.push(table.keyLookup[key] || key);
            }
            index = table.indexes[indexName] = this.collector(tableKeys);
            index.collect(index.index, table.table, [], index.cache);
        }
        return index;
    };
    Indexer.prototype.find = function (tableId, query) {
        var table = this.tables[tableId];
        if (!table) {
            return [];
        }
        else if (!query) {
            return table.table.slice();
        }
        else {
            return this.factToIndex(table, query);
        }
    };
    Indexer.prototype.findOne = function (tableId, query) {
        return this.find(tableId, query)[0];
    };
    Indexer.prototype.query = function (name) {
        if (name === void 0) { name = "unknown"; }
        return new Query(this, name);
    };
    Indexer.prototype.union = function (name) {
        return new Union(this, name);
    };
    Indexer.prototype.trigger = function (name, table, exec, execIncremental) {
        var tables = (typeof table === "string") ? [table] : table;
        var trigger = { name: name, tables: tables, exec: exec, execIncremental: execIncremental };
        for (var _i = 0; _i < tables.length; _i++) {
            var tableId = tables[_i];
            var table_2 = this.table(tableId);
            table_2.triggers[name] = trigger;
        }
        if (!exports.INCREMENTAL) {
            var nextRound = this.execTrigger(trigger);
            while (nextRound) {
                nextRound = this.execTriggers(nextRound);
            }
            ;
        }
        else {
            if (!tables.length) {
                return exec(this);
            }
            var initial = (_a = {}, _a[tables[0]] = { adds: this.tables[tables[0]].table, removes: [] }, _a);
            var _b = this.execTriggerIncremental(trigger, initial), triggers = _b.triggers, changes = _b.changes;
            while (triggers) {
                var results = this.execTriggersIncremental(triggers, changes);
                if (!results)
                    break;
                triggers = results.triggers;
                changes = results.changes;
            }
        }
        var _a;
    };
    Indexer.prototype.asView = function (query) {
        var name = query.name;
        if (this.tables[name]) {
            this.removeView(name);
        }
        var view = this.table(name);
        this.edbTables[name] = false;
        view.view = query;
        view.isView = true;
        this.trigger(name, query.tables, query.exec.bind(query), query.execIncremental.bind(query));
    };
    Indexer.prototype.removeView = function (id) {
        for (var _i = 0, _a = this.tables; _i < _a.length; _i++) {
            var table = _a[_i];
            delete table.triggers[id];
        }
    };
    Indexer.prototype.totalFacts = function () {
        var total = 0;
        for (var tableName in this.tables) {
            total += this.tables[tableName].table.length;
        }
        return total;
    };
    Indexer.prototype.factsPerTable = function () {
        var info = {};
        for (var tableName in this.tables) {
            info[tableName] = this.tables[tableName].table.length;
        }
        return info;
    };
    Indexer.prototype.applyDiffIncremental = function (diff) {
        if (diff.length === 0)
            return;
        // console.log("DIFF SIZE: ", diff.length, diff);
        var _a = this.execDiff(diff), triggers = _a.triggers, realDiffs = _a.realDiffs;
        var round = 0;
        var changes = realDiffs;
        while (triggers) {
            // console.group(`ROUND ${round}`);
            // console.log("CHANGES: ", changes);
            var results = this.execTriggersIncremental(triggers, changes);
            // console.groupEnd();
            if (!results)
                break;
            triggers = results.triggers;
            changes = results.changes;
            round++;
        }
    };
    Indexer.prototype.execTriggerIncremental = function (trigger, changes) {
        var table = this.table(trigger.name);
        var adds, provenance, removes, info;
        if (trigger.execIncremental) {
            info = trigger.execIncremental(changes, table) || {};
            adds = info.adds;
            removes = info.removes;
        }
        else {
            trigger.exec();
            return;
        }
        var diff = new runtime.Diff(this);
        if (adds.length) {
            diff.addMany(trigger.name, adds);
        }
        if (removes.length) {
            diff.removeFacts(trigger.name, removes);
        }
        var updated = this.execDiff(diff);
        var realDiffs = updated.realDiffs;
        if (realDiffs[trigger.name] && (realDiffs[trigger.name].adds.length || realDiffs[trigger.name].removes)) {
            return { changes: realDiffs[trigger.name], triggers: updated.triggers };
        }
        else {
            return {};
        }
    };
    Indexer.prototype.execTriggersIncremental = function (triggers, changes) {
        var newTriggers = {};
        var nextChanges = {};
        var retrigger = false;
        var triggerKeys = Object.keys(triggers);
        for (var _i = 0; _i < triggerKeys.length; _i++) {
            var triggerName = triggerKeys[_i];
            // console.log("Calling:", triggerName);
            var trigger = triggers[triggerName];
            var nextRound = this.execTriggerIncremental(trigger, changes);
            if (nextRound && nextRound.changes) {
                nextChanges[triggerName] = nextRound.changes;
                if (nextRound.triggers) {
                    var nextRoundKeys = Object.keys(nextRound.triggers);
                    for (var _a = 0; _a < nextRoundKeys.length; _a++) {
                        var trigger_2 = nextRoundKeys[_a];
                        if (trigger_2 && nextRound.triggers[trigger_2]) {
                            retrigger = true;
                            // console.log("Queuing:", trigger);
                            newTriggers[trigger_2] = nextRound.triggers[trigger_2];
                        }
                    }
                }
            }
        }
        if (retrigger) {
            return { changes: nextChanges, triggers: newTriggers };
        }
    };
    return Indexer;
})();
exports.Indexer = Indexer;
function addProvenanceTable(ixer) {
    var table = ixer.addTable("provenance", ["table", ["row", "__id"], "row instance", "source", ["source row", "__id"]]);
    // generate some indexes that we know we're going to need upfront
    ixer.index("provenance", ["table", "row"]);
    ixer.index("provenance", ["table", "row instance"]);
    ixer.index("provenance", ["table", "source", "source row"]);
    ixer.index("provenance", ["table"]);
    return ixer;
}
exports.addProvenanceTable = addProvenanceTable;
function mappingToDiff(diff, action, mapping, aliases, reverseLookup) {
    for (var from in mapping) {
        var to = mapping[from];
        if (to.constructor === Array) {
            var source = to[0];
            if (typeof source === "number") {
                source = aliases[reverseLookup[source]];
            }
            else {
                source = aliases[source];
            }
            diff.add("action mapping", { action: action, from: from, "to source": source, "to field": to[1] });
        }
        else {
            diff.add("action mapping constant", { action: action, from: from, value: to });
        }
    }
    return diff;
}
exports.QueryFunctions = {};
var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
var ARGUMENT_NAMES = /([^\s,]+)/g;
function getParamNames(func) {
    var fnStr = func.toString().replace(STRIP_COMMENTS, '');
    var result = fnStr.slice(fnStr.indexOf('(') + 1, fnStr.indexOf(')')).match(ARGUMENT_NAMES);
    if (result === null)
        result = [];
    return result;
}
function define(name, opts, func) {
    var params = getParamNames(func);
    opts.name = name;
    opts.params = params;
    opts.func = func;
    exports.QueryFunctions[name] = opts;
}
exports.define = define;
var Query = (function () {
    function Query(ixer, name) {
        if (name === void 0) { name = "unknown"; }
        this.name = name;
        this.ixer = ixer;
        this.dirty = true;
        this.tables = [];
        this.joins = [];
        this.aliases = {};
        this.funcs = [];
        this.aggregates = [];
        this.unprojectedSize = 0;
        this.hasOrdinal = false;
    }
    Query.remove = function (view, ixer) {
        var diff = ixer.diff();
        diff.remove("view", { view: view });
        for (var _i = 0, _a = ixer.find("action", { view: view }); _i < _a.length; _i++) {
            var actionItem = _a[_i];
            var action = actionItem.action;
            diff.remove("action", { action: action });
            diff.remove("action source", { action: action });
            diff.remove("action mapping", { action: action });
            diff.remove("action mapping constant", { action: action });
            diff.remove("action mapping sorted", { action: action });
            diff.remove("action mapping limit", { action: action });
        }
        return diff;
    };
    Query.prototype.changeset = function (ixer) {
        var diff = ixer.diff();
        var aliases = {};
        var reverseLookup = {};
        for (var alias in this.aliases) {
            reverseLookup[this.aliases[alias]] = alias;
        }
        var view = this.name;
        diff.add("view", { view: view, kind: "query" });
        //joins
        for (var _i = 0, _a = this.joins; _i < _a.length; _i++) {
            var join = _a[_i];
            var action = utils_1.uuid();
            aliases[join.as] = action;
            if (!join.negated) {
                diff.add("action", { view: view, action: action, kind: "select", ix: join.ix });
            }
            else {
                diff.add("action", { view: view, action: action, kind: "deselect", ix: join.ix });
            }
            diff.add("action source", { action: action, "source view": join.table });
            mappingToDiff(diff, action, join.join, aliases, reverseLookup);
        }
        //functions
        for (var _b = 0, _c = this.funcs; _b < _c.length; _b++) {
            var func = _c[_b];
            var action = utils_1.uuid();
            aliases[func.as] = action;
            diff.add("action", { view: view, action: action, kind: "calculate", ix: func.ix });
            diff.add("action source", { action: action, "source view": func.name });
            mappingToDiff(diff, action, func.args, aliases, reverseLookup);
        }
        //aggregates
        for (var _d = 0, _e = this.aggregates; _d < _e.length; _d++) {
            var agg = _e[_d];
            var action = utils_1.uuid();
            aliases[agg.as] = action;
            diff.add("action", { view: view, action: action, kind: "aggregate", ix: agg.ix });
            diff.add("action source", { action: action, "source view": agg.name });
            mappingToDiff(diff, action, agg.args, aliases, reverseLookup);
        }
        //sort
        if (this.sorts) {
            var action = utils_1.uuid();
            diff.add("action", { view: view, action: action, kind: "sort", ix: exports.MAX_NUMBER });
            var ix = 0;
            for (var _f = 0, _g = this.sorts; _f < _g.length; _f++) {
                var sort = _g[_f];
                var source = sort[0], field = sort[1], direction = sort[2];
                if (typeof source === "number") {
                    source = aliases[reverseLookup[source]];
                }
                else {
                    source = aliases[source];
                }
                diff.add("action mapping sorted", { action: action, ix: ix, source: source, field: field, direction: direction });
                ix++;
            }
        }
        //group
        if (this.groups) {
            var action = utils_1.uuid();
            diff.add("action", { view: view, action: action, kind: "group", ix: exports.MAX_NUMBER });
            var ix = 0;
            for (var _h = 0, _j = this.groups; _h < _j.length; _h++) {
                var group = _j[_h];
                var source = group[0], field = group[1];
                if (typeof source === "number") {
                    source = aliases[reverseLookup[source]];
                }
                else {
                    source = aliases[source];
                }
                diff.add("action mapping sorted", { action: action, ix: ix, source: source, field: field, direction: "ascending" });
                ix++;
            }
        }
        //limit
        if (this.limitInfo) {
            var action = utils_1.uuid();
            diff.add("action", { view: view, action: action, kind: "limit", ix: exports.MAX_NUMBER });
            for (var limitType in this.limitInfo) {
                diff.add("action mapping limit", { action: action, "limit type": limitType, value: this.limitInfo[limitType] });
            }
        }
        //projection
        if (this.projectionMap) {
            var action = utils_1.uuid();
            diff.add("action", { view: view, action: action, kind: "project", ix: exports.MAX_NUMBER });
            mappingToDiff(diff, action, this.projectionMap, aliases, reverseLookup);
        }
        return diff;
    };
    Query.prototype.validateFields = function (tableName, joinObject) {
        var table = this.ixer.table(tableName);
        for (var field in joinObject) {
            if (table.fields.length && !table.keyLookup[field]) {
                throw new Error("Table '" + tableName + "' doesn't have a field '" + field + "'.\n\nAvailable fields: " + table.fields.join(", "));
            }
            var joinInfo = joinObject[field];
            if (joinInfo.constructor === Array) {
                var joinNumber = joinInfo[0], referencedField = joinInfo[1];
                if (typeof joinNumber !== "number") {
                    joinNumber = this.aliases[joinNumber];
                }
                var join = this.joins[joinNumber];
                if (join && join.ix === joinNumber) {
                    var referencedTable = this.ixer.table(join.table);
                    if (!referencedTable.fields.length)
                        continue;
                    if (!referencedTable.keyLookup[referencedField]) {
                        throw new Error("Table '" + join.table + "' doesn't have a field '" + referencedField + "'.\n\nAvailable fields: " + referencedTable.fields.join(", "));
                    }
                }
            }
        }
    };
    Query.prototype.select = function (table, join, as) {
        this.dirty = true;
        if (as) {
            this.aliases[as] = Object.keys(this.aliases).length;
        }
        this.unprojectedSize++;
        this.tables.push(table);
        this.validateFields(table, join);
        this.joins.push({ negated: false, table: table, join: join, as: as, ix: this.aliases[as] });
        return this;
    };
    Query.prototype.deselect = function (table, join) {
        this.dirty = true;
        this.tables.push(table);
        this.validateFields(table, join);
        this.joins.push({ negated: true, table: table, join: join, ix: this.joins.length * 1000 });
        return this;
    };
    Query.prototype.calculate = function (funcName, args, as) {
        this.dirty = true;
        if (as) {
            this.aliases[as] = Object.keys(this.aliases).length;
        }
        if (!exports.QueryFunctions[funcName].filter) {
            this.unprojectedSize++;
        }
        this.funcs.push({ name: funcName, args: args, as: as, ix: this.aliases[as] });
        return this;
    };
    Query.prototype.project = function (projectionMap) {
        this.projectionMap = projectionMap;
        this.validateFields(undefined, projectionMap);
        return this;
    };
    Query.prototype.group = function (groups) {
        this.dirty = true;
        if (groups[0] && groups[0].constructor === Array) {
            this.groups = groups;
        }
        else {
            if (!this.groups)
                this.groups = [];
            this.groups.push(groups);
        }
        return this;
    };
    Query.prototype.sort = function (sorts) {
        this.dirty = true;
        if (sorts[0] && sorts[0].constructor === Array) {
            this.sorts = sorts;
        }
        else {
            if (!this.sorts)
                this.sorts = [];
            this.sorts.push(sorts);
        }
        return this;
    };
    Query.prototype.limit = function (limitInfo) {
        this.dirty = true;
        if (!this.limitInfo) {
            this.limitInfo = {};
        }
        for (var key in limitInfo) {
            this.limitInfo[key] = limitInfo[key];
        }
        return this;
    };
    Query.prototype.aggregate = function (funcName, args, as) {
        this.dirty = true;
        if (as) {
            this.aliases[as] = Object.keys(this.aliases).length;
        }
        this.unprojectedSize++;
        this.aggregates.push({ name: funcName, args: args, as: as, ix: this.aliases[as] });
        return this;
    };
    Query.prototype.ordinal = function () {
        this.dirty = true;
        this.hasOrdinal = true;
        this.unprojectedSize++;
        return this;
    };
    Query.prototype.applyAliases = function (joinMap) {
        for (var field in joinMap) {
            var joinInfo = joinMap[field];
            if (joinInfo.constructor !== Array || typeof joinInfo[0] === "number")
                continue;
            var joinTable = joinInfo[0];
            if (joinTable === "ordinal") {
                joinInfo[0] = this.unprojectedSize - 1;
            }
            else if (this.aliases[joinTable] !== undefined) {
                joinInfo[0] = this.aliases[joinTable];
            }
            else {
                throw new Error("Invalid alias used: " + joinTable);
            }
        }
    };
    Query.prototype.toAST = function () {
        var cursor = { type: "query",
            children: [] };
        var root = cursor;
        var results = [];
        // by default the only thing we return are the unprojected results
        var returns = ["unprojected", "provenance"];
        // we need an array to store our unprojected results
        root.children.push({ type: "declaration", var: "unprojected", value: "[]" });
        root.children.push({ type: "declaration", var: "provenance", value: "[]" });
        root.children.push({ type: "declaration", var: "projected", value: "{}" });
        // run through each table nested in the order they were given doing pairwise
        // joins along the way.
        for (var _i = 0, _a = this.joins; _i < _a.length; _i++) {
            var join = _a[_i];
            var table = join.table, ix = join.ix, negated = join.negated;
            var cur = {
                type: "select",
                table: table,
                passed: ix === 0,
                ix: ix,
                negated: negated,
                children: [],
                join: false,
            };
            // we only want to eat the cost of dealing with indexes
            // if we are actually joining on something
            var joinMap = join.join;
            this.applyAliases(joinMap);
            if (joinMap && Object.keys(joinMap).length !== 0) {
                root.children.unshift({ type: "declaration", var: "query" + ix, value: "{}" });
                cur.join = joinMap;
            }
            cursor.children.push(cur);
            if (!negated) {
                results.push({ type: "select", ix: ix });
            }
            cursor = cur;
        }
        // at the bottom of the joins, we calculate all the functions based on the values
        // collected
        for (var _b = 0, _c = this.funcs; _b < _c.length; _b++) {
            var func = _c[_b];
            var args = func.args, name_1 = func.name, ix = func.ix;
            var funcInfo = exports.QueryFunctions[name_1];
            this.applyAliases(args);
            root.children.unshift({ type: "functionDeclaration", ix: ix, info: funcInfo });
            if (funcInfo.multi || funcInfo.filter) {
                var node = { type: "functionCallMultiReturn", ix: ix, args: args, info: funcInfo, children: [] };
                cursor.children.push(node);
                cursor = node;
            }
            else {
                cursor.children.push({ type: "functionCall", ix: ix, args: args, info: funcInfo, children: [] });
            }
            if (!funcInfo.noReturn && !funcInfo.filter) {
                results.push({ type: "function", ix: ix });
            }
        }
        // now that we're at the bottom of the join, store the unprojected result
        cursor.children.push({ type: "result", results: results });
        //Aggregation
        //sort the unprojected results based on groupings and the given sorts
        var sorts = [];
        var alreadySorted = {};
        if (this.groups) {
            this.applyAliases(this.groups);
            for (var _d = 0, _e = this.groups; _d < _e.length; _d++) {
                var group = _e[_d];
                var table = group[0], field = group[1];
                sorts.push(group);
                alreadySorted[(table + "|" + field)] = true;
            }
        }
        if (this.sorts) {
            this.applyAliases(this.sorts);
            for (var _f = 0, _g = this.sorts; _f < _g.length; _f++) {
                var sort = _g[_f];
                var table = sort[0], field = sort[1];
                if (!alreadySorted[(table + "|" + field)]) {
                    sorts.push(sort);
                }
            }
        }
        var size = this.unprojectedSize;
        if (sorts.length) {
            root.children.push({ type: "sort", sorts: sorts, size: size, children: [] });
        }
        //then we need to run through the sorted items and do the aggregate as a fold.
        if (this.aggregates.length || sorts.length || this.limitInfo || this.hasOrdinal) {
            // we need to store group info for post processing of the unprojected results
            // this will indicate what group number, if any, that each unprojected result belongs to
            root.children.unshift({ type: "declaration", var: "groupInfo", value: "[]" });
            returns.push("groupInfo");
            var aggregateChildren = [];
            for (var _h = 0, _j = this.aggregates; _h < _j.length; _h++) {
                var func = _j[_h];
                var args = func.args, name_2 = func.name, ix = func.ix;
                var funcInfo = exports.QueryFunctions[name_2];
                this.applyAliases(args);
                root.children.unshift({ type: "functionDeclaration", ix: ix, info: funcInfo });
                aggregateChildren.push({ type: "functionCall", ix: ix, resultsIx: results.length, args: args, info: funcInfo, unprojected: true, children: [] });
                results.push({ type: "placeholder" });
            }
            if (this.hasOrdinal === true) {
                aggregateChildren.push({ type: "ordinal" });
                results.push({ type: "placeholder" });
            }
            var aggregate = { type: "aggregate loop", groups: this.groups, limit: this.limitInfo, size: size, children: aggregateChildren };
            root.children.push(aggregate);
            cursor = aggregate;
        }
        if (this.projectionMap) {
            this.applyAliases(this.projectionMap);
            root.children.unshift({ type: "declaration", var: "results", value: "[]" });
            if (exports.INCREMENTAL) {
                cursor.children.push({ type: "provenance" });
            }
            cursor.children.push({ type: "projection", projectionMap: this.projectionMap, unprojected: this.aggregates.length });
            returns.push("results");
        }
        root.children.push({ type: "return", vars: returns });
        return root;
    };
    Query.prototype.compileParamString = function (funcInfo, args, unprojected) {
        if (unprojected === void 0) { unprojected = false; }
        var code = "";
        var params = funcInfo.params;
        if (unprojected)
            params = params.slice(1);
        for (var _i = 0; _i < params.length; _i++) {
            var param = params[_i];
            var arg = args[param];
            var argCode = void 0;
            if (arg.constructor === Array) {
                var property = "";
                if (arg[1]) {
                    property = "['" + arg[1] + "']";
                }
                if (!unprojected) {
                    argCode = "row" + arg[0] + property;
                }
                else {
                    argCode = "unprojected[ix + " + arg[0] + "]" + property;
                }
            }
            else {
                argCode = JSON.stringify(arg);
            }
            code += argCode + ", ";
        }
        return code.substring(0, code.length - 2);
    };
    Query.prototype.compileAST = function (root) {
        var code = "";
        var type = root.type;
        switch (type) {
            case "query":
                for (var _i = 0, _a = root.children; _i < _a.length; _i++) {
                    var child = _a[_i];
                    code += this.compileAST(child);
                }
                break;
            case "declaration":
                code += "var " + root.var + " = " + root.value + ";\n";
                break;
            case "functionDeclaration":
                code += "var func" + root.ix + " = QueryFunctions['" + root.info.name + "'].func;\n";
                break;
            case "functionCall":
                var ix = root.ix;
                var prev = "";
                if (root.unprojected) {
                    prev = "row" + ix;
                    if (root.info.params.length > 1)
                        prev += ",";
                }
                code += "var row" + ix + " = func" + ix + "(" + prev + this.compileParamString(root.info, root.args, root.unprojected) + ");\n";
                break;
            case "functionCallMultiReturn":
                var ix = root.ix;
                code += "var rows" + ix + " = func" + ix + "(" + this.compileParamString(root.info, root.args) + ");\n";
                code += "for(var funcResultIx" + ix + " = 0, funcLen" + ix + " = rows" + ix + ".length; funcResultIx" + ix + " < funcLen" + ix + "; funcResultIx" + ix + "++) {\n";
                code += "var row" + ix + " = rows" + ix + "[funcResultIx" + ix + "];\n";
                for (var _b = 0, _c = root.children; _b < _c.length; _b++) {
                    var child = _c[_b];
                    code += this.compileAST(child);
                }
                code += "}\n";
                break;
            case "select":
                var ix = root.ix;
                if (root.passed) {
                    code += "var rows" + ix + " = rootRows;\n";
                }
                else if (root.join) {
                    for (var key in root.join) {
                        var mapping = root.join[key];
                        if (mapping.constructor === Array) {
                            var tableIx = mapping[0], value = mapping[1];
                            code += "query" + ix + "['" + key + "'] = row" + tableIx + "['" + value + "'];\n";
                        }
                        else {
                            code += "query" + ix + "['" + key + "'] = " + JSON.stringify(mapping) + ";\n";
                        }
                    }
                    code += "var rows" + ix + " = ixer.factToIndex(ixer.table('" + root.table + "'), query" + ix + ");\n";
                }
                else {
                    code += "var rows" + ix + " = ixer.table('" + root.table + "').table;\n";
                }
                if (!root.negated) {
                    code += "for(var rowIx" + ix + " = 0, rowsLen" + ix + " = rows" + ix + ".length; rowIx" + ix + " < rowsLen" + ix + "; rowIx" + ix + "++) {\n";
                    code += "var row" + ix + " = rows" + ix + "[rowIx" + ix + "];\n";
                }
                else {
                    code += "if(!rows" + ix + ".length) {\n";
                }
                for (var _d = 0, _e = root.children; _d < _e.length; _d++) {
                    var child = _e[_d];
                    code += this.compileAST(child);
                }
                code += "}\n";
                break;
            case "result":
                var results = [];
                for (var _f = 0, _g = root.results; _f < _g.length; _f++) {
                    var result = _g[_f];
                    if (result.type === "placeholder") {
                        results.push("undefined");
                    }
                    else {
                        var ix_1 = result.ix;
                        results.push("row" + ix_1);
                    }
                }
                code += "unprojected.push(" + results.join(", ") + ");\n";
                break;
            case "sort":
                code += generateUnprojectedSorterCode(root.size, root.sorts) + "\n";
                break;
            case "aggregate loop":
                var projection = "";
                var aggregateCalls = [];
                var aggregateStates = [];
                var aggregateResets = [];
                var unprojected = {};
                var ordinal = false;
                var provenanceCode;
                for (var _h = 0, _j = root.children; _h < _j.length; _h++) {
                    var agg = _j[_h];
                    if (agg.type === "functionCall") {
                        unprojected[agg.ix] = true;
                        var compiled = this.compileAST(agg);
                        compiled += "\nunprojected[ix + " + agg.resultsIx + "] = row" + agg.ix + ";\n";
                        aggregateCalls.push(compiled);
                        aggregateStates.push("var row" + agg.ix + " = {};");
                        aggregateResets.push("row" + agg.ix + " = {};");
                    }
                    else if (agg.type === "projection") {
                        agg.unprojected = unprojected;
                        projection = this.compileAST(agg);
                    }
                    else if (agg.type === "ordinal") {
                        ordinal = "unprojected[ix+" + (this.unprojectedSize - 1) + "] = resultCount;\n";
                    }
                    else if (agg.type === "provenance") {
                        provenanceCode = this.compileAST(agg);
                    }
                }
                var aggregateCallsCode = aggregateCalls.join("");
                var differentGroupChecks = [];
                var groupCheck = "false";
                if (root.groups) {
                    for (var _k = 0, _l = root.groups; _k < _l.length; _k++) {
                        var group = _l[_k];
                        var table = group[0], field = group[1];
                        differentGroupChecks.push("unprojected[nextIx + " + table + "]['" + field + "'] !== unprojected[ix + " + table + "]['" + field + "']");
                    }
                    groupCheck = "(" + differentGroupChecks.join(" || ") + ")";
                }
                var resultsCheck = "";
                if (root.limit && root.limit.results) {
                    var limitValue = root.limit.results;
                    var offset = root.limit.offset;
                    if (offset) {
                        limitValue += offset;
                        projection = "if(resultCount >= " + offset + ") {\n              " + projection + "\n            }";
                    }
                    resultsCheck = "if(resultCount === " + limitValue + ") break;";
                }
                var groupLimitCheck = "";
                if (root.limit && root.limit.perGroup && root.groups) {
                    var limitValue = root.limit.perGroup;
                    var offset = root.limit.offset;
                    if (offset) {
                        limitValue += offset;
                        aggregateCallsCode = "if(perGroupCount >= " + offset + ") {\n              " + aggregateCallsCode + "\n            }";
                    }
                    groupLimitCheck = "if(perGroupCount === " + limitValue + ") {\n            while(!differentGroup) {\n              nextIx += " + root.size + ";\n              if(nextIx >= len) break;\n              groupInfo[nextIx] = undefined;\n              differentGroup = " + groupCheck + ";\n            }\n          }";
                }
                var groupDifference = "";
                var groupInfo = "";
                if (this.groups) {
                    groupInfo = "groupInfo[ix] = resultCount;";
                    var groupProjection = projection + "resultCount++;";
                    if (root.limit && root.limit.offset) {
                        groupProjection = "if(perGroupCount > " + root.limit.offset + ") {\n              " + groupProjection + "\n            }";
                        groupInfo = "if(perGroupCount >= " + root.limit.offset + ") {\n              " + groupInfo + "\n            }";
                    }
                    groupDifference = "\n          perGroupCount++\n          var differentGroup = " + groupCheck + ";\n          " + groupLimitCheck + "\n          if(differentGroup) {\n            " + groupProjection + "\n            " + aggregateResets.join("\n") + "\n            perGroupCount = 0;\n          }\n";
                }
                else {
                    groupDifference = "resultCount++;\n";
                    groupInfo = "groupInfo[ix] = 0;";
                }
                // if there are neither aggregates to calculate nor groups to build,
                // then we just need to worry about limiting
                if (!this.groups && aggregateCalls.length === 0) {
                    code = "var ix = 0;\n                  var resultCount = 0;\n                  var len = unprojected.length;\n                  while(ix < len) {\n                    " + resultsCheck + "\n                    " + (ordinal || "") + "\n                    " + provenanceCode + "\n                    " + projection + "\n                    groupInfo[ix] = resultCount;\n                    resultCount++;\n                    ix += " + root.size + ";\n                  }\n";
                    break;
                }
                code = "var resultCount = 0;\n                var perGroupCount = 0;\n                var ix = 0;\n                var nextIx = 0;\n                var len = unprojected.length;\n                " + aggregateStates.join("\n") + "\n                while(ix < len) {\n                  " + aggregateCallsCode + "\n                  " + groupInfo + "\n                  " + (ordinal || "") + "\n                  " + provenanceCode + "\n                  if(ix + " + root.size + " === len) {\n                    " + projection + "\n                    break;\n                  }\n                  nextIx += " + root.size + ";\n                  " + groupDifference + "\n                  " + resultsCheck + "\n                  ix = nextIx;\n                }\n";
                break;
            case "projection":
                var projectedVars = [];
                var idStringParts = [];
                for (var newField in root.projectionMap) {
                    var mapping = root.projectionMap[newField];
                    var value = "";
                    if (mapping.constructor === Array) {
                        if (mapping[1] === undefined) {
                            value = "unprojected[ix + " + mapping[0] + "]";
                        }
                        else if (!root.unprojected || root.unprojected[mapping[0]]) {
                            value = "row" + mapping[0] + "['" + mapping[1] + "']";
                        }
                        else {
                            value = "unprojected[ix + " + mapping[0] + "]['" + mapping[1] + "']";
                        }
                    }
                    else {
                        value = JSON.stringify(mapping);
                    }
                    projectedVars.push("projected['" + newField.replace(/'/g, "\\'") + "'] = " + value);
                    idStringParts.push(value);
                }
                code += projectedVars.join(";\n") + "\n";
                code += "projected.__id = " + idStringParts.join(" + \"|\" + ") + ";\n";
                code += "results.push(projected);\n";
                code += "projected = {};\n";
                break;
            case "provenance":
                var provenance = "var provenance__id = '';\n";
                var ids = [];
                for (var _m = 0, _o = this.joins; _m < _o.length; _m++) {
                    var join = _o[_m];
                    if (join.negated)
                        continue;
                    provenance += "provenance__id = tableId + '|' + projected.__id + '|' + rowInstance + '|" + join.table + "|' + row" + join.ix + ".__id; \n";
                    provenance += "provenance.push({table: tableId, row: projected, \"row instance\": rowInstance, source: \"" + join.table + "\", \"source row\": row" + join.ix + "});\n";
                    ids.push("row" + join.ix + ".__id");
                }
                code = "var rowInstance = " + ids.join(" + '|' + ") + ";\n        " + provenance;
                break;
            case "return":
                var returns = [];
                for (var _p = 0, _q = root.vars; _p < _q.length; _p++) {
                    var curVar = _q[_p];
                    returns.push(curVar + ": " + curVar);
                }
                code += "return {" + returns.join(", ") + "};";
                break;
        }
        return code;
    };
    // given a set of changes and a join order, determine the root facts that need
    // to be joined again to cover all the adds
    Query.prototype.reverseJoin = function (joins) {
        var changed = joins[0];
        var reverseJoinMap = {};
        // collect all the constraints and reverse them
        for (var _i = 0; _i < joins.length; _i++) {
            var join = joins[_i];
            for (var key in join.join) {
                var _a = join.join[key], source = _a[0], field = _a[1];
                if (source <= changed.ix) {
                    if (!reverseJoinMap[source]) {
                        reverseJoinMap[source] = {};
                    }
                    if (!reverseJoinMap[source][field])
                        reverseJoinMap[source][field] = [join.ix, key];
                }
            }
        }
        var recurse = function (joins, joinIx) {
            var code = "";
            if (joinIx >= joins.length) {
                return "others.push(row0)";
            }
            var _a = joins[joinIx], table = _a.table, ix = _a.ix, negated = _a.negated;
            var joinMap = joins[joinIx].join;
            // we only care about this guy if he's joined with at least one thing
            if (!reverseJoinMap[ix] && joinIx < joins.length - 1)
                return recurse(joins, joinIx + 1);
            else if (!reverseJoinMap)
                return "";
            var mappings = [];
            for (var key in reverseJoinMap[ix]) {
                var _b = reverseJoinMap[ix][key], sourceIx = _b[0], field = _b[1];
                if (sourceIx === changed.ix || reverseJoinMap[sourceIx] !== undefined) {
                    mappings.push("'" + key + "': row" + sourceIx + "['" + field + "']");
                }
            }
            for (var key in joinMap) {
                var value = joinMap[key];
                if (value.constructor !== Array) {
                    mappings.push("'" + key + "': " + JSON.stringify(value));
                }
            }
            if (negated) {
            }
            code += "\n            var rows" + ix + " = eve.find('" + table + "', {" + mappings.join(", ") + "});\n            for(var rowsIx" + ix + " = 0, rowsLen" + ix + " = rows" + ix + ".length; rowsIx" + ix + " < rowsLen" + ix + "; rowsIx" + ix + "++) {\n                var row" + ix + " = rows" + ix + "[rowsIx" + ix + "];\n                " + recurse(joins, joinIx + 1) + "\n            }\n            ";
            return code;
        };
        return recurse(joins, 1);
    };
    Query.prototype.compileIncrementalRowFinderCode = function () {
        var code = "var others = [];\n";
        var reversed = this.joins.slice().reverse();
        var checks = [];
        var ix = 0;
        for (var _i = 0; _i < reversed.length; _i++) {
            var join = reversed[_i];
            // we don't want to do this for the root
            if (ix === reversed.length - 1)
                break;
            checks.push("\n\t\t\tif(changes[\"" + join.table + "\"] && changes[\"" + join.table + "\"].adds) {\n                var curChanges" + join.ix + " = changes[\"" + join.table + "\"].adds;\n                for(var changeIx" + join.ix + " = 0, changeLen" + join.ix + " = curChanges" + join.ix + ".length; changeIx" + join.ix + " < changeLen" + join.ix + "; changeIx" + join.ix + "++) {\n                    var row" + join.ix + " = curChanges" + join.ix + "[changeIx" + join.ix + "];\n\t\t\t\t\t" + this.reverseJoin(reversed.slice(ix)) + "\n\t\t\t\t}\n\t\t\t}");
            ix++;
        }
        code += checks.join(" else");
        var last = reversed[ix];
        code += "\n\t\t\tif(changes[\"" + last.table + "\"] && changes[\"" + last.table + "\"].adds) {\n                var curChanges = changes[\"" + last.table + "\"].adds;\n\t\t\t\tfor(var changeIx = 0, changeLen = curChanges.length; changeIx < changeLen; changeIx++) {\n\t\t\t\t\tothers.push(curChanges[changeIx]);\n\t\t\t\t}\n\t\t\t}\n\t\t\treturn others;";
        return code;
    };
    Query.prototype.incrementalRemove = function (changes) {
        var ixer = this.ixer;
        var rowsToPostCheck = [];
        var provenanceDiff = this.ixer.diff();
        var removes = [];
        var indexes = ixer.table("provenance").indexes;
        var sourceRowLookup = indexes["source|source row|table"].index;
        var rowInstanceLookup = indexes["row instance|table"].index;
        var tableRowLookup = indexes["row|table"].index;
        var provenanceRemoves = [];
        var visited = {};
        for (var _i = 0, _a = this.joins; _i < _a.length; _i++) {
            var join = _a[_i];
            var change = changes[join.table];
            if (!visited[join.table] && change && change.removes.length) {
                visited[join.table] = true;
                for (var _b = 0, _c = change.removes; _b < _c.length; _b++) {
                    var remove = _c[_b];
                    var provenances = sourceRowLookup[join.table + '|' + remove.__id + '|' + this.name];
                    if (provenances) {
                        for (var _d = 0; _d < provenances.length; _d++) {
                            var provenance = provenances[_d];
                            if (!visited[provenance["row instance"]]) {
                                visited[provenance["row instance"]] = true;
                                var relatedProvenance = rowInstanceLookup[provenance["row instance"] + '|' + provenance.table];
                                for (var _e = 0; _e < relatedProvenance.length; _e++) {
                                    var related = relatedProvenance[_e];
                                    provenanceRemoves.push(related);
                                }
                            }
                            rowsToPostCheck.push(provenance);
                        }
                    }
                }
            }
        }
        provenanceDiff.removeFacts("provenance", provenanceRemoves);
        ixer.applyDiffIncremental(provenanceDiff);
        var isEdb = ixer.edbTables;
        for (var _f = 0; _f < rowsToPostCheck.length; _f++) {
            var row = rowsToPostCheck[_f];
            var supports = tableRowLookup[row.row.__id + '|' + row.table];
            if (!supports || supports.length === 0) {
                removes.push(row.row);
            }
        }
        return removes;
    };
    Query.prototype.canBeIncremental = function () {
        if (this.aggregates.length)
            return false;
        if (this.sorts)
            return false;
        if (this.groups)
            return false;
        if (this.limitInfo)
            return false;
        for (var _i = 0, _a = this.joins; _i < _a.length; _i++) {
            var join = _a[_i];
            if (join.negated)
                return false;
        }
        if (!this.joins.length)
            return false;
        return true;
    };
    Query.prototype.compile = function () {
        var ast = this.toAST();
        var code = this.compileAST(ast);
        this.compiled = new Function("ixer", "QueryFunctions", "tableId", "rootRows", code);
        if (this.canBeIncremental()) {
            this.incrementalRowFinder = new Function("changes", this.compileIncrementalRowFinderCode());
        }
        else {
            this.incrementalRowFinder = undefined;
        }
        this.dirty = false;
        return this;
    };
    Query.prototype.exec = function () {
        if (this.dirty) {
            this.compile();
        }
        var root = this.joins[0];
        var rows;
        if (root) {
            rows = this.ixer.find(root.table, root.join);
        }
        else {
            rows = [];
        }
        return this.compiled(this.ixer, exports.QueryFunctions, this.name, rows);
    };
    Query.prototype.execIncremental = function (changes, table) {
        if (this.dirty) {
            this.compile();
        }
        if (this.incrementalRowFinder) {
            var potentialRows = this.incrementalRowFinder(changes);
            // if the root select has some constant filters, then
            // the above rows need to be filtered down to only those that
            // match.
            var rows = [];
            var root = this.joins[0];
            var rootKeys = Object.keys(root.join);
            if (rootKeys.length > 0) {
                rowLoop: for (var _i = 0; _i < potentialRows.length; _i++) {
                    var row = potentialRows[_i];
                    for (var _a = 0; _a < rootKeys.length; _a++) {
                        var key = rootKeys[_a];
                        if (row[key] !== root.join[key])
                            continue rowLoop;
                    }
                    rows.push(row);
                }
            }
            else {
                rows = potentialRows;
            }
            var results = this.compiled(this.ixer, exports.QueryFunctions, this.name, rows);
            var adds = [];
            var prevHashes = table.factHash;
            var prevKeys = Object.keys(prevHashes);
            var suggestedRemoves = this.incrementalRemove(changes);
            var realDiff = diffAddsAndRemoves(results.results, suggestedRemoves);
            for (var _b = 0, _c = realDiff.adds; _b < _c.length; _b++) {
                var result = _c[_b];
                var id = result.__id;
                if (prevHashes[id] === undefined) {
                    adds.push(result);
                }
            }
            var diff = this.ixer.diff();
            diff.addMany("provenance", results.provenance);
            this.ixer.applyDiffIncremental(diff);
            // console.log("INC PROV DIFF", this.name, diff.length);
            return { provenance: results.provenance, adds: adds, removes: realDiff.removes };
        }
        else {
            var results = this.exec();
            var adds = [];
            var removes = [];
            var prevHashes = table.factHash;
            var prevKeys = Object.keys(prevHashes);
            var newHashes = {};
            for (var _d = 0, _e = results.results; _d < _e.length; _d++) {
                var result = _e[_d];
                var id = result.__id;
                newHashes[id] = result;
                if (prevHashes[id] === undefined) {
                    adds.push(result);
                }
            }
            for (var _f = 0; _f < prevKeys.length; _f++) {
                var hash = prevKeys[_f];
                var value = newHashes[hash];
                if (value === undefined) {
                    removes.push(prevHashes[hash]);
                }
            }
            var realDiff = diffAddsAndRemoves(adds, removes);
            var diff = this.ixer.diff();
            diff.remove("provenance", { table: this.name });
            diff.addMany("provenance", results.provenance);
            this.ixer.applyDiffIncremental(diff);
            // console.log("FULL PROV SIZE", this.name, diff.length);
            return { provenance: results.provenance, adds: realDiff.adds, removes: realDiff.removes };
        }
    };
    Query.prototype.debug = function () {
        console.log(this.compileAST(this.toAST()));
        console.time("exec");
        var results = this.exec();
        console.timeEnd("exec");
        console.log(results);
        return results;
    };
    return Query;
})();
exports.Query = Query;
var Union = (function () {
    function Union(ixer, name) {
        if (name === void 0) { name = "unknown"; }
        this.name = name;
        this.ixer = ixer;
        this.tables = [];
        this.sources = [];
        this.isStateful = false;
        this.prev = { results: [], hashes: {} };
        this.dirty = true;
    }
    Union.prototype.changeset = function (ixer) {
        var diff = ixer.diff();
        diff.add("view", { view: this.name, kind: "union" });
        for (var _i = 0, _a = this.sources; _i < _a.length; _i++) {
            var source = _a[_i];
            if (source.type === "+") {
                var action = utils_1.uuid();
                diff.add("action", { view: this.name, action: action, kind: "union", ix: 0 });
                diff.add("action source", { action: action, "source view": source.table });
                for (var field in source.mapping) {
                    var mapped = source.mapping[field];
                    if (mapped.constructor === Array)
                        diff.add("action mapping", { action: action, from: field, "to source": source.table, "to field": mapped[0] });
                    else
                        diff.add("action mapping constant", { action: action, from: field, value: mapped });
                }
            }
            else
                throw new Error("Unknown source type: '" + source.type + "'");
        }
        return diff;
    };
    Union.prototype.ensureHasher = function (mapping) {
        if (!this.hasher) {
            this.hasher = generateStringFn(Object.keys(mapping));
        }
    };
    Union.prototype.union = function (tableName, mapping) {
        this.dirty = true;
        this.ensureHasher(mapping);
        this.tables.push(tableName);
        this.sources.push({ type: "+", table: tableName, mapping: mapping });
        return this;
    };
    Union.prototype.toAST = function () {
        var root = { type: "union", children: [] };
        root.children.push({ type: "declaration", var: "results", value: "[]" });
        root.children.push({ type: "declaration", var: "provenance", value: "[]" });
        var hashesValue = "{}";
        if (this.isStateful) {
            hashesValue = "prevHashes";
        }
        root.children.push({ type: "declaration", var: "hashes", value: hashesValue });
        var ix = 0;
        for (var _i = 0, _a = this.sources; _i < _a.length; _i++) {
            var source = _a[_i];
            var action = void 0;
            if (source.type === "+") {
                action = { type: "result", ix: ix, children: [{ type: "provenance", source: source, ix: ix }] };
            }
            root.children.push({
                type: "source",
                ix: ix,
                table: source.table,
                mapping: source.mapping,
                children: [action],
            });
            ix++;
        }
        root.children.push({ type: "hashesToResults" });
        root.children.push({ type: "return", vars: ["results", "hashes", "provenance"] });
        return root;
    };
    Union.prototype.compileAST = function (root) {
        var code = "";
        var type = root.type;
        switch (type) {
            case "union":
                for (var _i = 0, _a = root.children; _i < _a.length; _i++) {
                    var child = _a[_i];
                    code += this.compileAST(child);
                }
                break;
            case "declaration":
                code += "var " + root.var + " = " + root.value + ";\n";
                break;
            case "source":
                var ix = root.ix;
                var mappingItems = [];
                for (var key in root.mapping) {
                    var mapping = root.mapping[key];
                    var value = void 0;
                    if (mapping.constructor === Array && mapping.length === 1) {
                        var field = mapping[0];
                        value = "sourceRow" + ix + "['" + field + "']";
                    }
                    else if (mapping.constructor === Array && mapping.length === 2) {
                        var _ = mapping[0], field = mapping[1];
                        value = "sourceRow" + ix + "['" + field + "']";
                    }
                    else {
                        value = JSON.stringify(mapping);
                    }
                    mappingItems.push("'" + key + "': " + value);
                }
                code += "var sourceRows" + ix + " = changes['" + root.table.replace(/'/g, "\\'") + "'];\n";
                code += "for(var rowIx" + ix + " = 0, rowsLen" + ix + " = sourceRows" + ix + ".length; rowIx" + ix + " < rowsLen" + ix + "; rowIx" + ix + "++) {\n";
                code += "var sourceRow" + ix + " = sourceRows" + ix + "[rowIx" + ix + "];\n";
                code += "var mappedRow" + ix + " = {" + mappingItems.join(", ") + "};\n";
                for (var _b = 0, _c = root.children; _b < _c.length; _b++) {
                    var child = _c[_b];
                    code += this.compileAST(child);
                }
                code += "}\n";
                break;
            case "result":
                var ix = root.ix;
                code += "var hash" + ix + " = hasher(mappedRow" + ix + ");\n";
                code += "mappedRow" + ix + ".__id = hash" + ix + ";\n";
                code += "hashes[hash" + ix + "] = mappedRow" + ix + ";\n";
                for (var _d = 0, _e = root.children; _d < _e.length; _d++) {
                    var child = _e[_d];
                    code += this.compileAST(child);
                }
                break;
            case "removeResult":
                var ix = root.ix;
                code += "hashes[hasher(mappedRow" + ix + ")] = false;\n";
                break;
            case "hashesToResults":
                code += "var hashKeys = Object.keys(hashes);\n";
                code += "for(var hashKeyIx = 0, hashKeyLen = hashKeys.length; hashKeyIx < hashKeyLen; hashKeyIx++) {\n";
                code += "var curHashKey = hashKeys[hashKeyIx];";
                code += "var value = hashes[curHashKey];\n";
                code += "if(value !== false) {\n";
                code += "value.__id = curHashKey;\n";
                code += "results.push(value);\n";
                code += "}\n";
                code += "}\n";
                break;
            case "provenance":
                var source = root.source.table;
                var ix = root.ix;
                var provenance = "var provenance__id = '';\n";
                provenance += "provenance__id = '" + this.name.replace(/'/g, "\\'") + "|' + mappedRow" + ix + ".__id + '|' + rowInstance + '|" + source.replace(/'/g, "\\'") + "|' + sourceRow" + ix + ".__id; \n";
                provenance += "provenance.push({table: '" + this.name.replace(/'/g, "\\'") + "', row: mappedRow" + ix + ", \"row instance\": rowInstance, source: \"" + source.replace(/'/g, "\\'") + "\", \"source row\": sourceRow" + ix + "});\n";
                code = "var rowInstance = \"" + source.replace(/'/g, "\\'") + "|\" + mappedRow" + ix + ".__id;\n        " + provenance;
                break;
            case "return":
                code += "return {" + root.vars.map(function (name) { return (name + ": " + name); }).join(", ") + "};";
                break;
        }
        return code;
    };
    Union.prototype.compile = function () {
        var ast = this.toAST();
        var code = this.compileAST(ast);
        this.compiled = new Function("ixer", "hasher", "changes", code);
        this.dirty = false;
        return this;
    };
    Union.prototype.debug = function () {
        var code = this.compileAST(this.toAST());
        console.log(code);
        return code;
    };
    Union.prototype.exec = function () {
        if (this.dirty) {
            this.compile();
        }
        var changes = {};
        for (var _i = 0, _a = this.sources; _i < _a.length; _i++) {
            var source = _a[_i];
            changes[source.table] = this.ixer.table(source.table).table;
        }
        var results = this.compiled(this.ixer, this.hasher, changes);
        return results;
    };
    Union.prototype.incrementalRemove = function (changes) {
        var ixer = this.ixer;
        var rowsToPostCheck = [];
        var provenanceDiff = this.ixer.diff();
        var removes = [];
        var indexes = ixer.table("provenance").indexes;
        var sourceRowLookup = indexes["source|source row|table"].index;
        var rowInstanceLookup = indexes["row instance|table"].index;
        var tableRowLookup = indexes["row|table"].index;
        var provenanceRemoves = [];
        var visited = {};
        for (var _i = 0, _a = this.sources; _i < _a.length; _i++) {
            var source = _a[_i];
            var change = changes[source.table];
            if (!visited[source.table] && change && change.removes.length) {
                visited[source.table] = true;
                for (var _b = 0, _c = change.removes; _b < _c.length; _b++) {
                    var remove = _c[_b];
                    var provenances = sourceRowLookup[source.table + '|' + remove.__id + '|' + this.name];
                    if (provenances) {
                        for (var _d = 0; _d < provenances.length; _d++) {
                            var provenance = provenances[_d];
                            if (!visited[provenance["row instance"]]) {
                                visited[provenance["row instance"]] = true;
                                var relatedProvenance = rowInstanceLookup[provenance["row instance"] + '|' + provenance.table];
                                for (var _e = 0; _e < relatedProvenance.length; _e++) {
                                    var related = relatedProvenance[_e];
                                    provenanceRemoves.push(related);
                                }
                            }
                            rowsToPostCheck.push(provenance);
                        }
                    }
                }
            }
        }
        provenanceDiff.removeFacts("provenance", provenanceRemoves);
        ixer.applyDiffIncremental(provenanceDiff);
        var isEdb = ixer.edbTables;
        for (var _f = 0; _f < rowsToPostCheck.length; _f++) {
            var row = rowsToPostCheck[_f];
            var supports = tableRowLookup[row.row.__id + '|' + row.table];
            if (!supports || supports.length === 0) {
                removes.push(row.row);
            }
            else if (this.sources.length > 2) {
                var supportsToRemove = [];
                // otherwise if there are supports, then we need to walk the support
                // graph backwards and make sure every supporting row terminates at an
                // edb value. If not, then that support also needs to be removed
                for (var _g = 0; _g < supports.length; _g++) {
                    var support = supports[_g];
                    // if the support is already an edb, we're good to go.
                    if (isEdb[support.source])
                        continue;
                    if (!tableRowLookup[support["source row"].__id + '|' + support.source]) {
                        supportsToRemove.push(support);
                        continue;
                    }
                    // get all the supports for this support
                    var nodes = tableRowLookup[support["source row"].__id + '|' + support.source].slice();
                    var nodeIx = 0;
                    // iterate through all the nodes, if they have further supports then
                    // assume this node is ok and add those supports to the list of nodes to
                    // check. If we run into a node with no supports it must either be an edb
                    // or it's unsupported and this row instance needs to be removed.
                    while (nodeIx < nodes.length) {
                        var node = nodes[nodeIx];
                        if (isEdb[node.source]) {
                            nodeIx++;
                            continue;
                        }
                        var nodeSupports = tableRowLookup[node["source row"].__id + '|' + node.source];
                        if (!nodeSupports || nodeSupports.length === 0) {
                            supportsToRemove.push(support);
                            break;
                        }
                        else {
                            for (var _h = 0; _h < nodeSupports.length; _h++) {
                                var nodeSupport = nodeSupports[_h];
                                nodes.push(nodeSupport);
                            }
                            nodeIx++;
                        }
                    }
                }
                if (supportsToRemove.length) {
                    // we need to remove all the supports
                    var provenanceRemoves_1 = [];
                    for (var _j = 0; _j < supportsToRemove.length; _j++) {
                        var support = supportsToRemove[_j];
                        var relatedProvenance = rowInstanceLookup[support["row instance"] + '|' + support.table];
                        for (var _k = 0; _k < relatedProvenance.length; _k++) {
                            var related = relatedProvenance[_k];
                            provenanceRemoves_1.push(related);
                        }
                    }
                    var diff = ixer.diff();
                    diff.removeFacts("provenance", provenanceRemoves_1);
                    ixer.applyDiffIncremental(diff);
                    // now that all the unsupported provenances have been removed, check if there's anything
                    // left.
                    if (!tableRowLookup[row.row.__id + '|' + row.table] || tableRowLookup[row.row.__id + '|' + row.table].length === 0) {
                        removes.push(row.row);
                    }
                }
            }
        }
        return removes;
    };
    Union.prototype.execIncremental = function (changes, table) {
        if (this.dirty) {
            this.compile();
        }
        var sourceChanges = {};
        for (var _i = 0, _a = this.sources; _i < _a.length; _i++) {
            var source = _a[_i];
            var value = void 0;
            if (!changes[source.table]) {
                value = [];
            }
            else {
                value = changes[source.table].adds;
            }
            sourceChanges[source.table] = value;
        }
        var results = this.compiled(this.ixer, this.hasher, sourceChanges);
        var adds = [];
        var prevHashes = table.factHash;
        var prevKeys = Object.keys(prevHashes);
        var suggestedRemoves = this.incrementalRemove(changes);
        var realDiff = diffAddsAndRemoves(results.results, suggestedRemoves);
        for (var _b = 0, _c = realDiff.adds; _b < _c.length; _b++) {
            var result = _c[_b];
            var id = result.__id;
            if (prevHashes[id] === undefined) {
                adds.push(result);
            }
        }
        var diff = this.ixer.diff();
        diff.addMany("provenance", results.provenance);
        this.ixer.applyDiffIncremental(diff);
        return { provenance: results.provenance, adds: adds, removes: realDiff.removes };
    };
    return Union;
})();
exports.Union = Union;
//---------------------------------------------------------
// Builtin Primitives
//---------------------------------------------------------
runtime.define("count", { aggregate: true, result: "count" }, function (prev) {
    if (!prev.count) {
        prev.count = 0;
    }
    prev.count++;
    return prev;
});
runtime.define("sum", { aggregate: true, result: "sum" }, function (prev, value) {
    if (!prev.sum) {
        prev.sum = 0;
    }
    prev.sum += value;
    return prev;
});
runtime.define("average", { aggregate: true, result: "average" }, function (prev, value) {
    if (!prev.sum) {
        prev.sum = 0;
        prev.count = 0;
    }
    prev.count++;
    prev.sum += value;
    prev.average = prev.sum / prev.count;
    return prev;
});
runtime.define("lowercase", { result: "lowercase" }, function (text) {
    if (typeof text === "string") {
        return { result: text.toLowerCase() };
    }
    return { result: text };
});
runtime.define("=", { filter: true, inverse: "!=" }, function (a, b) {
    return a === b ? runtime.SUCCEED : runtime.FAIL;
});
runtime.define("!=", { filter: true, inverse: "=" }, function (a, b) {
    return a !== b ? runtime.SUCCEED : runtime.FAIL;
});
runtime.define(">", { filter: true, inverse: "<=" }, function (a, b) {
    return a > b ? runtime.SUCCEED : runtime.FAIL;
});
runtime.define("<", { filter: true, inverse: ">=" }, function (a, b) {
    return a < b ? runtime.SUCCEED : runtime.FAIL;
});
runtime.define(">=", { filter: true, inverse: "<" }, function (a, b) {
    return a >= b ? runtime.SUCCEED : runtime.FAIL;
});
runtime.define("<=", { filter: true, inverse: ">" }, function (a, b) {
    return a <= b ? runtime.SUCCEED : runtime.FAIL;
});
runtime.define("+", { result: "result" }, function (a, b) {
    return { result: a + b };
});
runtime.define("-", { result: "result" }, function (a, b) {
    return { result: a - b };
});
runtime.define("*", { result: "result" }, function (a, b) {
    return { result: a * b };
});
runtime.define("/", { result: "result" }, function (a, b) {
    return { result: a / b };
});
//---------------------------------------------------------
// AST and compiler
//---------------------------------------------------------
// view: view, kind[union|query|table]
// action: view, action, kind[select|calculate|project|union|ununion|stateful|limit|sort|group|aggregate], ix
// action source: action, source view
// action mapping: action, from, to source, to field
// action mapping constant: action, from, value
function addRecompileTriggers(eve) {
    var recompileTrigger = {
        exec: function (ixer) {
            for (var _i = 0, _a = ixer.find("view"); _i < _a.length; _i++) {
                var view = _a[_i];
                if (view.kind === "table")
                    continue;
                try {
                    var query = compile(ixer, view.view);
                    ixer.asView(query);
                }
                catch (e) {
                    console.error("BAD QUERY IN THE DB :(");
                    console.error("View Id: " + view.view);
                    console.log(e.stack);
                    ixer.applyDiff(Query.remove(view.view, ixer));
                }
            }
            return {};
        }
    };
    eve.addTable("view", ["view", "kind"]);
    eve.addTable("action", ["view", "action", "kind", "ix"]);
    eve.addTable("action source", ["action", "source view"]);
    eve.addTable("action mapping", ["action", "from", "to source", "to field"]);
    eve.addTable("action mapping constant", ["action", "from", "value"]);
    eve.addTable("action mapping sorted", ["action", "ix", "source", "field", "direction"]);
    eve.addTable("action mapping limit", ["action", "limit type", "value"]);
    eve.table("view").triggers["recompile"] = recompileTrigger;
    eve.table("action").triggers["recompile"] = recompileTrigger;
    eve.table("action source").triggers["recompile"] = recompileTrigger;
    eve.table("action mapping").triggers["recompile"] = recompileTrigger;
    eve.table("action mapping constant").triggers["recompile"] = recompileTrigger;
    eve.table("action mapping sorted").triggers["recompile"] = recompileTrigger;
    eve.table("action mapping limit").triggers["recompile"] = recompileTrigger;
    return eve;
}
function compile(ixer, viewId) {
    var view = ixer.findOne("view", { view: viewId });
    if (!view) {
        throw new Error("No view found for " + viewId + ".");
    }
    var compiled = ixer[view.kind](viewId);
    var actions = ixer.find("action", { view: viewId });
    if (!actions) {
        throw new Error("View " + viewId + " has no actions.");
    }
    // sort actions by ix
    actions.sort(function (a, b) { return a.ix - b.ix; });
    for (var _i = 0; _i < actions.length; _i++) {
        var action = actions[_i];
        var actionKind = action.kind;
        if (actionKind === "limit") {
            var limit = {};
            for (var _a = 0, _b = ixer.find("action mapping limit", { action: action.action }); _a < _b.length; _a++) {
                var limitMapping = _b[_a];
                limit[limitMapping["limit type"]] = limitMapping["value"];
            }
            compiled.limit(limit);
        }
        else if (actionKind === "sort" || actionKind === "group") {
            var sorted = [];
            var mappings = ixer.find("action mapping sorted", { action: action.action });
            mappings.sort(function (a, b) { return a.ix - b.ix; });
            for (var _c = 0; _c < mappings.length; _c++) {
                var mapping = mappings[_c];
                sorted.push([mapping["source"], mapping["field"], mapping["direction"]]);
            }
            if (sorted.length) {
                compiled[actionKind](sorted);
            }
            else {
                throw new Error(actionKind + " without any mappings: " + action.action);
            }
        }
        else {
            var mappings = ixer.find("action mapping", { action: action.action });
            var mappingObject = {};
            for (var _d = 0; _d < mappings.length; _d++) {
                var mapping = mappings[_d];
                var source_1 = mapping["to source"];
                var field = mapping["to field"];
                if (actionKind === "union" || actionKind === "ununion") {
                    mappingObject[mapping.from] = [field];
                }
                else {
                    mappingObject[mapping.from] = [source_1, field];
                }
            }
            var constants = ixer.find("action mapping constant", { action: action.action });
            for (var _e = 0; _e < constants.length; _e++) {
                var constant = constants[_e];
                mappingObject[constant.from] = constant.value;
            }
            var source = ixer.findOne("action source", { action: action.action });
            if (!source && actionKind !== "project") {
                throw new Error(actionKind + " action without a source in '" + viewId + "'");
            }
            if (actionKind !== "project") {
                compiled[actionKind](source["source view"], mappingObject, action.action);
            }
            else {
                compiled[actionKind](mappingObject);
            }
        }
    }
    return compiled;
}
exports.compile = compile;
//---------------------------------------------------------
// Public API
//---------------------------------------------------------
exports.SUCCEED = [{ success: true }];
exports.FAIL = [];
function indexer() {
    var ixer = new Indexer();
    addProvenanceTable(ixer);
    addRecompileTriggers(ixer);
    return ixer;
}
exports.indexer = indexer;
if (utils_1.ENV === "browser")
    window["runtime"] = exports;
//# sourceMappingURL=runtime.js.map