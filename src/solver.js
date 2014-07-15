var least = false;
var greatest = undefined;

function makeArray(len, fill) {
  var arr = [];
  for(var i = 0; i < len; i++) {
    arr[i] = fill;
  }
  return arr;
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

function clearArray(arr) {
  while (arr.length > 0) {
    arr.pop();
  }
  return arr;
}

function SolverNode(numVars, constraints, los, his, varWatching, constraintDirty, failed, splitter, left, right) {
  this.numVars = numVars;
  this.constraints = constraints;
  this.los = los;
  this.his = his;
  this.varWatching = varWatching;
  this.constraintDirty = constraintDirty;
  this.failed = failed;
  this.splitter = splitter;
  this.left = left;
  this.right = right;
}

function solverNode(numVars, constraints) {
  var los = makeArray(numVars, least);
  var his = makeArray(numVars, greatest);
  var varWatching = makeArray(numVars * constraints.length, false);
  var constraintDirty = makeArray(constraints.length, true);
  var failed = false;
  var splitter = null;
  var left = null;
  var right = null;
  return new SolverNode(numVars, constraints, los, his, varWatching, constraintDirty, failed, splitter, left, right);
}

SolverNode.prototype = {
  copy: function() {
    var copiedConstraints = [];
    for (var i = 0; i < this.constraints.length; i++) {
      copiedConstraints[i] = this.constraints[i].copy();
    }
    return new SolverNode(this.numVars, copiedConstraints,
                          this.los.slice(), this.his.slice(), this.varWatching.slice(), this.constraintDirty.slice(),
                          this.failed, null, null, null);
  },

  setLo: function(index, lo) {
    if(this.los[index] === lo) return;
    if(compare(this.his[index], lo) === -1) {
      //console.log("faile setting lo:", index, lo, this.los, this.his, this.his[index]);
      this.failed = true;
      return;
    }

    this.los[index] = lo;
    this.setDirty(index);
  },

  setHi: function(index, hi) {
    if(this.his[index] === hi) return;
    if(compare(hi, this.los[index]) === -1) {
      //console.log("faile setting hi:", index, hi);
      this.failed = true;
      return;
    }

    this.his[index] = hi;
    this.setDirty(index);
  },

  setEq: function(index, val) {
    var lo = this.los[index];
    var hi = this.his[index];
    if(lo === val && hi === val) return;

    if(compare(val, lo) === -1 || compare(hi, val) === -1) {
      this.failed = true;
      return;
    }

    this.los[index] = val;
    this.his[index] = val;
    this.setDirty(index);
  },

  setWatch: function(index, constraintIndex, val) {
    var i = (index * this.constraints.length) + constraintIndex;
    this.varWatching[i] = val;
  },

  setDirty: function(index) {
    var constraintsLen = this.constraints.length;
    var start = constraintsLen * index;
    var varWatching = this.varWatching;
    var dirty = this.constraintDirty;
    for(var i = 0; i < constraintsLen; i++) {
      if(varWatching[start + i] === true) {
        dirty[i] = true;
      }
    }
  },

  split: function() {
    this.left = this.copy();
    this.right = this.copy();

    var constraints = this.constraints;
    var len = constraints.length;
    for(var i = 0; i < len; i++) {
      if(constraints[i].split(this, i) === true) {
        this.splitter = i;
        return;
      }
    }
    throw new Error("Can't split anything!");
  },

  propagate: function() {
    var constraints = this.constraints;
    var constraintDirty = this.constraintDirty;
    var constraintsLen = constraints.length;
    var curConstraint = 0;

    while ((curConstraint < constraintsLen) && (!this.failed)) {
      if(constraintDirty[curConstraint] === false) {
        curConstraint++;
      } else {
        constraints[curConstraint].propagate(this, curConstraint);
        constraintDirty[curConstraint] = false;
        curConstraint = 0;
      }
    }
  },
};

var SolverTree = function (root) {
  this.root = root;
};

SolverTree.prototype = {
  update: function(remembers, forgets) {
  // TODO
  }
};


function ConstantConstraint(val, index) {
  this.constant = val;
  this.index = index;
}

ConstantConstraint.prototype = {
  reset: function(solver, myIndex) {},
  val: function(solver, myIndex) { return 1; },
  split_left: function(solver, myIndex) { return false; },
  split_right: function(solver, myIndex) {},

  propagate: function(solver, myIndex) {
    solver.setEq(this.index, this.constant);
  }
};


function ContainsConstraint(iterator, vars) {
  this.iterator = iterator;
  this.vars = vars;
  this.scratchKey = makeArray(iterator.tree.key_len, null);
}

ContainsConstraint.prototype = {
  reset: function(solver, myIndex) {
    this.iterator.reset();
  },

  val: function(solver, myIndex) {
    return this.iterator.val();
  },

  split_left: function(solver, myIndex) {
    //console.log("split left: [" + solver.los + "] [" + solver.his + "]", solver);
    var los = solver.los;
    var his = solver.his;
    var vars = this.vars;
    var len = vars.length;
    for(var i = 0; i < len; i++) {
      var cur = vars[i];
      if(los[cur] !== his[cur]) {
        solver.setHi(cur, los[cur]);
        //console.log("split-left-set-hi", cur, los[cur]);
        if(i + 1 < len) {
          solver.setWatch(vars[i + 1], myIndex, true);
        }
        this.propagate(solver, myIndex);
        return true;
      }
    }
    return false;
  },

  split_right: function(solver, myIndex) {
    //console.log("split right: [" + solver.los + "] [" + solver.his + "]", solver);
    var los = solver.los;
    var his = solver.his;
    var vars = this.vars;
    var len = vars.length;
    var scratchKey = this.scratchKey;

    //copy the los
    for(var i = 0; i < len; i++) {
      var cur = vars[i];
      scratchKey[i] = los[cur];
    }

    //find the upper bound
    for(var j = 0; j < len; j++) {
      var cur = vars[j];
      if(scratchKey[j] !== his[cur]) break;
    }

    for(j = j + 1; j < len; j++) {
      scratchKey[j] = greatest;
    }

    //console.log("new scratch: ", scratchKey);

    //then seek forward
    var neueLos = this.iterator.seek_gt(scratchKey);

    //console.log("neueLos right: ", neueLos);
    //if we can't find anything, we're done
    if(!neueLos) {
      solver.failed = true;
      return;
    }

    //update the solver vars
    for(var x = 0; x < len; x++) {
      var cur = vars[x];
      solver.setLo(cur, neueLos[x]);
      if(neueLos[x] !== his[cur]) {
        return;
      }
    }
  },

  propagate: function(solver, myIndex) {

//     //console.log("propagate: [" + solver.los + "] [" + solver.his + "]", solver);
    var los = solver.los;
    var his = solver.his;
    var vars = this.vars;
    var len = vars.length;
    var scratchKey = this.scratchKey;


    //update the scratchKey to represent a new lower bound
    for(var i = 0; i < len; i++) {
      var cur = vars[i];
      scratchKey[i] = los[cur];
      if(los[cur] !== his[cur]) break;
    }

    for(var j = i + 1; j < len; j++) {
      scratchKey[j] = least;
    }

    //console.log("new scratch: ", scratchKey);

    //find a new lower bound in the iterator
    var neueLos = this.iterator.seek_gte(scratchKey);
    //if we can't find anything, we're done
    if(!neueLos) {
      //console.log("nothing in tree for: ", scratchKey);
      solver.failed = true;
      return;
    }

    //console.log("neueLos: ", neueLos);
    //update the solver vars
    for(var x = 0; x < len; x++) {
      var cur = vars[x];
      solver.setLo(cur, neueLos[x]);
      if(neueLos[x] !== his[cur]) {
        solver.setWatch(cur, myIndex, true);
        return;
      }
    }
  }
};

function EqualConstraint(vars) {
  this.vars = vars;
}

EqualConstraint.prototype = {
  reset: function(solver, myIndex) {
    var vars = this.vars;
    var len = vars.length;
    for(var i = 0; i < len; i++) {
      solver.setWatch(vars[i], myIndex, true);
    }
  },

  val: function(solver, myIndex) { return 1; },
  split_left: function(solver, myIndex) { return false; },
  split_right: function(solver, myIndex) {},

  propagate: function(solver, myIndex) {
    var los = solver.los;
    var his = solver.his;
    var vars = this.vars;
    var len = vars.length;
    for(var i = 0; i < len; i++) {
      var cur = vars[i];
      if(los[cur] === his[cur]) {
        for(var j = 0; j < len; j++) {
          solver.setEq(vars[j], los[cur]);
        }
      }
    }
  }
};

function FunctionConstraint(func, index, vars) {
  this.scratch = [];
  this.func = func;
  this.index = index;
  this.vars = vars;
}

FunctionConstraint.prototype = {
    reset: function(solver, myIndex) {
    var vars = this.vars;
    var len = vars.length;
    for(var i = 0; i < len; i++) {
      solver.setWatch(vars[i], myIndex, true);
    }
  },

  val: function(solver, myIndex) { return 1; },
  split_left: function(solver, myIndex) { return false; },
  split_right: function(solver, myIndex) {},

  propagate: function(solver, myIndex) {
    var los = solver.los;
    var his = solver.his;
    var vars = this.vars;
    var len = vars.length;
    var scratch = this.scratch;
    for(var i = 0; i < len; i++) {
      var cur = vars[i];
      if(los[cur] === his[cur]) {
        scratch[i] = los[cur];
      } else {
        break;
      }
    }

    if(i === len) {
      solver.setEq(this.index, this.func.apply(null, scratch));
    }
  }
};

function FilterConstraint(func, vars) {
  this.scratch = [];
  this.func = func;
  this.vars = vars;
}

FilterConstraint.prototype = {
  reset: function(solver, myIndex) {
    var vars = this.vars;
    var len = vars.length;
    for(var i = 0; i < len; i++) {
      solver.setWatch(vars[i], myIndex, true);
    }
  },

  val: function(solver, myIndex) { return 1; },
  split_left: function(solver, myIndex) { return false; },
  split_right: function(solver, myIndex) {},

  propagate: function(solver, myIndex) {
    var los = solver.los;
    var his = solver.his;
    var vars = this.vars;
    var len = vars.length;
    var scratch = this.scratch;
    for(var i = 0; i < len; i++) {
      var cur = vars[i];
      if(los[cur] === his[cur]) {
        scratch[i] = los[cur];
      } else {
        break;
      }
    }

    if(i === len) {
      if(this.func.apply(null, scratch) === false) {
        solver.failed = true;
      }
    }
  }
};

function IntervalConstraint(inVar, loVar, hiVar) {
  this.inVar = inVar;
  this.loVar = loVar;
  this.hiVar = hiVar;
}

IntervalConstraint.prototype = {
  reset: function(solver, myIndex) {
    solver.setWatch(this.loVar, myIndex, true);
    solver.setWatch(this.hiVar, myIndex, true);
  },

  val: function(solver, myIndex) { return 1; },
  split_left: function(solver, myIndex) {
    var los = solver.los;
    var his = solver.his;
    var lo_lo = los[this.loVar];
    var hi_lo = his[this.loVar];
    var lo_hi = los[this.hiVar];
    var hi_hi = his[this.hiVar];
    var in_lo = los[this.inVar];
    var in_hi = his[this.inVar];
    if(lo_lo === hi_lo && lo_hi === hi_hi && in_lo !== in_hi) {
      solver.setHi(this.inVar, Math.ceil(in_lo));
      return true;
    }
    return false;
  },
  split_right: function(solver, myIndex) {
    var inLo = solver.los[this.inVar];
    solver.setLo(this.inVar, Math.ceil(inLo) + 1);
  },

  propagate: function(solver, myIndex) {
    solver.setLo(this.inVar, solver.los[this.loVar]);
    solver.setHi(this.inVar, solver.his[this.hiVar]);
  }
};
