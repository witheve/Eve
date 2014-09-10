console.time("selfJoin");
selfJoin.assert({maxTests: 1000});
console.timeEnd("selfJoin");

console.time("productJoin");
productJoin.assert({maxTests: 1000, maxSize: 200});
console.timeEnd("productJoin");

console.time("constantJoin");
constantJoin.assert({maxTests: 1000});
console.timeEnd("constantJoin");

console.time("incrementalConstantJoin");
incrementalConstantJoin.assert({maxTests: 1000});
console.timeEnd("incrementalConstantJoin")

console.time("actualJoin");
actualJoin.assert({maxTests: 1000, maxSize: 200});
console.timeEnd("actualJoin");

console.time("incrementalActualJoin");
incrementalActualJoin.assert({maxTests: 1000, maxSize: 200});
console.timeEnd("incrementalActualJoin");

console.time("functionJoin");
functionJoin.assert({maxTests: 1000, maxSize: 100});
console.timeEnd("functionJoin");

console.time("incrementalFunctionJoin");
incrementalFunctionJoin.assert({maxTests: 1000, maxSize: 50});
console.timeEnd("incrementalFunctionJoin");

console.time("negatedJoin");
negatedJoin.assert({maxTests: 1000});
console.timeEnd("negatedJoin");

console.time("incrementalNegatedJoin");
incrementalNegatedJoin.assert({maxTests: 1000});
console.timeEnd("incrementalNegatedJoin");

console.time("Compiler tests")
compiledPathTest();
compiledFunctionTest();
compiledNegationTest();
console.timeEnd("Compiler tests");
