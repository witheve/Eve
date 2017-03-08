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

      // .watch("Export records with active tags", ({find, lookup, record}) => {
      //   let {"active-tag": activeTag} = find("tag-browser/active-tag");
      //   let rec = find({tag: activeTag});
      //   let {attribute, value} = lookup(rec);
      //   return [
      //     rec.add("tag", "child-record").add(attribute, value)
      //   ];
    // })

      .watch("Export all records", ({find, lookup, choose, record}) => {
        let rec = find();
        let {attribute, value} = lookup(rec);
        // let [attrName] = choose(
        //   () => { attribute == "tag"; return "child-tag"; },
        //   () => attribute
        // );

        return [
          rec.add("tag", "child-record").add(attribute, value)
        ];
      })
      .asDiffs((diffs) => {
        let eavs:RawEAVC[] = [];
        for(let [e, a, v] of diffs.removes) {
          // @NOTE: this breaks tag-browser inspecting tag-browser
          if(a === "tag" && v !== "child-record") a = "child-tag";
          eavs.push([e, a, v, -1]);
        }
        for(let [e, a, v] of diffs.adds) {
          // @NOTE: this breaks tag-browser inspecting tag-browser
          if(a === "tag" && v !== "child-record") a = "child-tag";
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
    let {$style, $row, $column, $text, $elem} = UIWatcher.helpers;

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
      })
      // @FIXME: Work around for a bug that occurs when leaving a record open and then letting it be retracted and reasserted
      // .commit("When a tag button is clicked, clear any open child records", ({find, record}) => {
      //   let click = find("html/event/click");
      //   let {element} = click;
      //   element.tag == "tag-browser/tag";
      //   //let view = find("tag-browser/view");
      //   //view.target != element.target;

      //   let openChildren = find("tag-browser/record");
      //   openChildren.open;

      //   return [
      //     openChildren.remove("open")
      //   ];
      // });

    // Record
    prog
      .block("Record component (closed)", ({find, record}) => {
        let childRecord = find("tag-browser/record");

        return [
          childRecord.add({
            tag: "ui/column",
            style: record({border: "1px solid gray", margin: 10, padding: 10}),
            rec: childRecord.target,

            children: [
              record("ui/row", "tag-browser/record-header", {sort: 0, rec: childRecord.target}).add("children", [
                record("html/element", {tagname: "div", class: "hexagon"}),
                record("ui/text", {rec: childRecord.target, text: childRecord.target.displayName})
              ])
            ]
          })
        ];
      })

      .block("Record component (open)", ({find, lookup, record}) => {
        let childRecord = find("tag-browser/record", {open: "true"});
        let {attribute, value} = lookup(childRecord.target);
        attribute != "tag";
        return [
          childRecord.add({
            children: [
              record("tag-browser/record-attribute", {rec: childRecord.target, attr: attribute}).add("val", value)
            ]
          })
        ];
      })

      .commit("Clicking a record toggles it open/closed", ({find, choose}) => {
        let recordHeader = find("tag-browser/record-header");
        let record = find("tag-browser/record", {children: recordHeader});
        find("html/event/click", {element: recordHeader});
        let [open] = choose(
          () => { record.open == "true"; return "false"; },
          () => "true"
        )

        return [
          record.remove("open").add("open", open)
        ];
      });

    // Record Attribute

    prog
      .block("Record attribute component", ({find, choose, record}) => {
        let recordAttribute = find("tag-browser/record-attribute");

        let [attrName] = choose(
          () => { recordAttribute.attr == "child-tag"; return "tag"; },
          () => recordAttribute.attr
        );

        let {rec, val} = recordAttribute;
        return [
          recordAttribute.add({tag: "ui/row",
            children: [
              record("ui/text", {sort: 0, text: `${attrName}:`, rec, style: record({"margin-right": 10})}),
              record("ui/column", {sort: 1, rec, attrName}) // @FIXME: These attrs from the parent shouldn't need to be on the children.
                .add("children", record("tag-browser/record-value", {rec, attr: attrName, val}))
            ]
          })
        ];
      });

    // Record Value
    prog
      .block("Record value component (as tag)", ({find, record}) => {
        let recordValue = find("tag-browser/record-value");
        let {val} = recordValue;
        let childTag = find("child-tag", {"child-tag": val});
        return [
          recordValue.add({tag: "tag-browser/tag", target: val})
        ];
      })

      .block("Record value component (as record)", ({find, record}) => {
        let recordValue = find("tag-browser/record-value");
        let childRecord = find("child-record");
        childRecord == recordValue.val;
        return [
          recordValue.add({tag: "tag-browser/record", target: childRecord})
        ];
      })

      .block("Record value component (as raw value)", ({find, not, record}) => {
        let recordValue = find("tag-browser/record-value");
        // @FIXME: Not is *still* busted
        not(() => recordValue.tag == "tag-browser/tag");
        not(() => recordValue.tag == "tag-browser/record");
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
            style: record({"flex-wrap": "wrap", "align-items": "flex-start"}),
          }).add("children", record("tag-browser/record", {target: targetedRecord, "active-tag": view.target})))
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

    // Display Name aliasing
    prog
      .block("Alias display names", ({find, choose}) => {
        let record = find("child-record");
        let [name] = choose(
          //() => record.displayName,
          () => record.name,
          () => "???"
        );
        return [
          record.add("displayName", name)
        ];
      })

    // Create root UI
    let changes = collapse(
      $column({tag: t("root")}, [
        $row({tag: t("cloud"), style: $style({"flex-wrap": "wrap"})}, []),
        $column({tag: t("view")}, [])
      ]),

      $elem("html/element", {
        tagname: "style",
        text: `
          .hexagon {
            width: 22px;
            height: 22px;
            margin-right: 5px;
            vertical-align: middle;
            border-radius: 100px;
            border: 2px solid #AAA;
          }
        `
      })
    );
    let rootId = changes[0][0];
    let rootInstance = "root instance";
    changes.push(
      [rootInstance, "tag", "html/root"],
      [rootInstance, "tag", "html/instance"],
      [rootInstance, "element", rootId],
      [rootInstance, "tagname", "column"]
    );
    prog.inputEavs(changes);

    return prog;
  }
}

Watcher.register("tag browser", TagBrowserWatcher);
