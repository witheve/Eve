import {Program} from "../src/runtime/dsl2";
import {verify, createVerifier} from "./util";
import * as test from "tape";

function createProgram() {
  let prog = new Program("test");
  prog.bind("simple block", ({find, record, not}) => {
    let left = find("left");
    not(() => {
      find("right", {left})
    })
    return [
      record("success")
    ]
  });
  return prog;
}

test("Antijoin: simple left", (assert) => {
  let prog = createProgram();

  verify(assert, prog, [
    [1, "tag", "left"]
  ], [
    [2, "tag", "success", 1]
  ])

  assert.end();
});

test("Antijoin: simple right", (assert) => {
  let prog = createProgram();

  verify(assert, prog, [
    [1, "tag", "right"]
  ], [
    // nothing
  ])

  verify(assert, prog, [
    [1, "left", 2]
  ], [
    //nothing
  ])

  verify(assert, prog, [
    [2, "tag", "left"]
  ], [
    //nothing
  ])

  assert.end();
});

test("Antijoin: simple left then right", (assert) => {
  let prog = createProgram();

  verify(assert, prog, [
    [2, "tag", "left"]
  ], [
    [3, "tag", "success", 1]
  ])

  verify(assert, prog, [
    [1, "tag", "right"],
    [1, "left", 2],
  ], [
    [3, "tag", "success", 1, -1]
  ])

  assert.end();
});


test("Antijoin: simple left then right same transaction", (assert) => {
  let prog = createProgram();

  verify(assert, prog, [
    [2, "tag", "left"],
    [1, "tag", "right", 1],
    [1, "left", 2, 1],
  ], [
    [3, "tag", "success", 1],
    [3, "tag", "success", 2, -1]
  ])

  assert.end();
});

test("Antijoin: simple right then left same transaction", (assert) => {
  let prog = createProgram();

  verify(assert, prog, [
    [1, "tag", "right"],
    [1, "left", 2],
    [2, "tag", "left", 1],
  ], [
    // nothing
  ])

  assert.end();
});

test("Antijoin: right -> left -> -right", (assert) => {
  let prog = createProgram();

  verify(assert, prog, [
    [1, "tag", "right"],
    [1, "left", 2],

    [2, "tag", "left", 1],

    [1, "tag", "right", 2, -1],
    [1, "left", 2, 2, -1],
  ], [
    [3, "tag", "success", 3],
  ])

  assert.end();
});

test("Antijoin: right -> right -> left -> -right", (assert) => {
  let prog = createProgram();

  verify(assert, prog, [
    [1, "tag", "right"],
    [1, "left", 2],

    [4, "tag", "right", 5],
    [4, "left", 2, 5],
  ], [
    // nothing
  ])

  verify(assert, prog, [
    [2, "tag", "left", 2],
    [1, "tag", "right", 3, -1],
    [1, "left", 2, 3, -1],
  ], [
    [3, "tag", "success", 4],
    [3, "tag", "success", 6, -1],
  ])

  assert.end();
});

test("Antijoin: right -> -right -> right -> left", (assert) => {
  let prog = createProgram();

  verify(assert, prog, [
    [1, "tag", "right"],
    [1, "tag", "right", 3, -1],
    [4, "tag", "right", 5],

    [1, "left", 2],
    [1, "left", 2, 3, -1],
    [4, "left", 2, 5],
  ], [
    // nothing
  ])

  verify(assert, prog, [
    [2, "tag", "left"],
  ], [
    [3, "tag", "success", 4],
    [3, "tag", "success", 6, -1],
  ])

  assert.end();
});

test("Antijoin: left -> right -> -right", (assert) => {
  let prog = createProgram();

  verify(assert, prog, [
    [2, "tag", "left"],
    [4, "tag", "right", 5],
    [4, "left", 2, 5],
  ], [
    // nothing
    [3, "tag", "success", 1],
    [3, "tag", "success", 6, -1],
  ])

  verify(assert, prog, [
    [4, "tag", "right", 5, -1],
    [4, "left", 2, 5, -1],
  ], [
    [3, "tag", "success", 6, 1],
  ])

  assert.end();
});

test("Antijoin: right -> right -> left", (assert) => {
  let prog = createProgram();

  verify(assert, prog, [
    [1, "tag", "right", 4],
    [1, "left", 2, 4],
    [4, "tag", "right", 5],
    [4, "left", 2, 5],
  ], [
    // nothing
  ])

  verify(assert, prog, [
    [2, "tag", "left"],
  ], [
    [3, "tag", "success", 1],
    [3, "tag", "success", 5, -1],
  ])

  assert.end();
});

let programs = {
  "simple": () => {
    let prog = new Program("simple");
    prog.bind("simple block", ({find, not, record}) => {
      let input = find("input");
      not(() => input.arg0)
      return [
        record("result")
      ];
    });
    return prog;
  },
  "dynamic": () => {
    let prog = new Program("simple");
    prog.bind("simple block", ({find, not, record}) => {
      let input = find("input");
      not(() => input.arg0)
      return [
        record("result", {output: input})
      ];
    });
    return prog;
  },
};

let verifyIO = createVerifier(programs);

// -----------------------------------------------------
// simple
// -----------------------------------------------------

test("AntiJoin: simple +A; -A; +A", (assert) => {
  verifyIO(assert, "simple", "+A; -A; +A", [
    [[2, "tag", "result", 1, +1]],
    [[2, "tag", "result", 1, -1]],
    [[2, "tag", "result", 1, +1]]
  ]);
});

test("AntiJoin: simple +A; +B; -A; -B", (assert) => {
  verifyIO(assert, "simple", "+A; +B; -A; -B", [
    [[2, "tag", "result", 1, +1]],
    [],
    [],
    [[2, "tag", "result", 1, -1]],
  ]);
});

test("AntiJoin: simple +A, -A, +A", (assert) => {
  verifyIO(assert, "simple", "+A, -A, +A", [
    [[2, "tag", "result", 1, +1],
     [2, "tag", "result", 2, -1],
     [2, "tag", "result", 3, +1]]
  ]);
});

test("AntiJoin: simple +A, +B, -A, -B", (assert) => {
  verifyIO(assert, "simple", "+A, +B, -A, -B", [
    [[2, "tag", "result", 1, +1],
     [2, "tag", "result", 4, -1]],
  ]);
});

test("AntiJoin: simple +A; +A:1; -A:1; -A", (assert) => {
  verifyIO(assert, "simple", "+A; +A:1; -A:1; -A", [
    [[2, "tag", "result", 1, +1]],
    [[2, "tag", "result", 1, -1]],
    [[2, "tag", "result", 1, +1]],
    [[2, "tag", "result", 1, -1]]
  ]);
});

test("AntiJoin: simple +A; +A:1; +A:2; -A:1; -A:2", (assert) => {
  verifyIO(assert, "simple", "+A; +A:1; +A:2; -A:1; -A:2", [
    [[2, "tag", "result", 1, +1]],
    [[2, "tag", "result", 1, -1]],
    [],
    [],
    [[2, "tag", "result", 1, +1]]
  ]);
});

test("AntiJoin: simple +A; +B:1; -A; +C", (assert) => {
  verifyIO(assert, "simple", "+A; +B:1; -A; +C", [
    [[2, "tag", "result", 1, +1]],
    [],
    [[2, "tag", "result", 1, -1]],
    [[2, "tag", "result", 1, +1]]
  ]);
});

test("AntiJoin: simple +A; +B:1; +C; +A:1", (assert) => {
  verifyIO(assert, "simple", "+A; +B:1; +C; +A:1", [
    [[2, "tag", "result", 1, +1]],
    [],
    [],
    []
  ]);
});

// -----------------------------------------------------
// dynamic
// -----------------------------------------------------

test("AntiJoin: dynamic +A; -A; +A", (assert) => {
  verifyIO(assert, "dynamic", "+A; -A; +A", [
    [[2, "tag", "result", 1, +1], [2, "output", "A", 1, +1]],
    [[2, "tag", "result", 1, -1], [2, "output", "A", 1, -1]],
    [[2, "tag", "result", 1, +1], [2, "output", "A", 1, +1]]
  ]);
});

test("AntiJoin: dynamic +A; +B; -A; -B", (assert) => {
  verifyIO(assert, "dynamic", "+A; +B; -A; -B", [
    [[2, "tag", "result", 1, +1], [2, "output", "A", 1, +1]],
    [[2, "tag", "result", 1, +1], [2, "output", "B", 1, +1]],
    [[2, "tag", "result", 1, -1], [2, "output", "A", 1, -1]],
    [[2, "tag", "result", 1, -1], [2, "output", "B", 1, -1]],
  ]);
});
