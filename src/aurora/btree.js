(function(window) {

  //"use strict";

  var LEFTCHILD = 0;
  var RIGHTCHILD = 1;


  function compare(a, b) {
    if(a === b) return 0;
    var at = typeof a;
    var bt = typeof b;
    if((at === bt && a < b) || (at < bt)) return -1;
    return 1;
  }

  function keyCompare(a, b) {
    var len = a.length;
    if(len !== b.length) throw new Error("keyLt on arrays of different lenght: " + a + " :: " + b);
    for(var i = 0; i < len; i++) {
      var comp = compare(a[i], b[i]);
      if(comp === 0) continue;
      return comp;
    }
    return 0;
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
      comp = keyCompare(midKey, key);

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

  function assert(cond, msg) {
    if(!cond) {
      throw new Error(msg);
    }
  }

  function Queue() {
    this.inbox = [];
    this.outbox = [];
    this.length = 0;
  }

  Queue.prototype = {
    push: function(thing) {
      this.length++;
      this.inbox.push(thing);
    },

    pop: function() {
      var outbox = this.outbox;
      if(outbox.length > 0) {
        return outbox.pop();
      }

      var inbox = this.inbox;
      for(var i = 0; i < inbox.length; i++) {
        outbox.push(inbox.pop());
      }

      if(outbox.length > 0) {
        this.length--;
        return outbox.pop();
      }
    }
  };

  function Tree(maxKeys, keyLen) {
    this.root = new Node(this, 0, [], [], null, null, null);
    this.maxKeys = maxKeys;
    this.keyLen = keyLen;
    this.isNode = false;
  }

  Tree.prototype = {
    reset: function() {
      this.root = new Node();
    },

    add: function(key, val) {
      this.root.add(key, val, this.maxKeys);
    },

    del: function(key) {
      this.root.del(key, this.maxKeys);
    },

    push: function(ix, keyValChild, childType) {
      var right = this.root;
      var left = this.root;
      if(childType === LEFTCHILD) {
        left = keyValChild[2];
      } else if (childType === RIGHTCHILD) {
        right = keyValChild[2];
      }

      this.root = new Node(this, 0, [keyValChild[0]], [keyValChild[1]], [left, right], left.lower, right.upper);
      left.parent = this.root;
      left.parentIx = 0;
      right.parent = this.root;
      right.parentIx = 1;
    },

    maintain: function() {
    },

    valid: function() {
      if(this.root.keys.length > 0) {
        return this.root.valid(this.maxKeys);
      }
      return true;
    },

    prettyPrint: function() {
      var nodes = new Queue();
      nodes.push(this.root);
      while(nodes.length > 0) {
        var cur = nodes.pop();
        cur.prettyPrint();

        var children = cur.children;
        if(children) {
          var len = children.length;
          for(var i = 0; i < len; i++) {
            nodes.push(children[i]);
          }
        }
      }
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
    }

  };

  function Node(parent, parentIx, keys, vals, children, lower, upper) {
    this.parent = parent;
    this.parentIx = parentIx;
    this.keys = keys;
    this.vals = vals;
    this.children = children;
    this.lower = lower;
    this.upper = upper;
    this.isNode = true;
  }

  Node.prototype = {

    add: function(key, val, maxKeys) {
      var ix = findKeyGT(this.keys, key, true);
      var keys = this.keys;
      if(keys.length > ix && keyCompare(key, keys[ix]) === 0) {
        return this.vals[ix];
      }
      if(!this.children) {
        this.push(ix, [key, val], null);
        this.maintain(maxKeys);
        return null;
      }
      this.children[ix].add(key, val, maxKeys);
    },

    del: function(key, maxKeys) {
      var ix = findKeyGT(this.keys, key, true);
      var keys = this.keys;
      var children = this.children;
      if(keys.length > ix && keyCompare(key, keys[ix]) === 0) {
        var val = this.vals[ix];
        if(!children) {
          this.pop(ix);
          this.maintain(maxKeys);
          return val;
        }

        var node = children[ix + 1];
        while(node.children) {
          node = node.children[0];
        }

        this.keys[ix] = node.keys[0];
        this.vals[ix] = node.vals[0];
        node.pop(0);
        node.maintain(maxKeys);
        this.maintain(maxKeys);
        return val;
      }

      if(!children) return null;
      this.children[ix].del(key, maxKeys);
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

    maintain: function(maxKeys) {
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
      var right = new Node(parent, this.parentIx + 1, [], [], this.children ? [] : null, null, null);
      while(keys.length > median + 1) {
        var p = this.pop(keys.length - 1, RIGHTCHILD);
        right.push(0, p, RIGHTCHILD);
      }
      if(this.children) {
        right.children.unshift(this.children.pop());
      }
      parent.push(this.parentIx, [keys.pop(), this.vals.pop(), right], RIGHTCHILD);
      this.maintain(maxKeys);
      right.maintain(maxKeys);
      parent.maintain(maxKeys);
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
          this.maintain(maxKeys);
          left.maintain(maxKeys);
          parent.maintain(maxKeys);
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
          this.maintain(maxKeys);
          right.maintain(maxKeys);
          parent.maintain(maxKeys);
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
      left.maintain(maxKeys);
      right.maintain(maxKeys);
      parent.maintain(maxKeys);
    },

    valid: function(maxKeys) {
      return true;
    },

    prettyPrint: function() {
      console.log("(" + this.parentIx + ") | " + JSON.stringify(this.lower) + " " + JSON.stringify(this.keys) + " " + JSON.stringify(this.upper) + "|");
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


  if(!window.eve) {
    window.eve = {};
  }

  window.eve.trees = {
    Tree: function(minKeys, keyLen) {
      return new Tree(minKeys * 2, keyLen);
    }
  };



})(window);
