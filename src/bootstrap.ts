// import {create} from "./programs/tag-browser";
// let prog = create();


import {Program} from "./runtime/dsl2";

let prog = new Program("foop");

prog
  .commit("Throw away click events", ({find, record}) => {
    let click = find("click", "direct-target");
    return [
      //click.remove("tag")
      click.remove("tag"),
    ];
  })
  .commit("When we get a click increment a counter", ({find, record}) => {
    let counter = find("counter");
    let click = find("click", "direct-target");
    let count = counter.count;
    10 > count;
    return [
      counter.remove("count", count).add("count", count + 1)
    ];
  })
  // .block(":(", ({find, record}) => {
  //   let click = find("click", "direct-target");
  //   return [
  //     record("foo", {click})
  //   ];
  // })

console.log(prog);

console.groupCollapsed("Test 0");
prog.test(0, [
  ["c", "tag", "counter"],
  ["c", "count", 1]
]);
console.groupEnd();

console.log("#### Test 1");
prog.test(1, [
  ["event1", "tag", "click"],
  ["event1", "tag", "direct-target"],
]);

console.groupCollapsed("Test 2");
prog.test(2, [
  ["event2", "tag", "click"],
  ["event2", "tag", "direct-target"],
]);
console.groupEnd();
