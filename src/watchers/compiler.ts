//--------------------------------------------------------------------
// The Eve compiler as a watcher
//--------------------------------------------------------------------

import {Watcher, RawValue, DiffConsumer} from "./watcher";
import {ID, Block, FunctionConstraint, printBlock} from "../runtime/runtime";
import {Program, LinearFlow, ReferenceContext, Reference, Record, Insert, Remove, Value, Fn, Not, Choose, Union, Aggregate, WatchFlow, LinearFlowFunction, CommitFlow} from "../runtime/dsl2";
import {SumAggregate} from "../runtime/stdlib";
import * as Runtime from "../runtime/runtime";
import "setimmediate";

export interface CompilationContext {
  variables: {[id:string]: {[id:string]: Reference}},
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
      if(neue) {
        adds.push(neue);
        this.blocks[ID] = neue;
      }
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
      let found;
      let cur:ReferenceContext|undefined = context;
      while(!found && cur) {
        found = compile.variables[cur.ID] && compile.variables[cur.ID][value];
        cur = cur.parent;
      }
      if(!found) {
        if(!compile.variables[context.ID]) {
          compile.variables[context.ID] = {};
        }
        found = compile.variables[context.ID][value] = new Reference(context);
      }
      return found;
    }
    return value;
  }

  compileFlow(compile:CompilationContext, flow:LinearFlow, constraints: any[]) {
    let {inContext, items, compileValue} = this;
    let {context} = flow;
    let subBlocks:any[] = [];
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
          if(constraint.attributes.length > 0) {
            output = new outputType(flow.context, [], attrs);
            context.equality(output.reference(), outputVar);
          } else {
            output = new outputType(flow.context, [], attrs, outputVar);
          }
          let record = output.reference() as any;
          for(let [attribute, value] of constraint.nonIdentityAttribute) {
            record[outputOp](compileValue(compile, context, attribute), compileValue(compile, context, value));
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
        })
      }
      if(constraint.type === "expression") {
        inContext(flow, () => {
          let args = constraint.args.map((v:RawValue) => compileValue(compile, context, v));
          let returns = constraint.returns.map((v:RawValue) => compileValue(compile, context, v))[0];
          let fn = new Fn(flow.context, constraint.op, args, returns);
        })
      }
      if(constraint.type === "aggregate") {
        inContext(flow, () => {
          let projection:Reference[] = [];
          let group:Reference[] = [];
          let args:Value[] = [];
          for(let arg in constraint.namedArgs) {
            let values = constraint.namedArgs[arg].map((v:RawValue) => compileValue(compile, context, v));
            if(arg === "for" || arg === "given") {
              projection = values;
            } else if(arg === "per") {
              group = values;
            } else if(arg === "direction" || arg === "value") {
              args = args.concat(values);
            }
          }
          let aggOp:any = SumAggregate;
          if(constraint.op === "gather/sort") {
            aggOp = Runtime.SortNode;
          } else if(constraint.op === "gather/count" && args.length === 0) {
            args.push(1);
          }
          let returns = constraint.returns.map((v:RawValue) => compileValue(compile, context, v))[0];
          let agg = new Aggregate(flow.context, aggOp, projection, group, args, returns);
        })
      }
      if(constraint.type === "equality") {
        inContext(flow, () => {
          context.equality(compileValue(compile, context, constraint.left) as Value, compileValue(compile, context, constraint.right) as Value);
        })
      }
      if(constraint.type === "not" || constraint.type === "choose" || constraint.type === "union") {
        subBlocks.push(constraint);
      }
    }

    for(let constraint of subBlocks) {
      if(constraint.type === "not") {
        inContext(flow, () => {
          let not = new Not((a:any) => [], flow);
          this.compileFlow(compile, not, constraint.constraints);
        });
      }
      if(constraint.type === "choose" || constraint.type == "union") {
        let builder = constraint.type == "choose" ? Choose : Union;
        let branchFuncs:LinearFlowFunction[] = [];
        for(let branchId of constraint.branches) {
          let branch = items[branchId];
          branchFuncs.push((self) => {
            return branch.outputs.map((v:RawValue) => {
              return compileValue(compile, self.context, v) as Value;
            })
          });
        }
        inContext(flow, () => {
          let outputs = constraint.outputs.map((v:RawValue) => {
            return compileValue(compile, context, v) as Value;
          })
          let choose = new builder(flow.context, branchFuncs, flow, outputs);
          let branchIx = 0;
          for(let branchId of constraint.branches) {
            let branch = items[branchId];
            let compiled = choose.branches[branchIx];
            inContext(compiled, () => {
              this.compileFlow(compile, compiled, branch.constraints);
              choose.setBranchInputs(branchIx, compiled.context.getInputReferences());
            })
            branchIx++;
          }
        });
      }

    }

  }

  compileBlock(blockID:string) {
    let {inContext, items, compileValue} = this;
    let item = items[blockID];
    let {name, constraints, type} = item;
    let compile:CompilationContext = {variables: {}};
    let flow:LinearFlow;
    if(type === "commit") {
      flow = new CommitFlow((a) => []);
    } else if(type === "watch") {
      flow = new WatchFlow((a) => []);
    } else if(type === "bind") {
      flow = new LinearFlow((a) => []);
    } else {
      return;
    }

    this.compileFlow(compile, flow, constraints);

    let block = (this.programToInjectInto as any)[`_${type}`](name, flow);
    if(type === "watch" && item.watcher) {
      let func = this.watcherFunctions[item.watcher];
      if(!func) {
        console.error("No such watcher function registered: " + item.watcher);
      } else {
        this.programToInjectInto.asDiffs(func);
      }
    }
    console.groupCollapsed("Compiled: " + block.name);
    console.log(block, flow);
    console.log(printBlock(block));
    console.groupEnd();
    return block;
  }

  //------------------------------------------------------------------
  // Compile item extraction via watch blocks
  //------------------------------------------------------------------

  setup() {
    let {program:me} = this;

    me.bind("show errors", ({find, record}) => {
      let err = find("eve/compiler/error");
      return [
        record("ui/column", {err, class: "eve-compiler-error"}).add("children", [
          record("ui/row", {err, class: "eve-compiler-error-message-container"}).add("children", [
            record("ui/column", {err, class: "eve-compiler-line-info", sort:0}).add("children", [
              record("ui/text", {err, text: `Line`, sort: 0}),
              record("ui/text", {err, class: "eve-compiler-error-message-line", text:err.start.line, sort: 1}),
            ]),
            record("ui/column", {err, class: "eve-compiler-error-content", sort:1}).add("children", [
              record("ui/text", {err, class: "eve-compiler-error-message", text: err.message, sort: 0}),
              record("ui/text", {err, class: "eve-compiler-error-sample", text: err.sample, sort:1})
            ]),
          ]),
        ])
      ]
    });

    me.watch("get blocks", ({find, record}) => {
      let block = find("eve/compiler/rule");
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

    me.watch("get nots", ({find, record}) => {
      let not = find("eve/compiler/not");
      let block = find("eve/compiler/block", {constraint: not});
      return [
        record({block, not, constraint:not.constraint})
      ]
    })

    me.asObjects<{block:string, not:string, constraint:string}>(({adds, removes}) => {
      let {items} = this;
      for(let key in adds) {
        let {block, not, constraint} = adds[key];
        let found = items[not];
        if(!found) {
          found = items[not] = {type: "not", constraints: []};
        }
        if(found.constraints.indexOf(constraint) === -1) {
          found.constraints.push(constraint);
        }
        this.queue(block);
      }
      for(let key in removes) {
        let {block, not, constraint} = removes[key];
        let found = items[not];
        if(!found) {
          continue;
        }
        let ix = found.constraints.indexOf(constraint)
        if(ix > -1) {
          found.constraints.splice(ix, 1);
        }
        if(found.constraints.length === 0) {
          delete items[not];
        }
        this.queue(block);
      }
    })

    me.watch("get choose branches", ({find, record, choose}) => {
      let item = find("eve/compiler/branch-set");
      let [itemType] = choose(() => {
        item.tag == "eve/compiler/choose";
        return ["choose"];
      }, () => {
        item.tag == "eve/compiler/union";
        return ["union"];
      })
      let block = find("eve/compiler/rule", {constraint: item});
      return [
        record({block, item, itemType, branch:item.branch})
      ]
    })

    me.asObjects<{block:string, item:string, itemType:string, branch:string}>(({adds, removes}) => {
      let {items} = this;
      for(let key in adds) {
        let {block, item, branch, itemType} = adds[key];
        let found = items[item];
        if(!found) {
          found = items[item] = {type: itemType, branches: [], outputs: []};
        }
        if(!items[branch]) {
          items[branch] = {type: "branch", constraints: [], outputs: []};
        }
        if(found.branches.indexOf(branch) === -1) {
          found.branches.push(branch);
        }
        this.queue(block);
      }
      for(let key in removes) {
        let {block, item, itemType, branch} = removes[key];
        let found = items[item];
        if(!found) {
          continue;
        }
        let ix = found.branches.indexOf(branch)
        if(ix > -1) {
          found.branches.splice(ix, 1);
        }
        if(found.branches.length === 0) {
          delete items[item];
        }
        this.queue(block);
      }
    })

    me.watch("get choose outputs", ({find, record}) => {
      let choose = find("eve/compiler/branch-set");
      let block = find("eve/compiler/block", {constraint: choose});
      let {value, index} = choose.output;
      return [
        record({block, choose, value, index})
      ]
    })

    me.asObjects<{block:string, choose:string, value:RawValue, index:number}>(({adds, removes}) => {
      let {items} = this;
      for(let key in adds) {
        let {block, choose, value, index} = adds[key];
        let found = items[choose];
        if(!found) {
          console.error("adding output for a branch that doesn't exist")
          return;
        }
        found.outputs[index - 1] = value;
        this.queue(block);
      }
      for(let key in removes) {
        let {block, choose, value, index} = removes[key];
        let found = items[choose];
        if(!found) {
          continue;
        }
        let cur = found.outputs[index];
        if(cur === value) {
          found.outputs[index - 1] = undefined;
        }
        this.queue(block);
      }
    })

    me.watch("get choose branch constraints", ({find, record}) => {
      let choose = find("eve/compiler/branch-set");
      let block = find("eve/compiler/block", {constraint: choose});
      let {branch} = choose
      return [
        record({block, branch, constraint:branch.constraint})
      ]
    })

    me.asObjects<{block:string, constraint:string, branch:string}>(({adds, removes}) => {
      let {items} = this;
      for(let key in adds) {
        let {block, constraint, branch} = adds[key];
        let found = items[branch];
        if(!found) {
          console.error("adding constraint for a branch that doesn't exist")
          return;
        }
        if(found.constraints.indexOf(constraint) === -1) {
          found.constraints.push(constraint);
        }
        this.queue(block);
      }
      for(let key in removes) {
        let {block, constraint, branch} = removes[key];
        let found = items[branch];
        if(!found) {
          continue;
        }
        let ix = found.constraints.indexOf(constraint)
        if(ix > -1) {
          found.constraints.splice(ix, 1);
        }
        if(found.constraints.length === 0) {
          delete items[branch];
        }
        this.queue(block);
      }
    })

    me.watch("get choose branch outputs", ({find, record}) => {
      let choose = find("eve/compiler/branch-set");
      let block = find("eve/compiler/block", {constraint: choose});
      let branch = choose.branch
      let {value, index} = branch.output
      return [
        record({block, branch, value, index})
      ]
    })

    me.asObjects<{block:string, branch:string, value:RawValue, index:number}>(({adds, removes}) => {
      let {items} = this;
      for(let key in adds) {
        let {block, branch, value, index} = adds[key];
        let found = items[branch];
        if(!found) {
          console.error("adding output for a branch that doesn't exist")
          return;
        }
        found.outputs[index - 1] = value;
        this.queue(block);
      }
      for(let key in removes) {
        let {block, branch, value, index} = removes[key];
        let found = items[branch];
        if(!found) {
          continue;
        }
        let cur = found.outputs[index];
        if(cur === value) {
          found.outputs[index - 1] = undefined;
        }
        this.queue(block);
      }
    })

    me.watch("get watcher property", ({find, record}) => {
      let block = find("eve/compiler/rule");
      let {constraint, name, type, watcher} = block;
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

    me.watch("get equalities", ({find, record}) => {
      let eq = find("eve/compiler/equality");
      return [
        record({eq, left:eq.left, right:eq.right})
      ]
    })

    me.asObjects<{eq:string, left:RawValue, right:RawValue}>(({adds, removes}) => {
      let {items} = this;
      for(let key in adds) {
        let {eq, left, right} = adds[key];
        items[eq] = {type: "equality", left, right};
      }
      for(let key in removes) {
        let {eq} = removes[key];
        items[eq] = undefined;
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

    me.watch("get expressions", ({find, record, choose}) => {
      let expr = find("eve/compiler/expression");
      let [type] = choose(() => {
        expr.tag == "eve/compiler/aggregate";
        return ["aggregate"];
      }, () => {
        return ["expression"];
      })
      let block = find("eve/compiler/block", {constraint: expr});
      return [
        record({block, id:expr, op:expr.op, type})
      ]
    })

    me.asObjects<{block:string, id:string, op:string, type:string}>(({adds, removes}) => {
      let {items} = this;
      for(let key in adds) {
        let {block, id, op, type} = adds[key];
        let found = items[id];
        if(!found) {
          found = items[id] = {type, op, args: [], returns: [], namedArgs: {}};
        }
        found.op = op;
        this.queue(block);
      }
      for(let key in removes) {
        let {block, id, op} = removes[key];
        let found = items[id];
        if(!found) { continue; }
        delete items[id];
        this.queue(block);
      }
    })

    me.watch("get expression args", ({find, record}) => {
      let expr = find("eve/compiler/expression");
      let block = find("eve/compiler/block", {constraint: expr});
      let {arg} = expr;
      return [
        record({block, id:expr, index:arg.index, value:arg.value})
      ]
    })

    me.asObjects<{block:string, id:string, index:number, value:RawValue}>(({adds, removes}) => {
      let {items} = this;
      for(let key in adds) {
        let {block, id, index, value} = adds[key];
        let found = items[id];
        if(!found) { throw new Error("args for a non existent expression"); }
        found.args[index - 1] = value;
        this.queue(block);
      }
      for(let key in removes) {
        let {block, id, index, value} = removes[key];
        let found = items[id];
        if(!found) { continue; }
        if(found.args[index - 1] == value) {
          found.args[index - 1] = undefined;
        }
        this.queue(block);
      }
    })

    me.watch("get expression named args", ({find, record, not}) => {
      let expr = find("eve/compiler/expression");
      not(() => {
        expr.tag == "eve/compiler/aggregate";
      })
      let block = find("eve/compiler/block", {constraint: expr});
      let {arg} = expr;
      return [
        record({block, id:expr, name:arg.name, value:arg.value, index:arg.index})
      ]
    })

    me.asObjects<{block:string, id:string, name:string, value:RawValue, index:number}>(({adds, removes}) => {
      let {items} = this;
      for(let key in adds) {
        let {block, id, name, value, index} = adds[key];
        let found = items[id];
        if(!found) { throw new Error("args for a non existent expression"); }
        let {argNames, returnNames} = FunctionConstraint.fetchInfo(found.op)
        let argIx = argNames.indexOf(name);
        let retIx = returnNames.indexOf(name);
        if(argIx > -1) {
          found.args[argIx] = value;
        } else if(retIx > -1) {
          found.returns[retIx] = value;
        } else {
          console.error(`Unknown arg for expression: ${found.op}[${name}]`);
        }
        this.queue(block);
      }
      for(let key in removes) {
        let {block, id, name, value} = removes[key];
        let found = items[id];
        if(!found) { continue; }
        let {argNames, returnNames} = FunctionConstraint.fetchInfo(found.op)
        let argIx = argNames.indexOf(name);
        let retIx = returnNames.indexOf(name);
        if(argIx > -1) {
          found.args[argIx] = undefined;
        } else if(retIx > -1) {
          found.returns[retIx] = undefined;
        } else {
          console.error(`Unknown arg for expression: ${found.op}[${name}]`);
        }
        this.queue(block);
      }
    })

    me.watch("get aggregate named args", ({find, record, not}) => {
      let expr = find("eve/compiler/aggregate");
      let block = find("eve/compiler/block", {constraint: expr});
      let {arg} = expr;
      return [
        record({block, id:expr, name:arg.name, value:arg.value, index:arg.index})
      ]
    })

    me.asObjects<{block:string, id:string, name:string, value:RawValue, index:number}>(({adds, removes}) => {
      let {items} = this;
      for(let key in adds) {
        let {block, id, name, value, index} = adds[key];
        let found = items[id];
        if(!found) { throw new Error("args for a non existent expression"); }
        let args = found.namedArgs[name] || [];
        args[index - 1] = value;
        found.namedArgs[name] = args;
        this.queue(block);
      }
      for(let key in removes) {
        let {block, id, name, value} = removes[key];
        let found = items[id];
        if(!found) { continue; }
        let args = found.namedArgs[name];
        if(args) {
          let ix = args.indexOf(value);
          args.splice(ix, 1);
        }
        this.queue(block);
      }
    })

    me.watch("get expression returns", ({find, record}) => {
      let expr = find("eve/compiler/expression");
      let block = find("eve/compiler/block", {constraint: expr});
      let {return:ret} = expr;
      return [
        record({block, id:expr, index:ret.index, value:ret.value})
      ]
    })

    me.asObjects<{block:string, id:string, index:number, value:RawValue}>(({adds, removes}) => {
      let {items} = this;
      for(let key in adds) {
        let {block, id, index, value} = adds[key];
        let found = items[id];
        if(!found) { throw new Error("returns for a non existent expression"); }
        found.returns[index - 1] = value;
        this.queue(block);
      }
      for(let key in removes) {
        let {block, id, index, value} = removes[key];
        let found = items[id];
        if(!found) { continue; }
        if(found.returns[index - 1] == value) {
          found.returns[index - 1] = undefined;
        }
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
      return [
        record({block, id:compilerRecord, record:compilerRecord.record, attribute:attribute.attribute})
      ]
    })

    me.asObjects<{block:string, id:string, record:string, attribute:string}>(({adds, removes}) => {
      let {items} = this;
      for(let key in adds) {
        let {block, id, record, attribute} = adds[key];
        let found = items[id];
        if(!found) {
          found = items[id] = {type: "output", attributes: [], nonIdentityAttribute:[], record: record, outputType:"remove"};
        }
        found.nonIdentityAttribute.push([attribute, undefined]);
        this.queue(block);
      }
      for(let key in removes) {
        let {block, id, attribute} = removes[key];
        let found = items[id];
        if(!found) { continue; }

        found.nonIdentityAttribute = found.nonIdentityAttribute.filter(([a, v]:RawValue[]) => a !== attribute || v !== undefined);
        if(found.nonIdentityAttribute.length === 0) {
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
