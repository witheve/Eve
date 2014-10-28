var FAILED = 0;
var CHANGED = 1;
var UNCHANGED = 2;

var IGNORED = 0;
var SPLITTED = 1;

var eve = {};

var metastack = [];

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

var now = function() {
  if(typeof window !== "undefined" && window.performance) {
    return window.performance.now();
  }
  return (new Date()).getTime();
};

// ORDERING / COMPARISON

var least = false;
var greatest = undefined;

function isValue(v) {
  var t = typeof v;
  return (t === 'string') || (t === 'number') || (t === "boolean") ;
}

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


function dedupeFacts(facts) {
  var len = facts.length;
  if (len === 0) return [];
  facts.sort(compareValueArray);
  var nextFact = facts[0];
  var lastFact;
  var dedupedFacts = [nextFact];
  for (var i = 1; i < len; i++) {
    lastFact = nextFact;
    nextFact = facts[i];
    if (arrayEqual(lastFact, nextFact) === false) {
      dedupedFacts.push(nextFact);
    }
  }
  return dedupedFacts;
}

function diffFacts(oldFacts, newFacts, outputAdds, outputDels) {
  oldFacts = dedupeFacts(oldFacts);
  newFacts = dedupeFacts(newFacts);
  var oldLen = oldFacts.length;
  var newLen = newFacts.length;
  var oldIx = 0;
  var newIx = 0;
  diff: while (true) {
    if (oldIx >= oldLen) {
      for (; newIx < newLen; newIx++) {
        outputAdds.push(newFacts[newIx]);
      }
      break diff;
    }
    if (newIx >= newLen) {
      for (; oldIx < oldLen; oldIx++) {
        outputDels.push(oldFacts[oldIx]);
      }
      break diff;
    }
    var nextOld = oldFacts[oldIx];
    var nextNew = newFacts[newIx];
    var comp = compareValueArray(nextOld, nextNew);
    if (comp === 0) {
      oldIx++;
      newIx++;
      continue diff;
    }
    if (comp === 1) {
      outputAdds.push(nextNew);
      newIx++;
      continue diff;
    }
    if (comp === -1) {
      outputDels.push(nextOld);
      oldIx++;
      continue diff;
    }
  }
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
  },

  isEmpty: function() {
    return (this.facts.length === 0);
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

// TODO would prefer to be able to separate these somehow but would require inserting non-scalar values into the solver
//      makes comparisons much more expensive
//      maybe the solver can have a separate section for these?
function AggregatedMemoryConstraint(storeIx, groupIxes, sortIxes, sortOrders, limitIx, ordinalIx, outIx, fun) {
  this.storeIx = storeIx;
  this.groupIxes = groupIxes;
  this.sortIxes = sortIxes;
  this.sortOrders = sortOrders;
  this.limitIx = limitIx;
  this.ordinalIx = ordinalIx;
  this.outIx = outIx;
  this.fun = fun;
}

function compareSortKey(a,b) {
  return compareValueArray(a[0], b[0]);
}

function aggregateSortBy(facts, sortIxes, sortOrders) {
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
    var fact = facts[i][1];
    facts[i] = fact;
  }
}

AggregatedMemoryConstraint.prototype = {
  start: function(system) {
    return system.getStore(this.storeIx).getFacts();
  },

  propagate: function(myIx, constraintStates, los, his) {
    var facts = constraintStates[myIx];

    if (facts === null) return UNCHANGED; // have already run and thrown away our state

    var groupIxes = this.groupIxes;
    var limitIx = this.limitIx;

    if (los[limitIx] !== his[limitIx]) return UNCHANGED;

    for (var i = groupIxes.length - 1; i >= 0; i--) {
      var ix = groupIxes[i];
      if ((ix !== undefined) && (los[ix] !== his[ix])) return UNCHANGED;
    }

    constraintStates[myIx] = null; // throw away state so we don't run again

    var groupFacts = [];

    for (var i = facts.length - 1; i >= 0; i--) {
      var fact = facts[i]
      if (solutionMatchesPoint(los, groupIxes, fact) === false) {
        groupFacts.push(fact);
      }
    }

    var sortIxes = this.sortIxes;
    var sortOrders = this.sortOrders;
    var ordinalIx = this.ordinalIx;

    if (sortIxes !== null) {
      aggregateSortBy(sortIxes, sortOrders);
    }
    if (limitIx !== null) {
      groupFacts = groupFacts.slice(los[limitIx]);
    }
    if (ordinalIx !== null) {
      for (var i = groupFacts.length - 1; i >= 0; i--) {
        groupFacts[i][ordinalIx] = i;
      }
    }

    groupFacts = dedupeFacts(groupFacts);

    var outValue = this.fun.call(null, groupFacts);
    if (!isValue(outValue)) throw new Error(outValue + " is not a valid Eve value");
    var outIx = this.outIx;
    var compLo = compareValue(outValue, los[outIx]);
    var compHi = compareValue(outValue, his[outIx]);
    if ((compLo === -1) || (compHi === 1)) return FAILED;
    los[outIx] = outValue;
    his[outIx] = outValue;
    return ((compLo === 1) || (compHi === -1)) ? CHANGED : UNCHANGED;
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

function FunctionConstraint(fun, variables, inIxes, outIx) {
  this.fun = fun;
  this.variables = variables;
  this.inIxes = inIxes;
  this.outIx = outIx;
  this.inValues = makeArray(inIxes.length, null);
}

FunctionConstraint.prototype = {
  start: function(system) {
    return true;
  },

  propagate: function(myIx, constraintStates, los, his) {
    if (constraintStates[myIx] === false) return UNCHANGED; // already ran, don't need to go again

    var inIxes = this.inIxes;
    var inValues = this.inValues;

    for (var i = inIxes.length - 1; i >= 0; i--) {
      var inIx = inIxes[i];
      var lo = los[inIx];
      if ((lo !== his[inIx])) return UNCHANGED;
      inValues[i] = lo;
    }

    constraintStates[myIx] = false; // going to run now, don't run again

    var outIx = this.outIx;
    var outValue = this.fun.apply(null, inValues);
    if (!isValue(outValue)) throw new Error(outValue + " is not a valid Eve value");
    var compLo = compareValue(outValue, los[outIx]);
    var compHi = compareValue(outValue, his[outIx]);
    if ((compLo === -1) || (compHi === 1)) return FAILED;
    los[outIx] = outValue;
    his[outIx] = outValue;
    return ((compLo === 1) || (compHi === -1)) ? CHANGED : UNCHANGED;
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
    var steps = 0;
    var queuedConstraintStates = [];
    var queuedLos = [];
    var queuedHis = [];

    // console.log("Starting solve");

    solve: while (true) {

      if (steps > 1000000) throw new Error("Solver took too long - probably an infinite loop");

      // propagate all constraints until nothing changes
      var lastChanged = 0;
      var current = 0;
      propagate: while (true) {
        steps += 1;
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

// UNION

function Union(inputIxes, outputIx) {
  this.inputIxes = inputIxes;
  this.outputIx = outputIx;
}

Union.prototype = {
  refresh: function(system) {
    var outputFacts = [];
    var inputIxes = this.inputIxes;
    for (var i = inputIxes.length - 1; i >= 0; i--) {
      outputFacts = outputFacts.concat(system.getStore(inputIxes[i]).getFacts());
    }
    var oldOutput = system.getStore(this.outputIx);
    var newOutput = Memory.fromFacts(outputFacts);
    if (newOutput.differsFrom(oldOutput)) system.setStore(this.outputIx, newOutput);
  }
};

// SYSTEM

var compilerSchemas = [
  ["view", "view"],
  ["field", "field", "view", "ix"],
  ["query", "query", "view", "ix"],
  ["constantConstraint", "query", "field", "value"],
  ["functionConstraint", "constraint", "query", "field", "code"],
  ["functionConstraintBinding", "constraint", "field", "field"],
  ["viewConstraint", "constraint", "query", "sourceView", "isNegated"],
  ["viewConstraintBinding", "constraint", "field", "sourceField"],
  ["aggregateConstraint", "constraint", "query", "field", "sourceView", "codeOrSplat"],
  ["aggregateConstraintBinding", "constraint", "field", "sourceField"],
  ["sort", "constraint", "field", "ix", "ascendingOrDescending"],
  ["limit", "constraint", "field"],
  ["ordinal", "constraint", "field"],
  ["isInput", "view"]
];

function System(meta, stores, flows, dirtyFlows, constraintFlows, downstream, nameToIx, ixToName) {
  this.meta = meta;
  this.stores = stores;
  this.flows = flows;
  this.dirtyFlows = dirtyFlows;
  this.constraintFlows = constraintFlows;
  this.downstream = downstream;
  this.nameToIx = nameToIx;
  this.ixToName = ixToName;
  this.tick = 0;
}

System.empty = function(meta) {
  var stores = [];
  var flows = [];
  var dirtyFlows = [];
  var constraintFlows = [];
  var downstream = [];
  var nameToIx = {};

  var compilerViews = [];
  var compilerFields = [];

  for (var i = compilerSchemas.length - 1; i >= 0; i--) {
    var view = compilerSchemas[i][0];
    var fields = compilerSchemas[i].slice(1);

    compilerViews.push([view])
    for (var j = fields.length - 1; j >= 0; j--) {
      compilerFields.push([fields[j], view, j]);
    }

    var viewIx = i;
    stores[viewIx] = Memory.empty();
    flows[viewIx] = null;
    dirtyFlows[viewIx] = false;
    downstream[viewIx] = [];
    nameToIx[view] = viewIx;
  }

  var ixToName = [];
  for (var name in nameToIx) {
    ixToName[nameToIx[name]] = name;
  }

  var system = new System(meta, stores, flows, dirtyFlows, constraintFlows, downstream, nameToIx, ixToName);
  system.updateStore("view", compilerViews, []);
  system.updateStore("field", compilerFields, []);
  return system;
};

System.prototype = {
  getStore: function (name) {
    var ix = this.nameToIx[name];
    return this._getStore(ix);
  },

  updateStore: function (name, adds, dels) {
    var ix = this.nameToIx[name];
    if (ix === undefined) throw new Error("No store for " + name);
    var store = this.getStore(ix);
    this._setStore(ix, store.update(adds, dels));
    return this;
  },

  _getStore: function (storeIx) {
    return this.stores[storeIx];
  },

  _setStore: function (storeIx, store) {
    this.stores[storeIx] = store;
    var dirtiedFlows = this.downstream[storeIx];
    var dirtyFlows = this.dirtyFlows;
    for (var i = dirtiedFlows.length - 1; i >= 0; i--) {
      dirtyFlows[dirtiedFlows[i]] = true;
    }
  },

  getDump: function (view) {
    var fields = this.getStore("field").getFacts();
    var viewFields = [];
    for (var i = fields.length - 1; i >= 0; i--) {
      var field = fields[i];
      if (field[0] === view) viewFields[field[2]] = field[1];
    }
    var facts = this.getStore(this.nameToIx[view]).getFacts();
    var dump = [];
    for (var i = facts.length - 1; i >= 0; i--) {
      var fact = facts[i];
      var dumpedFact = {};
      for (var j = viewFields.length - 1; j >= 0; j--) {
        dumpedFact[viewFields[j]] = fact[j];
      }
      dump[i] = dumpedFact;
    }
    return dump;
  },

  refresh: function() {
    metastack.push("System.refresh");
    var tick = this.tick;
    var flows = this.flows;
    var stores = this.stores;
    var numFlows = flows.length;
    var dirtyFlows = this.dirtyFlows;
    var constraintFlows = this.constraintFlows;
    var ixToName = this.ixToName;
    var refreshes = [];
    for (var flowIx = 0; flowIx < numFlows; flowIx++) {
      if (dirtyFlows[flowIx] === true) {
        metastack.push("System.refresh: " + ixToName[flowIx]);
        dirtyFlows[flowIx] = false;
        var startTime = now();
        var flow = flows[flowIx];
        if (flow !== null) flows[flowIx].refresh(this);
        if ((constraintFlows[flowIx] === true) && !(stores[flowIx].isEmpty()))  {
          console.error("Error flow " + JSON.stringify(ixToName[flowIx]) + " produced " + JSON.stringify(stores[flowIx].getFacts()), this);
        }
        var endTime = now();
        refreshes.push([tick, startTime, endTime, flowIx]);
        flowIx = 0; // resets the loop
        metastack.pop();
      }
    }
    this.updateStore("refresh", refreshes, []);
    this.tick++;
    metastack.pop();
    return this;
  },

  recompile: function(program) {
    // dump views
    var views = this.getDump("view");
    var fields = this.getDump("field");
    var queries = this.getDump("query");
    var constantConstraints = this.getDump("constantConstraint");
    var functionConstraints = this.getDump("functionConstraint");
    var functionConstraintBindings = this.getDump("functionConstraintBinding");
    var viewConstraints = this.getDump("viewConstraint");
    var viewConstraintBindings = this.getDump("viewConstraintBinding");
    var aggregateConstraints = this.getDump("aggregateConstraint");
    var aggregateConstraintBindings = this.getDump("aggregateConstraintBinding");
    var sorts = this.getDump("sort");
    var limits = this.getDump("limit");
    var ordinals = this.getDump("ordinals");
    var isInputs = this.getDump("isInput");

    // init system state
    var stores = [];
    var flows = [];
    var dirtyFlows = [];
    var constraintFlows = [];
    var nameToIx = {};
    var downstream = [];

    // build some indexes
    var queryToView = {};
    for (var i = queries.length - 1; i >= 0; i--) {
      var query = queries[i];
      queryToView[query.query] = query.view;
    }
    var fieldToIx = {};
    for (var i = fields.length - 1; i >= 0; i--) {
      var field = fields[i];
      fieldToIx[field.field] = field.ix;
    }

    // work out upstream dependencies
    var upstream = {};
    for (var i = views.length - 1; i >= 0; i--) {
      var view = views[i];
      upstream[view.view] = [];
    }
    for (var i = viewConstraints.length - 1; i >= 0; i--) {
      var viewConstraint = viewConstraints.length;
      upstream[viewConstraint.sourceView].push(queryToView[viewConstraint.query]);
    }

    // order queries by their ix
    queries.sort(function (a,b) { if (a.ix < b.ix) return 1; else return -1;});

    // choose flow ordering
    var nextIx = 0;
    var viewPlaced = {};
    for (var i = queries.length - 1; i >= 0; i--) {
      var query = queries[i];
      var queryUpstream = upstream[query.query];
      for (var j = queryUpstream.length - 1; j >= 0; j--) {
        var view = queryUpstream[j];
        if (viewPlaced[view] !== true) {
          nameToIx[view] = nextIx++;
          viewPlaced[view] = true;
        }
      }
      nameToIx[query.query] = nextIx++;
    }
    for (var i = views.length - 1; i >= 0; i--) {
      var view = views[i];
      if (viewPlaced[view.view] !== true) {
        nameToIx[view.view] = nextIx++;
        viewPlaced[view.view] = true;
      }
    }

    // build unions
    for (var i = views.length - 1; i >= 0; i--) {
      var view = views[i];
      var viewIx = nameToIx[view.view];
      stores[viewIx] = Memory.empty();
      flows[viewIx] = new Union([], viewIx);
    }

    // fill in unions
    for (var i = queries.length - 1; i >= 0; i--) {
      var query = queries[i];
      var queryIx = nameToIx[query.query];
      var viewIx = nameToIx[query.view];
      flows[viewIx].inputIxes.push(queryIx);
    }

    // build solvers
    for (var i = queries.length - 1; i >= 0; i--) {
      var query = queries[i];
      var queryIx = nameToIx[query.query];
      stores[queryIx] = Memory.empty();
      flows[queryIx] = Solver.empty(0, [], [], queryIx);
    }

    // fill in fields
    for (var i = fields.length - 1; i >= 0; i--) {
      var field = fields[i];
      var queryIx = nameToIx[field.query];
      flows[queryIx].numVars += 1;
    }

    var constraints = {};

    // fill in constants
    for (var i = constantConstraints.length - 1; i >= 0; i--) {
      var constantConstraint = constantConstraints[i];
      var queryIx = nameToIx[constantConstraint.query];
      var fieldIx = fieldToIx[constantConstraint.field];
      flows[queryIx].constants[fieldIx] = constantConstraint.value;
    }

    // build functions
    for (var i = functionConstraints.length - 1; i >= 0; i--) {
      var functionConstraint = functionConstraints[i];
      var fieldIx = fieldToIx[functionConstraint.field];
      var constraint = new FunctionConstraint(null, [], [], fieldIx);
      constraints[functionConstraint.constraint] = constraint;
      var queryIx = nameToIx[functionConstraint.query];
      flows[queryIx].constraints.push(constraint);
    }

    // fill in functions
    for (var i = functionConstraintBindings.length - 1; i >= 0; i--) {
      var functionConstraintBinding = functionConstraintBindings[i];
      var constraint = constraints[functionConstraintBinding.constraint];
      constraint.variables.push(functionConstraintBinding.variable);
      var fieldIx = fieldToIx[functionConstraintBinding.field];
      constraint.inputIxes.push(fieldIx);
    }

    // compile function code
    for (var i = functionConstraints.length - 1; i >= 0; i--) {
      var functionConstraint = functionConstraints[i];
      var constraint = constraints[functionConstraint.constraint];
      constraint.fun = Function.apply(null, constraint.variables.concat(["return (" + functionConstraint.code + ");"]));
    }

    // build view constraints
    for (var i = viewConstraints.length - 1; i >= 0; i--) {
      var viewConstraint = viewConstraints[i];
      var sourceIx = nameToIx[viewConstraint.sourceView];
      var constraint = viewConstraint.isNegated ? new NegatedMemoryConstraint(sourceIx, []) : new MemoryConstraint(sourceIx, []);
      constraints[viewConstraint.constraint] = constraint;
      var queryIx = nameToIx[viewConstraint.query];
      flows[queryIx].constraints.push(constraint);
    }

    // fill in view constraints
    for (var i = viewConstraintBindings.length - 1; i >= 0; i--) {
      var viewConstraintBinding = viewConstraintBindings[i];
      var fieldIx = fieldToIx[viewConstraintBinding.field];
      var sourceIx = fieldToIx[viewConstraintBinding.sourceField];
      constraints[viewConstraintBinding.constraint].fieldIxes[sourceIx] = fieldIx;
    }

    // build aggregate constraints
    for (var i = aggregateConstraints.length - 1; i >= 0; i--) {
      var aggregateConstraint = aggregateConstraints[i];
      var fieldIx = nameToIx[aggregateConstraint.field];
      var sourceIx = nameToIx[aggregateConstraint.sourceView];
      var fun = Function("facts", aggregateConstraint.code);
      var constraint = new AggregatedMemoryConstraint(sourceIx, [], [], [], null, null, fieldIx, fun);
      constraints[aggregateConstraint.constraint] = constraint;
      var queryIx = nameToIx[aggregateConstraint.query];
      flows[queryIx].constraints.push(constraint);
    }

    // fill in group variables
    for (var i = aggregateConstraintBindings.length - 1; i >= 0; i--) {
      var aggregateConstraintBinding = aggregateConstraintBindings[i];
      var fieldIx = fieldToIx[aggregateConstraintBinding.field];
      var sourceIx = fieldToIx[aggregateConstraintBinding.sourceField];
      constraints[aggregateConstraintBinding.constraint].groupIxes[sourceIx] = fieldIx;
    }

    // fill in sort variables
    for (var i = sorts.length - 1; i >= 0; i--) {
      var sort = sorts[i];
      var fieldIx = fieldToIx[sort.field];
      var isAscending = sort.ascendingOrDescending === "ascending";
      var constraint = constraints[sort.constraint];
      constraint.sortIxes.push(fieldIx);
      constraint.sortOrders.push(isAscending);
    }

    // fill in limit variables
    for (var i = limits.length - 1; i >= 0; i--) {
      var limit = limits[i];
      var fieldIx = fieldToIx[limit.field];
      constraints[limit.constraint].limitIx = fieldIx;
    }

    // fill in ordinal variables
    for (var i = ordinals.length - 1; i >= 0; i--) {
      var ordinal = ordinals[i];
      var fieldIx = fieldToIx[ordinal.field];
      constraints[ordinal.constraint].ordinalIx = fieldIx;
    }

    // reverse nameToIx
    var ixToName = [];
    for (var name in nameToIx) {
      ixToName[nameToIx[name]] = name;
    }

    // set system state
    this.stores = stores;
    this.flows = flows;
    this.dirtyFlows = dirtyFlows;
    this.constraintFlows = constraintFlows;
    this.downstream = downstream;
    this.nameToIx = nameToIx;
    this.ixToName = ixToName;

    return this;
  },

  // for testing

  update: function(adds, dels) {
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
    for (var view in addGroups) {
      this.updateStore(view, addGroups[view], []);
    }
    for (var view in delGroups) {
      this.updateStore(view, [], delGroups[view]);
    }
    return this;
  },

  testview: function(view, facts) {
    var outputAdds = [];
    var outputDels = [];
    diffFacts(this.getStore(view).facts, facts, outputAdds, outputDels);
    if ((outputAdds.length > 0) || (outputDels.length > 0)) {
      console.error(this);
      throw new Error("In '" + this.meta.name + "' view '" + view + "' has " + JSON.stringify(outputDels) + " and the test expects " + JSON.stringify(outputAdds));
    }
    return this;
  },

  test: function(facts) {
    var groups = {};
    for (var i = facts.length - 1; i >= 0; i--) {
      var fact = facts[i];
      var group = groups[fact[0]] || (groups[fact[0]] = []);
      group.push(fact.slice(1));
    }
    for (var view in groups) {
      this.testview(view, groups[view]);
    }
    return this;
  }
};

// COMPILER CONSTRAINTS

var compilerConstraints = [
  foreignKey("field", "view", "view", "view"),
  foreignKey("valve", "query", "query", "query"),
  foreignKey("pipe", "view", "view", "view"),
  foreignKey("pipe", "query", "query", "query"),
  foreignKey("viewConstraint", "pipe", "pipe", "pipe"),
  foreignKey("viewConstraint", "valve", "valve", "valve"),
  constraint("fields in queries match fields in views",
             source("viewConstraint", {valve: "valve", pipe: "pipe", field: "field"}),
             source("pipe", {pipe: "pipe", view: "view"}),
             notSource("field", {view: "view", field: "field"})),
  foreignKey("constantConstraint", "valve", "valve", "valve"),
  foreignKey("functionConstraint", "valve", "valve", "valve"),
  foreignKey("functionConstraint", "query", "query", "query"),
  foreignKey("functionConstraintInput", "function", "functionConstraint", "function"),
  foreignKey("functionConstraintInput", "valve", "valve", "valve"),
  foreignKey("limitValve", "query", "query", "query"),
  foreignKey("limitValve", "valve", "valve", "valve"),
  foreignKey("ordinalValve", "query", "query", "query"),
  foreignKey("ordinalValve", "valve", "valve", "valve"),
  foreignKey("groupValve", "query", "query", "query"),
  foreignKey("groupValve", "valve", "valve", "valve"),
  foreignKey("sortValve", "query", "query", "query"),
  foreignKey("sortValve", "valve", "valve", "valve"),
  foreignKey("reducer", "query", "query", "query"),
  foreignKey("reducer", "inValve", "valve", "valve"),
  foreignKey("reducer", "outValve", "valve", "valve"),
  foreignKey("refresh", "flow", "flow", "flow"),
  foreignKey("constraintquery", "query", "query", "query"),


  constraint("all valves are constrained",
             source("valve", {valve: "valve"}),
             notSource("viewConstraint", {valve: "valve"}),
             notSource("constantConstraint", {valve: "valve"}),
             notSource("functionConstraint", {valve: "valve"}),
             notSource("reducer", {outValve: "valve"}))
  ];
