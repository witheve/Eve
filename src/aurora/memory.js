var btree = aurora.btree;

var fieldmap = function (fromFields, toFields) {
  var fieldmap = toFields.slice();
  for (var i = 0; i < toFields.length; i++) {
    for (var j = 0; j < fromFields.length; j++) {
      if (fromFields[j] === toFields[i]) {
        fieldmap[i] = j;
      }
    }
    if (fieldmap[i] === undefined) {
      throw ("Field mismatch: " + fromFields + " " + toFields);
    }
  }
  return fieldmap;
};

var Source = function (name, fields, index) {
  this.name = name;
  this.fields = fields;
  this.index = index;
};

var Sink = function (name, fields, indexes, fieldmaps) {
  this.name = name;
  this.fields = fields;
  this.indexes = indexes;
  this.fieldmaps = fieldmaps;
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
    var fieldmap = this.fieldmaps[i];
    for (var j = 0; j < elems.length; j += 2) {
      var fact = elems[j];
      var val = elems[j+1];
      if (fact.length !== this.fields.length) {
        throw ("Fact is wrong length " + fact + " " + fieldmap);
      }
      var mappedFact = [];
      for (var k = 0; k < fieldmap.length; k++) {
        mappedFact[k] = fact[fieldmap[k]];
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

Memory.prototype.getSource = function (name, fields) {
  var source;
  for (var i = 0; i < this.sources.length; i++) {
    if (btree.prim_EQ_(name, this.sources[i].name) && btree.prim_EQ_(fields, this.sources[i].fields)) {
      source = this.sources[i];
      break;
    }
  }
  if (source === undefined) {
    source = new Source(name, fields, btree.tree(10, fields.length));
    this.sources.push(source);
    for (var j = 0; j < this.sinks.length; j++) {
      var sink = this.sinks[j];
      if (btree.prim_EQ_(name, sink.name)) {
        sink.indexes.push(source.index);
        sink.fieldmaps.push(fieldmap(sink.fields, fields));
      }
    }
  }
  return source;
};

Memory.prototype.getSink = function (name, fields) {
  var sink;
  for (var i = 0; i < this.sinks.length; i++) {
    if (btree.prim_EQ_(name, this.sinks[i].name) && btree.prim_EQ_(fields, this.sinks[i].fields)) {
      sink = this.sinks[i];
    }
  }
  if (sink === undefined) {
    var indexes = [];
    var fieldmaps = [];
    for (var j = 0; j < this.sources.length; j++) {
      if (btree.prim_EQ_(name, this.sources[j].name)) {
        indexes.push(this.sources[j].index);
        fieldmaps.push(fieldmap(fields, this.sources[j].fields));
      }
    }
    sink = new Sink(name, fields, indexes, fieldmaps);
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
