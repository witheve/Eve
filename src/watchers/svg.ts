import {Watcher, RawValue, RawEAV, RawEAVC} from "./watcher";
import {DOMWatcher, ElemInstance} from "./dom";

interface Instance extends SVGElement {__element?: RawValue, __styles?: RawValue[], __sort?: RawValue}


class SVGWatcher extends DOMWatcher<Instance> {
  tagPrefix = "svg";

  createInstance(id:RawValue, tagname:RawValue):Instance {
    let elem:Instance = document.createElementNS("http://www.w3.org/2000/svg", tagname as string);
    elem.__element = id;
    elem.__styles = [];
    return elem;
  }

  addAttribute(instance:Instance, attribute:RawValue, value:RawValue):void {
    // @TODO: Error checking to ensure we don't double-set attributes.
    instance.setAttributeNS("http://www.w3.org/2000/svg", attribute as string, value as string);
  }

  removeAttribute(instance:Instance, attribute:RawValue, value:RawValue):void {
    // @TODO: Error checking to ensure we don't double-remove attributes or remove the wrong value.
    instance.removeAttributeNS("http://www.w3.org/2000/svg", attribute as string);
  }

  setup() {
    this.tagPrefix = "svg";
    super.setup();
  }
}

Watcher.register("svg", SVGWatcher);
