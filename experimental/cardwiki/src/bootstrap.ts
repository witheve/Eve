import {unpad, underline, tail} from "./utils"
import * as runtime from "./runtime"
import * as wiki from "./wiki"
import * as app from "./app"
import {eve} from "./app"

export var ixer = eve;
declare var uuid;

interface PlanStep {
  id: string
  size?: number
  name?: string
  type?: string // find | <other>
  relatedTo?: PlanStep
}
interface PlanFind extends PlanStep {
  entity?: string
}
interface PlanGather extends PlanStep {
  collection?: string
}
interface PlanLookup extends PlanStep {
  attribute: string
  deselect?: boolean
}
interface PlanIntersect extends PlanStep {
  deselect?: boolean
  collection: string
  entity?: string
}
interface PlanFilterByEntity extends PlanStep {
  deselect?: boolean
  entity: string
}
interface PlanFilter extends PlanStep {
  func: string
  args: {[param:string]:[string, string]|any} // value may be a [source, alias] pair to be applied or a constant
}
interface PlanCalculate extends PlanStep {
  func: string
  args: {[param:string]:[string, string]|any} // value may be a [source, alias] pair to be applied or a constant
}
interface PlanAggregate extends PlanStep {
  aggregate: string
  args: {[param:string]:[string, string]|any} // value may be a [source, alias] pair to be applied or a constant
}
interface PlanGroup extends PlanStep {
  groups: any
}
interface PlanSort extends PlanStep {
  sort: any
}
interface PlanLimit extends PlanStep {
  limit: any
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

export function getAlias(line, lineIx, charIx):[string, number] {
  let alias = uuid();
  let aliasIx = line.lastIndexOf("as [");
  if(aliasIx !== -1) {
    alias = readUntil(line, "]", aliasIx + 4, new ParseError(`Alias must terminate in a closing ']'`, line, lineIx, line.length));
    if(alias instanceof Error) return alias;
  } else aliasIx = undefined;
  return [alias, aliasIx];
}

export function getDeselect(line, lineIx, charIx):[boolean, number] {
  let deselect = false;
  if(line[charIx] === "!") {
    deselect = true;
    charIx++;
    while(line[charIx] === " ") charIx++;
  }
  return [deselect, charIx];
}

export function getArgs(line, lineIx, charIx):[Error, number]|[{}, number] {
  let args = {};
  if(line[charIx] === "{") {
    let endIx = line.indexOf("}", charIx);
    if(endIx === -1) return [new ParseError(`Args must terminate in a closing '}'`, line, lineIx, line.length), line.length];
    for(let pair of line.slice(++charIx, endIx).split(";")) {
      let [key, val] = pair.split(":");
      let trimmedVal = val.trim();
      if(key === undefined || val === undefined)
        return [new ParseError(`Args must be specified in key: value pairs`, line, lineIx, charIx, pair.length), charIx + pair.length + 1];

      if(trimmedVal[0] === "[") {
        let valIx = charIx + pair.indexOf("[");
        if(trimmedVal[trimmedVal.length - 1] !== "]") return [new ParseError(`Attribute Aliases must terminate in a closing ']'`, line, lineIx, valIx), valIx];
        let [source, attribute] = trimmedVal.slice(1, -1).split(",");
        if(!attribute) return [new ParseError(`Attribute Aliases must contain a source, attribute pair`, line, lineIx, valIx), valIx];
        args[key.trim()] = [source.trim(), attribute.trim()];
      } else {
        args[key.trim()] = wiki.coerceInput(trimmedVal);
      }

      charIx += pair.length + 1;
    }
    return [args, endIx + 1];
  }
  return [new ParseError(`Arguments are specified as {key: value, key2: 7}`, line, lineIx, charIx), charIx];
}

let parseStep:{[step: string]: (line: string, lineIx: number, charIx: number, related?: PlanStep) => Error|PlanStep} = {
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
    [args, charIx] = getArgs(line, lineIx, charIx);
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
    if(parseStep[keyword]) step = parseStep[keyword](line, lineIx, charIx, related);
    else step = new ParseError(`Keyword '${keyword}' is not a valid plan step, ignoring`, line, lineIx, charIx, keyword.length);

    if(step["args"]) {
      let args = step["args"];
      for(let arg in args) {
        if(args[arg] instanceof Array) {
          let [source] = args[arg];
          console.log(source);
          let valid = false;
          for(let step of plan) {
            if(step.id === source) {
              valid = true;
              break;
            }
          }
          if(!valid) {
            step = new ParseError(`Alias source '${source}' does not exist in plan`, line, lineIx, charIx)
          }
        }
      }
    }

    if(step instanceof Error) errors.push(step);
    else {
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

function queryFromSearch(search:string):runtime.Query {
  let result = wiki.newSearch(search);
  console.log(result);
  return result.query;
}
export function queryFromPlanDSL(str:string):runtime.Query {
  let plan:PlanStep[] = parsePlan(str);
  return wiki.planToQuery(plan);
}

let changeset = eve.diff();

let tables = {};
let unions = {};
let queries = {};

//-----------------------------------------------------------------------------
// Macros
//-----------------------------------------------------------------------------
function addFact(table:string, fact:{}) {
  changeset.add(table, fact);
}

function addTable(id:string, fields:string[]) {
  tables[id] = eve.addTable(id, fields);
  addFact("entity collection", {entity: id, collection: "table"});
  addFact("manual entity", {entity: id, content: `
    # ${id} (Table)
    ${id.split(" ").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ")} is a builtin table.
  `});
}

function addBuiltin(view, fields) {
  let table = `builtin ${view}`;
  addTable(table, fields);
  changeset.add("view", {view, kind: "union"});
  addBuiltinMember(view, table, fields.reduce((memo, field) => memo[field] = field, {}));
  addFact("entity collection", {entity: view, collection: "union"});
  addFact("manual entity", {entity: view, content: `
    # ${view} (Union)
    ${view.split(" ").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ")} is a builtin union.
  `});
}

function addBuiltinMember(union:string, member: string, mapping:{}) {
  let action = `builtin ${member} -> ${union} union`;
  changeset.add("action", {view: union, action, kind: "union", ix: 0})
    .add("action source", {action, "source view": member});

  for(let field in mapping) {
    changeset.add("action mapping", {action, from: field, "to source": member, "to field": mapping[field]});
  }

}

function addQuery(id, query:runtime.Query) {
  query.name = id;
  console.log("diff", wiki.queryObjectToDiff(query));
  changeset.merge(wiki.queryObjectToDiff(query));
  addFact("entity collection", {entity: id, collection: "query"});
  addFact("manual entity", {entity: id, content: `
    # ${id} (Query)
    ${id.split(" ").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ")} is a builtin query.
  `});
}

app.init("bootstrap", function bootstrap() {
  //-----------------------------------------------------------------------------
  // Builtins
  //-----------------------------------------------------------------------------
  addBuiltin("entity", ["entity", "content"]);
  addBuiltin("entity collection", ["entity", "collection"]);
  //eve.applyDiff(changeset);

  //-----------------------------------------------------------------------------
  // Search-based queries
  // @NOTE: Must be registered in phase 2 due to parser reliance on known data.
  //-----------------------------------------------------------------------------
  //addQuery("entity test", queryFromSearch("sources for view"));

  //-----------------------------------------------------------------------------
  // Shim
  //-----------------------------------------------------------------------------
});

declare var exports;
window["bootstrap"] = exports;