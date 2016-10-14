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
  let parsed = parser.parseDoc(dedent(code), "0");
  let {blocks, errors} = builder.buildDoc(parsed.results);
  if(assert.errors) {
    assert.true(parsed.errors.length > 0 || errors.length > 0);
  }
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
        [#person name: "chris"]
    ~~~
  `);
  assert.end();
})

test("search and create a record", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["5", "tag", "person"],
      ["5", "name", "joe"],
      ["8|2", "dude", "2"],
      ["8|5", "dude", "5"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "chris"]
        [#person name: "joe"]
    ~~~

    foo bar
    ~~~
      search
        p = [#person]
      commit
        [dude: p]
    ~~~
  `);
  assert.end();
})

test("search with constant filter", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["5", "tag", "person"],
      ["5", "name", "joe"],
      ["9|2", "dude", "2"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "chris"]
        [#person name: "joe"]
    ~~~

    foo bar
    ~~~
      search
        p = [#person name]
        name = "chris"
      commit
        [dude: p]
    ~~~
  `);
  assert.end();
})


test("search with constant attribute", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["5", "tag", "person"],
      ["5", "name", "joe"],
      ["9|2", "dude", "2"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "chris"]
        [#person name: "joe"]
    ~~~

    foo bar
    ~~~
      search
        p = [#person name: "chris"]
      commit
        [dude: p]
    ~~~
  `);
  assert.end();
})

test("search with attribute having multiple values", (assert) => {
  let expected = {
    insert: [
      ["3", "tag", "person"],
      ["3", "name", "chris"],
      ["3", "name", "michael"],
      ["6", "tag", "person"],
      ["6", "name", "chris"],
      ["11|3", "dude", "3"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "chris" name: "michael"]
        [#person name: "chris"]
    ~~~

    foo bar
    ~~~
      search
        p = [#person name: "chris" name: "michael"]
      commit
        [dude: p]
    ~~~
  `);
  assert.end();
})

test("search with attribute having multiple values in parenthesis", (assert) => {
  let expected = {
    insert: [
      ["3", "tag", "person"],
      ["3", "name", "chris"],
      ["3", "name", "michael"],
      ["8|3", "dude", "3"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "chris" name: "michael"]
    ~~~

    foo bar
    ~~~
      search
        p = [#person name: ("chris", "michael")]
      commit
        [dude: p]
    ~~~
  `);
  assert.end();
})

test("search with attribute having multiple values in parenthesis with a function", (assert) => {
  let expected = {
    insert: [
      ["3", "tag", "person"],
      ["3", "name", "chris"],
      ["3", "name", 13],
      ["9|3", "dude", "3"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "chris" name: 13]
    ~~~

    foo bar
    ~~~
      search
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


test("search a record with numeric attributes", (assert) => {
  let expected = {
    insert: [
      ["4", "tag", "json-array"],
      ["4", 1, "cool"],
      ["4", 2, "om nom"],
      ["4", 3, "om nom nom"],
      ["11","foo","cool - om nom - om nom nom"]
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
      search
        [#json-array 1: first, 2: second, 3: third]
      commit
        [| foo: "{{first}} - {{second}} - {{third}}"}]
    ~~~
  `);
  assert.end();
})

test("search with incompatible filters", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["5", "tag", "person"],
      ["5", "name", "joe"],
    ],
    remove: [],
    errors: true,
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "chris"]
        [#person name: "joe"]
    ~~~

    foo bar
    ~~~
      search
        p = [#person name]
        name = "chris"
        name = "joe"
      commit
        [dude: p]
    ~~~
  `);
  assert.end();
})

test("search with unprovided variable", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["5", "tag", "person"],
      ["5", "name", "joe"],
    ],
    remove: [],
    errors: true,
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "chris"]
        [#person name: "joe"]
    ~~~

    foo bar
    ~~~
      search
        [#person]
      commit
        [dude: p]
    ~~~
  `);
  assert.end();
})

test("search with unprovided root in an attribute access", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["5", "tag", "person"],
      ["5", "name", "joe"],
    ],
    remove: [],
    errors: true,
  };

  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "chris"]
        [#person name: "joe"]
    ~~~

    foo bar
    ~~~
      search
        [#person]
      commit
        [dude: p.name]
    ~~~
  `);
  assert.end();
})

test("search with escaped strings", (assert) => {
  let expected = {
    insert: [
      ["3", "tag", "person"],
      ["3", "name", "chris"],
      ["3","info","{\"age\": 10, \"school\": \"Lincoln\"}"],
      ["7|{\"age\": 10, \"school\": \"Lincoln\"}","info","{\"age\": 10, \"school\": \"Lincoln\"}"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "chris" info: "{\\"age\\": 10, \\"school\\": \\"Lincoln\\"}"]
    ~~~

    foo bar
    ~~~
      search
        [#person info]
      commit
        [info]
    ~~~
  `);
  assert.end();
})

test("search with escaped embeds", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["7|{chris}","info","{chris}"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "chris"]
    ~~~

    foo bar
    ~~~
      search
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
        [#person name: "chris"]
        [#person name: "joe"]
    ~~~

    foo bar
    ~~~
      search
        p = [#person name]
      commit
        p.dude := name
    ~~~
  `);
  assert.end();
});

test("setting an attribute to itself", (assert) => {
  // TODO: should this really be showing name inserted twice?
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["2", "name", "chris"],
      ["5", "tag", "person"],
      ["5", "name", "joe"],
      ["5", "name", "joe"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "chris"]
        [#person name: "joe"]
    ~~~

    foo bar
    ~~~
      search
        p = [#person name]
      commit
        p.name := name
    ~~~
  `);
  assert.end();
});

test("setting an attribute in multiple blocks", (assert) => {
  let expected = {
    insert: [
      ["1", "tag", "person"],
      ["1", "meep", "maup"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person]
    ~~~

    stuff
    ~~~
      search
        p = [#person not(meep)]
      commit
        p.meep := "moop"
    ~~~

    foo bar
    ~~~
      search
        p = [#person meep]
      commit
        p.meep := "maup"
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
        [#person name: "chris"]
        [#person name: "joe"]
    ~~~

    foo bar
    ~~~
      search
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
        [#person name: "chris"]
        [#person name: "joe"]
    ~~~

    foo bar
    ~~~
      search
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
      ["13|chris|8","tag","dude"],
      ["13|chris|8","dude","chris"],
      ["13|chris|8","dude","foo"],
      ["13|chris|8","dude",8],
      ["5", "tag", "person"],
      ["5", "name", "joe"],
      ["13|joe|8","tag","dude"],
      ["13|joe|8","dude","joe"],
      ["13|joe|8","dude","foo"],
      ["13|joe|8","dude",8],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "chris"]
        [#person name: "joe"]
    ~~~

    foo bar
    ~~~
      search
        p = [#person name]
      commit
        [#dude dude: (name, "foo", 3 + 5)]
    ~~~
  `);
  assert.end();
});

test("creating an object with multiple complex values for an attribute", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["6", "tag", "foo"],
      ["8", "tag", "bar"],
      ["12","tag","dude"],
      ["12","dude","6"],
      ["12","dude","8"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "chris"]
    ~~~

    foo bar
    ~~~
      search
        p = [#person name]
      commit
        [#dude dude: ([#foo], [#bar])]
    ~~~
  `);
  assert.end();
});

test("setting an attribute on an object with multiple complex values", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["6", "tag", "foo"],
      ["8", "tag", "bar"],
      ["2","dude","6"],
      ["2","dude","8"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "chris"]
    ~~~

    foo bar
    ~~~
      search
        p = [#person name]
      commit
        p.dude := ([#foo], [#bar])
    ~~~
  `);
  assert.end();
});

test("merging an attribute on an object with multiple complex values", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["7", "tag", "foo"],
      ["7", "eve-auto-index", 1],
      ["10", "tag", "bar"],
      ["10", "eve-auto-index", 2],
      ["2","dude","7"],
      ["2","dude","10"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "chris"]
    ~~~

    foo bar
    ~~~
      search
        p = [#person name]
      commit
        p <- [dude: [#foo] [#bar]]
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
        [#person name: "chris" dude: "joe"]
    ~~~

    foo bar
    ~~~
      search
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
        [#person name: "chris" dude: "joe"]
    ~~~

    foo bar
    ~~~
      search
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
        [#person name: "chris" dude: "joe"]
    ~~~

    foo bar
    ~~~
      search
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
      search
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
      ["10|2", "tag", "total"],
      ["10|2", "total", 2],
    ],
    remove: [
    ]
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "joe"]
        [#person name: "chris"]
    ~~~

    foo bar
    ~~~
      search
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
      ["13|30", "tag", "total"],
      ["13|30", "total", 30],
    ],
    remove: [
    ]
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "joe" age: 10]
        [#person name: "chris" age: 20]
    ~~~

    foo bar
    ~~~
      search
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
      ["13|30", "tag", "total"],
      ["13|30", "total", 30],
    ],
    remove: [
    ]
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "joe" age: 10]
        [#person name: "chris" age: 20]
    ~~~

    foo bar
    ~~~
      search
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
      ["17|1", "tag", "total"],
      ["17|1", "total", 1],
      ["17|2", "tag", "total"],
      ["17|2", "total", 2],
    ],
    remove: [
    ]
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "joe" age: 10]
        [#person name: "chris" age: 20]
        [#person name: "mike" age: 20]
    ~~~

    foo bar
    ~~~
      search
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
      ["17|1", "tag", "total"],
      ["17|1", "total", 1],
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
        [#person name: "joe" age: 10]
        [#person name: "chris" age: 20]
        [#person name: "mike" age: 20]
    ~~~

    foo bar
    ~~~
      search
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
        [#person name: "joe"]
        [#person name: "chris"]
    ~~~

    foo bar
    ~~~
      search
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
      ["11|12", "tag", "total"],
      ["11|12", "total", 12],
    ],
    remove: [
    ]
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "joe"]
        [#person name: "chris"]
    ~~~

    foo bar
    ~~~
      search
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
      ["18|3", "tag", "total"],
      ["18|3", "total", 3],
    ],
    remove: [
    ]
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "joe" age: 10]
        [#person name: "chris" age: 20]
        [#person name: "mike" age: 20]
    ~~~

    foo bar
    ~~~
      search
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
          [#person name: "joe" age: 10]
          [#person name: "chris" age: 20]
          [#person name: "mike" age: 20]
      ~~~

      foo bar
      ~~~
        search
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
      search
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
      search
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
      ["7|bye!", "tag", "result"],  ["7|bye!", "result", "bye!"],
      ["7|hi!", "tag", "result"],  ["7|hi!", "result", "hi!"],
      ["10", "tag", "foo"],  ["10", "value", "hi!"],
    ],
    remove: [ ]
  };
  evaluate(assert, expected, `
    is test
    ~~~
      search
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
      ["10|bye!", "tag", "result"],  ["10|bye!", "result", "bye!"],
      ["10|hi!", "tag", "result"],  ["10|hi!", "result", "hi!"],
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
      search
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
      ["7|bye!", "tag", "result"],  ["7|bye!", "result", "bye!"],
      ["7|hi!", "tag", "result"],  ["7|hi!", "result", "hi!"],
      ["10", "tag", "foo"],  ["10", "value", "hi!"],
    ],
    remove: [ ]
  };
  evaluate(assert, expected, `
    is test
    ~~~
      search
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
    insert: [ ["6|bye!", "tag", "result"],  ["6|bye!", "result", "bye!"]],
    remove: [ ]
  };
  evaluate(assert, expected, `
    is test
    ~~~
      search
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
      ["13|meh", "tag", "result"],  ["13|meh", "result", "meh"]
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
      search
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
      ["10|0", "tag", "result"],  ["10|0", "result", 0],
      ["10|1", "tag", "result"],  ["10|1", "result", 1]
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
      search
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
      ["11|1", "tag", "result"],  ["11|1", "result", 1]
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
      search
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
      ["7|hi!", "tag", "result"],  ["7|hi!", "value", "hi!"]
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
      search
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
      ["7|hi!", "tag", "result"],  ["7|hi!", "value", "hi!"]
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
      search
        [#foo value]
      bind
        [#result value]
    ~~~
  `);
  let expected2 = {
    insert: [],
    remove: [ ["2", "tag", "foo"], ["7|hi!", "tag", "result"], ["7|hi!", "value", "hi!"] ]
  };
  eve.execute(expected2, [new RemoveAction("2", "tag", "foo")]);
  assert.end();
});


test("you only search facts in the specified database", (assert) => {
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
        [#person name: "chris"]
        [#person name: "joe"]
    ~~~

    foo bar
    ~~~
      search @foo
        p = [#person]
      commit
        [dude: p]
    ~~~
  `);
  assert.end();
})


test("you can search from multiple databases", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["5", "tag", "person"],
      ["5", "name", "joe"],
      ["8|2", "dude", "2"],
      ["8|5", "dude", "5"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "chris"]
      commit @foo
        [#person name: "joe"]
    ~~~

    foo bar
    ~~~
      search (@foo, @session)
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
        [#person name: "chris"]
        [#person name: "joe"]
    ~~~

    foo bar
    ~~~
      search
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
      ["8|2", "dude", "2"],
      ["8|5", "dude", "5"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit (@foo, @session)
        [#person name: "chris"]
        [#person name: "joe"]
    ~~~

    foo bar
    ~~~
      search
        p = [#person]
      commit
        [dude: p]
    ~~~
  `);
  assert.end();
})

test("reading in a scoped write uses the search scope", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["5", "tag", "person"],
      ["5", "name", "joe"],
      ["9|chris", "dude", "chris"],
      ["9|joe", "dude", "joe"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "chris"]
        [#person name: "joe"]
    ~~~

    foo bar
    ~~~
      search
        p = [#person]
      commit @foo
        [dude: p.name]
    ~~~
  `);
  assert.end();
})

test("reading in multiple scopes write uses the search scope", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["5", "tag", "person"],
      ["5", "name", "joe"],
      ["8", "tag", "person"],
      ["8", "name", "woop"],
      ["12|chris", "dude", "chris"],
      ["12|joe", "dude", "joe"],
      ["12|woop", "dude", "woop"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit @blah
        [#person name: "chris"]
        [#person name: "joe"]
      commit
        [#person name: "woop"]
    ~~~

    foo bar
    ~~~
      search (@blah, @session)
        p = [#person]
      commit @foo
        [dude: p.name]
    ~~~
  `);
  assert.end();
})

test("scoped attribute mutators pick up the search scope", (assert) => {
  let expected = {
    insert: [
      ["6", "tag", "person"],
      ["6", "name", "chris"],
      ["6", "brother", "2|6"],
      ["2|6", "tag", "person"],
      ["2|6", "name", "ryan"],
      ["2|6", "name", "meep"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "chris" brother: [#person name: "ryan"]]
    ~~~

    foo bar
    ~~~
      search
        p = [#person]
      commit @foo
        p.brother.name := "meep"
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
      search
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
      search
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
      search
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
      search
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
      search
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
      search
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
      search
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
      ["10|2", "dude", "2"],
      ["10|2", "name", "chris"],
      ["10|5", "dude", "5"],
      ["10|5", "name", "joe"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "chris"]
        [#person name: "joe"]
    ~~~

    foo bar
    ~~~
      search
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
      ["7", "info", "Has tag with value person"],
      ["7", "info", "Has name with value chris"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "chris"]
    ~~~

    foo bar
    ~~~
      search
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
      ["6", "info", "2 has name chris"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "chris"]
    ~~~

    foo bar
    ~~~
      search
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
      ["7", "info", "2 has name with value \"chris\" from node 1"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "chris"]
    ~~~

    foo bar
    ~~~
      search
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
      ["6","info","node 1 produced: (2, name, chris)"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "chris"]
    ~~~

    foo bar
    ~~~
      search
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
      ["6","info","node 0 produced: (2, tag, person)"],
      ["6","info","node 1 produced: (2, name, chris)"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "chris"]
    ~~~

    foo bar
    ~~~
      search
        lookup[record, attribute, value, node]
      commit @foo
        [| info: "node {{node}} produced: ({{record}}, {{attribute}}, {{value}})"]
    ~~~
  `);
  assert.end();
})

test("an identifier followed by whitespace should not be interpreted as a function", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "chris"],
      ["2", "dude", "chris"],
      ["5", "tag", "person"],
      ["5", "name", "joe"],
      ["5", "dude", "joe"],
      ["10", "tag", "cool"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "chris"]
        [#person name: "joe"]
    ~~~

    foo bar
    ~~~
      search
        p = [#person name]
      commit
        p.dude := name
        [#cool]
    ~~~
  `);
  assert.end();
});

test("indented code blocks are not evaled", (assert) => {
  let expected = {
    insert: [],
    remove: []
  };
  evaluate(assert, expected, `
    people

        commit
          [#person name: "chris"]
          [#person name: "joe"]

    foo bar
    ~~~
      search
        p = [#person name]
      commit
        p.dude := name
        [#cool]
    ~~~
  `);
  assert.end();
  })

test("single value sort", (assert) => {
  let expected = {
    insert: [
      ["2", "tag", "person"],
      ["2", "name", "a"],
      ["5", "tag", "person"],
      ["5", "name", "b"],
      ["8", "tag", "person"],
      ["8", "name", "c"],
      ["14|1 a", "dude", "1 a"],
      ["14|2 b", "dude", "2 b"],
      ["14|3 c", "dude", "3 c"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "a"]
        [#person name: "b"]
        [#person name: "c"]
    ~~~

    foo bar
    ~~~
      search
        p = [#person name]
        ix = sort[value: name]
      commit
        [dude: "{{ix}} {{name}}"]
    ~~~
  `);
  assert.end();
})

test("multi value sort", (assert) => {
  let expected = {
    insert: [
      ["3", "tag", "person"],
      ["3", "name", "a"],
      ["3", "age", 1],
      ["7", "tag", "person"],
      ["7", "name", "a"],
      ["7", "age", 2],
      ["11", "tag", "person"],
      ["11", "name", "b"],
      ["11", "age", 1],
      ["18|1 a 1", "dude", "1 a 1"],
      ["18|2 a 2", "dude", "2 a 2"],
      ["18|3 b 1", "dude", "3 b 1"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "a" age: 1]
        [#person name: "a" age: 2]
        [#person name: "b" age: 1]
    ~~~

    foo bar
    ~~~
      search
        p = [#person name age]
        ix = sort[value: (name, age)]
      commit
        [dude: "{{ix}} {{name}} {{age}}"]
    ~~~
  `);
  assert.end();
})

test("multi value sort with multiple directions", (assert) => {
  let expected = {
    insert: [
      ["3", "tag", "person"],
      ["3", "name", "a"],
      ["3", "age", 1],
      ["7", "tag", "person"],
      ["7", "name", "a"],
      ["7", "age", 2],
      ["11", "tag", "person"],
      ["11", "name", "b"],
      ["11", "age", 1],
      ["18|2 a 1", "dude", "2 a 1"],
      ["18|3 a 2", "dude", "3 a 2"],
      ["18|1 b 1", "dude", "1 b 1"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "a" age: 1]
        [#person name: "a" age: 2]
        [#person name: "b" age: 1]
    ~~~

    foo bar
    ~~~
      search
        p = [#person name age]
        ix = sort[value: (name, age), direction: ("down", "up")]
      commit
        [dude: "{{ix}} {{name}} {{age}}"]
    ~~~
  `);
  assert.end();
})

test("sort with group", (assert) => {
  let expected = {
    insert: [
      ["3", "tag", "person"],
      ["3", "name", "a"],
      ["3", "age", 1],
      ["7", "tag", "person"],
      ["7", "name", "a"],
      ["7", "age", 2],
      ["11", "tag", "person"],
      ["11", "name", "b"],
      ["11", "age", 1],
      ["18|1 a 1", "dude", "1 a 1"],
      ["18|2 a 2", "dude", "2 a 2"],
      ["18|1 b 1", "dude", "1 b 1"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "a" age: 1]
        [#person name: "a" age: 2]
        [#person name: "b" age: 1]
    ~~~

    foo bar
    ~~~
      search
        p = [#person name age]
        ix = sort[value: age, per: name]
      commit
        [dude: "{{ix}} {{name}} {{age}}"]
    ~~~
  `);
  assert.end();
})

test("if with expression-only arguments", (assert) => {
  let expected = {
    insert: [
      ["7|0", "tag", "div"],
      ["7|0", "text", 0],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    test
    ~~~
    search
      foo = -1 + 1
      text = if foo < 1 then foo else "baz"
    bind @browser
      [#div text]
    ~~~
  `);
  assert.end();
})

test("multiple inequalities in a row", (assert) => {
  let expected = {
    insert: [
      ["3", "tag", "person"],
      ["3", "name", "chris"],
      ["3", "age", 20],
      ["7", "tag", "person"],
      ["7", "name", "joe"],
      ["7", "age", 10],
      ["14|3", "dude", "3"],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    people
    ~~~
      commit
        [#person name: "chris" age: 20]
        [#person name: "joe" age: 10]
    ~~~

    foo bar
    ~~~
      search
        p = [#person name age]
        15 < age < 30
      commit
        [dude: p]
    ~~~
  `);
  assert.end();
})

test("range positive increment", (assert) => {
  let expected = {
    insert: [
      ["2", "dude", 1],
      ["2", "dude", 2],
      ["2", "dude", 3],
      ["2", "dude", 4],
      ["2", "dude", 5],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    foo bar
    ~~~
      search
        i = range[from: 1 to: 5]
      commit
        [| dude: i]
    ~~~
  `);
  assert.end();
})

test("range negative increment", (assert) => {
  let expected = {
    insert: [
      ["2", "dude", -1],
      ["2", "dude", -2],
      ["2", "dude", -3],
      ["2", "dude", -4],
      ["2", "dude", -5],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    foo bar
    ~~~
      search
        i = range[from: -1 to: -5 increment: -1]
      commit
        [| dude: i]
    ~~~
  `);
  assert.end();
})

test("range increment on an edge boundary", (assert) => {
  let expected = {
    insert: [
      ["2", "dude", 1],
      ["2", "dude", 4],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    foo bar
    ~~~
      search
        i = range[from: 1 to: 5 increment: 3]
      commit
        [| dude: i]
    ~~~
  `);
  assert.end();
})

test("range with a single increment", (assert) => {
  let expected = {
    insert: [
      ["2", "dude", 1],
    ],
    remove: []
  };
  evaluate(assert, expected, `
    foo bar
    ~~~
      search
        i = range[from: 1 to: 5 increment: 10]
      commit
        [| dude: i]
    ~~~
  `);
  assert.end();
})

test("range with infinite increment", (assert) => {
  let expected = {
    insert: [],
    remove: []
  };
  evaluate(assert, expected, `
    foo bar
    ~~~
      search
        i = range[from: -1 to: -5 increment: 1]
      commit
        [| dude: i]
    ~~~
  `);
  assert.end();
})

