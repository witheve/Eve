import * as fs from "fs";
import * as path from "path";
import {Watcher, bundleWatchers} from "../src/watchers/watcher";

export function packageWorkspaces(callback:() => void) {
  let bundle = bundleWatchers();
  let content = "let _watchers = [\n";
  for(let filepath in bundle) {
    content += "  \"" + path.relative(__dirname + "/..", filepath) + "\", \n";
  }
  content += "];\n";
  fs.writeFileSync("build/watchers.js", content);
  callback();
}

if(require.main === module) {
  console.log("Packaging watchers...")
  packageWorkspaces(() => console.log("done."));
}
