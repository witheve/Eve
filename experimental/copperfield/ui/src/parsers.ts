module Parsers {
  //---------------------------------------------------------------------------
  // Utilities
  //---------------------------------------------------------------------------
  interface ParseError {
    (msg:string, token?:any): Error
    tokenToChar: (token:any, line:string) => number
    tokenToString: (token:any, line:string) => string
    lines: string[]
    lineIx: number
  }
  var ParseError:ParseError = <any>function(msg, token?:any) {
    let {lines = [], lineIx} = ParseError;
    let line = lines[lineIx] || ""
    let charIx = token !== undefined ? ParseError.tokenToChar(token, line) : 0;
    let length = token !== undefined ? (ParseError.tokenToString(token, line) || "").length : line.length - charIx;
    msg += `\nOn line ${lineIx}:${charIx}`;
    if(line !== undefined) {
      msg += `\n${line}\n${underline(charIx, length)}`;
    }
    let err = <any>new Error(msg);
    err.name = "Parse Error";
    err.line = line;
    err.lineIx = lineIx;
    err.charIx = charIx;
    return err;
  }

  function repeat(length, str) {
    let len = length / str.length;
    let res = "";
    for(let ix = 0; ix < len; ix++) {
      res += str;
    }
    return (res.length > length) ? res.slice(0, length) : res;
  }
  function underline(startIx, length) {
    let padding = repeat(startIx, " ");
    let underline = repeat(length - 1, "~");
    return padding + "^" + underline;
  }

  function makeTokenizer(tokens:(string)[]):((string) => string[]) {
    return function(raw:string) {
      let results = [];
      while(raw.length) {
        let minIx = raw.length;
        let minToken = raw;
        for(let token of tokens) {
          let ix = raw.indexOf(token);
          if(ix !== -1 && ix < minIx) {
            minIx = ix;
            minToken = token;
          }
        }

        if(minIx > 0 && minIx < raw.length) {
          results.push(raw.slice(0, minIx));
        }
        results.push(minToken);
        raw = raw.slice(minIx + minToken.length);
      }
      return results;
    };
  }

  export function fingerprintSource(structure) {
    let fingerprint = "";
    let multi = false;
    for(let token of structure) {
      //console.log(token);
      if(multi) fingerprint += " ";
       fingerprint += token.type ? "?" : token;
       multi = true;
    }
    return fingerprint;
  }

  //---------------------------------------------------------------------------
  // Query Parser
  //---------------------------------------------------------------------------
  interface QueryStructureAST extends String { type: void }
  interface QueryFieldAST { type: string, grouped?: boolean, alias?: string, value?: string, constant?: string, tokenIx?: number }
  interface QuerySourceAST { negated?: boolean, structure: (QueryFieldAST|QueryStructureAST)[], lineIx?: number }
  interface QueryActionAST { action: string, params: any, lineIx?: number }
  interface QueryAST { sources: QuerySourceAST[], actions: QueryActionAST[] }

  type SourceFieldPair = [string, string];
  interface SourceFieldLookup {[sourceId: string]: {[fieldId: string]: string}};
  interface ReifiedQueryField { field: string, grouped?: boolean, alias?: string, value?: string, constant?: string }
  interface ReifiedQuerySource { negated?: boolean, source: string, view: string, fields: ReifiedQueryField[] }
  interface ReifiedQuery {
    sources: ReifiedQuerySource[]
    aliases: {[alias:string]: string}
    variables: {[id:string]: {selected: boolean, constant?: string, bindings: SourceFieldPair[]}}
    constants: {[constant: string]: any}
    views: {[view: string]: {fields: string[], kind: string, tags: string[]}}
    actions: any[]
  }

  interface Query {
    (raw:string): QueryAST

    // Utilities
    ACTION_TOKENS: string[]
    TOKENS: string[]
    tokenize(raw:string): string[]
    tokenToChar(token:any, line:string): number
    tokenToString(token:any): string

    // Parsing
    parse(raw:string): QueryAST
    parseSource(line:string[], offset?:number):QuerySourceAST
    parseAction(line:string[]):QueryActionAST

    // Reification
    reify(ast:QueryAST, lines?:string[]): ReifiedQuery
    reifySource(ast:QuerySourceAST, allowMissing?:boolean):ReifiedQuerySource
    reifyAction(ast:QueryActionAST)
  }
  export var query:Query = <any>function(raw:string) {
    return query.reify(query.parse(raw));
  }

  // Utilities
  query.ACTION_TOKENS = ["+"];
  query.TOKENS = ["`", " ", "\t", "?", "$$", "\"", "!"].concat(query.ACTION_TOKENS);
  function queryTokenIsField(token:QueryStructureAST|QueryFieldAST): token is QueryFieldAST {
    return !!token.type;
  }

  query.tokenize = makeTokenizer(query.TOKENS);
  query.tokenToChar = function(token, line) {
    if(token.tokenIx) {
      return query.tokenize(line).slice(0, token.tokenIx - 1).join("").length;
    }
    return 0;
  }
  query.tokenToString = function(token) {
    if(token.type === "field") return `?${token.grouped ? "?" : ""}${token.alias || ""}`;
    if(token.type === "constant") return `$$${token.constant|| ""}`;
    if(token.type === "literal") return `\`${token.value || ""}\``;
    return token;
  }

  // Parsing
  query.parse = function(raw) {
    let lines = raw.split("\n");
    for(let ix = 0; ix < lines.length; ix++) {
      lines[ix] = lines[ix].trim();
    }
    ParseError.lines = lines.slice();
    ParseError.tokenToChar = query.tokenToChar;
    ParseError.tokenToString = query.tokenToString;

    let ast:QueryAST = {sources: [], actions: []};

    let lineIx = 0;
    for(let line of lines) {
      ParseError.lineIx = lineIx;

      let tokens = query.tokenize(line);
      while(tokens[0] === " " || tokens[0] === "\t") tokens = tokens.slice(1);
      if(tokens.length < 1) {
        lineIx++;
        continue;
      }

      // Line is an action.
      if(query.ACTION_TOKENS.indexOf(tokens[0]) !== -1) {
        let action = query.parseAction(tokens);
        action.lineIx = lineIx;
        ast.actions.push(action);
      }

      // Line is a source.
      let negated = tokens[0] === "!";
      let source = query.parseSource(tokens);
      if(source) {
        source.lineIx = lineIx;
        if(negated) source.negated = true;
        ast.sources.push(source);
      }

      lineIx++;
    }
    return ast;
  };
  query.parseSource = function(line, offset = 0) {
    let ast:QuerySourceAST = {structure: []};
    let lineLength = line.length;
    while(line.length) {
      let token = line.shift();
      let tokenIx = lineLength - line.length + offset;
      if(token === " ") continue;

      let field:QueryFieldAST = {type: undefined, tokenIx};
      // Token is a blank field.
      if(token === "?") {
        field.type = "field";
        let alias = line.shift();
        if(alias === "?") { // Field is grouped.
          field.grouped = true;
          alias = line.shift();
        }
        if(alias !== " " && alias !== undefined) {
          field.alias = alias;
        }
        ast.structure.push(field);
        continue;
      }

      // Token is a quoted literal.
      if(token === "`") {
        field.type = "literal";
        field.value = "";
        while(true) {
          let next = line.shift();
          if(next === "`") break;
          if(next === undefined) throw ParseError("Unterminated quoted literal.", field);
          field.value += next;
        }
        ast.structure.push(field);
        continue;
      }

      // Token is a constant.
      if(token === "$$") {
        field.type = "constant";
        field.constant = line.shift();
        if(field.constant === undefined) throw ParseError("Constant requires a name.", field);
        ast.structure.push(field);
        continue;
      }

      // Token is purely structural.
      ast.structure.push(<any>token);
    }
    return ast.structure.length ? ast : undefined;
  };
  query.parseAction = function(line) {
    let ast = {action: line.shift(), params: undefined};
    // Action is add to union.
    if(ast.action === "+") {
      ast.params = query.parseSource(line, 1).structure;
      for(let token of ast.params) {
        if(token.type === "field" && token.alias === undefined) throw ParseError("All fields in a '+' action must be joined.", token);
      }
    }
    return ast;
  };

  // Reification
  query.reify = function(ast:QueryAST):ReifiedQuery {
    let reified:ReifiedQuery = {sources: [], aliases: {}, variables: {}, constants: {}, views: {}, actions: []};
    let anonVar = 0;
    let literals = 0;
    for(let sourceAST of ast.sources) {
      let sourceId = reified.sources.length;
      let source = query.reifySource(sourceAST);
      for(let field of source.fields) {
        let varId = reified.aliases[field.alias] || Api.uuid();
        if(!reified.variables[varId]) reified.variables[varId] = {selected: true, bindings: [], constant: field.constant};
        reified.variables[varId].bindings.push([source.source, field.field]);
        if(field.value !== undefined) {
          let constantId = Api.uuid();
          reified.variables[varId].constant = constantId;
          reified.constants[constantId] = field.value;
        }
      }
      reified.sources.push(source);
    }
    //throw new Error("@TODO: reify actions");
    for(let actionAST of ast.actions) {
      let action = query.reifyAction(actionAST);

      reified.actions.push(action);
    }
    return reified;
  };
  query.reifySource = function(ast, allowMissing = false) {
    ParseError.lineIx = ast.lineIx;
    let fingerprint = fingerprintSource(ast.structure);
    let {"view fingerprint: view":view} = Api.ixer.selectOne("view fingerprint", {fingerprint}) || {};
    if(!view && !allowMissing) throw ParseError(`Fingerprint '${fingerprint}' matches no known views.`); //@NOTE: Should this create a union..?

    let source:ReifiedQuerySource = {negated: ast.negated, source: Api.uuid(), view: view, fields: []};
    let fieldIxes = Api.ixer.select("fingerprint field", {fingerprint});
    if(fieldIxes) {
      fieldIxes = fieldIxes.slice();
      fieldIxes.sort((a, b) => a["fingerprint field: ix"] - b["fingerprint field: ix"]);
    } else {
      fieldIxes = fieldIxes ? fieldIxes.slice() : [];
    }

    for(let token of ast.structure) {
      if(queryTokenIsField(token)) {
        let {"fingerprint field: field":field} = fieldIxes.shift() || {};
        if(!field && !allowMissing) throw ParseError(`Fingerprint '${fingerprint}' is missing a field for blank '${query.tokenToString(token)}'.`);
        source.fields.push({field, grouped: token.grouped, alias: token.alias, value: token.value, constant: token.constant});
      }
    }

    return source;
  };
  query.reifyAction = function(ast) {
    let action = {action: ast.action, view: Api.uuid(), fields: []};
    if(ast.action === "+") {
      let source = query.reifySource({structure: ast.params}, true);
      for(let field of source.fields) {
        field.field = Api.uuid();
        action.fields.push(field);
      }
    }
    return action;
  }
}