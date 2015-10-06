module Parsers {
  //---------------------------------------------------------------------------
  // Utilities
  //---------------------------------------------------------------------------
  const PUNCTUATION = [".", ",", ";", ":"];

  interface Token { type: string, tokenIx?: number, lineIx?: number }
  interface LineAST extends Token { chunks: Token[] }

  interface ParseError {
    (msg:string, token?:any): Error
    reset: () => void
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
  ParseError.reset = function() {
    ParseError.lines = ParseError.tokenToChar = ParseError.tokenToString = ParseError.lineIx = undefined;
  };

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

  export function fingerprintSource(ast:LineAST) {
    let fingerprint = "";
    let tokenIx = 0;
    let tokenCount = ast.chunks.length;
    let head = ast.chunks[0];
    if(tokenIsStructure(head)) {
      if(head.text[0] === "!" && head.text[1] === " ") {
        tokenIx = 1;
        fingerprint = head.text.slice(2);
      }
    }
    for(; tokenIx < tokenCount; tokenIx++) {
      let token = ast.chunks[tokenIx];
      fingerprint +=  tokenIsField(token) ? "?" : query.tokenToString(token);
    }
    return fingerprint;
  }

  //---------------------------------------------------------------------------
  // Query Parser
  //---------------------------------------------------------------------------
  interface QueryStructureAST extends Token { text: string }
  interface QueryFieldAST extends Token { grouped?: boolean, alias?: string, value?: string }
  interface QueryAST extends LineAST {}

  interface QuerySourceAST extends LineAST { negated?: boolean }
  interface QuerySortAST extends LineAST { direction: string }

  type SourceFieldPair = [string, string];
  interface ReifiedQueryField { field: string, grouped?: boolean, alias?: string, value?: string, ordinal?: boolean }
  interface ReifiedQuerySource {
    negated?: boolean
    source: string
    sourceView: string
    fields: ReifiedQueryField[]
    sort?: string[] // fields
    ordinal?: string //alias
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
    parseLine(tokens:string[], lineIx?:number):LineAST

    // Reification
    reify(ast:QueryAST, prev?:ReifiedQuery): ReifiedQuery
    reifySource(ast:QuerySourceAST, allowMissing?:boolean):ReifiedQuerySource
    reifyAction(ast:LineAST)
  }

  function tokenIsStructure(token:Token): token is QueryStructureAST { return token.type === "structure"; }
  function tokenIsField(token:Token): token is QueryFieldAST { return token.type === "field"; }
  function tokenIsLine(token:Token): token is LineAST { return !!token["chunks"]; }
  function tokenIsSource(token:Token): token is QuerySourceAST {return token.type === "source"; }
  function tokenIsSort(token:Token): token is QuerySortAST { return token.type === "sort"; }
  function tokenIsAction(token:Token): token is LineAST { return token.type === "action"; }

  export var query:Query = <any>function(raw:string) {
    return query.reify(query.parse(raw));
  }

  // Utilities
  query.ACTION_TOKENS = ["+"];
  query.TOKENS = ["`", " ", "\t", "?", "$$", "\"", "!"].concat(query.ACTION_TOKENS);
  query.tokenize = makeTokenizer(query.TOKENS);
  query.tokenToChar = (token, line) => (token.tokenIx !== undefined) ? query.tokenize(line).slice(0, token.tokenIx - 1).join("").length : 0;
  query.tokenToString = function(token) {
    if(tokenIsField(token)) {
      if(token.value !== undefined) return `\`${token.value || ""}\``;
      return `?${token.grouped ? "?" : ""}${token.alias || ""}`;
    } else if(tokenIsLine(token)) {
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
    let ast:QueryAST = {type: "query", chunks: []};
    let lines = raw.split("\n");
    for(let ix = 0; ix < lines.length; ix++) {
      lines[ix] = lines[ix].trim();
    }
    // Set up debugging metadata globally so downstream doesn't need to be aware of it.
    ParseError.lines = lines;
    ParseError.tokenToChar = query.tokenToChar;
    ParseError.tokenToString = query.tokenToString;

    let lineIx = 0;
    for(let lineIx = 0, lineCount = lines.length; lineIx < lineCount; lineIx++) {
      ParseError.lineIx = lineIx;
      let tokens = query.tokenize(lines[lineIx]);
      if(tokens.length === 0) continue;
      let tokensLength = tokens.length;
      let parsedLine = query.parseLine(tokens, lineIx);

      // Detect line type.
      let head = parsedLine.chunks[0];
      if(tokenIsStructure(head)) {
        let text = head.text.trim().toLowerCase();
        for(let action of query.ACTION_TOKENS) {
          if(text.indexOf(action) === 0) {
            parsedLine.type = "action";
            break;
          }
        }
        if(!parsedLine.type && text.indexOf("sort by") === 0) parsedLine.type = "sort";
      }
      if(!parsedLine.type) parsedLine.type = "source";

      // Validate and extract information from line structure.
      if(tokenIsAction(parsedLine)) {
        for(let token of parsedLine.chunks) {
          if(tokenIsField(token) && !token.alias) throw ParseError("All action fields must be aliased to a query field.", token);
        }

      } else if(tokenIsSort(parsedLine)) {
        let prevChunk = ast.chunks[ast.chunks.length - 1];
        if(!prevChunk || !tokenIsSource(prevChunk)) throw ParseError("Sort by must immediately follow a source.");
        if(parsedLine.chunks.length < 2) throw ParseError("Sort by requires at least one field to sort on.")
        for(let token of parsedLine.chunks) {
          if(tokenIsField(token) && !token.alias) throw ParseError("Sort by fields must be aliased to a query field.", token);
        }
        let dirToken = parsedLine.chunks[parsedLine.chunks.length - 1];
        if(tokenIsStructure(dirToken)) {
          let dir = dirToken.text.trim();
          if(dir === "asc" || dir === "ascending") parsedLine.direction = "ascending";
          else if(dir === "desc" || dir === "descending") parsedLine.direction = "descending";
        }
        if(!parsedLine.direction) throw ParseError("Sort by requires a direction as its last value ('descending' to count down, 'ascending' to count up).", {type: "", tokenIx: tokensLength + 1});

      } else if(tokenIsSource(parsedLine)) {
        if(tokenIsStructure(head)) {
          if(head.text.trim()[0] === "!") {
            parsedLine.negated = true;
          }
        }
      }

      ast.chunks.push(parsedLine);
    }

    ParseError.reset();
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
      tokens.shift();
      field.value = "";
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
      if(head === undefined || head === "?" || head === "`") break;
      struct.text += tokens.shift();
    }
    if(struct.text) {
      return struct;
    }
  };
  query.parseLine = function(tokens, lineIx = 0) {
    let ast:LineAST = {type: "", chunks: [], lineIx};
    let tokensLength = tokens.length;
    while(tokens.length) {
      let tokenIx = tokensLength - tokens.length + 1;
      let token = query.parseField(tokens, tokenIx)
        || query.parseStructure(tokens, tokenIx);
      if(!token) throw ParseError("Unrecognized token sequence.", {type: "", text: tokens.join(""), tokenIx});
      ast.chunks.push(token);
    }
    return ast.chunks.length ? ast : undefined;
  };

  // Reification
  query.reify = function(ast:QueryAST, prev?):ReifiedQuery {
    let reified:ReifiedQuery = {sources: [], aliases: {}, variables: {}, views: {}, actions: []};
    let sort = [];
    for(let chunk of ast.chunks) {
      if(tokenIsSource(chunk)) {
        let source = query.reifySource(<QuerySourceAST>chunk);
        for(let field of source.fields) {
          let variable = reified.variables[reified.aliases[field.alias]];
          if(!variable) variable = reified.variables[Api.uuid()] = {selected: true, bindings: []};
          if(field.value !== undefined) variable.value = field.value;
          variable.bindings.push([source.source, field.field]);
        }
        reified.sources.push(source);
      } else if(tokenIsAction(chunk)) {
        let action = query.reifyAction(chunk);
        reified.actions.push(action);
      } else if(tokenIsSort(chunk)) {
        console.log("@TODO: sort chunk", chunk);
      }
    }

    return reified;
  };
  query.reifySource = function(ast, allowMissing = false) {
    ParseError.lineIx = ast.lineIx;
    let fingerprint = fingerprintSource(ast);
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
    let action = {action: (<QueryStructureAST>ast.chunks[0]).text, view: Api.uuid(), fields: []};
    if(action.action === "+") {
      let source = query.reifySource({type: "source", chunks: ast.chunks}, true);
      for(let field of source.fields) {
        field.field = Api.uuid();
        action.fields.push(field);
      }
    }
    return action;
  }
}