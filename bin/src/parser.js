var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var utils_1 = require("./utils");
var runtime = require("./runtime");
var app_1 = require("./app");
var ParseError = (function (_super) {
    __extends(ParseError, _super);
    function ParseError(message, line, lineIx, charIx, length) {
        if (charIx === void 0) { charIx = 0; }
        if (length === void 0) { length = line && (line.length - charIx); }
        _super.call(this, message);
        this.message = message;
        this.line = line;
        this.lineIx = lineIx;
        this.charIx = charIx;
        this.length = length;
        this.name = "Parse Error";
    }
    ParseError.prototype.toString = function () {
        return (_a = ["\n      ", ": ", "\n      ", "\n      ", "\n      ", "\n    "], _a.raw = ["\n      ", ": ", "\n      ", "\n      ", "\n      ", "\n    "], utils_1.unpad(6)(_a, this.name, this.message, this.lineIx !== undefined ? "On line " + (this.lineIx + 1) + ":" + this.charIx : "", this.line, utils_1.underline(this.charIx, this.length)));
        var _a;
    };
    return ParseError;
})(Error);
function readWhile(str, pattern, startIx) {
    var endIx = startIx;
    while (str[endIx] !== undefined && str[endIx].match(pattern))
        endIx++;
    return str.slice(startIx, endIx);
}
function readUntil(str, sentinel, startIx, unsatisfiedErr) {
    var endIx = str.indexOf(sentinel, startIx);
    if (endIx === -1) {
        if (unsatisfiedErr)
            return unsatisfiedErr;
        return str.slice(startIx);
    }
    return str.slice(startIx, endIx);
}
function readUntilAny(str, sentinels, startIx, unsatisfiedErr) {
    var endIx = -1;
    for (var _i = 0; _i < sentinels.length; _i++) {
        var sentinel = sentinels[_i];
        var ix = str.indexOf(sentinel, startIx);
        if (ix === -1 || endIx !== -1 && ix > endIx)
            continue;
        endIx = ix;
    }
    if (endIx === -1) {
        if (unsatisfiedErr)
            return unsatisfiedErr;
        return str.slice(startIx);
    }
    return str.slice(startIx, endIx);
}
// export function parseUI(str:string):UIElem {
//   let root:UIElem = {};
//   let errors = [];
//   let lineIx = 0;
//   let lines = str.split("\n");
//   let stack:{indent: number, elem: UIElem}[] = [{indent: -2, elem: root}];
//   // @FIXME: Chunk into element chunks instead of lines to enable in-argument continuation.
//   for(let line of lines) {
//     let charIx = 0;
//     while(line[charIx] === " ") charIx++;
//     let indent = charIx;
//     if(line[charIx] === undefined)  continue;
//     let parent:UIElem;
//     for(let stackIx = stack.length - 1; stackIx >= 0; stackIx--) {
//       if(indent > stack[stackIx].indent) {
//         parent = stack[stackIx].elem;
//         break;
//       } else stack.pop();
//     }
//     let keyword = readUntil(line, " ", charIx);
//     charIx += keyword.length;
//     if(keyword[0] === "~" || keyword[0] === "%") { // Handle binding
//       charIx -= keyword.length - 1;
//       let kind = keyword[0] === "~" ? "plan" : "query";
//       if(!parent.binding) {
//         parent.binding = line.slice(charIx);
//         parent.bindingKind = kind;
//       } else if(kind === parent.bindingKind) parent.binding += "\n" + line.slice(charIx);
//       else {
//         errors.push(new ParseError(`UI must be bound to a single type of query.`, line, lineIx));
//         continue;
//       }
//       charIx = line.length;
//     } else if(keyword[0] === "@") { // Handle event
//       charIx -= keyword.length - 1;
//       let err;
//       while(line[charIx] === " ") charIx++;
//       let lastIx = charIx;
//       let eventRaw = readUntil(line, "{", charIx);
//       charIx += eventRaw.length;
//       let event = eventRaw.trim();
//       if(!event) err = new ParseError(`UI event must specify a valid event name`, line, lineIx, lastIx, eventRaw.length);
//       let state;
//       [state, charIx] = getMapArgs(line, lineIx, charIx);
//       if(state instanceof Error && !err) err = state;
//       if(err) {
//         errors.push(err);
//         lineIx++;
//         continue;
//       }
//       if(!parent.events) parent.events = {};
//       parent.events[event] = state;
//     } else if(keyword[0] === ">") { // Handle embed
//       charIx -= keyword.length - 1;
//       let err;
//       while(line[charIx] === " ") charIx++;
//       let lastIx = charIx;
//       let embedIdRaw = readUntil(line, "{", charIx);
//       charIx += embedIdRaw.length;
//       let embedId = embedIdRaw.trim();
//       if(!embedId) err = new ParseError(`UI embed must specify a valid element id`, line, lineIx, lastIx, embedIdRaw.length);
//       let scope;
//       [scope = {}, charIx] = getMapArgs(line, lineIx, charIx);
//       if(scope instanceof Error && !err) err = scope;
//       if(err) {
//         errors.push(err);
//         lineIx++;
//         continue;
//       }
//       let elem = {embedded: scope, id: embedId};
//       if(!parent.children) parent.children = [];
//       parent.children.push(elem);
//       stack.push({indent, elem});
//     } else { // Handle element
//       let err;
//       if(!keyword) err = new ParseError(`UI element must specify a valid tag name`, line, lineIx, charIx, 0);
//       while(line[charIx] === " ") charIx++;
//       let classesRaw = readUntil(line, "{", charIx);
//       charIx += classesRaw.length;
//       let classes = classesRaw.trim();
//       let attributes;
//       [attributes = {}, charIx] = getMapArgs(line, lineIx, charIx);
//       if(attributes instanceof Error && !err) err = attributes;
//       if(err) {
//         errors.push(err);
//         lineIx++;
//         continue;
//       }
//       attributes["t"] = keyword;
//       if(classes) attributes["c"] = classes;
//       let elem:UIElem = {id: attributes["id"], attributes};
//       if(!parent.children) parent.children = [];
//       parent.children.push(elem);
//       stack.push({indent, elem});
//     }
//     lineIx++;
//   }
//   if(errors.length) {
//     for(let err of errors) {
//       console.error(err);
//     }
//   }
//   return root;
// }
//-----------------------------------------------------------------------------
// Eve DSL Parser
//-----------------------------------------------------------------------------
var TOKEN_TYPE;
(function (TOKEN_TYPE) {
    TOKEN_TYPE[TOKEN_TYPE["EXPR"] = 0] = "EXPR";
    TOKEN_TYPE[TOKEN_TYPE["IDENTIFIER"] = 1] = "IDENTIFIER";
    TOKEN_TYPE[TOKEN_TYPE["KEYWORD"] = 2] = "KEYWORD";
    TOKEN_TYPE[TOKEN_TYPE["STRING"] = 3] = "STRING";
    TOKEN_TYPE[TOKEN_TYPE["LITERAL"] = 4] = "LITERAL";
})(TOKEN_TYPE || (TOKEN_TYPE = {}));
;
var Token = (function () {
    function Token(type, value, lineIx, charIx) {
        this.type = type;
        this.value = value;
        this.lineIx = lineIx;
        this.charIx = charIx;
    }
    Token.identifier = function (value, lineIx, charIx) {
        return new Token(Token.TYPE.IDENTIFIER, value, lineIx, charIx);
    };
    Token.keyword = function (value, lineIx, charIx) {
        return new Token(Token.TYPE.KEYWORD, value, lineIx, charIx);
    };
    Token.string = function (value, lineIx, charIx) {
        return new Token(Token.TYPE.STRING, value, lineIx, charIx);
    };
    Token.literal = function (value, lineIx, charIx) {
        return new Token(Token.TYPE.LITERAL, value, lineIx, charIx);
    };
    Token.prototype.toString = function () {
        if (this.type === Token.TYPE.KEYWORD)
            return ":" + this.value;
        else if (this.type === Token.TYPE.STRING)
            return "\"" + this.value + "\"";
        else
            return this.value.toString();
    };
    Token.TYPE = TOKEN_TYPE;
    return Token;
})();
exports.Token = Token;
var Sexpr = (function () {
    function Sexpr(val, lineIx, charIx, syntax) {
        if (syntax === void 0) { syntax = "expr"; }
        this.lineIx = lineIx;
        this.charIx = charIx;
        this.syntax = syntax;
        this.type = Token.TYPE.EXPR;
        if (val)
            this.value = val.slice();
    }
    Sexpr.list = function (value, lineIx, charIx, syntax) {
        if (value === void 0) { value = []; }
        value = value.slice();
        value.unshift(Token.identifier("list", lineIx, charIx ? charIx + 1 : undefined));
        return new Sexpr(value, lineIx, charIx, syntax ? "list" : undefined);
    };
    Sexpr.hash = function (value, lineIx, charIx, syntax) {
        if (value === void 0) { value = []; }
        value = value.slice();
        value.unshift(Token.identifier("hash", lineIx, charIx ? charIx + 1 : undefined));
        return new Sexpr(value, lineIx, charIx, syntax ? "hash" : undefined);
    };
    Sexpr.asSexprs = function (values) {
        for (var _i = 0; _i < values.length; _i++) {
            var raw = values[_i];
            if (!(raw instanceof Sexpr))
                throw new ParseError("All top level entries must be expressions (got " + raw + ")", undefined, raw.lineIx, raw.charIx);
            else {
                var op = raw.operator;
                if (op.type !== Token.TYPE.IDENTIFIER)
                    throw new ParseError("All expressions must begin with an identifier", undefined, raw.lineIx, raw.charIx);
            }
        }
        return values;
    };
    Sexpr.prototype.toString = function () {
        var content = this.value && this.value.map(function (token) { return token.toString(); }).join(" ");
        var argsContent = this.value && this.arguments.map(function (token) { return token.toString(); }).join(" ");
        if (this.syntax === "hash")
            return "{" + argsContent + "}";
        else if (this.syntax === "list")
            return "[" + argsContent + "]";
        else
            return "(" + content + ")";
    };
    Sexpr.prototype.push = function (val) {
        this.value = this.value || [];
        return this.value.push(val);
    };
    Sexpr.prototype.nth = function (n, val) {
        if (val) {
            this.value = this.value || [];
            return this.value[n] = val;
        }
        return this.value && this.value[n];
    };
    Object.defineProperty(Sexpr.prototype, "operator", {
        get: function () {
            return this.value && this.value[0];
        },
        set: function (op) {
            this.value = this.value || [];
            this.value[0] = op;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Sexpr.prototype, "arguments", {
        get: function () {
            return this.value && this.value.slice(1);
        },
        set: function (args) {
            this.value = this.value || [];
            this.value.length = 1;
            this.value.push.apply(this.value, args);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Sexpr.prototype, "length", {
        get: function () {
            return this.value && this.value.length;
        },
        enumerable: true,
        configurable: true
    });
    return Sexpr;
})();
exports.Sexpr = Sexpr;
var TOKEN_TO_TYPE = {
    "(": "expr",
    ")": "expr",
    "[": "list",
    "]": "list",
    "{": "hash",
    "}": "hash"
};
var hygienicSymbolCounter = 0;
function readSexprs(text) {
    var root = Sexpr.list();
    var token;
    var sexpr = root;
    var sexprs = [root];
    var lines = text.split("\n");
    var lineIx = 0;
    var mode;
    for (var _i = 0; _i < lines.length; _i++) {
        var line = lines[_i];
        var line_1 = lines[lineIx];
        var charIx = 0;
        if (mode === "string")
            token.value += "\n";
        while (charIx < line_1.length) {
            if (mode === "string") {
                if (line_1[charIx] === "\"" && line_1[charIx - 1] !== "\\") {
                    sexpr.push(token);
                    token = mode = undefined;
                    charIx++;
                }
                else
                    token.value += line_1[charIx++];
                continue;
            }
            var padding = readWhile(line_1, /\s/, charIx);
            charIx += padding.length;
            if (padding.length) {
                if (token)
                    sexpr.push(token);
                token = undefined;
            }
            if (charIx >= line_1.length)
                continue;
            if (line_1[charIx] === ";") {
                charIx = line_1.length;
            }
            else if (line_1[charIx] === "\"") {
                if (!sexpr.length)
                    throw new ParseError("Literal must be an argument in a sexpr.", line_1, lineIx, charIx);
                mode = "string";
                token = Token.string("", lineIx, charIx);
                charIx++;
            }
            else if (line_1[charIx] === ":") {
                if (!sexpr.length)
                    throw new ParseError("Literal must be an argument in a sexpr.", line_1, lineIx, charIx);
                var keyword = readUntilAny(line_1, [" ", ")", "]", "}"], ++charIx);
                sexpr.push(Token.keyword(keyword, lineIx, charIx - 1));
                charIx += keyword.length;
            }
            else if (line_1[charIx] === "(" || line_1[charIx] === "[" || line_1[charIx] === "{") {
                if (token)
                    throw new ParseError("Sexpr arguments must be space separated.", line_1, lineIx, charIx);
                var type = TOKEN_TO_TYPE[line_1[charIx]];
                if (type === "hash")
                    sexpr = Sexpr.hash(undefined, lineIx, charIx);
                else if (type === "list")
                    sexpr = Sexpr.list(undefined, lineIx, charIx);
                else
                    sexpr = new Sexpr(undefined, lineIx, charIx);
                sexpr.syntax = type;
                sexprs.push(sexpr);
                charIx++;
            }
            else if (line_1[charIx] === ")" || line_1[charIx] === "]" || line_1[charIx] === "}") {
                var child = sexprs.pop();
                var type = TOKEN_TO_TYPE[line_1[charIx]];
                if (child.syntax !== type)
                    throw new ParseError("Must terminate " + child.syntax + " before terminating " + type, line_1, lineIx, charIx);
                sexpr = sexprs[sexprs.length - 1];
                if (!sexpr)
                    throw new ParseError("Too many closing parens", line_1, lineIx, charIx);
                sexpr.push(child);
                charIx++;
            }
            else {
                var literal = readUntilAny(line_1, [" ", ")", "]", "}"], charIx);
                var length_1 = literal.length;
                literal = utils_1.coerceInput(literal);
                var type = typeof literal === "string" ? "identifier" : "literal";
                if (!sexpr.length && type !== "identifier")
                    throw new ParseError("Expr must begin with identifier.", line_1, lineIx, charIx);
                if (type === "identifier") {
                    var dotIx = literal.indexOf(".");
                    if (dotIx !== -1) {
                        var child = new Sexpr([
                            Token.identifier("get", lineIx, charIx + 1),
                            Token.identifier(literal.slice(0, dotIx), lineIx, charIx + 3),
                            Token.string(literal.slice(dotIx + 1), lineIx, charIx + 5 + dotIx)
                        ], lineIx, charIx);
                        sexpr.push(child);
                    }
                    else
                        sexpr.push(Token.identifier(literal, lineIx, charIx));
                }
                else
                    sexpr.push(Token.literal(literal, lineIx, charIx));
                charIx += length_1;
            }
        }
        lineIx++;
    }
    if (token)
        throw new ParseError("Unterminated " + TOKEN_TYPE[token.type] + " token", lines[lineIx - 1], lineIx - 1);
    var lastIx = lines.length - 1;
    if (sexprs.length > 1)
        throw new ParseError("Too few closing parens", lines[lastIx], lastIx, lines[lastIx].length);
    return root;
}
exports.readSexprs = readSexprs;
function macroexpandDSL(sexpr) {
    // @TODO: Implement me.
    var op = sexpr.operator;
    if (op.value === "eav") {
        throw new Error("@TODO: Implement me!");
    }
    else if (op.value === "one-of") {
        // (one-of (query ...body) (query ...body) ...) =>
        // (union
        //   (def q1 (query ...body1))
        //   (def q2 (query (negate q1) ...body2)))
        throw new Error("@TODO: Implement me!");
    }
    else if (op.value === "negate") {
        if (sexpr.length > 2)
            throw new ParseError("Negate only takes a single body", undefined, sexpr.lineIx, sexpr.charIx);
        var select = macroexpandDSL(Sexpr.asSexprs(sexpr.arguments)[0]);
        select.push(Token.keyword("$$negated"));
        select.push(Token.literal(true));
        return select;
    }
    else if (["hash", "list", "get", "def", "query", "union", "select", "member", "project!", "insert!", "remove!", "load!"].indexOf(op.value) === -1) {
        // (foo-bar :a 5) => (select "foo bar" :a 5)
        var source = op;
        source.type = Token.TYPE.STRING;
        source.value = source.value.replace(/(.?)-(.)/g, "$1 $2");
        var args = sexpr.arguments;
        args.unshift(source);
        sexpr.arguments = args;
        sexpr.operator = Token.identifier("select");
    }
    return sexpr;
}
exports.macroexpandDSL = macroexpandDSL;
var VALUE;
(function (VALUE) {
    VALUE[VALUE["NULL"] = 0] = "NULL";
    VALUE[VALUE["SCALAR"] = 1] = "SCALAR";
    VALUE[VALUE["SET"] = 2] = "SET";
    VALUE[VALUE["VIEW"] = 3] = "VIEW";
})(VALUE || (VALUE = {}));
;
function parseDSL(text) {
    var artifacts = { views: {} };
    var lines = text.split("\n");
    var root = readSexprs(text);
    for (var _i = 0, _a = Sexpr.asSexprs(root.arguments); _i < _a.length; _i++) {
        var raw = _a[_i];
        parseDSLSexpr(raw, artifacts);
    }
    return artifacts;
}
exports.parseDSL = parseDSL;
function parseDSLSexpr(raw, artifacts, context, parent, resultVariable) {
    if (parent instanceof runtime.Query)
        var query = parent;
    else
        var union = parent;
    var sexpr = macroexpandDSL(raw);
    var op = sexpr.operator;
    if (op.type !== Token.TYPE.IDENTIFIER)
        throw new ParseError("Evaluated sexpr must begin with an identifier ('" + op + "' is a " + Token.TYPE[op.type] + ")", "", raw.lineIx, raw.charIx);
    if (op.value === "list") {
        var $$body = parseArguments(sexpr, undefined, "$$body").$$body;
        return { type: VALUE.SCALAR, value: $$body.map(function (token, ix) { return resolveTokenValue("list item " + ix, token, context); }) };
    }
    if (op.value === "hash") {
        var args = parseArguments(sexpr);
        for (var arg in args)
            args[arg] = resolveTokenValue("hash item " + arg, args[arg], context);
        return { type: VALUE.SET, value: args };
    }
    if (op.value === "insert!") {
        var changeset = artifacts.changeset || app_1.eve.diff();
        for (var _i = 0, _a = sexpr.arguments; _i < _a.length; _i++) {
            var arg = _a[_i];
            var table = arg.value[0];
            var fact = {};
            for (var ix = 1; ix < arg.value.length; ix += 2) {
                var key = arg.value[ix];
                var value = arg.value[ix + 1];
                fact[key.value] = value.value;
            }
            changeset.add(table.value, fact);
        }
        artifacts.changeset = changeset;
        return;
    }
    if (op.value === "remove!") {
        var changeset = artifacts.changeset || app_1.eve.diff();
        for (var _b = 0, _c = sexpr.arguments; _b < _c.length; _b++) {
            var arg = _c[_b];
            var table = arg.value[0];
            var fact = {};
            for (var ix = 1; ix < arg.value.length; ix += 2) {
                var key = arg.value[ix];
                var value = arg.value[ix + 1];
                fact[key.value] = value.value;
            }
            changeset.remove(table.value, fact);
        }
        artifacts.changeset = changeset;
        return;
    }
    if (op.value === "load!") {
        throw new Error("(load! ..) has not been implemented yet");
    }
    if (op.value === "query") {
        var neueContext = [];
        var _d = parseArguments(sexpr, undefined, "$$body"), $$view = _d.$$view, $$negated = _d.$$negated, $$body = _d.$$body;
        var queryId = $$view ? resolveTokenValue("view", $$view, context, VALUE.SCALAR) : utils_1.uuid();
        var neue = new runtime.Query(app_1.eve, queryId);
        neue["displayName"] = sexpr.toString();
        if (utils_1.DEBUG.instrumentQuery)
            instrumentQuery(neue, utils_1.DEBUG.instrumentQuery);
        artifacts.views[queryId] = neue;
        var aggregated = false;
        for (var _e = 0, _f = Sexpr.asSexprs($$body); _e < _f.length; _e++) {
            var raw_1 = _f[_e];
            var state = parseDSLSexpr(raw_1, artifacts, neueContext, neue);
            if (state && state.aggregated)
                aggregated = true;
        }
        var projectionMap = neue.projectionMap;
        var projected = true;
        if (!projectionMap) {
            projectionMap = {};
            projected = false;
            for (var _g = 0; _g < neueContext.length; _g++) {
                var variable = neueContext[_g];
                projectionMap[variable.name] = variable.value;
            }
        }
        if (Object.keys(projectionMap).length)
            neue.project(projectionMap);
        // Join subquery to parent.
        if (parent) {
            var select = new Sexpr([Token.identifier(query ? "select" : "member"), Token.string(queryId)], raw.lineIx, raw.charIx);
            var groups = [];
            for (var _h = 0; _h < neueContext.length; _h++) {
                var variable = neueContext[_h];
                if (projected && !variable.projection)
                    continue;
                var field = variable.projection || variable.name;
                select.push(Token.keyword(field));
                if (query)
                    select.push(Token.identifier(variable.name));
                else
                    select.push(Sexpr.list([Token.string(field)]));
                if (context) {
                    for (var _j = 0; _j < context.length; _j++) {
                        var parentVar = context[_j];
                        if (parentVar.name === variable.name)
                            groups.push(variable.value);
                    }
                }
            }
            if ($$negated) {
                select.push(Token.keyword("$$negated"));
                select.push($$negated);
            }
            if (groups.length && aggregated)
                neue.group(groups);
            parseDSLSexpr(select, artifacts, context, parent);
        }
        return { value: queryId, type: VALUE.VIEW, projected: projected, context: neueContext };
    }
    if (op.value === "union") {
        var _k = parseArguments(sexpr, undefined, "$$body"), $$view = _k.$$view, $$body = _k.$$body, $$negated = _k.$$negated;
        var unionId = $$view ? resolveTokenValue("view", $$view, context, VALUE.SCALAR) : utils_1.uuid();
        var neue = new runtime.Union(app_1.eve, unionId);
        if (utils_1.DEBUG.instrumentQuery)
            instrumentQuery(neue, utils_1.DEBUG.instrumentQuery);
        artifacts.views[unionId] = neue;
        var mappings = {};
        for (var _l = 0, _m = Sexpr.asSexprs($$body); _l < _m.length; _l++) {
            var raw_2 = _m[_l];
            var child = macroexpandDSL(raw_2);
            if (child.operator.value !== "query" && child.operator.value !== "union")
                throw new ParseError("Unions may only contain queries", "", raw_2.lineIx, raw_2.charIx);
            var res = parseDSLSexpr(child, artifacts, context, neue);
            for (var _o = 0, _p = res.context; _o < _p.length; _o++) {
                var variable = _p[_o];
                if (res.projected && !variable.projection)
                    continue;
                var field = variable.projection || variable.name;
                if (!mappings[field])
                    mappings[field] = {};
                mappings[field][variable.name] = true;
            }
        }
        // Join subunion to parent
        if (parent) {
            var select = new Sexpr([Token.identifier(query ? "select" : "member"), Token.string(unionId)], raw.lineIx, raw.charIx);
            for (var field in mappings) {
                var mappingVariables = Object.keys(mappings[field]);
                if (mappingVariables.length > 1)
                    throw new ParseError("All variables projected to a single union field must have the same name. Field '" + field + "' has " + mappingVariables.length + " fields (" + mappingVariables.join(", ") + ")", "", raw.lineIx, raw.charIx);
                select.push(Token.keyword(field));
                select.push(Token.identifier(mappingVariables[0]));
            }
            console.log("union select", select.toString());
            parseDSLSexpr(select, artifacts, context, parent);
        }
        return { type: VALUE.VIEW, value: unionId, mappings: mappings };
    }
    if (op.value === "member") {
        if (!union)
            throw new ParseError("Cannot add member to non-union parent", "", raw.lineIx, raw.charIx);
        var args = parseArguments(sexpr, ["$$view"]);
        var $$view = args.$$view, $$negated = args.$$negated;
        var view = resolveTokenValue("view", $$view, context, VALUE.SCALAR);
        if (view === undefined)
            throw new ParseError("Must specify a view to be unioned", "", raw.lineIx, raw.charIx);
        var join = {};
        for (var arg in args) {
            if (arg === "$$view" || arg === "$$negated")
                continue;
            join[arg] = resolveTokenValue("member field", args[arg], context);
        }
        if (runtime.QueryFunctions[view])
            throw new ParseError("Cannot union primitive view '" + view + "'", "", raw.lineIx, raw.charIx);
        union.union(view, join);
        return;
    }
    if (!parent)
        throw new ParseError("Non-query or union sexprs must be contained within a query or union", "", raw.lineIx, raw.charIx);
    if (op.value === "select") {
        if (!query)
            throw new ParseError("Cannot add select to non-query parent", "", raw.lineIx, raw.charIx);
        var selectId = utils_1.uuid();
        var $$view = getArgument(sexpr, "$$view", ["$$view"]);
        var view = resolveTokenValue("view", $$view, context, VALUE.SCALAR);
        if (view === undefined)
            throw new ParseError("Must specify a view to be selected", "", raw.lineIx, raw.charIx);
        var primitive = runtime.QueryFunctions[view];
        //@TODO: Move this to an eve table to allow user defined defaults
        var args = parseArguments(sexpr, ["$$view"].concat(getDefaults(view)));
        var $$negated = args.$$negated;
        var join = {};
        for (var arg in args) {
            var value = args[arg];
            var variable = void 0;
            if (arg === "$$view" || arg === "$$negated")
                continue;
            if (value instanceof Token && value.type !== Token.TYPE.IDENTIFIER) {
                join[arg] = args[arg].value;
                continue;
            }
            if (value instanceof Sexpr) {
                var result = parseDSLSexpr(value, artifacts, context, parent, "$$temp-" + hygienicSymbolCounter++ + "-" + arg);
                if (!result || result.type === VALUE.NULL)
                    throw new Error("Cannot set parameter '" + arg + "' to null value '" + value.toString() + "'");
                if (result.type === VALUE.VIEW) {
                    var view_1 = result.value;
                    var resultField_1 = getResult(view_1);
                    if (!resultField_1)
                        throw new Error("Cannot set parameter '" + arg + "' to select without default result field");
                    for (var _q = 0; _q < context.length; _q++) {
                        var curVar = context[_q];
                        for (var _r = 0, _s = curVar.constraints; _r < _s.length; _r++) {
                            var constraint = _s[_r];
                            if (constraint[0] === view_1 && constraint[1] === resultField_1) {
                                variable = curVar;
                                break;
                            }
                        }
                    }
                }
            }
            else
                variable = getDSLVariable(value.value, context);
            if (variable) {
                join[arg] = variable.value;
                variable.constraints.push([view, arg]);
            }
            else if ($$negated && $$negated.value)
                throw new ParseError("Cannot bind field in negated select to undefined variable '" + value.value + "'", "", raw.lineIx, raw.charIx);
            else
                context.push({ name: value.value, type: VALUE.SCALAR, value: [selectId, arg], constraints: [[view, arg]] }); // @TODO: does this not need to add to the join map?
        }
        var resultField = getResult(view);
        if (resultVariable && resultField && !join[resultField]) {
            join[resultField] = [selectId, resultField];
            context.push({ name: resultVariable, type: VALUE.SCALAR, value: [selectId, resultField], constraints: [[view, resultField]] });
        }
        if (primitive) {
            if ($$negated) {
                if (primitive.inverse)
                    view = primitive.inverse;
                else
                    throw new ParseError("Cannot invert primitive calculation '" + view + "'", "", raw.lineIx, raw.charIx);
            }
            if (primitive.aggregate)
                query.aggregate(view, join, selectId);
            else
                query.calculate(view, join, selectId);
        }
        else if ($$negated)
            query.deselect(view, join);
        else
            query.select(view, join, selectId);
        return {
            type: VALUE.VIEW,
            value: view,
            aggregated: primitive && primitive.aggregate
        };
    }
    if (op.value === "project!") {
        var args = parseArguments(sexpr, ["$$view"]);
        var $$view = args.$$view, $$negated = args.$$negated;
        var projectionMap = {};
        for (var arg in args) {
            var value = args[arg];
            if (arg === "$$view" || arg === "$$negated")
                continue;
            if (value.type !== Token.TYPE.IDENTIFIER) {
                projectionMap[arg] = args[arg].value;
                continue;
            }
            var variable = getDSLVariable(value.value, context);
            if (variable) {
                if (variable.static)
                    projectionMap[arg] = variable.value;
                else if (!$$view) {
                    variable.projection = arg;
                    projectionMap[arg] = variable.value;
                }
                else
                    projectionMap[arg] = [variable.name];
            }
            else
                throw new ParseError("Cannot bind projected field to undefined variable '" + value.value + "'", "", raw.lineIx, raw.charIx);
        }
        var view = resolveTokenValue("view", $$view, context, VALUE.SCALAR);
        if (view === undefined) {
            if (query.projectionMap)
                throw new ParseError("Query can only self-project once", "", raw.lineIx, raw.charIx);
            if ($$negated && $$negated.value)
                throw new ParseError("Cannot negate self-projection", "", raw.lineIx, raw.charIx);
            // Project self
            query.project(projectionMap);
        }
        else {
            var union_1 = artifacts.views[view] || new runtime.Union(app_1.eve, view);
            if (utils_1.DEBUG.instrumentQuery && !artifacts.views[view])
                instrumentQuery(union_1, utils_1.DEBUG.instrumentQuery);
            artifacts.views[view] = union_1;
            // if($$negated && $$negated.value) union.ununion(queryId, projectionMap);
            if ($$negated && $$negated.value)
                throw new ParseError("Union projections may not be negated in the current runtime", "", raw.lineIx, raw.charIx);
            else
                union_1.union(query.name, projectionMap);
        }
        return;
    }
    throw new ParseError("Unknown DSL operator '" + op.value + "'", "", raw.lineIx, raw.charIx);
}
function resolveTokenValue(name, token, context, type) {
    if (!token)
        return;
    if (token instanceof Sexpr)
        return parseDSLSexpr(token, undefined, context);
    if (token instanceof Token && token.type === Token.TYPE.IDENTIFIER) {
        var variable = getDSLVariable(token.value, context, VALUE.SCALAR);
        if (!variable)
            throw new Error("Cannot bind " + name + " to undefined variable '" + token.value + "'");
        if (!variable.static)
            throw new Error("Cannot bind " + name + " to dynamic variable '" + token.value + "'");
        return variable.value;
    }
    return token.value;
}
function getDSLVariable(name, context, type) {
    if (!context)
        return;
    for (var _i = 0; _i < context.length; _i++) {
        var variable = context[_i];
        if (variable.name === name) {
            if (variable.static === false)
                throw new Error("Cannot statically look up dynamic variable '" + name + "'");
            if (type !== undefined && variable.type !== type)
                throw new Error("Expected variable '" + name + "' to have type '" + type + "', but instead has type '" + variable.type + "'");
            return variable;
        }
    }
}
function getDefaults(view) {
    return (runtime.QueryFunctions[view] && runtime.QueryFunctions[view].params) || [];
}
function getResult(view) {
    return runtime.QueryFunctions[view] && runtime.QueryFunctions[view].result;
}
function getArgument(root, param, defaults) {
    var ix = 1;
    var defaultIx = 0;
    for (var ix_1 = 1, cur = root.nth(ix_1); ix_1 < root.length; ix_1++) {
        if (cur.type === Token.TYPE.KEYWORD) {
            if (cur.value === param)
                return root.nth(ix_1 + 1);
            else
                ix_1 + 1;
        }
        else {
            if (defaults && defaultIx < defaults.length) {
                var keyword = defaults[defaultIx++];
                if (keyword === param)
                    return cur;
                else
                    ix_1 + 1;
            }
            throw new Error("Param '" + param + "' not in sexpr " + root.toString());
        }
    }
    throw new Error("Param '" + param + "' not in sexpr " + root.toString());
}
exports.getArgument = getArgument;
function parseArguments(root, defaults, rest) {
    var args = {};
    var defaultIx = 0;
    var keyword;
    var kwarg = false;
    for (var _i = 0, _a = root.arguments; _i < _a.length; _i++) {
        var raw = _a[_i];
        if (raw.type === Token.TYPE.KEYWORD) {
            if (keyword)
                throw new Error("Keywords may not be values '" + raw + "'");
            else
                keyword = raw.value;
        }
        else if (keyword) {
            if (args[keyword] === undefined) {
                args[keyword] = raw;
            }
            else {
                if (!(args[keyword] instanceof Array))
                    args[keyword] = [args[keyword]];
                args[keyword].push(raw);
            }
            keyword = undefined;
            defaultIx = defaults ? defaults.length : 0;
            kwarg = true;
        }
        else if (defaults && defaultIx < defaults.length) {
            args[defaults[defaultIx++]] = raw;
        }
        else if (rest) {
            args[rest] = args[rest] || [];
            args[rest].push(raw);
        }
        else {
            if (kwarg)
                throw new Error("Cannot specify an arg after a kwarg");
            else if (defaultIx)
                throw new Error("Too many args, expected: " + defaults.length + ", got: " + (defaultIx + 1));
            else
                throw new Error("Cannot specify an arg without default keys specified");
        }
    }
    return args;
}
exports.parseArguments = parseArguments;
if (utils_1.ENV === "browser")
    window["parser"] = exports;
function instrumentQuery(q, instrument) {
    var instrumentation = instrument;
    if (!instrument || instrument === true)
        instrumentation = function (fn, args) { return console.log("*", fn, ":", args); };
    var keys = [];
    for (var key in q)
        keys.push(key);
    keys.forEach(function (fn) {
        if (!q.constructor.prototype.hasOwnProperty(fn) || typeof q[fn] !== "function")
            return;
        var old = q[fn];
        q[fn] = function () {
            instrumentation(fn, arguments);
            return old.apply(this, arguments);
        };
    });
    return q;
}
exports.instrumentQuery = instrumentQuery;
function asDiff(ixer, artifacts) {
    var views = artifacts.views;
    var diff = ixer.diff();
    for (var id in views)
        diff.merge(views[id].changeset(app_1.eve));
    return diff;
}
exports.asDiff = asDiff;
function applyAsDiffs(artifacts) {
    var views = artifacts.views;
    for (var id in views)
        app_1.eve.applyDiff(views[id].changeset(app_1.eve));
    console.log("Applied diffs for:");
    for (var id in views)
        console.log("  * ", views[id] instanceof runtime.Query ? "Query" : "Union", views[id].name);
    return artifacts;
}
exports.applyAsDiffs = applyAsDiffs;
function logArtifacts(artifacts) {
    for (var view in artifacts.views)
        console.log(view, "\n", app_1.eve.find(view));
}
exports.logArtifacts = logArtifacts;
//# sourceMappingURL=parser.js.map