import * as test from "tape";
import {evaluate} from "./shared_functions";

test("dot-notation with a variable in a search", (assert) => {
  let expected = {
    insert: [["a", "tag", "foo"],
             ["a", "value", 42],
             ["b", "tag", "result"],
             ["b", "value", 42]],
    remove: []
  };
  evaluate(assert, expected, `
    prepare
    ~~~
      commit
        [#foo value: 42]
    ~~~

    test
    ~~~
      search
        foo = [#foo]
        value = foo.value
      commit
        [#result value]
    ~~~
  `);
  assert.end();
})

test("dot-notation with a record in a search", (assert) => {
  let expected = {
    insert: [["a", "tag", "foo"],
             ["a", "value", 42],
             ["b", "tag", "result"],
             ["b", "value", 42]],
    remove: []
  };
  evaluate(assert, expected, `
    prepare
    ~~~
      commit
        [#foo value: 42]
    ~~~

    test
    ~~~
      search
        value = [#foo].value
      commit
        [#result value]
    ~~~
  `);
  assert.end();
})

test("double dot-notation in a search", (assert) => {
  let expected = {
    insert: [["a", "tag", "foo"],
             ["a", "value", "b"],
             ["b", "tag", "bar"],
             ["b", "value", 42],
             ["c", "tag", "result"],
             ["c", "value", 42]],
    remove: []
  };
  evaluate(assert, expected, `
    prepare
    ~~~
      commit
        [#foo value: [#bar value: 42]]
    ~~~

    test
    ~~~
      search
        value = [#foo].value.value
      commit
        [#result value]
    ~~~
  `);
  assert.end();
})
