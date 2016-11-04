import * as fs from "fs";
import * as path from "path";

export function packageExamples(callback:() => void) {
  let files = {};
  for(let file of fs.readdirSync("examples/")) {
    if(path.extname(file) === ".eve") {
      files["/examples/" + file] = fs.readFileSync(path.join("examples", file)).toString();
    }
  }

  fs.writeFileSync("build/examples.js", `var examples = ${JSON.stringify(files)}`)

  callback();
}

if(require.main === module) {
  console.log("Packaging...")
  packageExamples(() => console.log("done."));
}
