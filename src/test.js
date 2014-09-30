program("simple output",
  table("foo", ["id"]),
  table("bar", ["id"]),
  rule("",
       source("foo", {id: "id"}),
       sink("bar", {id: "id"})))
.update([["foo", 0], ["foo", 1]], [])
.refresh()
.test([["bar", 0], ["bar", 1]]);

program("simple join",
  table("foo", ["id", "name"]),
  table("bar", ["id"]),
  table("quux", ["name"]),
  rule("",
       source("foo", {id: "id", name: "name"}),
       source("bar", {id: "id"}),
       sink("quux", {name: "name"})))
.update([["foo", 0, "jamie"], ["foo", 1, "chris"], ["foo", 2, "rob"], ["bar", 1], ["bar", 3]], [])
.refresh()
.test([["quux", "chris"]]);

program("sorted aggregate",
  table("foo", ["id"]),
  table("bar", ["ids"]),
  rule("",
       source("foo", {id: "id"}),
       aggregate([], ["id"]),
       reduce("ids", "id", "id.join()"),
       sink("bar", {ids: "ids"})))
.update([["foo", 0], ["foo", 1], ["foo", 2]], [])
.refresh()
.test([["bar", "0,1,2"]]);

program("grouped aggregate",
  table("foo", ["id", "name"]),
  table("bar", ["names"]),
  rule("",
       source("foo", {id: "id", name: "name"}),
       aggregate(["id"], ["name"]),
       reduce("names", "name", "name.join()"),
       sink("bar", {names: "names"})))
.update([["foo", 1, "jamie"], ["foo", 1, "rob"], ["foo", 0, "chris"]], [])
.refresh()
.test([["bar", "jamie,rob"], ["bar", "chris"]]);

program("limited aggregate",
  table("foo", ["id", "name"]),
  table("bar", ["names"]),
  rule("",
       source("foo", {id: "id", name: "name"}),
       aggregate(["id"], ["name"], "id"),
       reduce("names", "name", "name.join()"),
       sink("bar", {names: "names"})))
.update([["foo", 1, "jamie"], ["foo", 1, "rob"], ["foo", 0, "chris"]], [])
.refresh()
.test([["bar", "jamie"]]);

program("constant limited aggregate",
  table("foo", ["id", "name"]),
  table("bar", ["names"]),
  rule("",
       source("foo", {id: "id", name: "name"}),
       aggregate(["id"], ["name"], 1),
       reduce("names", "name", "name.join()"),
       sink("bar", {names: "names"})))
.update([["foo", 1, "jamie"], ["foo", 1, "rob"], ["foo", 0, "chris"]], [])
.refresh()
.test([["bar", "jamie"], ["bar", "chris"]]);

program("filter",
  table("foo", ["id"]),
  table("bar", ["id"]),
  rule("",
       source("foo", {id: "id"}),
       calculate("more", ["id"], "id + 5"),
       constant("more", 23),
       sink("bar", {id: "id"})))
.update([["foo", 18], ["foo", 20]], [])
.refresh()
.test([["bar", 18]]);

var testMultiplier = 1;
if(typeof window === "undefined") {
  testMultiplier = process.env.TESTMULTIPLIER || 1;
}

var selfJoin = bigcheck.foralls(bigcheck.facts(3),
                                function (facts) {
                                  var expectedFacts = facts;
                                  program("selfJoin",
                                          table("foo", ["x", "y", "z"]),
                                          table("bar", ["x", "y", "z"]),
                                          rule("",
                                               source("foo", {x: "x", y: "y", z: "z"}),
                                               source("foo", {x: "x", y: "y", z: "z"}),
                                               sink("bar", {x: "x", y: "y", z: "z"})))
                                  .updateTable("foo", facts, [])
                                  .refresh()
                                  .testTable("bar", expectedFacts);
                                  return true;
                                });

selfJoin.check({maxTests: 1000, maxSize: 1000});

var productJoin = bigcheck.foralls(bigcheck.facts(3),
                                   function (facts) {
                                     var expectedFacts = [];
                                     for (var i = 0; i < facts.length; i++) {
                                       for (var j = 0; j < facts.length; j++) {
                                         expectedFacts.push(facts[i].concat(facts[j]));
                                       }
                                     }
                                     program("productJoin",
                                             table("foo", ["x", "y", "z"]),
                                             table("bar", ["x", "y", "z", "x2", "y2", "z2"]),
                                             rule("",
                                                  source("foo", {x: "x", y: "y", z: "z"}),
                                                  source("foo", {x: "x2", y: "y2", z: "z2"}),
                                                  sink("bar", {x: "x", y: "y", z: "z", x2: "x2", y2: "y2", z2: "z2"})))
                                     .updateTable("foo", facts, [])
                                     .refresh()
                                     .testTable("bar", expectedFacts);
                                     return true;
                                });

productJoin.check({maxTests: 1000, maxSize: 30});

var constantJoin = bigcheck.foralls(bigcheck.facts(3), bigcheck.value,
                                    function (facts, value) {
                                      var expectedFacts = [];
                                      for (var i = 0; i < facts.length; i++) {
                                        if (facts[i][1] === value) {
                                          for (var j = 0; j < facts.length; j++) {
                                            expectedFacts.push(facts[i].concat(facts[j]));
                                          }
                                        }
                                      }
                                      program("constantJoin",
                                              table("foo", ["x", "y", "z"]),
                                              table("bar", ["x", "y", "z", "x2", "y2", "z2"]),
                                              rule("",
                                                   source("foo", {x: "x", y: "y", z: "z"}),
                                                   source("foo", {x: "x2", y: "y2", z: "z2"}),
                                                   constant("y", value),
                                                   sink("bar", {x: "x", y: "y", z: "z", x2: "x2", y2: "y2", z2: "z2"})))
                                      .updateTable("foo", facts, [])
                                      .refresh()
                                      .testTable("bar", expectedFacts);
                                      return true;
                                    });

constantJoin.check({maxTests: 1000, maxSize: 1000});

var actualJoin = bigcheck.foralls(bigcheck.facts(3),
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
                                    program("actualJoin",
                                            table("foo", ["x", "y", "z"]),
                                            table("bar", ["x", "y", "z", "y2", "z2"]),
                                            rule("",
                                                 source("foo", {x: "x", y: "y", z: "z"}),
                                                 source("foo", {x: "z", y: "y2", z: "z2"}),
                                                 sink("bar", {x: "x", y: "y", z: "z", y2: "y2", z2: "z2"})))
                                    .updateTable("foo", facts, [])
                                    .refresh()
                                    .testTable("bar", expectedFacts);
                                    return true;
                                  });

actualJoin.check({maxTests: 1000, maxSize: 1000});

var functionJoin = bigcheck.foralls(bigcheck.facts(3),
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
                                      program("actualJoin",
                                              table("foo", ["x", "y", "z"]),
                                              table("bar", ["x", "y", "z", "x2", "y2", "z2"]),
                                              rule("",
                                                   source("foo", {x: "x", y: "y", z: "z"}),
                                                   source("foo", {x: "x2", y: "y2", z: "z2"}),
                                                   calculate("z", ["x2"], "x2 - 1"),
                                                   sink("bar", {x: "x", y: "y", z: "z", x2: "x2", y2: "y2", z2: "z2"})))
                                      .updateTable("foo", facts, [])
                                      .refresh()
                                      .testTable("bar", expectedFacts);
                                      return true;
                                    });

functionJoin.check({maxTests: 1000, maxSize: 100});

var negatedJoin = bigcheck.foralls(bigcheck.facts(3),
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
                                     program("selfJoin",
                                             table("foo", ["x", "y", "z"]),
                                             table("bar", ["x", "y", "z"]),
                                             rule("",
                                                  source("foo", {x: "x", y: "y", z: "z"}),
                                                  notSource("foo", {x: "z"}),
                                                  sink("bar", {x: "x", y: "y", z: "z"})))
                                     .updateTable("foo", facts, [])
                                     .refresh()
                                     .testTable("bar", expectedFacts);
                                     return true;
                                   });

negatedJoin.check({maxTests: 1000, maxSize: 1000});

var aggregateJoin = bigcheck.foralls(bigcheck.facts(3),
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
                                       program("selfJoin",
                                               table("foo", ["x", "y", "z"]),
                                               table("bar", ["x", "y"]),
                                               rule("",
                                                    source("foo", {x: "x", y: "y", z: "z"}),
                                                    aggregate(["z"], ["x", "y"]),
                                                    reduce("reduced", "y", "y.join('')"),
                                                    sink("bar", {x: "y", y: "reduced"})))
                                       .updateTable("foo", facts, [])
                                       .refresh()
                                       .testTable("bar", expectedFacts);
                                       return true;
                                     });

aggregateJoin.check({maxTests: 1000, maxSize: 1000});

// TODO incremental tests
