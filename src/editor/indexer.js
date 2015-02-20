import macros from "../macros.sjs";
var helpers = require("./helpers");

//---------------------------------------------------------
// Indexer
//---------------------------------------------------------

function Indexer(program, handlers) {
  this.worker = program.worker
  this.system = program.system;
  this.tableToIndexes = {};
  this.indexes = {};
  this.tablesToForward = [];
  this.handlers = handlers || {};
  this.latestDiffs = {};
};
module.exports.Indexer = Indexer;

Indexer.prototype = {
  handleDiffs: function(diffs, fromProgram) {
    this.latestDiffs = diffs;
    var tableToIndexes = this.tableToIndexes;
    var indexes = this.indexes;
    var system = this.system;
    var cur;
    var specialDiffs = ["view", "field"];
    var isSpecial = false;
    foreach(table of specialDiffs) {
      if(!diffs[table] || !(diffs[table].adds || diffs[table].removes)) { continue; }
      applyDiff(system, table, diffs[table]);
      isSpecial = true;
    }

    if(isSpecial) {
      var viewsToClear = getNonInputWorkspaceViews();

      // Nuke indexes before the system nukes facts.
      foreach(table of viewsToClear) {
        if(!tableToIndexes[table]) { continue; }
        var diff = {adds: [], removes: this.facts(table)};
        foreach(index of tableToIndexes[table]) {
          if(!index || !this.indexes[index]) { continue; }
          var cur = this.indexes[index];
          cur.indexer(cur.index, diff);
        }
      }

      system.recompile();
      //all non-input views were just cleared, make sure the worker clears storage
      //so that we end up with the views getting repopulated correctly.
      this.worker.postMessage({type: "clearStorage", views: viewsToClear})
    }

    forattr(table, diff of diffs) {
      if(tableToIndexes[table]) {
        foreach(index of tableToIndexes[table]) {
          cur = this.indexes[index];
          cur.index = cur.indexer(cur.index, diff);
        }
      }
      if(specialDiffs.indexOf(table) !== -1) { continue; }
      applyDiff(system, table, diff);
    }

    //we should only forward diffs to the program if they weren't
    //from the program to bgin with.
    if(!fromProgram) {
      var toSend = {};
      foreach(table of this.tablesToForward) {
        if(!diffs[table]) continue;
        toSend[table] = diffs[table];
      }
      if(Object.keys(toSend).length) {
        this.worker.postMessage({type: "diffs", diffs: toSend});
      }
    }

    //if we forced a recompile, we shouldn't redraw until the worker comes back
    //with the latest diffs.
    if(!isSpecial && this.handlers.diffsHandled) {
      this.handlers.diffsHandled(diffs);
    }
  },
  facts: function(table) {
    return this.system.getStore(table).getFacts();
  },
  index: function(index) {
    var cur = this.indexes[index];
    if(!cur) throw new Error("No index named: " + index);
    return cur.index;
  },
  hasIndex: function(index) {
    return !!this.indexes[index];
  },
  addIndex: function(table, name, indexer) {
    if(!this.tableToIndexes[table]) {
      this.tableToIndexes[table] = [];
    }
    this.tableToIndexes[table].push(name);
    //initialize the index by sending an add of all the facts we have now.
    this.indexes[name] = {index: indexer(null, {adds: this.facts(table), removes: []}),
                          indexer: indexer};
  },
  removeIndex: function(table, name) {
    var tableIndexes = this.tableToIndexes[table];
    var ix = tableIndexes.indexOf(name);
    if(ix !== -1) {
      tableIndexes.splice(ix, 1);
    }
    if(!tableIndexes.length) {
      delete this.tableToIndexes[table];
    }
    delete this.indexes[name];
  },
  forward: function(table) {
    if(!table) { return; }
    else if(typeof table === "object" && table.length) {
      this.tablesToForward.push.apply(this.tablesToForward, table);
    } else {
      this.tablesToForward.push(table);
    }
  },
  unforward: function(table) {
    var ix = this.tablesToForward.indexOf(table);
    if(ix !== -1) {
      this.tablesToForward.splice(ix, 1);
    }
  },
  currentlyDiffing: function(tableOrTables) {
    var tables = tableOrTables;
    if(tableOrTables.constructor !== Array) {
      tables = [tableOrTables]
    }
    foreach(table of tables) {
      var diff = this.latestDiffs[table];
      if(diff && (diff.adds || diff.removes)) {
        return true;
      }
    }
    return false;
  },
  first: function(table) {
    return this.facts(table)[0];
  },
  last: function(table) {
    var facts = this.facts(table);
    return facts[facts.length - 1];
  }
};

//---------------------------------------------------------
// Fact Indexers
//---------------------------------------------------------

var indexers = {
  // Builds a lookup table from index 1 to index 2. [Fact] -> {[Ix1]: Ix2}
  makeLookup: function(keyIx, valueIx) {
    if(valueIx !== false) {
      return function(cur, diffs) {
        var final = cur || {};
        foreach(remove of diffs.removes) {
          delete final[remove[keyIx]];
        }
        foreach(add of diffs.adds) {
          final[add[keyIx]] = add[valueIx];
        }
        return final;
      }
    } else {
      return function(cur, diffs) {
        var final = cur || {};
        foreach(remove of diffs.removes) {
          delete final[remove[keyIx]];
        }
        foreach(add of diffs.adds) {
          final[add[keyIx]] = add;
        }
        return final;
      }
    }
  },
  // Builds a lookup table from indexes 1 and 2 to index3. [Fact] -> {[Ix1]: {[Ix2]: Ix3}}
  makeLookup2D: function(key1Ix, key2Ix, valueIx) {
    return function(cur, diffs) {
      var final = cur || {};
      foreach(add of diffs.adds) {
        var key1 = add[key1Ix];
        if(!final[key1]) {
          final[key1] = {};
        }
        var key2 = add[key2Ix];
        final[key1][key2] = add[valueIx];
      }
      foreach(remove of diffs.removes) {
        var key1 = remove[key1Ix];
        if(!final[key1]) {
          continue;
        }
        var key2 = remove[key2Ix];
        delete final[key1][key2];
      }

      return final;
    };
  },
  // Groups facts by specified indexes, in order of hierarchy. [Fact] -> {[Any]: [Fact]|Group}
  makeCollector: function(keyIx) {
    if(arguments.length === 1) {
      return function(cur, diffs) {
        var final = cur || {};
        foreach(remove of diffs.removes) {
          if(!final[remove[keyIx]]) continue;
          final[remove[keyIx]] = final[remove[keyIx]].filter(function(cur) {
            return !arrayEqual(cur, remove)
          });
        }

        foreach(add of diffs.adds) {
          if(!final[add[keyIx]]) {
            final[add[keyIx]] = [];
          }
          final[add[keyIx]].push(add);
        }

        garbageCollectIndex(final);
        return final;
      }
    } else {
      var keyIxes = [].slice.apply(arguments);
      var lastKeyIx = keyIxes.pop();
      return function(cur, diffs) {
        var final = cur || {};
        foreach(add of diffs.adds) {
          var keys = [];
          foreach(ix, keyIx of keyIxes) {
            keys[ix] = add[keyIx];
          }
          var cur = helpers.aget(final, keys, true);
          if(!cur[add[lastKeyIx]]) {
            cur[add[lastKeyIx]] = [];
          }
          cur[add[lastKeyIx]].push(add);
        }
        foreach(remove of diffs.removes) {
          var keys = [];
          foreach(ix, keyIx of keyIxes) {
            keys[ix] = remove[keyIx];
          }
          var cur = helpers.aget(final, keys, false);
          if(!cur || !cur[remove[lastKeyIx]]) { continue; }
          cur[remove[lastKeyIx]] = cur[remove[lastKeyIx]].filter(function(c) {
            return !arrayEqual(c, remove);
          });

        }
        garbageCollectIndex(final);
        return final;
      }
    }
  },
  // Sorts facts by specified indexes, in order of priority. [Fact] -> [Fact]
  makeSorter: function() {
    var sortIxes = [].slice.apply(arguments);
    return function(cur, diffs) {
      var final = cur || [];
      foreach(remove of diffs.removes) {
        foreach(ix, item of final) {
          if(arrayEqual(item, remove)) {
            final.splice(ix, 1);
            break;
          }
        }
      }

      // @NOTE: This can be optimized further by presorting adds and maintaining loIx as a sliding window.
      foreach(add of diffs.adds) {
        var loIx = 0;
        var hiIx = final.length;
        foreach(sortIx of sortIxes) {
          for(var ix = loIx; ix < hiIx; ix++) {
            var item = final[ix];
            if(add[sortIx] > item[sortIx]) {
              loIx = ix + 1;
            } else if(add[sortIx] < item[sortIx]) {
              hiIx = ix;
              break;
            }
          }
        }
        final.splice(loIx, 0, add);
      }

      return final;
    }
  }
};
module.exports.indexers = indexers;

//---------------------------------------------------------
// Index helpers
//---------------------------------------------------------

// Delete any keys or descendant keys which are empty.
function garbageCollectIndex(index) {
  forattr(key, group of index) {
    if(group instanceof Array) {
      if(!group || !group.length) {
        delete index[key];
      }
    } else if(typeof group === "object") {
      garbageCollectIndex(group);
      if(!Object.keys(group).length) {
        delete index[key];
      }
    }
  }
}
module.exports.garbageCollectIndex = garbageCollectIndex;

function hasTag(id, needle) {
  var tags = indexer.index("idToTags")[id];
  foreach(tagEntry of tags) {
    unpack [_, tag] = tagEntry;
    if(tag === needle) return true;
  }
  return false;
}
module.exports.hasTag = hasTag;

//List all the tables that the table queries on.
function incomingTables(curTable) {
  var incoming = {};
  var queries = indexer.index("viewToQuery")[curTable];
  var queryToConstraint = indexer.index("queryToViewConstraint");
  var queryToAggregate = indexer.index("queryToAggregateConstraint");
  var constraints;
  foreach(query of queries) {
    constraints = queryToConstraint[query[0]];
    foreach(constraint of constraints) {
      incoming[constraint[2]] = true;
    }
    aggregates = queryToAggregate[query[0]];
    foreach(agg of aggregates) {
      incoming[agg[3]] = true;
    }
  }
  return Object.keys(incoming);
}
module.exports.incomingTables = incomingTables;

// List all the tables that query on this table.
function outgoingTables(curTable) {
  //@TODO
}
module.exports.outgoingTables = outgoingTables;

// List all derived workspace views.
function getNonInputWorkspaceViews() {
  var final = [];
  var views = indexer.facts("workspaceView");
  foreach(view of views) {
    if(!hasTag(view[0], "input")) {
      final.push(view[0]);
    }
  }
  return final;
}
module.exports.getNonInputWorkspaceViews = getNonInputWorkspaceViews;

// List the positions and sizes of each tile currently in the grid.
function getTileFootprints() {
  return indexer.facts("gridTile").map(function(cur, ix) {
    unpack [tile, type, w, h, x, y] = cur;
    return {pos: [x, y], size: [w, h]};
  });
}
module.exports.getTileFootprints = getTileFootprints;

function sortByIx(facts, ix) {
  return facts.sort(function(a, b) {
    return a[ix] - b[ix];
  });
};
module.exports.sortByIx = sortByIx;

//---------------------------------------------------------
// Diff helpers
//---------------------------------------------------------
var _dependencies = {
  view: {
    field: [0, 1],
    query: [0, 1],
    tag: [0, 0]
  },
  field: {
    aggregateConstraint: [0, 2],
    constantConstraint: [0, 1],
    displayName: [0, 0],
    functionConstraint: [0, 2],
    tag: [0, 0],
    viewConstraint: [0, 2]
  },
  query: {
    aggregateConstraint: [0, 1],
    constantConstraint: [0, 0],
    functionConstraint: [0, 1],
    tag: [0, 0],
    viewConstraint: [0, 1]
  },
  aggregateConstraint: {
    aggregateConstraintAggregateInput: [0, 0],
    aggregateConstraintBinding: [0, 0],
    aggregateConstraintSolverInput: [0, 0],
    tag: [0, 0]
  },
  functionConstraint: {
    functionConstraintInput: [0, 0],
    tag: [0, 0]
  },
  viewConstraint: {
    viewConstraintBinding: [0, 0],
    tag: [0, 0]
  }
};

function _collect(view, ix, val) {
  var facts = indexer.facts(view);
  var matches = [];
  if(!facts) { return matches; }

  foreach(fact of facts) {
    if(fact[ix] === val) {
      matches.push(fact);
    }
  }
  return matches;
}

var diff = {
// Remove fact from view, including all known dependencies.
  remove: function remove(view, fact) {
    return diff.removeAll(view, [fact]);
  },
  removeAll: function removeAll(view, facts, indent) {
    indent = indent || 0;
    var diff = {};
    if(!facts) { return diff; }
    foreach(fact of facts) {
      if(!fact) { continue; }
      if(!diff[view]) {
        diff[view] = {adds: [], removes: []};
      }
      diff[view].removes.push(fact);
      var deps = _dependencies[view];
      // console.log(new Array(indent + 1).join("> "), "Removing '" + view + "':", fact, "---");
      // console.log(new Array(indent + 2).join("  "), "X", view, diff[view]);
      if(!deps) { continue; }

      forattr(dep, keys of deps) {
        unpack [fromIx, toIx] = keys;
        // @FIXME: Slow fallback until we figure out how to integrate indexes.
        var depFacts = _collect(dep, toIx, fact[fromIx]);
        // console.log(new Array(indent + 2).join("  "), view, "<--", dep, "@", keys, ":", depFacts);
        helpers.merge(diff, removeAll(dep, depFacts, indent + 1));
      }
    }
    return diff;
  }
}
module.exports.diff = diff;
