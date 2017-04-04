import "setimmediate";
import {Program} from "./runtime/dsl2";
import * as testUtil from "../test/util";

// let assert = {};
// function verify(assert:any, prog:Program, ins:any[], outs:any[]) {
//   prog.test(prog.nextTransactionId, ins);
// }

// function verifyIO(assert:any, progName:string, inputString:string, expecteds:testUtil.EAVRCTuple[][]) {
//   let inputs = testUtil.createInputs(inputString);
//   for(let input of inputs) {
//     prog.test(prog.nextTransactionId, input);
//     console.groupCollapsed("Expected");
//     console.info(testUtil.pprint(expecteds));
//     console.groupEnd();
//   }
// }

// let prog = new Program("test");

// import "./programs/flappy";
// import "./programs/compiler";
// import "./programs/hover";
// import "./programs/canvas-demo";
// import "./programs/shape-demo";
// import "./programs/ui-demo";
import "./programs/editor-demo";
