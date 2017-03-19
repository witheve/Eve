import {Program} from "../watchers/watcher";

let prog = new Program("test");
prog.attach("shape");

prog.block("Hexagon path", ({find, record}) => {
  let turtle = find("turtle");
  return [
    record("html/element", {tagname: "div"}).add("children", [
      record("canvas/root", {width: 400, height: 400}).add("children", [
        record("shape/hexagon-path", {
          sort: 1, x: 20, y: 20, side: 40,
          strokeStyle: "#4466FF", lineWidth: 6, lineJoin: "round"
        }),
      ])
    ])
  ];
})

prog.test(0, [
  ["dummy", "tag", "turtle"]
]);
