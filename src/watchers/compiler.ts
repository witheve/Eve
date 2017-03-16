//--------------------------------------------------------------------
// The Eve compiler as a watcher
//--------------------------------------------------------------------

import {Watcher, RawValue, DiffConsumer} from "./watcher";
import {ID, Block} from "../runtime/runtime";
import {Program, LinearFlow, ReferenceContext, Reference, Record, Insert, Remove, Value, WatchFlow, CommitFlow} from "../runtime/dsl2";
import "setimmediate";

interface CompilationContext {
  variables: {[id:string]: Reference},
}

export class CompilerWatcher extends Watcher {

  blocksToCompile:{[blockID:string]: boolean} = {};
  blocksToRemove:{[blockID:string]: boolean} = {};
  blocks:{[blockID:string]: Block} = {};
  items:{[id:string]: any} = {};
  watcherFunctions:{[name:string]: DiffConsumer} = {};
  programToInjectInto = this.program;

  //------------------------------------------------------------------
  // Compile queue
  //------------------------------------------------------------------

  queued = false;
  queue(blockID:string, isAdd = true) {
    if(isAdd) this.blocksToCompile[blockID] = true;
    this.blocksToRemove[blockID] = true;

    if(!this.queued) {
      this.queued = true;
      setImmediate(this.runQueue)
    }
  }
  runQueue = () => {
    let adds = [];
    let removes = [];
    for(let ID in this.blocksToRemove) {
      if(!this.blocks[ID]) continue;
      removes.push(this.blocks[ID]);
      delete this.blocks[ID];
    }
    for(let ID in this.blocksToCompile) {
      if(!this.items[ID]) continue;
      let neue = this.compileBlock(ID);
      adds.push(neue);
      this.blocks[ID] = neue;
    }
    this.programToInjectInto.blockChangeTransaction(adds, removes);
    this.queued = false;
    this.blocksToCompile = {};
    this.blocksToRemove = {};
  }

  //------------------------------------------------------------------
  // Program to inject into
  //------------------------------------------------------------------

  injectInto(prog:Program) {
    this.programToInjectInto = prog;
  }

  //------------------------------------------------------------------
  // Watch functions
  //------------------------------------------------------------------

  registerWatcherFunction(name:string, consumer:DiffConsumer) {
    this.watcherFunctions[name] = consumer;
  }

  //------------------------------------------------------------------
  // Compiler
  //------------------------------------------------------------------

  inContext(flow:LinearFlow, func: () => void) {
    ReferenceContext.push(flow.context);
    func();
    ReferenceContext.pop();
  }

  compileValue = (compile:CompilationContext, context:ReferenceContext, value:RawValue|undefined):Value|undefined => {
    if(value === undefined) return undefined;
    let {items} = this;
    if(items[value] && items[value].type === "variable") {
      let found = compile.variables[value];
      if(!found) {
        found = compile.variables[value] = new Reference(context);
      }
      return found;
    }
    return value;
  }

  compileBlock(blockID:string) {
    let {inContext, items, compileValue} = this;
    let item = items[blockID];
    let {name, constraints, type} = item;
    let compile:CompilationContext = {variables: {}};
    let flow:LinearFlow;
    if(type === "commit") {
      flow = new CommitFlow(() => []);
    } else if(type === "watch") {
      flow = new WatchFlow(() => []);
    } else {
      flow = new LinearFlow(() => []);
    }
    let {context} = flow;
    for(let constraintID of constraints) {
      let constraint = items[constraintID];
      if(!constraint) continue;

      if(constraint.type === "record") {
        inContext(flow, () => {
          let attrs:any = {};
          for(let [attribute, value] of constraint.attributes) {
            let safeValue = compileValue(compile, context, value);
            let found = attrs[attribute];
            if(!found) {
              found = attrs[attribute] = [];
            }
            found.push(safeValue);
          }
          let recordVar = compileValue(compile, context, constraint.record) as Reference;
          let record = new Record(flow.context, [], attrs, recordVar);
          recordVar.__owner = record;
        })
      }
      if(constraint.type === "output") {
        inContext(flow, () => {
          let attrs:any = {};
          for(let [attribute, value] of constraint.attributes) {
            let safeValue = compileValue(compile, context, value);
            let found = attrs[attribute];
            if(!found) {
              found = attrs[attribute] = [];
            }
            found.push(safeValue);
          }
          let outputType = Insert;
          let outputOp = "add";
          if(constraint.outputType === "remove") {
            outputType = Remove;
            outputOp = "remove";
          }
          let outputVar = compileValue(compile, context, constraint.record) as Reference;
          let output;
          if(!outputVar.__owner) {
            output = new outputType(flow.context, [], attrs);
            context.equality(output.reference(), outputVar);
          } else {
            output = new outputType(flow.context, [], attrs, outputVar);
          }
          let record = output.reference() as any;
          for(let [attribute, value] of constraint.nonIdentityAttribute) {
            record[outputOp](attribute, compileValue(compile, context, value));
          }
        })
      }
      if(constraint.type === "removeRecord") {
        inContext(flow, () => {
          let outputVar = compileValue(compile, context, constraint.record) as Reference;
          let output;
          if(!outputVar.__owner) {
            throw new Error("Trying to fully remove a record that doesn't exist");
          }
          outputVar.remove();
        })
      }
      if(constraint.type === "lookup") {
        inContext(flow, () => {
          let lookup = flow.lookup(compileValue(compile, context, constraint.record) as Value);
          context.equality(lookup.attribute, compileValue(compile, context, constraint.attribute) as Value);
          context.equality(lookup.value, compileValue(compile, context, constraint.value) as Value);
          console.log("LOOKUP", lookup)
        })
      }
    }
    let block = (this.programToInjectInto as any)[`_${type}`](name, flow);
    if(type === "watch" && item.watcher) {
      let func = this.watcherFunctions[item.watcher];
      if(!func) {
        console.error("No such watcher function registered: " + item.watcher);
      } else {
        this.programToInjectInto.asDiffs(func);
      }
    }
    console.log("Compiled: ", block);
    return block;
  }

  //------------------------------------------------------------------
  // Compile item extraction via watch blocks
  //------------------------------------------------------------------

  setup() {
    let {program:me} = this;

    me.watch("get blocks", ({find, record}) => {
      let block = find("eve/compiler/block");
      let {constraint, name, type} = block;
      return [
        record({block, constraint, name, type})
      ]
    })

    me.asObjects<{block:string, name:string, constraint:string, type:string}>(({adds, removes}) => {
      let {items} = this;
      for(let key in adds) {
        let {block, name, constraint, type} = adds[key];
        let found = items[block];
        if(!found) {
          found = items[block] = {type, name, constraints: []};
        }
        found.name = name;
        if(found.constraints.indexOf(constraint) === -1) {
          found.constraints.push(constraint);
        }
        this.queue(block);
      }
      for(let key in removes) {
        let {block, name, constraint} = removes[key];
        let found = items[block];
        if(!found) {
          continue;
        }
        let ix = found.constraints.indexOf(constraint)
        if(ix > -1) {
          found.constraints.splice(ix, 1);
        }
        if(found.constraints.length === 0) {
          delete items[block];
        }
        this.queue(block);
      }
    })

    me.watch("get watcher property", ({find, record}) => {
      let block = find("eve/compiler/block");
      let {watcher} = block;
      return [
        record({block, watcher})
      ]
    })

    me.asObjects<{block:string, watcher:string}>(({adds, removes}) => {
      let {items} = this;
      for(let key in adds) {
        let {block, watcher} = adds[key];
        let found = items[block];
        found.watcher = watcher;
        this.queue(block);
      }
      for(let key in removes) {
        let {block, watcher} = removes[key];
        let found = items[block];
        if(!found) {
          continue;
        }
        found.watcher = undefined;
        this.queue(block);
      }
    })

    me.watch("get variables", ({find, record}) => {
      let variable = find("eve/compiler/var");
      return [
        record({variable})
      ]
    })

    me.asObjects<{variable:string}>(({adds, removes}) => {
      let {items} = this;
      for(let key in adds) {
        let {variable} = adds[key];
        items[variable] = {type: "variable"};
      }
    })

    me.watch("get lookups", ({find, record}) => {
      let lookup = find("eve/compiler/lookup");
      let block = find("eve/compiler/block", {constraint: lookup});
      let {record:rec, attribute, value} = lookup;
      return [
        record({block, id:lookup, record:rec, attribute, value})
      ]
    })

    me.asObjects<{block:string, id:string, record:string, attribute:string, value:RawValue}>(({adds, removes}) => {
      let {items} = this;
      for(let key in adds) {
        let {block, id, record, attribute, value} = adds[key];
        items[id] = {type: "lookup", record: record, attribute, value};
        this.queue(block);
      }
      for(let key in removes) {
        let {block, id, record, attribute, value} = removes[key];
        delete items[id];
        this.queue(block);
      }
    })

    me.watch("get records", ({find, record}) => {
      let compilerRecord = find("eve/compiler/record");
      let block = find("eve/compiler/block", {constraint: compilerRecord});
      let {record:id, attribute} = compilerRecord;
      return [
        record({block, id:compilerRecord, record:id, attribute:attribute.attribute, value:attribute.value})
      ]
    })

    me.asObjects<{block:string, id:string, record:string, attribute:string, value:RawValue}>(({adds, removes}) => {
      let {items} = this;
      for(let key in adds) {
        let {block, id, record, attribute, value} = adds[key];
        let found = items[id];
        if(!found) {
          found = items[id] = {type: "record", attributes: [], record: record};
        }
        found.attributes.push([attribute, value]);
        this.queue(block);
      }
      for(let key in removes) {
        let {block, id, record, attribute, value} = removes[key];
        let found = items[id];
        if(!found) { continue; }

        found.attributes = found.attributes.filter(([a, v]:RawValue[]) => a !== attribute || v !== value);
        if(found.attributes.length === 0) {
          delete items[id];
        }
        this.queue(block);
      }
    })

    me.watch("get outputs", ({find, record, choose}) => {
      let compilerRecord = find("eve/compiler/output");
      let block = find("eve/compiler/block", {constraint: compilerRecord});
      let {record:id, attribute} = compilerRecord;
      let [attributeType] = choose(() => {
        attribute.tag == "eve/compiler/attribute/non-identity";
        return "non-identity";
      }, () => {
        return "identity";
      });
      let [outputType] = choose(() => {
        compilerRecord.tag == "eve/compiler/remove";
        return "remove";
      }, () => {
        return "add";
      });
      return [
        record({block, id:compilerRecord, record:id, attribute:attribute.attribute, value:attribute.value, attributeType, outputType})
      ]
    })

    me.asObjects<{block:string, id:string, record:string, attribute:string, value:RawValue, attributeType:string, outputType:string}>(({adds, removes}) => {
      let {items} = this;
      for(let key in adds) {
        let {block, id, record, attribute, value, attributeType, outputType} = adds[key];
        let found = items[id];
        if(!found) {
          found = items[id] = {type: "output", attributes: [], nonIdentityAttribute:[], record: record, outputType};
        }
        if(attributeType === "identity") {
          found.attributes.push([attribute, value]);
        } else {
          found.nonIdentityAttribute.push([attribute, value]);
        }
        this.queue(block);
      }
      for(let key in removes) {
        let {block, id, record, attribute, value} = removes[key];
        let found = items[id];
        if(!found) { continue; }

        found.attributes = found.attributes.filter(([a, v]:RawValue[]) => a !== attribute || v !== value);
        found.nonIdentityAttribute = found.nonIdentityAttribute.filter(([a, v]:RawValue[]) => a !== attribute || v !== value);
        if(found.attributes.length === 0) {
          delete items[id];
        }
        this.queue(block);
      }
    })

    me.watch("get valueless outputs", ({find, record, choose, not}) => {
      let compilerRecord = find("eve/compiler/output");
      let block = find("eve/compiler/block", {constraint: compilerRecord});
      let {attribute} = compilerRecord;
      not(() => attribute.value)
      let [attributeType] = choose(() => {
        attribute.tag == "eve/compiler/attribute/non-identity";
        return "non-identity";
      }, () => {
        return "identity";
      });
      return [
        record({block, id:compilerRecord, attribute:attribute.attribute, attributeType})
      ]
    })

    me.asObjects<{block:string, id:string, attribute:string, attributeType:string}>(({adds, removes}) => {
      let {items} = this;
      for(let key in adds) {
        let {block, id, attribute, attributeType} = adds[key];
        let found = items[id];
        if(attributeType === "identity") {
          found.attributes.push([attribute, undefined]);
        } else {
          found.nonIdentityAttribute.push([attribute, undefined]);
        }
        this.queue(block);
      }
      for(let key in removes) {
        let {block, id, attribute} = removes[key];
        let found = items[id];
        if(!found) { continue; }

        found.attributes = found.attributes.filter(([a, v]:RawValue[]) => a !== attribute || v !== undefined);
        found.nonIdentityAttribute = found.nonIdentityAttribute.filter(([a, v]:RawValue[]) => a !== attribute || v !== undefined);
        if(found.attributes.length === 0) {
          delete items[id];
        }
        this.queue(block);
      }
    })

    me.watch("get full remove", ({find, record, choose, not}) => {
      let compilerRecord = find("eve/compiler/remove");
      let block = find("eve/compiler/block", {constraint: compilerRecord});
      not(() => compilerRecord.attribute);
      return [
        record({block, id:compilerRecord, record:compilerRecord.record})
      ]
    })

    me.asObjects<{block:string, id:string, record:string}>(({adds, removes}) => {
      let {items} = this;
      for(let key in adds) {
        let {block, id, record} = adds[key];
        let found = items[id];
        if(!found) {
          found = items[id] = {type: "removeRecord", record: record};
        }
        this.queue(block);
      }
      for(let key in removes) {
        let {block, id} = removes[key];
        let found = items[id];
        if(!found) { continue; }
        delete items[id];
        this.queue(block);
      }
    })


  }
}

Watcher.register("compiler", CompilerWatcher);
