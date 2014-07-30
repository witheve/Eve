//"use strict";

function assert(cond, msg) {
  if(!cond) {
    throw new Error(msg);
  }
}

// ORDERING

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

// BTREE

var LEFTCHILD = 0;
var RIGHTCHILD = 1;

function ScanTree(maxKeys, keyLen, getFunction, aggFunction) {
  this.root = new ScanTreeNode(this, 0, [], [], null, null, null, getFunction, aggFunction);
  this.agg = aggFunction;
  this.get = getFunction;
  this.maxKeys = maxKeys;
  this.keyLen = keyLen;
  this.isNode = false;
}

ScanTree.prototype = {
  reset: function() {
    this.root = new ScanTreeNode(this, 0, [], [], null, null, null, this.get, this.agg);
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

    this.root = new ScanTreeNode(this, 0, [keyValChild[0]], [keyValChild[1]], [left, right], left.lower, right.upper, this.get, this.agg);
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

  aggregate: function(lower, upper) {
    if(!lower) {
      lower = leastArray(this.keyLen);
    }
    if(!upper) {
      upper = greatestArray(this.keyLen);
    }
    return this.root.aggregate(lower,upper);
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
    return "<scantree " + this.elems().toString() + ">";
  }

};

function ScanTreeNode(parent, parentIx, keys, vals, children, lower, upper, getFunction, aggFunction) {
  this.parent = parent;
  this.agg = aggFunction;
  this.get = getFunction;
  this.cachedAgg = null;
  this.parentIx = parentIx;
  this.keys = keys;
  this.vals = vals;
  this.children = children;
  this.lower = lower;
  this.upper = upper;
  this.isNode = true;
  this.dirty = true;
}

ScanTreeNode.prototype = {

  add: function(key, val, maxKeys) {
    var ix = findKeyGTE(this.keys, key, true);
    var keys = this.keys;
    if(keys.length > ix && compareValueArray(key, keys[ix]) === 0) {
      return this.vals[ix];
    }
    this.dirty = true;
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
        node.dirty = true;
        node = node.children[0];
      }

      this.dirty = true;
      this.keys[ix] = node.keys[0];
      this.vals[ix] = node.vals[0];
      node.pop(0);
      node.maintainInvariants(maxKeys);
      this.maintainInvariants(maxKeys);
      return val;
    }

    if(!children) return null;
    this.dirty = true;
    this.children[ix].del(key, maxKeys);
    return null;
  },

  push: function(ix, keyValChild, childType) {
    var children = this.children;
    this.keys.splice(ix, 0, keyValChild[0]);
    this.vals.splice(ix, 0, keyValChild[1]);
    this.dirty = true;
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
    this.dirty = true;

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
    var right = new ScanTreeNode(parent, this.parentIx + 1, [], [], this.children ? [] : null, null, null, this.get, this.agg);
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
    // TODO finish porting
    return true;
  },

  aggregate: function(lower, upper) {
    var inLower = compareValueArray(lower, this.upper) !== 1;
    var inUpper = compareValueArray(upper, this.lower) !== -1;
    var whollyContained = compareValueArray(lower, this.lower) !== 1 && compareValueArray(upper, this.upper) !== -1;
    //if we're not in the range at all, bail
    if(!inUpper && !inLower) {
      return null;
    }
    //If we're wholly contained and not dirty
    if(!this.dirty && whollyContained) {
      return this.cachedAgg;
    }
    var agg = this.agg;
    var cached = null;

    var keys = this.keys;
    var keysLen = keys.length;
    var get = this.get;
    if(keysLen) {
    var firstKey = 0;
      //find the first key greater than or equal to lower
      while(firstKey < keysLen && compareValueArray(keys[firstKey], lower) === -1) {
        firstKey++;
      }
      for(; firstKey < keysLen; firstKey++) {
        var cur = keys[firstKey];
        //if we've passed the upper bound, we're done
        if(compareValueArray(cur, upper) === 1) break;
        cached = agg(cached, get(cur));
      }
    }

    if(this.children) {
      var children = this.children;
      var childrenLen = children.length;
      for(var i = 0; i < childrenLen; i++) {
        var child = children[i];
        cached = agg(cached, children[i].aggregate(lower, upper));
      }
    }
    //if we're wholly contained, cached the value;
    if(whollyContained) {
      this.dirty = false;
      this.cachedAgg = cached;
    }
    return cached;
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

function scantree(minKeys, keyLen, get, agg) {
  return new ScanTree(minKeys * 2, keyLen, get, agg);
}

function IntervalTree(keyLen) {
  this.isNode = false;
  this.keyLen = keyLen;
  this.maxKeys = 10;
  this.upper = greatestArray(keyLen);
  this.lower = leastArray(keyLen);
  this.get = function(cur) {
    return cur;
  }
  this.agg = function(prev, cur) {
    if(!prev) { prev = [greatest, least]; }
    if(compareValue(cur[0], prev[0]) === -1) {
      prev[0] = cur[0];
    }
    if(compareValue(cur[1], prev[1]) === 1) {
      prev[1] = cur[1];
    }
    return prev;
  }
  this.root = new ScanTreeNode(this, 0, [], [], null, null, null, this.get, this.agg);
}

IntervalTree.prototype = Object.create(ScanTree.prototype);
IntervalTree.prototype.findIntervals = function(point) {
  var results = [];
  var resCount = -1;
  var nodes = [this.root];
  var nodeIx = 0;
  var len = nodes.length;
  var lower = this.lower;
  var upper = this.upper;
  while(nodeIx < len) {
    var cur = nodes[nodeIx];
    var range = cur.aggregate(lower, upper);
    //if this agg range contains the point
    if(compareValue(range[0], point) !== 1 && compareValue(range[1], point) !== -1) {
      //add children
      var children = cur.children;
      if(children) {
        var childrenLen = children.length;
        for(var i = 0; i < childrenLen; i++) {
          nodes[len + i] = children[i];
        }
        len += childrenLen;
      }

      //check keys
      var keys = cur.keys;
      var keysLen = keys.length;
      if(keysLen) {
        for(var i = 0; i < keysLen; i++) {
          var key = keys[i];
          if(compareValue(key[0], point) !== 1 && compareValue(key[1], point) !== -1) {
            results[++resCount] = key.slice(0);
          }
        }
      }

    }
    nodeIx++;
  }
  return results;

};

// var intervalTree = new IntervalTree(3);
// for(var i = 0; i < 40; i++) {
//   intervalTree.add([i * 2, i * 2 + 10, "foo" + i]);
// }
// intervalTree.findIntervals(5);

// var adder = scantree(5,
//                      1,
//                      function(cur) {
//                        return cur[0];
//                      },
//                      function(prev, cur) {
//                        return prev + cur;
//                      });

// for(var i = 0; i < 20; i++) {
//   adder.add([i]);
// }

// adder.del([5]);
// adder.aggregate([3], [13]);