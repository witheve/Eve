import * as fs from "fs";
import * as glob from "glob";
import * as mkdirp from "mkdirp";
import {build, Tracker, copy, onError} from "./build";

// Privacy minded? Feel free to flip this off. We just use it to determine anonymous usage patterns to find hangups and unanticipated workflows.
const ENABLE_ANALYTICS = true;
const ANALYTICS_TOKEN = "<!-- PRODUCTION ANALYTICS -->";
const ANALYTICS = `
    <script>
      (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
      (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
      m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
      })(window,document,'script','https://www.google-analytics.com/analytics.js','ga');

      ga('create', 'UA-74222157-4', 'auto');
      ga('send', 'pageview');
    </script>
`;

function buildDist(callback:() => void) {
  let tracker = new Tracker(callback);
  build(() => {
    mkdirp.sync("dist/build");
    mkdirp.sync("dist/css");

    var index = fs.readFileSync("./index.html", "utf-8");
    if(ENABLE_ANALYTICS) {
      index = index.replace(ANALYTICS_TOKEN, ANALYTICS);
    }
    fs.writeFileSync("./dist/index.html", index);

    //copy("./index.html", "./dist/index.html", tracker.track("copy index"));
    copy("./build/workspaces.js", "./dist/build/workspaces.js", tracker.track("copy packaged workspaces"));


    for(let pattern of ["build/src/**/*.js", "build/src/**/*.js.map", "src/**/*.css", "css/**/*.css", "examples/**/*.css"]) {
      let matches = glob.sync(pattern);
      for(let match of matches) {
        let pathname = match.split("/").slice(0, -1).join("/");

        // @NOTE: Arghhh
        mkdirp.sync("dist/" + pathname);
        copy(match, "dist/" + match, tracker.track("copy build artifacts"));
      }
    }
    tracker.finishedStartingTasks();
  });
}

if(require.main === module) {
  console.log("Building distribution folder...")
  buildDist(() => {
    console.log("done!")
  });
}
