//---------------------------------------------------------------------
// Changes
//---------------------------------------------------------------------
"use strict";
var perf = global["perf"];
//---------------------------------------------------------------------
// ChangeType
//---------------------------------------------------------------------
(function (ChangeType) {
    ChangeType[ChangeType["ADDED"] = 0] = "ADDED";
    ChangeType[ChangeType["REMOVED"] = 1] = "REMOVED";
    ChangeType[ChangeType["ADDED_REMOVED"] = 2] = "ADDED_REMOVED";
})(exports.ChangeType || (exports.ChangeType = {}));
var ChangeType = exports.ChangeType;
//---------------------------------------------------------------------
// ChangesIndex
//---------------------------------------------------------------------
var ChangesIndex = (function () {
    function ChangesIndex() {
        this.positions = {};
        this.info = [];
        this.pos = 0;
    }
    ChangesIndex.prototype.store = function (scope, e, a, v, node, key) {
        // let start = perf.time()
        key = key || scope + "|" + e + "|" + a + "|" + v + "|" + node;
        var keyPos = this.positions[key];
        var info = this.info;
        if (keyPos === undefined) {
            var pos = this.pos;
            this.positions[key] = pos;
            info[pos] = ChangeType.ADDED;
            info[pos + 1] = e;
            info[pos + 2] = a;
            info[pos + 3] = v;
            info[pos + 4] = node;
            info[pos + 5] = scope;
            this.pos += 6;
        }
        else if (info[keyPos] === ChangeType.REMOVED) {
            info[keyPos] = ChangeType.ADDED_REMOVED;
        }
        // perf.store(start);
        return key;
    };
    ChangesIndex.prototype.unstore = function (scope, e, a, v, node, key) {
        key = key || scope + "|" + e + "|" + a + "|" + v + "|" + node;
        var keyPos = this.positions[key];
        var info = this.info;
        if (keyPos === undefined) {
            var pos = this.pos;
            this.positions[key] = pos;
            info[pos] = ChangeType.REMOVED;
            info[pos + 1] = e;
            info[pos + 2] = a;
            info[pos + 3] = v;
            info[pos + 4] = node;
            info[pos + 5] = scope;
            this.pos += 6;
        }
        else if (info[keyPos] === ChangeType.ADDED) {
            info[keyPos] = ChangeType.ADDED_REMOVED;
        }
        return key;
    };
    ChangesIndex.prototype.inc = function (scope, e, a, v, node, key) {
        key = key || scope + "|" + e + "|" + a + "|" + v + "|" + node;
        var keyPos = this.positions[key];
        var info = this.info;
        if (keyPos === undefined) {
            var pos = this.pos;
            this.positions[key] = pos;
            info[pos] = 1;
            info[pos + 1] = e;
            info[pos + 2] = a;
            info[pos + 3] = v;
            info[pos + 4] = node;
            info[pos + 5] = scope;
            this.pos += 6;
        }
        else {
            info[keyPos] += 1;
        }
        return key;
    };
    ChangesIndex.prototype.dec = function (scope, e, a, v, node, key) {
        key = key || scope + "|" + e + "|" + a + "|" + v + "|" + node;
        var keyPos = this.positions[key];
        var info = this.info;
        if (keyPos === undefined) {
            var pos = this.pos;
            this.positions[key] = pos;
            info[pos] = -1;
            info[pos + 1] = e;
            info[pos + 2] = a;
            info[pos + 3] = v;
            info[pos + 4] = node;
            info[pos + 5] = scope;
            this.pos += 6;
        }
        else {
            info[keyPos] -= 1;
        }
        return key;
    };
    return ChangesIndex;
}());
exports.ChangesIndex = ChangesIndex;
//---------------------------------------------------------------------
// Changes
//---------------------------------------------------------------------
var Changes = (function () {
    function Changes(index) {
        this.index = index;
        this.round = 0;
        this.changed = false;
        this.changes = [new ChangesIndex()];
        this.finalChanges = new ChangesIndex();
    }
    Changes.prototype.capture = function () {
        this.capturedChanges = new ChangesIndex();
    };
    Changes.prototype.captureEnd = function () {
        var cur = this.capturedChanges;
        this.capturedChanges = undefined;
        return cur;
    };
    Changes.prototype.store = function (scope, e, a, v, node) {
        // console.log("STORING", e, a, v, node, this.index.lookup(e,a,v,node) === undefined);
        var key = this.changes[this.round].store(scope, e, a, v, node);
        var captured = this.capturedChanges;
        if (captured !== undefined) {
            captured.store(scope, e, a, v, node, key);
        }
    };
    Changes.prototype.unstore = function (scope, e, a, v, node) {
        // console.log("REMOVING", e, a, v, node, this.index.lookup(e,a,v,node) === undefined);
        if (node === undefined) {
            //multidb
            var level = this.index.getIndex(scope).lookup(e, a, v);
            if (level) {
                var index = level.index;
                for (var _i = 0, _a = Object.keys(index); _i < _a.length; _i++) {
                    var key = _a[_i];
                    var nodeValue = index[key];
                    this.unstore(scope, e, a, v, nodeValue);
                }
            }
        }
        else {
            var key = this.changes[this.round].unstore(scope, e, a, v, node);
            var captured = this.capturedChanges;
            if (captured !== undefined) {
                captured.unstore(scope, e, a, v, node, key);
            }
        }
    };
    Changes.prototype.commit = function () {
        var final = this.finalChanges;
        var changes = this.changes[this.round];
        var info = changes.info, positions = changes.positions;
        var keys = Object.keys(positions);
        var multiIndex = this.index;
        var committed = [];
        var committedIx = 0;
        for (var _i = 0, keys_1 = keys; _i < keys_1.length; _i++) {
            var key = keys_1[_i];
            var pos = positions[key];
            var mult = info[pos];
            if (mult === ChangeType.ADDED_REMOVED) {
                continue;
            }
            var e = info[pos + 1];
            var a = info[pos + 2];
            var v = info[pos + 3];
            var node = info[pos + 4];
            var scope = info[pos + 5];
            var curIndex = multiIndex.getIndex(scope);
            if (mult === ChangeType.REMOVED && curIndex.lookup(e, a, v, node) !== undefined) {
                this.changed = true;
                curIndex.unstore(e, a, v, node);
                final.dec(scope, e, a, v, node, key);
                committed[committedIx] = ChangeType.REMOVED;
                committed[committedIx + 1] = e;
                committed[committedIx + 2] = a;
                committed[committedIx + 3] = v;
                committed[committedIx + 4] = node;
                committed[committedIx + 5] = scope;
                committedIx += 6;
            }
            else if (mult === ChangeType.ADDED && curIndex.lookup(e, a, v, node) === undefined) {
                this.changed = true;
                curIndex.store(e, a, v, node);
                final.inc(scope, e, a, v, node, key);
                committed[committedIx] = ChangeType.ADDED;
                committed[committedIx + 1] = e;
                committed[committedIx + 2] = a;
                committed[committedIx + 3] = v;
                committed[committedIx + 4] = node;
                committed[committedIx + 5] = scope;
                committedIx += 6;
            }
        }
        return committed;
    };
    Changes.prototype.nextRound = function () {
        this.round++;
        this.changed = false;
        this.changes[this.round] = new ChangesIndex();
    };
    Changes.prototype.toCommitted = function (scopeLookup) {
        var commit = [];
        var ix = 0;
        var _a = this.finalChanges, positions = _a.positions, info = _a.info;
        var indexes = this.index.indexes;
        var keys = Object.keys(positions);
        for (var _i = 0, keys_2 = keys; _i < keys_2.length; _i++) {
            var key = keys_2[_i];
            var pos = positions[key];
            var count = info[pos];
            if (count === 0)
                continue;
            var scope = info[pos + 5];
            if (scopeLookup && !scopeLookup[scope])
                continue;
            var action = count > 1 ? ChangeType.ADDED : ChangeType.REMOVED;
            var e = info[pos + 1];
            var a = info[pos + 2];
            var v = info[pos + 3];
            var node = info[pos + 4];
            commit[ix] = action;
            commit[ix + 1] = e;
            commit[ix + 2] = a;
            commit[ix + 3] = v;
            commit[ix + 4] = node;
            commit[ix + 5] = scope;
            ix += 6;
        }
        return commit;
    };
    Changes.prototype.result = function (scopeLookup) {
        var insert = [];
        var remove = [];
        var _a = this.finalChanges, positions = _a.positions, info = _a.info;
        var indexes = this.index.indexes;
        var keys = Object.keys(positions);
        for (var _i = 0, keys_3 = keys; _i < keys_3.length; _i++) {
            var key = keys_3[_i];
            var pos = positions[key];
            var count = info[pos];
            var e = info[pos + 1];
            var a = info[pos + 2];
            var v = info[pos + 3];
            var scope = info[pos + 5];
            if (scopeLookup === undefined || scopeLookup[scope]) {
                if (count < 0 && indexes[scope].lookup(e, a, v) === undefined) {
                    remove.push([e, a, v]);
                }
                else if (count > 0 && indexes[scope].lookup(e, a, v) !== undefined) {
                    insert.push([e, a, v]);
                }
            }
        }
        return { type: "result", insert: insert, remove: remove };
    };
    Changes.prototype._storeObject = function (operation, id, object, node, scope) {
        for (var _i = 0, _a = Object.keys(object); _i < _a.length; _i++) {
            var attr = _a[_i];
            var value = object[attr];
            if (value === undefined)
                continue;
            if (value.constructor === Array) {
                for (var _b = 0, value_1 = value; _b < value_1.length; _b++) {
                    var item = value_1[_b];
                    this[operation](scope, id, attr, item, node);
                }
            }
            else if (typeof value === "object") {
                throw new Error("Attempting to store a non-value in an Eve database");
            }
            else {
                this[operation](scope, id, attr, value, node);
            }
        }
    };
    Changes.prototype.storeObject = function (id, object, node, scope) {
        this._storeObject("store", id, object, node, scope);
    };
    Changes.prototype.unstoreObject = function (id, object, node, scope) {
        this._storeObject("unstore", id, object, node, scope);
    };
    return Changes;
}());
exports.Changes = Changes;
//# sourceMappingURL=changes.js.map