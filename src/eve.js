var FAILED = 0;
var CHANGED = 1;
var UNCHANGED = 2;

var IGNORED = 0;
var SPLITTED = 1;

var eve = {};

// UTIL

function assert(cond, msg) {
  if(!cond) {
    throw new Error(msg);
  }
}

function makeArray(len, fill) {
  var arr = [];
  for(var i = 0; i < len; i++) {
    arr[i] = fill;
  }
  return arr;
}

// ORDERING / COMPARISON

var least = false;
var greatest = undefined;

function compareValue(a, b) {
  if(a === b) return 0;
  var at = typeof a;
  var bt = typeof b;
  if((at === bt && a < b) || (at < bt)) return -1;
  return 1;
}

function compareValueArray(a, b) {
  var len = a.length;
  if(len !== b.length) throw new Error("compareValueArray on arrays of different length: " + a + " :: " + b);
  for(var i = 0; i < len; i++) {
    var comp = compareValue(a[i], b[i]);
    if(comp !== 0) return comp;
  }
  return 0;
}

function arrayEqual(a, b) {
  var len = a.length;
  assert(len === b.length);
  for(var i = 0; i < len; i++) {
    if(a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

function boundsContainsPoint(los, his, ixes, point) {
  for (var i = ixes.length - 1; i >= 0; i--) {
    var ix = ixes[i];
    if (ix !== undefined) {
      if (compareValue(point[i], los[ix]) === -1) return false;
      if (compareValue(point[i], his[ix]) === 1) return false;
    }
  }
  return true;
}

function solutionMatchesPoint(solution, ixes, point) {
  for (var i = ixes.length - 1; i >= 0; i--) {
    var ix = ixes[i];
    if ((ix !== undefined) && (point[i] !== solution[ix])) return false;
  }
  return true;
}

// MEMORY
// track a multi-set of facts
// supports bounds refinement

function Memory(facts) {
  this.facts = facts;
}

Memory.empty = function() {
  return new Memory([]);
};

Memory.fromFacts = function(facts) {
  return new Memory(facts.slice());
};

function diffFacts(oldFacts, newFacts, outputAdds, outputDels) {
  var adds = {};
  var dels = {};
  for (var i = newFacts.length - 1; i >= 0; i--) {
    var newFact = newFacts[i];
    adds[JSON.stringify(newFact)] = newFact;
  }
  for (var i = oldFacts.length - 1; i >= 0; i--) {
    var oldFact = oldFacts[i];
    dels[JSON.stringify(oldFact)] = oldFact;
  }
  for (var i = newFacts.length - 1; i >= 0; i--) {
    delete dels[JSON.stringify(newFacts[i])];
  }
  for (var i = oldFacts.length - 1; i >= 0; i--) {
    delete adds[JSON.stringify(oldFacts[i])];
  }
  var addKeys = Object.keys(adds);
  var delKeys = Object.keys(dels);
  for (var i = addKeys.length - 1; i >= 0; i--) {
    outputAdds.push(adds[addKeys[i]]);
  }
  for (var i = delKeys.length - 1; i >= 0; i--) {
    outputDels.push(dels[delKeys[i]]);
  }
}

function dedupeFacts(facts) {
  var output = [];
  diffFacts([], facts, output, []);
  return output;
}

Memory.prototype = {
  update: function(adds, dels) {
    if ((adds.length === 0) && (dels.length === 0)) return this;

    var facts = this.facts.slice();
    for (var i = adds.length - 1; i >= 0; i--) {
      facts.push(adds[i]);
    }
    nextDel: for (var i = dels.length - 1; i >= 0; i--) {
      var del = dels[i];
      for (var j = facts.length - 1; j >= 0; j--) {
        var fact = facts[j];
        if ((del.length === fact.length) && arrayEqual(del, fact)) {
          facts.splice(j, 1);
          continue nextDel;
        }
      }
    }

    return new Memory(facts);
  },

  diff: function(oldTree, outputAdds, outputDels) {
    // TODO hacky gross diffing
    diffFacts(oldTree.facts, this.facts, outputAdds, outputDels);
  },

  differsFrom: function(oldTree) {
    var adds = [], dels = [];
    this.diff(oldTree, adds, dels);
    return (adds.length > 0) || (dels.length > 0);
  },

  getFacts: function() {
    return dedupeFacts(this.facts);
  }
};

function MemoryConstraint(storeIx, fieldIxes) {
  this.storeIx = storeIx;
  this.fieldIxes = fieldIxes;
}

MemoryConstraint.prototype = {
  start: function(system) {
    return system.getStore(this.storeIx).getFacts();
  },

  propagate: function(myIx, constraintStates, los, his) {
    var fieldIxes = this.fieldIxes;
    var facts = constraintStates[myIx];

    // console.log("Facts before " + los + " " + his + " " + JSON.stringify(facts));

    var newFacts = [];

    for (var i = facts.length - 1; i >= 0; i--) {
      var fact = facts[i];
      if (boundsContainsPoint(los, his, fieldIxes, fact) === true) {
        newFacts.push(fact);
      }
    }

    facts = constraintStates[myIx] = newFacts;

    // console.log("Facts after " + los + " " + his + " " + JSON.stringify(facts));

    if (facts.length === 0) {
      // console.log("Failed with no facts");
      return FAILED;
    }

    var changed = false;

    for (var i = fieldIxes.length - 1; i >= 0; i--) {
      var newLo = greatest;
      var newHi = least;
      for (var j = facts.length - 1; j >= 0; j--) {
        var value = facts[j][i];
        if (compareValue(value, newLo) === -1) newLo = value;
        if (compareValue(value, newHi) === 1) newHi = value;
      }
      var ix = fieldIxes[i];
      if (compareValue(newLo, los[ix]) === 1) {
        los[ix] = newLo;
        changed = true;
      }
      if (compareValue(newHi, his[ix]) === -1) {
        his[ix] = newHi;
        changed = true;
      }
    }

    return (changed === true) ? CHANGED : UNCHANGED;
  },

  split: function(myIx, leftConstraintStates, leftLos, leftHis, rightConstraintStates, rightLos, rightHis) {
    var facts = leftConstraintStates[myIx];
    if (facts.length < 2) return IGNORED;

    var fieldIxes = this.fieldIxes;

    var i, ix, lowerPivot;
    findLowerPivot: for (i = fieldIxes.length - 1; i >= 0; i--) {
      ix = fieldIxes[i];
      if (ix !== undefined) {
        for (var j = facts.length - 1; j >= 0; j--) {
          lowerPivot = facts[j][i];
          if (lowerPivot !== leftHis[ix]) break findLowerPivot;
        }
      }
    }

    if(i < 0) return IGNORED;

    var upperPivot = greatest;
    for (var j = facts.length - 1; j >= 0; j--) {
      var value = facts[j][i];
      if ((compareValue(value, lowerPivot) === 1) && (compareValue(value, upperPivot) === -1)) upperPivot = value;
    }

    leftHis[ix] = lowerPivot;
    rightLos[ix] = upperPivot;
    // console.log("Split at fact[" + i + "]=" + lowerPivot + "," + upperPivot);
    return SPLITTED;
  }
};

function NegatedMemoryConstraint(storeIx, fieldIxes) {
  this.storeIx = storeIx;
  this.fieldIxes = fieldIxes;
}

NegatedMemoryConstraint.prototype = {
  start: function(system) {
    return system.getStore(this.storeIx).getFacts();
  },

  propagate: function(myIx, constraintStates, los, his) {
    var facts = constraintStates[myIx];
    var fieldIxes = this.fieldIxes;

    for (var i = fieldIxes.length - 1; i >= 0; i--) {
      var ix = fieldIxes[i];
      if ((ix !== undefined) && (los[ix] !== his[ix])) return UNCHANGED;
    }

    for (var i = facts.length - 1; i >= 0; i--) {
      if (solutionMatchesPoint(los, fieldIxes, facts[i]) === true) {
        // console.log("Negation failed on " + facts[i]);
        return FAILED;
      }
    }
  },

  split: function(myIx, leftConstraintStates, leftLos, leftHis, rightConstraintStates, rightLos, rightHis) {
    return false;
  }
};

// PROVENANCE
// responsible for avoiding redundant computation and calculating diffs

function Provenance(numVars, constraints, outputIx) {
  this.numVars = numVars;
  this.constraints = constraints;
  this.queuedAdds = [];
  this.outputIx = outputIx;
}

Provenance.empty = function(numVars, constraints, outputIx) {
  return new Provenance(numVars, constraints, outputIx);
};

Provenance.prototype = {
  // provenance interface
  // (all inputs may be aliased)

  propagated: function (oldLos, oldHis, newLos, newHis, constraintIx) {},

  splitted: function (oldLos, oldHis, leftLos, leftHis, rightLos, rightHis, constraintIx) {},

  failed: function (oldLos, oldHis, ix) {},

  solved: function (solution) {
    this.queuedAdds.push(solution.slice());
  },

  // constraint interface

  start: function (system) {
    return null;
  },

  finish: function(system) {
    var oldOutput = system.getStore(this.outputIx) || Memory.empty();
    var newOutput = Memory.fromFacts(this.queuedAdds);
    this.queuedAdds = [];
    if (newOutput.differsFrom(oldOutput)) system.setStore(this.outputIx, newOutput);
  },

  propagate: function(myIx, constraintStates, los, his) {
    return UNCHANGED;
  },

  split: function(myIx, leftConstraintStates, leftLos, leftHis, rightConstraintStates, rightLos, rightHis) {
    return IGNORED;
  }
};

// FUNCTIONS

function FunctionConstraint(fun, args, inIxes, outIx) {
  this.fun = fun;
  this.args = args;
  this.inIxes = inIxes;
  this.outIx = outIx;
  this.inValues = makeArray(inIxes.length, null);
}

FunctionConstraint.prototype = {
  start: function(system) {
    return null;
  },

  propagate: function(myIx, constraintStates, los, his) {
    var inIxes = this.inIxes;
    var inValues = this.inValues;

    for (var i = inIxes.length - 1; i >= 0; i--) {
      var inIx = inIxes[i];
      var lo = los[inIx];
      if ((lo !== his[inIx])) return UNCHANGED;
      inValues[i] = lo;
    }

    var outIx = this.outIx;
    var outValue = this.fun.apply(null, inValues);
    var compLo = compareValue(outValue, los[outIx]);
    var compHi = compareValue(outValue, his[outIx]);
    if ((compLo === -1) || (compHi === 1)) return FAILED;
    if (outIx !== undefined) {
      los[outIx] = outValue;
      his[outIx] = outValue;
      return ((compLo === 1) || (compHi === -1)) ? CHANGED : UNCHANGED;
    } else {
      return UNCHANGED;
    }
  },

  split: function(myIx, leftConstraintStates, leftLos, leftHis, rightConstraintStates, rightLos, rightHis) {
    return IGNORED;
  }
};

// SOLVER

function Solver(numVars, constants, constraints, provenance) {
  this.numVars = numVars;
  this.constants = constants;
  this.constraints = constraints;
  this.provenance = provenance;
}

Solver.empty = function (numVars, constants, constraints, outputIx) {
  var provenance = Provenance.empty(numVars, constraints, outputIx);
  constraints.push(provenance);
  return new Solver(numVars, constants, constraints, provenance);
};

function pushInto(depth, elem, queue) {
  var start = depth * elem.length;
  for (var i = elem.length - 1; i >= 0; i--) {
    queue[start + i] = elem[i];
  }
}

function popFrom(depth, elem, queue) {
  var start = depth * elem.length;
  for (var i = elem.length - 1; i >= 0; i--) {
    elem[i] = queue[start + i];
  }
}

Solver.prototype = {
  refresh: function(system) {
    var provenance = this.provenance;
    var numVars = this.numVars;
    var constraints = this.constraints;
    var numConstraints = constraints.length;

    var constraintStates = [];
    for (var i = constraints.length - 1; i >= 0; i--) {
      var constraintState = constraints[i].start(system);
      if (constraintState === false) return; // constraint is trivially unsatisfiable - eg provenance constraint when nothing is dirty
      constraintStates[i] = constraintState;
    }

    var los = makeArray(numVars, least);
    var his = makeArray(numVars, greatest);
    var constants = this.constants;
    for (var i = constants.length - 1; i >= 0; i--) {
      var constant = constants[i];
      if (constant !== undefined) {
        los[i] = constant;
        his[i] = constant;
      }
    }

    // buffers for splitting;
    var rightConstraintStates = constraintStates.slice();
    var rightLos = los.slice();
    var rightHis = his.slice();

    // stack for depth-first search
    var depth = 0;
    var queuedConstraintStates = [];
    var queuedLos = [];
    var queuedHis = [];

    // console.log("Starting solve");

    solve: while (true) {

      // propagate all constraints until nothing changes
      var lastChanged = 0;
      var current = 0;
      propagate: while (true) {
        // console.log("Before prop " + current + " " + los + " " + his);
        var result = constraints[current].propagate(current, constraintStates, los, his);
        if (result === FAILED) {
          provenance.failed(); // TODO
          if (depth === 0) break solve;
          depth -= 1;
          popFrom(depth, constraintStates, queuedConstraintStates);
          popFrom(depth, los, queuedLos);
          popFrom(depth, his, queuedHis);
          continue solve;
        } else if (result === CHANGED) {
          provenance.propagated(); // TODO
          lastChanged = current;
        }
        // console.log("After prop " + current + " " + los + " " + his);
        current = (current + 1) % numConstraints;
        if (current === lastChanged) break propagate;
      }

      // check if we are at a solution
      if (arrayEqual(los, his)) {
        provenance.solved(los);
        // console.log("Found " + JSON.stringify(los));
        if (depth === 0) break solve;
        depth -= 1;
        popFrom(depth, constraintStates, queuedConstraintStates);
        popFrom(depth, los, queuedLos);
        popFrom(depth, his, queuedHis);
        continue solve;
      }

      // split the problem in two
      var splitter;
      split: for (splitter = constraints.length - 1; splitter >= 0; splitter--) {
        pushInto(0, constraintStates, rightConstraintStates);
        pushInto(0, los, rightLos);
        pushInto(0, his, rightHis);
        var result = constraints[splitter].split(splitter, constraintStates, los, his, rightConstraintStates, rightLos, rightHis);
        if (result === SPLITTED) {
          provenance.splitted(); // TODO
          break split;
        }
      }
      // console.log("Split by " + splitter);
      assert(splitter >= 0);

      pushInto(depth, rightConstraintStates, queuedConstraintStates);
      pushInto(depth, rightLos, queuedLos);
      pushInto(depth, rightHis, queuedHis);
      depth += 1;

    }

    // console.log("Finished solve");

    provenance.finish(system);
  }
};

// AGGREGATE

function Aggregate(groupIxes, sortIxes, limitIx, reducerInIxes, reducerOutIxes, reducerFuns, inputIx, outputIx) {
  this.groupIxes = groupIxes;
  this.sortIxes = sortIxes;
  this.limitIx = limitIx;
  this.reducerInIxes = reducerInIxes;
  this.reducerOutIxes = reducerOutIxes;
  this.reducerFuns = reducerFuns;
  this.inputIx = inputIx;
  this.outputIx = outputIx;
}

Aggregate.empty = function (groupIxes, sortIxes, limitIx, reducerInIxes, reducerOutIxes, reducerFuns, inputIx, outputIx) {
  return new Aggregate(groupIxes, sortIxes, limitIx, reducerInIxes, reducerOutIxes, reducerFuns, inputIx, outputIx);
};

function groupBy(facts, groupIxes) {
  var groups = {};
  for (var i = facts.length - 1; i >= 0; i--) {
    var fact = facts[i];
    var group = [];
    for (var j = groupIxes.length - 1; j >= 0; j--) {
      group[j] = fact[groupIxes[j]];
    }
    var groupFacts = groups[JSON.stringify(group)] || (groups[JSON.stringify(group)] = []);
    groupFacts.push(fact);
  }
  return groups;
}

function compareSortKey(a,b) {
  return compareValueArray(a[0], b[0]);
}

function sortBy(facts, sortIxes) {
  for (var i = facts.length - 1; i >= 0; i--) {
    var fact = facts[i];
    var sortKey = [];
    for (var j = sortIxes.length - 1; j >= 0; j--) {
      sortKey[j] = fact[sortIxes[j]];
    }
    facts[i] = [sortKey, fact];
  }
  facts.sort(compareSortKey);
  for (var i = facts.length - 1; i >= 0; i--) {
    facts[i] = facts[i][1];
  }
}

function reduceBy(facts, inIx, outIx, fun) {
  var inValues = [];
  for (var i = facts.length - 1; i >= 0; i--) {
    inValues[i] = facts[i][inIx];
  }
  var outValue = fun.call(null, inValues);
  for (var i = facts.length - 1; i >= 0; i--) {
    facts[i][outIx] = outValue;
  }
}

Aggregate.prototype = {
  refresh: function(system) {
    var inputFacts = system.getStore(this.inputIx).getFacts();
    var groups = groupBy(inputFacts, this.groupIxes);
    var outputFacts = [];
    for (var group in groups) {
      var groupFacts = groups[group];
      sortBy(groupFacts, this.sortIxes);
      if (this.limitIx !== undefined) groupFacts = groupFacts.slice(0, groupFacts[0][this.limitIx]);
      var reducerInIxes = this.reducerInIxes;
      var reducerOutIxes = this.reducerOutIxes;
      var reducerFuns = this.reducerFuns;
      for (var i = reducerInIxes.length - 1; i >= 0; i--) {
        reduceBy(groupFacts, reducerInIxes[i], reducerOutIxes[i], reducerFuns[i]);
      }
      for (var i = groupFacts.length - 1; i >= 0; i--) {
        outputFacts.push(groupFacts[i]);
      }
    }
    var oldOutput = system.getStore(this.outputIx);
    var newOutput = Memory.fromFacts(outputFacts);
    if (newOutput.differsFrom(oldOutput)) system.setStore(this.outputIx, newOutput);
  }
};

// SINK

function SinkConstraint(inputIx, fieldIxes) {
  this.inputIx = inputIx;
  this.fieldIxes = fieldIxes;
}

SinkConstraint.prototype = {
  into: function(system, outputFacts) {
    var inputFacts = system.getStore(this.inputIx).facts;
    var fieldIxes = this.fieldIxes;
    for (var i = inputFacts.length - 1; i >= 0; i--) {
      var inputFact = inputFacts[i];
      var outputFact = [];
      for (var j = fieldIxes.length - 1; j >= 0; j--) {
        outputFact[j] = inputFact[fieldIxes[j]];
      }
      outputFacts.push(outputFact);
    }
  }
};

function Sink(constraints, outputIx) {
  this.constraints = constraints;
  this.outputIx = outputIx;
}

Sink.prototype = {
  refresh: function(system) {
    var outputFacts = [];
    var constraints = this.constraints;
    for (var i = constraints.length - 1; i >= 0; i--) {
      constraints[i].into(system, outputFacts);
    }
    var oldOutput = system.getStore(this.outputIx);
    var newOutput = Memory.fromFacts(outputFacts);
    if (newOutput.differsFrom(oldOutput)) system.setStore(this.outputIx, newOutput);
  }
};

// SYSTEM

var compilerTables =
    [["table"],
     ["field"],
     ["rule"],
     ["valve"],
     ["pipe"],
     ["tableConstraint"],
     ["constantConstraint"],
     ["functionConstraint"],
     ["functionConstraintInput"],
     ["limitValve"],
     ["groupValve"],
     ["sortValve"],
     ["reducer"],
     // TODO adding these here is hacky
     ["displayNames"],
     ["editor_rule"],
     ["join"],
     ["external_events"]];

var compilerFields =
    [["table", "table", 0],

     ["field", "table", 0],
     ["field", "field", 1],
     ["field", "ix", 2],

     ["rule", "rule", 0],
     ["rule", "ix", 1],

     ["valve", "valve", 0],
     ["valve", "rule", 1],
     ["valve", "ix", 2],

     ["pipe", "pipe", 0],
     ["pipe", "table", 1],
     ["pipe", "rule", 2],
     ["pipe", "direction", 3], // +source, -source, +sink

     ["tableConstraint", "valve", 0],
     ["tableConstraint", "pipe", 1],
     ["tableConstraint", "field", 2],

     ["constantConstraint", "valve", 0],
     ["constantConstraint", "value", 1],

     ["functionConstraint", "function", 0],
     ["functionConstraint", "code", 1],
     ["functionConstraint", "valve", 2],
     ["functionConstraint", "rule", 3],

     ["functionConstraintInput", "valve", 0],
     ["functionConstraintInput", "function", 1],

     ["limitValve", "rule", 0],
     ["limitValve", "valve", 1],

     ["groupValve", "rule", 0],
     ["groupValve", "valve", 1],

     ["sortValve", "rule", 0],
     ["sortValve", "valve", 1],
     ["sortValve", "ix", 2],

     ["reducer", "rule", 0],
     ["reducer", "inValve", 1],
     ["reducer", "outValve", 2],
     ["reducer", "code", 3],

     // TODO adding these here is hacky

     ["displayNames", "id", 0],
     ["displayNames", "name", 1],

     ["editor_rule", "id", 0],
     ["editor_rule", "description", 1],

     ["join", "id", 0],
     ["join", "valve", 1],
     ["join", "pipe", 2],
     ["join", "field", 3],

     ["external_events", "id", 0],
     ["external_events", "label", 1],
     ["external_events", "key", 2],
     ["external_events", "eid", 3]];

function System(stores, flows, dirtyFlows, downstream, tableToStore) {
  this.stores = stores;
  this.flows = flows;
  this.dirtyFlows = dirtyFlows;
  this.downstream = downstream;
  this.tableToStore = tableToStore;
}

System.compiler = function() {
  var stores = [];
  var flows = [];
  var dirtyFlows = [];
  var downstream = [];
  var tableToStore = {};
  for (var i = compilerTables.length - 1; i >= 0; i--) {
    dirtyFlows[i] = false;
    stores[i] = Memory.empty();
    downstream[i] = [];
    tableToStore[compilerTables[i][0] + "-source"] = i; // TODO will need to set up sinks in here too when this becomes incremental
  }
  var system = new System(stores, flows, dirtyFlows, downstream, tableToStore);
  system.setStore(0, Memory.fromFacts(compilerTables));
  system.setStore(1, Memory.fromFacts(compilerFields));
  return system;
};

System.prototype = {
  getTable: function (table) {
    var sinkIx = this.tableToStore[table + "-sink"];
    return this.getStore(sinkIx);
  },

  updateTable: function (table, adds, dels) {
    var sourceIx = this.tableToStore[table + "-source"];
    this.setStore(sourceIx, this.getStore(sourceIx).update(adds, dels));
  },

  getSolver: function(rule) {
    return this.getStore(this.tableToStore[rule + "-solver"]);
  },

  getAggregate: function(rule) {
    return this.getStore(this.tableToStore[rule + "-aggregate"]);
  },

  getStore: function (storeIx) {
    return this.stores[storeIx];
  },

  setStore: function (storeIx, store) {
    this.stores[storeIx] = store;
    var dirtiedFlows = this.downstream[storeIx];
    var dirtyFlows = this.dirtyFlows;
    for (var i = dirtiedFlows.length - 1; i >= 0; i--) {
      dirtyFlows[dirtiedFlows[i]] = true;
    }
  },

  getDump: function (table) {
    var fields = this.getStore(1).getFacts();
    var tableFields = [];
    for (var i = fields.length - 1; i >= 0; i--) {
      var field = fields[i];
      if (field[0] === table) tableFields[field[2]] = field[1];
    }
    var facts = this.getStore(this.tableToStore[table + "-source"]).getFacts();
    var dump = [];
    for (var i = facts.length - 1; i >= 0; i--) {
      var fact = facts[i];
      var dumpedFact = {};
      for (var j = tableFields.length - 1; j >= 0; j--) {
        dumpedFact[tableFields[j]] = fact[j];
      }
      dump[i] = dumpedFact;
    }
    return dump;
  },

  refresh: function() {
    var flows = this.flows;
    var numFlows = flows.length;
    var dirtyFlows = this.dirtyFlows;
    for (var flowIx = 0; flowIx < numFlows; flowIx++) {
      if (dirtyFlows[flowIx] === true) {
        // console.log(flowIx);
        dirtyFlows[flowIx] = false;
        flows[flowIx].refresh(this);
        flowIx = 0; // resets the loop
      }
    }
  },

  compile: function() {
    var tables = this.getDump("table");
    var fields = this.getDump("field");
    var rules = this.getDump("rule");
    var valves = this.getDump("valve");
    var pipes = this.getDump("pipe");
    var tableConstraints = this.getDump("tableConstraint");
    var constantConstraints = this.getDump("constantConstraint");
    var functionConstraints = this.getDump("functionConstraint");
    var functionConstraintInputs = this.getDump("functionConstraintInput");
    var limitValves = this.getDump("limitValve");
    var groupValves = this.getDump("groupValve");
    var sortValves = this.getDump("sortValve");
    var reducers = this.getDump("reducer");

    rules.sort(function (a,b) { if (a.ix < b.ix) return 1; else return -1;});

    var stores = [];
    var flows = [];
    var dirtyFlows = [];
    var nextIx = 0;
    var tableToStore = {};
    var downstream = [];

    var valveRules = {};
    var valveIxes = {};
    var numVars = {};
    var fieldIxes = {};
    var numFields = {};
    var pipeTables = {};

    for (var i = valves.length - 1; i >= 0; i--) {
      var valve = valves[i];
      valveRules[valve.valve] = valve.rule;
      valveIxes[valve.valve] = valve.ix;
      numVars[valve.rule] = (numVars[valve.rule] || 0) + 1;
    }
    for (var i = reducers.length - 1; i >= 0; i--) {
      var reducer = reducers[i];
      numVars[reducer.rule] = numVars[reducer.rule] - 1;
    }
    for (var i = fields.length - 1; i >= 0; i--) {
      var field = fields[i];
      fieldIxes[field.table + "-" + field.field] = field.ix;
      numFields[field.table] = (numFields[field.table] || 0) + 1;
    }
    for (var i = pipes.length - 1; i >= 0; i--) {
      var pipe = pipes[i];
      pipeTables[pipe.pipe] = pipe.table;
    }

    // build sinks
    var sinks = {};
    for (var i = tables.length - 1; i >= 0; i--) {
      var table = tables[i];

      var sourceIx = nextIx++;
      var sinkIx = nextIx++;
      var sinkFieldIxes = [];
      for (var j = numFields[table.table] - 1; j >= 0; j--) {
        sinkFieldIxes[j] = j;
      }

      tableToStore[table.table + "-source"] = sourceIx;
      stores[sourceIx] = this.stores[this.tableToStore[table.table + "-source"]] || Memory.empty();
      dirtyFlows[sourceIx] = false;
      downstream[sourceIx] = [sinkIx];

      tableToStore[table.table + "-sink"] = sinkIx;
      var sink = new Sink([new SinkConstraint(sourceIx, sinkFieldIxes)], sinkIx);
      sinks[table.table] = sink;
      stores[sinkIx] = this.stores[this.tableToStore[table.table + "-sink"]] || Memory.empty();
      flows[sinkIx] = sink;
      dirtyFlows[sinkIx] = true;
      downstream[sinkIx] = [];
    }

    // build solvers and aggregates
    var solvers = {};
    var aggregates = {};
    for (var i = rules.length - 1; i >= 0; i--) {
      var rule = rules[i];

      var solverIx = nextIx++;
      var aggregateIx = nextIx++;

      tableToStore[rule.rule + "-solver"] = solverIx;
      var solver = Solver.empty(numVars[rule.rule], [], [], solverIx);
      solvers[rule.rule] = solver;
      stores[solverIx] = Memory.empty();
      flows[solverIx] = solver;
      dirtyFlows[solverIx] = true;
      downstream[solverIx] = [aggregateIx];

      tableToStore[rule.rule + "-aggregate"] = aggregateIx;
      var aggregate = Aggregate.empty([], [], undefined, [], [], [], solverIx, aggregateIx);
      aggregates[rule.rule] = aggregate;
      stores[aggregateIx] = Memory.empty();
      flows[aggregateIx] = aggregate;
      dirtyFlows[aggregateIx] = true;
      downstream[aggregateIx] = [];
    }

    // build table constraints
    var constraints = {};
    for (var i = pipes.length - 1; i >= 0; i--) {
      var pipe = pipes[i];
      if (pipe.direction === "+source") {
        var constraint = new MemoryConstraint(tableToStore[pipe.table + "-sink"], []);
        solvers[pipe.rule].constraints.push(constraint);
        constraints[pipe.pipe] = constraint;
        dirtyFlows[tableToStore[pipe.rule + "-solver"]] = false; // will be dirtied on update instead
        downstream[tableToStore[pipe.table + "-sink"]].push(tableToStore[pipe.rule + "-solver"]);
      } else if (pipe.direction === "-source") {
        var constraint = new NegatedMemoryConstraint(tableToStore[pipe.table + "-sink"], []);
        solvers[pipe.rule].constraints.push(constraint);
        constraints[pipe.pipe] = constraint;
        dirtyFlows[tableToStore[pipe.rule + "-solver"]] = false; // will be dirtied on update instead
        downstream[tableToStore[pipe.table + "-sink"]].push(tableToStore[pipe.rule + "-solver"]);
      } else if (pipe.direction === "+sink") {
        var constraint = new SinkConstraint(tableToStore[pipe.rule + "-aggregate"], []);
        sinks[pipe.table].constraints.push(constraint);
        constraints[pipe.pipe] = constraint;
        downstream[tableToStore[pipe.rule + "-aggregate"]].push(tableToStore[pipe.table + "-sink"]);
      }
    }
    for (var i = tableConstraints.length - 1; i >= 0; i--) {
      var tableConstraint = tableConstraints[i];
      var fieldIx = fieldIxes[pipeTables[tableConstraint.pipe] + "-" + tableConstraint.field];
      var valveIx = valveIxes[tableConstraint.valve];
      constraints[tableConstraint.pipe].fieldIxes[fieldIx] = valveIx;
    }

    // build constant constraints
    for (var i = constantConstraints.length - 1; i >= 0; i--) {
      var constantConstraint = constantConstraints[i];
      var solver = solvers[valveRules[constantConstraint.valve]];
      solver.constants[valveIxes[constantConstraint.valve]] = constantConstraint.value;
    }

    // build function constraints
    for (var i = functionConstraints.length - 1; i >= 0; i--) {
      var functionConstraint = functionConstraints[i];
      var outIx = valveIxes[functionConstraint.valve];
      var constraint = new FunctionConstraint(undefined, [], [], outIx);
      solvers[functionConstraint.rule].constraints.push(constraint);
      constraints[functionConstraint.function] = constraint;
    }
    for (var i = functionConstraintInputs.length - 1; i >= 0; i--) {
      var functionConstraintInput = functionConstraintInputs[i];
      var constraint = constraints[functionConstraintInput.function];
      constraint.args.push(functionConstraintInput.valve);
      constraint.inIxes.push(valveIxes[functionConstraintInput.valve]);
      constraint.inValues.push(null);
    }
    for (var i = functionConstraints.length - 1; i >= 0; i--) {
      var functionConstraint = functionConstraints[i];
      var constraint = constraints[functionConstraint.function];
      constraint.fun = Function.apply(null, constraint.args.concat(["return (" + functionConstraint.code + ");"]));
    }

    // fill in aggregates
    for (var i = limitValves.length - 1; i >= 0; i--) {
      var limitValve = limitValves[i];
      var aggregate = aggregates[limitValve.rule];
      aggregate.limitIx = valveIxes[limitValve.valve];
    }
    for (var i = groupValves.length - 1; i >= 0; i--) {
      var groupValve = groupValves[i];
      var aggregate = aggregates[groupValve.rule];
      aggregate.groupIxes.push(valveIxes[groupValve.valve]);
    }
    for (var i = sortValves.length - 1; i >= 0; i--) {
      var sortValve = sortValves[i];
      var aggregate = aggregates[sortValve.rule];
      aggregate.sortIxes[sortValve.ix] = valveIxes[sortValve.valve];
    }
    for (var i = reducers.length - 1; i >= 0; i--) {
      var reducer = reducers[i];
      var aggregate = aggregates[reducer.rule];
      aggregate.reducerInIxes.push(valveIxes[reducer.inValve]);
      aggregate.reducerOutIxes.push(valveIxes[reducer.outValve]);
      aggregate.reducerFuns.push(Function.apply(null, [reducer.inValve, "return (" + reducer.code + ");"]));
    }

    return new System(stores, flows, dirtyFlows, downstream, tableToStore);
  }
};

// TESTS

function memoryEqual(memoryA, memoryB) {
  var outputAdds = [];
  var outputDels = [];
  memoryB.diff(memoryA, outputAdds, outputDels);
  if ((outputAdds.length > 0) || (outputDels.length > 0)) {
    throw new Error("Only A has " + JSON.stringify(outputDels) + " and only B has " + JSON.stringify(outputAdds));
  } else {
    return true;
  }
}

function loadSystem(system, adds, dels) {
  console.info("Warning: loadSystem is slow. Use System.updateTable instead");
  // console.log(system);
  var addGroups = {};
  var delGroups = {};
  for (var i = adds.length - 1; i >= 0; i--) {
    var add = adds[i];
    var group = addGroups[add[0]] || (addGroups[add[0]] = []);
    group.push(add.slice(1));
  }
  for (var i = dels.length - 1; i >= 0; i--) {
    var del = dels[i];
    var group = delGroups[del[0]] || (delGroups[del[0]] = []);
    group.push(del.slice(1));
  }
  for (var table in addGroups) {
    system.updateTable(table, addGroups[table], []);
  }
  for (var table in delGroups) {
    system.updateTable(table, [], delGroups[table]);
  }
}

function testSystem(system, facts) {
  var groups = {};
  for (var i = facts.length - 1; i >= 0; i--) {
    var fact = facts[i];
    var group = groups[fact[0]] || (groups[fact[0]] = []);
    group.push(fact.slice(1));
  }
  for (var table in groups) {
    memoryEqual(system.getTable(table), Memory.fromFacts(groups[table]));
  }
}

var bigcheck = bigcheck; // keep jshint happy

// SOLVER TESTS

var selfJoin = bigcheck.foralls(bigcheck.facts(3),
                                function (facts) {
                                  var input = Memory.empty();
                                  var constraint0 = new MemoryConstraint(undefined, [0,1,2]);
                                  var constraint1 = new MemoryConstraint(undefined, [0,1,2]);
                                  var flow = new Flow(Solver.empty(3, [], [constraint0, constraint1]), null, [new Sink(undefined, [0,1,2])]);
                                  var input = input.update(facts, []);
                                  var output = flow.update(input, Memory.empty());
                                  return memoryEqual(input, output);
                                });

var productJoin = bigcheck.foralls(bigcheck.facts(3),
                                   function (facts) {
                                     var input = Memory.empty();
                                     var constraint0 = new MemoryConstraint(undefined, [0,1,2]);
                                     var constraint1 = new MemoryConstraint(undefined, [3,4,5]);
                                     var flow = new Flow(Solver.empty(6, [], [constraint0, constraint1]), null, [new Sink(undefined, [0,1,2,3,4,5])]);
                                     var input = input.update(facts, []);
                                     var output = flow.update(input, Memory.empty());
                                     var expectedFacts = [];
                                     for (var i = 0; i < facts.length; i++) {
                                       for (var j = 0; j < facts.length; j++) {
                                         expectedFacts.push(facts[i].concat(facts[j]));
                                       }
                                     }
                                     return memoryEqual(Memory.fromFacts(expectedFacts), output);
                                   });

var constantJoin = bigcheck.foralls(bigcheck.facts(3), bigcheck.value,
                                    function (facts, constant) {
                                      var input = Memory.empty();
                                      var constraint0 = new MemoryConstraint(undefined, [0,1,2]);
                                      var constraint1 = new MemoryConstraint(undefined, [3,4,5]);
                                      var flow = new Flow(Solver.empty(6, [undefined, constant], [constraint0, constraint1]), null, [new Sink(undefined, [0,1,2,3,4,5])]);
                                      var input = input.update(facts, []);
                                      var output = flow.update(input, Memory.empty());
                                      var expectedFacts = [];
                                      for (var i = 0; i < facts.length; i++) {
                                        if (facts[i][1] === constant) {
                                          for (var j = 0; j < facts.length; j++) {
                                            expectedFacts.push(facts[i].concat(facts[j]));
                                          }
                                        }
                                      }
                                      return memoryEqual(Memory.fromFacts(expectedFacts), output);
                                    });

var incrementalConstantJoin = bigcheck.foralls(bigcheck.facts(3), bigcheck.value, bigcheck.facts(3), bigcheck.facts(3),
                                               function (facts, constant, adds, dels) {
                                                 var input = Memory.empty();
                                                 var constraint0 = new MemoryConstraint(undefined, [0,1,2]);
                                                 var constraint1 = new MemoryConstraint(undefined, [3,4,5]);
                                                 var incrementalFlow = new Flow(Solver.empty(6, [undefined, constant], [constraint0, constraint1]), null, [new Sink(undefined, [0,1,2,3,4,5])]);
                                                 var batchFlow = new Flow(Solver.empty(6, [undefined, constant], [constraint0, constraint1]), null, [new Sink(undefined, [0,1,2,3,4,5])]);
                                                 var incrementalOutput = Memory.empty();
                                                 var batchOutput = Memory.empty();

                                                 input = input.update(facts, []);
                                                 incrementalOutput = incrementalFlow.update(input, incrementalOutput);

                                                 input = input.update(adds, dels);
                                                 batchOutput = batchFlow.update(input, batchOutput);
                                                 incrementalOutput = incrementalFlow.update(input, incrementalOutput);

                                                 return memoryEqual(incrementalOutput, batchOutput);
                                               });

var actualJoin = bigcheck.foralls(bigcheck.facts(3),
                                  function (facts) {
                                    var input = Memory.empty();
                                    var constraint0 = new MemoryConstraint(undefined, [0,1,2]);
                                    var constraint1 = new MemoryConstraint(undefined, [2,3,4]);
                                    var flow = new Flow(Solver.empty(5, [], [constraint0, constraint1]), null, [new Sink(undefined, [0,1,2,3,4])]);
                                    var input = input.update(facts, []);
                                    var output = flow.update(input, Memory.empty());
                                    var expectedFacts = [];
                                    for (var i = 0; i < facts.length; i++) {
                                      for (var j = 0; j < facts.length; j++) {
                                        var fact = facts[i].concat(facts[j]);
                                        if (fact[2] === fact[3]) {
                                          fact.splice(2, 1);
                                          expectedFacts.push(fact);
                                        }
                                      }
                                    }
                                    return memoryEqual(Memory.fromFacts(expectedFacts), output);
                                  });

var incrementalActualJoin = bigcheck.foralls(bigcheck.facts(3), bigcheck.facts(3), bigcheck.facts(3),
                                             function (facts, adds, dels) {
                                               var input = Memory.empty();
                                               var constraint0 = new MemoryConstraint(undefined, [0,1,2]);
                                               var constraint1 = new MemoryConstraint(undefined, [2,3,4]);
                                               var incrementalFlow = new Flow(Solver.empty(5, [], [constraint0, constraint1]), null, [new Sink(undefined, [0,1,2,3,4])]);
                                               var batchFlow = new Flow(Solver.empty(5, [], [constraint0, constraint1]), null, [new Sink(undefined, [0,1,2,3,4])]);
                                               var incrementalOutput = Memory.empty();
                                               var batchOutput = Memory.empty();

                                               input = input.update(facts, []);
                                               incrementalOutput = incrementalFlow.update(input, incrementalOutput);

                                               input = input.update(adds, dels);
                                               batchOutput = batchFlow.update(input, batchOutput);
                                               incrementalOutput = incrementalFlow.update(input, incrementalOutput);

                                               return memoryEqual(incrementalOutput, batchOutput);
                                             });

var functionJoin = bigcheck.foralls(bigcheck.facts(3),
                                    function (facts) {
                                      var input = Memory.empty();
                                      var constraint0 = new MemoryConstraint(undefined, [0,1,2]);
                                      var constraint1 = new MemoryConstraint(undefined, [3,4,5]);
                                      var constraint2 = new FunctionConstraint(function (x) { return x + 1;}, [2], 3);
                                      var flow = new Flow(Solver.empty(6, [], [constraint0, constraint1, constraint2]), null, [new Sink(undefined, [0,1,2,3,4,5])]);
                                      var input = input.update(facts, []);
                                      var output = flow.update(input, Memory.empty());
                                      var expectedFacts = [];
                                      for (var i = 0; i < facts.length; i++) {
                                        for (var j = 0; j < facts.length; j++) {
                                          var fact = facts[i].concat(facts[j]);
                                          if (fact[2] + 1 === fact[3]) {
                                            expectedFacts.push(fact);
                                          }
                                        }
                                      }
                                      return memoryEqual(Memory.fromFacts(expectedFacts), output);
                                    });

var incrementalFunctionJoin = bigcheck.foralls(bigcheck.facts(3), bigcheck.facts(3), bigcheck.facts(3),
                                               function (facts, adds, dels) {
                                                 var input = Memory.empty();
                                                 var constraint0 = new MemoryConstraint(undefined, [0,1,2]);
                                                 var constraint1 = new MemoryConstraint(undefined, [3,4,5]);
                                                 var constraint2 = new FunctionConstraint(function (x) { return x + 1;}, [2], 3);
                                                 var incrementalFlow = new Flow(Solver.empty(6, [], [constraint0, constraint1, constraint2]), null, [new Sink(undefined, [0,1,2,3,4,5])]);
                                                 var batchFlow = new Flow(Solver.empty(6, [], [constraint0, constraint1, constraint2]), null, [new Sink(undefined, [0,1,2,3,4,5])]);
                                                 var incrementalOutput = Memory.empty();
                                                 var batchOutput = Memory.empty();

                                                 input = input.update(facts, []);
                                                 incrementalOutput = incrementalFlow.update(input, incrementalOutput);

                                                 input = input.update(adds, dels);
                                                 batchOutput = batchFlow.update(input, batchOutput);
                                                 incrementalOutput = incrementalFlow.update(input, incrementalOutput);

                                                 return memoryEqual(incrementalOutput, batchOutput);
                                               });

var negatedJoin = bigcheck.foralls(bigcheck.facts(3),
                                   function (facts) {
                                     var input = Memory.empty();
                                     var constraint0 = new MemoryConstraint(undefined, [0,1,2]);
                                     var constraint1 = new NegatedMemoryConstraint(undefined, [2,undefined,undefined]);
                                     var flow = new Flow(Solver.empty(3, [], [constraint1, constraint0]), null, [new Sink(undefined, [0,1,2])]);
                                     var input = input.update(facts, []);
                                     var output = flow.update(input, Memory.empty());
                                     var expectedFacts = [];
                                     nextFact: for (var i = 0; i < facts.length; i++) {
                                       var fact = facts[i];
                                       for (var j = 0; j < facts.length; j++) {
                                         if (fact[2] === facts[j][0]) {
                                           continue nextFact;
                                         }
                                       }
                                       expectedFacts.push(fact);
                                     }
                                     return memoryEqual(Memory.fromFacts(expectedFacts), output);
                                   });

var incrementalNegatedJoin = bigcheck.foralls(bigcheck.facts(3), bigcheck.facts(3), bigcheck.facts(3),
                                              function (facts, adds, dels) {
                                                var input = Memory.empty();
                                                var constraint0 = new MemoryConstraint(undefined, [0,1,2]);
                                                var constraint1 = new NegatedMemoryConstraint(undefined, [2,undefined,undefined]);
                                                var incrementalFlow = new Flow(Solver.empty(3, [], [constraint1, constraint0]), null, [new Sink(undefined, [0,1,2])]);
                                                var batchFlow = new Flow(Solver.empty(3, [], [constraint1, constraint0]), null, [new Sink(undefined, [0,1,2])]);
                                                var incrementalOutput = Memory.empty();
                                                var batchOutput = Memory.empty();

                                                input = input.update(facts, []);
                                                incrementalOutput = incrementalFlow.update(input, incrementalOutput);

                                                input = input.update(adds, dels);
                                                batchOutput = batchFlow.update(input, batchOutput);
                                                incrementalOutput = incrementalFlow.update(input, incrementalOutput);

                                                return memoryEqual(incrementalOutput, batchOutput);
                                              });

var aggregateJoin = bigcheck.foralls(bigcheck.facts(3),
                                     function (facts) {
                                       var input = Memory.empty();
                                       var constraint0 = new MemoryConstraint(undefined, [0,1,2]);
                                       var aggregate = Aggregate.empty([2], [0, 1], undefined, [1], [3], [function (as) {return as.join("");}]);
                                       var flow = new Flow(Solver.empty(3, [], [constraint0]), aggregate, [new Sink(undefined, [1,3])]);
                                       var input = input.update(facts, []);
                                       var output = flow.update(input, Memory.empty());
                                       var groups = {};
                                       var uniqueFacts = input.getFacts();
                                       uniqueFacts.sort(compareValueArray);
                                       for (var i = 0; i < uniqueFacts.length; i++) {
                                         var fact = uniqueFacts[i];
                                         groups[fact[2]] = (groups[fact[2]] || "") + fact[1];
                                       }
                                       var expectedFacts = [];
                                       for (var i = 0; i < uniqueFacts.length; i++) {
                                         var fact = uniqueFacts[i];
                                         expectedFacts.push([fact[1], groups[fact[2]]]);
                                       }
                                       return memoryEqual(Memory.fromFacts(expectedFacts), output);
                                     });

var incrementalAggregateJoin = bigcheck.foralls(bigcheck.facts(3), bigcheck.facts(3), bigcheck.facts(3),
                                     function (facts, adds, dels) {
                                       var input = Memory.empty();
                                       var constraint0 = new MemoryConstraint(undefined, [0,1,2]);
                                       var incrementalAggregate = Aggregate.empty([2], [0, 1], undefined, [1], [3], [function (as) {return as.join("");}]);
                                       var batchAggregate = Aggregate.empty([2], [0, 1], undefined, [1], [3], [function (as) {return as.join("");}]);
                                       var incrementalFlow = new Flow(Solver.empty(3, [], [constraint0]), incrementalAggregate, [new Sink(undefined, [1,3])]);
                                       var batchFlow = new Flow(Solver.empty(3, [], [constraint0]), batchAggregate, [new Sink(undefined, [1,3])]);
                                       var incrementalOutput = Memory.empty();
                                       var batchOutput = Memory.empty();

                                       input = input.update(facts, []);
                                       incrementalOutput = incrementalFlow.update(input, incrementalOutput);

                                       input = input.update(adds, dels);
                                       batchOutput = batchFlow.update(input, batchOutput);
                                       incrementalOutput = incrementalFlow.update(input, incrementalOutput);

                                       return memoryEqual(incrementalOutput, batchOutput);
                                     });

// COMPILER TESTS

function compiledPathTest() {
  var compilerFacts = [["field", "edge", "edgeX", 0],
                       ["field", "edge", "edgeY", 1],
                       ["field", "path", "pathX", 0],
                       ["field", "path", "pathY", 1],

                       ["rule", "edgeRule", 0],
                       ["valve", "edgeA", "edgeRule", 0],
                       ["valve", "edgeB", "edgeRule", 1],
                       ["pipe", "edgeEdgePipe", "edge", "edgeRule", "+source"],
                       ["pipe", "edgePathPipe", "path", "edgeRule", "+sink"],
                       ["tableConstraint", "edgeA", "edgeEdgePipe", "edgeX"],
                       ["tableConstraint", "edgeB", "edgeEdgePipe", "edgeY"],
                       ["tableConstraint", "edgeA", "edgePathPipe", "pathX"],
                       ["tableConstraint", "edgeB", "edgePathPipe", "pathY"],

                       ["rule", "pathRule", 1],
                       ["valve", "pathA", "pathRule", 0],
                       ["valve", "pathB", "pathRule", 1],
                       ["valve", "pathC", "pathRule", 2],
                       ["pipe", "pathEdgePipe", "edge", "pathRule", "+source"],
                       ["pipe", "pathPathSourcePipe", "path", "pathRule", "+source"],
                       ["pipe", "pathPathSinkPipe", "path", "pathRule", "+sink"],
                       ["tableConstraint", "pathA", "pathEdgePipe", "edgeX"],
                       ["tableConstraint", "pathB", "pathEdgePipe", "edgeY"],
                       ["tableConstraint", "pathB", "pathPathSourcePipe", "pathX"],
                       ["tableConstraint", "pathC", "pathPathSourcePipe", "pathY"],
                       ["tableConstraint", "pathA", "pathPathSinkPipe", "pathX"],
                       ["tableConstraint", "pathC", "pathPathSinkPipe", "pathY"]];

  var compiler = System.compiler();
  compiler.update(compilerFacts);
  var system = compiler.compile();
  // console.log(system);

  var facts = [["edge", "a", "b"],
               ["edge", "b", "c"],
               ["edge", "c", "d"],
               ["edge", "d", "b"]];
  system.update(facts, []);

  var derivedFacts = [["path", "a", "b"],
                      ["path", "b", "c"],
                      ["path", "c", "d"],
                      ["path", "d", "b"],

                      ["path", "a", "c"],
                      ["path", "b", "d"],
                      ["path", "c", "b"],
                      ["path", "d", "c"],

                      ["path", "a", "d"],
                      ["path", "b", "b"],
                      ["path", "c", "c"],
                      ["path", "d", "d"]];
  var expectedFacts = facts.concat(derivedFacts);

  memoryEqual(system.getTanl, initMemory.update(expectedFacts, []));
}

function compiledFunctionTest() {
  var compilerFacts = [["field", "foo", "fooX", 0],
                       ["field", "foo", "fooY", 1],
                       ["field", "foo", "fooZ", 2],
                       ["field", "bar", "barZ", 0],

                       ["rule", "rule", 0],
                       ["valve", "valveX", "rule", 0],
                       ["valve", "valveY", "rule", 1],
                       ["valve", "valveXY", "rule", 2],
                       ["valve", "valveZ", "rule", 3],
                       ["pipe", "fooPipe", "foo", "rule", "+source"],
                       ["pipe", "barPipe", "bar", "rule", "+sink"],
                       ["tableConstraint", "valveX", "fooPipe", "fooX"],
                       ["tableConstraint", "valveY", "fooPipe", "fooY"],
                       ["tableConstraint", "valveZ", "fooPipe", "fooZ"],
                       ["tableConstraint", "valveZ", "barPipe", "barZ"],

                       ["functionConstraint", "addFunction", "valveX + valveY", "valveXY", "rule"],
                       ["functionConstraintInput", "valveX", "addFunction"],
                       ["functionConstraintInput", "valveY", "addFunction"],

                       ["functionConstraint", "idFunction", "valveXY", "valveZ", "rule"],
                       ["functionConstraintInput", "valveXY", "idFunction"]];

  var system = compileSystem(Memory.fromFacts(compilerSchema.concat(compilerFacts)));
  system.memory = Memory.empty();

  var facts = [["foo", 2, 3, 5],
               ["foo", 2, 4, 7]];
  system.update(facts, []);

  var derivedFacts = [["bar", 5]];
  var expectedFacts = facts.concat(derivedFacts);

  memoryEqual(system.memory, Memory.fromFacts(expectedFacts));
}

function compiledNegationTest() {
  var compilerFacts = [["field", "foo", "fooX", 0],
                       ["field", "foo", "fooY", 1],
                       ["field", "foo", "fooZ", 2],
                       ["field", "bar", "barZ", 0],

                       ["rule", "rule", 0],
                       ["valve", "valveX", "rule", 0],
                       ["valve", "valveY", "rule", 1],
                       ["valve", "valveZ", "rule", 2],
                       ["pipe", "fooPipe", "foo", "rule", "+source"],
                       ["pipe", "negPipe", "foo", "rule", "-source"],
                       ["pipe", "barPipe", "bar", "rule", "+sink"],
                       ["tableConstraint", "valveX", "fooPipe", "fooX"],
                       ["tableConstraint", "valveY", "fooPipe", "fooY"],
                       ["tableConstraint", "valveZ", "fooPipe", "fooZ"],
                       ["tableConstraint", "valveZ", "negPipe", "fooX"],
                       ["tableConstraint", "valveZ", "barPipe", "barZ"]];

  var system = compileSystem(Memory.fromFacts(compilerSchema.concat(compilerFacts)));
  // console.log(system);
  system.memory = Memory.empty();

  var facts = [["foo", 0, 1, 1],
               ["foo", 2, 2, 0]];
  system.update(facts, []);

  var derivedFacts = [["bar", 1]];
  var expectedFacts = facts.concat(derivedFacts);

  memoryEqual(system.memory, Memory.fromFacts(expectedFacts));
}

// BENCHMARKS

function soFast(n) {
  var constraint0 = new MemoryConstraint(undefined, [0,1,2]);
  var constraint1 = new MemoryConstraint(undefined, [0,1,2]);
  var sink0 = new Sink(undefined, [0,1,2]);
  var solver = Solver.empty(3, [], [constraint0, constraint1]);
  var flow = new Flow(solver, null, [sink0]);

  var input = Memory.empty();
  var output = Memory.empty();

  var adds = [];
  for (var i = 0; i < n; i++) {
    adds[i] = [Math.random(),Math.random(),Math.random()];
  }

  input = input.update(adds, []);
  console.time("soFast " + n);
  output = flow.update(input, output);
  console.timeEnd("soFast " + n);

  return output;
}

// soFast(100000);

function soSlow(n) {
  var constraint0 = new MemoryConstraint(undefined, [0,1,2]);
  var constraint1 = new MemoryConstraint(undefined, [0,1,2]);
  var sink0 = new Sink(undefined, [0,1,2]);
  var solver = Solver.empty(3, [], [constraint0, constraint1]);
  var flow = new Flow(solver, null, [sink0]);

  var input = Memory.empty();
  var output = Memory.empty();

  var addsA = [];
  var addsB = [];
  for (var i = 0; i < n; i++) {
    if (i % 2 === 0) {
      addsA.push([Math.random(),Math.random(),Math.random()]);
    } else {
      addsB.push([Math.random(),Math.random(),Math.random()]);
    }
  }

  input = input.update(addsA, []);
  console.time("soSlowA " + n);
  output = flow.update(input, output);
  console.timeEnd("soSlowA " + n);

  input = input.update(addsB, []);
  console.time("soSlowB " + n);
  output = flow.update(input, output);
  console.timeEnd("soSlowB " + n);

  input = input.update([[0.5,0.5,0.5]], []);
  console.time("soSlowC " + n);
  output = flow.update(input, output);
  console.timeEnd("soSlowC " + n);

  return output;
}

// soSlow(100000);
