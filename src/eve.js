if(typeof window === 'undefined') {
  jsc = require("./resources/jsverify.js");
}

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
  start: function(memory) {
    // TODO the latter is a hack to avoid having to change all the quickcheck tests
    return (this.constants && this.constants[0]) ? memory.getTable(this.constants[0]) : memory.getFacts();
  },

  copy: function(facts) {
    return facts.slice();
  },

  propagate: function(facts, solverState) {
    var ixes = this.ixes;
    var constants = this.constants;
    var los = solverState.los;
    var his = solverState.his;

    // console.log("Facts before " + JSON.stringify(facts));

    for (var i = facts.length - 1; i >= 0; i--) {
      var fact = facts[i];
      if (boundsContainsPoint(los, his, ixes, constants, fact) === false) {
        facts.splice(i, 1);
      }
    }

    // console.log("Facts after " + JSON.stringify(facts));

    if (facts.length === 0) {
      // console.log("Failed with no facts");
      solverState.isFailed = true;
      return true;
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

    return changed;
  },

  split: function(facts, leftSolverState, rightSolverState) {
    if (facts.length < 2) return false;

    var his = leftSolverState.his;
    var ixes = this.ixes;

    var i, ix, lowerPivot;
    findLowerPivot: for (i = ixes.length - 1; i >= 0; i--) {
      ix = ixes[i];
      if (ix !== null) {
        for (var j = facts.length - 1; j >= 0; j--) {
          lowerPivot = facts[j][i];
          if (lowerPivot !== his[ix]) break findLowerPivot;
        }
      }
    }

    assert(i >= 0); // no pivot?

    var upperPivot = greatest;
    for (var j = facts.length - 1; j >= 0; j--) {
      var value = facts[j][i];
      if ((compareValue(value, lowerPivot) === 1) && (compareValue(value, upperPivot) === -1)) upperPivot = value;
    }

    leftSolverState.his[ix] = lowerPivot;
    rightSolverState.los[ix] = upperPivot;
    // console.log("Split at fact[" + i + "]=" + lowerPivot + "," + upperPivot);
    return true;
  }
};

function NegatedMemoryConstraint(ixes, constants) {
  this.ixes = ixes;
  this.constants = constants;
}

NegatedMemoryConstraint.prototype = {
  start: function(memory) {
    // TODO the latter is a hack to avoid having to change all the quickcheck tests
    return (this.constants && this.constants[0]) ? memory.getTable(this.constants[0]) : memory.getFacts();
  },

  copy: function(facts) {
    return facts;
  },

  propagate: function(facts, solverState) {
    var ixes = this.ixes;
    var constants = this.constants;
    var los = solverState.los;
    var his = solverState.his;

    for (var i = ixes.length - 1; i >= 0; i--) {
      var ix = ixes[i];
      if ((ix !== null) && (los[ix] !== his[ix])) return false;
    }

    for (var i = facts.length - 1; i >= 0; i--) {
      if (solutionMatchesPoint(los, ixes, constants, facts[i]) === true) {
        // console.log("Negation failed on " + facts[i]);
        solverState.isFailed = true;
        return true;
      }
    }
  },

  split: function(facts, leftSolverState, rightSolverState) {
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
    this.queuedAdds.push(solution);
  },

  // constraint interface

  start: function (memory) {
    if (this.inputMemory === memory) {
      return false;
    } else {
      this.inputMemory = memory;
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

  copy: function(state) {
    return null;
  },

  propagate: function(state, solverState) {
    return false;
  },

  split: function(regions, leftSolverState, rightSolverState) {
    return false;
  }
};

// FUNCTIONS

function FunctionConstraint(fun, inIxes, outIx) {
  this.fun = fun;
  this.inIxes = inIxes;
  this.outIx = outIx;
  this.inValues = makeArray(inIxes.length, null);
}

// SOLVER

function SolverState(provenance, constraints, constraintStates, los, his, isFailed) {
  this.provenance = provenance;
  this.constraints = constraints;
  this.constraintStates = constraintStates;
  this.los = los;
  this.his = his;
  this.isFailed = isFailed;
}

SolverState.prototype = {
  expand: function(states) {
    var provenance = this.provenance;
    var constraints = this.constraints;
    var constraintStates = this.constraintStates;
    var numConstraints = this.constraints.length;
    var los = this.los;
    var his = this.his;
    var oldLos = los.slice();
    var oldHis = his.slice();

    // propagate all constraints until nothing changes
    var lastChanged = 0;
    var current = 0;
    while (true) {
      // console.log("Before prop " + current + " " + los + " " + his);
      var changed = constraints[current].propagate(constraintStates[current], this);
      if (this.isFailed === true) {
        provenance.failed(oldLos, oldHis, current);
        return;
      }
      if (changed === true) {
        provenance.propagated(oldLos, oldHis, los, his, current);
        oldLos = los.slice();
        oldHis = his.slice();
        lastChanged = current;
      }
      // console.log("After prop " + current + " " + los + " " + his);
      current = (current + 1) % numConstraints;
      if (current === lastChanged) break;
    }

    // check if we are a leaf
    if (arrayEqual(los, his)) {
      provenance.solved(los);
      // console.log("Found " + JSON.stringify(los));
      return;
    }

    // split into two children
    var leftSolverState = this;
    var rightSolverState = new SolverState(this.provenance, constraints, constraintStates.slice(), los.slice(), his.slice(), this.isFailed);
    for (var i = constraints.length - 1; i >= 0; i--) {
      constraintStates[i] = constraints[i].copy(constraintStates[i]);
    }
    for (var splitter = constraints.length - 1; splitter >= 0; splitter--) {
      if (constraints[splitter].split(constraintStates[splitter], leftSolverState, rightSolverState)) {
        provenance.splitted(oldLos, oldHis, leftSolverState.los, leftSolverState.his, rightSolverState.los, rightSolverState.his);
        break;
      }
    }
    // console.log("Split by " + splitter);

    // make sure we found a splitter
    assert(splitter >= 0);

    states.push(leftSolverState, rightSolverState);
  }
};

function Solver(numVars, constraints, provenance) {
  this.numVars = numVars;
  this.constraints = constraints;
  this.provenance = provenance;
}

Solver.fresh = function (numVars, constraints) {
  var provenance = Provenance.empty(numVars, constraints);
  constraints.push(provenance);
  return new Solver(numVars, constraints, provenance);
};

Solver.prototype = {
  update: function(inputMemory, outputAdds, outputDels) {
    var provenance = this.provenance;

    var constraints = this.constraints;
    var constraintStates = [];
    for (var i = constraints.length - 1; i >= 0; i--) {
      var constraintState = constraints[i].start(inputMemory);
      if (constraintState === false) return; // constraint is trivially unsatisfiable - eg provenance constraint when nothing is dirty
      constraintStates[i] = constraintState;
    }

    var numVars = this.numVars;
    var states = [new SolverState(provenance, constraints, constraintStates, makeArray(numVars, least), makeArray(numVars, greatest), false)];
    while (states.length > 0) {
      var state = states.pop();
      // console.log("Popped " + JSON.stringify(state.los) + " " + JSON.stringify(state.his));
      state.expand(states);
    }

    provenance.finish(outputAdds, outputDels);
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

function Flow(source, sinks) {
  this.source = source;
  this.sinks = sinks;
}

Flow.prototype = {
  update: function(inputMemory, outputMemory) {
    var sourceAdds = [];
    var sourceDels = [];
    this.source.update(inputMemory, sourceAdds, sourceDels);

    if ((sourceAdds.length === 0) && (sourceDels.length === 0)) return outputMemory;

    var sinks = this.sinks;
    var sinkAdds = [];
    var sinkDels = [];
    for (var i = sinks.length - 1; i >= 0; i--) {
      var sink = sinks[i];
      sink.update(sourceAdds, sinkAdds);
      sink.update(sourceDels, sinkDels);
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
     ["schema", "functionInput", "function", 1]];

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
      valves.slice(i);
      valveConstants[valve.valve] = constantConstraints[0].value;
    }
  }
  var valveIxes = {};
  for (var i = valves.length - 1; i >= 0; i--) {
    valveIxes[valves[i].valve] = i;
  }

  Object.keys(dump.function.rule);

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
    var inputs = dump.functionInput.function[fun.function];
    var inIxes = [];
    var args = [];
    for (var j = inputs.length - 1; j >= 0; j--) {
      var valve = inputs[j].valve;
      args[j] = valve;
      inIxes[j] = valveIxes[valve];
    }
    var compiled = Function.apply(null, args.concat(["return (" + fun.code + ");"]));
    constraints.push(new FunctionConstraint(compiled, inIxes, outIx));
  }

  return new Flow(Solver.fresh(valves.length, constraints), sinks);
}

function compileSystem(memory) {
  // TODO do this properly
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

var jsc = jsc; // just to make jshint happy
var gen = {};

function Unshrinkable() {}

gen.tuple = function (gens) {
  return {
    arbitrary: function(size) {
      var tuple = [];
      for (var i = 0; i < gens.length; i++) {
        tuple[i] = gens[i].arbitrary(size);
      }
      return tuple;
    },
    randomShrink: function(tuple) {
      var shrunk = tuple.slice();
      var i = jsc._.random(0, tuple.length - 1);
      shrunk[i] = gens[i].randomShrink(shrunk[i]);
      return shrunk;
    },
    show: function(tuple) {
      var shown = tuple.slice();
      for (var i = 0; i < shown.length; i++) {
        shown[i] = gens[i].show(shown[i]);
      }
      return "[" + shown.join(", ") + "]";
    },
  };
};

gen.array = function(gen, n) {
  return {
    arbitrary: function(size) {
      var array = [];
      var length = n || jsc._.random(1,size);
      for (var i = 0; i < length; i++) {
        array[i] = gen.arbitrary(size);
      }
      return array;
    },
    randomShrink: function(array) {
      if (array.length === 0) {
        throw new Unshrinkable();
      } else {
        var shrunk = array.slice();
        var i = jsc._.random(0, array.length - 1);
        if ((n === undefined) && (jsc._.random(0,1) === 0)) {
          shrunk.splice(i, 1);
        } else {
          shrunk[i] = gen.randomShrink(shrunk[i]);
        }
        return shrunk;
      }
    },
    show: JSON.stringify,
  };
};

var maxShrinks = 1000;

// limit to 'maxShrinks' random shrink attempts
function shrinkwrap(gen) {
  return {
    arbitrary: gen.arbitrary,
    shrink: function(value) {
      var shrinks = [];
      for (var i = 0; i < maxShrinks; i++) {
        try {
          shrinks[i] = gen.randomShrink(value);
        } catch (err) {
          if (err.constructor !== Unshrinkable) throw err;
        }
      }
      return shrinks;
    },
    show: gen.show,
  };
}

// shrinkwrap gens before handing over to jsc
function forall() {
  var args = Array.prototype.slice.call(arguments);
  var gens = args.slice(0, args.length - 1);
  var fun = args[args.length - 1];
  var wrapped = shrinkwrap(gen.tuple(gens));
  var forall = jsc.forall(wrapped, function(vals) { return fun.apply(null, vals); });
  forall.gens = gens;
  forall.fun = fun;
  forall.wrapped = wrapped;
  return forall;
}

function assertAll(props, opts) {
  for (var prop in props) {
    console.info("Testing " + prop);
    jsc.assert(props[prop], opts);
  }
  console.info("Done");
}

gen.value = function () {
  return {
    arbitrary: function(size) {
      var i = jsc._.random(-size, size);
      return (jsc._.random(0,1) === 0) ? i.toString() : i;
    },
    randomShrink: function(value) {
      if (typeof(value) === 'string') {
        var asInt = parseInt(value);
        if ((jsc._.random(0,1) === 0) && !isNaN(asInt)) {
          return asInt;
        } else if (value === "") {
          throw new Unshrinkable();
        }
        else {
          return value.slice(0, value.length - 1);
        }
      } else {
        if (value === 0) {
          throw new Unshrinkable();
        } else {
          return jsc._.random((1-value),(value-1));
        }
      }
    },
    show: JSON.stringify,
  };
};

gen.eav = function() {
  return gen.array(gen.value(), 3);
};

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

var solverProps = {
  selfJoin: forall(gen.array(gen.eav()),
                     function (facts) {
                       var input = Memory.empty();
                       var constraint0 = new MemoryConstraint([0,1,2]);
                       var constraint1 = new MemoryConstraint([0,1,2]);
                       var flow = new Flow(Solver.fresh(3, [constraint0, constraint1]), [new Sink([0,1,2], [null,null,null])]);
                       var input = input.update(facts, []);
                       var output = flow.update(input, Memory.empty());
                       return memoryEqual(input, output);
                     }),

  productJoin: forall(gen.array(gen.eav()),
                     function (facts) {
                       var input = Memory.empty();
                       var constraint0 = new MemoryConstraint([0,1,2]);
                       var constraint1 = new MemoryConstraint([3,4,5]);
                       var flow = new Flow(Solver.fresh(6, [constraint0, constraint1]), [new Sink([0,1,2,3,4,5], [null,null,null,null,null,null])]);
                       var input = input.update(facts, []);
                       var output = flow.update(input, Memory.empty());
                       var expectedFacts = [];
                       for (var i = 0; i < facts.length; i++) {
                         for (var j = 0; j < facts.length; j++) {
                           expectedFacts.push(facts[i].concat(facts[j]));
                         }
                       }
                       return memoryEqual(Memory.fromFacts(expectedFacts), output);
                     }),

  constantJoin: forall(gen.array(gen.eav()), gen.value(),
                       function (facts, constant) {
                         var input = Memory.empty();
                         var constraint0 = new MemoryConstraint([0,null,1],[null,constant,null]);
                         var constraint1 = new MemoryConstraint([2,3,4]);
                         var flow = new Flow(Solver.fresh(5, [constraint0, constraint1]), [new Sink([0,1,2,3,4], [null,null,null,null,null])]);
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
                       }),

  incrementalConstantJoin: forall(gen.array(gen.eav()), gen.value(), gen.array(gen.eav()), gen.array(gen.eav()),
                                  function (facts, constant, adds, dels) {
                                    var input = Memory.empty();
                                    var constraint0 = new MemoryConstraint([0,null,1],[null,constant,null]);
                                    var constraint1 = new MemoryConstraint([2,3,4]);
                                    var incrementalFlow = new Flow(Solver.fresh(5, [constraint0, constraint1]), [new Sink([0,1,2,3,4], [null,null,null,null,null])]);
                                    var batchFlow = new Flow(Solver.fresh(5, [constraint0, constraint1]), [new Sink([0,1,2,3,4], [null,null,null,null,null])]);
                                    var incrementalOutput = Memory.empty();
                                    var batchOutput = Memory.empty();

                                    input = input.update(facts, []);
                                    incrementalOutput = incrementalFlow.update(input, incrementalOutput);

                                    input = input.update(adds, dels);
                                    batchOutput = batchFlow.update(input, batchOutput);
                                    incrementalOutput = incrementalFlow.update(input, incrementalOutput);

                                    return memoryEqual(incrementalOutput, batchOutput);
                                  }),

  actualJoin: forall(gen.array(gen.eav()),
                       function (facts) {
                         var input = Memory.empty();
                         var constraint0 = new MemoryConstraint([0,1,2]);
                         var constraint1 = new MemoryConstraint([2,3,4]);
                         var flow = new Flow(Solver.fresh(5, [constraint0, constraint1]), [new Sink([0,1,2,3,4], [null,null,null,null,null])]);
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
                       }),

  incrementalActualJoin: forall(gen.array(gen.eav()), gen.array(gen.eav()), gen.array(gen.eav()),
                                  function (facts, adds, dels) {
                                    var input = Memory.empty();
                                    var constraint0 = new MemoryConstraint([0,1,2]);
                                    var constraint1 = new MemoryConstraint([2,3,4]);
                                    var incrementalFlow = new Flow(Solver.fresh(5, [constraint0, constraint1]), [new Sink([0,1,2,3,4], [null,null,null,null,null])]);
                                    var batchFlow = new Flow(Solver.fresh(5, [constraint0, constraint1]), [new Sink([0,1,2,3,4], [null,null,null,null,null])]);
                                    var incrementalOutput = Memory.empty();
                                    var batchOutput = Memory.empty();

                                    input = input.update(facts, []);
                                    incrementalOutput = incrementalFlow.update(input, incrementalOutput);

                                    input = input.update(adds, dels);
                                    batchOutput = batchFlow.update(input, batchOutput);
                                    incrementalOutput = incrementalFlow.update(input, incrementalOutput);

                                    return memoryEqual(incrementalOutput, batchOutput);
                                  }),

//   functionJoin: forall(gen.array(gen.eav()),
//                        function (facts) {
//                          var input = Memory.empty();
//                          var constraint0 = new MemoryConstraint([0,1,2]);
//                          var constraint1 = new MemoryConstraint([3,4,5]);
//                          var filter0 = new FunctionFilter(function (x) { return x + 1;}, [2], 3);
//                          var flow = new Flow(Solver.fresh(6, [constraint0, constraint1], [filter0]), [new Sink([0,1,2,3,4,5], [null,null,null,null,null,null])]);
//                          var input = input.update(facts, []);
//                          var output = flow.update(input, Memory.empty());
//                          var expectedFacts = [];
//                          for (var i = 0; i < facts.length; i++) {
//                            for (var j = 0; j < facts.length; j++) {
//                              var fact = facts[i].concat(facts[j]);
//                              if (fact[2] + 1 === fact[3]) {
//                                expectedFacts.push(fact);
//                              }
//                            }
//                          }
//                          return memoryEqual(Memory.fromFacts(expectedFacts), output);
//                        }),

//   incrementalFunctionJoin: forall(gen.array(gen.eav()), gen.array(gen.eav()), gen.array(gen.eav()),
//                                   function (facts, adds, dels) {
//                                     var input = Memory.empty();
//                                     var constraint0 = new MemoryConstraint([0,1,2]);
//                                     var constraint1 = new MemoryConstraint([3,4,5]);
//                                     var filter0 = new FunctionFilter(function (x) { return x + 1;}, [2], 3);
//                                     var incrementalFlow = new Flow(Solver.fresh(6, [constraint0, constraint1], [filter0]), [new Sink([0,1,2,3,4,5], [null,null,null,null,null,null])]);
//                                     var batchFlow = new Flow(Solver.fresh(6, [constraint0, constraint1], [filter0]), [new Sink([0,1,2,3,4,5], [null,null,null,null,null,null])]);
//                                     var incrementalOutput = Memory.empty();
//                                     var batchOutput = Memory.empty();

//                                     input = input.update(facts, []);
//                                     incrementalOutput = incrementalFlow.update(input, incrementalOutput);

//                                     input = input.update(adds, dels);
//                                     batchOutput = batchFlow.update(input, batchOutput);
//                                     incrementalOutput = incrementalFlow.update(input, incrementalOutput);

//                                     return memoryEqual(incrementalOutput, batchOutput);
//                                   }),

  negatedJoin: forall(gen.array(gen.eav()),
                     function (facts) {
                       var input = Memory.empty();
                       var constraint0 = new MemoryConstraint([0,1,2]);
                       var constraint1 = new NegatedMemoryConstraint([2,null,null], [null,null,null]);
                       var flow = new Flow(Solver.fresh(3, [constraint1, constraint0], [constraint1]), [new Sink([0,1,2], [null,null,null])]);
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
                     }),

  incrementalNegatedJoin: forall(gen.array(gen.eav()), gen.array(gen.eav()), gen.array(gen.eav()),
                                  function (facts, adds, dels) {
                                    var input = Memory.empty();
                                    var constraint0 = new MemoryConstraint([0,1,2]);
                                    var constraint1 = new NegatedMemoryConstraint([2,null,null], [null,null,null]);
                                    var incrementalFlow = new Flow(Solver.fresh(3, [constraint1, constraint0], [constraint1]), [new Sink([0,1,2], [null,null,null])]);
                                    var batchFlow = new Flow(Solver.fresh(3, [constraint1, constraint0], [constraint1]), [new Sink([0,1,2], [null,null,null])]);
                                    var incrementalOutput = Memory.empty();
                                    var batchOutput = Memory.empty();

                                    input = input.update(facts, []);
                                    incrementalOutput = incrementalFlow.update(input, incrementalOutput);

                                    input = input.update(adds, dels);
                                    batchOutput = batchFlow.update(input, batchOutput);
                                    incrementalOutput = incrementalFlow.update(input, incrementalOutput);

                                    return memoryEqual(incrementalOutput, batchOutput);
                                  })
};

// assertAll(solverProps, {tests: 5000});

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

// compiledPathTest();

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
                       ["functionInput", "valveXY", "idFunction"],
                       ["functionOutput", "valveZ", "idFunction"]];

  var system = compileSystem(Memory.fromFacts(compilerSchema.concat(compilerFacts)));
  system.memory = Memory.empty();

  var facts = [["foo", 2, 3, 5],
               ["foo", 2, 4, 7]];
  system.update(facts, []);

  var derivedFacts = [["bar", 5]];
  var expectedFacts = facts.concat(derivedFacts);

  memoryEqual(system.memory, Memory.fromFacts(expectedFacts));
}

// compiledFunctionTest();

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

// compiledNegationTest();

// BENCHMARKS

function soFast(n) {
  var constraint0 = new MemoryConstraint([0,1,2]);
  var constraint1 = new MemoryConstraint([0,1,2]);
  var sink0 = new Sink([0,1,2], [null,null,null]);
  var solver = Solver.fresh(3, [constraint0, constraint1]);
  var flow = new Flow(solver, [sink0]);

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

  console.info("Regions: " + solver.provenance.regions.length);

  return output;
}

// soFast(100000);

function soSlow(n) {
  var constraint0 = new MemoryConstraint([0,1,2]);
  var constraint1 = new MemoryConstraint([0,1,2]);
  var sink0 = new Sink([0,1,2], [null,null,null]);
  var solver = Solver.fresh(3, [constraint0, constraint1]);
  var flow = new Flow(solver, [sink0]);

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

  console.info("Regions: " + solver.provenance.regions.length);

  return output;
}

// soSlow(10000);
