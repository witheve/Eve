import "setimmediate";
import {Program} from "./runtime/dsl2";
import * as testUtil from "../test/util";

let assert = {};
function verify(assert:any, prog:Program, ins:any[], outs:any[]) {
  prog.test(prog.nextTransactionId, ins);
}

function verifyIO(assert:any, progName:string, inputString:string, expecteds:testUtil.EAVRCTuple[][]) {
  let inputs = testUtil.createInputs(inputString);
  for(let input of inputs) {
    prog.test(prog.nextTransactionId, input);
    console.groupCollapsed("Expected");
    console.info(testUtil.pprint(expecteds));
    console.groupEnd();
  }
}

let prog = new Program("test");
prog.attach("editor");


// function doIt() {
//   let prog = new Program("test program");
//   prog.attach("tag browser");
//   console.log(prog);
//   prog.test(0, [
//     [1, "tag", "person"],
//     [1, "name", "jeff"],

//     [2, "tag", "person"],
//     [2, "name", "sandra"],
//     [2, "pet", 3],

//     [3, "tag", "pet"],
//     [3, "tag", "dog"],
//     [3, "name", "bert"],

//     [4, "tag", "person"],
//     [4, "name", "rachel"],
//     [4, "pet", 5],
//     [4, "pet", 6],

//     [5, "tag", "pet"],
//     [5, "tag", "cat"],
//     [5, "name", "Felicia"],

//     [6, "tag", "pet"],
//     [6, "tag", "cat"],
//     [6, "name", "Mr. Whiskers"]
//   ]);
// }
// (global as any).doIt = doIt;


// doIt();
// import "./programs/flappy";
// import "./programs/hover";
