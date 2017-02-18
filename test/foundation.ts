import {Program} from "../src/runtime/dsl2";
import {verify} from "./util";
import * as test from "tape";

test("find a record and generate a record as a result", (assert) => {

  // -----------------------------------------------------
  // program
  // -----------------------------------------------------

  let prog = new Program("test");
  prog.block("simple block", ({find, record, lib}) => {
    find({foo: "bar"});
    return [
      record({zomg: "baz"})
    ]
  });

  // -----------------------------------------------------
  // verification
  // -----------------------------------------------------

  verify(assert, prog, [
    [1, "foo", "bar"]
  ], [
    [2, "zomg", "baz", 1]
  ])

  assert.end();
});


test("> filters numbers", (assert) => {

  // -----------------------------------------------------
  // program
  // -----------------------------------------------------

  let prog = new Program("test");
  prog.block("simple block", ({find, record, lib}) => {
    let a = find();
    let b = find();
    a.age > b.age;
    return [
      record({age1: a.age, age2: b.age})
    ]
  });

  // -----------------------------------------------------
  // verification
  // -----------------------------------------------------

  verify(assert, prog, [
    [1, "tag", "person"],
    [1, "age", 7],
    [2, "tag", "person"],
    [2, "age", 41],
    [3, "tag", "person"],
    [3, "age", 3],
  ], [
    [4, "age1", 41, 1],
    [4, "age2", 7, 1],
    [5, "age1", 41, 1],
    [5, "age2", 3, 1],
    [6, "age1", 7, 1],
    [6, "age2", 3, 1],
  ])

  assert.end();
});


test("simple addition", (assert) => {

  // -----------------------------------------------------
  // program
  // -----------------------------------------------------

  let prog = new Program("test");
  prog.block("simple block", ({find, record, lib}) => {
    let a = find("person");
    let b = find("person");
    a.age > b.age;
    let result = a.age + b.age;
    return [
      record({age1: a.age, age2: b.age, result})
    ]
  });

  // -----------------------------------------------------
  // verification
  // -----------------------------------------------------

  verify(assert, prog, [
    [1, "tag", "person"],
    [1, "age", 7],
    [2, "tag", "person"],
    [2, "age", 41],
    [3, "tag", "person"],
    [3, "age", 3],
  ], [
    [4, "age1", 41, 1],
    [4, "age2", 7, 1],
    [4, "result", 48, 1],
    [5, "age1", 41, 1],
    [5, "age2", 3, 1],
    [5, "result", 44, 1],
    [6, "age1", 7, 1],
    [6, "age2", 3, 1],
    [6, "result", 10, 1],
  ])

  assert.end();
});

test("simple recursion", (assert) => {
  // -----------------------------------------------------
  // program
  // -----------------------------------------------------

  let prog = new Program("test");
  prog.block("simple block", ({find, record, lib}) => {
    let {number} = find();
    9 > number;
    let result = number + 1;
    return [
      record({number: result})
    ]
  });

  // -----------------------------------------------------
  // verification
  // -----------------------------------------------------

  verify(assert, prog, [
    [1, "number", 1],
  ], [
    [2, "number", 2, 1],
    [3, "number", 3, 2],
    [4, "number", 4, 3],
    [5, "number", 5, 4],
    [6, "number", 6, 5],
    [7, "number", 7, 6],
    [8, "number", 8, 7],
    [9, "number", 9, 8],
  ]);

  assert.end();
});

test("test addition operator", (assert) => {

  // -----------------------------------------------------
  // program
  // -----------------------------------------------------

  let prog = new Program("test");
  prog.block("simple block", ({find, record, lib}) => {
    let joof = find({foo: "bar"});
    return [
      joof.add("name", "JOOF")
    ]
  });

  // -----------------------------------------------------
  // verification
  // -----------------------------------------------------

  verify(assert, prog, [
    [1, "foo", "bar"]
  ], [
    [1, "name", "JOOF", 1]
  ])

  assert.end();
});

test.only("transitive closure", (assert) => {
  // -----------------------------------------------------
  // program
  // -----------------------------------------------------

  let prog = new Program("test");
  prog.block("Every edge is the beginning of a path.", ({find, record, lib}) => {
    let from = find();
    return [
      from.add("path", from.edge)
    ];
  });

  prog.block("Jump from node to node building the path.", ({find, record, lib}) => {
    let from = find();
    let intermediate = find();
    from.edge == intermediate;
    let to = intermediate.path;

    intermediate.path;
    return [
      from.add("path", to)
    ]
  });

  // -----------------------------------------------------
  // verification
  // -----------------------------------------------------

  verify(assert, prog, [
    [1, "edge", 2],
    [2, "edge", 1],
  ], [
    [1, "path", 2, 1],
    [2, "path", 1, 1],
    [1, "path", 1, 2],
    [2, "path", 2, 2],
  ])

  verify(assert, prog, [
    [1, "edge", 2, 0, -1],
  ], [
    [1, "path", 2, 1, -1],
    [1, "path", 1, 2, -1],
    [2, "path", 2, 2, -1],
    //[2, "path", 1, 3, -1],
  ])

  verify(assert, prog, [
    [1, "edge", 2, 0, 1],
  ], [
    [1, "path", 2, 1, 1],
    [1, "path", 1, 2, 1],
    [2, "path", 2, 2, 1],
    //[2, "path", 1, 3, 1],
  ])

  // verify(assert, prog, [
  //   [1, "edge", 2],
  //   [2, "edge", 3],
  //   [3, "edge", 4],
  //   [4, "edge", 1],
  // ], [
  //   [1, "path", 2, 1],
  //   [2, "path", 3, 1],
  //   [3, "path", 4, 1],
  //   [4, "path", 1, 1],

  //   [1, "path", 3, 2],
  //   [2, "path", 4, 2],
  //   [3, "path", 1, 2],
  //   [4, "path", 2, 2],

  //   [1, "path", 4, 3],
  //   [2, "path", 1, 3],
  //   [3, "path", 2, 3],
  //   [4, "path", 3, 3],

  //   [1, "path", 1, 4],
  //   [2, "path", 2, 4],
  //   [3, "path", 3, 4],
  //   [4, "path", 4, 4],

  //   [1, "path", 2, 5],
  //   [2, "path", 3, 5],
  //   [3, "path", 4, 5],
  //   [4, "path", 1, 5]
  // ]);

  // // Kick the legs out from under the cycle.

  // verify(assert, prog, [
  //   [4, "edge", 1, 0, -1]
  // ], [
  //   [4, "path", 1, 1, -1],

  //   [4, "path", 2, 2, -1],
  //   [3, "path", 1, 2, -1],
  //   [2, "path", 1, 2, -1],
  //   [1, "path", 1, 2, -1],

  //   [4, "path", 3, 3, -1],
  //   [3, "path", 2, 3, -1],
  //   [2, "path", 2, 3, -1],
  //   [1, "path", 2, 3, -1],

  //   [4, "path", 4,  4, -1],

  //   [4, "path", 1,  5, -1],
  // ]);


  assert.end();
});

test("removal", (assert) => {

  // -----------------------------------------------------
  // program
  // -----------------------------------------------------

  let prog = new Program("test");
  prog.block("simple block", ({find, record, lib}) => {
    find({foo: "bar"});
    return [
      record({zomg: "baz"})
    ]
  });

  // -----------------------------------------------------
  // verification
  // -----------------------------------------------------

  // trust, but
  verify(assert, prog, [
    [1, "foo", "bar"]
  ], [
    [2, "zomg", "baz", 1]
  ]);

  verify(assert, prog, [
    [1, "foo", "bar", 0, -1]
  ], [
    [2, "zomg", "baz", 1, -1]
  ], 1);

  assert.end();
});

test.skip("not", (assert) => {

  // -----------------------------------------------------
  // program
  // -----------------------------------------------------

  let prog = new Program("test");
  prog.block("simple block", ({find, record, lib, not}) => {
    let person = find({tag: "person"});
    not(() => person.alive);
    return [
      person.add("dead", "true")
    ]
  });

  // -----------------------------------------------------
  // verification
  // -----------------------------------------------------

  // trust, but
  verify(assert, prog, [
    [1, "tag", "person"]
  ], [
    [1, "dead", "true", 1]
  ]);

  assert.end();
});

test("Nested attribute lookup", (assert) => {

  // -----------------------------------------------------
  // program
  // -----------------------------------------------------

  let prog = new Program("test");
  prog.block("simple block", ({find, record, lib}) => {
    let jeff = find({tag: "bar"});
    return [
      record({zomg: jeff.dog.weight})
    ]
  });

  // -----------------------------------------------------
  // verification
  // -----------------------------------------------------

  verify(assert, prog, [
    [1, "tag", "bar"],
    [1, "dog", 2],
    [2, "weight", 13],
  ], [
    [3, "zomg", 13, 1]
  ])

  assert.end();
});


test("Basic not", (assert) => {

  // -----------------------------------------------------
  // program
  // -----------------------------------------------------

  let prog = new Program("test");
  prog.block("simple block", ({find, record, lib, not}) => {
    let person = find("person");
    not(() => {
      person.age;
    })
    return [
      person.add("tag", "old")
    ]
  });

  // -----------------------------------------------------
  // verification
  // -----------------------------------------------------

  verify(assert, prog, [
    [1, "tag", "person"],
  ], [
    [1, "tag", "old", 1]
  ])

  verify(assert, prog, [
    [1, "age", 20],
  ], [
    [1, "tag", "old", 1, -1]
  ])

  assert.end();
});


test("Basic choose", (assert) => {

  // -----------------------------------------------------
  // program
  // -----------------------------------------------------

  let prog = new Program("test");
  prog.block("simple block", ({find, record, lib, choose}) => {
    let person = find("person");
    let [info] = choose(() => {
      person.dog;
      return "cool";
    }, () => {
      return "not cool";
    });
    return [
      record("dog-less", {info})
    ]
  });

  // -----------------------------------------------------
  // verification
  // -----------------------------------------------------

  verify(assert, prog, [
    [1, "tag", "person"],
  ], [
    [2, "tag", "dog-less", 1],
    [2, "info", "not cool", 1],
  ])

  verify(assert, prog, [
    [1, "dog", "spot"],
  ], [
    [2, "tag", "dog-less", 1, -1],
    [2, "info", "not cool", 1, -1],
    [3, "tag", "dog-less", 1],
    [3, "info", "cool", 1],
  ])

  assert.end();
});

test("Basic union", (assert) => {

  // -----------------------------------------------------
  // program
  // -----------------------------------------------------

  let prog = new Program("test");
  prog.block("simple block", ({find, record, lib, union}) => {
    let person = find("person");
    let [info] = union(() => {
      person.dog;
      return "cool";
    }, () => {
      return "not cool";
    });
    return [
      record("dog-less", {info})
    ]
  });

  // -----------------------------------------------------
  // verification
  // -----------------------------------------------------

  verify(assert, prog, [
    [1, "tag", "person"],
  ], [
    [2, "tag", "dog-less", 1],
    [2, "info", "not cool", 1],
  ])

  verify(assert, prog, [
    [1, "dog", "spot"],
  ], [
    [3, "tag", "dog-less", 1],
    [3, "info", "cool", 1],
  ])

  assert.end();
});


test("Multiple return choose", (assert) => {

  // -----------------------------------------------------
  // program
  // -----------------------------------------------------

  let prog = new Program("test");
  prog.block("simple block", ({find, record, lib, choose}) => {
    let person = find("person");
    let [displayName, coolness] = choose(() => {
      return [person.nickName, "cool"];
    }, () => {
      return [person.name, "not cool"];
    });
    return [
      person.add("displayName", displayName),
      person.add("coolness", coolness),
    ]
  });

  // -----------------------------------------------------
  // verification
  // -----------------------------------------------------

  verify(assert, prog, [
    [1, "tag", "person"],
    [1, "name", "joseph"],
  ], [
    [1, "displayName", "joseph", 1],
    [1, "coolness", "not cool", 1],
  ])

  verify(assert, prog, [
    [1, "nickName", "joey"],
  ], [
    [1, "displayName", "joseph", 1, -1],
    [1, "coolness", "not cool", 1, -1],
    [1, "displayName", "joey", 1],
    [1, "coolness", "cool", 1],
  ])

  verify(assert, prog, [
    [1, "nickName", "joey", 0, -1],
  ], [
    [1, "displayName", "joseph", 1],
    [1, "coolness", "not cool", 1],
    [1, "displayName", "joey", 1, -1],
    [1, "coolness", "cool", 1, -1],
  ])

  assert.end();
});

test("Basic aggregate", (assert) => {

  // -----------------------------------------------------
  // program
  // -----------------------------------------------------

  let prog = new Program("test");
  prog.block("simple block", ({find, record, lib, gather}) => {
    let person = find("person");
    let count = gather(person).count();
    return [
      record("info").add("total people", count)
    ]
  });

  // -----------------------------------------------------
  // verification
  // -----------------------------------------------------

  verify(assert, prog, [
    [1, "tag", "person"],
    [2, "tag", "person"],
  ], [
    [3, "tag", "info", 1],
    [3, "total people", 2, 1],
  ])

  verify(assert, prog, [
    [1, "tag", "person", 0, -1],
  ], [
    [3, "total people", 2, 1, -1],
    [3, "total people", 1, 1],
  ])

  verify(assert, prog, [
    [1, "tag", "person"],
    [4, "tag", "person"],
  ], [
    [3, "total people", 1, 1, -1],
    [3, "total people", 3, 1],
  ])

  assert.end();
});


test("commit, remove, and recursion", (assert) => {

  // -----------------------------------------------------
  // program
  // -----------------------------------------------------

  let prog = new Program("test");

  prog.commit("coolness", ({find, not, record, choose}) => {
    let click = find("click", "direct-target");
    let count = find("count");
    let current = count.count;
    3 > current;
    return [
      count.add("count", current + 1)
    ]
  })

  prog.commit("foo", ({find}) => {
    let click = find("click", "direct-target");
    return [
      click.remove("tag", "click"),
      click.remove("tag", "direct-target"),
    ];
  })

  // -----------------------------------------------------
  // verification
  // -----------------------------------------------------

  verify(assert, prog, [
    [1, "tag", "count"],
    [1, "count", 0]
  ], [
  ])

  verify(assert, prog, [
    [2, "tag", "click"],
    [2, "tag", "direct-target"]
  ], [
    [2, "tag", "click", 1, -1],
    [2, "tag", "direct-target", 1, -1],
    [1, "count", 1, 1],
  ])

  verify(assert, prog, [
    [3, "tag", "click"],
    [3, "tag", "direct-target"]
  ], [
    [3, "tag", "click", 1, -1],
    [3, "tag", "direct-target", 1, -1],
    [1, "count", 2, 2],
  ])

  assert.end();
});
