import {eve as ixer} from "./app";
import {Element} from "./microReact";
declare var DEBUG;
window["DEBUG"] = window["DEBUG"] || {};

// @FIXME: These should probably be unionized.
ixer.addTable("ui template", ["ui template: template", "ui template: parent", "ui template: ix"]);
ixer.addTable("ui template binding", ["ui template binding: template", "ui template binding: query"]);
ixer.addTable("ui attribute", ["ui attribute: template", "ui attribute: property", "ui attribute: value"]);
ixer.addTable("ui attribute binding", ["ui attribute binding: template", "ui attribute binding: property", "ui attribute binding: alias"]);
ixer.addTable("ui event", ["ui event: template", "ui event: event", "ui event: kind", "ui event: key"]);
ixer.addTable("ui event binding", ["ui event binding: template", "ui event binding: event", "ui event binding: kind", "ui event binding: alias"]);

interface UiWarning {
  "ui warning: template": string
  "ui warning: warning": string
}

export class UiRenderer {
  public compiled = 0;
  protected tagCompilers:{[tag: string]: (elem:Element) => void} = {};

  compile(roots:(string|Element)[]):Element[] {
    let compiledElems:Element[] = [];
    for(let root of roots) {
      // @TODO: reparent dynamic roots if needed.
      if(typeof root === "string") {
        let elems = this._compileWrapper(root, compiledElems.length);
        compiledElems.push.apply(compiledElems, elems);
        let base = ixer.findOne("ui template", {"ui template: template": root});
        if(!base) continue;
        let parent = base["ui template: parent"];
        if(parent) {
          for(let elem of elems) elem.parent = parent;
        }
      }
      else {
        if(!root.ix) root.ix = compiledElems.length;
        compiledElems.push(root);
      }
    }

    return compiledElems;
  }

  protected _compileWrapper(template:string, baseIx: number, boundAliases?:string[], bindingStack:any[] = []):Element[] {
    let elems = [];
    let insulated = false; // If the element is insulated, it will only have access to the aliases in boundAliases in a separate bindingStack.
    if(!boundAliases) boundAliases = this.getBoundAliases(bindingStack);
    else insulated = true;

    // Resolve bound aliases into constraints
    let constraints = {};
    for(let alias of boundAliases) constraints[alias] = this.getBoundValue(alias, bindingStack);
    if(insulated) bindingStack = [constraints];

    let binding = ixer.findOne("ui template binding", {"ui template binding: template": template});
    if(!binding) {
      elems[0] = this._compileElement(template, bindingStack);
      elems[0].ix = baseIx + (elems[0].ix || 0);
    } else {
      let boundQuery = binding["ui template binding: query"];
      let facts = this.getBoundFacts(boundQuery, constraints);
      let ix = 0;
      for(let fact of facts) {
        bindingStack.push(fact);
        let elem = this._compileElement(template, bindingStack, fact);
        bindingStack.pop();
        elem.ix = (elem.ix || 0);
        elems.push(elem);
      }
    }
    elems.sort((a, b) => a.ix - b.ix);
    let prevIx = undefined;
    for(let elem of elems) {
      elem.ix += baseIx;
      if(elem.ix === prevIx) elem.ix++;
      prevIx = elem.ix;
    }
    return elems;
  }

  protected _compileElement(template:string, bindingStack:any[], fact?:any):Element {
    let elementToChildren = ixer.index("ui template", ["ui template: parent"]);
    let elementToAttrs = ixer.index("ui attribute", ["ui attribute: template"]);
    let elementToAttrBindings = ixer.index("ui attribute binding", ["ui attribute binding: template"]);
    let elementToEvents = ixer.index("ui event", ["ui event: template"]);
    let elementToEventBindings = ixer.index("ui event binding", ["ui event binding: template"]);

    this.compiled++;
    let base = ixer.findOne("ui template", {"ui template: template": template});
    if(!base) {
      console.warn(`ui template ${template} does not exist. Ignoring.`);
      return undefined;
    }

    let attrs = elementToAttrs[template];
    let boundAttrs = elementToAttrBindings[template];
    let events = elementToEvents[template];
    let boundEvents = elementToEventBindings[template];

    // Handle meta properties
    let elem:Element = {t: base["ui template: tag"], ix: base["ui template: ix"]};

    // Handle static properties
    if(attrs) {
      for(let {"ui attribute: property": prop, "ui attribute: value": val} of attrs) elem[prop] = val;
    }

    // Handle bound properties
    if(boundAttrs) {
      for(let {"ui attribute binding": prop, "ui attribute binding: alias": alias} of boundAttrs) {
        elem[prop] = this.getBoundValue(alias, bindingStack);
      }
    }

    // Attach static event handlers
    if(events) {
      for(let {"ui event: event": event, "ui event: kind": kind} of events) {
        elem[event] = this.generateEventHandler(elem, event, kind);
      }
    }

    // Attach bound event handlers
    for(let {"ui event binding: event": event, "ui event binding: kind": kind, "ui event binding: alias": alias} of boundEvents) {
      elem[event] = this.generateEventHandler(elem, event, kind, alias);
    }

    // Compile children
    let children = elementToChildren[template];
    if(elem.children) {
      // Include embedded children after injected children.
      // @FIXME: This does not preserve definition order between static and dynamic elems.
      // @FIXME: Need a way to selectively push alias constraints to embedded child instead of adding all of them.
      children = children ? children.concat(elem.children) : elem.children;
    }

    if(children) {
      elem.children = [];
      for(let childTemplate of children) {
        elem.children.push.apply(elem.children, this._compileWrapper(childTemplate, elem.children.length));
      }
    }

    if(this.tagCompilers[elem.t]) {
      try {
        this.tagCompilers[elem.t](elem);
      } catch(err) {
        console.warn(`Failed to compile template: '${template}' due to '${err}' for element '${JSON.stringify(elem)}'`);
        elem.t = "ui-error";
      }
    }
  }

  protected getBoundFacts(query, constraints):string[] {
    return ixer.find(query, constraints);
  }
  protected getBoundAliases(bindingStack:any[]):string[] {
    let aliases = {};
    for(let ix = bindingStack.length; ix >= 0; ix--) {
      let fact = bindingStack[ix];
      for(let alias in fact) aliases[alias] = true;
    }
    return Object.keys(aliases);
  }
  protected getBoundValue(alias, bindingStack:any[]):any {
    for(let ix = bindingStack.length; ix >= 0; ix--) {
      let fact = bindingStack[ix];
      if(fact[alias]) return alias;
    }
  }
  protected generateEventHandler(elem, event, kind, key?) {
    throw new Error("Implement me!");
  }
}
