import {RawValue} from "../src/runtime/runtime";
import {Program} from "../src/runtime/dsl2";
import {verify, pprint} from "./util";
import * as test from "tape";

type RawEAVRC = [RawValue, RawValue, RawValue, number, number]

var programs = {
  "static": {
    1: () => {
      let prog = new Program("1 static branch");
      prog.block("simple block", ({find, union, record}) => {
        let foo = find("input");
        let [branch] = union(() => 1);
        return [
          record("result", {branch})
        ];
      });
      return prog;
    },
    2: () => {
      let prog = new Program("test");
      prog.block("simple block", ({find, union, record}) => {
        let foo = find("input");
        let [branch] = union(
          () => 1,
          () => 2
        );
        return [
          record("result", {branch})
        ];
      });
      return prog;
    }
  }
};

type StaticBranchCount = keyof typeof programs["static"];
function verifyStaticBranches(assert:test.Test, branchCount:StaticBranchCount, inputString:string, expecteds:RawEAVRC[][]) {
  let prog = programs["static"][branchCount]();

  // let supports:{[round:number]: } = {};

  let transactions = inputString.split(";");

  if(expecteds.length !== transactions.length) {
    assert.fail("Malformed test case");
    throw new Error(`Incorrect number of expecteds given the inputString Got ${expecteds.length}, needed: ${transactions.length}`);
  }

  let transactionNumber = 0;
  for(let transaction of transactions) {
    let rounds = transaction.split(",");
    let eavrcs:RawEAVRC[] = [];
    let roundNumber = 0;
    for(let round of rounds) {
      let inputs = round.split(" ");
      for(let input of inputs) {
        if(!input) continue;
        if(input.length !== 2) {
          assert.fail("Malformed test case");
          throw new Error(`Malformed input string. '${inputString}'`);
        }
        let count;
        if(input[0] === "+") count = 1;
        else if(input[0] === "-") count = -1;
        else {
          assert.fail("Malformed test case");
          throw new Error(`Malformed input: ${input}`);
        }

        let id = input[1];
        eavrcs.push([id, "tag", "input", roundNumber, count]);
      }

      roundNumber += 1;
    }

    let expected = expecteds[transactionNumber];
    assert.comment(".  Verifying: " + pprint(eavrcs) + " -> " + pprint(expected));
    verify(assert, prog, eavrcs, expected);
    transactionNumber++;
  }
  assert.end();
  return prog;
}

// -----------------------------------------------------
// 1 Static branch
// -----------------------------------------------------

test("1 static branch +A; -A; +A", (assert) => {
  verifyStaticBranches(assert, "1", "+A; -A; +A", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]],
    [[2, "tag", "result", 1, -1], [2, "branch", 1, 1, -1]],
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]]
  ]);
});

test("1 static branch +A; -A; +B", (assert) => {
  verifyStaticBranches(assert, "1", "+A; -A; +B", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]],
    [[2, "tag", "result", 1, -1], [2, "branch", 1, 1, -1]],
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]]
  ]);
});

// @NOTE: Broken due to verify being too simple.
test("1 static branch +A; +A; -A", (assert) => {
  verifyStaticBranches(assert, "1", "+A; +A; -A", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]],
    [],
    []
  ]);
});

// @NOTE: Broken due to verify being too simple.
test("1 static branch +A; +A; -A; -A", (assert) => {
  verifyStaticBranches(assert, "1", "+A; +A; -A; -A", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]],
    [],
    [],
    [[2, "tag", "result", 1, -1], [2, "branch", 1, 1, -1]],
  ]);
});

test("1 static branch +A +B; -A; +A", (assert) => {
  verifyStaticBranches(assert, "1", "+A +B; -A; +A", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]],
    [],
    []
  ]);
});

test("1 static branch +A +B; -A -B", (assert) => {
  verifyStaticBranches(assert, "1", "+A +B; -A -B", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]],
    [[2, "tag", "result", 1, -1], [2, "branch", 1, 1, -1]]
  ]);
});

test("1 static branch +A; -A +B", (assert) => {
  verifyStaticBranches(assert, "1", "+A; -A +B", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]],
    []
  ]);
});

test("1 static branch +A, -A", (assert) => {
  verifyStaticBranches(assert, "1", "+A, -A", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1],
     [2, "tag", "result", 2, -1], [2, "branch", 1, 2, -1]]
  ]);
});

test("1 static branch +A, -A +B", (assert) => {
  verifyStaticBranches(assert, "1", "+A, -A +B", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]]
  ]);
});

test("1 static branch +A, +B", (assert) => {
  verifyStaticBranches(assert, "1", "+A, +B", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]]
  ]);
});

test("1 static branch +A, +B; -A", (assert) => {
  verifyStaticBranches(assert, "1", "+A, +B; -A", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]],
    [[2, "tag", "result", 1, -1], [2, "branch", 1, 1, -1],
     [2, "tag", "result", 2, +1], [2, "branch", 1, 2, +1]]
  ]);
});

test("1 static branch +A; -A, +B", (assert) => {
  verifyStaticBranches(assert, "1", "+A; -A, +B", [
    [[2, "tag", "result", 1, +1], [2, "branch", 1, 1, +1]],
    [[2, "tag", "result", 1, -1], [2, "branch", 1, 1, -1],
     [2, "tag", "result", 2, +1], [2, "branch", 1, 2, +1]]
  ]);
});

// -----------------------------------------------------
// 2 Static branches
// -----------------------------------------------------

test("2 static branches +A; -A; +A", (assert) => {
  verifyStaticBranches(assert, "2", "+A; -A; +A", [
    [[1, "tag", "result", 1, +1], [1, "branch", 1, 1, +1],
     [2, "tag", "result", 1, +1], [2, "branch", 2, 1, +1]],
    [[1, "tag", "result", 1, -1], [1, "branch", 1, 1, -1],
     [2, "tag", "result", 1, -1], [2, "branch", 2, 1, -1]],
    [[1, "tag", "result", 1, +1], [1, "branch", 1, 1, +1],
     [2, "tag", "result", 1, +1], [2, "branch", 2, 1, +1]]
  ]);
});

test("2 static branches +A; +B", (assert) => {
  verifyStaticBranches(assert, "2", "+A; +B", [
    [[1, "tag", "result", 1, +1], [1, "branch", 1, 1, +1],
     [2, "tag", "result", 1, +1], [2, "branch", 2, 1, +1]],
    []
  ]);
});

test("2 static branches +A; +B; -A", (assert) => {
  verifyStaticBranches(assert, "2", "+A; +B; -A", [
    [[1, "tag", "result", 1, +1], [1, "branch", 1, 1, +1],
     [2, "tag", "result", 1, +1], [2, "branch", 2, 1, +1]],
    [],
    []
  ]);
});

test("2 static branches +A +B; -A; +A", (assert) => {
  verifyStaticBranches(assert, "2", "+A +B; -A; +A", [
    [[1, "tag", "result", 1, +1], [1, "branch", 1, 1, +1],
     [2, "tag", "result", 1, +1], [2, "branch", 2, 1, +1]],
    [],
    []
  ]);
});

test("2 static branches +A; +B; -A; -B", (assert) => {
  verifyStaticBranches(assert, "2", "+A; +B; -A; -B", [
    [[1, "tag", "result", 1, +1], [1, "branch", 1, 1, +1],
     [2, "tag", "result", 1, +1], [2, "branch", 2, 1, +1]],
    [],
    [],
    [[1, "tag", "result", 1, -1], [1, "branch", 1, 1, -1],
     [2, "tag", "result", 1, -1], [2, "branch", 2, 1, -1]],
  ]);
});


test("2 static branches +A; +B, -A; -B", (assert) => {
  verifyStaticBranches(assert, "2", "+A; +B, -A; -B", [
    [[1, "tag", "result", 1, +1], [1, "branch", 1, 1, +1],
     [2, "tag", "result", 1, +1], [2, "branch", 2, 1, +1]],
    [],
    [[1, "tag", "result", 1, -1], [1, "branch", 1, 1, -1],
     [2, "tag", "result", 1, -1], [2, "branch", 2, 1, -1]],
  ]);
});
