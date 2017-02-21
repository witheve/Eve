import {Program} from "../runtime/dsl2";
import "../watchers/system";

let prog = new Program("clock");
prog.attach("system");
prog.attach("svg");

// ~~~
// search @browser
//   hand = [#clock-hand degrees length]
//   x2 = 50 + (length * sin[degrees])
//   y2 = 50 - (length * cos[degrees])
// bind @browser
//   hand <- [#line, x1: 50, y1: 50, x2, y2]
// ~~~

// Draw a clock using SVG. We find the angle for each hand using time and let the `#clock-hand` block take care of the rest.

// ~~~
// search
//   [#time hours minutes seconds]
// bind @browser
//   [#svg viewBox: "0 0 100 100", width: "300px", children:
//     [#circle cx: 50, cy: 50, r: 45, fill: "#0B79CE"]
//     [#clock-hand #hour-hand degrees: 30 * hours, length: 30, stroke: "#023963"]
//     [#clock-hand #minute-hand degrees: 6 * minutes, length: 40, stroke: "#023963"]
//     [#clock-hand #second-hand degrees: 6 * seconds, length: 40, stroke: "#ce0b46"]]
// ~~~

prog.block("draw a clock", ({find, record}) => {
  let timer = find("clock-timer");
  return [
    record("svg", {viewBox: "0 0 100 100", width: "300px", timer}).add("children", [
      record("svg/circle", {cx:50, cy:50, r:45, fill:"#0b79ce"}),
      record("clock-hand", "hour-hand", {timer, length:30, stroke:"black"}).add("degrees", 30 * timer.hours),
      record("clock-hand", "minute-hand", {timer, length:40, stroke:"black"}).add("degrees", 6 * timer.minutes),
      record("clock-hand", "second-hand", {timer, length:40, stroke:"red"}).add("degrees", 6 * timer.seconds),
    ])
  ]
})

prog.block("draw clock hands", ({find, lib}) => {
  let {math} = lib;
  let hand = find("clock-hand");
  let x2 = 50 + hand.length * math.sin(hand.degrees)
  let y2 = 50 - hand.length * math.cos(hand.degrees)
  return [
    hand.add("tag", "svg/line")
        .add("x1", 50)
        .add("y1", 50)
        .add("x2", x2)
        .add("y2", y2)
  ]
})

prog
  .block("Translate elements into svg", ({find, record, union}) => {
    let elem = find("svg");
    return [elem.add("tag", "svg/element").add("tagname", "svg")];
  })
  .block("Translate elements into svg", ({find, record, union}) => {
    let elem = find("svg/circle");
    return [elem.add("tag", "svg/element").add("tagname", "circle")];
  })
  .block("Translate elements into svg", ({find, record, union}) => {
    let elem = find("svg/line");
    return [elem.add("tag", "svg/element").add("tagname", "line")];
  });

prog.test(1, [
  [1, "tag", "clock-timer"],
  [1, "tag", "system/timer"],
  [1, "resolution", 1000],
  [2, "tag", "clock-timer"],
  [2, "tag", "system/timer"],
  [2, "resolution", 5000],
  // [1, "hours", 10],
  // [1, "minutes", 10],
  // [1, "seconds", 10],
])

// prog.test(2, [
//   [1, "seconds", 10, 0, -1],
//   [1, "seconds", 11],
// ])

// prog.test(3, [
//   [1, "seconds", 11, 0, -1],
//   [1, "seconds", 12],
// ])
