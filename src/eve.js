//---------------------------------------------------------
// Eve runtime and compiler
//---------------------------------------------------------

var FAILED = -1;
var UNCHANGED = 0;
// or bitflag for changed vars

var eve = {};

var metastack = [];

// UTIL

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

function makeArray(len, fill) {
  var arr = [];
  for (var i = 0; i < len; i++) {
    arr[i] = fill;
  }
  return arr;
}

var now = function() {
  if (typeof window !== "undefined" && window.performance) {
    return window.performance.now();
  }
  return (new Date()).getTime();
};

function bitIsSet(bits, bit) {
  return ((bits >> bit) % 2 != 0)
}

function setBit(bits, bit) {
  return bits | (1 << bit);
}

function clearBit(bits, bit) {
  return bits & ~(1 << bit);
}

//---------------------------------------------------------
// interval type
//---------------------------------------------------------

function Interval(start, end) {
  this.start = start;
  this.end = end;
}

intervalCompare = function(me, other) {
  var s = intervalStart(me);
  var e = intervalEnd(me);
  var os = intervalStart(other);
  var oe = intervalEnd(other);
  if(s === os && e === oe) return 0;
  if(s < os || (s === os && e < oe)) return -1;
  return 1;
}

// ORDERING / COMPARISON

var least = false;
var greatest = undefined;


function isValue(v) {
  var t = typeof v;
  return (t === 'string') || (t === 'number') || (t === "boolean") || (t === "object" && v && v.start !== undefined);
}

function compareValue(a, b) {
  if (a === b) return 0;
  var at = typeof a;
  var bt = typeof b;
  if(at === "object" && bt === "object") {
    return intervalCompare(a,b);
  }
  if ((at === bt && a < b) || (at < bt)) return -1;
  return 1;
}

function compareValueArray(a, b) {
  var len = a.length;
  if (len !== b.length) throw new Error("compareValueArray on arrays of different length: " + a + " :: " + b);
  for (var i = 0; i < len; i++) {
    var comp = compareValue(a[i], b[i]);
    if (comp !== 0) return comp;
  }
  return 0;
}

function valueEqual(a, b) {
  if(a === b) return true;
  var at = typeof a;
  var bt = typeof b;
  if(at === "object" && bt === "object") {
    return a.start === b.start && a.end === b.end;
  }
  return false;
}

function arrayEqual(a, b) {
  var len = a.length;
  assert(len === b.length);
  for (var i = 0; i < len; i++) {
    if (!valueEqual(a[i], b[i])) {
      return false;
    }
  }
  return true;
}

function boundsContainsPoint(los, his, ixes, point) {
  for (var i = ixes.length - 1; i >= 0; i -= 2) {
    var pointIx = ixes[i];
    var boundsIx = ixes[i - 1];
    if (compareValue(point[pointIx], los[boundsIx]) === -1) return false;
    if (compareValue(point[pointIx], his[boundsIx]) === 1) return false;
  }
  return true;
}

function solutionMatchesPoint(solution, ixes, point) {
  for (var i = ixes.length - 1; i >= 0; i -= 2) {
    var pointIx = ixes[i];
    var boundsIx = ixes[i - 1];
    if (!valueEqual(point[pointIx], solution[boundsIx])) return false;
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
    var adds = [],
      dels = [];
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

function MemoryConstraint(storeIx, bindingIxes) {
  this.storeIx = storeIx;
  this.bindingIxes = bindingIxes;
}

MemoryConstraint.prototype = {
  start: function(myIx, constraintWatches, system) {
    var watch = 0;
    var bindingIxes = this.bindingIxes;
    for (var i = bindingIxes.length - 1; i >= 0; i -= 2) {
      var boundsIx = bindingIxes[i - 1];
      watch = setBit(watch, boundsIx);
    }
    constraintWatches[myIx] = watch;
    return system._getStore(this.storeIx).getFacts();
  },

  propagate: function(myIx, constraintStates, constraintWatches, los, his) {
    var bindingIxes = this.bindingIxes;
    var facts = constraintStates[myIx];

    // console.log("Facts before " + los + " " + his + " " + JSON.stringify(facts));

    var newFacts = [];

    for (var i = facts.length - 1; i >= 0; i--) {
      var fact = facts[i];
      if (boundsContainsPoint(los, his, bindingIxes, fact) === true) {
        newFacts.push(fact);
      }
    }

    facts = constraintStates[myIx] = newFacts;

    // console.log("Facts after " + los + " " + his + " " + JSON.stringify(facts));

    if (facts.length === 0) {
      // console.log("Failed with no facts");
      return FAILED;
    }

    var changes = UNCHANGED;

    for (var i = bindingIxes.length - 1; i >= 0; i -= 2) {
      var pointIx = bindingIxes[i];
      var boundsIx = bindingIxes[i - 1];
      var newLo = greatest;
      var newHi = least;
      for (var j = facts.length - 1; j >= 0; j--) {
        var value = facts[j][pointIx];
        if (compareValue(value, newLo) === -1) newLo = value;
        if (compareValue(value, newHi) === 1) newHi = value;
      }
      if (compareValue(newLo, los[boundsIx]) === 1) {
        los[boundsIx] = newLo;
        changes = setBit(changes, boundsIx);
      }
      if (compareValue(newHi, his[boundsIx]) === -1) {
        his[boundsIx] = newHi;
        changes = setBit(changes, boundsIx);
      }
    }

    return changes;
  },

  split: function(myIx, leftConstraintStates, leftLos, leftHis, rightConstraintStates, rightLos, rightHis) {
    var facts = leftConstraintStates[myIx];
    if (facts.length < 2) return UNCHANGED;

    var bindingIxes = this.bindingIxes;

    var pointIx, boundsIx, lowerPivot;
    findLowerPivot: for (var i = bindingIxes.length - 1; i >= 0; i -= 2) {
      pointIx = bindingIxes[i];
      boundsIx = bindingIxes[i - 1];
      for (var j = facts.length - 1; j >= 0; j--) {
        lowerPivot = facts[j][pointIx];
        if (!valueEqual(lowerPivot, leftHis[boundsIx])) break findLowerPivot;
      }
    }

    if (i < 0) return UNCHANGED;

    var upperPivot = greatest;
    for (var i = facts.length - 1; i >= 0; i--) {
      var value = facts[i][pointIx];
      if ((compareValue(value, lowerPivot) === 1) && (compareValue(value, upperPivot) === -1)) upperPivot = value;
    }

    leftHis[boundsIx] = lowerPivot;
    rightLos[boundsIx] = upperPivot;
//     console.log("Split at fact[" + pointIx + "]=" + lowerPivot + "," + upperPivot);
    return setBit(UNCHANGED, boundsIx);
  }
};

function NegatedMemoryConstraint(storeIx, bindingIxes) {
  this.storeIx = storeIx;
  this.bindingIxes = bindingIxes;
}

NegatedMemoryConstraint.prototype = {
  start: function(myIx, constraintWatches, system) {
    if (this.bindingIxes.length > 0) {
      constraintWatches[myIx] = setBit(0, this.bindingIxes[0]);
    }
    return system._getStore(this.storeIx).getFacts();
  },

  propagate: function(myIx, constraintStates, constraintWatches, los, his) {
    var facts = constraintStates[myIx];
    var bindingIxes = this.bindingIxes;

    for (var i = bindingIxes.length - 1; i >= 0; i -= 2) {
      var boundsIx = bindingIxes[i - 1];
      if (!valueEqual(los[boundsIx], his[boundsIx])) {
        constraintWatches[myIx] = setBit(0, boundsIx);
        return UNCHANGED;
      }
    }

    for (var i = facts.length - 1; i >= 0; i--) {
      if (solutionMatchesPoint(los, bindingIxes, facts[i]) === true) {
        // console.log("Negation failed on " + facts[i]);
        return FAILED;
      }
    }

    constraintWatches[myIx] = 0;
    return UNCHANGED;
  },

  split: function(myIx, leftConstraintStates, leftLos, leftHis, rightConstraintStates, rightLos, rightHis) {
    return UNCHANGED;
  }
};

function AggregatedMemoryConstraint(storeIx, bindingIxes, outIx, solverVariables, aggregateVariables, solverIxes, aggregateIxes, fun) {
  this.storeIx = storeIx;
  this.bindingIxes = bindingIxes;
  this.outIx = outIx;
  this.solverVariables = solverVariables;
  this.aggregateVariables = aggregateVariables;
  this.solverIxes = solverIxes;
  this.aggregateIxes = aggregateIxes;
  this.fun = fun;
}

AggregatedMemoryConstraint.prototype = {
  start: function(myIx, constraintWatches, system) {
    if (this.bindingIxes.length > 0) {
      constraintWatches[myIx] = setBit(0, this.bindingIxes[0]);
    }
    return system._getStore(this.storeIx).getFacts();
  },

  propagate: function(myIx, constraintStates, constraintWatches, los, his) {
    var facts = constraintStates[myIx];

    var bindingIxes = this.bindingIxes;
    for (var i = bindingIxes.length - 1; i >= 0; i -= 2) {
      var boundsIx = bindingIxes[i - 1];
      if (!valueEqual(los[boundsIx], his[boundsIx])) {
        constraintWatches[myIx] = setBit(0, boundsIx);
        return UNCHANGED;
      }
    }

    var solverIxes = this.solverIxes;
    for (var i = solverIxes.length - 1; i >= 0; i--) {
      var solverIx = solverIxes[i];
      if (!valueEqual(los[solverIx], his[solverIx])) {
        constraintWatches[myIx] = setBit(0, solverIx);
        return UNCHANGED;
      }
    }

    var groupFacts = [];

    for (var i = facts.length - 1; i >= 0; i--) {
      var fact = facts[i]
      if (solutionMatchesPoint(los, bindingIxes, fact) === true) {
        groupFacts.push(fact);
      }
    }

    var inValues = [];
    for (var i = solverIxes.length - 1; i >= 0; i--) {
      var solverIx = solverIxes[i];
      inValues[i] = los[solverIx];
    }
    var solverLen = solverIxes.length;
    var aggregateIxes = this.aggregateIxes;
    for (var i = aggregateIxes.length - 1; i >= 0; i--) {
      var aggregateIx = aggregateIxes[i];
      var inValue = [];
      for (var j = groupFacts.length - 1; j >= 0; j--) {
        inValue[j] = groupFacts[j][aggregateIx];
      }
      inValues[solverLen + i] = inValue;
    }

    var outValue = this.fun.apply(null, inValues);
    if (!isValue(outValue)) throw new Error(outValue + " is not a valid Eve value");
    var outIx = this.outIx;
    var compLo = compareValue(outValue, los[outIx]);
    var compHi = compareValue(outValue, his[outIx]);
    if ((compLo === -1) || (compHi === 1)) return FAILED;
    los[outIx] = outValue;
    his[outIx] = outValue;
    constraintWatches[myIx] = 0;
    return ((compLo === 1) || (compHi === -1)) ? setBit(UNCHANGED, outIx) : UNCHANGED;
  },

  split: function(myIx, leftConstraintStates, leftLos, leftHis, rightConstraintStates, rightLos, rightHis) {
    return UNCHANGED;
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

  propagated: function(oldLos, oldHis, newLos, newHis, constraintIx) {},

  splitted: function(oldLos, oldHis, leftLos, leftHis, rightLos, rightHis, constraintIx) {},

  failed: function(oldLos, oldHis, ix) {},

  solved: function(solution) {
    this.queuedAdds.push(solution.slice());
  },

  // constraint interface

  start: function(system) {
    return null;
  },

  finish: function(system) {
    var oldOutput = system._getStore(this.outputIx) || Memory.empty();
    var newOutput = Memory.fromFacts(this.queuedAdds);
    this.queuedAdds = [];
    if (newOutput.differsFrom(oldOutput)) system._setStore(this.outputIx, newOutput);
  },

  propagate: function(myIx, constraintStates, los, his) {
    return UNCHANGED;
  },

  split: function(myIx, leftConstraintStates, leftLos, leftHis, rightConstraintStates, rightLos, rightHis) {
    return UNCHANGED;
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
  start: function(myIx, constraintWatches, system) {
    if (this.inIxes.length > 0) {
      constraintWatches[myIx] = setBit(0, this.inIxes[0]);
    }
    return true;
  },

  propagate: function(myIx, constraintStates, constraintWatches, los, his) {
    var inIxes = this.inIxes;
    var inValues = this.inValues;

    for (var i = inIxes.length - 1; i >= 0; i--) {
      var inIx = inIxes[i];
      var lo = los[inIx];
      if (!valueEqual(lo, his[inIx])) {
        constraintWatches[myIx] = setBit(0, inIx);
        return UNCHANGED;
      }
      inValues[i] = lo;
    }

    var outIx = this.outIx;
    var outValue = this.fun.apply(null, inValues);
    if (!isValue(outValue)) throw new Error(outValue + " is not a valid Eve value");
    var compLo = compareValue(outValue, los[outIx]);
    var compHi = compareValue(outValue, his[outIx]);
    if ((compLo === -1) || (compHi === 1)) return FAILED;
    los[outIx] = outValue;
    his[outIx] = outValue;
    constraintWatches[myIx] = 0;
    return ((compLo === 1) || (compHi === -1)) ? setBit(UNCHANGED, outIx) : UNCHANGED;
  },

  split: function(myIx, leftConstraintStates, leftLos, leftHis, rightConstraintStates, rightLos, rightHis) {
    return UNCHANGED;
  }
};

// SOLVER

function Solver(numVars, constants, constraints, provenance) {
  this.numVars = numVars;
  this.constants = constants;
  this.constraints = constraints;
  this.provenance = provenance;
}

Solver.empty = function(numVars, constants, constraints, outputIx) {
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

    var constraintWatches = [];
    for (var i = constraints.length - 1; i >= 0; i--) {
      constraintWatches[i] = 0;
    }

    var constraintStates = [];
    for (var i = constraints.length - 1; i >= 0; i--) {
      var constraintState = constraints[i].start(i, constraintWatches, system);
      if (constraintState === false) return; // constraint is trivially unsatisfiable - eg provenance constraint when nothing is dirty
      constraintStates[i] = constraintState;
    }

    var constraintDirty = 0;
    for (var i = constraints.length - 1; i >= 0; i--) {
      constraintDirty = setBit(constraintDirty, i);
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
    var queuedConstraintWatches = [];
    var queuedConstraintDirty = [];
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
        if (bitIsSet(constraintDirty, current)) {
          var result = constraints[current].propagate(current, constraintStates, constraintWatches, los, his);
          if (result === FAILED) {
            provenance.failed(); // TODO
            if (depth === 0) break solve;
            depth -= 1;
            popFrom(depth, constraintStates, queuedConstraintStates);
            popFrom(depth, constraintWatches, queuedConstraintWatches);
            constraintDirty = queuedConstraintDirty.pop();
            popFrom(depth, los, queuedLos);
            popFrom(depth, his, queuedHis);
            continue solve;
          } else if (result !== UNCHANGED) {
            provenance.propagated(); // TODO
            lastChanged = current;
            for (var i = constraints.length - 1; i >= 0; i--) {
              if ((result & constraintWatches[i]) > 0) {
                constraintDirty = setBit(constraintDirty, i);
              }
            }
          }
          constraintDirty = clearBit(constraintDirty, current);
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
        popFrom(depth, constraintWatches, queuedConstraintWatches);
        constraintDirty = queuedConstraintDirty.pop();
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
          if (result !== UNCHANGED) {
            provenance.splitted(); // TODO
            for (var i = constraints.length - 1; i >= 0; i--) {
              if ((result & constraintWatches[i]) > 0) {
                constraintDirty = setBit(constraintDirty, i);
              }
            }
            break split;
          }
        }
        // console.log("Split by " + splitter);
      assert(splitter >= 0);

      pushInto(depth, rightConstraintStates, queuedConstraintStates);
      pushInto(depth, constraintWatches, queuedConstraintWatches); // not changed during splitting
      queuedConstraintDirty.push(constraintDirty);
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
    var inputIxes = this.inputIxes;
    if (inputIxes.length === 0) {
      return;
    } else if (inputIxes.length === 1) {
      system._setStore(this.outputIx, system._getStore(inputIxes[0]));
    } else {
      var outputFacts = [];
      for (var i = inputIxes.length - 1; i >= 0; i--) {
        outputFacts = outputFacts.concat(system._getStore(inputIxes[i]).getFacts());
      }
      var oldOutput = system._getStore(this.outputIx);
      var newOutput = Memory.fromFacts(outputFacts);
      if (newOutput.differsFrom(oldOutput)) system._setStore(this.outputIx, newOutput);
    }
  }
};

// SYSTEM

var compilerSchemas = [
  ["view", "view"],
  ["field", "field", "view", "ix"],
  ["query", "query", "view", "ix"],
  ["constantConstraint", "query", "field", "value"],
  ["functionConstraint", "constraint", "query", "field", "code"],
  ["functionConstraintInput", "constraint", "field", "variable"],
  ["viewConstraint", "constraint", "query", "sourceView", "isNegated"],
  ["viewConstraintBinding", "constraint", "field", "sourceField"],
  ["aggregateConstraint", "constraint", "query", "field", "sourceView", "code"],
  ["aggregateConstraintBinding", "constraint", "field", "sourceField"],
  ["aggregateConstraintSolverInput", "constraint", "field", "variable"],
  ["aggregateConstraintAggregateInput", "constraint", "sourceField", "variable"],
  ["isInput", "view"],
  ["isCheck", "view"],
  ["refresh", "tick", "startTime", "endTime", "flow"],
];

function System(meta, stores, flows, dirtyFlows, checkFlows, downstream, nameToIx, ixToName) {
  this.meta = meta;
  this.stores = stores;
  this.flows = flows;
  this.dirtyFlows = dirtyFlows;
  this.checkFlows = checkFlows;
  this.downstream = downstream;
  this.nameToIx = nameToIx;
  this.ixToName = ixToName;
  this.tick = 0;
}

System.empty = function(meta) {
  var stores = [];
  var flows = [];
  var dirtyFlows = [];
  var checkFlows = [];
  var downstream = [];
  var nameToIx = {};

  var compilerViews = [];
  var compilerFields = [];

  for (var i = compilerSchemas.length - 1; i >= 0; i--) {
    var view = compilerSchemas[i][0];
    var fields = compilerSchemas[i].slice(1);

    compilerViews.push([view])
    for (var j = fields.length - 1; j >= 0; j--) {
      // mangle field names the same way the parser does :(
      var field = view + "|field=" + fields[j];
      compilerFields.push([field, view, j]);
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

  var system = new System(meta, stores, flows, dirtyFlows, checkFlows, downstream, nameToIx, ixToName);
  system.updateStore("view", compilerViews, []);
  system.updateStore("field", compilerFields, []);
  system.updateStore("isInput", compilerViews, []);
  return system;
};

System.prototype = {
  getStore: function(name) {
    var ix = this.nameToIx[name];
    return this._getStore(ix);
  },

  updateStore: function(name, adds, dels) {
    var ix = this.nameToIx[name];
    if (ix === undefined) throw new Error("No store for " + name);
    var store = this._getStore(ix);
    this._setStore(ix, store.update(adds, dels));
    return this;
  },

  _getStore: function(storeIx) {
    return this.stores[storeIx];
  },

  _setStore: function(storeIx, store) {
    this.stores[storeIx] = store;
    var dirtiedFlows = this.downstream[storeIx];
    var dirtyFlows = this.dirtyFlows;
    for (var i = dirtiedFlows.length - 1; i >= 0; i--) {
      dirtyFlows[dirtiedFlows[i]] = true;
    }
  },

  getDump: function(view) {
    var fields = this.getStore("field").getFacts();
    var viewFields = [];
    for (var i = fields.length - 1; i >= 0; i--) {
      var field = fields[i];
      if (field[1] === view) {
        var unmangledField = field[0].substring((view + "field=").length + 1);
        viewFields[field[2]] = unmangledField;
      }
    }
    var facts = this.getStore(view).getFacts();
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

  refresh: function(errors) {
    metastack.push("System.refresh");
    var tick = this.tick;
    var flows = this.flows;
    var stores = this.stores;
    var numFlows = flows.length;
    var dirtyFlows = this.dirtyFlows;
    var checkFlows = this.checkFlows;
    var ixToName = this.ixToName;
    var refreshes = [];
    for (var flowIx = 0; flowIx < numFlows; flowIx++) {
      if (dirtyFlows[flowIx] === true) {
        metastack.push("System.refresh: " + ixToName[flowIx]);
        dirtyFlows[flowIx] = false;
        var startTime = now();
        var flow = flows[flowIx];
        if (flow !== null) flows[flowIx].refresh(this);
        if ((checkFlows[flowIx] === true) && !(stores[flowIx].isEmpty())) {
          errors.push("Check flow " + JSON.stringify(ixToName[flowIx]) + " produced " + JSON.stringify(stores[flowIx].getFacts()));
        }
        var endTime = now();
        refreshes.push([tick, startTime, endTime, flowIx]);
        flowIx = -1; // resets the loop
        metastack.pop();
      }
    }
    //     this.updateStore("refresh", refreshes, []);
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
    var functionConstraintInputs = this.getDump("functionConstraintInput");
    var viewConstraints = this.getDump("viewConstraint");
    var viewConstraintBindings = this.getDump("viewConstraintBinding");
    var aggregateConstraints = this.getDump("aggregateConstraint");
    var aggregateConstraintBindings = this.getDump("aggregateConstraintBinding");
    var aggregateConstraintSolverInputs = this.getDump("aggregateConstraintSolverInput");
    var aggregateConstraintAggregateInputs = this.getDump("aggregateConstraintAggregateInput");
    var isInputs = this.getDump("isInput");
    var isChecks = this.getDump("isCheck");

    // init system state
    var stores = [];
    var flows = [];
    var dirtyFlows = [];
    var checkFlows = [];
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
    var viewToNumFields = {};
    for (var i = views.length - 1; i >= 0; i--) {
      var view = views[i];
      viewToNumFields[view.view] = 0;
    }
    for (var i = fields.length - 1; i >= 0; i--) {
      var field = fields[i];
      viewToNumFields[field.view] += 1;
    }
    var viewIsInput = {};
    for (var i = isInputs.length - 1; i >= 0; i--) {
      var isInput = isInputs[i];
      viewIsInput[isInput.view] = true;
    }

    // work out upstream dependencies
    var upstream = {};
    for (var i = queries.length - 1; i >= 0; i--) {
      var query = queries[i];
      upstream[query.query] = [];
    }
    for (var i = viewConstraints.length - 1; i >= 0; i--) {
      var viewConstraint = viewConstraints[i];
      upstream[viewConstraint.query].push(viewConstraint.sourceView);
    }
    for (var i = aggregateConstraints.length - 1; i >= 0; i--) {
      var aggregateConstraint = aggregateConstraints[i];
      upstream[aggregateConstraint.query].push(aggregateConstraint.sourceView);
    }

    // order queries by their ix
    queries.sort(function(a, b) {
      if (a.ix < b.ix) return 1;
      else return -1;
    });

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

    // work out downstream dependencies
    for (var i = nextIx - 1; i >= 0; i--) {
      downstream[i] = [];
    }
    for (var i = viewConstraints.length - 1; i >= 0; i--) {
      var viewConstraint = viewConstraints[i];
      var viewIx = nameToIx[viewConstraint.sourceView];
      var queryIx = nameToIx[viewConstraint.query];
      downstream[viewIx].push(queryIx);
    }
    for (var i = aggregateConstraints.length - 1; i >= 0; i--) {
      var aggregateConstraint = aggregateConstraints[i];
      var viewIx = nameToIx[aggregateConstraint.sourceView];
      var queryIx = nameToIx[aggregateConstraint.query];
      downstream[viewIx].push(queryIx);
    }
    for (var i = queries.length - 1; i >= 0; i--) {
      var query = queries[i];
      var viewIx = nameToIx[query.view];
      var queryIx = nameToIx[query.query];
      downstream[queryIx].push(viewIx);
    }

    // build unions
    for (var i = views.length - 1; i >= 0; i--) {
      var view = views[i];
      var viewIx = nameToIx[view.view];
      stores[viewIx] = viewIsInput[view.view] && this.getStore(view.view) ? this.getStore(view.view) : Memory.empty();
      flows[viewIx] = new Union([], viewIx);
      dirtyFlows[viewIx] = false;
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
      var numFields = viewToNumFields[query.view];
      assert(numFields <= 32) // we use bitflags in the constraint solver
      var queryIx = nameToIx[query.query];
      stores[queryIx] = Memory.empty();
      flows[queryIx] = Solver.empty(numFields, [], [], queryIx);
      dirtyFlows[queryIx] = true; // need to run solvers even if they don't have input yet - aggregates can compute on empty sets
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
    for (var i = functionConstraintInputs.length - 1; i >= 0; i--) {
      var functionConstraintInput = functionConstraintInputs[i];
      var constraint = constraints[functionConstraintInput.constraint];
      constraint.variables.push(functionConstraintInput.variable);
      var fieldIx = fieldToIx[functionConstraintInput.field];
      constraint.inIxes.push(fieldIx);
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
      constraints[viewConstraintBinding.constraint].bindingIxes.push(fieldIx, sourceIx);
    }

    // build aggregate constraints
    for (var i = aggregateConstraints.length - 1; i >= 0; i--) {
      var aggregateConstraint = aggregateConstraints[i];
      var fieldIx = fieldToIx[aggregateConstraint.field];
      var sourceIx = nameToIx[aggregateConstraint.sourceView];
      var constraint = new AggregatedMemoryConstraint(sourceIx, [], fieldIx, [], [], [], [], null);
      constraints[aggregateConstraint.constraint] = constraint;
      var queryIx = nameToIx[aggregateConstraint.query];
      flows[queryIx].constraints.push(constraint);
    }

    // fill in aggregate bindings
    for (var i = aggregateConstraintBindings.length - 1; i >= 0; i--) {
      var aggregateConstraintBinding = aggregateConstraintBindings[i];
      var fieldIx = fieldToIx[aggregateConstraintBinding.field];
      var sourceIx = fieldToIx[aggregateConstraintBinding.sourceField];
      constraints[aggregateConstraintBinding.constraint].bindingIxes.push(fieldIx, sourceIx);
    }

    // fill in aggregate solver inputs
    for (var i = aggregateConstraintSolverInputs.length - 1; i >= 0; i--) {
      var aggregateConstraintSolverInput = aggregateConstraintSolverInputs[i];
      var fieldIx = fieldToIx[aggregateConstraintSolverInput.field];
      var constraint = constraints[aggregateConstraintSolverInput.constraint];
      constraint.solverVariables.push(aggregateConstraintSolverInput.variable);
      constraint.solverIxes.push(fieldIx);
    }

    // fill in aggregate aggregate inputs
    for (var i = aggregateConstraintAggregateInputs.length - 1; i >= 0; i--) {
      var aggregateConstraintAggregateInput = aggregateConstraintAggregateInputs[i];
      var sourceIx = fieldToIx[aggregateConstraintAggregateInput.sourceField];
      var constraint = constraints[aggregateConstraintAggregateInput.constraint];
      constraint.aggregateVariables.push(aggregateConstraintAggregateInput.variable);
      constraint.aggregateIxes.push(sourceIx);
    }

    // compile aggregate code
    for (var i = aggregateConstraints.length - 1; i >= 0; i--) {
      var aggregateConstraint = aggregateConstraints[i];
      var constraint = constraints[aggregateConstraint.constraint];
      constraint.fun = Function.apply(null,
        constraint.solverVariables.concat(
          constraint.aggregateVariables.concat(
            ["return (" + aggregateConstraint.code + ");"])));
    }

    // tag checks
    for (var i = isChecks.length - 1; i >= 0; i--) {
      var isCheck = isChecks[i];
      var viewIx = nameToIx[isCheck.view];
      checkFlows[viewIx] = true;
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
    this.checkFlows = checkFlows;
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

var compilerChecks = ''
