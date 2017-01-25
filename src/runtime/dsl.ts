//--------------------------------------------------------------------
// Javascript DSL for writing Eve programs
//--------------------------------------------------------------------

// There don't seem to be TypeScript definitions for these by default,
// so here we are.
declare var Proxy:new (obj:any, proxy:any) => any;
declare var Symbol:any;

import {RawValue, Register, isRegister, GlobalInterner, Scan, IGNORE_REG, ID, InsertNode, Node, Constraint, FunctionConstraint} from "./runtime";

//--------------------------------------------------------------------
// Utils
//--------------------------------------------------------------------

function maybeIntern(value:(RawValue|Register)):Register|ID {
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
  constructor(public name:string, public value:DSLValue = new Register(-1)) {
    this.id = DSLVariable.CURRENT_ID++;
  }
}

//--------------------------------------------------------------------
// DSLFunction
//--------------------------------------------------------------------

class DSLFunction {
  returnValue:DSLVariable;

  constructor(public block:DSLBlock, public path:string[], public args:any[]) {
    this.returnValue = new DSLVariable("record");
    block.registerVariable(this.returnValue);
  }

  compile() {
    return [{type: "foo"}];
  }
}

//--------------------------------------------------------------------
// DSLRecord
//--------------------------------------------------------------------

class DSLRecord {
  record: DSLVariable;
  output: boolean;
  fields: any;
  constructor(public block:DSLBlock, public tag:string[], initial:any) {
    let fields:any = {tag};
    for(let field in initial) {
      let value = initial[field];
      if(field.constructor !== Array) {
        value = [value];
      }
      fields[field] = value;
    }
    this.fields = fields;
    this.record = new DSLVariable("record");
    block.registerVariable(this.record);
  }

  proxy() {
    return new Proxy(this, {
      get: (obj:any, prop:string) => {
        let found = obj[prop] || obj.fields[prop];
        if(prop === Symbol.toPrimitive) return () => {
          return "uh oh";
        }
        if(!found) {
          let found = new DSLVariable(prop);
          obj.fields[prop] = [found];
          this.block.registerVariable(found);
        }
        return found;
      },
      set: (obj:any, prop:string, value:any) => {
        if(prop === "output") {
          obj[prop] = value;
          return true;
        }
        if(!obj.fields[prop]) {
          if(value.constructor !== Array) {
            value = [value];
          }
          obj.fields[prop] = value;
          return true;
        }
        this.block.equivalence(obj.fields[prop][0], value);
      }
    })
  }

  compile() {
    if(this.output) {
      return this.toInserts();
    } else {
      return this.toScans();
    }
  }

  toInserts() {
    let inserts:(Constraint|Node)[] = [];
    let e = maybeIntern(this.record.value);
    let values = [];
    for(let field in this.fields) {
      console.log("FIELD", field, this.fields[field]);
      for(let dslValue of this.fields[field]) {
        let value = this.block.toValue(dslValue) as (RawValue | Register);
        // @TODO: generate node ids
        console.log("ADDING", field, dslValue, value);
        values.push(maybeIntern(value));
        inserts.push(new InsertNode(e, maybeIntern(field), maybeIntern(value), maybeIntern("my-awesome-node")))
      }
    }
    inserts.push(FunctionConstraint.create("eve-internal/gen-id", {result: e}, values) as FunctionConstraint);
    return inserts;

  }

  toScans() {
    let scans:Scan[] = [];
    let e = maybeIntern(this.record.value);
    for(let field in this.fields) {
      for(let dslValue of this.fields[field]) {
        let value = this.block.toValue(dslValue) as (RawValue | Register);
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
    // console.log("tag", tag);
    let rec = new DSLRecord(this, tag, proxied);
    this.records.push(rec);
    return rec.proxy();
  }

  record = (...args:any[]) => {
    let out = this.find.apply(null, args);
    out.output = true;
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
      return a.record.value;
    } if(a instanceof DSLFunction) {
      return a.returnValue.value;
    }
    return a;
  }

  equivalence(a:any, b:any) {
    let aValue = a.value || (a.record && a.record.value) || a;
    let bValue = b.value || (b.record && b.record.value) || b;
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
    // look through the functions for equivalences before we do anything else.
    let ix = 0;
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
      if(variable.value.offset !== -1) throw new Error("We've somehow already assigned a variable's register");
      variable.value.offset = registerIx++;
    }
    let blockContents = [];
    for(let record of this.records) {
      let compiled = record.compile();
      if(!compiled) continue;
      for(let item of compiled) {
        blockContents.push(item);
      }
    }
    for(let func of functions) {
      if(!func) continue;
      let compiled = func.compile();
      if(!compiled) continue;
      for(let item of compiled) {
        blockContents.push(item);
      }
    }
    console.log(blockContents);
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
        strings.push(`${libArg}.string.concat(${left}, ${right})`);
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

class Program {
  blocks:DSLBlock[] = [];
  constructor(public name:string) {}

  block(name:string, func:any) {
    let block = new DSLBlock(name, func);
    this.blocks.push(block);
  }

  input(changes:any[]) {

  }


}

//--------------------------------------------------------------------
// Testing
//--------------------------------------------------------------------

let foo = new Program("foo");

foo.block("cool story", (find:any, record:any, lib:any) => {
  let person = find("person");
  let text = `text: ${person.name}`;
  return [
    record("html/div", {person, text})
  ]
})
