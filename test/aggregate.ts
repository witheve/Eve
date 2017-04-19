import {Program} from "../src/runtime/dsl2";
import {verify} from "./util";
import * as test from "tape";

test("Aggregate: Count in choose", (assert) => {

  let prog = new Program("test");
  prog.bind("test count in choose", ({find, choose, gather, record}) => {
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
  prog.bind("test direction-less sort", ({find, choose, gather, record}) => {
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
  prog.bind("test down sort", ({find, choose, gather, record}) => {
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
  prog.bind("test multi-direction sort", ({find, choose, gather, record}) => {
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

test("Aggregate: limit query with sort and `pos <=`", (assert) => {
  let prog = new Program("test");
  prog.bind("limit query with sort and `pos <=`", ({find, gather}) => {
    let person = find("person");
    let pos = gather(person.name, person).sort();
    pos <= 2;
    return [
      person.add("pos", pos)
    ];
  });

  verify(assert, prog, [
    ["B", "tag", "person"],
    ["B", "name", "Jane"],
  ], [
    ["B", "pos", 1, 1],
  ]);

  verify(assert, prog, [
    ["A", "tag", "person"],
    ["A", "name", "Jane"],
  ], [
    ["A", "pos", 1, 1, 1],
    ["B", "pos", 1, 1, -1],
    ["B", "pos", 2, 1, 1],
  ]);

  verify(assert, prog, [
    ["C", "tag", "person"],
    ["C", "name", "Jane"],
  ], []);

  verify(assert, prog, [
    ["D", "tag", "person"],
    ["D", "name", "Chris"],
  ], [
    ["A", "pos", 1, 1, -1],
    ["A", "pos", 2, 1, 1],
    ["B", "pos", 2, 1, -1],
    ["D", "pos", 1, 1, 1],
  ]);

  assert.end();
});

test("Aggregate: group sort", (assert) => {

  let prog = new Program("test");
  prog.bind("test group sort", ({find, choose, gather, record}) => {
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

test("Aggregate: committed sort in choose with post filtering greater than", (assert) => {
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


test("Aggregate: committed sort with multiple groups", (assert) => {
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

    [5, "tag", "model"],
    [5, "widget", 6],
    [6, "tag", "widget"],
    [6, "serial", 28],
    [5, "widget", 7],
    [7, "tag", "widget"],
    [7, "serial", 30],

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

test("Sort: incremental updates", (assert) => {
  let prog = new Program("test");
  prog.bind("the block's next is the highest node sort + 1.", ({find, gather, record}) => {
    let block = find("block");
    let {node} = block;
    2 > gather(node.sort).per(block).sort("down");
    let sort = node.sort + 1;
    return [block.add("next", sort)];
  });

  verify(assert, prog, [
    [1, "tag", "block"],
    [1, "node", 2],
    [2, "sort", 1],
  ], [
    [1, "next", 2, 1]
  ]);
  verify(assert, prog, [
    [1, "node", 3],
    [3, "sort", 2],
  ], [
    [1, "next", 3, 1],
    [1, "next", 2, 1, -1],
  ]);
  verify(assert, prog, [
    [1, "node", 4],
    [4, "sort", 5],
  ], [
    [1, "next", 6, 1],
    [1, "next", 3, 1, -1],
  ]);

  assert.end();
});


test("Aggregate: inside choose without outer in key", (assert) => {
  let prog = new Program("test");
  prog.bind("count the names of people", ({find, gather, record, choose}) => {
    let person = find("person");
    let [sort] = choose(() => {
      return gather(person.name).count();
    }, () => "yo yo yo");
    return [person.add("next", sort)];
  });

  verify(assert, prog, [
    [1, "tag", "person"],
    [1, "name", "chris"],
    [1, "name", "christopher"],
    [2, "name", "joe"],
  ], [
    [1, "next", 2, 1],
  ]);

  assert.end();
});

test("Aggregate: no outer in key variations", (assert) => {
  let prog = new Program("test");
  prog.bind("count the names of people", ({find, gather, record, choose}) => {
    let person = find("person");
    let [sort] = choose(() => {
      return gather(person.name).count();
    }, () => "yo yo yo");
    return [person.add("next", sort)];
  });

  verify(assert, prog, [
    [1, "tag", "person"],
    [1, "name", "chris"],
    [1, "name", "christopher"],
    [2, "name", "joe"],
  ], [
    [1, "next", 2, 1],
  ]);

  verify(assert, prog, [
    [1, "tag", "person", 0, -1],
  ], [
    [1, "next", 2, 1, -1],
  ]);

  verify(assert, prog, [
    [1, "name", "chris", 0, -1],
    [1, "tag", "person"],
  ], [
    [1, "next", 1, 1],
  ]);

  verify(assert, prog, [
    [1, "name", "chris"],
    [1, "tag", "person", 0, -1],
  ], [
    [1, "next", 1, 1, -1],
  ]);

  assert.end();
});

// @NOTE: The not following the choose required for this example is currently marked dangerous
// test("Aggregate: stratified after choose", (assert) => {
//   let prog = new Program("test");
//   prog.bind("Count the next of kin", ({find, gather, choose, not, record}) => {
//     let person = find("person");
//     let [kin] = choose(() => person.family, () => person.friend, () => person.acquaintance);
//     not(() => kin.nemesis == person);
//     let count = gather(kin).per(person).count();
//     return [person.add("kin_count", count)];
//   });

//   verify(assert, prog, [
//     [1, "tag", "person"],
//     [1, "name", "chris"],
//     [1, "friend", "joe"],
//     [1, "friend", "fred"],
//     [1, "friend", "steve"],
//     ["steve", "nemesis", 1],
//   ], [
//     [1, "kin_count", 2, 1],
//   ]);

//   verify(assert, prog, [
//     [1, "tag", "person", 0, -1],
//   ], [
//     [1, "kin_count", 2, 1, -1],
//   ]);

//   assert.end();
// });
