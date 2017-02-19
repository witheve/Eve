import {Program} from "../runtime/dsl2";
import {UIWatcher} from "../watchers/ui";

let {$style, $row, $column, $text} = UIWatcher.helpers;

function t(tag:string) {
  return `tag-browser/${tag}`;
}

function collapse<T extends any[]>(...args:T[]):T {
  let all:T = [] as any;
  for(let sublist of args) {
    for(let item of sublist) {
      all.push(item);
    }
  }
  return all;
}

export function create() {
  let prog = new Program("test");
  prog.attach("ui");

  // prog.commit("Remove click events!", ({find}) => {
  //   let click = find("html/event/click", "html/direct-target");
  //   return [
  //     //click.remove("tag")
  //     click.remove("tag"),
  //   ];
  // })

  prog.block("List all tags in the tag cloud.", ({find, record}) => {
    let cloud = find("tag-browser/cloud");
    let tag = find().tag;

    return [
      //record("html/element", {tagname: "span", text: "hey!", tag})
      cloud.add("children", record("ui/button", "tag-browser/tag", {class: "inset", text: tag, sort: tag}))
    ];
  });

  prog.commit("Do something with clicks in the tag cloud.", ({find, record}) => {
    let click = find("html/event/click");
    let {element} = click;
    element.tag == "tag-browser/tag";
    let view = find("tag-browser/view");

    return [
      view.remove("target").add("target", element.text)
    ];
  });

  prog.block("Show the targeted tag", ({find, record}) => {
    let view = find("tag-browser/view");
    let target = view.target;

    return [
      view.add("children", record("ui/text", {text: `hi ${target}`}))
    ]
  })

  console.groupCollapsed("setup");
  // Create root UI
  prog.test(0, collapse(
    $column({tag: t("root")}, [
      $row({tag: t("cloud"), style: $style({"flex-wrap": "wrap"})}, []),
      $column({tag: t("view")}, [])
    ])
  ));
  console.groupEnd();

  console.groupCollapsed();
  prog.test(1, [
    [1, "tag", "html/event/click"],
    [1, "tag", "html/direct-target"],
    [1, "element", "ui/button|tag-browser/tag|inset|ui/row|ui/row"],
  ]);
  console.groupEnd();

  console.groupCollapsed();
  prog.test(2, [
    [2, "tag", "html/event/click"],
    [2, "tag", "html/direct-target"],
    [2, "element", "ui/button|tag-browser/tag|inset|ui/column|ui/column"],
  ]);
  console.groupEnd();

  console.groupCollapsed();
  prog.test(3, [
   [3, "tag", "html/event/click"],
   [3, "tag", "html/direct-target"],
   [3, "element", "ui/button|tag-browser/tag|inset|ui/text|ui/text"],
  ]);
  console.groupEnd();

  console.groupCollapsed();
  prog.test(4, [
   [4, "tag", "html/event/click"],
   [4, "tag", "html/direct-target"],
   [4, "element", "ui/button|tag-browser/tag|inset|ui/column|ui/column"],
  ]);
  console.groupEnd();

  // Dummy fact to run the thing
  // prog.test(1, [
  //   ["dummy", "tag", "dum-dum"]
  // ]);



  // prog
  //   .test(0, ([] as any[]).concat(
  //     $column([
  //       $row([$text(1), $text(2)])
  //     ]),
  //     $column([
  //       $row([$text(3), $text(4)])
  //     ]),
  //   ));

  console.log(prog);

  return prog;
}
