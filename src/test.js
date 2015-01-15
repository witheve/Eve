var fs = require("fs");

//---------------------------------------------------------
// Simple infrastructure
//---------------------------------------------------------

// load the eve source which is not designed to be a node module currently
var eveFiles = ["src/eve.js", "src/helpers.js", "src/tokenizer.js"];
for(var ix in eveFiles) {
  global.eval(fs.readFileSync(eveFiles[ix]).toString());
}

// Every Eve env needs the runtime views added
var runtimeCode = fs.readFileSync("examples/Runtime.eve").toString();

function getTestEnv(test) {
  var testCode = fs.readFileSync("tests/" + test).toString();

  // Create an empty system with the base tables in it
  var system = System.empty({name: test});
  system.update(commonViews(), []);
  system.recompile();
  system.refresh();

  // Parse the test code
  var parsed = parse(runtimeCode + "\n" + testCode);
  var programResults = injectParsed(parsed, system);
  system.recompile();
  system.refresh();

  // add any inserted values from the parse
  for(var table in programResults.values) {
    var facts = programResults.values[table];
    system.updateStore(table, facts, []);
  }

  // do the final run
  system.refresh();

  return system;
}

function getFacts(env, table) {
  return env.getStore(table).getFacts();
}

function factsEqual(f1, f2) {
  var adds = [];
  var removes = [];
  diffFacts(f1,f2, adds, removes);
  return adds.length === 0 && removes.length === 0;
}

function verify(thing, error) {
  if(!thing) { console.log(error); }
}

function checkTable(env, table, desired) {
  var facts = getFacts(env, table)
  return verify(factsEqual(facts, desired), "Verifying '" + table + "'\nExpected: " + JSON.stringify(desired) + "\n     Got: " + JSON.stringify(facts));
}

function test(name, func) {
  console.log("\nRunning: " + name);
  var env = getTestEnv(name);
  func(env);
}

function injectAndRun(env, facts) {
  env.update(facts, []);
  env.refresh();
  return env;
}

//---------------------------------------------------------
// Tests
//---------------------------------------------------------

test("foo.eve", function(env) {
  injectAndRun(env, [["foo", 2]]);
  checkTable(env, "foo", [[1], [2]]);
});

test("Add data.eve", function(env) {
  injectAndRun(env, []);
  checkTable(env, "Add field literal", [[7, 10, -1]]);
});
