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

function MTree(volumes) {
  this.volumes = volumes;
}

function mtree() {
  return new MTree([]);
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
  }
};

function MTreeConstraint(volumes) {
  this.volumes = volumes;
}

function mtreeConstraint(mtree) {
  return new MTreeConstraint(mtree.volumes.slice());
}

MTreeConstraint.prototype = {
  copy: function() {
    return new MTreeConstraint(this.volumes.slice());
  },

  propagate: function(los, his) {
    var volumes = this.volumes;

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

function ptree() {
  return new PTree([], []);
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

function Provenance(whys, whyNots, ptree) {
  this.whys = whys;
  this.whyNots = whyNots;
  this.ptree = ptree;
}

function provenance(numVars, keyLen) {
  var provenance = new Provenance([], [], ptree());
  provenance.whyNot(leastArray(numVars), leastArray(keyLen), greatestArray(keyLen));
  return provenance;
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
    return new MTreeConstraint(erasedWhyNots);
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

function Solver(numVars, numConstraints, constraints, constraintsForVar) {
  this.numVars = numVars;
  this.numConstraints = numConstraints;
  this.constraints = constraints;
  this.constraintsForVar = constraintsForVar;
  this.values = makeArray(numVars, least);
}

function solver(numVars, constraints, varsForConstraint) {
  var numConstraints = constraints.length;
  var constraintsForVar = [];
  for (var i = 0; i < numVars; i++) {
    constraintsForVar[i] = [];
  }
  for (var i = 0; i < numConstraints; i++) {
    var constraint = constraints[i];
    var vars = varsForConstraint[i];
    for (var j = 0; j < vars.length; j++) {
      constraintsForVar[vars[j]].push(constraint);
    }
  }
  return new Solver(numVars, numConstraints, constraints, constraintsForVar);
}

Solver.prototype = {
  solve: function(returnedValues) {

    // init values
    var values = this.values;
    fillArray(values, least);

    // init constraints
    var constraints = this.constraints;
    var numConstraints = this.numConstraints;
    for (var i = 0; i < numConstraints; i++) {
      constraints[i].init();
    }

    // init search
    var numVars = this.numVars;
    var constraintsForVar = this.constraintsForVar;
    var currentVar = 0;
    var value = values[currentVar];
    var constraints = constraintsForVar[currentVar];
    var numConstraints = constraints.length;

    var FIX = 0;
    var DOWN = 1;
    var UP = 2;
    var NEXT = 3;

    var state = FIX;

    // run the search state machine
    search: while (true) {
      switch (state) {

        case FIX: {
          // console.log("FIX " + currentVar + " " + value + " " + values);
          var currentConstraint = 0;
          var lastChanged = 0;
          do {
            var newValue = constraints[currentConstraint].next(value, true);
            if (value !== newValue) {
              lastChanged = currentConstraint;
            }
            value = newValue;
            currentConstraint = (currentConstraint + 1) % numConstraints;
          }
          while ((currentConstraint !== lastChanged) && (value !== greatest));
          if (value === greatest) {
            state = UP;
          } else {
            values[currentVar] = value;
            state = DOWN;
          }
          break;
        }

        case DOWN: {
          // console.log("DOWN " + currentVar + " " + value + " " + values);
          if (currentVar === numVars - 1) {
            returnedValues.push(values.slice());
            state = NEXT;
          } else {
            for (var i = 0; i < numConstraints; i++) {
              constraints[i].down(value);
            }
            currentVar++;
            value = values[currentVar];
            constraints = constraintsForVar[currentVar];
            numConstraints = constraints.length;
            state = FIX;
          }
          break;
        }

        case UP: {
          // console.log("UP " + currentVar + " " + value + " " + values);
          if (currentVar === 0) {
            break search;
          } else {
            values[currentVar] = least;
            currentVar--;
            value = values[currentVar];
            constraints = constraintsForVar[currentVar];
            numConstraints = constraints.length;
            for (var i = 0; i < numConstraints; i++) {
              constraints[i].up();
            }
            state = NEXT;
          }
          break;
        }

        case NEXT: {
          // console.log("NEXT " + currentVar + " " + value + " " + values);
          var value = constraints[0].next(value, false);
          if (value === greatest) {
            state = UP;
          } else {
            values[currentVar] = value;
            state = FIX;
          }
          break;
        }
      }
    }
  }
};

// CONSTRAINTS

function IteratorConstraint(iterator) {
  this.iterator = iterator;
  this.inclusiveSearchKey = makeArray(iterator.keyLen, least);
  this.exclusiveSearchKey = makeArray(iterator.keyLen, greatest);
  this.currentVar = 0;
}

IteratorConstraint.prototype = {
  init: function() {
    this.iterator.reset();
    fillArray(this.inclusiveSearchKey, least);
    fillArray(this.exclusiveSearchKey, greatest);
    this.currentVar = 0;
  },

  up: function() {
    if (this.currentVar < this.inclusiveSearchKey.length) {
      this.inclusiveSearchKey[this.currentVar] = least;
      this.exclusiveSearchKey[this.currentVar] = greatest;
    }
    this.currentVar--;
  },

  down: function(value) {
    this.inclusiveSearchKey[this.currentVar] = value;
    this.exclusiveSearchKey[this.currentVar] = value;
    this.currentVar++;
  },

  next: function(value, isInclusive) {
    var currentVar = this.currentVar;
    var searchKey;
    var nextKey;
    if (isInclusive === true) {
      searchKey = this.inclusiveSearchKey;
      searchKey[currentVar] = value;
      nextKey = this.iterator.seekGte(searchKey);
    } else {
      searchKey = this.exclusiveSearchKey;
      searchKey[currentVar] = value;
      nextKey = this.iterator.seekGt(searchKey);
    }
    // console.log("NEXT KEY " + nextKey + " FROM " + searchKey + " WHEN " + currentVar + " " + value);
    if (nextKey === null) {
      // no more keys
      return greatest;
    }
    for (var i = 0; i < currentVar; i++) {
      if (searchKey[i] !== nextKey[i]) {
        // next key does not match prefix of searchKey
        return greatest;
      }
    }
    return nextKey[currentVar];
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
                             return (compareValueArray(v, leastArray(v.length)) === 1) && (compareValueArray(leastArray(v.length), v) === -1) &&
                               (compareValueArray(v, greatestArray(v.length)) === -1) && (compareValueArray(greatestArray(v.length), v) === 1);
                           }),

  valueArrayEquality: forall(gen.eav(), gen.eav(),
                        function (v1, v2) {
                          return (compareValueArray(v1, v2) === 0) === arrayEqual(v1, v2);
                        }),

  valueArrayReflexive: forall(gen.eav(),
                         function (v) {
                           return compareValueArray(v,v) === 0;
                         }),

  valueArrayTransitive: forall(gen.eav(), gen.eav(), gen.eav(),
                         function (v1, v2, v3) {
                           var c12 = compareValueArray(v1, v2);
                           var c23 = compareValueArray(v2, v3);
                           var c13 = compareValueArray(v1, v3);
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
    return compareValueArray(a[0], b[0]);
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
      if ((compareValueArray(search, key) <= bound) && ((result === null) || (compareValueArray(key, result) === -1))) {
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
