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

function clearArray(arr) {
  while (arr.length > 0) {
    arr.pop();
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

function findKeyGTE(keys, key) {
  var lo = 0;
  var hi = keys.length - 1;
  var mid = 0;
  var midKey;
  var comp = 0;
  while(true) {
    if(hi < lo) return lo;

    mid = lo + Math.floor((hi - lo)/2);
    midKey = keys[mid];
    comp = compareValueArray(midKey, key);

    if(comp === 0) {
      return mid;
    }

    if(comp === -1) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

function findKeyGT(keys, key) {
  var lo = 0;
  var hi = keys.length - 1;
  var mid = 0;
  var midKey;
  var comp = 0;
  while(true) {
    if(hi < lo) return lo;

    mid = lo + Math.floor((hi - lo)/2);
    midKey = keys[mid];
    comp = compareValueArray(midKey, key);

    if(comp === 0) {
      return mid + 1;
    }

    if(comp === -1) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

function volumeContainsPoint(volume, point) {
  assert(volume.length === 2 * point.length);
  var dimensions = point.length;
  for (var i = 0; i < dimensions; i++) {
    if (compareValue(volume[i], point[i]) === 1) return false;
    if (compareValue(volume[dimensions + i], point[i]) === -1) return false;
  }
  return true;
}

function volumeStrictlyContainsPoint(volume, point) {
  assert(volume.length === 2 * point.length);
  var dimensions = point.length;
  for (var i = 0; i < dimensions; i++) {
    if (compareValue(volume[i], point[i]) === 1) return false;
    if (compareValue(volume[dimensions + i], point[i]) === -1) return false;
  }
  for (var i = 0; i < dimensions; i++) {
    if ((compareValue(volume[i], point[i]) === -1) &&
        (compareValue(volume[dimensions + i], point[i]) === 1)) return true;
  }
  return false;
}

function volumeContainsVolume(outerVolume, innerVolume) {
  assert(outerVolume.length === innerVolume.length);
  var dimensions = outerVolume.length / 2;
  for (var i = 0; i < dimensions; i++) {
    if (compareValue(outerVolume[i], innerVolume[i]) === 1) return false;
    if (compareValue(outerVolume[dimensions + i], innerVolume[dimensions + i]) === -1) return false;
  }
  return true;
}

// BTREE

var LEFTCHILD = 0;
var RIGHTCHILD = 1;

function BTreeNode(parent, parentIx, keys, vals, children, lower, upper) {
  this.parent = parent;
  this.parentIx = parentIx;
  this.keys = keys;
  this.vals = vals;
  this.children = children;
  this.lower = lower;
  this.upper = upper;
  this.isNode = true;
}

BTreeNode.prototype = {

  add: function(key, val, maxKeys) {
    var ix = findKeyGTE(this.keys, key, true);
    var keys = this.keys;
    if(keys.length > ix && compareValueArray(key, keys[ix]) === 0) {
      return this.vals[ix];
    }
    if(!this.children) {
      this.push(ix, [key, val], null);
      this.maintainInvariants(maxKeys);
      return null;
    }
    this.children[ix].add(key, val, maxKeys);
    return null;
  },

  del: function(key, maxKeys) {
    var ix = findKeyGTE(this.keys, key, true);
    var keys = this.keys;
    var children = this.children;
    if(keys.length > ix && compareValueArray(key, keys[ix]) === 0) {
      var val = this.vals[ix];
      if(!children) {
        this.pop(ix);
        this.maintainInvariants(maxKeys);
        return val;
      }

      var node = children[ix + 1];
      while(node.children) {
        node = node.children[0];
      }

      this.keys[ix] = node.keys[0];
      this.vals[ix] = node.vals[0];
      node.pop(0);
      node.maintainInvariants(maxKeys);
      this.maintainInvariants(maxKeys);
      return val;
    }

    if(!children) return null;
    this.children[ix].del(key, maxKeys);
    return null;
  },

  push: function(ix, keyValChild, childType) {
    var children = this.children;
    this.keys.splice(ix, 0, keyValChild[0]);
    this.vals.splice(ix, 0, keyValChild[1]);
    if(children) {
      var childIx = ix + childType;
      children.splice(childIx, 0, keyValChild[2]);
    }
  },

  pop: function(ix, childType) {
    var keys = this.keys;
    var vals = this.vals;
    var children = this.children;
    var key = keys[ix];
    var val = vals[ix];

    keys.splice(ix, 1);
    vals.splice(ix, 1);

    if(children) {
      var childIx = ix + childType;
      var child = children[childIx];
      children.splice(childIx, 1);
      child.parent = null;
      return [key, val, child];
    }
    return [key, val];
  },

  maintainInvariants: function(maxKeys) {
    assert(maxKeys > 0, "Invalid maxKeys: " + maxKeys);
    //If we're still a valid node
    var parent = this.parent;
    if(parent) {
      var minKeys = Math.floor(maxKeys / 2);
      var children = this.children;

      //maintain children's parent relationships
      if(children) {
        var childrenLen = children.length;
        for(var i = 0; i < childrenLen; i++) {
          var child = children[i];
          child.parentIx = i;
          child.parent = this;
        }
      }

      var keys = this.keys;
      var keysLen = keys.length;
      //If we have too many keys split and be done
      if(keysLen > maxKeys) return this.split(maxKeys);

      //if we have two few keys rotate left
      if(keysLen < minKeys && parent.isNode) return this.rotateLeft(maxKeys);

      //if we have no keys
      if(keysLen === 0) {

        if(!children){
          this.lower = null;
          this.upper = null;
          return;
        }

        //otherwise we're the root node
        children[0].parent = parent;
        parent.root = children[0];
        return;

      }

      //otherwise, we have keys, keep lower and upper correct
      this.updateLower(!children ? keys[0] : children[0].lower);
      this.updateUpper(!children ? keys[keysLen - 1] : children[children.length - 1].upper);
    }
  },

  updateLower: function(newLower) {
    //TODO: should this be an assert?
    if(newLower) {
      this.lower = newLower;
      if(this.parent.isNode && this.parentIx === 0) {
        this.parent.updateLower(newLower);
      }
    }
  },

  updateUpper: function(newUpper) {
    //TODO: should this be an assert?
    if(newUpper) {
      this.upper = newUpper;
      if(this.parent.isNode && this.parentIx === this.parent.children.length - 1) {
        this.parent.updateUpper(newUpper);
      }
    }
  },

  split: function(maxKeys) {
    var keys = this.keys;
    var keysLen = keys.length;
    var parent = this.parent;
    var median = Math.floor(keysLen / 2);
    var right = new BTreeNode(parent, this.parentIx + 1, [], [], this.children ? [] : null, null, null);
    while(keys.length > median + 1) {
      var p = this.pop(keys.length - 1, RIGHTCHILD);
      right.push(0, p, RIGHTCHILD);
    }
    if(this.children) {
      right.children.unshift(this.children.pop());
    }
    parent.push(this.parentIx, [keys.pop(), this.vals.pop(), right], RIGHTCHILD);
    this.maintainInvariants(maxKeys);
    right.maintainInvariants(maxKeys);
    parent.maintainInvariants(maxKeys);
  },

  rotateLeft: function(maxKeys) {
    var parentIx = this.parentIx;
    var parent = this.parent;
    if(parentIx > 0) {
      var left = parent.children[parentIx - 1];
      var minKeys = Math.floor(maxKeys / 2);
      var leftKeysLen = left.keys.length;
      if(leftKeysLen > minKeys) {
        var kvc = left.pop(leftKeysLen - 1, RIGHTCHILD);
        var separatorIx = parentIx - 1;
        this.push(0, [parent.keys[separatorIx], parent.vals[separatorIx], kvc[2]], LEFTCHILD);
        parent.keys[separatorIx] = kvc[0];
        parent.vals[separatorIx] = kvc[1];
        this.maintainInvariants(maxKeys);
        left.maintainInvariants(maxKeys);
        parent.maintainInvariants(maxKeys);
        return;
      }
    }
    this.rotateRight(maxKeys);
  },

  rotateRight: function(maxKeys) {
    var parentIx = this.parentIx;
    var parent = this.parent;
    var parentChildren = parent.children;
    if(parentIx < parentChildren.length - 2) {
      var right = parentChildren[parentIx + 1];
      var minKeys = Math.floor(maxKeys / 2);
      var rightKeysLen = right.keys.length;
      if(rightKeysLen > minKeys) {
        var kvc = right.pop(rightKeysLen - 1, LEFTCHILD);
        var separatorIx = parentIx;
        this.push(this.keys.length, [parent.keys[separatorIx], parent.vals[separatorIx], kvc[2]], RIGHTCHILD);
        parent.keys[separatorIx] = kvc[0];
        parent.vals[separatorIx] = kvc[1];
        this.maintainInvariants(maxKeys);
        right.maintainInvariants(maxKeys);
        parent.maintainInvariants(maxKeys);
        return;
      }
    }
    this.merge(maxKeys);
  },

  merge: function(maxKeys) {
    var parent = this.parent;
    var parentIx = this.parentIx;
    var separatorIx = parentIx > 0 ? parentIx - 1 : parentIx;
    var kvc = parent.pop(separatorIx, RIGHTCHILD);
    var left = parent.children[separatorIx];
    var right = kvc[2];

    left.push(left.keys.length, [kvc[0], kvc[1], right.children ? right.children.shift() : null], RIGHTCHILD);
    while(right.keys.length > 0) {
      left.push(left.keys.length, right.pop(0, LEFTCHILD), RIGHTCHILD);
    }
    left.maintainInvariants(maxKeys);
    right.maintainInvariants(maxKeys);
    parent.maintainInvariants(maxKeys);
  },

  assertInvariants: function(maxKeys) {
    // TODO finish porting from cljs version
    return true;
  },

  foreach: function(f) {
    var children = this.children;
    var keys = this.keys;
    var vals = this.vals;
    var keysLen = keys.length;
    if(children) {
      for(var i = 0; i < keysLen; i++) {
        children[i].foreach(f);
        f(keys[i], vals[i]);
      }
      children[keysLen].foreach(f);
    } else {
      for(var i = 0; i < keysLen; i++) {
        f(keys[i], vals[i]);
      }
    }
  },

  foreachReverse: function(f) {
    var children = this.children;
    var keys = this.keys;
    var vals = this.vals;
    var keysLen = keys.length;
    if(children) {
      for(var i = keysLen; i > -1; i--) {
        children[i].foreach(f);
        f(keys[i], vals[i]);
      }
    } else {
      for(var i = keysLen - 1; i > -1; i--) {
        f(keys[i], vals[i]);
      }
    }
  },

};

function BTree(root, maxKeys, keyLen) {
  this.root = root;
  this.maxKeys = maxKeys;
  this.keyLen = keyLen;
  this.isNode = false;
}

function btree(minKeys, keyLen) {
  var root = new BTreeNode(this, 0, [], [], null, null, null);
  var maxKeys = minKeys * 2;
  return new BTree(root, maxKeys, keyLen);
}

BTree.prototype = {
  reset: function() {
    this.root = new BTreeNode();
  },

  add: function(key, val) {
    return this.root.add(key, val, this.maxKeys);
  },

  del: function(key) {
    return this.root.del(key, this.maxKeys);
  },

  push: function(ix, keyValChild, childType) {
    var right = this.root;
    var left = this.root;
    if(childType === LEFTCHILD) {
      left = keyValChild[2];
    } else if (childType === RIGHTCHILD) {
      right = keyValChild[2];
    }

    this.root = new BTreeNode(this, 0, [keyValChild[0]], [keyValChild[1]], [left, right], left.lower, right.upper);
    left.parent = this.root;
    left.parentIx = 0;
    right.parent = this.root;
    right.parentIx = 1;
  },

  maintainInvariants: function() {
  },

  assertInvariants: function() {
    if(this.root.keys.length > 0) {
      return this.root.assertInvariants(this.maxKeys);
    }
    return true;
  },

  foreach: function(f) {
    this.root.foreach(f);
  },

  foreachReverse: function(f) {
    this.root.foreachReverse(f);
  },

  keys: function() {
    var results = [];
    var i = 0;
    this.foreach(function(k, v) {
      results[i] = k;
      i++;
    });
    return results;
  },

  elems: function() {
    var results = [];
    var i = 0;
    this.foreach(function(k, v) {
      results[i] = k;
      results[i+1] = v;
      i = i + 2;
    });
    return results;
  },

  isEmpty: function() {
    return this.root.keys.length === 0;
  },

  toString: function() {
    return "<btree " + this.elems().toString() + ">";
  }

};

// ITERATORS

function Iterator(tree, node, ix) {
  this.tree = tree;
  this.node = node;
  this.ix = ix;
  this.keyLen = tree.keyLen;
}

function iterator(tree) {
  var node = tree.root;
  var ix = 0;
  return new Iterator(tree, node, ix);
}

Iterator.prototype = {
  reset: function() {
    this.node = this.tree.root;
    this.ix = 0;
  },

  seekGt: function(key) {
    while(true) {
      if(this.node.parent.isNode && ((compareValueArray(this.node.upper, key) === -1) || compareValueArray(key, this.node.lower) === -1)) {
        this.ix = 0;
        this.node = this.node.parent;
      } else {
        while(true) {
          this.ix = findKeyGT(this.node.keys, key);
          if(!this.node.children) {
            if(this.ix < this.node.keys.length) {
              return this.node.keys[this.ix];
            } else {
              return null;
            }
          } else {
            if(compareValueArray(this.node.children[this.ix].upper, key) === -1) {
              return this.node.keys[this.ix];
            } else {
              this.node = this.node.children[this.ix];
              this.ix = 0;
            }
          }

        }
        return null;
      }
    }
  },

  seekGte: function(key) {
    while(true) {
      if(this.node.parent.isNode && ((compareValueArray(this.node.upper, key) === -1) || compareValueArray(key, this.node.lower) === -1)) {
        this.ix = 0;
        this.node = this.node.parent;
      } else {
        while(true) {
          this.ix = findKeyGTE(this.node.keys, key);
          if(!this.node.children) {
            if(this.ix < this.node.keys.length) {
              return this.node.keys[this.ix];
            } else {
              return null;
            }
          } else {
            if(compareValueArray(this.node.children[this.ix].upper, key) === -1) {
              return this.node.keys[this.ix];
            } else {
              this.node = this.node.children[this.ix];
              this.ix = 0;
            }
          }

        }
        return null;
      }
    }
  },

  contains: function(key) {
    var found = this.seekGte(key);
    return found && arrayEqual(found, key);
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
      return greatest;
    }
    for (var i = 0; i < currentVar; i++) {
      if (searchKey[i] !== nextKey[i]) {
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
                       var productSolver = solver(3, [constraint0, constraint1], [[0,1,2],[0,1,2]]);
                       for (var i = 0; i < facts.length; i++) {
                         tree.add(facts[i]);
                       }
                       var returnedFacts = [];
                       productSolver.solve(returnedFacts);

                       var expectedFacts = tree.keys();
                       return nestedEqual(returnedFacts, expectedFacts);
                     }),

  productJoin: forall(gen.array(gen.eav()),
                     function (facts) {
                       console.log(facts.length);
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
