import {Program} from "../src/runtime/dsl2";
import {verify} from "./util";
import * as test from "tape";

test("Aggregate: Count in choose", (assert) => {

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
    [1, "tag", "result", 1, -1],
    [1, "person", "A", 1, -1],
    [1, "count", 0, 1, -1],

    [2, "tag", "result", 1, 1],
    [2, "person", "A", 1, 1],
    [2, "count", 1, 1, 1],
  ]);

  verify(assert, prog, [
    ["A", "pet", "C"],
  ], [
    [2, "tag", "result", 1, -1],
    [2, "person", "A", 1, -1],
    [2, "count", 1, 1, -1],

    [3, "tag", "result", 1],
    [3, "person", "A", 1],
    [3, "count", 2, 1],
  ]);

  assert.end();
});


test("Aggregate: direction-less sort", (assert) => {

  let prog = new Program("test");
  prog.block("test count in choose", ({find, choose, gather, record}) => {
    let person = find("person");
    let pos = gather(person.name).sort();
    return [
      person.add("pos", pos)
    ];
  });

  verify(assert, prog, [
    ["A", "tag", "person"],
    ["A", "name", "Jane"],
  ], [
    ["A", "pos", 1, 1],
  ]);

  verify(assert, prog, [
    ["B", "tag", "person"],
    ["B", "name", "Chris"],
  ], [
    ["B", "pos", 1, 1],
    ["A", "pos", 1, 1, -1],
    ["A", "pos", 2, 1],
  ]);

  verify(assert, prog, [
    ["C", "tag", "person"],
    ["C", "name", "Zaria"],
  ], [
    ["C", "pos", 3, 1],
  ]);

  verify(assert, prog, [
    ["B", "tag", "person", 0, -1],
    ["B", "name", "Chris", 0, -1],
  ], [
    ["B", "pos", 1, 1, -1],
    ["A", "pos", 1, 1, 1],
    ["A", "pos", 2, 1, -1],
    ["C", "pos", 2, 1, 1],
    ["C", "pos", 3, 1, -1],
  ]);

  assert.end();
});

test("Aggregate: down sort", (assert) => {

  let prog = new Program("test");
  prog.block("test count in choose", ({find, choose, gather, record}) => {
    let person = find("person");
    let pos = gather(person.name).sort("down");
    return [
      person.add("pos", pos)
    ];
  });

  verify(assert, prog, [
    ["A", "tag", "person"],
    ["A", "name", "Jane"],
  ], [
    ["A", "pos", 1, 1],
  ]);

  verify(assert, prog, [
    ["B", "tag", "person"],
    ["B", "name", "Chris"],
  ], [
    ["B", "pos", 2, 1],
  ]);

  verify(assert, prog, [
    ["C", "tag", "person"],
    ["C", "name", "Zaria"],
  ], [
    ["C", "pos", 1, 1],
    ["A", "pos", 1, 1, -1],
    ["A", "pos", 2, 1],
    ["B", "pos", 2, 1, -1],
    ["B", "pos", 3, 1],
  ]);

  verify(assert, prog, [
    ["C", "tag", "person", 0, -1],
    ["C", "name", "Zaria", 0, -1],
  ], [
    ["C", "pos", 1, 1, -1],
    ["A", "pos", 1, 1, 1],
    ["A", "pos", 2, 1, -1],
    ["B", "pos", 2, 1, 1],
    ["B", "pos", 3, 1, -1],
  ]);

  assert.end();
});


test("Aggregate: multi-direction sort", (assert) => {

  let prog = new Program("test");
  prog.block("test count in choose", ({find, choose, gather, record}) => {
    let person = find("person");
    let pos = gather(person.name, person.age).sort("down", "up");
    return [
      person.add("pos", pos)
    ];
  });

  verify(assert, prog, [
    ["A", "tag", "person"],
    ["A", "name", "Jane"],
    ["A", "age", 27],
  ], [
    ["A", "pos", 1, 1],
  ]);

  verify(assert, prog, [
    ["B", "tag", "person"],
    ["B", "name", "Chris"],
    ["B", "age", 25],
  ], [
    ["B", "pos", 2, 1],
  ]);

  verify(assert, prog, [
    ["C", "tag", "person"],
    ["C", "name", "Jane"],
    ["C", "age", 19],
  ], [
    ["C", "pos", 1, 1],
    ["A", "pos", 1, 1, -1],
    ["A", "pos", 2, 1],
    ["B", "pos", 2, 1, -1],
    ["B", "pos", 3, 1],
  ]);

  verify(assert, prog, [
    ["C", "tag", "person", 0, -1],
  ], [
    ["C", "pos", 1, 1, -1],
    ["A", "pos", 1, 1, 1],
    ["A", "pos", 2, 1, -1],
    ["B", "pos", 2, 1, 1],
    ["B", "pos", 3, 1, -1],
  ]);

  assert.end();
});

test("Aggregate: group sort", (assert) => {

  let prog = new Program("test");
  prog.block("test count in choose", ({find, choose, gather, record}) => {
    let person = find("person");
    let pos = gather(person.name).per(person.age).sort("down");
    return [
      person.add("pos", pos)
    ];
  });

  verify(assert, prog, [
    ["A", "tag", "person"],
    ["A", "name", "Jane"],
    ["A", "age", 27],
  ], [
    ["A", "pos", 1, 1],
  ]);

  verify(assert, prog, [
    ["B", "tag", "person"],
    ["B", "name", "Chris"],
    ["B", "age", 27],
  ], [
    ["B", "pos", 2, 1],
  ]);

  verify(assert, prog, [
    ["C", "tag", "person"],
    ["C", "name", "Zaria"],
    ["C", "age", 25],
  ], [
    ["C", "pos", 1, 1],
  ]);


  verify(assert, prog, [
    ["D", "tag", "person"],
    ["D", "name", "Dana"],
    ["D", "age", 27],
  ], [
    ["D", "pos", 2, 1],
    ["B", "pos", 2, 1, -1],
    ["B", "pos", 3, 1],
  ]);

  verify(assert, prog, [
    ["C", "tag", "person", 0, -1],
  ], [
    ["C", "pos", 1, 1, -1],
  ]);

  assert.end();
});


test("Aggregate: committed sort with post filtering", (assert) => {
  let prog = new Program("test")
  .commit("Clear events when they come in.", ({find}) => {
    let event = find("event/create-widget");
    return [event.remove()];
  })
  .commit("Create a new widget of the given model.", ({find, choose, gather, record}) => {
    let {model} = find("event/create-widget");

    // The serial number of our next widget is the highest serial we've issued for this model so far + 1.
    let {widget:other} = model;
    1 == gather(other.serial).per(model).sort("down");
    let serial = other.serial + 1;
    return [model.add("widget", record("widget", {serial}))];
  });


  verify(assert, prog, [
    [1, "tag", "model"],
    [1, "widget", 2],
    [1, "widget", 3],
    [2, "tag", "widget"],
    [2, "serial", 3],
    [3, "tag", "widget"],
    [3, "serial", 5],

    [4, "tag", "event/create-widget"],
    [4, "model", 1],
  ], [
    [4, "tag", "event/create-widget", 0, -1],
    [4, "model", 1, 0, -1],

    [1, "widget", "widget|6", 0],
    ["widget|6", "tag", "widget", 0],
    ["widget|6", "serial", 6, 0],
  ]);

  assert.end();
});

test("Aggregate: committed sort in choose", (assert) => {
  let prog = new Program("test")
  .commit("Clear events when they come in.", ({find}) => {
    let event = find("event/create-widget");
    return [event.remove()];
  })
  .commit("Create a new widget of the given model.", ({find, choose, gather, record}) => {
    let {model} = find("event/create-widget");

    // The serial number of our next widget is the highest serial we've issued for this model so far + 1.
    let [serial] = choose(() => {
      let {widget:other} = model;
      1 == gather(other.serial).per(model).sort("down"); // @NOTE: This breaks differently due to equality bug.
      return other.serial + 1;
    }, () => 1);
    return [model.add("widget", record("widget", {serial}))];
  });


  verify(assert, prog, [
    [1, "tag", "model"],
    [1, "widget", 2],
    [1, "widget", 3],
    [2, "tag", "widget"],
    [2, "serial", 3],
    [3, "tag", "widget"],
    [3, "serial", 5],

    [4, "tag", "event/create-widget"],
    [4, "model", 1],
  ], [
    [4, "tag", "event/create-widget", 0, -1],
    [4, "model", 1, 0, -1],

    [1, "widget", "widget|6", 0],
    ["widget|6", "tag", "widget", 0],
    ["widget|6", "serial", 6, 0],
  ]);

  assert.end();
});

test("Aggregate: committed sort in choose", (assert) => {
  let prog = new Program("test")
  .commit("Clear events when they come in.", ({find}) => {
    let event = find("event/create-widget");
    return [event.remove()];
  })
  .commit("Create a new widget of the given model.", ({find, choose, gather, record}) => {
    let {model} = find("event/create-widget");

    // The serial number of our next widget is the highest serial we've issued for this model so far + 1.
    let [serial] = choose(() => {
      let {widget:other} = model;
      2 > gather(other.serial).per(model).sort("down");
      return other.serial + 1;
    }, () => 1);
    return [model.add("widget", record("widget", {serial}))];
  });


  verify(assert, prog, [
    [1, "tag", "model"],
    [1, "widget", 2],
    [1, "widget", 3],
    [2, "tag", "widget"],
    [2, "serial", 3],
    [3, "tag", "widget"],
    [3, "serial", 5],

    [4, "tag", "event/create-widget"],
    [4, "model", 1],
  ], [
    [4, "tag", "event/create-widget", 0, -1],
    [4, "model", 1, 0, -1],

    [1, "widget", "widget|6", 0],
    ["widget|6", "tag", "widget", 0],
    ["widget|6", "serial", 6, 0],
  ]);

  assert.end();
});
