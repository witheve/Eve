//--------------------------------------------------------------------
// Javascript DSL for writing Eve programs
//--------------------------------------------------------------------

// There don't seem to be TypeScript definitions for these by default,
// so here we are.
declare var Proxy:new (obj:any, proxy:any) => any;
declare var Symbol:any;

import {RawValue, Register, isRegister, GlobalInterner, Scan, IGNORE_REG, ID,
        InsertNode, WatchNode, Node, Constraint, FunctionConstraint, Change, concatArray} from "./runtime";
import * as runtime from "./runtime";
import * as indexes from "./indexes";


const UNASSIGNED = -1;
var CURRENT_ID = 0;

//--------------------------------------------------------------------
// Utils
//--------------------------------------------------------------------

function toArray<T>(x:T|T[]):T[] {
  if(x.constructor === Array) return x as T[];
  return [x as T];
}

function maybeIntern(value:(RawValue|Register)):Register|ID {
  if(value === undefined || value === null) throw new Error("Trying to intern an undefined");
  if(isRegister(value)) return value;
  return GlobalInterner.intern(value);
}

function toValue(a?:DSLNode):DSLValue {
  if(a === undefined || a === null) throw new Error("Eve values can't be undefined or null");
  if(a instanceof DSLVariable) {
    return a.value;
  } if(a instanceof DSLRecord) {
    return a.__record.value;
  } if(a instanceof DSLFunction) {
    return a.returnValue.value;
  }
  return a;
}

function maybeVariable(maybeVariable?:DSLNode):DSLVariable|undefined {
    if(maybeVariable instanceof DSLVariable) {
    return maybeVariable;
  } else if(maybeVariable instanceof DSLRecord) {
    return maybeVariable.__record;
  } else if(maybeVariable instanceof DSLFunction) {
    return maybeVariable.returnValue;
  }
}

function toVariable(maybeVar?:DSLNode):DSLVariable {
  let maybe = maybeVariable(maybeVar);
  if(maybe) return maybe;
  console.error(maybeVar);
  throw new Error("Only variables and records can resolve to variables.");
}

function isRecord(a:any): a is DSLRecord {
  return a instanceof DSLRecord;
}

//--------------------------------------------------------------------
// DSLVariable
//--------------------------------------------------------------------

type DSLVariableParent = DSLFunction|DSLRecord|DSLLookup;
type DSLNode = DSLFunction|DSLRecord|DSLVariable|RawValue;

type DSLValue = RawValue|Register;
class DSLVariable {
  __id: number;
  constructor(public name:string, public parent?:DSLVariableParent, public value:DSLValue = new Register(UNASSIGNED)) {
    this.__id = CURRENT_ID++;
  }

  proxy() {
    return new Proxy(this, {
      get: (obj:any, prop:string) => {
        if(obj[prop]) return obj[prop];
        if(typeof prop === "symbol") return () => {
          return "uh oh";
        }

        if(!this.parent) {
          throw new Error("Cannot lookup attribute on unparented variable.");
        }

        let activeBlock = this.parent.__block.getActiveBlock();
        let record = activeBlock.getRecord(this);
        let prox = record.proxy();
        return prox[prop];
      },

      set: (obj:any, prop:string, value:any) => {
        if(obj[prop] !== undefined) {
          obj[prop] = value;
          return true;
        }
        throw new Error("@TODO: IMPLEMENT ME!")
      }
    });
  }
}

//--------------------------------------------------------------------
// DSLFunction
//--------------------------------------------------------------------

class DSLFunction {
  returnValue:DSLVariable;
  __id:number;

  constructor(public __block:DSLBlock, public path:string[], public args:any[], returnValue?:DSLVariable) {
    this.__id = CURRENT_ID++;
    let name = this.path.join("/");
    let {filter} = FunctionConstraint.fetchInfo(name)
    if(returnValue) {
      this.returnValue = returnValue;
    } else if(filter) {
      this.returnValue = args[args.length - 1];
    } else {
      this.returnValue = new DSLVariable("returnValue");
      __block.registerVariable(toVariable(this.returnValue));
    }
  }

  getInputRegisters() {
    return this.args.map((v) => toValue(v)).filter(isRegister);
  }

  getOutputRegisters() {
    let registers = [];
    let value = toValue(this.returnValue);
    if(isRegister(value)) {
      registers.push(value);
    }
    return registers;
  }

  compile() {
    let constraints:FunctionConstraint[] = [];
    let result = maybeIntern(toValue(this.returnValue));
    let values = this.args.map((v) => maybeIntern(toValue(v)))
    let name = this.path.join("/");
    let {variadic, filter} = FunctionConstraint.fetchInfo(name)
    let returns:any = {};
    if(!filter) {
      returns.result = toValue(this.returnValue);
    }
    let constraint;
    if(variadic) {
      constraint = FunctionConstraint.create(name, returns, values) as FunctionConstraint
    } else {
      constraint = FunctionConstraint.create(name, returns, []) as FunctionConstraint
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
// DSLLookup
//--------------------------------------------------------------------

class DSLLookup {
  __id:number;
  entity:DSLVariable;
  attribute:DSLVariable;
  value:DSLVariable;

  constructor(public __block:DSLBlock, entityObject: DSLRecord|DSLVariable) {
    this.__id = CURRENT_ID++;
    this.entity = toVariable(entityObject);
    this.attribute = new DSLVariable("lookup attribute", this);
    __block.registerVariable(this.attribute);
    this.value = new DSLVariable("lookup value", this);
    __block.registerVariable(this.value);
  }

  compile() {
    let scans:Scan[] = [];
    let e = maybeIntern(toValue(this.entity));
    let a = maybeIntern(toValue(this.attribute));
    let v = maybeIntern(toValue(this.value));
    scans.push(new Scan(e, a, v, IGNORE_REG))
    return scans;
  }

  getRegisters() {
    return [toValue(this.entity), toValue(this.attribute), toValue(this.value)];
  }
}

//--------------------------------------------------------------------
// DSLRecord
//--------------------------------------------------------------------

class DSLRecord {
  __id:number;
  // since we're going to proxy this object, we're going to hackily put __
  // in front of the names of properties on the object.
  __record: DSLVariable;
  // __output tells us whether this DSLRecord is a search or it's going to be
  // used to output new records (aka commit)
  __output: boolean = false;
  /** If a record is an output, it needs an id by default unless its modifying an existing record. */
  __needsId: boolean = true;

  __fields: {[field:string]: (RawValue|DSLNode)[]};
  __dynamicFields: [DSLVariable|string, DSLNode[]][] = [];
  constructor(public __block:DSLBlock, tags:string[], initialAttributes:any, entityVariable?:DSLVariable) {
    this.__id = CURRENT_ID++;
    let fields:any = {tag: tags};
    for(let field in initialAttributes) {
      let values = initialAttributes[field];
      if(values.constructor !== Array) {
        values = [values];
      }
      for(let value of values) {
        let variable = maybeVariable(value);
        if(variable && value.__block !== __block) {
          __block.registerInput(variable);
        }
      }
      fields[field] = values;
    }
    this.__fields = fields;
    if(entityVariable) {
      this.__record = entityVariable;
      this.__needsId = false;
    } else {
      this.__record = new DSLVariable("record", this);
    }
    __block.registerVariable(this.__record);
  }

  proxy() {
    return new Proxy(this, {
      get: (obj:any, prop:string) => {
        if(obj[prop]) return obj[prop];
        if(typeof prop === "symbol") return () => {
          return "uh oh";
        }

        let activeBlock = this.__block.getActiveBlock();
        let found = obj.__fields[prop];
        if(!found) {
          let record = activeBlock.getRecord(this.__record);
          if(record !== this) {
            obj = record.proxy();
            activeBlock.registerInput(record.__record);
          }

          found = new DSLVariable(prop, record).proxy();
          obj.__fields[prop] = [found];
          activeBlock.registerVariable(found);
        } else {
          found = found[0];
          if(this.__block !== activeBlock && maybeVariable(found)) {
            activeBlock.registerInput(found);
          }
        }
        return found;
      },
      set: (obj:any, prop:string, value:any) => {
        if(obj[prop] !== undefined) {
          obj[prop] = value;
          return true;
        }

        let activeBlock = this.__block.getActiveBlock();
        let record = activeBlock.getRecord(this.__record);
        if(record !== this) {
          obj = record.proxy();
          activeBlock.registerInput(record.__record);
        }

        if(!obj.__fields[prop]) {
          if(value.constructor !== Array) {
            value = [value];
          }
          obj.__fields[prop] = value;
          return true;
        }
        // @TODO: this only takes one of the potential values for this
        // field into account. We *should* be doing some kind of set equivalence
        // here in the future.
        if(obj.__fields[prop].length > 1) {
          console.warn(`\`${prop}\` is being equivalenced with multiple values: ${obj.__fields[prop]}`)
        }
        activeBlock.equivalence(obj.__fields[prop][0], value);
      }
    })
  }

  add(attributeName:string|DSLVariable, values:DSLNode|DSLNode[]) {
    if(this.__block !== this.__block.program.contextStack[0]) {
      throw new Error("Adds and removes may only happen in the root block.");
    }
    values = toArray(values);

    let record = new DSLRecord(this.__block, [], {}, this.__record);
    record.__output = true;
    this.__block.records.push(record);

    record.__dynamicFields.push([attributeName, values]);

    return this;
  }

  remove(attributeName:string, value?:DSLNode) {
    if(this.__block !== this.__block.program.contextStack[0]) {
      throw new Error("Adds and removes may only happen in the root block.");
    }
    throw new Error("@TODO: Implement me!");
  }

  compile() {
    if(this.__output) {
      return this.toInserts();
    } else {
      return this.toScans();
    }
  }

  precompile() {
    if(!this.__output || !this.__needsId) return;

    let values = [];
    for(let field in this.__fields) {
      for(let dslValue of this.__fields[field]) {
        let value = toValue(dslValue) as (RawValue | Register);
        values.push(value);
      }
    }
    let func = new DSLFunction(this.__block, ["eve/internal/gen-id"], values, this.__record);
    this.__block.functions.push(func);
  }

  toInserts() {
    let program = this.__block.program;
    let inserts:(Constraint|Node)[] = [];
    let e = maybeIntern(this.__record.value);

    for(let field in this.__fields) {
      for(let dslValue of this.__fields[field]) {
        let value = toValue(dslValue) as (RawValue | Register);
        if(this.__block.watcher) {
          inserts.push(new WatchNode(e, maybeIntern(field), maybeIntern(value), maybeIntern(program.nodeCount++), this.__block.__id))
        } else {
          inserts.push(new InsertNode(e, maybeIntern(field), maybeIntern(value), maybeIntern(program.nodeCount++)))
        }
      }
      for(let [dslField, dslValues] of this.__dynamicFields) {
        let field = toValue(dslField) as (RawValue | Register);
        for(let dslValue of dslValues) {
          let value = toValue(dslValue) as (RawValue | Register);
          if(this.__block.watcher) {
            inserts.push(new WatchNode(e, maybeIntern(field), maybeIntern(value), maybeIntern(program.nodeCount++), this.__block.__id))
          } else {
            inserts.push(new InsertNode(e, maybeIntern(field), maybeIntern(value), maybeIntern(program.nodeCount++)))
          }
        }
      }
    }

    return inserts;
  }

  toScans() {
    let scans:Scan[] = [];
    let e = maybeIntern(toValue(this.__record));
    for(let field in this.__fields) {
      for(let dslValue of this.__fields[field]) {
        let value = toValue(dslValue) as (RawValue | Register);
        scans.push(new Scan(e, maybeIntern(field), maybeIntern(value), IGNORE_REG))
      }
    }
    return scans;
  }

  getRegisters() {
    let registers:Register[] = [];
    let e = toValue(this.__record);
    if(isRegister(e)) {
      registers.push(e);
    }
    for(let field in this.__fields) {
      for(let dslValue of this.__fields[field]) {
        let value = toValue(dslValue) as (RawValue | Register);
        if(isRegister(value)) {
          registers.push(value);
        }
      }
    }
    return registers;
  }
}

//--------------------------------------------------------------------
// DSLBlock
//--------------------------------------------------------------------

type DSLCompilable = DSLRecord | DSLFunction;
export type BlockFunction = (block:DSLBlock) => any;

class DSLBlock {
  __id:number;
  records:DSLRecord[] = [];
  lookups:DSLLookup[] = [];
  variables:DSLVariable[] = [];
  functions:DSLFunction[] = [];
  cleanFunctions:(DSLFunction|undefined)[] = [];
  nots:DSLNot[] = [];
  chooses:DSLChoose[] = [];
  unions:DSLUnion[] = [];
  variableLookup:{[id:number]:DSLVariable[]} = {};
  inputVariables:{[id:number]:DSLVariable} = {};
  block:runtime.Block;
  returns:any[] = [];
  totalRegisters:number = 0;

  lib = this.generateLib();

  constructor(public name:string, public creationFunction:BlockFunction, public readonly program:Program, mangle = true, public readonly watcher = false) {
    this.__id = CURRENT_ID++;
    let neueFunc = creationFunction;
    if(mangle) {
      let functionArgs:string[] = [];
      let code = creationFunction.toString();
      // trim the function(...) { from the start and capture the arg names
      code = code.replace(/function\s*\((.*)\)\s*\{/, function(str:string, args:string) {
        functionArgs.push.apply(functionArgs, args.split(",").map((str) => str.trim()));
        return "";
      });
      // trim the final } since we removed the function bit
      code = code.substring(0, code.length - 1);
      code = this.transformBlockCode(code, functionArgs);
      neueFunc = new Function(functionArgs[0], code) as (block:DSLBlock) => any;
    }

    program.contextStack.push(this);
    let returns = neueFunc(this);
    if(returns === undefined) this.returns = [];
    else if(returns.constructor === Array) this.returns = returns;
    else this.returns = [returns];
    program.contextStack.pop();
  }

  /** The active block is the topmost block in the program's contextStack. Any new scans should be pushed there. */
  getActiveBlock() {
    let contextStack = this.program.contextStack;
    return contextStack[contextStack.length - 1];
  }

  getRecord(entityVariable:DSLVariable) {
    for(let subrecord of this.records) {
      if(subrecord.__record === entityVariable) {
        return subrecord;
      }
    }

    let subrecord = new DSLRecord(this, [], {}, entityVariable);
    this.records.push(subrecord);
    return subrecord;
  }

  generateLib() {
    let fnGet = (obj:any, prop:string) => {
      if(typeof prop === "symbol") return () => {
        return "uh oh";
      }
      let path = obj.path || [];
      path.push(prop);
      let neue:any = () => {};
      neue.path = path;
      return new Proxy(neue, {
        get: fnGet,
        apply: (target:any, targetThis:any, args:any[]) => {
          let activeBlock = this.getActiveBlock();
          let func = new DSLFunction(activeBlock, path, args);
          activeBlock.functions.push(func);
          return func;
        }});
    }
    return new Proxy({}, {get:fnGet});
  }

  // Find takes a list of tags followed optionally by an object of properties.
  // e.g. find("person", "employee", {name: "chris"})
  find = (...args:any[]) => {
    let lastArg = args[args.length - 1];
    let proxied:any = {};
    let tag;
    if(typeof lastArg === "object") {
      proxied = lastArg;
      tag = args.slice(0, args.length - 1);
    } else {
      tag = args.slice(0, args.length);
    }
    let active = this.getActiveBlock();
    let rec = new DSLRecord(active, tag, proxied);
    active.records.push(rec);
    return rec.proxy();
  }

  record = (...args:any[]) => {
    let out = this.find.apply(null, args);
    out.__output = true;
    return out;
  }

  not = (func:(block:DSLBlock) => void) => {
    let not = new DSLNot(`${this.name} NOT ${this.nots.length}`, func, this.program, false);
    this.nots.push(not);
  }

  lookup = (entityVariable:DSLVariable|DSLRecord) => {
    let active = this.getActiveBlock();
    let node = new DSLLookup(active, entityVariable);
    active.lookups.push(node);
    return node;
  }

  union = (...branches:(() => any)[]) => {
    let node = new DSLUnion(branches, this.program);
    this.unions.push(node);
    for(let result of node.results) {
      this.registerVariable(result);
    }
    return node.results[0];
  }

  choose = (...branches:(() => any)[]) => {
    let node = new DSLChoose(branches, this.program);
    this.chooses.push(node);
    for(let result of node.results) {
      this.registerVariable(result);
    }
    return node.results[0];
  }

  registerVariable(variable:DSLVariable) {
    let vars = this.variableLookup[variable.__id];
    if(vars) {
      if(vars.indexOf(variable) === -1) {
        vars.push(variable);
      }
    } else {
      this.variableLookup[variable.__id] = [variable];
    }
  }

  registerInput(variable:DSLVariable) {
    this.registerVariable(variable);
    this.inputVariables[variable.__id] = variable;
  }

  // This sets two potential values to be equivalent to each other. A value can be a:
  //  - DSLVariable
  //  - DSLRecord
  //  - DSLFunction
  //  - RawValue (string|number)
  // assuming there's at least one variable-like thing (one of the top 3 above), then
  // we need to set that variable's value based on the b argument's value. If both are
  // registers, then we unify the registers. If one is a RawValue, we overwrite the variable.value
  // of everybody that is referencing the variable to have the passed in RawValue.
  equivalence(a:any, b:any) {
    let aValue = toValue(a);
    let bValue = toValue(b);
    // console.log(a, "==", b);
    let aIsRegister = isRegister(aValue);
    let bIsRegister = isRegister(bValue);
    if(aIsRegister && bIsRegister) {
      let aVariable = toVariable(a);
      let bVariable = toVariable(b);
      let aVars = this.variableLookup[aVariable.__id];
      let bVars = this.variableLookup[bVariable.__id];
      for(let variable of aVars) {
        variable.value = bValue;
        bVars.push(variable);
      }
      this.variableLookup[aVariable.__id] = [];
    } else if(aIsRegister) {
      let aVariable = toVariable(a);
      let aVars = this.variableLookup[aVariable.__id];
      for(let variable of aVars) {
        variable.value = bValue;
      }
      this.variableLookup[aVariable.__id] = [];
    } else if(bIsRegister) {
      let bVariable = toVariable(b);
      let bVars = this.variableLookup[bVariable.__id];
      for(let variable of bVars) {
        variable.value = aValue;
      }
      this.variableLookup[bVariable.__id] = [];
    } else if(aValue !== bValue) {
      throw new Error(`Trying to equivalence two static values that aren't the same: ${aValue} and ${bValue}`);
    }
  }

  precompile() {
    this.program.contextStack.push(this);

    for(let record of this.records) {
      record.precompile();
    }

    this.program.contextStack.pop();
  }

  unify() {
    this.program.contextStack.push(this);

    // @NOTE: We need to unify all of our sub-blocks along with ourselves
    //        before the root node can allocate registers.
    for(let not of this.nots) {
      not.unify();
    }
    for(let choose of this.chooses) {
      choose.unify();
    }
    for(let union of this.unions) {
      union.unify();
    }

    let functions = this.functions.slice() as (DSLFunction | undefined)[];
    let ix = 0;
    // We need to satisfy all the equivalences before we start compiling our constraints.
    // Most of these are taken care of through assigments when the block's function was
    // run, but cases where people explicitly write `foo == bar` and the like end up as
    // functions whose path is ["compare", "=="]. So we'll run through the functions, find
    // all the equivalences, run this.equivalence on them to capture that intent, and remove
    // them from being executed.
    for(let func of functions) {
      if(!func || func.path[1] !== "==") continue;
      let aVar = maybeVariable(func.args[0]);
      let bVar = maybeVariable(func.args[1]);
      if(aVar && this.inputVariables[aVar.__id] ||
         bVar && this.inputVariables[bVar.__id]) {
        // @NOTE: We can't unify in this case since we'd pollute the parent's scope.
      } else {
        this.equivalence(func.args[0], func.args[1]);
        functions[ix] = undefined;
      }
      ix++;
    }

    this.cleanFunctions = functions;
    this.program.contextStack.pop();
  }

  allocateRegisters(registerIx = 0) {
    for(let id in this.variableLookup) {
      let variable = this.variableLookup[id][0] as DSLVariable;
      if(!variable || !isRegister(variable.value)) continue;
      if(variable.value.offset >= registerIx) throw new Error("We've somehow already assigned a variable's register");
      if(variable.value.offset === UNASSIGNED) variable.value.offset = registerIx++;
    }
    let totalRegisters = registerIx;
    for(let not of this.nots) {
      totalRegisters = Math.max(not.allocateRegisters(registerIx), totalRegisters);
    }
    for(let choose of this.chooses) {
      totalRegisters = Math.max(choose.allocateRegisters(registerIx), totalRegisters);
    }
    for(let union of this.unions) {
      totalRegisters = Math.max(union.allocateRegisters(registerIx), totalRegisters);
    }
    this.totalRegisters = totalRegisters;
    return registerIx;
  }

  splitIntoLevels() {
    let maxLevel = 0;
    // if a register can be filled from the database, it doesn't need to be up-leveled,
    // since we always have a value for it from the beginning. Let's find all of those
    // registers so we can ignore them in our functions
    let databaseSupported = concatArray([], this.records);
    concatArray(databaseSupported, this.lookups);
    let supported:boolean[] = [];
    for(let item of this.records) {
      if(item.__output) continue;
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
    for(let item of items) {
      for(let result of item.results) {
        let value = toValue(result);
        if(isRegister(value) && !supported[value.offset]) {
          let found = leveledRegisters[value.offset];
          if(!found) {
            found = leveledRegisters[value.offset] = {level: 1, providers: []};
          }
          leveledRegisters[value.offset].providers.push(item);
          providerToLevel[item.__id] = 1;
          changed = true;
          maxLevel = 1;
        }
      }
    }
    // go through all the functions, nots, chooses, and unions to see if they rely on
    // a register that has been leveled, if so, they need to move to a level after
    // the provider's heighest
    concatArray(items, this.cleanFunctions);
    concatArray(items, this.nots);
    let remaining = items.length;
    while(changed && remaining > -1) {
      changed = false;
      for(let item of items) {
        remaining--;
        if(!item) continue;

        let changedProvider = false;
        let providerLevel = providerToLevel[item.__id] || 0;
        for(let input of item.getInputRegisters()) {
          let inputInfo = leveledRegisters[input.offset];
          if(inputInfo && inputInfo.level > providerLevel) {
            changedProvider = true;
            providerLevel = inputInfo.level + 1;
          }
        }

        if(changedProvider) {
          providerToLevel[item.__id] = providerLevel;
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
    let levels:any = [];
    for(let ix = 0; ix <= maxLevel; ix++) {
      levels[ix] = {records: [], nots: [], lookups: [], chooses: [], unions: [], cleanFunctions: []};
    }

    // all database scans are at the first level
    for(let record of this.records) {
      if(record.__output) continue;
      levels[0].records.push(record);
    }
    for(let lookup of this.lookups) {
      levels[0].lookups.push(lookup);
    }

    // functions/nots/chooses/unions can all be in different levels
    for(let not of this.nots) {
      let level = providerToLevel[not.__id] || 0;
      levels[level].nots.push(not);
    }

    for(let func of this.cleanFunctions) {
      if(!func) continue;
      let level = providerToLevel[func.__id] || 0;
      levels[level].cleanFunctions.push(func);
    }

    for(let choose of this.chooses) {
      let level = providerToLevel[choose.__id] || 0;
      levels[level].chooses.push(choose);
    }

    for(let union of this.unions) {
      let level = providerToLevel[union.__id] || 0;
      levels[level].unions.push(union);
    }

    return levels;
  }

  compile(injections:(DSLCompilable|undefined)[] = []) {
    this.program.contextStack.push(this);
    let nodes:Node[] = [];
    let levels = this.splitIntoLevels();

    for(let level of levels) {
      let items:(DSLCompilable|undefined)[] = [];
      concatArray(items, injections);
      concatArray(items, level.cleanFunctions);
      concatArray(items, level.records);
      concatArray(items, level.lookups);
      let constraints = [];
      for(let toCompile of items) {
        if(!toCompile) continue;
        let compiled = toCompile.compile();
        if(!compiled) continue;
        for(let item of compiled) {
          if(item instanceof Scan || item instanceof FunctionConstraint) {
            constraints.push(item);
          }
        }
      }

      let join:Node;
      if(!nodes.length && constraints.length) {
        join = new runtime.JoinNode(constraints);
      } else if(constraints.length) {
        join = new runtime.DownstreamJoinNode(constraints);
      } else if(nodes.length) {
        join = nodes.pop() as Node;
      } else {
        throw new Error("Query with zero constraints.")
      }

      // @NOTE: We need to unify all of our sub-blocks along with ourselves
      //        before the root node can allocate registers.
      for(let not of level.nots) {
        // All sub blocks take their parents' items and embed them into
        // the sub block. This is to make sure that the sub only computes the
        // results that might actually join with the parent instead of the possibly
        // very large set of unjoined results. This isn't guaranteed to be optimal
        // and may very well cause us to do more work than necessary. For example if
        // the results of the inner join with many outers, we'll still enumerate the
        // whole set. This *may* be necessary for getting the correct multiplicities
        // anyways, so this is what we're doing.
        not.compile(items);
        // @TODO: once we have multiple nodes in a not (e.g. aggs, or recursive not/choose/union)
        // this won't be sufficient.
        let notJoinNode = not.block.nodes[0];
        let inputs = [];
        for(let id in not.inputVariables) {
          let value = not.inputVariables[id].value;
          if(isRegister(value)) {
            inputs.push(value);
          } else {
            throw new Error("Non-register input variable for not node");
          }
        }
        join = new runtime.AntiJoin(join, notJoinNode, inputs)
      }

      for(let choose of level.chooses) {
        // For why we pass items down, see the comment about not
        choose.compile(items);
        join = new runtime.BinaryJoinRight(join, choose.node, choose.node.registers);
      }

      for(let union of level.unions) {
        // For why we pass items down, see the comment about not
        union.compile(items);
        join = new runtime.BinaryJoinRight(join, union.node, union.node.registers);
      }

      nodes.push(join)
    }

    // all the inputs end up at the end
    for(let record of this.records) {
      if(!record.__output) continue;
      let compiled = record.compile();
      if(!compiled) continue;
      for(let node of compiled) {
        nodes.push(node as Node);
      }
    }

    this.block = new runtime.Block(this.name, nodes, this.totalRegisters);

    this.program.contextStack.pop();
  }

  prepare() {
    this.precompile();
    this.unify();
    this.allocateRegisters();
    this.compile();
  }

  //-------------------------------------------------------------------
  // Code transforms
  //--------------------------------------------------------------------

  transformBlockCode(code:string, functionArgs:string[]):string {

    let libArg = `${functionArgs[0]}.lib`;
    let hasChanged = true;
    let infixParam = "((?:(?:[a-z0-9_\.]+(?:\\[\".*?\"\\])?)+(?:\\(.*\\))?)|\\(.*\\))";
    let stringPlaceholder = "(____[0-9]+____)";

    let strings:string[] = [];
    code = code.replace(/"(?:[^"\\]|\\.)*"/gi, function(str) {
      strings.push(str);
      return "____" + (strings.length - 1) + "____";
    })

    // "foo" + person.name -> fn.eve.internal.concat("foo", person.name)
    // person.name + "foo" -> fn.eve.internal.concat(person.name, "foo")
    let stringAddition = new RegExp(`(?:${infixParam}\\s*\\+\\s*${stringPlaceholder})|(?:${stringPlaceholder}\\s*\\+\\s*${infixParam})`,"gi");
    hasChanged = true;
    while(hasChanged) {
      hasChanged = false;
      code = code.replace(stringAddition, (str, left, right, left2, right2) => {
        hasChanged = true;
        if(left === undefined) {
          left = left2;
          right = right2;
        }
        left = this.transformBlockCode(left, functionArgs);
        right = this.transformBlockCode(right, functionArgs);
        strings.push(`${libArg}.eve.internal.concat(${left}, ${right})`);
        return "____" + (strings.length - 1) + "____";
      })
    }

    let multiply = new RegExp(`${infixParam}\\s*(\\*|\\/)\\s*${infixParam}`, "gi");
    // a * b -> fn.math["*"](a, b)
    // a / b -> fn.math["/"](a, b)
    hasChanged = true;
    while(hasChanged) {
      hasChanged = false;
      code = code.replace(multiply, (str, left, op, right) => {
        hasChanged = true;
        left = this.transformBlockCode(left, functionArgs);
        right = this.transformBlockCode(right, functionArgs);
        strings.push(`${libArg}.math["${op}"](${left}, ${right})`)
        return "____" + (strings.length - 1) + "____";
      });
    }
    // a + b -> fn.math["+"](a, b)
    // a - b -> fn.math["-"](a, b)
    let add = new RegExp(`${infixParam}\\s*(\\+|\\-)\\s*${infixParam}`, "gi");
    hasChanged = true;
    while(hasChanged) {
      hasChanged = false;
      code = code.replace(add, (str, left, op, right) => {
        hasChanged = true;
        left = this.transformBlockCode(left, functionArgs);
        right = this.transformBlockCode(right, functionArgs);
        strings.push(`${libArg}.math["${op}"](${left}, ${right})`)
        return "____" + (strings.length - 1) + "____";
      });
    }
    // a > b -> fn.compare[">"](a, b)
    // for all the (in)equalities: >, >=, <, <=, !=, ==
    let compare = new RegExp(`${infixParam}\\s*(>|>=|<|<=|!=|==)\\s*${infixParam}`, "gi");
    hasChanged = true;
    while(hasChanged) {
      hasChanged = false;
      code = code.replace(compare, (str, left, op, right) => {
        hasChanged = true;
        left = this.transformBlockCode(left, functionArgs);
        right = this.transformBlockCode(right, functionArgs);
        strings.push(`${libArg}.compare["${op}"](${left}, ${right})`)
        return "____" + (strings.length - 1) + "____";
      });
    }

    hasChanged = true;
    while(hasChanged) {
      hasChanged = false;
      code = code.replace(/____([0-9]+)____/gi, function(str, index:string) {
        let found = strings[parseInt(index)];
        if(found) hasChanged = true;
        return found || str;
      })
    }
    return code;
  }
}

//--------------------------------------------------------------------
// DSLNot
//--------------------------------------------------------------------

class DSLNot extends DSLBlock {
  getInputRegisters() {
    let registers:Register[] = [];
    for(let key in this.inputVariables) {
      let value = toValue(this.inputVariables[key]);
      if(isRegister(value)) {
        registers.push(value);
      }
    }
    return registers;
  }
}

//--------------------------------------------------------------------
// DSLUnion
//--------------------------------------------------------------------

class DSLUnion {
  __id:number;
  branches:DSLBlock[] = [];
  results:DSLVariable[] = [];
  node:runtime.ChooseFlow;
  inputs:DSLVariable[] = [];
  nodeType:("ChooseFlow" | "UnionFlow") = "UnionFlow";

  constructor(branchFunctions: Function[], public program:Program) {
    this.__id = CURRENT_ID++;
    let {branches, results} = this;
    let ix = 0;
    let resultCount:number|undefined;
    for(let branch of branchFunctions) {
      let block = new DSLBlock(`choose branch ${ix}`, branch as (block:DSLBlock) => any, program, false)
      let branchResultCount = this.resultCount(block.returns);
      if(resultCount === undefined) {
        resultCount = branchResultCount;
        for(let resultIx = 0; resultIx < resultCount; resultIx++) {
          results.push(new DSLVariable(`choose result ${resultIx}`))
        }
      } else if(resultCount !== branchResultCount) {
        throw new Error(`Choose branch ${ix} doesn't have the right number of returns, I expected ${resultCount}, but got ${branchResultCount}`);
      }
      for(let key in block.inputVariables) {
        let variable = block.inputVariables[key];
        if(this.inputs.indexOf(variable) === -1) {
          this.inputs.push(variable);
        }
      }
      let resultIx = 0;
      for(let result of this.results) {
        block.registerVariable(result);
        block.equivalence(block.returns[resultIx], result);
        resultIx++;
      }
      branches.push(block);
      ix++;
    }
  }

  getInputRegisters() {
    return this.inputs.map(toValue).filter(isRegister);
  }

  getOutputRegisters() {
    return this.results.map(toValue).filter(isRegister);
  }

  resultCount(result:any):number {
    if(result && result.constructor === Array) {
      return result.length;
    } else if(result) {
      return 1;
    }
    return 0;
  }

  unify() {
    for(let block of this.branches) {
      block.unify();
    }
  }

  allocateRegisters(registerIx:number) {
    for(let block of this.branches) {
      block.allocateRegisters(registerIx);
    }
    return registerIx;
  }

  compile(items:(DSLCompilable|undefined)[]) {
    let nodes = [];
    for(let block of this.branches) {
      block.compile(items);
      // @TODO: when we have multiple nodes, this won't fly
      nodes.push(block.block.nodes[0]);
    }
    let inputs = this.inputs.map(toValue).filter(isRegister) as Register[];
    let builder = runtime[this.nodeType] as any;
    this.node = new builder(nodes, inputs);
  }
}

//--------------------------------------------------------------------
// DSLChoose
//--------------------------------------------------------------------

class DSLChoose extends DSLUnion {
  nodeType:("ChooseFlow"|"UnionFlow") = "ChooseFlow";
}

//--------------------------------------------------------------------
// Program
//--------------------------------------------------------------------

// You can specify changes as either [e,a,v] or [e,a,v,round,count];
export type EAVTuple = [RawValue, RawValue, RawValue];
export type EAVRCTuple = [RawValue, RawValue, RawValue, number, number];
export type TestChange =  EAVTuple | EAVRCTuple;

export class Program {
  blocks:DSLBlock[] = [];
  runtimeBlocks:runtime.Block[] = [];
  index:indexes.Index;
  nodeCount = 0;

  protected _exporter?:runtime.Exporter;
  protected _lastWatch?:number;

  /** Represents the hierarchy of blocks currently being compiled into runtime nodes. */
  contextStack:DSLBlock[] = [];

  constructor(public name:string) {
    this.index = new indexes.HashIndex();
  }

  block(name:string, func:BlockFunction) {
    let block = new DSLBlock(name, func, this, undefined, undefined);
    block.prepare();
    this.blocks.push(block);
    this.runtimeBlocks.push(block.block);

    return this;
  }

  watch(name:string, func:BlockFunction) {
    if(!this._exporter) this._exporter = new runtime.Exporter();
    let block = new DSLBlock(name, func, this, true, true);
    block.prepare();
    this.blocks.push(block);
    this.runtimeBlocks.push(block.block);
    this._lastWatch = block.__id;
    return this;
  }

  asDiffs(handler:runtime.DiffConsumer) {
    if(!this._exporter || !this._lastWatch) throw new Error("Must have at least one watch block to export as diffs.");
    this._exporter.triggerOnDiffs(this._lastWatch, handler);

    return this;
  }

  input(changes:runtime.Change[]) {
    let trans = new runtime.Transaction(changes[0].transaction, this.runtimeBlocks, changes, this._exporter && this._exporter.handle);
    trans.exec(this.index);
    return trans;
  }

  test(transaction:number, eavns:TestChange[]) {
    let changes:Change[] = [];
    let trans = new runtime.Transaction(transaction, this.runtimeBlocks, changes, this._exporter && this._exporter.handle);
    for(let [e, a, v, round = 0, count = 1] of eavns as EAVRCTuple[]) {
      let change = Change.fromValues(e, a, v, "my-awesome-node", transaction, round, count);
      if(round === 0) {
        changes.push(change);
      } else {
        trans.output(change);
      }
    }
    trans.exec(this.index);
    // console.log(trans.changes.map((change, ix) => `    <- ${change}`).join("\n"));
    return this;
  }
}

  // let prog = new Program("test");
  // prog.block("simple block", ({find, record, lib, choose, union, not, lookup}) => {
  //   let style = find("html/style");
  //   let {attribute, value} = lookup(style);
  //   return [
  //     record("html/eve/style", {style, k: value})//.add(attribute, value)
  //   ];
  // });
  // prog.block("simple block 2", ({find, record, lib, choose, union, not, lookup}) => {
  //   let elem = find("html/element");
  //   let style = elem.style;
  //   return [
  //     style.add("tag", "html/style")
  //   ];
  // });

  // prog.test(1, [
  //   [2, "tag", "html/element"],
  //   [2, "style", 3],
  //   [3, "color", "red"],
  // ]);

  // console.log(prog);
  // console.log(GlobalInterner);

  // let prog = new Program("test");
  // prog.block("simple block", ({find, record, lib, choose, union, not}) => {
  //   let elem = find("html/element");
  //   not(() => {
  //     find("html/element", {children: elem});
  //   });
  //   return [
  //     record("html/root", {element: elem, tagname: elem.tagname})
  //   ];
  // });

  // prog.test(1, [
  //   [2, "tag", "html/element"],
  //   [2, "tagname", "div"],
  //   [2, "children", 3],

  //   [3, "tag", "html/element"],
  //   [3, "tagname", "floop"],
  //   [3, "text", "k"],
  // ]);

  // prog.test(2, [
  //   [2, "children", 3, 0, -1],
  //   [3, "children", 2, 0, 1],
  // ]);

  // console.log(prog)

  // let prog = new Program("test");
  // prog.block("simple block", ({find, record, lib, choose, union}) => {
  //   let person = find("person");
  //   let foo = choose(() => {
  //     return person.nickName;
  //   }, () => {
  //     return person.name;
  //   })
  //   return [
  //     record("foo", {foo})
  //   ]
  // });
  // console.log(prog);

  // prog.test(1, [
  //   [1, "tag", "person"],
  //   [1, "name", "cool"],
  // ]);

  // prog.test(2, [
  //   [1, "nickName", "dude"],
  // ]);

  // prog.test(2, [
  //   [1, "nickName", "dude", 0, -1],
  // ]);

  // console.log(prog);

  // // -----------------------------------------------------
  // // program
  // // -----------------------------------------------------

  // let prog = new Program("test");
  // prog.block("simple block", ({find, record, lib}) => {
  //   let person = find("person");
  //   let text = `name: ${person.name}`;
  //   return [
  //     record("html/div", {person, text})
  //   ]
  // });

  // // -----------------------------------------------------
  // // verification
  // // -----------------------------------------------------


  // function doit(size = 10000, rounds = 8) {
  // let times = [];
  // for(let ix = 0; ix < rounds; ix++) {
  //   prog.index = new indexes.HashIndex();
  // let changes = [];
  // for(let i = 0; i < size; i++) {
  //   changes.push([runtime.Change.fromValues(i - 1, "name", i - 1,"foo",i,0,1), runtime.Change.fromValues(i, "tag", "person", "foo",i,0,1) ])
  // }

  // let start = performance.now();
  // // console.time();
  // for(let change of changes) {
  //   prog.input(change);
  // }
  // // console.timeEnd();
  // let end = performance.now();
  // // console.log(end - start)
  // times.push(end - start);
  // }

  // times.shift();
  // let average = times.reduce((a,b) => a + b) / times.length
  // console.log("Average: ", average.toFixed(3));
  // console.log("Max:", Math.max.apply(null, times).toFixed(3));
  // console.log("Min:", Math.min.apply(null, times).toFixed(3));
  // console.log("Per transaction: ", (average / size).toFixed(3));
  // console.log("Per fact: ", (average / (4 * size)).toFixed(3));
  // console.log("Times: ", times.map((x) => x.toFixed(3)));
  // }

  // window["doit"] = doit;
