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
            .eventer {background-color: #75507b;  width: 100px; height: 100px; margin: 25px; }
            .log {
              height: calc(100% - 200px); overflow: scroll; width: 500px;
              border: 1px solid #aaa; margin: 25px;
            }
            .input { width: 500px; margin: 25px; }
          `),
        record("html/div", {sort: 0, class: "eventer", on: [
          "mouseenter",
          "mouseleave",
          "dblclick",
          "click",
        ]}),
        record("html/input", {sort: 1, class: "input", on: [
          "input",
          "focus",
          "blur",
        ]}),
        record("html/div", "log", {sort: 2, class: "log"}),
      ])
    ];
  });

prog
  .commit("event handler", ({find, record}) => {
    let log = find("log");
    let event = find("dom/event");
    return [
      log.add("children", [
        record("html/div", {text: `${event.event} on <${event.element.tagname}>`, event}),
      ])
    ];
  });

prog
  .block("Translate elements into html", ({find, record}) => {
    let elem = find("html/div");
    return [elem.add("tag", "html/element").add("tagname", "div")];
  })
  .block("Translate elements into html", ({find, record}) => {
    let elem = find("html/input");
    return [elem.add("tag", "html/element").add("tagname", "input")];
  })
  .block("Translate elements into html", ({find, record}) => {
    let elem = find("html/style");
    return [elem.add("tag", "html/element").add("tagname", "style")];
  });


prog.inputEavs([ [1, "tag", "main"] ]);
