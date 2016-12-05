import * as test from "tape";

import {Changes} from "../src/runtime/changes";
import {TripleIndex, MultiIndex} from "../src/runtime/indexes";
import {toJS, fromJS} from "../src/runtime/util/eavs";

function setup() {
  let index = new TripleIndex(0);
  let multi = new MultiIndex();
  multi.register("session", index);
  let changes = new Changes(multi);
  return { index, multi, changes };
}

function convert(thing, assert) {
  let {index, changes} = setup();
  let id = fromJS(changes, thing, "http", "session");
  changes.commit();
  let reconstituted = toJS(index, id);
  assert.deepEqual(reconstituted, thing);
}

test("converting js objects to eavs and back", (assert) => {
  convert({foo: "bar", blah: "baz"}, assert);
  assert.end();
});

test("converting js nested objects", (assert) => {
  convert({foo: {meh: "meh"}, blah: {beep: "boop"}}, assert);
  assert.end();
})

test("converting js arrays", (assert) => {
  convert(["a", "b", "c"], assert);
  assert.end();
})

test("converting nested js arrays", (assert) => {
  convert(["a", ["b", "c", "d"], "e"], assert);
  assert.end();
})

test("converting nested js objects and arrays", (assert) => {
  convert({
    fips: ["a", ["b", "c", "d"], "e"],
    moops: {meeps: "mops"},
    beep: ["boop", 3.45],
  }, assert);
  assert.end();
})

test("converting with null roundtrips", (assert) => {
  convert({
    beep: null,
    foo: [1, null, 2]
  }, assert);
  assert.end();
})
