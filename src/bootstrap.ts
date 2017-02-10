import {Program} from "./runtime/dsl";
import {UIWatcher} from "./watchers/ui";

// let prog = new Program("test");
// prog.attach("html");

// prog
//   .block("simple block", ({find, record, lib}) => {
//     let person = find("P");
//     let potato = find("potato");
//     let nameElem;
//     return [
//       nameElem = record("html/element", {tagname: "span", text: person.name}),
//       record("html/element", {tagname: "section", potato}).add("child" + "ren", nameElem)
//     ]
//   });

// prog.test(0, [
//   [2, "tag", "html/element"],
//   [2, "tagname", "div"],
//   [2, "children", 3],
//   [2, "sort", 1],

//   [3, "tag", "html/element"],
//   [3, "tagname", "div"],
//   [3, "text", "Woo hoo!"],
//   [3, "style", 4],

//   [4, "color", "red"],
//   [4, "background", "pink"],

//   [5, "tag", "html/element"],
//   [5, "tagname", "column"],
//   [5, "style", 6],
//   [5, "children", 7],
//   [5, "sort", 3],

//   [6, "border", "3px solid green"],

//   [7, "tag", "html/element"],
//   [7, "tagname", "button"],
//   [7, "class", "button flat"],
//   [7, "text", "meep moop"],
//   [7, "style", 8],

//   [8, "margin", 10]
// ]);

// prog.test(1, [
//   [3, "style", 4, 0, -1]
// ]);

// prog.test(2, [
//   [3, "style", 4, 0, 1],
//   [4, "font-size", "4em"],
//   [4, "background", "pink", 0, -1]
// ]);

// prog.test(3, [
//   [8, "tag", "html/element"],
//   [8, "tagname", "div"],
//   [8, "style", 4],
//   [8, "text", "Jeff (from accounting)"],
//   [8, "sort", 0]
// ]);

// prog
//   .test(0, [
//     [1, "tag", "P"],
//     [1, "name", "Jeff"],

//     [2, "tag", "P"],
//     [2, "name", "KERY"],

//     [3, "tag", "P"],
//     [3, "name", "RAB"],

//     [4, "tag", "potato"],
//     [4, "kind", "idaho"],

//     [5, "tag", "potato"],
//     [5, "kind", "irish gold"],

//   ]);

// prog
//   .test(1, [
//     [1, "tag", "P", 0, -1],
//     [2, "tag", "P", 0, -1]

//   ]);

// prog
//  .test(2, [
//    [1, "tag", "P", 0, 1],
//  ]);

let prog = new Program("test");
prog.attach("ui");
let {$text, $row, $column} = UIWatcher.helpers;

prog
  .test(0, ([] as any[]).concat(
    $column([
      $row([$text(1), $text(2)])
    ]),
    $column([
      $row([$text(3), $text(4)])
    ]),

    // [1, "tag", "ui/column"],
    // [1, "children", 2],
    // [1, "children", 5],

    // [2, "tag", "ui/row"],
    // [2, "children", 3],
    // [2, "children", 4],

    // [3, "tag", "ui/text"],
    // [3, "text", 3],
    // [4, "tag", "ui/text"],
    // [4, "text", 4],

    // [5, "tag", "ui/row"],
    // [5, "children", 6],
    // [5, "children", 7],

    // [6, "tag", "ui/text"],
    // [6, "text", "6"],
    // [7, "tag", "ui/text"],
    // [7, "text", 7],
  ));


console.log(prog);
