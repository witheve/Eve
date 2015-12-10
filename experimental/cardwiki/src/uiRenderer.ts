import {unpad, repeat, DEBUG, uuid} from "./utils";
import {Element, Handler} from "./microReact";
import {Indexer, Query} from "./runtime";

function resolve(table, fact) {
  let neue = {};
  for(let field in fact)
    neue[`${table}: ${field}`] = fact[field];
  return neue;
}
function humanize(table, fact) {
  let neue = {};
  for(let field in fact)
    neue[field.slice(table.length + 2)] = fact[field];
  return neue;
}

function resolvedAdd(changeset, table, fact) {
  return changeset.add(table, resolve(table, fact));
}
function resolvedRemove(changeset, table, fact) {
  return changeset.remove(table, resolve(table, fact));
}
function humanizedFind(ixer:Indexer, table, query) {
  let results = [];
  for(let fact of ixer.find(table, resolve(table, query))) results.push(humanize(table, fact));
  let diag = {};
  for(let table in ixer.tables) diag[table] = ixer.tables[table].table.length;
  return results;
}

export class UI {
  protected _binding:Query;
  protected _embedded:{};
  protected _children:UI[] = [];
  protected _attributes:{} = {};
  protected _events:{} = {};

  protected _parent:UI;

  static remove(template:string, ixer:Indexer) {
    let changeset = ixer.diff();
    resolvedRemove(changeset, "ui template", {template});
    resolvedRemove(changeset, "ui template binding", {template});
    let bindings = humanizedFind(ixer, "ui template binding", {template});
    for(let binding of bindings) changeset.merge(Query.remove(binding.binding, ixer));
    resolvedRemove(changeset, "ui embed", {template});
    let embeds = humanizedFind(ixer, "ui embed", {template});
    for(let embed of embeds) {
      resolvedRemove(changeset, "ui embed scope", {template, embed: embed.embed});
      resolvedRemove(changeset, "ui embed scope binding", {template, embed: embed.embed});
    }
    resolvedRemove(changeset, "ui attribute", {template});
    resolvedRemove(changeset, "ui attribute binding", {template});
    resolvedRemove(changeset, "ui event", {template});
    let events = humanizedFind(ixer, "ui event", {template});
    for(let event of events) {
      resolvedRemove(changeset, "ui event state", {template, event: event.event});
      resolvedRemove(changeset, "ui event state binding", {template, event: event.event});
    }

    for(let child of humanizedFind(ixer, "ui template", {parent: template})) changeset.merge(UI.remove(child.template, ixer));
    return changeset;
  }

  constructor(public id) {

  }
  copy() {
    let neue = new UI(this.id);
    neue._binding = this._binding;
    neue._embedded = this._embedded;
    neue._children = this._children;
    neue._attributes = this._attributes;
    neue._events = this._events;
    neue._parent = this._parent;
    return neue;
  }
  changeset(ixer:Indexer) {
    let changeset = ixer.diff();

    let parent = this._attributes["parent"] || (this._parent && this._parent.id) || "";
    let ix = this._attributes["ix"];
    if(ix === undefined) ix = (this._parent && this._parent._children.indexOf(this));
    if(ix === -1 || ix === undefined) ix = "";
    if(this._embedded) parent = "";

    resolvedAdd(changeset, "ui template", {template: this.id, parent, ix});
    if(this._binding) {
      if(!this._binding.name || this._binding.name === "unknown") this._binding.name = `bound view ${this.id}`;
      changeset.merge(this._binding.changeset(ixer));
      resolvedAdd(changeset, "ui template binding", {template: this.id, binding: this._binding.name});
    }
    if(this._embedded) {
      let embed = uuid();
      resolvedAdd(changeset, "ui embed", {embed, template: this.id, parent: (this._parent || <any>{}).id, ix});
      for(let key in this._embedded) {
        let value = this._attributes[key];
        if(value instanceof Array) resolvedAdd(changeset, "ui embed scope binding", {embed, key, source: value[0], alias: value[1]});
        else resolvedAdd(changeset, "ui embed scope", {embed, key, value});
      }
    }

    for(let property in this._attributes) {
      let value = this._attributes[property];
      if(value instanceof Array) resolvedAdd(changeset, "ui attribute binding", {template: this.id, property, source: value[0], alias: value[1]});
      else resolvedAdd(changeset, "ui attribute", {template: this.id, property, value});
    }

    for(let event in this._events) {
      resolvedAdd(changeset, "ui event", {template: this.id, event});
      let state = this._events[event];
      for(let key in state) {
        let value = state[key];
        if(value instanceof Array)
          resolvedAdd(changeset, "ui event state binding", {template: this.id, event, key, source: value[0], alias: value[1]});
        else resolvedAdd(changeset, "ui event state", {template: this.id, event, key, value});
      }
    }

    for(let child of this._children) changeset.merge(child.changeset(ixer));

    return changeset;
  }
  load(template:string, ixer:Indexer, parent?:UI) {
    let fact = humanizedFind(ixer, "ui template", {template})[0];
    if(!fact) return this;
    if(parent || fact.parent) this._parent = parent || new UI(this._parent);
    let binding = humanizedFind(ixer, "ui template binding", {template})[0];
    if(binding) this.bind((new Query(ixer, binding.binding)));
    let embed = humanizedFind(ixer, "ui embed", {template, parent: this._parent ? this._parent.id : ""})[0];
    if(embed) {
      let scope = {};
      for(let attr of humanizedFind(ixer, "ui embed scope", {embed: embed.embed})) scope[attr.key] = attr.value;
      for(let attr of humanizedFind(ixer, "ui embed scope binding", {embed: embed.embed})) scope[attr.key] = [attr.source, attr.alias];
      this.embed(scope);
    }

    for(let attr of humanizedFind(ixer, "ui attribute", {template})) this.attribute(attr.property, attr.value);
    for(let attr of humanizedFind(ixer, "ui attribute binding", {template})) this.attribute(attr.property, [attr.source, attr.alias]);

    for(let event of humanizedFind(ixer, "ui event", {template})) {
      let state = {};
      for(let attr of humanizedFind(ixer, "ui event state", {template, event: event.event})) state[event.key] = event.value;
      for(let attr of humanizedFind(ixer, "ui event state binding", {template, event: event.event})) state[event.key] = [event.source, event.alias]
      this.event(event.event, state);
    }

    for(let child of humanizedFind(ixer, "ui template", {parent: template}))
      this.child((new UI(child.template)).load(child.template, ixer, this));

    return this;
  }

  children(neue?:UI[], append = false) {
    if(!neue) return this._children;
    if(!append) this._children.length = 0;
    for(let child of neue) {
      let copied = child.copy();
      copied._parent = this;
      this._children.push(copied);
    }
    return this._children;
  }
  child(child:UI, ix?: number, embed?:{}) {
    child = child.copy();
    child._parent = this;
    if(embed) child.embed(embed);
    if(!ix) this._children.push(child);
    else this._children.splice(ix, 0, child);
    return child;
  }
  removeChild(ix: number) {
    return this._children.splice(ix, 1);
  }

  attributes(properties?: {}, merge = false) {
    if(!properties) return this._attributes;
    if(!merge) {
      for(let prop in this._attributes) delete this._attributes[prop];
    }
    for(let prop in properties) this._attributes[prop] = properties[prop];
    return this;
  }
  attribute(property: string, value?: any) {
    if(value === undefined) return this._attributes[property];
    this._attributes[property] = value;
    return this;
  }
  removeAttribute(property: string) {
    delete this._attributes[property];
    return this;
  }

  events(events?: {}, merge = false) {
    if(!events) return this._events;
    if(!merge) {
      for(let event in this._events) delete this._events[event];
    }
    for(let event in events) this._events[event] = events[event];
    return this;
  }
  event(event: string, state?: any) {
    if(state === undefined) return this._events[event];
    this._attributes[event] = state;
    return this;
  }
  removeEvent(event: string) {
    delete this._events[event];
    return this;
  }

  embed(scope:{}|boolean = {}) {
    if(!scope) {
      this._embedded = undefined;
      return this;
    }
    if(scope === true) scope = {};
    this._embedded = scope;
    return this;
  }

  bind(binding:Query) {
    this._binding = binding;
    return this;
  }
}

interface UiWarning {
  "ui warning: template": string
  "ui warning: warning": string
}

// @TODO: Finish reference impl.
// @TODO: Then build bit-generating version
export class UIRenderer {
  public compiled = 0;
  protected _tagCompilers:{[tag: string]: (elem:Element) => void} = {};
  protected _handlers:Handler<Event>[] = [];

  constructor(public ixer:Indexer) {}

  compile(roots:(string|Element)[]):Element[] {
    if(DEBUG.RENDERER) console.group("ui compile");
    let compiledElems:Element[] = [];
    for(let root of roots) {
      // @TODO: reparent dynamic roots if needed.
      if(typeof root === "string") {
        let elems = this._compileWrapper(root, compiledElems.length);
        compiledElems.push.apply(compiledElems, elems);
        let base = this.ixer.findOne("ui template", {"ui template: template": root});
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
    if(DEBUG.RENDERER) console.groupEnd();
    return compiledElems;
  }

  protected _compileWrapper(template:string, baseIx: number, constraints:{} = {}, bindingStack:any[] = [], depth:number = 0):Element[] {
    let elems = [];
    let binding = this.ixer.findOne("ui template binding", {"ui template binding: template": template});
    if(!binding) {
      let elem = this._compileElement(template, bindingStack, depth);
      if(elem) elems[0] = elem;
    } else {
      let boundQuery = binding["ui template binding: binding"];
      let facts = this.getBoundFacts(boundQuery, constraints);
      let ix = 0;
      for(let fact of facts) {
        bindingStack.push(fact);
        let elem = this._compileElement(template, bindingStack, depth);
        bindingStack.pop();
        if(elem) elems.push(elem);
      }
    }
    elems.sort((a, b) => a.ix - b.ix);
    let prevIx = undefined;
    for(let elem of elems) {
      elem.ix = elem.ix ? elem.ix + baseIx : baseIx;
      if(elem.ix === prevIx) elem.ix++;
      prevIx = elem.ix;
    }
    return elems;
  }

  protected _compileElement(template:string, bindingStack:any[], depth:number):Element {
    if(DEBUG.RENDERER) console.log(repeat("  ", depth) + "* compile", template);
    let elementToChildren = this.ixer.index("ui template", ["ui template: parent"]);
    let elementToEmbeds = this.ixer.index("ui embed", ["ui embed: parent"]);
    let embedToScope = this.ixer.index("ui embed scope", ["ui embed scope: embed"]);
    let embedToScopeBinding = this.ixer.index("ui embed scope binding", ["ui embed scope binding: embed"]);
    let elementToAttrs = this.ixer.index("ui attribute", ["ui attribute: template"]);
    let elementToAttrBindings = this.ixer.index("ui attribute binding", ["ui attribute binding: template"]);
    let elementToEvents = this.ixer.index("ui event", ["ui event: template"]);
    this.compiled++;
    let base = this.ixer.findOne("ui template", {"ui template: template": template});
    if(!base) {
      console.warn(`ui template ${template} does not exist. Ignoring.`);
      return undefined;
    }

    let attrs = elementToAttrs[template];
    let boundAttrs = elementToAttrBindings[template];
    let events = elementToEvents[template];

    // Handle meta properties
    let elem:Element = {_template: template, ix: base["ui template: ix"]};

    // Handle static properties
    if(attrs) {
      for(let {"ui attribute: property": prop, "ui attribute: value": val} of attrs) elem[prop] = val;
    }

    // Handle bound properties
    if(boundAttrs) {
      // @FIXME: What do with source?
      for(let {"ui attribute binding: property": prop, "ui attribute binding: source": source, "ui attribute binding: alias": alias} of boundAttrs)
        elem[prop] = this.getBoundValue(source, alias, bindingStack);
    }

    // Attach event handlers
    if(events) {
      for(let {"ui event: event": event} of events) elem[event] = this.generateEventHandler(elem, event, bindingStack);
    }

    // Compile children
    let children = elementToChildren[template] || [];
    let embeds = elementToEmbeds[template] || [];
    if(children.length || embeds.length) {
      elem.children = [];
      let childIx = 0, embedIx = 0;
      while(childIx < children.length || embedIx < embeds.length) {
        let child = children[childIx];
        let embed = embeds[embedIx];
        let add, constraints = {}, childBindingStack = bindingStack;
        if(!embed || child && child.ix <= embed.ix) {
          add = children[childIx++]["ui template: template"];
          // Resolve bound aliases into constraints
          constraints = this.getBoundScope(bindingStack);

        } else {
          add = embeds[embedIx++]["ui embed: template"];
          for(let scope of embedToScope[embed["ui embed: embed"]] || [])
            constraints[scope["ui embed scope: key"]] = scope["ui embed scope: value"];

          for(let scope of embedToScopeBinding[embed["ui embed: embed"]] || []) {
            // @FIXME: What do about source?
            let {"ui embed scope binding: key": key, "ui embed scope binding: source": source, "ui embed scope binding: alias": alias} = scope;
            constraints[key] = this.getBoundValue(source, alias, bindingStack);
          }
          childBindingStack = [constraints];
        }
        elem.children.push.apply(elem.children, this._compileWrapper(add, elem.children.length, constraints, childBindingStack, depth + 1));
      }
    }

    if(this._tagCompilers[elem.t]) {
      try {
        this._tagCompilers[elem.t](elem);
      } catch(err) {
        console.warn(`Failed to compile template: '${template}' due to '${err}' for element '${JSON.stringify(elem)}'`);
        elem.t = "ui-error";
      }
    }

    return elem;
  }

  protected getBoundFacts(query, constraints):string[] {
    return this.ixer.find(query, constraints);
  }
  protected getBoundScope(bindingStack:any[]):{} {
    let scope = {};
    for(let fact of bindingStack) {
      for(let alias in fact) scope[alias] = fact[alias];
    }
    return scope;
  }

  //@FIXME: What do about source?
  protected getBoundValue(source:string, alias:string, bindingStack:any[]):any { // @FIXME: Finds don't create a source field on the result.
    for(let ix = bindingStack.length - 1; ix >= 0; ix--) {
      let fact = bindingStack[ix];
      if(source in fact && fact[alias]) return fact[alias];
    }
  }
  protected generateEventHandler(elem:Element, event:string, bindingStack:any[]):Handler<Event> {
    let template = elem["_template"];
    let memoKey = `${template}::${event}`;
    let attrKey = `${event}::state`;
    elem[attrKey] = this.getEventState(template, event, bindingStack);
    if(this._handlers[memoKey]) return this._handlers[memoKey];

    let self = this;
    if(event === "change" || event === "input") {
      this._handlers[memoKey] = (evt:Event, elem:Element) => {
        let props:any = {};
        if(elem.t === "select" || elem.t === "input" || elem.t === "textarea") props.value = (<HTMLSelectElement|HTMLInputElement>evt.target).value;
        if(elem.type === "checkbox") props.value = (<HTMLInputElement>evt.target).checked;
        self.handleEvent(template, event, evt, elem, props);
      };
    } else {
      this._handlers[memoKey] = (evt:Event, elem:Element) => {
        self.handleEvent(template, event, evt, elem, {});
      }
    }

    return this._handlers[memoKey];
  }
  protected handleEvent(template:string, eventName:string, event:Event, elem:Element, eventProps:{}) {
    let attrKey = `${eventName}::state`;
    let state = elem[attrKey];
    let content = unpad(6) `
      # ${eventName} ({is a: event})
      ## Meta
      event target: {event target: ${elem.id}}
      event template: {event template: ${template}}
      event type: {event type: ${eventName}}

      ## State
    `;
    if(state["*event*"]) {
      for(let prop in state["*event*"])
        content += `${prop}: {${prop}: ${eventProps[state["*event*"][prop]]}}\n`;
    }
    for(let prop in state) {
      if(prop === "*event*") continue;
      content += `${prop}: {${prop}: ${state[prop]}}\n`
    }

    let changeset = this.ixer.diff();
    let raw = uuid();
    let entity = `${eventName} event ${raw.slice(-12)}`;
    changeset.add("builtin entity", {entity, content});
    this.ixer.applyDiff(changeset);
    console.log(entity);
  }

  protected getEventState(template:string, event:string, bindingStack:any[]):{} {
    let state = {};
    let staticAttrs = this.ixer.find("ui event state", {"ui event state: template": template, "ui event state: event": event});
    for(let {"ui event state: key": key, "ui event state: value": val} of staticAttrs) state[key] = val;

    let boundAttrs = this.ixer.find("ui event state binding", {"ui event state binding: template": template, "ui event state binding: event": event});
    for(let {"ui event state binding: key": key, "ui event state binding: source": source, "ui event state binding: alias": alias} of boundAttrs) {
      if(source === "*event*") {
        state["*event*"] = state["*event*"] || {};
        state["*event*"][key] = alias;
      } else {
        state[key] = this.getBoundValue(source, alias, bindingStack);
      }
    }

    return state;
  }
}

declare var exports;
if(this.window) window["uiRenderer"] = exports;