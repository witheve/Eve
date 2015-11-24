import {unpad, underline} from "./utils"
import * as runtime from "./runtime"
import {eve} from "./app"
import {coerceInput} from "./wiki"
declare var uuid;

type Alias = [string, string];
interface MapArgs {
  // value may be a [source, alias] pair to be applied or a constant
  [param:string]:Alias|any
}

interface ListArgs {
  // value may be a [source, alias] pair to be applied or a constant
  [param: number]:Alias|any
}

class ParseError extends Error {
  name: string = "Parse Error";

  constructor(public message:string, public line:string, public lineIx?:number, public charIx:number = 0, public length:number = line.length - charIx) {
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

function readWhile(str:string, substring:string, startIx:number):string {
  let endIx = startIx;
  while(str[endIx] === substring) endIx++;
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

function getAlias(line:string, lineIx: number, charIx: number):[string, number] {
  let alias = uuid();
  let aliasIx = line.lastIndexOf("as [");
  if(aliasIx !== -1) {
    alias = readUntil(line, "]", aliasIx + 4, new ParseError(`Alias must terminate in a closing ']'`, line, lineIx, line.length));
    if(alias instanceof Error) return alias;
  } else aliasIx = undefined;
  return [alias, aliasIx];
}

function maybeCoerceAlias(maybeAlias:string):Error|any {
  if(maybeAlias[0] === "[") {
    if(maybeAlias[maybeAlias.length - 1] !== "]") return new Error("Attribute aliases must terminate in a closing ']'")
    let [source, attribute] = maybeAlias.slice(1, -1).split(",");
    if(!attribute) return new Error("Attribute aliases must contain a source, attribute pair");
    return [source.trim(), attribute.trim()];
  }
  return coerceInput(maybeAlias);
}

function getMapArgs(line:string, lineIx: number, charIx: number):[Error, number]|[MapArgs, number] {
  let args = {};
  if(line[charIx] === "{") {
    let endIx = line.indexOf("}", charIx);
    if(endIx === -1) return [new ParseError(`Args must terminate in a closing '}'`, line, lineIx, line.length), line.length];
    let syntaxErrorIx = line.indexOf("],");
    if(syntaxErrorIx !== -1) return [new ParseError(`Args are delimited by ';', not ','`, line, lineIx, syntaxErrorIx + 1, 0), charIx];
    for(let pair of line.slice(++charIx, endIx).split(";")) {
      let [key, val] = pair.split(":");
      if(key === undefined || val === undefined)
        return [new ParseError(`Args must be specified in key: value pairs`, line, lineIx, charIx, pair.length), charIx + pair.length + 1];

      let coerced = args[key.trim()] = maybeCoerceAlias(val.trim());
      if(coerced instanceof Error) {
        let valIx = charIx + pair.indexOf("[");
        return [new ParseError(coerced.message, line, lineIx, valIx), valIx];
      }

      charIx += pair.length + 1;
    }
    return [args, endIx + 1];
  }
  return [undefined, charIx];
}

function getListArgs(line:string, lineIx: number, charIx: number):[Error, number]|[ListArgs, number] {
  let args = [];
  if(line[charIx] === "{") {
    let endIx = line.indexOf("}", charIx);
    if(endIx === -1) return [new ParseError(`Args must terminate in a closing '}'`, line, lineIx, line.length), line.length];
    let syntaxErrorIx = line.indexOf("],");
    if(syntaxErrorIx !== -1) return [new ParseError(`Args are delimited by ';', not ','`, line, lineIx, syntaxErrorIx + 1, 0), charIx];
    for(let val of line.slice(++charIx, endIx).split(";")) {
      let coerced = maybeCoerceAlias(val.trim());
      if(coerced instanceof Error) {
        let valIx = charIx + val.indexOf("[");
        return [new ParseError(coerced.message, line, lineIx, valIx), valIx];
      }

      args.push(coerced);
      charIx += alert.length + 1;
    }
  }
  return [undefined, charIx];
}



//-----------------------------------------------------------------------------
// Plan DSL Parser
//-----------------------------------------------------------------------------
export interface PlanStep {
  id: string
  size?: number
  name?: string
  type?: string // find | <other>
  relatedTo?: PlanStep
}
interface PlanFind extends PlanStep { entity?: string }
interface PlanGather extends PlanStep { collection?: string }
interface PlanLookup extends PlanStep { deselect?: boolean, attribute: string }
interface PlanIntersect extends PlanStep { deselect?: boolean, collection: string, entity?: string }
interface PlanFilterByEntity extends PlanStep { deselect?: boolean, entity: string }
interface PlanFilter extends PlanStep { func: string, args: MapArgs }
interface PlanCalculate extends PlanStep { func: string, args: MapArgs }
interface PlanAggregate extends PlanStep { aggregate: string, args: MapArgs }
interface PlanGroup extends PlanStep { groups: any }
interface PlanSort extends PlanStep { sort: any }
interface PlanLimit extends PlanStep { limit: any }

function getDeselect(line, lineIx, charIx):[boolean, number] {
  let deselect = false;
  if(line[charIx] === "!") {
    deselect = true;
    charIx++;
    while(line[charIx] === " ") charIx++;
  }
  return [deselect, charIx];
}

let parsePlanStep:{[step: string]: (line: string, lineIx: number, charIx: number, related?: PlanStep) => Error|PlanStep} = {
  ["#"]() { // Comment noop
    return;
  },
  // Sources
  find(line, lineIx, charIx) {
    while(line[charIx] === " ") charIx++;
    let [alias, aliasIx] = getAlias(line, lineIx, charIx);
    let entity = line.slice(charIx, aliasIx).trim();
    if(!entity)
      return new ParseError(`Find step must specify a valid entity id`, line, lineIx, charIx);
    let step:PlanFind = {type: "find", id: alias, entity};
    return step;
  },
  gather(line, lineIx, charIx, relatedTo) {
    while(line[charIx] === " ") charIx++;
    let [alias, aliasIx] = getAlias(line, lineIx, charIx);
    let collection = line.slice(charIx, aliasIx).trim();
    if(!collection)
      return new ParseError(`Gather step must specify a valid collection id`, line, lineIx, charIx);
    let step:PlanGather = {type: "gather", id: alias, collection, relatedTo};
    return step;
  },

  // Joins
  lookup(line, lineIx, charIx, relatedTo) {
    if(!relatedTo) return new ParseError(`Lookup step must be a child of a root`, line, lineIx, charIx);
    while(line[charIx] === " ") charIx++;
    let [alias, aliasIx] = getAlias(line, lineIx, charIx);
    let deselect;
    [deselect, charIx] = getDeselect(line, lineIx, charIx);
    let attribute = line.slice(charIx, aliasIx).trim();
    if(!attribute)
      return new ParseError(`Lookup step must specify a valid attribute id.`, line, lineIx, charIx);
    let step:PlanLookup = {type: "lookup", id: alias, attribute, deselect, relatedTo};
    return step;
  },
  intersect(line, lineIx, charIx, relatedTo) {
    if(!relatedTo) return new ParseError(`Lookup step must be a child of a root`, line, lineIx, charIx);
    while(line[charIx] === " ") charIx++;
    let [alias, aliasIx] = getAlias(line, lineIx, charIx);
    let deselect;
    [deselect, charIx] = getDeselect(line, lineIx, charIx);
    let collection = line.slice(charIx, aliasIx).trim();

    if(!collection)
      return new ParseError(`Intersect step must specify a valid collection id`, line, lineIx, charIx);
    let step:PlanIntersect = {type: "intersect", id: alias, collection, deselect, relatedTo};
    return step;
  },
  filterByEntity(line, lineIx, charIx, relatedTo) {
    if(!relatedTo) return new ParseError(`Lookup step must be a child of a root`, line, lineIx, charIx);
    while(line[charIx] === " ") charIx++;
    let [alias, aliasIx] = getAlias(line, lineIx, charIx);
    let deselect;
    [deselect, charIx] = getDeselect(line, lineIx, charIx);
    let entity = line.slice(charIx, aliasIx).trim();
    if(!entity)
      return new ParseError(`Intersect step must specify a valid entity id`, line, lineIx, charIx, entity.length);
    let step:PlanFilterByEntity = {type: "filter by entity", id: alias, entity, deselect, relatedTo};
    return step;
  },

  // Calculations
  filter(line, lineIx, charIx) {
    // filter positive
    // filter >; a: 7, b: [person age]
    while(line[charIx] === " ") charIx++;
    let [alias, aliasIx] = getAlias(line, lineIx, charIx);
    let lastIx = charIx;
    let filter = readUntil(line, "{", charIx); // @NOTE: Need to remove alias
    charIx += filter.length;
    filter = filter.trim();
    if(!filter)
      return new ParseError(`Filter step must specify a valid filter id`, line, lineIx, lastIx);

    let args;
    [args, charIx] = getMapArgs(line, lineIx, charIx);
    if(args instanceof Error) return args;
    if(line.length > charIx) return new ParseError(`Filter step contains extraneous text`, line, lineIx, charIx);

    let step:PlanFilter = {type: "filter", id: alias, func: filter, args};
    return step;
  }
};

export function parsePlan(str:string):PlanStep[] {
  let plan:PlanStep[] = [];
  let errors = [];
  let lineIx = 0;
  let lines = str.split("\n")
  let stack:{indent: number, step: PlanStep}[] = [];
  for(let line of lines) {
    let charIx = 0;
    while(line[charIx] === " ") charIx++;
    let indent = charIx;
    if(line[charIx] === undefined)  continue;
    let related;
    for(let stackIx = stack.length - 1; stackIx >= 0; stackIx--) {
      if(indent > stack[stackIx].indent) {
        related = stack[stackIx].step;
        break;
      } else stack.pop();
    }
    let keyword = readUntil(line, " ", charIx);
    charIx += keyword.length;
    let step:Error|PlanStep;
    if(parsePlanStep[keyword]) step = parsePlanStep[keyword](line, lineIx, charIx, related);
    else step = new ParseError(`Keyword '${keyword}' is not a valid plan step, ignoring`, line, lineIx, charIx - keyword.length, keyword.length);

    if(step && step["args"]) {
      let args = step["args"];
      for(let arg in args) {
        if(args[arg] instanceof Array) {
          let [source] = args[arg];
          let valid = false;
          for(let step of plan) {
            if(step.id === source) {
              valid = true;
              break;
            }
          }
          if(!valid) {
            step = new ParseError(`Alias source '${source}' does not exist in plan`, line, lineIx, line.indexOf(`[${source},`) + 1, source.length);
          }
        }
      }
    }

    if(step instanceof Error) errors.push(step);
    else if(step) {
      plan.push(<PlanStep>step);
      stack.push({indent, step: <PlanStep>step});
    }

    lineIx++;
  }
  if(errors.length) {
    for(let err of errors) {
      console.error(err);
    }
  }
  return plan;
}

//-----------------------------------------------------------------------------
// Query DSL Parser
//-----------------------------------------------------------------------------
export interface QueryStep { type: string, id?: string }
interface QuerySelect extends QueryStep { view: string, join?: MapArgs }
interface QueryCalculate extends QueryStep { func: string, args: MapArgs }
interface QueryOrdinal extends QueryStep {}
interface QueryGroup extends QueryStep { groups: ListArgs }
interface QuerySort extends QueryStep { sorts: ListArgs }
interface QueryLimit extends QueryStep { limit: ListArgs }
interface QueryProject extends QueryStep { mapping: ListArgs }

let parseQueryStep:{[step: string]: (line: string, lineIx: number, charIx: number) => Error|QueryStep} = {
  ["#"]() { // Comment noop
    return;
  },
  select(line: string, lineIx: number, charIx: number) {
    while(line[charIx] === " ") charIx++;
    let [alias, aliasIx] = getAlias(line, lineIx, charIx);

    let lastIx = charIx;
    let viewRaw = readUntil(line, "{", charIx).slice(0, aliasIx ? aliasIx - charIx: undefined);
    charIx += viewRaw.length;
    let view = viewRaw.trim();
    if(!view)
      return new ParseError(`Select step must specify a valid view id`, line, lineIx, lastIx, viewRaw.length);

    let join;
    [join, charIx] = getMapArgs(line, lineIx, charIx);
    if(join instanceof Error) return join;

    let step:QuerySelect = {type: "select", id: alias, view, join};
    return step;
  },
  deselect(line: string, lineIx: number, charIx: number) {
    let step = parseQueryStep["select"](line, lineIx, charIx);
    if(step instanceof Error) return step;
    (<QueryStep>step).type = "deselect";
    return step;
  },
  calculate(line: string, lineIx: number, charIx: number) {
    while(line[charIx] === " ") charIx++;
    let [alias, aliasIx] = getAlias(line, lineIx, charIx);
    let lastIx = charIx;
    let funcRaw = readUntil(line, "{", charIx).slice(0, aliasIx ? aliasIx - charIx: undefined);
    charIx += funcRaw.length;
    let func = funcRaw.trim();

    if(!func)
      return new ParseError(`Calculate step must specify a valid function id`, line, lineIx, lastIx, funcRaw.length);

    let args;
    [args, charIx] = getMapArgs(line, lineIx, charIx);
    if(args instanceof Error) return args;

    let step:QueryCalculate = {type: "calculate", id: alias, func, args};
    return step;
  },
  aggregate(line: string, lineIx: number, charIx: number) {
    let step = parseQueryStep["calculate"](line, lineIx, charIx);
    if(step instanceof Error) return step;
    (<QueryStep>step).type = "aggregate";
    return step;
  },
  ordinal(line: string, lineIx: number, charIx: number) {
    let step:QueryOrdinal = {type: "ordinal"};
    return step;
  },
  group(line: string, lineIx: number, charIx: number) {
    while(line[charIx] === " ") charIx++;

    let groups;
    [groups, charIx] = getListArgs(line, lineIx, charIx);
    if(groups instanceof Error) return groups;

    let step:QueryGroup = {type: "group", groups}
    return step;
  },
  sort(line: string, lineIx: number, charIx: number) {
    while(line[charIx] === " ") charIx++;

    let sorts;
    [sorts, charIx] = getListArgs(line, lineIx, charIx);
    if(sorts instanceof Error) return sorts;

    let step:QuerySort = {type: "sort",  sorts}
    return step;
  },
  limit(line: string, lineIx: number, charIx: number) {
    while(line[charIx] === " ") charIx++;
    let args;
    [args, charIx] = getMapArgs(line, lineIx, charIx);
    if(args instanceof Error) return args;
    for(let key of Object.keys(args)) {
      if(key !== "results" && key !== "perGroup") return new ParseError(`Limit may only apply perGroup or to results`, line, lineIx, charIx);
    }

    let step:QueryLimit = {type: "limit", limit: args};
    return step;
  },
  project(line: string, lineIx: number, charIx: number) {
    while(line[charIx] === " ") charIx++;
    let args;
    [args, charIx] = getMapArgs(line, lineIx, charIx);
    if(args instanceof Error) return args;

    let step:QueryProject = {type: "project", mapping: args};
    return step;
  }
};

export function parseQuery(str:string):QueryStep[] {
  let plan:QueryStep[] = [];
  let errors = [];
  let lineIx = 0;
  let lines = str.split("\n")
  for(let line of lines) {
    let charIx = 0;
    while(line[charIx] === " ") charIx++;
    if(line[charIx] === undefined)  continue;
    let keyword = readUntil(line, " ", charIx);
    charIx += keyword.length;
    let step:Error|QueryStep;
    if(parseQueryStep[keyword]) step = parseQueryStep[keyword](line, lineIx, charIx);
    else step = new ParseError(`Keyword '${keyword}' is not a valid query step, ignoring`, line, lineIx, charIx - keyword.length, keyword.length);

    if(step && step["args"]) {
      let args = step["args"];
      for(let arg in args) {
        if(args[arg] instanceof Array) {
          let [source] = args[arg];
          let valid = false;
          for(let step of plan) {
            if(step.id === source) {
              valid = true;
              break;
            }
          }
          if(!valid) {
            step = new ParseError(`Alias source '${source}' does not exist in query`, line, lineIx, line.indexOf(`[${source},`) + 1, source.length);
          }
        }
      }
    }

    if(step instanceof Error) errors.push(step);
    else if(step) plan.push(<QueryStep>step);

    lineIx++;
  }
  if(errors.length) {
    // @FIXME: Return errors instead of logging them.
    for(let err of errors) {
      console.error(err.toString());
    }
  }
  return plan;
}

//-----------------------------------------------------------------------------
// UI DSL Parser
//-----------------------------------------------------------------------------
export interface UIElem {
  id?: string
  children?: UIElem[]
  embedded?: MapArgs // Undefined or the restricted scope of the embedded child.
  binding?: string
  attributes?: MapArgs
  events?: {[event:string]: MapArgs}
}

export function parseUI(str:string):UIElem[] {
  let root:UIElem = {};
  let elems:UIElem[] = [root];
  let errors = [];
  let lineIx = 0;
  let lines = str.split("\n");
  let stack:{indent: number, elem: UIElem}[] = [{indent: -2, elem: root}];
  // @FIXME: Chunk into element chunks instead of lines to enable in-argument continuation.
  for(let line of lines) {
    let charIx = 0;
    while(line[charIx] === " ") charIx++;
    let indent = charIx;
    if(line[charIx] === undefined)  continue;
    let parent:UIElem;
    for(let stackIx = stack.length - 1; stackIx >= 0; stackIx--) {
      if(indent > stack[stackIx].indent) {
        parent = stack[stackIx].elem;
        break;
      } else stack.pop();
    }
    let keyword = readUntil(line, " ", charIx);
    charIx += keyword.length;

    if(keyword[0] === "~") { //Handle binding
      charIx -= keyword.length - 1;
      if(!parent.binding) parent.binding = line.slice(charIx);
      else parent.binding += "\n" + line.slice(charIx);
      charIx = line.length;

    } else if(keyword[0] === "@") { // Handle event
      charIx -= keyword.length - 1;
      let err;
      while(line[charIx] === " ") charIx++;
      let lastIx = charIx;
      let eventRaw = readUntil(line, "{", charIx);
      charIx += eventRaw.length;
      let event = eventRaw.trim();

      if(!event) err = new ParseError(`UI event must specify a valid event name`, line, lineIx, lastIx, eventRaw.length);
      let state;
      [state, charIx] = getMapArgs(line, lineIx, charIx);
      if(state instanceof Error && !err) err = state;
      if(err) {
        errors.push(err);
        lineIx++;
        continue;
      }

      if(!parent.events) parent.events = {};
      parent.events[event] = state;

    } else if(keyword[0] === ">") { // Handle embed
      charIx -= keyword.length - 1;
      let err;
      while(line[charIx] === " ") charIx++;
      let lastIx = charIx;
      let embedIdRaw = readUntil(line, "{", charIx);
      charIx += embedIdRaw.length;
      let embedId = embedIdRaw.trim();

      if(!embedId) err = new ParseError(`UI embed must specify a valid element id`, line, lineIx, lastIx, embedIdRaw.length);
      let scope;
      [scope = {}, charIx] = getMapArgs(line, lineIx, charIx);
      if(scope instanceof Error && !err) err = scope;
      if(err) {
        errors.push(err);
        lineIx++;
        continue;
      }

      let elem = {embedded: scope, id: embedId};
      if(!parent.children) parent.children = [];
      parent.children.push(elem);
      stack.push({indent, elem});

    } else { // Handle element
      let err;
      if(!keyword) err = new ParseError(`UI element must specify a valid tag name`, line, lineIx, charIx, 0);
      while(line[charIx] === " ") charIx++;
      let classesRaw = readUntil(line, "{", charIx);
      charIx += classesRaw.length;
      let classes = classesRaw.trim();

      let attributes;
      [attributes = {}, charIx] = getMapArgs(line, lineIx, charIx);
      if(attributes instanceof Error && !err) err = attributes;
      if(err) {
        errors.push(err);
        lineIx++;
        continue;
      }
      attributes["t"] = keyword;
      if(classes) attributes["c"] = classes;
      let elem:UIElem = {id: attributes["id"], attributes};
      if(!parent.children) parent.children = [];
      parent.children.push(elem);
      stack.push({indent, elem});
    }

    lineIx++;
  }

  if(errors.length) {
    for(let err of errors) {
      console.error(err);
    }
  }
  return elems;
}

declare var exports;
window["parser"] = exports;