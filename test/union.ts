import {Program} from "../src/runtime/dsl2";
import {verify} from "./util";
import * as test from "tape";

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
