var Indexing = (function() {
  exports = {};

  function arraysIdentical(a, b) {
    var i = a.length;
    if (i != b.length) return false;
    while (i--) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  exports.arraysIdentical = arraysIdentical;

  function indexOfArray(haystack, needle) {
    var result = -1;
    for(var haystackIx = 0, haystackLen = haystack.length; haystackIx < haystackLen; haystackIx++) {
      var cur = haystack[haystackIx];
      if(arraysIdentical(cur, needle)) {
        result = haystackIx;
        break;
      }
    }
    return result;
  }

  function applyTableDiff(table, diff) {
    var adds = diff.adds;
    var removes = diff.removes;
    for(var remIx = 0, remLen = removes.length; remIx < remLen; remIx++) {
      var rem = removes[remIx];
      var foundIx = indexOfArray(table, rem);
      if(foundIx !== -1) {
        table.splice(foundIx, 1);
      }
    }
    for(var addIx = 0, addLen = adds.length; addIx < addLen; addIx++) {
      var add = adds[addIx];
      var foundIx = indexOfArray(table, add);
      if(foundIx !== -1) continue;
      table.push(add);
    }
  }

  function Indexer() {
    this.tables = {};
    this.indexes = {};
    this.tableToIndex = {};
  }

  Indexer.prototype = {
    handleDiffs: function(diffs) {
      for(var table in diffs) {
        var diff = diffs[table];
        diff.adds = diff.adds || [];
        diff.removes = diff.removes || [];
        var indexes = this.tableToIndex[table] || [];
        for(var ix = 0, len = indexes.length; ix < len; ix++) {
          var cur = indexes[ix];
          cur.index = cur.indexer(cur.index, diff);
        }
        if(!this.tables[table]) {
          this.tables[table] = [];
        }
        applyTableDiff(this.tables[table], diff);
      }
    },
    addIndex: function(name, table, indexer) {
      var index = {index: {}, indexer: indexer, table: table};
      this.indexes[name] = index;
      if(!this.tableToIndex[table]) {
        this.tableToIndex[table] = [];
      }
      this.tableToIndex[table].push(index);
      if(this.tables[table]) {
        index.index = index.indexer(index.index, {adds: this.tables[table], removes: []});
      }
    },
    index: function(name) {
      if(this.indexes[name]) {
        return this.indexes[name].index;
      }
      return null;
    },
    facts: function(name) {
      return this.tables[name] || [];
    },
    first: function(name) {
      return this.facts(name)[0];
    }
  };

  exports.Indexer = Indexer;

  var create = {
    lookup: function(keyIxes) {
      var valueIx = keyIxes.pop();
      return function(cur, diffs) {
        var adds = diffs.adds;
        var removes = diffs.removes;
        var cursor;
        outer: for(var remIx = 0, remLen = removes.length; remIx < remLen; remIx++) {
          var rem = removes[remIx];
          cursor = cur;
          for(var ix = 0, keyLen = keyIxes.length - 1; ix < keyLen; ix++) {
            cursor = cursor[rem[keyIxes[ix]]];
            if(!cursor) continue outer;
          }
          delete cursor[rem[keyIxes[keyIxes.length - 1]]];
        }
        for(var addIx = 0, addLen = adds.length; addIx < addLen; addIx++) {
          var add = adds[addIx];
          cursor = cur;
          for(var ix = 0, keyLen = keyIxes.length - 1; ix < keyLen; ix++) {
            var next = cursor[add[keyIxes[ix]]];
            if(!next) {
              next = cursor[add[keyIxes[ix]]] = {};
            }
            cursor = next;
          }
          if(valueIx !== false) {
            cursor[add[keyIxes[keyIxes.length - 1]]] = add[valueIx];
          } else {
            cursor[add[keyIxes[keyIxes.length - 1]]] = add;
          }
        }
        return cur;
      }
    },
    collector: function(keyIxes) {
      return function(cur, diffs) {
        var adds = diffs.adds;
        var removes = diffs.removes;
        var cursor;
        outer: for(var remIx = 0, remLen = removes.length; remIx < remLen; remIx++) {
          var rem = removes[remIx];
          cursor = cur;
          for(var ix = 0, keyLen = keyIxes.length - 1; ix < keyLen; ix++) {
            cursor = cursor[rem[keyIxes[ix]]];
            if(!cursor) continue outer;
          }

          cursor[rem[keyIxes[keyIxes.length - 1]]] = cursor[rem[keyIxes[keyIxes.length - 1]]].filter(function(potential) {
            return !arraysIdentical(rem, potential);
          });
        }
        for(var addIx = 0, addLen = adds.length; addIx < addLen; addIx++) {
          var add = adds[addIx];
          cursor = cur;
          for(var ix = 0, keyLen = keyIxes.length - 1; ix < keyLen; ix++) {
            var next = cursor[add[keyIxes[ix]]];
            if(!next) {
              next = cursor[add[keyIxes[ix]]] = {};
            }
            cursor = next;
          }
          next = cursor[add[keyIxes[keyIxes.length - 1]]];
          if(!next) {
            next = cursor[add[keyIxes[keyIxes.length - 1]]] = [];
          }
          next.push(add);
        }
        return cur;
      }
    },
  };

  exports.create = create;

  return exports;
})();
