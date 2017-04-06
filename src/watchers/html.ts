import {Watcher, RawValue, RawEAV, RawEAVC, maybeIntern} from "./watcher";
import {DOMWatcher, ElemInstance} from "./dom";
import {ID} from "../runtime/runtime";
import {v4 as uuid} from "node-uuid";

export interface Instance extends HTMLElement {__element?: RawValue, __styles?: RawValue[], __sort?: RawValue, listeners?: {[event: string]: boolean}}

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
    if(attribute == "value") {
      if(instance.classList.contains("html-autosize-input") && instance instanceof HTMLInputElement) {
        instance.size = (instance.value || "").length || 1;
      }
      (instance as HTMLInputElement).value = ""+maybeIntern(value);
    } else if(attribute == "tag") {
      if(value === "html/autosize-input" && instance instanceof HTMLInputElement) {
        setImmediate(() => instance.size = (instance.value || "").length || 1);
      } else if(value === "html/trigger-focus" && instance instanceof HTMLInputElement) {
        setImmediate(() => instance.focus());
      } else {
        instance.setAttribute(attribute, ""+maybeIntern(value));
      }
    } else {
      instance.setAttribute(attribute as string, ""+maybeIntern(value));
    }
  }

  removeAttribute(instance:Instance, attribute:RawValue, value:RawValue):void {
    // @TODO: Error checking to ensure we don't double-remove attributes or remove the wrong value.
    instance.removeAttribute(attribute as string);
    if(attribute === "value") {
      let input = instance as HTMLInputElement;
      if(input.value === value) input.value = "";
    }
  }

  sentInputValues:{[element:string]: string[], [element:number]: string[]} = {};

  setup() {
    if(typeof window === "undefined") return;
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

    window.addEventListener("focus", (event) => {
      let target = event.target as (Instance & HTMLInputElement);
      let elementId = target.__element;
      if(elementId) {
        let eventId = uuid();
        let eavs:RawEAV[] = [
          [eventId, "tag", "html/event/focus"],
          [eventId, "element", elementId]
        ];
        if(target.value !== undefined) eavs.push([eventId, "value", target.value]);
        this._sendEvent(eavs);
      }
    }, true);

    window.addEventListener("blur", (event) => {
      let target = event.target as (Instance & HTMLInputElement);
      let elementId = target.__element;
      if(elementId) {
        let eventId = uuid();
        let eavs:RawEAV[] = [
          [eventId, "tag", "html/event/blur"],
          [eventId, "element", elementId]
        ];
        if(target.value !== undefined) eavs.push([eventId, "value", target.value]);
        this._sendEvent(eavs);
      }
    }, true);

    window.addEventListener("mouseover", (event) => {
      let {target} = event;
      if(!this.isInstance(target)) return;

      let eavs:(RawEAV|RawEAVC)[] = [];
      let current:Element|null = target;
      while(current && this.isInstance(current)) {
        let elemId = current.__element!;
        if(current.listeners && current.listeners["hover"]) {
          let eventId = uuid();
          eavs.push(
            [eventId, "tag", "html/event/hover-in"],
            [eventId, "element", elemId]
          );
          if(current === target) {
            eavs.push([eventId, "tag", "html/direct-target"]);
          }
        }
        current = current.parentElement;
      }

      if(eavs.length) this._sendEvent(eavs);
    }, true);

    window.addEventListener("mouseout", (event) => {
      let {target} = event;
      if(!this.isInstance(target)) return;

      let eavs:(RawEAV|RawEAVC)[] = [];
      let current:Element|null = target;
      while(current && this.isInstance(current)) {
        let elemId = current.__element!;
        if(current.listeners && current.listeners["hover"]) {
          let eventId = uuid();
          eavs.push(
            [eventId, "tag", "html/event/hover-out"],
            [eventId, "element", elemId]
          );
          if(current === target) {
            eavs.push([eventId, "tag", "html/direct-target"]);
          }
        }
        current = current.parentElement;
      }

      if(eavs.length) this._sendEvent(eavs);
    }, true);

    this.program
      .commit("Remove input-related events.", ({find, choose}) => {
        let [event] = choose(
          () => find("html/event/change"),
          () => find("html/event/focus"),
          () => find("html/event/blur")
        );
        event.tag;
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
      .commit("When an element is entered, mark it hovered.", ({find, record}) => {
        let {element} = find("html/event/hover-in");
        return [element.add("tag", "html/hovered")];
      })
      .commit("When an element is left, clear it's hovered.", ({find, record}) => {
        let {element} = find("html/event/hover-out");
        return [element.remove("tag", "html/hovered")];
      })

      .watch("When an element is hoverable, it subscribes to mouseover/mouseout", ({find, record}) => {
        let elemId = find("html/listener/hover");
        let instanceId = find("html/instance", {element: elemId});
        return [
          record({listener: "hover", elemId, instanceId})
        ]
      })
      .asObjects<{listener:string, elemId:ID, instanceId:RawValue}>(({adds, removes}) => {
        for(let e of Object.keys(adds)) {
          let {listener, elemId, instanceId} = adds[e];
          let instance = this.getInstance(instanceId)!;
          if(!instance.listeners) instance.listeners = {};
          instance.listeners[listener] = true;
        }
        for(let e of Object.keys(removes)) {
          let {listener, elemId, instanceId} = removes[e];
          let instance = this.getInstance(instanceId)
          if(!instance || !instance.listeners) continue;
          instance.listeners[listener] = false;
        }
      })

    this.program
      .commit("Remove hover-in events", ({find}) => {
        let event = find("html/event/hover-in");
        return [event.remove()];
      })
      .commit("Remove hover-out events", ({find}) => {
        let event = find("html/event/hover-out");
        return [event.remove()];
      });
  }
}

Watcher.register("html", HTMLWatcher);
