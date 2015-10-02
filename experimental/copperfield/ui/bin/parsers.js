var Parsers;
(function (Parsers) {
    var ParseError = function (msg, token) {
        var _a = ParseError.lines, lines = _a === void 0 ? [] : _a, lineIx = ParseError.lineIx;
        var line = lines[lineIx] || "";
        console.log(lines, lineIx);
        var charIx = token !== undefined ? ParseError.tokenToChar(token, line) : 0;
        var length = token !== undefined ? (ParseError.tokenToString(token, line) || "").length : line.length - charIx;
        msg += "\nOn line " + lineIx + ":" + charIx;
        if (line !== undefined) {
            msg += "\n" + line + "\n" + underline(charIx, length);
        }
        var err = new Error(msg);
        err.name = "Parse Error";
        err.line = line;
        err.lineIx = lineIx;
        err.charIx = charIx;
        return err;
    };
    function repeat(length, str) {
        var len = length / str.length;
        var res = "";
        for (var ix = 0; ix < len; ix++) {
            res += str;
        }
        return (res.length > length) ? res.slice(0, length) : res;
    }
    function underline(startIx, length) {
        var padding = repeat(startIx, " ");
        var underline = repeat(length - 1, "~");
        return padding + "^" + underline;
    }
    function makeTokenizer(tokens) {
        return function (raw) {
            var results = [];
            while (raw.length) {
                var minIx = raw.length;
                var minToken = raw;
                for (var _i = 0; _i < tokens.length; _i++) {
                    var token = tokens[_i];
                    var ix = raw.indexOf(token);
                    if (ix !== -1 && ix < minIx) {
                        minIx = ix;
                        minToken = token;
                    }
                }
                if (minIx > 0 && minIx < raw.length) {
                    results.push(raw.slice(0, minIx));
                }
                results.push(minToken);
                raw = raw.slice(minIx + minToken.length);
            }
            return results;
        };
    }
    function fingerprintSource(structure) {
        var fingerprint = "";
        var multi = false;
        for (var _i = 0; _i < structure.length; _i++) {
            var token = structure[_i];
            //console.log(token);
            if (multi)
                fingerprint += " ";
            fingerprint += token.type ? "?" : token;
            multi = true;
        }
        return fingerprint;
    }
    Parsers.fingerprintSource = fingerprintSource;
    ;
    Parsers.query = function (raw) {
        return Parsers.query.reify(Parsers.query.parse(raw));
    };
    // Utilities
    Parsers.query.ACTION_TOKENS = ["+"];
    Parsers.query.TOKENS = ["`", " ", "\t", "?", "$$", "\"", "!"].concat(Parsers.query.ACTION_TOKENS);
    function queryTokenIsField(token) {
        return !!token.type;
    }
    Parsers.query.tokenize = makeTokenizer(Parsers.query.TOKENS);
    Parsers.query.tokenToChar = function (token, line) {
        if (token.tokenIx) {
            return Parsers.query.tokenize(line).slice(0, token.tokenIx - 1).join("").length;
        }
        return 0;
    };
    Parsers.query.tokenToString = function (token) {
        if (token.type === "field")
            return "?" + (token.grouped ? "?" : "") + (token.alias || "");
        if (token.type === "constant")
            return "$$" + (token.constant || "");
        if (token.type === "literal")
            return "`" + (token.value || "") + "`";
        return token;
    };
    // Parsing
    Parsers.query.parse = function (raw) {
        var lines = raw.split("\n");
        for (var ix = 0; ix < lines.length; ix++) {
            lines[ix] = lines[ix].trim();
        }
        ParseError.lines = lines.slice();
        ParseError.tokenToChar = Parsers.query.tokenToChar;
        ParseError.tokenToString = Parsers.query.tokenToString;
        var ast = { sources: [], actions: [] };
        var lineIx = 0;
        for (var _i = 0; _i < lines.length; _i++) {
            var line = lines[_i];
            ParseError.lineIx = lineIx + 1;
            var tokens = Parsers.query.tokenize(line);
            while (tokens[0] === " " || tokens[0] === "\t")
                tokens = tokens.slice(1);
            if (tokens.length < 1) {
                lineIx++;
                continue;
            }
            // Line is an action.
            if (Parsers.query.ACTION_TOKENS.indexOf(tokens[0]) !== -1) {
                var action = Parsers.query.parseAction(tokens);
                action.lineIx = lineIx;
                ast.actions.push(action);
            }
            // Line is a source.
            var negated = tokens[0] === "!";
            var source = Parsers.query.parseSource(tokens);
            if (source) {
                source.lineIx = lineIx;
                if (negated)
                    source.negated = true;
                ast.sources.push(source);
            }
            lineIx++;
        }
        return ast;
    };
    Parsers.query.parseSource = function (line, offset) {
        if (offset === void 0) { offset = 0; }
        var ast = { structure: [] };
        var lineLength = line.length;
        while (line.length) {
            var token = line.shift();
            var tokenIx = lineLength - line.length + offset;
            if (token === " ")
                continue;
            var field = { type: undefined, tokenIx: tokenIx };
            // Token is a blank field.
            if (token === "?") {
                field.type = "field";
                var alias = line.shift();
                if (alias === "?") {
                    field.grouped = true;
                    alias = line.shift();
                }
                if (alias !== " " && alias !== undefined) {
                    field.alias = alias;
                }
                ast.structure.push(field);
                continue;
            }
            // Token is a quoted literal.
            if (token === "`") {
                field.type = "literal";
                field.value = "";
                while (true) {
                    var next = line.shift();
                    if (next === "`")
                        break;
                    if (next === undefined)
                        throw ParseError("Parse Error: Unterminated quoted literal.", field);
                    field.value += next;
                }
                ast.structure.push(field);
                continue;
            }
            // Token is a constant.
            if (token === "$$") {
                field.type = "constant";
                field.constant = line.shift();
                if (field.constant === undefined)
                    throw ParseError("Parse Error: Constant requires a name.", field);
                ast.structure.push(field);
                continue;
            }
            // Token is purely structural.
            ast.structure.push(token);
        }
        return ast.structure.length ? ast : undefined;
    };
    Parsers.query.parseAction = function (line) {
        var ast = { action: line.shift(), params: undefined };
        // Action is add to union.
        if (ast.action === "+") {
            ast.params = Parsers.query.parseSource(line, 1).structure;
            for (var _i = 0, _a = ast.params; _i < _a.length; _i++) {
                var token = _a[_i];
                if (token.type === "field" && token.alias === undefined)
                    throw ParseError("All fields in a '+' action must be joined.", token);
            }
        }
        return ast;
    };
    // Reification
    Parsers.query.reify = function (ast) {
        var reified = { sources: [], aliases: {}, variables: {}, constants: {}, views: {}, actions: [] };
        var anonVar = 0;
        var literals = 0;
        for (var _i = 0, _a = ast.sources; _i < _a.length; _i++) {
            var sourceAST = _a[_i];
            var sourceId = reified.sources.length;
            var source = Parsers.query.reifySource(sourceAST);
            for (var _b = 0, _c = source.fields; _b < _c.length; _b++) {
                var field = _c[_b];
                var varId = reified.aliases[field.alias] || Api.uuid();
                if (!reified.variables[varId])
                    reified.variables[varId] = { selected: true, bindings: [], constant: field.constant };
                reified.variables[varId].bindings.push([source.source, field.field]);
                if (field.value !== undefined) {
                    var constantId = Api.uuid();
                    reified.variables[varId].constant = constantId;
                    reified.constants[constantId] = field.value;
                }
            }
            reified.sources.push(source);
        }
        //throw new Error("@TODO: reify actions");
        for (var _d = 0, _e = ast.actions; _d < _e.length; _d++) {
            var actionAST = _e[_d];
            var action = Parsers.query.reifyAction(actionAST);
            reified.actions.push(action);
        }
        return reified;
    };
    Parsers.query.reifySource = function (ast, allowMissing) {
        if (allowMissing === void 0) { allowMissing = false; }
        ParseError.lineIx = ast.lineIx;
        var fingerprint = fingerprintSource(ast.structure);
        var view = (Api.ixer.selectOne("view fingerprint", { fingerprint: fingerprint }) || {})["view fingerprint: view"];
        if (!view && !allowMissing)
            throw ParseError("Fingerprint '" + fingerprint + "' matches no known views."); //@NOTE: Should this create a union..?
        var source = { negated: ast.negated, source: Api.uuid(), view: view, fields: [] };
        var fieldIxes = Api.ixer.select("fingerprint field", { fingerprint: fingerprint });
        if (fieldIxes) {
            fieldIxes = fieldIxes.slice();
            fieldIxes.sort(function (a, b) { return a["fingerprint field: ix"] - b["fingerprint field: ix"]; });
        }
        else {
            fieldIxes = fieldIxes ? fieldIxes.slice() : [];
        }
        for (var _i = 0, _a = ast.structure; _i < _a.length; _i++) {
            var token = _a[_i];
            if (queryTokenIsField(token)) {
                var field = (fieldIxes.shift() || {})["fingerprint field: field"];
                if (!field && !allowMissing)
                    throw ParseError("Fingerprint '" + fingerprint + "' is missing a field for blank '" + Parsers.query.tokenToString(token) + "'.");
                source.fields.push({ field: field, grouped: token.grouped, alias: token.alias, value: token.value, constant: token.constant });
            }
        }
        return source;
    };
    Parsers.query.reifyAction = function (ast) {
        var action = { action: ast.action, view: Api.uuid(), fields: [] };
        if (ast.action === "+") {
            var source = Parsers.query.reifySource({ structure: ast.params }, true);
            for (var _i = 0, _a = source.fields; _i < _a.length; _i++) {
                var field = _a[_i];
                field.field = Api.uuid();
                action.fields.push(field);
            }
        }
        return action;
    };
})(Parsers || (Parsers = {}));
//# sourceMappingURL=parsers.js.map