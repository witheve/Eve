import {Program, appendAsEAVs} from "../watchers/watcher";

let prog = new Program("test");
prog.attach("system");
prog.attach("shape");

// prog.commit("Commit the most recent seconds", ({find}) => {
//   let turtle = find("turtle");
//   let {seconds} = find("my-timer");
//   return [turtle.remove("seconds").add("seconds", seconds)];
// })

prog.block("Hexagon path", ({find, lib:{math}, choose, record}) => {
  let turtle = find("turtle");
  let {frame} = find("my-timer");
  let adjust = math.mod(frame, 400) / 20;

  return [
    record("html/element", {tagname: "div"}).add("children", [
      record("canvas/root", {width: 400, height: 400}).add("children", [
        record("shape/square-path", {sort: 1, x: 20, y: 20, side: 40 + 100, fillStyle: "#404040"}),
        record("shape/hexagon-path", {
          sort: 2, x: 20, y: 20, side: 40 + adjust,
          strokeStyle: "#4466FF", lineWidth: 6, lineJoin: "round"
        })
      ])
    ])
  ];
})

prog.block("simple hexagon container", ({find, record}) => {
  let turtle = find("turtle");
  return [
    record("html/element", {tagname: "div"}).add("children", [
      record("shape/hexagon", {side: 50, strokeStyle: "red", fillStyle: "rgba(255, 0, 0, 0.5)", style: record({position: "absolute", left: 50, top: 100})}).add("content", [
        record("html/element", {tagname: "div", text: "sup dawg", style: record({display: "flex", "align-self": "center"})})
      ])
    ])
  ];
})

let changes:any[] = [
  ["dummy", "tag", "turtle"]
];
appendAsEAVs(changes, {tag:["my-timer", "system/timer"], resolution:16.666})
prog.inputEavs(changes);
