import {Watcher, RawValue, RawEAV, RawEAVC, maybeIntern, ObjectDiffs, createId} from "./watcher";
import {DOMWatcher, ElemInstance} from "./dom";
import {ID} from "../runtime/runtime";
import {v4 as uuid} from "node-uuid";

export interface Instance extends HTMLElement {__element?: RawValue, __styles?: RawValue[], __sort?: RawValue, listeners?: {[event: string]: boolean}}

export class HTMLWatcher extends DOMWatcher<Instance> {
  tagPrefix = "html";

  addExternalRoot(tag:string, element:HTMLElement) {
    let elemId = createId();
    let eavs:RawEAV[] = [
      [elemId, "tag", tag],
      [elemId, "tag", "html/root/external"]
    ];

    this.instances[elemId] = element;
    this._sendEvent(eavs);
  }

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
      } else if(value === "html/trigger-blur" && instance instanceof HTMLInputElement) {
        setImmediate(() => instance.blur());
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

  _addMouseEvent(eavs:(RawEAV|RawEAVC)[], tagname:string, event:MouseEvent, eventId:string) {
    eavs.push(
      [eventId, "tag", "html/event"],
      [eventId, "tag", `html/event/${tagname}`],
    );

    if(event.buttons & 1) eavs.push([eventId, "button", "left"]);
    if(event.buttons & 2) eavs.push([eventId, "button", "right"]);
    if(event.buttons & 4) eavs.push([eventId, "button", "middle"]);
    if(event.buttons & 8) eavs.push([eventId, "button", 4]);
    if(event.buttons & 16) eavs.push([eventId, "button", 5]);
  }

  //------------------------------------------------------------------
  // Event handlers
  //------------------------------------------------------------------

  _mouseEventHandler(tagname:string) {
    return (event:MouseEvent) => {
      let {target} = event;
      if(!this.isInstance(target)) return;

      let eavs:(RawEAV|RawEAVC)[] = [];
      let directEventId = uuid();
      let directElemId = target.__element!;
      this._addMouseEvent(eavs, tagname, event, directEventId);
      eavs.push(
        [directEventId, "element", directElemId],
        [directEventId, "tag", "html/direct-target"]
      );

      let current:Element|null = target.parentElement;
      let elemIds = [];
      while(current && this.isInstance(current)) {
        let elemId = current.__element!;
        elemIds.push(elemId);
        current = current.parentElement;
      }
      if(elemIds.length) {
        let eventId = uuid();
        this._addMouseEvent(eavs, tagname, event, eventId);
        for(let elemId of elemIds) {
          eavs.push([eventId, "element", elemId]);
        }
      }

      if(eavs.length) this._sendEvent(eavs);
    };
  }

  _captureContextMenuHandler() {
    return (event:MouseEvent) => {
      if(!(event.button & 2)) return;
      let captureContextMenu = false;
      let current:Element|null = event.target as Element;
      while(current && this.isInstance(current)) {
        if(current.listeners && current.listeners["context-menu"] === true) {
          captureContextMenu = true;
        }
        current = current.parentElement;
      }
      if(captureContextMenu && event.button === 2) {
        event.preventDefault();
      }
    };
  }

  _inputEventHandler(tagname:string) {
    return (event:Event) => {
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
          [eventId, "tag", "html/event"],
          [eventId, "tag", `html/event/${tagname}`],
          [eventId, "element", elementId],
          [eventId, "value", target.value]
        ];
        if(eavs.length) this._sendEvent(eavs);
      }
    }
  }

  _keyMap:{[key:number]: string|undefined} = { // Overrides to provide sane names for common control codes.
    9: "tab",
    13: "enter",
    16: "shift",
    17: "control",
    18: "alt",
    27: "escape",
    37: "left",
    38: "up",
    39: "right",
    40: "down",
    91: "meta"
  }
  _keyEventHandler(tagname:string, printable = false) {
    return (event:KeyboardEvent) => {
      if(event.repeat) return;
      let current:Element|null = event.target as Element;

      let code = event.keyCode;
      let key = this._keyMap[code];
      if(printable) {
        code = event.charCode;
        key = String.fromCharCode(code);
      }
      if(!key) return;

      let eventId = uuid();
      let eavs:(RawEAV|RawEAVC)[] = [
        [eventId, "tag", "html/event"],
        [eventId, "tag", `html/event/${tagname}`],
        [eventId, "key", key]
      ];

      while(current && this.isInstance(current)) {
        let elemId = current.__element!;
        eavs.push([eventId, "element", elemId]);
        current = current.parentElement;
      };

      if(eavs.length) this._sendEvent(eavs);
    };
  }

  _focusEventHandler(tagname:string) {
    return (event:FocusEvent) => {
      let target = event.target as (Instance & HTMLInputElement);
      let elementId = target.__element;
      if(elementId) {
        let eventId = uuid();
        let eavs:RawEAV[] = [
          [eventId, "tag", "html/event"],
          [eventId, "tag", `html/event/${tagname}`],
          [eventId, "element", elementId]
        ];
        if(target.value !== undefined) eavs.push([eventId, "value", target.value]);
        if(eavs.length) this._sendEvent(eavs);
      }
    }
  }

  _hoverEventHandler(tagname:string) {
    return (event:MouseEvent) => {
      let {target} = event;
      if(!this.isInstance(target)) return;

      let eavs:(RawEAV|RawEAVC)[] = [];
      let elemId = target.__element!;
      if(target.listeners && target.listeners["hover"]) {
        let eventId = uuid();
        eavs.push(
          [eventId, "tag", "html/event"],
          [eventId, "tag", "html/event/${tagname}"],
          [eventId, "element", elemId]
        );
      }

      if(eavs.length) this._sendEvent(eavs);
    };
  }

  //------------------------------------------------------------------
  // Watcher handlers
  //------------------------------------------------------------------

  exportListeners({adds, removes}:ObjectDiffs<{listener:string, elemId:ID, instanceId:RawValue}>) {
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
  }


  //------------------------------------------------------------------
  // Setup
  //------------------------------------------------------------------

  setup() {
    if(typeof window === "undefined") return;
    this.tagPrefix = "html"; // @FIXME: hacky, due to inheritance chain evaluation order.
    super.setup();

    this.program
      .bind("All html elements add their tags as classes", ({find, lib:{string}, record}) => {
        let element = find("html/element");
        element.tag != "html/element"
        let klass = string.replace(element.tag, "/", "-");
        return [
          element.add("class", klass)
        ];
      });

    window.addEventListener("click", this._mouseEventHandler("click"));
    window.addEventListener("dblclick", this._mouseEventHandler("double-click"));
    window.addEventListener("mousedown", this._mouseEventHandler("mouse-down"));
    window.addEventListener("mouseup", this._mouseEventHandler("mouse-up"));
    window.addEventListener("contextmenu", this._captureContextMenuHandler());

    window.addEventListener("input", this._inputEventHandler("change"));
    window.addEventListener("keydown", this._keyEventHandler("key-press"));
    window.addEventListener("keypress", this._keyEventHandler("key-press", true));

    window.addEventListener("focus", this._focusEventHandler("focus"), true);
    window.addEventListener("blur", this._focusEventHandler("blur"), true);


    document.body.addEventListener("mouseenter", this._hoverEventHandler("hover-in"), true);
    document.body.addEventListener("mouseleave", this._hoverEventHandler("hover-out"), true);

    this.program
      .bind("Create an instance for each child of an external root.", ({find, record, lib, not}) => {
        let elem = find("html/element");
        let parent = find("html/root/external", {children: elem});
        return [
          record("html/instance", {element: elem, tagname: elem.tagname, parent}),
          parent.add("tag", "html/element")
        ];
      });

    this.program
      .commit("Remove html events.", ({find, choose}) => {
        let event = find("html/event");
        return [event.remove()];
      })
      .bind("Inputs with an initial but no value use the initial.", ({find, choose}) => {
        let input = find("html/element", {tagname: "input"});
        let [value] = choose(() => input.value, () => input.initial);
        return [input.add("value", value)]
      })
      .commit("Apply input value changes.", ({find}) => {
        let {element, value} = find("html/event/change");
        return [element.remove("value").add("value", value)];
      })

      .commit("When an element is entered, mark it hovered.", ({find, record}) => {
        let {element} = find("html/event/hover-in");
        return [element.add("tag", "html/hovered")];
      })
      .commit("When an element is left, clear it's hovered.", ({find, record}) => {
        let {element} = find("html/event/hover-out");
        return [element.remove("tag", "html/hovered")];
      })

      .watch("When an element is hoverable, it subscribes to mouseover/mouseout.", ({find, record}) => {
        let elemId = find("html/listener/hover");
        let instanceId = find("html/instance", {element: elemId});
        return [record({listener: "hover", elemId, instanceId})]
      })
      .asObjects<{listener:string, elemId:ID, instanceId:RawValue}>((diffs) => this.exportListeners(diffs))

      .watch("When an element listeners for context-menu, it prevents default on right click.", ({find, record}) => {
        let elemId = find("html/listener/context-menu");
        let instanceId = find("html/instance", {element: elemId});
        return [record({listener: "context-menu", elemId, instanceId})]
      })
      .asObjects<{listener:string, elemId:ID, instanceId:RawValue}>((diffs) => this.exportListeners(diffs));
  }
}

Watcher.register("html", HTMLWatcher);
