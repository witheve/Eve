var btree = aurora.btree;

var keymap = function (fromKeys, toKeys) {
  var keymap = toKeys.slice();
  for (var i = 0; i < toKeys.length; i++) {
    for (var j = 0; j < fromKeys.length; j++) {
      if (fromKeys[j] === toKeys[i]) {
        keymap[i] = j;
      }
    }
    if (keymap[i] === undefined) {
      throw ("Key mismatch: " + fromKeys + " " + toKeys);
    }
  }
  return keymap;
};

var Source = function (name, keys, index) {
  this.name = name;
  this.keys = keys;
  this.index = index;
};

var Sink = function (name, keys, indexes, keymaps) {
  this.name = name;
  this.keys = keys;
  this.indexes = indexes;
  this.keymaps = keymaps;
};

Sink.prototype.clear = function () {
  for (var i = 0; i < this.indexes.length; i++) {
    this.indexes[i].reset();
  }
};

Sink.prototype.update = function (elems) {
  if (this.indexes.length === 0) {
    throw ("No indexes for " + this.name);
  }
  // TODO when we stop doing counting, we can maybe use the return result of assoc to avoid checking all indexes
  for (var i = 0; i < this.indexes.length; i++) {
    var index = this.indexes[i];
    var keymap = this.keymaps[i];
    for (var j = 0; j < elems.length; j += 2) {
      var fact = elems[j];
      var val = elems[j+1];
      if (fact.length !== this.keys.length) {
        throw ("Fact is wrong length " + fact + " " + keymap);
      }
      var mappedFact = [];
      for (var k = 0; k < keymap.length; k++) {
        mappedFact[k] = fact[keymap[k]];
      }
      index.update(mappedFact, val);
    }
  }
};

var Memory = function (sources, sinks) {
  this.sources = sources;
  this.sinks = sinks;
};

var memory = function () {
  return new Memory([], []);
};

Memory.prototype.getSource = function (name, keys) {
  var source;
  for (var i = 0; i < this.sources.length; i++) {
    if (btree.prim_EQ_(name, this.sources[i].name) && btree.prim_EQ_(keys, this.sources[i].keys)) {
      source = this.sources[i];
      break;
    }
  }
  if (source === undefined) {
    source = new Source(name, keys, btree.tree(10, keys.length));
    this.sources.push(source);
    for (var j = 0; j < this.sinks.length; j++) {
      var sink = this.sinks[j];
      if (btree.prim_EQ_(name, sink.name)) {
        sink.indexes.push(source.index);
        sink.keymaps.push(keymap(sink.keys, keys));
      }
    }
  }
  return source;
};

Memory.prototype.getSink = function (name, keys) {
  var sink;
  for (var i = 0; i < this.sinks.length; i++) {
    if (btree.prim_EQ_(name, this.sinks[i].name) && btree.prim_EQ_(keys, this.sinks[i].keys)) {
      sink = this.sinks[i];
    }
  }
  if (sink === undefined) {
    var indexes = [];
    var keymaps = [];
    for (var j = 0; j < this.sources.length; j++) {
      if (btree.prim_EQ_(name, this.sources[j].name)) {
        indexes.push(this.sources[j].index);
        keymaps.push(keymap(keys, this.sources[j].keys));
      }
    }
    sink = new Sink(name, keys, indexes, keymaps);
    this.sinks.push(sink);
  }
  return sink;
};

// TESTS

var m = memory();
m;
var s = m.getSource("foo", ["x", "y", "z"]);
s;
var s = m.getSource("foo", ["x", "y", "z"]);
s;
var t = m.getSink("foo", [null, "z", "y", "x"]);
t;
var s2 = m.getSource("foo", ["x", "z", "y"]);
s2;

m;
t.update([[0,1,2,3], 1, [0,4,5,6], 2])
s.index.toString()
