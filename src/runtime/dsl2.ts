//@FIXME: This doesn't currently handle chooses/unions that rely on eachother.

//--------------------------------------------------------------------
// Javascript DSL for writing Eve programs
//--------------------------------------------------------------------

import {RawValue, Change, RawEAV, RawEAVC, Register, isRegister, GlobalInterner, ID, concatArray} from "./runtime";
import * as Runtime from "./runtime";
import * as indexes from "./indexes";
import {Watcher, Exporter, DiffConsumer, ObjectConsumer, RawRecord} from "../watchers/watcher";
import "./stdlib";
import {SumAggregate} from "./stdlib";
import {v4 as uuid} from "node-uuid";
import * as falafel from "falafel";

const UNASSIGNED = -1;
const operators:any = {
  "+": "math['+']",
  "-": "math['-']",
  "*": "math['*']",
  "/": "math['/']",
  ">": "compare['>']",
  ">=": "compare['>=']",
  "<": "compare['<']",
  "<=": "compare['<=']",
  "!=": "compare['!=']",
  "==": "compare['==']",
  "concat": "eve.internal.concat",
}

// There don't seem to be TypeScript definitions for these by default,
// so here we are.
declare var Proxy:new (obj:any, proxy:any) => any;

function isArray<T>(v:any): v is Array<T> {
  return v && v.constructor === Array;
}

function isASTString(thing:any) {
  return thing.value && typeof thing.value === "string";
}

function macro<FuncType extends Function>(func:FuncType, transform:(code:string, args:string[], name:string) => string):FuncType {
  let code = func.toString();
  // trim the function(...) { from the start and capture the arg names

  let name:string = "";
  code = code.replace(/function\s*(\w*)\s*/, (str:string, funcName:string) => {
    name = funcName;
    return "";
  })

  let functionArgs:string[] = [];
  code = code.replace(/\((.*)\)\s*\{/m, function(str:string, args:string) {
    functionArgs.push.apply(functionArgs, args.split(",").map((str) => str.trim()));
    return "";
  });
  // trim the final } since we removed the function bit
  code = code.substring(0, code.length - 1);
  code = transform(code, functionArgs, name);

  let neueFunc = (new Function(`
    return function ${name}(${functionArgs.join(", ")}) {
      ${code}
    };
  `))() as FuncType;

  return neueFunc;
}

//--------------------------------------------------------------------
// Reference
//--------------------------------------------------------------------

export type Value = Reference|RawValue;
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
    this.__owner = __owner || null;
    return proxied;
  }

  add(attrMap:{[attr:string]:Value|Value[]}):Reference;
  add(attribute:Value, value:Value|Value[]):Reference;
  add(attrMapOrAttr:Value|{[attr:string]:Value|Value[]}, value?:Value|Value[]):Reference {
    if(this.__owner instanceof Record) {
      // we only allow you to call add at the root context
      if(this.__context.parent) throw new Error("Add can't be called in a sub-block");
      if(isRawValue(attrMapOrAttr) || isReference(attrMapOrAttr)) {
        let attribute = attrMapOrAttr;
        if(value === undefined) throw new Error("Can't call add without a value.");
        this.__owner.add(this.__context, attribute, value);
      } else {
        for(let attribute of Object.keys(attrMapOrAttr)) {
          let value = attrMapOrAttr[attribute];
          this.__owner.add(this.__context, attribute, value);
        }
      }

      return this;
    } else {
      throw new Error("Can't call add on a non-record");
    }
  }

  // @TODO: allow free A's and V's here
  remove(attribute:Value, value:Value|Value[]):Reference {
    if(this.__owner instanceof Record) {
      // we only allow you to call remove at the root context
      if(this.__context.parent) throw new Error("Add can't be called in a sub-block");
      this.__owner.remove(this.__context, attribute, value);
      return this;
    } else {
      throw new Error("Can't call add on a non-record");
    }
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

  maybeInterned(ref:Reference|RawValue|undefined):Register|ID|undefined {
    if(ref === undefined) return;
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

type Node = Record | Insert | Fn | Not | Choose | Union | Aggregate | Lookup | Move;
export type LinearFlowFunction = (self:LinearFlow) => (Value|Value[])
type RecordAttributes = {[key:string]:Value|Value[]}
type FlowRecordArg = string | RecordAttributes

class FlowLevel {
  records:Record[] = [];
  lookups:Lookup[] = [];
  functions:Fn[] = [];
  aggregates:Aggregate[] = [];
  inserts:Insert[] = [];
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
      let notNodes = not.compile(toPass.concat(items));
      // @TODO: once we have multiple nodes in a not (e.g. aggs, or recursive not/choose/union)
      // this won't be sufficient.
      let notJoinNode = notNodes[0];
      join = new Runtime.AntiJoin(join, notJoinNode, not.getInputRegisters())
    }

    for(let choose of this.chooses) {
      // For why we pass items down, see the comment about not
      join = choose.compile(join);
    }

    for(let union of this.unions) {
      // For why we pass items down, see the comment about not
      join = union.compile(join);
    }

    for(let aggregate of this.aggregates) {
      let aggregateNode = aggregate.compile();
      join = new Runtime.MergeAggregateFlow(join, aggregateNode, aggregate.getInputRegisters(), aggregate.getOutputRegisters());
    }

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
  static CurrentID = 1;
  ID = DSLBase.CurrentID++;
}

export class LinearFlow extends DSLBase {
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
    let results = transformed.call(func, this) as Value[];
    if(isArray(results)) this.results = results;
    else if(results === undefined) this.results = [];
    else this.results = [results];
    for(let result of this.results) {
      if(isReference(result)) {
        this.context.register(result);
      }
    }
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
      let parts = name.replace(/\/\//gi, "/slash").split("/").map((v) => v === "slash" ? "/" : v);
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
    lib.compare["=="] = (a:any, b:any) => {
      this.context.getActive().equality(a, b);
      return b;
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

  gather = (...projection:Reference[]) => {
    let active = this.context.getActive();
    return new AggregateBuilder(active, projection);
  }

  //------------------------------------------------------------------
  // Compile
  //------------------------------------------------------------------

  unify() {
    this.context.unify();
  }

  compile(_:Node[] = []):Runtime.Node[] {
    let items:Node[] = []
    this.unify();
    let nodes:Runtime.Node[] = [];

    for(let move of this.context.getMoves()) {
      this.collect(move);
    }

    // Split our collector into levels
    let levels = this.collector.split();
    let localItems = items.slice();
    for(let level of levels) {
      nodes = level.compile(nodes, items, localItems);
      concatArray(localItems, level.toConstraints([]));
    }

    // all the inputs end up at the end
    let outputs:Runtime.OutputNode[] = [];
    for(let record of this.collector.inserts) {
      let compiled = record.compile();
      for(let node of compiled) {
        if(node instanceof Runtime.WatchNode) {
          nodes.push(node);
        } else {
          outputs.push(node as any); // @FIXME: types
        }
      }
    }
    if(outputs.length) {
      nodes.push(new Runtime.OutputWrapperNode(outputs));
    }

    this.levels = levels;
    return nodes;
  }

  //------------------------------------------------------------------
  // Function transformation
  //------------------------------------------------------------------

  transform(func:LinearFlowFunction) {
    return macro(func, this.transformCode);
  }

  transformCode = (code:string, functionArgs:string[]):string => {
    var output = falafel(`function f() { ${code} }`, function (node:any) {
      if (node.type === 'BinaryExpression') {
        let func = operators[node.operator] as string;
        if(node.operator === "+" && (isASTString(node.left) || isASTString(node.right))) {
          func = operators["concat"];
        }
        if(func) {
          node.update(`${functionArgs[0]}.lib.${func}(${node.left.source()}, ${node.right.source()})`)
        }
      }
    });
    let updated = output.toString();
    updated = updated.replace("function f() {", "");
    updated = updated.substring(0, updated.length - 1);
    return updated;
  }
}

//--------------------------------------------------------------------
// WatchFlow
//--------------------------------------------------------------------

export class WatchFlow extends LinearFlow {
  collect(node:Node) {
    if(!(node instanceof Watch) && node instanceof Insert) {
      node = node.toWatch();
      return;
    }
    super.collect(node);
  }
}

//--------------------------------------------------------------------
// CommitFlow
//--------------------------------------------------------------------

export class CommitFlow extends LinearFlow {
  collect(node:Node) {
    if(!(node instanceof CommitInsert) && !(node instanceof CommitRemove) && node instanceof Insert) {
      node = node.toCommit();
      return;
    }
    super.collect(node);
  }
}

//--------------------------------------------------------------------
// DSL runtime types
//--------------------------------------------------------------------

//--------------------------------------------------------------------
// Record
//--------------------------------------------------------------------

export class Record extends DSLBase {
  attributes:Value[];
  constructor(public context:ReferenceContext, tags:string[] = [], attributes:RecordAttributes = {}, public record?:Reference) {
    super();
    if(!record) {
      this.record = this.createReference();
    }
    let attrs:Value[] = [];
    for(let tag of tags) {
      attrs.push("tag", tag);
    }
    let keys = Object.keys(attributes).sort();
    for(let attr of keys) {
      let value = attributes[attr];
      if(isArray(value)) {
        for(let current of value) {
          if(isReference(value)) context.register(value as Reference);
          attrs.push(attr, current);
        }
      } else {
        if(isReference(value)) context.register(value as Reference);
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

  add(context:ReferenceContext, attribute:Value, value:Value|Value[]) {
    let insert = new Insert(context, [], {}, this.reference());
    if(!isArray(value)) {
      insert.add(context, attribute, value);
    } else {
      for(let v of value) {
        insert.add(context, attribute, v);
      }
    }
  }

  remove(context:ReferenceContext, attribute:Value, value:Value|Value[]) {
    let insert = new Insert(context, [], {}, this.reference());
    if(!isArray(value)) {
      insert.remove(context, attribute, value);
    } else {
      for(let v of value) {
        insert.remove(context, attribute, v);
      }
    }
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
      constraints.push(new Runtime.Scan(e, context.interned(a), context.interned(v), Runtime.IGNORE_REG))
    }
    return constraints;
  }
}

//--------------------------------------------------------------------
// Lookup
//--------------------------------------------------------------------

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

//--------------------------------------------------------------------
// Move
//--------------------------------------------------------------------

class Move extends DSLBase {
  public to:Reference;
  constructor(public context:ReferenceContext, public from:Value, to?:Reference) {
    super();
    if(!to) {
      if(!isReference(from)) throw new Error("Move where the to is not a reference");
      this.to = from;
    } else {
      this.to = to;
    }
  }

  getInputRegisters():Register[] {
    let value = this.context.getValue(this.from);
    if(isRegister(value)) {
      return [value];
    }
    return [];
  }

  getOutputRegisters():Register[] {
    let {to} = this;
    let parent = to.__context.getValue(to) as Register;
    return [parent];
  }

  compile():Runtime.Constraint[] {
    let {from, to} = this;
    let local = this.context.interned(from);
    let parent = to.__context.getValue(to) as Register;
    return [new Runtime.MoveConstraint(local, parent)];
  }
}

//--------------------------------------------------------------------
// Insert
//--------------------------------------------------------------------

export class Insert extends Record {

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

  add(context:ReferenceContext, attribute:Value, value:Value|Value[]) {
    if(!isArray(value)) {
      this.attributes.push(attribute, value);
    } else {
      for(let v of value) {
        this.attributes.push(attribute, v);
      }
    }
    return this.reference();
  }

  remove(context:ReferenceContext, attribute:Value, value:Value|Value[]) {
    let remove = new Remove(context, [], {}, this.record);
    if(!isArray(value)) {
      remove.attributes.push(attribute, value);
    } else {
      for(let v of value) {
        remove.attributes.push(attribute, v);
      }
    }
    return this.reference();
  }

  toWatch() {
    let watch = new Watch(this.context, [], {}, this.record);
    watch.attributes = this.attributes;
    return watch;
  }

  toCommit() {
    let commit = new CommitInsert(this.context, [], {}, this.record);
    commit.attributes = this.attributes;
    return commit;
  }

  compile():any[] {
    let {attributes, context} = this;
    let nodes = [];
    let e = context.interned(this.record!);
    for(let ix = 0, len = attributes.length; ix < len; ix += 2) {
      let a = attributes[ix];
      let v = attributes[ix + 1];
      // @TODO: get a real node id
      let n = uuid();
      nodes.push(new Runtime.InsertNode(e, context.interned(a), context.interned(v), context.interned(n)))
    }
    return nodes;
  }
}

//--------------------------------------------------------------------
// Remove
//--------------------------------------------------------------------

class Remove extends Insert {
  toCommit() {
    let commit = new CommitRemove(this.context, [], {}, this.record);
    commit.attributes = this.attributes;
    return commit;
  }

  compile():any[] {
    let {attributes, context} = this;
    let nodes = [];
    let e = context.interned(this.record!);
    for(let ix = 0, len = attributes.length; ix < len; ix += 2) {
      let a = attributes[ix];
      let v = attributes[ix + 1];

      // @TODO: get a real node id
      let n = uuid();
      let internedV:any = context.maybeInterned(v); // @FIXME
      internedV = internedV !== undefined ? internedV : Runtime.IGNORE_REG;
      nodes.push(new Runtime.RemoveNode(e, context.interned(a), internedV, context.interned(n)));
    }
    return nodes;
  }
}


//--------------------------------------------------------------------
// Watch
//--------------------------------------------------------------------

class Watch extends Insert {
  compile():(Runtime.Node|Runtime.Scan)[] {
    let {attributes, context} = this;
    let nodes = [];
    let e = context.interned(this.record!);
    for(let ix = 0, len = attributes.length; ix < len; ix += 2) {
      let a = attributes[ix];
      let v = attributes[ix + 1];
      // @TODO: get a real node id
      let n = uuid();
      nodes.push(new Runtime.WatchNode(e, context.interned(a), context.interned(v), context.interned(n), context.flow.ID));
    }
    return nodes;
  }
}

//--------------------------------------------------------------------
// CommitInsert
//--------------------------------------------------------------------

class CommitInsert extends Insert {
  compile():any[] {
    let {attributes, context} = this;
    let nodes = [];
    let e = context.interned(this.record!);
    for(let ix = 0, len = attributes.length; ix < len; ix += 2) {
      let a = attributes[ix];
      let v = attributes[ix + 1];
      // @TODO: get a real node id
      let n = uuid();
      nodes.push(new Runtime.CommitInsertNode(e, context.interned(a), context.interned(v), context.interned(n)));
    }
    return nodes;
  }
}

//--------------------------------------------------------------------
// CommitRemove
//--------------------------------------------------------------------

class CommitRemove extends Remove {
  compile():any[] {
    let {attributes, context} = this;
    let nodes = [];
    let e = context.interned(this.record!);
    for(let ix = 0, len = attributes.length; ix < len; ix += 2) {
      let a = attributes[ix];
      let v = attributes[ix + 1];
      // @TODO: get a real node id
      let n = uuid();
      let internedV:any = context.maybeInterned(v); // @FIXME
      internedV = internedV !== undefined ? internedV : Runtime.IGNORE_REG;
      nodes.push(new Runtime.CommitRemoveNode(e, context.interned(a), internedV, context.interned(n)));
    }
    return nodes;
  }
}

//--------------------------------------------------------------------
// Fn
//--------------------------------------------------------------------

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

//--------------------------------------------------------------------
// Aggregate
//--------------------------------------------------------------------

class Aggregate extends DSLBase {
  output: Reference;

  constructor(public context:ReferenceContext, public aggregate:any, public projection:Reference[], public group:Reference[], public args:Value[], output?:Reference) {
    super();
    if(output) {
      this.output = output;
    } else {
      this.output = Reference.create(context, this);
    }

    // add all of our args to our projection
    for(let arg of args) {
      if(isReference(arg)) {
        projection.push(arg);
      }
    }
    context.flow.collect(this);
  }

  getInputRegisters():Register[] {
    let {context} = this;
    let items = concatArray([], this.args);
    if(this.aggregate === Runtime.SortNode) {
      concatArray(items, this.projection);
    }
    concatArray(items, this.group);
    return items.map((v) => context.getValue(v)).filter(isRegister) as Register[];
  }

  getOutputRegisters():Register[] {
    // @TODO: should this blow up if it doesn't resolve to a register?
    let value = this.context.getValue(this.output);
    return [value as Register];
  }

  compile() {
    let {context} = this;
    let groupRegisters = this.group.map((v) => context.getValue(v)).filter(isRegister);
    let projectRegisters = this.projection.map((v) => context.getValue(v)).filter(isRegister);
    let inputs = this.args.map((v) => context.interned(v));
    let agg = new this.aggregate(groupRegisters, projectRegisters, inputs, this.getOutputRegisters());
    return agg;
  }

  reference():Reference {
    return this.output;
  }

  per(...args:Reference[]) {
    for(let arg of args) {
      this.group.push(arg);
    }
  }
}

class AggregateBuilder {

  group:Reference[] = [];

  constructor(public context:ReferenceContext, public projection:Reference[]) {
  }

  per(...args:Reference[]) {
    for(let arg of args) {
      this.group.push(arg);
    }
    return this;
  }

  checkBlock() {
    let active = this.context.getActive();
    if(active !== this.context) throw new Error("Cannot gather in one scope and aggregate in another");
  }

  sum(value:Reference):any {
    this.checkBlock();
    let agg = new Aggregate(this.context, SumAggregate, this.projection, this.group, [value]);
    return agg.reference();
  }

  count():any {
    this.checkBlock();
    let agg = new Aggregate(this.context, SumAggregate, this.projection, this.group, [1]);
    return agg.reference();
  }

  sort(...directions:Value[]):any {
    this.checkBlock();
    let agg = new Aggregate(this.context, Runtime.SortNode, this.projection, this.group, directions);
    return agg.reference();
  }

}

//--------------------------------------------------------------------
// Not
//--------------------------------------------------------------------

class Not extends LinearFlow {
  constructor(func:LinearFlowFunction, parent:LinearFlow) {
    super(func, parent);
    parent.collect(this);
  }
}

//--------------------------------------------------------------------
// Union
//--------------------------------------------------------------------

class Union extends DSLBase {
  branches:LinearFlow[] = [];
  results:Reference[] = [];
  inputs:Reference[] = [];
  branchInputs:Reference[][] = [];

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
        throw new Error(`Choose branch ${ix} doesn't have the right number of returns. I expected ${resultCount}, but got ${branchResultCount}`);
      }
      let branchInputs:Reference[] = this.branchInputs[ix] = [];
      for(let ref of flow.context.getInputReferences()) {
        if(this.inputs.indexOf(ref) === -1) {
          this.inputs.push(ref);
        }
        branchInputs.push(ref);
      }
      let resultIx = 0;
      for(let result of this.results) {
        flow.collect(new Move(flow.context, flow.results[resultIx], result));
        resultIx++;
      }
      branches.push(flow);
      ix++;
    }
    context.flow.collect(this);
  }

  getInputRegisters() {
    let {context} = this;
    let inputs = this.inputs.map((v) => context.getValue(v)).filter(isRegister) as Register[];
    return inputs;
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

  build(left: Runtime.Node, nodes:Runtime.Node[], inputs:Register[][], outputs:Register[]):Runtime.Node {
    return new Runtime.UnionFlow(left, nodes, inputs, outputs);
  }

  compile(join:Runtime.Node) {
    let {context, branchInputs} = this;
    let nodes:Runtime.Node[] = [];
    let inputs:Register[][] = [];
    let outputs = this.getOutputRegisters();
    let ix = 0;
    for(let flow of this.branches) {
      let compiled = flow.compile();
      if(compiled.length > 1) {
        nodes.push(new Runtime.LinearFlow(compiled));
      } else {
        nodes.push(compiled[0]);
      }
      // @NOTE: Not sure why TS isn't correctly pegging this as filtered to only Registers already.
      inputs.push(branchInputs[ix].map((v) => context.getValue(v)).filter(isRegister) as Register[]);
      ix++;
    }
    return this.build(join, nodes, inputs, this.getOutputRegisters());
  }
}

//--------------------------------------------------------------------
// Choose
//--------------------------------------------------------------------

class Choose extends Union {
  build(left: Runtime.Node, nodes:Runtime.Node[], inputs:Register[][], outputs:Register[]):Runtime.Node {
    return new Runtime.ChooseFlow(left, nodes, inputs, outputs);
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
  context:Runtime.EvaluationContext;
  blocks:Runtime.Block[] = [];
  flows:LinearFlow[] = [];
  index:indexes.Index;
  nodeCount = 0;
  nextTransactionId = 0;

  protected exporter = new Exporter();
  protected lastWatch?:number;
  protected watchers:{[id:string]: Watcher|undefined} = {};
  protected _constants?:{[key:string]: RawValue};

  constructor(public name:string) {
    this.index = new indexes.HashIndex();
    this.context = new Runtime.EvaluationContext(this.index);
  }

  constants(obj:{[key:string]: RawValue}) {
    if(!this._constants) this._constants = {};
    for(let constant in obj) {
      if(this._constants[constant] && this._constants[constant] !== obj[constant]) {
        // throw new Error("Unable to rebind existing constant");
      }
      this._constants[constant] = obj[constant];
    }

    return this;
  }

  injectConstants(func:LinearFlowFunction):LinearFlowFunction {
    if(!this._constants) return func;
    return macro(func, (code) => {
      let constants = this._constants!;
      for(let constant in constants) {
        code = code.replace(new RegExp(`{{${constant}}}`, "gm"), "" + constants[constant]);
      }
      return code;
    });
  }

  clear() {
    this.index = new indexes.HashIndex();
    this.context = new Runtime.EvaluationContext(this.index);
  }

  _block(name:string, flow:LinearFlow) {
    let nodes = flow.compile();
    let block = new Runtime.Block(name, nodes, flow.context.maxRegisters);
    this.flows.push(flow);
    this.blocks.push(block);
    return block;
  }

  block(name:string, func:LinearFlowFunction) {
    let flow = new LinearFlow(this.injectConstants(func));
    this._block(name, flow);
    return this;
  }

  blockChangeTransaction(added:Runtime.Block[], removed:Runtime.Block[]) {
    for(let remove of removed) {
      let ix = this.blocks.indexOf(remove)
      this.blocks.splice(ix, 1);
    }
    // console.time("input");
    let trans = new Runtime.BlockChangeTransaction(this.context, this.nextTransactionId++, added, removed, this.blocks, this.lastWatch ? this.exporter.handle : undefined);
    trans.exec(this.context);
    // console.timeEnd("input");
    // console.info(trans.changes.map((change, ix) => `    <- ${change}`).join("\n"));
    return trans;
  }

  input(changes:Runtime.Change[]) {
    // console.time("input");
    if(changes[0].transaction >= this.nextTransactionId) this.nextTransactionId = changes[0].transaction + 1;
    let trans = new Runtime.Transaction(this.context, changes[0].transaction, this.blocks, this.lastWatch ? this.exporter.handle : undefined);
    for(let change of changes) {
      trans.output(this.context, change);
    }
    trans.exec(this.context);
    // console.timeEnd("input");
   //  console.info(trans.changes.map((change, ix) => `    <- ${change}`).join("\n"));

    // @FIXME: Remove debugging after diagnosing compiler issue
    // let g:any = global;
    // let compilerIds = g.compilerIds = g.compilerIds || [];
    // for(let change of trans.changes) {
    //   if(change.a == GlobalInterner.get("tag") && (""+GlobalInterner.reverse(change.v)).indexOf("eve/compiler/") == 0) {
    //     compilerIds.push(change.e);
    //   }
    // }

    // let filtered = trans.changes.filter((c) => compilerIds.indexOf(c.e) !== -1);
    // if(filtered.length) {
    //   console.log("---------------COMPILER-----------")
    //   console.log(filtered.map((change, ix) => `    <- ${change}`).join("\n"));
    // }

    return trans;
  }

  inputEavs(eavcs:(RawEAVC|RawEAV)[]) {
    let changes:Change[] = [];
    let transactionId = this.nextTransactionId++;
    for(let [e, a, v, c = 1] of eavcs as RawEAVC[]) {
      changes.push(Change.fromValues(e, a, v, "input", transactionId, 0, c));
    }
    return this.input(changes);
  }

  test(transaction:number, eavns:TestChange[]) {
    if("group" in console) console.group(this.name + " test " + transaction);
    if(transaction >= this.nextTransactionId) this.nextTransactionId = transaction + 1;
    let trans = new Runtime.Transaction(this.context, transaction, this.blocks, this.lastWatch ? this.exporter.handle : undefined);
    for(let [e, a, v, round = 0, count = 1] of eavns as EAVRCTuple[]) {
      let change = Runtime.Change.fromValues(e, a, v, "input", transaction, round, count);
      trans.output(this.context, change);
    }
    trans.exec(this.context);
    console.info(trans.changes.map((change, ix) => `    <- ${change}`).join("\n"));
    if("group" in console) console.groupEnd();
    return this;
  }

  commit(name:string, func:LinearFlowFunction) {
    let flow = new CommitFlow(this.injectConstants(func));
    let nodes = flow.compile();
    let block = new Runtime.Block(name, nodes, flow.context.maxRegisters);
    this.flows.push(flow);
    this.blocks.push(block);
    return this;
  }

  attach(id:string) {
    let WatcherConstructor = Watcher.get(id);
    if(!WatcherConstructor) throw new Error(`Unable to attach unknown watcher '${id}'.`);
    if(this.watchers[id]) return this.watchers[id];
    let watcher = new WatcherConstructor(this);
    this.watchers[id] = watcher;
    return watcher;
  }

  _watch(name:string, flow:WatchFlow) {
    let nodes = flow.compile();
    let block = new Runtime.Block(name, nodes, flow.context.maxRegisters);
    this.lastWatch = flow.ID;
    this.flows.push(flow);
    this.blocks.push(block);
    return block;
  }

  watch(name:string, func:LinearFlowFunction) {
    let flow = new WatchFlow(this.injectConstants(func));
    this._watch(name, flow);
    return this;
  }

  asDiffs(handler:DiffConsumer) {
    if(!this.lastWatch) throw new Error("Must have at least one watch block to export as diffs.");
    this.exporter.triggerOnDiffs(this.lastWatch, handler);

    return this;
  }

  asObjects<Pattern extends RawRecord>(handler:ObjectConsumer<Pattern>) {
    if(!this.exporter || !this.lastWatch) throw new Error("Must have at least one watch block to export as diffs.");
    this.exporter.triggerOnObjects(this.lastWatch, handler);

    return this;
  }
}
