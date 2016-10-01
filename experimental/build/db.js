"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var Index = (function () {
    function Index() {
        this.index = {};
        this.dirty = {};
        this.subscribers = [];
    }
    Index.prototype.subscribe = function (subscriber) {
        if (this.subscribers.indexOf(subscriber) === -1) {
            this.subscribers.push(subscriber);
            return true;
        }
        return false;
    };
    Index.prototype.unsubscribe = function (subscriber) {
        var ix = this.subscribers.indexOf(subscriber);
        if (ix !== -1) {
            this.subscribers[ix] = this.subscribers.pop();
            return true;
        }
        return false;
    };
    Index.prototype.dispatchIfDirty = function () {
        if (Object.keys(this.dirty).length === 0)
            return;
        for (var _i = 0, _a = this.subscribers; _i < _a.length; _i++) {
            var subscriber = _a[_i];
            subscriber(this.index, this.dirty, this);
        }
    };
    Index.prototype.clearDirty = function () {
        this.dirty = {};
    };
    Index.prototype.clearIndex = function () {
        this.index = {};
    };
    return Index;
}());
var IndexList = (function (_super) {
    __extends(IndexList, _super);
    function IndexList() {
        _super.apply(this, arguments);
    }
    IndexList.prototype.insert = function (key, value) {
        if (!this.index[key] || this.index[key].indexOf(value) === -1) {
            if (!this.index[key])
                this.index[key] = [];
            if (!this.dirty[key])
                this.dirty[key] = [];
            this.index[key].push(value);
            this.dirty[key].push(value);
            return true;
        }
        return false;
    };
    IndexList.prototype.remove = function (key, value) {
        if (!this.index[key])
            return false;
        var ix = this.index[key].indexOf(value);
        if (ix !== -1) {
            if (!this.dirty[key])
                this.dirty[key] = [];
            this.index[key][ix] = this.index[key].pop();
            this.dirty[key].push(value);
            return true;
        }
        return false;
    };
    return IndexList;
}(Index));
exports.IndexList = IndexList;
;
var IndexScalar = (function (_super) {
    __extends(IndexScalar, _super);
    function IndexScalar() {
        _super.apply(this, arguments);
    }
    IndexScalar.prototype.insert = function (key, value) {
        if (this.index[key] === undefined) {
            this.index[key] = value;
            this.dirty[key] = value;
            return true;
        }
        else if (this.index[key] !== value) {
            throw new Error("Unable to set multiple values on scalar index for key: '" + key + "' old: '" + this.index[key] + "' new: '" + value + "'");
        }
        return false;
    };
    IndexScalar.prototype.remove = function (key, value) {
        if (this.index[key] === undefined)
            return false;
        this.dirty[key] = this.index[key];
        delete this.index[key];
        return true;
    };
    return IndexScalar;
}(Index));
exports.IndexScalar = IndexScalar;
var DB = (function () {
    function DB(id) {
        this.id = id;
        this._indexes = {}; // A: V -> E
        this._records = new IndexScalar(); // E -> Record
        this._dirty = new IndexList(); // E -> A
    }
    DB.prototype.record = function (entity) {
        return this._records[entity];
    };
    DB.prototype.index = function (attribute) {
        var index = this._indexes[attribute];
        if (index)
            return index;
        index = new IndexList();
        this._indexes[attribute] = index;
        for (var entity in this._records.index) {
            var record = this._records.index[entity];
            var values = record[attribute];
            if (!values)
                continue;
            for (var _i = 0, values_1 = values; _i < values_1.length; _i++) {
                var value = values_1[_i];
                index.insert(value, entity);
            }
        }
        return index;
    };
    return DB;
}());
exports.DB = DB;
//# sourceMappingURL=db.js.map