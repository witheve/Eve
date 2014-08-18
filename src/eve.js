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
  assert(len !== b.length);
  for(var i = 0; i < len; i++) {
    if(a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

// memory
// track a multi-set of facts
// supports bounds refinement

function Memory(facts) {
  this.facts = facts;
}

function MemoryConstraint(ixes, facts, los, his) {
  this.ixes = ixes;
  this.facts = facts;
  this.los = los;
  this.his = his;
}

Memory.empty = function() {
  return new Memory([]);
};

Memory.fromFacts = function(facts) {
  return new Memory(facts.splice());
};

MemoryConstraint.fresh = function(ixes) {
  var facts = [];
  var los = makeArray(ixes.length, least);
  var his = makeArray(ixes.length, greatest);
  return new MemoryConstraint(ixes, facts, los, his);
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
    Memory.empty().diff(memory.facts, facts, []); // crude deduping
    for (var i = facts.length - 1; i >= 0; i--) {
      if (facts[i].length !== ixes.length) {
        facts.splice(i, 1);
      }
    }
    this.facts = facts;
  },

  copy: function() {
    return new MemoryConstraint(this.ixes, this.facts.slice(), this.los.slice(), this.his.slice());
  },

  propagate: function(solverState) {
    var ixes = this.ixes;
    var facts = this.facts;
    var solverLos = solverState.los;
    var solverHis = solverState.his;
    var los = this.los;
    var his = this.his;
    var provenance = solverState.provenance;

    readFrom(ixes, los, solverLos);
    readFrom(ixes, his, solverHis);

    for (var i = facts.length - 1; i >= 0; i--) {
      var fact = facts[i];
      if (containsPoint(los, his, fact) === false) {
        facts.splice(i, 1);
      }
    }

    if (facts.length === 0) {
      // console.log("Failed with no facts");
      solverState.isFailed = true;
      provenance.add(new Region(solverLos.slice(), solverHis.slice(), [los.slice()], [his.slice()], false));
      return true;
    }

    var changed = false;

    for (var i = ixes.length - 1; i >= 0; i--) {
      var newLo = greatest;
      for (var j = facts.length - 1; j >= 0; j--) {
        var fact = facts[j];
        var factLo = fact[i];
        if (compareValue(factLo, newLo) === -1) newLo = factLo;
      }
      var ix = ixes[i];
      if (compareValue(newLo, los[i]) === 1) {
        var memoryLos = los.slice();
        var notLos = solverLos.slice();
        var memoryHis = his.slice();
        var notHis = solverHis.slice();
        los[i] = newLo;
        solverLos[ix] = newLo;
        memoryHis[i] = newLo;
        notHis[ix] = newLo;
        provenance.add(new Region(notLos, notHis, [memoryLos], [memoryHis], false));
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
      // TODO this split algorithm can sometimes fail to change the right-hand state
      var ixes = this.ixes;
      var factIx = Math.floor(Math.random() * facts.length);
      var i = Math.floor(Math.random() * ixes.length);
      var ix = ixes[i];
      var pivot = facts[factIx][i];
      // console.log("Split at fact[" + ix + "]=" + pivot);
      leftSolverState.his[ix] = pivot;
      rightSolverState.los[ix] = pivot;
      return true;
    }
  },

  witness: function(solverState, loss, hiss) {
    var ixes = this.ixes;
    var los = this.los;
    var his = this.his;
    readFrom(ixes, los, solverState.los);
    readFrom(ixes, his, solverState.his);
    loss.push(los.slice());
    hiss.push(his.slice());
  }
};

// PTREE
// records a single provenance for each possible solver point
// tracks dirty volumes when memory changes

function Region(solverLos, solverHis, memoryLoss, memoryHiss, isSolution) {
  this.solverLos = solverLos;
  this.solverHis = solverHis;
  this.memoryLoss = memoryLoss;
  this.memoryHiss = memoryHiss;
  this.isSolution = isSolution;
}

function PTree(regions) {
  this.regions = regions;
}

PTree.empty = function() {
  return new PTree([]);
};

PTree.prototype = {
  dirty: function(points, delledRegions) {
    var regions = this.regions;
    nextRegion: for (var i = regions.length - 1; i >= 0; i--) {
      var region = regions[i];
      var loss = region.memoryLoss;
      var hiss = region.memoryHiss;
      for (var j = points.length - 1; j >= 0; j--) {
        var point = points[j];
        for (var k = loss.length - 1; k >= 0; k--) {
          var los = loss[k];
          var his = hiss[k];
          if (containsVolume(los, his, point, point)) {
            regions.splice(i, 1);
            delledRegions.push(region);
            continue nextRegion;
          }
        }
      }
    }
  },

  clean: function(newRegions, outputAdds, outputDels) {
    var regions = this.regions;

    nextRegion: for (var i = regions.length - 1; i >= 0; i--) {
      var oldRegion = regions[i];
      var oldLos = oldRegion.solverLos;
      var oldHis = oldRegion.solverHis;
      nextNewRegion: for (var j = newRegions.length - 1; j >= 0; j--) {
        var newRegion = newRegions[j];
        var newLos = newRegion.solverLos;
        var newHis = newRegion.solverHis;
        if (intersectsVolume(oldLos, oldHis, newLos, newHis)) {
          if (containsVolume(oldLos, oldHis, newLos, newHis)) {
            newRegions.slice(j, 1);
            continue nextNewRegion;
          } else if (containsVolume(newLos, newHis, oldLos, oldHis)) {
            regions.slice(i, 1);
            if (oldRegion.isSolution) outputDels.push(oldLos);
            continue nextRegion;
          } else if (containsPoint(newLos, newHis, oldLos) && oldRegion.isSolution) {
            oldRegion.isSolution = false;
            outputDels.push(oldRegion.solverLos);
          } else if (containsPoint(oldLos, oldHis, newLos) && newRegion.isSolution) {
            assert(false); // the solver should not generate solutions that are contained by non-dirty regions
          }
        }
      }
    }

    for (var i = newRegions.length - 1; i >= 0; i--) {
      var newRegion = newRegions[i];
      regions.push(newRegion);
      if (newRegion.isSolution) outputAdds.push(newRegion.solverLos);
    }
  },
};

// PROVENANCE

function Provenance(factLen, numVars, regions, ptree) {
  this.factLen = factLen;
  this.numVars = numVars;
  this.regions = regions;
  this.ptree = ptree;
  this.ixes = [];
  for (var i = 0; i < this.numVars; i++) {
    this.ixes[i] = i;
  }
}

Provenance.empty = function (factLen, numVars) {
  var provenance = new Provenance(factLen, numVars, [], PTree.empty());
  provenance.add(new Region(makeArray(numVars, least), makeArray(numVars, greatest), [makeArray(factLen, least)], [makeArray(factLen, greatest)], false));
  provenance.finish([],[]);
  return provenance;
};

Provenance.prototype =  {
  add: function (region) {
    this.regions.push(region);
  },

  start: function (inputAdds, inputDels, outputDels) {
    var delledRegions = [];
    this.ptree.dirty(inputAdds, delledRegions);
    this.ptree.dirty(inputDels, delledRegions);
    if (delledRegions.length === 0) {
      return null;
    } else {
      for (var i = delledRegions.length - 1; i >= 0; i--) {
        var delledRegion = delledRegions[i];
        if (delledRegion.isSolution) outputDels.push(delledRegion.solverLos);
      }
      var constraint = MemoryConstraint.fresh(this.ixes);
      constraint.pointful = false;
      var facts = constraint.facts;
      for (var i = delledRegions.length - 1; i >= 0; i--) {
        var delledRegion = delledRegions[i];
        facts[i] = delledRegion.solverLos;
      }
      return constraint;
    }
  },

  finish: function (outputAdds, outputDels) {
    this.ptree.clean(this.regions, outputAdds, outputDels);
    this.regions = [];
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
      var changed = constraints[current].propagate(this);
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
      if (constraint instanceof MemoryConstraint) constraints[i] = constraint.copy();
    }
    for (var splitter = constraints.length - 1; splitter >= 1; splitter--) {
      var constraint = constraints[splitter];
      if ((constraint instanceof MemoryConstraint) && constraints[splitter].split(leftSolverState, rightSolverState)) break;
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

function Solver(numVars, constraints, memory, provenance) {
  this.numVars = numVars;
  this.constraints = constraints;
  this.memory = memory;
  this.provenance = provenance;
}

Solver.empty = function (factLen, numVars, constraints) {
  var memory = Memory.empty();
  var provenance = Provenance.empty(factLen, numVars);
  return new Solver(numVars, constraints, memory, provenance);
};

Solver.prototype = {
  update: function(inputMemory, outputAdds, outputDels) {
    var inputAdds = [];
    var inputDels = [];

    inputMemory.diff(this.memory, inputAdds, inputDels);
    this.memory = inputMemory;

    var provenance = this.provenance;
    for (var i = inputAdds.length - 1; i >= 0; i--) {
      inputAdds[i] = inputAdds[i].los;
    }
    for (var i = inputDels.length - 1; i >= 0; i--) {
      inputDels[i] = inputDels[i].los;
    }
    var provenanceConstraint = provenance.start(inputAdds, inputDels, outputDels);
    if (provenanceConstraint === null) {
      // no changes
      return false;
    }

    var constraints = this.constraints.slice();
    for (var i = constraints.length - 1; i >= 0; i--) {
      var constraint = constraints[i];
      if (constraint instanceof MemoryConstraint) constraint.reset(inputMemory);
    }
    constraints.unshift(provenanceConstraint);

    var numVars = this.numVars;
    var states = [new SolverState(provenance, constraints, makeArray(numVars, least), makeArray(numVars, greatest), false)];
    while (states.length > 0) {
      var state = states.pop();
      state.propagate();
      if (state.isFailed === true) {
        // console.log("Failed");
      } else {
        var rightState = state.split();
        if (rightState === null) {
          var loss = [];
          var hiss = [];
          for (var i = constraints.length - 1; i >= 1; i--) {
            var constraint = constraints[i];
            if (constraint instanceof MemoryConstraint) {
              constraint.witness(state, loss, hiss);
            }
          }
          provenance.add(new Region(state.los.slice(), state.his.slice(), loss, hiss, true));
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

// CONSTRAINTS

var ConstantConstraint = function(ix, constant) {
  this.ix = ix;
  this.constant = constant;
};

ConstantConstraint.prototype = {
  propagate: function(solverState) {
    var ix = this.ix;
    var constant = this.constant;
    var los = solverState.los;
    var clo = compareValue(constant, los[ix]);
    if (clo === 0) {
      return false;
    } else if ((clo === -1) || (compareValue(constant, solverState.his[ix]) !== -1)) {
      solverState.isFailed = true;
      return true;
    } else {
      los[ix] = constant;
      return true;
    }
  }
};

// SINK

function Sink(solver, outputIxess, outputConstantss) {
  this.solver = solver;
  this.outputIxess = outputIxess;
  this.outputConstantss = outputConstantss;
}

Sink.prototype = {
  update: function(inputMemory, outputMemory) {
    var outputIxess = this.outputIxess;
    var outputConstantss = this.outputConstantss;

    var solverAdds = [];
    var solverDels = [];
    var isChanged = this.solver.update(inputMemory, solverAdds, solverDels);

    if (isChanged === false) return outputMemory;

    var outputAdds = [];
    for (var i = solverAdds.length - 1; i >= 0; i--) {
      var solverAdd = solverAdds[i];
      for (var j = outputIxess.length - 1; j >= 0; j--) {
        var fact = outputConstantss[j].slice();
        readFrom(outputIxess[j], fact, solverAdd);
        outputAdds.push(fact);
      }
    }
    var outputDels = [];
    for (var i = solverDels.length - 1; i >= 0; i--) {
      var solverDel = solverDels[i];
      for (var j = outputIxess.length - 1; j >= 0; j--) {
        var fact = outputConstantss[j].slice();
        readFrom(outputIxess[j], fact, solverDel);
        outputDels.push(fact);
      }
    }

    return outputMemory.update(outputAdds, outputDels);
  }
};

// SYSTEM

function System(memory, sinks, downstream) {
  this.memory = memory;
  this.sinks = sinks;
  this.downstream = downstream;
  this.dirty = makeArray(sinks.length, true);
}

System.prototype = {
  update: function (adds, dels) {
    var oldMemory = this.memory.update(adds, dels);
    var newMemory = oldMemory;
    var sinks = this.sinks;
    var downstream = this.downstream;
    var dirty = this.dirty;
    var numSinks = sinks.length;

    for (var i = dirty.length - 1; i >= 0; i--) {
      dirty[i] = true;
    }

    var current = 0;
    while (current < numSinks) {
      if (dirty[current] === false) {
        current += 1;
        continue;
      }

      dirty[current] = false;
      newMemory = sinks[current].update(oldMemory, oldMemory);

      if (newMemory === oldMemory) {
        current += 1;
        continue;
      }

      oldMemory = newMemory;

      var dirtied = downstream[current];
      for (var i = dirtied.length - 1; i >= 0; i--) {
        var sink = dirtied[i];
        dirty[sink] = true;
        current = (sink <= current) ? sink : current;
      }
    }

    this.memory = newMemory;
  }
};

// COMPILER
// rule: ix
// flow: upstream downstream
// clause: rule input|output
// assignment: clause field constant|variable value
// constant: variable constant
// variable: rule ix
// primitive: rule name ...
// groupby: rule variable
// sortby: rule ix variable
// ixby: rule variable

function dumpMemory(memory) {
  var facts = memory.facts;
  var eav = {};
  var vae = {};
  for (var i = facts.length - 1; i >= 0; i--) {
    var point = facts[i].los;
    var e = point[0];
    var a = point[1];
    var v = point[2];
    if (eav[e] === undefined) eav[e] = {};
    if (eav[e][a] === undefined) eav[e][a] = [];
    eav[e][a].push(v);
    if (vae[v] === undefined) vae[v] = {};
    if (vae[v][a] === undefined) vae[v][a] = [];
    vae[v][a].push(e);
  }
  return {eav: eav, vae: vae};
}

function compileInputClause(dump, clauseId, variableIxes) {
  var ixes = [null, null, null];
  var assignmentIds = dump.vae[clauseId]["assignment.clause"];
  for (var i = assignmentIds.length - 1; i >= 0; i--) {
    var assignment = dump.eav[assignmentIds[i]];
    var field = assignment["assignment.field"][0];
    var value = assignment["assignment.value"][0];
    var pos;
    if (field === "entity") {
        pos = 0;
      } else if (field === "attribute") {
        pos = 1;
      } else if (field === "value") {
        pos = 2;
      }
    if (assignment["assignment.constant|variable"][0] === "variable") {
      ixes[pos] = variableIxes[value];
    } else {
      // ignore constants - should have been supplanted by variables by this point
    }
  }
  return MemoryConstraint.fresh(ixes);
}

function compileOutputClause(dump, clauseId, variableIxes) {
  var ixes = [null, null, null];
  var constants = [null, null, null];
  var assignmentIds = dump.vae[clauseId]["assignment.clause"];
  for (var i = assignmentIds.length - 1; i >= 0; i--) {
    var assignment = dump.eav[assignmentIds[i]];
    var field = assignment["assignment.field"][0];
    var value = assignment["assignment.value"][0];
    var pos;
    if (field === "entity") {
        pos = 0;
      } else if (field === "attribute") {
        pos = 1;
      } else if (field === "value") {
        pos = 2;
      }
    if (assignment["assignment.constant|variable"][0] === "variable") {
      ixes[pos] = variableIxes[value];
    } else {
      constants[pos] = value;
    }
  }
  return [ixes, constants];
}

function compileRule(dump, ruleId) {
  var variableIds = dump.vae[ruleId]["variable.rule"];
  var variableIxes = {};
  for (var i = variableIds.length - 1; i >= 0; i--) {
    variableIxes[variableIds[i]] = dump.eav[variableIds[i]]["variable.ix"][0];
  }

  var constraints = [];
  var outputIxess = [];
  var outputConstantss = [];

  var clauseIds = dump.vae[ruleId]["clause.rule"];
  for (var i = clauseIds.length - 1; i >= 0; i--) {
    if (dump.eav[clauseIds[i]]["clause.input|output"][0] === "input") {
      constraints.push(compileInputClause(dump, clauseIds[i], variableIxes));
    } else {
      var ixesAndConstants = compileOutputClause(dump, clauseIds[i], variableIxes);
      outputIxess.push(ixesAndConstants[0]);
      outputConstantss.push(ixesAndConstants[1]);
    }
  }

  for (var i = variableIds.length - 1; i >= 0; i--) {
    var constants = dump.vae[variableIds[i]]["constant.variable"] || [];
    for (var j = constants.length - 1; j >= 0; j--) {
      var ix = variableIxes[variableIds[i]];
      var constant = dump.eav[constants[j]]["constant.constant"][0];
      constraints.push(new ConstantConstraint(ix, constant));
    }
  }

  return new Sink(Solver.empty(3, variableIds.length, constraints), outputIxess, outputConstantss);
}

function compileSystem(dump) {
  // TODO need to have a way to identify different systems, rather than just grabbing every rule
  // console.log(dump);
  var sinks = [];
  var downstream = [];
  for (var id in dump.eav) {
    var ruleIxes = dump.eav[id]["rule.ix"];
    if (ruleIxes !== undefined) {
      var ruleIx = ruleIxes[0];
      sinks[ruleIx] = compileRule(dump, id);
      var flowIds = dump.vae[id]["flow.upstream"];
      var downstreamIxes = [];
      for (var i = flowIds.length - 1; i >= 0; i--) {
        var downstreamId = dump.eav[flowIds[i]]["flow.downstream"][0];
        var downstreamIx = dump.eav[downstreamId]["rule.ix"][0];
        downstreamIxes[i] = downstreamIx;
      }
      downstream[ruleIx] = downstreamIxes;
    }
  }
  return new System(Memory.empty(3), sinks, downstream);
}

// SYNTAX

var nextId = 0;

function newId() {
  return nextId++;
}

var alpha = /^[a-zA-Z]/;

function parseClause(facts, line, rule, inputOrOutput, variables) {
  var values = line.slice(2).split(" ");
  var clause = "clause" + newId();
  facts.push([clause, "clause.rule", rule]);
  facts.push([clause, "clause.input|output", inputOrOutput]);
  var fields = ["entity", "attribute", "value"];
  for (var i = fields.length - 1; i >= 0; i--) {
    var assignment = "assignment" + newId();
    var value = values[i];
    var field = fields[i];
    if (alpha.test(value)) {
      variables[value] = true;
      facts.push([assignment, "assignment.clause", clause]);
      facts.push([assignment, "assignment.field", field]);
      facts.push([assignment, "assignment.constant|variable", "variable"]);
      facts.push([assignment, "assignment.value", value]);
    } else if (inputOrOutput === "input") {
      var constant = "constant" + newId();
      facts.push([constant, "constant.constant", eval(value)]);
      // your face can be harmful
      var variable = "variable" + newId();
      variables[variable] = true;
      facts.push([constant, "constant.variable", variable]);
      facts.push([assignment, "assignment.clause", clause]);
      facts.push([assignment, "assignment.field", field]);
      facts.push([assignment, "assignment.constant|variable", "variable"]);
      facts.push([assignment, "assignment.value", variable]);
    } else if (inputOrOutput === "output") {
      facts.push([assignment, "assignment.clause", clause]);
      facts.push([assignment, "assignment.field", field]);
      facts.push([assignment, "assignment.constant|variable", "constant"]);
      facts.push([assignment, "assignment.value", eval(value)]);
      // your face can be harmful
    }
  }
}

function parseVariables(facts, rule, variables) {
  var variables = Object.keys(variables);
  for (var i = variables.length - 1; i >= 0; i--) {
    facts.push([variables[i], "variable.rule", rule]);
    facts.push([variables[i], "variable.ix", i]);
  }
}

function parseRule(facts, lines, rule) {
  var variables = {};
  while (true) {
    var line = lines.shift();
    if (line === "") {
      break;
    } else if (line[0] === "@") {
      parseClause(facts, line, rule, "input", variables);
    } else if (line[0] === "+") {
      parseClause(facts, line, rule, "output", variables);
    } else assert(false);
  }
  parseVariables(facts, rule, variables);
}

function parseStrata(facts, lines) {
  var ix = 0;
  while (true) {
    var line = lines.shift();
    if ((line === "") || (line === undefined)) {
      break;
    } else {
      var rules = line.slice(2).split(" ");
      for (var i = 0; i < rules.length; i++) {
        facts.push([rules[i], "rule.ix", ix]);
        ix++;
        for (var j = 0; j < rules.length; j++) {
          var flow = "flow" + newId();
          facts.push([flow, "flow.upstream", rules[i]]);
          facts.push([flow, "flow.downstream", rules[j]]);
        }
      }
    }
  }
}

function parseSystem(memory, lines) {
  var facts = [];

  while (lines.length > 0) {
    var line = lines.shift();
    if (line === "") {
      continue;
    } else if (line.indexOf("rule") === 0) {
      var rule = line.split(" ")[1];
      parseRule(facts, lines, rule);
    } else if (line.indexOf("strata") === 0) {
      parseStrata(facts, lines);
    }
  }

  return memory.update(facts, []);
}

// TESTS

var jsc = jsc;
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
    console.log("Testing " + prop);
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
  memoryA.diff(memoryB, outputAdds, outputDels);
  if ((outputAdds.length > 0) || (outputDels.length > 0)) {
    throw new Error("Only A has " + JSON.stringify(outputDels) + " and only B has " + JSON.stringify(outputAdds));
  } else {
    return true;
  }
}

var solverProps = {
  selfJoin: forall(gen.array(gen.eav()),
                     function (facts) {
                       var input = Memory.empty(3);
                       var constraint0 = MemoryConstraint.fresh([0,1,2]);
                       var constraint1 = MemoryConstraint.fresh([0,1,2]);
                       var sink = new Sink(Solver.empty(3, 3, [constraint0, constraint1]), [[0,1,2]], [[null,null,null]]);
                       var input = input.update(facts, []);
                       var output = sink.update(input, Memory.empty(3));
                       return memoryEqual(input, output);
                     }),

  productJoin: forall(gen.array(gen.eav()),
                     function (facts) {
                       var input = Memory.empty(3);
                       var constraint0 = MemoryConstraint.fresh([0,1,2]);
                       var constraint1 = MemoryConstraint.fresh([3,4,5]);
                       var sink = new Sink(Solver.empty(3, 6, [constraint0, constraint1]), [[0,1,2,3,4,5]], [[null,null,null,null,null,null]]);
                       var input = input.update(facts, []);
                       var output = sink.update(input, Memory.empty(6));
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
                         var input = Memory.empty(3);
                         var constraint0 = new ConstantConstraint(1, constant);
                         var constraint1 = MemoryConstraint.fresh([0,1,2]);
                         var constraint2 = MemoryConstraint.fresh([3,4,5]);
                         var sink = new Sink(Solver.empty(3, 6, [constraint0, constraint1, constraint2]), [[0,1,2,3,4,5]], [[null,null,null,null,null,null]]);
                         var input = input.update(facts, []);
                         var output = sink.update(input, Memory.empty(6));
                         var expectedFacts = [];
                         for (var i = 0; i < facts.length; i++) {
                           if (facts[i][1] === constant) {
                             for (var j = 0; j < facts.length; j++) {
                               expectedFacts.push(facts[i].concat(facts[j]));
                             }
                           }
                         }
                         return memoryEqual(Memory.fromFacts(expectedFacts), output);
                       }),

  incrementalConstantJoin: forall(gen.array(gen.eav()), gen.value(), gen.array(gen.eav()), gen.array(gen.eav()),
                                  function (facts, constant, adds, dels) {
                                    var input = Memory.empty(3);
                                    var constraint0 = new ConstantConstraint(1, constant);
                                    var constraint1 = MemoryConstraint.fresh([0,1,2]);
                                    var constraint2 = MemoryConstraint.fresh([3,4,5]);
                                    var incrementalSink = new Sink(Solver.empty(3, 6, [constraint0, constraint1, constraint2]), [[0,1,2,3,4,5]], [[null,null,null,null,null,null]]);
                                    var batchSink = new Sink(Solver.empty(3, 6, [constraint0, constraint1, constraint2]), [[0,1,2,3,4,5]], [[null,null,null,null,null,null]]);
                                    var incrementalOutput = Memory.empty(6);
                                    var batchOutput = Memory.empty(6);

                                    input = input.update(facts, []);
                                    incrementalOutput = incrementalSink.update(input, incrementalOutput);

                                    input = input.update(adds, dels);
                                    incrementalOutput = incrementalSink.update(input, incrementalOutput);
                                    batchOutput = batchSink.update(input, batchOutput);

                                    return memoryEqual(incrementalOutput, batchOutput);
                                  }),

  actualJoin: forall(gen.array(gen.eav()),
                       function (facts) {
                         var input = Memory.empty(3);
                         var constraint0 = MemoryConstraint.fresh([0,1,2]);
                         var constraint1 = MemoryConstraint.fresh([2,3,4]);
                         var sink = new Sink(Solver.empty(3, 5, [constraint0, constraint1]), [[0,1,2,3,4]], [[null,null,null,null,null]]);
                         var input = input.update(facts, []);
                         var output = sink.update(input, Memory.empty(6));
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
                                    var input = Memory.empty(3);
                                    var constraint0 = MemoryConstraint.fresh([0,1,2]);
                                    var constraint1 = MemoryConstraint.fresh([2,3,4]);
                                    var incrementalSink = new Sink(Solver.empty(3, 5, [constraint0, constraint1]), [[0,1,2,3,4]], [[null,null,null,null,null]]);
                                    var batchSink = new Sink(Solver.empty(3, 5, [constraint0, constraint1]), [[0,1,2,3,4]], [[null,null,null,null,null]]);
                                    var incrementalOutput = Memory.empty(6);
                                    var batchOutput = Memory.empty(6);

                                    input = input.update(facts, []);
                                    incrementalOutput = incrementalSink.update(input, incrementalOutput);

                                    input = input.update(adds, dels);
                                    incrementalOutput = incrementalSink.update(input, incrementalOutput);
                                    batchOutput = batchSink.update(input, batchOutput);

                                    return memoryEqual(incrementalOutput, batchOutput);
                                  }),
};

// assertAll(solverProps, {tests: 5000});

// SYSTEM TESTS

function manualPathTest() {
  var constraint0 = MemoryConstraint.fresh([0,1,2]);
  var constraint1 = new ConstantConstraint(1, "has-an-edge-to");
  var sink0 = new Sink(Solver.empty(3, 3, [constraint0, constraint1]), [[0,null,2]], [[null,"has-a-path-to",null]]);

  var constraint2 = MemoryConstraint.fresh([0,1,2]);
  var constraint3 = MemoryConstraint.fresh([2,3,4]);
  var constraint4 = new ConstantConstraint(1, "has-an-edge-to");
  var constraint5 = new ConstantConstraint(3, "has-a-path-to");
  var sink1 = new Sink(Solver.empty(3, 5, [constraint2, constraint3, constraint4, constraint5]), [[0,null,4]], [[null,"has-a-path-to",null]]);

  var memory = Memory.empty(3);
  var system = new System(memory, [sink0, sink1], [[1], [1]]);

  var facts = [["a", "has-an-edge-to", "b"],
               ["b", "has-an-edge-to", "c"],
               ["c", "has-an-edge-to", "d"],
               ["d", "has-an-edge-to", "b"]];
  system.update(facts, []);

  var derivedFacts = [["a", "has-a-path-to", "b"],
                      ["b", "has-a-path-to", "c"],
                      ["c", "has-a-path-to", "d"],
                      ["d", "has-a-path-to", "b"],

                      ["a", "has-a-path-to", "c"],
                      ["b", "has-a-path-to", "d"],
                      ["c", "has-a-path-to", "b"],
                      ["d", "has-a-path-to", "c"],

                      ["a", "has-a-path-to", "d"],
                      ["b", "has-a-path-to", "b"],
                      ["c", "has-a-path-to", "c"],
                      ["d", "has-a-path-to", "d"]];
  var expectedFacts = facts.concat(derivedFacts);

  memoryEqual(system.memory, Memory.fromFacts(expectedFacts));
}

// manualPathTest();

// COMPILER TESTS

function compiledPathTest() {
  var program = ["rule edges",
                 "@ a 'has-an-edge-to' b",
                 "+ a 'has-a-path-to' b",
                 "",
                 "rule paths",
                 "@ a 'has-an-edge-to' b",
                 "@ b 'has-a-path-to' c",
                 "+ a 'has-a-path-to' c",
                 "",
                 "strata",
                 "~ edges",
                 "~ paths"];
  var programMemory = parseSystem(Memory.empty(3), program);
  var system = compileSystem(dumpMemory(programMemory));

  var facts = [["a", "has-an-edge-to", "b"],
               ["b", "has-an-edge-to", "c"],
               ["c", "has-an-edge-to", "d"],
               ["d", "has-an-edge-to", "b"]];
  var adds = [];
  // console.log(system);
  system.update(adds, []);

  var derivedFacts = [["a", "has-a-path-to", "b"],
                      ["b", "has-a-path-to", "c"],
                      ["c", "has-a-path-to", "d"],
                      ["d", "has-a-path-to", "b"],

                      ["a", "has-a-path-to", "c"],
                      ["b", "has-a-path-to", "d"],
                      ["c", "has-a-path-to", "b"],
                      ["d", "has-a-path-to", "c"],

                      ["a", "has-a-path-to", "d"],
                      ["b", "has-a-path-to", "b"],
                      ["c", "has-a-path-to", "c"],
                      ["d", "has-a-path-to", "d"]];
  var expectedFacts = facts.concat(derivedFacts);
  var expectedFacts = [];

  memoryEqual(system.memory, Memory.fromFacts(expectedFacts));
}

compiledPathTest();

// BENCHMARKS

function soFast(n) {
  var constraint0 = MemoryConstraint.fresh([0,1,2]);
  var constraint1 = MemoryConstraint.fresh([0,1,2]);
  var solver = Solver.empty(3, 3, [constraint0, constraint1]);

  var input = Memory.empty(3);
  var output = Memory.empty(3);

  var adds = [];
  for (var i = 0; i < n; i++) {
    adds[i] = [Math.random(),Math.random(),Math.random()];
  }

  input = input.update(adds, []);
  console.time("soFast " + n);
  output = solver.update(input, output);
  console.timeEnd("soFast " + n);

  console.log("Regions: " + solver.provenance.ptree.regions.length);

  return output;
}

// soFast(1000);

function soSlow(n) {
  var constraint0 = MemoryConstraint.fresh([0,1,2]);
  var constraint1 = MemoryConstraint.fresh([0,1,2]);
  var solver = Solver.empty(3, 3, [constraint0, constraint1]);

  var input = Memory.empty(3);
  var output = Memory.empty(3);

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
  output = solver.update(input, output);
  console.timeEnd("soSlowA " + n);

  input = input.update(addsB, []);
  console.time("soSlowB " + n);
  output = solver.update(input, output);
  console.timeEnd("soSlowB " + n);

  input = input.update([[0.5,0.5,0.5]], []);
  console.time("soSlowC " + n);
  output = solver.update(input, output);
  console.timeEnd("soSlowC " + n);

  console.log("Regions: " + solver.provenance.ptree.regions.length);

  return output;
}

// soSlow(1000);
