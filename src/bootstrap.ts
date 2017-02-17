// import {create} from "./programs/tag-browser";
// let prog = create();

import {Program} from "./runtime/dsl2";

let prog = new Program("foop");

  prog.block("Every edge is the beginning of a path.", ({find, record, lib}) => {
    let from = find();
    return [
      from.add("path", from.edge)
    ];
  });

  prog.block("Jump from node to node building the path.", ({find, record, lib}) => {
    let from = find();
    let intermediate = find();
    from.edge == intermediate;
    let to = intermediate.path;

    intermediate.path;
    return [
      from.add("path", to)
    ]
  });


console.group();
prog.test(0, [
  [1, "edge", 2],
  [2, "edge", 1]
]);
console.groupEnd();
console.group();
prog.test(1, [
  [1, "edge", 2, 0, -1],
]);
console.groupEnd();

// prog
//   .block("Find all the tags.", ({find, record}) => {
//     let tag = find().tag;
//     return [
//       record("tiggedy-tag", {real: tag})
//     ];
//   })
//   .commit("Throw away click events", ({find, record}) => {
//     let click = find("click", "direct-target");
//     return [
//       //click.remove("tag")
//       click.remove("tag"),
//     ];
//   })

//   .commit("When we get a click, store it.", ({find, record}) => {
//     let app = find("app");
//     let click = find("click");
//     let fruit = click.fruit;

//     return [
//       app.remove("last").add("last", fruit.foo)
//     ]
//   })

//   .block("Draw the last guy.", ({find, record}) => {
//     let app = find("app");
//     let container = find("container");

//     return [
//       container.remove("children").add("children", record("div", {text: `fuckwit ${app.last}`}))
//     ];
//   })

// prog.test(0, [
//   [1, "tag", "app"],
//   [2, "tag", "container"],

//   [11, "tag", "kumquat"],
//   [11, "foo", "yo"],
//   [12, "tag", "kumquat"],
//   [12, "foo", "wut"],
//   [13, "tag", "kumquat"],
//   [13, "foo", "up"],
//   [14, "tag", "kumquat"],
//   [14, "foo", "dawg"],
// ]);

// prog.test(1, [
//   [3, "tag", "click"],
//   [3, "tag", "direct-target"],
//   [3, "fruit", 11],
// ]);

// prog.test(2, [
//   [4, "tag", "click"],
//   [4, "tag", "direct-target"],
//   [4, "fruit", 12],
// ])

// prog.test(3, [
//   [5, "tag", "click"],
//   [5, "tag", "direct-target"],
//   [5, "fruit", 13],
// ])

// prog.test(4, [
//   [6, "tag", "click"],
//   [6, "tag", "direct-target"],
//   [6, "fruit", 14],
// ])



//   .commit("When we get a click increment a counter", ({find, record}) => {
//     let counter = find("counter");
//     let click = find("click", "direct-target");
//     let count = counter.count;
//     10 > count;
//     return [
//       counter.remove("count", count).add("count", count + 1)
//     ];
//   })
//   // .block(":(", ({find, record}) => {
//   //   let click = find("click", "direct-target");
//   //   return [
//   //     record("foo", {click})
//   //   ];
//   // })

// console.log(prog);

// console.groupCollapsed("Test 0");
// prog.test(0, [
//   ["c", "tag", "counter"],
//   ["c", "count", 1]
// ]);
// console.groupEnd();

// console.log("#### Test 1");
// prog.test(1, [
//   ["event1", "tag", "click"],
//   ["event1", "tag", "direct-target"],
// ]);

// console.groupCollapsed("Test 2");
// prog.test(2, [
//   ["event2", "tag", "click"],
//   ["event2", "tag", "direct-target"],
// ]);
// console.groupEnd();
