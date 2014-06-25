'use strict';

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

var Source = function (name, action, keys, index) {
  this.name = name;
  this.action = action;
  this.keys = keys;
  this.index = index;
};

var Sink = function (name, action, keys, indexes, keymaps) {
  this.name = name;
  this.action = action;
  this.keys = keys;
  this.indexes = indexes;
  this.keymaps = keymaps;
};

Sink.prototype.updateFacts = function (factsAndVals) {
  if (this.indexes.length === 0) {
    throw ("No indexes for " + this.name + " " + this.action);
  }
  // TODO when we stop doing counting, we can maybe use the return result of assoc to avoid checking all indexes
  for (var i = 0; i < this.indexes.length; i++) {
    var index = this.indexes[i];
    var keymap = this.keymaps[i];
    for (var j = 0; j < factsAndVals.length; j += 2) {
      var fact = factsAndVals[j];
      var val = factsAndVals[j+1];
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

Memory.prototype.getSource = function (name, action, keys) {
  if ((action !== "know") && (action !== "remember") && (action !== "forget")) {
    throw ("Bad action " + action);
  }
  var source;
  for (var i = 0; i < this.sources.length; i++) {
    if ((name === this.sources[i].name) && (action === this.sources[i].action) && btree.prim_EQ_(keys, this.sources[i].keys)) {
      source = this.sources[i];
      break;
    }
  }
  if (source === undefined) {
    source = new Source(name, action, keys, btree.tree(10, keys.length));
    this.sources.push(source);
    // TODO add to sinks
    // TODO for remember/forget add a sink to know
  }
  return source;
};

Memory.prototype.getSink = function (name, action, keys) {
  if ((action !== "know") && (action !== "remember") && (action !== "forget")) {
    throw ("Bad action " + action);
  }
  var sink;
  for (var i = 0; i < this.sinks.length; i++) {
    if ((name === this.sinks[i].name) && (action === this.sinks[i].action) && btree.prim_EQ_(keys, this.sinks[i].keys)) {
      sink = this.sinks[i];
    }
  }
  if (sink === undefined) {
    var indexes = [];
    var keymaps = [];
    for (var j = 0; j < this.sources.length; j++) {
      if ((name === this.sources[j].name) && (action === this.sources[j].action)) {
        indexes.push(this.sources[j].index);
        keymaps.push(keymap(keys, this.sources[j].keys));
      }
    }
    sink = new Sink(name, action, keys, indexes, keymaps);
  }
  return sink;
};

var m = memory();
m;
var s = m.getSource("foo", "know", ["x", "y", "z"]);
s;
var s2 = m.getSource("foo", "know", ["x", "z", "y"]);
s2;
var t = m.getSink("foo", "know", [null,"z", "y", "x"]);
t;

m;
t.updateFacts([[0,1,2,3], 1, [0,4,5,6], 2])
s.index.toString()
