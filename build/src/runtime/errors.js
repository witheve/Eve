//--------------------------------------------------------------
// Errors
//--------------------------------------------------------------
"use strict";
var chevrotain_1 = require("chevrotain");
var parser = require("./parser");
var SPAN_TYPE = "document_comment";
//--------------------------------------------------------------
// EveError
//--------------------------------------------------------------
var EveError = (function () {
    function EveError(blockId, start, stop, message, context) {
        this.type = "error";
        this.blockId = blockId;
        this.id = blockId + "|error|" + EveError.ID++;
        this.start = start;
        this.stop = stop;
        this.message = message;
        this.context = context;
    }
    EveError.prototype.injectSpan = function (spans, extraInfo) {
        spans.push(this.start, this.stop, SPAN_TYPE, this.id);
        extraInfo[this.id] = this;
    };
    EveError.ID = 0;
    return EveError;
}());
//--------------------------------------------------------------
// Parse error utils
//--------------------------------------------------------------
function regexGroup(str, regex, group) {
    if (group === void 0) { group = 1; }
    var matches = [];
    var match;
    while (match = regex.exec(str)) {
        matches.push(match[group]);
    }
    return matches;
}
function className(thing) {
    var funcNameRegex = /function (.{1,})\(/;
    var results = (funcNameRegex).exec((thing).constructor.toString());
    return (results && results.length > 1) ? results[1] : "";
}
;
function lastTokenWithType(tokens, type) {
    var ix = tokens.length - 1;
    while (ix >= 0) {
        var cur = tokens[ix];
        if (cur instanceof type) {
            return cur;
        }
        ix--;
    }
}
//--------------------------------------------------------------
// Parse errors
//--------------------------------------------------------------
function parserErrors(errors, parseInfo) {
    var blockId = parseInfo.blockId, blockStart = parseInfo.blockStart, spans = parseInfo.spans, extraInfo = parseInfo.extraInfo;
    var normalized = [];
    var errorIx = 1;
    for (var _i = 0, errors_1 = errors; _i < errors_1.length; _i++) {
        var error = errors_1[_i];
        var token = error.token, context = error.context, message = error.message, resyncedTokens = error.resyncedTokens, name_1 = error.name;
        var eveError = void 0;
        if (name_1 === "MismatchedTokenException") {
            eveError = mismatchedToken(error, parseInfo);
        }
        else if (name_1 === "NotAllInputParsedException") {
            eveError = notAllInputParsed(error, parseInfo);
        }
        else {
            console.log("UNHANDLED ERROR TYPE", name_1);
            var start = token.startOffset;
            var stop = token.startOffset + token.image.length;
            eveError = new EveError(blockId, start, stop, message, context);
        }
        eveError.injectSpan(spans, extraInfo);
        normalized.push(eveError);
    }
    return normalized;
}
exports.parserErrors = parserErrors;
//--------------------------------------------------------------
// MismatchedToken parse error
//--------------------------------------------------------------
var MismatchRegex = /-->\s*(.*?)\s*<--/gi;
function mismatchedToken(error, parseInfo) {
    var Pairs = {
        "CloseString": parser.OpenString,
        "CloseBracket": parser.OpenBracket,
        "CloseParen": parser.OpenParen,
    };
    var blockId = parseInfo.blockId, blockStart = parseInfo.blockStart, spans = parseInfo.spans, extraInfo = parseInfo.extraInfo, tokens = parseInfo.tokens;
    var token = error.token, context = error.context, message = error.message, resyncedTokens = error.resyncedTokens, name = error.name;
    var blockEnd = tokens[tokens.length - 1].endOffset + 1;
    var _a = regexGroup(message, MismatchRegex), expectedType = _a[0], foundType = _a[1];
    var start, stop;
    if (token instanceof chevrotain_1.EOF) {
        var pair = Pairs[expectedType];
        if (pair) {
            token = lastTokenWithType(tokens, pair);
            message = exports.messages.unclosedPair(expectedType);
        }
        else {
            token = tokens[tokens.length - 1];
        }
        stop = blockEnd;
    }
    // We didn't find a matching pair, check if we're some other mistmatched bit of syntax.
    if (stop === undefined) {
        if (expectedType === "Tag") {
            if (token.label === "identifier") {
                message = exports.messages.actionRawIdentifier(token.image);
            }
            else {
                message = exports.messages.actionNonTag(token.image);
            }
        }
    }
    if (start === undefined)
        start = token.startOffset;
    if (stop === undefined)
        stop = token.startOffset + token.image.length;
    return new EveError(blockId, start, stop, message, context);
}
//--------------------------------------------------------------
// NotAllInputParsed parse error
//--------------------------------------------------------------
var NotAllInputRegex = /found:\s*([^\s]+)/gi;
var CloseChars = { ")": true, "]": true };
function notAllInputParsed(error, parseInfo) {
    var blockId = parseInfo.blockId, blockStart = parseInfo.blockStart, spans = parseInfo.spans, extraInfo = parseInfo.extraInfo, tokens = parseInfo.tokens;
    var token = error.token, context = error.context, message = error.message, resyncedTokens = error.resyncedTokens, name = error.name;
    var blockEnd = tokens[tokens.length - 1].endOffset + 1;
    var foundChar = regexGroup(message, NotAllInputRegex)[0];
    var start, stop;
    if (CloseChars[foundChar]) {
        message = exports.messages.extraCloseChar(foundChar);
    }
    else {
        console.log("WEIRD STUFF AT THE END", context);
    }
    if (start === undefined)
        start = token.startOffset;
    if (stop === undefined)
        stop = token.startOffset + token.image.length;
    return new EveError(blockId, start, stop, message, context);
}
//--------------------------------------------------------------
// Build errors
//--------------------------------------------------------------
function unprovidedVariableGroup(block, variables) {
    var id = block.id, blockStart = block.start;
    var found;
    for (var _i = 0, variables_1 = variables; _i < variables_1.length; _i++) {
        var variable = variables_1[_i];
        if (!variable.generated) {
            found = variable;
            break;
        }
    }
    if (!found) {
        found = variables[0];
    }
    var _a = parser.nodeToBoundaries(found, blockStart), start = _a[0], stop = _a[1];
    return new EveError(id, start, stop, exports.messages.unprovidedVariable(found.name));
}
exports.unprovidedVariableGroup = unprovidedVariableGroup;
function invalidLookupAction(block, action) {
    var id = block.id, blockStart = block.start;
    var _a = parser.nodeToBoundaries(action, blockStart), start = _a[0], stop = _a[1];
    var missing = [];
    if (action.entity === undefined)
        missing.push("record");
    if (action.attribute === undefined)
        missing.push("attribute");
    if (action.value === undefined)
        missing.push("value");
    return new EveError(id, start, stop, exports.messages.invalidLookupAction(missing));
}
exports.invalidLookupAction = invalidLookupAction;
function unimplementedExpression(block, expression) {
    var id = block.id, blockStart = block.start;
    var _a = parser.nodeToBoundaries(expression, blockStart), start = _a[0], stop = _a[1];
    return new EveError(id, start, stop, exports.messages.unimplementedExpression(expression.op));
}
exports.unimplementedExpression = unimplementedExpression;
function incompatabileConstantEquality(block, left, right) {
    var id = block.id, blockStart = block.start;
    var start = parser.nodeToBoundaries(left, blockStart)[0];
    var _a = parser.nodeToBoundaries(right, blockStart), _ = _a[0], stop = _a[1];
    return new EveError(id, start, stop, exports.messages.neverEqual(left.value, right.value));
}
exports.incompatabileConstantEquality = incompatabileConstantEquality;
function incompatabileVariableToConstantEquality(block, variable, variableValue, constant) {
    var id = block.id, blockStart = block.start;
    var start = parser.nodeToBoundaries(variable, blockStart)[0];
    var _a = parser.nodeToBoundaries(constant, blockStart), _ = _a[0], stop = _a[1];
    return new EveError(id, start, stop, exports.messages.variableNeverEqual(variable, variableValue, constant.value));
}
exports.incompatabileVariableToConstantEquality = incompatabileVariableToConstantEquality;
function incompatabileTransitiveEquality(block, variable, value) {
    var id = block.id, blockStart = block.start;
    var _a = parser.nodeToBoundaries(variable, blockStart), start = _a[0], stop = _a[1];
    return new EveError(id, start, stop, exports.messages.variableNeverEqual(variable, variable.constant, value));
}
exports.incompatabileTransitiveEquality = incompatabileTransitiveEquality;
//--------------------------------------------------------------
// Messages
//--------------------------------------------------------------
var PairToName = {
    "CloseString": "quote",
    "CloseBracket": "bracket",
    "CloseParen": "paren",
    "]": "bracket",
    ")": "paren",
    "\"": "quote",
};
exports.messages = {
    unclosedPair: function (type) { return ("Looks like a close " + PairToName[type] + " is missing"); },
    extraCloseChar: function (char) { return ("This close " + PairToName[char] + " is missing an open " + PairToName[char]); },
    unprovidedVariable: function (varName) { return ("Nothing is providing a value for " + varName); },
    unimplementedExpression: function (op) { return ("There's no definition for the function " + op); },
    invalidLookupAction: function (missing) { return ("Updating a lookup requires that record, attribute, and value all be provided. Looks like " + missing.join("and") + " is missing."); },
    neverEqual: function (left, right) { return (left + " can never equal " + right); },
    variableNeverEqual: function (variable, value, right) { return (variable.name + " is equivalent to " + value + ", which can't be equal to " + right); },
    actionNonTag: function (found) { return ("Looks like this should be a tag, try changing the " + found + " to a #"); },
    actionRawIdentifier: function (found) { return ("I can only add/remove tags directly on a record. If you meant to add " + found + " as an attribute to the record, try 'my-record.found += " + found + "'; if you meant to add the #" + found + " tag, add #."); }
};
//# sourceMappingURL=errors.js.map