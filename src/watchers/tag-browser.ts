import {Watcher, Program, RawMap, RawValue, RawEAVC} from "./watcher";
import {v4 as uuid} from "node-uuid";

import {UIWatcher} from "../watchers/ui";

interface Attrs extends RawMap<RawValue> {}

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

export class TagBrowserWatcher extends Watcher {
  browser:Program = this.createTagBrowser();

  setup() {
    this.program
      .watch("Export all tags", ({find, record}) => {
        let rec = find();
        return [
          record("child-tag", {"child-tag": rec.tag})
        ];
      })
      .asDiffs((diffs) => {
        let eavs:RawEAVC[] = [];
        for(let [e, a, v] of diffs.removes) {
          eavs.push([e, a, v, -1]);
        }
        for(let [e, a, v] of diffs.adds) {
          eavs.push([e, a, v, 1]);
        }
        if(eavs.length) {
          this.browser.inputEavs(eavs);
        }
      })

      .watch("Export records with active tags", ({find, lookup, record}) => {
        let {"active-tag": activeTag} = find("tag-browser/active-tag");
        let rec = find({tag: activeTag});
        let {attribute, value} = lookup(rec);
        return [
          rec.add("tag", "child-record").add(attribute, value)
        ];
      })
      .asDiffs((diffs) => {
        let eavs:RawEAVC[] = [];
        for(let [e, a, v] of diffs.removes) {
          if(a === "tag" && v !== "child-record") a = "child-tag"; // @NOTE: this breaks tag-browser inspecting tag-browser :/
          eavs.push([e, a, v, -1]);
        }
        for(let [e, a, v] of diffs.adds) {
          if(a === "tag" && v !== "child-record") a = "child-tag"; // @NOTE: this breaks tag-browser inspecting tag-browser :/
          eavs.push([e, a, v, 1]);
        }
        if(eavs.length) {
          this.browser.inputEavs(eavs);
        }
      })
  }

  createTagBrowser() {
    let prog = new Program("Tag Browser");
    prog.attach("ui");
    let {$style, $row, $column, $text} = UIWatcher.helpers;

    //--------------------------------------------------------------------
    // Custom UI Components
    //--------------------------------------------------------------------

    // Tag Button
    prog
      .block("Tag button component", ({find, record}) => {
        let tagButton = find("tag-browser/tag");
        let tag = tagButton.target;
        return [
          tagButton.add({tag: "ui/button", class: "inset", text: tag, sort: tag})
        ];
      })
      .commit("When a tag button is clicked, update the view target.", ({find, record}) => {
        let click = find("html/event/click");
        let {element} = click;
        element.tag == "tag-browser/tag";
        let view = find("tag-browser/view");

        return [
          view.remove("target").add("target", element.target)
        ];
      });

    // Record
    prog
      .block("Record component", ({find, lookup, record}) => {
        let childRecord = find("tag-browser/record");
        let {attribute, value} = lookup(childRecord.target);
        attribute != "tag";
        return [
          childRecord.add({
            tag: "ui/column",
            style: record({border: "1px solid gray", margin: 10, padding: 10}),
            children: [
              record("tag-browser/record-attribute", {rec: childRecord.target, attr: attribute}).add("val", value)
            ]
          })
        ];
      });

    // Record Attribute

    prog
      .block("Record attribute component", ({find, choose, record}) => {
        let recordAttribute = find("tag-browser/record-attribute");

        // @FIXME: A bug in the choose impl requires us to search for attribute in the branches to use it.
        let [attrName] = choose(
          () => { recordAttribute.attr == "child-tag"; return "tag"; },
          () => recordAttribute.attr
        );

        let {rec, val} = recordAttribute;
        return [
          recordAttribute.add({tag: "ui/row",
            children: [
              record("ui/text", {sort: 0, text: `${attrName}:`, style: record({"margin-right": 10})}),
              record("ui/column", {sort: 1, rec, attrName}) // @FIXME: These attrs from the parent shouldn't need to be on the children.
                .add("children", record("tag-browser/record-value", {rec, attr: attrName, val}))
            ]
          })
        ];
      });

    // Record Value
    prog
      // @FIXME: Enabling this block causes us to hang on tag navigation...

      // .block("Record value component (as tag)", ({find, record}) => {
      //   let recordValue = find("tag-browser/record-value");
      //   let {val} = recordValue;
      //   let childTag = find("child-tag", {"child-tag": val});
      //   return [
      //     recordValue.add({tag: "tag-browser/tag", target: val})
      //   ];
      // })

      .block("Record value component (as raw value)", ({find, not, record}) => {
        let recordValue = find("tag-browser/record-value");
        not(() => recordValue.tag == "tag-browser/tag");
        let {val} = recordValue;
        return [
          recordValue.add({tag: "ui/text", sort: val, text: val})
        ];
      })

    // Tag Cloud
    prog.block("List all tags in the tag cloud.", ({find, not, record}) => {
      let cloud = find("tag-browser/cloud");
      let rec = find("child-tag");
      let tag = rec["child-tag"];

      return [
        cloud.add("children", record("tag-browser/tag", {target: tag}))
      ];
    });

    // Tag View
    prog
      .block("Show the targeted tag", ({find, record}) => {
        let view = find("tag-browser/view");
        let target = view.target;

        return [
          view.add("children", record("ui/text", {text: `Current tag: ${target}`, sort: 0}))
        ]
      })
      .block("Show records with the targeted tag", ({find, not, record}) => {
        let view = find("tag-browser/view");
        let targetedRecord = find("child-record", {"child-tag": view.target});

        return [
          view.add("children", record("ui/row", {
            sort: 1,
            style: record({"flex-wrap": "wrap"}),
            children: [record("tag-browser/record", {target: targetedRecord})]
          }))
        ];
      })
      .watch("When the view target changes, mark it as the active tag in the child program", ({find, record}) => {
        let view = find("tag-browser/view");

        return [
          record("tag-browser/active-tag", {"active-tag": view.target})
        ];
      })
      .asDiffs((diffs) => {
        let eavs:RawEAVC[] = [];
        for(let [e, a, v] of diffs.removes) {
          eavs.push([e, a, v, -1]);
        }
        for(let [e, a, v] of diffs.adds) {
          eavs.push([e, a, v, 1]);
        }
        if(eavs.length) {
          this.program.inputEavs(eavs);
        }
      });

    // Create root UI
    prog.inputEavs(collapse(
      $column({tag: t("root")}, [
        $row({tag: t("cloud"), style: $style({"flex-wrap": "wrap"})}, []),
        $column({tag: t("view")}, [])
      ])
    ));

    return prog;
  }
}

Watcher.register("tag browser", TagBrowserWatcher);
