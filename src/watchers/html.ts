import {Watcher, RawValue, RawEAV, RawEAVC} from "./watcher";
import {DOMWatcher, ElemInstance} from "./dom";
import {v4 as uuid} from "node-uuid";

interface Instance extends HTMLElement {__element?: RawValue, __styles?: RawValue[], __sort?: RawValue}

class HTMLWatcher extends DOMWatcher<Instance> {
  tagPrefix = "html";

  createInstance(id:RawValue, tagname:RawValue):Instance {
    let elem:Instance = document.createElement(tagname as string);
    elem.__element = id;
    elem.__styles = [];
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
  }
}

Watcher.register("html", HTMLWatcher);
