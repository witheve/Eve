//@FIXME: This doesn't currently handle chooses/unions that rely on eachother.

//--------------------------------------------------------------------
// Javascript DSL for writing Eve programs
//--------------------------------------------------------------------

import {RawValue, Register, isRegister, GlobalInterner, ID, concatArray} from "./runtime";
import * as Runtime from "./runtime";
import * as indexes from "./indexes";
import {Watcher} from "../watchers/watcher";

const UNASSIGNED = -1;

// There don't seem to be TypeScript definitions for these by default,
// so here we are.
declare var Proxy:new (obj:any, proxy:any) => any;

function isArray<T>(v:any): v is Array<T> {
  return v && v.constructor === Array;
}

//--------------------------------------------------------------------
// Reference
//--------------------------------------------------------------------

type Value = Reference|RawValue;
type ProxyReference = any;

function isRawValue(v:any): v is RawValue {
  return (typeof v === "string" || typeof v === "number");
}

function isReference(v:any): v is Reference {
  return (v instanceof Reference);
}

type Owner = any;

export class Reference {
  static ReferenceID = 0;
  static create(context:ReferenceContext, value?:Owner|RawValue) {
    if(typeof value !== "object") {
      let neue = new Reference(context);
      if(value !== undefined) context.equality(neue, value);
      return neue;
    }
    return new Reference(context, value);
  }

  __ID = Reference.ReferenceID++;

  constructor(public __context:ReferenceContext, public __owner?:Owner) {
    let proxied = this.__proxy();
    __context.register(proxied);
    return proxied;
  }

  add(attribute:Value, value:Value):Reference {
    if(this.__owner instanceof Record) {
      // we only allow you to call add at the root context
      if(this.__context.parent) throw new Error("Add can't be called in a sub-block");
      this.__owner.add(this.__context, attribute, value);
      return this;
    } else {
      throw new Error("Can't call add on a non-record");
    }
  }

  remove() {
    throw new Error("Implement me!");
  }

  __proxy() {
    return new Proxy(this, {
      get: (obj:any, prop:string) => {
        if(obj[prop] !== undefined) return obj[prop];
        if(typeof prop === "symbol") return () => {
          return "uh oh";
        }

        let active = this.__context.getActive();
        if(!active) {
          return;
        }

        if(!this.__owner) {
          throw new Error("Cannot access a property of a static value");
        }

        return this.__owner.access(this.__context, active, prop);
      },

      set: (obj:any, prop:string, value:any) => {
        if(obj[prop] !== undefined) {
          obj[prop] = value;
          return true;
        }
        throw new Error("Cannot set a value on a reference")
      }
    });
  }
}

//--------------------------------------------------------------------
// ReferenceContext
//--------------------------------------------------------------------

export class ReferenceContext {
  static stack:ReferenceContext[] = [];
  static push(context:ReferenceContext) {
    ReferenceContext.stack.push(context);
  }
  static pop() {
    ReferenceContext.stack.pop();
  }

  flow: LinearFlow;
  references:Reference[] = [];
  equalities:Value[][] = [];
  referenceValues: (Register|RawValue)[] = [];
  totalRegisters = 0;
  maxRegisters = 0;

  constructor(public parent?:ReferenceContext, flow?:LinearFlow) {
    this.flow = flow || new LinearFlow((x:LinearFlow) => []);
  }

  register(ref:Reference) {
    // if this reference is not owned by this context, we have to walk up the context
    // stack and register this for our parents until we find a layer that *does* own it
    // so that it can be considered an input to that context.
    let {parent} = this;
    if(!this.owns(ref) && parent) {
      while(parent && parent !== ref.__context) {
        parent.register(ref);
        parent = parent.parent;
      }
    }
    if(!this.owns(ref) && parent !== ref.__context) {
      console.error("Reference with no owner in the parent stack: ", ref);
      throw new Error("Reference with no owner in the parent stack")
    }

    if(!this.references[ref.__ID]) this.references[ref.__ID] = ref;
    else if(this.references[ref.__ID] !== ref) throw new Error("Different references with the same ID");
  }

  equality(a:Value, b:Value) {
    if(a instanceof Reference) {
      this.register(a);
    }
    if(b instanceof Reference) {
      this.register(b);
    }
    this.equalities.push([a,b]);
  }

  getActive():ReferenceContext {
    return ReferenceContext.stack[ReferenceContext.stack.length - 1];
  }

  owns(ref:Reference) {
    return ref.__context === this;
  }

  getValue(ref:Reference|RawValue, orGenerateRegister?:boolean):Register|RawValue {
    if(isRawValue(ref)) return ref;
    let val = this.referenceValues[ref.__ID];
    if(val === undefined) {
      if(!this.owns(ref) && this.parent) return this.parent.getValue(ref);
      if(orGenerateRegister) {
        val = new Register(UNASSIGNED);
        this.referenceValues[ref.__ID] = val;
      }
    }
    if(val === undefined) throw new Error("Unable to resolve reference: " + ref.__ID);
    return val;
  }

  interned(ref:Reference|RawValue):Register|ID {
    let value = this.getValue(ref);
    if(isRawValue(value)) return GlobalInterner.intern(value);
    return value;
  }

  selectReference(ref:Reference, ref2:Reference) {
    if(!this.owns(ref) && !this.owns(ref2)) {
      if(ref.__ID < ref2.__ID) return ref2;
      return ref;
    }
    if(!this.owns(ref)) return ref;
    if(!this.owns(ref2)) return ref2;
    if(ref.__ID < ref2.__ID) return ref2;
    return ref;
  }

  unify() {
    let {equalities} = this;
    let values:(Register | RawValue)[] = this.referenceValues;
    let changed = equalities.length > 0;

    let round = 0;
    let maxRound = Math.pow(this.equalities.length + 1, 2);
    for(let ref of this.references) {
      if(!ref) continue;
      this.getValue(ref, true);
    }
    while(changed && round < maxRound) {
      round++;
      changed = false;
      for(let [a, b] of equalities) {
        let aValue = isReference(a) ? this.getValue(a, true) : a;
        let bValue = isReference(b) ? this.getValue(b, true) : b;
        let neueA = aValue;
        let neueB = bValue;

        if(isReference(a) && isReference(b)) {
          if(this.selectReference(a, b) === b) {
            neueA = bValue;
          } else {
            neueB = aValue;
          }
        } else if(isReference(a)) {
          neueA = bValue;
        } else if(isReference(b)) {
          neueB = aValue;
        } else if(a !== b) {
          throw new Error(`Attempting to unify two disparate static values: \`${a}\` and \`${b}\``);
        }

        if(aValue !== neueA) {
          values[(a as Reference).__ID] = neueA;
          changed = true;
        }
        if(bValue !== neueB) {
          values[(b as Reference).__ID] = neueB;
          changed = true;
        }
      }
    }
    if(round >= maxRound) {
      throw new Error("Unable to unify variables. This is almost certainly an implementation error.");
    }
    this.assignRegisters()
  }

  getMoves() {
    let moves = [];
    for(let ref of this.references) {
      if(ref === undefined || this.owns(ref)) continue;
      let local = this.getValue(ref);
      let parent = ref.__context.getValue(ref);
      if(local !== parent) {
        moves.push(new Move(this, ref));
      }
    }
    return moves;
  }

  getInputReferences():Reference[] {
    let refs = [];
    for(let reference of this.references) {
      if(!reference || this.owns(reference)) continue;
      refs.push(reference);
    }
    return refs;
  }

  getInputRegisters():Register[] {
    return this.getInputReferences().map((v) => this.getValue(v)).filter(isRegister) as Register[];
  }

  updateMaxRegisters(maybeMax:number) {
    let parent:ReferenceContext|undefined = this;
    while(parent) {
      parent.maxRegisters = Math.max(parent.maxRegisters, maybeMax);
      parent = parent.parent;
    }
  }

  assignRegisters() {
    let startIx = this.parent ? this.parent.totalRegisters : 0;
    for(let ref of this.references) {
      if(ref === undefined) continue;
      let local = this.getValue(ref);
      if(isRegister(local)) {
        if(local.offset >= startIx) throw new Error("Trying to assign a register that already has a higher offset");
        if(local.offset === UNASSIGNED) {
          local.offset = startIx++;
        }
      }
    }
    this.totalRegisters = startIx;
    this.updateMaxRegisters(startIx);
  }
}

//--------------------------------------------------------------------
// Linear Flow
//--------------------------------------------------------------------

type Node = Record | Insert | Fn | Not | Choose | Union | Aggregate | Lookup;
type LinearFlowFunction = (self:LinearFlow) => (Value|Value[])
type RecordAttributes = {[key:string]:Value}
type FlowRecordArg = string | RecordAttributes

class FlowLevel {
  records:Record[] = [];
  lookups:Lookup[] = [];
  functions:Fn[] = [];
  aggregates:Aggregate[] = [];
  inserts:Insert[] = [];
  watches:Watch[] = [];
  nots:Not[] = [];
  chooses:Choose[] = [];
  unions:Union[] = [];
  moves:Move[] = [];

  collect(node:Node) {
    if(node instanceof Insert) {
      this.inserts.push(node);
    } else if(node instanceof Record) {
      this.records.push(node);
    } else if(node instanceof Lookup) {
      this.lookups.push(node);
    } else if(node instanceof Fn) {
      this.functions.push(node);
    } else if(node instanceof Aggregate) {
      this.aggregates.push(node);
    } else if(node instanceof Watch) {
      this.watches.push(node);
    } else if(node instanceof Not) {
      this.nots.push(node);
    } else if(node instanceof Choose) {
      this.chooses.push(node);
    } else if(node instanceof Union) {
      this.unions.push(node);
    } else if(node instanceof Move) {
      this.moves.push(node);
    } else {
      console.error("Don't know how to collect this type of node: ", node);
      throw new Error("Unknown node type sent to collect");
    }
  }

  findReference(node:any) {
    let ref = node.reference();
    let items;
    if(node instanceof Record) {
      items = this.records;
    } else {
      console.error("Don't know how to lookup a: ", node);
      throw new Error("Unknown node type sent to findReference");
    }
    for(let item of items) {
      if(item.reference() === ref) return item;
    }
  }

  toConstraints(injections:Node[]) {
    let items:(Record|Fn|Lookup)[] = [];
    concatArray(items, injections);
    concatArray(items, this.functions);
    concatArray(items, this.records);
    concatArray(items, this.lookups);
    concatArray(items, this.moves);
    return items;
  }

  compile(nodes:Runtime.Node[], injections:Node[], toPass:Node[]):Runtime.Node[] {
    let items = this.toConstraints(injections);
    let constraints:Runtime.Constraint[] = [];
    for(let toCompile of items) {
      let compiled = toCompile.compile();
      for(let item of compiled) {
        constraints.push(item as Runtime.Constraint);
      }
    }

    let join:Runtime.Node;
    if(!nodes.length && constraints.length) {
      join = new Runtime.JoinNode(constraints);
    } else if(constraints.length) {
      join = new Runtime.DownstreamJoinNode(constraints);
    } else if(nodes.length) {
      join = nodes.pop() as Runtime.Node;
    } else {
      throw new Error("Query with zero constraints.")
    }

    // @NOTE: We need to unify all of our sub-blocks along with ourselves
    //        before the root node can allocate registers.
    for(let not of this.nots) {
      // All sub blocks take their parents' items and embed them into
      // the sub block. This is to make sure that the sub only computes the
      // results that might actually join with the parent instead of the possibly
      // very large set of unjoined results. This isn't guaranteed to be optimal
      // and may very well cause us to do more work than necessary. For example if
      // the results of the inner join with many outers, we'll still enumerate the
      // whole set. This *may* be necessary for getting the correct multiplicities
      // anyways, so this is what we're doing.
      let notNodes = not.compile(toPass);
      // @TODO: once we have multiple nodes in a not (e.g. aggs, or recursive not/choose/union)
      // this won't be sufficient.
      let notJoinNode = notNodes[0];
      join = new Runtime.AntiJoin(join, notJoinNode, not.getInputRegisters())
    }

    for(let choose of this.chooses) {
      // For why we pass items down, see the comment about not
      let node = choose.compile(toPass);
      join = new Runtime.BinaryJoinRight(join, node, choose.getInputRegisters());
    }

    for(let union of this.unions) {
      // For why we pass items down, see the comment about not
      let node = union.compile(toPass);
      join = new Runtime.BinaryJoinRight(join, node, union.getInputRegisters());
    }

    // @TODO: Port aggregates
    // for(let aggregate of this.aggregates) {
    //   let aggregateNode = aggregate.compile();
    //   join = new Runtime.MergeAggregateFlow(join, aggregateNode, aggregate.getInputRegisters(), aggregate.getOutputRegisters());
    // }

    nodes.push(join)
    return nodes;
  }

  split():FlowLevel[] {
    let maxLevel = 0;
    // if a register can be filled from the database, it doesn't need to be up-leveled,
    // since we always have a value for it from the beginning. Let's find all of those
    // registers so we can ignore them in our functions
    let databaseSupported = concatArray([], this.records);
    concatArray(databaseSupported, this.lookups);
    let supported:boolean[] = [];
    for(let item of this.records) {
      let registers = item.getRegisters();
      for(let register of registers) {
        supported[register.offset] = true;
      }
    }

    // choose, union, and aggregates can cause us to need multiple levels
    // if there's something that relies on an output from one of those, it
    // has to come in a level after that thing is computed.
    let changed = false;
    let leveledRegisters:{[offset:number]: {level:number, providers:any[]}} = {};
    let providerToLevel:{[id:number]: number} = {};
    let items = concatArray([], this.chooses);
    concatArray(items, this.unions);
    concatArray(items, this.aggregates);
    for(let item of items) {
      for(let result of item.getOutputRegisters()) {
        let offset = result.offset;
        if(!supported[offset]) {
          let found = leveledRegisters[offset];
          if(!found) {
            found = leveledRegisters[offset] = {level: 1, providers: []};
          }
          leveledRegisters[offset].providers.push(item);
          providerToLevel[item.ID] = 1;
          changed = true;
          maxLevel = 1;
        }
      }
    }
    // go through all the functions, nots, chooses, and unions to see if they rely on
    // a register that has been leveled, if so, they need to move to a level after
    // the provider's heighest
    concatArray(items, this.functions);
    concatArray(items, this.nots);
    concatArray(items, this.moves);
    let remaining = items.length;
    while(changed && remaining > -1) {
      changed = false;
      for(let item of items) {
        remaining--;
        if(!item) continue;

        let changedProvider = false;
        let providerLevel = providerToLevel[item.ID] || 0;
        for(let input of item.getInputRegisters()) {
          let inputInfo = leveledRegisters[input.offset];
          if(inputInfo && inputInfo.level > providerLevel) {
            changedProvider = true;
            providerLevel = inputInfo.level + 1;
          }
        }

        if(changedProvider) {
          providerToLevel[item.ID] = providerLevel;
          // level my outputs
          for(let output of item.getOutputRegisters()) {
            if(supported[output.offset]) continue;
            let outputInfo = leveledRegisters[output.offset];
            if(!outputInfo) {
              outputInfo = leveledRegisters[output.offset] = {level:0, providers:[]};
            }
            if(outputInfo.providers.indexOf(item) === -1) {
              outputInfo.providers.push(item);
            }
            if(outputInfo.level < providerLevel) {
              outputInfo.level = providerLevel;
            }
          }
          maxLevel = Math.max(maxLevel, providerLevel);
          changed = true;
        }
      }
    }

    if(remaining === -1) {
      // we couldn't stratify
      throw new Error("Unstratifiable program: cyclic dependency");
    }

    // now we put all our children into a series of objects that
    // represent each level
    let levels:FlowLevel[] = [];
    for(let ix = 0; ix <= maxLevel; ix++) {
      levels[ix] = new FlowLevel();
    }

    // all database scans are at the first level
    for(let record of this.records) {
      levels[0].records.push(record);
    }
    for(let lookup of this.lookups) {
      levels[0].lookups.push(lookup);
    }

    // functions/nots/chooses/unions can all be in different levels
    for(let not of this.nots) {
      let level = providerToLevel[not.ID] || 0;
      levels[level].nots.push(not);
    }

    for(let func of this.functions) {
      if(!func) continue;
      let level = providerToLevel[func.ID] || 0;
      levels[level].functions.push(func);
    }

    for(let choose of this.chooses) {
      let level = providerToLevel[choose.ID] || 0;
      levels[level].chooses.push(choose);
    }

    for(let union of this.unions) {
      let level = providerToLevel[union.ID] || 0;
      levels[level].unions.push(union);
    }

    for(let aggregate of this.aggregates) {
      let level = providerToLevel[aggregate.ID] || 0;
      levels[level].aggregates.push(aggregate);
    }

    for(let move of this.moves) {
      let level = providerToLevel[move.ID] || 0;
      levels[level].moves.push(move);
    }

    return levels;
  }
}

class DSLBase {
  static CurrentID = 0;
  ID = DSLBase.CurrentID++;
}

class LinearFlow extends DSLBase {
  context:ReferenceContext;
  collector:FlowLevel = new FlowLevel();
  levels:FlowLevel[] = [];
  results:Value[];
  parent:LinearFlow|undefined;

  constructor(func:LinearFlowFunction, parent?:LinearFlow) {
    super();
    let parentContext = parent ? parent.context : undefined;
    this.parent = parent;
    this.createLib();
    this.context = new ReferenceContext(parentContext, this);
    let transformed = func;
    if(!parent) {
      transformed = this.transform(func);
    }
    ReferenceContext.push(this.context);
    let results = transformed(this);
    if(isArray(results)) this.results = results;
    else if(results === undefined) this.results = [];
    else this.results = [results];
    ReferenceContext.pop();
  }

  //------------------------------------------------------------------
  // Create lib
  //------------------------------------------------------------------

  lib: any;
  createLib() {
    let lib:any = {};
    let registered = Runtime.FunctionConstraint.registered;
    for(let name in registered) {
      let parts = name.split("/");
      let final = parts.pop();
      let found = lib;
      for(let part of parts) {
        let next = found[part];
        if(!next) next = found[part] = {};
        found = next;
      }
      found[final!] = (...args:any[]) => {
        let fn = new Fn(this.context.getActive(), name, args);
        return fn.reference();
      }

    }
    this.lib = lib;
  }

  //------------------------------------------------------------------
  // Collector interactions
  //------------------------------------------------------------------

  collect(node:Node) {
    this.collector.collect(node);
  }

  findReference(node:Node) {
    this.collector.findReference(node);
  }

  //------------------------------------------------------------------
  // Inputs/outputs
  //------------------------------------------------------------------

  getInputRegisters() {
    return this.context.getInputRegisters();
  }

  //------------------------------------------------------------------
  // End user API
  //------------------------------------------------------------------

  find = (...args:FlowRecordArg[]):ProxyReference => {
    let tags = args;
    let attributes = tags.pop();
    if(typeof attributes === "string") {
      tags.push(attributes);
      attributes = undefined;
    }
    let active = this.context.getActive();
    let record = new Record(active, tags as string[], attributes);
    return record.reference();
  }

  lookup = (record:Value): {attribute:ProxyReference, value:ProxyReference} => {
    let active = this.context.getActive();
    let lookup = new Lookup(active, record);
    return lookup.output();
  }

  record = (...args:FlowRecordArg[]):ProxyReference => {
    let tags = args;
    let attributes = tags.pop();
    if(typeof attributes === "string") {
      tags.push(attributes);
      attributes = undefined;
    }
    let active = this.context.getActive();
    let insert = new Insert(active, tags as string[], attributes);
    return insert.reference();
  }

  not = (func:Function):void => {
    let active = this.context.getActive();
    let not = new Not(func as LinearFlowFunction, active.flow.parent || this);
    return;
  }

  union = (...branches:Function[]):ProxyReference[] => {
    let active = this.context.getActive();
    let union = new Union(active, branches, active.flow.parent || this);
    return union.results.slice();
  }

  choose = (...branches:Function[]):ProxyReference[] => {
    let active = this.context.getActive();
    let choose = new Choose(active, branches, active.flow.parent || this);
    return choose.results.slice();
  }

  gather = () => {
    let active = this.context.getActive();

  }

  //------------------------------------------------------------------
  // Compile
  //------------------------------------------------------------------

  unify() {
    this.context.unify();
  }

  compile(items:Node[] = []):Runtime.Node[] {
    this.unify();
    let nodes:Runtime.Node[] = [];

    for(let move of this.context.getMoves()) {
      this.collector.collect(move);
    }

    // Split our collector into levels
    let levels = this.collector.split();
    let localItems = items.slice();
    for(let level of levels) {
      nodes = level.compile(nodes, items, localItems);
      concatArray(localItems, level.toConstraints([]));
    }

    // all the inputs end up at the end
    for(let record of this.collector.inserts) {
      let compiled = record.compile();
      for(let node of compiled) {
        nodes.push(node as Runtime.Node);
      }
    }
    for(let record of this.collector.watches) {
      let compiled = record.compile();
      for(let node of compiled) {
        nodes.push(node as Runtime.Node);
      }
    }

    this.levels = levels;
    return nodes;
  }

  //------------------------------------------------------------------
  // Function transformation
  //------------------------------------------------------------------

  transform(func:LinearFlowFunction) {
    let functionArgs:string[] = [];
    let code = func.toString();
    // trim the function(...) { from the start and capture the arg names
    code = code.replace(/function\s*\((.*)\)\s*\{/, function(str:string, args:string) {
      functionArgs.push.apply(functionArgs, args.split(",").map((str) => str.trim()));
      return "";
    });
    // trim the final } since we removed the function bit
    code = code.substring(0, code.length - 1);
    code = this.transformCode(code, functionArgs);
    let neueFunc = new Function(functionArgs[0], code) as LinearFlowFunction;
    return neueFunc;
  }

  replaceInfix(strings:string[], functionArgs:string[], code:string, regex:RegExp, prefix?:string, replaceOp?:string) {
    let libArg = `${functionArgs[0]}.lib`;
    let hasChanged = true;
    while(hasChanged) {
      hasChanged = false;
      code = code.replace(regex, (str, left, op, right, left2, op2, right2) => {
        hasChanged = true;
        if(left === undefined) {
          left = left2;
          op = op2;
          right = right2;
        }
        left = this.transformCode(left, functionArgs);
        right = this.transformCode(right, functionArgs);
        let finalOp = replaceOp || `${prefix}["${op}"]`;
        strings.push(`${libArg}.${finalOp}(${left}, ${right})`);
        return "____" + (strings.length - 1) + "____";
      })
    }
    return code;
  }

  transformCode(code:string, functionArgs:string[]):string {
    let infixParam = "((?:(?:[a-z0-9_\.]+(?:\\[\".*?\"\\])?)+(?:\\(.*\\))?)|\\(.*\\))";
    let stringPlaceholder = "(____[0-9]+____)";

    let strings:string[] = [];
    code = code.replace(/"(?:[^"\\]|\\.)*"/gi, function(str) {
      strings.push(str);
      return "____" + (strings.length - 1) + "____";
    })

    // "foo" + person.name -> fn.eve.internal.concat("foo", person.name)
    // person.name + "foo" -> fn.eve.internal.concat(person.name, "foo")
    let stringAddition = new RegExp(`(?:${infixParam}\\s*(\\+)\\s*${stringPlaceholder})|(?:${stringPlaceholder}\\s*(\\+)\\s*${infixParam})`,"gi");
    code = this.replaceInfix(strings, functionArgs, code, stringAddition, "", "eve.internal.concat");

    // a * b -> fn.math["*"](a, b)
    // a / b -> fn.math["/"](a, b)
    let multiply = new RegExp(`${infixParam}\\s*(\\*|\\/)\\s*${infixParam}`, "gi");
    code = this.replaceInfix(strings, functionArgs, code, multiply, "math");

    // a + b -> fn.math["+"](a, b)
    // a - b -> fn.math["-"](a, b)
    let add = new RegExp(`${infixParam}\\s*(\\+|\\-)\\s*${infixParam}`, "gi");
    code = this.replaceInfix(strings, functionArgs, code, add, "math");

    // a > b -> fn.compare[">"](a, b)
    // for all the (in)equalities: >, >=, <, <=, !=, ==
    let compare = new RegExp(`${infixParam}\\s*(>|>=|<|<=|!=|==)\\s*${infixParam}`, "gi");
    code = this.replaceInfix(strings, functionArgs, code, compare, "compare");

    code = code.replace(/____([0-9]+)____/gi, function(str, index:string) {
      let found = strings[parseInt(index)];
      return found || str;
    })
    return code;
  }
}

//--------------------------------------------------------------------
// DSL runtime types
//--------------------------------------------------------------------

class Record extends DSLBase {
  attributes:Value[];
  constructor(public context:ReferenceContext, tags:string[] = [], attributes:RecordAttributes = {}, public record?:Reference) {
    super();
    if(!record) {
      this.record = this.createReference();
    }
    let attrs = [];
    for(let tag of tags) {
      attrs.push("tag", tag);
    }
    let keys = Object.keys(attributes).sort();
    for(let attr of keys) {
      let value = attributes[attr];
      if(isArray(value)) {
        for(let current of value) {
          attrs.push(attr, value);
        }
      } else {
        attrs.push(attr, value);
      }
    }
    this.attributes = attrs;
    context.flow.collect(this);
  }

  createReference() {
    return Reference.create(this.context, this);
  }

  createSub(context:ReferenceContext, record?:Reference):Record {
    return new Record(context, undefined, undefined, record);
  }

  reference() {
    return this.record!;
  }

  add(context:ReferenceContext, attribute:Value, value:Value) {
    let insert = new Insert(context, [], {}, this.reference());
    insert.add(context, attribute, value);
  }

  remove(context:ReferenceContext, attribute:Value, value?:Value) {
    let insert = new Insert(context, [], {}, this.reference());
    insert.remove(context, attribute, value);
  }

  copyToContext(activeContext:ReferenceContext) {
    let found = activeContext.flow.findReference(this);
    if(found) return found;

    let neue = this.createSub(activeContext, this.record);
    activeContext.register(this.record!);
    return neue;
  }

  findAttribute(name:string):Reference|undefined {
    let {attributes} = this;
    for(let ix = 0, len = attributes.length; ix < len; ix += 2) {
      let attrName = attributes[ix];
      let value = attributes[ix + 1];
      if(attrName === name && isReference(value)) return value;
    }
  }

  access(refContext:ReferenceContext, activeContext:ReferenceContext, prop:string) {
    let record:Record = this;
    if(refContext !== activeContext) {
      record = this.copyToContext(activeContext);
    }
    let found = record.findAttribute(prop);
    if(found) return found;

    // we need to add this attribute to us and return that
    let attrRecord = this.createSub(activeContext);
    let attrRef = attrRecord.reference();
    record.attributes.push(prop, attrRef);
    return attrRef;
  }

  getRegisters():Register[] {
    let values:Value[] = [this.record!];
    let {attributes} = this;
    for(let ix = 0, len = attributes.length; ix < len; ix += 2) {
      let a = attributes[ix];
      let v = attributes[ix + 1];
      values.push(a,v);
    }
    return values.map((v) => this.context.getValue(v)).filter(isRegister) as Register[];
  }

  compile():(Runtime.Node|Runtime.Scan)[] {
    let {attributes, context} = this;
    let constraints = [];
    let e = context.interned(this.record!);
    for(let ix = 0, len = attributes.length; ix < len; ix += 2) {
      let a = attributes[ix];
      let v = attributes[ix + 1];
      // @TODO: get a real node id
      let n = "awesome";
      constraints.push(new Runtime.Scan(e, context.interned(a), context.interned(v), Runtime.IGNORE_REG))
    }
    return constraints;
  }
}

class Lookup extends DSLBase {
  attribute:Reference;
  value:Reference;

  constructor(public context:ReferenceContext, public record:Value) {
    super();
    let attribute = new Record(context);
    let value = new Record(context);
    this.attribute = attribute.reference();
    this.value = value.reference();
    context.flow.collect(this);
  }

  reference():Reference {
    return this.record as Reference;
  }

  output() {
    return {attribute: this.attribute, value: this.value};
  }

  compile():Runtime.Scan[] {
    let scans = [];
    let {context} = this;
    scans.push(new Runtime.Scan(context.interned(this.record), context.interned(this.attribute), context.interned(this.value), Runtime.IGNORE_REG));
    return scans;
  }
}

class Move extends DSLBase {
  constructor(public context:ReferenceContext, public ref:Reference) {
    super();
  }

  getInputRegisters():Register[] {
    let value = this.context.getValue(this.ref);
    if(isRegister(value)) {
      return [value];
    }
    return [];
  }

  getOutputRegisters():Register[] {
    let {ref} = this;
    let parent = ref.__context.getValue(ref) as Register;
    return [parent];
  }

  compile():Runtime.Constraint[] {
    let {ref} = this;
    let local = this.context.interned(ref);
    let parent = ref.__context.getValue(ref) as Register;
    return [new Runtime.MoveConstraint(local, parent)];
  }
}

class Insert extends Record {

  constructor(public context:ReferenceContext, tags:string[] = [], attributes:RecordAttributes = {}, record?:Reference) {
    super(context, tags, attributes, record);

    if(!record) {
      // we have to make our ID generation function
      let args = [];
      for(let ix = 0, len = this.attributes.length; ix < len; ix += 2) {
        let v = this.attributes[ix + 1];
        args.push(v);
      }

      let genId = new Fn(context, "eve/internal/gen-id", args, this.reference());
    }
  }

  createReference() {
    // @TODO: create an InsertReference type and return that here
    return Reference.create(this.context, this);
  }

  createSub(context:ReferenceContext, record?:Reference):Record {
    return new Insert(context, undefined, undefined, record);
  }

  add(context:ReferenceContext, attribute:Value, value:Value) {
    this.attributes.push(attribute, value);
  }

  remove(context:ReferenceContext, attribute:Value, value?:Value) {
    throw new Error("Implement me!");
  }

  compile():(Runtime.Node|Runtime.Scan)[] {
    let {attributes, context} = this;
    let nodes = [];
    let e = context.interned(this.record!);
    for(let ix = 0, len = attributes.length; ix < len; ix += 2) {
      let a = attributes[ix];
      let v = attributes[ix + 1];
      // @TODO: get a real node id
      let n = "awesome";
      nodes.push(new Runtime.InsertNode(e, context.interned(a), context.interned(v), context.interned(n)))
    }
    return nodes;
  }
}

class Watch extends Insert {}

class Fn extends DSLBase {
  output:Value;
  constructor(public context:ReferenceContext, public name:string, public args:Value[], output?:Reference) {
    super();
    let {filter} = Runtime.FunctionConstraint.fetchInfo(name)
    if(output) {
      this.output = output;
    } else if(filter) {
      this.output = args[args.length - 1];
    } else {
      this.output = Reference.create(context, this);
    }
    context.flow.collect(this);
  }

  reference():Value {
    return this.output;
  }

  access(refContext:ReferenceContext, activeContext:ReferenceContext, prop:string) {
    throw new Error("Implement me!");
  }

  getInputRegisters() {
    let {context} = this;
    return this.args.map((v) => context.getValue(v)).filter(isRegister);
  }

  getOutputRegisters() {
    let registers = [];
    let value = this.context.getValue(this.output);
    if(isRegister(value)) {
      registers.push(value);
    }
    return registers;
  }

  compile():Runtime.Constraint[] {
    let constraints:Runtime.FunctionConstraint[] = [];
    let {context, name} = this;
    let values = this.args.map((v) => context.interned(v))
    let {variadic, filter} = Runtime.FunctionConstraint.fetchInfo(name)
    let returns:any = {};
    if(!filter) {
      returns.result = context.interned(this.output);
    }
    let constraint;
    if(variadic) {
      constraint = Runtime.FunctionConstraint.create(name, returns, values)!
    } else {
      constraint = Runtime.FunctionConstraint.create(name, returns, [])!
      let ix = 0;
      for(let arg of constraint.argNames) {
        constraint.fields[arg] = values[ix];
        ix++;
      }
    }
    constraints.push(constraint);
    return constraints;
  }
}

class Aggregate extends DSLBase {}

class Not extends LinearFlow {
  constructor(func:LinearFlowFunction, parent:LinearFlow) {
    super(func, parent);
    parent.collect(this);
  }
}

class Union extends DSLBase {
  branches:LinearFlow[] = [];
  results:Reference[] = [];
  inputs:Reference[] = [];

  constructor(public context:ReferenceContext, branchFunctions: Function[], parent:LinearFlow) {
    super();
    let {branches, results} = this;
    let ix = 0;
    let resultCount:number|undefined;
    for(let branch of branchFunctions) {
      let flow = new LinearFlow(branch as LinearFlowFunction, parent);
      let branchResultCount = this.resultCount(flow.results);
      if(resultCount === undefined) {
        resultCount = branchResultCount;
        for(let resultIx = 0; resultIx < resultCount; resultIx++) {
          results.push(Reference.create(context));
        }
      } else if(resultCount !== branchResultCount) {
        throw new Error(`Choose branch ${ix} doesn't have the right number of returns, I expected ${resultCount}, but got ${branchResultCount}`);
      }
      for(let ref of flow.context.getInputReferences()) {
        if(this.inputs.indexOf(ref) === -1) {
          this.inputs.push(ref);
        }
      }
      let resultIx = 0;
      for(let result of this.results) {
        flow.context.equality(flow.results[resultIx], result);
        resultIx++;
      }
      branches.push(flow);
      ix++;
    }
    context.flow.collect(this);
  }

  getInputRegisters() {
    let {context} = this;
    return this.inputs.map((v) => context.getValue(v)).filter(isRegister) as Register[];
  }

  getOutputRegisters() {
    let {context} = this;
    return this.results.map((v) => context.getValue(v)).filter(isRegister) as Register[];
  }

  resultCount(result:any):number {
    if(result && result.constructor === Array) {
      return result.length;
    } else if(result) {
      return 1;
    }
    return 0;
  }

  build(nodes:Runtime.Node[], inputs:Register[]):Runtime.Node {
    return new Runtime.UnionFlow(nodes, inputs);
  }

  compile(items:Node[]) {
    let {context} = this;
    let nodes:Runtime.Node[] = [];
    for(let flow of this.branches) {
      let compiled = flow.compile(items);
      nodes.push(compiled[0]);
    }
    let inputs = this.inputs.map((v) => context.getValue(v)).filter(isRegister) as Register[];
    return this.build(nodes, inputs);
  }
}
class Choose extends Union {
  build(nodes:Runtime.Node[], inputs:Register[]):Runtime.Node {
    return new Runtime.ChooseFlow(nodes, inputs);
  }
}

//--------------------------------------------------------------------
// Program
//--------------------------------------------------------------------

// You can specify changes as either [e,a,v] or [e,a,v,round,count];
export type EAVTuple = [RawValue, RawValue, RawValue];
export type EAVRCTuple = [RawValue, RawValue, RawValue, number, number];
export type TestChange =  EAVTuple | EAVRCTuple;

export class Program {
  blocks:Runtime.Block[] = [];
  flows:LinearFlow[] = [];
  index:indexes.Index;
  nodeCount = 0;

  // protected _exporter?:runtime.Exporter;
  // protected _lastWatch?:number;
  // protected _watchers:{[id:string]: Watcher|undefined} = {};

  constructor(public name:string) {
    this.index = new indexes.HashIndex();
  }

  block(name:string, func:LinearFlowFunction) {
    let flow = new LinearFlow(func);
    let nodes = flow.compile();
    let block = new Runtime.Block(name, nodes, flow.context.maxRegisters);
    this.flows.push(flow);
    this.blocks.push(block);
    console.log(block);
    console.log(flow);
    // console.log(nodes);
    return this;
  }


  input(changes:Runtime.Change[]) {
    let trans = new Runtime.Transaction(changes[0].transaction, this.blocks, changes, /* this._exporter && this._exporter.handle */);
    trans.exec(this.index);
    return trans;
  }

  test(transaction:number, eavns:TestChange[]) {
    let changes:Runtime.Change[] = [];
    let trans = new Runtime.Transaction(transaction, this.blocks, changes, /* this._exporter && this._exporter.handle */);
    for(let [e, a, v, round = 0, count = 1] of eavns as EAVRCTuple[]) {
      let change = Runtime.Change.fromValues(e, a, v, "my-awesome-node", transaction, round, count);
      if(round === 0) {
        changes.push(change);
      } else {
        trans.output(change);
      }
    }
    trans.exec(this.index);
    console.info(trans.changes.map((change, ix) => `    <- ${change}`).join("\n"));
    return this;
  }

}
//--------------------------------------------------------------------
// Test
//--------------------------------------------------------------------

let p = new Program("test");

p.block("coolness", ({find, not, record, choose}) => {
  let person = find("person");
  let [info] = choose(() => {
    person.dog;
    return "cool";
  }, () => {
    return "not cool";
  });
  return [
    record("dog-less", {info})
  ]
})

p.test(1, [
  [1, "tag", "person"]
]);

p.test(2, [
  [1, "dog", 2],
  [2, "cat", 3]
]);

