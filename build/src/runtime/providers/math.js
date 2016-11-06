//---------------------------------------------------------------------
// Math providers
//---------------------------------------------------------------------
"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var join_1 = require("../join");
var providers = require("./index");
var Add = (function (_super) {
    __extends(Add, _super);
    function Add() {
        _super.apply(this, arguments);
    }
    // Add proposes the addition of its args as its value for the
    // proposed variable.
    Add.prototype.resolveProposal = function (proposal, prefix) {
        var args = this.resolve(prefix).args;
        return [args[0] + args[1]];
    };
    // Check if our return is equivalent to adding our args
    Add.prototype.test = function (prefix) {
        var _a = this.resolve(prefix), args = _a.args, returns = _a.returns;
        return args[0] + args[1] === returns[0];
    };
    // Add always has a cardinality of 1
    Add.prototype.getProposal = function (tripleIndex, proposed, prefix) {
        var proposal = this.proposalObject;
        proposal.providing = proposed;
        proposal.cardinality = 1;
        return proposal;
    };
    return Add;
}(join_1.Constraint));
var Subtract = (function (_super) {
    __extends(Subtract, _super);
    function Subtract() {
        _super.apply(this, arguments);
    }
    // subtract proposes the subtractition of its args as its value for the
    // proposed variable.
    Subtract.prototype.resolveProposal = function (proposal, prefix) {
        var args = this.resolve(prefix).args;
        return [args[0] - args[1]];
    };
    // Check if our return is equivalent to subtracting our args
    Subtract.prototype.test = function (prefix) {
        var _a = this.resolve(prefix), args = _a.args, returns = _a.returns;
        return args[0] - args[1] === returns[0];
    };
    // subtract always has a cardinality of 1
    Subtract.prototype.getProposal = function (tripleIndex, proposed, prefix) {
        var proposal = this.proposalObject;
        proposal.providing = proposed;
        proposal.cardinality = 1;
        return proposal;
    };
    return Subtract;
}(join_1.Constraint));
var Multiply = (function (_super) {
    __extends(Multiply, _super);
    function Multiply() {
        _super.apply(this, arguments);
    }
    // multiply proposes the multiplyition of its args as its value for the
    // proposed variable.
    Multiply.prototype.resolveProposal = function (proposal, prefix) {
        var args = this.resolve(prefix).args;
        return [args[0] * args[1]];
    };
    // Check if our return is equivalent to multiplying our args
    Multiply.prototype.test = function (prefix) {
        var _a = this.resolve(prefix), args = _a.args, returns = _a.returns;
        return args[0] * args[1] === returns[0];
    };
    // multiply always has a cardinality of 1
    Multiply.prototype.getProposal = function (tripleIndex, proposed, prefix) {
        var proposal = this.proposalObject;
        proposal.providing = proposed;
        proposal.cardinality = 1;
        return proposal;
    };
    return Multiply;
}(join_1.Constraint));
var Divide = (function (_super) {
    __extends(Divide, _super);
    function Divide() {
        _super.apply(this, arguments);
    }
    // divide proposes the divideition of its args as its value for the
    // proposed variable.
    Divide.prototype.resolveProposal = function (proposal, prefix) {
        var args = this.resolve(prefix).args;
        return [args[0] / args[1]];
    };
    // Check if our return is equivalent to divideing our args
    Divide.prototype.test = function (prefix) {
        var _a = this.resolve(prefix), args = _a.args, returns = _a.returns;
        return args[0] / args[1] === returns[0];
    };
    // divide always has a cardinality of 1
    Divide.prototype.getProposal = function (tripleIndex, proposed, prefix) {
        var proposal = this.proposalObject;
        proposal.providing = proposed;
        proposal.cardinality = 1;
        return proposal;
    };
    return Divide;
}(join_1.Constraint));
var Sin = (function (_super) {
    __extends(Sin, _super);
    function Sin() {
        _super.apply(this, arguments);
    }
    Sin.prototype.resolveProposal = function (proposal, prefix) {
        var args = this.resolve(prefix).args;
        return [Math.sin(args[0] * (Math.PI / 180))];
    };
    Sin.prototype.test = function (prefix) {
        var _a = this.resolve(prefix), args = _a.args, returns = _a.returns;
        return Math.sin(args[0] * (Math.PI / 180)) === returns[0];
    };
    Sin.prototype.getProposal = function (tripleIndex, proposed, prefix) {
        var proposal = this.proposalObject;
        proposal.providing = proposed;
        proposal.cardinality = 1;
        return proposal;
    };
    Sin.AttributeMapping = {
        "angle": 0,
    };
    return Sin;
}(join_1.Constraint));
var Log = (function (_super) {
    __extends(Log, _super);
    function Log() {
        _super.apply(this, arguments);
    }
    // log proposes the log of its arg as its value for the proposed variable.
    Log.prototype.resolveProposal = function (proposal, prefix) {
        var args = this.resolve(prefix).args;
        return [Math.log(args[0]) / Math.log(10)];
    };
    // Check if our return is equivalent to multiplying our args
    Log.prototype.test = function (prefix) {
        var _a = this.resolve(prefix), args = _a.args, returns = _a.returns;
        return Math.log(args[0]) / Math.log(10) === returns[0];
    };
    // multiply always has a cardinality of 1
    Log.prototype.getProposal = function (tripleIndex, proposed, prefix) {
        var proposal = this.proposalObject;
        proposal.providing = proposed;
        proposal.cardinality = 1;
        return proposal;
    };
    Log.AttributeMapping = {
        "value": 0,
    };
    return Log;
}(join_1.Constraint));
var Pow = (function (_super) {
    __extends(Pow, _super);
    function Pow() {
        _super.apply(this, arguments);
    }
    // log proposes the log of its arg as its value for the proposed variable.
    Pow.prototype.resolveProposal = function (proposal, prefix) {
        var args = this.resolve(prefix).args;
        return [Math.pow(args[1], args[0])];
    };
    // Check if our return is equivalent to multiplying our args
    Pow.prototype.test = function (prefix) {
        var _a = this.resolve(prefix), args = _a.args, returns = _a.returns;
        return Math.pow(args[1], args[0]) === returns[0];
    };
    // multiply always has a cardinality of 1
    Pow.prototype.getProposal = function (tripleIndex, proposed, prefix) {
        var proposal = this.proposalObject;
        proposal.providing = proposed;
        proposal.cardinality = 1;
        return proposal;
    };
    Pow.AttributeMapping = {
        "value": 0,
        "by": 1,
    };
    return Pow;
}(join_1.Constraint));
var Mod = (function (_super) {
    __extends(Mod, _super);
    function Mod() {
        _super.apply(this, arguments);
    }
    Mod.prototype.resolveProposal = function (proposal, prefix) {
        var args = this.resolve(prefix).args;
        return [args[0] % args[1]];
    };
    Mod.prototype.test = function (prefix) {
        var _a = this.resolve(prefix), args = _a.args, returns = _a.returns;
        return args[0] % args[1] === returns[0];
    };
    Mod.prototype.getProposal = function (tripleIndex, proposed, prefix) {
        var proposal = this.proposalObject;
        proposal.providing = proposed;
        proposal.cardinality = 1;
        return proposal;
    };
    Mod.AttributeMapping = {
        "value": 0,
        "by": 1,
    };
    return Mod;
}(join_1.Constraint));
var Abs = (function (_super) {
    __extends(Abs, _super);
    function Abs() {
        _super.apply(this, arguments);
    }
    Abs.prototype.resolveProposal = function (proposal, prefix) {
        var args = this.resolve(prefix).args;
        return [Math.abs(args[0])];
    };
    Abs.prototype.test = function (prefix) {
        var _a = this.resolve(prefix), args = _a.args, returns = _a.returns;
        return Math.abs(args[0]) === returns[0];
    };
    Abs.prototype.getProposal = function (tripleIndex, proposed, prefix) {
        var proposal = this.proposalObject;
        proposal.providing = proposed;
        proposal.cardinality = 1;
        return proposal;
    };
    Abs.AttributeMapping = {
        "value": 0,
    };
    return Abs;
}(join_1.Constraint));
var Floor = (function (_super) {
    __extends(Floor, _super);
    function Floor() {
        _super.apply(this, arguments);
    }
    Floor.prototype.resolveProposal = function (proposal, prefix) {
        var args = this.resolve(prefix).args;
        return [Math.floor(args[0])];
    };
    Floor.prototype.test = function (prefix) {
        var _a = this.resolve(prefix), args = _a.args, returns = _a.returns;
        return Math.floor(args[0]) === returns[0];
    };
    Floor.prototype.getProposal = function (tripleIndex, proposed, prefix) {
        var proposal = this.proposalObject;
        proposal.providing = proposed;
        proposal.cardinality = 1;
        return proposal;
    };
    Floor.AttributeMapping = {
        "value": 0,
    };
    return Floor;
}(join_1.Constraint));
var Ceiling = (function (_super) {
    __extends(Ceiling, _super);
    function Ceiling() {
        _super.apply(this, arguments);
    }
    Ceiling.prototype.resolveProposal = function (proposal, prefix) {
        var args = this.resolve(prefix).args;
        return [Math.ceil(args[0])];
    };
    Ceiling.prototype.test = function (prefix) {
        var _a = this.resolve(prefix), args = _a.args, returns = _a.returns;
        return Math.ceil(args[0]) === returns[0];
    };
    Ceiling.prototype.getProposal = function (tripleIndex, proposed, prefix) {
        var proposal = this.proposalObject;
        proposal.providing = proposed;
        proposal.cardinality = 1;
        return proposal;
    };
    Ceiling.AttributeMapping = {
        "value": 0,
    };
    return Ceiling;
}(join_1.Constraint));
var Cos = (function (_super) {
    __extends(Cos, _super);
    function Cos() {
        _super.apply(this, arguments);
    }
    Cos.prototype.resolveProposal = function (proposal, prefix) {
        var args = this.resolve(prefix).args;
        return [Math.cos(args[0] * (Math.PI / 180))];
    };
    Cos.prototype.test = function (prefix) {
        var _a = this.resolve(prefix), args = _a.args, returns = _a.returns;
        return Math.cos(args[0] * (Math.PI / 180)) === returns[0];
    };
    Cos.prototype.getProposal = function (tripleIndex, proposed, prefix) {
        var proposal = this.proposalObject;
        proposal.providing = proposed;
        proposal.cardinality = 1;
        return proposal;
    };
    Cos.AttributeMapping = {
        "angle": 0,
    };
    return Cos;
}(join_1.Constraint));
var Random = (function (_super) {
    __extends(Random, _super);
    function Random() {
        _super.apply(this, arguments);
    }
    Random.prototype.getRandom = function (seed) {
        var found = Random.cache[seed];
        if (found)
            return found;
        return Random.cache[seed] = Math.random();
    };
    Random.prototype.resolveProposal = function (proposal, prefix) {
        var args = this.resolve(prefix).args;
        return [this.getRandom(args[0])];
    };
    Random.prototype.test = function (prefix) {
        var _a = this.resolve(prefix), args = _a.args, returns = _a.returns;
        return this.getRandom(args[0]) === returns[0];
    };
    Random.prototype.getProposal = function (tripleIndex, proposed, prefix) {
        var proposal = this.proposalObject;
        proposal.providing = proposed;
        proposal.cardinality = 1;
        return proposal;
    };
    Random.AttributeMapping = {
        "seed": 0,
    };
    Random.cache = {};
    return Random;
}(join_1.Constraint));
var Gaussian = (function (_super) {
    __extends(Gaussian, _super);
    function Gaussian() {
        _super.apply(this, arguments);
    }
    Gaussian.prototype.getRandom = function (seed, sigma, mu) {
        if (sigma === undefined)
            sigma = 1.0;
        if (mu === undefined)
            mu = 0.0;
        var found = Random.cache[seed];
        if (found)
            return found;
        var u1 = Math.random();
        var u2 = Math.random();
        var z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(Math.PI * 2 * u2);
        var key = "" + seed + sigma + mu;
        var res = z0 * sigma + mu;
        Random.cache[key] = res;
        return res;
    };
    Gaussian.prototype.resolveProposal = function (proposal, prefix) {
        var args = this.resolve(prefix).args;
        return [this.getRandom(args[0], args[1], args[2])];
    };
    Gaussian.prototype.test = function (prefix) {
        var _a = this.resolve(prefix), args = _a.args, returns = _a.returns;
        return this.getRandom(args[0], args[1], args[2]) === returns[0];
    };
    Gaussian.prototype.getProposal = function (tripleIndex, proposed, prefix) {
        var proposal = this.proposalObject;
        proposal.providing = proposed;
        proposal.cardinality = 1;
        return proposal;
    };
    Gaussian.AttributeMapping = {
        "seed": 0,
        "σ": 1,
        "μ": 2
    };
    Gaussian.cache = {};
    return Gaussian;
}(join_1.Constraint));
var Range = (function (_super) {
    __extends(Range, _super);
    function Range() {
        _super.apply(this, arguments);
    }
    Range.prototype.resolveProposal = function (proposal, prefix) {
        var args = this.resolve(prefix).args;
        var from = args[0], to = args[1], increment = args[2];
        increment = increment || 1;
        var results = [];
        if (from <= to) {
            for (var val = from; val <= to; val += increment) {
                results.push(val);
            }
        }
        else {
            for (var val = from; val >= to; val += increment) {
                results.push(val);
            }
        }
        return results;
    };
    Range.prototype.test = function (prefix) {
        var _a = this.resolve(prefix), args = _a.args, returns = _a.returns;
        var from = args[0], to = args[1], increment = args[2];
        increment = increment || 1;
        var val = returns[0];
        var member = from <= val && val <= to &&
            ((val - from) % increment) == 0;
        return member;
    };
    Range.prototype.getProposal = function (tripleIndex, proposed, prefix) {
        var args = this.resolve(prefix).args;
        var from = args[0], to = args[1], increment = args[2];
        increment = args[2] || 1;
        var proposal = this.proposalObject;
        proposal.providing = proposed;
        if (from <= to && increment < 0) {
            proposal.cardinality = 0;
            return proposal;
        }
        else if (from > to && increment > 0) {
            proposal.cardinality = 0;
            return proposal;
        }
        proposal.cardinality = Math.ceil(Math.abs((to - from + 1) / increment));
        return proposal;
    };
    Range.AttributeMapping = {
        "from": 0,
        "to": 1,
        "increment": 2,
    };
    return Range;
}(join_1.Constraint));
var Round = (function (_super) {
    __extends(Round, _super);
    function Round() {
        _super.apply(this, arguments);
    }
    Round.prototype.resolveProposal = function (proposal, prefix) {
        var args = this.resolve(prefix).args;
        return [Math.round(args[0])];
    };
    Round.prototype.test = function (prefix) {
        var _a = this.resolve(prefix), args = _a.args, returns = _a.returns;
        return Math.round(args[0]) === returns[0];
    };
    Round.prototype.getProposal = function (tripleIndex, proposed, prefix) {
        var proposal = this.proposalObject;
        proposal.providing = proposed;
        proposal.cardinality = 1;
        return proposal;
    };
    Round.AttributeMapping = {
        "value": 0,
    };
    return Round;
}(join_1.Constraint));
var ToFixed = (function (_super) {
    __extends(ToFixed, _super);
    function ToFixed() {
        _super.apply(this, arguments);
    }
    ToFixed.prototype.resolveProposal = function (proposal, prefix) {
        var args = this.resolve(prefix).args;
        return [args[0].toFixed(args[1])];
    };
    ToFixed.prototype.test = function (prefix) {
        var _a = this.resolve(prefix), args = _a.args, returns = _a.returns;
        return args[0].toFixed(args[1]) === returns[0];
    };
    ToFixed.prototype.getProposal = function (tripleIndex, proposed, prefix) {
        var proposal = this.proposalObject;
        proposal.providing = proposed;
        proposal.cardinality = 1;
        return proposal;
    };
    ToFixed.AttributeMapping = {
        "value": 0,
        "places": 1,
    };
    return ToFixed;
}(join_1.Constraint));
providers.provide("+", Add);
providers.provide("-", Subtract);
providers.provide("*", Multiply);
providers.provide("/", Divide);
providers.provide("sin", Sin);
providers.provide("log", Log);
providers.provide("cos", Cos);
providers.provide("floor", Floor);
providers.provide("ceiling", Ceiling);
providers.provide("abs", Abs);
providers.provide("mod", Mod);
providers.provide("pow", Pow);
providers.provide("random", Random);
providers.provide("range", Range);
providers.provide("round", Round);
providers.provide("gaussian", Gaussian);
providers.provide("to-fixed", ToFixed);
//# sourceMappingURL=math.js.map