//---------------------------------------------------------------------
// System database
//---------------------------------------------------------------------
"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var actions_1 = require("../actions");
var runtime_1 = require("../runtime");
//---------------------------------------------------------------------
// Agents
//---------------------------------------------------------------------
var TimeAgent = (function () {
    function TimeAgent() {
        this.frames = 0;
    }
    TimeAgent.prototype.configure = function (record) {
        var max = this.interval || -1;
        var interval = TimeAgent.updateIntervals["year"];
        for (var _i = 0, _a = record.attributes; _i < _a.length; _i++) {
            var attribute = _a[_i];
            var attr = attribute.attribute;
            var index = TimeAgent.attributeOrdering.indexOf(attr);
            if (index > max) {
                max = index;
                interval = TimeAgent.updateIntervals[attr];
            }
        }
        this.interval = interval;
    };
    TimeAgent.prototype.timeActions = function () {
        var time = new Date();
        this.frames++;
        var ampm = time.getHours() >= 12 ? "PM" : "AM";
        var formattedMinutes = time.getMinutes() >= 10 ? time.getMinutes() : "0" + time.getMinutes();
        var formattedHours = time.getHours() % 12 === 0 ? 12 : time.getHours() % 12;
        var timeString = formattedHours + ":" + formattedMinutes + " " + ampm;
        return [
            new actions_1.InsertAction("time|tag", "time", "tag", "time"),
            new actions_1.SetAction("time|year", "time", "year", time.getFullYear()),
            new actions_1.SetAction("time|month", "time", "month", time.getMonth()),
            new actions_1.SetAction("time|day", "time", "day", time.getDate()),
            new actions_1.SetAction("time|hours", "time", "hours", time.getHours() % 12),
            new actions_1.SetAction("time|hours-24", "time", "hours-24", time.getHours()),
            new actions_1.SetAction("time|minutes", "time", "minutes", time.getMinutes()),
            new actions_1.SetAction("time|time-string", "time", "time-string", timeString),
            new actions_1.SetAction("time|seconds", "time", "seconds", time.getSeconds()),
            new actions_1.SetAction("time|timestamp", "time", "timestamp", time.getTime()),
            new actions_1.SetAction("time|frames", "time", "frames", this.frames),
            new actions_1.SetAction("time|time", "time", "ampm", ampm),
        ];
    };
    TimeAgent.prototype.run = function (evaluation) {
        var self = this;
        this.timeout = setInterval(function () {
            evaluation.executeActions(self.timeActions());
            // self.run(evaluation);
        }, this.interval);
    };
    TimeAgent.prototype.setup = function (evaluation) {
        var _this = this;
        if (this.interval !== undefined) {
            setTimeout(function () {
                evaluation.executeActions(_this.timeActions());
            }, 0);
            this.run(evaluation);
        }
    };
    TimeAgent.prototype.close = function () {
        clearTimeout(this.timeout);
    };
    TimeAgent.attributeOrdering = ["year", "month", "day", "hours", "hours-24", "ampm", "minutes", "time-string", "seconds", "frames"];
    TimeAgent.updateIntervals = {
        "year": 1000 * 60 * 60,
        "month": 1000 * 60 * 60,
        "day": 1000 * 60 * 60,
        "hours": 1000 * 60 * 60,
        "hours-24": 1000 * 60 * 60,
        "ampm": 1000 * 60 * 60,
        "minutes": 1000 * 60,
        "time-string": 1000 * 60,
        "seconds": 1000,
        "timestamp": 1000,
        "frames": 16,
    };
    return TimeAgent;
}());
var MemoryAgent = (function () {
    function MemoryAgent() {
    }
    MemoryAgent.prototype.configure = function (record) {
        // this.os = require("os");
        this.interval = 1000;
    };
    MemoryAgent.prototype.memoryActions = function () {
        var rss = process.memoryUsage().rss;
        return [
            new actions_1.InsertAction("memory|tag", "memory", "tag", "memory"),
            new actions_1.SetAction("memory|rss", "memory", "rss", rss),
        ];
    };
    MemoryAgent.prototype.setup = function (evaluation) {
        var self = this;
        if (this.interval !== undefined) {
            evaluation.executeActions(this.memoryActions());
            this.timeout = setInterval(function () {
                evaluation.executeActions(self.memoryActions());
            }, this.interval);
        }
    };
    MemoryAgent.prototype.close = function () {
        clearTimeout(this.timeout);
    };
    return MemoryAgent;
}());
var BrowserMemoryAgent = (function () {
    function BrowserMemoryAgent() {
    }
    BrowserMemoryAgent.prototype.configure = function (record) { };
    BrowserMemoryAgent.prototype.setup = function (evaluation) { };
    BrowserMemoryAgent.prototype.close = function () { };
    return BrowserMemoryAgent;
}());
var SystemDatabase = (function (_super) {
    __extends(SystemDatabase, _super);
    function SystemDatabase() {
        _super.apply(this, arguments);
    }
    SystemDatabase.prototype.analyze = function (evaluation, db) {
        var time;
        var memory;
        for (var _i = 0, _a = db.blocks; _i < _a.length; _i++) {
            var block = _a[_i];
            for (var _b = 0, _c = block.parse.scanLike; _b < _c.length; _b++) {
                var scan = _c[_b];
                if (scan.type === "record") {
                    for (var _d = 0, _e = scan.attributes; _d < _e.length; _d++) {
                        var attribute = _e[_d];
                        if (attribute.attribute === "tag" && attribute.value.value === "time") {
                            if (this.time)
                                this.time.close();
                            time = this.time = new TimeAgent();
                            time.configure(scan);
                        }
                        else if (attribute.attribute === "tag" && attribute.value.value === "memory") {
                            if (this.memory)
                                this.memory.close();
                            if (global["browser"]) {
                                memory = this.memory = new BrowserMemoryAgent();
                            }
                            else {
                                memory = this.memory = new MemoryAgent();
                            }
                            memory.configure(scan);
                        }
                    }
                }
            }
        }
        if (time) {
            time.setup(evaluation);
        }
        if (memory) {
            memory.setup(evaluation);
        }
    };
    SystemDatabase.prototype.unregister = function () {
        if (this.time)
            this.time.close();
        if (this.memory)
            this.memory.close();
    };
    return SystemDatabase;
}(runtime_1.Database));
exports.SystemDatabase = SystemDatabase;
exports.instance = new SystemDatabase();
//# sourceMappingURL=system.js.map