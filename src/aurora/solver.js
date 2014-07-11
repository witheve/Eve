//"use strict";

var least = false;
var greatest = undefined;

function compare(a, b) {
  if(a === b) return 0;
  var at = typeof a;
  var bt = typeof b;
  if((at === bt && a < b) || (at < bt)) return -1;
  return 1;
}

function keyEq(a, b) {
  var len = a.length;
  if(len !== b.length) throw new Error("keyEq on arrays of different lenght: " + a + " :: " + b);
  for(var i = 0; i < len; i++) {
    if(a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

function makeArray(len, fill) {
  var arr = [];
  for(var i = 0; i < len; i++) {
    arr[i] = fill;
  }
  return arr;
}

function cloneArray(old) {
  var len = old.length;
  var arr = [];
  for(var i = 0; i < len; i++) {
    arr[i] = old[i];
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

function Solver(numVars, constraints) {
  this.numVars = numVars;
  this.los = makeArray(numVars, least);
  this.his = makeArray(numVars, greatest);
  this.varWatching = makeArray(numVars * constraints.length, false);
  this.constraintDirty = makeArray(constraints.length, true);
  this.constraints = constraints;
  this.failed = false;
  this.depth = 0;
  this.pushedLos = [];
  this.pushedHis = [];
  this.pushedVarWatching = [];
  this.pushedDirty = [];
  this.pushedSplitters = [];
}

Solver.prototype = {
  reset: function() {
    var varsLen = this.numVars;
    var constraintsLen = this.constraints.length;

    this.depth = 0;
    this.failed = false;

    var his = this.his;
    var los = this.los;
    for(var i = 0; i < varsLen; i++) {
      los[i] = least;
      his[i] = greatest;
    }

    var varWatching = this.varWatching;
    var constraints = this.constraints;
    for(var i = 0; i < constraintsLen; i++) {
      varWatching[i] = false;
      constraints[i].reset(this, i);
    }

    var constraintDirty = this.constraintDirty;
    var dirtyLen = constraintsLen * varsLen;
    for(var i = 0; i < dirtyLen; i++) {
      constraintDirty[i] = true;
    }

    clearArray(this.pushedLos);
    clearArray(this.pushedHis);
    clearArray(this.pushedVarWatching);
    clearArray(this.pushedDirty);
    clearArray(this.pushedSplitters);
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

  set_eq: function(index,val) { this.setEq(index,val); },
  set_hi: function(index,val) { this.setHi(index,val); },
  set_lo: function(index,val) { this.setLo(index,val); },
  set_watch: function(index,cindex, val) { this.setWatch(index,cindex,val); },
  set_dirty: function(index) { this.setDirty(index); },

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
    var depth = this.depth;
    pushInto(depth, this.los, this.pushedLos);
    pushInto(depth, this.his, this.pushedHis);
    pushInto(depth, this.varWatching, this.pushedVarWatching);
    pushInto(depth, this.constraintDirty, this.pushedDirty);
    this.depth = depth + 1;

    var constraints = this.constraints;
    var len = constraints.length;
    for(var i = 0; i < len; i++) {
      if(constraints[i].split_left(this, i) === true) {
        this.pushedSplitters.push(i);
        return;
      }
    }
    throw new Error("Can't split anything!");
  },

  backtrack: function() {
    this.failed = false;
    var depth = this.depth = this.depth - 1;
    popFrom(depth, this.los, this.pushedLos);
    popFrom(depth, this.his, this.pushedHis);
    popFrom(depth, this.varWatching, this.pushedVarWatching);
    popFrom(depth, this.constraintDirty, this.pushedDirty);
    var splitter = this.pushedSplitters.pop();
    this.constraints[splitter].split_right(this, splitter);
  },

  next: function() {
    var constraints = this.constraints;
    var constraintsLen = constraints.length;
    var curConstraint = 0;

    while(true) {
      //console.log("*********************iter******************", curConstraint, this.los, this.his, this.failed);
      if(this.failed && this.depth > 0) {
        //if we've failed, back up
        this.backtrack();
        curConstraint = 0;
      } else if(this.failed) {
        //we're done
        return null;
      } else if(curConstraint >= constraintsLen) {
        //console.log("*** no constraints: ", this.los, this.his);
        //we've gone through all the constraints, we're either at a value
        if(keyEq(this.los, this.his)) {
          //console.log("found result: " + this.los);
          this.failed = true;
          return cloneArray(this.los);
        } else {
          //or we need to split
          //console.log("Splitting: ", this.los, this.his);
          this.split();
          curConstraint = 0;
        }
      } else {
        //otherwise, we need to keep going through the constraints.
        //If this one isn't dirty, go to the next
        if(this.constraintDirty[curConstraint] === false) {
          curConstraint++;
        } else {
          constraints[curConstraint].propagate(this, curConstraint);
          this.constraintDirty[curConstraint] = false;
          curConstraint = 0;
        }
      }
    }
  },

  val: function() {
    var res = 1;
    var constraints = this.constraints;
    var constraintsLen = constraints.length;
    for(var i = 0; i < constraintsLen; i++) {
      res = res * constraints[i].val(this, i);
    }
    return res;
  },

  elems: function() {
    var final = [];
    var cur = this.next();
    while(cur) {
      //console.log("PUSHING RESULT: ", cur);
      final.push(cur);
      final.push(this.val());
      cur = this.next();
    }
    return final;
  },

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
