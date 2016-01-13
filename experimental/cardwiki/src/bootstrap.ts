import {unpad, titlecase} from "./utils"
import * as runtime from "./runtime"
import {addBitAction} from "./wiki"
import * as app from "./app"
import {eve} from "./app"
import {queryToExecutable} from "./queryParser.ts"
import {parsePlan, PlanStep, parseQuery, QueryStep, parseUI, UIElem, parseDSL, Artifacts} from "./parser"
import {UI} from "./uiRenderer"

export var ixer = eve;
declare var uuid;

//-----------------------------------------------------------------------------
// Utilities
//-----------------------------------------------------------------------------

function queryFromSearch(search:string):runtime.Query {
  let result = queryToExecutable(search);
  result.executable.ordinal()
  return result.executable;
}
export function queryFromPlanDSL(str:string):runtime.Query {
  return queryToExecutable(parsePlan(str));
}
export function queryFromQueryDSL(str:string):runtime.Query {
  let plan = parseQuery(str);
  let query = new runtime.Query(ixer);
  let ix = 0;
  for(let step of plan) {
    let id = step.id || `${step.type}||${ix}`;
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
export function UIFromDSL(str:string):UI {
  function processElem(data:UIElem):UI {
    let elem = new UI(data.id || uuid());
    if(data.binding) elem.bind(data.bindingKind === "query" ? queryFromQueryDSL(data.binding) : queryFromPlanDSL(data.binding));
    if(data.embedded) elem.embed(data.embedded);
    if(data.attributes) elem.attributes(data.attributes);
    if(data.events) elem.events(data.events);
    if(data.children) {
      for(let child of data.children) elem.child(processElem(child));
    }
    return elem;
  }
  return processElem(parseUI(str));
}

class BSPhase {
  protected _views:{[view:string]: string} = {};
  protected _viewFields:{[view:string]: string[]} = {};
  protected _entities:string[] = [];
  protected _uis:{[ui:string]: UI} = {};
  protected _queries:{[query:string]: runtime.Query} = {};

  constructor(public ixer:runtime.Indexer, public changeset = ixer.diff()) {}

  viewKind(view:string) {
    return this._views[view];
  }
  viewFields(view:string) {
    return this._viewFields[view];
  }
  apply(nukeExisting?:boolean) {
    for(let view in this._views) {
      if(this._views[view] === "table") ixer.addTable(view, this._viewFields[view]);
    }
    if(nukeExisting) {
      for(let view in this._views) {
        if(this._views[view] !== "table") this.changeset.merge(runtime.Query.remove(view, this.ixer));
      }
      for(let entity of this._entities) this.changeset.remove("builtin entity", {entity});
      for(let ui in this._uis) this.changeset.merge(UI.remove(ui, this.ixer));
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
    this._entities.push(entity);
    let isAs = [];
    for(let kind of kinds) {
        let sourceId = `${entity},is a,${kind}`;
        isAs.push(`{${kind}|eav source = ${sourceId}}`);
        this.addFact("sourced eav", {entity, attribute: "is a", value: kind, source: sourceId})
    }
    let collectionsText = "";
    if(isAs.length)
      collectionsText = `${titlecase(name)} is a ${isAs.slice(0, -1).join(", ")} ${isAs.length > 1 ? "and" : ""} ${isAs[isAs.length - 1]}.`;
    let content = unpad(6) `
      # ${name}
      ${collectionsText}
    `;
    if(attributes) {
      content += "Attributes\n";
      for(let attr in attributes) {
          let sourceId = `${entity},${attr},${attributes[attr]}`;
          content += `${attr}: {${name}'s ${attr}|eav source = ${sourceId}}\n      `;
          this.addFact("sourced eav", {entity, attribute: attr, value: attributes[attr], source: sourceId});
      }
    }
    if(extraContent) content += "\n" + extraContent;
    let page = `${entity}|root`;
    this.addFact("page content", {page, content});
    this.addFact("entity page", {entity, page});
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

  addUnion(view:string, fields:string[], builtin:boolean = true) {
    this.addView(view, "union", fields);
    if(builtin) {
      let table = `builtin ${view}`;
      this.addTable(table, fields);
      this.addUnionMember(view, table);
    }

    return this;
  }

  addUnionMember(union:string, member: string, mapping?:{}) {
    // apply the natural mapping.
    if(!mapping) {
      if(this.viewKind(union) !== "union") throw new Error(`Union '${union}' must be added before adding members`);
      mapping = {};
      for(let field of this.viewFields(union)) mapping[field] = field;
    }
    let action = `${union} <-- ${member} <-- ${JSON.stringify(mapping)}`;
    this.addFact("action", {view: union, action, kind: "union", ix: 0})
      .addFact("action source", {action, "source view": member});

    for(let field in mapping) {
      let mapped = mapping[field];
      if(mapped.constructor === Array) {
        this.addFact("action mapping constant", {action, from: field, "value": mapped[0]});
      } else {
        this.addFact("action mapping", {action, from: field, "to source": member, "to field": mapped});
      }
    }
    return this;
  }

  addQuery(view:string, query:runtime.Query) {
    query.name = view;
    this._queries[view] = query;
    this.addView(view, "query", Object.keys(query.projectionMap || {}));
    this.changeset.merge(query.changeset(this.ixer));
    return this;
  }

  addArtifacts(artifacts:Artifacts) {
    let views = artifacts.views;
    console.log("adding artifacts", views);
    for(let id in views) this.changeset.merge(views[id].changeset(eve));
    return this;
  }

  addUI(id:string, ui:UI) {
    ui.id = id;
    this._uis[id] = ui;
    this.addEntity(id, id, ["system", "ui"]);
    this.changeset.merge(ui.changeset(this.ixer));
    return this;
  }

  generateBitAction(name:string, queryOrName:string|runtime.Query, template:string) {
    let query:runtime.Query;
    if(typeof queryOrName === "string") query = this._queries[queryOrName];
    else query = queryOrName;
    this.changeset.merge(addBitAction(name, template));
    return this;
  }
}

//-----------------------------------------------------------------------------
// Runtime Setup
//-----------------------------------------------------------------------------
runtime.define("parse natural", {multi: true}, function(text:string) {
  return queryToExecutable(text).plan;
});

runtime.define("parse plan", {multi: true}, function(text:string) {
  return parsePlan(text);
});

app.init("bootstrap", function bootstrap() {
  //-----------------------------------------------------------------------------
  // Entity System
  //-----------------------------------------------------------------------------
  let phase = new BSPhase(eve);
  phase.addTable("manual entity", ["entity", "content"]);
  phase.addTable("manual eav", ["entity", "attribute", "value"]);
  phase.addTable("sourced eav", ["entity", "attribute", "value", "source"]);
  phase.addTable("page content", ["page", "content"]);
  phase.addTable("entity page", ["entity", "page"]);
  phase.addTable("action entity", ["entity", "content", "source"]);
  phase.addEntity("collection", "collection", ["system"])
    .addEntity("system", "system", ["collection"])
    .addEntity("union", "union", ["system", "collection"])
    .addEntity("query", "query", ["system", "collection"])
    .addEntity("table", "table", ["system", "collection"])
    .addEntity("ui", "ui", ["system", "collection"]);

  phase.addQuery("entity", queryFromQueryDSL(unpad(4) `
    select entity page as [ent]
    select page content {page: [ent, page]} as [page]
    project {entity: [ent, entity]; content: [page, content]}
  `));

  phase.addQuery("unmodified added bits", queryFromQueryDSL(unpad(4) `
    select added bits as [added]
    deselect manual entity {entity: [added, entity]}
    project {entity: [added, entity]; content: [added, content]}
  `));

  phase.addUnion("entity eavs", ["entity", "attribute", "value"], true)
    .addUnionMember("entity eavs", "manual eav")
    .addUnionMember("entity eavs", "generated eav", {entity: "entity", attribute: "attribute", value: "value"})
    .addUnionMember("entity eavs", "sourced eav", {entity: "entity", attribute: "attribute", value: "value"})
    // this is a stored union that is used by the add eav action to take query results and
    // push them into eavs, e.g. sum salaries per department -> [total salary = *]
    .addUnionMember("entity eavs", "added eavs");

  phase.addQuery("is a attributes", queryFromQueryDSL(unpad(4) `
    select entity eavs {attribute: is a} as [is a]
    project {collection: [is a, value]; entity: [is a, entity]}
  `));

  // @HACK: this view is required because you can't currently join a select on the result of a function.
  // so we create a version of the eavs table that already has everything lowercased.
  phase.addQuery("lowercase eavs", queryFromQueryDSL(unpad(4) `
    select entity eavs as [eav]
    calculate lowercase {text: [eav, value]} as [lower]
    project {entity: [eav, entity];  attribute: [eav, attribute]; value: [lower, result]}
  `));

  phase.addQuery("eav entity links", queryFromQueryDSL(unpad(4) `
    select lowercase eavs as [eav]
    select entity {entity: [eav, value]} as [entity]
    project {entity: [eav, entity]; link: [entity, entity]; type: [eav, attribute]}
  `));

  phase.addUnion("entity links", ["entity", "link", "type"])
    .addUnionMember("entity links", "eav entity links")
    .addUnionMember("entity links", "is a attributes", {entity: "entity", link: "collection", type: ["is a"]});

  phase.addUnion("directionless links", ["entity", "link"])
    .addUnionMember("directionless links", "entity links")
    .addUnionMember("directionless links", "entity links", {entity: "link", link: "entity"});

  phase.addUnion("collection entities", ["entity", "collection"])
    .addUnionMember("collection entities", "is a attributes");


  phase.addQuery("collection", queryFromQueryDSL(unpad(4) `
    select is a attributes as [coll]
    group {[coll, collection]}
    aggregate count as [count]
    project {collection: [coll, collection]; count: [count, count]}
  `));

  phase.addTable("ui pane", ["pane", "contains", "kind"]);
  if(eve.find("ui pane").length === 0) phase.addFact("ui pane", {pane: "p1", contains: "pet", kind: 0});

  // phase.addArtifacts(parseDSL(unpad(4) `
  //   (query
  //     (is-a-attributes :entity entity :collection "ui pane")
  //     (entity-eavs :attribute "contains" :value contains)
  //     (project! "ui pane" :pane entity :contains contains))
  // `));

  phase.apply(true);

  //-----------------------------------------------------------------------------
  // Wiki Logic
  //-----------------------------------------------------------------------------
  phase = new BSPhase(eve);
  phase.addUnion("search", ["id", "top", "left"]);
  phase.addUnion("search query", ["id", "search"]);
  // phase.addQuery("searches to entities shim", queryFromQueryDSL(unpad(4) `
  //   select search as [search]
  //   select search query {id: [search, id]} as [query]
  //   project {id: [search, id]; text: [query, search]; top: [search, top]; left: [search, left]}
  // `));
//   phase.generateBitAction("searches to entities shim", "searches to entities shim", unpad(4) `
//     # {id}
//     ({is a: search}, {is a: system})
//     search: {search: {search}}
//     left: {left: {left}}
//     top: {top: {top}}
//   `);

  phase.apply(true);

  //-----------------------------------------------------------------------------
  // UI
  //-----------------------------------------------------------------------------
  phase = new BSPhase(eve);

  // @FIXME: These should probably be unionized.
  function resolve(table, fields) {
    return fields.map((field) => `${table}: ${field}`);
  }
  phase.addTable("ui template", resolve("ui template", ["template", "parent", "ix"]));
  phase.addTable("ui template binding", resolve("ui template binding", ["template", "query"]));
  phase.addTable("ui embed", resolve("ui embed", ["embed", "template", "parent", "ix"]));
  phase.addTable("ui embed scope", resolve("ui embed scope", ["embed", "key", "value"]));
  phase.addTable("ui embed scope binding", resolve("ui embed scope binding", ["embed", "key", "source", "alias"]));
  phase.addTable("ui attribute", resolve("ui attribute", ["template", "property", "value"]));
  phase.addTable("ui attribute binding", resolve("ui attribute binding", ["template", "property", "source", "alias"]));
  phase.addTable("ui event", resolve("ui event", ["template", "event"]));
  phase.addTable("ui event state", resolve("ui event state", ["template", "event", "key", "value"]));
  phase.addTable("ui event state binding", resolve("ui event state binding", ["template", "event", "key", "source", "alias"]));

  phase.addTable("system ui", ["template"]);

  phase.apply(true);

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
    gorilla: ["exotic", "dangerous"],

    kodowa: ["company"],

    engineering: ["department"],
    operations: ["department"],
    magic: ["department"],

    josh: ["employee"],
    corey: ["employee"],
    jamie: ["employee"],
    chris: ["employee"],
    rob: ["employee"],
    eric: ["employee"],
  };
  let testAttrs = {
    cat: {length: 4},
    dog: {length: 3},
    fish: {length: 1},
    snake: {length: 4},
    koala: {length: 3},
    sloth: {length: 3},
    engineering: {company: "kodowa"},
    operations: {company: "kodowa"},
    magic: {company: "kodowa"},

    josh: {department: "engineering", salary: 7},
    corey: {department: "engineering", salary: 10},
    jamie: {department: "engineering", salary: 7},
    chris: {department: "engineering", salary: 10},
    eric: {department: "engineering", salary: 7},
    rob: {department: "operations", salary: 10},
  };
  for(let entity in testData) phase.addEntity(entity, entity, ["test data"].concat(testData[entity]), testAttrs[entity]);

  // phase.addTable("department", ["department"])
  //   .addFact("department", {department: "engineering"})
  //   .addFact("department", {department: "operations"})
  //   .addFact("department", {department: "magic"});
  // phase.addTable("employee", ["department", "employee", "salary"])
  //   .addFact("employee", {department: "engineering", employee: "josh", salary: 10})
  //   .addFact("employee", {department: "engineering", employee: "corey", salary: 11})
  //   .addFact("employee", {department: "engineering", employee: "chris", salary: 7})
  //   .addFact("employee", {department: "operations", employee: "rob", salary: 7});

//   phase.apply(true);
  window["p"] = phase;
});

declare var exports;
window["bootstrap"] = exports;