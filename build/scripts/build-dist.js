"use strict";
var fs = require("fs");
var glob = require("glob");
var mkdirp = require("mkdirp");
var build_1 = require("./build");
// Privacy minded? Feel free to flip this off. We just use it to determine anonymous usage patterns to find hangups and unanticipated workflows.
var ENABLE_ANALYTICS = true;
var ANALYTICS_TOKEN = "<!-- PRODUCTION ANALYTICS -->";
var ANALYTICS = "\n    <script>\n      (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){\n      (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),\n      m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)\n      })(window,document,'script','https://www.google-analytics.com/analytics.js','ga');\n\n      ga('create', 'UA-74222157-4', 'auto');\n      ga('send', 'pageview');\n    </script>\n";
function buildDist(callback) {
    var tracker = new build_1.Tracker(callback);
    build_1.build(function () {
        mkdirp.sync("dist/build");
        mkdirp.sync("dist/css");
        var index = fs.readFileSync("./index.html", "utf-8");
        if (ENABLE_ANALYTICS) {
            index = index.replace(ANALYTICS_TOKEN, ANALYTICS);
        }
        fs.writeFileSync("./dist/index.html", index);
        //copy("./index.html", "./dist/index.html", tracker.track("copy index"));
        build_1.copy("./build/examples.js", "./dist/build/examples.js", tracker.track("copy packaged examples"));
        for (var _i = 0, _a = ["build/src/**/*.js", "build/src/**/*.js.map", "src/**/*.css", "css/**/*.css", "examples/**/*.css"]; _i < _a.length; _i++) {
            var pattern = _a[_i];
            var matches = glob.sync(pattern);
            for (var _b = 0, matches_1 = matches; _b < matches_1.length; _b++) {
                var match = matches_1[_b];
                var pathname = match.split("/").slice(0, -1).join("/");
                // @NOTE: Arghhh
                mkdirp.sync("dist/" + pathname);
                build_1.copy(match, "dist/" + match, tracker.track("copy build artifacts"));
            }
        }
        tracker.finishedStartingTasks();
    });
}
if (require.main === module) {
    console.log("Building distribution folder...");
    buildDist(function () {
        console.log("done!");
    });
}
//# sourceMappingURL=build-dist.js.map