//---------------------------------------------------------------------
// Persisted Database
//---------------------------------------------------------------------
"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var runtime_1 = require("../runtime");
var PersistedDatabase = (function (_super) {
    __extends(PersistedDatabase, _super);
    function PersistedDatabase() {
        _super.apply(this, arguments);
    }
    PersistedDatabase.prototype.onFixpoint = function (evaluation, changes) {
        _super.prototype.onFixpoint.call(this, evaluation, changes);
    };
    return PersistedDatabase;
}(runtime_1.Database));
exports.PersistedDatabase = PersistedDatabase;
//# sourceMappingURL=persisted.js.map