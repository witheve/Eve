import * as fs from "fs";
import * as path from "path";
import {Watcher, findWatchers} from "../src/watchers/watcher";

export function packageWorkspaces(callback:() => void) {
  let watchers = findWatchers();
  let content = "let _watchers = [\n";
  for(let filepath of watchers) {
    content += "  \"/build/" + path.relative(__dirname + "/..", filepath) + "\", \n";
    content = content.replace(/\\/g, "/");
  }
  content += "];\n";
  fs.writeFileSync("build/watchers.js", content);
  callback();
}

if(require.main === module) {
  console.log("Packaging watchers...")
  packageWorkspaces(() => console.log("done."));
}
