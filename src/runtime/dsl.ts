//--------------------------------------------------------------------
// Javascript DSL for writing Eve programs
//--------------------------------------------------------------------

// There don't seem to be TypeScript definitions for these by default,
// so here we are.
declare var Proxy:new (obj:any, proxy:any) => any;
declare var Symbol:any;

import {RawValue, Register, isRegister, GlobalInterner, Scan, IGNORE_REG, ID,
        InsertNode, Node, Constraint, FunctionConstraint} from "./runtime";
import * as runtime from "./runtime";
import * as indexes from "./indexes";


const UNASSIGNED = -1;

//--------------------------------------------------------------------
// Utils
//--------------------------------------------------------------------

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

type DSLVariableParent = DSLFunction|DSLRecord;
type DSLNode = DSLFunction|DSLRecord|DSLVariable|RawValue;

type DSLValue = RawValue|Register;
class DSLVariable {
  static CURRENT_ID = 0;
  id: number;
  constructor(public name:string, public parent?:DSLVariableParent, public value:DSLValue = new Register(UNASSIGNED)) {
    this.id = DSLVariable.CURRENT_ID++;
  }
}

//--------------------------------------------------------------------
// DSLFunction
//--------------------------------------------------------------------

class DSLFunction {
  returnValue:DSLVariable;

  constructor(public __block:DSLBlock, public path:string[], public args:any[]) {
    let name = this.path.join("/");
    let {filter} = FunctionConstraint.fetchInfo(name)
    if(filter) {
      this.returnValue = args[args.length - 1];
    } else {
      this.returnValue = new DSLVariable("returnValue");
      __block.registerVariable(toVariable(this.returnValue));
    }
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
// DSLRecord
//--------------------------------------------------------------------

class DSLRecord {
  // since we're going to proxy this object, we're going to hackily put __
  // in front of the names of properties on the object.
  __record: DSLVariable;
  // __output tells us whether this DSLRecord is a search or it's going to be
  // used to output new records (aka commit)
  __output: boolean = false;
  /** If a record is an output, it needs an id by default unless its modifying an existing record. */
  __needsId: boolean = true;
  __fields: any;
  constructor(public __block:DSLBlock, tags:string[], initialAttributes:any) {
    let fields:any = {tag: tags};
    for(let field in initialAttributes) {
      let value = initialAttributes[field];
      if(field.constructor !== Array) {
        value = [value];
      }
      fields[field] = value;
    }
    this.__fields = fields;
    this.__record = new DSLVariable("record", this);
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
          let record = activeBlock.getRecord(this);
          if(record !== this) {
            obj = record.proxy();
          }

          found = new DSLVariable(prop, record);
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
        let record = activeBlock.getRecord(this);
        if(record !== this) {
          obj = record.proxy();
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

  add(attributeName:string, value:DSLNode) {
    if(this.__block !== this.__block.program.contextStack[0]) {
      throw new Error("Adds and removes may only happen in the root block.");
    }
    let record = new DSLRecord(this.__block, [], {[attributeName]: value});
    record.__output = true;
    record.__record = this.__record;
    record.__needsId = false;
    this.__block.records.push(record);
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

  toInserts() {
    let inserts:(Constraint|Node)[] = [];
    let e = maybeIntern(this.__record.value);
    let values = [];
    for(let field in this.__fields) {
      for(let dslValue of this.__fields[field]) {
        let value = toValue(dslValue) as (RawValue | Register);
        // @TODO: generate node ids
        values.push(maybeIntern(value));
        inserts.push(new InsertNode(e, maybeIntern(field), maybeIntern(value), maybeIntern("my-awesome-node")))
      }
    }
    if(this.__needsId) {
      inserts.push(FunctionConstraint.create("eve/internal/gen-id", {result: e}, values) as FunctionConstraint);
    }
    return inserts;
  }

  toScans() {
    let scans:Scan[] = [];
    let e = maybeIntern(this.__record.value);
    for(let field in this.__fields) {
      for(let dslValue of this.__fields[field]) {
        let value = toValue(dslValue) as (RawValue | Register);
        scans.push(new Scan(e, maybeIntern(field), maybeIntern(value), IGNORE_REG))
      }
    }
    return scans;
  }
}

//--------------------------------------------------------------------
// DSLBlock
//--------------------------------------------------------------------

class DSLBlock {
  records:DSLRecord[] = [];
  variables:DSLVariable[] = [];
  functions:DSLFunction[] = [];
  cleanFunctions:(DSLFunction|undefined)[] = [];
  nots:DSLNot[] = [];
  variableLookup:{[id:number]:DSLVariable[]} = {};
  inputVariables:{[id:number]:DSLVariable} = {};
  block:runtime.Block;

  lib = this.generateLib();

  constructor(public name:string, public creationFunction:(block:DSLBlock) => any, public readonly program:Program, mangle = true) {
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
    neueFunc(this);
    program.contextStack.pop();
  }

  /** The active block is the topmost block in the program's contextStack. Any new scans should be pushed there. */
  getActiveBlock() {
    let contextStack = this.program.contextStack;
    return contextStack[contextStack.length - 1];
  }

  getRecord(record:DSLRecord) {
    if(record.__block === this) return record;

    for(let subrecord of this.records) {
      if(subrecord.__record === record.__record) {
        return subrecord;
      }
    }

    let subrecord = new DSLRecord(this, [], {});
    subrecord.__record = record.__record;
    this.records.push(subrecord);
    this.registerInput(subrecord.__record);
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
    let rec = new DSLRecord(this, tag, proxied);
    this.records.push(rec);
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

  registerVariable(variable:DSLVariable) {
    console.log("registering", variable.name, "on", this.name);
    this.variableLookup[variable.id] = [variable];
  }

  registerInput(variable:DSLVariable) {
    this.registerVariable(variable);
    this.inputVariables[variable.id] = variable;
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
      let aVars = this.variableLookup[aVariable.id];
      let bVars = this.variableLookup[bVariable.id];
      for(let variable of aVars) {
        variable.value = bValue;
        bVars.push(variable);
      }
      this.variableLookup[aVariable.id] = [];
    } else if(aIsRegister) {
      let aVariable = toVariable(a);
      let aVars = this.variableLookup[aVariable.id];
      for(let variable of aVars) {
        variable.value = bValue;
      }
      this.variableLookup[aVariable.id] = [];
    } else if(bIsRegister) {
      let bVariable = toVariable(b);
      let bVars = this.variableLookup[bVariable.id];
      for(let variable of bVars) {
        variable.value = aValue;
      }
      this.variableLookup[bVariable.id] = [];
    } else if(aValue !== bValue) {
      throw new Error(`Trying to equivalence two static values that aren't the same: ${aValue} and ${bValue}`);
    }
  }

  unify() {
    // @NOTE: We need to unify all of our sub-blocks along with ourselves
    //        before the root node can allocate registers.
    for(let not of this.nots) {
      not.unify();
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
      if(aVar && this.inputVariables[aVar.id] ||
         bVar && this.inputVariables[bVar.id]) {
        // @NOTE: We can't unify in this case since we'd pollute the parent's scope.
      } else {
        this.equivalence(func.args[0], func.args[1]);
        functions[ix] = undefined;
      }
      ix++;
    }

    this.cleanFunctions = functions;
    return functions;
  }

  allocateRegisters() {
    let registerIx = 0;
    for(let id in this.variableLookup) {
      let variable = this.variableLookup[id][0] as DSLVariable;
      if(!variable || !isRegister(variable.value)) continue;
      if(variable.value.offset !== UNASSIGNED) throw new Error("We've somehow already assigned a variable's register");
      variable.value.offset = registerIx++;
    }
  }

  compile() {
    // @NOTE: We need to unify all of our sub-blocks along with ourselves
    //        before the root node can allocate registers.
    for(let not of this.nots) {
      not.compile();
    }

    let functions = this.cleanFunctions;
    let items = functions.concat(this.records as any[]);
    let constraints = [];
    let nodes = [];
    for(let toCompile of items) {
      if(!toCompile) continue;
      let compiled = toCompile.compile();
      if(!compiled) continue;
      for(let item of compiled) {
        if(item instanceof Scan || item instanceof FunctionConstraint) {
          constraints.push(item);
          // console.log(item);
        } else {
          nodes.push(item as Node);
        }
      }
    }
    // @TODO: Once we start having aggregates, we'll need to do some stratification here
    // instead of just throwing everything into a single JoinNode.
    nodes.unshift(new runtime.JoinNode(constraints))
    this.block = new runtime.Block(this.name, nodes);
  }

  prepare() {
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
}

//--------------------------------------------------------------------
// Program
//--------------------------------------------------------------------

export class Program {
  blocks:DSLBlock[] = [];
  runtimeBlocks:runtime.Block[] = [];
  index:indexes.Index;

  /** Represents the hierarchy of blocks currently being compiled into runtime nodes. */
  contextStack:DSLBlock[] = [];

  constructor(public name:string) {
    this.index = new indexes.HashIndex();
  }

  block(name:string, func:(block:DSLBlock) => any) {
    let block = new DSLBlock(name, func, this);
    block.prepare();
    this.blocks.push(block);
    console.log(block);
    this.runtimeBlocks.push(block.block);
  }

  input(changes:runtime.Change[]) {
    let trans = new runtime.Transaction(changes[0].transaction, this.runtimeBlocks, changes);
    trans.exec(this.index);
    // console.log(trans.changes.map((change, ix) => `    <- ${change}`).join("\n"));
    return trans;
  }
}


  // // -----------------------------------------------------
  // // program
  // // -----------------------------------------------------

  // let prog = new Program("test");
  // prog.block("simple block", (find:any, record:any, lib:any) => {
  //   let person = find("person");
  //   let text = `name: ${person.name}`;
  //   return [
  //     record("html/div", {person, text})
  //   ]
  // });

  // // -----------------------------------------------------
  // // verification
  // // -----------------------------------------------------

  // for(let ix = 0; ix < 1; ix++) {
  //   prog.index = new indexes.HashIndex();
  // let size = 10000;
  // let changes = [];
  // for(let i = 0; i < size; i++) {
  //   changes.push([runtime.Change.fromValues(i - 1, "name", i - 1,"foo",i,0,1), runtime.Change.fromValues(i, "tag", "person", "foo",i,0,1) ])
  // }

  // // let start = performance.now();
  // console.profile();
  // for(let change of changes) {
  //   prog.input(change);
  // }
  // console.profileEnd();
  // // let end = performance.now();
  // // console.log(end - start)
  // }
