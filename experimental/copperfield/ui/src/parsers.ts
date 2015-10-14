module Parsers {
  //---------------------------------------------------------------------------
  // Types
  //---------------------------------------------------------------------------
  interface Token { type: string, tokenIx?: number, lineIx?: number, indent?: number }
  interface LineAST extends Token { chunks: Token[] }

  interface CommentAST extends Token { text: string }
  interface TextAST extends Token { text: string }
  interface FieldAST extends Token { grouped?: boolean, alias?: string, value?: string }
  interface SourceAST extends LineAST { negated?: boolean }
  interface OrdinalAST extends LineAST { alias: string, directions: string[] }
  export interface QueryAST extends LineAST {}

  interface ElementAST extends Token { tag?: string, classes?: string, name?: string }
  interface AttributeAST extends Token { property: string, value: FieldAST, static: boolean }
  interface BindingAST extends Token { text: string }
  export interface UiAST extends LineAST {}

  interface FieldIR { field: string, grouped?: boolean, alias?: string, value?: string, ordinal?: boolean }
  interface SourceIR {
    source: string
    sourceView: string
    fields: FieldIR[]
    negated?: boolean
    chunked?: boolean
    sort?: {ix:number, field:string, direction:string}[]
    ordinal?: string|boolean //alias
  }
  interface VariableIR {
    selected: string,
    alias?:string,
    value?: any,
    ordinals?: string[],
    bindings: {source: string, field: string}[]
  }
  export interface QueryIR {
    id: string
    sources: SourceIR[]
    aliases: {[alias:string]: string}
    variables: {[id:string]: VariableIR}
    actions: any[]
  }
  interface ElementIR {
    element: string
    tag: string
    name?: string
    parent?: string
    attributes: Api.Dict
    boundAttributes: Api.Dict
    boundView?: string
    bindings?: Api.Dict
  }
  export interface UiIR {
    elements: ElementIR[]
    root: ElementIR
    boundQueries: {[id: string]: QueryIR}
  }

  function tokenIsLine(token:Token): token is LineAST { return !!token["chunks"]; }
  function tokenIsText(token:Token): token is TextAST { return token.type === "text"; }
  function tokenIsComment(token:Token): token is CommentAST { return token.type === "comment"; }

  function tokenIsField(token:Token): token is FieldAST { return token.type === "field"; }
  function tokenIsSource(token:Token): token is SourceAST {return token.type === "source"; }
  function tokenIsOrdinal(token:Token): token is OrdinalAST { return token.type === "ordinal"; }
  function tokenIsAction(token:Token): token is LineAST { return token.type === "action"; }

  function tokenIsAttribute(token:Token): token is AttributeAST { return token.type === "attribute"; }
  function tokenIsBinding(token:Token): token is BindingAST { return token.type === "binding"; }
  function tokenIsElement(token:Token): token is ElementAST { return token.type === "element"; }

  //---------------------------------------------------------------------------
  // Utilities
  //---------------------------------------------------------------------------
  const PUNCTUATION = [".", ",", ";", ":"];

  interface ParseError {
    (msg:string, token?:any): Error
    reset: () => void
    tokenToChar: (token:any, line:string) => number
    lines: string[]
    lineIx: number
  }
  var ParseError:ParseError = <any>function(msg, token?:any) {
    let {lines = [], lineIx} = ParseError;
    let line = lines[lineIx] || "";
    let charIx = 0;
    let length = line.length;
    if(token) {
      lineIx = (token.lineIx !== undefined) ? token.lineIx : lineIx;
      line = lines[lineIx] || "";
      charIx = ParseError.tokenToChar(token, line);
      let text = tokenToString(token) || "";
      let ix = text.indexOf("\n");
      if(ix !== -1) length = ix - charIx;
      else length = (text.length || line.length) - charIx;
    }
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
    ParseError.lines = ParseError.tokenToChar = ParseError.lineIx = undefined;
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

  function makeTokenizer(tokens:(string)[]): ((line:string) => string[]) {
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

  function tokenToString(token:Token):string {
    if(!token) return;
    let padding = token.indent ? new Array(token.indent + 1).join(" ") : "";
    if(tokenIsLine(token)) {
      let res = "";
      for(let chunk of token.chunks) {
        res += tokenToString(chunk);
        if(chunk.lineIx !== undefined) res += "\n";
      }
      return res;
    } else if(tokenIsField(token)) {
      if(token.value !== undefined) return `\`${token.value || ""}\``;
      return `?${token.grouped ? "?" : ""}${token.alias || ""}`;
    } else if(tokenIsAttribute(token)) {
      return `${padding}- ${token.property}: ${tokenToString(token.value)}`;
    } else if(tokenIsElement(token)) {
      let res = `${padding}${token.tag || ""}`;
      if(token.classes) res += token.classes;
      if(token.name) res += "; " + token.name;
      return res;
    }
    else if(tokenIsBinding(token)) {
      return padding + "~ " + token.text.split("\n").join("\n" + padding + "~ ");
    }
    if(tokenIsText(token)) return padding + token.text;
    throw new Error(`Unknown token type '${token && token.type}'`);
  }

  export function fingerprintSource(ast:LineAST) {
    let fingerprint = "";
    let tokenIx = 0;
    let tokenCount = ast.chunks.length;
    let head = ast.chunks[0];
    if(tokenIsText(head)) {
      if(head.text[0] === "!" && head.text[1] === " ") {
        tokenIx = 1;
        fingerprint = head.text.slice(2);
      }
    }
    for(; tokenIx < tokenCount; tokenIx++) {
      let token = ast.chunks[tokenIx];
      fingerprint +=  tokenIsField(token) ? "?" : tokenToString(token);
    }
    return fingerprint;
  }

  export function coerceInput(input) {
    if (input.match(/^-?[\d]+$/gim)) {
        return parseInt(input);
    }
    else if (input.match(/^-?[\d]+\.[\d]+$/gim)) {
        return parseFloat(input);
    }
    else if (input === "true") {
        return true;
    }
    else if (input === "false") {
        return false;
    }
    return input;
  }

  function getVariable(alias, ast:QueryIR, varId?:string, fieldId?:string) {
    if(!varId) varId = ast.aliases[alias] || Api.uuid();
    let variable = ast.variables[varId];
    if(!variable) variable = ast.variables[varId] = {selected: fieldId || (alias ? Api.uuid() : undefined), alias: alias, bindings: []};
    if(alias) ast.aliases[alias] = varId;
    return variable;
  }

  function getPrevOfType<T extends Token>(tokens:Token[],  test:(token:Token) => token is T):T {
    for(let ix = tokens.length; ix >= 0; ix--) {
      let token = tokens[ix];
      if(test(token)) return token;
    }
  }

  function consume(needles:string[], tokens:string[], err?:Error):string {
    let res = "";
    while(true) {
      let head = tokens[0];
      if(head === undefined) {
        if(err) throw err;
        break;
      }
      if(needles.indexOf(head) === -1) break;
      res += tokens.shift();
    }
    return res;
  }

  function consumeUntil(needles:string[], tokens:string[], err?:Error):string {
    let res = "";
    while(true) {
      let head = tokens[0];
      if(head === undefined) {
        if(err) throw err;
        break;
      }
      if(needles.indexOf(head) !== -1) break;
      res += tokens.shift();
    }
    return res;
  }

  function unravel(cur:string, tangle:{[key: string]: string[]}, unraveled:string[] = []): string[] {
    unraveled.push(cur);
    for(let child of tangle[cur]) unraveled.push.apply(unraveled, unravel(child, tangle));
    return unraveled;
  }

  function getScopedBinding(alias:string, ancestors:ElementIR[], boundViews:{[id: string]: QueryIR}): string {
    for(let ix = ancestors.length - 1; ix >= 0; ix--) {
      let parent = ancestors[ix];
      if(!parent.boundView) continue;
      let scope = boundViews[parent.boundView];
      let varId = scope.aliases[alias];
      if(!varId) continue;
      let variable = scope.variables[varId];
      if(!variable.selected) throw ParseError("UI Properties can only be bound to selected aliases.");
      return variable.selected;
    }
  }

  //---------------------------------------------------------------------------
  // Query Parser
  //---------------------------------------------------------------------------
  interface Query {
    // Utilities
    tokenize(raw:string): string[]
    tokenToChar(token:any, line:string): number

    // Parsing
    parse(raw:string): QueryAST
    parseStructure(tokens:string[], tokenIx?:number):TextAST
    parseField(tokens:string[], tokenIx?:number):FieldAST
    parseLine(tokens:string[], lineIx?:number):LineAST

    // Reification
    reify(ast:QueryAST, prev?:QueryIR): QueryIR
    reifySource(ast:SourceAST, allowMissing?:boolean):SourceIR
    reifyAction(ast:LineAST)

    // To string
    fromView(viewId:string, ixer?:Indexer.Indexer): QueryIR
    unreify(reified:QueryIR): QueryAST
    unparse(ast:QueryAST): string
  }

  const Q_ACTION_TOKENS = ["+"];
  const Q_TOKENS = [" ", "\t", "`", "?"].concat(Q_ACTION_TOKENS).concat(PUNCTUATION);
  export var query:Query = <any>{
    // Utilities
    tokenize: makeTokenizer(Q_TOKENS),
    tokenToChar: (token, line) => (token.tokenIx !== undefined) ? query.tokenize(line).slice(0, token.tokenIx - 1).join("").length : 0,

    // Parsing
    parse: function(raw) {
      let ast:QueryAST = {type: "query", chunks: []};
      let lines = raw.split("\n");
      for(let ix = 0; ix < lines.length; ix++) lines[ix] = lines[ix].trim();

      // Set up debugging metadata globally so downstream doesn't need to be aware of it.
      ParseError.lines = lines;
      ParseError.tokenToChar = query.tokenToChar;

      let lineIx = 0;
      for(let line of lines) {
        ParseError.lineIx = lineIx;
        let tokens = query.tokenize(line);
        if(tokens.length === 0) continue;
        let tokensLength = tokens.length;
        let parsedLine = query.parseLine(tokens, lineIx++);

        // Detect line type.
        let head = parsedLine.chunks[0];
        if(tokenIsText(head)) {
          let text = head.text.trim().toLowerCase();
          for(let action of Q_ACTION_TOKENS) {
            if(text.indexOf(action) === 0) {
              parsedLine.type = "action";
              break;
            }
          }
          if(!parsedLine.type && text.indexOf("#") === 0) parsedLine.type = "ordinal";
        }
        if(!parsedLine.type) parsedLine.type = "source";

        // Validate and extract information from line structure.
        if(tokenIsAction(parsedLine)) {
          for(let token of parsedLine.chunks) {
            if(tokenIsField(token) && !token.alias) throw ParseError("All action fields must be aliased to a query field.", token);
          }

        } else if(tokenIsOrdinal(parsedLine)) {
          let prevChunk = ast.chunks[ast.chunks.length - 1];
          if(!prevChunk || !tokenIsSource(prevChunk)) throw ParseError("Ordinal must immediately follow a source.");
          if(parsedLine.chunks.length < 2 || !tokenIsField(parsedLine.chunks[1]))
            throw ParseError("Ordinal requires a field to bind to ('?' or '?foo').", parsedLine.chunks[1]);
          if(parsedLine.chunks.length > 2 && parsedLine.chunks[2]["text"].indexOf("by") !== 1)
            throw ParseError("Ordinals are formatted as '# ? by ?... <dir>'", parsedLine.chunks[2]);

          parsedLine.alias = parsedLine.chunks[1]["alias"];
          parsedLine.directions = [];
          let sortFieldCount = 0;
          for(let tokenIx = 3, chunkCount = parsedLine.chunks.length; tokenIx < chunkCount; tokenIx++) {
            let token = parsedLine.chunks[tokenIx];
            if(tokenIsField(token)) {
              if(!token.alias) throw ParseError("Ordinal sorting fields must be aliased to a query field.", token);
              sortFieldCount++;
            } else if(tokenIsText(token) && sortFieldCount > 0) {
              let text = token.text.trim().toLowerCase();
              if(text.indexOf("ascending") === 0) parsedLine.directions[sortFieldCount - 1] = "ascending";
              else if(text.indexOf("descending") === 0) parsedLine.directions[sortFieldCount - 1] = "descending";
            }
          }
          if(sortFieldCount === 0) throw ParseError("Ordinal requires at least one sorting field.");

        } else if(tokenIsSource(parsedLine)) {
          if(tokenIsText(head) && head.text.trim()[0] === "!") parsedLine.negated = true;
        }

        ast.chunks.push(parsedLine);
      }

      return ast;
    },

    parseLine: function(tokens, lineIx = 0) {
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
    },

    parseField: function(tokens, tokenIx = 0) {
      let field:FieldAST = {type: "field", tokenIx};
      let ix = 0;
      if(tokens[ix] === "?") {
        ix++;
        if(tokens[ix] === "?") {
          ix++;
          field.grouped = true;
        }
        if(tokens[ix] && tokens[ix] !== " " && PUNCTUATION.indexOf(tokens[ix]) === -1) field.alias = tokens[ix++];

      } else if(tokens[ix] === "`") {
        field.value = "";
        while(true) {
          ix++;
          if(tokens[ix] === "`") break;
          if(tokens[ix] === undefined) throw ParseError("Unterminated quoted literal.", field);
          field.value += tokens[ix];
        }
        ix++;
        field.value = coerceInput(field.value);
      }
      tokens.splice(0, ix);
      return ix > 0 ? field : undefined;
    },

    parseStructure: function(tokens, tokenIx = 0) {
      let struct:TextAST = {type: "text", text: "", tokenIx};
      while(true) {
        let head = tokens[0];
        if(head === undefined || head === "?" || head === "`") break;
        struct.text += tokens.shift();
      }
      if(struct.text) return struct;
    },

    // Reification
    reify: function(ast:QueryAST, prev?:QueryIR):QueryIR {
      let reified:QueryIR = {id: (prev && prev.id) || Api.uuid(), sources: [], aliases: {}, variables: {}, actions: []};
      let sort = [];
      for(let line of ast.chunks) {
        if(tokenIsSource(line)) {
          let source = query.reifySource(<SourceAST>line);
          let prevSource = prev && prev.sources[reified.sources.length];
          if(prevSource && prevSource.sourceView === source.sourceView) source.source = prevSource.source;
          reified.sources.push(source);

          for(let field of source.fields) {
            let varId = prev && prev.aliases[field.alias];
            let variable = getVariable(field.alias, reified, varId, varId && prev.variables[varId].selected);
            if(field.grouped) source.chunked = true;
            if(field.value !== undefined) variable.value = field.value;
            variable.bindings.push({source: source.source, field: field.field});
          }

        } else if(tokenIsOrdinal(line)) {
          let source = reified.sources[reified.sources.length - 1];
          source.ordinal = line.alias || true;
          let varId = prev && prev.aliases[line.alias];
          let variable = getVariable(line.alias, reified, varId, varId && prev.variables[varId].selected);
          if(!variable.ordinals) variable.ordinals = [source.source];
          else variable.ordinals.push(source.source);
          let unsorted = [];
          for(let field of source.fields) unsorted[unsorted.length] = field.field;

          let sortFieldIx = 0;
          source.sort = [];
          for(let tokenIx = 3, chunkCount = line.chunks.length; tokenIx < chunkCount; tokenIx++) {
            let chunk = line.chunks[tokenIx];
            if(tokenIsField(chunk)) {
              for(let field of source.fields) {
                if(field.alias !== chunk.alias) continue;
                source.sort.push({ix: sortFieldIx, field: field.field, direction: line.directions[sortFieldIx++] || "ascending"});
                unsorted.splice(unsorted.indexOf(field.field), 1);
                break;
              }
            }
          }
          for(let fieldId of unsorted) source.sort.push({ix: sortFieldIx++, field: fieldId, direction: "ascending"});

        } else if(tokenIsAction(line)) {
          reified.actions.push(query.reifyAction(line));
        }
      }

      return reified;
    },

    reifySource: function(ast, allowMissing = false) {
      ParseError.lineIx = ast.lineIx;
      let fingerprint = fingerprintSource(ast);
      let {"view fingerprint: view":view} = Api.ixer.findOne("view fingerprint", {"view fingerprint: fingerprint": fingerprint}) || {};
      if(!view && !allowMissing) throw ParseError(`Fingerprint '${fingerprint}' matches no known views.`); //@NOTE: Should this create a union..?

      let source:SourceIR = {negated: ast.negated, source: Api.uuid(), sourceView: view, fields: []};
      let fieldIxes = Api.ixer.find("fingerprint field", {"fingerprint field: fingerprint": fingerprint}).slice()
        .sort((a, b) => a["fingerprint field: ix"] - b["fingerprint field: ix"]);

      for(let token of ast.chunks) {
        if(tokenIsField(token)) {
          let {"fingerprint field: field":field} = fieldIxes.shift() || {};
          if(!field && !allowMissing) throw ParseError(`Fingerprint '${fingerprint}' is missing a field for blank '${tokenToString(token)}'.`);
          source.fields.push({field, grouped: token.grouped, alias: token.alias, value: token.value});
        }
      }

      return source;
    },

    reifyAction: function(ast) {
      let action = {action: (<TextAST>ast.chunks[0]).text, view: Api.uuid(), fields: []};
      if(action.action === "+") {
        let source = query.reifySource({type: "source", chunks: ast.chunks}, true);
        for(let field of source.fields) {
          field.field = Api.uuid();
          action.fields.push(field);
        }
      }
      return action;
    },

    // Stringification
    fromView: function(viewId:string, ixer:Indexer.Indexer = Api.ixer) {
      let reified:QueryIR = {id: viewId, sources: [], aliases: {}, variables: {}, actions: []};
      let ordinalSourceAlias:{[source:string]: string|boolean} = {};
      let bindingFieldVariable:{[id:string]: VariableIR} = {};
      for(let varId of Api.extract("variable: variable", Api.ixer.find("variable", {"variable: view": viewId}))) {
        // {selected: boolean, alias?:string, value?: any, ordinals?: string[], bindings: {source: string, field: string}[]}
        let fieldId = (ixer.findOne("select", {"select: variable": varId}) || {})["select: field"];
        let alias = Api.get.name(fieldId) || undefined;
        let variable = getVariable(alias, reified, varId);
        variable.selected = fieldId;
        variable.value = (ixer.findOne("constant binding", {"constant binding: variable": varId}) || {})["constant binding: value"];

        let ordinalSources = Api.extract("ordinal binding: source", Api.ixer.find("ordinal binding", {"ordinal binding: variable": varId}));
        if(ordinalSources.length) {
          variable.ordinals = ordinalSources;
          for(let sourceId of ordinalSources) ordinalSourceAlias[sourceId] = alias || true;
        }

        variable.bindings = <any>Api.omit("variable", Api.humanize("binding", Api.ixer.find("binding", {"binding: variable": varId})));
        for(let binding of variable.bindings) {
          bindingFieldVariable[binding.field] = variable;
        }
      }

      for(let rawSource of Api.ixer.find("source", {"source: view": viewId})) {
        let source:SourceIR = {source: rawSource["source: source"], sourceView: rawSource["source: source view"], fields: []};
        reified.sources[reified.sources.length] = source;

        if(ordinalSourceAlias[source.source]) source.ordinal = ordinalSourceAlias[source.source];
        if(Api.ixer.findOne("chunked source", {"chunked source: source": source.source})) source.chunked = true;
        if(Api.ixer.findOne("negated source", {"negated source: source": source.source})) source.negated = true;

        let sorted = Api.ixer.find("sorted field", {"sorted field: source": source.source});
        if(sorted && sorted.length) source.sort = <any>Api.omit("source", Api.humanize("sorted field", sorted));

        let fieldIds = Api.get.fields(source.sourceView);
        for(let fieldId of fieldIds) {
          let field:FieldIR = {field: fieldId};
          source.fields[source.fields.length] = field;
          if(Api.ixer.findOne("grouped field", {"grouped field: field": fieldId})) field.grouped = true;

          let variable = bindingFieldVariable[fieldId];
          if(variable.alias) field.alias = variable.alias;
          if(variable.value !== undefined) field.value = variable.value;
          if(variable.ordinals !== undefined && variable.ordinals.indexOf(source.source) !== -1) field.ordinal = true;
        }
      }

      return reified;
    },

    unreify: function(reified:QueryIR) {
      let ast:QueryAST = {type: "query", chunks: []};
      for(let source of reified.sources) {
        // @FIXME: This may not be the correct fingerprint, we need to look through all of them
        // comparing field ordering. This still isn't lossless, but it's at least better.
        let fingerprint = (Api.ixer.findOne("view fingerprint", {"view fingerprint: view": source.sourceView}) || {})["view fingerprint: fingerprint"];
        if(!fingerprint) throw new Error(`No fingerprint found for view '${source.sourceView}'.`);
        let structures = fingerprint.split("?");
        let tail:string = structures.pop(); // We don't want to tack a field to the end of the fingerprint.
        let line:SourceAST = {type: "source", negated: source.negated, chunks: [], lineIx: ast.chunks.length};
        ast.chunks[ast.chunks.length] = line;

        let fieldIx = 0;
        for(let text of structures) {
          // Add structure token if there's any text.
          if(text) line.chunks[line.chunks.length] = <TextAST>{type: "text", text};

          // Add field token between this structure token and the next.
          let field:FieldIR = source.fields[fieldIx++];
          line.chunks[line.chunks.length] = <FieldAST>{type: "field", alias: field.alias, grouped: field.grouped, value: field.value};
        }
        if(tail) line.chunks[line.chunks.length] = <TextAST>{type: "text", text: tail};

        if(source.ordinal) {
          let line:OrdinalAST = {type: "ordinal", alias: undefined, directions: [], chunks: [], lineIx: ast.chunks.length};
          ast.chunks[ast.chunks.length] = line;

          if(source.ordinal !== true) line.alias = <string>source.ordinal;
          line.chunks[0] = <TextAST>{type: "text", text: `# ?${line.alias || ""} by `};

          let fields = {};
          for(let field of source.fields) {
            fields[field.field] = field;
          }

          // Super lossy, but nothing can be done about it.
          for(let {ix, field:fieldId, direction} of source.sort) {
            let field = fields[fieldId];
            line.chunks[line.chunks.length] = <FieldAST>{type: "field", alias: field.alias, grouped: field.grouped, value: field.value};
            line.chunks[line.chunks.length] = <TextAST>{type: "text", text: ` ${direction} `};
            line.directions[line.directions.length] = direction;
          }
        }
      }

      if(reified.actions.length) throw new Error("@TODO Implement action unreification.");
      return ast;
    },

    unparse: (ast:QueryAST) => tokenToString(ast)
  };

  //---------------------------------------------------------------------------
  // Ui Parser
  //---------------------------------------------------------------------------
  const U_TOKENS = [";", "~", "-", " ", "\t", "`", "?"];
  export var ui = {
   // Utilities
    tokenize: makeTokenizer(Q_TOKENS),
    tokenToChar(token:Token, line:string) {
      if(token.tokenIx === undefined) return 0;
      let text = ui.tokenize(line).slice(0, token.tokenIx - 1).join("");
      let ix = text.indexOf("\n");
      if(ix !== -1) return ix;
      return text.length;
    },

    parse(raw:string): UiAST {
      let ast:QueryAST = {type: "ui", chunks: []};
      let lines = raw.split("\n");

      // Set up debugging metadata globally so downstream doesn't need to be aware of it.
      ParseError.lines = lines;
      ParseError.tokenToChar = ui.tokenToChar;

      for(let rawLine of lines) {
        let lineIx = ast.chunks.length;
        ParseError.lineIx = lineIx;
        let tokens = ui.tokenize(rawLine);
        let tokensLength = tokens.length;
        let consumed = consume([" ", "\t"], tokens);
        let indent = tokensLength - tokens.length;
        let line:Token = {type: "", lineIx, indent};
        let head = tokens.shift();

        if(head === undefined) {
          ast.chunks.push(<TextAST>{type: "text", text: ""});
          continue;
        }

        if(head === ";") {
          line.type = "comment";
          let comment:CommentAST = <any>line;
          comment.text = tokens.join("");

        } else if(head === "-") {
          line.type = "attribute";
          let attribute:AttributeAST = <any>line;
          consume([" ", "\t"], tokens);
          attribute.property = consumeUntil([":"], tokens, ParseError("Attributes are formatted as '- <property>: <value or field>'."));
          tokens.shift();
          consume([" ", "\t"], tokens);
          let field = query.parseField(tokens, tokensLength - tokens.length);
          // @TODO we can wrap this in `` and rerun it, or skip the middleman since we know the value.
          if(!field) throw ParseError("Value of attribute must be a field (either ' ?foo ' or ' `100` ')", {type: "text", text: tokens.join(""), tokenIx: tokensLength - tokens.length});
          attribute.value = field;
          attribute.static = field.value !== undefined;
          if(tokens.length) throw ParseError("Extraneous tokens after value.", {type: "text", text: tokens.join(""), tokenIx: tokensLength - tokens.length});

        } else if(head === "~") {
          let prevLine = ast.chunks[ast.chunks.length - 1];
          if(!prevLine || tokenIsElement(prevLine)) {
            line.type = "binding";
            let binding:BindingAST = <any>line;
            consume([" ", "\t"], tokens);
            binding.text = tokens.join("");

          } else if(tokenIsBinding(prevLine)) {
            consume([" ", "\t"], tokens);
            prevLine.text += "\n" + tokens.join("");
            continue;

          } else throw ParseError("Binding must immediately follow an element or a binding.", line);

        } else {
          line.type = "element";
          let element:ElementAST = <any>line;
          if(head) element.tag = head;
          element.classes = consumeUntil([";"], tokens);
          if(tokens[0] === ";") tokens.shift();
          if(tokens.length) element.name = tokens.join("").trim();
        }

        ast.chunks[ast.chunks.length] = line;
      }

      return ast;
    },

    reify(ast:UiAST, prev?:UiIR): UiIR {
      let rootId = prev ? prev.root.element : Api.uuid();
      let root:ElementIR = {element: rootId, tag: "div", attributes: {}, boundAttributes: {}};
      let reified:UiIR = {elements: [], root, boundQueries: {}};
      let indent = {[root.element]: -1};
      let ancestors = [root];

      for(let line of ast.chunks) {
        if(tokenIsComment(line) || tokenIsText(line)) continue;

        let parentElem:ElementIR;
        while(ancestors.length) {
            parentElem = ancestors[ancestors.length - 1];
            if(indent[parentElem.element] < line.indent) break;
            ancestors.pop();
        }

        if(tokenIsElement(line)) {
          let prevElem = prev && prev.elements[reified.elements.length]; // This is usually not going to match up.
          let elemId = prevElem ? prevElem.element : Api.uuid();
          let elem:ElementIR = {element: elemId, tag: line.tag, parent: parentElem.element, attributes: {}, boundAttributes: {}};
          indent[elem.element] = line.indent;
          ancestors.push(elem);

          if(line.classes) elem.attributes["c"] = line.classes;
          if(line.name) elem.name = line.name;
          reified.elements[reified.elements.length] = elem;

        } else if(tokenIsBinding(line)) {
          if(!parentElem) throw ParseError("Bindings must follow an element.", line);
          let queryAST = query.parse(line.text);
          let queryIR = query.reify(queryAST);

          // @TODO: Update uiRenderer to utilize uiScopedBinding instead of key system
          // @TODO: Use prev.queries for mapping queryIRs
          // ... Profit!

          reified.boundQueries[queryIR.id] = queryIR;
          parentElem.boundView = queryIR.id;

          let debugText = [queryIR.id, ": {"];
          for(let alias in queryIR.aliases) {
            let variable = queryIR.variables[queryIR.aliases[alias]];
            debugText.push(alias + ": " + variable.selected);
          }
          debugText.push("}");
          console.log(debugText.join(" "));

          let joinedFields = {};
          let scopeJoined = false;
          for(let alias in queryIR.aliases) {
            let scopedField = getScopedBinding(alias, ancestors.slice(0, -1), reified.boundQueries);
            let selected = queryIR.variables[queryIR.aliases[alias]].selected;
            if(!scopedField) continue;
            if(!selected) throw ParseError(`Cannot join nested views on unselected alias '${alias}'`);
            joinedFields[selected] = scopedField;
            scopeJoined = true;
            console.log("?" + alias + " joined to ", scopedField);
          }
          if(scopeJoined) parentElem.bindings = joinedFields;

        } else if(tokenIsAttribute(line)) {
          if(!parentElem) throw ParseError("Attributes must follow an element.", line);

          if(line.static) {
            if(line.property === "parent") parentElem.parent = line.value.value;
            else parentElem.attributes[line.property] = line.value.value;
          } else {
            parentElem.boundAttributes[line.property] = getScopedBinding(line.value.alias, ancestors, reified.boundQueries);
            if(!parentElem.boundAttributes[line.property])
              throw ParseError(`Could not resolve alias '${line.value.alias}' for bound attribute '${line.property}'`);
          }
        }
      }
      return reified;
    },

    fromElement(rootId:string):UiIR {
      let root:ElementIR = Api.humanize("uiElement", Api.ixer.findOne("uiElement", {"uiElement: element": rootId}));
      if(!root) throw new Error(`Requested element '${rootId}' does not exist.`);
      let reified:UiIR = {elements: [], root, boundQueries: {}};

      let queries = [];
      let elems = [root];
      while(elems.length) {
        let elem = elems.shift();
        let elemId = elem.element;
        elem.attributes = {};
        elem.boundAttributes = {};
        elem.name = Api.get.name(elemId) || undefined;

        let boundView:string = (Api.ixer.findOne("uiElementBinding", {"uiElementBinding: element": elemId}) || {})["uiElementBinding: view"];
        if(boundView) queries.push(elem.boundView = boundView);

        let attrs = Api.ixer.find("uiAttribute", {"uiAttribute: element": elemId});
        for(let {"uiAttribute: property": prop, "uiAttribute: value": val} of attrs) elem.attributes[prop] = val;

        let boundAttrs = Api.ixer.find("uiAttributeBinding", {"uiAttributeBinding: element": elemId});
        for(let {"uiAttributeBinding: property": prop, "uiAttributeBinding: field": field} of boundAttrs) elem.boundAttributes[prop] = field;

        let children = Api.ixer.find("uiElement", {"uiElement: parent": elemId});
        for(let elem of Api.humanize("uiElement", children)) elems.push(elem);

        if(elem !== root) reified.elements.push(elem);
      }

      while(queries.length) throw ParseError("@TODO: Handle bound elements");

      return reified;
    },

    unreify(reified:UiIR): UiAST {
      let ast:QueryAST = {type: "ui", chunks: []};

      // Naive dependency resolution.
      let childMap:{[key:string]: string[]} = {[reified.root.element]: []};
      let elemMap:{[key:string]: ElementIR} = {[reified.root.element]: reified.root};
      for(let elem of reified.elements) {
        if(!childMap[elem.parent]) childMap[elem.parent] = [];
        childMap[elem.parent].push(elem.element);
        childMap[elem.element] = [];
        elemMap[elem.element] = elem;
      }
      let elems = unravel(reified.root.element, childMap);

      let elemIndent = {[reified.root.element]: -2};
      for(let elemId of elems) {
        let elem = elemMap[elemId];
        let indent = 0;
        if(elem.parent) indent = elemIndent[elem.element] = elemIndent[elem.parent] + 2;

        let elemAST:ElementAST = {type: "element", name: elem.name, tag: elem.tag, indent, lineIx: ast.chunks.length};
        if(elem !== reified.root) ast.chunks[ast.chunks.length] = elemAST;
        else {
          indent = -2;
          elemAST = undefined;
        }

        if(elem.boundView) throw ParseError("@TODO: Support bound elements");
        for(let property in elem.attributes) {
          if(property === "c" && elemAST) {
            elemAST.classes = elem.attributes[property];
            continue;
          }
          let value = {type: "field", value: elem.attributes[property]};
          let line:AttributeAST = {type: "attribute", property, value, static: true, indent: indent + 2, lineIx: ast.chunks.length};
          ast.chunks[ast.chunks.length] = line;
        }
        for(let property in elem.boundAttributes) {
          throw new Error("Value must be fieldAST by alias");
          let value = elem.boundAttributes[property];
          let line:AttributeAST = {type: "attribute", property, value, static: false, indent: indent + 2, lineIx: ast.chunks.length};
          ast.chunks[ast.chunks.length] = line;
        }
      }

      return ast;
    },

    unparse: (ast:UiAST) => tokenToString(ast)
  };
}