module Indexing {
	declare var DEBUG;
  declare var api;

  type Id = string;
  type ArrayFact = any[];
  type MapFact = any;
  export type PayloadChange = [Id, Id[], ArrayFact[], ArrayFact[]];
  export interface Payload { changes: PayloadChange[] };

  export function arraysIdentical(a:any[], b:any[]):boolean {
    var i = a.length;
    if (!b || i != b.length) return false;
    while (i--) {
      if(a[i] && a[i].constructor === Array) {
        if(!arraysIdentical(a[i], b[i])) return false;
        continue;
      }
      if(a[i] && a[i].relation && b[i] && b[i].relation) {
        if(!arraysIdentical(a[i].relation, b[i].relation)) return false;
        continue;
      }
      if(a[i] && a[i].eid && b[i] && b[i].eid) { continue; }
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  export function objectsIdentical(a:any, b:any):boolean {
    if(typeof a !== typeof b) { return false; }
    if(typeof a !== "object") { return a === b; }
    var aKeys = Object.keys(a);
    if(!arraysIdentical(aKeys, Object.keys(b))) { return false; }

    for(var key of aKeys) {
      if(typeof a[key] !== typeof b[key]) { return false; }
      if(typeof a[key] !== "object" && a[key] !== b[key]) { return false; }
      if(a[key].constructor === Array) { console.log(a[key], b[key], arraysIdentical(a[key], b[key])); return arraysIdentical(a[key], b[key]); }
      else if(!objectsIdentical(a[key], b[key])) { return false; }
    }

    return true;
  }

  export function clone<T>(item:T): T;
  export function clone(item:Object): Object;
  export function clone(item:any[]): any[];
  export function clone(item:any): any {
    if (!item) { return item; }
    var result;

    if(item instanceof Array) {
      result = [];
      item.forEach(function(child, index, array) {
        result[index] = clone( child );
      });
    } else if(typeof item == "object") {
      result = {};
      for (var i in item) {
        result[i] = clone( item[i] );
      }
    } else {
      //it's a primitive
      result = item;
    }
    return result;
  }

  export function zip(rows, keys) {
    var keysLength = keys.length;
    var zipped = [];
    for (var row of rows) {
      var zippedRow = {};
      for(var keyIx = 0; keyIx < keysLength; keyIx++) {
        zippedRow[keys[keyIx]] = row[keyIx];
      }
      zipped.push(zippedRow);
    }
    return zipped;
  }

  export function unzip(zipped, keys?) {
    if(!zipped || !zipped.length) { return {keys: [], rows: []}; }
    if(!keys) {
      keys = Object.keys(zipped[0]);
    }
    var rows = [];
    for(var zippedRow of zipped) {
      var row = [];
      for(var key of keys) {
        row.push(zippedRow[key]);
      }
      rows.push(row);
    }
    return {keys: keys, rows: rows};
  }

  type Extractor = (fact:ArrayFact) => MapFact;
  function generateExtractorFn(view:Id, keys:Id[]):Extractor {
    return <Extractor> new Function("fact", `return { ${keys.map(function(key, ix) {
      return `"${key}": fact["${ix}"]`;
    }).join(", ")} };`);
  }

  type Packer = {(fact:MapFact): ArrayFact; fields: Id[]};
  function generatePackerFn(view:Id, keys:Id[]):Packer {
    var packer = <Packer> new Function("fact", `return [${keys.map(function(key) {
      return `fact["${key}"]`;
    }).join(", ")}];`);
    packer.fields = keys;
    return packer;
  }

  type Mapper = (fact:MapFact) => MapFact;
  function generateMapperFn(view:Id, keys:Id[], mapping):Extractor {
    return <Mapper> new Function("fact", `return { ${keys.map(function(key) {
      return `"${mapping[key]}": fact["${key}"]`;
    }).join(", ")} };`);
  }

  type EqualityChecker = (a:MapFact, b:MapFact) => Boolean;
  function generateEqualityFn(view:Id, keys:Id[]):EqualityChecker {
    if(keys.length === 0) { return (a, b) => true; }
    return <EqualityChecker> new Function("a", "b",  `return ${keys.map(function(key, ix) {
      return `(a["${key}"] === b["${key}"] || (a["${key}"] && a["${key}"].constructor === Array && Indexing.arraysIdentical(a["${key}"], b["${key}"])))`;
    }).join(" && ")};`);
  }

  function indexOfFact(equals:EqualityChecker, haystack:MapFact[], needle:MapFact):number {
    var result = -1;
    if(!equals) { return result; }
    for(var haystackIx = 0, haystackLen = haystack.length; haystackIx < haystackLen; haystackIx++) {
      var cur = haystack[haystackIx];
      if(equals(cur, needle)) {
        result = haystackIx;
        break;
      }
    }
    return result;
  }

  function applyTableDiff(equals:EqualityChecker, table:MapFact[], adds:MapFact[], removes:MapFact[]) {
    var dedupedAdds:MapFact[] = [];
    var dedupedRemoves:MapFact[] = [];
    for(var remIx = 0, remLen = removes.length; remIx < remLen; remIx++) {
      var rem = removes[remIx];
      var foundIx = indexOfFact(equals, table, rem);
      if(foundIx !== -1) {
        table.splice(foundIx, 1);
        dedupedRemoves.push(rem);
      }
    }
    for(var addIx = 0, addLen = adds.length; addIx < addLen; addIx++) {
      var add = adds[addIx];
      var foundIx = indexOfFact(equals, table, add);
      if(foundIx !== -1) continue;
      table.push(add);
      dedupedAdds.push(add);
    }
    return {adds: dedupedAdds, removes: dedupedRemoves};
  }

/*  var factExtractorFns:{[key:string]: Extractor} = {};
  var factPackerFns:{[key:string]: Packer} = {};
  var factEqualityFns:{[key:string]: EqualityChecker} = {};
*/
  export class Indexer {
    tables:{[key:string]: MapFact[]};
    indexes: {};
    tableToIndex: {};
    needsRebuild: {[table:string]: boolean};
    constructor() {
      this.tables = {};
      this.indexes = {};
      this.tableToIndex = {};
      this.needsRebuild = {};
    }
    totalFacts():Number {
      var total = 0;
      for(var table in this.tables) {
        total += this.tables[table].length;
      }
      return total;
    }
    clear():Payload {
      var final = [];
      for(var table in this.tables) {
        if(this.tables[table]) {
          this.handleDiff(table, [], this.tables[table].slice());
        }
      }
      for(var index in this.indexes) {
        this.indexes[index].index = {};
      }
      return {changes: final};
    }
    clearTable(table: Id) {
      if(this.tables[table]) {
        this.handleDiff(table, this.getFields(table), [], this.tables[table].slice());
      }
    }
    markForRebuild(table: Id) {
      this.needsRebuild[table] = true;
    }
    getFields(table: Id, unsorted?:boolean):Id[] {
      var fields = this.index("view to fields", true)[table];
      var orders = this.index("display order", true) || {};
      if(!fields) { return []; }
      var fieldIds = fields.map((field) => field["field: field"]);
      if(unsorted) { return fieldIds; }
      fieldIds.sort(function(a, b) {
        var delta = orders[a] - orders[b];
        if(delta) { return delta; }
        else { return a.localeCompare(b); }
      });
      return fieldIds;
    }
    getKeys(table:Id):Id[] {
      var fieldIds = api.ixer.getFields(table) || [];
      var keys = [];
      for(let fieldId of fieldIds) {
        if(api.code.hasTag(fieldId, "key")) {
          keys.push(fieldId);
        }
      }
      return keys;
    }
    handleDiff(table: Id, fields:Id[], adds: MapFact[] = [], removes: MapFact[] = []) {
      var dedupedAdds = adds;
      var dedupedRemoves = removes;
      //update table
      if(this.tables[table] === undefined) {
        this.tables[table] = [];
      }
      var equals = generateEqualityFn(table, fields);
      var deduped = applyTableDiff(equals, this.tables[table], adds, removes);
      dedupedAdds = deduped.adds;
      dedupedRemoves = deduped.removes;

      //update indexes
      var shouldRebuild = this.needsRebuild[table];
      var indexes = this.tableToIndex[table] || [];
      for(var cur of indexes) {
        if(shouldRebuild && cur.requiresRebuild) {
          cur.index = cur.indexer({}, this.tables[table], [], equals);
        } else {
          cur.index = cur.indexer(cur.index, dedupedAdds, dedupedRemoves, equals);
        }
      }
      if(shouldRebuild) {
        this.needsRebuild[table] = false;
      }
    }
    dumpMapDiffs():Payload {
      var final:PayloadChange[] = [];
      for(var table in this.tables) {
        var pack = generatePackerFn(table, this.getFields(table));
        final.push([table, pack.fields, (this.tables[table] || []).map(pack), []]);
      }
      return {changes: final};
    }
    compactDiffs() {
      var compiler:PayloadChange[] = [];
      var codeTags = this.select("tag", { "tag": "code" }) || [];
      for(var tag of codeTags) {
        var table = tag["tag: view"];
        var pack = generatePackerFn(table, this.getFields(table));
        compiler.push([table, pack.fields, (this.tables[table] || []).map(pack), []]);
      }
      var facts:PayloadChange[] = [];
      for(var table in this.tables) {
        if (api.code.hasTag(table, "code")) { continue; } // @FIXME: Indexer should not depend on api.
        var kind = (this.selectOne("view", {view: table}) || {})["view: kind"];
        if(kind !== "table") continue;
        var pack = generatePackerFn(table, this.getFields(table));
        facts.push([table, pack.fields, (this.tables[table] || []).map(pack), []]);
      }
      return JSON.stringify({changes: compiler}) + "\n" + JSON.stringify({changes: facts}) + "\n";
    }
    handleMapDiffs(diffs) {
      for(var [table, fields, inserted, removed] of diffs) {
        if(inserted.length || removed.length) {
          var extract = generateExtractorFn(table, fields);
          this.handleDiff(table, fields, (inserted || []).map(extract), (removed || []).map(extract));
        }
      }
    }
    handleDiffs(diffs: any) {
      var diffTables = {};
      var adds:{[key:string]: ArrayFact[]} = {};
      var removes:{[key:string]: ArrayFact[]} = {};
      for(var [table, action, fact] of diffs) {
        diffTables[table] = true;
        if(action === "inserted") {
          if(!adds[table]) { adds[table] = []; }
          adds[table].push(fact);
        } else {
          if(!removes[table]) { removes[table] = []; }
          removes[table].push(fact);
        }
      }
      for(var table in diffTables) {
        var fields = this.getFields(table);
        var extract = generateExtractorFn(table, fields);
        this.handleDiff(table, fields, (adds[table] || []).map(extract), (removes[table] || []).map(extract));
      }
    }
    addIndex(name: string, table: string, indexer) {
      var index = {index: {}, indexer: indexer.func, table: table, keys: indexer.keys, requiresRebuild: indexer.requiresRebuild};
      this.indexes[name] = index;
      if(!this.tableToIndex[table]) {
        this.tableToIndex[table] = [];
      }
      this.tableToIndex[table].push(index);
      if(this.tables[table]) {
        var pack = generatePackerFn(table, this.getFields(table));
        index.index = index.indexer(index.index, this.tables[table], [], pack);
      }
    }
    index(name: string, unpacked:boolean = false) {
      if(this.indexes[name]) {
        var indexObj = this.indexes[name];
        var table = indexObj.table;
        if(DEBUG && DEBUG.INDEXER && !this.tables[table]) {
           console.warn("Indexed table '" + table + "' does not yet exist for index '" + name + "'.");
        }
        var index  = this.indexes[name].index;
        if(!index) return {};
        if(unpacked) return index;

        var pack = generatePackerFn(table, this.getFields(table));
        var depth = indexObj.keys.length - 1;

        function reduce(cur, curDepth = 0) {
          var memo = {};
          var keys = Object.keys(cur);
          for(var key of keys) {
            if(key === "undefined") { throw new Error("Index: " + name + " contains invalid key(s) at depth " + depth); }

            if(cur[key] instanceof Array) {
              memo[key] = cur[key].map(pack);
            } else if(typeof cur[key] === "object") {
              if(curDepth === depth) {
                memo[key] = pack(cur[key]);
              } else {
                memo[key] = reduce(cur[key], curDepth + 1);
              }
            } else {
              memo[key] = cur[key];
            }
          }
          return memo;
        }

        return reduce(index);
      }
      return null;
    }
    facts(table: Id, unpacked:boolean = false):ArrayFact[]|MapFact[] {
      var index = this.tables[table] || [];
      if(unpacked || !index.length) { return index; }
      var pack = generatePackerFn(table, this.getFields(table));
      return (this.tables[table] || []).map(pack);
    }
    first(table: Id, unpacked:boolean = false):ArrayFact|MapFact {
      return this.facts(table, unpacked)[0];
    }
    select(table: Id, opts, useIds = false): MapFact[] {
      var facts:MapFact[] = [];
      var first = this.first(table, true);
      if(!first) { return []; }
      var names, keys;
      if(!useIds) {
        keys = [];
        names = this.indexes["display name"].index;
        let fields = (this.indexes["view to fields"].index[table] || []);
        let fieldLookup = {};
        for(let field of fields) {
          let fieldId = field["field: field"];
          fieldLookup[names[fieldId]] = fieldId;
        }
        for(let key of Object.keys(opts)) {
          if(opts[key] === undefined) continue;
          var result = fieldLookup[key];
          if(result === undefined) { throw new Error("Field " + key + " is not a valid field of table " + table); }
          keys.push(result);
        }
      } else {
        keys = Object.keys(opts);
        names = {};
        for(let fieldId in opts) {
          names[fieldId] = fieldId;
        }
      }
      keys.sort();
      if(keys.length > 0) {
        var indexName = `${table}|${keys.join("|") }`;
        var index = this.indexes[indexName] ? this.indexes[indexName].index : false;

        if (!index) {
          this.addIndex(indexName, table, create.collector(keys));
          index = this.indexes[indexName].index;
        }
        for(var key of keys) {
          if(index === undefined) break;
          index = index[opts[names[key]]];
        }
        if(index) {
          facts = index;
        }
      } else {
        facts = <MapFact[]>this.facts(table, true);
      }
      if(!facts) { return []; }
      return facts;
    }
    selectPretty(table:Id, opts): MapFact[] {
      var names = this.index("display name", true);
      var facts = this.select(table, opts);
      var mapToNames = generateMapperFn(table, this.getFields(table, true), names);
      return facts.map(mapToNames);
    }
    selectOne(table: Id, opts): MapFact {
      return this.select(table, opts)[0];
    }
    selectOnePretty(table:Id, opts): MapFact {
      var fact = this.select(table, opts)[0];
      if(!fact) { return fact; }
      var names = this.index("display name", true);
      var mapToNames = generateMapperFn(table, this.getFields(table, true), names);
      return mapToNames(fact);
    }
  }

  export var create = {
    lookup: function(keys) {
      var valueKey = keys.pop();
      var tailKey = keys[keys.length - 1];
      var keysLength = keys.length;
      return {requiresRebuild: false,
              keys: keys,
              func: function(cur, adds, removes) {
                var cursor;
                outer: for(var rem of removes) {
                  cursor = cur;
                  for(let keyIx = 0; keyIx < keysLength - 1; keyIx++) {
                    cursor = cursor[rem[key]];
                    if(!cursor) { continue outer; }
                  }
                  delete cursor[rem[tailKey]];
                }
                for(var add of adds) {
                  cursor = cur;
                  for(let keyIx = 0; keyIx < keysLength - 1; keyIx++) {
                    var key = keys[keyIx];
                    var next = cursor[add[key]];
                    if(!next) {
                      next = cursor[add[key]] = {};
                    }
                    cursor = next;
                  }
                  if(valueKey !== false) {
                    cursor[add[tailKey]] = add[valueKey];
                  } else {
                    cursor[add[tailKey]] = add; // @FIXME: Need to pack false lookups, but don't have table name.
                  }
                }
                return cur;
              }
             };
    },
    collector: function(keys) {
      var tailKey = keys[keys.length - 1];
      var keysLength = keys.length;
      return {requiresRebuild: false,
              keys: keys,
              func: function(cur, adds, removes, equals:EqualityChecker) {
                var cursor;
                outer: for(var rem of removes) {
                  cursor = cur;
                  for(let keyIx = 0; keyIx < keysLength - 1; keyIx++) {
                    var key = keys[keyIx];
                    cursor = cursor[rem[key]];
                    if(!cursor) { continue outer; }
                  }
                  cursor[rem[tailKey]] = cursor[rem[tailKey]].filter((potential) => !equals(rem, potential));
                }
                for(var add of adds) {
                  cursor = cur;
                  for(let keyIx = 0; keyIx < keysLength - 1; keyIx++) {
                    var key = keys[keyIx];
                    var next = cursor[add[key]];
                    if(!next) {
                      next = cursor[add[key]] = {};
                    }
                    cursor = next;
                  }
                  next = cursor[add[tailKey]];
                  if(!next) {
                    next = cursor[add[tailKey]] = [];
                  }
                  next.push(add);
                }
                return cur;
              }
             };
    },
    //OPTS:
    // {
    //   keys: [], //keys to index on
    // }
    latestLookup: function(opts) {
      var keyIxes = opts.keys;
      var valueIx = keyIxes.pop();
      return {requiresRebuild: true,
              func: function(cur, adds, removes) {
                var cursor;
                //in a latest scenario, we never remove so we only need to worry about
                //adds
                for(var addIx = 0, addLen = adds.length; addIx < addLen; addIx++) {
                  var add = adds[addIx];
                  cursor = cur;
                  for(var ix = 0, keyLen = keyIxes.length - 1; ix < keyLen; ix++) {
                    var next = cursor[add[keyIxes[ix]]];
                    if(!next) {
                      next = cursor[add[keyIxes[ix]]] = {};
                    }
                    cursor = next;
                  }
                  var finalKey = add[keyIxes[keyIxes.length - 1]];
                  if(valueIx !== false) {
                    //in the case where we only store the value, we just assume that later things
                    //will be later. This may or may not be what you want.
                    cursor[finalKey] = add[valueIx];
                  } else {
                    var finalValue = cursor[finalKey];
                    //if the added value's transaction time is not later, then there's nothing to do here.
                    if(finalValue && finalValue[0] >= add[0]) continue;
                    cursor[finalKey] = add;
                  }
                }
                return cur;
              }
             };
    },
    //OPTS:
    // {
    //   keys: [], //keys to index on
    //   uniqueness: [] //keys that determine uniqueness when testing for latest
    // }
    // @FIXME: Broken leaves ghost copies when migrating across keys.
    latestCollector: function(opts) {
      var keyIxes = opts.keys;
      var uniques = opts.uniqueness;
      return {requiresRebuild: true,
              func: function(cur, adds, removes) {
                var cursor;
                //in a latest scenario, we never remove so we only need to worry about
                //adds
                for(var addIx = 0, addLen = adds.length; addIx < addLen; addIx++) {
                  var add = adds[addIx];
                  cursor = cur;
                  for(var ix = 0, keyLen = keyIxes.length - 1; ix < keyLen; ix++) {
                    var next = cursor[add[keyIxes[ix]]];
                    if(!next) {
                      next = cursor[add[keyIxes[ix]]] = {};
                    }
                    cursor = next;
                  }
                  next = cursor[add[keyIxes[keyIxes.length - 1]]];
                  if(!next) {
                    next = cursor[add[keyIxes[keyIxes.length - 1]]] = [];
                  }
                  if(next.length) {
                    var found = false;
                    //look through and determine if there is something with the same uniqueness
                    //that is older than the current value being inserted
                    filter: for(var filterIx = 0, filterLen = next.length; filterIx < filterLen; filterIx++) {
                      var nextItem = next[filterIx];
                      for(var uniqueIx = 0, uniqueLen = uniques.length; uniqueIx < uniqueLen; uniqueIx++) {
                        var uniqueKey = uniques[uniqueIx];
                        if(nextItem[uniqueKey] !== add[uniqueKey]) {
                          continue filter;
                        }
                      }
                      found = true;
                      if(nextItem[0] < add[0]) {
                        next[filterIx] = add;
                      }
                    }
                    if(!found) {
                      next.push(add);
                    }
                  } else {
                    next.push(add);
                  }
                }
                return cur;
              }
             };
    },
  };
}
