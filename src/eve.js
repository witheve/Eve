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
  if(len !== b.length) throw new Error("arrayEqual on arrays of different length: " + a + " :: " + b);
  for(var i = 0; i < len; i++) {
    if(a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

function nestedEqual(a, b) {
  if (!(a instanceof Array)) return a === b;
  if (!(b instanceof Array)) return false;
  var len = a.length;
  if(len !== b.length) return false;
  for(var i = 0; i < len; i++) {
    if (!nestedEqual(a[i], b[i])) {
      return false;
    }
  }
  return true;
}

// MTREE
// track a multi-set of volumes
// supports bounds refinement

function Volume(los, his) {
  this.los = los;
  this.his = his;
}

function MTree(factLen, volumes) {
  this.factLen = factLen;
  this.volumes = volumes;
}

function MTreeConstraint(ixes, pointful, volumes, los, his) {
  this.ixes = ixes;
  this.pointful = pointful;
  this.volumes = volumes;
  this.los = los;
  this.his = his;
}

MTree.empty = function(factLen) {
  return new MTree(factLen, []);
};

MTreeConstraint.fresh = function(ixes) {
  var pointful = true;
  var volumes = [];
  var los = makeArray(ixes.length, least);
  var his = makeArray(ixes.length, greatest);
  return new MTreeConstraint(ixes, pointful, volumes, los, his);
};

MTree.prototype = {
  update: function(adds, dels) {
    var volumes = this.volumes.slice();
    for (var i = adds.length - 1; i >= 0; i--) {
      volumes.push(adds[i]);
    }
    nextDel: for (var i = dels.length - 1; i >= 0; i--) {
      var del = dels[i];
      for (var j = volumes.length - 1; j >= 0; j--) {
        var volume = volumes[j];
        if (arrayEqual(del.los, volume.los) && arrayEqual(del.his, volume.his)) {
          volumes.splice(j, 1);
          continue nextDel;
        }
      }
    }
    return new MTree(this.factLen, volumes);
  },

  diff: function(oldTree, outputAdds, outputDels) {
    // TODO hacky gross diffing
    var oldVolumes = oldTree.volumes;
    var newVolumes = this.volumes;
    var adds = {};
    var dels = {};
    for (var i = newVolumes.length - 1; i >= 0; i--) {
      var newVolume = newVolumes[i];
      adds[JSON.stringify(newVolume)] = newVolume;
    }
    for (var i = oldVolumes.length - 1; i >= 0; i--) {
      var oldVolume = oldVolumes[i];
      dels[JSON.stringify(oldVolume)] = oldVolume;
    }
    for (var i = newVolumes.length - 1; i >= 0; i--) {
      delete dels[JSON.stringify(newVolumes[i])];
    }
    for (var i = oldVolumes.length - 1; i >= 0; i--) {
      delete adds[JSON.stringify(oldVolumes[i])];
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

function dedupe(xs) {
  var deduper = {};
  for (var i = xs.length - 1; i >= 0; i--) {
    var x = xs[i];
    deduper[JSON.stringify(x)] = x;
  }
  var keys = Object.keys(deduper);
  var deduped = [];
  for (var i = keys.length - 1; i >= 0; i--) {
    deduped[i] = deduper[keys[i]];
  }
  return deduped;
}

// TODO pointful stuff is a hack - we really need a different datastructure for the provenance constraint
MTreeConstraint.prototype = {
  reset: function(mtree) {
    this.volumes = dedupe(mtree.volumes);

    fillArray(this.los, least);
    fillArray(this.his, greatest);
  },

  copy: function() {
    return new MTreeConstraint(this.ixes, this.pointful, this.volumes.slice(), this.los.slice(), this.his.slice());
  },

  propagate: function(solverState) {
    var ixes = this.ixes;
    var volumes = this.volumes;
    var solverLos = solverState.los;
    var solverHis = solverState.his;
    var los = this.los;
    var his = this.his;
    var provenance = solverState.provenance;

    readFrom(ixes, los, solverLos);
    readFrom(ixes, his, solverHis);

    var pointful = this.pointful;
    for (var i = volumes.length - 1; i >= 0; i--) {
      var volume = volumes[i];
      if (((!pointful && (intersectsVolume(los, his, volume.los, volume.his) === false))) ||
          ((pointful && (containsPoint(los, his, volume.los) === false)))) {
        volumes.splice(i, 1);
      }
    }

    if (volumes.length === 0) {
      // console.log("Failed with no volumes");
      solverState.isFailed = true;
      if (pointful) provenance.add(new Region(solverLos.slice(), solverHis.slice(), [los.slice()], [his.slice()], false));
      return true;
    }

    var changed = false;

    for (var i = ixes.length - 1; i >= 0; i--) {
      var newLo = greatest;
      for (var j = volumes.length - 1; j >= 0; j--) {
        var volume = volumes[j];
        var volumeLo = volume.los[i];
        if (compareValue(volumeLo, newLo) === -1) newLo = volumeLo;
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
        if (pointful) provenance.add(new Region(notLos, notHis, [memoryLos], [memoryHis], false));
        changed = true;
      }
    }

    return changed;
  },

  split: function(leftSolverState, rightSolverState) {
    var volumes = this.volumes;
    if (volumes.length < 2) {
      return false;
    } else {
      // TODO this split algorithm can sometimes fail to change the right-hand state
      var ixes = this.ixes;
      var volumeIx = Math.floor(Math.random() * volumes.length);
      var i = Math.floor(Math.random() * ixes.length);
      var ix = ixes[i];
      var pivot = volumes[volumeIx].los[i];
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
      var constraint = MTreeConstraint.fresh(this.ixes);
      constraint.pointful = false;
      var volumes = constraint.volumes;
      for (var i = delledRegions.length - 1; i >= 0; i--) {
        var delledRegion = delledRegions[i];
        volumes[i] = new Volume(delledRegion.solverLos, delledRegion.solverHis);
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
      if (constraint instanceof MTreeConstraint) constraints[i] = constraint.copy();
    }
    for (var splitter = constraints.length - 1; splitter >= 1; splitter--) {
      var constraint = constraints[splitter];
      if ((constraint instanceof MTreeConstraint) && constraints[splitter].split(leftSolverState, rightSolverState)) break;
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
  var memory = MTree.empty(factLen);
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
      if (constraint instanceof MTreeConstraint) constraint.reset(inputMemory);
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
            if (constraint instanceof MTreeConstraint) {
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
        var point = outputConstantss[j].slice();
        readFrom(outputIxess[j], point, solverAdd);
        outputAdds.push(new Volume(point, point));
      }
    }
    var outputDels = [];
    for (var i = solverDels.length - 1; i >= 0; i--) {
      var solverDel = solverDels[i];
      for (var j = outputIxess.length - 1; j >= 0; j--) {
        var point = outputConstantss[j].slice();
        readFrom(outputIxess[j], point, solverDel);
        outputDels.push(new Volume(point, point));
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
  var volumes = memory.volumes;
  var eav = {};
  var vae = {};
  for (var i = volumes.length - 1; i >= 0; i--) {
    var point = volumes[i].los;
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
    var field = assignment["assignment.field"];
    var value = variableIxes[assignment["assignment.value"]];
    var pos;
    if (field === "entity") {
        pos = 0;
      } else if (field === "attribute") {
        pos = 1;
      } else if (field === "value") {
        pos = 2;
      }
    if (assignment["assignment.constant|variable"] === "variable") {
      ixes[pos] = variableIxes[value];
    } else {
      // ignore constants - should have been supplanted by variables by this point
    }
  }
  return MTreeConstraint.fresh(ixes);
}

function compileOutputClause(dump, clauseId, variableIxes) {
  var ixes = [null, null, null];
  var constants = [null, null, null];
  var assignmentIds = dump.vae[clauseId]["assignment.clause"];
  for (var i = assignmentIds.length - 1; i >= 0; i--) {
    var assignment = dump.eav[assignmentIds[i]];
    var field = assignment["assignment.field"];
    var value = variableIxes[assignment["assignment.value"]];
    var pos;
    if (field === "entity") {
        pos = 0;
      } else if (field === "attribute") {
        pos = 1;
      } else if (field === "value") {
        pos = 2;
      }
    if (assignment["assignment.constant|variable"] === "variable") {
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
    variableIxes[variableIds[i]] = dump.eav[variableIds[i]]["variable.ix"];
  }

  var constraints = [];
  var outputIxess = [];
  var outputConstantss = [];

  var clauseIds = dump.vae[ruleId]["clause.rule"];
  for (var i = clauseIds.length - 1; i >= 0; i--) {
    if (dump.eav[clauseIds[i]]["clause.input|output"] === "input") {
      constraints.push(compileInputClause(dump, clauseIds[i], variableIxes));
    } else {
      var ixesAndConstants = compileOutputClause(dump, clauseIds[i], variableIxes);
      outputIxess.push(ixesAndConstants[0]);
      outputConstantss.push(ixesAndConstants[1]);
    }
  }

  for (var i = variableIds.length - 1; i >= 0; i--) {
    var constants = dump.vae(variableIds[i])["constant.variable"];
    for (var j = constants.length - 1; j >= 0; j--) {
      var ix = variableIxes[variableIds[i]];
      var constant = constants[j]["constant.constant"];
      constraints.push(new ConstantConstraint(ix, constant));
    }
  }

  return new Sink(Solver.empty(3, variableIds.length, constraints), outputIxess, outputConstantss);
}

function compileSystem(dump) {
  // TODO need to have a way to identify different systems, rather than just grabbing every rule
  var sinks = [];
  var downstream = [];
  for (var id in dump.eav) {
    var ruleIx = dump.eav[id]["rule.ix"];
    if (ruleIx !== undefined) {
      sinks[ruleIx] = compileRule(dump, id);
      var flowIds = dump.vae[id]["flow.upstream"];
      var downstreamIxes = [];
      for (var i = flowIds.length - 1; i >= 0; i--) {
        var downstreamId = dump.eav[flowIds[i]]["flow.downstream"];
        var downstreamIx = dump.eav[downstreamId]["rule.ix"];
        downstreamIxes[i] = downstreamIx;
      }
      downstream[ruleIx] = downstreamIxes;
    }
  }
  return new System(MTree.empty(3), sinks, downstream);
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

function sortEqual(volumesA, volumesB) {
  var memoryA = MTree.empty(3).update(volumesA, []);
  var memoryB = MTree.empty(3).update(volumesB, []);
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
                       var input = MTree.empty(3);
                       var constraint0 = MTreeConstraint.fresh([0,1,2]);
                       var constraint1 = MTreeConstraint.fresh([0,1,2]);
                       var sink = new Sink(Solver.empty(3, 3, [constraint0, constraint1]), [[0,1,2]], [[null,null,null]]);
                       var adds = [];
                       for (var i = 0; i < facts.length; i++) {
                         adds[i] = new Volume(facts[i], facts[i]);
                       }
                       var input = input.update(adds, []);
                       var output = sink.update(input, MTree.empty(3));
                       var expectedVolumes = dedupe(input.volumes);
                       return sortEqual(expectedVolumes, output.volumes);
                     }),

  productJoin: forall(gen.array(gen.eav()),
                     function (facts) {
                       var input = MTree.empty(3);
                       var constraint0 = MTreeConstraint.fresh([0,1,2]);
                       var constraint1 = MTreeConstraint.fresh([3,4,5]);
                       var sink = new Sink(Solver.empty(3, 6, [constraint0, constraint1]), [[0,1,2,3,4,5]], [[null,null,null,null,null,null]]);
                       var adds = [];
                       for (var i = 0; i < facts.length; i++) {
                         adds[i] = new Volume(facts[i], facts[i]);
                       }
                       var input = input.update(adds, []);
                       var output = sink.update(input, MTree.empty(6));
                       var expectedVolumes = [];
                       for (var i = 0; i < facts.length; i++) {
                         for (var j = 0; j < facts.length; j++) {
                           var point = facts[i].concat(facts[j]);
                           expectedVolumes.push(new Volume(point, point));
                         }
                       }
                       expectedVolumes = dedupe(expectedVolumes);
                       return sortEqual(expectedVolumes, output.volumes);
                     }),

  constantJoin: forall(gen.array(gen.eav()), gen.value(),
                       function (facts, constant) {
                         var input = MTree.empty(3);
                         var constraint0 = new ConstantConstraint(1, constant);
                         var constraint1 = MTreeConstraint.fresh([0,1,2]);
                         var constraint2 = MTreeConstraint.fresh([3,4,5]);
                         var sink = new Sink(Solver.empty(3, 6, [constraint0, constraint1, constraint2]), [[0,1,2,3,4,5]], [[null,null,null,null,null,null]]);
                         var adds = [];
                         for (var i = 0; i < facts.length; i++) {
                           adds[i] = new Volume(facts[i], facts[i]);
                         }
                         var input = input.update(adds, []);
                         var output = sink.update(input, MTree.empty(6));
                         var expectedVolumes = [];
                         for (var i = 0; i < facts.length; i++) {
                           if (facts[i][1] === constant) {
                             for (var j = 0; j < facts.length; j++) {
                               var point = facts[i].concat(facts[j]);
                               expectedVolumes.push(new Volume(point, point));
                             }
                           }
                         }
                         expectedVolumes = dedupe(expectedVolumes);
                         return sortEqual(expectedVolumes, output.volumes);
                       }),

  incrementalConstantJoin: forall(gen.array(gen.eav()), gen.value(), gen.array(gen.eav()), gen.array(gen.eav()),
                                  function (facts, constant, laterAdds, laterDels) {
                                    var input = MTree.empty(3);
                                    var constraint0 = new ConstantConstraint(1, constant);
                                    var constraint1 = MTreeConstraint.fresh([0,1,2]);
                                    var constraint2 = MTreeConstraint.fresh([3,4,5]);
                                    var incrementalSink = new Sink(Solver.empty(3, 6, [constraint0, constraint1, constraint2]), [[0,1,2,3,4,5]], [[null,null,null,null,null,null]]);
                                    var batchSink = new Sink(Solver.empty(3, 6, [constraint0, constraint1, constraint2]), [[0,1,2,3,4,5]], [[null,null,null,null,null,null]]);
                                    var incrementalOutput = MTree.empty(6);
                                    var batchOutput = MTree.empty(6);

                                    var adds = [];
                                    for (var i = 0; i < facts.length; i++) {
                                      adds[i] = new Volume(facts[i], facts[i]);
                                    }
                                    input = input.update(adds, []);

                                    incrementalOutput = incrementalSink.update(input, incrementalOutput);

                                    var adds = [];
                                    for (var i = 0; i < laterAdds.length; i++) {
                                      adds[i] = new Volume(laterAdds[i], laterAdds[i]);
                                    }
                                    var dels = [];
                                    for (var i = 0; i < laterDels.length; i++) {
                                      dels[i] = new Volume(laterDels[i], laterDels[i]);
                                    }
                                    input = input.update(adds, dels);

                                    batchOutput = batchSink.update(input, batchOutput);
                                    incrementalOutput = incrementalSink.update(input, incrementalOutput);

                                    return sortEqual(incrementalOutput.volumes, batchOutput.volumes);
                                  }),

  actualJoin: forall(gen.array(gen.eav()),
                       function (facts) {
                         var input = MTree.empty(3);
                         var constraint0 = MTreeConstraint.fresh([0,1,2]);
                         var constraint1 = MTreeConstraint.fresh([2,3,4]);
                         var sink = new Sink(Solver.empty(3, 5, [constraint0, constraint1]), [[0,1,2,3,4]], [[null,null,null,null,null]]);
                         var adds = [];
                         for (var i = 0; i < facts.length; i++) {
                           adds[i] = new Volume(facts[i], facts[i]);
                         }
                         var input = input.update(adds, []);
                         var output = sink.update(input, MTree.empty(6));
                         var expectedVolumes = [];
                         for (var i = 0; i < facts.length; i++) {
                           for (var j = 0; j < facts.length; j++) {
                             var point = facts[i].concat(facts[j]);
                             if (point[2] === point[3]) {
                               point.splice(2, 1);
                               expectedVolumes.push(new Volume(point, point));
                             }
                           }
                         }
                         expectedVolumes = dedupe(expectedVolumes);
                         return sortEqual(expectedVolumes, output.volumes);
                       }),

  incrementalActualJoin: forall(gen.array(gen.eav()), gen.array(gen.eav()), gen.array(gen.eav()),
                                  function (facts, laterAdds, laterDels) {
                                    var input = MTree.empty(3);
                                    var constraint0 = MTreeConstraint.fresh([0,1,2]);
                                    var constraint1 = MTreeConstraint.fresh([2,3,4]);
                                    var incrementalSink = new Sink(Solver.empty(3, 5, [constraint0, constraint1]), [[0,1,2,3,4]], [[null,null,null,null,null]]);
                                    var batchSink = new Sink(Solver.empty(3, 5, [constraint0, constraint1]), [[0,1,2,3,4]], [[null,null,null,null,null]]);
                                    var incrementalOutput = MTree.empty(6);
                                    var batchOutput = MTree.empty(6);

                                    var adds = [];
                                    for (var i = 0; i < facts.length; i++) {
                                      adds[i] = new Volume(facts[i], facts[i]);
                                    }
                                    input = input.update(adds, []);

                                    incrementalOutput = incrementalSink.update(input, incrementalOutput);

                                    var adds = [];
                                    for (var i = 0; i < laterAdds.length; i++) {
                                      adds[i] = new Volume(laterAdds[i], laterAdds[i]);
                                    }
                                    var dels = [];
                                    for (var i = 0; i < laterDels.length; i++) {
                                      dels[i] = new Volume(laterDels[i], laterDels[i]);
                                    }
                                    input = input.update(adds, dels);

                                    batchOutput = batchSink.update(input, batchOutput);
                                    incrementalOutput = incrementalSink.update(input, incrementalOutput);

                                    return sortEqual(incrementalOutput.volumes, batchOutput.volumes);
                                  }),
};

assertAll(solverProps, {tests: 5000});

// SYSTEM TESTS

function pathTest() {
  var constraint0 = MTreeConstraint.fresh([0,1,2]);
  var constraint1 = new ConstantConstraint(1, "has an edge to");
  var sink0 = new Sink(Solver.empty(3, 3, [constraint0, constraint1]), [[0,null,2]], [[null,"has a path to",null]]);

  var constraint2 = MTreeConstraint.fresh([0,1,2]);
  var constraint3 = MTreeConstraint.fresh([2,3,4]);
  var constraint4 = new ConstantConstraint(1, "has an edge to");
  var constraint5 = new ConstantConstraint(3, "has a path to");
  var sink1 = new Sink(Solver.empty(3, 5, [constraint2, constraint3, constraint4, constraint5]), [[0,null,4]], [[null,"has a path to",null]]);

  var memory = MTree.empty(3);
  var system = new System(memory, [sink0, sink1], [[1], [1]]);

  var facts = [["a", "has an edge to", "b"],
               ["b", "has an edge to", "c"],
               ["c", "has an edge to", "d"],
               ["d", "has an edge to", "b"]];
  var adds = [];
  for (var i = 0; i < facts.length; i++) {
    adds[i] = new Volume(facts[i], facts[i]);
  }
  system.update(adds, []);

  var derivedFacts = [["a", "has a path to", "b"],
                      ["b", "has a path to", "c"],
                      ["c", "has a path to", "d"],
                      ["d", "has a path to", "b"],

                      ["a", "has a path to", "c"],
                      ["b", "has a path to", "d"],
                      ["c", "has a path to", "b"],
                      ["d", "has a path to", "c"],

                      ["a", "has a path to", "d"],
                      ["b", "has a path to", "b"],
                      ["c", "has a path to", "c"],
                      ["d", "has a path to", "d"]];
  var expectedFacts = facts.concat(derivedFacts);
  var expectedVolumes = [];
  for (var i = expectedFacts.length - 1; i >= 0; i--) {
    expectedVolumes[i] = new Volume(expectedFacts[i], expectedFacts[i]);
  }

  assert(sortEqual(dedupe(system.memory.volumes), expectedVolumes));
}

pathTest();

// BENCHMARKS

function soFast(n) {
  var constraint0 = MTreeConstraint.fresh([0,1,2]);
  var constraint1 = MTreeConstraint.fresh([0,1,2]);
  var solver = Solver.empty(3, 3, [constraint0, constraint1]);

  var input = MTree.empty(3);
  var output = MTree.empty(3);

  var adds = [];
  for (var i = 0; i < n; i++) {
    var point = [Math.random(),Math.random(),Math.random()];
    adds[i] = new Volume(point, point);
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
  var constraint0 = MTreeConstraint.fresh([0,1,2]);
  var constraint1 = MTreeConstraint.fresh([0,1,2]);
  var solver = Solver.empty(3, 3, [constraint0, constraint1]);

  var input = MTree.empty(3);
  var output = MTree.empty(3);

  var addsA = [];
  var addsB = [];
  for (var i = 0; i < n; i++) {
    var point = [Math.random(),Math.random(),Math.random()];
    if (i % 2 === 0) {
      addsA.push(new Volume(point, point));
    } else {
      addsB.push(new Volume(point, point));
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

  input = input.update([new Volume([0.5,0.5,0.5],[0.5,0.5,0.5])], []);
  console.time("soSlowC " + n);
  output = solver.update(input, output);
  console.timeEnd("soSlowC " + n);

  console.log("Regions: " + solver.provenance.ptree.regions.length);

  return output;
}

// soSlow(1000);
