import {Program} from "../../src/runtime/dsl2";
import {verify} from "../util";
import * as test from "tape";

test("stdlib:math:range: 1..5", (assert) => {
  let prog = new Program("test");
  prog.bind("test range", ({find, lib:{math}, record}) => {
    let ix = math.range(1, 5);
    return [
      record({ix})
    ];
  });

  verify(assert, prog, [
    ["A", "tag", "turtle"],
  ], [
    [11, "ix", 1, 1],
    [12, "ix", 2, 1],
    [13, "ix", 3, 1],
    [14, "ix", 4, 1],
    [15, "ix", 5, 1],
  ]);
  assert.end();
});

test("stdlib:math:range: 3..-1", (assert) => {
  let prog = new Program("test");
  prog.bind("test range", ({find, lib:{math}, record}) => {
    let ix = math.range(3, -1);
    return [
      record({ix})
    ];
  });

  verify(assert, prog, [
    ["A", "tag", "turtle"],
  ], [
    [11, "ix", 3, 1],
    [12, "ix", 2, 1],
    [13, "ix", 1, 1],
    [14, "ix", 0, 1],
    [15, "ix", -1, 1],
  ]);
  assert.end();
});

test("stdlib:math:range: x..y", (assert) => {
  let prog = new Program("test");
  prog.bind("test range", ({find, lib:{math}}) => {
    let endpoints = find("endpoints");
    let {x, y} = endpoints;
    let ix = math.range(x, y);
    return [
      endpoints.add({ix})
    ];
  });

  verify(assert, prog, [
    ["A", "tag", "endpoints"],
    ["A", "x", 1],
    ["A", "y", 3],
    ["B", "tag", "endpoints"],
    ["B", "x", 2],
    ["B", "y", 0],
  ], [
    ["A", "ix", 1, 1],
    ["A", "ix", 2, 1],
    ["A", "ix", 3, 1],
    ["B", "ix", 0, 1],
    ["B", "ix", 1, 1],
    ["B", "ix", 2, 1],
  ]);
  assert.end();
});

test("stdlib:math:range: bail on strings", (assert) => {
  let prog = new Program("test");
  prog.bind("test range", ({find, lib:{math}}) => {
    let endpoints = find("endpoints");
    let {x, y} = endpoints;
    let ix = math.range(x, y);
    return [
      endpoints.add({ix})
    ];
  });

  verify(assert, prog, [
    ["A", "tag", "endpoints"],
    ["A", "x", "1"],
    ["A", "y", 3],
    ["B", "tag", "endpoints"],
    ["B", "x", 2],
    ["B", "y", "0"],
  ], [
  ]);
  assert.end();
});
