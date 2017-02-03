import {Program} from "./runtime/dsl";
import {Watcher} from "./watchers/watcher";
import "./watchers/html";

let prog = new Program("test");
Watcher.attach("html", prog);

// prog.watch("simple block", ({find, record, lib}) => {
//   find({foo: "bar"});
//   return [
//     record("watch-result", {zomg: "baz"})
//   ]
// }).asDiffs("watch-result", (changes) => {
//   console.log(changes);
// });

prog.test(1, [
  [2, "tag", "html/element"],
  [2, "tagname", "div"],
  [2, "children", 3],

  [3, "tag", "html/element"],
  [3, "tagname", "floop"],
  [3, "text", "k"],
]);
