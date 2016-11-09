//---------------------------------------------------------------------
// Performance
//---------------------------------------------------------------------
"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var NoopPerformanceTracker = (function () {
    function NoopPerformanceTracker() {
        this.time = function () { return 0; };
    }
    NoopPerformanceTracker.prototype.reset = function () { };
    NoopPerformanceTracker.prototype.lookup = function (start) { };
    NoopPerformanceTracker.prototype.store = function (start) { };
    NoopPerformanceTracker.prototype.block = function (name, start) { };
    NoopPerformanceTracker.prototype.send = function (start) { };
    NoopPerformanceTracker.prototype.blockCheck = function (start) { };
    NoopPerformanceTracker.prototype.fixpoint = function (start) { };
    NoopPerformanceTracker.prototype.asObject = function (blockMap) { };
    NoopPerformanceTracker.prototype.report = function () { };
    return NoopPerformanceTracker;
}());
exports.NoopPerformanceTracker = NoopPerformanceTracker;
var PerformanceTracker = (function (_super) {
    __extends(PerformanceTracker, _super);
    function PerformanceTracker() {
        _super.call(this);
        this.reset();
        this.time = exports.time;
    }
    PerformanceTracker.prototype.reset = function () {
        this.storeTime = 0;
        this.storeCalls = 0;
        this.lookupTime = 0;
        this.lookupCalls = 0;
        this.sendTime = 0;
        this.sendCalls = 0;
        this.fixpointTime = 0;
        this.fixpointCalls = 0;
        this.blockCheckTime = 0;
        this.blockCheckCalls = 0;
        this.blockTime = {};
        this.blockTimeMax = {};
        this.blockTimeMin = {};
        this.blockCalls = {};
    };
    PerformanceTracker.prototype.lookup = function (start) {
        this.lookupTime += exports.time(start);
        this.lookupCalls++;
    };
    PerformanceTracker.prototype.store = function (start) {
        this.storeTime += exports.time(start);
        this.storeCalls++;
    };
    PerformanceTracker.prototype.block = function (name, start) {
        if (this.blockTime[name] === undefined) {
            this.blockTime[name] = 0;
            this.blockCalls[name] = 0;
            this.blockTimeMax[name] = -Infinity;
            this.blockTimeMin[name] = Infinity;
        }
        var total = exports.time(start);
        this.blockTime[name] += total;
        this.blockCalls[name]++;
        if (total > this.blockTimeMax[name]) {
            this.blockTimeMax[name] = total;
        }
        if (total < this.blockTimeMin[name]) {
            this.blockTimeMin[name] = total;
        }
    };
    PerformanceTracker.prototype.send = function (start) {
        this.sendTime += exports.time(start);
        this.sendCalls++;
    };
    PerformanceTracker.prototype.blockCheck = function (start) {
        this.blockCheckTime += exports.time(start);
        this.blockCheckCalls++;
    };
    PerformanceTracker.prototype.fixpoint = function (start) {
        this.fixpointTime += exports.time(start);
        this.fixpointCalls++;
    };
    PerformanceTracker.prototype.asObject = function (blockMap) {
        var _this = this;
        var info = {};
        var blockInfo = {};
        var blocks = Object.keys(this.blockTime);
        blocks.sort(function (a, b) {
            return _this.blockTime[b] - _this.blockTime[a];
        });
        for (var _i = 0, blocks_1 = blocks; _i < blocks_1.length; _i++) {
            var name_1 = blocks_1[_i];
            if (!blockMap[name_1])
                continue;
            var time_1 = this.blockTime[name_1];
            var calls = this.blockCalls[name_1];
            var max = this.blockTimeMax[name_1];
            var min = this.blockTimeMin[name_1];
            var avg = time_1 / calls;
            var color = avg > 5 ? "red" : (avg > 1 ? "orange" : "green");
            var fixedpointPercent = (time_1 * 100 / this.fixpointTime);
            blockInfo[name_1] = {
                time: time_1, calls: calls, min: min, max: max, avg: avg, color: color, percentFixpoint: fixedpointPercent
            };
        }
        var fixpoint = {
            time: this.fixpointTime,
            count: this.fixpointCalls,
            avg: this.fixpointTime / this.fixpointCalls,
        };
        return { fixpoint: fixpoint, blocks: blockInfo };
    };
    PerformanceTracker.prototype.report = function () {
        var _this = this;
        console.log("------------------ Performance --------------------------");
        console.log("%cFixpoint", "font-size:14pt; margin:10px 0;");
        console.log("");
        console.log("    Time: " + this.fixpointTime);
        console.log("    Count: " + this.fixpointCalls);
        console.log("    Average time: " + this.fixpointTime / this.fixpointCalls);
        console.log("");
        console.log("%cBlocks", "font-size:16pt;");
        console.log("");
        var blocks = Object.keys(this.blockTime);
        blocks.sort(function (a, b) {
            return _this.blockTime[b] - _this.blockTime[a];
        });
        for (var _i = 0, blocks_2 = blocks; _i < blocks_2.length; _i++) {
            var name_2 = blocks_2[_i];
            var time_2 = this.blockTime[name_2];
            var calls = this.blockCalls[name_2];
            var max = this.blockTimeMax[name_2];
            var min = this.blockTimeMin[name_2];
            var avg = time_2 / calls;
            var color = avg > 5 ? "red" : (avg > 1 ? "orange" : "green");
            console.log("    %c" + name_2.substring(0, 40), "font-weight:bold;");
            console.log("        Time: " + time_2.toFixed(4));
            console.log("        Calls: " + calls);
            console.log("        Max: " + max.toFixed(4));
            console.log("        Min: " + min.toFixed(4));
            console.log("        Average: %c" + avg.toFixed(4), "color:" + color + ";");
            console.log("        Fixpoint: %c" + (time_2 * 100 / this.fixpointTime).toFixed(1) + "%", "color:" + color + ";");
            console.log("");
        }
        console.log("");
        console.log("Block check");
        console.log("");
        console.log("    Time: " + this.blockCheckTime);
        console.log("    Count: " + this.blockCheckCalls);
        console.log("    Average time: " + this.blockCheckTime / this.blockCheckCalls);
        console.log("");
        console.log("Lookup");
        console.log("");
        console.log("    Time: " + this.lookupTime);
        console.log("    Count: " + this.lookupCalls);
        console.log("    Average time: " + this.lookupTime / this.lookupCalls);
        console.log("");
        console.log("Store");
        console.log("");
        console.log("    Time: " + this.storeTime);
        console.log("    Count: " + this.storeCalls);
        console.log("    Average store: " + this.storeTime / this.storeCalls);
        console.log("");
        console.log("send");
        console.log("");
        console.log("    Time: " + this.sendTime);
        console.log("    Count: " + this.sendCalls);
        console.log("    Average time: " + this.sendTime / this.sendCalls);
    };
    return PerformanceTracker;
}(NoopPerformanceTracker));
exports.PerformanceTracker = PerformanceTracker;
if (global.process) {
    exports.time = function (start) {
        if (!start)
            return process.hrtime();
        var end = process.hrtime(start);
        return ((end[0] * 1000) + (end[1] / 1000000)).toFixed(3);
    };
}
else {
    exports.time = function (start) {
        if (!start)
            return performance.now();
        var end = performance.now();
        return end - start;
    };
}
//# sourceMappingURL=performance.js.map