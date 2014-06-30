var btree = aurora.btree;

var init = function (memory) {
  // setup default indexes for code tables
  memory.getSource("table-field", ["table", "field"]);
  memory.getSource("table-lifetime", ["table", "lifetime"]);
  memory.getSource("rule-ix-clause", ["rule", "ix", "clause"]);
  memory.getSource("clause-table", ["clause", "table"]);
  memory.getSource("clause-action", ["clause", "action"]); // action is primitive/when/know/remember/forget
  memory.getSource("clause-field-variable", ["clause", "field", "variable"]);
  memory.getSource("stage-ix-rule", ["stage", "ix", "rule"]);
  memory.getSource("rule-ix-variable", ["rule", "ix", "variable"]);
};

var dump = function (memory, keys, keyIxes) {
  // dump table into nested objects
  var dump = {};
  var name = keys.join("-");
  var source = memory.getSource(name, keys);
  source.index.foreach(function (key) {
    var target = dump;
    for (var i = 0; i < keyIxes.length - 2; i++) {
      var nextKey = key[keyIxes[i]];
      var nextTarget = target[nextKey];
      if (nextTarget === undefined) {
        nextTarget = target[nextKey] = {};
      }
      target = nextTarget;
    }
    var last = key[keyIxes[keyIxes.length - 1]];
    if (last === undefined) {
      last = null;
    }
    target[key[keyIxes[keyIxes.length - 2]]] = last;
  });
  return dump;
};

var compile = function (memory) {
  var rule2ix2clauses = dump(memory, ["rule", "ix", "clause"], [0, 1, 2]);
  var clause2table = dump(memory, ["clause", "table"], [0, 1]);
  var clause2action = dump(memory, ["clause", "action"], [0, 1]);
  var clause2field2variable = dump(memory, ["clause", "field", "variable"], [0, 1, 2]);
  var stage2ix2rule = dump(memory, ["stage", "ix", "rule"], [0, 1, 2]);
  var rule2variable2ix = dump(memory, ["rule", "ix", "variable"], [0, 2, 1]);

  var flows = [];

  var ix2rules = stage2ix2rule["final"];
  for (var ruleIx in ix2rules) {
    var sources = [];
    var sinks = [];
    var constraints = [];
    var rule = ix2rules[ruleIx];
    var variable2ix = rule2variable2ix[rule];
    var ix2clauses = rule2ix2clauses[rule];
    for (var clauseIx in ix2clauses) {
      var clause = ix2clauses[clauseIx];
      var field2variable = clause2field2variable[clause];

      switch (clause2action[clause]) {
        case "primitive":
          // TODO
          break;

        case "when":
          var fields = [];
          var varIxes = [];
          for (var field in field2variable) {
            fields.push([variable2ix[field2variable[field]], field]);
          }
          fields.sort();
          for (var i = 0; i < fields.length; i++) {
            varIxes[i] = fields[i][0];
            fields[i] = fields[i][1];
          }
          var source = memory.getSource(clause2table[clause], fields);
          var constraint = btree.contains(btree.iterator(source.index), varIxes);
          sources.push(source);
          constraints.push(constraint);
          break;

        case "know":
          var fields = [];
          for (var field in field2variable) {
            fields[variable2ix[field2variable[field]]] = field;
          }
          var sink = memory.getSink(clause2table[clause], fields);
          sinks.push(sink);
          break;

        case "remember":
          var fields = [];
          for (var field in field2variable) {
            fields[variable2ix(field2variable[field])] = field;
          }
          var sink = memory.getSink("remember-" + clause2table[clause], fields);
          sinks.push(sink);
          break;

        case "forget":
          var fields = [];
          for (var field in field2variable) {
            fields[variable2ix(field2variable[field])] = field;
          }
          var sink = memory.getSink("forget-" + clause2table[clause], fields);
          sinks.push(sink);
          break;
      }
    }

    var numVars = Object.keys(variable2ix).length;
    flows.push(new Flow(rule, sources, btree.solver(numVars, constraints), sinks));
  }

  // TODO make transients and persistents
  return new Logic(flows, [], []);
};
