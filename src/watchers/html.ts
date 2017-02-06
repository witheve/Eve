import {RawValue, RawChange} from "../runtime/runtime";
import {Watcher} from "./watcher";

interface Map<V>{[key:string]: V}

interface RawRecord extends Map<RawValue> {}

function accumulateChangesAs<T extends RawRecord>(changes:RawChange[]) {
  let adds:Map<T> = {};
  let removes:Map<T> = {};

  for(let {e, a, v, count} of changes) {
    if(count === 1) {
      let record = adds[e] = adds[e] || Object.create(null);
      if(record[a]) throw new Error("accumulateChanges supports only a single value per attribute.");
      record[a] = v;
    } else {
      let record = removes[e] = removes[e] || Object.create(null);
      if(record[a]) throw new Error("accumulateChanges supports only a single value per attribute.");
      record[a] = v;
    }
  }

  return {adds, removes};
}

interface Style extends Map<RawValue|undefined> {__size: number}
interface Instance extends HTMLElement {__element?: string}

class HTMLWatcher extends Watcher {
  styles:Map<Style|undefined> = Object.create(null);
  roots:Map<Instance|undefined> = Object.create(null);
  instances:Map<Instance|undefined> = Object.create(null);
  styleToInstances:Map<string[]|undefined> = Object.create(null);

  getStyle(id:string) {
    return this.styles[id] = this.styles[id] || {__size: 0};
  }

  getInstance(id:string, tagname:RawValue = "div"):Instance {
    if(this.roots[id]) return this.roots[id]!;
    return this.instances[id] = this.instances[id] || document.createElement(tagname as string);
  }

  clearInstance(id:string) {
    let instance = this.instances[id];
    if(instance && instance.parentElement) {
      instance.parentElement.removeChild(instance);
    }
    this.instances[id] = undefined;
  }

  getRoot(id:string, tagname:RawValue = "div"):Instance {
    return this.roots[id] = this.roots[id] || document.createElement(tagname as string);
  }

  clearRoot(id:string) {
    this.roots[id] = undefined;
  }

  insertChild(parent:Instance, child:Instance) {
    parent.appendChild(child);
  }

  setStyleAttribute(style:Style, attribute:string, value:RawValue, count:-1|1) {
    if(count === -1) {
      if(!style[attribute]) throw new Error(`Cannot remove non-existent attribute '${attribute}'`);
      if(style[attribute] !== value) throw new Error(`Cannot remove mismatched AV ${attribute}: ${value} (current: ${style[attribute]})`);
      style[attribute] = undefined;
    } else {
      if(style[attribute]) throw new Error(`Cannot add already present attribute '${attribute}'`);
      style[attribute] = value;
    }
    style.__size += count;
  }

  setup() {
    this.program
      .block("Elements with no parents are roots.", ({find, record, lib, not}) => {
        let elem = find("html/element");
        not(({find}) => {
          find("html/element", {children: elem});
        });
        return [
          record("html/root", "html/instance", {element: elem, tagname: elem.tagname})
        ];
      })
      .block("Create an instance for each child of a rooted parent.", ({find, record, lib, not}) => {
        let elem = find("html/element");
        let parentElem = find("html/element", {children: elem});
        let parent = find("html/instance", {element: parentElem});

        return [
          record("html/instance", {element: elem, tagname: elem.tagname, parent})
        ];
      })
      .watch("Export all instances.", ({find, record}) => {
        let instance = find("html/instance");
        return [
          record("html/instance", {tagname: instance.tagname, element: instance.element, instance})
        ];
      })
      .asDiffs("html/instance", (changes) => {
        // console.log("Diffs: (html/instance)");
        // console.log("  " + changes.join("\n  "));

        let diff = accumulateChangesAs<{tagname:string, element:string, instance:string}>(changes);
        for(let e of Object.keys(diff.removes)) {
          let {instance:instanceId} = diff.removes[e];
          this.clearInstance(instanceId);
        }
        for(let e of Object.keys(diff.adds)) {
          let {instance:instanceId, tagname, element} = diff.adds[e];
          let instance = this.getInstance(instanceId, tagname);
          instance.__element = element;
        }
      })

      .watch("Export roots.", ({find, record}) => {
        let root = find("html/root");
        return [
          record("html/root", {instance: root})
        ];
      })
      .asDiffs("html/root", (changes) => {
        // console.log("Diffs: (html/root)");
        // console.log("  " + changes.join("\n  "));

        for(let {e, a, v:rootId, count} of changes) {
          if(count === 1) {
            let root = this.roots[rootId] = this.getInstance(rootId);
            document.body.appendChild(root);
          } else {
            let root = this.roots[rootId];
            if(root && root.parentElement) {
              root.parentElement.removeChild(root);
            }
          }
        }
      })

      .watch("Export instance parents.", ({find, record}) => {
        let instance = find("html/instance");
        return [
          record("html/parent", {instance, parent: instance.parent})
        ];
      })
      .asDiffs("html/parent", (changes) => {
        // console.log("Diffs: (html/parent)");
        // console.log("  " + changes.join("\n  "));

        let diff = accumulateChangesAs<{instance:string, parent:string}>(changes);
        for(let e of Object.keys(diff.removes)) {
          let {instance:instanceId, parent:parentId} = diff.removes[e];
          if(this.instances[parentId]) {
            let instance = this.instances[instanceId];
            if(instance && instance.parentElement) {
              instance.parentElement.removeChild(instance);
            }
          }
        }
        for(let e of Object.keys(diff.adds)) {
          let {instance:instanceId, parent:parentId} = diff.adds[e];
          let instance = this.getInstance(instanceId);
          this.insertChild(this.getInstance(parentId), instance);
        }
      })

      .block("Records in the style attribute of an element are styles.", ({find, record, lib, not}) => {
        let elem = find("html/element");
        let style = elem.style;
        return [
          style.add("tag", "html/style")
        ];
      })
      .watch("Export html styles.", ({find, record, lib, not, lookup}) => {
        let style = find("html/style");
        let {attribute, value} = lookup(style);
        return [
          style.add("tag", "html/style")
            .add(attribute, value)
        ];
      })
      .asDiffs("html/style", (changes) => {
        // console.log("Diffs: (html/style)");
        // console.log("  " + changes.join("\n  "));

        let changed = [];
        for(let {e:styleId, a, v, count} of changes) {
          changed.push(styleId);
          let style = this.getStyle(styleId);
          this.setStyleAttribute(style, a, v, count);

          let instances = this.styleToInstances[styleId];
          if(instances) {
            for(let instanceId of instances) {
              let instance = this.getInstance(instanceId);
              instance.style[a] = style[a] as any;
            }
          }
        }

        for(let styleId of changed) {
          let style = this.getStyle(styleId);
          if(style.__size === 0) {
            this.styles[styleId] = undefined;
          }
        }
      })

      .watch("Export element attributes.", ({find, record, lookup}) => {
        let instance = find("html/instance");
        let elem = instance.element;
        let {attribute, value} = lookup(elem);
        return [
          instance
            .add("tag", "html/attribute")
            .add(attribute, value)
        ];
      })
      .asDiffs("html/attribute", (changes) => {
        // console.log("Diffs: (html/attribute)");
        // console.log("  " + changes.join("\n  "));

        for(let {e, a, v, count} of changes) {
          let instance = this.getInstance(e);
          if(a === "text") {
            instance.textContent = count > 0 ? v : undefined;

          } else if(a === "style") {
            this.styleToInstances[v] = e;
            let style = this.getStyle(v);
            for(let prop of Object.keys(style)) {
              if(prop === "__size") continue;
              instance.style[prop as any] = style[prop] as string;
            }

          } else if(a === "tagname") {
            if((""+v).toUpperCase() !== instance.tagName) {
              // handled by html/instance + html/root
              throw new Error("Unable to change element tagname.");
            }

          } else if(a === "children") {
            // Handled by html/parent

          } else {
            if(count === 1) {
              instance.setAttribute(a, v);
            } else {
              instance.removeAttribute(a);
            }
          }
        }
      });
    // console.log(this);
  }
}

Watcher.register("html", HTMLWatcher);
