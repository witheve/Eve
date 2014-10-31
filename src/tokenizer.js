//cool
//From CodeMirror
var StringStream = function(string, tabSize) {
  this.pos = this.start = 0;
  this.string = string;
  this.tabSize = tabSize || 8;
  this.lastColumnPos = this.lastColumnValue = 0;
  this.lineStart = 0;
};

StringStream.prototype = {
  eol: function() {return this.pos >= this.string.length;},
  sol: function() {return this.pos == this.lineStart;},
  peek: function() {return this.string.charAt(this.pos) || undefined;},
  next: function() {
    if (this.pos < this.string.length)
      return this.string.charAt(this.pos++);
  },
  eat: function(match) {
    var ch = this.string.charAt(this.pos);
    if (typeof match == "string") var ok = ch == match;
    else var ok = ch && (match.test ? match.test(ch) : match(ch));
    if (ok) {++this.pos; return ch;}
  },
  eatWhile: function(match) {
    var start = this.pos;
    while (this.eat(match)){}
    return this.pos > start;
  },
  eatSpace: function() {
    var start = this.pos;
    while (/[\s\u00a0]/.test(this.string.charAt(this.pos))) ++this.pos;
    return this.pos > start;
  },
  skipToEnd: function() {this.pos = this.string.length;},
  skipTo: function(ch) {
    var found = this.string.indexOf(ch, this.pos);
    if (found > -1) {this.pos = found; return true;}
  },
  backUp: function(n) {this.pos -= n;},
  column: function() {
    if (this.lastColumnPos < this.start) {
      this.lastColumnValue = countColumn(this.string, this.start, this.tabSize, this.lastColumnPos, this.lastColumnValue);
      this.lastColumnPos = this.start;
    }
    return this.lastColumnValue - (this.lineStart ? countColumn(this.string, this.lineStart, this.tabSize) : 0);
  },
  indentation: function() {
    return countColumn(this.string, null, this.tabSize) -
      (this.lineStart ? countColumn(this.string, this.lineStart, this.tabSize) : 0);
  },
  match: function(pattern, consume, caseInsensitive) {
    if (typeof pattern == "string") {
      var cased = function(str) {return caseInsensitive ? str.toLowerCase() : str;};
      var substr = this.string.substr(this.pos, pattern.length);
      if (cased(substr) == cased(pattern)) {
        if (consume !== false) this.pos += pattern.length;
        return true;
      }
    } else {
      var match = this.string.slice(this.pos).match(pattern);
      if (match && match.index > 0) return null;
      if (match && consume !== false) this.pos += match[0].length;
      return match;
    }
  },
  current: function(){return this.string.slice(this.start, this.pos);},
  hideFirstChars: function(n, inner) {
    this.lineStart += n;
    try { return inner(); }
    finally { this.lineStart -= n; }
  },
  commit: function() {
    this.start = this.pos;
  }
};

var whiteSpace = /[\s]/;
var operators = /[~+\|:\[\{\>\*#\?@=\}\]]/;
var symbolChars = /[^=':\s\[\]\{\}]/;
var numberChars = /[\d\.]/;

// operator symbol 'symbol' "string" number

function nextToken(stream, tokens) {
  stream.eatWhile(whiteSpace);
  if(stream.eol()) return tokens;
  stream.commit();
  var char = stream.next();
  if(char.match(operators)) {
    //operator
    tokens.push({type: "operator", op: char, pos: [stream.start, stream.pos]});
  } else if(char === ";") {
    //comment
    stream.skipToEnd();
    tokens.push({type: "comment", value: stream.current().substring(1), pos: [stream.start, stream.pos]});
  } else if (char === "'") {
    //symbol
    stream.eatWhile(/[^']/);
    var current = stream.current();
    var name = current.substring(1);
    stream.next();
    tokens.push({type: "symbol", quoted: true, name: name, pos: [stream.start, stream.pos]});
  } else if (char === '"') {
    //string
    stream.eatWhile(/[^"]/);
    var current = stream.current();
    var value = current.substring(1);
    stream.next();
    tokens.push({type: "string", value: value, pos: [stream.start, stream.pos]});
  } else if(char.match(numberChars)){
    //number
    stream.eatWhile(numberChars);
    var current = stream.current();
    var value = current.indexOf(".") > -1 ? parseFloat(current) : parseInt(current);
    tokens.push({type: "number", value: value, pos: [stream.start, stream.pos]});
  } else {
    //symbol
    stream.eatWhile(symbolChars);
    var current = stream.current();
    tokens.push({type: "symbol", name: current, pos: [stream.start, stream.pos]});
  }
  return tokens;
}

function tokenizeLine(line) {
  var tokens = [];
  var stream = new StringStream(line);
  while(!stream.eol()) {
    nextToken(stream, tokens);
  }
  return tokens;
}

function tokensToSymbol(tokens, ix) {
  if(tokens[ix].type !== "symbol") {
    return {error: {message: "Expected symbol, but got: " + tokens[ix].type, token: tokens[ix]}, ix: ix};
  }
  var curToken = tokens[ix];
  var name = curToken.name;
  var nextToken = tokens[ix+1];
  if(nextToken && nextToken.type === "operator") {
    if(nextToken.op === ":") {
      //alias
      nextToken.subType = "alias";
      var aliasToken = tokens[ix+2];
      if(!aliasToken || aliasToken.type !== "symbol") {
        return {error: {message: "Invalid alias for " + name, token: aliasToken}, ix: ix};
      }
      curToken.subType = "aliased";
      aliasToken.subType = "alias";
      return {ix: ix + 2, symbol: {type: "symbol", name: name, alias: aliasToken.name}}
    } else if(nextToken.op === "=") {
      //constant
      nextToken.subType = "constant";
      var constantToken = tokens[ix+2];
      if(!constantToken || (constantToken.type !== "string" && constantToken.type !== "number")) {
        return {error: {message: "Invalid constant for " + name + ". Must be a valid string or number.", token: constantToken}, ix: ix};
      }
      curToken.subType = "assigned";
      return {ix: ix + 2, symbol: {type: "symbol", name: name, constant: constantToken.value}}
    }
  }

  return {ix: ix, symbol: {type: "symbol", name: name}};
}

function parseUIAttrs(tokens, ix, state, prevAttrs) {
  var curToken = tokens[ix];
  var curIx = ix;
  var attrs;
  if(prevAttrs) {
    attrs = prevAttrs;
  } else if(curToken.type === "operator" && curToken.op === "{") {
    attrs = {kvs: [], type: "map"};
    state.stack.push(attrs);
    curIx++;
  } else {
    return {error: {message: "Invalid map", token: curToken}};
  }

  var kvs = attrs.kvs;
  var curKv = [];

  //We may be finishing a pair from the last line
  if(kvs.length) {
    curKv = kvs[kvs.length - 1];
  } else {
    kvs.push(curKv);
  }

  while(curIx < tokens.length && tokens[curIx].op !== "}") {
    if(curKv.length == 2) {
      curKv = [];
      kvs.push(curKv);
    }
    var kvToken = tokens[curIx];
    if(kvToken.type !== "string" && kvToken.type !== "number" && kvToken.type !== "symbol") {
      return {error: {message: "Invalid attr token: " + kvToken.type + ". Expected string, number, or symbol.", token: kvToken}};
    }
    if(curKv.length == 0 && kvToken.type === "symbol") {
      return {error: {message: "Invalid attr key: " + kvToken.type + ". Expected string or number.", token: kvToken}};
    }
    curKv.push(tokens[curIx]);
    curIx++;
  }

  if(tokens[curIx] && tokens[curIx].op === "}") {
    state.stack.pop();
    curIx++;
  }

  return {ix: curIx, attrs: attrs};
}

function parseUIVector(tokens, ix, state, prevElement) {
  var curToken = tokens[ix];
  var childrenIx = ix;
  var element;
  if(prevElement) {
    element = prevElement;
  } else if(curToken.type === "operator" && curToken.op === "[") {
    element = {children: [], type: "vector"};
    state.stack.push(element);
    childrenIx++;
  } else {
    return {error: {message: "Invalid vector", token: curToken}};
  }

  //if we haven't already set a tag
  if(!element.tag && !element.tagConstant && childrenIx < tokens.length) {
    var tagIx = childrenIx;
    var tagToken = tokens[tagIx];
    childrenIx++;
    if(tagToken.type === "symbol") {
      element.tag = tagToken.name;
    } else if(tagToken.type === "string") {
      element.tagConstant = tagToken.value;
    } else {
      return {error: {message: "Invalid UI tag: " + tagToken.type + ". Expected string or symbol.", token: tagToken}};
    }
  }

  //if we haven't handled attrs yet
  if(element.attrs === undefined && childrenIx < tokens.length) {
    // there is an optional map of attributes
    var maybeMapIx = childrenIx;
    var maybeMapToken = tokens[maybeMapIx];

    if(maybeMapToken.type === "operator" && maybeMapToken.op === "{") {
      var attrsResult = parseUIAttrs(tokens, ix+2, state);
      if(attrsResult.error) return attrsResult;
      //the other children start after this map then
      childrenIx = attrsResult.ix;
      element.attrs = attrsResult.attrs;
    } else {
      //Set to false to indicate we handled this, but there's still no attrs
      element.attrs = false;
    }

  }

  // children can be either vectors, symbols, or constants
  while(childrenIx < tokens.length && tokens[childrenIx].op !== "]") {
    var curChild = tokens[childrenIx];
    if(curChild.type === "operator" && curChild.op === "[") {
      var childResult = parseUIVector(tokens, childrenIx, state);
      if(childResult.error) return childResult;

      //the other children start after this vector's index
      childrenIx = childResult.ix;
      element.children.push(childResult.element);

    } else if (curChild.type === "symbol" || curChild.type === "string" || curChild.type === "number") {
      element.children.push(curChild);
      childrenIx++;
    } else {
      return {error: {message: "Invalid UI child: " + curChild.type + ". Expected vector, symbol, or constant.", token: curChild}};
    }
  }

  if(tokens[childrenIx] && tokens[childrenIx].op === "]") {
    state.stack.pop();
    childrenIx++;
  }

  return {ix: childrenIx, element: element};
}

function parseUI(tokens, ix, state) {
  var curToken = tokens[ix];
  var childrenIx = ix;
  var element;

  if(state.stack.length) {
    while(state.stack.length && childrenIx < tokens.length) {
      element = state.stack[state.stack.length - 1];
      var parser = element.type === "map" ? parseUIAttrs : parseUIVector;
      var result = parser(tokens, ix, state, element);
      if(result.error) return result;
      childrenIx = result.ix;
    }
    return {element: element};

  } else if(curToken.type === "operator" && curToken.op === "[") {
    return parseUIVector(tokens, ix, state);

  } else if(curToken.type === "operator" && curToken.op === "{") {
    return parseUIAttrs(tokens, ix, state);

  } else {
    return {error: {message: "Continuing to parse UI, but there's nothing on the stack", token: curToken}};
  }
}

function tokenToJSONValue(token) {
  if(token.type === "string") {
    return JSON.stringify(token.value);
  }
  return token.name || token.value || token.op
}

function parseLine(line, state) {
  var tokens = tokenizeLine(line);
  if(!tokens.length) return null;

  if(state.stack && state.stack.length) {
    //we're in the middle of a UI structure, keep going
    var ui = parseUI(tokens, 0, state);
    //if nothing is on the stack, we're done parsing the ui
    if(!state.stack.length) {
      return {type: "ui", element: ui.element, tokens: tokens}
    }
    return {type: "ui", tokens: tokens};

  } else if(tokens[0].type === "operator") {
    //new standard line
    switch(tokens[0].op) {
      case "*":
        //rule
        tokens[0].subType = "ruleName";
        //name is all the rest of the tokens joined by space
        var parts = [];
        for(var i = 1; i < tokens.length; i++) {
          tokens[i].subType = "ruleName";
          parts.push(tokens[i].name || tokens[i].value || tokens[i].op);
        }
        return {type: "rule", name: parts.join(" "), tokens: tokens};
        break;
      case "|":
        //source
        tokens[0].subType = "source";
        if(tokens.length == 1) return {type: "unknown", tokens:tokens};

        if(!tokens[1].type === "symbol") {
          return {error: {message: "Expected a table symbol", token: tokens[1]}, tokens: tokens};
        }
        tokens[1].subType = "table";
        var fields = [];
        var tokenIx = 2;
        while(tokenIx < tokens.length) {
          //we only allow symbols as fields
          var field = tokensToSymbol(tokens, tokenIx);
          if(field.error) {
            field.tokens = tokens;
            return field;
          }
          if(tokens[tokenIx].subType) {
            tokens[tokenIx].subType = "field-" + tokens[tokenIx].subType;
          } else {
            tokens[tokenIx].subType = "field";
          }
          fields.push(field.symbol);
          tokenIx = field.ix;
          tokenIx++;
        }

        return {type: "source", table: tokens[1].name, fields: fields, tokens: tokens};
        break;
      case "~":
        //header
        tokens[0].subType = "header";
        var fields = [];
        var tokenIx = 1;
        while(tokenIx < tokens.length) {
          //we only allow symbols as fields
          var field = tokensToSymbol(tokens, tokenIx);
          if(field.error) {
            field.tokens = tokens;
            return field;
          }
          if(tokens[tokenIx].subType) {
            tokens[tokenIx].subType = "field-" + tokens[tokenIx].subType;
          } else {
            tokens[tokenIx].subType = "field";
          }
          fields.push(field.symbol);
          tokenIx = field.ix;
          tokenIx++;
        }
        return {type: "header", fields: fields, tokens: tokens};
        break;
      case "+":
        //insert
        tokens[0].subType = "insert";
        var values = [];
        for(var i = 1; i < tokens.length; i++) {
          values.push(tokens[i].value);
        }
        return {type: "insert", values: values, tokens: tokens};
        break;
      case "#":
      case "@":
        //setReference
        var type = tokens[0].op === "#" ? "setExplode" : "setReference";
        tokens[0].subType = type;
        if(tokens.length == 1) return {type: "unknown", tokens:tokens};

        if(!tokens[1].type === "symbol") {
          return {error: {message: "Expected a table symbol", token: tokens[1]}, tokens: tokens};
        }
        tokens[1].subType = "table";
        var fields = [];
        var tokenIx = 2;
        while(tokenIx < tokens.length && tokens[tokenIx].op !== "|") {
          //we only allow symbols as fields
          var field = tokensToSymbol(tokens, tokenIx);
          if(field.error) {
            field.tokens = tokens;
            return field;
          }
          if(tokens[tokenIx].subType) {
            tokens[tokenIx].subType = "field-" + tokens[tokenIx].subType;
          } else {
            tokens[tokenIx].subType = "field";
          }
          fields.push(field.symbol);
          tokenIx = field.ix;
          tokenIx++;
        }

        var setRef = {type: type, table: tokens[1].name, fields: fields, tokens: tokens}

        // parse the parameters if they exist e.g.
        // @ foo i x | sort: x ix: z limit: 3
        var paramNames = {"limit": true, "sort": true, "ix": true};
        if(tokens[tokenIx]) {
          tokenIx++;
          //now check which parameter this is for
          while(tokenIx < tokens.length) {
            var param = tokens[tokenIx];
            if(param.name === "ix") {
              //ix is a symbol, skip the :
              param.subType = "param";
              var symbol = tokens[tokenIx + 2];
              if(!symbol || symbol.type !== "symbol" || paramNames[symbol.name]) {
                return {error: {message: "Invalid ix. Expected symbol.", token: tokens[tokenIx + 2]}, tokens: tokens};
              }
              symbol.subType = "field";
              setRef.ix = symbol.name;
              tokenIx = tokenIx + 3;
            } else if(param.name === "limit") {
              //limit is either a number or symbol, skip the :
              param.subType = "param";
              var lim = tokens[tokenIx + 2];
              if(!lim || (lim.type !== "symbol" && lim.type !== "number") || paramNames[lim.name]) {
                return {error: {message: "Invalid limit. Expected symbol or number.", token: tokens[tokenIx + 2]}, tokens: tokens};
              }
              setRef.limit = lim.name || lim.value;
              tokenIx = tokenIx + 3;
            } else if(param.name === "sort") {
              //sort is a set of either a symbol, a symbol + ASC/DESC
              param.subType = "param";
              tokenIx = tokenIx + 2;
              var sorts = [];
              while(tokenIx < tokens.length) {
                var sortToken = tokens[tokenIx];
                if(!sortToken || sortToken.type !== "symbol") {
                  return {error: {message: "Invalid limit. Expected symbol.", token: sortToken, tokens: tokens}};
                }
                if(paramNames[sortToken.name] && sorts.length) {
                  break;
                } else if(paramNames[sortToken.name]) {
                  return {error: {message: "Invalid sort. Expected a field to sort on.", token: sortToken}, tokens: tokens};
                }
                sortToken.subType = "field";
                var sort = [sortToken.name];
                if(tokens[tokenIx + 1] && tokens[tokenIx + 1].op === "=") {
                  if(tokens[tokenIx+2].name === "ASC" || tokens[tokenIx+2].name === "DESC") {
                    tokenIx = tokenIx + 2;
                    tokens[tokenIx].subType = "sortOrder";
                    sort.push(tokens[tokenIx].name);
                  } else {
                    return {error: {message: "Invalid sort order. Must be ASC or DESC.", token: tokens[tokenIx+2]}, tokens: tokens};
                  }
                }
                sorts.push(sort);
                tokenIx++;
              }
              setRef.sort = sorts;
            } else {
              tokenIx++;
            }
          }

        }

        return setRef;
        break;
      case "?":
        //filter
        tokens[0].subType = "filter";
        var parts = [];
        for(var i = 1; i < tokens.length; i++) {
          tokens[i].subType = "function";
          parts.push(tokenToJSONValue(tokens[i]));
        }
        return {type: "filter", function: parts.join(" "), tokens: tokens};
        break;
      case ">":
        //reduce
        tokens[0].subType = "reduce";
        if(tokens.length < 3) return {type: "unknown", tokens:tokens};
        if(tokens[1].type !== "symbol") {
          return {error: {message: "Assignments must begin with a valid symbol.", token: tokens[1], tokens: tokens}};
        }

        if(tokens[2].type !== "operator" || tokens[2].op !== "=") {
          return {error: {message: "Expected an =", token: tokens[2], tokens: tokens}};
        }

        tokens[1].subType = "variable";
        tokens[2].subType = "assignment";
        var parts = [];
        for(var i = 3; i < tokens.length; i++) {
          tokens[i].subType = "function";
          parts.push(tokenToJSONValue(tokens[i]));
        }
        return {type: "reduce", symbol: tokens[1].name, function: parts.join(" "), tokens: tokens};
        break;

      case "[":
        //ui
        if(!state.stack) state.stack = [];
        var ui = parseUI(tokens, 0, state);
        //if nothing is on the stack, we're done parsing the ui
        if(!state.stack.length) {
          return {type: "ui", element: ui.element, tokens: tokens}
        }
        return {type: "ui", tokens: tokens};
        break;
    }
  } else if(tokens[0].type === "comment") {
    tokens[0].tokens = tokens;
    return tokens[0];
  } else {
    //this is an assignment
    if(tokens[0].type !== "symbol") {
      return {error: {message: "Assignments must begin with a valid symbol.", token: tokens[0], tokens: tokens}};
    }

    if(tokens.length < 2) return {type: "unknown", tokens:tokens};

    if(tokens[1].type !== "operator" || tokens[1].op !== "=") {
      return {error: {message: "Expected an =", token: tokens[1]}, tokens: tokens};
    }

    tokens[0].subType = "variable";
    tokens[1].subType = "assignment";
    var parts = [];
    for(var i = 2; i < tokens.length; i++) {
      tokens[i].subType = "function";
      parts.push(tokenToJSONValue(tokens[i]));
    }
    return {type: "function", symbol: tokens[0].name, function: parts.join(" "), tokens: tokens};
  }

  return {type: "unknown", tokens: tokens};

}

function finalizeRule(rule) {
  //set args for functions
  for(var i in rule.functions) {
    var func = rule.functions[i];
    var args = [];
    for(var field in rule.fields) {
      if(func.function.indexOf(field) > -1) {
        args.push(field);
      }
    }
    func.args = args;
  }

  //set args for reduces
  for(var i in rule.reduces) {
    var reduce = rule.reduces[i];
    var args = [];
    for(var field in rule.fields) {
      if(reduce.function.indexOf(field) > -1) {
        args.push(field);
      }
    }
    reduce.args = args;
  }

  //set args for filters
  for(var i in rule.filters) {
    var filter = rule.filters[i];
    var args = [];
    for(var field in rule.fields) {
      if(filter.function.indexOf(field) > -1) {
        args.push(field);
      }
    }
    filter.args = args;
  }
}

function parse(string) {
  var lines = string.split("\n");
  var state = {};
  var errors = [];
  var parsed = lines.map(function(line, ix) {
    if(line.match(/\S/)) {
      //console.log("line: ", line, ix);
      var parsed = parseLine(line, state)
      if(parsed) {
        parsed.line = ix;
        if(parsed.error) {
          parsed.error.line = ix;
          errors.push(parsed.error);
          return null;
        }
      }
      return parsed;
    }
    return null;
  }).filter(function(cur) { return cur; });

  var rules = [];
  var nextId = 0;
  var curRule;
  for(var i in parsed) {
    var line = parsed[i];
    switch(line.type) {
      case "rule":
        if(curRule) {
          finalizeRule(curRule);
        }
        curRule = {name: line.name,
                   header: false,
                   ui: [],
                   values: [],
                   constants: {},
                   fields: {},
                   sources: [],
                   filters: [],
                   functions: [],
                   reduces: []};
        rules.push(curRule);
        break;
      case "source":
        for(var i in line.fields) {
          var field = line.fields[i];
          if(field.alias) {
            curRule.fields[field.alias] = field;
          } else if(field.constant) {
            field.constantVar = "constant" + nextId++;
            curRule.constants[field.constantVar] = field;
          } else {
            curRule.fields[field.name] = field;
          }
        }
        curRule.sources.push(line);
        break;
      case "function":
        curRule.fields[line.symbol] = line;
        curRule.functions.push(line);
        break;
      case "reduce":
        curRule.fields[line.symbol] = line;
        curRule.reduces.push(line);
        break;
      case "filter":
        curRule.filters.push(line);
        break;
      case "header":
        curRule.header = line;
        break;
      case "insert":
        curRule.values.push(line);
        break;
      case "ui":
        if(line.element) {
          curRule.ui.push(line.element);
        }
        break;
      default:
        break;
    }
  }
  finalizeRule(curRule);

  return {rules: rules, errors: errors};
}

function eveUIElem(ui) {
  //["uiElem", "uiText", "uiAttr", "uiStyle", "uiEvent", "uiChild"]
  //look for an id attr to determine the id of this thing
  //create the element
  //create attrs entries based on the attrs
    //if attr is style
      //create style entries based on the style map
    //if attr is id
    //if attr is parent
  //for each child
    //if it's text or a symbol
      //create a uiText
    //Otherwise it's a child element run uiElem on it and get the child's id
    //create a uiChild for it
  var parts = [];
  if(ui.tag) {
    parts.push(inject(ui.tag));
  } else {
    parts.push(ui.tagConstant);
  }

  //handle attributes
  if(!ui.attrs) {
    parts.push({});
  } else {
    //break the KVs down
    var attrs = {};
    for(var ix in ui.attrs.kvs) {
      var curKv = ui.attrs.kvs[ix];
      if(curKv[1].type === "symbol") {
        var value = inject(curKv[1].name);
      } else {
        var value = curKv[1].value;
      }

      //TODO: THIS IS A HACK
      if(curKv[0].value === "parent") {
        value = [value];
      }

      attrs[curKv[0].value] = value;
    }
    parts.push(attrs);
  }

  //handle children
  for(var childIx in ui.children) {
    var child = ui.children[childIx];
    if(child.type === "vector") {
      parts.push(eveUIElem(child));
    } else if(child.type === "symbol") {
      parts.push(inject(child.name));
    } else {
      parts.push(child.value);
    }
  }
  return elem.apply(null, parts);
}

function parsedToEveProgram(parsed) {
  var tablesCreated = {};
  var errors = parsed.errors || [];
  var facts = [];
  var values = [];
  for(var ix in parsed.rules) {
    var curRule = parsed.rules[ix];

    var view = curRule.name;
    var query = view + "|query=" + ix;
    facts.push(["view", view]);

    // fields need to be globally unique and we don't use uuids yet, so prepend the view name
    var fields = {};
    function makeLocalField(name) {
      fields[name] = true;
      return view + "|field=" + name;
    }
    function makeRemoteField(remoteView, name) {
      return remoteView + "|field=" + name;
    }

    // handle sources
    for(var sourceIx = curRule.sources.length - 1; sourceIx >= 0; sourceIx--) {
      var src = curRule.sources[sourceIx];
      var constraint = query + "|viewConstraint=" + sourceIx;
      facts.push(["viewConstraint", constraint, query, src.table, false]);
      for(var fieldIx in src.fields) {
        var field = src.fields[fieldIx];
        if(field.alias) {
          facts.push(["viewConstraintBinding", constraint, makeLocalField(field.alias), makeRemoteField(src.table, field.name)]);
        } else if(field.constant) {
          facts.push(["viewConstraintBinding", constraint, makeLocalField(field.constantVar), makeRemoteField(src.table, field.name)]);
        } else {
          facts.push(["viewConstraintBinding", constraint, makeLocalField(field.name), makeRemoteField(src.table, field.name)]);
        }
      }
    }

    // handle functions
    for(var funcIx = curRule.functions.length - 1; funcIx >= 0; funcIx--) {
      var func = curRule.functions[funcIx];
      var constraint = query + "|functionConstraint=" + funcIx;
      facts.push(["functionConstraint", constraint, query, makeLocalField(func.symbol), func.function]);
      for (argIx in func.args) {
        var arg = func.args[argIx];
        facts.push(["functionConstraintBinding", constraint, makeLocalField(arg), arg]);
      }
    }

    // handle constants
    for(var cons in curRule.constants) {
      var field = curRule.constants[cons];
      facts.push(["constantConstraint", query, makeLocalField(cons), field.constant]);
    }

    // handle filters
    for(var filterIx = curRule.filters.length - 1; filterIx >= 0; filterIx--) {
      var filter = curRule.filters[filterIx];
      var symbol = "filterField" + filterIx;
      var constraint = query + "|filterConstraint=" + filterIx;
      facts.push("functionConstraint", constraint, query, makeLocalField(symbol), filter.function);
      for (argIx in filter.args) {
        var arg = filter.args[argIx];
        facts.push(["functionConstraintBinding", constraint, makeLocalField(arg), arg]);
      }
      facts.push(["constantConstraint", query, makeLocalField(symbol), true]);
    }

    // handle UI
    for(var uiIx = curRule.ui.length - 1; uiIx >= 0; uiIx--) {
      var curUi = curRule.ui[uiIx];
      //parts.push(eveUIElem(curUi));
    }

     // handle fields
    if(curRule.header) {
      curRule.header.fields.forEach(function(cur) {
        makeLocalField(cur.name);
      });
    }
    var fieldToIx = {};
    var orderedFields = Object.keys(fields);
    orderedFields.sort();
    tablesCreated[curRule.name] = {fields: orderedFields, constants: curRule.constants};
    for(var fieldIx = orderedFields.length - 1; fieldIx >= 0; fieldIx--) {
      var field = orderedFields[fieldIx];
      fieldToIx[field] = fieldIx;
      facts.push(["field", makeLocalField(field), view, fieldIx]);
    }

    // handle header
    if(curRule.header) {
      var tableFields = curRule.header.fields.map(function(cur) {
        return cur.name;
      });
      var orderedTableFields = tableFields.slice();
      orderedTableFields.sort();

      // have to reorder insert facts to match the default field ordering
      for(var valueIx = curRule.values.length - 1; valueIx >= 0; valueIx--) {
        var insert = curRule.values[valueIx].values;
        var value = [curRule.name];
        for (var insertIx in insert) {
          value[1 + orderedTableFields.indexOf(tableFields[insertIx])] = insert[insertIx];
        }
        values.push(value);
      }
    } else {
      facts.push(["query", query, view, ix]);
    }
  }
  console.log("Compiling " + JSON.stringify(facts));
  return {program: System.empty({name: "editor program"}).update(facts.concat(commonViews()), []).recompile(), values: values, errors: errors, tablesCreated: tablesCreated};
}

function tokenToCMType(token) {
  var final = token.type;
  if(token.subType) {
    final = final + " " + token.type + "-" + token.subType + " " + token.subType;
  }
  return final;
}

function CodeMirrorModeParser() {
  return {
    token: function(stream, state) {
      if(stream.eatWhile(whiteSpace)) return null;

      stream.next();

      var start = stream.pos;
      var line = parseLine(stream.string, state);

      if(line.tokens) {

        for(var i = 0; i < line.tokens.length; i++) {
          var token = line.tokens[i];
          if(token.pos[0] <= start && token.pos[1] >= start) {
            stream.start = token.pos[0];
            stream.pos = token.pos[1];
            return tokenToCMType(token);
          }
        }

        return null;
      }
      return null;
    },
    startState: function() {
      return {};
    }
  }
}

// if(window.CodeMirror) {
//   CodeMirror.defineMode("eve", CodeMirrorModeParser);
//   CodeMirror.defineMIME("text/x-eve", "eve");
// }


// var thing = CodeMirrorModeParser();
// var tokenizer = thing.token;

// function tick(tokenizer, stream) {
//   var final = {style: tokenizer(stream, {}),
//                pos: [stream.start, stream.pos]};
//   stream.start = stream.pos;
//   return final;
// }

// var stream = new StringStream("[div {class 'foo' \"zomg\" 234} 'cool']");

// parseLine(stream, {});
// tick(tokenizer, stream);

//  console.log(parse("* a\n[\"div\" {class foo}\n[\"p\" \"cool\"]]").rules[0].ui)
// console.log(parse("* awesome rule\n|'program Rule' program : p name=\"awesome\"\n@ programRule program rule | ordinal:ix sort:rule"));
// console.log(parse("* another rule\n|"));

// parse("* this is a rule\n| this:alias is a source\n? cool > huh")
