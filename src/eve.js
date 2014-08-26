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

function fillArray(arr, fill) {
  for(var i = 0; i < arr.length; i++) {
    arr[i] = fill;
  }
}

function readFrom(ixes, local, remote) {
  var len = ixes.length;
  assert(len === local.length);
  for (var i = 0; i < len; i++) {
    var ix = ixes[i];
    if (ix !== null) local[i] = remote[ix];
  }
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

function containsPoint(los, his, point) {
  var len = los.length;
  assert(len === his.length);
  assert(len === point.length);
  for (var i = 0; i < len; i++) {
    if ((compareValue(point[i], los[i]) === -1) || compareValue(point[i], his[i]) !== -1) {
      return false;
    }
  }
  return true;
}

function containsVolume(los, his, innerLos, innerHis) {
  var len = los.length;
  assert(len === his.length);
  assert(len === innerLos.length);
  assert(len === innerHis.length);
  for (var i = 0; i < len; i++) {
    if ((compareValue(innerLos[i], los[i]) === -1) || compareValue(innerHis[i], his[i]) === 1) {
      return false;
    }
  }
  return true;
}

function intersectsVolume(losA, hisA, losB, hisB) {
  var len = losA.length;
  assert(len === hisA.length);
  assert(len === losB.length);
  assert(len === hisB.length);
  for (var i = 0; i < len; i++) {
    if ((compareValue(losA[i], hisB[i]) !== -1) || compareValue(losB[i], hisA[i]) !== -1) {
      return false;
    }
  }
  return true;
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
      if ((constant !== null) && (point[i] !== constants[i])) return false;
    } else {
      if (compareValue(point[i], los[ix]) === -1) return false;
      if (compareValue(point[i], his[ix]) !== -1) return false;
    }
  }
  return true;
}

// PROVENANCE
// covers the solution space with proofs of success/failure
// tracks dirty proofs when memory changes

function Region(los, his, proof, solution) {
  this.los = los;
  this.his = his;
  this.proof = proof; // index of constraint that prooves this region, -1 to indicate all constraints
  this.solution = solution;
}

function regionContainsPoint(region, constraints, point) {
  var los = region.los;
  var his = region.his;
  var proof = region.proof;
  if (proof === -1) {
    for (var proof = constraints.length - 1; proof >= 0; proof--) {
      var constraint = constraints[proof];
      var ixes = constraint.ixes;
      var constants = constraint.constants;
      if ((ixes !== undefined) && boundsContainsPoint(los, his, ixes, constants, point)) return true;
    }
    return false;
  } else {
    var constraint = constraints[proof];
    var ixes = constraint.ixes;
    var constants = constraint.constants;
    return boundsContainsPoint(los, his, ixes, constants, point);
  }
}

function Provenance(memory, numVars, constraints, regions, queuedRegions) {
  this.memory = memory;
  this.numVars = numVars;
  this.constraints = constraints;
  this.regions = regions;
  this.queuedRegions = queuedRegions;
}

function ProvenanceConstraint(regions) {
  this.regions = regions;
}

Provenance.empty = function(numVars, constraints) {
  var region = new Region(makeArray(numVars, least), makeArray(numVars, greatest), 1, null);
  return new Provenance(Memory.empty(), numVars, constraints, [region], []);
};

Provenance.prototype = {
  add: function(region) {
    this.queuedRegions.push(region);
  },

  start: function (memory, outputDels) {
    var dirtyPoints = [];
    memory.diff(this.memory, dirtyPoints, dirtyPoints);
    this.memory = memory;

    var constraints = this.constraints;

    var delledRegions = [];
    var regions = this.regions;
    nextRegion: for (var i = regions.length - 1; i >= 0; i--) {
      var region = regions[i];
      for (var j = dirtyPoints.length - 1; j >= 0; j--) {
        var dirtyPoint = dirtyPoints[j];
        if (regionContainsPoint(region, constraints, dirtyPoint) === true) {
          regions.splice(i, 1);
          delledRegions.push(region);
          if (region.solution !== null) outputDels.push(region.solution);
          continue nextRegion;
        }
      }
    }

    if (delledRegions.length === 0) {
      return null;
    } else {
      return new ProvenanceConstraint(delledRegions);
    }
  },

  finish: function(outputAdds, outputDels) {
    var oldRegions = this.regions;
    var newRegions = this.queuedRegions;

    nextOldRegion: for (var i = oldRegions.length - 1; i >= 0; i--) {
      var oldRegion = oldRegions[i];
      var oldLos = oldRegion.los;
      var oldHis = oldRegion.his;
      var oldSolution = oldRegion.solution;
      nextNewRegion: for (var j = newRegions.length - 1; j >= 0; j--) {
        var newRegion = newRegions[j];
        var newLos = newRegion.los;
        var newHis = newRegion.his;
        var newSolution = newRegion.solution;
        if (intersectsVolume(oldLos, oldHis, newLos, newHis)) {
          if (containsVolume(oldLos, oldHis, newLos, newHis)) {
            // console.log("Evicting new " + JSON.stringify(newRegion) + " by " + JSON.stringify(oldRegion));
            newRegions.slice(j, 1);
            continue nextNewRegion;
          } else if (containsVolume(newLos, newHis, oldLos, oldHis)) {
            // console.log("Evicting old " + JSON.stringify(oldRegion) + " by " + JSON.stringify(newRegion));
            oldRegions.slice(i, 1);
            if (oldSolution !== null) outputDels.push(oldSolution);
            continue nextOldRegion;
          } else if ((oldSolution !== null) && containsPoint(newLos, newHis, oldSolution)) {
            // console.log("Overwriting " + JSON.stringify(oldRegion) + " by " + JSON.stringify(newRegion));
            oldRegion.solution = null;
            outputDels.push(oldSolution);
          } else if ((newSolution !== null) && containsPoint(oldLos, oldHis, newSolution)) {
            assert(false); // the solver should not generate solutions that are contained by non-dirty regions
          }
        }
      }
    }

    // console.log("Adding new regions " + JSON.stringify(newRegions));
    for (var i = newRegions.length - 1; i >= 0; i--) {
      var newRegion = newRegions[i];
      oldRegions.push(newRegion);
      if (newRegion.solution !== null) outputAdds.push(newRegion.solution);
    }

    this.queuedRegions = [];
  }
};

ProvenanceConstraint.prototype = {
  copy: function() {
    return new ProvenanceConstraint(this.regions.slice());
  },

  propagate: function(solverState) {
    var regions = this.regions;
    var los = solverState.los;
    var his = solverState.his;

    for (var i = regions.length - 1; i >= 0; i--) {
      var region = regions[i];
      if (intersectsVolume(los, his, region.los, region.his) === false) {
        regions.splice(i, 1);
      }
    }

    if (regions.length === 0) {
      // console.log("Failed with no regions");
      solverState.isFailed = true;
      return true;
    }

    var changed = false;

    for (var i = this.numVars - 1; i >= 0; i--) {
      var newLo = greatest;
      for (var j = regions.length - 1; j >= 0; j--) {
        var regionLo = regions[j][i];
        if (compareValue(regionLo, newLo) === -1) newLo = regionLo;
      }
      if (compareValue(newLo, los[i]) === 1) {
        los[i] = newLo;
        changed = true;
      }
    }

    return changed;
  },

//   split: function(leftSolverState, rightSolverState) {
//     var regions = this.regions;
//     if (regions.length < 2) {
//       return false;
//     } else {
//       // TODO this split algorithm can sometimes fail to change the right-hand state
//       var regionIx = Math.floor(Math.random() * regions.length);
//       var i = Math.floor(Math.random() * this.numVars);
//       var pivot = regions[regionIx].los[i];
//       // console.log("Split at region[" + i + "]=" + pivot);
//       leftSolverState.his[i] = pivot;
//       rightSolverState.los[i] = pivot;
//       return true;
//     }
//   }
};

// MEMORY
// track a multi-set of facts
// supports bounds refinement

function Memory(facts) {
  this.facts = facts;
}

function MemoryConstraint(ixes, constants, facts) {
  this.ixes = ixes;
  this.constants = constants;
  this.facts = facts;
}

Memory.empty = function() {
  return new Memory([]);
};

Memory.fromFacts = function(facts) {
  return new Memory(facts.slice());
};

MemoryConstraint.fresh = function(ixes, constants) {
  var facts = [];
  return new MemoryConstraint(ixes, constants, facts);
};

Memory.prototype = {
  update: function(adds, dels) {
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
    var oldFacts = oldTree.facts;
    var newFacts = this.facts;
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
  },
};

MemoryConstraint.prototype = {
  reset: function(memory) {
    var ixes = this.ixes;
    var facts = [];
    memory.diff(Memory.empty(), facts, []); // crude deduping
    for (var i = facts.length - 1; i >= 0; i--) {
      if (facts[i].length !== ixes.length) {
        facts.splice(i, 1);
      }
    }
    this.facts = facts;
  },

  copy: function() {
    return new MemoryConstraint(this.ixes, this.constants, this.facts.slice());
  },

  propagate: function(solverState, myIx) {
    var ixes = this.ixes;
    var constants = this.constants;
    var facts = this.facts;
    var los = solverState.los;
    var his = solverState.his;
    var provenance = solverState.provenance;

    for (var i = facts.length - 1; i >= 0; i--) {
      var fact = facts[i];
      if (boundsContainsPoint(los, his, ixes, constants, fact) === false) {
        facts.splice(i, 1);
      }
    }

    if (facts.length === 0) {
      // console.log("Failed with no facts");
      solverState.isFailed = true;
      provenance.add(new Region(los.slice(), his.slice(), myIx, null));
      return true;
    }

    var changed = false;

    for (var i = ixes.length - 1; i >= 0; i--) {
      var newLo = greatest;
      for (var j = facts.length - 1; j >= 0; j--) {
        var value = facts[j][i];
        if (compareValue(value, newLo) === -1) newLo = value;
      }
      var ix = ixes[i];
      if (compareValue(newLo, los[ix]) === 1) {
        var regionLos = los.slice();
        var regionHis = his.slice();
        los[ix] = newLo;
        regionHis[ix] = newLo;
        provenance.add(new Region(regionLos, regionHis, myIx, null));
        changed = true;
      }
    }

    return changed;
  },

  split: function(leftSolverState, rightSolverState) {
    var facts = this.facts;
    if (facts.length < 2) {
      return false;
    } else {
      var los = leftSolverState.los;
      var ixes = this.ixes;
      for (var i = ixes.length - 1; i >= 0; i--) {
        var ix = ixes[i];
        if (ix !== null) {
          for (var j = facts.length - 1; j >= 0; j--) {
            var pivot = facts[j][i];
            if (pivot !== los[ix]) {
              leftSolverState.his[ix] = pivot;
              rightSolverState.los[ix] = pivot;
              // console.log("Split at fact[" + i + "]=" + pivot);
              return true;
            }
          }
        }
      }
      assert(false); // if there are > 1 facts then we must have some value > los
    }
  }
};

// FUNCTIONS

function FunctionFilter(fun, inIxes, outIx) {
  this.fun = fun;
  this.inIxes = inIxes;
  this.outIx = outIx;
  this.inValues = makeArray(inIxes.length, null);
}

FunctionFilter.prototype = {
  propagate: function(solverState, solution) {
    var los = solverState.los;
    var his = solverState.his;
    var inIxes = this.inIxes;
    var outIx = this.outIx;
    var inValues = this.inValues;

    for (var i = inIxes.length - 1; i >= 0; i--) {
      inValues[i] = solution[inIxes[i]];
    }

    var newValue = this.fun.apply(null, inValues);
    var oldValue = solution[outIx];
    if (compareValue(newValue, los[outIx]) === -1) solverState.isFailed = true;
    else if (compareValue(newValue, his[outIx]) !== -1) solverState.isFailed = true;
    else if ((oldValue !== null) && (newValue !== oldValue)) solverState.isFailed = true;
    else solution[outIx] = newValue;
  }
};

// SOLVER

function SolverState(provenance, constraints, los, his, isFailed) {
  this.provenance = provenance;
  this.constraints = constraints;
  this.los = los;
  this.his = his;
  this.isFailed = isFailed;
}

SolverState.prototype = {
  propagate: function() {
    var constraints = this.constraints;
    var numConstraints = this.constraints.length;
    var lastChanged = 0;
    var current = 0;
    while (true) {
      // console.log("Before prop " + current + " " + this.los + " " + this.his);
      if (this.isFailed === true) break;
      var changed = constraints[current].propagate(this, current);
      if (changed === true) lastChanged = current;
      // console.log("After prop " + current + " " + this.los + " " + this.his);
      current = (current + 1) % numConstraints;
      if (current === lastChanged) break;
    }
  },

  split: function() {
    var constraints = this.constraints;
    var leftSolverState = this;
    var rightSolverState = new SolverState(this.provenance, constraints.slice(), this.los.slice(), this.his.slice(), this.isFailed);
    for (var i = constraints.length - 1; i >= 0; i--) {
      var constraint = constraints[i];
      constraints[i] = constraint.copy();
    }
    for (var splitter = constraints.length - 1; splitter >= 1; splitter--) {
      if (constraints[splitter].split(leftSolverState, rightSolverState)) break;
    }
    if (splitter >= 1) {
      // console.log("Split by " + splitter);
      return rightSolverState;
    } else {
      // console.log("No split at " + this.los);
      return null; // found a solution
    }
  }
};

function Solver(numVars, constraints, filters, provenance) {
  this.numVars = numVars;
  this.constraints = constraints;
  this.filters = filters;
  this.provenance = provenance;
}

Solver.fresh = function (numVars, constraints, filters) {
  var provenanceConstraints = constraints.slice();
  provenanceConstraints.unshift({}); // because the provenance constraint will be placed in at 0
  var provenance = Provenance.empty(numVars, provenanceConstraints);
  return new Solver(numVars, constraints, filters, provenance);
};

Solver.prototype = {
  update: function(inputMemory, outputAdds, outputDels) {
    var provenance = this.provenance;

    var provenanceConstraint = provenance.start(inputMemory, outputDels);
    if (provenanceConstraint === null) {
      // no changes
      return false;
    }

    var constraints = this.constraints.slice();
    for (var i = constraints.length - 1; i >= 0; i--) {
      var constraint = constraints[i];
      constraint.reset(inputMemory);
    }
    constraints.unshift(provenanceConstraint);

    var numVars = this.numVars;
    var filters = this.filters;
    var states = [new SolverState(provenance, constraints, makeArray(numVars, least), makeArray(numVars, greatest), false)];
    while (states.length > 0) {
      var state = states.pop();
      state.propagate();
      if (state.isFailed === true) {
        // console.log("Failed");
      } else {
        var rightState = state.split();
        if (rightState === null) {
          var solution = state.los.slice();
          for (var i = filters.length - 1; i >= 0; i--) {
            filters[i].propagate(state, solution);
            if (state.isFailed) break;
          }
          provenance.add(new Region(state.los.slice(), state.his.slice(), -1, state.isFailed ? null : solution));
        } else {
          states.push(state);
          states.push(rightState);
        }
      }
    }

    provenance.finish(outputAdds, outputDels);
    return true;
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
    var isChanged = this.source.update(inputMemory, sourceAdds, sourceDels);

    if (isChanged === false) return outputMemory;

    var sinks = this.sinks;
    var sinkAdds = [];
    var sinkDels = [];
    for (var i = sinks.length - 1; i >= 0; i--) {
      var sink = sinks[i];
      sink.update(sourceAdds, sinkAdds);
      sink.update(sourceDels, sinkDels);
    }

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

     ["schema", "pipe", "pipe", 0],
     ["schema", "pipe", "table", 1],
     ["schema", "pipe", "rule", 2],
     ["schema", "pipe", "sourceOrSink", 3],

     ["schema", "tableConstraint", "valve", 0],
     ["schema", "tableConstraint", "pipe", 1],
     ["schema", "tableConstraint", "field", 2],

     ["schema", "constantConstraint", "valve", 0],
     ["schema", "constantConstraint", "value", 1]];

function dumpMemory(memory) {
  var facts = memory.facts;

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
        labelledFact[fields[j]] = fact[j+1]; // +1 because table is 0
      }
      for (var j = fields.length - 1; j >= 0; j--) {
        var field = fields[j];
        var value = fact[j+1]; // +1 because table is 0
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
  var valveConstants = {};
  for (var i = valves.length - 1; i >= 0; i--) {
    var valve = valves[i];
    var constantConstraints = dump.constantConstraint.valve[valve.valve] || [];
    if (constantConstraints.length > 1) assert(false);
    if (constantConstraints.length === 1) {
      valves.slice(i);
      valveConstants[valve.valve] = constantConstraints[0].value;
    }
  }
  var valveIxes = {};
  for (var i = valves.length - 1; i >= 0; i--) {
    valveIxes[valves[i].valve] = i;
  }

  var pipes = dump.pipe.rule[rule] || [];
  var constraints = [];
  var sinks = [];
  for (var i = pipes.length - 1; i >= 0; i--) {
    var pipe = pipes[i];
    var tableConstraints = dump.tableConstraint.pipe[pipe.pipe] || [];
    var fields = dump.schema.table[pipe.table] || [];
    var ixes = makeArray(fields.length + 1, null); // +1 because table is 0
    var constants = makeArray(fields.length + 1, null); // +1 because table is 0
    constants[0] = pipe.table;
    for (var j = tableConstraints.length - 1; j >= 0; j--) {
      var tableConstraint = tableConstraints[j];
      var fieldIx = dump.schema.field[tableConstraint.field][0].ix;
      var valveIx = valveIxes[tableConstraint.valve];
      var constant = valveConstants[tableConstraint.valve];
      if (constant === undefined) {
        ixes[fieldIx + 1] = valveIx; // +1 because table is 0
      } else {
        constants[fieldIx + 1] = constant; // +1 because table is 0
      }
    }
    if (pipe.sourceOrSink === "source") {
      constraints.push(MemoryConstraint.fresh(ixes, constants));
    } else if (pipe.sourceOrSink === "sink") {
      sinks.push(new Sink(ixes, constants));
    } else assert(false);
  }

  return new Flow(Solver.fresh(valves.length, constraints, []), sinks);
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
                       var constraint0 = MemoryConstraint.fresh([0,1,2]);
                       var constraint1 = MemoryConstraint.fresh([0,1,2]);
                       var flow = new Flow(Solver.fresh(3, [constraint0, constraint1], []), [new Sink([0,1,2], [null,null,null])]);
                       var input = input.update(facts, []);
                       var output = flow.update(input, Memory.empty());
                       return memoryEqual(input, output);
                     }),

  productJoin: forall(gen.array(gen.eav()),
                     function (facts) {
                       var input = Memory.empty();
                       var constraint0 = MemoryConstraint.fresh([0,1,2]);
                       var constraint1 = MemoryConstraint.fresh([3,4,5]);
                       var flow = new Flow(Solver.fresh(6, [constraint0, constraint1], []), [new Sink([0,1,2,3,4,5], [null,null,null,null,null,null])]);
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
                         var constraint0 = MemoryConstraint.fresh([0,null,1],[null,constant,null]);
                         var constraint1 = MemoryConstraint.fresh([2,3,4]);
                         var flow = new Flow(Solver.fresh(5, [constraint0, constraint1], []), [new Sink([0,1,2,3,4], [null,null,null,null,null])]);
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
                                    var constraint0 = MemoryConstraint.fresh([0,null,1],[null,constant,null]);
                                    var constraint1 = MemoryConstraint.fresh([2,3,4]);
                                    var incrementalFlow = new Flow(Solver.fresh(5, [constraint0, constraint1], []), [new Sink([0,1,2,3,4], [null,null,null,null,null])]);
                                    var batchFlow = new Flow(Solver.fresh(5, [constraint0, constraint1], []), [new Sink([0,1,2,3,4], [null,null,null,null,null])]);
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
                         var constraint0 = MemoryConstraint.fresh([0,1,2]);
                         var constraint1 = MemoryConstraint.fresh([2,3,4]);
                         var flow = new Flow(Solver.fresh(5, [constraint0, constraint1], []), [new Sink([0,1,2,3,4], [null,null,null,null,null])]);
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
                                    var constraint0 = MemoryConstraint.fresh([0,1,2]);
                                    var constraint1 = MemoryConstraint.fresh([2,3,4]);
                                    var incrementalFlow = new Flow(Solver.fresh(5, [constraint0, constraint1], []), [new Sink([0,1,2,3,4], [null,null,null,null,null])]);
                                    var batchFlow = new Flow(Solver.fresh(5, [constraint0, constraint1], []), [new Sink([0,1,2,3,4], [null,null,null,null,null])]);
                                    var incrementalOutput = Memory.empty();
                                    var batchOutput = Memory.empty();

                                    input = input.update(facts, []);
                                    incrementalOutput = incrementalFlow.update(input, incrementalOutput);

                                    input = input.update(adds, dels);
                                    batchOutput = batchFlow.update(input, batchOutput);
                                    incrementalOutput = incrementalFlow.update(input, incrementalOutput);

                                    return memoryEqual(incrementalOutput, batchOutput);
                                  }),

    functionJoin: forall(gen.array(gen.eav()),
                     function (facts) {
                       var input = Memory.empty();
                       var constraint0 = MemoryConstraint.fresh([0,1,2]);
                       var constraint1 = MemoryConstraint.fresh([3,4,5]);
                       var filter0 = new FunctionFilter(function (x) { return x + 1;}, [2], 3);
                       var flow = new Flow(Solver.fresh(6, [constraint0, constraint1], [filter0]), [new Sink([0,1,2,3,4,5], [null,null,null,null,null,null])]);
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
                     }),
};

solverProps.functionJoin.fun([[1,0,0]]);

// assertAll(solverProps, {tests: 5000});

// COMPILER TESTS

function compiledPathTest() {
  var compilerFacts = [["schema", "edge", "edgeX", 0],
                       ["schema", "edge", "edgeY", 1],
                       ["schema", "path", "pathX", 0],
                       ["schema", "path", "pathY", 1],

                       ["valve", "edgeA", "edgeRule"],
                       ["valve", "edgeB", "edgeRule"],
                       ["pipe", "edgeEdgePipe", "edge", "edgeRule", "source"],
                       ["pipe", "edgePathPipe", "path", "edgeRule", "sink"],
                       ["tableConstraint", "edgeA", "edgeEdgePipe", "edgeX"],
                       ["tableConstraint", "edgeB", "edgeEdgePipe", "edgeY"],
                       ["tableConstraint", "edgeA", "edgePathPipe", "pathX"],
                       ["tableConstraint", "edgeB", "edgePathPipe", "pathY"],

                       ["valve", "pathA", "pathRule"],
                       ["valve", "pathB", "pathRule"],
                       ["valve", "pathC", "pathRule"],
                       ["pipe", "pathEdgePipe", "edge", "pathRule", "source"],
                       ["pipe", "pathPathSourcePipe", "path", "pathRule", "source"],
                       ["pipe", "pathPathSinkPipe", "path", "pathRule", "sink"],
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

// BENCHMARKS

function soFast(n) {
  var constraint0 = MemoryConstraint.fresh([0,1,2]);
  var constraint1 = MemoryConstraint.fresh([0,1,2]);
  var sink0 = new Sink([0,1,2], [null,null,null]);
  var solver = Solver.fresh(3, [constraint0, constraint1], []);
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
  var constraint0 = MemoryConstraint.fresh([0,1,2]);
  var constraint1 = MemoryConstraint.fresh([0,1,2]);
  var sink0 = new Sink([0,1,2], [null,null,null]);
  var solver = Solver.fresh(3, [constraint0, constraint1], []);
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
