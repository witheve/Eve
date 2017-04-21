import {Watcher, RawValue, RawEAV, RawEAVC} from "./watcher";
import {DOMWatcher, ElemInstance} from "./dom";

export interface Instance extends SVGElement {__element?: RawValue, __styles?: RawValue[], __sort?: RawValue}

export class SVGWatcher extends DOMWatcher<Instance> {
  tagPrefix = "svg";

  createInstance(id:RawValue, element:RawValue, tagname:RawValue):Instance {
    let elem:Instance = document.createElementNS("http://www.w3.org/2000/svg", tagname as string);
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
    // @TODO: Namespace attributes as appropriate.
    instance.setAttribute(attribute as string, value as string);
  }

  removeAttribute(instance:Instance, attribute:RawValue, value:RawValue):void {
    // @TODO: Namespace attributes as appropriate.
    instance.removeAttribute(attribute as string);
  }

  setup() {
    this.tagPrefix = "svg";
    super.setup();
  }
}

Watcher.register("svg", SVGWatcher);
