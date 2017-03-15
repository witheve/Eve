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

    this.program
      .watch("setup events", ({find, record, lookup}) => {
        let instance = find("html/instance");
        let {element} = instance;
        let {attribute, value: event} = lookup(element);
        attribute == "on";

        return [
          record({element, instance, event})
        ]
      })
      .asObjects<{element:ID, instance:RawValue, event:string}>(({adds, removes}) => {
        Object.keys(adds).forEach((id) => {
          let {instance, event, element} = adds[id];

          let domInstance = this.getInstance(instance)!;
          domInstance.addEventListener(event, () => {
            let changes:any[] = [];
            let eventId = uuid();
            changes.push(
              [eventId, "tag", "html/event"],
              [eventId, "event", event],
              [eventId, "element", element],
            );
            this._sendEvent(changes);
          });
        })
      });

    this.program
      .commit("Remove events", ({find}) => {
        let event = find("html/event");
        return [
          event.remove("tag"),
        ];
      })
  }
}

Watcher.register("html", HTMLWatcher);
