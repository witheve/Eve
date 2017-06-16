import {Watcher, RawValue, RawEAV, RawEAVC} from "./watcher";
import {DOMWatcher, ElemInstance} from "./dom";
import {HTMLWatcher} from "./html";

interface Instance extends SVGElement {__element?: RawValue, __styles?: RawValue[], __sort?: RawValue}


class SVGWatcher extends DOMWatcher<Instance> {
  tagPrefix = "svg";
  html:HTMLWatcher;

  createInstance(id:RawValue, element:RawValue, tagname:RawValue):Instance {
    let elem:Instance = document.createElementNS("http://www.w3.org/2000/svg", tagname as string);
    elem.__element = element;
    elem.__styles = [];
    return elem;
  }

  getInstance(id:RawValue):Instance|undefined {
    if(this.instances[id]) return this.instances[id];
    if(this.html.instances[id]) return this.html.instances[id] as any;
  }

  createRoot(id:RawValue) {
    // This is delegated to the HTML watcher for #svg/roots, and it's nonsensical to try to make any other svg element a root.
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
    this.html = this.program.attach("html") as HTMLWatcher;
    this.tagPrefix = "svg";
    super.setup();
    this.program
      .bind("Create an instance for each child of an svg/root.", ({find, record, lib}) => {
        let elem = find("svg/element");
        let parentElem = find("svg/root", {children: elem});
        let parent = find("html/instance", {element: parentElem});

        return [
          record("svg/instance", {element: elem, tagname: elem.tagname, parent})
        ];
      })

      .bind("Decorate a svg roots as html.", ({find}) => {
        let elem = find("svg/root");
        return [elem.add({tag: "html/element", tagname: "svg"})];
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
