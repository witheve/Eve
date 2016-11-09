"use strict";
var IdStore = (function () {
    function IdStore() {
        this.currentId = 0;
        this.partsToId = Object.create(null);
        this.idToParts = Object.create(null);
    }
    IdStore.prototype._makeStringId = function () {
        return "\u2991" + this.currentId++ + "\u2992";
    };
    IdStore.prototype._make = function (origKey, parts) {
        var ix = 0;
        var changed = false;
        for (var _i = 0, parts_1 = parts; _i < parts_1.length; _i++) {
            var part = parts_1[_i];
            var found = this.idToParts[part];
            if (found !== undefined) {
                parts[ix] = found;
                changed = true;
            }
            ix++;
        }
        var updatedKey = origKey;
        if (changed) {
            updatedKey = "\u2991" + parts.join("⦒");
        }
        var id = this._makeStringId();
        var loadedValue = this.partsToId[updatedKey];
        if (loadedValue) {
            this.partsToId[origKey] = loadedValue;
            this.idToParts[loadedValue] = updatedKey;
        }
        else {
            this.partsToId[origKey] = id;
            this.idToParts[id] = updatedKey;
        }
        return id;
    };
    IdStore.prototype.isId = function (id) {
        return id.substring && id[0] === "⦑";
    };
    IdStore.prototype.load = function (id) {
        var found = this.partsToId[id];
        if (found)
            return found;
        var neue = this._makeStringId();
        this.partsToId[id] = neue;
        this.idToParts[neue] = id;
        return neue;
    };
    IdStore.prototype.get = function (parts) {
        var key = "\u2991" + parts.join("⦒");
        var id = this.partsToId[key];
        if (id)
            return id;
        return this._make(key, parts);
    };
    IdStore.prototype.parts = function (id) {
        return this.idToParts[id];
    };
    return IdStore;
}());
exports.ids = new IdStore();
//# sourceMappingURL=id.js.map