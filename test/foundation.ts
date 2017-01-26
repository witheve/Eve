import {Program} from "../src/runtime/dsl";
import {verify} from "./util";
import * as test from "tape";

test("find a record and generate a record as a result", (assert) => {

  // -----------------------------------------------------
  // program
  // -----------------------------------------------------

  let prog = new Program("test");
  prog.block("simple block", (find:any, record:any, lib:any) => {
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
  prog.block("simple block", (find:any, record:any, lib:any) => {
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
    [5, "age1", 41, 1],
    [5, "age2", 3, 1],
    [4, "age1", 41, 1],
    [4, "age2", 7, 1],
    [6, "age1", 7, 1],
    [6, "age2", 3, 1],
  ])

  assert.end();
});




