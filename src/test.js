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
                  rule.source("clicks");
                  rule.sink("sms outbox");
                  rule.output("clicks.id", "sms outbox.id");
                });
              },
              [["users", 5, "chris"], ["clicks", 5]],
              [["sms outbox", 5]]);

eve.test.test("simple join",
              function(sys) {
                sys.rule("this is a cool rule", function(rule) {
                  rule.source("clicks");
                  rule.source("users");
                  rule.sink("sms outbox");
                  rule.join("clicks.id", "users.id");
                  rule.output("users.name", "sms outbox.id");
                });
              },
              [["users", 5, "chris"], ["users", 7, "jamie"], ["users", 20, "rob"], ["clicks", 10], ["clicks", 5], ["clicks", 20]],
              [["sms outbox", "chris"], ["sms outbox", "rob"]]);

eve.test.test("simple aggregate",
              function(sys) {
                sys.rule("this is a cool rule", function(rule) {
                  rule.source("clicks");
                  rule.sink("sms outbox");
                  rule.aggregate("clicks.id", "cool", "'hey'");
                  rule.output("cool", "sms outbox.id");
                });
              },
              [["users", 5, "chris"], ["clicks", 5]],
              [["sms outbox", "hey"]]);

eve.test.test("sorted aggregate",
              function(sys) {
                sys.rule("this is a cool rule", function(rule) {
                  rule.source("users");
                  rule.sink("sms outbox");
                  rule.sort("users.id");
                  rule.aggregate("users.name", "cool", "(users.name).join()");
                  rule.output("cool", "sms outbox.id");
                });
              },
              [["users", 0, "jamie"], ["users", 2, "rob"], ["users", 1, "chris"]],
              [["sms outbox", "jamie,chris,rob"]]);

eve.test.test("grouped aggregate",
              function(sys) {
                sys.rule("this is a cool rule", function(rule) {
                  rule.source("users");
                  rule.sink("sms outbox");
                  rule.group("users.id");
                  rule.sort("users.name");
                  rule.aggregate("users.name", "cool", "(users.name).join()");
                  rule.output("cool", "sms outbox.id");
                });
              },
              [["users", 0, "jamie"], ["users", 0, "rob"], ["users", 1, "chris"]],
              [["sms outbox", "jamie,rob"], ["sms outbox", "chris"]]);


eve.test.test("limited aggregate",
              function(sys) {
                sys.rule("this is a cool rule", function(rule) {
                  rule.source("users");
                  rule.sink("sms outbox");
                  rule.group("users.id");
                  rule.sort("users.name");
                  rule.limit("users.id");
                  rule.aggregate("users.name", "cool", "(users.name).join()");
                  rule.output("cool", "sms outbox.id");
                });
              },
              [["users", 1, "jamie"], ["users", 1, "rob"], ["users", 0, "chris"]],
              [["sms outbox", "jamie"]]);

eve.test.test("constant limited aggregate",
              function(sys) {
                sys.rule("this is a cool rule", function(rule) {
                  rule.source("users");
                  rule.sink("sms outbox");
                  rule.group("users.id");
                  rule.sort("users.name");
                  rule.constantLimit(1);
                  rule.aggregate("users.name", "cool", "(users.name).join()");
                  rule.output("cool", "sms outbox.id");
                });
              },
              [["users", 1, "jamie"], ["users", 1, "rob"], ["users", 0, "chris"]],
              [["sms outbox", "jamie"], ["sms outbox", "chris"]]);

eve.test.test("filter pass",
              function(sys) {
                sys.rule("this is a cool rule", function(rule) {
                  rule.source("clicks");
                  rule.sink("sms outbox");
                  rule.calculate("foo", ["clicks.id"], "clicks.id + 5");
                  rule.eq("foo", 23);
                  rule.output("foo", "sms outbox.id");
                });
              },
              [["clicks", 18]],
              [["sms outbox", 23]]);

eve.test.test("filter fail",
              function(sys) {
                sys.rule("this is a cool rule", function(rule) {
                  rule.source("clicks");
                  rule.sink("sms outbox");
                  rule.calculate("foo", ["clicks.id"], "clicks.id + 5");
                  rule.eq("foo", 23);
                  rule.output("foo", "sms outbox.id");
                });
              },
              [["clicks", 10]],
              []);

console.timeEnd("compiler tests");

eve.test.check();
