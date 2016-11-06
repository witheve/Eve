//-----------------------------------------------------------
// Builder
//-----------------------------------------------------------
"use strict";
var join = require("./join");
var providers = require("./providers/index");
require("./providers/math");
require("./providers/logical");
require("./providers/string");
var errors = require("./errors");
var sort_1 = require("./providers/sort");
var aggregate_1 = require("./providers/aggregate");
var actions_1 = require("./actions");
var block_1 = require("./block");
//-----------------------------------------------------------
// Runtime helpers
//-----------------------------------------------------------
function clone(map) {
    var neue = {};
    for (var _i = 0, _a = Object.keys(map); _i < _a.length; _i++) {
        var key = _a[_i];
        neue[key] = map[key];
    }
    return neue;
}
//-----------------------------------------------------------
// Builder Context
//-----------------------------------------------------------
var BuilderContext = (function () {
    function BuilderContext(block, variableToGroup, groupToValue, unprovided, registerToVars, groupIx, varIx) {
        if (variableToGroup === void 0) { variableToGroup = {}; }
        if (groupToValue === void 0) { groupToValue = {}; }
        if (unprovided === void 0) { unprovided = []; }
        if (registerToVars === void 0) { registerToVars = {}; }
        if (groupIx === void 0) { groupIx = 0; }
        if (varIx === void 0) { varIx = 0; }
        this.errors = [];
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
    BuilderContext.prototype.getValue = function (node) {
        if (node.type === "variable") {
            var group = this.variableToGroup[node.name];
            if (group === undefined) {
                throw new Error("Variable with no group: " + node);
            }
            var value = this.groupToValue[group];
            if (value === undefined)
                throw new Error("Group with no value" + node);
            return value;
        }
        else if (node.type === "parenthesis") {
            var values = [];
            for (var _i = 0, _a = node.items; _i < _a.length; _i++) {
                var item = _a[_i];
                values.push(this.getValue(item));
            }
            return values;
        }
        else if (node.type === "constant") {
            return node.value;
        }
        else {
            throw new Error("Not implemented: runtimeValue type " + node.type);
        }
    };
    BuilderContext.prototype.provide = function (node) {
        if (join.isVariable(node)) {
            if (this.nonProviding && !this.myRegisters[node.id]) {
                return;
            }
            this.unprovided[node.id] = false;
        }
    };
    BuilderContext.prototype.setGroup = function (variable, value) {
        var group = this.variableToGroup[variable.name] = value;
        return group;
    };
    BuilderContext.prototype.getGroup = function (variable, orValue) {
        var group = this.variableToGroup[variable.name];
        if (group === undefined) {
            group = this.setGroup(variable, orValue !== undefined ? orValue : this.groupIx++);
        }
        return group;
    };
    BuilderContext.prototype.hasVariable = function (variable) {
        return this.variableToGroup[variable.name] !== undefined;
    };
    BuilderContext.prototype.assignGroups = function (block) {
        var finished = false;
        while (!finished) {
            finished = true;
            for (var _i = 0, _a = block.equalities; _i < _a.length; _i++) {
                var equality = _a[_i];
                if (equality === undefined)
                    continue;
                var left = equality[0], right = equality[1];
                if (left.type === "constant" && right.type === "constant") {
                    // these must be equal, otherwise this query doesn't make any sense
                    if (left.value !== right.value) {
                        this.errors.push(errors.incompatabileConstantEquality(block, left, right));
                    }
                }
                else if (left.type === "constant") {
                    var rightGroup = this.getGroup(right);
                    var rightValue = this.groupToValue[rightGroup];
                    // if this is a variable, it came from a parent context and we can't just overwrite it in this case,
                    // the builder handles this case for us by adding explicit equality checks into the scans
                    if (!join.isVariable(rightValue)) {
                        if (rightValue !== undefined && left.value !== rightValue) {
                            this.errors.push(errors.incompatabileVariableToConstantEquality(block, right, rightValue, left));
                        }
                        this.groupToValue[rightGroup] = left.value;
                    }
                }
                else if (right.type === "constant") {
                    var leftGroup = this.getGroup(left);
                    var leftValue = this.groupToValue[leftGroup];
                    // if this is a variable, it came from a parent context and we can't just overwrite it in this case,
                    // the builder handles this case for us by adding explicit equality checks into the scans
                    if (!join.isVariable(leftValue)) {
                        if (leftValue !== undefined && leftValue !== right.value) {
                            this.errors.push(errors.incompatabileVariableToConstantEquality(block, left, leftValue, right));
                        }
                        this.groupToValue[leftGroup] = right.value;
                    }
                }
                else {
                    var leftGroup = this.getGroup(left);
                    var rightGroup = this.getGroup(right, leftGroup);
                    if (leftGroup !== rightGroup) {
                        if (leftGroup < rightGroup) {
                            this.setGroup(right, leftGroup);
                        }
                        else {
                            this.setGroup(left, rightGroup);
                        }
                        finished = false;
                    }
                }
            }
        }
    };
    BuilderContext.prototype.assignRuntimeVariables = function (block) {
        var registerToVars = this.registerToVars;
        var groupToValue = this.groupToValue;
        for (var varName in block.variables) {
            var variable = block.variables[varName];
            var group = this.getGroup(variable);
            if (group !== undefined) {
                var value = groupToValue[group];
                if (value === undefined) {
                    if (variable.constant) {
                        value = variable.constant.value;
                    }
                    else {
                        value = this.createVariable();
                        registerToVars[value.id].push(varName);
                    }
                    groupToValue[group] = value;
                }
                else {
                    if (variable.constant) {
                        if (!join.isVariable(value) && variable.constant.value !== value) {
                            this.errors.push(errors.incompatabileTransitiveEquality(block, variable, value));
                        }
                        value = variable.constant.value;
                        if (this.myRegisters[value.id]) {
                            groupToValue[group] = value;
                        }
                    }
                    else if (join.isVariable(value)) {
                        registerToVars[value.id].push(varName);
                    }
                }
            }
        }
        var unprovided = this.unprovided;
        for (var ix = 0; ix < this.varIx; ix++) {
            if (unprovided[ix] === undefined && this.myRegisters[ix]) {
                unprovided[ix] = true;
            }
        }
    };
    BuilderContext.prototype.createVariable = function () {
        this.registerToVars[this.varIx] = [];
        this.myRegisters[this.varIx] = true;
        return new join.Variable(this.varIx++);
    };
    BuilderContext.prototype.extendTo = function (block) {
        var neue = new BuilderContext(block, clone(this.variableToGroup), clone(this.groupToValue), this.unprovided, this.registerToVars, this.groupIx, this.varIx);
        neue.errors = this.errors;
        return neue;
    };
    return BuilderContext;
}());
//-----------------------------------------------------------
// Scans
//-----------------------------------------------------------
function checkSubBlockEqualities(context, block) {
    // if we have an equality that is with a constant, then we need to add
    // a node for that equality since we couldn't fold the constant into the variable
    var equalityIx = 0;
    for (var _i = 0, _a = block.equalities; _i < _a.length; _i++) {
        var equality = _a[_i];
        if (!equality)
            continue;
        var left = equality[0], right = equality[1];
        var needsEquality = void 0;
        var hasLeft = context.hasVariable(left);
        var hasRight = context.hasVariable(right);
        if (left.type === "constant" && (hasRight || right.type === "constant")) {
            needsEquality = true;
        }
        else if (right.type === "constant" && (hasLeft || left.type === "constant")) {
            needsEquality = true;
        }
        else if (hasLeft && hasRight) {
            needsEquality = true;
        }
        else if (hasLeft && !join.isVariable(context.getValue(left))) {
            needsEquality = true;
        }
        else if (hasRight && !join.isVariable(context.getValue(right))) {
            needsEquality = true;
        }
        // console.log("branch equality", left, right, leftVal, rightVal);
        if (needsEquality) {
            var expression = { type: "expression", op: "=", args: equality };
            block.expressions.push(expression);
            block.equalities[equalityIx] = undefined;
        }
        equalityIx++;
    }
}
function buildScans(block, context, scanLikes, outputScans) {
    var unprovided = block.unprovided;
    for (var _i = 0, scanLikes_1 = scanLikes; _i < scanLikes_1.length; _i++) {
        var scanLike = scanLikes_1[_i];
        if (scanLike.type === "record") {
            var entity = context.getValue(scanLike.variable);
            context.provide(entity);
            for (var _a = 0, _b = scanLike.attributes; _a < _b.length; _a++) {
                var attribute = _b[_a];
                if (attribute.value.type === "parenthesis") {
                    for (var _c = 0, _d = attribute.value.items; _c < _d.length; _c++) {
                        var item = _d[_c];
                        var value = context.getValue(item);
                        context.provide(value);
                        var final = new join.Scan(item.id + "|build", entity, attribute.attribute, value, undefined, scanLike.scopes);
                        outputScans.push(final);
                        item.buildId = final;
                    }
                }
                else {
                    var value = context.getValue(attribute.value);
                    context.provide(value);
                    var final = new join.Scan(attribute.id + "|build", entity, attribute.attribute, value, undefined, scanLike.scopes);
                    outputScans.push(final);
                    attribute.buildId = final.id;
                }
            }
        }
        else if (scanLike.type === "scan") {
            var entity = void 0;
            if (scanLike.entity) {
                entity = context.getValue(scanLike.entity);
            }
            if (!scanLike.needsEntity) {
                context.provide(entity);
            }
            var attribute = void 0;
            if (scanLike.attribute) {
                attribute = context.getValue(scanLike.attribute);
                context.provide(attribute);
            }
            var value = void 0;
            if (scanLike.value) {
                value = context.getValue(scanLike.value);
                context.provide(value);
            }
            var node = void 0;
            if (scanLike.node) {
                node = context.getValue(scanLike.node);
                context.provide(node);
            }
            var final = new join.Scan(scanLike.id + "|build", entity, attribute, value, node, scanLike.scopes);
            outputScans.push(final);
            scanLike.buildId = final.id;
        }
        else if (scanLike.type === "not") {
            checkSubBlockEqualities(context, scanLike);
            var notContext = context.extendTo(scanLike);
            notContext.nonProviding = true;
            var args = [];
            var seen = [];
            var blockVars = block.variables;
            for (var variableName in scanLike.variables) {
                var cur = blockVars[variableName];
                if (!cur)
                    continue;
                var value = notContext.getValue(cur);
                if (join.isVariable(value)) {
                    seen[value.id] = true;
                    args.push(value);
                }
            }
            var strata = buildStrata(scanLike, notContext).strata;
            var final = new join.NotScan(scanLike.id + "|build", args, strata);
            outputScans.push(final);
            scanLike.buildId = final.id;
        }
        else if (scanLike.type === "ifExpression") {
            var seen = [];
            var args = [];
            var branches = [];
            var blockVars = block.variables;
            var hasAggregate = false;
            for (var _e = 0, _f = scanLike.outputs; _e < _f.length; _e++) {
                var variable = _f[_e];
                var value = context.getValue(variable);
                if (join.isVariable(value)) {
                    seen[value.id] = true;
                }
            }
            for (var _g = 0, _h = scanLike.branches; _g < _h.length; _g++) {
                var branch = _h[_g];
                checkSubBlockEqualities(context, branch.block);
                var branchContext = context.extendTo(branch.block);
                for (var variableName in branch.block.variables) {
                    var cur = blockVars[variableName];
                    if (!cur)
                        continue;
                    var value = branchContext.getValue(cur);
                    if (join.isVariable(value) && !seen[value.id]) {
                        seen[value.id] = true;
                        args.push(value);
                    }
                }
                var strata = buildStrata(branch.block, branchContext).strata;
                var outputs_1 = [];
                for (var _j = 0, _k = branch.outputs; _j < _k.length; _j++) {
                    var output = _k[_j];
                    outputs_1.push(branchContext.getValue(output));
                }
                if (strata.length > 1) {
                    hasAggregate = true;
                }
                var final = new join.IfBranch(branch.id + "|build", strata, outputs_1, branch.exclusive);
                branches.push(final);
                branch.buildId = final.id;
            }
            var outputs = [];
            for (var _l = 0, _m = scanLike.outputs; _l < _m.length; _l++) {
                var output = _m[_l];
                var resolved = context.getValue(output);
                if (!join.isVariable(resolved)) {
                    var variable = context.createVariable();
                    var impl = providers.get("=");
                    outputScans.push(new impl(output.id + "|equality|build", [variable, resolved], []));
                    outputs.push(variable);
                    context.provide(variable);
                }
                else {
                    outputs.push(resolved);
                    context.provide(resolved);
                }
            }
            var ifScan = new join.IfScan(scanLike.id + "|build", args, outputs, branches, hasAggregate);
            outputScans.push(ifScan);
            scanLike.buildId = ifScan.id;
        }
        else {
            throw new Error("Not implemented: scanLike " + scanLike.type);
        }
    }
    return outputScans;
}
//-----------------------------------------------------------
// Expressions
//-----------------------------------------------------------
function buildExpressions(block, context, expressions, outputScans) {
    for (var _i = 0, expressions_1 = expressions; _i < expressions_1.length; _i++) {
        var expression = expressions_1[_i];
        if (expression.type === "expression") {
            var results = [];
            if (expression.variable) {
                var result = context.getValue(expression.variable);
                results.push(result);
                context.provide(result);
            }
            var args = [];
            for (var _a = 0, _b = expression.args; _a < _b.length; _a++) {
                var arg = _b[_a];
                args.push(context.getValue(arg));
            }
            var impl = providers.get(expression.op);
            if (impl) {
                outputScans.push(new impl(expression.id + "|build", args, results));
            }
            else {
                context.errors.push(errors.unimplementedExpression(block, expression));
            }
        }
        else if (expression.type === "functionRecord") {
            var results = void 0;
            if (expression.returns !== undefined) {
                results = expression.returns.slice();
            }
            else {
                results = [expression.variable];
                var resolved = context.getValue(expression.variable);
                context.provide(resolved);
            }
            var args = [];
            var impl = providers.get(expression.op);
            if (!impl) {
                context.errors.push(errors.unimplementedExpression(block, expression));
                return;
            }
            for (var _c = 0, _d = expression.record.attributes; _c < _d.length; _c++) {
                var attribute = _d[_c];
                var ix = impl.AttributeMapping[attribute.attribute];
                if (ix !== undefined) {
                    args[ix] = context.getValue(attribute.value);
                }
                else if (impl.ReturnMapping && (ix = impl.ReturnMapping[attribute.attribute]) !== undefined) {
                    results[ix] = attribute.value;
                }
                else {
                }
            }
            var resultIx = 0;
            for (var _e = 0, results_1 = results; _e < results_1.length; _e++) {
                var result = results_1[_e];
                // if one of the returns is fixed, we need to add an equality check
                // to make sure that the return is actually that constant. The constraint
                // provider may be smart enough to do that themselves, but this removes
                // the burden from them.
                var resolved = context.getValue(result);
                context.provide(resolved);
                results[resultIx] = resolved;
                if (!join.isVariable(resolved)) {
                    // @TODO: mark this variable as generated?
                    var variable = context.createVariable();
                    var klass = providers.get("=");
                    outputScans.push(new klass(resolved + "|" + resultIx + "|equality|build", [variable, resolved], []));
                    resolved = results[resultIx] = variable;
                }
                resultIx++;
            }
            outputScans.push(new impl(expression.id + "|build", args, results));
        }
        else {
            throw new Error("Not implemented: function type " + expression.type);
        }
    }
    return outputScans;
}
//-----------------------------------------------------------
// Actions
//-----------------------------------------------------------
function buildActions(block, context, actions, scans) {
    var unprovided = context.unprovided;
    var actionObjects = [];
    for (var _i = 0, actions_2 = actions; _i < actions_2.length; _i++) {
        var action = actions_2[_i];
        if (action.type === "record") {
            var projection = [];
            if (action.extraProjection) {
                for (var _a = 0, _b = action.extraProjection; _a < _b.length; _a++) {
                    var proj = _b[_a];
                    var variable = context.getValue(proj);
                    projection[variable.id] = variable;
                }
            }
            var entity = context.getValue(action.variable);
            for (var _c = 0, _d = action.attributes; _c < _d.length; _c++) {
                var attribute = _d[_c];
                var impl = void 0;
                if (action.action === "<-") {
                    impl = actions_1.ActionImplementations[":="];
                    // doing foo <- [#bar] shouldn't remove all the other tags that record has
                    // same for names
                    if (attribute.attribute === "name" || attribute.attribute === "tag") {
                        impl = actions_1.ActionImplementations["+="];
                    }
                }
                else {
                    impl = actions_1.ActionImplementations[action.action];
                }
                if (attribute.value.type === "parenthesis") {
                    for (var _e = 0, _f = attribute.value.items; _e < _f.length; _e++) {
                        var item = _f[_e];
                        var value = context.getValue(item);
                        if (value instanceof join.Variable) {
                            if (!attribute.nonProjecting && !attribute.value.nonProjecting && !item.nonProjecting) {
                                projection[value.id] = value;
                            }
                        }
                        var final = new impl(attribute.id + "|" + item.id + "|build", entity, attribute.attribute, value, undefined, action.scopes);
                        actionObjects.push(final);
                        item.buildId = final.id;
                    }
                }
                else {
                    var value = context.getValue(attribute.value);
                    if (value instanceof join.Variable) {
                        if (!attribute.nonProjecting && !attribute.value.nonProjecting) {
                            projection[value.id] = value;
                        }
                    }
                    var final = new impl(attribute.id + "|build", entity, attribute.attribute, value, undefined, action.scopes);
                    actionObjects.push(final);
                    attribute.buildId = final.id;
                }
            }
            // if this variable is unprovided, we need to generate an id
            if (unprovided[entity.id]) {
                projection = projection.filter(function (x) { return x; });
                var klass = providers.get("generateId");
                scans.push(new klass(action.id + "|" + entity.id + "|build", projection, [entity]));
                context.provide(entity);
            }
        }
        else if (action.type === "action") {
            var entity = action.entity, value = action.value, attribute = action.attribute;
            var impl = actions_1.ActionImplementations[action.action];
            if (action.action === "erase") {
                var attributeValue = attribute && attribute.type !== undefined ? context.getValue(attribute) : attribute;
                var final = new impl(action.id + "|build", context.getValue(entity), attributeValue, undefined, undefined, action.scopes);
                actionObjects.push(final);
                action.buildId = final.id;
            }
            else {
                if (entity === undefined || value === undefined || attribute === undefined) {
                    context.errors.push(errors.invalidLookupAction(block, action));
                    continue;
                }
                attribute = typeof attribute === "string" ? attribute : context.getValue(attribute);
                if (value.type === "parenthesis") {
                    for (var _g = 0, _h = value.items; _g < _h.length; _g++) {
                        var item = _h[_g];
                        var final = new impl(action.id + "|" + item.id + "|build", context.getValue(entity), attribute, context.getValue(item), undefined, action.scopes);
                        actionObjects.push(final);
                        item.buildId = final.id;
                    }
                }
                else {
                    var final = new impl(action.id + "|build", context.getValue(entity), attribute, context.getValue(value), undefined, action.scopes);
                    actionObjects.push(final);
                    action.buildId = final.id;
                }
            }
        }
        else {
            throw new Error("Not implemented: action " + action.type);
        }
    }
    return actionObjects;
}
//-----------------------------------------------------------
// Stratifier
//-----------------------------------------------------------
function stratify(scans) {
    if (!scans.length)
        return [new block_1.BlockStratum([], [])];
    var variableInfo = {};
    var blockLevel = {};
    var provide = function (variable, scan) {
        if (join.isVariable(variable)) {
            var info = variableInfo[variable.id];
            if (!info) {
                info = variableInfo[variable.id] = { providers: [] };
            }
            info.providers.push(scan);
        }
    };
    var maybeLevelVariable = function (scan, level, variable) {
        if (join.isVariable(variable)) {
            var info = variableInfo[variable.id];
            var minLevel = level;
            for (var _i = 0, _a = info.providers; _i < _a.length; _i++) {
                var provider = _a[_i];
                var providerLevel = blockLevel[scan.id] || 0;
                minLevel = Math.min(minLevel, providerLevel);
            }
            info.level = level;
        }
    };
    for (var _i = 0, scans_1 = scans; _i < scans_1.length; _i++) {
        var scan = scans_1[_i];
        if (scan instanceof join.Scan) {
            provide(scan.e, scan);
            provide(scan.a, scan);
            provide(scan.v, scan);
        }
        else if (scan instanceof aggregate_1.Aggregate || scan instanceof sort_1.Sort) {
            for (var _a = 0, _b = scan.returns; _a < _b.length; _a++) {
                var ret = _b[_a];
                provide(ret, scan);
                blockLevel[scan.id] = 1;
                if (join.isVariable(ret)) {
                    variableInfo[ret.id].level = 1;
                }
            }
        }
        else if (scan instanceof join.Constraint) {
            for (var _c = 0, _d = scan.returns; _c < _d.length; _c++) {
                var ret = _d[_c];
                provide(ret, scan);
            }
        }
        else if (scan instanceof join.IfScan) {
            for (var _e = 0, _f = scan.outputs; _e < _f.length; _e++) {
                var output = _f[_e];
                provide(output, scan);
            }
        }
        else if (scan instanceof join.NotScan) {
        }
    }
    var round = 0;
    var changed = true;
    while (changed && round <= scans.length) {
        changed = false;
        // for each scan, get the max level of the variables you rely on
        // if it's greater than your current level, set your level to that.
        // Now check all of the scans vars and see if you are either the only
        // provider or if all the providers are now in a higher level. If so,
        // the variable's level is set to the scan's new level.
        for (var _g = 0, scans_2 = scans; _g < scans_2.length; _g++) {
            var scan = scans_2[_g];
            var isAggregate = false;
            if (scan instanceof aggregate_1.Aggregate ||
                scan instanceof sort_1.Sort ||
                scan.hasAggregate ||
                (scan.strata && scan.strata.length > 1)) {
                isAggregate = true;
            }
            var levelMax = 0;
            var scanLevel = blockLevel[scan.id] || 0;
            var dependentVariables = void 0;
            var returnVariables = void 0;
            if (scan instanceof join.Scan) {
                dependentVariables = scan.vars;
                returnVariables = scan.vars;
            }
            else if (scan.args !== undefined) {
                dependentVariables = scan.args;
                returnVariables = scan.returns || scan.outputs;
            }
            else {
                throw new Error("Scan that I don't know how to stratify: " + scan);
            }
            for (var _h = 0, dependentVariables_1 = dependentVariables; _h < dependentVariables_1.length; _h++) {
                var variable = dependentVariables_1[_h];
                if (join.isVariable(variable)) {
                    var info = variableInfo[variable.id];
                    var infoLevel = 0;
                    if (info && info.level) {
                        infoLevel = info.level;
                    }
                    // if this is an aggregate, we always have to be in the level that is
                    // one greater than all our dependencies
                    if (isAggregate) {
                        infoLevel += 1;
                    }
                    levelMax = Math.max(levelMax, infoLevel);
                }
            }
            if (levelMax > scanLevel) {
                changed = true;
                blockLevel[scan.id] = levelMax;
                if (returnVariables) {
                    for (var _j = 0, returnVariables_1 = returnVariables; _j < returnVariables_1.length; _j++) {
                        var variable = returnVariables_1[_j];
                        maybeLevelVariable(scan, levelMax, variable);
                    }
                }
            }
        }
        round++;
    }
    if (round > scans.length) {
        throw new Error("Stratification cycle");
    }
    var strata = [{ scans: [], aggregates: [] }];
    for (var _k = 0, scans_3 = scans; _k < scans_3.length; _k++) {
        var scan = scans_3[_k];
        var scanStratum = blockLevel[scan.id];
        if (scanStratum !== undefined) {
            var level = strata[scanStratum];
            if (!level)
                level = strata[scanStratum] = { scans: [], aggregates: [] };
            if (scan instanceof aggregate_1.Aggregate || scan instanceof sort_1.Sort) {
                level.aggregates.push(scan);
            }
            level.scans.push(scan);
        }
        else {
            strata[0].scans.push(scan);
        }
    }
    // console.log(inspect(strata, {colors: true, depth: 10}));
    var built = [];
    for (var _l = 0, strata_1 = strata; _l < strata_1.length; _l++) {
        var level = strata_1[_l];
        if (level) {
            built.push(new block_1.BlockStratum(level.scans, level.aggregates));
        }
    }
    return built;
}
function buildStrata(block, context) {
    var scans = [];
    buildExpressions(block, context, block.expressions, scans);
    buildScans(block, context, block.scanLike, scans);
    var binds = buildActions(block, context, block.binds, scans);
    var commits = buildActions(block, context, block.commits, scans);
    var strata = stratify(scans);
    return { strata: strata, binds: binds, commits: commits };
}
//-----------------------------------------------------------
// Block and Doc
//-----------------------------------------------------------
function buildBlock(block) {
    var context = new BuilderContext(block);
    var _a = buildStrata(block, context), strata = _a.strata, binds = _a.binds, commits = _a.commits;
    // console.log("-- scans ----------------------------------------------------------------");
    // console.log(inspect(scans, {colors: true, depth: 10}));
    // console.log("-- binds ----------------------------------------------------------------");
    // console.log(inspect(binds, {colors: true}));
    // console.log("-- commits --------------------------------------------------------------");
    // console.log(inspect(commits, {colors: true}));
    var ix = 0;
    for (var _i = 0, _b = context.unprovided; _i < _b.length; _i++) {
        var unprovided = _b[_i];
        var vars = context.registerToVars[ix].map(function (varName) { return block.variableLookup[varName]; });
        if (unprovided) {
            context.errors.push(errors.unprovidedVariableGroup(block, vars));
        }
        for (var _c = 0, vars_1 = vars; _c < vars_1.length; _c++) {
            var variable = vars_1[_c];
            variable.register = ix;
        }
        ix++;
    }
    return {
        block: new block_1.Block(block.name || "Unnamed block", strata, commits, binds, block),
        errors: context.errors,
    };
}
exports.buildBlock = buildBlock;
function buildDoc(parsedDoc) {
    var blocks = [];
    var setupInfos = [];
    var allErrors = [];
    for (var _i = 0, _a = parsedDoc.blocks; _i < _a.length; _i++) {
        var parsedBlock = _a[_i];
        var _b = buildBlock(parsedBlock), block = _b.block, errors_1 = _b.errors;
        if (errors_1.length) {
            for (var _c = 0, errors_2 = errors_1; _c < errors_2.length; _c++) {
                var error = errors_2[_c];
                allErrors.push(error);
            }
        }
        else {
            blocks.push(block);
        }
    }
    return { blocks: blocks, errors: allErrors };
}
exports.buildDoc = buildDoc;
//# sourceMappingURL=builder.js.map