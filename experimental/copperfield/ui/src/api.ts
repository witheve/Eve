/// <reference path="indexer.ts" />
module Api {
  declare var window;
  export var uuid:()=>string = window.uuid;

  export type Dict = Indexer.Dict;
  type Id = string;
  type PopulatedFact = {[key:string]: any, dependents?: {[type: string]: PopulatedFact}}

  export var DEBUG = {
    RECEIVE: 0,
    SEND: 3,
    DISPATCH: false,
    STRUCTURED_CHANGE: false,
    BOOTSTRAP: true,
    RENDERER: false,
    RENDER_TIME: false,
    TABLE_CELL_LOOKUP: true
  };

  if(!window.DEBUG) window.DEBUG = DEBUG;
  else DEBUG = window.DEBUG;

  export const KEYS = {
    TAB: 9,
    BACKSPACE: 8,
    UP: 38,
    DOWN: 40,
    ENTER: 13,
    Z: 90,
    F: 70,
    ESC: 27,
    SPACE: 32,
  };

  export const alphabet = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
                           "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];
  export const alphabetLower = alphabet.map(function(char) {
    return char.toLowerCase();
  });

  //---------------------------------------------------------------------------
  // Utilities
  //---------------------------------------------------------------------------
  export var arraysIdentical = Indexer.arraysIdentical;
  export var identical = Indexer.identical;

  function isDict(val:any): val is Dict {
    return val && typeof val === "object" && val.constructor !== Array;
  };

  export function clone<T>(item:T): T;
  export function clone(item:Object): Object;
  export function clone(item:any[]): any[];
  export function clone(item:any): any {
    if (!item) { return item; }
    if(item.constructor === Array) {
      let result = [];
      let ix = 0;
      for(let child of item) {
        result[ix++] = clone(child);
      }
      return result;
    }
    if(typeof item == "object") {
      let result = {};
      for (var key in item) {
        result[key] = clone(item[key]);
      }
      return result;
    }
    return item;
  }

  export function now() {
    if (window.performance) return window.performance.now();
    return (new Date()).getTime();
  }

  export function debounce(wait, func) {
    var timer;
    var args;
    var runner = function() {
      timer = false;
      return func.apply(null, args);
    }
    return function() {
      args = arguments;
      if(timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(runner, wait);
      return timer;
    }
  }

  export function extend(dest, src) {
    for(var key in src) {
      if(!src.hasOwnProperty(key)) { continue; }
      dest[key] = src[key];
    }
    return dest;
  }

  export function wrap(key:string, values:any[]):Dict[] {
    let res = [];
    for(let value of values) {
      res[res.length] = {[key]: value};
    }
    return res;
  }
  export function extract(key:string, objs:Dict[]):any[] {
    let res = [];
    for(let obj of objs) {
      res[res.length] = obj[key];
    }
    return res;
  }
  export function omit(key:string, objs:Dict[]):Dict[] {
    for(let obj of objs) {
      delete obj[key];
    }
    return objs;
  }

  export function displaySort(idA:string, idB:string): number {
    var orderA = (ixer.findOne("display order", {"display order: id": idA}) || {})["display order: priority"];
    var orderB = (ixer.findOne("display order", {"display order: id": idB}) || {})["display order: priority"];
    if(orderA - orderB) { return orderA - orderB; }
    else { return idA.localeCompare(idB); }
  }

  // @NOTE Rows array will be mutated in place. Please slice in advance if source cannot be mutated.
  export function sortRows(rows:any[], field:string|number, direction:number) {
    rows.sort(function sort(factA:Dict, factB:Dict) {
      var a, b;
      if(direction >= 0) [a, b] = [factA[field], factB[field]];
      else [b, a] = [factA[field], factB[field]];

      var typeA = typeof a;
      var typeB = typeof b;
      if(typeA === typeB && typeA === "number") { return a - b; }
      if(typeA === "number") { return -1; }
      if(typeB === "number") { return 1; }
      if(typeA === "undefined") { return -1; }
      if(typeB === "undefined") { return 1; }
      if(a.constructor === Array) { return JSON.stringify(a).localeCompare(JSON.stringify(b)); }
      return a.toString().localeCompare(b);
    });
  }

  //---------------------------------------------------------
  // Data
  //---------------------------------------------------------
  export var ixer = new Indexer.Indexer();
  export var newPrimitiveDefaults = {
    "<": {"<: A": 0, "<: B": 0},
    "<=": {"<=: A": 0, "<=: B": 0},
    "!=": {"!=: A": 0, "!=: B": 0},
    "+": {"+: A": 0, "+: B": 0},
    "*": {"*: A": 0, "*: B": 0},
    "-": {"-: A": 0, "-: B": 0},
    "/": {"/: A": 0, "/: B": 0},
    remainder: {"remainder: A": 0, "remainder: B": 0},
    round: {"round: A": 0, "round: B": 0},
    contains: {"contains: inner": " ", "contains: outer": ""},
    count: {"count: A": []},
    mean: {"mean: A": []},
    split: {"split: split": " ", "split: string": ""},
    concat: {"concat: A": "", "concat: B": ""},
    "as number": {"as number: A": "0"},
    "as text": {"as text: A": ""},
    "standard deviation": {"standard deviation: A": []},

    sum: {"sum: A": []}
  }

  //---------------------------------------------------------
  // Data interaction code
  //---------------------------------------------------------

  export var get = {
    name: (id:Id):string => (ixer.findOne("display name", {"display name: id": id}) || {})["display name: name"] || "",
    order: (id:Id):number => (ixer.findOne("display order", {"display order: id": id}) || {})["display order: priority"] || 0,
    tags: (id:Id):string[] => extract("tag: tag", ixer.find("tag", {"tag: view": id}) || []),
    hasTag: function(id:Id, tag:string): boolean {
      let tags = ixer.find("tag", {"tag: view": id});
      for(let cur of tags) {
        if(cur["tag: tag"] === tag) { return true; }
      }
      return false;
    },
    nextOrder: function(ids:Id[]): number {
      let max = 0;
      for(let id of ids) {
        let priority = get.order(id);
        if(priority >= max) { max = priority + 1; }
      }
      return max;
    },
    fields: (table: Id):Id[] => extract("field: field", ixer.find("field", {"field: view": table}) || []).sort(displaySort),
    facts: (table: Id):Client.Fact[] => pack(table, ixer.find(table))
  };

  export var localState: any = {
  };

  //---------------------------------------------------------------------------
  // Read/Write
  //---------------------------------------------------------------------------
  var mappings:{[viewId:string]: {humanize: Indexer.MappingFn, resolve: Indexer.MappingFn, pack: Indexer.MappingArrayFn}} = {};
  function generateMappings(ixer:Indexer.Indexer = Api.ixer) {
    let changedViews = {};
    let nameDiff = ixer.table("display name").diff;
    for(let fact of nameDiff.adds || []) {
      let field = ixer.findOne("field", {"field: field": fact["display name: id"]});
      if(field) changedViews[field["field: view"]] = true;
    }
    for(let fact of nameDiff.removes || []) {
      let field = ixer.findOne("field", {"field: field": fact["display name: id"]});
      if(field) changedViews[field["field: view"]] = true;
    }

    let orderDiff = ixer.table("display order").diff;
    for(let fact of nameDiff.adds || []) {
      let field = ixer.findOne("field", {"field: field": fact["display order: id"]});
      if(field) changedViews[field["field: view"]] = true;
    }
    for(let fact of nameDiff.removes || []) {
      let field = ixer.findOne("field", {"field: field": fact["display order: id"]});
      if(field) changedViews[field["field: view"]] = true;
    }

    for(let viewId of Object.keys(changedViews)) {
      let fieldIds = get.fields(viewId);
      let names = [];
      for(let fieldId of fieldIds) names.push(get.name(fieldId));
      if(!mappings[viewId]) mappings[viewId] = {humanize: undefined, resolve: undefined, pack: undefined};
      mappings[viewId].humanize = Indexer.generateMappingFn(fieldIds, names);
      mappings[viewId].resolve = Indexer.generateMappingFn(names, fieldIds);
      mappings[viewId].pack = Indexer.generateMappingFn(fieldIds);
    }
  }
  ixer.trigger("generate mappings", ["display name", "display order"], generateMappings);

  function identity<T>(x:T):T { return x; }
  export function resolve(viewId:string, factOrFacts:Dict|Dict[]):any {
    if(arguments.length < 2) throw new Error("Resolve requires a viewId as the first argument.");
    if(!factOrFacts) return factOrFacts;
    if(mappings[viewId]) return mappings[viewId].resolve(factOrFacts);
    return identity(factOrFacts);
  }
  export function humanize(viewId:string, factOrFacts:Dict|Dict[]):any {
    if(arguments.length < 2) throw new Error("Humanize requires a viewId as the first argument.");
    if(!factOrFacts) return factOrFacts;
    if(mappings[viewId]) return mappings[viewId].humanize(factOrFacts);
    return identity(factOrFacts);
  }
  export function pack(viewId:string, factOrFacts:Dict|Dict[]):any {
    if(arguments.length < 2) throw new Error("Pack requires a viewId as the first argument.");
    if(!factOrFacts) return factOrFacts;
    if(mappings[viewId]) return mappings[viewId].pack(factOrFacts);
    return identity(factOrFacts);
  }

  interface Schema {
    fields: string[]
    unboundFields: string[]
    singular: boolean
    key?: string
    foreign?: {[field:string]: string}
    dependents?: Id[]
  }

  const EDITOR_PKS = {
    tag: "",
    event: "tick",
    uiElement: "element",
    "view fingerprint": "fingerprint",
    "related entity": ""
  };
  const EDITOR_FKS = {
    "uiElement: parent": "element",
    "mapping: member field": "field",
    "related entity: related entity": "entity",
    "ui binding constraint: parent": "element"
  };
  const EDITOR_PK_DEPS = [
    ["display name", "display name: id"],
    ["display order", "display order: id"],
    ["tag", "tag: view"]
  ];
  const EDITOR_SINGULAR = {
    "display name": true,
    "display order": true,
    "select": true,
    "ordinal binding": true,
    "constant binding": true,
    "chunked source": true,
    "negated source": true,
    "negated member": true
  };

  export var schemas:{[view:string]: Schema} = {};

  export function generateSchemas(ixer:Indexer.Indexer = Api.ixer) {
    schemas = {};
    let editorViews = ixer.find("tag", {"tag: tag": "editor"}) || [];
    let names:{[name:string]: [Id, Id][]} = {};
    let keys:{[name:string]: [Id, Id]} = {};
    let ix = 0;
    // Generate initial schemas and list of aliases.
    for(let editorView of editorViews) {
      let viewId = editorView["tag: view"];
      let kind = Api.ixer.findOne("view", {"view: view": viewId})["view: kind"];
      if(kind !== "table") continue;
      let schema:Schema = schemas[viewId] = {fields: [], unboundFields: [], singular: !!EDITOR_SINGULAR[viewId]};
      let prefix = `${viewId}: `;
      let key = EDITOR_PKS[viewId] !== undefined ? EDITOR_PKS[viewId] : viewId;

      let fields = ixer.find("field", {"field: view": viewId}) || [];
      for(let field of fields) {
        let fieldId = field["field: field"];
        schema.fields.push(fieldId);
        if(fieldId.indexOf(prefix) !== 0) continue;
        let fieldName = fieldId.slice(prefix.length);
        if(fieldName === key) { // Field is a primary key.
          schema.key = fieldId;
          keys[fieldName] = [viewId, fieldId];
        } else { // Field is either a foreign key or unbound.
          schema.unboundFields.push(fieldId);
          // If fieldId is in EDITOR_FKS (a custom foreign mapping), override it's fieldName.
          if(EDITOR_FKS[fieldId] !== undefined) fieldName = EDITOR_FKS[fieldId];
          if(!fieldName) continue;
          if(!names[fieldName]) names[fieldName] = [];
          names[fieldName].push([viewId, fieldId]);
        }
      }
    }

    // Map foreign keys
    for(let name in keys) {
      let [primaryViewId, primaryFieldId] = keys[name];
      let primarySchema = schemas[primaryViewId];
      primarySchema.dependents = primarySchema.dependents || [];

      // Generic PKey foreign dependents
      // @NOTE: Must come first to prevent $$LAST_PKEY from being overwritten by other dependents.
      for(let [foreignViewId, foreignFieldId] of EDITOR_PK_DEPS) {
        primarySchema.dependents.push(foreignViewId);
      }

      // Direct foreign dependents
      let foreign = names[name] || [];
      for(let [foreignViewId, foreignFieldId] of foreign) {
        primarySchema.dependents.push(foreignViewId);
        let schema = schemas[foreignViewId];
        schema.unboundFields.splice(schema.unboundFields.indexOf(foreignFieldId), 1);
        if(!schema.foreign) schema.foreign = {};
        schema.foreign[foreignFieldId] = primaryFieldId;
      }

    }

    // Map generic foreign keys using $$LAST_PKEY meta key.
    for(let [foreignViewId, foreignFieldId] of EDITOR_PK_DEPS) {
      let schema = schemas[foreignViewId];
      schema.unboundFields.splice(schema.unboundFields.indexOf(foreignFieldId), 1);
      if(!schema.foreign) schema.foreign = {};
      schema.foreign[foreignFieldId] = "$$LAST_PKEY";
    }

    for(let viewId in schemas) { // dedupe dependents
      let schema = schemas[viewId];
      let prev;
      for(let ix = 0; schema.dependents && ix < schema.dependents.length; ix++) {
        if(schema.dependents[ix] === schema.dependents[ix - 1]) {
          schema.dependents.splice(ix, 1);
        }
      }
    }
  }
  ixer.trigger("generate schemas", "field", generateSchemas);

  function fillForeignFields(fact, schema, context) {
    if(schema.foreign) { // Fill empty foreign fields from context.
      for(let fieldId in schema.foreign) {
        let primaryFieldId = schema.foreign[fieldId];
        if(fact[fieldId] !== undefined || context[primaryFieldId] === undefined) continue;
        fact[fieldId] = context[primaryFieldId];
      }
    }
  }

  export class StructuredChange {
    public context:Dict = {};
    public dependents:{[pkey: string]: {[dependent: string]: number}} = {};
    depth:number = 0;

    constructor(public changeSet:Indexer.ChangeSet) {}
    clearContext():Dict {
      let old = this.context;
      this.context = {};
      this.dependents = {};
      return old;
    }
    add(viewId:string, factOrValue:Dict|any = {}):StructuredChange {
      let schema = schemas[viewId];
      if(!schema) throw new Error(`Unknown structured view: '${viewId}'.`);

      let fact:Dict;
      if(schema.unboundFields.length === 1 && !isDict(factOrValue)) fact = {[schema.unboundFields[0]]: factOrValue};
      else if(isDict(factOrValue)) fact = factOrValue;
      else throw new Error(`Invalid fact format for view '${viewId}': '${factOrValue}'`);
      fillForeignFields(fact, schema, this.context);

      if(schema.key) { // Generate UUID for empty pkey field.
        if(fact[schema.key] === undefined) fact[schema.key] = uuid();
        this.context[schema.key] = this.context["$$LAST_PKEY"] = fact[schema.key];
      }

      for(let fieldId of schema.fields) { // Ensure no fields remain empty.
        if(fact[fieldId] === undefined) throw new Error(`Incomplete fact for view '${viewId}', missing field '${fieldId}'`);
      }

      if(schema.singular && schema.foreign) { // Ensure singular dependents don't occur more than once for a given PKey.
        for(let fieldId in schema.foreign) {
          let dependents = this.dependents[fact[fieldId]] || (this.dependents[fact[fieldId]] = {});
          dependents[viewId] = (dependents[viewId] || 0) + 1;
          if(dependents[viewId] > 1) throw new Error(`Relationship for '${viewId}' should be 1:1 but is 1:N with '${fieldId}' = '${fact[fieldId]}'`);
        }
      }

      this.changeSet.add(viewId, fact);
      if(DEBUG.STRUCTURED_CHANGE) console.info("+", viewId, fact);
      return this;
    }
    addEach(viewId:string, factsOrValues:(Dict|any)[]):StructuredChange {
      for(let factOrValue of factsOrValues) this.add(viewId, factOrValue);
      return this;
    }
    remove(viewId:string, factOrPKey:Dict|any):StructuredChange {
      let schema = schemas[viewId];
      if(!schema) throw new Error(`Unknown structured view: '${viewId}'.`);
      let fact:Dict;
      if(schema.key && !isDict(factOrPKey)) fact = {[schema.key]: factOrPKey};
      else if(isDict(factOrPKey)) fact = factOrPKey;
      else throw new Error(`Invalid fact format for view '${viewId}': '${factOrPKey}'`);
      fillForeignFields(fact, schema, this.context);

      // Store pkey in context for convenient updates.
      if(schema.key && fact[schema.key] !== undefined) this.context[schema.key] = this.context["$$LAST_PKEY"] = fact[schema.key];
      this.changeSet.remove(viewId, fact);
      if(DEBUG.STRUCTURED_CHANGE) console.info("-", viewId, fact);
      return this;
    }
    removeEach(viewId:string, facts:Dict[]):StructuredChange {
      for(let fact of facts) this.remove(viewId, fact);
      return this;
    }
    // @FIXME: in the case that multiple foreign fields map to the same pkey, this erroneously assumes both fields must equal the same entity.
    removeWithDependents(viewId:string, factOrPKey:Dict|any, dependents?:string[]):StructuredChange {
      let schema = schemas[viewId];
      if(!schema) throw new Error(`Unknown structured view: '${viewId}'.`);
      let fact:Dict;
      if(schema.key && !isDict(factOrPKey)) fact = {[schema.key]: factOrPKey};
      else if(isDict(factOrPKey)) fact = factOrPKey;
      else throw new Error(`Invalid fact format for view '${viewId}': '${factOrPKey}'`);
      fillForeignFields(fact, schema, this.context);

      // Bail out if we don't have any relation to the parent or info of our own (otherwise we'd nuke the dependent table).
      let keys = Object.keys(fact);
      let filled = false;
      for(let key of keys) {
        if(fact[key] !== undefined) filled = true;
      }
      if(!filled) return this;

      let removes = this.changeSet.ixer.find(viewId, fact);
      this.changeSet.removeFacts(viewId, removes);

      if(DEBUG.STRUCTURED_CHANGE) {
        if(this.depth === 0) console.info("-", viewId, fact);
        for(let remove of removes) console.info(new Array(this.depth + 2).join("  ") + "|", remove);
      }
      if(removes.length === 0) return this;

      this.depth++;
      for(let dependentId of schema.dependents || []) {
        if(dependents && dependents.indexOf(dependentId) === -1) continue; // If the user supplied a whitelist, apply it.
        if(DEBUG.STRUCTURED_CHANGE) console.info(new Array(this.depth + 1).join("  ") + "-", dependentId);
        for(let remove of removes) {
          // Store pkey in context for removing dependents.
          if(schema.key) this.context[schema.key] = this.context["$$LAST_PKEY"] = remove[schema.key];
          this.removeWithDependents(dependentId, {}, dependents);
          if(schema.key) this.context[schema.key] = this.context["$$LAST_PKEY"] = undefined;
        }
      }
      if(viewId === "uiElement" || viewId === "view") { // Hack to clear ast cache
        if(DEBUG.STRUCTURED_CHANGE) console.info(new Array(this.depth + 1).join("  ") + "- ast cache");
        for(let remove of removes)
          this.removeWithDependents("ast cache", {"ast cache: id": remove[schema.key]}, dependents);
      }
      this.depth--;
      if(this.depth === 0) this.changeSet.collapseRemoves();
      return this;
    }
  }

  export function toDiffs(diffs:Indexer.Diffs<Dict>):Client.ArrayDiffs {
    let arrayDiffs:Client.ArrayDiffs = [];
    for(let tableId in diffs) {
      let diff = diffs[tableId];
      arrayDiffs.push([tableId, get.fields(tableId), pack(tableId, diff.adds), pack(tableId, diff.removes)]);
    }
    return arrayDiffs;
  }
}