import {Watcher, RawValue, RawEAV, RawEAVC, maybeIntern} from "./watcher";
import {DOMWatcher, ElemInstance} from "./dom";
import {ID} from "../runtime/runtime";
import {v4 as uuid} from "node-uuid";

interface Instance extends HTMLElement {__element?: RawValue, __styles?: RawValue[], __sort?: RawValue}

export class HTMLWatcher extends DOMWatcher<Instance> {
  tagPrefix = "html";

  createInstance(id:RawValue, element:RawValue, tagname:RawValue):Instance {
    let elem:Instance = document.createElement(tagname as string);
    elem.setAttribute("instance", ""+maybeIntern(id));
    elem.setAttribute("element", ""+maybeIntern(element));
    elem.__element = element;
    elem.__styles = [];
    return elem;
  }

  createRoot(id:RawValue):Instance {
    let elem = this.instances[id];
    if(!elem) throw new Error(`Orphaned instance '${id}'`);
    document.body.appendChild(elem);
    return elem;
  }

  addAttribute(instance:Instance, attribute:RawValue, value:RawValue):void {
    // @TODO: Error checking to ensure we don't double-set attributes.
    instance.setAttribute(attribute as string, ""+maybeIntern(value));
    if(attribute == "value" && instance.classList.contains("html-autosize-input") && instance instanceof HTMLInputElement) {
      instance.size = (instance.value || "").length || 1;
    }
  }

  removeAttribute(instance:Instance, attribute:RawValue, value:RawValue):void {
    // @TODO: Error checking to ensure we don't double-remove attributes or remove the wrong value.
    instance.removeAttribute(attribute as string);
  }

  sentInputValues:{[element:string]: string[], [element:number]: string[]} = {};

  setup() {
    this.tagPrefix = "html"; // @FIXME: hacky, due to inheritance chain evaluation order.
    super.setup();

    this.program
      .block("All html elements add their tags as classes", ({find, lib:{string}, record}) => {
        let element = find("html/element");
        element.tag != "html/element"
        let klass = string.replace(element.tag, "/", "-");
        return [
          element.add("class", klass)
        ];
      });

    window.addEventListener("click", (event) => {
      let {target} = event;
      if(!this.isInstance(target)) return;

      let eavs:(RawEAV|RawEAVC)[] = [];
      let current:Element|null = target;
      while(current && this.isInstance(current)) {
        let elemId = current.__element!;
        let eventId = uuid();

        eavs.push(
          [eventId, "tag", "html/event/click"],
          [eventId, "element", elemId]
        );
        if(current === target) {
          eavs.push([eventId, "tag", "html/direct-target"]);
        }
        current = current.parentElement;
      }

      this._sendEvent(eavs);
    });

    window.addEventListener("input", (event) => {
      let target = event.target as (Instance & HTMLInputElement);
      let elementId = target.__element;
      if(elementId) {
        if(target.classList.contains("html-autosize-input")) {
          target.size = target.value.length || 1;
        }
        let {sentInputValues} = this;
        if(!sentInputValues[elementId]) {
          sentInputValues[elementId] = [];
        }
        sentInputValues[elementId].push(target.value);
        let eventId = uuid();
        let eavs:RawEAV[] = [
          [eventId, "tag", "html/event/change"],
          [eventId, "element", elementId],
          [eventId, "value", target.value]
        ];
        this._sendEvent(eavs);
      }
    });

    this.program
      .commit("Remove change events.", ({find}) => {
        let event = find("html/event/change");
        return [event.remove()];
      })
      .block("Inputs with an initial but no value use the initial.", ({find, choose}) => {
        let input = find("html/element", {tagname: "input"});
        let [value] = choose(() => input.value, () => input.initial);
        return [input.add("value", value)]
      })
      .commit("Apply input value changes.", ({find}) => {
        let {element, value} = find("html/event/change");
        return [element.remove("value").add("value", value)];
      });


    this.program
      .watch("setup onmouseenter", ({find, record}) => {
        let elemId = find("html/onmouseenter");
        let instanceId = find("html/instance", {element: elemId});
        return [
          record({elemId, instanceId})
        ]
      })
      .asObjects<{elemId:ID, instanceId:RawValue}>(({adds, removes}) => {
        Object.keys(adds).forEach((id) => {
          let {elemId, instanceId} = adds[id];
          // instanceId couldn't be undefined because we've found it in .watch() above
          let instance = this.getInstance(instanceId)!;
          instance.addEventListener("mouseenter", () => {
            let changes:any[] = [];
            let eventId = uuid();
            changes.push(
              [eventId, "tag", "html/event/mouseenter"],
              [eventId, "element", elemId],
            );
            this._sendEvent(changes);
          });
        })
      })
      .watch("setup onmouseleave", ({find, record}) => {
        let elemId = find("html/onmouseleave");
        let instanceId = find("html/instance", {element: elemId});
        return [
          record({elemId, instanceId})
        ]
      })
      .asObjects<{elemId:ID, instanceId:RawValue}>(({adds, removes}) => {
        Object.keys(adds).forEach((id) => {
          let {elemId, instanceId} = adds[id];
          // instanceId couldn't be undefined because we've found it in .watch() above
          let instance = this.getInstance(instanceId)!;
          instance.addEventListener("mouseleave", () => {
            let changes:any[] = [];
            let eventId = uuid();
            changes.push(
              [eventId, "tag", "html/event/mouseleave"],
              [eventId, "element", elemId],
            );
            this._sendEvent(changes);
          });
        })
      });

    this.program
      .commit("Remove mouseenter events", ({find}) => {
        let event = find("html/event/mouseenter");
        return [
          event.remove("tag"),
        ];
      })
      .commit("Remove mouseleave events", ({find}) => {
        let event = find("html/event/mouseleave");
        return [
          event.remove("tag"),
        ];
      });
  }
}

Watcher.register("html", HTMLWatcher);
