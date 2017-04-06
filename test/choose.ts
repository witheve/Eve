import {Program} from "../src/runtime/dsl2";
import {verify, createVerifier} from "./util";
import * as test from "tape";

test("Choose: basic", (assert) => {

  let prog = new Program("test");
  prog.bind("simple block", ({find, record, lib, choose}) => {
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

test("Choose: 3 branches", (assert) => {

  let prog = new Program("test");
  prog.bind("simple block", ({find, record, lib, choose}) => {
    let person = find("person");
    let [info] = choose(() => {
      person.dog;
      return "cool";
    }, () => {
      person.foo;
      return "zomg";
    }, () => {
      return "not cool";
    });
    return [
      record("dog-less", {info})
    ]
  });

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

  verify(assert, prog, [
    [1, "dog", "spot", 0, -1],
    [1, "foo", "woop"],
  ], [
    [3, "tag", "dog-less", 1, -1],
    [3, "info", "cool", 1, -1],
    [4, "tag", "dog-less", 1],
    [4, "info", "zomg", 1],
  ])

  verify(assert, prog, [
    [1, "foo", "woop", 0, -1],
  ], [
    [3, "tag", "dog-less", 1, -1],
    [3, "info", "zomg", 1, -1],
    [4, "tag", "dog-less", 1],
    [4, "info", "not cool", 1],
  ])

  assert.end();
});

test("Choose: 4 branches", (assert) => {

  let prog = new Program("test");
  prog.bind("simple block", ({find, record, lib, choose}) => {
    let person = find("person");
    let {boat} = person;
    let [info] = choose(() => {
      person.dog;
      return "cool";
    }, () => {
      person.foo;
      return "zomg";
    }, () => {
      boat.foo;
      return "woah";
    }, () => {
      return "not cool";
    });
    return [
      record("dog-less", {info})
    ]
  });

  verify(assert, prog, [
    [1, "tag", "person"],
    [1, "boat", 9],
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

  verify(assert, prog, [
    [1, "dog", "spot", 0, -1],
    [1, "foo", "woop"],
  ], [
    [3, "tag", "dog-less", 1, -1],
    [3, "info", "cool", 1, -1],
    [4, "tag", "dog-less", 1],
    [4, "info", "zomg", 1],
  ])

  verify(assert, prog, [
    [1, "foo", "woop", 0, -1],
  ], [
    [3, "tag", "dog-less", 1, -1],
    [3, "info", "zomg", 1, -1],
    [4, "tag", "dog-less", 1],
    [4, "info", "not cool", 1],
  ])

  verify(assert, prog, [
    [9, "foo", "meep moop"],
  ], [
    [3, "tag", "dog-less", 1, -1],
    [3, "info", "not cool", 1, -1],
    [4, "tag", "dog-less", 1],
    [4, "info", "woah", 1],
  ])

  verify(assert, prog, [
    [9, "foo", "meep moop", 0, -1],
  ], [
    [3, "tag", "dog-less", 1, -1],
    [3, "info", "woah", 1, -1],
    [4, "tag", "dog-less", 1],
    [4, "info", "not cool", 1],
  ])

  verify(assert, prog, [
    [1, "dog", "spot"],
  ], [
    [3, "tag", "dog-less", 1, -1],
    [3, "info", "not cool", 1, -1],
    [4, "tag", "dog-less", 1],
    [4, "info", "cool", 1],
  ])

  verify(assert, prog, [
    [5, "tag", "person"],
    [5, "boat", 10],
  ], [
    [4, "tag", "dog-less", 1],
    [4, "info", "not cool", 1],
  ])

  verify(assert, prog, [
    [5, "tag", "person", 0, -1],
    [1, "tag", "person", 0, -1],
  ], [
    [4, "tag", "dog-less", 1, -1],
    [4, "info", "not cool", 1, -1],
    [6, "tag", "dog-less", 1, -1],
    [6, "info", "cool", 1, -1],
  ])

  verify(assert, prog, [
    [5, "tag", "person"],
    [1, "tag", "person"],
  ], [
    [4, "tag", "dog-less", 1],
    [4, "info", "not cool", 1],
    [6, "tag", "dog-less", 1],
    [6, "info", "cool", 1],
  ])


  assert.end();
});

// @TODO: Give this a better name when we figure out the specific issue.
test("Choose: Busted partial identity", (assert) => {
  let prog = new Program("test");
  prog.bind("Split up our cat attributes", ({find, lookup, record}) => {
    let cat = find("cat");
    let {attribute, value} = lookup(cat);
    return [
      // @NOTE: Issue has to do with add, can't repro if value is part of the identity.
      record("cat-attribute", {cat, attribute}).add("value", value)
    ];
  })

  prog.bind("Create value records for each cat attribute.", ({find, lookup, choose, record}) => {
    let catAttribute = find("cat-attribute");
    // Tags about cats are cool.
    // @FIXME: In some (but not all) cases where the first branch matches both branches emit.
    //         This may be multiplicity/retraction related.
    let [attrName] = choose(
      () => { catAttribute.attribute == "tag"; return "cool tags"; },
      () => catAttribute.attribute
    );

    let {cat, value} = catAttribute;
    return [
      record("cat-value", {cat, attr: attrName, val: value})
    ];
  });

  verify(assert, prog, [
    [1, "tag", "pet"],
    [1, "tag", "cat"],
    [1, "name", "Felicia"],
  ], [
    [2, "tag", "cat-attribute", 1],
    [2, "cat", 1, 1],
    [2, "attribute", "tag", 1],
    [2, "value", "pet", 1],
    [2, "value", "cat", 1],

    [3, "tag", "cat-attribute", 1],
    [3, "cat", 1, 1],
    [3, "attribute", "name", 1],
    [3, "value", "Felicia", 1],

    [4, "tag", "cat-value", 2],
    [4, "cat", 1, 2],
    [4, "attr", "cool tags", 2],
    [4, "val", "pet", 2],

    [5, "tag", "cat-value", 2],
    [5, "cat", 1, 2],
    [5, "attr", "cool tags", 2],
    [5, "val", "cat", 2],

    [6, "tag", "cat-value", 2],
    [6, "cat", 1, 2],
    [6, "attr", "name", 2],
    [6, "val", "Felicia", 2],
  ]);

  assert.end();
});

test("Choose: multiple return", (assert) => {

  let prog = new Program("test");
  prog.bind("simple block", ({find, record, lib, choose}) => {
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

test("Choose: moves only", (assert) => {

  let prog = new Program("test");
  prog.bind("simple block", ({find, record, choose}) => {
    let person = find("person");
    let {name} = person;
    let [displayName] = choose(
      () => { name == "christopher"; return "chris"; },
        () => name
    );
    return [
      person.add({displayName})
    ]
  });

  verify(assert, prog, [
    [1, "tag", "person"],
    [1, "name", "christopher"],
    [2, "tag", "person"],
    [2, "name", "jane"],
  ], [
    [1, "displayName", "chris", 1],
    [2, "displayName", "jane", 1],
  ])

  assert.end();
});

test("Choose: post-filtering outer", (assert) => {
  let prog = new Program("test");
  prog.bind("froofy", ({find, choose, record}) => {
    let person = find("person");
    let [display] = choose(() => person.display);
    display.name == "Ferdinand";
    return [record("result", {name: display.name})];
  });

  verify(assert, prog, [
    [1, "tag", "person"],
    [1, "display", 2],
    [2, "name", "Jess"],
    [3, "tag", "cat"],
    [3, "display", 4],
    [4, "name", "Ferdinand"],
  ], []);
  assert.end();
});

test("Choose: expression-only dynamic branch", (assert) => {
  let prog = new Program("test");
  prog.bind("Choose non-static expression only.", ({find, choose, record}) => {
    let guy = find("guy");
    let {radness} = guy;
    let [radometer] = choose(() => radness * 3); // This does not.
    // let radometer = radness * 3; // This works
    return [guy.add("radometer", radometer)];
  });

  verify(assert, prog, [
    [1, "tag", "guy"],
    [1, "radness", 1],
  ], [
    [1, "radometer", 3, 1]
  ]);
  assert.end();
});

test("Choose: filter and expression-only dynamic branches", (assert) => {
  let prog = new Program("test");
  prog.bind("Choose non-static expression only.", ({find, choose, record}) => {
    let guy = find("guy");
    let {radness} = guy;
    // We need to adjust the scale since radness is roughly logarithmic.
    let [radometer] = choose(
      () => { radness < 2; return radness; },
      () => { radness < 4; return radness * 2; },
      () => radness * 3
    );
    // let radometer = radness * 3;
    return [guy.add("radometer", radometer)];
  });

  verify(assert, prog, [
    [1, "tag", "guy"],
    [1, "radness", 0],
    [2, "tag", "guy"],
    [2, "radness", 1],
    [3, "tag", "guy"],
    [3, "radness", 2],
    [4, "tag", "guy"],
    [4, "radness", 4],
  ], [
    [1, "radometer", 0, 1],
    [2, "radometer", 1, 1],
    [3, "radometer", 4, 1],
    [4, "radometer", 12, 1]
  ]);
  assert.end();
});



let programs = {
  "1 static": () => {
    let prog = new Program("1 static branch");
    prog.bind("simple block", ({find, choose, record}) => {
      let foo = find("input");
      let [branch] = choose(() => 1);
      return [
        record("result", {branch})
      ];
    });
    return prog;
  },

  "1 dynamic": () => {
    let prog = new Program("1 dynamic branch");
    prog.bind("simple block", ({find, choose, record}) => {
      let foo = find("input");
      let [output] = choose(() => foo.arg0);
      return [
        record("result", {output})
      ];
    });
    return prog;
  },

  "1 dynamic 1 static": () => {
    let prog = new Program("1 dynamic branch");
    prog.bind("simple block", ({find, choose, record}) => {
      let foo = find("input");
      let [output] = choose(
        () => {foo.arg0 == 1; return "one"},
        () => "else"
      );
      return [
        record("result", {output})
      ];
    });
    return prog;
  },

  "2 dynamic": () => {
    let prog = new Program("1 dynamic branch");
    prog.bind("simple block", ({find, choose, record}) => {
      let foo = find("input");
      let [output] = choose(
        () => {foo.arg0 == 1; return "one"},
        () => foo.arg0
      );
      return [
        record("result", {output})
      ];
    });
    return prog;
  },
};

let verifyBranches = createVerifier(programs);

// -----------------------------------------------------
// 1 Static branch
// -----------------------------------------------------

test("Choose: 1 static branch +A; -A; +A", (assert) => {
  verifyBranches(assert, "1 static", "+A; -A; +A", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]],
    [[2, "tag", "result", 1, -1], [2, "branch", 1, 1, -1]],
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]]
  ]);
});

test("Choose: 1 static branch +A; -A; +B", (assert) => {
  verifyBranches(assert, "1 static", "+A; -A; +B", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]],
    [[2, "tag", "result", 1, -1], [2, "branch", 1, 1, -1]],
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]]
  ]);
});

// @NOTE: Broken due to verify being too simple.
test("Choose: 1 static branch +A; +A; -A", (assert) => {
  verifyBranches(assert, "1 static", "+A; +A; -A", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]],
    [],
    []
  ]);
});

// @NOTE: Broken due to verify being too simple.
test("Choose: 1 static branch +A; +A; -A; -A", (assert) => {
  verifyBranches(assert, "1 static", "+A; +A; -A; -A", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]],
    [],
    [],
    [[2, "tag", "result", 1, -1], [2, "branch", 1, 1, -1]],
  ]);
});

test("Choose: 1 static branch +A +B; -A; +A", (assert) => {
  verifyBranches(assert, "1 static", "+A +B; -A; +A", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]],
    [],
    []
  ]);
});

test("Choose: 1 static branch +A +B; -A -B", (assert) => {
  verifyBranches(assert, "1 static", "+A +B; -A -B", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]],
    [[2, "tag", "result", 1, -1], [2, "branch", 1, 1, -1]]
  ]);
});

test("Choose: 1 static branch +A; -A +B", (assert) => {
  verifyBranches(assert, "1 static", "+A; -A +B", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]],
    []
  ]);
});

test("Choose: 1 static branch +A, -A", (assert) => {
  verifyBranches(assert, "1 static", "+A, -A", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1],
     [2, "tag", "result", 2, -1], [2, "branch", 1, 2, -1]]
  ]);
});

test("Choose: 1 static branch +A, -A +B", (assert) => {
  verifyBranches(assert, "1 static", "+A, -A +B", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]]
  ]);
});

test("Choose: 1 static branch +A, +B", (assert) => {
  verifyBranches(assert, "1 static", "+A, +B", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]]
  ]);
});

test("Choose: 1 static branch +A, +B; -A", (assert) => {
  verifyBranches(assert, "1 static", "+A, +B; -A", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]],
    [[2, "tag", "result", 1, -1], [2, "branch", 1, 1, -1],
     [2, "tag", "result", 2, +1], [2, "branch", 1, 2, +1]]
  ]);
});

test("Choose: 1 static branch +A; -A, +B", (assert) => {
  verifyBranches(assert, "1 static", "+A; -A, +B", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]],
    [[2, "tag", "result", 1, -1], [2, "branch", 1, 1, -1],
     [2, "tag", "result", 2, +1], [2, "branch", 1, 2, +1]]
  ]);
});

// -----------------------------------------------------
// 1 dynamic branch
// -----------------------------------------------------

test("Choose: 1 dynamic branch +A:1; -A:1", (assert) => {
  verifyBranches(assert, "1 dynamic", "+A:1; -A:1", [
    [[1, "tag", "result", 1, +1], [1, "output", 1, 1, +1]],
    [[1, "tag", "result", 1, -1], [1, "output", 1, 1, -1]],
  ]);
});

test("Choose: 1 dynamic branch +A:1; -A:1; +A:1", (assert) => {
  verifyBranches(assert, "1 dynamic", "+A:1; -A:1; +A:1", [
    [[1, "tag", "result", 1, +1], [1, "output", 1, 1, +1]],
    [[1, "tag", "result", 1, -1], [1, "output", 1, 1, -1]],
    [[1, "tag", "result", 1, +1], [1, "output", 1, 1, +1]],
  ]);
});

test("Choose: 1 dynamic branch +A:1; -A:1; +A:2", (assert) => {
  verifyBranches(assert, "1 dynamic", "+A:1; -A:1; +A:2", [
    [[1, "tag", "result", 1, +1], [1, "output", 1, 1, +1]],
    [[1, "tag", "result", 1, -1], [1, "output", 1, 1, -1]],
    [[1, "tag", "result", 1, +1], [1, "output", 2, 1, +1]],
  ]);
});

test("Choose: 1 dynamic branch +A:1; +A:2; -A:1", (assert) => {
  verifyBranches(assert, "1 dynamic", "+A:1; +A:2; -A:1", [
    [[1, "tag", "result", 1, +1], [1, "output", 1, 1, +1]],
    [[1, "tag", "result", 1, +1], [1, "output", 2, 1, +1]],
    [[1, "tag", "result", 1, -1], [1, "output", 1, 1, -1]],
  ]);
});

test("Choose: 1 dynamic branch +A:1; +B:1; -A:1", (assert) => {
  verifyBranches(assert, "1 dynamic", "+A:1; +B:1; -A:1", [
    [[1, "tag", "result", 1, +1], [1, "output", 1, 1, +1]],
    [],
    [],
  ]);
});

test("Choose: 1 dynamic branch +A:1; +B:1; -A:1, -B:1", (assert) => {
  verifyBranches(assert, "1 dynamic", "+A:1; +B:1; -A:1, -B:1", [
    [[1, "tag", "result", 1, +1], [1, "output", 1, 1, +1]],
    [],
    [[1, "tag", "result", 2, -1], [1, "output", 1, 2, -1]],
  ]);
});

// -----------------------------------------------------
// 1 dynamic 1 static
// -----------------------------------------------------

test("Choose: 1 dynamic 1 static branch +A:1; -A:1; +A:1", (assert) => {
  verifyBranches(assert, "1 dynamic 1 static", "+A:1; -A:1; +A:1", [
    [[1, "tag", "result", 1, +1], [1, "output", "one", 1, +1]],
    [[1, "tag", "result", 1, -1], [1, "output", "one", 1, -1]],
    [[1, "tag", "result", 1, +1], [1, "output", "one", 1, +1]]
  ]);
});

test("Choose: 1 dynamic 1 static branch +A:2; -A:2; +A:2", (assert) => {
  verifyBranches(assert, "1 dynamic 1 static", "+A:2; -A:2; +A:2", [
    [[1, "tag", "result", 1, +1], [1, "output", "else", 1, +1]],
    [[1, "tag", "result", 1, -1], [1, "output", "else", 1, -1]],
    [[1, "tag", "result", 1, +1], [1, "output", "else", 1, +1]]
  ]);
});

test("Choose: 1 dynamic 1 static branch +A:1; -A:1; +A:2", (assert) => {
  verifyBranches(assert, "1 dynamic 1 static", "+A:1; -A:1; +A:2", [
    [[1, "tag", "result", 1, +1], [1, "output", "one", 1, +1]],
    [[1, "tag", "result", 1, -1], [1, "output", "one", 1, -1]],
    [[2, "tag", "result", 1, +1], [2, "output", "else", 1, +1]]
  ]);
});

test("Choose: 1 dynamic 1 static branch +A:1; +A:2", (assert) => {
  verifyBranches(assert, "1 dynamic 1 static", "+A:1; +A:2", [
    [[1, "tag", "result", 1, +1], [1, "output", "one", 1, +1]],
    []
  ]);
});

test("Choose: 1 dynamic 1 static branch +A:1; +B:2", (assert) => {
  verifyBranches(assert, "1 dynamic 1 static", "+A:1; +B:2", [
    [[1, "tag", "result", 1, +1], [1, "output", "one", 1, +1]],
    [[2, "tag", "result", 1, +1], [2, "output", "else", 1, +1]]
  ]);
});

test("Choose: 1 dynamic 1 static branch +A:1; +B:1; -A:1", (assert) => {
  verifyBranches(assert, "1 dynamic 1 static", "+A:1; +B:1; -A:1", [
    [[1, "tag", "result", 1, +1], [1, "output", "one", 1, +1]],
    [],
    []
  ]);
});

test("Choose: 1 dynamic 1 static branch +A:1, -A:1", (assert) => {
  verifyBranches(assert, "1 dynamic 1 static", "+A:1, -A:1", [
    [[1, "tag", "result", 1, +1], [1, "output", "one", 1, +1],
     [1, "tag", "result", 2, -1], [1, "output", "one", 2, -1]]
  ]);
});


test("Choose: 1 dynamic 1 static branch +A:1, -A:1, +A:1", (assert) => {
  verifyBranches(assert, "1 dynamic 1 static", "+A:1, -A:1, +A:1", [
    [[1, "tag", "result", 1, +1], [1, "output", "one", 1, +1],
     [1, "tag", "result", 2, -1], [1, "output", "one", 2, -1],
     [1, "tag", "result", 3, +1], [1, "output", "one", 3, +1]]
  ]);
});

test("Choose: 1 dynamic 1 static branch +A:1; +B:1; -B:1; +B:1", (assert) => {
  verifyBranches(assert, "1 dynamic 1 static", "+A:1; +B:1; -B:1; +B:1", [
    [[1, "tag", "result", 1, +1], [1, "output", "one", 1, +1]],
    [],
    [],
    []
  ]);
});

// -----------------------------------------------------
// 2 dynamics
// -----------------------------------------------------

test("Choose: 2 dynamic branch +A:1; -A:1; +A:1", (assert) => {
  verifyBranches(assert, "2 dynamic", "+A:1; -A:1; +A:1", [
    [[1, "tag", "result", 1, +1], [1, "output", "one", 1, +1]],
    [[1, "tag", "result", 1, -1], [1, "output", "one", 1, -1]],
    [[1, "tag", "result", 1, +1], [1, "output", "one", 1, +1]]
  ]);
});

test("Choose: 2 dynamic branch +A:2; -A:2; +A:2", (assert) => {
  verifyBranches(assert, "2 dynamic", "+A:2; -A:2; +A:2", [
    [[1, "tag", "result", 1, +1], [1, "output", 2, 1, +1]],
    [[1, "tag", "result", 1, -1], [1, "output", 2, 1, -1]],
    [[1, "tag", "result", 1, +1], [1, "output", 2, 1, +1]]
  ]);
});

test("Choose: 2 dynamic branch +A:1; -A:1; +A:2", (assert) => {
  verifyBranches(assert, "2 dynamic", "+A:1; -A:1; +A:2", [
    [[1, "tag", "result", 1, +1], [1, "output", "one", 1, +1]],
    [[1, "tag", "result", 1, -1], [1, "output", "one", 1, -1]],
    [[2, "tag", "result", 1, +1], [2, "output", 2, 1, +1]]
  ]);
});

test("Choose: 2 dynamic branch +A:1; +A:2", (assert) => {
  verifyBranches(assert, "2 dynamic", "+A:1; +A:2", [
    [[1, "tag", "result", 1, +1], [1, "output", "one", 1, +1]],
    []
  ]);
});

test("Choose: 2 dynamic branch +A:1; +B:2", (assert) => {
  verifyBranches(assert, "2 dynamic", "+A:1; +B:2", [
    [[1, "tag", "result", 1, +1], [1, "output", "one", 1, +1]],
    [[2, "tag", "result", 1, +1], [2, "output", 2, 1, +1]]
  ]);
});

test("Choose: 2 dynamic branch +A:1; +B:1; -A:1", (assert) => {
  verifyBranches(assert, "2 dynamic", "+A:1; +B:1; -A:1", [
    [[1, "tag", "result", 1, +1], [1, "output", "one", 1, +1]],
    [],
    []
  ]);
});

test("Choose: 2 dynamic branch +A:1, -A:1", (assert) => {
  verifyBranches(assert, "2 dynamic", "+A:1, -A:1", [
    [[1, "tag", "result", 1, +1], [1, "output", "one", 1, +1],
     [1, "tag", "result", 2, -1], [1, "output", "one", 2, -1]]
  ]);
});


test("Choose: 2 dynamic branch +A:1, -A:1, +A:1", (assert) => {
  verifyBranches(assert, "2 dynamic", "+A:1, -A:1, +A:1", [
    [[1, "tag", "result", 1, +1], [1, "output", "one", 1, +1],
     [1, "tag", "result", 2, -1], [1, "output", "one", 2, -1],
     [1, "tag", "result", 3, +1], [1, "output", "one", 3, +1]]
  ]);
});

test("Choose: 2 dynamic branch +A:1; +B:1; -B:1; +B:1", (assert) => {
  verifyBranches(assert, "2 dynamic", "+A:1; +B:1; -B:1; +B:1", [
    [[1, "tag", "result", 1, +1], [1, "output", "one", 1, +1]],
    [],
    [],
    []
  ]);
});
