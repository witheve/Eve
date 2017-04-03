import {Program} from "../src/runtime/dsl2";
import * as Runtime from "../src/runtime/runtime";
import * as test from "tape";

// You can specify changes as either [e,a,v] or [e,a,v,round,count];
export type EAVTuple = [Runtime.RawValue, Runtime.RawValue, Runtime.RawValue];
export type EAVRCTuple = [Runtime.RawValue, Runtime.RawValue, Runtime.RawValue, number, number];
export type TestChange =  EAVTuple | EAVRCTuple;

let {GlobalInterner} = Runtime;
let TEST_INPUT_NODE = "test-input-node";

export function pprint(obj:any):string {
  if(typeof obj === "object" && obj instanceof Array) {
    return "[" + obj.map((v) => pprint(v)).join(", ") + "]";

  } else if(typeof obj === "string") {
    return `"${obj}"`;
  }
  return ""+obj;
}

export class EntityId {
  constructor(public id:Runtime.ID) {}
  toString() {
    return "$" + this.id;
  }
}

export function o_o(val:Runtime.ID):EntityId|Runtime.RawValue|undefined {
  let raw = GlobalInterner.reverse(val);
  if(typeof raw === "string" && raw.indexOf("|") !== -1) {
    return new EntityId(val);
  }

  return raw;
}

export function createChanges(transaction:number,eavns:TestChange[]) {
  let changes:Runtime.Change[] = [];
  for(let [e, a, v, round = 0, count = 1] of eavns as EAVRCTuple[]) {
    changes.push(Runtime.Change.fromValues(e, a, v, TEST_INPUT_NODE, transaction, round, count));
  }
  return changes;
}

export function verify(assert:test.Test, program:Program, input:any[], output:any[], transaction = 1) {
  let ins = createChanges(transaction, input);
  let outs = createChanges(transaction, output);

  let all:(Runtime.Change|undefined)[] = outs;
  let {changes, context} = program.input(ins)!;
  let inputNode = GlobalInterner.get(TEST_INPUT_NODE);
  changes = changes.filter((v) => v.n !== inputNode);
  let msg = "Fewer changes than expected";
  if(changes.length > all.length) {
    msg = "More changes than expected";
  }

  if(changes.length !== all.length) {
    assert.comment(".    Actual: " + pprint(changes.map((change) => {
      let {e, a, v, round, count} = change;
      return [o_o(e), o_o(a), o_o(v), round, count];
    })));
  }
  assert.equal(changes.length, all.length, msg);

  try {
    context.distinctIndex.sanityCheck();
  } catch(e) {
    assert.fail("Distinct sanity check failed");
  }

  // Because the changes handed to us in expected aren't going to have the same
  // e's as what the program itself is going to generate, we're going to have to do
  // some fancy matching to map from generated e's to expected e's. We'll need to
  // store that mapping somewhere, so we have eMap:
  let eMap:any = {};
  let fullyResolved:any = {};
  if(changes.length === all.length) {
    // As we check all of the changes we got from running the input on the program,
    // we need to update our eMap based on the expected changes that *could* match.
    // Most of the time, the hope is that there's only one potential match, but when
    // you're looking at something like tag, it's easy for there to be many records
    // that get generated with the same tag, so we're going to do a decent amount of
    // work here.
    for(let actual of changes) {
      let found = false;
      // console.log("\n\nACTUAL");
      // console.log("    ", actual.toString());
      // console.log("    ", actual);
      let expectedIx = 0;
      // check if we've found any potential matches for this e yet
      let matches = eMap[actual.e];
      // if we haven't found any matches yet, we need to collect some initial ones.
      if(!matches) {
        let potentials = [];
        for(let expected of all) {
          if(!expected) {
            expectedIx++;
            continue;
          }
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
          // We need to check that we haven't already resolved this match to some other actual value.
          let e = potentials[0].e;
          if(fullyResolved[e] !== undefined) {
            assert.fail(`\`${GlobalInterner.reverse(e)}\` has already been resolved to \`${GlobalInterner.reverse(fullyResolved[e])}\`,` +
                        ` but we are trying to resolve it to \`${GlobalInterner.reverse(actual.e)}\``);
            break;
          }
          fullyResolved[e] = actual.e;
          for(let ix of potentials[0].relatedChanges) {
            all[ix] = undefined;
          }
        }
        eMap[actual.e] = potentials;
      } else if(matches.length === 1) {
        // in the case where we've mapped our actual.e to our expected.e, we just check this
        // current fact for a match where the expected.e is what we're looking for
        for(let expected of all) {
          if(!expected) {
            expectedIx++;
            continue;
          }
          if(expected.e === matches[0].e && actual.equal(expected, true, true)) {
            found = true;
            all[expectedIx] = undefined;
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
          if(!expected) {
            expectedIx++;
            continue;
          }
          for(let match of matches) {
            if(match.e === expected.e && !fullyResolved[match.e] && actual.equal(expected, true, true)) {
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
          // We need to check that we haven't already resolved this match to some other actual value.
          let e = potentials[0].e;
          if(fullyResolved[e] !== undefined) {
            assert.fail(`\`${GlobalInterner.reverse(e)}\` has already been resolved to \`${GlobalInterner.reverse(fullyResolved[e])}\`,` +
                        ` but we are trying to resolve it to \`${GlobalInterner.reverse(actual.e)}\``);
            break;
          }
          fullyResolved[e] = actual.e;
          let related = potentials[0].relatedChanges;
          related.sort((a:number, b:number) => b - a);
          for(let relatedIx of related) {
            all[relatedIx] = undefined;
          }
          potentials[0].relatedChanges = []
        }
        eMap[actual.e] = potentials;
      }

      // console.log("    ", actual.e, ":", eMap[actual.e]);
      // console.log("    [")
      // for(let thing of all) {
      //   console.log("        ", thing);
      // }
      // console.log("    ]")

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

export function createInputs(inputString:string) {
  let transactionInputs:EAVRCTuple[][] = [];
  let transactions = inputString.split(";");
  for(let transaction of transactions) {
    let eavrcs:EAVRCTuple[] = [];
    let roundNumber = 0;
    for(let round of transaction.split(",")) {
      for(let input of round.split(" ")) {
        if(!input) continue;

        let count;
        if(input[0] === "+") count = 1;
        else if(input[0] === "-") count = -1;
        else throw new Error(`Malformed input: ${input}`);

        let args = input.slice(1).split(":");
        let id = args.shift();
        if(!id) throw new Error(`Malformed input: '${input}'`);

        eavrcs.push([id, "tag", "input", roundNumber, count]);

        let argIx = 0;
        for(let arg of args) {
          eavrcs.push([id, `arg${argIx}`, (isNaN(arg as any) ? arg : +arg), roundNumber, count]);
          argIx++;
        }
      }
      roundNumber += 1;
    }
    transactionInputs.push(eavrcs);
  }

  return transactionInputs;
}

export function createVerifier<T extends {[name:string]: () => Program}>(programs:T) {
  return function verifyInput(assert:test.Test, progName:(keyof T), inputString:string, expecteds:EAVRCTuple[][]) {
    let prog = programs[progName]();
    let inputs = createInputs(inputString);

    if(expecteds.length !== inputs.length) {
      assert.fail("Malformed test case");
      throw new Error(`Incorrect number of expecteds given the inputString Got ${expecteds.length}, needed: ${inputs.length}`);
    }

    let transactionNumber = 0;
    for(let input of inputs) {
      let expected = expecteds[transactionNumber];
      assert.comment(".  Verifying: " + pprint(input) + " -> " + pprint(expected));
      verify(assert, prog, input, expected);
      transactionNumber++;
    }
    assert.end();
    return prog;
  };
}
