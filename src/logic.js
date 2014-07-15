var RuleFlow = function (rule, sources, mixer, sinks) {
  this.rule = rule;
  this.sources = sources;
  this.mixer = mixer;
  this.sinks = sinks;
};

RuleFlow.prototype.run = function () {
  for (var i = 0; i < this.sources.length; i++) {
    if (this.sources[i].index.empty_QMARK_()) {
      return; // bail out
    }
  }
  this.mixer.reset();
  var elems = this.mixer.elems();
  for (var j = 0; j < this.sinks.length; j++) {
    this.sinks[j].update(elems);
  }
};

var TableFlow = function (name, lifetime, knowTable, rememberTable, forgetTable) {
  this.name = name;
  this.lifetime = lifetime;
  this.knowTable = knowTable;
  this.rememberTable = rememberTable;
  this.forgetTable = forgetTable;
};

TableFlow.prototype.run = function () {
  if (this.lifetime === "transient") {
    this.knowTable.clear();
  }
  this.knowTable.add(this.rememberTable.canon.keys());
  var forgets = this.forgetTable.canon.keys();
  for (var i = 0; i < forgets.length; i++) {
    forgets[i] = forgets[i][0];
  }
  this.knowTable.del(forgets);
};

var Logic = function (memory, flows) {
  this.memory = memory;
  this.flows = flows;
};

Logic.prototype.run = function () {
  for (var i = 0; i < this.flows.length; i++) {
    this.flows[i].run();
  }
};
