import {Program} from "../watchers/watcher";

let prog = new Program("test");
prog.attach("canvas");

prog.block("Simple canvas renderer test", ({find, record}) => {
  let turtle = find("turtle");
  return [
    record("canvas/root", {width: 600, height: 400}).add("children", [
      record("canvas/path", {sort: 1}).add("children", [
        record({sort: 1, type: "rect", x: 15, y: 5, width: 50, height: 75}),
        record({sort: 1, type: "ellipse", x: 65, y: 50, radiusX: 25, radiusY: 50, rotation: 0, startAngle: 0, endAngle: 3.14 * 3 / 4, anticlockwise: "false"})
      ])
    ])
  ];
})

prog.inputEavs([
  ["dummy", "tag", "turtle"]
]);

// prog.test(0, [
//   [1, "tag", "canvas/root"],
//   [1, "width", 600],
//   [1, "height", 400],
//   [1, "children", 2],
//   [2, "tag", "canvas/path"],
//   [2, "sort", 1],
//   [2, "children", 3],
//   [3, "type", "rect"],
//   [3, "sort", 1],
//   [3, "x", 10],
//   [3, "y", 0],
//   [3, "width", 20],
//   [3, "height", 50],

//   [2, "children", 4],
//   [4, "type", "rect"],
//   [4, "sort", 2],
//   [4, "x", 40],
//   [4, "y", 30],
//   [4, "width", 50],
//   [4, "height", 50]
// ])
