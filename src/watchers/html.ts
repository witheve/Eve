import {Watcher, RawValue, RawEAV, RawEAVC} from "./watcher";
import {DOMWatcher, ElemInstance} from "./dom";
import {ID} from "../runtime/runtime";
import {v4 as uuid} from "node-uuid";

interface Instance extends HTMLElement {__element?: RawValue, __styles?: RawValue[], __sort?: RawValue}

class HTMLWatcher extends DOMWatcher<Instance> {
  tagPrefix = "html";

  createInstance(id:RawValue, element:RawValue, tagname:RawValue):Instance {
    let elem:Instance = document.createElement(tagname as string);
    elem.setAttribute("instance", (global as any).GlobalInterner.get(id));
    elem.setAttribute("element", (global as any).GlobalInterner.get(element));
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
    instance.setAttribute(attribute as string, value as string);
  }

  removeAttribute(instance:Instance, attribute:RawValue, value:RawValue):void {
    // @TODO: Error checking to ensure we don't double-remove attributes or remove the wrong value.
    instance.removeAttribute(attribute as string);
  }

  sentInputValues:{[element:string]: string[], [element:number]: string[]} = {};

  setup() {
    this.tagPrefix = "html"; // @FIXME: hacky, due to inheritance chain evaluation order.
    super.setup();

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
