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

function pushInto(depth, a, b) {
  var len = a.length;
  var start = depth * len;
  for(var i = 0; i < len; i++) {
    b[start + i] = a[i];
  }
}

function popFrom(depth, a, b) {
  var len = a.length;
  var start = depth * len;
  for(var i = 0; i < len; i++) {
    a[i] = b[start + i];
  }
}

function readFrom(ixes, local, remote) {
  var len = ixes.length;
  assert(len === local.length);
  for (var i = 0; i < len; i++) {
    local[i] = remote[ixes[i]];
  }
}

function writeTo(ixes, local, remote) {
  var len = ixes.length;
  assert(len === local.length);
  for (var i = 0; i < len; i++) {
    remote[ixes[i]] = local[i];
  }
}

// ORDERING / COMPARISON

var least = false;
var greatest = undefined;

function leastArray(n) {
  var array = [];
  for (var i = 0; i < n; i++) {
    array[i] = least;
  }
  return array;
}

function greatestArray(n) {
  var array = [];
  for (var i = 0; i < n; i++) {
    array[i] = greatest;
  }
  return array;
}

function compareValue(a, b) {
  if(a === b) return 0;
  var at = typeof a;
  var bt = typeof b;
  if((at === bt && a < b) || (at < bt)) return -1;
  return 1;
}

function comparePointwise(pointA, pointB) {
  var len = pointA.length;
  assert(len === pointB.length);
  var allLte = true;
  var allGte = true;
  for (var i = 0; i < len; i++) {
    var comparison = compareValue(pointA[i], pointB[i]);
    if (comparison === -1) allGte = false;
    if (comparison === 1) allLte = false;
  }
  if (allLte && allGte) return 0;
  if (allLte) return -1;
  if (allGte) return 1;
  return NaN;
}

function containsPointwise(los, his, innerLos, innerHis) {
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

function intersectsPointwise(losA, hisA, losB, hisB) {
  var len = losA.length;
  assert(len === hisA.length);
  assert(len === losB.length);
  assert(len === hisB.length);
  for (var i = 0; i < len; i++) {
    if ((compareValue(losA[i], hisB[i]) === 1) || compareValue(losB[i], hisA[i]) === 1) {
      return false;
    }
  }
  return true;
}

function pushMin(as, bs) {
  var len = as.length;
  assert(len = bs.length);
  for (var i = 0; i <= len; i++) {
    if (compareValue(as[i], bs[i]) === 1) {
      as[i] = bs[i];
    }
  }
}

function pushMax(as, bs) {
  var len = as.length;
  assert(len = bs.length);
  for (var i = 0; i <= len; i++) {
    if (compareValue(as[i], bs[i]) === -1) {
      as[i] = bs[i];
    }
  }
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

function MTreeConstraint(ixes, volumes, los, his) {
  this.ixes = ixes;
  this.volumes = volumes;
  this.los = los;
  this.his = his;
}

MTree.empty = function(factLen) {
  return new MTree(factLen, []);
};

MTreeConstraint.fresh = function(ixes) {
  var volumes = [];
  var los = makeArray(ixes.length, least);
  var his = makeArray(ixes.length, greatest);
  return new MTreeConstraint(ixes, volumes, los, his);
};

MTree.prototype = {
  update: function(adds, dels) {
    var volumes = this.volumes;
    for (var i = adds.length - 1; i >= 0; i--) {
      volumes.push(adds[i]);
    }
    outer: for (var i = dels.length - 1; i >= 0; i--) {
      var del = dels[i];
      inner: for (var j = volumes.length - 1; j >= 0; j--) {
        var volume = volumes[j];
        if (arrayEqual(del.los, volume.los) && arrayEqual(del.his, volume.his)) {
          volumes.slice(j, 1);
          continue outer;
        }
      }
    }
  },
};

MTreeConstraint.prototype = {
  reset: function(mtree) {
    this.volumes = mtree.volumes.slice();
    fillArray(this.los, least);
    fillArray(this.his, greatest);
  },

  copy: function() {
    return new MTreeConstraint(this.ixes, this.volumes.slice(), this.los.slice(), this.his.slice());
  },

  propagate: function(solverState) {
    var ixes = this.ixes;
    var len = ixes.length;
    var volumes = this.volumes;
    var solverLos = solverState.los;
    var solverHis = solverState.his;
    var los = this.los;
    var his = this.his;

    readFrom(ixes, los, solverLos);
    readFrom(ixes, his, solverHis);

    for (var i = volumes.length - 1; i >= 0; i--) {
      var volume = volumes[i];
      if (intersectsPointwise(los, his, volume.los, volume.his) === false) {
        volumes.splice(i, 1);
      }
    }

    if (volumes.length === 0) {
      solverState.isFailed = true;
      return;
    }

    var provenance = solverState.provenance;
    var changed = false;

    for (var i = len - 1; i >= 0; i--) {
      var newLo = greatest;
      var newHi = least;
      for (var j = volumes.length - 1; j >= 0; j--) {
        var volume = volumes[j];
        var volumeLo = volume.los[i];
        var volumeHi = volume.his[i];
        if (compareValue(volumeLo, newLo) === -1) newLo = volumeLo;
        if (compareValue(volumeHi, newHi) === 1) newHi = volumeHi;
      }
      var oldLo = los[i];
      var oldHi = his[i];
      var ix = ixes[i];
      if (compareValue(newLo, oldLo) === 1) {
        var notLos = solverLos.slice();
        var proofLos = los.slice();
        los[i] = newLo;
        solverLos[ix] = newLo;
        var notHis = solverLos.slice();
        var proofHis = los.slice();
        provenance.whyNot(new WhyNot(notLos, notHis, proofLos, proofHis));
        changed = true;
      }
      if (compareValue(newHi, oldHi) === -1) {
        var notHis = solverHis.slice();
        var proofHis = his.slice();
        his[i] = newHi;
        solverHis[ix] = newHi;
        var notLos = solverHis.slice();
        var proofLos = his.slice();
        provenance.whyNot(new WhyNot(notLos, notHis, proofLos, proofHis));
        changed = true;
      }
    }

    return changed;
  },

  split: function() {
    var volumes = this.volumes;
    if (volumes.length < 2) {
      return null;
    } else {
      var ix = Math.floor(Math.random() * this.mtree.factLen);
      volumes.sort(function (vA, vB) {return compareValue(vA.los[ix], vB.los[ix]);});
      var splitLen = Math.ceil(volumes.length / 2);
      var splitVolumes = volumes.splice(splitLen, splitLen);
      return new MTreeConstraint(this.ixes, splitVolumes, this.los.slice(), this.his.slice());
    }
  }
};

// PTREE
// records a single provenance for each possible solver point
// tracks dirty volumes when memory changes

function WhyNot(solverLos, solverHis, proofLos, proofHis) {
  this.solverLos = solverLos;
  this.solverHis = solverHis;
  this.proofLos = proofLos;
  this.proofHis = proofHis;
}

function Why(solverValues) {
  this.solverValues = solverValues;
}

function PTree(whys, whyNots) {
  this.whys = whys;
  this.whyNots = whyNots;
}

PTree.empty = function() {
  return new PTree([], []);
};

PTree.prototype = {
  erase: function(points, erasedWhyNots) {
    var whyNots = this.whyNots;
    outer: for (var i = whyNots.length - 1; i >= 0; i--) {
      var whyNot = whyNots[i];
      var los = whyNot.proofLos;
      var his = whyNot.proofHis;
      inner: for (var j = points.length - 1; j >= 0; j--) {
        var point = points[j];
        if (containsPointwise(los, his, point, point)) {
          whyNots.splice(i, 1);
          erasedWhyNots.push(whyNot);
          continue outer;
        }
      }
    }
  },

  write: function(newWhys, newWhyNots, addedWhys, delledWhys) {
    var whys = this.whys;
    var whyNots = this.whyNots;

    outer: for (var i = whys.length - 1; i >= 0; i--) {
      var why = whys[i];
      var solverValues = why.solverValues;
      inner: for (var j = newWhyNots.length - 1; j >= 0; j--) {
        var newWhyNot = newWhyNots[j];
        // TODO have to check more carefully here - I think that strict containment might be sufficient
        if (containsPointwise(newWhyNot.solverLos, newWhyNot.solverHis, solverValues, solverValues)) {
          whys.splice(i, 1);
          delledWhys.push(why);
          continue outer;
        }
      }
    }

    outer: for (var i = whyNots.length - 1; i >= 0; i--) {
      var whyNot = whyNots[i];
      var solverLos = whyNot.solverLos;
      var solverHis = whyNot.solverHis;
      inner: for (var j = newWhyNots.length - 1; j >= 0; j--) {
        var newWhyNot = newWhyNots[j];
        if (containsPointwise(solverLos, solverHis, newWhyNot.solverLos, newWhyNot.solverHis)) {
          newWhyNots.slice(j, 1);
          continue inner;
        }
        if (containsPointwise(newWhyNot.solverLos, newWhyNot.solverHis, solverLos, solverHis)) {
          whyNots.slice(i, 1);
          continue outer;
        }
      }
    }

    for (var i = newWhys.length - 1; i >= 0; i--) {
      whys.push(newWhys[i]);
      addedWhys.push(newWhys[i]);
    }
    for (var i = newWhyNots.length - 1; i >= 0; i--) {
      whyNots.push(newWhyNots[i]);
    }
  },
};

// PROVENANCE

function Provenance(numVars, factLen, whys, whyNots, ptree) {
  this.numVars = numVars;
  this.factLen = factLen;
  this.whys = whys;
  this.whyNots = whyNots;
  this.ptree = ptree;
  this.ixes = [];
  for (var i = 0; i < this.numVars; i++) {
    this.ixes[i] = i;
  }
}

Provenance.empty = function (numVars, factLen) {
  var provenance = new Provenance(numVars, factLen, [], [], PTree.empty());
  provenance.whyNot(new WhyNot(makeArray(numVars, least), makeArray(numVars, greatest), makeArray(factLen, least), makeArray(factLen, greatest)));
  provenance.finish([],[]);
  return provenance;
};

Provenance.prototype =  {
  why: function (why) {
    this.whys.push(why);
  },

  whyNot: function (whyNot) {
    this.whyNots.push(whyNot);
  },

  start: function (inputAdds, inputDels) {
    var erasedWhyNots = [];
    this.ptree.erase(inputAdds, erasedWhyNots);
    this.ptree.erase(inputDels, erasedWhyNots);
    for (var i = erasedWhyNots.length - 1; i >= 0; i--) {
      erasedWhyNots[i] = new Volume(erasedWhyNots[i].solverLos, erasedWhyNots[i].solverHis);
    }
    if (erasedWhyNots.length === 0) {
      return null;
    } else {
      var constraint = MTreeConstraint.fresh(this.ixes);
      constraint.volumes = erasedWhyNots;
      return constraint;
    }
  },

  finish: function (outputAdds, outputDels) {
    var addLen = outputAdds.length;
    var delLen = outputDels.length;
    this.ptree.write(this.whys, this.whyNots, outputAdds, outputDels);
    for (var i = outputAdds.length - 1; i >= addLen; i--) {
      outputAdds[i] = outputAdds[i].solverValues;
    }
    for (var i = outputDels.length - 1; i >= delLen; i--) {
      outputDels[i] = outputDels[i].solverValues;
    }
    this.whys.length = 0;
    this.whyNots.length = 0;
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
      console.log("Before prop " + current + " " + this.los + " " + this.his);
      if (this.isFailed === true) break;
      var changed = constraints[current].propagate(this);
      if (changed === true) lastChanged = current;
      console.log("After prop " + current + " " + this.los + " " + this.his);
      current = (current + 1) % numConstraints;
      if (current === lastChanged) break;
    }
  },

  split: function() {
    var constraints = this.constraints;
    var otherConstraints = constraints.slice();
    for (var splitter = constraints.length - 1; splitter >= 0; splitter--) {
      var otherConstraint = constraints[splitter].split();
      if (otherConstraint !== null) {
        otherConstraints[splitter] = otherConstraint;
        break;
      }
    }
    assert(splitter >= 0);
    for (var copier = constraints.length - 1; copier >= 0; copier--) {
      if (copier !== splitter) {
        otherConstraints[copier] = constraints[copier].copy();
      }
    }
    var otherSolverState = new SolverState(this.provenance, otherConstraints, this.los.splice(), this.his.splice(), this.isFailed);
    console.log("Before split " + splitter + " " + this.los + " " + this.his);
    constraints[splitter].propagate(this);
    otherConstraints[splitter].propagate(otherSolverState);
    console.log("After split left " + splitter + " " + this.los + " " + this.his);
    console.log("After split right " + splitter + " " + otherSolverState.los + " " + otherSolverState.his);
    return otherSolverState;
  }
};

function Solver(numVars, constraints, provenance) {
  this.numVars = numVars;
  this.constraints = constraints;
  this.provenance = provenance;
}

Solver.prototype = {
  update: function(memory, inputAdds, inputDels, outputAdds, outputDels) {
    var provenance = this.provenance;
    var provenanceConstraint = provenance.start(inputAdds, inputDels);
    if (provenanceConstraint === null) {
      // no changes
      return;
    }

    var constraints = this.constraints.slice();
    for (var i = constraints.length - 1; i >= 0; i--) {
      constraints[i] = constraints[i].copy();
      constraints[i].reset(memory);
    }
    constraints.unshift(provenanceConstraint);

    var numVars = this.numVars;
    var states = [new SolverState(provenance, constraints, makeArray(numVars, least), makeArray(numVars, greatest), false)];
    while (states.length > 0) {
      var state = states.pop();
      state.propagate();
      if (arrayEqual(state.los, state.his)) {
        provenance.why(new Why(state.los.slice()));
      } else if (state.isFailed === false) {
        states.push(state);
        states.push(state.split());
      }
    }

    provenance.finish(outputAdds, outputDels);
  }
};

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

var m = MTree.empty(3);
var c0 = MTreeConstraint.fresh([0,1,2]);
var c1 = MTreeConstraint.fresh([0,1,2]);
var p = Provenance.empty(3, 3);
var s = new Solver(3, [c0, c1], p);

var inputAdds = [];
var inputDels = [];
var outputAdds = [];
var outputDels = [];
s.update(m, inputAdds, inputDels, outputAdds, outputDels);
assert(nestedEqual(outputAdds, []));
assert(nestedEqual(outputDels, []));

m.update([new Volume([0,0,0],[0,0,0])], []);
var inputAdds = [[0,0,0]];
var inputDels = [];
var outputAdds = [];
var outputDels = [];
s.update(m, inputAdds, inputDels, outputAdds, outputDels);
assert(nestedEqual(outputAdds, [[0,0,0]]));
assert(nestedEqual(outputDels, []));

var solverProps = {
  selfJoin: forall(gen.array(gen.eav()),
                     function (facts) {
                       var tree = btree(10, 3);
                       var constraint0 = new IteratorConstraint(iterator(tree));
                       var constraint1 = new IteratorConstraint(iterator(tree));
                       var selfSolver = solver(3, [constraint0, constraint1], [[0,1,2],[0,1,2]]);
                       for (var i = 0; i < facts.length; i++) {
                         tree.add(facts[i]);
                       }
                       var returnedFacts = [];
                       selfSolver.solve(returnedFacts);

                       var expectedFacts = tree.keys();
                       return nestedEqual(returnedFacts, expectedFacts);
                     }),

  productJoin: forall(gen.array(gen.eav()),
                     function (facts) {
                       var tree = btree(10, 3);
                       var constraint0 = new IteratorConstraint(iterator(tree));
                       var constraint1 = new IteratorConstraint(iterator(tree));
                       var productSolver = solver(6, [constraint0, constraint1], [[0,1,2],[3,4,5]]);
                       for (var i = 0; i < facts.length; i++) {
                         tree.add(facts[i]);
                       }
                       var returnedFacts = [];
                       productSolver.solve(returnedFacts);

                       var uniqueSortedFacts = tree.keys();
                       var expectedFacts = [];
                       for (var i = 0; i < uniqueSortedFacts.length; i++) {
                         for (var j = 0; j < uniqueSortedFacts.length; j++) {
                           expectedFacts.push(uniqueSortedFacts[i].concat(uniqueSortedFacts[j]));
                         }
                       }
                       return nestedEqual(returnedFacts, expectedFacts);
                     })
};

assertAll(solverProps, {tests: 5000});

function solverRegressionTest() {
  var tree0 = btree(10, 2);
  var tree1 = btree(10, 2);
  var constraint0 = new IteratorConstraint(iterator(tree0));
  var constraint1 = new IteratorConstraint(iterator(tree1));
  var regressionSolver = solver(3, [constraint0, constraint1], [[0,2],[1,2]]);

  tree0.add(["a", "b"]);
  tree0.add(["b", "c"]);
  tree0.add(["c", "d"]);
  tree0.add(["d", "b"]);

  tree1.add(["b", "a"]);
  tree1.add(["c", "b"]);
  tree1.add(["d", "c"]);
  tree1.add(["b", "d"]);

  var returnedFacts = [];
  regressionSolver.solve(returnedFacts);
  assert(nestedEqual(returnedFacts, [["a","c","b"],["b","d","c"],["c","b","d"],["d","c","b"]]));
}

solverRegressionTest();
