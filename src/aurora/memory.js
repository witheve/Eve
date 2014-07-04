var btree = aurora.btree;

var makeFieldmap = function (fromFields, toFields) {
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

var withFieldmap = function (key, fieldmap) {
  var mappedKey = [];
  for (var k = 0; k < fieldmap.length; k++) {
    mappedKey[k] = key[fieldmap[k]];
  }
  return mappedKey;
};

var Source = function (index, fields, fieldmap) {
  this.index = index;
  this.fields = fields;
  this.fieldmap = fieldmap;
};

var Sink = function (table, fieldmap) {
  this.table = table;
  this.fieldmap = fieldmap;
};

Sink.prototype.clear = function () {
  this.table.clear();
};

Sink.prototype.add = function (keys) {
  for (var i = 0; i < keys.length; i++) {
    keys[i] = withFieldmap(keys[i], this.fieldmap);
  }
  this.table.add(keys);
};

Sink.prototype.del = function (ids) {
  this.table.del(ids);
};

var Table = function (name, fields, keys, canon, sources, sinks) {
  this.name = name;
  this.fields = fields;
  this.keys = keys;
  this.canon = canon;
  this.sources = sources;
  this.sinks = sinks;
};

Table.prototype.clear = function () {
  for (var i in this.keys) {
    delete this.keys[i];
  }
  this.canon.clear();
  for (var i = 0; i < this.sources.length; i++) {
    this.sources[i].index.clear();
  }
};

Table.prototype.add = function (keys) {
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (key.length !== this.fields.length) {
      throw ("Fact is wrong length " + key + " " + this.fields);
    }
    var id = this.keys.length;
    if (this.canon.add(key, id) === null) {
      this.keys[id] = key;
      for (var j = 0; j < this.sources.length; j++) {
        var source = this.sources[j];
        source.index.add(withFieldmap(key, source.fieldmap), id);
      }
    }
  }
};

Table.prototype.del = function (ids) {
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    var key = this.keys[id];
    if (key !== undefined) {
      this.canon.del(key);
      for (var j = 0; j < this.sources.length; j++) {
        var source = this.sources[j];
        source.index.del(withFieldmap(key, source.fieldmap));
      }
    }
  }
};

var Memory = function (tables) {
  this.tables = tables;
};

var memory = function () {
  return new Memory([]);
};

Memory.prototype.getTable = function (name, fields) {
  var table;
  for (var i = 0; i < this.tables.length; i++) {
    if (btree.prim_EQ_(name, this.tables[i].name)) {
      table = this.tables[i];
      break;
    }
  }
  if (table === undefined) {
    table = new Table(name, fields, [], btree.tree(10, fields.length), [], []);
    this.tables.push(table);
  }
  return table;
};

Memory.prototype.getSource = function (name, fields) {
  var table = this.getTable(name, fields);
  var sources = table.sources;
  var source;
  if (btree.prim_EQ_(fields, this.fields)) {
    source = new Source(this.canon, fields, fieldmap(fields, fields));
  }
  else {
    for (var i = 0; i < sources.length; i++) {
      if (btree.prim_EQ_(fields, sources[i].fields)) {
        source = sources[i];
        break;
      }
    }
    if (source === undefined) {
      var index = btree.tree(10, fields.length);
      var fieldmap = makeFieldmap(table.fields, fields);
      var keys = table.keys;
      for (var id in keys) {
        index.add(withFieldmap(keys[id], fieldmap), id);
      }
      source = new Source(index, fields, fieldmap);
      sources.push(source);
    }
  }
  return source;
};

Memory.prototype.getSink = function (name, fields) {
  var filteredFields = [];
  for (var field in fields) {
    if (fields !== null) {
      filteredFields.push(field);
    }
  }
  var table = this.getTable(name, filteredFields);
  var sinks = table.sinks;
  var sink;
  for (var i = 0; i < sinks.length; i++) {
    if (btree.prim_EQ_(fields, sinks[i].fields)) {
      sink = sinks[i];
    }
  }
  if (sink === undefined) {
    sink = new Sink(table, makeFieldmap(fields, table.fields));
    sinks.push(sink);
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
m.tables[0].sources;
m.tables[0].sinks;
t.add([[0,1,2,3], [0,4,5,6]]);
s.index.toString();
s2.index.toString();
