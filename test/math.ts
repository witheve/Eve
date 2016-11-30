import * as test from "tape";
import {evaluate, verify, dedent, testSingleExpressionByList, valueTest} from "./shared_functions";

// Test Constants
// Would this fail on different architectures than mine? Not according to documentation Maybe we Should
// flush out that implicit assumption.

let delta = 0.00000000001;

let constants_list : valueTest[] = [
  {expression: "pi[]",      expectedValue: 3.141592653589793},
  {expression: "e[]",       expectedValue: 2.718281828459045},
  {expression: "ln2[]",     expectedValue: 0.6931471805599453},
  {expression: "log2e[]",   expectedValue: 1.4426950408889634},
  {expression: "log10e[]",  expectedValue: 0.4342944819032518},
  {expression: "sqrt1/2[]", expectedValue: 0.7071067811865476},
  {expression: "sqrt2[]",   expectedValue: 1.4142135623730951}
]
testSingleExpressionByList(constants_list);

// Test Power Function
let pow_list : valueTest[]  = [
  {expression: "pow[ value:2 by:3 ]",     expectedValue: 8},
  {expression: "pow[ value:9 by:1 / 2 ]", expectedValue: 3}]
testSingleExpressionByList(pow_list);

// Test Log Function
let log_list : valueTest[]  = [
  {expression: "log[ value: e[] ]", expectedValue: 1},
  {expression: "log[ value: 10 base: 10 ]", expectedValue: 1}]
testSingleExpressionByList(log_list);

// Test Exp Function
let exp_list : valueTest[]  = [
  {expression: "exp[ value: 1 ]", expectedValue: 2.718281828459045}]
testSingleExpressionByList(exp_list);

// Test Trig Functions
let trig_list : valueTest[]  = [
  {expression: "sin[ radians: 1 ]", expectedValue: 0.8414709848078965},
  {expression: "cos[ radians: 1 ]", expectedValue: 0.5403023058681398},
  {expression: "tan[ radians: 1 ]", expectedValue: 1.5574077246549023}
  ]
testSingleExpressionByList(trig_list);


test("Should be able to use the sin function with degrees and radians", (assert) => {
  let expected = {
    insert: [
      ["a", "floatTest", "1"],
      ["b", "floatTest", "0.9999996829318346"],
    ],
    remove: [],
  };

  evaluate(assert, expected, `
    ~~~
    search
      y = sin[degrees: 90]
      x = sin[radians: 3.14 / 2]

    bind
      [floatTest: y]
      [floatTest: x]
    ~~~
  `);
  assert.end();
})

test("Should be able to use the cos function with degrees and radians", (assert) => {
  let expected = {
    insert: [
      ["a", "floatTest", "1"],
      ["b", "floatTest", "-0.9999987317275395"],
    ],
    remove: [],
  };

  evaluate(assert, expected, `
    ~~~
    search
      y = cos[degrees: 0]
      x = cos[radians: 3.14]

    bind
      [floatTest: y]
      [floatTest: x]
    ~~~
  `);
  assert.end();
})

test("Should be able to use the tan function with degrees and radians", (assert) => {
  let expected = {
    insert: [
      ["a", "floatTest", "0.5773502691896257"],
      ["b", "floatTest", "0.5463024898437905"],
    ],
    remove: [],
  };

  evaluate(assert, expected, `
    ~~~
    search
      y = tan[degrees: 30]
      x = tan[radians: 0.5]

    bind
      [floatTest: y]
      [floatTest: x]
    ~~~
  `);
  assert.end();
})

// Test inverse Trig
let atrig_list : valueTest[]  = [
  {expression: "asin[ value: 0.8414709848078965 ]", expectedValue: 1},
  {expression: "acos[ value: 0.5403023058681398 ]", expectedValue: 0.9999999999999999},
  {expression: "atan[ value: 1.5574077246549023 ]", expectedValue: 1},
  ]
testSingleExpressionByList(atrig_list);

// Test Hyperbolic Functions
let hyp_list : valueTest[]  = [
  {expression: "sinh[ value: 1 ]", expectedValue: 1.1752011936438014},
  {expression: "cosh[ value: 1 ]", expectedValue: 1.5430806348152437},
  {expression: "tanh[ value: 1 ]", expectedValue: 0.7615941559557649},
  ]
testSingleExpressionByList(hyp_list);

// Test Inverse Hyperbolic Functions
let ahyp_list : valueTest[]  = [
  {expression: "asinh[ value: 1.1752011936438014 ]", expectedValue: 1},
  {expression: "acosh[ value: 1.5430806348152437 ]", expectedValue: 1},
  {expression: "atanh[ value: 0.7615941559557649 ]", expectedValue: 0.9999999999999999},
  ]
testSingleExpressionByList(ahyp_list);

test("Test range", (assert) => {
  let expected = {
    insert: [
      ["a", "result", "1"],
      ["b", "result", "2"],
      ["c", "result", "3"],
    ],
    remove: [],
  };

  evaluate(assert, expected, `
    ~~~
    search
      x = range[from:1 to: 3 increment: 1 ]

    bind
      [result: x]
    ~~~
  `);
  assert.end();
})

test("Test nested functions", (assert) => {
  let expected = {
    insert: [
      ["a", "floatTest", "1"],
    ],
    remove: [],
  };

  evaluate(assert, expected, `
    ~~~
    search
      x = sin[radians: pi[] / 2]

    bind
      [floatTest: x]
    ~~~
  `);
  assert.end();
})

// Test Floor Function
let floor_list : valueTest[]  = [
  {expression: "floor[ value: 1.0000000000000001 ]", expectedValue: 1},
  {expression: "floor[ value: 1.999999999999999 ]", expectedValue: 1},
  ]
testSingleExpressionByList(floor_list);

// Test Ceiling Function
let ceiling_list : valueTest[]  = [
  {expression: "ceiling[ value: 1.000000000000001 ]", expectedValue: 2},
  {expression: "ceiling[ value: 1.999999999999999 ]", expectedValue: 2},
  ]
testSingleExpressionByList(ceiling_list);

// Test ABS Function
let abs_list : valueTest[]  = [
  {expression: "abs[ value: -1 ]", expectedValue: 1},
  {expression: "abs[ value: 1 ]", expectedValue: 1},
  ]
testSingleExpressionByList(abs_list);

// Test Mod Function
let mod_list : valueTest[]  = [
  {expression: "mod[ value: 7 by: 3]", expectedValue: 1},
  {expression: "mod[ value: 6 by: 3]", expectedValue: 0},
  ]
testSingleExpressionByList(mod_list);

// Test Round Function
let round_list : valueTest[]  = [
  {expression: "round[ value: 1.49999999999999 ]", expectedValue: 1},
  {expression: "round[ value: 1.5 ]", expectedValue: 2}
  ]
testSingleExpressionByList(round_list);

// Test Round Function
let toFixed_list : valueTest[]  = [
  {expression: "to-fixed[ value: 1.499 places: 2 ]", expectedValue: 1.50},
  ]
testSingleExpressionByList(toFixed_list );