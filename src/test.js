var testMultiplier = 0.1;
if(typeof window == "undefined") {
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
              [["users", 5, "chris"], ["clicks", 5]],
              [["sms outbox", "chris"]]);

eve.test.test("simple aggregate",
              function(sys) {
                sys.rule("this is a cool rule", function(rule) {
                  rule.source("clicks");
                  rule.sink("sms outbox");
                  rule.aggregate("clicks.id", "cool", "console.log(clicks.id) || 'hey'");
                  rule.output("cool", "sms outbox.id");
                });
              },
              [["users", 5, "chris"], ["clicks", 5]],
              [["sms outbox", "hey"]]);

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
