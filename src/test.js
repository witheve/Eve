// UNIT TESTS

program("simple output",
  table("input", ["id"]),
  table("output", ["id"]),
  rule("",
       source("input", {id: "id"}),
       sink("output", {id: "id"})))
.update([["input", 0], ["input", 1]], [])
.refresh()
.test([["output", 0], ["output", 1]]);

program("simple join",
  table("inputA", ["id", "name"]),
  table("inputB", ["id"]),
  table("output", ["name"]),
  rule("",
       source("inputA", {id: "id", name: "name"}),
       source("inputB", {id: "id"}),
       sink("output", {name: "name"})))
.update([["inputA", 0, "jamieA"], ["inputA", 1, "chris"], ["inputA", 2, "rob"], ["inputB", 1], ["inputB", 3]], [])
.refresh()
.test([["output", "chris"]]);

program("sorted aggregate",
  table("input", ["id"]),
  table("output", ["ids"]),
  rule("",
       source("input", {id: "id"}),
       aggregate([], ["id"]),
       reduce("ids", "id", "id.join()"),
       sink("output", {ids: "ids"})))
.update([["input", 0], ["input", 1], ["input", 2]], [])
.refresh()
.test([["output", "0,1,2"]]);

program("grouped aggregate",
  table("input", ["id", "name"]),
  table("output", ["names"]),
  rule("",
       source("input", {id: "id", name: "name"}),
       aggregate(["id"], ["name"]),
       reduce("names", "name", "name.join()"),
       sink("output", {names: "names"})))
.update([["input", 1, "jamie"], ["input", 1, "rob"], ["input", 0, "chris"]], [])
.refresh()
.test([["output", "jamie,rob"], ["output", "chris"]]);

program("limited aggregate",
  table("input", ["id", "name"]),
  table("output", ["names"]),
  rule("",
       source("input", {id: "id", name: "name"}),
       aggregate(["id"], ["name"], "id"),
       reduce("names", "name", "name.join()"),
       sink("output", {names: "names"})))
.update([["input", 1, "jamie"], ["input", 1, "rob"], ["input", 0, "chris"]], [])
.refresh()
.test([["output", "jamie"]]);

program("constant limited aggregate",
  table("input", ["id", "name"]),
  table("output", ["names"]),
  rule("",
       source("input", {id: "id", name: "name"}),
       aggregate(["id"], ["name"], 1),
       reduce("names", "name", "name.join()"),
       sink("output", {names: "names"})))
.update([["input", 1, "jamie"], ["input", 1, "rob"], ["input", 0, "chris"]], [])
.refresh()
.test([["output", "jamie"], ["output", "chris"]]);

program("filter",
  table("input", ["id"]),
  table("output", ["id"]),
  rule("",
       source("input", {id: "id"}),
       calculate("more", ["id"], "id + 5"),
       constant("more", 23),
       sink("output", {id: "id"})))
.update([["input", 18], ["input", 20]], [])
.refresh()
.test([["output", 18]]);

// BIGCHECK TESTS

function systemCheck() {
  var gens = Array.prototype.slice.call(arguments);
  var name = gens.shift();
  var expectedSpec = gens.pop();
  var systemSpec = gens.pop();
  var simple = bigcheck.forall(name + " (simple)",
                               bigcheck.tuple([bigcheck.facts(3)].concat(gens)),
                               function (values) {
                                 var facts = values.shift();
                                 var system = systemSpec.apply(null, values);
                                 var expected = expectedSpec.apply(null, [facts].concat(values));
                                 system.updateTable("input", facts, []).refresh().testTable("output", expected);
                                 return true;
                               });
  var incremental = bigcheck.forall(name + " (incremental)",
                                    bigcheck.tuple([bigcheck.facts(3), bigcheck.facts(3), bigcheck.facts(3)].concat(gens)),
                                    function (values) {
                                      var facts = values.shift();
                                      var adds = values.shift();
                                      var dels = values.shift();
                                      var system = systemSpec.apply(null, values);
                                      var expected = expectedSpec.apply(null, [Memory.fromFacts(facts).update(adds, dels).facts].concat(values));
                                      system.updateTable("input", facts, []).refresh().updateTable("input", adds, dels).refresh().testTable("output", expected);
                                      return true;
                                    });
  return {simple: simple, incremental: incremental};
}

var selfJoin = systemCheck("selfJoin",
  function () {
    return program("",
                   table("input", ["x", "y", "z"]),
                   table("output", ["x", "y", "z"]),
                   rule("",
                        source("input", {x: "x", y: "y", z: "z"}),
                        source("input", {x: "x", y: "y", z: "z"}),
                        sink("output", {x: "x", y: "y", z: "z"})));
  },
  function (facts) {
    return facts;
  });

selfJoin.simple.check({maxTests:1000, maxSize: 1000});
selfJoin.incremental.check({maxTests:1000, maxSize: 1000});

var productJoin = systemCheck("productJoin",
  function () {
    return program("",
                   table("input", ["x", "y", "z"]),
                   table("output", ["x", "y", "z", "x2", "y2", "z2"]),
                   rule("",
                        source("input", {x: "x", y: "y", z: "z"}),
                        source("input", {x: "x2", y: "y2", z: "z2"}),
                        sink("output", {x: "x", y: "y", z: "z", x2: "x2", y2: "y2", z2: "z2"})));
  },
  function (facts) {
    var expectedFacts = [];
    for (var i = 0; i < facts.length; i++) {
      for (var j = 0; j < facts.length; j++) {
        expectedFacts.push(facts[i].concat(facts[j]));
      }
    }
    return expectedFacts;
  });

productJoin.simple.check({maxTests: 1000, maxSize: 30});
productJoin.incremental.check({maxTests: 1000, maxSize: 30});

var constantJoin = systemCheck("constantJoin",
  bigcheck.value,
  function (value) {
    return program("",
                   table("input", ["x", "y", "z"]),
                   table("output", ["x", "y", "z", "x2", "y2", "z2"]),
                   rule("",
                        source("input", {x: "x", y: "y", z: "z"}),
                        source("input", {x: "x2", y: "y2", z: "z2"}),
                        constant("y", value),
                        sink("output", {x: "x", y: "y", z: "z", x2: "x2", y2: "y2", z2: "z2"})));
  },
  function (facts, value) {
    var expectedFacts = [];
    for (var i = 0; i < facts.length; i++) {
      if (facts[i][1] === value) {
        for (var j = 0; j < facts.length; j++) {
          expectedFacts.push(facts[i].concat(facts[j]));
        }
      }
    }
    return expectedFacts;
  });

constantJoin.simple.check({maxTests: 1000, maxSize: 1000});
constantJoin.incremental.check({maxTests: 1000, maxSize: 1000});

var actualJoin =  systemCheck("actualJoin",
  function () {
    return program("",
                   table("input", ["x", "y", "z"]),
                   table("output", ["x", "y", "z", "y2", "z2"]),
                   rule("",
                        source("input", {x: "x", y: "y", z: "z"}),
                        source("input", {x: "z", y: "y2", z: "z2"}),
                        sink("output", {x: "x", y: "y", z: "z", y2: "y2", z2: "z2"})));
  },
  function (facts) {
    var expectedFacts = [];
    for (var i = 0; i < facts.length; i++) {
      for (var j = 0; j < facts.length; j++) {
        var fact = facts[i].concat(facts[j]);
        if (fact[2] === fact[3]) {
          fact.splice(2, 1);
          expectedFacts.push(fact);
        }
      }
    }
    return expectedFacts;
  });

actualJoin.simple.check({maxTests: 1000, maxSize: 500});
actualJoin.incremental.check({maxTests: 1000, maxSize: 500});

var functionJoin = systemCheck("functionJoin",
  function () {
    return program("",
                   table("input", ["x", "y", "z"]),
                   table("output", ["x", "y", "z", "x2", "y2", "z2"]),
                   rule("",
                        source("input", {x: "x", y: "y", z: "z"}),
                        source("input", {x: "x2", y: "y2", z: "z2"}),
                        calculate("z", ["x2"], "x2 - 1"),
                        sink("output", {x: "x", y: "y", z: "z", x2: "x2", y2: "y2", z2: "z2"})));
  },
  function (facts) {
    var expectedFacts = [];
    for (var i = 0; i < facts.length; i++) {
      for (var j = 0; j < facts.length; j++) {
        var fact = facts[i].concat(facts[j]);
        if (fact[2] === fact[3] - 1) {
          expectedFacts.push(fact);
        }
      }
    }
    return expectedFacts;
  });

functionJoin.simple.check({maxTests: 1000, maxSize: 100});
functionJoin.incremental.check({maxTests: 1000, maxSize: 100});

var negatedJoin = systemCheck("negatedJoin",
  function () {
    return program("",
                   table("input", ["x", "y", "z"]),
                   table("output", ["x", "y", "z"]),
                   rule("",
                        source("input", {x: "x", y: "y", z: "z"}),
                        notSource("input", {x: "z"}),
                        sink("output", {x: "x", y: "y", z: "z"})));
  },
  function (facts) {
    var expectedFacts = [];
    nextFact: for (var i = 0; i < facts.length; i++) {
      var fact = facts[i];
      for (var j = 0; j < facts.length; j++) {
        if (fact[2] === facts[j][0]) {
          continue nextFact;
        }
      }
      expectedFacts.push(fact);
    }
    return expectedFacts;
  });

negatedJoin.simple.check({maxTests: 1000, maxSize: 1000});
negatedJoin.incremental.check({maxTests: 1000, maxSize: 1000});

var aggregateJoin = systemCheck("aggregateJoin",
  function () {
    return program("",
                   table("input", ["x", "y", "z"]),
                   table("output", ["x", "y"]),
                   rule("",
                        source("input", {x: "x", y: "y", z: "z"}),
                        aggregate(["z"], ["x", "y"]),
                        reduce("reduced", "y", "y.join('')"),
                        sink("output", {x: "y", y: "reduced"})));
  },
  function (facts) {
    var uniqueFacts = dedupeFacts(facts);
    uniqueFacts.sort(compareValueArray);
    var groups = {};
    for (var i = 0; i < uniqueFacts.length; i++) {
      var fact = uniqueFacts[i];
      groups[fact[2]] = (groups[fact[2]] || "") + fact[1];
    }
    var expectedFacts = [];
    for (var i = 0; i < uniqueFacts.length; i++) {
      var fact = uniqueFacts[i];
      expectedFacts.push([fact[1], groups[fact[2]]]);
    }
    return expectedFacts;
  });

aggregateJoin.simple.check({maxTests: 1000, maxSize: 1000});
aggregateJoin.incremental.check({maxTests: 1000, maxSize: 1000});

// BENCHMARKS

function soFast(n) {
  var system = program("soFast",
                       table("input", ["x", "y", "z"]),
                       table("output", ["x", "y", "z"]),
                       rule("",
                            source("input", {x: "x", y: "y", z: "z"}),
                            source("input", {x: "x", y: "y", z: "z"}),
                            sink("output", {x: "x", y: "y", z: "z"})));

  var adds = [];
  for (var i = 0; i < n; i++) {
    adds[i] = [Math.random(),Math.random(),Math.random()];
  }

  console.time("soFast: update");
  system.updateTable("input", adds, []);
  console.timeEnd("soFast: update");
  console.time("soFast: refresh");
  system.refresh();
  console.timeEnd("soFast: refresh");
}

soFast(100000);

function soSlow(n) {
  var system = program("soSlow",
                       table("input", ["x", "y", "z"]),
                       table("output", ["x", "y", "z"]),
                       rule("",
                            source("input", {x: "x", y: "y", z: "z"}),
                            source("input", {x: "x", y: "y", z: "z"}),
                            sink("output", {x: "x", y: "y", z: "z"})));

  var addsA = [];
  var addsB = [];
  for (var i = 0; i < n; i++) {
    if (i % 2 === 0) {
      addsA.push([Math.random(),Math.random(),Math.random()]);
    } else {
      addsB.push([Math.random(),Math.random(),Math.random()]);
    }
  }

  console.time("soSlow: update A");
  system.updateTable("input", addsA, []);
  console.timeEnd("soSlow: update A");
  console.time("soSlow: refresh A");
  system.refresh();
  console.timeEnd("soSlow: refresh A");

  console.time("soSlow: update B");
  system.updateTable("input", addsB, []);
  console.timeEnd("soSlow: update B");
  console.time("soSlow: refresh B");
  system.refresh();
  console.timeEnd("soSlow: refresh B");

  console.time("soSlow: update C");
  system.updateTable("input", [[0.5, 0.5, 0.5]], []);
  console.timeEnd("soSlow: update C");
  console.time("soSlow: refresh C");
  system.refresh();
  console.timeEnd("soSlow: refresh C");
}

soSlow(100000);
