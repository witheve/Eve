import * as path from "path";
import * as fs from "fs";
import * as glob from "glob";
import {packageWorkspaces} from "./package-workspaces";

export function onError(err) {
  throw err;
}

export function copy(src, dest, callback) {
  let destStream = fs.createWriteStream(dest)
    .on("error", onError)
    .on("close", callback);

  fs.createReadStream(src)
    .on("error", onError)
    .pipe(destStream);

  return destStream;
}

export class Tracker {
  inProgress = {};
  protected allTasksStarted = false;

  constructor(public callback:() => void) { }

  finishedStartingTasks() {
    this.allTasksStarted = true;
    this.checkCompletion();
  }

  checkCompletion() {
    if(!this.allTasksStarted) return;

    for(let phase in this.inProgress) {
      if(this.inProgress[phase] !== 0) return;
    }
    this.callback();
  }

  track(phase:string) {
    if(!this.inProgress[phase]) {
      this.inProgress[phase] = 1;
    } else {
      this.inProgress[phase] += 1;
    }
    return () => {
      this.inProgress[phase] -= 1;
      if(this.inProgress[phase] === 0) console.log("  - " + phase + "... done.");
      this.checkCompletion();
    };
  }
}

// old school
// ./node_modules/.bin/tsc && cp src/*.js build/src/ && cp ./node_modules/chevrotain/lib/chevrotain.js build/src/ && npm run examples

export function build(callback:() => void) {
  let tracker = new Tracker(callback);

  // Copy static JS files into build.
  let matches = glob.sync("src/*.js");
  for(let match of matches) {
    let relative = match.split(path.sep).slice(1).join(path.sep);
    copy(match, path.join("build", "src", relative), tracker.track("copy static files"));
  }

  // Copy node dependencies required by the browser.
  let deps = [
    "node_modules/chevrotain/lib/chevrotain.js"
  ];
  for(let dep of deps) {
    if(path.sep !== "/") {
      dep = dep.replace("/", path.sep);
    }
    dep = path.resolve(dep);
    let base = dep.split(path.sep).pop();
    copy(dep, path.join("build", "src", base), tracker.track("copy node module files"));
  }

  // Package workspaces.
  packageWorkspaces(tracker.track("package workspaces"));

  tracker.finishedStartingTasks();
}

if(require.main === module) {
  console.log("Building...")
  build(() => {
    console.log("done.")
    console.log("To run eve, type `npm start`");
  });
}
