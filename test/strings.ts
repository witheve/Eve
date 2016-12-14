import * as test from "tape";
import {evaluates, evaluate} from "./shared_functions";

test("test string join ordering", (assert) => {
  evaluates(assert, `
               ~~~
                 commit
                      [#foo token:"a" level:2]
                      [#foo token:"zkp" level:3]
                      [#foo token:"parg" level:0]
                      [#foo token:"naxxo" level:1]
               ~~~

                ~~~
                search
                  [#foo token level]
                  index = sort[value:token given:token]                 
                  a = join[token index given:token with:"/"]
                  a = "a/naxxo/parg/zkp"
                  b = join[token index:level given:token with:"/"]
                  b = "parg/naxxo/a/zkp"                  
                commit
                  [#success]
                ~~~
  `);
  assert.end();
});

test("check length of hello", (assert) => {
  let expected = {
    insert: [
      ["1", "len", "5" ],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    ~~~
    search
      len = length[text: "hello"]

    commit
      [len: len]
    ~~~
  `);
  assert.end();
})

test("check length empty string", (assert) => {
  let expected = {
    insert: [
      ["1", "len", "0" ],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    ~~~
    search
      len = length[text: ""]

    commit
      [len: len]
    ~~~
  `);
  assert.end();
})


test("test length equality", (assert) => {
  let expected = {
    insert: [
      ["1", "len", "4" ],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    ~~~
    search
      len = length[text: "test"]
      len = 4
      
    commit
      [len: len]
    ~~~
  `);
  assert.end();
})

test("test length equality with as", (assert) => {
  let expected = {
    insert: [],
    remove: []
  };
  evaluate(assert, expected, `
    ~~~
    search
      len = length[text: "test" as: "symbols"]
      len = 3

    commit
      [len: len]
    ~~~
  `);
  assert.end();
})

test("check length of string as symbol", (assert) => {
  let expected = {
    insert: [
      ["1", "len", "5" ],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    ~~~
    search
      len = length[text: "hello" as: "symbols"]

    commit
      [len: len]
    ~~~
  `);
  assert.end();
})

test("nothing is inserted if with invalid as", (assert) => {
  let expected = {
    insert: [],
    remove: []
  };
  evaluate(assert, expected, `
    ~~~
    search
      len = length[text: "hello" as: "asdfasdf"]

    commit
      [len: len]
    ~~~
  `);
  assert.end();
})

test("check length multi-byte characters as symbols", (assert) => {
  let expected = {
    insert: [
      ["1", "len", "2" ],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    ~~~
    search
      len = length[text: "𝐁B" as: "symbols"]

    commit
      [len: len]
    ~~~
  `);
  assert.end();
})

test("length of multi-byte characters as code-points", (assert) => {
  let expected = {
    insert: [
      ["1", "len", "3" ],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    ~~~
    search
      len = length[text: "𝐁b" as: "code-points"]
      
    commit
      [len: len]
    ~~~
  `);
  assert.end();
})
