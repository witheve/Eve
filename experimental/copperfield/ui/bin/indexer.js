var Indexing;
(function (Indexing) {
    ;
    function arraysIdentical(a, b) {
        var i = a.length;
        if (!b || i != b.length)
            return false;
        while (i--) {
            if (a[i] && a[i].constructor === Array && b[i]) {
                if (!arraysIdentical(a[i], b[i]))
                    return false;
                continue;
            }
            if (a[i] !== b[i])
                return false;
        }
        return true;
    }
    Indexing.arraysIdentical = arraysIdentical;
    function clone(item) {
        if (!item) {
            return item;
        }
        var result;
        if (item instanceof Array) {
            result = [];
            item.forEach(function (child, index, array) {
                result[index] = clone(child);
            });
        }
        else if (typeof item == "object") {
            result = {};
            for (var i in item) {
                result[i] = clone(item[i]);
            }
        }
        else {
            //it's a primitive
            result = item;
        }
        return result;
    }
    Indexing.clone = clone;
    function generateExtractorFn(view, keys) {
        return new Function("fact", "return { " + keys.map(function (key, ix) {
            return "\"" + key + "\": fact[\"" + ix + "\"]";
        }).join(", ") + " };");
    }
    function generatePackerFn(view, keys) {
        var packer = new Function("fact", "return [" + keys.map(function (key) {
            return "fact[\"" + key + "\"]";
        }).join(", ") + "];");
        packer.fields = keys;
        return packer;
    }
    function generateMapperFn(view, keys, mapping) {
        return new Function("fact", "return { " + keys.map(function (key) {
            return "\"" + mapping[key] + "\": fact[\"" + key + "\"]";
        }).join(", ") + " };");
    }
    function generateEqualityFn(view, keys) {
        if (keys.length === 0) {
            return function (a, b) { return true; };
        }
        return new Function("a", "b", "return " + keys.map(function (key, ix) {
            return "(a[\"" + key + "\"] === b[\"" + key + "\"] || (a[\"" + key + "\"] && a[\"" + key + "\"].constructor === Array && Indexing.arraysIdentical(a[\"" + key + "\"], b[\"" + key + "\"])))";
        }).join(" && ") + ";");
    }
    function indexOfFact(equals, haystack, needle) {
        var result = -1;
        if (!equals) {
            return result;
        }
        for (var haystackIx = 0, haystackLen = haystack.length; haystackIx < haystackLen; haystackIx++) {
            var cur = haystack[haystackIx];
            if (equals(cur, needle)) {
                result = haystackIx;
                break;
            }
        }
        return result;
    }
    function applyTableDiff(equals, table, adds, removes) {
        var dedupedAdds = [];
        var dedupedRemoves = [];
        for (var remIx = 0, remLen = removes.length; remIx < remLen; remIx++) {
            var rem = removes[remIx];
            var foundIx = indexOfFact(equals, table, rem);
            if (foundIx !== -1) {
                table.splice(foundIx, 1);
                dedupedRemoves.push(rem);
            }
        }
        for (var addIx = 0, addLen = adds.length; addIx < addLen; addIx++) {
            var add = adds[addIx];
            var foundIx = indexOfFact(equals, table, add);
            if (foundIx !== -1)
                continue;
            table.push(add);
            dedupedAdds.push(add);
        }
        return { adds: dedupedAdds, removes: dedupedRemoves };
    }
    /*  var factExtractorFns:{[key:string]: Extractor} = {};
      var factPackerFns:{[key:string]: Packer} = {};
      var factEqualityFns:{[key:string]: EqualityChecker} = {};
    */
    var Indexer = (function () {
        function Indexer() {
            this.tables = {};
            this.indexes = {};
            this.tableToIndex = {};
            this.needsRebuild = {};
        }
        Indexer.prototype.totalFacts = function () {
            var total = 0;
            for (var table in this.tables) {
                total += this.tables[table].length;
            }
            return total;
        };
        Indexer.prototype.clear = function () {
            var final = [];
            for (var table in this.tables) {
                if (this.tables[table]) {
                    this.handleDiff(table, [], this.tables[table].slice());
                }
            }
            for (var index in this.indexes) {
                this.indexes[index].index = {};
            }
            return { session: undefined, changes: final, commands: [] };
        };
        Indexer.prototype.clearTable = function (table) {
            if (this.tables[table]) {
                this.handleDiff(table, this.getFields(table), [], this.tables[table].slice());
            }
        };
        Indexer.prototype.markForRebuild = function (table) {
            this.needsRebuild[table] = true;
        };
        Indexer.prototype.getFields = function (table, unsorted) {
            var fields = this.index("view to fields", true)[table];
            var orders = this.index("display order", true) || {};
            if (!fields) {
                return [];
            }
            var fieldIds = fields.map(function (field) { return field["field: field"]; });
            if (unsorted) {
                return fieldIds;
            }
            fieldIds.sort(function (a, b) {
                var delta = orders[a] - orders[b];
                if (delta) {
                    return delta;
                }
                else {
                    return a.localeCompare(b);
                }
            });
            return fieldIds;
        };
        Indexer.prototype.getKeys = function (table) {
            var fieldIds = api.ixer.getFields(table) || [];
            var keys = [];
            for (var _i = 0; _i < fieldIds.length; _i++) {
                var fieldId = fieldIds[_i];
                if (api.code.hasTag(fieldId, "key")) {
                    keys.push(fieldId);
                }
            }
            return keys;
        };
        Indexer.prototype.handleDiff = function (table, fields, adds, removes) {
            if (adds === void 0) { adds = []; }
            if (removes === void 0) { removes = []; }
            var dedupedAdds = adds;
            var dedupedRemoves = removes;
            //update table
            if (this.tables[table] === undefined) {
                this.tables[table] = [];
            }
            var equals = generateEqualityFn(table, fields);
            var deduped = applyTableDiff(equals, this.tables[table], adds, removes);
            dedupedAdds = deduped.adds;
            dedupedRemoves = deduped.removes;
            //update indexes
            var shouldRebuild = this.needsRebuild[table];
            var indexes = this.tableToIndex[table] || [];
            for (var _i = 0; _i < indexes.length; _i++) {
                var cur = indexes[_i];
                if (shouldRebuild && cur.requiresRebuild) {
                    cur.index = cur.indexer({}, this.tables[table], [], equals);
                }
                else {
                    cur.index = cur.indexer(cur.index, dedupedAdds, dedupedRemoves, equals);
                }
            }
            if (shouldRebuild) {
                this.needsRebuild[table] = false;
            }
        };
        Indexer.prototype.dumpMapDiffs = function () {
            var final = [];
            for (var table in this.tables) {
                var pack = generatePackerFn(table, this.getFields(table));
                final.push([table, pack.fields, (this.tables[table] || []).map(pack), []]);
            }
            return { session: undefined, changes: final, commands: [] };
        };
        Indexer.prototype.compactDiffs = function () {
            var compiler = [];
            var codeTags = this.select("tag", { "tag": "code" }) || [];
            for (var _i = 0; _i < codeTags.length; _i++) {
                var tag = codeTags[_i];
                var table = tag["tag: view"];
                var pack = generatePackerFn(table, this.getFields(table));
                compiler.push([table, pack.fields, (this.tables[table] || []).map(pack), []]);
            }
            var facts = [];
            for (var table in this.tables) {
                if (api.code.hasTag(table, "code")) {
                    continue;
                } // @FIXME: Indexer should not depend on api.
                var kind = (this.selectOne("view", { view: table }) || {})["view: kind"];
                if (kind !== "table")
                    continue;
                var pack = generatePackerFn(table, this.getFields(table));
                facts.push([table, pack.fields, (this.tables[table] || []).map(pack), []]);
            }
            return JSON.stringify({ changes: compiler }) + "\n" + JSON.stringify({ changes: facts }) + "\n";
        };
        Indexer.prototype.handleMapDiffs = function (diffs) {
            for (var _i = 0; _i < diffs.length; _i++) {
                var _a = diffs[_i], table = _a[0], fields = _a[1], inserted = _a[2], removed = _a[3];
                if (inserted.length || removed.length) {
                    var extract = generateExtractorFn(table, fields);
                    this.handleDiff(table, fields, (inserted || []).map(extract), (removed || []).map(extract));
                }
            }
        };
        Indexer.prototype.handleDiffs = function (diffs) {
            var diffTables = {};
            var adds = {};
            var removes = {};
            for (var _i = 0; _i < diffs.length; _i++) {
                var _a = diffs[_i], table = _a[0], action = _a[1], fact = _a[2];
                diffTables[table] = true;
                if (action === "inserted") {
                    if (!adds[table]) {
                        adds[table] = [];
                    }
                    adds[table].push(fact);
                }
                else {
                    if (!removes[table]) {
                        removes[table] = [];
                    }
                    removes[table].push(fact);
                }
            }
            for (var table in diffTables) {
                var fields = this.getFields(table);
                var extract = generateExtractorFn(table, fields);
                this.handleDiff(table, fields, (adds[table] || []).map(extract), (removes[table] || []).map(extract));
            }
        };
        Indexer.prototype.addIndex = function (name, table, indexer) {
            var index = { index: {}, indexer: indexer.func, table: table, keys: indexer.keys, requiresRebuild: indexer.requiresRebuild };
            this.indexes[name] = index;
            if (!this.tableToIndex[table]) {
                this.tableToIndex[table] = [];
            }
            this.tableToIndex[table].push(index);
            if (this.tables[table]) {
                var pack = generatePackerFn(table, this.getFields(table));
                index.index = index.indexer(index.index, this.tables[table], [], pack);
            }
        };
        Indexer.prototype.index = function (name, unpacked) {
            if (unpacked === void 0) { unpacked = false; }
            if (this.indexes[name]) {
                var indexObj = this.indexes[name];
                var table = indexObj.table;
                if (DEBUG && DEBUG.INDEXER && !this.tables[table]) {
                    console.warn("Indexed table '" + table + "' does not yet exist for index '" + name + "'.");
                }
                var index = this.indexes[name].index;
                if (!index)
                    return {};
                if (unpacked)
                    return index;
                var pack = generatePackerFn(table, this.getFields(table));
                var depth = indexObj.keys.length - 1;
                function reduce(cur, curDepth) {
                    if (curDepth === void 0) { curDepth = 0; }
                    var memo = {};
                    var keys = Object.keys(cur);
                    for (var _i = 0; _i < keys.length; _i++) {
                        var key = keys[_i];
                        if (key === "undefined") {
                            throw new Error("Index: " + name + " contains invalid key(s) at depth " + depth);
                        }
                        if (cur[key] instanceof Array) {
                            memo[key] = cur[key].map(pack);
                        }
                        else if (typeof cur[key] === "object") {
                            if (curDepth === depth) {
                                memo[key] = pack(cur[key]);
                            }
                            else {
                                memo[key] = reduce(cur[key], curDepth + 1);
                            }
                        }
                        else {
                            memo[key] = cur[key];
                        }
                    }
                    return memo;
                }
                return reduce(index);
            }
            return null;
        };
        Indexer.prototype.facts = function (table, unpacked) {
            if (unpacked === void 0) { unpacked = false; }
            var index = this.tables[table] || [];
            if (unpacked || !index.length) {
                return index;
            }
            var pack = generatePackerFn(table, this.getFields(table));
            return (this.tables[table] || []).map(pack);
        };
        Indexer.prototype.first = function (table, unpacked) {
            if (unpacked === void 0) { unpacked = false; }
            return this.facts(table, unpacked)[0];
        };
        Indexer.prototype.select = function (table, opts, useIds) {
            if (useIds === void 0) { useIds = false; }
            var facts = [];
            var first = this.first(table, true);
            if (!first) {
                return [];
            }
            var names, keys;
            if (!useIds) {
                keys = [];
                names = this.indexes["display name"].index;
                var fields = (this.indexes["view to fields"].index[table] || []);
                var fieldLookup = {};
                for (var _i = 0; _i < fields.length; _i++) {
                    var field = fields[_i];
                    var fieldId = field["field: field"];
                    fieldLookup[names[fieldId]] = fieldId;
                }
                for (var _a = 0, _b = Object.keys(opts); _a < _b.length; _a++) {
                    var key_1 = _b[_a];
                    if (opts[key_1] === undefined)
                        continue;
                    var result = fieldLookup[key_1];
                    if (result === undefined) {
                        throw new Error("Field " + key_1 + " is not a valid field of table " + table);
                    }
                    keys.push(result);
                }
            }
            else {
                keys = Object.keys(opts);
                names = {};
                for (var fieldId in opts) {
                    names[fieldId] = fieldId;
                }
            }
            keys.sort();
            if (keys.length > 0) {
                var indexName = table + "|" + keys.join("|");
                var index = this.indexes[indexName] ? this.indexes[indexName].index : false;
                if (!index) {
                    this.addIndex(indexName, table, Indexing.create.collector(keys));
                    index = this.indexes[indexName].index;
                }
                for (var _c = 0; _c < keys.length; _c++) {
                    var key = keys[_c];
                    if (index === undefined)
                        break;
                    index = index[opts[names[key]]];
                }
                if (index) {
                    facts = index;
                }
            }
            else {
                facts = this.facts(table, true);
            }
            if (!facts) {
                return [];
            }
            return facts;
        };
        Indexer.prototype.selectPretty = function (table, opts) {
            var names = this.index("display name", true);
            var facts = this.select(table, opts);
            var mapToNames = generateMapperFn(table, this.getFields(table, true), names);
            return facts.map(mapToNames);
        };
        Indexer.prototype.selectOne = function (table, opts) {
            return this.select(table, opts)[0];
        };
        Indexer.prototype.selectOnePretty = function (table, opts) {
            var fact = this.select(table, opts)[0];
            if (!fact) {
                return fact;
            }
            var names = this.index("display name", true);
            var mapToNames = generateMapperFn(table, this.getFields(table, true), names);
            return mapToNames(fact);
        };
        return Indexer;
    })();
    Indexing.Indexer = Indexer;
    Indexing.create = {
        lookup: function (keys) {
            var valueKey = keys.pop();
            var tailKey = keys[keys.length - 1];
            var keysLength = keys.length;
            return {
                requiresRebuild: false,
                keys: keys,
                func: function (cur, adds, removes) {
                    var cursor;
                    outer: for (var _i = 0; _i < removes.length; _i++) {
                        var rem = removes[_i];
                        cursor = cur;
                        for (var keyIx = 0; keyIx < keysLength - 1; keyIx++) {
                            cursor = cursor[rem[key]];
                            if (!cursor) {
                                continue outer;
                            }
                        }
                        delete cursor[rem[tailKey]];
                    }
                    for (var _a = 0; _a < adds.length; _a++) {
                        var add = adds[_a];
                        cursor = cur;
                        for (var keyIx = 0; keyIx < keysLength - 1; keyIx++) {
                            var key = keys[keyIx];
                            var next = cursor[add[key]];
                            if (!next) {
                                next = cursor[add[key]] = {};
                            }
                            cursor = next;
                        }
                        if (valueKey !== false) {
                            cursor[add[tailKey]] = add[valueKey];
                        }
                        else {
                            cursor[add[tailKey]] = add; // @FIXME: Need to pack false lookups, but don't have table name.
                        }
                    }
                    return cur;
                }
            };
        },
        collector: function (keys) {
            var tailKey = keys[keys.length - 1];
            var keysLength = keys.length;
            return {
                requiresRebuild: false,
                keys: keys,
                func: function (cur, adds, removes, equals) {
                    var cursor;
                    outer: for (var _i = 0; _i < removes.length; _i++) {
                        var rem = removes[_i];
                        cursor = cur;
                        for (var keyIx = 0; keyIx < keysLength - 1; keyIx++) {
                            var key = keys[keyIx];
                            cursor = cursor[rem[key]];
                            if (!cursor) {
                                continue outer;
                            }
                        }
                        cursor[rem[tailKey]] = cursor[rem[tailKey]].filter(function (potential) { return !equals(rem, potential); });
                    }
                    for (var _a = 0; _a < adds.length; _a++) {
                        var add = adds[_a];
                        cursor = cur;
                        for (var keyIx = 0; keyIx < keysLength - 1; keyIx++) {
                            var key = keys[keyIx];
                            var next = cursor[add[key]];
                            if (!next) {
                                next = cursor[add[key]] = {};
                            }
                            cursor = next;
                        }
                        next = cursor[add[tailKey]];
                        if (!next) {
                            next = cursor[add[tailKey]] = [];
                        }
                        next.push(add);
                    }
                    return cur;
                }
            };
        }
    };
})(Indexing || (Indexing = {}));
//# sourceMappingURL=indexer.js.map