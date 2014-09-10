console.time("Tests");

selfJoin.assert({maxTests: 1000});
productJoin.assert({maxTests: 1000, maxSize: 200});
constantJoin.assert({maxTests: 1000});
incrementalConstantJoin.assert({maxTests: 1000});
actualJoin.assert({maxTests: 1000, maxSize: 200});
incrementalActualJoin.assert({maxTests: 1000, maxSize: 200});
functionJoin.assert({maxTests: 1000, maxSize: 100});
incrementalFunctionJoin.assert({maxTests: 1000, maxSize: 50});
negatedJoin.assert({maxTests: 1000});
incrementalNegatedJoin.assert({maxTests: 1000});

compiledPathTest();
compiledFunctionTest();
compiledNegationTest();

console.timeEnd("Tests");
