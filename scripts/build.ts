import * as fs from "fs";
import * as glob from "glob";
import {packageExamples} from "./package-examples";

function onError(err) {
  throw err;
}

function copy(src, dest, callback) {
  let destStream = fs.createWriteStream(dest)
    .on("error", onError)
    .on("close", callback);

  fs.createReadStream(src)
    .on("error", onError)
    .pipe(destStream);

  return destStream;
}

// old school
// ./node_modules/.bin/tsc && cp src/*.js build/src/ && cp ./node_modules/chevrotain/lib/chevrotain.js build/src/ && npm run examples

export function build(callback:() => void) {
  let inProgress = {};
  let allTasksStarted = false;

  function checkCompletion(finishedStartingTasks = false) {
    if(finishedStartingTasks) allTasksStarted = true;
    if(!allTasksStarted) return;

    for(let phase in inProgress) {
      if(inProgress[phase] !== 0) return;
    }
    callback();
  }

  function track(phase:string) {
    if(!inProgress[phase]) {
      inProgress[phase] = 1;
    } else {
      inProgress[phase] += 1;
    }
    return () => {
      inProgress[phase] -= 1;
      if(inProgress[phase] === 0) console.log("  - " + phase + "... done.");
      checkCompletion();
    };
  }

  // Copy static JS files into build.
  glob("src/*.js", (err, matches) => {
    if(err) throw err;

    for(let match of matches) {
      let relative = match.split("/").slice(1).join("/");
      copy(match, "build/src/" + relative, track("copy static files"));
    }
  })

  // Copy node dependencies required by the browser.
  let deps = [
    "node_modules/chevrotain/lib/chevrotain.js"
  ];
  for(let dep of deps) {
    let base = dep.split("/").pop();
    copy(dep, "build/src/" + base, track("copy node module files"));
  }

  // Package examples.
  packageExamples(track("package examples"));

  checkCompletion(true);
}

if(require.main === module) {
  console.log("Building...")
  build(() => {
    console.log("done.")
    console.log("To run eve, type `npm run`");
  });
}
