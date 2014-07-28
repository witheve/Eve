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

function containsPoint(volume, point) {
  var dimensions = point.length;
  for (var i = 0; i < dimensions; i++) {
    if (compareValue(volume[i], point[i]) === 1) return false;
    if (compareValue(volume[dimensions + i], point[i]) === -1) return false;
  }
  return true;
}

function containsVolume(outerVolume, innerVolume) {
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

// PROVENANCE

function Presence(fact, solverPoint) {
  this.fact = fact;
  this.solverPoint = solverPoint;
}

function Absence(factVolume, proofVolume, solverVolume, constraintIx) {
  this.factVolume = factVolume;
  this.proofVolume = proofVolume;
  this.solverVolume = solverVolume;
  this.constraintIx = constraintIx;
}

function SimpleProvenance(presences, absences) {
  this.presences = presences;
  this.absences = absences;
}

function simpleProvenance() {
  return new SimpleProvenance([], []);
}

SimpleProvenance.prototype = {
  present: function(presence) {
    this.presences.push(presence);
  },

  absent: function(absence, returnedForgets) {
    // remove absences/presences which are subsumed
    // return forgetton facts
    var presences = this.presences;
    var absences = this.absences;
    for (var i = presences.length - 1; i >= 0; i--) {
      var thisPresence = presences[i];
      if (containsPoint(absence.factVolume, thisPresence.fact)) {
        presences.splice(i, 1);
        returnedForgets.push(thisPresence.fact);
      }
    }
    for (var i = absences.length - 1; i >= 0; i--) {
      var thisAbsence = absences[i];
      if (containsVolume(absence.factVolume, thisAbsence.factVolume)) {
        absences.splice(i, 1);
        // dont return this, nobody cares
      }
    }
    absences.push(absence);
  },

  remove: function(fact, returnedAbsences) {
    // remove and return absences which may no longer be valid
    var absences = this.absences;
    for (var i = absences.length - 1; i >= 0; i--) {
      var thisAbsence = absences[i];
      if (containsPoint(thisAbsence.proofVolume, fact)) {
        absences.splice(i, 1);
        returnedAbsences.push(thisAbsence);
      }
    }
  },
};

// SEARCH

function SearchSpace(numVars, numConstraints, los, his, watching, dirty, empty, absentVolumes) {
  this.numVars = numVars;
  this.numConstraints = numConstraints;
  this.los = los;
  this.his = his;
  this.watching = watching;
  this.dirty = dirty;
  this.empty = empty;
  this.absentVolumes = absentVolumes;
}

function searchSpace(numVars, numConstraints) {
  var los = makeArray(numVars, least);
  var his = makeArray(numVars, greatest);
  var watching = makeArray(numVars * numConstraints, false);
  var dirty = makeArray(numConstraints, true);
  var empty = false;
  var absentVolumes = [];
  return new SearchSpace(numVars, numConstraints, los, his, watching, dirty, empty, absentVolumes);
}

SearchSpace.prototype = {
  setVolume: function(volume) {
    popFrom(0, this.los, volume);
    popFrom(1, this.his, volume);
    fillArray(this.watching, false);
    fillArray(this.dirty, true);
    this.empty = false;
    this.absentVolumes.length = 0;
  },

  setWatch: function(varIndex, constraintIndex, val) {
    var i = (varIndex * this.numConstraints) + constraintIndex;
    this.watching[i] = val;
  },

  setDirty: function(varIndex) {
    var numConstraints = this.numConstraints;
    var start = numConstraints * varIndex;
    var watching = this.watching;
    var dirty = this.dirty;
    for(var i = 0; i < numConstraints; i++) {
      if(watching[start + i] === true) {
        dirty[i] = true;
      }
    }
  },

  setLo: function(varIndex, lo) {
    var los = this.los;
    var his = this.his;
    var oldLo = los[varIndex];
    var oldHi = his[varIndex];
    if(compareValue(oldLo, lo) !== -1) return; // no change
    var absentVolume = los.concat(his);
    if(compareValue(oldHi, lo) === -1) {
      this.empty = true;
    } else {
      absentVolume[this.numVars + varIndex] = lo;
    }
    this.absentVolumes.push(absentVolume);
    los[varIndex] = lo;
    this.setDirty(varIndex);
  },

  setHi: function(varIndex, hi) {
    var los = this.los;
    var his = this.his;
    var oldLo = los[varIndex];
    var oldHi = his[varIndex];
    if(compareValue(oldHi, hi) !== 1) return; // no change
    var absentVolume = los.concat(his);
    if(compareValue(oldLo, hi) === 1) {
      this.empty = true;
    } else {
      absentVolume[varIndex] = hi;
    }
    this.absentVolumes.push(absentVolume);
    his[varIndex] = hi;
    this.setDirty(varIndex);
  },

  setEq: function(varIndex, val) {
    this.setLo(varIndex, val);
    this.setHi(varIndex, val);
  },
};

function DepthFirstSearcher(depth, pushedLos, pushedHis, pushedWatching, pushedSplitters) {
  this.depth = depth;
  this.pushedLos = pushedLos;
  this.pushedHis = pushedHis;
  this.pushedWatching = pushedWatching;
  this.pushedSplitters = pushedSplitters;
}

function depthFirstSearcher() {
  var depth = 0;
  var pushedLos = [];
  var pushedHis = [];
  var pushedWatching = [];
  var pushedSplitters = [];
  return new DepthFirstSearcher(depth, pushedLos, pushedHis, pushedWatching, pushedSplitters);
}

DepthFirstSearcher.prototype = {
  split: function(searchSpace, constraints) {
    var depth = this.depth;
    pushInto(depth, searchSpace.los, this.pushedLos);
    pushInto(depth, searchSpace.his, this.pushedHis);
    pushInto(depth, searchSpace.watching, this.pushedWatching);
    this.depth = depth + 1;

    var numConstraints = constraints.length;
    for(var i = 0; i < numConstraints; i++) {
      if(constraints[i].splitLeft(searchSpace, i) === true) {
        this.pushedSplitters.push(i);
        return;
      }
    }
    throw new Error("Can't split anything!");
  },

  backtrack: function(searchSpace, constraints) {
    searchSpace.empty = false;
    var depth = this.depth = this.depth - 1;
    popFrom(depth, searchSpace.los, this.pushedLos);
    popFrom(depth, searchSpace.his, this.pushedHis);
    popFrom(depth, searchSpace.watching, this.pushedWatching);
    fillArray(depth, searchSpace.dirty, false);
    var splitter = this.pushedSplitters.pop();
    constraints[splitter].splitRight(searchSpace, splitter);
  },

  search: function(solver) {
    var searchSpace = solver.searchSpace;
    var constraints = solver.constraints;
    var numConstraints = constraints.length;
    var dirty = searchSpace.dirty;
    var los = searchSpace.los;
    var his = searchSpace.his;
    var provenance = solver.provenance;
    var queuedRemembers = solver.queuedRemembers;

    this.depth = 0;

    // init constraints
    for (var i = 0; i < numConstraints; i++) {
      constraints[i].init(this, i);
    }

    while(true) {
      if (searchSpace.empty) {
        if (this.depth === 0) {
          // cant backtrack, must be finished
          return;
        } else {
          // backtrack
          this.backtrack(searchSpace, constraints);
        }
      } else {
        // find a dirty constraint
        for (var i = 0; i < numConstraints; i++) {
          if (dirty[i] === true) break;
        }

        if (i < numConstraints) {
          // propagate and loop
          constraints[i].propagate(solver, i);
        } else if (arrayEqual(los, his)) {
          // save result and backtrack to right branch
          var fact = los.slice(); // TODO eventually will need to project EAV from los
          queuedRemembers.push(fact);
          provenance.present(new Presence(fact, fact));
          this.backtrack(solver, constraints);
        } else {
          // split and descend to left branch
          this.split(solver, constraints);
        }
      }
    }

    // TODO might want to clean up pushed stuff here so the keys can be GCed?
  }
};

// SOLVER

function Solver(numVars, constraints, memory, provenance, searchSpace, searcher, queuedPresences, queuedAbsences, queuedRemembers, queuedForgets) {
  this.numVars = numVars;
  this.constraints = constraints;
  this.memory = memory;
  this.provenance = provenance;
  this.searchSpace = searchSpace;
  this.searcher = searcher;
  this.queuedPresences = queuedPresences;
  this.queuedAbsences = queuedAbsences;
  this.queuedRemembers = queuedRemembers;
  this.queuedForgets = queuedForgets;
}

function solver(numVars, constraints, memory, provenance) {
  var space = searchSpace(numVars, constraints.length);
  var searcher = depthFirstSearcher();
  var queuedPresences = [];
  var queuedAbsences = [];
  var queuedRemembers = [];
  var queuedForgets = [];
  return new Solver(numVars, constraints, memory, provenance, space, searcher, queuedPresences, queuedAbsences, queuedRemembers, queuedForgets);
}

Solver.prototype = {
  init: function() {
    var allFacts = makeArray(3, least).concat(makeArray(3, greatest));
    var allSpace = makeArray(this.numVars, least).concat(makeArray(this.numVars, greatest));
    this.provenance.absent(new Absence(allFacts, allFacts, allSpace, 0));
  },

  absent: function(proofVolume) {
    var absentVolumes = this.searchSpace.absentVolumes;
    var numAbsentVolumes = absentVolumes.length;
    var provenance = this.provenance;
    for (var i = 0; i < numAbsentVolumes.length; i++) {
      var absentVolume = absentVolumes[i];
      provenance.absent(new Absence(absentVolume, proofVolume, absentVolume)); // TODO eventually need to project EAV from absentVolume
    }
    absentVolumes.length = 0;
  },

  adjust: function(remembers, forgets) {
    var provenance = this.provenance;
    var constraints = this.constraints;
    var queuedAbsences = this.queuedAbsences;

    for (var i = 0; i < remembers.length; i++) {
      var remember = remembers[i];
      queuedAbsences.length = 0;
      provenance.remove(remember, queuedAbsences);
      for (var j = 0; j < queuedAbsences.length; j++) {
        var absence = queuedAbsences[i];
        var constraintIx = absence.constraintIx;
        constraints[constraintIx].remember(this, constraintIx, absence, remember);
      }
    }

    for (var i = 0; i < forgets.length; i++) {
      var forget = forgets[i];
      queuedAbsences.length = 0;
      provenance.remove(forget, queuedAbsences);
      for (var j = 0; j < queuedAbsences.length; j++) {
        var absence = queuedAbsences[i];
        var constraintIx = absence.constraintIx;
        constraints[constraintIx].forget(this, constraintIx, absence, forget);
      }
    }
  },
};

// CONSTRAINTS

function ContainsConstraint(iterator, vars) {
  this.iterator = iterator;
  this.vars = vars;
  this.scratchKey = makeArray(iterator.tree.keyLen, null);
  this.maxKey = makeArray(iterator.tree.keyLen, greatest);
}

ContainsConstraint.prototype = {
  init: function(solver, myIndex) {
    this.iterator.reset();
  },

  setLos: function(solver, myIndex, oldLos, newLos) {
    var searchSpace = solver.searchSpace;
    var vars = this.vars;
    var numVars = vars.length;
    var his = searchSpace.his;

    // update the searchSpace vars
    for (var i = 0; i < numVars; i++) {
      var cur = vars[i];
      searchSpace.setLo(cur, newLos[i], myIndex, oldLos, newLos);
      if(newLos[i] !== his[cur]) {
        searchSpace.setWatch(cur, myIndex, true);
        break;
      }
    }

    // add new absents
    var proofVolume = oldLos.concat(newLos);
    solver.absent(proofVolume);
  },

  propagate: function(solver, myIndex) {
    var searchSpace = solver.searchSpace;
    var los = searchSpace.los;
    var his = searchSpace.his;
    var vars = this.vars;
    var len = vars.length;
    var scratchKey = this.scratchKey;

    // update the scratchKey to represent a new lower bound
    for(var i = 0; i < len; i++) {
      var cur = vars[i];
      scratchKey[i] = los[cur];
      if(los[cur] !== his[cur]) break;
    }

    for(var j = i + 1; j < len; j++) {
      scratchKey[j] = least;
    }

    // find a new lower bound in the iterator
    this.setLos(solver, myIndex, scratchKey, this.iterator.seekGte(scratchKey) || this.maxKey);
  },

  splitLeft: function(solver, myIndex) {
    var searchSpace = solver.searchSpace;
    var los = searchSpace.los;
    var his = searchSpace.his;
    var vars = this.vars;
    var len = vars.length;
    for(var i = 0; i < len; i++) {
      var cur = vars[i];
      if(los[cur] !== his[cur]) {
        searchSpace.setHi(cur, los[cur]);
        if(i + 1 < len) {
          searchSpace.setWatch(vars[i + 1], myIndex, true);
        }
        this.propagate(solver, myIndex);
        return true;
      }
    }
    return false;
  },

  splitRight: function(solver, myIndex) {
    var searchSpace = solver.searchSpace;
    var los = searchSpace.los;
    var his = searchSpace.his;
    var vars = this.vars;
    var len = vars.length;
    var scratchKey = this.scratchKey;

    // copy the los
    for(var i = 0; i < len; i++) {
      var cur = vars[i];
      scratchKey[i] = los[cur];
    }

    // find the upper bound
    for(var j = 0; j < len; j++) {
      var cur = vars[j];
      if(scratchKey[j] !== his[cur]) break;
    }

    for(j = j + 1; j < len; j++) {
      scratchKey[j] = greatest;
    }

    // seek *past* the left branch
    this.setLos(solver, myIndex, scratchKey, this.iterator.seekGt(scratchKey) || this.maxKey);
  },

  remember: function(solver, myIndex, absence, remember) {
    solver.searchSpace.setVolume(absence.solverVolume);
    solver.searcher.search(solver);
  },

  forget: function(solver, myIndex, absence, forget) {
    // we know we are always moving from lower to higher
    var len = forget.length;
    var oldHis = absence.proofVolume.slice(len, 2*len);
    if (arrayEqual(forget, oldHis)) {
      var oldLos = absence.proofVolume.slice(0, len);
      var newLos = this.iterator.seekGt(oldLos) || this.maxKey;
      solver.searchSpace.setVolume(absence.solverVolume);
      this.setLos(solver, myIndex, oldLos, newLos);
    }
  },
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

// PROVENANCE TESTS

function simpleProvenanceTest () {
  var p = simpleProvenance();
  var rf = [];
  var ra = [];

  p.present(new Presence([10,10,10], "sp1"));
  p.present(new Presence([25,25,25], "sp2"));

  var a1 = new Absence([0,0,0,8,8,8], [0,0,0,10,10,10], "sv1", "c1");
  p.absent(a1, rf);
  assert(nestedEqual(rf, []));
  assert(arrayEqual(p.absences, [a1]));

  var a2 = new Absence([5,5,5,10,10,10], [5,5,5,15,15,15], "sv2", "c2");
  p.absent(a2, rf);
  assert(nestedEqual(rf, [[10,10,10]]));
  assert(arrayEqual(p.absences, [a1, a2]));

  var a3 = new Absence([5,5,5,20,20,20], [5,5,5,15,15,15], "sv2", "c2");
  p.absent(a3, rf);
  assert(nestedEqual(rf, [[10,10,10]]));
  assert(arrayEqual(p.absences, [a1, a3]));

  p.remove([9,9,9], ra);
  assert(arrayEqual(ra, [a3, a1]));
  assert(arrayEqual(p.absences, []));
}

simpleProvenanceTest();
