import * as test from "tape";
import {evaluate,verify,dedent,testSingleExpressionByList} from "./shared_functions";

// Test Constants
// Would this fail on different architectures than mine? Not according to dcmumentation Maybe we Should
// flush out that implicit assumption.

let constants_list : any = [
  {"Expression":"pi[]",      "Value":"3.141592653589793"},
  {"Expression":"e[]",       "Value":"2.718281828459045"},
  {"Expression":"ln2[]",     "Value":"0.6931471805599453"},
  {"Expression":"log2e[]",   "Value":"1.4426950408889634"},
  {"Expression":"log10e[]",  "Value":"0.4342944819032518"},
  {"Expression":"sqrt1/2[]", "Value":"0.7071067811865476"},
  {"Expression":"sqrt2[]",   "Value":"1.4142135623730951"}
]
testSingleExpressionByList(constants_list);

// Test Power Function
let pow_list : any = [
  {"Expression":"pow[ value:2 by:3 ]",     "Value":"8"},
  {"Expression":"pow[ value:9 by:1 / 2 ]", "Value":"3"}]
testSingleExpressionByList(pow_list);

// Test Log Function
let log_list : any = [
  {"Expression":"log[ value: e[] ]", "Value":"1"},
  {"Expression":"log[ value: 10 base: 10 ]", "Value":"1"}]
testSingleExpressionByList(log_list);

// Test Exp Function
let exp_list : any = [
  {"Expression":"exp[ value: 1 ]", "Value":"2.718281828459045"}]
testSingleExpressionByList(exp_list);

// Test Trig Functions
let trig_list : any = [
  {"Expression":"sin[ radians: 1 ]", "Value":"0.8414709848078965"},
  {"Expression":"cos[ radians: 1 ]", "Value":"0.5403023058681398"},
  {"Expression":"tan[ radians: 1 ]", "Value":"1.5574077246549023"}
  ]
testSingleExpressionByList(trig_list);


test("Should be able to use the sin function with degrees and radians", (assert) => {
  let expected = {
    insert: [
      ["a", "result", "1"],
      ["b", "result", "0.9999996829318346"],
    ],
    remove: [],
  };

  evaluate(assert, expected, `
    ~~~
    search
      y = sin[degrees: 90]
      x = sin[radians: 3.14 / 2]

    bind
      [result: y]
      [result: x]
    ~~~
  `);
  assert.end();
})

test("Should be able to use the cos function with degrees and radians", (assert) => {
  let expected = {
    insert: [
      ["a", "result", "1"],
      ["b", "result", "-0.9999987317275395"],
    ],
    remove: [],
  };

  evaluate(assert, expected, `
    ~~~
    search
      y = cos[degrees: 0]
      x = cos[radians: 3.14]

    bind
      [result: y]
      [result: x]
    ~~~
  `);
  assert.end();
})

test("Should be able to use the tan function with degrees and radians", (assert) => {
  let expected = {
    insert: [
      ["a", "result", "0.5773502691896257"],
      ["b", "result", "0.5463024898437905"],
    ],
    remove: [],
  };

  evaluate(assert, expected, `
    ~~~
    search
      y = tan[degrees: 30]
      x = tan[radians: 0.5]

    bind
      [result: y]
      [result: x]
    ~~~
  `);
  assert.end();
})

// Test inverse Trig
let atrig_list : any = [
  {"Expression":"asin[ value: 0.8414709848078965 ]", "Value":"1"},
  {"Expression":"acos[ value: 0.5403023058681398 ]", "Value":"0.9999999999999999"},
  {"Expression":"atan[ value: 1.5574077246549023 ]", "Value":"1"},
  ]
testSingleExpressionByList(atrig_list);

// Test Hyperbolic Functions
let hyp_list : any = [
  {"Expression":"sinh[ value: 1 ]", "Value":"1.1752011936438014"},
  {"Expression":"cosh[ value: 1 ]", "Value":"1.5430806348152437"},
  {"Expression":"tanh[ value: 1 ]", "Value":"0.7615941559557649"},
  ]
testSingleExpressionByList(hyp_list);

// Test Inverse Hyperbolic Functions
let ahyp_list : any = [
  {"Expression":"asinh[ value: 1.1752011936438014 ]", "Value":"1"},
  {"Expression":"acosh[ value: 1.5430806348152437 ]", "Value":"1"},
  {"Expression":"atanh[ value: 0.7615941559557649 ]", "Value":"0.9999999999999999"},
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
      ["a", "result", "1"],
    ],
    remove: [],
  };

  evaluate(assert, expected, `
    ~~~
    search
      x = sin[radians: pi[] / 2]

    bind
      [result: x]
    ~~~
  `);
  assert.end();
})

// Test Floor Function
let floor_list : any = [
  {"Expression":"floor[ value: 1.0000000000000001 ]", "Value":"1"},
  {"Expression":"floor[ value: 1.999999999999999 ]", "Value":"1"},
  ]
testSingleExpressionByList(floor_list);

// Test Ceiling Function
let ceiling_list : any = [
  {"Expression":"ceiling[ value: 1.000000000000001 ]", "Value":"2"},
  {"Expression":"ceiling[ value: 1.999999999999999 ]", "Value":"2"},
  ]
testSingleExpressionByList(ceiling_list);

// Test ABS Function
let abs_list : any = [
  {"Expression":"abs[ value: -1 ]", "Value":"1"},
  {"Expression":"abs[ value: 1 ]", "Value":"1"},
  ]
testSingleExpressionByList(abs_list);

// Test Mod Function
let mod_list : any = [
  {"Expression":"mod[ value: 7 by: 3]", "Value":"1"},
  {"Expression":"mod[ value: 6 by: 3]", "Value":"0"},
  ]
testSingleExpressionByList(mod_list);

// Test Round Function
let round_list : any = [
  {"Expression":"round[ value: 1.49999999999999 ]", "Value":"1"},
  {"Expression":"round[ value: 1.5 ]", "Value":"2"}
  ]
testSingleExpressionByList(round_list);

// Test Round Function
let toFixed_list : any = [
  {"Expression":"to-fixed[ value: 1.499 places: 2 ]", "Value":"1.50"},
  ]
testSingleExpressionByList(toFixed_list );
