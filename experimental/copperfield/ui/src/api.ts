/// <reference path="indexer.ts" />
module Api {
  declare var window;
  export var uuid:()=>string = window.uuid;

  export var version = 0;

  type Id = string;
  export type Fact = any[];
  type PopulatedFact = {[key:string]: any, dependents?: {[type: string]: PopulatedFact}}

  if(!window.DEBUG) {
    window.DEBUG = {
      RECEIVE: 0,
      SEND: 0,
      INDEXER: 0,
      RENDERER: false,
      RENDER_TIME: false,
      TABLE_CELL_LOOKUP: true
    };
  }

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
    } else { //it's a primitive
      return item;
    }
  }

  export function now() {
    if (window.performance) {
      return window.performance.now();
    }
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

  export function displaySort(idA:string, idB:string): number {
    var orderA = (ixer.findOne("display order", {"display order: id": idA}) || {})["display order: priority"];
    var orderB = (ixer.findOne("display order", {"display order: id": idB}) || {})["display order: priority"];
    if(orderA - orderB) { return orderA - orderB; }
    else { return idA.localeCompare(idB); }
  }

  export function invert(obj:Object): {} {
    var res = {};
    for(var key in obj) {
      if(!obj.hasOwnProperty(key)) { continue; }
      res[obj[key]] = key;
    }
    return res;
  }

  // @NOTE Rows array will be mutated in place. Please slice in advance if source cannot be mutated.
  export function sortRows(rows:any[], field:string|number, direction:number) {
    rows.sort(function sort(a, b) {
      a = a[field];
      b = b[field];
      if(direction < 0) { [a, b] = [b, a]; }
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

  export function reverseDiff(diffs) {
    let neue = [];
    for(let diff of diffs) {
      var copy = diff.slice();
      neue.push(copy);
      copy[1] = (copy[1] === "inserted")  ? "removed" : "inserted";
    }
    return neue;
  }

  export function checkVersion(callback:(error:Error, newVersionExists?:boolean) => void) {
    let request = new XMLHttpRequest();
    request.onreadystatechange = function() {
      if(request.readyState === 4) {
        if(request.status !== 200) {
          return callback(new Error(`HTTP Response: ${request.status}`));
        }

        callback(undefined, +request.responseText > +version);
      }
    }
    //request.open("GET", "https://gist.githubusercontent.com/joshuafcole/117ec93af90c054bac23/raw/1350f2aae121e19129e561678b107ec042a6cbd2/version");
    request.open("GET", "https://raw.githubusercontent.com/witheve/Eve/master/version");
    request.send();
  }

  export function writeToGist(name:string, content:string, callback:(error:Error, url?:string) => void) {
    let request = new XMLHttpRequest();
    request.onreadystatechange = function() {
      if(request.readyState === 4) {
        if(request.status !== 201) {
          return callback(new Error(`HTTP Response: ${request.status}`));
        }
        let response:any = JSON.parse(request.responseText);
        let file = response.files[name];
        let url = file.raw_url.split("/raw/")[0];
        let err = (file.truncated) ? new Error("File to large: Maximum gist size is 10mb") : undefined;
        callback(err, url);
      }
    };
    let payload = {
      public: true,
      description: "",
      files: {}
    }
    payload.files[name] = {content: content};
    request.open("POST", "https://api.github.com/gists");
    request.send(JSON.stringify(payload));
  }

  export function readFromGist(url:string, callback:(error:Error, content?:string) => void) {
    let request = new XMLHttpRequest();
    request.onreadystatechange = function() {
      if(request.readyState === 4) {
        if(request.status !== 200) {
          return callback(new Error(`HTTP Response: ${request.status}`));
        }

        callback(undefined, request.responseText);
      }
    }
    request.open("GET", url);
    request.send();
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
    name: (id:Id) => <string>ixer.findOne("display name", ({"display name: id": id}) || {})["display name: name"] || "",
    order: (id:Id) => <number>ixer.findOne("display order", ({"display order: id": id}) || {})["display order: priority"] || 0,
    tags: (id:Id) => {
      let tagNames:string[] = [];
      for(let tag of ixer.find("tag", {"tag: view": id})) tagNames.push(tag["tag: tag"]);
      return tagNames;
    },
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
    fields(table: Id):Id[] {
      var fields = ixer.find("field", {view: table});
      if(!fields || !fields.length) { return []; }
      var fieldIds = fields.map((field) => field["field: field"]);
      fieldIds.sort(displaySort);
      return fieldIds;
    },
    facts(table: Id):Fact[] {
      let factMaps = ixer.find(table);
      let facts = [];
      for(let map of factMaps) {
        facts.push(mapToFact(table, map, true));
      }
      return facts;
    }
  };

  export var localState: any = {
  };

  export type Diff = [string, string,  Fact];
  interface Context {[key:string]: Id}
  export interface Change<T> {type: string, content: T|T[], context?: Context|Context[], mode?: string, originalKeys?: string[], useIds?: boolean}

  interface Schema {
    key?: string|string[]
    dependents?: Id[]
    foreign?: {[field:string]: string}
    singular?: boolean
  }

  var pkDependents = ["display order", "tag", "display name"];
  var schemas:{[id:string]: Schema} = {
    "display name": {foreign: {$last: "id"}, singular: true},
    "display order": {foreign: {$last: "id"}, singular: true},
    tag: {foreign: {$last: "view"}},

    view: {key: "view", dependents: pkDependents.concat(["field"])},
    source: {
      key: "source",
      foreign: {view: "view"},
      dependents: ["binding", "ordinal binding", "grouped field", "sorted field", "chunked source", "negated source"]
    },
    field: {
      key: "field",
      foreign: {view: "view"},
      dependents: pkDependents.concat(["select"]),
    },
    variable: {
      key: "variable",
      foreign: {view: "view"},
      dependents: pkDependents.concat(["select", "binding", "constant binding", "ordinal binding"])
    },
    select: {foreign: {variable: "variable", field: "field"}, singular: true},
    binding: {foreign: {variable: "variable", source: "source"}},
    "ordinal binding": {foreign: {variable: "variable", source: "source"}, singular: true},
    "constant binding": {foreign: {variable: "variable"}, singular: true},

    "grouped field": {foreign: {source: "source"}},
    "sorted field": {foreign: {source: "source"}},
    "chunked source": {foreign: {source: "source"}},
    "negated source": {foreign: {source: "source"}},

    "editor node position": {key: "node"},
  };

  /***************************************************************************\
   * Read/Write primitives.
  \***************************************************************************/
  function fillForeignKeys(type, query, context, useIds = false, silentThrow?) {
    var schema = schemas[type];
    if(!schema) { throw new Error("Attempted to process unknown type " + type + " with query " + JSON.stringify(query)); }
    var foreignKeys = schema.foreign;
    if(!foreignKeys) { return query; }

    if(useIds) {
      let foreignIdKeys:{[field: string]: string} = {};
      let fieldIds = get.fields(type);
      let nameToId = {};
      for(let id of fieldIds) {
        nameToId[get.name(id)] = id;
      }
      for(let foreignKey in foreignKeys) {
        foreignIdKeys[foreignKey] = nameToId[foreignKeys[foreignKey]];
      }
      foreignKeys = foreignIdKeys;
    }

    for(var contextKey in foreignKeys) {
      var foreignKey = foreignKeys[contextKey];

      if(!foreignKeys.hasOwnProperty(contextKey)) { continue; }
      if(query[foreignKey] !== undefined) { continue; }
      if(context[contextKey] === undefined && !silentThrow) {
        throw new Error("Unspecified field " + foreignKey + " for type " + type + " with no compatible parent to link to in context " + JSON.stringify(context));
      }
      query[foreignKey] = context[contextKey];
    }
    return query;
  }

  export function process(type:string, params, context:Context = {}, useIds = false): Change<any> {
    if(!params) { return; }
    if(params instanceof Array) {
      var write = {type: type, content: [], context: []};
      for(var item of params) {
        var result = process(type, item, clone(context), useIds);
        write.content.push(result.content);
        write.context.push(result.context);
      }
      return write;
    }

    var schema:Schema = schemas[type] || {};
    if(!params) { throw new Error("Invalid params specified for type " + type + " with params " + JSON.stringify(params)); }

    // Link foreign keys from context if missing.
    if(schema.foreign) {
      var params = fillForeignKeys(type, params, context, useIds);
    }

    // Fill primary keys if missing.
    var keys:string[] = (schema.key instanceof Array) ? <string[]>schema.key : (schema.key) ? [<string>schema.key] : [];
    for(var key of keys) {
      if(params[key] === undefined) {
        params[key] = uuid();
      }
      context[key] = params[key];
    }
    if(keys.length === 1) {
      context["$last"] = params[keys[0]];
    }

    // Ensure remaining fields exist and contain something.
    var fieldIds = get.fields(type);
    for(var fieldId of fieldIds) {
      var fieldName = useIds ? fieldId : get.name(fieldId);
      if(params[fieldName] === undefined || params[fieldName] === null) {
        throw new Error("Missing value for field " + fieldName + " on type " + type);
      }
    }

    // Process dependents recursively.
    if(params.dependents) {
      var dependents = params.dependents;
      for(var dep in dependents) {
        if(!dependents.hasOwnProperty(dep)) { continue; }
        if(dependents[dep] instanceof Array) {
          for(var depItem of dependents[dep]) {
            process(dep, depItem, context);
          }
        } else {
          var result = process(dep, dependents[dep], context);
          if(!result) { delete dependents[dep]; }
        }
      }
    }

    return {type: type, content: params, context: context};
  }

  export function retrieve(type:string, query:{[key:string]:string}, context:Context = {}, useIds) {
    if(useIds === false) throw new Error("Must update to IDs.");
    var schema:Schema = schemas[type] || {};
    var keys:string[] = (schema.key instanceof Array) ? <string[]>schema.key : (schema.key) ? [<string>schema.key] : [];
    var facts = <PopulatedFact[]>ixer.find(type, query);

    if(!facts.length) { return; }
    for(var fact of facts) {
      if(!fact) { continue; }
      var factContext = clone(context);
      for(var key of keys) {
        factContext[key] = fact[key];
      }
      if(keys.length === 1) {
        factContext["$last"] = fact[keys[0]];
      }

      var dependents:{[type:string]: PopulatedFact} = {};
      var hasDependents = false;
      if(schema.dependents) {
        for(var dependent of schema.dependents) {
          var depSchema = schemas[dependent];
          var q = <{[key:string]:string}>fillForeignKeys(dependent, {}, factContext, useIds, true);

          var results = retrieve(dependent, q, clone(factContext), useIds);
          if(results && results.length) {
            if(depSchema.singular) {
              dependents[dependent] = results[0];
            } else {
              dependents[dependent] = results;
            }
            hasDependents = true;
          }
        }
      }
      if(hasDependents) {
        fact.dependents = dependents;
      }
    }

    return facts;
  }

  /***************************************************************************\
   * Read/Write API
  \***************************************************************************/
   export function mapToFact(viewId:Id, props, useIds) {
     if(!useIds) throw new Error("Update to useIds");
    if(arguments.length < 2) { throw new Error("Must specify viewId and map to convert to fact."); }
    var fieldIds = get.fields(viewId); // @FIXME: We need to cache these horribly badly.
    var length = fieldIds.length;
    var fact = new Array(length);
    for(var ix = 0; ix < length; ix++) {
      var name = fieldIds[ix];
      var val = props[name];
      if(val === undefined || val === null) {
        throw new Error("Malformed value in " + viewId + " for field " + name + " of fact " + JSON.stringify(props));
      }
      fact[ix] = val;
    }
    return fact;
  }

  export function factToMap(viewId:Id, fact:Fact, fieldIds:string[] = get.fields(viewId)) {
    if(arguments.length < 2) { throw new Error("Must specify viewId and fact to convert to map."); }
    var length = fieldIds.length;
    var map = {};
    for(var ix = 0; ix < length; ix++) {
      map[fieldIds[ix]] = fact[ix];
    }
    return map;
  }

  export function insert(type:string, params, context?:Context, useIds = false):Change<any> {
    if(arguments.length < 2) { throw new Error("Must specify type and parameters for insert."); }
    var write = process(type, params, context, useIds);
    write.mode = "inserted";
    write.useIds = useIds;
    return write;
  }

  function writeInto(dest, src) {
    if(dest.constructor === Array) {
      return dest.map(function(item) {
        return writeInto(item, src);
      })
    }
    for(var key in src) {
      if(src[key] === undefined) { continue; }
      // If the source attribute is an array, append its contents to the dest key.
      if(src[key].constructor === Array) {
        if(dest[key].constructor !== Array) { dest[key] = [dest[key]]; }
        dest[key] = dest[key].concat(src[key]);
      }
      // If it's an object, recurse.
      // @NOTE: This will fail if the destination is dissimilarly shaped (e.g. contains a primitive here).
      else if(typeof src[key] === "object") {
        dest[key] = writeInto(dest[key] || {}, src[key]);
      }
      // If it's a primitive value, overwrite the current value.
      else {
        dest[key] = src[key];
      }
    }
    return dest;
  }

  export function change(type:string, params, changes, upsert:boolean = false, context?:Context):Change<any> {
    if(arguments.length < 3) { throw new Error("Must specify type and query and changes for change."); }
    // When useIds is set, retrieve will return undefined for an empty result
    var read = retrieve(type, params, context, true) || [];
    var write = read.map(function(item) {
      return writeInto(item, changes);
    });
    if(!write.length && upsert) {
      var insertParams = writeInto(writeInto({}, params), changes);
      return insert(type, insertParams, {}, true);
    }
    return {type: type, content: write, context: context, mode: "changed", originalKeys: clone(params), useIds: true};
  }

  export function remove(type:string, params, context?:Context):Change<any> {
    if(arguments.length < 2) { throw new Error("Must specify type and query for remove."); }
    var read = retrieve(type, params, context, true);
    return {type: type, content: read, context: context, mode: "removed", useIds: true};
  }

  export function toDiffs(writes:Change<any>|Change<any>[]):Diff[] {
    var diffs = [];
    if(writes instanceof Array) {
      for(var write of writes) {
        if(!write) { continue; }
        var result = toDiffs(write);
        if(result !== undefined) {
          diffs = diffs.concat(result);
        }
      }
      return diffs;
    } else {
      var write:Change<any> = <Change<any>>writes;
      if(write.content === undefined) { return diffs; }
    }

    var type = write.type;
    var params = write.content;
    var mode = write.mode;

    if(!params) {
      //if we have no content, then there's nothing for us to do.
      return;
    }

    if(mode === "changed") {
      // Remove the existing root and all of its dependents, then swap mode to inserted to replace them.
      if(!write.originalKeys) { throw new Error("Change specified for " + type + ", but no write.originalKeys specified."); }
      diffs = diffs.concat(toDiffs(remove(type, write.originalKeys)));
      mode = "inserted";
    }

    if(params instanceof Array) {
      for(var item of params) {
        diffs = diffs.concat(toDiffs({type: type, content: item, context: write.context, mode: mode, useIds: write.useIds}));
      }
      return diffs;
    }

    // Process root fact.
    diffs.push([type, mode, mapToFact(type, params, write.useIds)]);

    // Process dependents.
    var dependents = params.dependents || {};
    for(var key in dependents) {
      if(!dependents.hasOwnProperty(key)) { continue; }
      diffs = diffs.concat(toDiffs({type: key, content: dependents[key], context: write.context, mode: mode}));
    }
    return diffs;
  }

  export function toChangeSet(changes:Change<any>|Change<any>[], ixer:Indexer.Indexer = Api.ixer) {
    let diffs = Api.toDiffs(changes);
    let changeSet = ixer.changeSet();
    // @FIXME: Dear god batch this.
    for(let [table, mode, fact] of diffs) {
      if(mode === "inserted") {
        changeSet.add(table, fact);
      } else {
        changeSet.removeFacts(table, [fact]);
      }
    }
    return changeSet;
  }
}
