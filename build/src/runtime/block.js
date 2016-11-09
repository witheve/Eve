//---------------------------------------------------------------------
// Block
//---------------------------------------------------------------------
"use strict";
var join_1 = require("./join");
var changes_1 = require("./changes");
var actions_1 = require("./actions");
//---------------------------------------------------------------------
// DependencyChecker
//---------------------------------------------------------------------
var DependencyChecker = (function () {
    function DependencyChecker(block) {
        this.alwaysTrue = block.singleRun;
        var map = this.buildVariableMap(block);
        this.dependencies = this.buildDependencies(map);
    }
    DependencyChecker.prototype.buildVariableMap = function (block, variableMap) {
        if (variableMap === void 0) { variableMap = { "any": { attributes: {} } }; }
        for (var _i = 0, _a = block.strata; _i < _a.length; _i++) {
            var level = _a[_i];
            for (var _b = 0, _c = level.scans; _b < _c.length; _b++) {
                var scan = _c[_b];
                if (scan instanceof join_1.Scan) {
                    var e = scan.e, a = scan.a, v = scan.v;
                    var cur = void 0;
                    if (join_1.isVariable(e)) {
                        cur = variableMap[e.id];
                        if (cur === undefined) {
                            cur = variableMap[e.id] = { attributes: {} };
                        }
                    }
                    else {
                        cur = variableMap["any"];
                    }
                    if (!join_1.isVariable(a)) {
                        var attrInfo = cur.attributes[a];
                        if (attrInfo === undefined) {
                            attrInfo = cur.attributes[a] = { values: [] };
                        }
                        if (!join_1.isVariable(v)) {
                            cur.attributes[a].values.push(v);
                        }
                        else {
                            attrInfo.any = true;
                        }
                    }
                    else {
                        cur.any = true;
                    }
                }
                else if (scan instanceof join_1.NotScan) {
                    // this.alwaysTrue = true;
                    this.buildVariableMap(scan, variableMap);
                }
                else if (scan instanceof join_1.IfScan) {
                    // this.alwaysTrue = true;
                    for (var _d = 0, _e = scan.branches; _d < _e.length; _d++) {
                        var branch = _e[_d];
                        this.buildVariableMap(branch, variableMap);
                    }
                }
            }
        }
        return variableMap;
    };
    DependencyChecker.prototype._depsForTag = function (deps, attributes, tag) {
        var attributeIndex = deps[tag];
        if (!attributeIndex) {
            attributeIndex = deps[tag] = {};
        }
        for (var _i = 0, _a = Object.keys(attributes); _i < _a.length; _i++) {
            var attribute = _a[_i];
            var attributeInfo = attributes[attribute];
            var vIndex = attributeIndex[attribute];
            if (!vIndex && !attributeInfo.any) {
                vIndex = attributeIndex[attribute] = {};
            }
            else if (attributeInfo.any || vIndex === true) {
                attributeIndex[attribute] = true;
                continue;
            }
            for (var _b = 0, _c = attributeInfo.values; _b < _c.length; _b++) {
                var value = _c[_b];
                vIndex[value] = true;
            }
        }
    };
    DependencyChecker.prototype.buildDependencies = function (variableMap) {
        var deps = { "any": { "tag": {} } };
        for (var _i = 0, _a = Object.keys(variableMap); _i < _a.length; _i++) {
            var variableId = _a[_i];
            var _b = variableMap[variableId], any = _b.any, attributes = _b.attributes;
            if (any) {
                this.alwaysTrue = true;
            }
            var tagAttributes = attributes["tag"];
            if (!tagAttributes || tagAttributes.any) {
                this._depsForTag(deps, attributes, "any");
            }
            else {
                for (var _c = 0, _d = tagAttributes.values; _c < _d.length; _c++) {
                    var tag = _d[_c];
                    if (deps["any"]["tag"] === true)
                        break;
                    deps["any"]["tag"][tag] = true;
                    this._depsForTag(deps, attributes, tag);
                }
            }
        }
        return deps;
    };
    DependencyChecker.prototype.check = function (multiIndex, change, tags, e, a, v) {
        //multidb
        if (this.alwaysTrue)
            return true;
        var deps = this.dependencies;
        if (tags.length === 0) {
            var attrIndex = deps["any"];
            if (!attrIndex)
                return false;
            var attr = attrIndex[a];
            if (attr === true)
                return true;
            if (attr === undefined)
                return false;
            return attr[v];
        }
        if (deps["any"]) {
            var attr = deps["any"][a];
            if (attr === true)
                return true;
            if (attr === true && attr[v] === true)
                return true;
        }
        for (var _i = 0, tags_1 = tags; _i < tags_1.length; _i++) {
            var tag = tags_1[_i];
            var attrIndex = deps[tag];
            if (!attrIndex)
                continue;
            var attr = attrIndex[a];
            if (attr === undefined)
                continue;
            if (attr === true || attr[v] === true)
                return true;
        }
        return false;
    };
    return DependencyChecker;
}());
exports.DependencyChecker = DependencyChecker;
//---------------------------------------------------------------------
// Block
//---------------------------------------------------------------------
function hasDatabaseScan(strata) {
    for (var _i = 0, strata_1 = strata; _i < strata_1.length; _i++) {
        var stratum = strata_1[_i];
        for (var _a = 0, _b = stratum.scans; _a < _b.length; _a++) {
            var scan = _b[_a];
            if (scan instanceof join_1.Scan)
                return true;
            if (scan instanceof join_1.IfScan)
                return true;
            if (scan instanceof join_1.NotScan)
                return true;
        }
    }
    return false;
}
function scansToVars(scans, output) {
    if (output === void 0) { output = []; }
    for (var _i = 0, scans_1 = scans; _i < scans_1.length; _i++) {
        var scan = scans_1[_i];
        for (var _a = 0, _b = scan.vars; _a < _b.length; _a++) {
            var variable = _b[_a];
            if (variable) {
                output[variable.id] = variable;
            }
        }
    }
    return output;
}
exports.scansToVars = scansToVars;
var BlockStratum = (function () {
    function BlockStratum(scans, aggregates) {
        if (aggregates === void 0) { aggregates = []; }
        this.solverInfo = [];
        this.resultCount = 0;
        this.scans = scans;
        this.aggregates = aggregates;
        var vars = [];
        scansToVars(scans, vars);
        this.vars = vars;
    }
    BlockStratum.prototype.execute = function (multiIndex, rows, options) {
        if (options === void 0) { options = {}; }
        var ix = 0;
        for (var _i = 0, _a = this.scans; _i < _a.length; _i++) {
            var scan = _a[_i];
            this.solverInfo[ix] = 0;
            ix++;
        }
        var results = [];
        for (var _b = 0, _c = this.aggregates; _b < _c.length; _b++) {
            var aggregate = _c[_b];
            aggregate.aggregate(rows);
        }
        for (var _d = 0, rows_1 = rows; _d < rows_1.length; _d++) {
            var row = rows_1[_d];
            options.rows = results;
            options.solverInfo = this.solverInfo;
            results = join_1.join(multiIndex, this.scans, this.vars, row, options);
        }
        this.resultCount = results.length;
        this.results = results;
        return results;
    };
    return BlockStratum;
}());
exports.BlockStratum = BlockStratum;
var Block = (function () {
    function Block(name, strata, commitActions, bindActions, parse) {
        this.id = parse.id || Block.BlockId++;
        this.name = name;
        this.strata = strata;
        this.commitActions = commitActions;
        this.bindActions = bindActions;
        this.parse = parse;
        this.dormant = false;
        if (!hasDatabaseScan(strata)) {
            this.singleRun = true;
        }
        var blockVars = [];
        scansToVars(strata, blockVars);
        scansToVars(commitActions, blockVars);
        scansToVars(bindActions, blockVars);
        this.vars = blockVars;
        this.prevInserts = new changes_1.ChangesIndex();
        this.checker = new DependencyChecker(this);
    }
    Block.prototype.updateBinds = function (diff, changes) {
        var newPositions = diff.positions;
        var newInfo = diff.info;
        var _a = this.prevInserts, positions = _a.positions, info = _a.info;
        for (var _i = 0, _b = Object.keys(positions); _i < _b.length; _i++) {
            var key = _b[_i];
            var pos = positions[key];
            var type = info[pos];
            var neuePos = newPositions[key];
            var neueType = newInfo[neuePos];
            // if this was added
            if (neueType === undefined) {
                var e = info[pos + 1];
                var a = info[pos + 2];
                var v = info[pos + 3];
                var node = info[pos + 4];
                var scope = info[pos + 5];
                changes.unstore(scope, e, a, v, node);
            }
        }
    };
    Block.prototype.execute = function (multiIndex, changes) {
        if (this.dormant) {
            return changes;
        }
        else if (this.singleRun) {
            this.dormant = true;
        }
        // console.groupCollapsed(this.name);
        // console.log("--- " + this.name + " --------------------------------");
        var results = [[]];
        for (var _i = 0, _a = this.strata; _i < _a.length; _i++) {
            var stratum = _a[_i];
            results = stratum.execute(multiIndex, results);
            if (results.length === 0)
                break;
        }
        this.results = results;
        // console.log("results :: ", time(start));
        // console.log(" >>> RESULTS")
        // console.log(results);
        // console.log(" <<<< RESULTS")
        if (this.commitActions.length !== 0) {
            actions_1.executeActions(multiIndex, this.commitActions, results, changes);
        }
        if (this.bindActions.length !== 0) {
            var diff = actions_1.executeActions(multiIndex, this.bindActions, results, changes, true);
            this.updateBinds(diff, changes);
            this.prevInserts = diff;
        }
        // console.log(changes);
        // console.groupEnd();
        return changes;
    };
    Block.BlockId = 0;
    return Block;
}());
exports.Block = Block;
//# sourceMappingURL=block.js.map