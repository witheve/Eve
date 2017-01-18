import * as test from "tape";
import {evaluate} from "./shared_functions";

test("errors when using an attribute of just created record as a value", (assert) => {
  let expected = {
    insert: [["a", "tag", "foo"]],
    remove: [],
    errors: true
  };
  evaluate(assert, expected, `
    prepare
    ~~~
      commit
        [#foo]
    ~~~

    test
    ~~~
      search
        foo = [#foo]
      commit
        bar = [#bar]
        foo.copy-of-bar-tag += bar.tag
    ~~~
  `);
  assert.end();
})

test("errors when changing a sub-record of just created record", (assert) => {
  let expected = {
    insert: [],
    remove: [],
    errors: true
  };
  evaluate(assert, expected, `
    test
    ~~~
      commit
        baz = [#baz bar: [#bar]]
        baz.bar.tag := "new bar"
    ~~~
  `);
  assert.end();
})

test("errors when changing a sub-record of just created record using a tag shortcut syntax", (assert) => {
  let expected = {
    insert: [],
    remove: [],
    errors: true
  };
  evaluate(assert, expected, `
    test
    ~~~
      commit
        baz = [#baz bar: [#bar]]
        baz.bar += #child
    ~~~
  `);
  assert.end();
})
