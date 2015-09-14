/// <reference path="indexer.ts" />
module api {
  declare var window;
  declare var uuid;

  export var version = 0;

  type Id = string;
  type Fact = any[];

  interface Constraint {
    view?: Id,
    leftSource?: Id,
    leftField?: Id,
    rightSource?: Id,
    rightField?: Id,
    operation?: Id,
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

  export var arraysIdentical:(a:any[], b:any[])=>boolean = Indexing.arraysIdentical;
  export var zip:(keys:string[], rows:any[][])=>any[] = Indexing.zip;
  export var clone:<T>(item:T)=>T = Indexing.clone;

  if(!window.DEBUG) {
    window.DEBUG = {RECEIVE: 0,
                    SEND: 0,
                    INDEXER: 0,
                    TABLE_CELL_LOOKUP: true};
  }

  export var KEYS = {
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

  export function extend(dest, src) {
    for(var key in src) {
      if(!src.hasOwnProperty(key)) { continue; }
      dest[key] = src[key];
    }
    return dest;
  }

  export function displaySort(idA:string, idB:string): number {
    var orderA = ixer.index("display order")[idA];
    var orderB = ixer.index("display order")[idB];
    if(orderA - orderB) { return orderA - orderB; }
    else { return idA.localeCompare(idB); }
  }

  export function invert(obj:Object): Object {
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

  export var alphabet = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
                  "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];
  export var alphabetLower = alphabet.map(function(char) {
    return char.toLowerCase();
  });
  var alphabetLowerToIx = invert(alphabetLower);

  export function reverseDiff(diff) {
    var neue = [];
    for(var diffIx = 0, diffLen = diff.length; diffIx < diffLen; diffIx++) {
      var copy = diff[diffIx].slice();
      neue[diffIx] = copy;
      if(copy[1] === "inserted") {
        copy[1] = "removed";
      } else {
        copy[1] = "inserted";
      }
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

        callback(undefined, +request.responseText > +api.version);
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
    console.log("P", payload);
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

  export var ixer = new Indexing.Indexer();

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

  // This index needs to be hardcoded for code.ix to work.
  ixer.addIndex("id to tags", "tag", Indexing.create.collector(["tag: view"]));
  ixer.addIndex("view to fields", "field", Indexing.create.collector(["field: view"]));
  ixer.addIndex("display name", "display name", Indexing.create.lookup(["display name: id", "display name: name"]));
  ixer.addIndex("display order", "display order", Indexing.create.lookup(["display order: id", "display order: priority"]));

  // editor
  ixer.addIndex("eveusers id to username", "eveusers", Indexing.create.lookup(["eveusers: id", "eveusers: username"]));


  //---------------------------------------------------------
  // Data interaction code
  //---------------------------------------------------------

  export var code = {
    name: function(id:Id): string {
      return ixer.index("display name", true)[id] || "";
    },
    hasTag: function(id:Id, tag:string): boolean {
      var tags = ixer.index("id to tags", true)[id] || [];
      return tags.some(function(cur) {
        return cur["tag: tag"] === tag;
      });
    },
    activeItemId: function(): Id|void {
      return localState.activeItem;
    },
    sortedViewFields: function(viewId:Id): Id[] {
      var fields = (ixer.index("view to fields")[viewId] || []).slice();
      var fieldsLength = fields.length;
      for(var ix = 0; ix < fieldsLength; ix++) {
        var fieldId = fields[ix][1];
        fields[ix] = [ixer.index("display order")[fieldId], fieldId];
      }
      fields.sort(function(a, b) {
        var delta = a[0] - b[0];
        if(delta) { return delta; }
        else { return a[1].localeCompare(b[1]); }
      });
      var fieldIds = [];
      for(var ix = 0; ix < fieldsLength; ix++) {
        fieldIds.push(fields[ix][1]);
      }

      return fieldIds;
    },
    layerToChildLayers: function layerToChildLayers(layer:Fact) {
      var result = [];
      var lookup = ixer.index("parentLayerToLayers");
      var childLayers = lookup[layer[1]];
      if(!childLayers) {
        return result;
      } else {
        childLayers = childLayers.slice();
      }
      while(childLayers.length !== 0) {
        var curLayer = childLayers.pop();
        result.push(curLayer);
        var children = lookup[curLayer[1]];
        if(children && children.length) {
          childLayers.push.apply(childLayers, children);
        }
      }
      return result;
    },
    minPriority: function(ids:Id[]): number {
      var order = ixer.index("display order");
      return ids.reduce(function(memo, id) {
        var neue = order[id];
        if(neue <= memo) { return neue - 1; }
        return memo;
      }, 0);
    }
  };

  export var localState: any = {
    txId: 0,
    uiActiveLayer: null,
    openLayers: {},
    initialAttrs: [],
    initialElements: [],
    activeItem: null,
    showMenu: true,
    uiGridSize: 10,
    initialValue: undefined,
    queryEditorActive: undefined,
    queryEditorInfo: undefined,
    sort: {}
};

  export type Diff = any[];
  interface Context {[key:string]: Id}
  interface Write<T> {type: string, content: T|T[], context?: Context|Context[], mode?: string, originalKeys?: string[], useIds?: boolean}

  interface Schema {
    key?: string|string[]
    dependents?: Id[]
    foreign?: {[field:string]: string}
    singular?: boolean
  }

  var pkDependents = ["display order", "tag"];
  var schemas:{[id:string]: Schema} = {
    "display name": {foreign: {$last: "id"},
                     singular: true},
    "display order": {foreign: {$last: "id"},
                      singular: true},
    tag: {foreign: {$last: "view"}},

    view: {key: "view",
           dependents: pkDependents.concat(
             ["field"])},
    source: {key: "source",
             foreign: {view: "view"},
             dependents: []},
    field: {key: "field",
            foreign: {view: "view"},
            dependents: pkDependents,
            },

    "chunked source": {},
    "ordinal binding": {},
    "grouped field": {},
    "negated source": {},
    "sorted field": {},

    "select": {},
    "variable" : {},
    "binding": {},
    "constant binding": {},

    "view description": {},

     "text input": {},
     "mouse position": {},
     "click": {},
     "client event": {},
     "location": {},
     "session url": {},
     "captured key": {},
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
        let fieldIds = ixer.getFields(type);
        let nameToId = {};
        for(let id of fieldIds) {
          nameToId[code.name(id)] = id;
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

  export function process(type:string, params, context:Context = {}, useIds = false): Write<any> {
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
    var fieldIds = ixer.getFields(type);
    for(var fieldId of fieldIds) {
      var fieldName = useIds ? fieldId : code.name(fieldId);
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

  export function retrieve(type:string, query:{[key:string]:string}, context:Context = {}, useIds = false) {
    var schema:Schema = schemas[type] || {};
    var keys:string[] = (schema.key instanceof Array) ? <string[]>schema.key : (schema.key) ? [<string>schema.key] : [];
    var facts = useIds ? ixer.select(type, query, useIds) : ixer.selectPretty(type, query);

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

      var dependents = {};
      var hasDependents = false;
      if(schema.dependents) {
        for(var dependent of schema.dependents) {
          var depSchema = schemas[dependent];

          //debugger;
          var q = <{[key:string]:string}>fillForeignKeys(dependent, {}, factContext, useIds, true);

          var results = retrieve(dependent, q, clone(factContext));
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
   export function mapToFact(viewId:Id, props, useIds = false) {
    if(arguments.length < 2) { throw new Error("Must specify viewId and map to convert to fact."); }
    var fieldIds = code.sortedViewFields(viewId); // @FIXME: We need to cache these horribly badly.
    var length = fieldIds.length;
    var fact = new Array(length);
    for(var ix = 0; ix < length; ix++) {
      var name = useIds ? fieldIds[ix] : code.name(fieldIds[ix]);
      var val = props[name];
      if(val === undefined || val === null) {
        throw new Error("Malformed value in " + viewId + " for field " + name + " of fact " + JSON.stringify(props));
      }
      fact[ix] = val;
    }
    return fact;
  }

  export function factToMap(viewId:Id, fact:Fact) {
    if(arguments.length < 2) { throw new Error("Must specify viewId and fact to convert to map."); }
    var fieldIds = code.sortedViewFields(viewId); // @FIXME: We need to cache these horribly badly.
    var length = fieldIds.length;
    var map = {};
    for(var ix = 0; ix < length; ix++) {
      var name = code.name(fieldIds[ix]);
      map[name] = fact[ix];
    }
    return map;
  }

  export function insert(type:string, params, context?:Context, useIds = false):Write<any> {
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

  export function change(type:string, params, changes, upsert:boolean = false, context?:Context, useIds = false):Write<any> {
    if(arguments.length < 3) { throw new Error("Must specify type and query and changes for change."); }
    // When useIds is set, retrieve will return undefined for an empty result
    var read = retrieve(type, params, context, useIds) || [];
    var write = read.map(function(item) {
      return writeInto(item, changes);
    });
    if(!write.length && upsert) {
      var insertParams = writeInto(writeInto({}, params), changes);
      return insert(type, insertParams, {}, useIds);
    }
    return {type: type, content: write, context: context, mode: "changed", originalKeys: clone(params), useIds};
  }

  export function remove(type:string, params, context?:Context, useIds = false):Write<any> {
    if(arguments.length < 2) { throw new Error("Must specify type and query for remove."); }
    var read = retrieve(type, params, context, useIds);
    return {type: type, content: read, context: context, mode: "removed", useIds};
  }

  export function toDiffs(writes:Write<any>|Write<any>[]):Diff[] {
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
      var write:Write<any> = <Write<any>>writes;
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
}
