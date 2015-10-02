/// <reference path="indexer.ts" />
var Api;
(function (Api) {
    Api.uuid = window.uuid;
    Api.version = 0;
    if (!window.DEBUG) {
        window.DEBUG = {
            RECEIVE: 0,
            SEND: 0,
            INDEXER: 0,
            RENDERER: false,
            RENDER_TIME: false,
            TABLE_CELL_LOOKUP: true
        };
    }
    Api.KEYS = {
        TAB: 9,
        BACKSPACE: 8,
        UP: 38,
        DOWN: 40,
        ENTER: 13,
        Z: 90,
        F: 70,
        ESC: 27,
        SPACE: 32
    };
    Api.alphabet = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
        "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];
    Api.alphabetLower = Api.alphabet.map(function (char) {
        return char.toLowerCase();
    });
    //---------------------------------------------------------------------------
    // Utilities
    //---------------------------------------------------------------------------
    Api.arraysIdentical = Indexing.arraysIdentical;
    Api.clone = Indexing.clone;
    function now() {
        if (window.performance) {
            return window.performance.now();
        }
        return (new Date()).getTime();
    }
    Api.now = now;
    function debounce(wait, func) {
        var timer;
        var args;
        var runner = function () {
            timer = false;
            return func.apply(null, args);
        };
        return function () {
            args = arguments;
            if (timer) {
                clearTimeout(timer);
            }
            timer = setTimeout(runner, wait);
            return timer;
        };
    }
    Api.debounce = debounce;
    function extend(dest, src) {
        for (var key in src) {
            if (!src.hasOwnProperty(key)) {
                continue;
            }
            dest[key] = src[key];
        }
        return dest;
    }
    Api.extend = extend;
    function displaySort(idA, idB) {
        var orderA = Api.ixer.index("display order")[idA];
        var orderB = Api.ixer.index("display order")[idB];
        if (orderA - orderB) {
            return orderA - orderB;
        }
        else {
            return idA.localeCompare(idB);
        }
    }
    Api.displaySort = displaySort;
    function invert(obj) {
        var res = {};
        for (var key in obj) {
            if (!obj.hasOwnProperty(key)) {
                continue;
            }
            res[obj[key]] = key;
        }
        return res;
    }
    Api.invert = invert;
    // @NOTE Rows array will be mutated in place. Please slice in advance if source cannot be mutated.
    function sortRows(rows, field, direction) {
        rows.sort(function sort(a, b) {
            a = a[field];
            b = b[field];
            if (direction < 0) {
                _a = [b, a], a = _a[0], b = _a[1];
            }
            var typeA = typeof a;
            var typeB = typeof b;
            if (typeA === typeB && typeA === "number") {
                return a - b;
            }
            if (typeA === "number") {
                return -1;
            }
            if (typeB === "number") {
                return 1;
            }
            if (typeA === "undefined") {
                return -1;
            }
            if (typeB === "undefined") {
                return 1;
            }
            if (a.constructor === Array) {
                return JSON.stringify(a).localeCompare(JSON.stringify(b));
            }
            return a.toString().localeCompare(b);
            var _a;
        });
    }
    Api.sortRows = sortRows;
    function reverseDiff(diffs) {
        var neue = [];
        for (var _i = 0; _i < diffs.length; _i++) {
            var diff = diffs[_i];
            var copy = diff.slice();
            neue.push(copy);
            copy[1] = (copy[1] === "inserted") ? "removed" : "inserted";
        }
        return neue;
    }
    Api.reverseDiff = reverseDiff;
    function checkVersion(callback) {
        var request = new XMLHttpRequest();
        request.onreadystatechange = function () {
            if (request.readyState === 4) {
                if (request.status !== 200) {
                    return callback(new Error("HTTP Response: " + request.status));
                }
                callback(undefined, +request.responseText > +Api.version);
            }
        };
        //request.open("GET", "https://gist.githubusercontent.com/joshuafcole/117ec93af90c054bac23/raw/1350f2aae121e19129e561678b107ec042a6cbd2/version");
        request.open("GET", "https://raw.githubusercontent.com/witheve/Eve/master/version");
        request.send();
    }
    Api.checkVersion = checkVersion;
    function writeToGist(name, content, callback) {
        var request = new XMLHttpRequest();
        request.onreadystatechange = function () {
            if (request.readyState === 4) {
                if (request.status !== 201) {
                    return callback(new Error("HTTP Response: " + request.status));
                }
                var response = JSON.parse(request.responseText);
                var file = response.files[name];
                var url = file.raw_url.split("/raw/")[0];
                var err = (file.truncated) ? new Error("File to large: Maximum gist size is 10mb") : undefined;
                callback(err, url);
            }
        };
        var payload = {
            public: true,
            description: "",
            files: {}
        };
        payload.files[name] = { content: content };
        request.open("POST", "https://api.github.com/gists");
        request.send(JSON.stringify(payload));
    }
    Api.writeToGist = writeToGist;
    function readFromGist(url, callback) {
        var request = new XMLHttpRequest();
        request.onreadystatechange = function () {
            if (request.readyState === 4) {
                if (request.status !== 200) {
                    return callback(new Error("HTTP Response: " + request.status));
                }
                callback(undefined, request.responseText);
            }
        };
        request.open("GET", url);
        request.send();
    }
    Api.readFromGist = readFromGist;
    //---------------------------------------------------------
    // Data
    //---------------------------------------------------------
    Api.ixer = new Indexing.Indexer();
    Api.newPrimitiveDefaults = {
        "<": { "<: A": 0, "<: B": 0 },
        "<=": { "<=: A": 0, "<=: B": 0 },
        "!=": { "!=: A": 0, "!=: B": 0 },
        "+": { "+: A": 0, "+: B": 0 },
        "*": { "*: A": 0, "*: B": 0 },
        "-": { "-: A": 0, "-: B": 0 },
        "/": { "/: A": 0, "/: B": 0 },
        remainder: { "remainder: A": 0, "remainder: B": 0 },
        round: { "round: A": 0, "round: B": 0 },
        contains: { "contains: inner": " ", "contains: outer": "" },
        count: { "count: A": [] },
        mean: { "mean: A": [] },
        split: { "split: split": " ", "split: string": "" },
        concat: { "concat: A": "", "concat: B": "" },
        "as number": { "as number: A": "0" },
        "as text": { "as text: A": "" },
        "standard deviation": { "standard deviation: A": [] },
        sum: { "sum: A": [] }
    };
    // This index needs to be hardcoded for code fns and indexer to work.
    Api.ixer.addIndex("id to tags", "tag", Indexing.create.collector(["tag: view"]));
    Api.ixer.addIndex("display name", "display name", Indexing.create.lookup(["display name: id", "display name: name"]));
    Api.ixer.addIndex("display order", "display order", Indexing.create.lookup(["display order: id", "display order: priority"]));
    Api.ixer.addIndex("view to fields", "field", Indexing.create.collector(["field: view"]));
    //---------------------------------------------------------
    // Data interaction code
    //---------------------------------------------------------
    Api.code = {
        name: function (id) { return Api.ixer.index("display name", true)[id] || ""; },
        order: function (id) { return Api.ixer.index("display order", true)[id] || 0; },
        hasTag: function (id, tag) {
            var tags = Api.ixer.index("id to tags", true)[id] || [];
            for (var _i = 0; _i < tags.length; _i++) {
                var cur = tags[_i];
                if (cur["tag: tag"] === tag) {
                    return true;
                }
            }
            return false;
        },
        nextOrder: function (ids) {
            var order = Api.ixer.index("display order");
            var max = 0;
            for (var _i = 0; _i < ids.length; _i++) {
                var id = ids[_i];
                if (order[id] >= max) {
                    max = order[id] + 1;
                }
            }
            return max;
        }
    };
    Api.localState = {};
    var pkDependents = ["display order", "tag"];
    var schemas = {
        "display name": { foreign: { $last: "id" },
            singular: true },
        "display order": { foreign: { $last: "id" },
            singular: true },
        tag: { foreign: { $last: "view" } },
        view: { key: "view",
            dependents: pkDependents.concat(["field"]) },
        source: { key: "source",
            foreign: { view: "view" },
            dependents: [] },
        field: { key: "field",
            foreign: { view: "view" },
            dependents: pkDependents
        },
        "editor node position": { key: "node" }
    };
    /***************************************************************************\
     * Read/Write primitives.
    \***************************************************************************/
    function fillForeignKeys(type, query, context, useIds, silentThrow) {
        if (useIds === void 0) { useIds = false; }
        var schema = schemas[type];
        if (!schema) {
            throw new Error("Attempted to process unknown type " + type + " with query " + JSON.stringify(query));
        }
        var foreignKeys = schema.foreign;
        if (!foreignKeys) {
            return query;
        }
        if (useIds) {
            var foreignIdKeys = {};
            var fieldIds = Api.ixer.getFields(type);
            var nameToId = {};
            for (var _i = 0; _i < fieldIds.length; _i++) {
                var id = fieldIds[_i];
                nameToId[Api.code.name(id)] = id;
            }
            for (var foreignKey_1 in foreignKeys) {
                foreignIdKeys[foreignKey_1] = nameToId[foreignKeys[foreignKey_1]];
            }
            foreignKeys = foreignIdKeys;
        }
        for (var contextKey in foreignKeys) {
            var foreignKey = foreignKeys[contextKey];
            if (!foreignKeys.hasOwnProperty(contextKey)) {
                continue;
            }
            if (query[foreignKey] !== undefined) {
                continue;
            }
            if (context[contextKey] === undefined && !silentThrow) {
                throw new Error("Unspecified field " + foreignKey + " for type " + type + " with no compatible parent to link to in context " + JSON.stringify(context));
            }
            query[foreignKey] = context[contextKey];
        }
        return query;
    }
    function process(type, params, context, useIds) {
        if (context === void 0) { context = {}; }
        if (useIds === void 0) { useIds = false; }
        if (!params) {
            return;
        }
        if (params instanceof Array) {
            var write = { type: type, content: [], context: [] };
            for (var _i = 0; _i < params.length; _i++) {
                var item = params[_i];
                var result = process(type, item, Api.clone(context), useIds);
                write.content.push(result.content);
                write.context.push(result.context);
            }
            return write;
        }
        var schema = schemas[type] || {};
        if (!params) {
            throw new Error("Invalid params specified for type " + type + " with params " + JSON.stringify(params));
        }
        // Link foreign keys from context if missing.
        if (schema.foreign) {
            var params = fillForeignKeys(type, params, context, useIds);
        }
        // Fill primary keys if missing.
        var keys = (schema.key instanceof Array) ? schema.key : (schema.key) ? [schema.key] : [];
        for (var _a = 0; _a < keys.length; _a++) {
            var key = keys[_a];
            if (params[key] === undefined) {
                params[key] = Api.uuid();
            }
            context[key] = params[key];
        }
        if (keys.length === 1) {
            context["$last"] = params[keys[0]];
        }
        // Ensure remaining fields exist and contain something.
        var fieldIds = Api.ixer.getFields(type);
        for (var _b = 0; _b < fieldIds.length; _b++) {
            var fieldId = fieldIds[_b];
            var fieldName = useIds ? fieldId : Api.code.name(fieldId);
            if (params[fieldName] === undefined || params[fieldName] === null) {
                throw new Error("Missing value for field " + fieldName + " on type " + type);
            }
        }
        // Process dependents recursively.
        if (params.dependents) {
            var dependents = params.dependents;
            for (var dep in dependents) {
                if (!dependents.hasOwnProperty(dep)) {
                    continue;
                }
                if (dependents[dep] instanceof Array) {
                    for (var _c = 0, _d = dependents[dep]; _c < _d.length; _c++) {
                        var depItem = _d[_c];
                        process(dep, depItem, context);
                    }
                }
                else {
                    var result = process(dep, dependents[dep], context);
                    if (!result) {
                        delete dependents[dep];
                    }
                }
            }
        }
        return { type: type, content: params, context: context };
    }
    Api.process = process;
    function retrieve(type, query, context, useIds) {
        if (context === void 0) { context = {}; }
        if (useIds === void 0) { useIds = false; }
        var schema = schemas[type] || {};
        var keys = (schema.key instanceof Array) ? schema.key : (schema.key) ? [schema.key] : [];
        var facts = useIds ? Api.ixer.select(type, query, useIds) : Api.ixer.selectPretty(type, query);
        if (!facts.length) {
            return;
        }
        for (var _i = 0; _i < facts.length; _i++) {
            var fact = facts[_i];
            if (!fact) {
                continue;
            }
            var factContext = Api.clone(context);
            for (var _a = 0; _a < keys.length; _a++) {
                var key = keys[_a];
                factContext[key] = fact[key];
            }
            if (keys.length === 1) {
                factContext["$last"] = fact[keys[0]];
            }
            var dependents = {};
            var hasDependents = false;
            if (schema.dependents) {
                for (var _b = 0, _c = schema.dependents; _b < _c.length; _b++) {
                    var dependent = _c[_b];
                    var depSchema = schemas[dependent];
                    var q = fillForeignKeys(dependent, {}, factContext, useIds, true);
                    var results = retrieve(dependent, q, Api.clone(factContext));
                    if (results && results.length) {
                        if (depSchema.singular) {
                            dependents[dependent] = results[0];
                        }
                        else {
                            dependents[dependent] = results;
                        }
                        hasDependents = true;
                    }
                }
            }
            if (hasDependents) {
                fact.dependents = dependents;
            }
        }
        return facts;
    }
    Api.retrieve = retrieve;
    /***************************************************************************\
     * Read/Write API
    \***************************************************************************/
    function mapToFact(viewId, props, useIds) {
        if (useIds === void 0) { useIds = false; }
        if (arguments.length < 2) {
            throw new Error("Must specify viewId and map to convert to fact.");
        }
        var fieldIds = Api.ixer.getFields(viewId); // @FIXME: We need to cache these horribly badly.
        var length = fieldIds.length;
        var fact = new Array(length);
        for (var ix = 0; ix < length; ix++) {
            var name = useIds ? fieldIds[ix] : Api.code.name(fieldIds[ix]);
            var val = props[name];
            if (val === undefined || val === null) {
                throw new Error("Malformed value in " + viewId + " for field " + name + " of fact " + JSON.stringify(props));
            }
            fact[ix] = val;
        }
        return fact;
    }
    Api.mapToFact = mapToFact;
    function factToMap(viewId, fact) {
        if (arguments.length < 2) {
            throw new Error("Must specify viewId and fact to convert to map.");
        }
        var fieldIds = Api.ixer.getFields(viewId); // @FIXME: We need to cache these horribly badly.
        var length = fieldIds.length;
        var map = {};
        for (var ix = 0; ix < length; ix++) {
            var name = Api.code.name(fieldIds[ix]);
            map[name] = fact[ix];
        }
        return map;
    }
    Api.factToMap = factToMap;
    function insert(type, params, context, useIds) {
        if (useIds === void 0) { useIds = false; }
        if (arguments.length < 2) {
            throw new Error("Must specify type and parameters for insert.");
        }
        var write = process(type, params, context, useIds);
        write.mode = "inserted";
        write.useIds = useIds;
        return write;
    }
    Api.insert = insert;
    function writeInto(dest, src) {
        if (dest.constructor === Array) {
            return dest.map(function (item) {
                return writeInto(item, src);
            });
        }
        for (var key in src) {
            if (src[key] === undefined) {
                continue;
            }
            // If the source attribute is an array, append its contents to the dest key.
            if (src[key].constructor === Array) {
                if (dest[key].constructor !== Array) {
                    dest[key] = [dest[key]];
                }
                dest[key] = dest[key].concat(src[key]);
            }
            else if (typeof src[key] === "object") {
                dest[key] = writeInto(dest[key] || {}, src[key]);
            }
            else {
                dest[key] = src[key];
            }
        }
        return dest;
    }
    function change(type, params, changes, upsert, context, useIds) {
        if (upsert === void 0) { upsert = false; }
        if (useIds === void 0) { useIds = false; }
        if (arguments.length < 3) {
            throw new Error("Must specify type and query and changes for change.");
        }
        // When useIds is set, retrieve will return undefined for an empty result
        var read = retrieve(type, params, context, useIds) || [];
        var write = read.map(function (item) {
            return writeInto(item, changes);
        });
        if (!write.length && upsert) {
            var insertParams = writeInto(writeInto({}, params), changes);
            return insert(type, insertParams, {}, useIds);
        }
        return { type: type, content: write, context: context, mode: "changed", originalKeys: Api.clone(params), useIds: useIds };
    }
    Api.change = change;
    function remove(type, params, context, useIds) {
        if (useIds === void 0) { useIds = false; }
        if (arguments.length < 2) {
            throw new Error("Must specify type and query for remove.");
        }
        var read = retrieve(type, params, context, useIds);
        return { type: type, content: read, context: context, mode: "removed", useIds: useIds };
    }
    Api.remove = remove;
    function toDiffs(writes) {
        var diffs = [];
        if (writes instanceof Array) {
            for (var _i = 0; _i < writes.length; _i++) {
                var write = writes[_i];
                if (!write) {
                    continue;
                }
                var result = toDiffs(write);
                if (result !== undefined) {
                    diffs = diffs.concat(result);
                }
            }
            return diffs;
        }
        else {
            var write = writes;
            if (write.content === undefined) {
                return diffs;
            }
        }
        var type = write.type;
        var params = write.content;
        var mode = write.mode;
        if (!params) {
            //if we have no content, then there's nothing for us to do.
            return;
        }
        if (mode === "changed") {
            // Remove the existing root and all of its dependents, then swap mode to inserted to replace them.
            if (!write.originalKeys) {
                throw new Error("Change specified for " + type + ", but no write.originalKeys specified.");
            }
            diffs = diffs.concat(toDiffs(remove(type, write.originalKeys)));
            mode = "inserted";
        }
        if (params instanceof Array) {
            for (var _a = 0; _a < params.length; _a++) {
                var item = params[_a];
                diffs = diffs.concat(toDiffs({ type: type, content: item, context: write.context, mode: mode, useIds: write.useIds }));
            }
            return diffs;
        }
        // Process root fact.
        diffs.push([type, mode, mapToFact(type, params, write.useIds)]);
        // Process dependents.
        var dependents = params.dependents || {};
        for (var key in dependents) {
            if (!dependents.hasOwnProperty(key)) {
                continue;
            }
            diffs = diffs.concat(toDiffs({ type: key, content: dependents[key], context: write.context, mode: mode }));
        }
        return diffs;
    }
    Api.toDiffs = toDiffs;
})(Api || (Api = {}));
//# sourceMappingURL=api.js.map