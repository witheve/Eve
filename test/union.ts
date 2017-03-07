import {Program} from "../src/runtime/dsl2";
import {verify, createVerifier, pprint} from "./util";
import * as test from "tape";

var programs = {
  "1 static": () => {
    let prog = new Program("1 static branch");
    prog.block("simple block", ({find, union, record}) => {
      let foo = find("input");
      let [branch] = union(() => 1);
      return [
        record("result", {branch})
      ];
    });
    return prog;
  },
  "2 static": () => {
    let prog = new Program("2 static branches");
    prog.block("simple block", ({find, union, record}) => {
      let foo = find("input");
      let [branch] = union(
        () => 1,
        () => 2
      );
      return [
        record("result", {branch})
      ];
    });
    return prog;
  },

  "1 dynamic": () => {
    let prog = new Program("1 dynamic branch");
    prog.block("simple block", ({find, union, record}) => {
      let foo = find("input");
      let [output] = union(() => foo.arg0);
      return [
        record("result", {output})
      ];
    });
    return prog;
  },

  "2 dynamic": () => {
    let prog = new Program("2 dynamic branches");
    prog.block("simple block", ({find, union, record}) => {
      let foo = find("input");
      let [output] = union(
        () => {foo.arg0 == 1; return ["one"]},
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

test("1 static branch +A; -A; +A", (assert) => {
  verifyBranches(assert, "1 static", "+A; -A; +A", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]],
    [[2, "tag", "result", 1, -1], [2, "branch", 1, 1, -1]],
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]]
  ]);
});

test("1 static branch +A; -A; +B", (assert) => {
  verifyBranches(assert, "1 static", "+A; -A; +B", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]],
    [[2, "tag", "result", 1, -1], [2, "branch", 1, 1, -1]],
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]]
  ]);
});

// @NOTE: Broken due to verify being too simple.
test("1 static branch +A; +A; -A", (assert) => {
  verifyBranches(assert, "1 static", "+A; +A; -A", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]],
    [],
    []
  ]);
});

// @NOTE: Broken due to verify being too simple.
test("1 static branch +A; +A; -A; -A", (assert) => {
  verifyBranches(assert, "1 static", "+A; +A; -A; -A", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]],
    [],
    [],
    [[2, "tag", "result", 1, -1], [2, "branch", 1, 1, -1]],
  ]);
});

test("1 static branch +A +B; -A; +A", (assert) => {
  verifyBranches(assert, "1 static", "+A +B; -A; +A", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]],
    [],
    []
  ]);
});

test("1 static branch +A +B; -A -B", (assert) => {
  verifyBranches(assert, "1 static", "+A +B; -A -B", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]],
    [[2, "tag", "result", 1, -1], [2, "branch", 1, 1, -1]]
  ]);
});

test("1 static branch +A; -A +B", (assert) => {
  verifyBranches(assert, "1 static", "+A; -A +B", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]],
    []
  ]);
});

test("1 static branch +A, -A", (assert) => {
  verifyBranches(assert, "1 static", "+A, -A", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1],
     [2, "tag", "result", 2, -1], [2, "branch", 1, 2, -1]]
  ]);
});

test("1 static branch +A, -A +B", (assert) => {
  verifyBranches(assert, "1 static", "+A, -A +B", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]]
  ]);
});

test("1 static branch +A, +B", (assert) => {
  verifyBranches(assert, "1 static", "+A, +B", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]]
  ]);
});

test("1 static branch +A, +B; -A", (assert) => {
  verifyBranches(assert, "1 static", "+A, +B; -A", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]],
    [[2, "tag", "result", 1, -1], [2, "branch", 1, 1, -1],
     [2, "tag", "result", 2, +1], [2, "branch", 1, 2, +1]]
  ]);
});

test("1 static branch +A; -A, +B", (assert) => {
  verifyBranches(assert, "1 static", "+A; -A, +B", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]],
    [[2, "tag", "result", 1, -1], [2, "branch", 1, 1, -1],
     [2, "tag", "result", 2, +1], [2, "branch", 1, 2, +1]]
  ]);
});

// -----------------------------------------------------
// 2 Static branches
// -----------------------------------------------------

test("2 static branches +A; -A; +A", (assert) => {
  verifyBranches(assert, "2 static", "+A; -A; +A", [
    [[1, "tag", "result", 1, +1], [1, "branch", 1, 1, +1],
     [2, "tag", "result", 1, +1], [2, "branch", 2, 1, +1]],
    [[1, "tag", "result", 1, -1], [1, "branch", 1, 1, -1],
     [2, "tag", "result", 1, -1], [2, "branch", 2, 1, -1]],
    [[1, "tag", "result", 1, +1], [1, "branch", 1, 1, +1],
     [2, "tag", "result", 1, +1], [2, "branch", 2, 1, +1]]
  ]);
});

test("2 static branches +A; +B", (assert) => {
  verifyBranches(assert, "2 static", "+A; +B", [
    [[1, "tag", "result", 1, +1], [1, "branch", 1, 1, +1],
     [2, "tag", "result", 1, +1], [2, "branch", 2, 1, +1]],
    []
  ]);
});

test("2 static branches +A; +B; -A", (assert) => {
  verifyBranches(assert, "2 static", "+A; +B; -A", [
    [[1, "tag", "result", 1, +1], [1, "branch", 1, 1, +1],
     [2, "tag", "result", 1, +1], [2, "branch", 2, 1, +1]],
    [],
    []
  ]);
});

test("2 static branches +A +B; -A; +A", (assert) => {
  verifyBranches(assert, "2 static", "+A +B; -A; +A", [
    [[1, "tag", "result", 1, +1], [1, "branch", 1, 1, +1],
     [2, "tag", "result", 1, +1], [2, "branch", 2, 1, +1]],
    [],
    []
  ]);
});

test("2 static branches +A; +B; -A; -B", (assert) => {
  verifyBranches(assert, "2 static", "+A; +B; -A; -B", [
    [[1, "tag", "result", 1, +1], [1, "branch", 1, 1, +1],
     [2, "tag", "result", 1, +1], [2, "branch", 2, 1, +1]],
    [],
    [],
    [[1, "tag", "result", 1, -1], [1, "branch", 1, 1, -1],
     [2, "tag", "result", 1, -1], [2, "branch", 2, 1, -1]],
  ]);
});


test("2 static branches +A; +B, -A; -B", (assert) => {
  verifyBranches(assert, "2 static", "+A; +B, -A; -B", [
    [[1, "tag", "result", 1, +1], [1, "branch", 1, 1, +1],
     [2, "tag", "result", 1, +1], [2, "branch", 2, 1, +1]],
    [],
    // These changes happen in round 2 because while the removal of B's results
    // happen in round 1, A's results exist in round 1 and then are removed
    // in round 2 as a result of A beind removed in round 1.
    [[1, "tag", "result", 2, -1], [1, "branch", 1, 2, -1],
     [2, "tag", "result", 2, -1], [2, "branch", 2, 2, -1]],
  ]);
});

// -----------------------------------------------------
// 1 dynamic branch
// -----------------------------------------------------

test("1 dynamic branch +A:1; -A:1", (assert) => {
  verifyBranches(assert, "1 dynamic", "+A:1; -A:1", [
    [[1, "tag", "result", 1, +1], [1, "output", 1, 1, +1]],
    [[1, "tag", "result", 1, -1], [1, "output", 1, 1, -1]],
  ]);
});

test("1 dynamic branch +A:1; -A:1; +A:1", (assert) => {
  verifyBranches(assert, "1 dynamic", "+A:1; -A:1; +A:1", [
    [[1, "tag", "result", 1, +1], [1, "output", 1, 1, +1]],
    [[1, "tag", "result", 1, -1], [1, "output", 1, 1, -1]],
    [[1, "tag", "result", 1, +1], [1, "output", 1, 1, +1]],
  ]);
});

test("1 dynamic branch +A:1; -A:1; +A:2", (assert) => {
  verifyBranches(assert, "1 dynamic", "+A:1; -A:1; +A:2", [
    [[1, "tag", "result", 1, +1], [1, "output", 1, 1, +1]],
    [[1, "tag", "result", 1, -1], [1, "output", 1, 1, -1]],
    [[1, "tag", "result", 1, +1], [1, "output", 2, 1, +1]],
  ]);
});

test("1 dynamic branch +A:1; +A:2; -A:1", (assert) => {
  verifyBranches(assert, "1 dynamic", "+A:1; +A:2; -A:1", [
    [[1, "tag", "result", 1, +1], [1, "output", 1, 1, +1]],
    [[1, "tag", "result", 1, +1], [1, "output", 2, 1, +1]],
    [[1, "tag", "result", 1, -1], [1, "output", 1, 1, -1]],
  ]);
});

test("1 dynamic branch +A:1; +B:1; -A:1", (assert) => {
  verifyBranches(assert, "1 dynamic", "+A:1; +B:1; -A:1", [
    [[1, "tag", "result", 1, +1], [1, "output", 1, 1, +1]],
    [],
    [],
  ]);
});

test("1 dynamic branch +A:1; +B:1; -A:1, -B:1", (assert) => {
  verifyBranches(assert, "1 dynamic", "+A:1; +B:1; -A:1, -B:1", [
    [[1, "tag", "result", 1, +1], [1, "output", 1, 1, +1]],
    [],
    [[1, "tag", "result", 2, -1], [1, "output", 1, 2, -1]],
  ]);
});

// -----------------------------------------------------
// 2 dynamic branches
// -----------------------------------------------------

test("2 dynamic branches +A:1; -A:1", (assert) => {
  verifyBranches(assert, "2 dynamic", "+A:1; -A:1", [
    [[1, "tag", "result", 1, +1], [1, "output", "one", 1, +1],
     [2, "tag", "result", 1, +1], [2, "output", 1, 1, +1]],
    [[1, "tag", "result", 1, -1], [1, "output", "one", 1, -1],
     [2, "tag", "result", 1, -1], [2, "output", 1, 1, -1]]
  ]);
});

test("2 dynamic branches +A:1; +B:1", (assert) => {
  verifyBranches(assert, "2 dynamic", "+A:1; +B:1", [
    [[1, "tag", "result", 1, +1], [1, "output", "one", 1, +1],
     [2, "tag", "result", 1, +1], [2, "output", 1, 1, +1]],
    []
  ]);
});

test("2 dynamic branches +A:1, +B:1", (assert) => {
  verifyBranches(assert, "2 dynamic", "+A:1, +B:1", [
    [[1, "tag", "result", 1, +1], [1, "output", "one", 1, +1],
     [2, "tag", "result", 1, +1], [2, "output", 1, 1, +1]]
  ]);
});

test("2 dynamic branches +A:1, +B:1; -A:1", (assert) => {
  verifyBranches(assert, "2 dynamic", "+A:1, +B:1; -A:1", [
    [[1, "tag", "result", 1, +1], [1, "output", "one", 1, +1],
     [2, "tag", "result", 1, +1], [2, "output", 1, 1, +1]],
    [[1, "tag", "result", 1, -1], [1, "output", "one", 1, -1],
     [2, "tag", "result", 1, -1], [2, "output", 1, 1, -1],
     [3, "tag", "result", 2, +1], [3, "output", "one", 2, +1],
     [4, "tag", "result", 2, +1], [4, "output", 1, 2, +1]]
  ]);
});

test("2 dynamic branches +A:1 +B:2, -A:1", (assert) => {
  verifyBranches(assert, "2 dynamic", "+A:1 +B:2, -A:1", [
    [[1, "tag", "result", 1, +1], [1, "output", "one", 1, +1],
     [2, "tag", "result", 1, +1], [2, "output", 1, 1, +1],
     [3, "tag", "result", 1, +1], [3, "output", 2, 1, +1],
     [1, "tag", "result", 2, -1], [1, "output", "one", 2, -1],
     [2, "tag", "result", 2, -1], [2, "output", 1, 2, -1]]
  ]);
});

test("Union: basic", (assert) => {

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
      record("coolness", {info})
    ]
  });

  verify(assert, prog, [
    [1, "tag", "person"],
  ], [
    [2, "tag", "coolness", 1],
    [2, "info", "not cool", 1],
  ])

  verify(assert, prog, [
    [1, "dog", "spot"],
  ], [
    [3, "tag", "coolness", 1],
    [3, "info", "cool", 1],
  ])

  assert.end();
});


test("Union: static moves", (assert) => {

  let prog = new Program("test");
  prog.block("simple block", ({find, record, lib, union}) => {
    let person = find("person");
    let [info] = union(() => {
      return "cool";
    }, () => {
      return "not cool";
    });
    return [
      record("coolness", {info})
    ]
  });

  verify(assert, prog, [
    [1, "tag", "person"],
  ], [
    [2, "tag", "coolness", 1],
    [2, "info", "not cool", 1],
    [3, "tag", "coolness", 1],
    [3, "info", "cool", 1],
  ])

  assert.end();
});
