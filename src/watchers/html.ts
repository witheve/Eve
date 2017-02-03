import {Watcher} from "./watcher";

class HTMLWatcher extends Watcher {
  setup() {
    this.program
      .watch("Elements with no parents are roots.", ({find, record, lib, not}) => {
        let elem = find("html/element");
        not(({find}) => {
          find("html/element", {children: elem});
        });
        return [
          record("html/root", {element: elem, tagname: elem.tagname})
        ];
      })
      .asDiffs("html/root", (changes) => {
        console.log("Diffs: (html/root)");
        console.log("  " + changes.join("\n  "));
      })
      .watch("Create an instance for each child of a parent.", ({find, record, lib, not}) => {
        let elem = find("html/element");
        let parent = find("html/element", {children: elem});

        return [
          record("html/instance", {element: elem, tagname: elem.tagname, parent})
        ];
      })
      .asDiffs("html/instance", (changes) => {
        console.log("Diffs: (html/instance)");
        console.log("  " + changes.join("\n  "));
      });

  }
}

Watcher.register("html", HTMLWatcher);
