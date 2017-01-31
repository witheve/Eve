import {Program} from "../src/runtime/dsl";
import {verify, createChanges, time} from "./util";
import {HashIndex} from "../src/runtime/indexes";
import * as test from "tape";

test("test single block performance with 10000 transactions", (assert) => {

  // -----------------------------------------------------
  // program
  // -----------------------------------------------------

  let prog = new Program("test");
  prog.block("simple block", ({find, record, lib}) => {
    let person = find("person");
    let text = `name: ${person.name}`;
    return [
      record("html/div", {person, text})
    ]
  });

  // -----------------------------------------------------
  // verification
  // -----------------------------------------------------

  for(let ix = 0; ix < 1; ix++) {
    prog.index = new HashIndex();
    let size = 10000;
    let changes = [];
    for(let i = 0; i < size; i++) {
      changes.push(createChanges(i, [[i - 1, "name", i - 1], [i, "tag", "person"]]))
    }

    let start = time();
    for(let change of changes) {
      prog.input(change);
    }
    let end = time(start);
    assert.test("updates finished in " + end, (assert) => {
      assert.true(end < 1000, "Took too long");
      assert.end();
    })
  }
  assert.pass();
  assert.end();
});
