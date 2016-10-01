import * as test from "tape";
import {Evaluation} from "../src/runtime/runtime";
import * as join from "../src/runtime/join";
import * as parser from "../src/runtime/parser";
import * as builder from "../src/runtime/builder";
import {InsertAction, RemoveAction} from "../src/runtime/actions";
import {BrowserSessionDatabase} from "../src/runtime/databases/browserSession";

function dedent(str) {
  let lines = [];
  let indent;
  for(let line of str.split("\n")) {
    let match = line.match(/^[ \t]+/);
    if(match) {
      if(!indent) {
        indent = match[0].length;
      }
      line = line.substr(indent);
    }
    lines.push(line);
  }
  return lines.join("\n");
}

function verify(assert, adds, removes, data) {
  let addLookup = {};
  for(let add of adds) {
    addLookup[JSON.stringify(add)] = true;
  }
  let removeLookup = {};
  for(let remove of removes) {
    removeLookup[JSON.stringify(remove)] = true;
  }
  assert.equal(data.insert.length, adds.length, "Wrong number of inserts");
  assert.equal(data.remove.length, removes.length, "Wrong number of removes");
  for(let add of data.insert) {
    let key = JSON.stringify(add);
    assert.true(addLookup[key], "Unexpected insert: " + key)
  }
  for(let remove of data.remove) {
    let key = JSON.stringify(remove);
    assert.true(removeLookup[key], "Unexpected remove: " + key)
  }
}

function evaluate(assert, expected, code) {
  join.nextId(0);
  let parsed = parser.parseDoc(dedent(code));
  let {blocks} = builder.buildDoc(parsed.results);
  let session = new BrowserSessionDatabase({send: () => {}});
  session.blocks = blocks;
  let evaluation = new Evaluation();
  evaluation.registerDatabase("session", session);
  let changes = evaluation.fixpoint();
  verify(assert, expected.insert, expected.remove, changes.result());
  let next = {execute: (expected, actions) => {
    let changes = evaluation.executeActions(actions);
    verify(assert, expected.insert, expected.remove, changes.result());
    return next;
  }};
  return next;
}

test("create a record", (assert) => {
  let expected = {
    insert: [ ["2", "tag", "person"], ["2", "name", "chris"], ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person @chris]
    ~~~
  `);
  assert.end();
})

test("match and create a record", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["5", "tag", "person"],
      ["5", "name", "joe"],
      ["9|2", "dude", "2"],
      ["9|5", "dude", "5"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person @chris]
        [#person @joe]
    ~~~

    foo bar
    ~~~
      match
        p = [#person]
      commit
        [dude: p]
    ~~~
  `);
  assert.end();
})

test("match with constant filter", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["5", "tag", "person"],
      ["5", "name", "joe"],
      ["10|2", "dude", "2"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person @chris]
        [#person @joe]
    ~~~

    foo bar
    ~~~
      match
        p = [#person name]
        name = "chris"
      commit
        [dude: p]
    ~~~
  `);
  assert.end();
})


test("match with constant attribute", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["5", "tag", "person"],
      ["5", "name", "joe"],
      ["10|2", "dude", "2"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person @chris]
        [#person @joe]
    ~~~

    foo bar
    ~~~
      match
        p = [#person name: "chris"]
      commit
        [dude: p]
    ~~~
  `);
  assert.end();
})

test("match with attribute having multiple values", (assert) => {
  let expected = {
    insert: [
      ["3", "tag", "person"],
      ["3", "name", "chris"],
      ["3", "name", "michael"],
      ["6", "tag", "person"],
      ["6", "name", "chris"],
      ["12|3", "dude", "3"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person @chris @michael]
        [#person @chris]
    ~~~

    foo bar
    ~~~
      match
        p = [#person name: "chris" name: "michael"]
      commit
        [dude: p]
    ~~~
  `);
  assert.end();
})

test("match with attribute having multiple values in parenthesis", (assert) => {
  let expected = {
    insert: [
      ["3", "tag", "person"],
      ["3", "name", "chris"],
      ["3", "name", "michael"],
      ["9|3", "dude", "3"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person @chris @michael]
    ~~~

    foo bar
    ~~~
      match
        p = [#person name: ("chris", "michael")]
      commit
        [dude: p]
    ~~~
  `);
  assert.end();
})

test("match with attribute having multiple values in parenthesis with a function", (assert) => {
  let expected = {
    insert: [
      ["3", "tag", "person"],
      ["3", "name", "chris"],
      ["3", "name", 13],
      ["10|3", "dude", "3"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person @chris name: 13]
    ~~~

    foo bar
    ~~~
      match
        p = [#person name: ("chris", 4 + 9)]
      commit
        [dude: p]
    ~~~
  `);
  assert.end();
})

test("create a record with numeric attributes", (assert) => {
  let expected = {
    insert: [
      ["4", "tag", "json-array"],
      ["4", 1, "cool"],
      ["4", 2, "om nom"],
      ["4", 3, "om nom nom"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    array
    ~~~
      commit
        [#json-array 1: "cool" 2: "om nom" 3: "om nom nom"]
    ~~~
  `);
  assert.end();
})


test("match a record with numeric attributes", (assert) => {
  let expected = {
    insert: [
      ["4", "tag", "json-array"],
      ["4", 1, "cool"],
      ["4", 2, "om nom"],
      ["4", 3, "om nom nom"],
      ["12","foo","cool - om nom - om nom nom"]
    ],
    remove: []
  };
  evaluate(assert, expected, `
    array
    ~~~
      commit
        [#json-array 1: "cool" 2: "om nom" 3: "om nom nom"]
    ~~~

    ~~~
      match
        [#json-array 1: first, 2: second, 3: third]
      commit
        [| foo: "{{first}} - {{second}} - {{third}}"}]
    ~~~
  `);
  assert.end();
})

test("match with incompatible filters", (assert) => {
  let expected = {
    insert: [],
    remove: []
  };
  assert.throws(() => {
    evaluate(assert, expected, `
      people
      ~~~
        commit
          [#person @chris]
          [#person @joe]
      ~~~

      foo bar
      ~~~
        match
          p = [#person name]
          name = "chris"
          name = "joe"
        commit
          [dude: p]
      ~~~
    `);
  }, "Incompatible constant filters should throw an error")
  assert.end();
})

test("match with unprovided variable", (assert) => {
  let expected = {
    insert: [],
    remove: []
  };
  assert.throws(() => {
    evaluate(assert, expected, `
      people
      ~~~
        commit
          [#person @chris]
          [#person @joe]
      ~~~

      foo bar
      ~~~
        match
          [#person]
        commit
          [dude: p]
      ~~~
    `);
  }, "Unprovided variables should throw an error")
  assert.end();
})

test("match with unprovided root in an attribute access", (assert) => {
  let expected = {
    insert: [],
    remove: []
  };
  assert.throws(() => {
    evaluate(assert, expected, `
      people
      ~~~
        commit
          [#person @chris]
          [#person @joe]
      ~~~

      foo bar
      ~~~
        match
          [#person]
        commit
          [dude: p.name]
      ~~~
    `);
  }, "Unprovided variables should throw an error")
  assert.end();
})

test("match with escaped strings", (assert) => {
  let expected = {
    insert: [
      ["3", "tag", "person"],
      ["3", "name", "chris"],
      ["3","info","{\"age\": 10, \"school\": \"Lincoln\"}"],
      ["8|{\"age\": 10, \"school\": \"Lincoln\"}","info","{\"age\": 10, \"school\": \"Lincoln\"}"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person @chris info: "{\\"age\\": 10, \\"school\\": \\"Lincoln\\"}"]
    ~~~

    foo bar
    ~~~
      match
        [#person info]
      commit
        [info]
    ~~~
  `);
  assert.end();
})

test("match with escaped embeds", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["8|{chris}","info","{chris}"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person @chris]
    ~~~

    foo bar
    ~~~
      match
        [#person name]
      commit
        [info: "\\{{{name}}\\}"]
    ~~~
  `);
  assert.end();
})

test("setting an attribute", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["2", "dude", "chris"],
      ["5", "tag", "person"],
      ["5", "name", "joe"],
      ["5", "dude", "joe"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person @chris]
        [#person @joe]
    ~~~

    foo bar
    ~~~
      match
        p = [#person name]
      commit
        p.dude := name
    ~~~
  `);
  assert.end();
});

test("setting an attribute to multiple values", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["2", "dude", "chris"],
      ["2", "dude", "foo"],
      ["2", "dude", 3],
      ["5", "tag", "person"],
      ["5", "name", "joe"],
      ["5", "dude", "joe"],
      ["5", "dude", "foo"],
      ["5", "dude", 3],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person @chris]
        [#person @joe]
    ~~~

    foo bar
    ~~~
      match
        p = [#person name]
      commit
        p.dude := (name, "foo", 3)
    ~~~
  `);
  assert.end();
});

test("merging multiple values into an attribute", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["2", "dude", "chris"],
      ["2", "dude", "foo"],
      ["2", "dude", 3],
      ["5", "tag", "person"],
      ["5", "name", "joe"],
      ["5", "dude", "joe"],
      ["5", "dude", "foo"],
      ["5", "dude", 3],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person @chris]
        [#person @joe]
    ~~~

    foo bar
    ~~~
      match
        p = [#person name]
      commit
        p <- [dude: (name, "foo", 3)]
    ~~~
  `);
  assert.end();
});

test("creating an object with multiple values for an attribute", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["14|chris|8","tag","dude"],
      ["14|chris|8","dude","chris"],
      ["14|chris|8","dude","foo"],
      ["14|chris|8","dude",8],
      ["5", "tag", "person"],
      ["5", "name", "joe"],
      ["14|joe|8","tag","dude"],
      ["14|joe|8","dude","joe"],
      ["14|joe|8","dude","foo"],
      ["14|joe|8","dude",8],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person @chris]
        [#person @joe]
    ~~~

    foo bar
    ~~~
      match
        p = [#person name]
      commit
        [#dude dude: (name, "foo", 3 + 5)]
    ~~~
  `);
  assert.end();
});

test("setting an attribute that removes a previous value", (assert) => {
  let expected = {
    insert: [
      ["3", "tag", "person"],
      ["3", "name", "chris"],
      ["3", "dude", "chris"],
    ],
    remove: [
    ]
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person @chris dude: "joe"]
    ~~~

    foo bar
    ~~~
      match
        p = [#person name]
      commit
        p.dude := name
    ~~~
  `);
  assert.end();
});


test("setting an attribute on click", (assert) => {
  let expected = {
    insert: [
      ["3", "tag", "person"],
      ["3", "name", "chris"],
      ["3", "dude", "joe"],
    ],
    remove: []
  };
  let eve = evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person @chris dude: "joe"]
    ~~~

    foo bar
    ~~~
      match
        [#click]
        p = [#person name]
      commit
        p.dude := name
    ~~~
  `);
  let expected2 = {
    insert: [ ["3", "dude", "chris"], ["click", "tag", "click"] ],
    remove: [ ["3", "dude", "joe"], ]
  };
  eve.execute(expected2, [new InsertAction("click", "tag", "click")]);
  assert.end();
});


test("erase a record", (assert) => {
  let expected = {
    insert: [
    ],
    remove: [
    ]
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person @chris dude: "joe"]
    ~~~

    foo bar
    ~~~
      match
        p = [#person name]
      commit
        p := none
    ~~~
  `);
  assert.end();
});

test("erase an attribute", (assert) => {
  let expected = {
    insert: [
      ["4", "tag", "person"]
    ],
    remove: [
    ]
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person age: 19 age: 21 age: 30]
    ~~~

    foo bar
    ~~~
      match
        p = [#person]
      commit
        p.age := none
    ~~~
  `);
  assert.end();
});

test("sum constant", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "joe"],
      ["5", "tag", "person"],
      ["5", "name", "chris"],
      ["11|2", "tag", "total"],
      ["11|2", "total", 2],
    ],
    remove: [
    ]
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person @joe]
        [#person @chris]
    ~~~

    foo bar
    ~~~
      match
        p = [#person]
        total = sum[value: 1, given: p]
      commit
        [#total total]
    ~~~
  `);
  assert.end();
});

test("sum variable", (assert) => {
  let expected = {
    insert: [
      ["3", "tag", "person"],
      ["3", "name", "joe"],
      ["3", "age", 10],
      ["7", "tag", "person"],
      ["7", "name", "chris"],
      ["7", "age", 20],
      ["14|30", "tag", "total"],
      ["14|30", "total", 30],
    ],
    remove: [
    ]
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person @joe age: 10]
        [#person @chris age: 20]
    ~~~

    foo bar
    ~~~
      match
        p = [#person age]
        total = sum[value: age, given: p]
      commit
        [#total total]
    ~~~
  `);
  assert.end();
});

test("sum variable with multiple givens", (assert) => {
  let expected = {
    insert: [
      ["3", "tag", "person"],
      ["3", "name", "joe"],
      ["3", "age", 10],
      ["7", "tag", "person"],
      ["7", "name", "chris"],
      ["7", "age", 20],
      ["14|30", "tag", "total"],
      ["14|30", "total", 30],
    ],
    remove: [
    ]
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person @joe age: 10]
        [#person @chris age: 20]
    ~~~

    foo bar
    ~~~
      match
        p = [#person age]
        total = sum[value: age, given: (p, age)]
      commit
        [#total total]
    ~~~
  `);
  assert.end();
});

test("sum groups", (assert) => {
  let expected = {
    insert: [
      ["3", "tag", "person"],
      ["3", "name", "joe"],
      ["3", "age", 10],
      ["7", "tag", "person"],
      ["7", "name", "chris"],
      ["7", "age", 20],
      ["11", "tag", "person"],
      ["11", "name", "mike"],
      ["11", "age", 20],
      ["18|1", "tag", "total"],
      ["18|1", "total", 1],
      ["18|2", "tag", "total"],
      ["18|2", "total", 2],
    ],
    remove: [
    ]
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person @joe age: 10]
        [#person @chris age: 20]
        [#person @mike age: 20]
    ~~~

    foo bar
    ~~~
      match
        p = [#person age]
        total = sum[value: 1, given: p, per: age]
      commit
        [#total total]
    ~~~
  `);
  assert.end();
});

test("sum groups with multiple pers", (assert) => {
  let expected = {
    insert: [
      ["3", "tag", "person"],
      ["3", "name", "joe"],
      ["3", "age", 10],
      ["7", "tag", "person"],
      ["7", "name", "chris"],
      ["7", "age", 20],
      ["11", "tag", "person"],
      ["11", "name", "mike"],
      ["11", "age", 20],
      ["18|1", "tag", "total"],
      ["18|1", "total", 1],
      // ["18|2", "tag", "total"],
      // ["18|2", "total", 2],
    ],
    remove: [
    ]
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person @joe age: 10]
        [#person @chris age: 20]
        [#person @mike age: 20]
    ~~~

    foo bar
    ~~~
      match
        p = [#person age]
        total = sum[value: 1, given: p, per: (age, p)]
      commit
        [#total total]
    ~~~
  `);
  assert.end();
});



test("aggregate stratification", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "joe"],
      ["5", "tag", "person"],
      ["5", "name", "chris"],
    ],
    remove: [
    ]
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person @joe]
        [#person @chris]
    ~~~

    foo bar
    ~~~
      match
        p = [#person]
        total = sum[value: 1, given: p]
        total > 2
      commit
        [#total total]
    ~~~
  `);
  assert.end();
});


test("aggregate stratification with results", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "joe"],
      ["5", "tag", "person"],
      ["5", "name", "chris"],
      ["12|12", "tag", "total"],
      ["12|12", "total", 12],
    ],
    remove: [
    ]
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person @joe]
        [#person @chris]
    ~~~

    foo bar
    ~~~
      match
        p = [#person]
        total = sum[value: 1, given: p]
        total-plus-10 = total + 10
      commit
        [#total total: total-plus-10]
    ~~~
  `);
  assert.end();
});

test("aggregate stratification with another aggregate", (assert) => {
  let expected = {
    insert: [
      ["3", "tag", "person"],
      ["3", "name", "joe"],
      ["3", "age", 10],
      ["7", "tag", "person"],
      ["7", "name", "chris"],
      ["7", "age", 20],
      ["11", "tag", "person"],
      ["11", "name", "mike"],
      ["11", "age", 20],
      ["19|3", "tag", "total"],
      ["19|3", "total", 3],
    ],
    remove: [
    ]
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person @joe age: 10]
        [#person @chris age: 20]
        [#person @mike age: 20]
    ~~~

    foo bar
    ~~~
      match
        p = [#person age]
        total = sum[value: 1, given: p, per: age]
        count-all = sum[value: total, given: total]
      commit
        [#total total: count-all]
    ~~~
  `);
  assert.end();
});


test("unstratifiable aggregate", (assert) => {
  assert.throws(() => {
    let expected = {
      insert: [ ],
      remove: [ ]
    };
    evaluate(assert, expected, `
      people
      ~~~
        commit
          [#person @joe age: 10]
          [#person @chris age: 20]
          [#person @mike age: 20]
      ~~~

      foo bar
      ~~~
        match
          p = [#person age]
          total = sum[value: 1, given: count-all, per: age]
          count-all = sum[value: total, given: total]
        commit
          [#total total: count-all]
      ~~~
    `);
  }, "Unstratifiable aggregates should throw an error");
  assert.end();
});


test("single argument is", (assert) => {
  let expected = {
    insert: [ ["7|false|true", "tag", "result"],  ["7|false|true", "result", false], ["7|false|true", "result2", true]],
    remove: [ ]
  };
  evaluate(assert, expected, `
    is test
    ~~~
      match
        result = is(3 > 4)
        result2 = is(3 < 4)
      commit
        [#result result result2]
    ~~~
  `);
  assert.end();
});

test("multiple argument is", (assert) => {
  let expected = {
    insert: [ ["9|true|false", "tag", "result"],  ["9|true|false", "result", true], ["9|true|false", "result2", false]],
    remove: [ ]
  };
  evaluate(assert, expected, `
    is test
    ~~~
      match
        result = is(5 > 4, 6 != 9)
        result2 = is(5 > 4, 6 = 9)
      commit
        [#result result result2]
    ~~~
  `);
  assert.end();
});


test("block order shouldn't matter", (assert) => {
  let expected = {
    insert: [
      ["4|bye!", "tag", "result"],  ["4|bye!", "result", "bye!"],
      ["4|hi!", "tag", "result"],  ["4|hi!", "result", "hi!"],
      ["8", "tag", "foo"],  ["8", "value", "hi!"],
    ],
    remove: [ ]
  };
  evaluate(assert, expected, `
    is test
    ~~~
      match
        result = if [#foo value] then value
                 else "bye!"
      commit
        [#result result]
    ~~~

    add a foo
    ~~~
      commit
        [#foo value: "hi!"]
    ~~~
  `);
  let expected2 = {
    insert: [
      ["8|bye!", "tag", "result"],  ["8|bye!", "result", "bye!"],
      ["8|hi!", "tag", "result"],  ["8|hi!", "result", "hi!"],
      ["2", "tag", "foo"],  ["2", "value", "hi!"],
    ],
    remove: [ ]
  };
  evaluate(assert, expected2, `
    add a foo
    ~~~
      commit
        [#foo value: "hi!"]
    ~~~

    is test
    ~~~
      match
        result = if [#foo value] then value
                 else "bye!"
      commit
        [#result result]
    ~~~
  `);
  assert.end();
});


test("if with variable", (assert) => {
  let expected = {
    insert: [
      ["4|bye!", "tag", "result"],  ["4|bye!", "result", "bye!"],
      ["4|hi!", "tag", "result"],  ["4|hi!", "result", "hi!"],
      ["8", "tag", "foo"],  ["8", "value", "hi!"],
    ],
    remove: [ ]
  };
  evaluate(assert, expected, `
    is test
    ~~~
      match
        result = if [#foo value] then value
                 else "bye!"
      commit
        [#result result]
    ~~~

    add a foo
    ~~~
      commit
        [#foo value: "hi!"]
    ~~~

  `);
  assert.end();
});

test("else with value", (assert) => {
  let expected = {
    insert: [ ["3|bye!", "tag", "result"],  ["3|bye!", "result", "bye!"]],
    remove: [ ]
  };
  evaluate(assert, expected, `
    is test
    ~~~
      match
        result = if [#foo] then "hi!"
                 else "bye!"
      commit
        [#result result]
    ~~~
  `);
  assert.end();
});

test("if with constant equality", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "foo"],  ["2", "value", "hi!"],
      ["10|meh", "tag", "result"],  ["10|meh", "result", "meh"]
    ],
    remove: [ ]
  };
  evaluate(assert, expected, `
    add a foo
    ~~~
      commit
        [#foo value: "hi!"]
    ~~~

    is test
    ~~~
      match
        [#foo value]
        result = if value = "yo" then "cool"
                 else if x = "meh" then x
                 else "ok"
      commit
        [#result result]
    ~~~
  `);
  assert.end();
});

test("if with an aggregate", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "foo"],  ["2", "value", "hi!"],
      ["8|0", "tag", "result"],  ["8|0", "result", 0],
      ["8|1", "tag", "result"],  ["8|1", "result", 1]
    ],
    remove: [ ]
  };
  evaluate(assert, expected, `
    add a foo
    ~~~
      commit
        [#foo value: "hi!"]
    ~~~

    is test
    ~~~
      match
        result = if c = count[given: [#foo]] then c
                 else 0
      commit
        [#result result]
    ~~~
  `);
  assert.end();
});

test("if with an external equality", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "foo"],  ["2", "value", "hi!"],
      ["9|1", "tag", "result"],  ["9|1", "result", 1]
    ],
    remove: [ ]
  };
  evaluate(assert, expected, `
    add a foo
    ~~~
      commit
        [#foo value: "hi!"]
    ~~~

    is test
    ~~~
      match
        [#foo value]
        moof = "hi!"
        result = if moof = value then 1
                 else 0
      commit
        [#result result]
    ~~~
  `);
  assert.end();
});

test("bind adds results", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "foo"],  ["2", "value", "hi!"],
      ["8|hi!", "tag", "result"],  ["8|hi!", "value", "hi!"]
    ],
    remove: [ ]
  };
  evaluate(assert, expected, `
    add a foo
    ~~~
      commit
        [#foo value: "hi!"]
    ~~~

    is test
    ~~~
      match
        [#foo value]
      bind
        [#result value]
    ~~~
  `);
  assert.end();
});


test("bind removes dead results", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "foo"],  ["2", "value", "hi!"],
      ["8|hi!", "tag", "result"],  ["8|hi!", "value", "hi!"]
    ],
    remove: [ ]
  };
  let eve = evaluate(assert, expected, `
    add a foo
    ~~~
      commit
        [#foo value: "hi!"]
    ~~~

    is test
    ~~~
      match
        [#foo value]
      bind
        [#result value]
    ~~~
  `);
  let expected2 = {
    insert: [],
    remove: [ ["2", "tag", "foo"], ["8|hi!", "tag", "result"], ["8|hi!", "value", "hi!"] ]
  };
  eve.execute(expected2, [new RemoveAction("2", "tag", "foo")]);
  assert.end();
});


test("you only match facts in the specified database", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["5", "tag", "person"],
      ["5", "name", "joe"],
      // ["9|2", "dude", "2"],
      // ["9|5", "dude", "5"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person @chris]
        [#person @joe]
    ~~~

    foo bar
    ~~~
      match @foo
        p = [#person]
      commit
        [dude: p]
    ~~~
  `);
  assert.end();
})


test("you can match from multiple databases", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["5", "tag", "person"],
      ["5", "name", "joe"],
      ["9|2", "dude", "2"],
      ["9|5", "dude", "5"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person @chris]
      commit @foo
        [#person @joe]
    ~~~

    foo bar
    ~~~
      match (@foo, @session)
        p = [#person]
      commit
        [dude: p]
    ~~~
  `);
  assert.end();
})

test("writing is scoped to databases", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["5", "tag", "person"],
      ["5", "name", "joe"],
      // ["9|2", "dude", "2"],
      // ["9|5", "dude", "5"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit @foo
        [#person @chris]
        [#person @joe]
    ~~~

    foo bar
    ~~~
      match
        p = [#person]
      commit
        [dude: p]
    ~~~
  `);
  assert.end();
})

test("you can write into multiple databases", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["5", "tag", "person"],
      ["5", "name", "joe"],
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["5", "tag", "person"],
      ["5", "name", "joe"],
      ["9|2", "dude", "2"],
      ["9|5", "dude", "5"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit (@foo, @session)
        [#person @chris]
        [#person @joe]
    ~~~

    foo bar
    ~~~
      match
        p = [#person]
      commit
        [dude: p]
    ~~~
  `);
  assert.end();
})


test("split function", (assert) => {
  let expected = {
    insert: [
      ["2|foo", "dude", "foo"],
      ["2|bar", "dude", "bar"],
      ["2|baz", "dude", "baz"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    foo bar
    ~~~
      match
        token = split[text: "foo|bar|baz" by: "|"]
      commit
        [dude: token]
    ~~~
  `);
  assert.end();
})


test("split function with multiple returns", (assert) => {
  let expected = {
    insert: [
      ["3|foo|1", "dude", "foo"],
      ["3|foo|1", "index", 1],
      ["3|bar|2", "dude", "bar"],
      ["3|bar|2", "index", 2],
      ["3|baz|3", "dude", "baz"],
      ["3|baz|3", "index", 3],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    foo bar
    ~~~
      match
        (token, index) = split[text: "foo|bar|baz" by: "|"]
      commit
        [dude: token, index]
    ~~~
  `);
  assert.end();
})


test("split function with attribute returns", (assert) => {
  let expected = {
    insert: [
      ["3|foo|1", "dude", "foo"],
      ["3|foo|1", "index", 1],
      ["3|bar|2", "dude", "bar"],
      ["3|bar|2", "index", 2],
      ["3|baz|3", "dude", "baz"],
      ["3|baz|3", "index", 3],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    foo bar
    ~~~
      match
         split[text: "foo|bar|baz" by: "|", token, index]
      commit
        [dude: token, index]
    ~~~
  `);
  assert.end();
})

test("split function with fixed return", (assert) => {
  let expected = {
    insert: [
      ["4|bar", "dude", "bar"],
      ["4|bar", "index", 2],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    foo bar
    ~~~
      match
        (token, 2) = split[text: "foo|bar|baz" by: "|"]
      commit
        [dude: token, index: 2]
    ~~~
  `);
  assert.end();
})

test("split function with fixed return attribute", (assert) => {
  let expected = {
    insert: [
      ["4|bar", "dude", "bar"],
      ["4|bar", "index", 2],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    foo bar
    ~~~
      match
        split[text: "foo|bar|baz" by: "|", token, index: 2]
      commit
        [dude: token, index: 2]
    ~~~
  `);
  assert.end();
})

test("split function with fixed token", (assert) => {
  let expected = {
    insert: [
      ["4|2", "dude", "bar"],
      ["4|2", "index", 2],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    foo bar
    ~~~
      match
        split[text: "foo|bar|baz" by: "|", token: "bar", index]
      commit
        [dude: "bar", index]
    ~~~
  `);
  assert.end();
})


test("split function with both fixed", (assert) => {
  let expected = {
    insert: [
      ["5", "dude", "bar"],
      ["5", "index", 2],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    foo bar
    ~~~
      match
        split[text: "foo|bar|baz" by: "|", token: "bar", index: 2]
      commit
        [dude: "bar", index: 2]
    ~~~
  `);
  assert.end();
})

test("pipe allows you to select ", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["5", "tag", "person"],
      ["5", "name", "joe"],
      ["11|2", "dude", "2"],
      ["11|2", "name", "chris"],
      ["11|5", "dude", "5"],
      ["11|5", "name", "joe"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person @chris]
        [#person @joe]
    ~~~

    foo bar
    ~~~
      match
        p = [#person name]
      commit
        [dude: p | name]
    ~~~
  `);
  assert.end();
})

test("lookup with bound record", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["8", "info", "Has tag with value person"],
      ["8", "info", "Has name with value chris"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person @chris]
    ~~~

    foo bar
    ~~~
      match
        lookup[record: [#person], attribute, value]
      commit
        [| info: "Has {{attribute}} with value {{value}}"]
    ~~~
  `);
  assert.end();
})


test("lookup with bound attribute", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["7", "info", "2 has name chris"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person @chris]
    ~~~

    foo bar
    ~~~
      match
        lookup[record, attribute: "name", value]
      commit
        [| info: "{{record}} has name {{value}}"]
    ~~~
  `);
  assert.end();
})

test("lookup with free attribute, node and bound value", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["8", "info", "2 has name with value \"chris\" from node 1"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person @chris]
    ~~~

    foo bar
    ~~~
      match
        record = [#person]
        lookup[record, attribute, value: "chris", node]
      commit
        [| info: "{{record}} has {{attribute}} with value \\"chris\\" from node {{node}}"]
    ~~~
  `);
  assert.end();
})

test("lookup on node", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["7","info","node 1 produced: (2, name, chris)"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person @chris]
    ~~~

    foo bar
    ~~~
      match
        lookup[record, attribute, value, node: 1]
      commit
        [| info: "node 1 produced: ({{record}}, {{attribute}}, {{value}})"]
    ~~~
  `);
  assert.end();
})

test("lookup all free", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["7","info","node 0 produced: (2, tag, person)"],
      ["7","info","node 1 produced: (2, name, chris)"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person @chris]
    ~~~

    foo bar
    ~~~
      match
        lookup[record, attribute, value, node]
      commit @foo
        [| info: "node {{node}} produced: ({{record}}, {{attribute}}, {{value}})"]
    ~~~
  `);
  assert.end();
})

