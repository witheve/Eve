//---------------------------------------------------------------------
// Indexes
//---------------------------------------------------------------------
"use strict";
//---------------------------------------------------------------------
// MultiIndex
//---------------------------------------------------------------------
var MultiIndex = (function () {
    function MultiIndex() {
        this.indexes = {};
        this.scopes = [];
    }
    MultiIndex.prototype.register = function (name, index) {
        if (index === void 0) { index = new TripleIndex(0); }
        this.indexes[name] = index;
        if (this.scopes.indexOf(name) === -1) {
            this.scopes.push(name);
        }
        return index;
    };
    MultiIndex.prototype.unregister = function (name) {
        this.indexes[name] = undefined;
        this.scopes.splice(this.scopes.indexOf(name), 1);
    };
    MultiIndex.prototype.getIndex = function (name) {
        var index = this.indexes[name];
        if (!index)
            return this.register(name);
        return index;
    };
    MultiIndex.prototype.dangerousMergeLookup = function (e, a, v, node) {
        var results = [];
        var indexes = this.indexes;
        for (var _i = 0, _a = this.scopes; _i < _a.length; _i++) {
            var scope = _a[_i];
            var index = indexes[scope];
            if (index === undefined)
                continue;
            var found = index.lookup(e, a, v, node);
            if (found) {
                var foundIndex = found.index;
                for (var _b = 0, _c = Object.keys(foundIndex); _b < _c.length; _b++) {
                    var key = _c[_b];
                    results.push(foundIndex[key].value);
                }
            }
        }
        return results;
    };
    MultiIndex.prototype.contains = function (scopes, e, a, v, node) {
        var indexes = this.indexes;
        for (var _i = 0, scopes_1 = scopes; _i < scopes_1.length; _i++) {
            var scope = scopes_1[_i];
            var index = indexes[scope];
            if (index === undefined)
                continue;
            if (index.lookup(e, a, v, node) !== undefined)
                return true;
        }
        return;
    };
    MultiIndex.prototype.store = function (scopes, e, a, v, node) {
        var indexes = this.indexes;
        for (var _i = 0, scopes_2 = scopes; _i < scopes_2.length; _i++) {
            var scope = scopes_2[_i];
            var index = indexes[scope];
            if (index === undefined) {
                index = this.register(scope);
            }
            index.store(e, a, v, node);
        }
    };
    MultiIndex.prototype.unstore = function (scopes, e, a, v, node) {
        var indexes = this.indexes;
        for (var _i = 0, scopes_3 = scopes; _i < scopes_3.length; _i++) {
            var scope = scopes_3[_i];
            var index = indexes[scope];
            if (index === undefined)
                continue;
            index.unstore(e, a, v, node);
        }
    };
    return MultiIndex;
}());
exports.MultiIndex = MultiIndex;
var TripleIndex = (function () {
    function TripleIndex(version, eavIndex, aveIndex, neavIndex) {
        this.cardinalityEstimate = 0;
        this.version = version;
        this.eavIndex = eavIndex !== undefined ? eavIndex : new IndexLevel(0, "eavRoot");
        this.aveIndex = aveIndex !== undefined ? aveIndex : new IndexLevel(0, "aveRoot");
        this.neavIndex = neavIndex !== undefined ? neavIndex : new IndexLevel(0, "neavRoot");
    }
    TripleIndex.prototype.store = function (e, a, v, node) {
        if (node === void 0) { node = "user"; }
        this.cardinalityEstimate++;
        this.eavIndex = this.eavIndex.store(this.version, e, a, v, node);
        this.aveIndex = this.aveIndex.store(this.version, a, v, e, node);
        this.neavIndex = this.neavIndex.store(this.version, node, e, a, v);
    };
    TripleIndex.prototype.unstore = function (e, a, v, node) {
        var changed = this.eavIndex.unstore(this.version, e, a, v, node);
        if (changed) {
            this.cardinalityEstimate--;
            this.eavIndex = changed;
            this.aveIndex = this.aveIndex.unstore(this.version, a, v, e, node);
            this.neavIndex = this.neavIndex.unstore(this.version, node, e, a, v);
        }
    };
    TripleIndex.prototype.asValues = function (e, a, v, node, recursive, singleAttributes) {
        if (recursive === void 0) { recursive = false; }
        if (singleAttributes === void 0) { singleAttributes = false; }
        var level = this.eavIndex.lookup(e, a, v, node);
        if (level) {
            var index = level.index;
            var values = [];
            for (var _i = 0, _a = Object.keys(index); _i < _a.length; _i++) {
                var key = _a[_i];
                var value = index[key].value;
                if (!recursive || this.eavIndex.lookup(value) === undefined) {
                    values.push(value);
                }
                else {
                    values.push(this.asObject(value, recursive));
                }
                if (singleAttributes)
                    return values[0];
            }
            return values;
        }
        return;
    };
    TripleIndex.prototype.asObject = function (e, recursive, singleAttributes) {
        if (recursive === void 0) { recursive = false; }
        if (singleAttributes === void 0) { singleAttributes = false; }
        var obj = {};
        var attributes = this.asValues(e);
        if (attributes) {
            for (var _i = 0, attributes_1 = attributes; _i < attributes_1.length; _i++) {
                var attribute = attributes_1[_i];
                obj[attribute] = this.asValues(e, attribute, undefined, undefined, recursive, singleAttributes);
            }
        }
        return obj;
    };
    TripleIndex.prototype.toTriples = function (withNode, startIndex) {
        var triples = [];
        var eavIndex = startIndex || this.eavIndex.index;
        var current = [];
        for (var _i = 0, _a = Object.keys(eavIndex); _i < _a.length; _i++) {
            var eKey = _a[_i];
            var eInfo = eavIndex[eKey];
            current[0] = eInfo.value;
            var aIndex = eInfo.index;
            for (var _b = 0, _c = Object.keys(aIndex); _b < _c.length; _b++) {
                var aKey = _c[_b];
                var aInfo = aIndex[aKey];
                current[1] = aInfo.value;
                var vIndex = aInfo.index;
                for (var _d = 0, _e = Object.keys(vIndex); _d < _e.length; _d++) {
                    var vKey = _e[_d];
                    var vInfo = vIndex[vKey];
                    if (vInfo.value !== undefined) {
                        current[2] = vInfo.value;
                    }
                    else {
                        current[2] = vInfo;
                    }
                    if (withNode) {
                        var nIndex = vInfo.index;
                        for (var _f = 0, _g = Object.keys(nIndex); _f < _g.length; _f++) {
                            var nKey = _g[_f];
                            var nInfo = nIndex[nKey];
                            current[3] = nInfo;
                            triples.push(current.slice());
                        }
                    }
                    else {
                        triples.push(current.slice());
                    }
                }
            }
        }
        return triples;
    };
    // find an eav in the indexes
    TripleIndex.prototype.lookup = function (e, a, v, node) {
        // let start = perf.time();
        var result = this.eavIndex.lookup(e, a, v, node);
        // perf.lookup(start);
        return result;
    };
    // find an ave in the indexes
    TripleIndex.prototype.alookup = function (a, v, e, node) {
        // let start = perf.time();
        var result = this.aveIndex.lookup(a, v, e, node);
        // perf.lookup(start);
        return result;
    };
    TripleIndex.prototype.nodeLookup = function (node, e, a, v) {
        var result = this.neavIndex.lookup(node, e, a, v);
        return result;
    };
    TripleIndex.prototype.nextVersion = function () {
        return new TripleIndex(this.version + 1, this.eavIndex, this.aveIndex);
    };
    return TripleIndex;
}());
exports.TripleIndex = TripleIndex;
var IndexLevel = (function () {
    function IndexLevel(version, value) {
        this.version = version;
        this.value = value;
        this.cardinality = 0;
        this.index = {};
    }
    IndexLevel.prototype.store = function (version, a, b, c, d, e, f, g, h, i, j) {
        var child = this.index[a];
        var newChild = a;
        if (child === undefined && b !== undefined) {
            newChild = new IndexLevel(version, a);
            newChild.store(version, b, c, d, e, f, g, h, i, j);
        }
        else if (b !== undefined) {
            newChild = child.store(version, b, c, d, e, f, g, h, i, j);
        }
        var updated = this;
        if (newChild.version > this.version) {
        }
        if (child === undefined) {
            updated.cardinality++;
        }
        updated.index[a] = newChild;
        return updated;
    };
    IndexLevel.prototype.unstore = function (version, a, b, c, d, e, f, g, h, i, j) {
        var child = this.index[a];
        if (child === undefined)
            return;
        var updated = this;
        if (child instanceof IndexLevel) {
            var updatedChild = child.unstore(version, b, c, d, e, f, g, h, i, j);
            if (updatedChild === undefined) {
                // updated = this.clone(version);
                delete updated.index[a];
                updated.cardinality--;
            }
            else {
                // updated = this.clone(version);
                updated.index[a] = updatedChild;
            }
        }
        else {
            // updated = this.clone(version);
            delete updated.index[a];
            updated.cardinality--;
        }
        if (updated.cardinality <= 0) {
            return;
        }
        return updated;
    };
    IndexLevel.prototype.toValues = function () {
        var values = [];
        for (var _i = 0, _a = Object.keys(this.index); _i < _a.length; _i++) {
            var key = _a[_i];
            var value = this.index[key];
            values.push(value.value || value);
        }
        return values;
    };
    IndexLevel.prototype.lookup = function (a, b, c, d, e, f, g, h, i, j) {
        var child = this.index[a];
        if (child === undefined)
            return;
        if (b !== undefined && child instanceof IndexLevel) {
            return child.lookup(b, c, d, e, f, g, h, i, j);
        }
        return child;
    };
    IndexLevel.prototype.clone = function (version) {
        var next = new IndexLevel(version, this.value);
        next.cardinality = this.cardinality;
        var index = next.index;
        var originalIndex = this.index;
        var keys = Object.keys(originalIndex);
        for (var _i = 0, keys_1 = keys; _i < keys_1.length; _i++) {
            var key = keys_1[_i];
            index[key] = originalIndex[key];
        }
        return next;
    };
    return IndexLevel;
}());
//# sourceMappingURL=indexes.js.map