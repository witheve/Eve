"use strict";
var fs = require("fs");
var glob = require("glob");
var package_examples_1 = require("./package-examples");
function onError(err) {
    throw err;
}
exports.onError = onError;
function copy(src, dest, callback) {
    var destStream = fs.createWriteStream(dest)
        .on("error", onError)
        .on("close", callback);
    fs.createReadStream(src)
        .on("error", onError)
        .pipe(destStream);
    return destStream;
}
exports.copy = copy;
var Tracker = (function () {
    function Tracker(callback) {
        this.callback = callback;
        this.inProgress = {};
        this.allTasksStarted = false;
    }
    Tracker.prototype.finishedStartingTasks = function () {
        this.allTasksStarted = true;
        this.checkCompletion();
    };
    Tracker.prototype.checkCompletion = function () {
        if (!this.allTasksStarted)
            return;
        for (var phase in this.inProgress) {
            if (this.inProgress[phase] !== 0)
                return;
        }
        this.callback();
    };
    Tracker.prototype.track = function (phase) {
        var _this = this;
        if (!this.inProgress[phase]) {
            this.inProgress[phase] = 1;
        }
        else {
            this.inProgress[phase] += 1;
        }
        return function () {
            _this.inProgress[phase] -= 1;
            if (_this.inProgress[phase] === 0)
                console.log("  - " + phase + "... done.");
            _this.checkCompletion();
        };
    };
    return Tracker;
}());
exports.Tracker = Tracker;
// old school
// ./node_modules/.bin/tsc && cp src/*.js build/src/ && cp ./node_modules/chevrotain/lib/chevrotain.js build/src/ && npm run examples
function build(callback) {
    var tracker = new Tracker(callback);
    // Copy static JS files into build.
    var matches = glob.sync("src/*.js");
    for (var _i = 0, matches_1 = matches; _i < matches_1.length; _i++) {
        var match = matches_1[_i];
        var relative = match.split("/").slice(1).join("/");
        copy(match, "build/src/" + relative, tracker.track("copy static files"));
    }
    // Copy node dependencies required by the browser.
    var deps = [
        "node_modules/chevrotain/lib/chevrotain.js"
    ];
    for (var _a = 0, deps_1 = deps; _a < deps_1.length; _a++) {
        var dep = deps_1[_a];
        var base = dep.split("/").pop();
        copy(dep, "build/src/" + base, tracker.track("copy node module files"));
    }
    // Package examples.
    package_examples_1.packageExamples(tracker.track("package examples"));
    tracker.finishedStartingTasks();
}
exports.build = build;
if (require.main === module) {
    console.log("Building...");
    build(function () {
        console.log("done.");
        console.log("To run eve, type `npm start`");
    });
}
//# sourceMappingURL=build.js.map