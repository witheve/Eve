import {Program} from "../watchers/watcher";

let prog = new Program("test");
prog.attach("canvas");

prog.block("Simple canvas renderer test", ({find, record}) => {
  let turtle = find("turtle");
  return [
    record("html/element", {tagname: "div"}).add("children", [
      record("canvas/root", {width: 400, height: 400}).add("children", [
        record("canvas/path", {sort: 1, fillStyle: "#4444FF", strokeStyle: "#44FF44", lineCap: "round", lineJoin: "bevel"}).add("children", [
          record({sort: 1, type: "rect", x: 15, y: 5, width: 50, height: 75}),
          record({sort: 2, type: "ellipse", x: 65, y: 50, radiusX: 25, radiusY: 50, rotation: 0, startAngle: 0, endAngle: 3.14 * 3 / 4, anticlockwise: "false"})
        ]),
        record("canvas/path", {sort: 2, strokeStyle: "fuchsia", lineWidth: 4}).add("children", [
          record({sort: 1, type: "rect", x: 55, y:50, width: 20, height: 20})
        ])
      ])
    ])
  ];
})

prog.inputEavs([
  ["dummy", "tag", "turtle"]
]);
