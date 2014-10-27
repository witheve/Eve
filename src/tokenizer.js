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

var symbolChars = /[^\s\=\:|,]/;
var whiteSpace = /[\s,]/;

function parseConstant(stream, context) {
  //"" or 2394
  stream.eatWhile(whiteSpace);
  stream.commit();
  var constant = {tokens: []};
  var tokens = constant.tokens;
  var next = stream.next();
  if(next === '"') {
    //TODO: escaped strings
    stream.eatWhile(/[^"]/);
    stream.next();
    tokens.push({token: "constant", type: "string", pos: [stream.start, stream.pos]});
    var value = stream.current();
    constant.value = value.substring(1, value.length-1);
  } else if(next && next.match(/\d/)) {
    stream.eatWhile(/[\d\.]/);
    tokens.push({token: "constant", type: "number", pos: [stream.start, stream.pos]});
    var value = stream.current();
    constant.value = value.match(/[\.]/) ? parseFloat(value) : parseInt(value);
    stream.next();
  } else {
    context.errors.push({message: "Invalid constant", pos: [stream.start, stream.pos]});
    stream.next();
  }
  return constant;
}

function parseSymbol(stream, type, allowAlias, context) {
  //'foo bar'
  //'foo bar':woohoo
  //'foo bar' = "zomg"
  //blah
  //blah:cool
  //blah : cool
  //blah = "zomg"
  var symbol = {tokens: []};
  var tokens = symbol.tokens;
  //console.log("pos at parse", stream.start, stream.pos);
  stream.eatWhile(whiteSpace);
  stream.commit();
  var next = stream.next();

  //We keep a reference because we may need to prepend aliased or assigned to the type
  var nameToken = {token: "symbol", type: type};

  //console.log("parseSymbol", next);
  if(next === "'") {
    stream.eatWhile(/[^']/);
    stream.next();
    nameToken.pos = [stream.start, stream.pos];
    tokens.push(nameToken);
    var name = stream.current();
    symbol.name = name.substring(1, name.length - 1);
  } else if(next) {
    if(!next.match(symbolChars)) {
      context.errors.push({message: "Invalid symbol character: " + next, pos: [stream.start, stream.pos]});
      stream.next();
    }
    stream.eatWhile(symbolChars);
    //console.log("current:", stream.current());
    nameToken.pos = [stream.start, stream.pos];
    tokens.push(nameToken);
    symbol.name = stream.current();
  } else {
    return symbol;
  }

  stream.eatWhile(whiteSpace);
  var maybeAlias = stream.peek();

  //if we allow allowAlias then we have to check the next non-space char for : or =
  if(!allowAlias) {
    if(maybeAlias === ":") {
      context.errors.push({message: "Invalid alias on symbol: " + symbol.name + ". Aliases aren't allowed here.", pos: [stream.start, stream.pos]});
      stream.next();
    } else if(maybeAlias === "=") {
      context.errors.push({message: "Invalid assignment on symbol: " + symbol.name + ". assignments aren't allowed here.", pos: [stream.start, stream.pos]});
      stream.next();
    }
  } else {
    //console.log("before Eat", stream.peek());
    //console.log("maybeAlias", maybeAlias);
    if(maybeAlias === ":") {
      stream.commit();
      stream.next();
      tokens.push({token: "operator", type: "alias", pos: [stream.start, stream.pos]})
      stream.commit();
      //we're aliasing.
      var alias = parseSymbol(stream, "alias", false);
      Array.prototype.push.apply(symbol.tokens, alias.tokens);
      symbol.alias = alias.name;
      nameToken.type = "aliased-" + type;
      if(!symbol.alias) {
        context.errors.push({message: "Invalid alias for: " + symbol.name + ".", pos: [stream.start, stream.pos]});
      }
    } else if(maybeAlias === "=") {
      //setting to a constant. What follows must be a scalar.
      stream.commit();
      stream.next();
      tokens.push({token: "operator", type: "scalarFilter", pos: [stream.start, stream.pos]})
      stream.commit();
      //we're expecting a constant
      var constant = parseConstant(stream, context);
      Array.prototype.push.apply(symbol.tokens, constant.tokens);
      symbol.constant = constant.value;
      nameToken.type = "assigned-" + type;
      if(!symbol.constant) {
        context.errors.push({message: "Invalid assignment for: " + symbol.name + ".", pos: [stream.start, stream.pos]});
      }
    }
  }
  return symbol;
}


function parseUIMap(stream, context, state) {
}

function parseUIVector(stream, context, state) {
}

function parseUISymbol(stream, context, state) {
}

function parseUI(stream, context, state) {
  // [ ... ]
  // symbol
  // {symbol symbol/constant}
  stream.eatWhile(whiteSpace);

}

function parseLine(stream, state) {
  var context = {errors: []};
  var instruction = {tokens: []};
  var tokens = instruction.tokens;
  stream.eatWhile(whiteSpace);
  if(stream.eol()) {
    return {};
  }

  var char = stream.next();

  switch(char) {
    case "*":
      instruction.type = "rule";
      tokens.push({token: "operator", type: "rule", pos: [stream.start, stream.pos]});
      stream.commit();
      //the rest of the line is the symbol name of the rule
      stream.skipToEnd();
      tokens.push({token: "symbol", type: "ruleName", pos: [stream.start, stream.pos]});
      instruction.name = stream.current().trim();
      break;
    case "|":
      instruction.type = "source";
      tokens.push({token: "operator", type: "source", pos: [stream.start, stream.pos]});
      stream.commit();
      instruction.table = parseSymbol(stream, "table", false, context);
      Array.prototype.push.apply(tokens, instruction.table.tokens);
      instruction.fields = [];
      while(!stream.eol()) {
        var field = parseSymbol(stream, "field", true, context);
        instruction.fields.push(field);
        Array.prototype.push.apply(tokens, field.tokens);
      }
      break;
    case "#":
      instruction.type = "setReference";
      tokens.push({token: "operator", type: "setReference", pos: [stream.start, stream.pos]});
      stream.commit();
      instruction.table = parseSymbol(stream, "table", false, context);
      Array.prototype.push.apply(tokens, instruction.table.tokens);
      instruction.fields = [];
      while(!stream.eol() && stream.peek() !== "|") {
        var field = parseSymbol(stream, "field", true, context);
        instruction.fields.push(field);
        Array.prototype.push.apply(tokens, field.tokens);
      }
      break;
    case "?":
      instruction.type = "filter";
      tokens.push({token: "operator", type: "filter", pos: [stream.start, stream.pos]});
      stream.commit();
      stream.eatWhile(/[^\n]/);
      tokens.push({token: "function", type: "filter", content: stream.current(), pos: [stream.start, stream.pos]});
      instruction.function = stream.current().trim();
      break;
    case "@":
      instruction.type = "setExplosion"
      tokens.push({token: "operator", type: "setExplosion", pos: [stream.start, stream.pos]});
      stream.commit();
      instruction.table = parseSymbol(stream, "table", false, context);
      Array.prototype.push.apply(tokens, instruction.table.tokens);
      instruction.fields = [];
      while(!stream.eol() && stream.peek() !== "|") {
        var field = parseSymbol(stream, "field", true, context);
        instruction.fields.push(field);
        Array.prototype.push.apply(tokens, field.tokens);
      }
      break;
    case ">":
      instruction.type = "reduce";
      tokens.push({token: "operator", type: "reduce", pos: [stream.start, stream.pos]});
      stream.commit();
      instruction.symbol = parseSymbol(stream, "variable", false, context);
      Array.prototype.push.apply(tokens, instruction.symbol.tokens);
      stream.skipTo("=");
      stream.next();
      tokens.push({token: "operator", type: "assignment", pos: [stream.start, stream.pos]});
      stream.commit();
      stream.eatWhile(/[^\n]/);
      tokens.push({token: "function", type: "reduce", content: stream.current(), pos: [stream.start, stream.pos]});
      instruction.function = stream.current().trim();
      break;
    case ";":
      instruction.type = "comment";
      stream.eatWhile(/[^\n]/);
      tokens.push({token: "comment", content: stream.current(), pos: [stream.start, stream.pos]});
      break;
    case "[":
      instruction.type = "ui";
      stream.skipToEnd();
      tokens.push({token: "ui", content: stream.current(), pos: [stream.start, stream.pos]});
      break;
    case "~":
      instruction.type = "header";
      instruction.fields = [];
      while(!stream.eol()) {
        var field = parseSymbol(stream, "field", true, context);
        instruction.fields.push(field);
        Array.prototype.push.apply(tokens, field.tokens);
      }
      break;
    case "+":
      instruction.type = "insert";
      instruction.values = [];
      while(!stream.eol()) {
        var value = parseConstant(stream, context);
        instruction.values.push(value);
        Array.prototype.push.apply(tokens, value.tokens);
      }
      break;
    default:
      if(stream.string.indexOf("=") > -1) {
        //this is a calculation
        instruction.type = "function";
        stream.backUp(1);
        instruction.symbol = parseSymbol(stream, "variable", false, context);
        Array.prototype.push.apply(tokens, instruction.symbol.tokens);
        stream.commit();
        stream.skipTo("=");
        stream.next();
        tokens.push({token: "operator", type: "assignment", pos: [stream.start, stream.pos + 1]});
        stream.commit();
        stream.eatWhile(/[^\n]/);
        tokens.push({token: "function", type: "function", content: stream.current(), pos: [stream.start, stream.pos]});
        instruction.function = stream.current().trim();
      } else if(state.mode = "ui") {
        instruction.type = "ui";
        stream.skipToEnd();
        tokens.push({token: "ui", content: stream.current(), pos: [stream.start, stream.pos]});
      }
      break;
  }

  instruction.errors = context.errors;
  return instruction;
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
      var parsed = parseLine(new StringStream(line), state)
      state.mode = parsed.type;
      if(parsed) {
        parsed.line = ix;
        if(parsed.errors.length) {
          errors.push({line: ix, errors: parsed.errors});
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
        curRule.fields[line.symbol.name] = line;
        curRule.functions.push(line);
        break;
      case "reduce":
        curRule.fields[line.symbol.name] = line;
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
      default:
        break;
    }
  }
  finalizeRule(curRule);

  return {rules: rules, errors: errors};
}



// var context = {nextId: 10000};
// var paths =
//     subProgram("paths",
//                commonTables(),
//                rule("blah blah",
//                     source("time", {time: "time"}),
//                     elem("button", {id: "time", parent: ["root", 0], click: ["add one", "foo"]}, "add one")),
//                rule("count",
//                     constant("addOne", "add one"),
//                     source("externalEvent", {label: "addOne", eid: "eid"}),
//                     aggregate(["addOne"], []),
//                     reduce("count", "eid", "eid.length"),
//                     elem("p", {id: "count", parent: ["root", 1]}, inject("count"))
//                    )
//               )(context);

function parsedToEveProgram(parsed) {
  var tablesCreated = {};
  var errors = parsed.errors || [];
  var values = [];
  var rules = ["editor program", commonTables()];
  for(var ix in parsed.rules) {
    var curRule = parsed.rules[ix];

    if(curRule.header) {
      //If there's a header we need to do inserts and such
      var tableFields = curRule.header.fields.map(function(cur) {
        return cur.name;
      });
      for(var valueIx in curRule.values) {
        var insert = curRule.values[valueIx].values.map(function(cur) {
          return cur.value;
        });
        insert.unshift(curRule.name);
        console.log(insert);
        values.push(insert);
      }
      tablesCreated[curRule.name] = {fields: tableFields, constants: curRule.constants};
      rules.push(table(curRule.name, tableFields));
      continue;
    }

    var parts = ["rule" + ix];

    // handle sources
    for(var sourceIx in curRule.sources) {
      var src = curRule.sources[sourceIx];
      var fields = {};
      for(var fieldIx in src.fields) {
        var field = src.fields[fieldIx];
        if(field.alias) {
          fields[field.name] = field.alias;
        } else if(field.constant) {
          fields[field.name] = field.constantVar;
        } else {
          fields[field.name] = field.name;
        }
      }
      parts.push(source(src.table.name, fields));
    }

    // handle functions
    for(var funcIx in curRule.functions) {
      var func = curRule.functions[funcIx];
      parts.push(calculate(func.symbol.name, func.args, func.function));
    }

    // handle constants
    for(var cons in curRule.constants) {
      var field = curRule.constants[cons];
      parts.push(constant(cons, field.constant));
    }

    // handle filters
    for(var filterIx in curRule.filters) {
      var filter = curRule.filters[filterIx];
      parts.push(calculate("filter" + filterIx, filter.args, filter.function));
      parts.push(constant("filter" + filterIx, true));
    }

    //create tables and sinks
    var tableFields = [];
    var sinkFields = {};
    for(var field in curRule.fields) {
      tableFields.push(field);
      sinkFields[field] = field;
    }
    parts.push(sink(curRule.name, sinkFields));
    console.log(curRule.name, parts.map(function(c) { return typeof c === "function" ? c({nextId: 1, rule: "rule" + ix}) : c; }));
    rules.push(rule.apply(null, parts));
    tablesCreated[curRule.name] = {fields: tableFields, constants: curRule.constants};
    rules.push(table(curRule.name, tableFields));
  }
  return {program: program.apply(null, rules), tablesCreated: tablesCreated, values: values, errors: errors};
}

function tokenToCMType(token) {
  return token.token + " " + token.token + "-" + token.type + " " + token.type;
}

function CodeMirrorModeParser() {
  return {
    token: function(stream, state) {
      if(stream.eatWhile(whiteSpace)) return null;

      stream.next();

      var start = stream.pos;
      var line = parseLine(new StringStream(stream.string), state);
      state.mode = line.type;

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

// var stream = new StringStream("  foo = b ");

// parseLine(stream);
// tick(tokenizer, stream);

// console.log(parse("* a\n| 'program ' "))
// console.log(parse("* awesome rule\n|'program Rule' program : p name=\"awesome\"\n@ programRule program rule | ordinal:ix sort:rule"));
// console.log(parse("* another rule\n|"));

// parse("* this is a rule\n| this:alias is a source\n? cool > huh")
