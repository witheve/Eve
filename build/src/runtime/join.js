//---------------------------------------------------------------------
// Generic join in Typescript over triples (EAVs)
//---------------------------------------------------------------------
"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var perf = global["perf"];
var block_1 = require("./block");
var id_1 = require("./id");
var providers = require("./providers/index");
//---------------------------------------------------------------------
// UUID
//---------------------------------------------------------------------
var _idArray = [];
function makeUUID(idprefix, projection) {
    _idArray[0] = idprefix;
    var ix = 1;
    for (var _i = 0, projection_1 = projection; _i < projection_1.length; _i++) {
        var proj = projection_1[_i];
        _idArray[ix] = proj;
        ix++;
    }
    _idArray.length = ix;
    return id_1.ids.get(_idArray);
}
//---------------------------------------------------------------------
// Variable
//---------------------------------------------------------------------
// We'll use Variable to represent relational variables in our "queries."
// These will be values used in both scans and constraints
var Variable = (function () {
    function Variable(id) {
        this.id = id;
    }
    return Variable;
}());
exports.Variable = Variable;
function isVariable(thing) {
    return thing instanceof Variable;
}
exports.isVariable = isVariable;
//---------------------------------------------------------------------
// Prefix functions
//---------------------------------------------------------------------
// Turn a "register" (either an arg or return) into a value based
// on a prefix of variables
function toValue(register, prefix) {
    if (isVariable(register)) {
        return prefix[register.id];
    }
    return register;
}
exports.toValue = toValue;
// Resolve an array of registers based on a prefix of variables
function resolve(toResolve, prefix, resolved) {
    if (resolved === void 0) { resolved = []; }
    var ix = 0;
    for (var _i = 0, toResolve_1 = toResolve; _i < toResolve_1.length; _i++) {
        var register = toResolve_1[_i];
        resolved[ix] = toValue(register, prefix);
        ix++;
    }
    return resolved;
}
exports.resolve = resolve;
// Check if this entire array of registers has values (all variables have been
// filled in by the prefix.)
function fullyResolved(toCheck, prefix) {
    for (var _i = 0, toCheck_1 = toCheck; _i < toCheck_1.length; _i++) {
        var register = toCheck_1[_i];
        if (register === undefined)
            continue;
        if (toValue(register, prefix) === undefined)
            return false;
    }
    return true;
}
//---------------------------------------------------------------------
// Scan
//---------------------------------------------------------------------
// Scans are structures that represent looking up eavs in the indexes.
// You specify a triple that they should look for which can have variables
// or constant values for e, a, or v that we'll attempt to solve for.
var Scan = (function () {
    function Scan(id, e, a, v, node, scopes) {
        this.id = id;
        this.resolved = [];
        this.eav = [e, a, v, node];
        this.e = e;
        this.a = a;
        this.v = v;
        this.node = node;
        this.proposalObject = { providing: null, index: [], cardinality: 0 };
        this.scopes = scopes || ["session"];
        // check if any of the supplied params are variables and store them
        this.vars = [];
        for (var _i = 0, _a = this.eav; _i < _a.length; _i++) {
            var register = _a[_i];
            if (isVariable(register)) {
                this.vars[register.id] = register;
            }
        }
    }
    // Return an array of the current values for all the registers
    Scan.prototype.resolve = function (prefix) {
        var resolved = this.resolved;
        resolved[0] = toValue(this.e, prefix);
        resolved[1] = toValue(this.a, prefix);
        resolved[2] = toValue(this.v, prefix);
        resolved[3] = toValue(this.node, prefix);
        return resolved;
    };
    Scan.prototype._fullScanLookup = function (index, solving, results, resolved, solvingIx, ix, maxDepth) {
        if (index === undefined)
            return;
        if (ix === maxDepth) {
            return results.push(solving.slice());
        }
        var value = resolved[ix];
        if (value === undefined) {
            var curIndex = index.index;
            for (var _i = 0, _a = Object.keys(curIndex); _i < _a.length; _i++) {
                var key = _a[_i];
                var v = curIndex[key];
                solving[solvingIx] = v.value !== undefined ? v.value : v;
                this._fullScanLookup(v, solving, results, resolved, solvingIx + 1, ix + 1, maxDepth);
            }
        }
        else {
            this._fullScanLookup(index.index[value], solving, results, resolved, solvingIx, ix + 1, maxDepth);
        }
    };
    Scan.prototype.fullScan = function (index, resolved, results) {
        var e = resolved[0], a = resolved[1], v = resolved[2], node = resolved[3];
        var solving = [];
        var solveNode = this.node !== undefined;
        var depth = solveNode ? 4 : 3;
        if (a !== undefined) {
            this._fullScanLookup(index.aveIndex, solving, results, [a, v, e, node], 0, 0, depth);
        }
        else {
            this._fullScanLookup(index.eavIndex, solving, results, resolved, 0, 0, depth);
        }
        return results;
    };
    Scan.prototype.setProposal = function (index, toProvide, scopeIx) {
        var proposal = this.proposalObject;
        if (index) {
            proposal.providing = toProvide;
            proposal.index[scopeIx] = index.index;
            proposal.cardinality += index.cardinality;
            return true;
        }
        proposal.index[scopeIx] = undefined;
        return false;
    };
    Scan.prototype.toLookupType = function (resolved) {
        var e = resolved[0], a = resolved[1], v = resolved[2], node = resolved[3];
        var foo = [];
        if (e === undefined)
            foo[0] = "*";
        else
            foo[0] = "e";
        if (a === undefined)
            foo[1] = "*";
        else
            foo[1] = "a";
        if (v === undefined)
            foo[2] = "*";
        else
            foo[2] = "v";
        if (node === undefined)
            foo[3] = "*";
        else
            foo[3] = "n";
        return foo.join("");
    };
    // Given a resolved array of values for all the registers, find out which variable we could
    // make a proposal for, what index we'd use to get the values for it, and what the cardinality
    // of the proposal is.
    Scan.prototype.getProposal = function (multiIndex, resolved) {
        var e = resolved[0], a = resolved[1], v = resolved[2], node = resolved[3];
        var lookupType = this.toLookupType(resolved);
        var proposal = this.proposalObject;
        proposal.providing = undefined;
        proposal.indexType = undefined;
        proposal.cardinality = 0;
        var scopeIx = 0;
        for (var _i = 0, _a = this.scopes; _i < _a.length; _i++) {
            var scope = _a[_i];
            var curIndex = multiIndex.getIndex(scope);
            switch (lookupType) {
                case "e***":
                    this.setProposal(curIndex.eavIndex.lookup(e), this.a, scopeIx);
                    break;
                case "ea**":
                    this.setProposal(curIndex.eavIndex.lookup(e, a), this.v, scopeIx);
                    break;
                case "eav*":
                    this.setProposal(curIndex.eavIndex.lookup(e, a, v), this.node, scopeIx);
                    break;
                case "*a**":
                    this.setProposal(curIndex.aveIndex.lookup(a), this.v, scopeIx);
                    break;
                case "*av*":
                    this.setProposal(curIndex.aveIndex.lookup(a, v), this.e, scopeIx);
                    break;
                case "***n":
                    this.setProposal(curIndex.neavIndex.lookup(node), this.e, scopeIx);
                    break;
                case "e**n":
                    this.setProposal(curIndex.neavIndex.lookup(node, e), this.a, scopeIx);
                    break;
                case "ea*n":
                    this.setProposal(curIndex.neavIndex.lookup(node, e, a), this.v, scopeIx);
                    break;
                default:
                    if (proposal.providing === undefined) {
                        var providing = proposal.providing = [];
                        if (e === undefined)
                            providing.push(this.e);
                        if (a === undefined)
                            providing.push(this.a);
                        if (v === undefined)
                            providing.push(this.v);
                        if (node === undefined && this.node !== undefined)
                            providing.push(this.node);
                    }
                    // full scan
                    proposal.index[scopeIx] = curIndex;
                    proposal.cardinality += curIndex.cardinalityEstimate;
                    proposal.indexType = "fullScan";
                    break;
            }
            scopeIx++;
        }
        return proposal;
    };
    // Return a proposal or nothing based on the currently solved prefix of variables.
    Scan.prototype.propose = function (tripleIndex, prefix) {
        var resolved = this.resolve(prefix);
        var e = resolved[0], a = resolved[1], v = resolved[2], node = resolved[3];
        // if this scan is fully resolved, then there's no variable for us to propose
        if (e !== undefined && a !== undefined && v !== undefined && (node !== undefined || this.node === undefined)) {
            return;
        }
        return this.getProposal(tripleIndex, resolved);
    };
    // Given a proposal, get the values for that proposal. There are two proposal types
    // for scans purely because of the way we wrote our indexes. Because JS will turn all
    // object keys into strings, we have to check if we're looking for real values. If we aren't
    // we can just return the string keys, otherwise we have to take the extra step of getting
    // all the actual values. If we didn't do this, we'd end up with strings instead of numbers
    // for things like someone's age.
    Scan.prototype.resolveProposal = function (proposal, prefix) {
        var values = [];
        var indexes = proposal.index;
        if (indexes === undefined || indexes.length == 0) {
            return values;
        }
        if (proposal.indexType !== "fullScan") {
            var ix = 0;
            for (var _i = 0, indexes_1 = indexes; _i < indexes_1.length; _i++) {
                var index = indexes_1[_i];
                if (index === undefined)
                    continue;
                var keys = Object.keys(index);
                var node = this.node;
                for (var _a = 0, keys_1 = keys; _a < keys_1.length; _a++) {
                    var key = keys_1[_a];
                    var value = index[key];
                    values[ix] = value.value === undefined ? value : value.value;
                    ix++;
                }
            }
        }
        else {
            var resolved = this.resolve(prefix);
            for (var _b = 0, indexes_2 = indexes; _b < indexes_2.length; _b++) {
                var index = indexes_2[_b];
                this.fullScan(index, resolved, values);
            }
        }
        return values;
    };
    // Given a prefix and a variable that we're solving for, we check if we agree with the
    // current set of values. If this scan is completely resolved, we check for the presence
    // of the value given all the filled variables. If not, we check if there's an index that
    // could provide us the rest of it.
    Scan.prototype.accept = function (multiIndex, prefix, solvingFor, force) {
        // we only need to check if we're solving for a variable that is actually part of our
        // scan
        if (!force && !this.vars[solvingFor.id])
            return true;
        var resolved = this.resolve(prefix);
        var e = resolved[0], a = resolved[1], v = resolved[2], node = resolved[3];
        // check if we're fully resolved and if so lookup to see if we accept
        if (e !== undefined && a !== undefined && v !== undefined) {
            if (this.node !== undefined) {
                //multidb
                return multiIndex.contains(this.scopes, e, a, v, node) !== undefined;
            }
            return multiIndex.contains(this.scopes, e, a, v) !== undefined;
        }
        // we can check if we get a proposal with a cardinality to determine if we can
        // accept this prefix. If we don't it means there are no values for the remaining
        // vars in the indexes.
        var proposal = this.getProposal(multiIndex, resolved);
        return proposal && proposal.cardinality > 0;
    };
    return Scan;
}());
exports.Scan = Scan;
//---------------------------------------------------------------------
// Constraint
//---------------------------------------------------------------------
// Like Scan, Constraint is a structure that represents a constraint or function
// in our "queries". Constraints have both an array of args and an array of returns,
// either of which can contain variables or constants.
var Constraint = (function () {
    function Constraint(id, args, returns) {
        this.id = id;
        this.args = args;
        this.returns = returns;
        this.proposalObject = { providing: null, cardinality: 0 };
        this.resolvedArgs = [];
        this.resolvedReturns = [];
        this.resolved = { args: null, returns: null };
        this.vars = [];
        // capture our variables
        for (var _i = 0, _a = this.args; _i < _a.length; _i++) {
            var register = _a[_i];
            if (isVariable(register)) {
                this.vars[register.id] = register;
            }
        }
        for (var _b = 0, _c = this.returns; _b < _c.length; _b++) {
            var register = _c[_b];
            if (isVariable(register)) {
                this.vars[register.id] = register;
            }
        }
    }
    Constraint.prototype.resolve = function (prefix) {
        var resolved = this.resolved;
        resolved.args = resolve(this.args, prefix, this.resolvedArgs);
        resolved.returns = resolve(this.returns, prefix, this.resolvedReturns);
        return resolved;
    };
    // In the case of a constraint, it only makes sense to propose an extension
    // to the prefix if either our args are fully resolved, but our returns aren't.
    // If that's the case, then our proposal will be to fill in our returns.
    Constraint.prototype.propose = function (tripleIndex, prefix) {
        // if either our inputs aren't resolved or our returns are all filled
        // in, then we don't have anything to propose
        if (!fullyResolved(this.args, prefix)
            || fullyResolved(this.returns, prefix))
            return;
        // find out which of our returns we could propose a value for
        var proposed;
        for (var _i = 0, _a = this.returns; _i < _a.length; _i++) {
            var ret = _a[_i];
            if (toValue(ret, prefix) === undefined) {
                proposed = ret;
                break;
            }
        }
        // Each implementation of a constraint has to provide what its potential
        // cardinality will be. Raw constraints like >, for example, will never
        // make a proposal, while something like + might return cardinality 1, and
        // split some approximation.
        return this.getProposal(tripleIndex, proposed, prefix);
    };
    // Constraints accept a prefix if either we're solving for something unrelated,
    // if their args aren't fully resolved yet (we can't compute yet!) or if their
    // returns aren't fully resolved (what would we check against?)
    Constraint.prototype.accept = function (tripleIndex, prefix, solvingFor, force) {
        if (!force &&
            !this.vars[solvingFor.id]
            || !fullyResolved(this.args, prefix)
            || !fullyResolved(this.returns, prefix))
            return true;
        // otherwise we leave it to the constraint to implement an acceptance test
        return this.test(prefix);
    };
    return Constraint;
}());
exports.Constraint = Constraint;
//---------------------------------------------------------------------
// Some constraint implementations
//---------------------------------------------------------------------
var GenerateId = (function (_super) {
    __extends(GenerateId, _super);
    function GenerateId() {
        _super.apply(this, arguments);
    }
    GenerateId.prototype.resolveProposal = function (proposal, prefix) {
        var args = this.resolve(prefix).args;
        return [makeUUID(this.id, args)];
    };
    GenerateId.prototype.test = function (prefix) {
        var _a = this.resolve(prefix), args = _a.args, returns = _a.returns;
        return returns[0] === makeUUID(this.id, args);
    };
    GenerateId.prototype.getProposal = function (tripleIndex, proposed, prefix) {
        var proposal = this.proposalObject;
        proposal.providing = proposed;
        proposal.cardinality = 1;
        return proposal;
    };
    return GenerateId;
}(Constraint));
providers.provide("generateId", GenerateId);
//---------------------------------------------------------------------
// NotScan
//---------------------------------------------------------------------
var NotScan = (function () {
    function NotScan(id, args, strata) {
        this.id = id;
        this.strata = strata;
        this.resolved = [];
        var blockVars = [];
        block_1.scansToVars(strata, blockVars);
        this.vars = args;
        this.args = args;
        this.internalVars = blockVars;
    }
    NotScan.prototype.resolve = function (prefix) {
        return resolve(this.args, prefix, this.resolved);
    };
    NotScan.prototype.propose = function () { return; };
    NotScan.prototype.resolveProposal = function () { throw new Error("Resolving a not proposal"); };
    NotScan.prototype.accept = function (multiIndex, prefix, solvingFor, force) {
        if (!force && !this.internalVars[solvingFor.id] && this.internalVars.length || !fullyResolved(this.args, prefix))
            return true;
        var resolved = this.resolve(prefix);
        var notPrefix = [];
        var ix = 0;
        for (var _i = 0, _a = this.args; _i < _a.length; _i++) {
            var arg = _a[_i];
            notPrefix[arg.id] = resolved[ix];
            ix++;
        }
        // console.log("checking not", notPrefix, this.internalVars);
        var results = [notPrefix];
        if (this.strata.length === 1) {
            results = this.strata[0].execute(multiIndex, results, { single: true });
        }
        else {
            for (var _b = 0, _c = this.strata; _b < _c.length; _b++) {
                var stratum = _c[_b];
                results = stratum.execute(multiIndex, results);
                if (results.length === 0)
                    break;
            }
        }
        // console.log("checked not!", results.length);
        return !results.length;
    };
    return NotScan;
}());
exports.NotScan = NotScan;
//---------------------------------------------------------------------
// IfScan
//---------------------------------------------------------------------
var IfBranch = (function () {
    function IfBranch(id, strata, outputs, exclusive) {
        this.id = id;
        this.strata = strata;
        this.outputs = outputs;
        this.exclusive = exclusive;
        this.variables = [];
        this.constantReturn = true;
        block_1.scansToVars(strata, this.variables);
        for (var _i = 0, outputs_1 = outputs; _i < outputs_1.length; _i++) {
            var output = outputs_1[_i];
            if (isVariable(output)) {
                this.constantReturn = false;
                this.variables[output.id] = output;
            }
        }
        this.prefix = [];
    }
    IfBranch.prototype.resolve = function (prefix) {
        return resolve(this.variables, prefix, this.prefix);
    };
    IfBranch.prototype.execute = function (multiIndex, result) {
        if (this.constantReturn && this.strata.length === 1) {
            result = this.strata[0].execute(multiIndex, result, { single: true });
        }
        else {
            for (var _i = 0, _a = this.strata; _i < _a.length; _i++) {
                var stratum = _a[_i];
                result = stratum.execute(multiIndex, result);
                if (result.length === 0)
                    break;
            }
        }
        return result;
    };
    return IfBranch;
}());
exports.IfBranch = IfBranch;
var IfScan = (function () {
    function IfScan(id, args, outputs, branches, hasAggregate) {
        if (hasAggregate === void 0) { hasAggregate = false; }
        this.id = id;
        this.branches = branches;
        this.outputs = outputs;
        this.hasAggregate = hasAggregate;
        this.resolved = [];
        this.resolvedOutputs = [];
        this.hasResolvedOutputs = false;
        var blockVars = [];
        this.vars = args.slice();
        for (var _i = 0, branches_1 = branches; _i < branches_1.length; _i++) {
            var branch = branches_1[_i];
            if (branch.exclusive)
                this.exclusive = true;
        }
        for (var _a = 0, outputs_2 = outputs; _a < outputs_2.length; _a++) {
            var output = outputs_2[_a];
            if (output !== undefined && isVariable(output)) {
                this.vars[output.id] = output;
                blockVars[output.id] = output;
            }
        }
        for (var _b = 0, args_1 = args; _b < args_1.length; _b++) {
            var arg = args_1[_b];
            if (isVariable(arg)) {
                blockVars[arg.id] = arg;
            }
        }
        this.args = args;
        this.internalVars = blockVars;
        this.proposalObject = { providing: null, index: null, cardinality: 0 };
    }
    IfScan.prototype.resolve = function (prefix) {
        return resolve(this.args, prefix, this.resolved);
    };
    IfScan.prototype.resolveOutputs = function (prefix) {
        this.hasResolvedOutputs = false;
        var resolved = resolve(this.outputs, prefix, this.resolvedOutputs);
        for (var _i = 0, resolved_1 = resolved; _i < resolved_1.length; _i++) {
            var item = resolved_1[_i];
            if (item !== undefined) {
                this.hasResolvedOutputs = true;
                break;
            }
        }
        return resolved;
    };
    IfScan.prototype.checkOutputs = function (resolved, row) {
        if (!this.hasResolvedOutputs)
            return true;
        var ix = 0;
        for (var _i = 0, resolved_2 = resolved; _i < resolved_2.length; _i++) {
            var item = resolved_2[_i];
            if (item !== undefined && item !== row[ix]) {
                return false;
            }
        }
        return true;
    };
    IfScan.prototype.getProposal = function (multiIndex, proposed, proposedIx, prefix) {
        var proposalValues = [];
        var cardinality = 0;
        var resolvedOutputs = this.resolveOutputs(prefix);
        var projection = {};
        for (var _i = 0, _a = this.branches; _i < _a.length; _i++) {
            var branch = _a[_i];
            var branchPrefix = branch.resolve(prefix);
            var result = [branchPrefix];
            result = branch.execute(multiIndex, result);
            if (result.length) {
                for (var _b = 0, result_1 = result; _b < result_1.length; _b++) {
                    var row = result_1[_b];
                    var outputRow = [];
                    for (var _c = 0, _d = branch.outputs; _c < _d.length; _c++) {
                        var output = _d[_c];
                        var value = toValue(output, row);
                        outputRow.push(value);
                    }
                    if (!this.checkOutputs(resolvedOutputs, outputRow)) {
                        continue;
                    }
                    var key = outputRow.join("|");
                    if (projection[key] === undefined) {
                        projection[key] = true;
                        proposalValues.push(outputRow);
                        cardinality++;
                    }
                }
                if (this.exclusive)
                    break;
            }
        }
        var proposal = this.proposalObject;
        proposal.providing = this.outputs;
        proposal.index = proposalValues;
        proposal.cardinality = cardinality;
        return proposal;
    };
    IfScan.prototype.propose = function (multiIndex, prefix) {
        // if either our inputs aren't resolved or our outputs are all filled
        // in, then we don't have anything to propose
        if (!fullyResolved(this.args, prefix)
            || fullyResolved(this.outputs, prefix))
            return;
        // find out which of our outputs we could propose a value for
        var proposed;
        var proposedIx = 0;
        for (var _i = 0, _a = this.outputs; _i < _a.length; _i++) {
            var ret = _a[_i];
            if (toValue(ret, prefix) === undefined) {
                proposed = ret;
                break;
            }
            proposedIx++;
        }
        return this.getProposal(multiIndex, proposed, proposedIx, prefix);
    };
    IfScan.prototype.resolveProposal = function (proposal, prefix) {
        return proposal.index;
    };
    IfScan.prototype.accept = function (multiIndex, prefix, solvingFor, force) {
        if (!force && !this.internalVars[solvingFor.id] || !fullyResolved(this.args, prefix))
            return true;
        for (var _i = 0, _a = this.branches; _i < _a.length; _i++) {
            var branch = _a[_i];
            for (var _b = 0, _c = branch.strata; _b < _c.length; _b++) {
                var stratum = _c[_b];
                var result = preJoinAccept(multiIndex, stratum.scans, stratum.vars, prefix);
                if (result.accepted) {
                    return true;
                }
            }
        }
        return false;
    };
    return IfScan;
}());
exports.IfScan = IfScan;
//---------------------------------------------------------------------
// Generic Join
//---------------------------------------------------------------------
// Generic join functions by going through proposals for each variable being
// solved for. This happens in "rounds" where we solve an individual variable
// at a time. Unlike most join algorithms, no ordering is fixed here. Instead,
// proposals are issued and the best, based on lowest cardinality, is selected
// and used as the current variable to solve for. It's important to note that this
// happens based on the values of the currently solved "prefix" - a partially filled
// row of values - which means that generic join chooses an order for each unique
// set of values it comes into contact with. This implementation uses recursion to
// do subsequent rounds for a given prefix and only allocates a row when a fully
// validated result has been found.
//
// A join round takes a set of providers, the current prefix, how many rounds are remaining,
// and an array to hold accepted rows.
function joinRound(multiIndex, providers, prefix, rounds, rows, options) {
    var solverInfo = options.solverInfo;
    // To start out we need to find the best proposal given the providers we have. We'll
    // start our bestProposal out at some horrible cardinality
    var bestProposal = { providing: undefined, cardinality: Infinity };
    var bestProvider, bestProviderIx;
    var ix = 0;
    // Walk through the providers and ask for proposals
    for (var _i = 0, providers_1 = providers; _i < providers_1.length; _i++) {
        var provider = providers_1[_i];
        var proposed = provider.propose(multiIndex, prefix);
        // if we've found a lower cardinality, we want to keep track of that provider
        if (proposed !== undefined && proposed.cardinality < bestProposal.cardinality) {
            bestProposal = proposed;
            bestProvider = provider;
            bestProviderIx = ix;
        }
        ix++;
    }
    // console.log("Best provider", rounds, bestProvider, bestProposal);
    // if we never found a provider that means we have no more valid solutions
    // and we have nothing more to do
    if (bestProvider === undefined || bestProposal.cardinality === 0) {
        if (bestProviderIx !== undefined)
            solverInfo[bestProviderIx]++;
        return;
    }
    // Otherwise, we ask the provider to resolve their proposal into values that
    // we then need to see if the other providers accept.
    var values = bestProvider.resolveProposal(bestProposal, prefix);
    var providing = bestProposal.providing;
    var providingOne = providing.constructor !== Array;
    if (providingOne) {
        providing = [providing];
    }
    var providingLength = providing.length;
    for (var _a = 0, values_1 = values; _a < values_1.length; _a++) {
        var value = values_1[_a];
        // Set the current value in our prefix of solved variables
        var providingIx = 0;
        for (var _b = 0, providing_1 = providing; _b < providing_1.length; _b++) {
            var currentProvide = providing_1[_b];
            if (providingOne) {
                prefix[currentProvide.id] = value;
            }
            else {
                prefix[currentProvide.id] = value[providingIx];
            }
            providingIx++;
        }
        // Unless someone tells us otherwise, we'll assume that we can accept
        // this proposal and continue solving
        var accepted = true;
        var providerIx = 0;
        for (var _c = 0, providers_2 = providers; _c < providers_2.length; _c++) {
            var provider = providers_2[_c];
            // we don't need to check this prefix against ourselves since we're the ones
            // who proposed it
            if (provider !== bestProvider) {
                for (var _d = 0, providing_2 = providing; _d < providing_2.length; _d++) {
                    var currentProvide = providing_2[_d];
                    if (!provider.accept(multiIndex, prefix, currentProvide)) {
                        // console.log("bailing", provider);
                        solverInfo[providerIx]++;
                        accepted = false;
                        break;
                    }
                }
            }
            providerIx++;
        }
        // if we accepted this prefix and we're not on our final round, then
        // we continue on to the next round by recursing with this prefix
        if (accepted && rounds - providingLength > 0) {
            joinRound(multiIndex, providers, prefix, rounds - providingLength, rows, options);
        }
        else if (accepted) {
            // otherwise if we're accepted, we have a valid result and we add it
            // to our list of rows
            rows.push(prefix.slice());
        }
        // if we are only looking for a single result, e.g. for a NotScan, and we have
        // a row, bail out of the evaluation
        if (options.single && rows.length)
            return;
        // since we're using the same prefix in our recursions, we have to clean
        // up after ourselves so that parent rounds don't see our solved variables
        // in their prefix.
        for (var _e = 0, providing_3 = providing; _e < providing_3.length; _e++) {
            var currentProvide = providing_3[_e];
            prefix[currentProvide.id] = undefined;
        }
    }
}
function preJoinAccept(multiIndex, providers, vars, prefix) {
    if (prefix === void 0) { prefix = []; }
    var ix = 0;
    var presolved = 0;
    for (var _i = 0, prefix_1 = prefix; _i < prefix_1.length; _i++) {
        var value = prefix_1[_i];
        var solvingFor = vars[ix];
        if (value !== undefined && vars[ix] !== undefined) {
            presolved++;
            for (var _a = 0, providers_3 = providers; _a < providers_3.length; _a++) {
                var provider = providers_3[_a];
                if (!provider.accept(multiIndex, prefix, solvingFor)) {
                    return { accepted: false, presolved: presolved };
                }
            }
        }
        ix++;
    }
    return { accepted: true, presolved: presolved };
}
// Convenient function to kick off a join. We only care about vars here
// to determine how may rounds of generic join we need to do. Since we solve
// for one variable each round, it's the number of vars in the query.
function join(multiIndex, providers, vars, prefix, options) {
    if (prefix === void 0) { prefix = []; }
    if (options === void 0) { options = {}; }
    var rows = options.rows || [];
    var _a = preJoinAccept(multiIndex, providers, vars, prefix), presolved = _a.presolved, accepted = _a.accepted;
    if (!accepted)
        return rows;
    var rounds = 0;
    for (var _i = 0, vars_1 = vars; _i < vars_1.length; _i++) {
        var variable = vars_1[_i];
        if (variable !== undefined)
            rounds++;
    }
    rounds = rounds - presolved;
    if (presolved > 0 && rounds === 0) {
        rows.push(prefix.slice());
    }
    else if (rounds === 0) {
        for (var _b = 0, providers_4 = providers; _b < providers_4.length; _b++) {
            var provider = providers_4[_b];
            if (!provider.accept(multiIndex, prefix, null, true)) {
                return rows;
            }
        }
        rows.push(prefix.slice());
    }
    else {
        joinRound(multiIndex, providers, prefix, rounds, rows, options);
    }
    return rows;
}
exports.join = join;
//# sourceMappingURL=join.js.map