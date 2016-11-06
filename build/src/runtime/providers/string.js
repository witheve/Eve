//---------------------------------------------------------------------
// String providers
//---------------------------------------------------------------------
"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var join_1 = require("../join");
var providers = require("./index");
// Concat strings together. Args expects a set of variables/string constants
// to concatenate together and an array with a single return variable
var Concat = (function (_super) {
    __extends(Concat, _super);
    function Concat() {
        _super.apply(this, arguments);
    }
    // To resolve a proposal, we concatenate our resolved args
    Concat.prototype.resolveProposal = function (proposal, prefix) {
        var args = this.resolve(prefix).args;
        return [args.join("")];
    };
    // We accept a prefix if the return is equivalent to concatentating
    // all the args
    Concat.prototype.test = function (prefix) {
        var _a = this.resolve(prefix), args = _a.args, returns = _a.returns;
        return args.join("") === returns[0];
    };
    // concat always returns cardinality 1
    Concat.prototype.getProposal = function (tripleIndex, proposed, prefix) {
        var proposal = this.proposalObject;
        proposal.providing = proposed;
        proposal.cardinality = 1;
        return proposal;
    };
    return Concat;
}(join_1.Constraint));
var Split = (function (_super) {
    __extends(Split, _super);
    function Split(id, args, returns) {
        _super.call(this, id, args, returns);
        if (this.returns[1] !== undefined && this.returns[0] !== undefined) {
            this.returnType = "both";
        }
        else if (this.returns[1] !== undefined) {
            this.returnType = "index";
        }
        else {
            this.returnType = "token";
        }
    }
    Split.prototype.resolveProposal = function (proposal, prefix) {
        var returns = this.resolve(prefix).returns;
        var tokens = proposal.index;
        var results = tokens;
        if (this.returnType === "both") {
            results = [];
            var ix = 1;
            for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
                var token = tokens_1[_i];
                results.push([token, ix]);
                ix++;
            }
        }
        else if (this.returnType === "index") {
            results = [];
            var ix = 1;
            for (var _a = 0, tokens_2 = tokens; _a < tokens_2.length; _a++) {
                var token = tokens_2[_a];
                results.push(ix);
                ix++;
            }
        }
        return results;
    };
    Split.prototype.test = function (prefix) {
        var _a = this.resolve(prefix), args = _a.args, returns = _a.returns;
        // @TODO: this is expensive, we should probably try to cache the split somehow
        return args[0].split(args[1])[returns[1]] === returns[0];
    };
    Split.prototype.getProposal = function (tripleIndex, proposed, prefix) {
        var args = this.resolve(prefix).args;
        var proposal = this.proposalObject;
        if (this.returnType === "both") {
            proposal.providing = [this.returns[0], this.returns[1]];
        }
        else if (this.returnType == "index") {
            proposal.providing = this.returns[1];
        }
        else {
            proposal.providing = this.returns[0];
        }
        proposal.index = args[0].split(args[1]);
        proposal.cardinality = proposal.index.length;
        return proposal;
    };
    Split.AttributeMapping = {
        "text": 0,
        "by": 1,
    };
    Split.ReturnMapping = {
        "token": 0,
        "index": 1,
    };
    return Split;
}(join_1.Constraint));
// substring over the field 'text', with the base index being 1, inclusive, 'from' defaulting
// to the beginning of the string, and 'to' the end
var Substring = (function (_super) {
    __extends(Substring, _super);
    function Substring() {
        _super.apply(this, arguments);
    }
    // To resolve a proposal, we concatenate our resolved args
    Substring.prototype.resolveProposal = function (proposal, prefix) {
        var _a = this.resolve(prefix), args = _a.args, returns = _a.returns;
        var from = 0;
        var text = args[0];
        var to = text.length;
        if (args[1] != undefined)
            from = args[1] - 1;
        if (args[2] != undefined)
            to = args[2];
        return [text.substring(from, to)];
    };
    Substring.prototype.test = function (prefix) {
        var _a = this.resolve(prefix), args = _a.args, returns = _a.returns;
        var from = 0;
        var text = args[0];
        if (typeof text !== "string")
            return false;
        var to = text.length;
        if (args[1] != undefined)
            from = args[1] - 1;
        if (args[2] != undefined)
            to = args[2];
        console.log("test string", text.substring(from, to), from, to, returns[0]);
        return text.substring(from, to) === returns[0];
    };
    // substring always returns cardinality 1
    Substring.prototype.getProposal = function (tripleIndex, proposed, prefix) {
        var proposal = this.proposalObject;
        var args = this.resolve(prefix).args;
        if (typeof args[0] !== "string") {
            proposal.cardinality = 0;
        }
        else {
            proposal.providing = proposed;
            proposal.cardinality = 1;
        }
        return proposal;
    };
    Substring.AttributeMapping = {
        "text": 0,
        "from": 1,
        "to": 2,
    };
    Substring.ReturnMapping = {
        "value": 0,
    };
    return Substring;
}(join_1.Constraint));
var Convert = (function (_super) {
    __extends(Convert, _super);
    function Convert() {
        _super.apply(this, arguments);
    }
    Convert.prototype.resolveProposal = function (proposal, prefix) {
        var _a = this.resolve(prefix), args = _a.args, returns = _a.returns;
        var from = 0;
        var value = args[0];
        var to = args[1];
        var converted;
        if (to === "number") {
            converted = +value;
            if (isNaN(converted))
                throw new Error("Unable to deal with NaN in the proposal stage.");
        }
        else if (to === "string") {
            converted = "" + value;
        }
        return [converted];
    };
    Convert.prototype.test = function (prefix) {
        var _a = this.resolve(prefix), args = _a.args, returns = _a.returns;
        var value = args[0];
        var to = args[1];
        var converted;
        if (to === "number") {
            converted = +value;
            if (isNaN(converted))
                return false;
            if (converted === "")
                return false;
            return;
        }
        else if (to === "string") {
            converted = "" + value;
        }
        else {
            return false;
        }
        return converted === returns[0];
    };
    // 1 if valid, 0 otherwise
    Convert.prototype.getProposal = function (tripleIndex, proposed, prefix) {
        var proposal = this.proposalObject;
        var args = this.resolve(prefix).args;
        var value = args[0];
        var to = args[1];
        proposal.cardinality = 1;
        proposal.providing = proposed;
        if (to === "number") {
            if (isNaN(+value) || value === "")
                proposal.cardinality = 0;
        }
        else if (to === "string") {
        }
        else {
            proposal.cardinality = 0;
        }
        return proposal;
    };
    Convert.AttributeMapping = {
        "value": 0,
        "to": 1,
    };
    Convert.ReturnMapping = {
        "converted": 0,
    };
    return Convert;
}(join_1.Constraint));
providers.provide("concat", Concat);
providers.provide("split", Split);
providers.provide("substring", Substring);
providers.provide("convert", Convert);
//# sourceMappingURL=string.js.map