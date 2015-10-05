module Parsers {
  //---------------------------------------------------------------------------
  // Utilities
  //---------------------------------------------------------------------------
  const PUNCTUATION = [".", ",", ";", ":"];

  interface Token { type: string, tokenIx?: number, lineIx?: number }

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
    for(let token of structure) {
      fingerprint +=  tokenIsField(token) ? "?" : query.tokenToString(token);
    }
    return fingerprint;
  }

  //---------------------------------------------------------------------------
  // Query Parser
  //---------------------------------------------------------------------------
  interface QueryStructureAST extends Token { text: string }
  interface QueryFieldAST extends Token { grouped?: boolean, alias?: string, value?: string }
  interface QuerySourceAST extends Token { negated?: boolean, chunks: (QueryFieldAST|QueryStructureAST)[] }
  interface QuerySortAST extends Token { direction: string, chunks: (QueryFieldAST|QueryStructureAST)[] }
  interface QueryActionAST extends Token { action: string, params: any }
  interface QueryAST { chunks:(QuerySourceAST|QuerySortAST|QueryActionAST)[] }

  type SourceFieldPair = [string, string];
  //interface SourceFieldLookup {[sourceId: string]: {[fieldId: string]: string}};
  interface ReifiedQueryField { field: string, grouped?: boolean, alias?: string, value?: string, ordinal?: boolean }
  interface ReifiedQuerySource {
    negated?: boolean
    source: string
    sourceView: string
    fields: ReifiedQueryField[]
  }
  export interface ReifiedQuery {
    sources: ReifiedQuerySource[]
    aliases: {[alias:string]: string}
    variables: {[id:string]: {selected: boolean, value?: any, ordinal?: string, bindings: SourceFieldPair[]}}
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
    parseStructure(tokens:string[], tokenIx?:number):QueryStructureAST
    parseField(tokens:string[], tokenIx?:number):QueryFieldAST
    parseSort(tokens:string[]):QuerySortAST
    parseSource(tokens:string[], offset?:number):QuerySourceAST
    parseAction(tokens:string[]):QueryActionAST

    // Reification
    reify(ast:QueryAST, prev?:ReifiedQuery): ReifiedQuery
    reifySource(ast:QuerySourceAST, allowMissing?:boolean):ReifiedQuerySource
    reifyAction(ast:QueryActionAST)
  }
  export var query:Query = <any>function(raw:string) {
    return query.reify(query.parse(raw));
  }

  // Utilities
  query.ACTION_TOKENS = ["+"];
  query.TOKENS = ["`", " ", "\t", "?", "$$", "\"", "!"].concat(query.ACTION_TOKENS);
  function tokenIsField(token:Token): token is QueryFieldAST {
    return token.type === "field";
  }
  function tokenIsSource(token:Token): token is QuerySourceAST {
    return token.type === "source";
  }
  function tokenIsSort(token:Token): token is QuerySortAST {
    return token.type === "sort";
  }

  query.tokenize = makeTokenizer(query.TOKENS);
  query.tokenToChar = (token, line) => (token.tokenIx !== undefined) ? query.tokenize(line).slice(0, token.tokenIx - 1).join("").length : 0;
  query.tokenToString = function(token) {
    if(tokenIsField(token)) {
      if(token.value !== undefined) return `\`${token.value || ""}\``;
      return `?${token.grouped ? "?" : ""}${token.alias || ""}`;
    } else if(tokenIsSource(token) || tokenIsSort(token)) {
      let res = "";
      for(let chunk of token.chunks) {
        res += query.tokenToString(chunk);
      }
      return res;
    }

    return token.text;
  }

  // Parsing
  query.parse = function(raw) {
    let ast:QueryAST = {chunks: []};
    let lines = raw.split("\n");
    for(let ix = 0; ix < lines.length; ix++) {
      lines[ix] = lines[ix].trim();
    }
    ParseError.lines = lines;
    ParseError.tokenToChar = query.tokenToChar;
    ParseError.tokenToString = query.tokenToString;

    let lineIx = 0;
    for(let line of lines) {
      ParseError.lineIx = lineIx;
      let tokens = query.tokenize(line);
      while(tokens[0] === " " || tokens[0] === "\t") tokens = tokens.slice(1);
      if(tokens.length === 0) {
        lineIx++;
        continue;
      }

      // Line is an action.
      if(query.ACTION_TOKENS.indexOf(tokens[0]) !== -1) {
        let action = query.parseAction(tokens);
        action.lineIx = lineIx;
        ast.chunks.push(action);
      }

      if(tokens[0] === "sort" && tokens[2] === "by") {
        let sort = query.parseSort(tokens);
        sort.lineIx = lineIx;
        ast.chunks.push(sort);
      }

      // Line is a source.
      let negated = tokens[0] === "!";
      let source = query.parseSource(tokens);
      if(source) {
        source.lineIx = lineIx;
        if(negated) source.negated = true;
        ast.chunks.push(source);
      }

      lineIx++;
    }
    return ast;
  };

  query.parseField = function(tokens, tokenIx = 0) {
    let field:QueryFieldAST = {type: "field", tokenIx};
    let head = tokens[0];
    if(head === "?") {
      tokens.shift();
      head = tokens[0];
      if(head === "?") {
        field.grouped = true;
        tokens.shift();
        head = tokens[0];
      }
      if(head && head !== " " && PUNCTUATION.indexOf(head) === -1) {
        field.alias = head;
        tokens.shift();
      }
      return field;
    } else if(head === "`") {
      field.value = "";
      tokens.shift();
      while(true) {
        head = tokens.shift();
        if(head === "`") break;
        if(head === undefined) throw ParseError("Unterminated quoted literal.", field);
        field.value += head;
      }
      return field;
    }
  };
  query.parseStructure = function(tokens, tokenIx = 0) {
    let struct:QueryStructureAST = {type: "structure", text: "", tokenIx};
    while(true) {
      let head = tokens[0];
      if(head === undefined) break;
      if(head === "?" || head === "`") break;
      struct.text += head;
      tokens.shift();
    }
    if(struct.text) {
      return struct;
    }
  };

  query.parseSort = function(tokens) {
    let ast:QuerySortAST = {type: "sort", direction: "", chunks: []};
    let tokensLength = tokens.length;
    tokens.shift();
    tokens.shift();
    tokens.shift();
    if(tokens.length < 2) throw ParseError("Sort by requires at least one field and a direction ('ascending' or 'descending') to function.");

    ast.direction = tokens.pop();
    if(ast.direction === "asc" || ast.direction === "ascending") ast.direction = "ascending";
    else if(ast.direction === "desc" || ast.direction === "descending") ast.direction = "descending";
    else throw ParseError("Sort by requires a direction as its last value (descending to count down, ascending to count up).", {type: "unknown", tokenIx: tokensLength + 1});

    while(tokens.length) {
      let tokenIx = tokensLength - tokens.length;
      var text = tokens[0];
      if(text === " ") {
        ast.chunks.push({type: "structure", text: text, tokenIx});
        tokens.shift();
        continue;
      }
      let token:QueryFieldAST = query.parseField(tokens, tokenIx);
      if(!token) throw ParseError("Sort by requires a list of aliases (starting with '?').", token);
      if(!token.alias) throw ParseError("Sort fields must be aliased to have any effect.", token);
      ast.chunks.push(token);
    }

//       let ix = ordering.indexOf(alias);
//       if(ix >= minIx) {
//         minIx = ix + 1;
//       }
//       else if(ix !== -1 && ix < minIx) { // Sort conflict.
//         throw ParseError("The ordering of this sort conflicts with that of previous sorts.", token);
//       } else {
//         ordering.push(alias);
//       }

    return ast;
  };

  query.parseSource = function(tokens, offset = 0) {
    let ast:QuerySourceAST = {type: "source", chunks: []};
    let tokensLength = tokens.length;
    while(tokens.length) {
      let tokenIx = tokensLength - tokens.length + offset;
      let token = query.parseField(tokens, tokenIx)
        || query.parseStructure(tokens, tokenIx);
      ast.chunks.push(token);
    }
    return ast.chunks.length ? ast : undefined;
  };
  query.parseAction = function(line) {
    let ast = {type: "action", action: line.shift(), params: undefined};
    if(!line.length) throw ParseError("Action requires parameters.");
    // Action is add to union.
    if(ast.action === "+") {
      ast.params = query.parseSource(line, 1).chunks;
      for(let token of ast.params) {
        if(tokenIsField(token) && token.alias === undefined) throw ParseError("All fields in a '+' action must be joined.", token);
      }
    }
    return ast;
  };

  // Reification
  query.reify = function(ast:QueryAST, prev?):ReifiedQuery {
    let reified:ReifiedQuery = {sources: [], aliases: {}, variables: {}, views: {}, actions: []};
    let sort = [];
    for(let chunk of ast.chunks) {
      if(chunk.type === "source") {
        let source = query.reifySource(<QuerySourceAST>chunk);
        for(let field of source.fields) {
          let variable = reified.variables[reified.aliases[field.alias]];
          if(!variable) variable = reified.variables[Api.uuid()] = {selected: true, bindings: []};
          if(field.value !== undefined) variable.value = field.value;
          variable.bindings.push([source.source, field.field]);
        }
        reified.sources.push(source);
      } else if(chunk.type === "action") {
        let action = query.reifyAction(<QueryActionAST>chunk);
        reified.actions.push(action);
      } else if(chunk.type === "sort") {
        console.log("@TODO: sort chunk", chunk);
      }
    }

    return reified;
  };
  query.reifySource = function(ast, allowMissing = false) {
    ParseError.lineIx = ast.lineIx;
    let fingerprint = fingerprintSource(ast.chunks);
    let {"view fingerprint: view":view} = Api.ixer.selectOne("view fingerprint", {fingerprint}) || {};
    if(!view && !allowMissing) throw ParseError(`Fingerprint '${fingerprint}' matches no known views.`); //@NOTE: Should this create a union..?

    let source:ReifiedQuerySource = {negated: ast.negated, source: Api.uuid(), sourceView: view, fields: []};
    let fieldIxes = Api.ixer.select("fingerprint field", {fingerprint});
    if(fieldIxes) {
      fieldIxes = fieldIxes.slice();
      fieldIxes.sort((a, b) => a["fingerprint field: ix"] - b["fingerprint field: ix"]);
    } else {
      fieldIxes = fieldIxes ? fieldIxes.slice() : [];
    }

    for(let token of ast.chunks) {
      if(tokenIsField(token)) {
        let {"fingerprint field: field":field} = fieldIxes.shift() || {};
        if(!field && !allowMissing) throw ParseError(`Fingerprint '${fingerprint}' is missing a field for blank '${query.tokenToString(token)}'.`);
        source.fields.push({field, grouped: token.grouped, alias: token.alias, value: token.value});
      }
    }

    return source;
  };
  query.reifyAction = function(ast) {
    let action = {action: ast.action, view: Api.uuid(), fields: []};
    if(ast.action === "+") {
      let source = query.reifySource({type: "source", chunks: ast.params}, true);
      for(let field of source.fields) {
        field.field = Api.uuid();
        action.fields.push(field);
      }
    }
    return action;
  }
}