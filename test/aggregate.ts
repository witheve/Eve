import {Program} from "../src/runtime/dsl2";
import {verify} from "./util";
import * as test from "tape";

test("Count in choose", (assert) => {

  // -----------------------------------------------------
  // program
  // -----------------------------------------------------

  let prog = new Program("test");
  prog.block("test count in choose", ({find, choose, gather, record}) => {
    let person = find("person");
    let [count] = choose(
      () => gather(person.pet).count(),
      () => 0
    );
    return [
      record("result", {person, count})
    ];
  });

  // -----------------------------------------------------
  // verification
  // -----------------------------------------------------

  verify(assert, prog, [
    ["A", "tag", "person"],
  ], [
    [1, "tag", "result", 1],
    [1, "person", "A", 1],
    [1, "count", 0, 1],
  ]);

  verify(assert, prog, [
    ["A", "pet", "B"],
  ], [
    [1, "tag", "result", -1],
    [1, "person", "A", -1],
    [1, "count", 0, -1],

    [2, "tag", "result", 1],
    [2, "person", "A", 1],
    [2, "count", 1, 1],
  ]);

  verify(assert, prog, [
    ["A", "pet", "C"],
  ], [
    [2, "tag", "result", -1],
    [2, "person", "A", -1],
    [2, "count", 1, -1],

    [3, "tag", "result", 1],
    [3, "person", "A", 1],
    [3, "count", 2, 1],
  ]);

  assert.end();
});
