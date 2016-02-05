import {ENV, DEBUG, uuid, unpad, underline, coerceInput} from "./utils"
import * as runtime from "./runtime"
import {eve} from "./app"
import {repeat} from "./utils"

class ParseError extends Error {
  name: string = "Parse Error";

  constructor(public message:string, public line:string, public lineIx?:number, public charIx:number = 0, public length:number = line && (line.length - charIx)) {
    super(message);
  }
  toString() {
    return unpad(6) `
      ${this.name}: ${this.message}
      ${this.lineIx !== undefined ? `On line ${this.lineIx + 1}:${this.charIx}` : ""}
      ${this.line}
      ${underline(this.charIx, this.length)}
    `;
  }
}

function readWhile(str:string, pattern:RegExp, startIx:number):string {
  let endIx = startIx;
  while(str[endIx] !== undefined && str[endIx].match(pattern)) endIx++;
  return str.slice(startIx, endIx);
}

function readUntil(str:string, sentinel:string, startIx:number):string;
function readUntil(str:string, sentinel:string, startIx:number, unsatisfiedErr: Error):string|Error;
function readUntil(str:string, sentinel:string, startIx:number, unsatisfiedErr?: Error):any {
  let endIx = str.indexOf(sentinel, startIx);
  if(endIx === -1) {
    if(unsatisfiedErr) return unsatisfiedErr;
    return str.slice(startIx);
  }
  return str.slice(startIx, endIx);
}

function readUntilAny(str:string, sentinels:string[], startIx:number):string;
function readUntilAny(str:string, sentinels:string[], startIx:number, unsatisfiedErr: Error):string|Error;
function readUntilAny(str:string, sentinels:string[], startIx:number, unsatisfiedErr?: Error):any {
  let endIx = -1;
  for(let sentinel of sentinels) {
    let ix = str.indexOf(sentinel, startIx);
    if(ix === -1 || endIx !== -1 && ix > endIx) continue;
    endIx = ix;
  }
  if(endIx === -1) {
    if(unsatisfiedErr) return unsatisfiedErr;
    return str.slice(startIx);
  }
  return str.slice(startIx, endIx);
}

//-----------------------------------------------------------------------------
// UI DSL Parser
//-----------------------------------------------------------------------------
export interface UIElem {
  id?: string
  children?: UIElem[]
  embedded?: {} // Undefined or the restricted scope of the embedded child.
  binding?: string
  bindingKind?: string
  attributes?: {}
  events?: {[event:string]: {}}
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
enum TOKEN_TYPE { EXPR, IDENTIFIER, KEYWORD, STRING, LITERAL };
export class Token {
  static TYPE = TOKEN_TYPE;
  static identifier(value:string, lineIx?: number, charIx?: number) {
    return new Token(Token.TYPE.IDENTIFIER, value, lineIx, charIx);
  }
  static keyword(value:string, lineIx?: number, charIx?: number) {
    return new Token(Token.TYPE.KEYWORD, value, lineIx, charIx);
  }
  static string(value:string, lineIx?: number, charIx?: number) {
    return new Token(Token.TYPE.STRING, value, lineIx, charIx);
  }
  static literal(value:any, lineIx?: number, charIx?: number) {
    return new Token(Token.TYPE.LITERAL, value, lineIx, charIx);
  }

  constructor(public type?: TOKEN_TYPE, public value?: any, public lineIx?: number, public charIx?: number) {}
  toString() {
    if(this.type === Token.TYPE.KEYWORD) return `:${this.value}`;
    else if(this.type === Token.TYPE.STRING) return `"${this.value}"`;
    else return this.value.toString();
  }
}

export class Sexpr {
  static list(value:(Token|Sexpr)[] = [], lineIx?: number, charIx?: number, syntax?: boolean) {
    value = value.slice();
    value.unshift(Token.identifier("list", lineIx, charIx ? charIx + 1 : undefined));
    return new Sexpr(value, lineIx, charIx, syntax ? "list" : undefined);
  }
  static hash(value:(Token|Sexpr)[] = [], lineIx?: number, charIx?: number, syntax?: boolean) {
    value = value.slice();
    value.unshift(Token.identifier("hash", lineIx, charIx ? charIx + 1 : undefined));
    return new Sexpr(value, lineIx, charIx, syntax ? "hash" : undefined);
  }
  static asSexprs(values:(Token|Sexpr)[]):Sexpr[] {
    for(let raw of values) {
     if(!(raw instanceof Sexpr)) throw new ParseError(`All top level entries must be expressions (got ${raw})`, undefined, raw.lineIx, raw.charIx);
      else {
        let op = raw.operator;
        if(op.type !== Token.TYPE.IDENTIFIER)
          throw new ParseError(`All expressions must begin with an identifier`, undefined, raw.lineIx, raw.charIx);
      }
    }
    return <Sexpr[]>values;
  }

  public type = Token.TYPE.EXPR;
  public value:(Token|Sexpr)[];

  constructor(val?: (Token|Sexpr)[], public lineIx?: number, public charIx?: number, public syntax = "expr") {
    if(val) this.value = val.slice();
  }
  toString() {
    let content = this.value && this.value.map((token) => token.toString()).join(" ");
    let argsContent = this.value && this.arguments.map((token) => token.toString()).join(" ");
    if(this.syntax === "hash") return `{${argsContent}}`;
    else if(this.syntax === "list") return `[${argsContent}]`;
    else return `(${content})`;
  }

  push(val:Token|Sexpr) {
    this.value = this.value || [];
    return this.value.push(val);
  }
  nth(n, val?:Token|Sexpr) {
    if(val) {
      this.value = this.value || [];
      return this.value[n] = val;
    }
    return this.value && this.value[n];
  }
  get operator() {
    return this.value && this.value[0];
  }
  set operator(op: Token|Sexpr) {
    this.value = this.value || [];
    this.value[0] = op;
  }
  get arguments() {
    return this.value && this.value.slice(1);
  }
  set arguments(args: (Token|Sexpr)[]) {
    this.value = this.value || [];
    this.value.length = 1;
    this.value.push.apply(this.value, args);
  }
  get length() {
    return this.value && this.value.length;
  }
}

const TOKEN_TO_TYPE = {
  "(": "expr",
  ")": "expr",
  "[": "list",
  "]": "list",
  "{": "hash",
  "}": "hash"
};

let hygienicSymbolCounter = 0;

export function readSexprs(text:string):Sexpr {
  let root = Sexpr.list();
  let token:Token;
  let sexpr:Sexpr = root;
  let sexprs:Sexpr[] = [root];

  let lines = text.split("\n");
  let lineIx = 0;
  let mode:string;
  for(let line of lines) {
    let line = lines[lineIx];
    let charIx = 0;

    if(mode === "string") token.value += "\n";

    while(charIx < line.length) {
      if(mode === "string") {
        if(line[charIx] === "\"" && line[charIx - 1] !== "\\") {
          sexpr.push(token);
          token = mode = undefined;
          charIx++;

        } else token.value += line[charIx++];

        continue;
      }

      let padding = readWhile(line, /\s/, charIx);
      charIx += padding.length;
      if(padding.length) {
        if(token) sexpr.push(token);
        token = undefined;
      }
      if(charIx >= line.length) continue;

      if(line[charIx] === ";") {
        charIx = line.length;

      } else if(line[charIx] === "\"") {
        if(!sexpr.length) throw new ParseError(`Literal must be an argument in a sexpr.`, line, lineIx, charIx);
        mode = "string";
        token = Token.string("", lineIx, charIx);
        charIx++;

      } else if(line[charIx] === ":") {
        if(!sexpr.length) throw new ParseError(`Literal must be an argument in a sexpr.`, line, lineIx, charIx);
        let keyword = readUntilAny(line, [" ", ")", "]", "}"], ++charIx);
        sexpr.push(Token.keyword(keyword, lineIx, charIx - 1));
        charIx += keyword.length;

      } else if(line[charIx] === "(" || line[charIx] === "[" || line[charIx] === "{") {
        if(token) throw new ParseError(`Sexpr arguments must be space separated.`, line, lineIx, charIx);
        let type = TOKEN_TO_TYPE[line[charIx]];
        if(type === "hash") sexpr = Sexpr.hash(undefined, lineIx, charIx);
        else if(type === "list") sexpr = Sexpr.list(undefined, lineIx, charIx);
        else sexpr = new Sexpr(undefined, lineIx, charIx);
        sexpr.syntax = type;
        sexprs.push(sexpr);
        charIx++;

      } else if(line[charIx] === ")" || line[charIx] === "]" || line[charIx] === "}") {
        let child = sexprs.pop();
        let type = TOKEN_TO_TYPE[line[charIx]];
        if(child.syntax !== type) throw new ParseError(`Must terminate ${child.syntax} before terminating ${type}`, line, lineIx, charIx);
        sexpr = sexprs[sexprs.length - 1];
        if(!sexpr) throw new ParseError(`Too many closing parens`, line, lineIx, charIx);
        sexpr.push(child);
        charIx++;

      } else {
        let literal = readUntilAny(line, [" ", ")", "]", "}"], charIx);
        let length = literal.length;
        literal = coerceInput(literal);
        let type = typeof literal === "string" ? "identifier" : "literal";
        if(!sexpr.length && type !== "identifier") throw new ParseError(`Expr must begin with identifier.`, line, lineIx, charIx);
        if(type === "identifier") {
          let dotIx = literal.indexOf(".");
          if(dotIx !== -1) {
            let child:Sexpr = new Sexpr([
              Token.identifier("get", lineIx, charIx + 1),
              Token.identifier(literal.slice(0, dotIx), lineIx, charIx + 3),
              Token.string(literal.slice(dotIx + 1), lineIx, charIx + 5 + dotIx)
            ], lineIx, charIx);
            sexpr.push(child);

          } else sexpr.push(Token.identifier(literal, lineIx, charIx));

        } else sexpr.push(Token.literal(literal, lineIx, charIx));
        charIx += length;
      }
    }
    lineIx++;
  }
  if(token) throw new ParseError(`Unterminated ${TOKEN_TYPE[token.type]} token`, lines[lineIx - 1], lineIx - 1);
  let lastIx = lines.length - 1;
  if(sexprs.length > 1) throw new ParseError(`Too few closing parens`, lines[lastIx], lastIx, lines[lastIx].length);

  return root;
}

export function macroexpandDSL(sexpr:Sexpr):Sexpr {
  // @TODO: Implement me.
  let op = sexpr.operator;
  if(op.value === "eav") {
    throw new Error("@TODO: Implement me!");

  } else if(op.value === "one-of") {
    // (one-of (query ...body) (query ...body) ...) =>
    // (union
    //   (def q1 (query ...body1))
    //   (def q2 (query (negate q1) ...body2)))
    throw new Error("@TODO: Implement me!");

  } else if(op.value === "negate") {
    if(sexpr.length > 2) throw new ParseError(`Negate only takes a single body`, undefined, sexpr.lineIx, sexpr.charIx);
    let select = macroexpandDSL(Sexpr.asSexprs(sexpr.arguments)[0]);
    select.push(Token.keyword("$$negated"));
    select.push(Token.literal(true));
    return select;

  } else if(["hash", "list", "get", "def", "query", "union", "select", "member", "project!", "insert!", "remove!", "load!"].indexOf(op.value) === -1) {
    // (foo-bar :a 5) => (select "foo bar" :a 5)
    let source = op;
    source.type = Token.TYPE.STRING;
    source.value = source.value.replace(/(.?)-(.)/g, "$1 $2");
    let args = sexpr.arguments;
    args.unshift(source);
    sexpr.arguments = args;
    sexpr.operator = Token.identifier("select");
  }
  return sexpr;
}
enum VALUE { NULL, SCALAR, SET, VIEW };
export type Artifacts = {changeset?: runtime.Diff, views: {[query:string]: runtime.Query|runtime.Union}};
type Variable = {name: string, type: VALUE, static?: boolean, value?: any, projection?: string, constraints: [string, string][]};
type VariableContext = Variable[];

export function parseDSL(text:string):Artifacts {
  let artifacts:Artifacts = {views: {}};
  let lines = text.split("\n");
  let root = readSexprs(text);

  for(let raw of Sexpr.asSexprs(root.arguments)) parseDSLSexpr(raw, artifacts);
  return artifacts;
}

type SexprResult = {type:VALUE, value?:any, projected?:any, context?:any, mappings?:any, aggregated?:boolean};
function parseDSLSexpr(raw:Sexpr, artifacts:Artifacts, context?:VariableContext, parent?:runtime.Query|runtime.Union, resultVariable?:string):SexprResult {
  if(parent instanceof runtime.Query) var query = parent;
  else var union = <runtime.Union>parent;
  let sexpr = macroexpandDSL(raw);
  let op = sexpr.operator;
  if(op.type !== Token.TYPE.IDENTIFIER)
    throw new ParseError(`Evaluated sexpr must begin with an identifier ('${op}' is a ${Token.TYPE[op.type]})`, "", raw.lineIx, raw.charIx);

  if(op.value === "list") {
    let {$$body} = parseArguments(sexpr, undefined, "$$body");
    return {type: VALUE.SCALAR, value: (<any>$$body).map((token, ix) => resolveTokenValue(`list item ${ix}`, token, context))};
  }
  if(op.value === "hash") {
    let args = parseArguments(sexpr);
    for(let arg in args) args[arg] = resolveTokenValue(`hash item ${arg}`, args[arg], context);
    return {type: VALUE.SET, value: args};
  }

  if(op.value === "insert!") {
      let changeset = artifacts.changeset || eve.diff();
      for(let arg of sexpr.arguments) {
          let table = arg.value[0];
          let fact = {};
          for(let ix = 1; ix < arg.value.length; ix += 2) {
              let key = arg.value[ix];
              let value = arg.value[ix+1];
              fact[key.value] = value.value;
          }
          changeset.add(table.value, fact);
      }
      artifacts.changeset = changeset;
      return;
  }

  if(op.value === "remove!") {
      let changeset = artifacts.changeset || eve.diff();
      for(let arg of sexpr.arguments) {
          let table = arg.value[0];
          let fact = {};
          for(let ix = 1; ix < arg.value.length; ix += 2) {
              let key = arg.value[ix];
              let value = arg.value[ix+1];
              fact[key.value] = value.value;
          }
          changeset.remove(table.value, fact);
      }
      artifacts.changeset = changeset;
      return;
  }

  if(op.value === "load!") {
      throw new Error("(load! ..) has not been implemented yet");
  }

  if(op.value === "query") {
    let neueContext:VariableContext = [];
    let {$$view, $$negated, $$body} = parseArguments(sexpr, undefined, "$$body");
    let queryId = $$view ? resolveTokenValue("view", $$view, context, VALUE.SCALAR) : uuid();
    let neue = new runtime.Query(eve, queryId);
    neue["displayName"] = sexpr.toString();
    if(DEBUG.instrumentQuery) instrumentQuery(neue, DEBUG.instrumentQuery);
    artifacts.views[queryId] = neue;
    let aggregated = false;
    for(let raw of Sexpr.asSexprs(<any>$$body)) {
      let state = parseDSLSexpr(raw, artifacts, neueContext, neue);
      if(state && state.aggregated) aggregated = true;
    }

    let projectionMap = neue.projectionMap;
    let projected = true;
    if(!projectionMap) {
      projectionMap = {};
      projected = false;
      for(let variable of neueContext) projectionMap[variable.name] = variable.value;
    }
    if(Object.keys(projectionMap).length) neue.project(projectionMap);

    // Join subquery to parent.
    if(parent) {
      let select = new Sexpr([Token.identifier(query ? "select" : "member"), Token.string(queryId)], raw.lineIx, raw.charIx);
      let groups = [];

      for(let variable of neueContext) {
        if(projected && !variable.projection) continue;
        let field = variable.projection || variable.name;
        select.push(Token.keyword(field));
        if(query) select.push(Token.identifier(variable.name));
        else select.push(Sexpr.list([Token.string(field)]));

        if(context) {
          for(let parentVar of context) {
            if(parentVar.name === variable.name) groups.push(variable.value);
          }
        }
      }

      if($$negated) {
        select.push(Token.keyword("$$negated"));
        select.push($$negated);
      }
      if(groups.length && aggregated) neue.group(groups);
      parseDSLSexpr(select, artifacts, context, parent);
    }

    return {value: queryId, type: VALUE.VIEW, projected, context: neueContext};
  }

  if(op.value === "union") {
    let {$$view, $$body, $$negated} = parseArguments(sexpr, undefined, "$$body");
    let unionId = $$view ? resolveTokenValue("view", $$view, context, VALUE.SCALAR) : uuid();
    let neue = new runtime.Union(eve, unionId);
    if(DEBUG.instrumentQuery) instrumentQuery(neue, DEBUG.instrumentQuery);
    artifacts.views[unionId] = neue;
    let mappings = {};
    for(let raw of Sexpr.asSexprs(<any>$$body)) {
      let child = macroexpandDSL(raw);
      if(child.operator.value !== "query" && child.operator.value !== "union")
        throw new ParseError("Unions may only contain queries", "", raw.lineIx, raw.charIx);
      let res = parseDSLSexpr(child, artifacts, context, neue);
      for(let variable of res.context) {
        if(res.projected && !variable.projection) continue;
        let field = variable.projection || variable.name;
        if(!mappings[field]) mappings[field] = {};
        mappings[field][variable.name] = true;
      }
    }

    // Join subunion to parent
    if(parent) {
      let select = new Sexpr([Token.identifier(query ? "select" : "member"), Token.string(unionId)], raw.lineIx, raw.charIx);
       for(let field in mappings) {
         let mappingVariables = Object.keys(mappings[field]);
         if(mappingVariables.length > 1)
          throw new ParseError(
            `All variables projected to a single union field must have the same name. Field '${field}' has ${mappingVariables.length} fields (${mappingVariables.join(", ")})`, "", raw.lineIx, raw.charIx);
        select.push(Token.keyword(field));
        select.push(Token.identifier(mappingVariables[0]));
      }

      console.log("union select", select.toString());
      parseDSLSexpr(select, artifacts, context, parent);
    }

    return {type: VALUE.VIEW, value: unionId, mappings};
  }

  if(op.value === "member") {
    if(!union) throw new ParseError(`Cannot add member to non-union parent`, "", raw.lineIx, raw.charIx);
    let args = parseArguments(sexpr, ["$$view"]);
    let {$$view, $$negated} = args;
    let view = resolveTokenValue("view", $$view, context, VALUE.SCALAR);
    if(view === undefined) throw new ParseError("Must specify a view to be unioned", "", raw.lineIx, raw.charIx);

    let join = {};
    for(let arg in args) {
      if(arg === "$$view" || arg === "$$negated") continue;
      join[arg] = resolveTokenValue("member field", args[arg], context);
    }
    if(runtime.QueryFunctions[view]) throw new ParseError(`Cannot union primitive view '${view}'`, "", raw.lineIx, raw.charIx);
    union.union(view, join);
    return;
  }

  if(!parent) throw new ParseError(`Non-query or union sexprs must be contained within a query or union`, "", raw.lineIx, raw.charIx);

  if(op.value === "select") {
    if(!query) throw new ParseError(`Cannot add select to non-query parent`, "", raw.lineIx, raw.charIx);
    let selectId = uuid();
    let $$view = getArgument(sexpr, "$$view", ["$$view"]);
    let view = resolveTokenValue("view", $$view, context, VALUE.SCALAR);
    if(view === undefined) throw new ParseError("Must specify a view to be selected", "", raw.lineIx, raw.charIx);
    let primitive = runtime.QueryFunctions[view]
    //@TODO: Move this to an eve table to allow user defined defaults
    let args = parseArguments(sexpr, ["$$view"].concat(getDefaults(view)));
    let {$$negated} = args;

    let join = {};
    for(let arg in args) {
      let value = args[arg];
      let variable;
      if(arg === "$$view" || arg === "$$negated") continue;

      if(value instanceof Token && value.type !== Token.TYPE.IDENTIFIER) {
        join[arg] = args[arg].value;
        continue;
      }

      if(value instanceof Sexpr) {
        let result = parseDSLSexpr(value, artifacts, context, parent, `$$temp-${hygienicSymbolCounter++}-${arg}`);
        if(!result || result.type === VALUE.NULL) throw new Error(`Cannot set parameter '${arg}' to null value '${value.toString()}'`);
        if(result.type === VALUE.VIEW) {
          let view = result.value;
          let resultField = getResult(view);
          if(!resultField) throw new Error(`Cannot set parameter '${arg}' to select without default result field`);
          for(let curVar of context) {
            for(let constraint of curVar.constraints) {
              if(constraint[0] === view && constraint[1] === resultField) {
                variable = curVar;
                break;
              }
            }
          }
        }
      } else variable = getDSLVariable(value.value, context);

      if(variable) {
        join[arg] = variable.value;
        variable.constraints.push([view, arg]);
      }
      else if($$negated && $$negated.value)
        throw new ParseError(`Cannot bind field in negated select to undefined variable '${value.value}'`, "", raw.lineIx, raw.charIx);
      else context.push({name: value.value, type: VALUE.SCALAR, value: [selectId, arg], constraints: [[view, arg]]}); // @TODO: does this not need to add to the join map?
    }

    let resultField = getResult(view);
    if(resultVariable && resultField && !join[resultField]) {
      join[resultField] = [selectId, resultField];
      context.push({name: resultVariable, type: VALUE.SCALAR, value: [selectId, resultField], constraints: [[view, resultField]]});
    }

    if(primitive) {
      if(primitive.aggregate) query.aggregate(view, join, selectId);
      else query.calculate(view, join, selectId);
    } else if($$negated) query.deselect(view, join);
    else query.select(view, join, selectId);
    return {
      type: VALUE.VIEW,
      value: view,
      aggregated: primitive && primitive.aggregate
    };
  }

  if(op.value === "project!") {
    let args = parseArguments(sexpr, ["$$view"]);
    let {$$view, $$negated} = args;

    let projectionMap = {};
    for(let arg in args) {
      let value = args[arg];
      if(arg === "$$view" || arg === "$$negated") continue;
      if(value.type !== Token.TYPE.IDENTIFIER) {
        projectionMap[arg] = args[arg].value;
        continue;
      }

      let variable = getDSLVariable(value.value, context);
      if(variable) {
        if(variable.static) projectionMap[arg] = variable.value;
        else if(!$$view) {
          variable.projection = arg;
          projectionMap[arg] = variable.value;
        } else projectionMap[arg] = [variable.name];
      } else throw new ParseError(`Cannot bind projected field to undefined variable '${value.value}'`, "", raw.lineIx, raw.charIx);
    }

    let view = resolveTokenValue("view", $$view, context, VALUE.SCALAR);
    if(view === undefined) {
      if(query.projectionMap) throw new ParseError("Query can only self-project once", "", raw.lineIx, raw.charIx);
      if($$negated && $$negated.value) throw new ParseError(`Cannot negate self-projection`, "", raw.lineIx, raw.charIx);
      // Project self
      query.project(projectionMap);
    } else {
      let union = <runtime.Union>artifacts.views[view] || new runtime.Union(eve, view);
      if(DEBUG.instrumentQuery && !artifacts.views[view]) instrumentQuery(union, DEBUG.instrumentQuery);
      artifacts.views[view] = union;

      // if($$negated && $$negated.value) union.ununion(queryId, projectionMap);
      if($$negated && $$negated.value)
        throw new ParseError(`Union projections may not be negated in the current runtime`, "", raw.lineIx, raw.charIx);
      else union.union(query.name, projectionMap);
    }
    return;
  }

  throw new ParseError(`Unknown DSL operator '${op.value}'`, "", raw.lineIx, raw.charIx);
}

function resolveTokenValue(name:string, token:Token|Sexpr, context:VariableContext, type?:VALUE) {
  if(!token) return;
  if(token instanceof Sexpr) return parseDSLSexpr(token, undefined, context);
  if(token instanceof Token && token.type === Token.TYPE.IDENTIFIER) {
    let variable = getDSLVariable(token.value, context, VALUE.SCALAR);
    if(!variable) throw new Error(`Cannot bind ${name} to undefined variable '${token.value}'`);
    if(!variable.static) throw new Error(`Cannot bind ${name} to dynamic variable '${token.value}'`);
    return variable.value;
  }
  return token.value;
}

function getDSLVariable(name:string, context:VariableContext, type?:VALUE):Variable {
  if(!context) return;
  for(let variable of context) {
    if(variable.name === name) {
      if(variable.static === false) throw new Error(`Cannot statically look up dynamic variable '${name}'`);
      if(type !== undefined && variable.type !== type)
        throw new Error(`Expected variable '${name}' to have type '${type}', but instead has type '${variable.type}'`);
      return variable;
    }
  }
}

function getDefaults(view:string):string[] {
  return (runtime.QueryFunctions[view] && runtime.QueryFunctions[view].params) || [];
}
function getResult(view:string):string {
  return runtime.QueryFunctions[view] && runtime.QueryFunctions[view].result;
}

export function getArgument(root:Sexpr, param:string, defaults?: string[]):Token|Sexpr {
  let ix = 1;
  let defaultIx = 0;
  for(let ix = 1, cur = root.nth(ix); ix < root.length; ix++) {
    if(cur.type === Token.TYPE.KEYWORD) {
      if(cur.value === param) return root.nth(ix + 1);
      else ix + 1;
    } else {
      if(defaults && defaultIx < defaults.length) {
        let keyword = defaults[defaultIx++];
        if(keyword === param) return cur;
        else ix + 1;
      }
      throw new Error(`Param '${param}' not in sexpr ${root.toString()}`);
    }
  }
  throw new Error(`Param '${param}' not in sexpr ${root.toString()}`);
}

export function parseArguments(root:Sexpr, defaults?:string[], rest?:string):{[keyword:string]: Token|Sexpr} {
  let args:any = {};
  let defaultIx = 0;
  let keyword;
  let kwarg = false;
  for(let raw of root.arguments) {
    if(raw.type === Token.TYPE.KEYWORD) {
      if(keyword) throw new Error(`Keywords may not be values '${raw}'`);
      else keyword = raw.value;
    } else if(keyword) {
      if(args[keyword] === undefined) {
        args[keyword] = raw;
      } else {
        if(!(args[keyword] instanceof Array)) args[keyword] = [args[keyword]];
        args[keyword].push(raw);
      }
      keyword = undefined;
      defaultIx = defaults ? defaults.length : 0;
      kwarg = true;
    } else if(defaults && defaultIx < defaults.length) {
      args[defaults[defaultIx++]] = raw;
    } else if(rest) {
      args[rest] = args[rest] || [];
      args[rest].push(raw);
    } else {
      if(kwarg) throw new Error("Cannot specify an arg after a kwarg");
      else if(defaultIx) throw new Error(`Too many args, expected: ${defaults.length}, got: ${defaultIx + 1}`);
      else throw new Error("Cannot specify an arg without default keys specified");
    }
  }

  return args;
}

declare var exports;
if(ENV === "browser") window["parser"] = exports;

export function instrumentQuery(q:any, instrument?:Function|boolean) {
  let instrumentation:Function = <Function>instrument;
  if(!instrument || instrument === true) instrumentation = (fn, args) => console.log("*", fn, ":", args);
  let keys = [];
  for(let key in q) keys.push(key);
  keys.forEach((fn) => {
    if(!q.constructor.prototype.hasOwnProperty(fn) || typeof q[fn] !== "function") return;
    var old = q[fn];
    q[fn] = function() {
      instrumentation(fn, arguments);
      return old.apply(this, arguments);
    }
  });
  return q;
}

export function asDiff(ixer, artifacts:Artifacts) {
  let views = artifacts.views;
  let diff = ixer.diff();
  for(let id in views) diff.merge(views[id].changeset(eve));
  return diff;
}

export function applyAsDiffs(artifacts:Artifacts) {
  let views = artifacts.views;
  for(let id in views) eve.applyDiff(views[id].changeset(eve));
  console.log("Applied diffs for:");
  for(let id in views) console.log("  * ", views[id] instanceof runtime.Query ? "Query" : "Union", views[id].name);
  return artifacts;
}

export function logArtifacts(artifacts:Artifacts) {
  for(let view in artifacts.views) console.log(view, "\n", eve.find(view));
}
