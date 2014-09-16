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

function boundsContainsPoint(los, his, ixes, constants, point) {
  for (var i = ixes.length - 1; i >= 0; i--) {
    var ix = ixes[i];
    if (ix === null) {
      var constant = constants[i];
      if ((constant !== null) && (point[i] !== constant)) return false;
    } else {
      if (compareValue(point[i], los[ix]) === -1) return false;
      if (compareValue(point[i], his[ix]) === 1) return false;
    }
  }
  return true;
}

function solutionMatchesPoint(solution, ixes, constants, point) {
  for (var i = ixes.length - 1; i >= 0; i--) {
    var ix = ixes[i];
    if (ix === null) {
      var constant = constants[i];
      if ((constant !== null) && (point[i] !== constant)) return false;
    } else if (point[i] !== solution[ix]) return false;
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

  getFacts: function() {
    return dedupeFacts(this.facts);
  },

  getTable: function(name) {
    var facts = this.facts;
    var table = [];
    for (var i = facts.length - 1; i >= 0; i--) {
      var fact = facts[i];
      if (fact[0] === name) table.push(fact);
    }
    return dedupeFacts(table);
  }
};

function MemoryConstraint(ixes, constants) {
  this.ixes = ixes;
  this.constants = constants;
}

MemoryConstraint.prototype = {
  start: function(inputMemory) {
    // TODO the latter is a hack to avoid having to change all the quickcheck tests
    return (this.constants && this.constants[0]) ? inputMemory.getTable(this.constants[0]) : inputMemory.getFacts();
  },

  propagate: function(myIx, constraintStates, los, his) {
    var ixes = this.ixes;
    var constants = this.constants;
    var facts = constraintStates[myIx];

    // console.log("Facts before " + JSON.stringify(facts));

    var newFacts = [];

    for (var i = facts.length - 1; i >= 0; i--) {
      var fact = facts[i];
      if (boundsContainsPoint(los, his, ixes, constants, fact) === true) {
        newFacts.push(fact);
      }
    }

    facts = constraintStates[myIx] = newFacts;

    // console.log("Facts after " + JSON.stringify(facts));

    if (facts.length === 0) {
      // console.log("Failed with no facts");
      return FAILED;
    }

    var changed = false;

    for (var i = ixes.length - 1; i >= 0; i--) {
      var newLo = greatest;
      var newHi = least;
      for (var j = facts.length - 1; j >= 0; j--) {
        var value = facts[j][i];
        if (compareValue(value, newLo) === -1) newLo = value;
        if (compareValue(value, newHi) === 1) newHi = value;
      }
      var ix = ixes[i];
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

    var ixes = this.ixes;

    var i, ix, lowerPivot;
    findLowerPivot: for (i = ixes.length - 1; i >= 0; i--) {
      ix = ixes[i];
      if (ix !== null) {
        for (var j = facts.length - 1; j >= 0; j--) {
          lowerPivot = facts[j][i];
          if (lowerPivot !== leftHis[ix]) break findLowerPivot;
        }
      }
    }

    assert(i >= 0); // no pivot?

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

function NegatedMemoryConstraint(ixes, constants) {
  this.ixes = ixes;
  this.constants = constants;
}

NegatedMemoryConstraint.prototype = {
  start: function(inputMemory) {
    // TODO the latter is a hack to avoid having to change all the quickcheck tests
    return (this.constants && this.constants[0]) ? inputMemory.getTable(this.constants[0]) : inputMemory.getFacts();
  },

  propagate: function(myIx, constraintStates, los, his) {
    var facts = constraintStates[myIx];
    var ixes = this.ixes;
    var constants = this.constants;

    for (var i = ixes.length - 1; i >= 0; i--) {
      var ix = ixes[i];
      if ((ix !== null) && (los[ix] !== his[ix])) return UNCHANGED;
    }

    for (var i = facts.length - 1; i >= 0; i--) {
      if (solutionMatchesPoint(los, ixes, constants, facts[i]) === true) {
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

function Provenance(inputMemory, oldOutputMemory, newOutputMemory, numVars, constraints) {
  this.inputMemory = inputMemory;
  this.oldOutputMemory = oldOutputMemory;
  this.newOutputMemory = newOutputMemory;
  this.numVars = numVars;
  this.constraints = constraints;
  this.queuedAdds = [];
}

Provenance.empty = function(numVars, constraints) {
  return new Provenance(Memory.empty(), Memory.empty(), Memory.empty(), numVars, constraints);
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

  start: function (inputMemory) {
    if (this.inputMemory === inputMemory) {
      return false;
    } else {
      this.inputMemory = inputMemory;
      return null;
    }
  },

  finish: function(outputAdds, outputDels) {
    this.newOutputMemory = this.newOutputMemory.update(this.queuedAdds, []);
    this.newOutputMemory.diff(this.oldOutputMemory, outputAdds, outputDels);
    this.queuedAdds = [];
    this.oldOutputMemory = this.newOutputMemory;
    this.newOutputMemory = Memory.empty();
  },

  propagate: function(myIx, constraintStates, los, his) {
    return UNCHANGED;
  },

  split: function(myIx, leftConstraintStates, leftLos, leftHis, rightConstraintStates, rightLos, rightHis) {
    return IGNORED;
  }
};

// FUNCTIONS

function FunctionConstraint(fun, inIxes, outIx, outConstant) {
  this.fun = fun;
  this.inIxes = inIxes;
  this.outIx = outIx;
  this.outConstant = outConstant;
  this.inValues = makeArray(inIxes.length, null);
}

FunctionConstraint.prototype = {
  start: function(inputMemory) {
    return null;
  },

  copy: function(state) {
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
    var outConstant = this.outConstant;
    var outValue = this.fun.apply(null, inValues);
    var compLo = compareValue(outValue, outConstant || los[outIx]);
    var compHi = compareValue(outValue, outConstant || his[outIx]);
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

function Solver(numVars, constraints, provenance) {
  this.numVars = numVars;
  this.constraints = constraints;
  this.provenance = provenance;
}

Solver.empty = function (numVars, constraints) {
  var provenance = Provenance.empty(numVars, constraints);
  constraints.push(provenance);
  return new Solver(numVars, constraints, provenance);
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
  update: function(inputMemory, outputAdds, outputDels) {
    var provenance = this.provenance;
    var numVars = this.numVars;
    var constraints = this.constraints;
    var numConstraints = constraints.length;

    var constraintStates = [];
    for (var i = constraints.length - 1; i >= 0; i--) {
      var constraintState = constraints[i].start(inputMemory);
      if (constraintState === false) return; // constraint is trivially unsatisfiable - eg provenance constraint when nothing is dirty
      constraintStates[i] = constraintState;
    }

    var los = makeArray(numVars, least);
    var his = makeArray(numVars, greatest);

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

    provenance.finish(outputAdds, outputDels);
  }
};

// AGGREGATE

function Aggregate(groupIxes, sortIxes, limitIx, limitConstant, reducerInIxes, reducerOutIxes, reducerFuns, oldOutputMemory, newOutputMemory) {
  this.groupIxes = groupIxes;
  this.sortIxes = sortIxes;
  this.limitIx = limitIx;
  this.limitConstant = limitConstant;
  this.reducerInIxes = reducerInIxes;
  this.reducerOutIxes = reducerOutIxes;
  this.reducerFuns = reducerFuns;
  this.oldOutputMemory = oldOutputMemory;
  this.newOutputMemory = newOutputMemory;
}

Aggregate.empty = function (groupIxes, sortIxes, limitIx, limitConstant, reducerInIxes, reducerOutIxes, reducerFuns) {
  return new Aggregate(groupIxes, sortIxes, limitIx, limitConstant, reducerInIxes, reducerOutIxes, reducerFuns, Memory.empty(), Memory.empty());
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
  update: function(inputMemory, outputAdds, outputDels) {
    var facts = inputMemory.getFacts();
    var newOutputMemory = this.newOutputMemory;
    var groups = groupBy(facts, this.groupIxes);
    for (var group in groups) {
      var groupFacts = groups[group];
      sortBy(groupFacts, this.sortIxes);
      if (this.limitIx !== undefined) groupFacts = groupFacts.slice(0, groupFacts[0][this.limitIx]);
      if (this.limitConstant !== undefined) groupFacts = groupFacts.slice(0, this.limitConstant);
      var reducerInIxes = this.reducerInIxes;
      var reducerOutIxes = this.reducerOutIxes;
      var reducerFuns = this.reducerFuns;
      for (var i = reducerInIxes.length - 1; i >= 0; i--) {
        reduceBy(groupFacts, reducerInIxes[i], reducerOutIxes[i], reducerFuns[i]);
      }
      newOutputMemory = newOutputMemory.update(groupFacts, []);
    }
    newOutputMemory.diff(this.oldOutputMemory, outputAdds, outputDels);
    this.oldOutputMemory = newOutputMemory;
    this.newOutputMemory = Memory.empty();
  }
};

// SINK

function Sink(ixes, constants) {
  this.ixes = ixes;
  this.constants = constants;
}

Sink.prototype = {
  update: function(inputs, outputs) {
    var ixes = this.ixes;
    var constants = this.constants;
    for (var i = inputs.length - 1; i >= 0; i--) {
      var input = inputs[i];
      var output = [];
      for (var j = ixes.length -1; j >= 0; j--) {
        var ix = ixes[j];
        output[j] = (ix === null) ? constants[j] : input[ix];
      }
      outputs.push(output);
    }
  }
};

// FLOW

function Flow(source, aggregate, sinks) {
  this.source = source;
  this.aggregate = aggregate;
  this.sinks = sinks;
}

Flow.prototype = {
  update: function(inputMemory, outputMemory) {
    var sourceAdds = [];
    var sourceDels = [];
    this.source.update(inputMemory, sourceAdds, sourceDels);

    if ((sourceAdds.length === 0) && (sourceDels.length === 0)) return outputMemory;

    var aggregateAdds = [];
    var aggregateDels = [];
    if (this.aggregate) {
      this.aggregate.update(this.source.provenance.oldOutputMemory, aggregateAdds, aggregateDels); // TODO total hack
    } else {
      aggregateAdds = sourceAdds;
      aggregateDels = sourceDels;
    }

    if ((aggregateAdds.length === 0) && (aggregateDels.length === 0)) return outputMemory;

    var sinks = this.sinks;
    var sinkAdds = [];
    var sinkDels = [];
    for (var i = sinks.length - 1; i >= 0; i--) {
      var sink = sinks[i];
      sink.update(aggregateAdds, sinkAdds);
      sink.update(aggregateDels, sinkDels);
    }

    // console.log("Sinking " + JSON.stringify(sinkAdds) + " " + JSON.stringify(sinkDels));
    return outputMemory.update(sinkAdds, sinkDels);
  }
};

// SYSTEM

function System(memory, flows, downstream) {
  this.memory = memory;
  this.flows = flows;
  this.downstream = downstream;
  this.dirty = makeArray(flows.length, true);
}

System.prototype = {
  update: function (adds, dels) {
    var oldMemory = this.memory.update(adds, dels);
    var newMemory = oldMemory;
    var flows = this.flows;
    var downstream = this.downstream;
    var dirty = this.dirty;
    var numFlows = flows.length;

    for (var i = dirty.length - 1; i >= 0; i--) {
      dirty[i] = true;
    }

    var current = 0;
    while (current < numFlows) {
      if (dirty[current] === false) {
        current += 1;
        continue;
      }

      dirty[current] = false;
      newMemory = flows[current].update(oldMemory, oldMemory);

      if (newMemory === oldMemory) {
        current += 1;
        continue;
      }

      oldMemory = newMemory;

      var dirtied = downstream[current];
      for (var i = dirtied.length - 1; i >= 0; i--) {
        var flow = dirtied[i];
        dirty[flow] = true;
        current = (flow <= current) ? flow : current;
      }
    }

    this.memory = newMemory;
  }
};

// COMPILER

var compilerSchema =
    [["schema", "schema", "table", 0],
     ["schema", "schema", "field", 1],
     ["schema", "schema", "ix", 2],

     ["schema", "valve", "valve", 0],
     ["schema", "valve", "rule", 1],
     ["schema", "valve", "ix", 2],

     ["schema", "pipe", "pipe", 0],
     ["schema", "pipe", "table", 1],
     ["schema", "pipe", "rule", 2],
     ["schema", "pipe", "direction", 3], // +source, -source, +sink

     ["schema", "tableConstraint", "valve", 0],
     ["schema", "tableConstraint", "pipe", 1],
     ["schema", "tableConstraint", "field", 2],

     ["schema", "constantConstraint", "valve", 0],
     ["schema", "constantConstraint", "value", 1],

     ["schema", "function", "function", 0],
     ["schema", "function", "code", 1],
     ["schema", "function", "valve", 2],
     ["schema", "function", "rule", 3],

     ["schema", "functionInput", "valve", 0],
     ["schema", "functionInput", "function", 1],

     ["schema", "limitValve", "rule", 0],
     ["schema", "limitValve", "valve", 1],

     ["schema", "groupValve", "rule", 0],
     ["schema", "groupValve", "valve", 1],

     ["schema", "sortValve", "rule", 0],
     ["schema", "sortValve", "valve", 1],
     ["schema", "sortValve", "ix", 2],

     ["schema", "reducer", "rule", 0],
     ["schema", "reducer", "inValve", 1],
     ["schema", "reducer", "outValve", 2],
     ["schema", "reducer", "code", 3]];

function dumpMemory(memory) {
  var facts = memory.getFacts();

  var schema = {};
  for (var i = facts.length - 1; i >= 0; i--) {
    var fact = facts[i];
    if (fact[0] === "schema") {
      var table = fact[1];
      var field = fact[2];
      var ix = fact[3];
      var fields = schema[table] || (schema[table] = []);
      fields[ix] = field;
    }
  }

  var index = {};
  for (var table in schema) {
    var tableIndex = index[table] = {};
    var fields = schema[table];
    for (var i = fields.length - 1; i >= 0; i--) {
      var fieldIndex = tableIndex[fields[i]] = {};
    }
  }

  for (var i = facts.length - 1; i >= 0; i--) {
    var fact = facts[i];
    var table = fact[0];
    var fields = schema[table];
    if (fields !== undefined) {
      var labelledFact = {};
      for (var j = fields.length - 1; j >= 0; j--) {
        labelledFact[fields[j]] = fact[j+1]; // +1 because table name is at 0
      }
      for (var j = fields.length - 1; j >= 0; j--) {
        var field = fields[j];
        var value = fact[j+1]; // +1 because table name is at 0
        var fieldIndex = index[table][field];
        var results = fieldIndex[value] || (fieldIndex[value] = []);
        results.push(labelledFact);
      }
    }
  }

  return index;
}

function compileRule(dump, rule) {
  var valves = dump.valve.rule[rule] || [];
  valves.sort(function (valveA, valveB) {
    return (valveA.ix < valveB.ix) ? -1 : 1;
  });
  var valveConstants = {};
  for (var i = valves.length - 1; i >= 0; i--) {
    var valve = valves[i];
    var constantConstraints = dump.constantConstraint.valve[valve.valve] || [];
    assert(constantConstraints.length <= 1);
    if (constantConstraints.length === 1) {
      valves.splice(i, 1);
      valveConstants[valve.valve] = constantConstraints[0].value;
    }
  }
  var valveIxes = {};
  for (var i = valves.length - 1; i >= 0; i--) {
    valveIxes[valves[i].valve] = i;
  }

  // count how many valves are actually used in constraint solving
  // TODO we hackily assume that valves are ordered with joins/functions/constants before reducers. we should order them ourselves and reorder afterwards
  var numVars;
  for (numVars = 0; numVars < valves.length; numVars++) {
    var valve = valves[numVars].valve;
    if (dump.reducer.outValve[valve] !== undefined) break;
  }

  var constraints = [];
  var sinks = [];

  var pipes = dump.pipe.rule[rule] || [];
  for (var i = pipes.length - 1; i >= 0; i--) {
    var pipe = pipes[i];
    var tableConstraints = dump.tableConstraint.pipe[pipe.pipe];
    if (tableConstraints !== undefined) {
      var fields = dump.schema.table[pipe.table] || [];
      var ixes = makeArray(fields.length + 1, null); // +1 because table name is at 0
      var constants = makeArray(fields.length + 1, null); // +1 because table name is at 0
      constants[0] = pipe.table;
      for (var j = tableConstraints.length - 1; j >= 0; j--) {
        var tableConstraint = tableConstraints[j];
        var fieldIxes = dump.schema.field[tableConstraint.field];
        assert(fieldIxes.length === 1);
        var fieldIx = fieldIxes[0].ix;
        var valveIx = valveIxes[tableConstraint.valve];
        var constant = valveConstants[tableConstraint.valve];
        if (constant === undefined) {
          ixes[fieldIx + 1] = valveIx; // +1 because table name is at 0
        } else {
          constants[fieldIx + 1] = constant; // +1 because table name is at 0
        }
      }
      if (pipe.direction === "+source") {
        constraints.push(new MemoryConstraint(ixes, constants));
      } else if (pipe.direction === "-source") {
        constraints.push(new NegatedMemoryConstraint(ixes, constants));
      } else if (pipe.direction === "+sink") {
        sinks.push(new Sink(ixes, constants));
      } else assert(false);
    }
  }

  var funs = dump.function.rule[rule] || [];
  for (var i = funs.length - 1; i >= 0; i--) {
    var fun = funs[i];
    var outIx = valveIxes[fun.valve];
    var outConstant = valveConstants[fun.valve];
    var inputs = dump.functionInput.function[fun.function] || [];
    var inIxes = [];
    var args = [];
    for (var j = inputs.length - 1; j >= 0; j--) {
      var valve = inputs[j].valve;
      args[j] = valve;
      inIxes[j] = valveIxes[valve];
    }
    var compiled = Function.apply(null, args.concat(["return (" + fun.code + ");"]));
    constraints.push(new FunctionConstraint(compiled, inIxes, outIx, outConstant));
  }

  var limitIx;
  var limitConstant;
  var limitValves = dump.limitValve.rule[rule];
  if (limitValves !== undefined) {
    assert(limitValves.length === 1);
    limitIx = valveIxes[limitValves[0].valve];
    limitConstant = valveConstants[limitValves[0].valve];
  }

  var groupIxes = [];
  var groupValves = dump.groupValve.rule[rule] || [];
  for (var i = groupValves.length - 1; i >= 0; i--) {
    var groupValve = groupValves[i];
    groupIxes[i] = valveIxes[groupValve.valve];
  }

  assert((limitIx === undefined) || (groupIxes.indexOf(limitIx) !== -1));

  var sortIxes = [];
  var sortValves = dump.sortValve.rule[rule] || [];
  for (var i = sortValves.length - 1; i >= 0; i--) {
    var sortValve = sortValves[i];
    sortIxes[sortValve.ix] = valveIxes[sortValve.valve];
  }

  var reducerInIxes = [];
  var reducerOutIxes = [];
  var reducerFuns = [];
  var reducers = dump.reducer.rule[rule] || [];
  for (var i = reducers.length - 1; i >= 0; i--) {
    var reducer = reducers[i];
    reducerInIxes[i] = valveIxes[reducer.inValve];
    reducerOutIxes[i] = valveIxes[reducer.outValve];
    reducerFuns[i] = Function.apply(null, [reducer.inValve, "return (" + reducer.code + ");"]);
  }

  var aggregate = Aggregate.empty(groupIxes, sortIxes, limitIx, limitConstant, reducerInIxes, reducerOutIxes, reducerFuns);

  return new Flow(Solver.empty(numVars, constraints), aggregate, sinks);
}

function compileSystem(memory) {
  // TODO do this properly
  // console.log(JSON.stringify(memory.getFacts()));
  var dump = dumpMemory(memory);
  var rules = Object.keys(dump.pipe.rule);
  var flows = [];
  var dirty = [];
  var dirtied = [];
  for (var i = rules.length - 1; i >= 0; i--) {
    flows[i] = compileRule(dump, rules[i]);
    dirtied[i] = i;
    dirty[i] = dirtied;
  }
  return new System(memory, flows, dirty);
}

// TESTS

var bigcheck = bigcheck; // keep jshint happy

// SOLVER TESTS

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

var selfJoin = bigcheck.foralls(bigcheck.facts(3),
                                function (facts) {
                                  var input = Memory.empty();
                                  var constraint0 = new MemoryConstraint([0,1,2]);
                                  var constraint1 = new MemoryConstraint([0,1,2]);
                                  var flow = new Flow(Solver.empty(3, [constraint0, constraint1]), null, [new Sink([0,1,2], [null,null,null])]);
                                  var input = input.update(facts, []);
                                  var output = flow.update(input, Memory.empty());
                                  return memoryEqual(input, output);
                                });

var productJoin = bigcheck.foralls(bigcheck.facts(3),
                                   function (facts) {
                                     var input = Memory.empty();
                                     var constraint0 = new MemoryConstraint([0,1,2]);
                                     var constraint1 = new MemoryConstraint([3,4,5]);
                                     var flow = new Flow(Solver.empty(6, [constraint0, constraint1]), null, [new Sink([0,1,2,3,4,5], [null,null,null,null,null,null])]);
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
                                      var constraint0 = new MemoryConstraint([0,null,1],[null,constant,null]);
                                      var constraint1 = new MemoryConstraint([2,3,4]);
                                      var flow = new Flow(Solver.empty(5, [constraint0, constraint1]), null, [new Sink([0,1,2,3,4], [null,null,null,null,null])]);
                                      var input = input.update(facts, []);
                                      var output = flow.update(input, Memory.empty());
                                      var expectedFacts = [];
                                      for (var i = 0; i < facts.length; i++) {
                                        if (facts[i][1] === constant) {
                                          for (var j = 0; j < facts.length; j++) {
                                            var fact = facts[i].concat(facts[j]);
                                            fact.splice(1,1);
                                            expectedFacts.push(fact);
                                          }
                                        }
                                      }
                                      return memoryEqual(Memory.fromFacts(expectedFacts), output);
                                    });

var incrementalConstantJoin = bigcheck.foralls(bigcheck.facts(3), bigcheck.value, bigcheck.facts(3), bigcheck.facts(3),
                                               function (facts, constant, adds, dels) {
                                                 var input = Memory.empty();
                                                 var constraint0 = new MemoryConstraint([0,null,1],[null,constant,null]);
                                                 var constraint1 = new MemoryConstraint([2,3,4]);
                                                 var incrementalFlow = new Flow(Solver.empty(5, [constraint0, constraint1]), null, [new Sink([0,1,2,3,4], [null,null,null,null,null])]);
                                                 var batchFlow = new Flow(Solver.empty(5, [constraint0, constraint1]), null, [new Sink([0,1,2,3,4], [null,null,null,null,null])]);
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
                                    var constraint0 = new MemoryConstraint([0,1,2]);
                                    var constraint1 = new MemoryConstraint([2,3,4]);
                                    var flow = new Flow(Solver.empty(5, [constraint0, constraint1]), null, [new Sink([0,1,2,3,4], [null,null,null,null,null])]);
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
                                               var constraint0 = new MemoryConstraint([0,1,2]);
                                               var constraint1 = new MemoryConstraint([2,3,4]);
                                               var incrementalFlow = new Flow(Solver.empty(5, [constraint0, constraint1]), null, [new Sink([0,1,2,3,4], [null,null,null,null,null])]);
                                               var batchFlow = new Flow(Solver.empty(5, [constraint0, constraint1]), null, [new Sink([0,1,2,3,4], [null,null,null,null,null])]);
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
                                      var constraint0 = new MemoryConstraint([0,1,2]);
                                      var constraint1 = new MemoryConstraint([3,4,5]);
                                      var constraint2 = new FunctionConstraint(function (x) { return x + 1;}, [2], 3);
                                      var flow = new Flow(Solver.empty(6, [constraint0, constraint1, constraint2]), null, [new Sink([0,1,2,3,4,5], [null,null,null,null,null,null])]);
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
                                                 var constraint0 = new MemoryConstraint([0,1,2]);
                                                 var constraint1 = new MemoryConstraint([3,4,5]);
                                                 var constraint2 = new FunctionConstraint(function (x) { return x + 1;}, [2], 3);
                                                 var incrementalFlow = new Flow(Solver.empty(6, [constraint0, constraint1, constraint2]), null, [new Sink([0,1,2,3,4,5], [null,null,null,null,null,null])]);
                                                 var batchFlow = new Flow(Solver.empty(6, [constraint0, constraint1, constraint2]), null, [new Sink([0,1,2,3,4,5], [null,null,null,null,null,null])]);
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
                                     var constraint0 = new MemoryConstraint([0,1,2]);
                                     var constraint1 = new NegatedMemoryConstraint([2,null,null], [null,null,null]);
                                     var flow = new Flow(Solver.empty(3, [constraint1, constraint0]), null, [new Sink([0,1,2], [null,null,null])]);
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
                                                var constraint0 = new MemoryConstraint([0,1,2]);
                                                var constraint1 = new NegatedMemoryConstraint([2,null,null], [null,null,null]);
                                                var incrementalFlow = new Flow(Solver.empty(3, [constraint1, constraint0]), null, [new Sink([0,1,2], [null,null,null])]);
                                                var batchFlow = new Flow(Solver.empty(3, [constraint1, constraint0]), null, [new Sink([0,1,2], [null,null,null])]);
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
                                       var constraint0 = new MemoryConstraint([0,1,2]);
                                       var aggregate = Aggregate.empty([2], [0, 1], undefined, undefined, [1], [3], [function (as) {return as.join("");}]);
                                       var flow = new Flow(Solver.empty(3, [constraint0]), aggregate, [new Sink([1,3], [null,null])]);
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
                                       var constraint0 = new MemoryConstraint([0,1,2]);
                                       var incrementalAggregate = Aggregate.empty([2], [0, 1], undefined, undefined, [1], [3], [function (as) {return as.join("");}]);
                                       var batchAggregate = Aggregate.empty([2], [0, 1], undefined, undefined, [1], [3], [function (as) {return as.join("");}]);
                                       var incrementalFlow = new Flow(Solver.empty(3, [constraint0]), incrementalAggregate, [new Sink([1,3], [null,null])]);
                                       var batchFlow = new Flow(Solver.empty(3, [constraint0]), batchAggregate, [new Sink([1,3], [null,null])]);
                                       var incrementalOutput = Memory.empty();
                                       var batchOutput = Memory.empty();

                                       input = input.update(facts, []);
                                       incrementalOutput = incrementalFlow.update(input, incrementalOutput);

                                       input = input.update(adds, dels);
                                       batchOutput = batchFlow.update(input, batchOutput);
                                       incrementalOutput = incrementalFlow.update(input, incrementalOutput);

                                       return memoryEqual(incrementalOutput, batchOutput);
                                     });

// incrementalAggregateJoin.check({maxTests: 1000});
bigcheck.lastFailure;
incrementalAggregateJoin.recheck();

// COMPILER TESTS

function compiledPathTest() {
  var compilerFacts = [["schema", "edge", "edgeX", 0],
                       ["schema", "edge", "edgeY", 1],
                       ["schema", "path", "pathX", 0],
                       ["schema", "path", "pathY", 1],

                       ["valve", "edgeA", "edgeRule", 0],
                       ["valve", "edgeB", "edgeRule", 1],
                       ["pipe", "edgeEdgePipe", "edge", "edgeRule", "+source"],
                       ["pipe", "edgePathPipe", "path", "edgeRule", "+sink"],
                       ["tableConstraint", "edgeA", "edgeEdgePipe", "edgeX"],
                       ["tableConstraint", "edgeB", "edgeEdgePipe", "edgeY"],
                       ["tableConstraint", "edgeA", "edgePathPipe", "pathX"],
                       ["tableConstraint", "edgeB", "edgePathPipe", "pathY"],

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

  var system = compileSystem(Memory.fromFacts(compilerSchema.concat(compilerFacts)));
  system.memory = Memory.empty();

  var facts = [["edge", "a", "b"],
               ["edge", "b", "c"],
               ["edge", "c", "d"],
               ["edge", "d", "b"]];
  // console.log(system);
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

  memoryEqual(system.memory, Memory.fromFacts(expectedFacts));
}

function compiledFunctionTest() {
  var compilerFacts = [["schema", "foo", "fooX", 0],
                       ["schema", "foo", "fooY", 1],
                       ["schema", "foo", "fooZ", 2],
                       ["schema", "bar", "barZ", 0],

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

                       ["function", "addFunction", "valveX + valveY", "valveXY", "rule"],
                       ["functionInput", "valveX", "addFunction"],
                       ["functionInput", "valveY", "addFunction"],

                       ["function", "idFunction", "valveXY", "valveZ", "rule"],
                       ["functionInput", "valveXY", "idFunction"]];

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
  var compilerFacts = [["schema", "foo", "fooX", 0],
                       ["schema", "foo", "fooY", 1],
                       ["schema", "foo", "fooZ", 2],
                       ["schema", "bar", "barZ", 0],

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
  var constraint0 = new MemoryConstraint([0,1,2]);
  var constraint1 = new MemoryConstraint([0,1,2]);
  var sink0 = new Sink([0,1,2], [null,null,null]);
  var solver = Solver.empty(3, [constraint0, constraint1]);
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
  var constraint0 = new MemoryConstraint([0,1,2]);
  var constraint1 = new MemoryConstraint([0,1,2]);
  var sink0 = new Sink([0,1,2], [null,null,null]);
  var solver = Solver.empty(3, [constraint0, constraint1]);
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
