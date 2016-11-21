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
    errors: true,
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
    errors: true,
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
