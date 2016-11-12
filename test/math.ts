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