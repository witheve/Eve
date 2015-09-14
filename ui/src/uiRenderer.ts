/// <reference path="./microReact.ts" />
/// <reference path="./indexer.ts" />
/// <reference path="./api.ts" />
module uiRenderer {
  type Id = string;
  type RowTokeyFn = (row:{[key:string]: any}) => string;

  interface Element extends microReact.Element {
    __elemId:string
  }

  api.ixer.addIndex("ui parent to elements", "uiElement", Indexing.create.collector(["uiElement: parent"]));
  api.ixer.addIndex("ui element to attributes", "uiAttribute", Indexing.create.collector(["uiAttribute: element"]));
  api.ixer.addIndex("ui element to attribute bindings", "uiAttributeBinding", Indexing.create.collector(["uiAttributeBinding: element"]));

  export class UiRenderer {
    constructor(public renderer:microReact.Renderer) {

    }

    render(roots:(Id|Element)[]) {
      let elems = this.compile(roots);
      this.renderer.render(elems);
    }

    // @NOTE: In the interests of performance, roots will not be checked for ancestry --
    // instead of being a noop, specifying a child of a root as another root results in undefined behavior.
    // If this becomes a problem, it can be changed in the loop that initially populates compiledElements.
    compile(roots:(Id|Element)[]):microReact.Element[] {
      let elementToChildren = api.ixer.index("ui parent to elements", true);
      let elementToAttrs = api.ixer.index("ui element to attributes", true);
      let elementToAttrBindings = api.ixer.index("ui element to attribute bindings", true);

      let stack:Element[] = [];
      let compiledElements:microReact.Element[] = [];
      let compiledKeys:{[id:string]: string} = {};
      let keyToRow:{[key:string]: any} = {};
      for(let root of roots) {
        if(typeof root === "object") {
          compiledElements.push(<Element>root);
        } else if(typeof root === "string") {
          let fact = api.ixer.selectOne("uiElement", {element: root});
          let elem:Element = {__elemId: root, id: root};
          if(fact && fact["uiElement: parent"]) {
            elem.parent = fact["uiElement: parent"];
          }
          compiledElements.push(elem);
          stack.push(elem);
        }
      }

      while(stack.length > 0) {
        let elem = stack.shift();
        let elemId = elem.__elemId;

        let fact = api.ixer.selectOne("uiElement", {element: elemId});
        if(!fact) { continue; }
        let attrs = elementToAttrs[elemId];
        let boundAttrs = elementToAttrBindings[elemId];
        let children = elementToChildren[elemId];

        let elems = [elem];
        let binding = api.ixer.selectOne("uiElementBinding", {element: elemId});
        if(binding) {
          // If the element is bound, it must be repeated for each row.
          var boundView = binding["uiElementBinding: view"];
          var rowToKey = this.generateRowToKeyFn(boundView);
          let key = compiledKeys[elem.id];
          var boundRows = this.getBoundRows(boundView, key);
          elems = [];
          let ix = 0;
          for(let row of boundRows) {
             // We need an id unique per row for bound elements.
            elems.push({t: elem.t, parent: elem.id, id: `${elem.id}.${ix}`, __elemId: elemId});
            keyToRow[rowToKey(row)] = row;
            ix++;
          }
        }

        let rowIx = 0;
        for(let elem of elems) {
          // Get bound key and rows if applicable.
          let row, key;
          if(binding) {
            row = boundRows[rowIx];
            key = rowToKey(row);
          } else {
            key = compiledKeys[elem.id];
            row = keyToRow[key];
          }

          // Handle meta properties.
          elem.t = fact["uiElement: tag"];

          // Handle static properties.
          let properties = [];
          if(attrs) {
            for(let attr of attrs) {
              let {"uiAttribute: property": prop, "uiAttribute: value": val} = attr;
              properties.push(prop);
              elem[prop] = val;
            }
          }

          // Handle bound properties.
          if(boundAttrs) {
            for(let attr of boundAttrs) {
              let {"uiAttributeBinding: property": prop, "uiAttributeBinding: field": field} = attr;
              properties.push(prop);
              elem[prop] = row[field];
            }
          }

          // Prep children and add them to the stack.
          if(children) {
            elem.children = [];
            for(let child of children) {
              let childId = child["uiElement: element"];
              let childElem = {__elemId: childId, id: `${elem.id}__${childId}`};
              compiledKeys[childElem.id] = key;
              elem.children.push(childElem);
              stack.push(childElem);
            }
          }

          // Handle compiled element tags.
          let elementCompiler = elementCompilers[elem.t];
          if(elementCompiler) {
            elementCompiler(elem);
          }

          rowIx++;
        }

        if(binding) {
          elem.children = elems;
        }
      }

      return compiledElements;
    }

    // Generate a unique key for the given row based on the structure of the given view.
    generateRowToKeyFn(viewId:Id):RowTokeyFn {
      var keys = api.ixer.getKeys(viewId);
      if(keys.length > 1) {
        return (row:{}) => {
          return `${viewId}: ${keys.map((key) => row[key]).join(",")}`;
        };
      } else if(keys.length > 0) {
        return (row:{}) => {
          return `${viewId}: ${row[keys[0]]}`;
        }
      } else {
        return (row:{}) => `${viewId}: ${JSON.stringify(row)}`;
      }
    }

    // Get only the rows of view matching the key (if specified) or all rows from the view if not.
    getBoundRows(viewId:Id, key?:any): any[] {
      var keys = api.ixer.getKeys(viewId);
      if(key && keys.length === 1) {
        return api.ixer.select(viewId, {[api.code.name(keys[0])]: key});
      } else if(key && keys.length > 0) {
        let rowToKey = this.generateRowToKeyFn(viewId);
        return api.ixer.select(viewId, {}).filter((row) => rowToKey(row) === key);
      } else {
        return api.ixer.select(viewId, {});
      }
    }
  }

  export type ElementCompiler = (elem:microReact.Element) => void;
  export var elementCompilers:{[tag:string]: ElementCompiler} = {
    chart: (elem:ui.ChartElement) => {
      elem.pointLabels = (elem.pointLabels) ? [<any>elem.pointLabels] : elem.pointLabels;
      elem.ydata = (elem.ydata) ? [<any>elem.ydata] : [];
      elem.xdata = (elem.xdata) ? [<any>elem.xdata] : elem.xdata;
      ui.chart(elem);
    }
  };
  export function addElementCompiler(tag:string, compiler:ElementCompiler) {
    if(elementCompilers[tag]) {
      throw new Error(`Refusing to overwrite existing compilfer for tag: "${tag}"`);
    }
    elementCompilers[tag] = compiler;
  }
}