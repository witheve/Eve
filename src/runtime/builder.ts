//-----------------------------------------------------------
// Builder
//-----------------------------------------------------------

import * as join from "./join";
import * as providers from "./providers/index";
import "./providers/math";
import "./providers/logical";
import "./providers/string";
import * as errors from "./errors";
import {Sort} from "./providers/sort";
import {Aggregate} from "./providers/aggregate";
import {ActionImplementations} from "./actions";
import {Block, BlockStratum} from "./block";

//-----------------------------------------------------------
// Runtime helpers
//-----------------------------------------------------------

function clone(map) {
  let neue = {};
  for(let key of Object.keys(map)) {
    neue[key] = map[key];
  }
  return neue;
}

//-----------------------------------------------------------
// Builder Context
//-----------------------------------------------------------

class BuilderContext {
  errors: any[] = [];
  groupIx: number;
  varIx: number;
  variableToGroup: any;
  groupToValue: any;
  unprovided: boolean[];
  registerToVars: any;
  myRegisters: boolean[];
  nonProviding: boolean;

  constructor(block, variableToGroup = {}, groupToValue = {}, unprovided = [], registerToVars = {}, groupIx = 0, varIx = 0) {
    this.variableToGroup = variableToGroup;
    this.groupToValue = groupToValue;
    this.unprovided = unprovided;
    this.groupIx = groupIx;
    this.varIx = varIx;
    this.registerToVars = registerToVars;
    this.myRegisters = [];
    this.assignGroups(block);
    this.assignRuntimeVariables(block);
    this.nonProviding = false;
  }

  getValue(node) {
    if(node.type === "variable") {
      let group = this.variableToGroup[node.name];
      if(group === undefined) {
        throw new Error("Variable with no group: " + node);
      }
      let value = this.groupToValue[group];
      if(value === undefined) throw new Error("Group with no value" + node);
      return value;
    } else if(node.type === "parenthesis") {
      let values = [];
      for(let item of node.items) {
        values.push(this.getValue(item));
      }
      return values;
    } else if(node.type === "constant") {
      return node.value;
    } else {
      throw new Error("Not implemented: runtimeValue type " + node.type);
    }
  }

  provide(node) {
    if(join.isVariable(node)) {
      if(this.nonProviding && !this.myRegisters[node.id]) {
        return;
      }
      this.unprovided[node.id] = false;
    }
  }

  setGroup(variable, value) {
    let group = this.variableToGroup[variable.name] = value;
    return group;
  }

  getGroup(variable, orValue?) {
    let group = this.variableToGroup[variable.name];
    if(group === undefined) {
      group = this.setGroup(variable, orValue !== undefined ? orValue : this.groupIx++);
    }
    return group;
  }

  hasVariable(variable) {
    return this.variableToGroup[variable.name] !== undefined;
  }

  assignGroups(block) {
    let finished = false;
    while(!finished) {
      finished = true;
      for(let equality of block.equalities) {
        if(equality === undefined) continue;
        let [left, right] = equality;

        if(left.type === "constant" && right.type === "constant") {
          // these must be equal, otherwise this query doesn't make any sense
          if(left.value !== right.value) {
            this.errors.push(errors.incompatabileConstantEquality(block, left, right));
          }
        } else if(left.type === "constant") {
          let rightGroup = this.getGroup(right);
          let rightValue = this.groupToValue[rightGroup];
          // if this is a variable, it came from a parent context and we can't just overwrite it in this case,
          // the builder handles this case for us by adding explicit equality checks into the scans
          if(!join.isVariable(rightValue)) {
            if(rightValue !== undefined && left.value !== rightValue) {
              this.errors.push(errors.incompatabileVariableToConstantEquality(block, right, rightValue, left));
            }
            this.groupToValue[rightGroup] = left.value;
          }
        } else if(right.type === "constant") {
          let leftGroup = this.getGroup(left);
          let leftValue = this.groupToValue[leftGroup];
          // if this is a variable, it came from a parent context and we can't just overwrite it in this case,
          // the builder handles this case for us by adding explicit equality checks into the scans
          if(!join.isVariable(leftValue)) {
            if(leftValue !== undefined && leftValue !== right.value) {
              this.errors.push(errors.incompatabileVariableToConstantEquality(block, left, leftValue, right));
            }
            this.groupToValue[leftGroup] = right.value;
          }
        } else {
          let leftGroup = this.getGroup(left);
          let rightGroup = this.getGroup(right, leftGroup);
          if(leftGroup !== rightGroup) {
            if(leftGroup < rightGroup) {
              this.setGroup(right, leftGroup);
            } else {
              this.setGroup(left, rightGroup);
            }
            finished = false;
          }
        }
      }
    }
  }

  assignRuntimeVariables(block) {
    let registerToVars = this.registerToVars;
    let groupToValue = this.groupToValue;
    for(let varName in block.variables) {
      let variable = block.variables[varName];
      let group = this.getGroup(variable);
      if(group !== undefined) {
        let value = groupToValue[group];
        if(value === undefined) {
          if(variable.constant) {
            value = variable.constant.value;
          } else {
            value = this.createVariable();
            registerToVars[value.id].push(varName);
          }
          groupToValue[group] = value;
        } else {
          if(variable.constant) {
            if(!join.isVariable(value) && variable.constant.value !== value) {
              this.errors.push(errors.incompatabileTransitiveEquality(block, variable, value));
            }
            value = variable.constant.value;
            if(this.myRegisters[value.id]) {
              groupToValue[group] = value;
            }
          } else if(join.isVariable(value)) {
            registerToVars[value.id].push(varName);
          }
        }
      }
    }

    let unprovided = this.unprovided;
    for(let ix = 0; ix < this.varIx; ix++) {
      if(unprovided[ix] === undefined && this.myRegisters[ix]) {
        unprovided[ix] = true;
      }
    }
  }

  createVariable() {
    this.registerToVars[this.varIx] = [];
    this.myRegisters[this.varIx] = true;
    return new join.Variable(this.varIx++);
  }

  extendTo(block) {
    let neue = new BuilderContext(block, clone(this.variableToGroup), clone(this.groupToValue), this.unprovided, this.registerToVars, this.groupIx, this.varIx);
    neue.errors = this.errors;
    return neue;
  }
}

//-----------------------------------------------------------
// Scans
//-----------------------------------------------------------

function checkBlockForVariable(block, variableName) {
  let curBlock = block;
  while(curBlock) {
    let found = curBlock.variables[variableName];
    if(found) return found;
    curBlock = curBlock.parent;
  }
  return;
}

function checkSubBlockEqualities(context, block) {
  // if we have an equality that is with a constant, then we need to add
  // a node for that equality since we couldn't fold the constant into the variable
  let equalityIx = 0;
  for(let equality of block.equalities) {
    if(!equality) continue;
    let [left, right] = equality;
    let needsEquality;
    let hasLeft = context.hasVariable(left);
    let hasRight = context.hasVariable(right);
    if(left.type === "constant" && (hasRight || right.type === "constant")) {
      needsEquality = true;
    } else if(right.type === "constant" && (hasLeft || left.type === "constant")) {
      needsEquality = true;
    } else if(hasLeft && hasRight) {
      needsEquality = true;
    } else if(hasLeft && !join.isVariable(context.getValue(left))) {
      needsEquality = true;
    } else if(hasRight && !join.isVariable(context.getValue(right))) {
      needsEquality = true;
    }
    // console.log("branch equality", left, right, leftVal, rightVal);
    if(needsEquality) {
      let expression = {type: "expression", op: "=", args: equality};
      block.expressions.push(expression)
      block.equalities[equalityIx] = undefined;
    }
    equalityIx++;
  }
}

function buildScans(block, context, scanLikes, outputScans) {
  let {unprovided} = block;
  for(let scanLike of scanLikes) {
    if(scanLike.type === "record") {
      let entity = context.getValue(scanLike.variable);
      context.provide(entity);
      for(let attribute of scanLike.attributes) {
        if(attribute.value.type === "parenthesis") {
          for(let item of attribute.value.items) {
            let value = context.getValue(item)
            context.provide(value);
            let final = new join.Scan(item.id + "|build", entity, attribute.attribute, value, undefined, scanLike.scopes);
            outputScans.push(final);
            item.buildId = final;
          }
        } else {
          let value = context.getValue(attribute.value)
          context.provide(value);
          let final = new join.Scan(attribute.id + "|build", entity, attribute.attribute, value, undefined, scanLike.scopes);
          outputScans.push(final);
          attribute.buildId = final.id;
        }
      }
    } else if(scanLike.type === "scan") {
      let entity;
      if(scanLike.entity) {
        entity = context.getValue(scanLike.entity);
      }
      if(!scanLike.needsEntity) {
        context.provide(entity);
      }
      let attribute;
      if(scanLike.attribute) {
        attribute = context.getValue(scanLike.attribute);
        context.provide(attribute);
      }
      let value;
      if(scanLike.value) {
        value = context.getValue(scanLike.value)
        context.provide(value);
      }
      let node;
      if(scanLike.node) {
        node = context.getValue(scanLike.node)
        context.provide(node);
      }

      if(!(entity || attribute || value || node)) {
        context.errors.push(errors.blankScan(block, scanLike));
      }

      let final = new join.Scan(scanLike.id + "|build", entity, attribute, value, node, scanLike.scopes);
      outputScans.push(final);
      scanLike.buildId = final.id;
    } else if(scanLike.type === "not") {
      checkSubBlockEqualities(context, scanLike);

      let notContext = context.extendTo(scanLike);
      notContext.nonProviding = true;

      let args = [];
      let seen = [];
      for(let variableName in scanLike.variables) {
        let cur = checkBlockForVariable(block, variableName);
        if(!cur) continue;
        let value = notContext.getValue(cur);
        if(join.isVariable(value)) {
          seen[value.id] = true;
          args.push(value);
        }
      }
      let {strata} = buildStrata(scanLike, notContext);
      let final = new join.NotScan(scanLike.id + "|build", args, strata);
      outputScans.push(final);
      scanLike.buildId = final.id;
    } else if(scanLike.type === "ifExpression") {
      let seen = [];
      let args = [];
      let branches = [];
      let hasAggregate = false;
      for(let variable of scanLike.outputs) {
        let value = context.getValue(variable);
        if(join.isVariable(value)) {
          seen[value.id] = true;
        }
      }
      for(let branch of scanLike.branches) {
        checkSubBlockEqualities(context, branch.block);

        let branchContext = context.extendTo(branch.block);
        for(let variableName in branch.block.variables) {
          let cur = checkBlockForVariable(branch.block.parent, variableName);
          if(!cur) continue;
          let value = branchContext.getValue(cur);
          if(join.isVariable(value) && !seen[value.id]) {
            seen[value.id] = true;
            args.push(value);
          }
        }
        let {strata} = buildStrata(branch.block, branchContext);
        let outputs = [];
        for(let output of branch.outputs) {
          outputs.push(branchContext.getValue(output));
        }
        if(strata.length > 1) {
          hasAggregate = true;
        }
        let final = new join.IfBranch(branch.id + "|build", strata, outputs, branch.exclusive);
        branches.push(final);
        branch.buildId = final.id;
      }
      let outputs = [];
      for(let output of scanLike.outputs) {
        let resolved = context.getValue(output);
        if(!join.isVariable(resolved)) {
          let variable = context.createVariable();
          let impl = providers.get("=");
          outputScans.push(new impl(`${output.id}|equality|build`, [variable, resolved], []));
          outputs.push(variable);
          context.provide(variable);
        } else {
          outputs.push(resolved);
          context.provide(resolved);
        }
      }
      let ifScan = new join.IfScan(scanLike.id + "|build", args, outputs, branches, hasAggregate);
      outputScans.push(ifScan)
      scanLike.buildId = ifScan.id;
    } else {
      throw new Error("Not implemented: scanLike " + scanLike.type);
    }
  }
  return outputScans;
}

//-----------------------------------------------------------
// Expressions
//-----------------------------------------------------------

function buildExpressions(block, context, expressions, outputScans) {
  for(let expression of expressions) {
    if(expression.type === "expression") {
      let results = [];
      if(expression.variable) {
        let result = context.getValue(expression.variable);
        results.push(result);
        context.provide(result);
      }
      let args = [];
      for(let arg of expression.args) {
        args.push(context.getValue(arg));
      }
      let impl = providers.get(expression.op);
      if(impl) {
        outputScans.push(new impl(`${expression.id}|build`, args, results));
      } else {
        context.errors.push(errors.unimplementedExpression(block, expression));
      }
    } else if(expression.type === "functionRecord") {
      let results;
      if(expression.returns !== undefined) {
        results = expression.returns.slice();
      } else {
        results = [expression.variable];
        let resolved = context.getValue(expression.variable);
        context.provide(resolved);
      }
      let args = [];
      let impl = providers.get(expression.op);
      if(!impl) {
        context.errors.push(errors.unimplementedExpression(block, expression));
        return;
      }
      for(let attribute of expression.record.attributes) {
        let ix = impl.AttributeMapping[attribute.attribute];
        if(ix !== undefined) {
          args[ix] = context.getValue(attribute.value);
        } else if(impl.ReturnMapping && (ix = impl.ReturnMapping[attribute.attribute]) !== undefined) {
          results[ix] = attribute.value;
        } else {
          // @TODO: error - unknown arg/return for the function call
        }
      }
      let resultIx = 0;
      for(let result of results) {
        // if one of the returns is fixed, we need to add an equality check
        // to make sure that the return is actually that constant. The constraint
        // provider may be smart enough to do that themselves, but this removes
        // the burden from them.
        let resolved = context.getValue(result);
        context.provide(resolved);
        results[resultIx] = resolved;
        if(!join.isVariable(resolved)) {
          // @TODO: mark this variable as generated?
          let variable = context.createVariable();
          let klass = providers.get("=");
          outputScans.push(new klass(`${resolved}|${resultIx}|equality|build`, [variable, resolved], []))
          resolved = results[resultIx] = variable;
        }
        resultIx++;
      }

      outputScans.push(new impl(`${expression.id}|build`, args, results));
    } else {
      throw new Error("Not implemented: function type " + expression.type);
    }
  }
  return outputScans;
}

//-----------------------------------------------------------
// Actions
//-----------------------------------------------------------

function buildActions(block, context, actions, scans) {
  let {unprovided} = context;
  let actionObjects = [];
  for(let action of actions) {
    if(action.type === "record") {
      let projection = [];
      if(action.extraProjection) {
        for(let proj of action.extraProjection) {
          let variable = context.getValue(proj);
          projection[variable.id] = variable;
        }
      }
      let entity = context.getValue(action.variable);
      for(let attribute of action.attributes) {
        let impl;
        if(action.action === "<-") {
          impl = ActionImplementations[":="];
          // doing foo <- [#bar] shouldn't remove all the other tags that record has
          // same for names
          if(attribute.attribute === "name" || attribute.attribute === "tag") {
            impl = ActionImplementations["+="];
          }
        } else {
          impl = ActionImplementations[action.action];
        }
        if(attribute.value.type === "parenthesis") {
          for(let item of attribute.value.items) {
            let value = context.getValue(item)
            if(value instanceof join.Variable) {
              if(!attribute.nonProjecting && !attribute.value.nonProjecting && !item.nonProjecting) {
                projection[value.id] = value;
              }
            }
            let final = new impl(`${attribute.id}|${item.id}|build`, entity, attribute.attribute, value, undefined, action.scopes);
            actionObjects.push(final);
            item.buildId = final.id;
          }
        } else {
          let value = context.getValue(attribute.value)
          if(value instanceof join.Variable) {
            if(!attribute.nonProjecting && !attribute.value.nonProjecting) {
              projection[value.id] = value;
            }
          }
          let final = new impl(`${attribute.id}|build`, entity, attribute.attribute, value, undefined, action.scopes);
          actionObjects.push(final);
          attribute.buildId = final.id;
        }
      }
      // if this variable is unprovided, we need to generate an id
      if(unprovided[entity.id]) {
        projection = projection.filter((x) => x);
        let klass = providers.get("generateId");
        scans.push(new klass(`${action.id}|${entity.id}|build`, projection, [entity]));
        context.provide(entity);
      }
    } else if(action.type === "action") {
      let {entity, value, attribute} = action;
      let impl = ActionImplementations[action.action];
      if(action.action === "erase") {
        let attributeValue = attribute && attribute.type !== undefined ? context.getValue(attribute) : attribute;
        let final = new impl(`${action.id}|build`, context.getValue(entity), attributeValue, undefined, undefined, action.scopes);
        actionObjects.push(final);
        action.buildId = final.id;
      } else {
        if(entity === undefined || value === undefined || attribute === undefined) {
          context.errors.push(errors.invalidLookupAction(block, action));
          continue;
        }
        attribute = typeof attribute === "string" ? attribute : context.getValue(attribute);
        if(value.type === "parenthesis") {
          for(let item of value.items) {
            let final = new impl(`${action.id}|${item.id}|build`, context.getValue(entity), attribute, context.getValue(item), undefined, action.scopes);
            actionObjects.push(final);
            item.buildId = final.id;
          }
        } else {
          let final = new impl(`${action.id}|build`, context.getValue(entity), attribute, context.getValue(value), undefined, action.scopes);
          actionObjects.push(final);
          action.buildId = final.id;
        }
      }
      // throw new Error("Action actions aren't implemented yet.")
    } else {
      throw new Error("Not implemented: action " + action.type);
    }
  }
  return actionObjects;
}

//-----------------------------------------------------------
// Stratifier
//-----------------------------------------------------------

function stratify(scans) {
  if(!scans.length) return [new BlockStratum([], [])];

  let aggregates = [];
  let variableInfo = {};
  let blockLevel = {};

  let provide = (variable, scan) => {
    if(join.isVariable(variable)) {
      let info = variableInfo[variable.id]
      if(!info) {
        info = variableInfo[variable.id] = {providers: []};
      }
      info.providers.push(scan);
    }
  }

  let maybeLevelVariable = (scan, level, variable) => {
    if(join.isVariable(variable)) {
      let info = variableInfo[variable.id]
      let minLevel = level;
      for(let provider of info.providers) {
        let providerLevel = blockLevel[provider.id] || 0;
        minLevel = Math.min(minLevel, providerLevel);
      }
      info.level = minLevel;
    }
  }

  for(let scan of scans) {
    if(scan instanceof join.Scan) {
      provide(scan.e, scan);
      provide(scan.a, scan);
      provide(scan.v, scan);
    } else if(scan instanceof Aggregate || scan instanceof Sort) {
      aggregates.push(scan);
      blockLevel[scan.id] = 1;
      for(let ret of scan.returns) {
        provide(ret, scan);
      }
    } else if(scan instanceof join.Constraint) {
      for(let ret of scan.returns) {
        provide(ret, scan);
      }
    } else if(scan instanceof join.IfScan) {
      for(let output of scan.outputs) {
        provide(output, scan);
      }
    } else if(scan instanceof join.NotScan) {
      // not can never provide a variable, so there's nothing
      // we need to do here
    }
  }

  // Before we start to stratify, we need to run through all the aggregates
  // to determine what level their returns should be at. If the aggregate is
  // the only provider for the return, then it should be at the same level as
  // the aggregate itself. If, however, there are other scans that provide the
  // return, we want to pick up their level instead.
  for(let aggregate of aggregates) {
    let level = blockLevel[aggregate.id];
    for(let variable of aggregate.returns) {
      maybeLevelVariable(aggregate, level, variable);
    }
  }

  let round = 0;
  let changed = true;
  while(changed && round <= scans.length) {
    changed = false
    // for each scan, get the max level of the variables you rely on
    // if it's greater than your current level, set your level to that.
    // Now check all of the scans vars and see if you are either the only
    // provider or if all the providers are now in a higher level. If so,
    // the variable's level is set to the scan's new level.
    for(let scan of scans) {
      let isAggregate = false;
      if(scan instanceof Aggregate ||
         scan instanceof Sort ||
         scan.hasAggregate ||
         (scan.strata && scan.strata.length > 1)) {
        isAggregate = true;
      }

      let levelMax = 0;
      let scanLevel = blockLevel[scan.id] || 0;
      let dependentVariables;
      let returnVariables;
      if(scan instanceof join.Scan) {
        dependentVariables = scan.vars;
        returnVariables = scan.vars;
      } else if(scan.args !== undefined) {
        dependentVariables = scan.args;
        returnVariables = scan.returns || scan.outputs;
      } else {
        throw new Error("Scan that I don't know how to stratify: " + scan)
      }

      for(let variable of dependentVariables) {
        if(join.isVariable(variable)) {
          let info = variableInfo[variable.id];
          let infoLevel = 0;
          if(info && info.level) {
            infoLevel = info.level
          }
          // if this is an aggregate, we always have to be in the level that is
          // one greater than all our dependencies
          if(isAggregate) {
            infoLevel += 1;
          }
          levelMax = Math.max(levelMax, infoLevel);
        }
      }

      if(levelMax > scanLevel) {
        changed = true;
        blockLevel[scan.id] = levelMax;
        if(returnVariables) {
          for(let variable of returnVariables) {
            maybeLevelVariable(scan, levelMax, variable);
          }
        }
      }
    }
    round++;
  }

  if(round > scans.length) {
    throw new Error("Stratification cycle");
  }

  let strata = [{scans: [], aggregates: []}];
  for(let scan of scans) {
    let scanStratum = blockLevel[scan.id];
    if(scanStratum !== undefined) {
      let level = strata[scanStratum];
      if(!level) level = strata[scanStratum] = {scans: [], aggregates: []};
      if(scan instanceof Aggregate || scan instanceof Sort) {
        level.aggregates.push(scan);
      }
      level.scans.push(scan);
    } else {
      strata[0].scans.push(scan);
    }
  }
  // console.log(inspect(strata, {colors: true, depth: 10}));

  let built = [];
  for(let level of strata) {
    if(level) {
      built.push(new BlockStratum(level.scans, level.aggregates));
    }
  }

  return built;
}

function buildStrata(block, context: BuilderContext) {
  let scans = [];
  buildExpressions(block, context, block.expressions, scans);
  buildScans(block, context, block.scanLike, scans);

  let binds = buildActions(block, context, block.binds, scans);
  let commits = buildActions(block, context, block.commits, scans);

  let strata = stratify(scans);

  return {strata, binds, commits};
}

//-----------------------------------------------------------
// Block and Doc
//-----------------------------------------------------------

export function buildBlock(block) {
  let context = new BuilderContext(block);
  let {strata, binds, commits} = buildStrata(block, context);

  // console.log("-- scans ----------------------------------------------------------------");
  // console.log(inspect(scans, {colors: true, depth: 10}));

  // console.log("-- binds ----------------------------------------------------------------");
  // console.log(inspect(binds, {colors: true}));

  // console.log("-- commits --------------------------------------------------------------");
  // console.log(inspect(commits, {colors: true}));

  let ix = 0;
  for(let unprovided of context.unprovided) {
    let vars = context.registerToVars[ix].map((varName) => block.variableLookup[varName]);
    if(unprovided) {
      context.errors.push(errors.unprovidedVariableGroup(block, vars));
    }
    for(let variable of vars) {
      variable.register = ix;
    }
    ix++;
  }

  return {
    block: new Block(block.name || "Unnamed block", strata, commits, binds, block),
    errors: context.errors,
  };
}

export function buildDoc(parsedDoc) {
  let blocks = [];
  let setupInfos = [];
  let allErrors = [];
  for(let parsedBlock of parsedDoc.blocks) {
    let {block, errors} = buildBlock(parsedBlock);
    if(errors.length) {
      for(let error of errors) {
        allErrors.push(error);
      }
    } else {
      blocks.push(block);
    }
  }
  return { blocks, errors: allErrors };
}
