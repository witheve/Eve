import {unpad, titlecase, builtinId} from "./utils"
import * as runtime from "./runtime"
import * as app from "./app"
import {eve} from "./app"
import {UIElem, parseDSL, Artifacts} from "./parser"
import {normalizeString} from "./NLQueryParser"
import {UI} from "./uiRenderer"

export var ixer = eve;
declare var uuid;

//-----------------------------------------------------------------------------
// Utilities
//-----------------------------------------------------------------------------

runtime.define("normalize string", {result: "result"}, function(text) {
  if(typeof text === "string") {
    return {result: normalizeString(text)};
  }
  return {result: text};
})

// export function UIFromDSL(str:string):UI {
//   function processElem(data:UIElem):UI {
//     let elem = new UI(data.id || uuid());
//     if(data.binding) elem.bind(data.bindingKind === "query" ? parseDSL(data.binding);
//     if(data.embedded) elem.embed(data.embedded);
//     if(data.attributes) elem.attributes(data.attributes);
//     if(data.events) elem.events(data.events);
//     if(data.children) {
//       for(let child of data.children) elem.child(processElem(child));
//     }
//     return elem;
//   }
//   return processElem(parseUI(str));
// }

class BSPhase {
  protected _views:{[view:string]: string} = {};
  protected _viewFields:{[view:string]: string[]} = {};
  protected _entities:string[] = [];
  protected _uis:{[ui:string]: UI} = {};
  protected _queries:{[query:string]: runtime.Query} = {};
  protected _names:{[name:string]: string} = {};

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
    entity = builtinId(entity);
    this._names[name] = entity;
    this._entities.push(entity);
    this.addFact("display name", {id: entity, name: name});
    let isAs = [];
    for(let kind of kinds) {
      let sourceId = `${entity},is a,${kind}`;
      isAs.push(`{${kind}|rep=link; eav source = ${sourceId}}`);
      let collEntity = builtinId(kind);
      this.addFact("display name", {id: collEntity, name: kind});
      this.addFact("sourced eav", {entity, attribute: "is a", value: collEntity, source: sourceId})
    }
    let collectionsText = "";
    if(isAs.length)
      collectionsText = `${titlecase(name)} is a ${isAs.slice(0, -1).join(", ")} ${isAs.length > 1 ? "and" : ""} ${isAs[isAs.length - 1]}.`;
    let content = unpad(6) `
      ${collectionsText}
    `;
    if(attributes) {
      for(let attr in attributes) {
        let sourceId = `${entity},${attr},${attributes[attr]}`;
        let value = this._names[attributes[attr]] || attributes[attr];
        this.addFact("sourced eav", {entity, attribute: attr, value, source: sourceId});
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
    let entity = `${view} view`;
    this.addEntity(entity, entity, ["system", kind], undefined, unpad(6) `
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
    for(let view in artifacts.views) {
      this._views[view] = "query";
    }
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

}

//-----------------------------------------------------------------------------
// Runtime Setup
//-----------------------------------------------------------------------------

app.init("bootstrap", function bootstrap() {
  //-----------------------------------------------------------------------------
  // Entity System
  //-----------------------------------------------------------------------------
  let phase = new BSPhase(eve);
  phase.changeset.addMany("display name", [{id: "is a", name: "is a"}, {id: "content", name: "content"}, {id: "artifact", name: "artifact"}]);
  phase.addTable("manual entity", ["entity", "content"]);
  phase.addTable("sourced eav", ["entity", "attribute", "value", "source"]);
  phase.addTable("page content", ["page", "content"]);
  phase.addTable("entity page", ["entity", "page"]);
  phase.addTable("action entity", ["entity", "content", "source"]);
  phase
    .addEntity("entity", "entity", ["system"])
    .addEntity("collection", "collection", ["system"])
    .addEntity("system", "system", ["system", "collection"])
    .addEntity("union", "union", ["system", "collection"])
    .addEntity("query", "query", ["system", "collection"])
    .addEntity("table", "table", ["system", "collection"])
    .addEntity("ui", "ui", ["system", "collection"])
    .addEntity("home", "home", ["system"], undefined, unpad(6) `
      {entity|rep = directory}
    `);

  phase.addUnion("entity eavs", ["entity", "attribute", "value"], true)
    .addUnionMember("entity eavs", "generated eav", {entity: "entity", attribute: "attribute", value: "value"})
    .addUnionMember("entity eavs", "sourced eav", {entity: "entity", attribute: "attribute", value: "value"})
    // this is a stored union that is used by the add eav action to take query results and
    // push them into eavs, e.g. sum salaries per department -> [total salary = *]
    .addUnionMember("entity eavs", "added eavs");

  phase.addUnion("entity links", ["entity", "link", "type"])
    .addUnionMember("entity links", "eav entity links")
    .addUnionMember("entity links", "is a attributes", {entity: "entity", link: "collection", type: ["is a"]});

  phase.addUnion("directionless links", ["entity", "link"])
    .addUnionMember("directionless links", "entity links")
    .addUnionMember("directionless links", "entity links", {entity: "link", link: "entity"});

  phase.addUnion("collection entities", ["entity", "collection"])
    .addUnionMember("collection entities", "is a attributes");

  phase.addArtifacts(parseDSL(`
    (query :$$view "bs: index name"
      (display-name :id id :name raw)
      (normalize-string :text raw :result name)
      (project! "index name" :id id :name name))
  `));
  
  phase.addArtifacts(parseDSL(`
    (query :$$view "bs: entity"
      (entity-page :entity entity :page page)
      (page-content :page page :content content)
      (project! "entity" :entity entity :content content))
  `));

  phase.addArtifacts(parseDSL(`
    (query :$$view "bs: unmodified added bits"
      (added-bits :entity entity :content content)
      (negate (manual-entity :entity entity))
      (project! "unmodified added bits" :entity entity :content content))
  `));

  phase.addArtifacts(parseDSL(`
    (query :$$view "bs: is a attributes"
      (entity-eavs :attribute "is a" :entity entity :value value)
      (project! "is a attributes" :collection value :entity entity))
  `));

  // @HACK: this view is required because you can't currently join a select on the result of a function.
  // so we create a version of the eavs table that already has everything lowercased.
  phase.addArtifacts(parseDSL(`
    (query :$$view "bs: lowercase eavs"
      (entity-eavs :entity entity :attribute attribute :value value)
      (lowercase :text value :result lowercased)
      (project! "lowercase eavs" :entity entity :attribute attribute :value lowercased))
  `));

  phase.addArtifacts(parseDSL(`
    (query :$$view "bs: eav entity links"
      (entity-eavs :entity entity :attribute attribute :value value)
      (entity :entity value)
      (project! "eav entity links" :entity entity :type attribute :link value))
  `));

  phase.addArtifacts(parseDSL(`
    (query :$$view "bs: collection"
      (is-a-attributes :collection entity)
      (query :$$view "bs: collection count"
        (is-a-attributes :collection entity :entity child)
        (count :count childCount))
      (project! "collection" :collection entity :count childCount))
  `));

  phase.addEntity("entity", "entity", ["system"]);
  phase.addEntity("collection", "collection", ["system"]);
  phase.addArtifacts(parseDSL(unpad(4) `
    (query :$$view "bs: entity eavs from entities"
      (entity :entity entity)
      (project! "entity eavs" :entity entity :attribute "is a" :value "${builtinId("entity")}"))
  `));
  phase.addArtifacts(parseDSL(unpad(4) `
    (query :$$view "bs: entity eavs from collections"
      (is-a-attributes :collection coll)
      (project! "entity eavs" :entity coll :attribute "is a" :value "${builtinId("collection")}"))
  `));
/*  phase.addArtifacts(parseDSL(unpad(4) `
    (query
      (entity :entity entity)
      (negate (query
        (directionless-links :entity entity :link link)
        (!= link "AUTOGENERATED entity THIS SHOULDN'T SHOW UP ANYWHERE")
        (!= link "AUTOGENERATED orphaned THIS SHOULDN'T SHOW UP ANYWHERE")
        ))
      (project! "entity eavs" :entity coll :attribute "is a" :value "AUTOGENERATED collection THIS SHOULDN'T SHOW UP ANYWHERE"))
`));*/

  phase.addTable("ui pane", ["pane", "kind", "rep", "contains", "params"]);
  if(eve.find("ui pane").length === 0) phase.addFact("ui pane", {pane: "p1", kind: 0, rep: "entity", contains: "", params: ""});
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
    "test data": [],
    pet: [],
    exotic: [],
    dangerous: [],
    cat: ["pet"],
    dog: ["pet"],
    fish: ["pet"],
    snake: ["pet", "exotic"],
    koala: ["pet", "exotic"],
    sloth: ["pet", "exotic"],
    kangaroo: ["exotic"],
    giraffe: ["exotic"],
    gorilla: ["exotic", "dangerous"],

    company: [],
    kodowa: ["company"],

    department: [],
    engineering: ["department"],
    operations: ["department"],
    magic: ["department"],

    employee: [],
    josh: ["employee"],
    corey: ["employee"],
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
    chris: {department: "engineering", salary: 10},
    eric: {department: "engineering", salary: 7},
    rob: {department: "operations", salary: 10},
  };
  for(let entity in testData) phase.addEntity(entity, entity, ["test data"].concat(testData[entity]), testAttrs[entity], "");

  // phase.addTable("department", ["department"])
  //   .addFact("department", {department: "engineering"})
  //   .addFact("department", {department: "operations"})
  //   .addFact("department", {department: "magic"});
  // phase.addTable("employee", ["department", "employee", "salary"])
  //   .addFact("employee", {department: "engineering", employee: "josh", salary: 10})
  //   .addFact("employee", {department: "engineering", employee: "corey", salary: 11})
  //   .addFact("employee", {department: "engineering", employee: "chris", salary: 7})
  //   .addFact("employee", {department: "operations", employee: "rob", salary: 7});

  // phase.apply(true);
  window["p"] = phase;
});

declare var exports;
window["bootstrap"] = exports;
