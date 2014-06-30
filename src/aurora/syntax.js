var parse = function (memory, program) {
  var tableField = memory.getSink("table-field", ["table", "field"]);
  var tableLifetime = memory.getSink("table-lifetime", ["table", "lifetime"]);
  var ruleIxClause = memory.getSink("rule-ix-clause", ["rule", "ix", "clause"]);
  var clauseTable = memory.getSink("clause-table", ["clause", "table"]);
  var clauseAction = memory.getSink("clause-action", ["clause", "action"]);
  var clauseFieldVariable = memory.getSink("clause-field-variable", ["clause", "field", "variable"]);
  var stageIxRule = memory.getSink("stage-ix-rule", ["stage", "ix", "rule"]);
  var ruleIxVariable = memory.getSink("rule-ix-variable", ["rule", "ix", "variable"]);

  var rule = "";
  var ruleIx = 0;
  var clauseIx = 0;

  var lines = program.replace("(","").replace(")","").split("\n");
  for (var i = 0; i < lines.length; i++) {
    var words = lines[i].split(" ");
    if (words.length === 0) {
      // empty line, pass
    } else if (words[0] === "table") {
      var table = words[2];
      tableLifetime.update([[table, words[1]]]);
      var fields = words.slice(3);
      for (var j = 0; j < fields.length; j++) {
        tableField.update([[table, fields[j]]]);
      }
      memory.getSource(table, fields); // create a default index TODO this should eventually be unnecessary
    }
    else if (words[0] === "rule") {
      ruleIx++;
      clauseIx = 0;
      rule = words[1];
      var variables = words.slice(2);
      for (var ix = 0; ix < variables.length; ix++) {
        ruleIxVariable.update([[rule, ix, variables[ix]]]);
      }
      stageIxRule.update([["final", ruleIx, rule]]);
    } else {
      clauseIx++;
      var clause = rule + "-" + clauseIx;
      ruleIxClause.update([[rule, clauseIx, clause]]);
      clauseAction.update([[clause, words[0]]]);
      clauseTable.update([[clause, words[1]]]);
      var pairs = words.slice(2);
      for (var j = 0; j < pairs.length; j++) {
        var pair = pairs[j].split("=");
        var field = pair[0];
        var variable = pair[1];
        clauseFieldVariable.update([[clause, field, variable]]);
      }
    }
  }
};

// TESTS

var m = memory();
init(m);

parse(m,
  ["table persistent edge x y",
   "table transient connected x y",

   "rule simple-edge xx yy",
   "when edge x=xx y=yy",
   "know connected x=xx y=yy",

   "rule transient-edge xx yy zz",
   "when edge x=xx y=yy",
   "when connected x=yy y=zz",
   "know connected x=xx y=zz"].join("\n"));

for (var i = 0; i < m.sources.length; i++) {
  console.log(m.sources[i].index.toString());
}

var l = compile(m);

console.log(l);

m.getSink("edge", ["x","y"]).update([["a","b"],1, ["b","c"], 1, ["c","d"], 1, ["c","b"], 1]);

l.run();

l.flows[0].mixer.constraints[0]

for (var i = 0; i < m.sources.length; i++) {
  console.log(m.sources[i].index.toString());
}
