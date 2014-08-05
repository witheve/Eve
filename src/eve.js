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
  assert(len === local.len);
  for (var i = 0; i < len; i++) {
    local[i] = remote[ixes[i]];
  }
}

function writeTo(ixes, local, remote) {
  var len = ixes.length;
  assert(len === local.len);
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

  constraint: function(ixes) {
    var volumes = this.volumes.slice();
    var los = makeArray(ixes.length, least);
    var his = makeArray(ixes.length, greatest);
    return new MTreeConstraint(ixes, this, volumes, los, his);
  }
};

MTreeConstraint.prototype = {
  reset: function(mtree) {
    this.volumes = mtree.volumes.slice();
    fillArray(this.los, least);
    fillArray(this.his, greatest);
  },

  copy: function() {
    return new MTreeConstraint(this.ixes, this.mtree, this.volumes.slice(), this.los.slice(), this.his.slice());
  },

  propagate: function(solverState) {
    var ixes = this.ixes;
    var volumes = this.volumes;
    var los = this.los;
    var his = this.his;

    // read old bounds
    readFrom(ixes, solverState.los, los);
    readFrom(ixes, solverState.his, his);

    // constrain volumes
    for (var i = volumes.length - 1; i >= 0; i--) {
      var volume = volumes[i];
      if (containsPointwise(los, his, volume.los, volume.his)) {
        volumes.splice(i, 1);
      }
    }

    // shrink bounds
    fillArray(los, greatest);
    fillArray(his, least);
    for (var i = volumes.length - 1; i >= 0; i--) {
      var volume = volumes[i];
      pushMin(los, volume.los);
      pushMax(his, volume.his);
    }

    // write new bounds
    for (var i = ixes.length - 1; i >= 0; i--) {
      var ix = ixes[i];
      solverState.setLo(ix, los[i]);
      solverState.setHi(ix, his[i]);
    }
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
      return new MTreeConstraint(this.ixes, this.mtree, splitVolumes, this.los.slice(), this.his.slice());
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

PTree.prototype = {
  erase: function(points, erasedWhyNots) {
    var whyNots = this.whyNots;
    outer: for (var i = whyNots.length - 1; i >= 0; i--) {
      var whyNot = whyNots[i];
      var los = whyNot.los;
      var his = whyNot.his;
      inner: for (var j = points.length - 1; j >= 0; j--) {
        var point = points[j];
        if (containsPointwise(los, his, point, point)) {
          whyNots.splice(i, 1);
          erasedWhyNots.push(i);
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
  this.whyNot(leastArray(numVars), leastArray(factLen), greatestArray(factLen));
}

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
      return new MTreeConstraint(this.ixes, new MTree(this.factLen, erasedWhyNots));
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

function SolverState(provenance, constraints, los, his, numUnfixed, isChanged, isFailed) {
  this.provenance = provenance;
  this.constraints = constraints;
  this.los = los;
  this.his = his;
  this.numUnfixed = numUnfixed;
  this.isChanged = isChanged;
  this.isFailed = isFailed;
}

SolverState.prototype = {
  // TODO handle provenance

  setLo: function(ix, newLo) {
    var los = this.los;
    if (compareValue(los[ix], newLo) === -1) {
      var his = this.his;
      var hilo = compareValue(his[ix], newLo);
      if (hilo === -1) {
        this.isFailed = true;
      } else {
        los[ix] = newLo;
        this.isChanged = true;
        if (hilo === 0) this.numUnfixed -= 1;
      }
    }
  },

  setHi: function(ix, newHi) {
    var his = this.his;
    if (compareValue(his[ix], newHi) === 1) {
      var los = this.los;
      var lohi = compareValue(los[ix], newHi);
      if (lohi === 1) {
        this.isFailed = true;
      } else {
        his[ix] = newHi;
        this.isChanged = true;
        if (lohi === 0) this.numUnfixed -= 1;
      }
    }
  },

  propagate: function() {
    var constraints = this.constraints;
    var numConstraints = this.constraints.length;
    var lastChanged = 0;
    var current = 0;
    while (true) {
      if (this.isFailed === true) break;
      this.isChanged = false;
      constraints[current].propagate(this);
      if (this.isChanged === true) lastChanged = current;
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
    for (var copier = constraints.length - 1; copier >= 0; copier--) {
      if (copier !== splitter) {
        otherConstraints[copier] = constraints[copier].copy();
      }
    }
    var otherSolverState = new SolverState(this.provenance, otherConstraints, this.los.splice(), this.his.splice(), this.numFixed, this.isChanged, this.isFailed);
    constraints[splitter].propagate(this);
    otherConstraints[splitter].propagate(otherSolverState);
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
    var states = [new SolverState(provenance, constraints, makeArray(least), makeArray(greatest), numVars, false, false)];
    while (states.length > 0) {
      var state = states.pop();
      state.propagate();
      if (state.numUnfixed === 0) {
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

// ORDERING TESTS

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

var orderingProps = {
  valueBounds: forall(gen.value(),
                      function (v) {
                        return (compareValue(v, least) === 1) && (compareValue(least, v) === -1) &&
                          (compareValue(v, greatest) === -1) && (compareValue(greatest, v) === 1);
                      }),

  valueEquality: forall(gen.value(), gen.value(),
                        function (v1, v2) {
                          return (compareValue(v1, v2) === 0) === (v1 === v2);
                        }),

  valueReflexive: forall(gen.value(),
                         function (v) {
                           return compareValue(v,v) === 0;
                         }),

  valueTransitive: forall(gen.value(), gen.value(), gen.value(),
                         function (v1, v2, v3) {
                           var c12 = compareValue(v1, v2);
                           var c23 = compareValue(v2, v3);
                           var c13 = compareValue(v1, v3);
                           return (c12 === c23) ? (c13 === c23) : true;
                         }),

  valueArrayBounds: forall(gen.eav(),
                           function (v) {
                             return (comparePointwise(v, leastArray(v.length)) === 1) && (comparePointwise(leastArray(v.length), v) === -1) &&
                               (comparePointwise(v, greatestArray(v.length)) === -1) && (comparePointwise(greatestArray(v.length), v) === 1);
                           }),

  valueArrayEquality: forall(gen.eav(), gen.eav(),
                        function (v1, v2) {
                          return (comparePointwise(v1, v2) === 0) === arrayEqual(v1, v2);
                        }),

  valueArrayReflexive: forall(gen.eav(),
                         function (v) {
                           return comparePointwise(v,v) === 0;
                         }),

  valueArrayTransitive: forall(gen.eav(), gen.eav(), gen.eav(),
                         function (v1, v2, v3) {
                           var c12 = comparePointwise(v1, v2);
                           var c23 = comparePointwise(v2, v3);
                           var c13 = comparePointwise(v1, v3);
                           return (c12 === c23) ? (c13 === c23) : true;
                         }),
};

assertAll(orderingProps, {tests: 1000});

// BTREE TESTS

gen.action = function(n) {
  var valueArray = gen.array(gen.value(), n);
  var integer = jsc.integer();
  return {
    arbitrary: function(size) {
      if (jsc._.random(0,1) === 0) {
        return ["add", valueArray.arbitrary(size), integer.arbitrary(size)];
      } else {
        return ["del", valueArray.arbitrary(size)];
      }
    },
    randomShrink: function(action) {
      var shrunk = action.slice();
      shrunk[1] = valueArray.randomShrink(shrunk[1]);
      return shrunk;
    },
    show: JSON.stringify
  };
};

function modelBTreeAdd(model, key, val) {
  for (var i = 0; i < model.length; i++) {
    if (arrayEqual(key, model[i][0])) {
      return model[i][1];
    }
  }
  model.push([key, val]);
  return null;
}

function modelBTreeDel(model, key) {
   for (var i = 0; i < model.length; i++) {
    if (arrayEqual(key, model[i][0])) {
      var val = model[i][1];
      model.splice(i, 1);
      return val;
    }
  }
  return null;
}

function modelBTree(actions) {
  var model = [];
  var results = [];
  for (var i = 0; i < actions.length; i++) {
    var action = actions[i];
    if (action[0] === "add") {
      results.push(modelBTreeAdd(model, action[1], action[2]));
    } else {
      results.push(modelBTreeDel(model, action[1]));
    }
  }
  model.sort(function (a,b) {
    return comparePointwise(a[0], b[0]);
  });
  var elems = [];
  for (var i = 0; i < model.length; i++) {
    elems.push(model[i][0], model[i][1]);
  }
  return [elems, results];
}

function realBTree(actions, minkeys, keylen) {
  var tree = btree(minkeys, keylen);
  var results = [];
  for (var i = 0; i < actions.length; i++) {
    var action = actions[i];
    if (action[0] === "add") {
      results.push(tree.add(action[1], action[2]));
    } else {
      results.push(tree.del(action[1]));
    }
  }
  return [tree, results];
}

var btreeProps = {
  building: forall(gen.array(gen.action(3)),
                  function (actions) {
                    var modelResults = modelBTree(actions);
                    var realResults = realBTree(actions, 10, 3);
                    realResults[0].assertInvariants();
                    return nestedEqual(modelResults[0], realResults[0].elems()) && arrayEqual(modelResults[1], realResults[1]);
                  })
};

assertAll(btreeProps, {tests: 1000});

// ITERATOR TESTS

gen.movement = function(n) {
  var valueArray = gen.array(gen.value(), n);
  return {
    arbitrary: function(size) {
      if (jsc._.random(0,1) === 0) {
        return ["gte", valueArray.arbitrary(size)];
      } else {
        return ["gt", valueArray.arbitrary(size)];
      }
    },
    randomShrink: function(movement) {
      var shrunk = movement.slice();
      shrunk[1] = valueArray.randomShrink(shrunk[1]);
      return shrunk;
    },
    show: JSON.stringify
  };
};

function modelIterator(keys, movements) {
  var results = [];
  for (var i = 0; i < movements.length; i++) {
    var movement = movements[i];
    var bound = (movement[0] === "gt") ? -1 : 0;
    var search = movement[1];
    var result = null;
    for (var j = 0; j < keys.length; j++) {
      var key = keys[j];
      if ((comparePointwise(search, key) <= bound) && ((result === null) || (comparePointwise(key, result) === -1))) {
        result = key;
      }
    }
    results.push(result);
  }
  return results;
}

function realIterator(tree, movements) {
  var results = [];
  var it = iterator(tree);
  for (var i = 0; i < movements.length; i++) {
    var movement = movements[i];
    if (movement[0] === "gt") {
      results.push(it.seekGt(movement[1]));
    } else {
      results.push(it.seekGte(movement[1]));
    }
  }
  return results;
}

var iteratorProps = {
  moving: forall(gen.array(gen.action(3)), gen.array(gen.movement(3)),
                function(actions, movements) {
                  var tree = realBTree(actions, 10, 3)[0];
                  var modelResults = modelIterator(tree.keys(), movements);
                  var realResults = realIterator(tree, movements);
                  return nestedEqual(modelResults, realResults);
                })
};

assertAll(iteratorProps, {tests: 1000});

// SOLVER TESTS

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
