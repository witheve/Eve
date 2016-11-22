import * as fs from "fs";
import * as path from "path";
import * as eveSource from "../src/runtime/eveSource";

eveSource.add("examples", "./examples");

export function packageWorkspaces(callback:() => void) {
  fs.writeFileSync("build/workspaces.js", eveSource.pack());
  callback();
}

if(require.main === module) {
  console.log("Packaging...")
  packageWorkspaces(() => console.log("done."));
}
