import {Program} from "../src/runtime/dsl";
import * as Runtime from "../src/runtime/runtime";
import * as test from "tape";

// You can specify changes as either [e,a,v] or [e,a,v,round,count];
export type EAVArray = [Runtime.RawValue, Runtime.RawValue, Runtime.RawValue];
export type EAVRCArray = [Runtime.RawValue, Runtime.RawValue, Runtime.RawValue, number, number];
export type TestChange =  EAVArray | EAVRCArray;

export function createChanges(transaction:number,eavns:TestChange[]) {
  let changes:Runtime.Change[] = [];
  for(let [e, a, v, round = 0, count = 1] of eavns as EAVRCArray[]) {
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

  // Because the changes handed to us in expected aren't going to have the same
  // e's as what the program itself is going to generate, we're going to have to do
  // some fancy matching to map from generated e's to expected e's. We'll need to
  // store that mapping somewhere, so we have eMap:
  let eMap:any = {};
  if(changes.length === all.length) {
    // As we check all of the changes we got from running the input on the program,
    // we need to update our eMap based on the expected changes that *could* match.
    // Most of the time, the hope is that there's only one potential match, but when
    // you're looking at something like tag, it's easy for there to be many records
    // that get generated with the same tag, so we're going to do a decent amount of
    // work here.
    for(let actual of changes) {
      let found = false;
      let expectedIx = 0;
      // check if we've found any potential matches for this e yet
      let matches = eMap[actual.e];
      // if we haven't found any matches yet, we need to collect some initial ones.
      if(!matches) {
        let potentials = [];
        for(let expected of all) {
          // if this expected *could* match ignoring e and n, then we'll store this as
          // a potential mapping from the actual.e to the expected.e. We're also going
          // to store this expected's index so that once we know for sure that this
          // actual.e === expected.e we can clean out the expecteds that no one can claim
          // anymore.
          if(actual.equal(expected, true /*ignore the node*/, true /*ignore the e*/)) {
            found = true;
            potentials.push({e: expected.e, relatedChanges: [expectedIx]});
          }
          expectedIx++;
        }
        // if there was only one match, no one can ever have this expected - we've claimed it.
        // As such, we need to remove it from the list;
        if(potentials.length === 1) {
          all.splice(potentials[0].relatedChanges[0], 1);
        }
        eMap[actual.e] = potentials;
      } else if(matches.length === 1) {
        // in the case where we've mapped our actual.e to our expected.e, we just check this
        // current fact for a match where the expected.e is what we're looking for
        for(let expected of all) {
          if(expected.e === matches[0].e && actual.equal(expected, true, true)) {
            found = true;
            all.splice(expectedIx, 1);
          }
          expectedIx++;
        }
      } else {
        // since we have multiple potential matches, we need to see if this actual might reduce
        // the set down for us. For each expected that's left, we'll check if expected.e matches
        // one of our potentials, and if this expected would equal our actual if we ignored the
        // e. If so, we keep this potential in the running. Any potentials the don't end up with
        // a match get removed on account of us recreating the potential array from scratch here.
        let potentials = [];
        for(let expected of all) {
          for(let match of matches) {
            if(match.e === expected.e && actual.equal(expected, true, true)) {
              found = true;
              potentials.push(match);
              match.relatedChanges.push(expectedIx);
            }
          }
          expectedIx++;
        }
        // If we only have one potential, we need to clean up after ourselves again. This time
        // however, we could have had many relatedChanges that we need to clean up, so we'll loop
        // through them and remove them from the list. They're our's now.
        if(potentials.length === 1) {
          let related = potentials[0].relatedChanges;
          related.sort((a:number, b:number) => b - a);
          for(let relatedIx of related) {
            all.splice(relatedIx, 1);
          }
          potentials[0].relatedChanges = []
        }
        eMap[actual.e] = potentials;
      }

      if(!found) assert.fail("No match found for: " + actual.toString());
      else assert.pass("Found match for: " + actual.toString());
    }
  }
}

export function time(start?:any): number | number[] | string {
  if ( !start ) return process.hrtime();
  let end = process.hrtime(start);
  return ((end[0]*1000) + (end[1]/1000000)).toFixed(3);
}
