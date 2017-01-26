import {Program} from "../src/runtime/dsl";
import * as Runtime from "../src/runtime/runtime";
import * as test from "tape";

// You can specify changes as either [e,a,v] or [e,a,v,round,count];
export type EAVArray = [Runtime.RawValue, Runtime.RawValue, Runtime.RawValue];
export type EAVRCArray = [Runtime.RawValue, Runtime.RawValue, Runtime.RawValue, number, number];
export type TestChange =  | [Runtime.RawValue, Runtime.RawValue, Runtime.RawValue, number, number];

function createChanges(transaction:number,eavns:TestChange[]) {
  let changes:Runtime.Change[] = [];
  for(let [e, a, v, round = 0, count = 1] of eavns) {
    changes.push(Runtime.Change.fromValues(e, a, v, "my-awesome-node", transaction, round, count));
  }
  return changes;
}

export function verify(assert:any, program:Program, input:any[], output:any[], transaction = 1) {
  let ins = createChanges(transaction, input);
  let outs = createChanges(transaction, output);

  let all = ins.concat(outs);
  let {changes} = program.input(ins);
  let msg = "Fewer changes than expected";
  if(changes.length > all.length) {
    msg = "More changes than expected";
  }
  assert.equal(changes.length, all.length, msg);
  let eMap:any = {};
  if(changes.length === all.length) {
    for(let actual of changes) {
      let found = false;
      let expectedIx = 0;
      for(let expected of all) {
        // let seen = eMap[expected.e];
        // if(seen) {
        //   for(let maybeE of seen) {
        //     let change = new Runtime.Change(maybeE, expected.a, expected.v, expected.n, expected.transaction, expected.round, expected.count);
        //     if(actual.equal(expected, true)) {
        //       eMap[expected.e] = actual.e
        //       found = true;
        //       all.splice(expectedIx,1);
        //       break;
        //     }
        //   }
        //   expected.e = seen;
        // }
        // expectedIx++;
      }
      if(!found) assert.fail("No match found for: " + actual.toString());
    }
  }
}

