"use strict";
var fs = require("fs");
var path = require("path");
function packageExamples(callback) {
    var files = {};
    for (var _i = 0, _a = fs.readdirSync("examples/"); _i < _a.length; _i++) {
        var file = _a[_i];
        if (path.extname(file) === ".eve") {
            files[file] = fs.readFileSync(path.join("examples", file)).toString();
        }
    }
    fs.writeFileSync("build/examples.js", "var examples = " + JSON.stringify(files));
    callback();
}
exports.packageExamples = packageExamples;
if (require.main === module) {
    console.log("Packaging...");
    packageExamples(function () { return console.log("done."); });
}
//# sourceMappingURL=package-examples.js.map