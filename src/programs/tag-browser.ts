import {Program} from "../runtime/dsl";
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

  // Create root UI
  prog.test(0, collapse(
    $column({tag: t("root")}, [
      $row({tag: t("cloud"), style: $style({"flex-wrap": "wrap"})}, []),
      $column({tag: t("view")}, [])
    ])
  ));

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
      view.add("children", record("ui/text", {text: `heyoooo '${element.text}'`}))
    ];

  })

  // Dummy fact to run the thing
  prog.test(1, [
    ["dummy", "tag", "dum-dum"]
  ]);



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
