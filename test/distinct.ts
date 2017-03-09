import {DistinctIndex} from "../src/runtime/indexes";
import {Change, Iterator} from "../src/runtime/runtime";
import {verify} from "./util";
import * as test from "tape";

function roundCountsToChanges(rcs:number[][]) {
  let changes = [];
  for(let [round, count] of rcs) {
    changes.push(new Change(1,2,3,4,1,round,count));
  }
  return changes;
}

function distinct(assert:any, roundCounts: number[][], expected: any) {
  let index = new DistinctIndex();

  let changes = roundCountsToChanges(roundCounts);

  let final:any = {};
  for(let change of changes) {
    let neueChanges = new Iterator<Change>();
    index.distinct(change, neueChanges);
    let neue;
    while((neue = neueChanges.next())) {
      final[neue.round] = (final[neue.round] || 0) + neue.count;
    }
  }

  for(let key in expected) {
    let finalValue = final[key];
    let expectedValue = expected[key];
    if(finalValue || expectedValue) assert.equal(final[key], expected[key]);
  }
  for(let key in final) {
    let finalValue = final[key];
    let expectedValue = expected[key];
    if(finalValue || expectedValue) assert.equal(final[key], expected[key]);
  }
}

test("Distinct: basic", (assert) => {
  let roundCounts = [
    [1,1],
    [2,-1],

    [1, 1],
    [3, -1],
  ];
  let expected = {
    1: 1,
    3: -1
  };

  distinct(assert, roundCounts, expected);
  assert.end();
});

//------------------------------------------------------------
// Chris's section
//------------------------------------------------------------


//------------------------------------------------------------
// Josh's section
//------------------------------------------------------------
