"use strict";
var uuid_1 = require("uuid");
//---------------------------------------------------------
// Utilities
//---------------------------------------------------------
function clone(obj) {
    if (typeof obj !== "object")
        return obj;
    if (obj.constructor === Array) {
        var neue = [];
        for (var ix = 0; ix < obj.length; ix++) {
            neue[ix] = clone(obj[ix]);
        }
        return neue;
    }
    else {
        var neue = {};
        for (var key in obj) {
            neue[key] = clone(obj[key]);
        }
        return neue;
    }
}
exports.clone = clone;
function uuid() {
    var raw = uuid_1.v4();
    var mangled = raw.slice(0, 8) + raw.slice(9, 9 + 4) + raw.slice(-12);
    return "⦑" + mangled + "⦒";
}
exports.uuid = uuid;
function sortComparator(a, b) {
    if (!a.sort || !b.sort)
        return 0;
    var aSort = a.sort;
    var bSort = b.sort;
    return aSort === bSort ? 0 : (aSort < bSort ? -1 : 1);
}
exports.sortComparator = sortComparator;
function debounce(fn, wait) {
    var timeout, context, args;
    var doFn = function doDebounced() {
        timeout = undefined;
        fn.apply(context, args);
        context = undefined;
        args = undefined;
    };
    return function debounced() {
        var argList = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            argList[_i - 0] = arguments[_i];
        }
        context = this;
        args = argList;
        if (timeout) {
            window.clearTimeout(timeout);
        }
        timeout = window.setTimeout(doFn, wait);
    };
}
exports.debounce = debounce;
//# sourceMappingURL=util.js.map