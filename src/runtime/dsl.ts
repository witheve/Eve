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

//--------------------------------------------------------------------
// DSLVariable
//--------------------------------------------------------------------

type DSLValue = RawValue|Register;
class DSLVariable {
  static CURRENT_ID = 0;
  id: number;
  constructor(public name:string, public value:DSLValue = new Register(UNASSIGNED)) {
    this.id = DSLVariable.CURRENT_ID++;
  }
}

//--------------------------------------------------------------------
// DSLFunction
//--------------------------------------------------------------------

class DSLFunction {
  returnValue:DSLVariable;

  constructor(public block:DSLBlock, public path:string[], public args:any[]) {
    let name = this.path.join("/");
    let {filter} = FunctionConstraint.fetchInfo(name)
    if(filter) {
      this.returnValue = args[args.length - 1];
    } else {
      this.returnValue = new DSLVariable("returnValue");
    }
    block.registerVariable(this.returnValue);
  }

  compile() {
    let constraints:FunctionConstraint[] = [];
    let result = maybeIntern(this.block.toValue(this.returnValue));
    let values = this.args.map((v) => maybeIntern(this.block.toValue(v)))
    let name = this.path.join("/");
    let {variadic, filter} = FunctionConstraint.fetchInfo(name)
    let returns:any = {};
    if(!filter) {
      returns.result = this.block.toValue(this.returnValue);
    }
    constraints.push(FunctionConstraint.create(name, returns, values, !variadic) as FunctionConstraint);
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
    this.__record = new DSLVariable("record");
    __block.registerVariable(this.__record);
  }

  proxy() {
    return new Proxy(this, {
      get: (obj:any, prop:string) => {
        if(obj[prop]) return obj[prop];
        let found = obj.__fields[prop];
        if(prop === Symbol.toPrimitive) return () => {
          return "uh oh";
        }
        if(!found) {
          found = new DSLVariable(prop);
          obj.__fields[prop] = [found];
          this.__block.registerVariable(found);
        } else {
          found = found[0];
        }
        return found;
      },
      set: (obj:any, prop:string, value:any) => {
        if(obj[prop] !== undefined) {
          obj[prop] = value;
          return true;
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
        this.__block.equivalence(obj.__fields[prop][0], value);
      }
    })
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
        let value = this.__block.toValue(dslValue) as (RawValue | Register);
        // @TODO: generate node ids
        values.push(maybeIntern(value));
        inserts.push(new InsertNode(e, maybeIntern(field), maybeIntern(value), maybeIntern("my-awesome-node")))
      }
    }
    inserts.push(FunctionConstraint.create("eve/internal/gen-id", {result: e}, values) as FunctionConstraint);
    return inserts;

  }

  toScans() {
    let scans:Scan[] = [];
    let e = maybeIntern(this.__record.value);
    for(let field in this.__fields) {
      for(let dslValue of this.__fields[field]) {
        let value = this.__block.toValue(dslValue) as (RawValue | Register);
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
  variableLookup:{[name:number]:DSLVariable[]} = {};
  block:runtime.Block;

  constructor(public name:string, public creationFunction:string) {
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
    let neueFunc = new Function(functionArgs[0], functionArgs[1], functionArgs[2], code);
    neueFunc(this.find, this.record, this.generateLib());
    this.prepare();
  }

  generateLib() {
    let fnGet = (obj:any, prop:string) => {
      let path = obj.path || [];
      path.push(prop);
      let neue:any = () => {};
      neue.path = path;
      return new Proxy(neue, {
        get: fnGet,
        apply: (target:any, targetThis:any, args:any[]) => {
          let func = new DSLFunction(this, path, args);
          this.functions.push(func);
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

  registerVariable(variable:DSLVariable) {
    this.variableLookup[variable.id] = [variable];
  }

  toValue(a:any) {
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
    let aValue = this.toValue(a);
    let bValue = this.toValue(b);
    let aIsRegister = isRegister(aValue);
    let bIsRegister = isRegister(bValue);
    if(aIsRegister && bIsRegister) {
      let aVars = this.variableLookup[a.id];
      let bVars = this.variableLookup[b.id];
      for(let variable of aVars) {
        variable.value = bValue;
        bVars.push(variable);
      }
      this.variableLookup[a.id] = [];
    } else if(aIsRegister) {
      let aVars = this.variableLookup[a.id];
      for(let variable of aVars) {
        variable.value = bValue;
      }
      this.variableLookup[a.id] = [];
    } else if(bIsRegister) {
      let bVars = this.variableLookup[b.id];
      for(let variable of bVars) {
        variable.value = aValue;
      }
      this.variableLookup[b.id] = [];
    } else if(aValue !== bValue) {
      throw new Error(`Trying to equivalence two static values that aren't the same: ${aValue} and ${bValue}`);
    }
  }

  prepare() {
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
      this.equivalence(func.args[0], func.args[1]);
      functions[ix] = undefined;
      ix++;
    }
    let registerIx = 0;
    for(let id in this.variableLookup) {
      let variable = this.variableLookup[id][0] as DSLVariable;
      if(!variable || !isRegister(variable.value)) continue;
      if(variable.value.offset !== UNASSIGNED) throw new Error("We've somehow already assigned a variable's register");
      variable.value.offset = registerIx++;
    }
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

  //-------------------------------------------------------------------
  // Code transforms
  //--------------------------------------------------------------------

  transformBlockCode(code:string, functionArgs:string[]):string {

    let libArg = functionArgs[2];
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
// Program
//--------------------------------------------------------------------

export class Program {
  blocks:DSLBlock[] = [];
  runtimeBlocks:runtime.Block[] = [];
  index:indexes.Index;
  constructor(public name:string) {
    this.index = new indexes.HashIndex();
  }

  block(name:string, func:any) {
    let block = new DSLBlock(name, func);
    this.blocks.push(block);
    this.runtimeBlocks.push(block.block);
  }

  input(changes:runtime.Change[]) {
    let trans = new runtime.Transaction(changes[0].transaction, this.runtimeBlocks, changes);
    trans.exec(this.index);
    // console.log(trans.changes.map((change, ix) => `    <- ${change}`).join("\n"));
    return trans;
  }
}
