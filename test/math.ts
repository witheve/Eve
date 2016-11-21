import * as test from "tape";
import {evaluate,verify,dedent} from "./shared_functions";

test("Should be able to use the sin function with degrees and radians", (assert) => {
  let expected = {
    insert: [
      ["a", "tag", "div"],
      ["a", "text", "1"],
      ["b", "tag", "div"],
      ["b", "text", "0.9999996829318346"],
    ],
    remove: [],
  };

  evaluate(assert, expected, `
    Now consider this:

    ~~~
    search
      y = sin[degrees: 90]
      x = sin[radians: 3.14 / 2]

    bind @browser
      [#div text: y]
      [#div text: x]
    ~~~
  `);
  assert.end();
})

test("Should be able to use the cos function with degrees and radians", (assert) => {
  let expected = {
    insert: [
      ["a", "tag", "div"],
      ["a", "text", "1"],
      ["b", "tag", "div"],
      ["b", "text", "-0.9999987317275395"],
    ],
    remove: [],
  };

  evaluate(assert, expected, `
    Now consider this:

    ~~~
    search
      y = cos[degrees: 0]
      x = cos[radians: 3.14]

    bind @browser
      [#div text: y]
      [#div text: x]
    ~~~
  `);
  assert.end();
})

test("Should be able to use the tan function with degrees and radians", (assert) => {
  let expected = {
    insert: [
      ["a", "tag", "div"],
      ["a", "text", "0.5773502691896257"],
      ["b", "tag", "div"],
      ["b", "text", "0.5463024898437905"],
    ],
    remove: [],
  };

  evaluate(assert, expected, `
    Now consider this:

    ~~~
    search
      y = tan[degrees: 30]
      x = tan[radians: 0.5]

    bind @browser
      [#div text: y]
      [#div text: x]
    ~~~
  `);
  assert.end();
})

// Test inverse Trig
let atrig_list : any = [
  {"Expression":"asin[ value: 0.8414709848078965 ]", "Value":"1"},
  // Does Eve need an implicit round under the hood? The below should be 1
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

test("Range and function within function", (assert) => {
  let expected = {
    insert: [
      ["a", "tag", "div"],
      ["a", "text", "1"],
      ["b", "tag", "div"],
      ["b", "text", "2"],
      ["c", "tag", "div"],
      ["c", "text", "3"],
    ],
    remove: [],
  };

  evaluate(assert, expected, `
    Now consider this:

    ~~~
    search
      x = range[from:1 to: pi[] increment: 1 ]

    bind @browser
      [#div text:x]
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
  {"Expression":"to-fixed[ value: 1.499 places:2 ]", "Value":"1.50"},
  ]
testSingleExpressionByList(toFixed_list );

test("Test that string concatenation is still working after NaN change.", (assert) => {
  let expected = {
    insert: [
      ["a", "tag", "div"],
      ["a", "text", "Test Testy"],
    ],
    remove: [],
  };

  evaluate(assert, expected, `
    ~~~
    search
      a = "Test "
      b = "Testy"
      x =  a + b
    bind @browser
    [#div text: x]
    ~~~
  `);
  assert.end();
});

test("Divide by zero should return nothing.", (assert) => {
  let expected = {
    insert: [],
    remove: [],
  };

  evaluate(assert, expected, `
    Now consider this:

    ~~~
    search
      x = 1 / 0 

    bind @browser
      [#div text:x]
    ~~~
  `);
  assert.end();
});

test("Divide by zero in an if statement should be detectable.", (assert) => {
  let expected = {
    insert: [
      ["a", "tag", "div"],
      ["a", "text", "Divide by zero"],
    ],
    remove: [],
  };

  evaluate(assert, expected, `
    ~~~
    search
      a = 1
      b = 0
      x = if a / b then "Ooops"
          else "Divide by zero"
    bind @browser
    [#div text: x]
    ~~~
  `);
  assert.end();
});

test("ACosh < 1 should return nothing.", (assert) => {
  let expected = {
    insert: [],
    remove: [],
  };

  evaluate(assert, expected, `
    Now consider this:

    ~~~
    search
      x = acosh[value: 0.999999999999999] 

    bind @browser
      [#div text:x]
    ~~~
  `);
  assert.end();
});

test("ATanH < -1 and > 1 should return nothing.", (assert) => {
  let expected = {
    insert: [],
    remove: [],
  };

  evaluate(assert, expected, `
    Now consider this:

    ~~~
    search
      x = atanh[value: 1.000000000000001] 

    bind @browser
      [#div text:x]
    ~~~
  `);
  assert.end();
});
