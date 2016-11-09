//---------------------------------------------------------------------
// Actions
//---------------------------------------------------------------------
"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var join_1 = require("./join");
//---------------------------------------------------------------------
// Actions
//---------------------------------------------------------------------
var Action = (function () {
    function Action(id, e, a, v, node, scopes) {
        this.id = id;
        this.resolved = [];
        var eav = [e, a, v];
        this.e = e;
        this.a = a;
        this.v = v;
        this.node = node || this.id;
        this.vars = [];
        this.scopes = scopes || ["session"];
        for (var _i = 0, eav_1 = eav; _i < eav_1.length; _i++) {
            var register = eav_1[_i];
            if (join_1.isVariable(register)) {
                this.vars[register.id] = register;
            }
        }
    }
    // Return an array of the current values for all the registers
    Action.prototype.resolve = function (prefix) {
        var resolved = this.resolved;
        resolved[0] = join_1.toValue(this.e, prefix);
        resolved[1] = join_1.toValue(this.a, prefix);
        resolved[2] = join_1.toValue(this.v, prefix);
        return resolved;
    };
    return Action;
}());
exports.Action = Action;
var InsertAction = (function (_super) {
    __extends(InsertAction, _super);
    function InsertAction() {
        _super.apply(this, arguments);
    }
    InsertAction.prototype.execute = function (multiIndex, row, changes) {
        var _a = this.resolve(row), e = _a[0], a = _a[1], v = _a[2];
        for (var _i = 0, _b = this.scopes; _i < _b.length; _i++) {
            var scope = _b[_i];
            changes.store(scope, e, a, v, this.node);
        }
    };
    return InsertAction;
}(Action));
exports.InsertAction = InsertAction;
var RemoveAction = (function (_super) {
    __extends(RemoveAction, _super);
    function RemoveAction() {
        _super.apply(this, arguments);
    }
    RemoveAction.prototype.execute = function (multiIndex, row, changes) {
        var _a = this.resolve(row), e = _a[0], a = _a[1], v = _a[2];
        for (var _i = 0, _b = this.scopes; _i < _b.length; _i++) {
            var scope = _b[_i];
            changes.unstore(scope, e, a, v);
        }
    };
    return RemoveAction;
}(Action));
exports.RemoveAction = RemoveAction;
var RemoveSupportAction = (function (_super) {
    __extends(RemoveSupportAction, _super);
    function RemoveSupportAction() {
        _super.apply(this, arguments);
    }
    RemoveSupportAction.prototype.execute = function (multiIndex, row, changes) {
        var _a = this.resolve(row), e = _a[0], a = _a[1], v = _a[2];
        // console.log("removing support for", e,a,v, this.node);
        for (var _i = 0, _b = this.scopes; _i < _b.length; _i++) {
            var scope = _b[_i];
            changes.unstore(scope, e, a, v, this.node);
        }
    };
    return RemoveSupportAction;
}(Action));
exports.RemoveSupportAction = RemoveSupportAction;
var EraseAction = (function (_super) {
    __extends(EraseAction, _super);
    function EraseAction() {
        _super.apply(this, arguments);
    }
    EraseAction.prototype.removeVs = function (index, changes, scope, e, a) {
        var keys = Object.keys(index);
        for (var _i = 0, keys_1 = keys; _i < keys_1.length; _i++) {
            var key = keys_1[_i];
            var value = index[key].value;
            changes.unstore(scope, e, a, value);
        }
    };
    EraseAction.prototype.execute = function (multiIndex, row, changes) {
        var _a = this.resolve(row), e = _a[0], a = _a[1];
        // multidb
        for (var _i = 0, _b = this.scopes; _i < _b.length; _i++) {
            var scope = _b[_i];
            var avIndex = multiIndex.getIndex(scope).lookup(e, undefined, undefined);
            if (avIndex !== undefined) {
                if (a !== undefined) {
                    var level = avIndex.index[a];
                    if (level) {
                        this.removeVs(level.index, changes, scope, e, level.value);
                    }
                }
                else {
                    var keys = Object.keys(avIndex.index);
                    for (var _c = 0, keys_2 = keys; _c < keys_2.length; _c++) {
                        var key = keys_2[_c];
                        var level = avIndex.index[key];
                        this.removeVs(level.index, changes, scope, e, level.value);
                    }
                }
            }
        }
    };
    return EraseAction;
}(Action));
exports.EraseAction = EraseAction;
var SetAction = (function (_super) {
    __extends(SetAction, _super);
    function SetAction() {
        _super.apply(this, arguments);
    }
    SetAction.prototype.execute = function (multiIndex, row, changes) {
        var _a = this.resolve(row), e = _a[0], a = _a[1], v = _a[2];
        // multidb
        for (var _i = 0, _b = this.scopes; _i < _b.length; _i++) {
            var scope = _b[_i];
            var curIndex = multiIndex.getIndex(scope);
            var vIndex = curIndex.lookup(e, a, undefined);
            if (vIndex !== undefined) {
                var keys = Object.keys(vIndex.index);
                for (var _c = 0, keys_3 = keys; _c < keys_3.length; _c++) {
                    var key = keys_3[_c];
                    var value = vIndex.index[key].value;
                    if (value !== v) {
                        changes.unstore(scope, e, a, value);
                    }
                }
            }
            changes.store(scope, e, a, v, this.node);
        }
    };
    return SetAction;
}(Action));
exports.SetAction = SetAction;
exports.ActionImplementations = {
    ":=": SetAction,
    "+=": InsertAction,
    "-=": RemoveAction,
    "erase": EraseAction,
};
function executeActions(multiIndex, actions, rows, changes, capture) {
    if (capture === void 0) { capture = false; }
    if (capture) {
        changes.capture();
    }
    for (var _i = 0, rows_1 = rows; _i < rows_1.length; _i++) {
        var row = rows_1[_i];
        for (var _a = 0, actions_1 = actions; _a < actions_1.length; _a++) {
            var action = actions_1[_a];
            action.execute(multiIndex, row, changes);
        }
    }
    if (capture) {
        return changes.captureEnd();
    }
}
exports.executeActions = executeActions;
//# sourceMappingURL=actions.js.map