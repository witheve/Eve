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
var operators = /[~+\|:\[\{\>\$*#\?=\}\]\(\)]/;
var symbolChars = /[^=':\s\[\]\{\}\(\)\.\+\-\*\/,]/;
var numberChars = /[-\d\.]/;

function replaceAll(string, finds, replacements) {
  var final = string;
  for(var i = 0; i < finds.length; i++) {
   var pos = final.indexOf(finds[i]);
    while (pos > -1){
      final = final.replace(finds[i], replacements[i]);
      pos = final.indexOf(finds[i]);
    }
  }
  return final;
}

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
  } else if(char.match(/[-\d]/)){
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
    if(curKv.length == 0) {
      kvToken.subType = "attribute";
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
      var result = parser(tokens, childrenIx, state, element);
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
  } else if(token.type === "symbol" && token.name[0] === "@") {
    return token.name.substring(1);
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
      case "$":
        //rule
        tokens[0].subType = "ruleName";
        //name is all the rest of the tokens joined by space
        var parts = [];
        for(var i = 1; i < tokens.length; i++) {
          tokens[i].subType = "ruleName";
          var val;
          if(tokens[i].name !== undefined) {
            val = tokens[i].name
          } else if(tokens[i].value !== undefined) {
            val = tokens[i].value;
          } else {
            val = tokens[i].op;
          }
          parts.push(val);
        }
        var isCheck = tokens[0].op === "$";
        return {type: "rule", name: parts.join(" "), tokens: tokens, isCheck: isCheck};
        break;
      case "|":
        //source
        tokens[0].subType = "source";
        if(tokens.length == 1) return {type: "unknown", tokens:tokens};

        if(tokens[1].type !== "symbol") {
          return {error: {message: "Expected a table symbol", token: tokens[1]}, tokens: tokens};
        }
        tokens[1].subType = "table";
        var name = tokens[1].name;
        var negated = name.indexOf("!") === 0;
        if (negated) name = name.substr(1);
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

        return {type: "source", table: name, negated: negated, fields: fields, tokens: tokens};
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
          if(tokens[i].op === "[") {
            var curInterval = [];
            while(i < tokens.length && tokens[i].op !== "]") {
              i++;
              if(tokens[i] && tokens[i].value) {
                curInterval.push(tokens[i].value);
              }
            }
            if(curInterval.length > 2) {
              return {error: {message: "Intervals must only contain a start and an end.", token: tokens[i]}, tokens: tokens};
            } else if(curInterval.length < 2) {
              return {error: {message: "Intervals must contain both a start and an end.", token: tokens[i]}, tokens: tokens};
            }
            values.push(interval(Number(curInterval[0]), Number(curInterval[1])));
          } else {
            values.push(tokens[i].value);
          }
        }
        return {type: "insert", values: values, tokens: tokens};
        break;
      case ">":
        //aggregate
        tokens[0].subType = "aggregate";
        if(tokens.length == 1) return {type: "unknown", tokens:tokens};

        if(tokens[1].type !== "symbol") {
          return {error: {message: "Expected a table symbol", token: tokens[1]}, tokens: tokens};
        }
        tokens[1].subType = "table";
        var aggTable = tokens[1].name;
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

        var args = [];
        var aggregateArgs = [];
        var setRef = {type: "aggregate", table: aggTable, fields: fields, args: args, aggregateArgs: aggregateArgs, tokens: tokens, lineNumber: state.lineNumber};

        if(tokens[tokenIx] && tokens[tokenIx].op === "|") {

          if(tokens.length < tokenIx + 3) return {type: "unknown", tokens:tokens};

          if(tokens[tokenIx + 1].type !== "symbol") {
            return {error: {message: "Assignments must begin with a valid symbol.", token: tokens[tokenIx + 1], tokens: tokens}};
          }

          if(tokens[tokenIx + 2].type !== "operator" || tokens[tokenIx + 2].op !== "=") {
            return {error: {message: "Expected an =", token: tokens[tokenIx + 2], tokens: tokens}};
          }

          tokens[tokenIx + 1].subType = "variable";
          tokens[tokenIx + 2].subType = "assignment";
          var toReplace = [];
          var replacements = [];
          for(var i = tokenIx+3; i < tokens.length; i++) {
            if(tokens[i].type === "symbol" && tokens[i].name[0] === "@") {
              var symName = tokens[i].name.substring(1);
              tokens[i].subType = "arg";

              if(symName === aggTable && tokens[i+1] && tokens[i+1].name && tokens[i+1].name[0] === ".") {
                var realName = tokens[i+1].name.substring(1);
                tokens[i+1].subType = "arg";
                toReplace.push(tokens[i].name + "." + realName);
                replacements.push(tokens[i].name.substring(1) + "$" + realName);
                aggregateArgs.push(realName);
                i = i+1;
              } else {
                toReplace.push(tokens[i].name);
                replacements.push(symName);
                args.push(symName);
              }

            } else {
              tokens[i].subType = "function";
            }
          }
          var startPos = tokens[tokenIx + 2].pos;
          setRef.function = replaceAll(line.substring(startPos[1]), toReplace, replacements);
          setRef.symbol = tokens[tokenIx + 1].name;
        }

        return setRef;
        break;
      case "?":
        //filter
        tokens[0].subType = "filter";
        var parts = [];
        var args = [];
        var argsWithAts = [];
        for(var i = 1; i < tokens.length; i++) {
          if(tokens[i].type === "symbol" && tokens[i].name[0] === "@") {
            tokens[i].subType = "arg";
            argsWithAts.push(tokens[i].name);
            args.push(tokens[i].name.substring(1));
          } else {
            tokens[i].subType = "function";
          }
        }
        var func = replaceAll(line.substring(line.indexOf("?") + 1), argsWithAts, args);
        return {type: "filter", function: func, args: args, tokens: tokens};
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
    var args = [];
    var argsWithAts = [];
    for(var i = 2; i < tokens.length; i++) {
      if(tokens[i].type === "symbol" && tokens[i].name[0] === "@") {
        tokens[i].subType = "arg";
        argsWithAts.push(tokens[i].name);
        args.push(tokens[i].name.substring(1));
      } else {
        tokens[i].subType = "function";
      }
    }

    if(tokens.length === 3 && (tokens[2].type === "number" || tokens[2].type === "string")) {
      return {type: "constant", symbol: tokens[0].name, constant:tokens[2].value, tokens: tokens};
    }

    var startPos = tokens[1].pos;
    var func = replaceAll(line.substring(startPos[1]), argsWithAts, args);
    return {type: "function", symbol: tokens[0].name, function: func, args: args, tokens: tokens};
  }

  return {type: "unknown", tokens: tokens};

}

function parse(string) {
  var lines = string.split("\n");
  var state = {};
  var errors = [];
  var parsed = lines.map(function(line, ix) {
    if(line.match(/\S/)) {
      //console.log("line: ", line, ix);
      state.lineNumber = ix;
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
        curRule = {name: line.name,
                   isCheck: line.isCheck,
                   header: false,
                   ui: [],
                   values: [],
                   constants: {},
                   fields: {},
                   sources: [],
                   filters: [],
                   functions: [],
                   aggregates: []};
        rules.push(curRule);
        break;
      case "source":
        for(var fieldIx in line.fields) {
          var field = line.fields[fieldIx];
          if(field.alias !== undefined) {
            curRule.fields[field.alias] = field;
          } else if(field.constant !== undefined) {
            field.constantVar = "constant" + nextId++;
            curRule.constants[field.constantVar] = field;
            curRule.fields[field.name] = field;
          } else {
            curRule.fields[field.name] = field;
          }
        }
        curRule.sources.push(line);
        break;
      case "constant":
        line.constantVar = line.symbol;
        curRule.constants[line.constantVar] = line;
        break;
      case "function":
        curRule.fields[line.symbol] = line;
        curRule.functions.push(line);
        break;
      case "aggregate":
        curRule.fields[line.symbol] = line;
        for(var fieldIx in line.fields) {
          var field = line.fields[fieldIx];
          if(field.alias !== undefined) {
            curRule.fields[field.alias] = field;
          } else if(field.constant !== undefined) {
            field.constantVar = "constant" + nextId++;
            curRule.constants[field.constantVar] = field;
            curRule.fields[field.name] = field;
          } else {
            curRule.fields[field.name] = field;
          }
        }
        curRule.aggregates.push(line);
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

  return {rules: rules, errors: errors};
}

var uiTableToFields = {
  "uiElem": ["id", "type"],
  "uiText": ["id", "text"],
  "uiChild": ["parent", "pos", "child"],
  "uiAttr": ["id", "attr", "value"],
  "uiStyle": ["id", "attr", "value"],
  "uiEvent": ["id", "event", "label", "key"],
};

var uiEventNames = {
  "click": "click",
  "doubleClick": "dblclick",
  "mouseDown": "mousedown",
  "mouseUp": "mouseup",
  "contextMenu": "contextMenu",
  "change": "change",
  "blur": "blur",
  "focus": "focus",
  "keyDown": "keydown",
  "keyUp": "keyup",
  "input": "input",
  "drag": "drag",
  "drop": "drop",
  "dragStart": "dragstart",
  "dragEnd": "dragend",
  "dragOver": "dragover"
};

function createUIView(uiTable, view, context, mappings) {
  var facts = [];
  var tempMappings = {};
  var fields = {};
  var bindings = {};
  //make temp table
  var tempName = uiTable + view + "|ix=" + context.nextId++;
  var query = tempName + "|query";

  function toLocalFieldName(name) {
    return tempName + "|field=" + name;
  }

  function makeLocalField(name) {
    if(fields[name]) {
      return fields[name];
    }
    fields[name] = toLocalFieldName(name);
    return fields[name];
  }

  function makeRemoteField(remoteView, name) {
    return remoteView + "|field=" + name;
  }

  function localBinding(constraint, local, remote) {
    bindings[remote] = local;
    facts.push(["viewConstraintBinding", constraint, local, remote]);
    return true;
  }

  facts.push(["view", tempName]);
  facts.push(["generatedView", tempName]);
  if(context.programName) {
    facts.push(["programView", context.programName, tempName]);
    facts.push(["programQuery", context.programName, query]);
  }
  facts.push(["query", query, tempName, context.nextId]);
  var viewConstraint = query + "|viewConstraint=" + context.nextId;
  facts.push(["viewConstraint", viewConstraint, query, view, false]);
  for(var localField in mappings) {
    var value = mappings[localField];
    if(!value) throw new Error("Missing value for: " + localField);
    if(value.type === "symbol") {
      tempMappings[localField] = "bound_" + localField;
      var didBind = localBinding(viewConstraint, makeLocalField(tempMappings[localField]), makeRemoteField(view, value.name));
    } else if(value.type === "string" || value.type === "number" || value.type === "constant") {
      tempMappings[localField] = "constant_" + localField;
      facts.push(["constantConstraint", query, makeLocalField(tempMappings[localField]), value.value]);
    }
  }

  //functions have to be done afterward to make sure that items that have already been bound are reused
  for(var localField in mappings) {
    var value = mappings[localField];
    if(value.type === "function") {
      tempMappings[localField] = "func_" + localField;
      var funcConstraint = query + "|functionConstraint=" + tempMappings[localField];
      facts.push(["functionConstraint", funcConstraint, query, makeLocalField(tempMappings[localField]), value.function]);
      for (argIx in value.args) {
        var arg = value.args[argIx];
        var didBind = localBinding(viewConstraint, toLocalFieldName("bound_" + arg), makeRemoteField(view, arg));
        if(didBind) {
          //if we *did* end up binding, make sure that field is accounted for
          makeLocalField("bound_" + arg);
        }
        facts.push(["functionConstraintInput", funcConstraint, bindings[makeRemoteField(view, arg)], arg]);
      }
    }
  }

  var fieldIx = 0;
  for(var field in fields) {
    facts.push(["field", makeLocalField(field), tempName, fieldIx])
    fieldIx++;
  }

  //map temp table into the real table
  var realQuery = tempName + "|realQuery";
  facts.push(["query", realQuery, uiTable, context.nextId++]);
  if(context.programName) { facts.push(["programQuery", context.programName, realQuery]); }

  var constraint = realQuery + "|viewConstraint=" + context.nextId;
  facts.push(["viewConstraint", constraint, realQuery, tempName, false]);
  for(var i in uiTableToFields[uiTable]) {
    var field = uiTableToFields[uiTable][i];
    facts.push(["viewConstraintBinding", constraint, makeRemoteField(uiTable,field), makeRemoteField(tempName, tempMappings[field])]);
  }

  return facts;
}

function eveUIElem(view, ui, parentGeneratedId, context) {
  var facts = [];
  var attrs = {};
  if(ui.attrs) {
    for(var i = 0; i < ui.attrs.kvs.length; i++) {
      var curKv = ui.attrs.kvs[i];
      attrs[curKv[0].value] = curKv[1];
    }
  }

  var id;
  if(attrs["id"]) {
    id = attrs["id"];
  } else {
    id = parentGeneratedId;
  }

  var elemMappings = {id: id};
  if(ui.tag) {
    elemMappings["type"] = {type: "symbol", name: ui.tag};
  } else {
    elemMappings["type"] = {type: "constant", value: ui.tagConstant};
  }

  pushAll(facts, createUIView("uiElem", view, context, elemMappings));

  //handle attributes
  for(var key in attrs) {
    var attrMappings;
    if(key === "id" || key === "parent" || key === "key" || key === "ix") {
      //no-op
    //} else if(key === "style") {
      //TODO: make styles work

    } else if(uiEventNames[key]) {
      //event
      eventMappings = {id: id, event: {type: "constant", value: uiEventNames[key]}, label: attrs[key], key: attrs["key"] || {type: "constant", value: ""}};
      pushAll(facts, createUIView("uiEvent", view, context, eventMappings));
    } else {
      attrMappings = {id: id, attr: {type: "constant", value: key}, value: attrs[key]};
      pushAll(facts, createUIView("uiAttr", view, context, attrMappings));
    }
  }


  var generateChildId;
  if(id.type === "symbol") {
    generateChildId = function(ix) {
      return {type: "function", function: id.name + " + '_" + ix + "'", args: [id.name]};
    }
  } else if(id.type === "function") {
    generateChildId = function(ix) {
      return {type: "function", function: id.function + " + '_" + ix + "'", args: id.args};
    }
  } else {
    generateChildId = function(ix) {
      return {type: "constant", value: id.value + "_" + ix};
    }
  }

  //handle children
  for(var childIx = ui.children.length - 1; childIx >= 0; childIx--) {
    var child = ui.children[childIx];
    var pos;
    var childId;
    if(child.type === "vector") {
      //we need to do this again
      var child = eveUIElem(view, child, generateChildId(childIx), context);
      pushAll(facts, child.facts);
      childId = child.id;
      pos = child.pos || {type: "constant", value: childIx};
    } else {
      //otherwise we need to build a text element
      //make textId
      var textId = generateChildId(childIx);
      textMappings = {id: textId, text: child};
      pushAll(facts, createUIView("uiText", view, context, textMappings));
      childId = textId;
      pos = {type: "constant", value: childIx};
    }
    if(!child.parented) {
      childMappings = {parent: id, child: childId, pos: pos};
      pushAll(facts, createUIView("uiChild", view, context, childMappings));
    }
  }

  var parented = false;
  //if there's a parent attr on me, parent me
  if(attrs["parent"]) {
    parented = true;
    childMappings = {parent: attrs["parent"], child: id, pos: attrs["ix"] || {type: "constant", value: 0}};
    pushAll(facts, createUIView("uiChild", view, context, childMappings));
  } else if(parentGeneratedId.value && parentGeneratedId.value.match(/root[\d]+$/)) {
    parented = true;
    //This is a special case for not defining a parent on a root node
    childMappings = {parent: {type: "constant", value: "eve-root"}, child: id, pos: attrs["ix"] || {type: "constant", value: 0}};
    pushAll(facts, createUIView("uiChild", view, context, childMappings));
  }

  return {id: id, facts: facts, pos: attrs["ix"], parented: parented};
}

function injectParsed(parsed, program, prefix, programName) {
  var tablesCreated = {};
  var errors = parsed.errors || [];
  var context = {nextId: 0, programName: programName};
  var facts = [];
  var values = {};
  for(var ix = 0; ix < parsed.rules.length; ix++) {
    var curId = context.nextId;
    var curRule = parsed.rules[ix];

    var view = curRule.name;
    var query = view + "|query=" + curId;
    facts.push(["view", view]);

    if(programName) {
      facts.push(["programView", programName, view]);
      facts.push(["programQuery", programName, query]);
    }

    if (curRule.isCheck) facts.push(["isCheck", view]);

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
      facts.push(["viewConstraint", constraint, query, src.table, src.negated]);
      for(var fieldIx = src.fields.length - 1; fieldIx >= 0; fieldIx--) {
        var field = src.fields[fieldIx];
        if(field.alias !== undefined) {
          facts.push(["viewConstraintBinding", constraint, makeLocalField(field.alias), makeRemoteField(src.table, field.name)]);
        } else if(field.constant !== undefined) {
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
      for (var argIx = func.args.length - 1; argIx >= 0; argIx--) {
        var arg = func.args[argIx];
        facts.push(["functionConstraintInput", constraint, makeLocalField(arg), arg]);
      }
    }

    // handle aggregates
    for(var aggIx = curRule.aggregates.length - 1; aggIx >= 0; aggIx--) {
      var agg = curRule.aggregates[aggIx];
      var constraint = query + "|aggregateConstraint=" + aggIx;
      var wrappedFn = "function() { try { return " + agg.function + "; } catch(e) { if(typeof e !== 'string') { e.line = " + agg.lineNumber + "; } throw e; } }()";
      facts.push(["aggregateConstraint", constraint, query, makeLocalField(agg.symbol), agg.table, wrappedFn]);
      for (var fieldIx = agg.fields.length - 1; fieldIx >= 0; fieldIx--) {
        var field = agg.fields[fieldIx];
        if(field.alias !== undefined) {
          facts.push(["aggregateConstraintBinding", constraint, makeLocalField(field.alias), makeRemoteField(agg.table, field.name)]);
        } else if(field.constant !== undefined) {
          facts.push(["aggregateConstraintBinding", constraint, makeLocalField(field.constantVar), makeRemoteField(agg.table, field.name)]);
        } else {
          facts.push(["aggregateConstraintBinding", constraint, makeLocalField(field.name), makeRemoteField(agg.table, field.name)]);
        }
      }
      for (var argIx = agg.args.length - 1; argIx >= 0; argIx--) {
        var arg = agg.args[argIx];
        facts.push(["aggregateConstraintSolverInput", constraint, makeLocalField(arg), arg]);
      }
      for (var argIx = agg.aggregateArgs.length - 1; argIx >= 0; argIx--) {
        var arg = agg.aggregateArgs[argIx];
        facts.push(["aggregateConstraintAggregateInput", constraint, makeRemoteField(agg.table, arg), agg.table + "$" + arg]);
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
      facts.push(["functionConstraint", constraint, query, makeLocalField(symbol), filter.function]);
      for (var argIx = filter.args.length - 1; argIx >= 0; argIx--) {
        var arg = filter.args[argIx];
        facts.push(["functionConstraintInput", constraint, makeLocalField(arg), arg]);
      }
      facts.push(["constantConstraint", query, makeLocalField(symbol), true]);
    }

    // handle UI
    for(var uiIx = curRule.ui.length - 1; uiIx >= 0; uiIx--) {
      var curUi = curRule.ui[uiIx];
      var result = eveUIElem(view, curUi, {type: "constant", value: "eve-root" + ix}, context);
      pushAll(facts, result.facts);
      //parts.push(eveUIElem(curUi));
    }

     // handle fields
    if(curRule.header) {
      curRule.header.fields.forEach(function(cur) {
        makeLocalField(cur.name);
      });
    }

    if(!addedTables[curRule.name]) {
      var fieldToIx = {};
      var orderedFields = Object.keys(fields);
      orderedFields.sort();
      tablesCreated[curRule.name] = {fields: orderedFields, constants: curRule.constants};
      for(var fieldIx = orderedFields.length - 1; fieldIx >= 0; fieldIx--) {
        var field = orderedFields[fieldIx];
        var munged = makeLocalField(field);
        fieldToIx[field] = fieldIx;
        if(prefix) { facts.push(["displayName", munged, field]); }
        facts.push(["field", munged, view, fieldIx]);
      }
    }

    // handle header
    if(curRule.header) {
      facts.push(["isInput", curRule.name]);
      var tableFields = curRule.header.fields.map(function(cur) {
        return cur.name;
      });
      var orderedTableFields = tableFields.slice();
      orderedTableFields.sort();

      if(!values[curRule.name]) values[curRule.name] = [];

      // have to reorder insert facts to match the default field ordering
      for(var valueIx = curRule.values.length - 1; valueIx >= 0; valueIx--) {
        var insert = curRule.values[valueIx].values;
        var value = [];
        for (var insertIx = insert.length - 1; insertIx >= 0; insertIx--) {
          value[orderedTableFields.indexOf(tableFields[insertIx])] = insert[insertIx];
        }
        if(value.length === orderedTableFields.length) {
          values[curRule.name].push(value);
        } else {
          errors.push({message: "Inserted value must contain " + orderedTableFields.length + " fields. " + value.length + " currently provided.", line: curRule.values[valueIx].line});
        }
      }

    } else {
      facts.push(["query", query, view, curId]);
    }
    context.nextId++;
  }
//   console.log("Compiling " + JSON.stringify(facts));

  var final = facts;
  if(prefix) {
    final = final.map(function(cur) {
      cur[0] = prefix + cur[0];
      return cur;
    });
  }
  program.update(final, []);
  return {values: values, errors: errors, tablesCreated: tablesCreated};
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
    lastParse: {},
    token: function(stream, state) {
      if(stream.eatWhile(whiteSpace)) return null;

      stream.next();
      var start = stream.pos;

      if(this.lastParse.string !== stream.string) {
        var line = parseLine(stream.string, state);
        this.lastParse.string = stream.string;
        this.lastParse.parse = line;
        this.lastParse.stack = state.stack.slice();
      } else {
        line = this.lastParse.parse;
        state.stack = this.lastParse.stack.slice();
      }

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
      return {stack: []};
    }
  }
}
