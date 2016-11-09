//---------------------------------------------------------------------
// Logical providers
//---------------------------------------------------------------------
"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var join_1 = require("../join");
var providers = require("./index");
var BooleanOperation = (function (_super) {
    __extends(BooleanOperation, _super);
    function BooleanOperation() {
        _super.apply(this, arguments);
    }
    BooleanOperation.prototype.resolveProposal = function (proposal, prefix) {
        var args = this.resolve(prefix).args;
        return [this.compare(args[0], args[1])];
    };
    BooleanOperation.prototype.getProposal = function (tripleIndex, proposed, prefix) {
        if (this.returns.length) {
            var proposal = this.proposalObject;
            proposal.providing = proposed;
            proposal.cardinality = 1;
            return proposal;
        }
        return;
    };
    BooleanOperation.prototype.test = function (prefix) {
        var _a = this.resolve(prefix), args = _a.args, returns = _a.returns;
        var result = this.compare(args[0], args[1]);
        if (returns.length) {
            return result === returns[0];
        }
        return result;
    };
    return BooleanOperation;
}(join_1.Constraint));
var Equal = (function (_super) {
    __extends(Equal, _super);
    function Equal() {
        _super.apply(this, arguments);
    }
    Equal.prototype.compare = function (a, b) { return a === b; };
    return Equal;
}(BooleanOperation));
var NotEqual = (function (_super) {
    __extends(NotEqual, _super);
    function NotEqual() {
        _super.apply(this, arguments);
    }
    NotEqual.prototype.compare = function (a, b) { return a !== b; };
    return NotEqual;
}(BooleanOperation));
var GreaterThan = (function (_super) {
    __extends(GreaterThan, _super);
    function GreaterThan() {
        _super.apply(this, arguments);
    }
    GreaterThan.prototype.compare = function (a, b) { return a > b; };
    return GreaterThan;
}(BooleanOperation));
var LessThan = (function (_super) {
    __extends(LessThan, _super);
    function LessThan() {
        _super.apply(this, arguments);
    }
    LessThan.prototype.compare = function (a, b) { return a < b; };
    return LessThan;
}(BooleanOperation));
var GreaterThanEqualTo = (function (_super) {
    __extends(GreaterThanEqualTo, _super);
    function GreaterThanEqualTo() {
        _super.apply(this, arguments);
    }
    GreaterThanEqualTo.prototype.compare = function (a, b) { return a >= b; };
    return GreaterThanEqualTo;
}(BooleanOperation));
var LessThanEqualTo = (function (_super) {
    __extends(LessThanEqualTo, _super);
    function LessThanEqualTo() {
        _super.apply(this, arguments);
    }
    LessThanEqualTo.prototype.compare = function (a, b) { return a <= b; };
    return LessThanEqualTo;
}(BooleanOperation));
var AssertValue = (function (_super) {
    __extends(AssertValue, _super);
    function AssertValue() {
        _super.apply(this, arguments);
    }
    AssertValue.prototype.resolveProposal = function (proposal, prefix) {
        var _a = this.resolve(prefix), args = _a.args, returns = _a.returns;
        return [args[0]];
    };
    AssertValue.prototype.test = function (prefix) {
        var _a = this.resolve(prefix), args = _a.args, returns = _a.returns;
        return args[0] === returns[0];
    };
    AssertValue.prototype.getProposal = function (tripleIndex, proposed, prefix) {
        var proposal = this.proposalObject;
        proposal.providing = proposed;
        proposal.cardinality = 1;
        return proposal;
    };
    return AssertValue;
}(join_1.Constraint));
var And = (function (_super) {
    __extends(And, _super);
    function And() {
        _super.apply(this, arguments);
    }
    And.prototype.resolveProposal = function (proposal, prefix) {
        var args = this.resolve(prefix).args;
        var result = true;
        for (var _i = 0, args_1 = args; _i < args_1.length; _i++) {
            var arg = args_1[_i];
            if (arg === false) {
                result = false;
                break;
            }
        }
        return [result];
    };
    And.prototype.test = function (prefix) {
        var _a = this.resolve(prefix), args = _a.args, returns = _a.returns;
        var result = true;
        for (var _i = 0, args_2 = args; _i < args_2.length; _i++) {
            var arg = args_2[_i];
            if (arg === false) {
                result = false;
                break;
            }
        }
        return result === returns[0];
    };
    And.prototype.getProposal = function (tripleIndex, proposed, prefix) {
        var proposal = this.proposalObject;
        proposal.providing = proposed;
        proposal.cardinality = 1;
        return proposal;
    };
    return And;
}(join_1.Constraint));
var Or = (function (_super) {
    __extends(Or, _super);
    function Or() {
        _super.apply(this, arguments);
    }
    // To resolve a proposal, we concatenate our resolved args
    Or.prototype.resolveProposal = function (proposal, prefix) {
        var args = this.resolve(prefix).args;
        var result = false;
        for (var _i = 0, args_3 = args; _i < args_3.length; _i++) {
            var arg = args_3[_i];
            if (arg !== false) {
                result = true;
                break;
            }
        }
        return [result];
    };
    // We accept a prefix if the return is equivalent to concatentating
    // all the args
    Or.prototype.test = function (prefix) {
        var _a = this.resolve(prefix), args = _a.args, returns = _a.returns;
        var result = false;
        for (var _i = 0, args_4 = args; _i < args_4.length; _i++) {
            var arg = args_4[_i];
            if (arg !== false) {
                result = true;
                break;
            }
        }
        return result === returns[0];
    };
    // concat always returns cardinality 1
    Or.prototype.getProposal = function (tripleIndex, proposed, prefix) {
        var proposal = this.proposalObject;
        proposal.providing = proposed;
        proposal.cardinality = 1;
        return proposal;
    };
    return Or;
}(join_1.Constraint));
var Toggle = (function (_super) {
    __extends(Toggle, _super);
    function Toggle() {
        _super.apply(this, arguments);
    }
    Toggle.prototype.resolveProposal = function (proposal, prefix) {
        var args = this.resolve(prefix).args;
        return [!(args[0] === true)];
    };
    Toggle.prototype.test = function (prefix) {
        var _a = this.resolve(prefix), args = _a.args, returns = _a.returns;
        return !(args[0] === true) === returns[0];
    };
    Toggle.prototype.getProposal = function (tripleIndex, proposed, prefix) {
        var proposal = this.proposalObject;
        proposal.providing = proposed;
        proposal.cardinality = 1;
        return proposal;
    };
    Toggle.AttributeMapping = {
        "value": 0,
    };
    return Toggle;
}(join_1.Constraint));
providers.provide(">", GreaterThan);
providers.provide("<", LessThan);
providers.provide("<=", LessThanEqualTo);
providers.provide(">=", GreaterThanEqualTo);
providers.provide("!=", NotEqual);
providers.provide("=", Equal);
providers.provide("and", And);
providers.provide("or", Or);
providers.provide("toggle", Toggle);
//# sourceMappingURL=logical.js.map