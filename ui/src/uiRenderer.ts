/// <reference path="./microReact.ts" />
/// <reference path="./indexer.ts" />
/// <reference path="./api.ts" />
module uiRenderer {
  type Id = string;
  type RowTokeyFn = (row:{[key:string]: any}) => string;

  api.ixer.addIndex("uiParentToElements", "uiComponentElement", Indexing.create.collector(["uiComponentElement: component"]));
  api.ixer.addIndex("uiElementToAttributes", "uiComponentAttribute", Indexing.create.collector(["uiComponentAttribute: id"]));
  api.ixer.addIndex("uiElementToAttrBindings", "uiAttrBinding", Indexing.create.collector(["uiAttrBinding: elementId"]));

  export class uiRenderer {
    constructor(public renderer:microReact.Renderer) {

    }

    // @NOTE: In the interests of performance, roots will not be checked for ancestry --
    // instead of being a noop, specifying a child of a root as another root results in undefined behavior.
    // If this becomes a problem, it can be changed in the loop that initially populates compiledElements.
    compile(roots:Id[]):microReact.Element[] {
      let elementToChildren = api.ixer.index("uiParentToElements");
      let elementToAttrs = api.ixer.index("uiElementToAttributes");
      let elementToAttrBindings = api.ixer.index("uiElementToAttrBindings");

      let compiledElements:{[id:string]: microReact.Element} = {};
      let compiledKeys:{[id:string]: string} = {};
      let boundRows:{[key:string]: any} = {};
      for(let root of roots) {
        compiledElements[root] = {};
      }

      let stack = roots.slice();
      while(stack.length > 0) {
        let elemId = stack.shift();
        let elem = compiledElements[elemId];
        let key = compiledKeys[elemId];

        // Handle denormalized properties. @FIXME: Position has to get normalized for flow to work.
        let fact = api.ixer.selectOne("uiComponentElement", {id: elemId});
        let {
          "uiComponentElement: left": left,
          "uiComponentElement: top": top,
          "uiComponentElement: right": right,
          "uiComponentElement: bottom": bottom
        } = fact;

        // Handle normalized properties.
        let attrs = elementToAttrs[elemId];
        for(let attr of attrs) {
          let {"uiComponentAttribute: property":prop, "uiComponentAttribute: value":val} = attr;
          // Handle any unique properties here.
          let propertyCompiler = propertyCompilers[prop];
          if(propertyCompiler) {
            propertyCompiler(elem, val, prop);
          } else {
            elem[prop] = val;
          }
        }

        // Handle bound properties.
        let boundAttrs = elementToAttrBindings[elemId];
        if(boundAttrs) {
          let row = boundRows[key];
          for(let attr of boundAttrs) {
            let {"uiAttrBinding: attr":prop, "uiAttrBinding: field":field} = attr;
            elem[prop] = row[field];
          }
        }

        // Prep children and add them to the stack.
        let childrenIds = elementToChildren[elemId];
        let children = elem.children = [];
        let binding = api.ixer.selectOne("uiGroupBinding", {group: elemId});
        if(binding) {
          // If the element is bound, the children must be repeated for each row.
          let boundView = binding["uiGroupBinding: view"];
          let rowToKey = this.generateRowToKeyFn(boundView);
          let boundRows = this.getBoundRows(boundView, key);
          let rowIx = 0;
          for(let row of boundRows) {
            let childKey = rowToKey(row);
            boundRows[childKey] = row;
            for(let childTemplateId of childrenIds) {
              let childId = `${childTemplateId}.${rowIx}`;
              let childElem = {parent: elemId, debug: `${elemId} - ${childId}`};
              compiledKeys[childId] = childKey;
              compiledElements[childId] = childElem;
              children.push(childElem);
              stack.push(childId);
            }
            rowIx++;
          }
        } else {
          // Otherwise insert them with their parents key to enable intermediate nesting.
          let key = compiledKeys[elemId];
          for(let childId of childrenIds) {
            let childElem = {parent: elemId, debug: `${elemId} - ${childId}`};
            compiledKeys[childId] = key;
            compiledElements[childId] = childElem;
            children.push(childElem);
            stack.push(childId);
          }
        }

        // Run elements through elementCompilers based on tag.
        // Match UITK components up to unique tags.
      }

      return roots.map((root) => compiledElements[root]);
    }

    // Generate a unique key for the given row based on the structure of the given view.
    generateRowToKeyFn(viewId:Id):RowTokeyFn {
      var keys = api.ixer.getKeys(viewId);

      if(keys.length > 1) {
        return (row:{}) => {
          return `${viewId}: ${row[keys[0]]}`;
        }
      } else if(keys.length > 0) {
        return (row:{}) => {
          return `${viewId}: ${keys.map((key) => row[key]).join(",")}`;
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

  export type PropertyCompiler = (elem:microReact.Element, val:any, prop:string) => void;
  export var propertyCompilers:{[property:string]:PropertyCompiler} = {};

  export function addPropertyCompiler(prop:string, compiler:PropertyCompiler) {
    if(propertyCompilers[prop]) {
      throw new Error(`Refusing to overwrite existing compiler for property: "${prop}"`);
    }
    propertyCompilers[prop] = compiler;
  }
}