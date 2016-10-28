import * as fs from "fs";
import * as glob from "glob";
import * as mkdirp from "mkdirp";
import {build, Tracker, copy, onError} from "./build";

function buildDist(callback:() => void) {
  let tracker = new Tracker(callback);
  build(() => {
    mkdirp.sync("dist/build");
    mkdirp.sync("dist/css");

    copy("./index.html", "./dist/index.html", tracker.track("copy index"));
    copy("./build/examples.js", "./dist/build/examples.js", tracker.track("copy packaged examples"));


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
