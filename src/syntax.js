var parse = function (memory, program) {
  var tableIxField = memory.getSink("table-ix-field", ["table", "ix", "field"]);
  var tableLifetime = memory.getSink("table-lifetime", ["table", "lifetime"]);
  var ruleIxClause = memory.getSink("rule-ix-clause", ["rule", "ix", "clause"]);
  var clauseTable = memory.getSink("clause-table", ["clause", "table"]);
  var clauseAction = memory.getSink("clause-action", ["clause", "action"]);
  var clauseFieldVariable = memory.getSink("clause-field-variable", ["clause", "field", "variable"]);
  var clauseFieldConstant = memory.getSink("clause-field-constant", ["clause", "field", "constant"]);
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
    }
    else if (words[0] === "table") {
      var table = words[2];
      var lifetime = words[1];
      tableLifetime.add([[table, lifetime]]);
      var fields = words.slice(3);
      for (var ix = 0; ix < fields.length; ix++) {
        tableIxField.add([[table, ix, fields[ix]]]);
      }
      // create default indexes TODO this should eventually be unnecessary
      memory.getSource(table, fields);
    }
    else if (words[0] === "rule") {
      ruleIx++;
      clauseIx = 0;
      rule = words[1];
      var variables = words.slice(2);
      for (var ix = 0; ix < variables.length; ix++) {
        ruleIxVariable.add([[rule, ix, variables[ix]]]);
      }
      stageIxRule.add([["final", ruleIx, rule]]);
    }
    else if (words[0] === "let") {
      clauseIx++;
      var clause = rule + "-" + clauseIx;
      ruleIxClause.add([[rule, clauseIx, clause]]);
      clauseAction.add([[clause, "primitive"]]);
      clauseTable.add([[clause, "=function"]]);
      var result = words[1];
      var js = words.slice(3).join(" ");
      clauseFieldVariable.add([[clause, "result", result]]);
      clauseFieldConstant.add([[clause, "js", js]]);
    }
    else if (words[0] === "filter") {
      clauseIx++;
      var clause = rule + "-" + clauseIx;
      ruleIxClause.add([[rule, clauseIx, clause]]);
      clauseAction.add([[clause, "primitive"]]);
      clauseTable.add([[clause, "filter"]]);
      var js = words.slice(1).join(" ");
      clauseFieldConstant.add([[clause, "js", js]]);
    }

    else if (words[0] === "range") {
      clauseIx++;
      var clause = rule + "-" + clauseIx;
      ruleIxClause.add([[rule, clauseIx, clause]]);
      clauseAction.add([[clause, "primitive"]]);
      clauseTable.add([[clause, "interval"]]);
      var lo = words[1];
      var mid = words[2];
      var hi = words[3];
      clauseFieldVariable.add([[clause, "lo", lo]]);
      clauseFieldVariable.add([[clause, "mid", mid]]);
      clauseFieldVariable.add([[clause, "hi", hi]]);
    }
    else {
      clauseIx++;
      var clause = rule + "-" + clauseIx;
      ruleIxClause.add([[rule, clauseIx, clause]]);
      clauseAction.add([[clause, words[0]]]);
      clauseTable.add([[clause, words[1]]]);
      var pairs = words.slice(2);
      for (var j = 0; j < pairs.length; j++) {
        var pair = pairs[j].split("=");
        var field = pair[0];
        var variable = pair[1];
        clauseFieldVariable.add([[clause, field, variable]]);
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
   "know connected x=xx y=zz",

   "table transient str-edge s",
   "rule str-edge xx yy ss",
   "when edge x=xx y=yy",
   "let ss = xx + \"-\" + yy",
   "know str-edge s=ss"].join("\n"));

for (var i = 0; i < m.tables.length; i++) {
  console.log(m.tables[i].canon.toString());
}

var l = compile(m);

console.log(l);

m.getSink("edge", ["x","y"]).add([["a","b"], ["b","c"], ["c","d"], ["c","b"]]);

l.run();

for (var i = 0; i < m.tables.length; i++) {
  console.log(m.tables[i].canon.toString());
}
