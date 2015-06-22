module Indexing {
	declare var DEBUG;
  declare var api;
  
  export function arraysIdentical(a, b) {
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

  function indexOfArray(haystack, needle) {
    var result = -1;
    for(var haystackIx = 0, haystackLen = haystack.length; haystackIx < haystackLen; haystackIx++) {
      var cur = haystack[haystackIx];
      if(arraysIdentical(cur, needle)) {
        result = haystackIx;
        break;
      }
    }
    return result;
  }

  function applyTableDiff(table, adds, removes) {
    var dedupedAdds = [];
    var dedupedRemoves = [];
    for(var remIx = 0, remLen = removes.length; remIx < remLen; remIx++) {
      var rem = removes[remIx];
      var foundIx = indexOfArray(table, rem);
      if(foundIx !== -1) {
        table.splice(foundIx, 1);
        dedupedRemoves.push(rem);
      }
    }
    for(var addIx = 0, addLen = adds.length; addIx < addLen; addIx++) {
      var add = adds[addIx];
      var foundIx = indexOfArray(table, add);
      if(foundIx !== -1) continue;
      table.push(add);
      dedupedAdds.push(add);
    }
    return {adds: dedupedAdds, removes: dedupedRemoves};
  }

  export class Indexer {
    tables: {};
    indexes: {};
    tableToIndex: {};
    needsRebuild: {[table: string]: boolean};
    constructor() {
      this.tables = {};
      this.indexes = {};
      this.tableToIndex = {};
      this.needsRebuild = {};
    }
    totalFacts() {
      var total = 0;
      for(var table in this.tables) {
        total += this.tables[table].length;
      }
      return total;
    }
    clear() {
      var final = {};
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
    clearTable(table: string) {
      if(this.tables[table]) {
        this.handleDiff(table, [], this.tables[table].slice());
      }
    }
    markForRebuild(table: string) {
      this.needsRebuild[table] = true;
    }
    handleDiff(table: string, adds: any[], removes: any[]) {
      var safeAdds = adds || [];
      var safeRemoves = removes || [];
      var dedupedAdds = safeAdds;
      var dedupedRemoves = safeRemoves;
      //update table
      if(this.tables[table] === undefined) {
        this.tables[table] = [];
      }
      if(this.tables[table] !== false) {
        var deduped = applyTableDiff(this.tables[table], safeAdds, safeRemoves);
        dedupedAdds = deduped.adds;
        dedupedRemoves = deduped.removes;
      }
      //update indexes
      var shouldRebuild = this.needsRebuild[table];
      var indexes = this.tableToIndex[table] || [];
      for(var ix = 0, len = indexes.length; ix < len; ix++) {
        var cur = indexes[ix];
        if(shouldRebuild && cur.requiresRebuild) {
          cur.index = cur.indexer({}, this.tables[table], []);
        } else {
          cur.index = cur.indexer(cur.index, dedupedAdds, dedupedRemoves);
        }
      }
      if(shouldRebuild) {
        this.needsRebuild[table] = false;
      }
    }
    indexOnly(table: string) {
      this.tables[table] = false;
    }
    dumpMapDiffs() {
      var final = [];
      for(var table in this.tables) {
        var fieldIds = api.code.sortedViewFields(table) || []; // @FIXME: Shouldn't hardcode knowledge of an external index.
        final.push([table, fieldIds, this.tables[table], []]);
      }
      return {changes: final};
    }
    compactDiffs() {
      var compiler = [];
      var compilerTables = Object.keys(api.builtins.compiler);
      for(var table of compilerTables) {
        var fieldIds = api.code.sortedViewFields(table) || []; // @FIXME: Shouldn't hardcode knowledge of an external index.
        compiler.push([table, fieldIds, this.tables[table] || [], []]);
      }
      var facts = [];
      for(var factTable in this.tables) {
        if(api.builtins.compiler[factTable]) continue;
        var kind = api.ixer.index("view")[factTable][1];
        if(kind !== "table") continue;
        var fieldIds = api.code.sortedViewFields(factTable) || []; // @FIXME: Shouldn't hardcode knowledge of an external index.
        facts.push([factTable, fieldIds, this.tables[factTable] || [], []]);
      }
      return JSON.stringify({changes: compiler}) + "\n" + JSON.stringify({changes: facts});
    }
    handleMapDiffs(diffs) {
      for(var diffIx = 0, diffLen = diffs.length; diffIx < diffLen; diffIx++) {
        var diff = diffs[diffIx];
        var table = diff[0];
        var fields = diff[1]; // @FIXME: Reorder fields as necessary to support concurrent editing of view structure.
        var inserted = diff[2];
        var removed = diff[3];
        if ((inserted.length == 0) && (removed.length == 0)) { continue; }
        var fieldIds = api.code.sortedViewFields(table); // @GLOBAL Due to circular ref. w/ synchronous dependency loading.
        if(!fieldIds) {
          fieldIds = fields;
        }
        var mapping = {};
        var changed = false;
        var fieldLength = fields.length;
        for(var ix = 0; ix < fieldLength; ix++) {
          mapping[ix] = fieldIds.indexOf(fields[ix]);
          if(mapping[ix] === -1) {
            throw new Error("Invalid mapping for field: '" + fields[ix] + "' to fields: " + JSON.stringify(fieldIds));
          }
          if(mapping[ix] !== ix) { changed = true; }
        }

        if(changed) {
          var neueInserted = [];
          for(var insertedIx = 0, insertedLength = inserted.length; insertedIx < insertedLength; insertedIx++) {
            var neue = [];
            for(var ix = 0; ix < fieldLength; ix++) {
              neue[mapping[ix]] = inserted[insertedIx][ix];
            }
            neueInserted.push(neue);
          }
          inserted = neueInserted;

          var neueRemoved = [];
          for(var removedIx = 0, removedLength = removed.length; removedIx < removedLength; removedIx++) {
            var neue = [];
            for(var ix = 0; ix < fieldLength; ix++) {
              neue[mapping[ix]] = removed[removedIx][ix];
            }
            neueRemoved.push(neue);
          }
          removed = neueRemoved;
        }

        if(inserted.length || removed.length) {
          this.handleDiff(table, inserted, removed);
        }
      }
    }
    handleDiffs(diffs: any) {
      var diffTables = {};
      var adds = {};
      var removes = {};
      for(var diffIx = 0, diffLen = diffs.length; diffIx < diffLen; diffIx++) {
        var cur = diffs[diffIx];
        var table = cur[0];
        var action = cur[1];
        var fact = cur[2];
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
        this.handleDiff(table, adds[table], removes[table]);
      }
    }
    addIndex(name: string, table: string, indexer) {
      var index = {index: {}, indexer: indexer.func, table: table, requiresRebuild: indexer.requiresRebuild};
      this.indexes[name] = index;
      if(!this.tableToIndex[table]) {
        this.tableToIndex[table] = [];
      }
      this.tableToIndex[table].push(index);
      if(this.tables[table]) {
        index.index = index.indexer(index.index, this.tables[table], []);
      }
    }
    index(name: string) {
      if(this.indexes[name]) {
        var indexObj = this.indexes[name];
        if(DEBUG && DEBUG.INDEXER && !this.tables[indexObj.table]) {
           console.warn("Indexed table '" + indexObj.table + "' does not yet exist for index '" + name + "'.");
        }
        return this.indexes[name].index;
      }
      return null;
    }
    facts(name: string) {
      return this.tables[name] || [];
    }
    first(name: string) {
      return this.facts(name)[0];
    }
    select(table: string, opts: any): any[] {
      var self = this;
      var facts = [];
      var fields = api.code.sortedViewFields(table) || [];
      var nameLen = table.length + 2;
      var fieldNames = fields.map((cur) => self.index("display name")[cur]);
      var keys = Object.keys(opts);
      keys = keys.map(function (key) {
        var result = fields[fieldNames.indexOf(key)];
        if(result === undefined) { throw new Error("Field " + keys + " is not a valid field of table " + table); }
        return result;
      });
      keys.sort();
      if(keys.length > 0) {
        var indexName = `${table}|${keys.join("|") }`;
        var index = this.index(indexName);
        var keyIxes = [];
        for(var curKey of keys) {
          keyIxes.push(fields.indexOf(curKey));
        }
        if (!index) {
          this.addIndex(indexName, table, create.collector(keyIxes));
          index = this.index(indexName);
        }
        for(var keyIx of keyIxes) {
          if(index === undefined) break;
          index = index[opts[fieldNames[keyIx]]];
        }
        facts = index;
      } else {
        facts = this.facts(table);
      }
      if(!facts) { return []; }
      return facts.map(function(fact) {
        var cur = {};
        for(var i = 0, fieldsLen = fields.length; i < fieldsLen; i++) {
          cur[fieldNames[i]] = fact[i];
        }
        return cur;
      });
    }
    selectOne(table: string, opts: any): any {
      return this.select(table, opts)[0];
    }
  }
  
  export var create = {
    lookup: function(keyIxes) {
      var valueIx = keyIxes.pop();
      return {requiresRebuild: false,
              func: function(cur, adds, removes) {
                var cursor;
                outer: for(var remIx = 0, remLen = removes.length; remIx < remLen; remIx++) {
                  var rem = removes[remIx];
                  cursor = cur;
                  for(var ix = 0, keyLen = keyIxes.length - 1; ix < keyLen; ix++) {
                    cursor = cursor[rem[keyIxes[ix]]];
                    if(!cursor) continue outer;
                  }
                  delete cursor[rem[keyIxes[keyIxes.length - 1]]];
                }
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
                  if(valueIx !== false) {
                    cursor[add[keyIxes[keyIxes.length - 1]]] = add[valueIx];
                  } else {
                    cursor[add[keyIxes[keyIxes.length - 1]]] = add;
                  }
                }
                return cur;
              }
             };
    },
    collector: function(keyIxes) {
      return {requiresRebuild: false,
              func: function(cur, adds, removes) {
                var cursor;
                outer: for(var remIx = 0, remLen = removes.length; remIx < remLen; remIx++) {
                  var rem = removes[remIx];
                  cursor = cur;
                  for(var ix = 0, keyLen = keyIxes.length - 1; ix < keyLen; ix++) {
                    cursor = cursor[rem[keyIxes[ix]]];
                    if(!cursor) continue outer;
                  }

                  cursor[rem[keyIxes[keyIxes.length - 1]]] = cursor[rem[keyIxes[keyIxes.length - 1]]].filter(function(potential) {
                    return !arraysIdentical(rem, potential);
                  });
                }
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
