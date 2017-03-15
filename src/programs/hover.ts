import {Program} from "../runtime/dsl2";
import "../watchers/system";

let prog = new Program("hover");
prog.attach("system");
prog.attach("html");

prog
  .block("Top level div", ({find, record}) => {
    let main = find("main");

    return [
      main.add("children", [
        record("html/style")
          .add("text", `
            div { width: 100px; height: 100px; margin: 25px; }
            .effect.visible { opacity: 1; }
            .cause { background-color: #75507b; }
            .effect { background-color: #8f5902; opacity: 0; }
          `),
        record("html/div", {sort: 0})
          .add("class", "cause")
          .add("on", "mouseenter")
          .add("on", "mouseleave"),
        record("html/div", {sort: 1})
          .add("class", "effect")
          .add("tag", "effect")
      ])
    ];
  });

prog
  .commit("mouseenter", ({find, record}) => {
    let elem = find("effect");
    let event = find("dom/event", {event: "mouseenter"});
    return [
      elem.add("class", "visible")
    ];
  });

prog
  .commit("mouseleave", ({find, record}) => {
    let elem = find("effect");
    let event = find("dom/event", {event: "mouseleave"});
    return [
      elem.remove("class", "visible")
    ];
  });

prog
  .block("Translate elements into html", ({find, record}) => {
    let elem = find("html/div");
    return [elem.add("tag", "html/element").add("tagname", "div")];
  })
  .block("Translate elements into html", ({find, record}) => {
    let elem = find("html/style");
    return [elem.add("tag", "html/element").add("tagname", "style")];
  });


prog.inputEavs([ [1, "tag", "main"] ]);
