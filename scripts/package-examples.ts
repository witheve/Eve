import * as fs from "fs";
import * as path from "path";

let files = {};
for(let file of fs.readdirSync("examples/")) {
  if(path.extname(file) === ".eve") {
    files[file] = fs.readFileSync(path.join("examples", file)).toString();
  }
}

fs.writeFileSync("build/examples.js", `var examples = ${JSON.stringify(files)}`)
