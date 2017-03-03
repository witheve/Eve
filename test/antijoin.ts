import {Program} from "../src/runtime/dsl2";
import {verify} from "./util";
import * as test from "tape";

function createProgram() {
  let prog = new Program("test");
  prog.block("simple block", ({find, record, not}) => {
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
