import {Watcher, RawValue, RawEAV, RawEAVC} from "./watcher";
import {DOMWatcher, ElemInstance} from "./dom";

interface Instance extends SVGElement {__element?: RawValue, __styles?: RawValue[], __sort?: RawValue}


class SVGWatcher extends DOMWatcher<Instance> {
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
    this.program
      .bind("Decorate a svg roots as html.", ({find}) => {
        let elem = find("svg/root");
        return [elem.add({tag: "svg/element", tagname: "svg"})];
      })
      .bind("Decorate line as svg.", ({find}) => {
        let elem = find("svg/line");
        return [elem.add({tag: "svg/element", tagname: "line"})];
      })
      .bind("Decorate circle as svg.", ({find}) => {
        let elem = find("svg/circle");
        return [elem.add({tag: "svg/element", tagname: "circle"})];
      })
      .bind("Decorate rect as svg.", ({find}) => {
        let elem = find("svg/rect");
        return [elem.add({tag: "svg/element", tagname: "rect"})];
      })
      .bind("Decorate text as svg.", ({find}) => {
        let elem = find("svg/text");
        return [elem.add({tag: "svg/element", tagname: "text"})];
      })
      .bind("Decorate image as svg.", ({find}) => {
        let elem = find("svg/image");
        return [elem.add({tag: "svg/element", tagname: "image"})];
      });
  }
}

Watcher.register("svg", SVGWatcher);
