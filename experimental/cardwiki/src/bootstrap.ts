import {unpad, titlecase} from "./utils"
import * as runtime from "./runtime"
import * as wiki from "./wiki"
import * as app from "./app"
import {eve} from "./app"
import {parsePlan, PlanStep, parseQuery, QueryStep} from "./parser"

export var ixer = eve;
declare var uuid;


//-----------------------------------------------------------------------------
// Utilities
//-----------------------------------------------------------------------------

function queryFromSearch(search:string):runtime.Query {
  let result = wiki.newSearch(search);
  result.query.ordinal()
  return result.query;
}
export function queryFromPlanDSL(str:string):runtime.Query {
  return wiki.planToQuery(parsePlan(str));
}
export function queryFromQueryDSL(ixer:runtime.Indexer, str:string):runtime.Query {
  let plan = parseQuery(str);
  let query = new runtime.Query(ixer);
  for(let step of plan) {
    if(step.type === "select") query.select(step["view"], step["join"] || {}, step.id);
    else if(step.type === "deselect") query.deselect(step["view"], step["join"] || {});
    else if(step.type === "calculate") query.calculate(step["func"], step["args"], step.id);
    else if(step.type === "aggregate") query.aggregate(step["func"], step["args"], step.id);
    else if(step.type === "ordinal") query.ordinal();
    else if(step.type === "group") query.group(step["groups"]);
    else if(step.type === "sort") query.sort(step["sorts"]);
    else if(step.type === "limit") query.limit(step["limit"]);
    else if(step.type === "project") query.project(step["mapping"]);
    else throw new Error(`Unknown query step type '${step.type}'`);
  }
  return query;
}

class BSPhase {
  protected _views:{[view:string]: string} = {};
  protected _viewFields:{[view:string]: string[]} = {};

  constructor(public ixer:runtime.Indexer, public changeset = ixer.diff()) {}

  viewKind(view:string) {
    return this._views[view];
  }
  viewFields(view:string) {
    return this._viewFields[view];
  }
  apply() {
    for(let view in this._views) {
      if(this._views[view] !== "table") continue;
      ixer.addTable(view, this.viewFields[view]);
    }
    ixer.applyDiff(this.changeset);
  }

  //-----------------------------------------------------------------------------
  // Macros
  //-----------------------------------------------------------------------------
  addFact(table:string, fact:{}) {
    this.changeset.add(table, fact);
    return this;
  }

  addEntity(entity:string, name:string, kinds:string[], attributes?:{}, extraContent?:string) {
    let content = unpad(6) `
      # ${titlecase(name)} (${kinds.map((kind) => `{is a: ${kind}}`).join(", ")})
    `;
    if(attributes) {
      content += "## Attributes\n";
      for(let attr in attributes) content += `${attr}: {${attr}: ${attributes[attr]}}\n      `;
    }
    if(extraContent) content += "\n" + extraContent;
    this.addFact("builtin entity", {entity, content});
    return this;
  }

  addView(view:string, kind:string, fields:string[]) {
    this._views[view] = kind;
    this._viewFields[view] = fields;
    this.addFact("view", {view, kind: kind});
    for(let field of fields) this.addFact("field", {view, field});
    this.addEntity(view, view, ["system", kind], undefined, unpad(6) `
      ## Fields
      ${fields.map((field) => `* ${field}`).join("\n      ")}
    `);
    return this;
  }

  addTable(view:string, fields:string[]) {
    this.addView(view, "table", fields);
    return this;
  }

  addUnion(view:string, fields:string[]) {
    let table = `builtin ${view}`;
    this.addTable(table, fields);
    this.addView(view, "union", fields);
    this.addUnionMember(view, table);
    return this;
  }

  addUnionMember(union:string, member: string, mapping?:{}) {
    // apply the natural mapping.
    if(!mapping) {
      if(this.viewKind(union) !== "union") throw new Error(`Union '${union}' must be added before adding members`);
      mapping = {};
      for(let field of this.viewFields(union)) mapping[field] = field;
    }
    let action = `${union} <-- ${member}`;
    this.addFact("action", {view: union, action, kind: "union", ix: 0})
      .addFact("action source", {action, "source view": member});

    for(let field in mapping)
      this.addFact("action mapping", {action, from: field, "to source": member, "to field": mapping[field]});

    return this;
  }

  addQuery(view:string, query:runtime.Query) {
    query.name = view;
    this.addView(view, "query", Object.keys(query.projectionMap));
    this.changeset.merge(wiki.queryObjectToDiff(query));
  }
}

app.init("bootstrap", function bootstrap() {
  let phase = new BSPhase(eve);
  phase.addUnion("entity", ["entity", "content"])
    .addUnionMember("entity", "manual entity")
    .addUnionMember("entity", "action entity")
    .addUnionMember("entity", "unmodified added bits")
    .addUnionMember("entity", "automatic collection entities");

  phase.addEntity("collection", "collection", ["system"])
    .addEntity("system", "system", ["collection"])
    .addEntity("union", "union", ["system", "collection"])
    .addEntity("query", "query", ["system", "collection"])
    .addEntity("table", "table", ["system", "collection"]);

  phase.addQuery("unmodified added bits", queryFromQueryDSL(phase.ixer, unpad(4) `
    select added bits as [added]
    deselect manual entity {entity: [added, entity]}
    project {entity: [added, entity]; content: [added, content]}
  `));

  phase.apply();

  //-----------------------------------------------------------------------------
  // Testing
  //-----------------------------------------------------------------------------
  phase = new BSPhase(eve);
  let testData = {
    "test data": ["collection"],
    pet: ["collection"],
    exotic: ["collection"],
    dangerous: ["collection"],
    cat: ["pet"],
    dog: ["pet"],
    fish: ["pet"],
    snake: ["pet", "exotic"],
    koala: ["pet", "exotic"],
    sloth: ["pet", "exotic"],
    kangaroo: ["exotic"],
    giraffe: ["exotic"],
    gorilla: ["exotic", "dangerous"]
  };
  let testAttrs = {
    cat: {length: 4},
    dog: {length: 3},
    fish: {length: 1},
    snake: {length: 4},
    koala: {length: 3},
    sloth: {length: 3}
  };
  for(let entity in testData) phase.addEntity(entity, entity, ["test data"].concat(testData[entity]), testAttrs[entity]);

  phase.addQuery("exotic pet", queryFromPlanDSL(unpad(4) `
    gather pet as [animal]
      intersect exotic
      lookup length as [animal length]
      filterByEntity ! snake
      filter > { a: [animal length, value]; b: 1 }
  `));
  //phase.apply();
  window["p"] = phase;
});

declare var exports;
window["bootstrap"] = exports;