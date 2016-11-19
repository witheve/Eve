import * as test from "tape";
import {evaluate} from "./shared_functions";

test("Should be able to use the convert function to convert from string to number", (assert) => {
  let expected = {
    insert: [
      ["a", "tag", "foo"],  ["a", "value", "1"],
      ["b", "tag", "result"],  ["b", "result", 1],
    ],
    remove: [ ]
  };
  evaluate(assert, expected, `
    add a foo
    ~~~
      commit
        [#foo value: "1"]
    ~~~

    is test
    ~~~
      search
        [#foo value]
        result = convert[value: value to: "number"]
      commit
        [#result result]
    ~~~
  `);
  assert.end();
});

test("Should be able to use the convert function to convert from number to string", (assert) => {
  let expected = {
    insert: [
      ["a", "tag", "foo"],  ["a", "value", 1],
      ["b", "tag", "result"],  ["b", "result", "1"],
    ],
    remove: [ ]
  };
  evaluate(assert, expected, `
    add a foo
    ~~~
      commit
        [#foo value: 1]
    ~~~

    is test
    ~~~
      search
        [#foo value]
        result = convert[value: value to: "string"]
      commit
        [#result result]
    ~~~
  `);
  assert.end();
});

test("Should be able to use the convert function to convert from meters to feets", (assert) => {
  let expected = {
    insert: [
      ["a", "tag", "foo"],  ["a", "value", 1],
      ["b", "tag", "result"],  ["b", "result", 3.281],
    ],
    remove: [ ]
  };
  evaluate(assert, expected, `
    add a foo
    ~~~
      commit
        [#foo value: 1]
    ~~~

    is test
    ~~~
      search
        [#foo value]
        result = convert[value: value from: "meters" to: "feets"]
      commit
        [#result result]
    ~~~
  `);
  assert.end();
});

test("Should be able to use the convert function to convert from feets to meters", (assert) => {
  let expected = {
    insert: [
      ["a", "tag", "foo"],  ["a", "value", 3.281],
      ["b", "tag", "result"],  ["b", "result", 1],
    ],
    remove: [ ]
  };
  evaluate(assert, expected, `
    add a foo
    ~~~
      commit
        [#foo value: 3.281]
    ~~~

    is test
    ~~~
      search
        [#foo value]
        result = convert[value: value from: "feets" to: "meters"]
      commit
        [#result result]
    ~~~
  `);
  assert.end();
});
