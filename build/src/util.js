"use strict";
var uuid_1 = require("uuid");
//---------------------------------------------------------
// Misc. Utilities
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
    return "⍦" + mangled;
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
function debounce(fn, wait, leading) {
    var timeout, context, args;
    var doFn = function doDebounced() {
        timeout = undefined;
        fn.apply(context, args);
        context = undefined;
        args = undefined;
    };
    var debounced;
    if (!leading) {
        debounced = function () {
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
    else {
        debounced = function () {
            var argList = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                argList[_i - 0] = arguments[_i];
            }
            context = this;
            args = argList;
            if (!timeout) {
                timeout = window.setTimeout(doFn, wait);
            }
        };
    }
    return debounced;
}
exports.debounce = debounce;
function unpad(str) {
    if (!str)
        return str;
    var indent = 0;
    var neue = "";
    var lines = str.split("\n");
    if (lines[0] == "")
        lines.shift();
    while (lines[0][indent] == " ")
        indent++;
    var multi = false;
    for (var _i = 0, lines_1 = lines; _i < lines_1.length; _i++) {
        var line = lines_1[_i];
        if (multi)
            neue += "\n";
        neue += line.substring(indent);
        multi = true;
    }
    return neue;
}
exports.unpad = unpad;
var _wordChars = {};
function setupWordChars(_wordChars) {
    for (var i = "0".charCodeAt(0); i < "9".charCodeAt(0); i++)
        _wordChars[String.fromCharCode(i)] = true;
    for (var i = "a".charCodeAt(0); i < "z".charCodeAt(0); i++)
        _wordChars[String.fromCharCode(i)] = true;
    for (var i = "A".charCodeAt(0); i < "Z".charCodeAt(0); i++)
        _wordChars[String.fromCharCode(i)] = true;
}
setupWordChars(_wordChars);
function adjustToWordBoundary(ch, line, direction) {
    var neue = ch;
    if (direction === "left") {
        if (_wordChars[line[ch]]) {
            // Expand left to contain any word prefix
            while (neue > 0) {
                // We check the next character since the start of a range is inclusive.
                if (!_wordChars[line[neue - 1]])
                    break;
                neue--;
            }
        }
        else {
            // Shrink right to eject any leading whitespace
            while (neue < line.length) {
                if (_wordChars[line[neue]])
                    break;
                neue++;
            }
        }
    }
    else {
        if (_wordChars[line[ch - 1]]) {
            // Expand right to contain any word suffix
            while (neue < line.length) {
                if (!_wordChars[line[neue]])
                    break;
                neue++;
            }
        }
        else {
            // Shrink left to eject any trailing whitespace
            while (neue > 0) {
                if (_wordChars[line[neue - 1]])
                    break;
                neue--;
            }
        }
    }
    return neue;
}
exports.adjustToWordBoundary = adjustToWordBoundary;
function isRange(loc) {
    return loc.from !== undefined || loc.to !== undefined;
}
exports.isRange = isRange;
function comparePositions(a, b) {
    if (a.line === b.line && a.ch === b.ch)
        return 0;
    if (a.line > b.line)
        return 1;
    if (a.line === b.line && a.ch > b.ch)
        return 1;
    return -1;
}
exports.comparePositions = comparePositions;
function compareRanges(a, b) {
    var first = comparePositions(a.from, b.from);
    if (first !== 0)
        return first;
    else
        return comparePositions(a.to, b.to);
}
exports.compareRanges = compareRanges;
function samePosition(a, b) {
    return comparePositions(a, b) === 0;
}
exports.samePosition = samePosition;
function whollyEnclosed(inner, outer) {
    var left = comparePositions(inner.from, outer.from);
    var right = comparePositions(inner.to, outer.to);
    return (left === 1 || left === 0) && (right === -1 || right === 0);
}
exports.whollyEnclosed = whollyEnclosed;
//# sourceMappingURL=util.js.map