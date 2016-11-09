//---------------------------------------------------------------------
// Utility functions for working with triples
//---------------------------------------------------------------------
"use strict";
//---------------------------------------------------------------------
// JS conversion
//---------------------------------------------------------------------
function fromJS(changes, json, node, scope, idPrefix) {
    if (idPrefix === void 0) { idPrefix = "js"; }
    if (json.constructor === Array) {
        var arrayId = idPrefix + "|array";
        changes.store(scope, arrayId, "tag", "array", node);
        var ix = 0;
        for (var _i = 0, json_1 = json; _i < json_1.length; _i++) {
            var value = json_1[_i];
            ix++;
            if (typeof value === "object") {
                value = fromJS(changes, value, node, scope, arrayId + "|" + ix);
            }
            changes.store(scope, arrayId, ix, value, node);
        }
        return arrayId;
    }
    else if (typeof json === "object") {
        var objectId = idPrefix + "|object";
        for (var _a = 0, _b = Object.keys(json); _a < _b.length; _a++) {
            var key = _b[_a];
            var value = json[key];
            if (value.constructor === Array || typeof value === "object") {
                value = fromJS(changes, value, node, scope, objectId + "|" + key);
            }
            changes.store(scope, objectId, key, value, node);
        }
        return objectId;
    }
    else {
        throw new Error("Trying to turn non-object/array JSON into EAVs." + JSON.stringify(json));
    }
}
exports.fromJS = fromJS;
function toJS(index, recordId) {
    var result;
    var isArray = index.lookup(recordId, "tag", "array");
    if (isArray !== undefined) {
        result = [];
        var ix = 1;
        while (true) {
            var valueIndex = index.lookup(recordId, ix);
            if (valueIndex !== undefined) {
                var curIndex = valueIndex.index;
                for (var _i = 0, _a = Object.keys(curIndex); _i < _a.length; _i++) {
                    var key = _a[_i];
                    var value = curIndex[key].value;
                    if (index.lookup(value)) {
                        result[ix - 1] = toJS(index, value);
                    }
                    else {
                        result[ix - 1] = value;
                    }
                }
            }
            else {
                break;
            }
            ix++;
        }
    }
    else {
        result = index.asObject(recordId);
        for (var _b = 0, _c = Object.keys(result); _b < _c.length; _b++) {
            var key = _c[_b];
            var values = result[key];
            var valueIx = 0;
            for (var _d = 0, values_1 = values; _d < values_1.length; _d++) {
                var value = values_1[_d];
                if (index.lookup(value)) {
                    values[valueIx] = toJS(index, value);
                }
                else {
                    values[valueIx] = value;
                }
                valueIx++;
            }
            if (values.length === 1) {
                result[key] = values[0];
            }
        }
    }
    return result;
}
exports.toJS = toJS;
//# sourceMappingURL=eavs.js.map