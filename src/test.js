var testMultiplier = 1;
if(typeof window === "undefined") {
  testMultiplier = process.env.TESTMULTIPLIER || 1;
}

console.time("selfJoin");
selfJoin.assert({maxTests: 1000 * testMultiplier, maxSize: 500});
console.timeEnd("selfJoin");

console.time("productJoin");
productJoin.assert({maxTests: 1000 * testMultiplier, maxSize: 100});
console.timeEnd("productJoin");

console.time("constantJoin");
constantJoin.assert({maxTests: 1000 * testMultiplier, maxSize: 500});
console.timeEnd("constantJoin");

console.time("incrementalConstantJoin");
incrementalConstantJoin.assert({maxTests: 1000 *testMultiplier, maxSize: 500});
console.timeEnd("incrementalConstantJoin")

console.time("actualJoin");
actualJoin.assert({maxTests: 1000 * testMultiplier, maxSize: 100});
console.timeEnd("actualJoin");

console.time("incrementalActualJoin");
incrementalActualJoin.assert({maxTests: 1000 * testMultiplier, maxSize: 100});
console.timeEnd("incrementalActualJoin");

console.time("functionJoin");
functionJoin.assert({maxTests: 1000 * testMultiplier, maxSize: 50});
console.timeEnd("functionJoin");

console.time("incrementalFunctionJoin");
incrementalFunctionJoin.assert({maxTests: 1000 * testMultiplier, maxSize: 50});
console.timeEnd("incrementalFunctionJoin");

console.time("negatedJoin");
negatedJoin.assert({maxTests: 1000 * testMultiplier, maxSize: 500});
console.timeEnd("negatedJoin");

console.time("incrementalNegatedJoin");
incrementalNegatedJoin.assert({maxTests: 1000 * testMultiplier, maxSize: 500});
console.timeEnd("incrementalNegatedJoin");

console.time("aggregateJoin");
aggregateJoin.assert({maxTests: 1000 * testMultiplier});
console.timeEnd("aggregateJoin");

console.time("incrementalAggregateJoin");
incrementalAggregateJoin.assert({maxTests: 1000 * testMultiplier});
console.timeEnd("incrementalAggregateJoin");

console.time("compiler tests")
compiledPathTest();
compiledFunctionTest();
compiledNegationTest();

eve.test.test("simple output",
              function(sys) {
                sys.rule("this is a cool rule", function(rule) {
                  rule.source("click");
                  rule.sink("sms outbox");
                  rule.output("click.id", "sms outbox.id");
                });
              },
              [["user", 5, "chris"], ["click", 5]],
              [["sms outbox", 5]]);

eve.test.test("simple join",
              function(sys) {
                sys.rule("this is a cool rule", function(rule) {
                  rule.source("click");
                  rule.source("user");
                  rule.sink("sms outbox");
                  rule.join("click.id", "user.id");
                  rule.output("user.name", "sms outbox.id");
                });
              },
              [["user", 5, "chris"], ["user", 7, "jamie"], ["user", 20, "rob"], ["click", 10], ["click", 5], ["click", 20]],
              [["sms outbox", "chris"], ["sms outbox", "rob"]]);

eve.test.test("simple aggregate",
              function(sys) {
                sys.rule("this is a cool rule", function(rule) {
                  rule.source("click");
                  rule.sink("sms outbox");
                  rule.aggregate("click.id", "cool", "'hey'");
                  rule.output("cool", "sms outbox.id");
                });
              },
              [["user", 5, "chris"], ["click", 5]],
              [["sms outbox", "hey"]]);

eve.test.test("sorted aggregate",
              function(sys) {
                sys.rule("this is a cool rule", function(rule) {
                  rule.source("user");
                  rule.sink("sms outbox");
                  rule.sort("user.id");
                  rule.aggregate("user.name", "cool", "(user.name).join()");
                  rule.output("cool", "sms outbox.id");
                });
              },
              [["user", 0, "jamie"], ["user", 2, "rob"], ["user", 1, "chris"]],
              [["sms outbox", "jamie,chris,rob"]]);

eve.test.test("grouped aggregate",
              function(sys) {
                sys.rule("this is a cool rule", function(rule) {
                  rule.source("user");
                  rule.sink("sms outbox");
                  rule.group("user.id");
                  rule.sort("user.name");
                  rule.aggregate("user.name", "cool", "(user.name).join()");
                  rule.output("cool", "sms outbox.id");
                });
              },
              [["user", 0, "jamie"], ["user", 0, "rob"], ["user", 1, "chris"]],
              [["sms outbox", "jamie,rob"], ["sms outbox", "chris"]]);


eve.test.test("limited aggregate",
              function(sys) {
                sys.rule("this is a cool rule", function(rule) {
                  rule.source("user");
                  rule.sink("sms outbox");
                  rule.group("user.id");
                  rule.sort("user.name");
                  rule.limit("user.id");
                  rule.aggregate("user.name", "cool", "(user.name).join()");
                  rule.output("cool", "sms outbox.id");
                });
              },
              [["user", 1, "jamie"], ["user", 1, "rob"], ["user", 0, "chris"]],
              [["sms outbox", "jamie"]]);

eve.test.test("constant limited aggregate",
              function(sys) {
                sys.rule("this is a cool rule", function(rule) {
                  rule.source("user");
                  rule.sink("sms outbox");
                  rule.group("user.id");
                  rule.sort("user.name");
                  rule.constantLimit(1);
                  rule.aggregate("user.name", "cool", "(user.name).join()");
                  rule.output("cool", "sms outbox.id");
                });
              },
              [["user", 1, "jamie"], ["user", 1, "rob"], ["user", 0, "chris"]],
              [["sms outbox", "jamie"], ["sms outbox", "chris"]]);

eve.test.test("filter pass",
              function(sys) {
                sys.rule("this is a cool rule", function(rule) {
                  rule.source("click");
                  rule.sink("sms outbox");
                  rule.calculate("foo", ["click.id"], "click.id + 5");
                  rule.eq("foo", 23);
                  rule.output("foo", "sms outbox.id");
                });
              },
              [["click", 18]],
              [["sms outbox", 23]]);

eve.test.test("filter fail",
              function(sys) {
                sys.rule("this is a cool rule", function(rule) {
                  rule.source("click");
                  rule.sink("sms outbox");
                  rule.calculate("foo", ["click.id"], "click.id + 5");
                  rule.eq("foo", 23);
                  rule.output("foo", "sms outbox.id");
                });
              },
              [["click", 10]],
              []);

console.timeEnd("compiler tests");

eve.test.check();
