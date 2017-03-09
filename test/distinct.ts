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

function distinctTest(assert:any, roundCounts: number[][], expected: any) {
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

  let badKeys:any = {};

  for(let key in expected) {
    let finalValue = final[key];
    let expectedValue = expected[key];
    if(finalValue || expectedValue) {
      let valid = finalValue == expectedValue;
      if(!valid) {
        badKeys[key] = true;
        assert.fail(`round ${key} :: expected ${expected[key]}, actual ${final[key]}`);
      }
    }
  }
  for(let key in final) {
    if(badKeys[key]) continue;
    let finalValue = final[key];
    let expectedValue = expected[key];
    if(finalValue || expectedValue) {
      let valid = finalValue == expectedValue;
      if(!valid) {
        badKeys[key] = true;
        assert.fail(`round ${key} :: expected ${expected[key]}, actual ${final[key]}`);
      }
    }
  }
}

function distinct(name:string, roundCounts:number[][], expected:any) {
  test(`Distinct: ${name}`, (assert) => {
    distinctTest(assert, roundCounts, expected);
    assert.end();
  });
}

distinct("basic", [
  [1,1],
  [2,-1],

  [1, 1],
  [3, -1],
], {
  1: 1,
  3: -1
})

//------------------------------------------------------------
// Chris's section
//------------------------------------------------------------

distinct("basic 2", [
  [1, 1],
  [2, -1],

  [3,1],
  [4,-1],
], {
  1: 1,
  2: -1,
  3: 1,
  4: -1,
})

distinct("basic 2 in reverse order", [
  [3,1],
  [4,-1],

  [1, 1],
  [2, -1],
], {
  1: 1,
  2: -1,
  3: 1,
  4: -1,
})

distinct("basic 2 undone", [
  [1, 1],
  [2, -1],

  [3,1],
  [4,-1],

  [1, -1],
  [2, 1],
], {
  3: 1,
  4: -1,
})

distinct("multiple counts", [
  [1, 1],
  [1, 1],
  [1, 1],
  [2, -1],
  [2, -1],
  [2, -1],

  [3,1],
  [3,1],
  [3,1],
  [4,-1],
  [4,-1],
  [4,-1],
], {
  1: 1,
  2: -1,
  3: 1,
  4: -1,
})

distinct("multiple counts reversed", [
  [3,1],
  [3,1],
  [3,1],
  [4,-1],
  [4,-1],
  [4,-1],

  [1, 1],
  [1, 1],
  [1, 1],
  [2, -1],
  [2, -1],
  [2, -1],
], {
  1: 1,
  2: -1,
  3: 1,
  4: -1,
})

distinct("multiple counts interleaved", [
  [3,1],
  [4,-1],
  [3,1],
  [4,-1],
  [3,1],
  [4,-1],

  [1, 1],
  [2, -1],
  [1, 1],
  [2, -1],
  [1, 1],
  [2, -1],
], {
  1: 1,
  2: -1,
  3: 1,
  4: -1,
})

distinct("multiple counts negatives first", [
  [2, -1],
  [2, -1],
  [2, -1],
  [1, 1],
  [1, 1],
  [1, 1],

  [4,-1],
  [4,-1],
  [4,-1],
  [3,1],
  [3,1],
  [3,1],
], {
  1: 1,
  2: -1,
  3: 1,
  4: -1,
})

distinct("multiple counts undone", [
  [1, 1],
  [1, 1],
  [1, 1],
  [2, -1],
  [2, -1],
  [2, -1],

  [3,1],
  [3,1],
  [3,1],
  [4,-1],
  [4,-1],
  [4,-1],

  [1, -1],
  [1, -1],
  [1, -1],
  [2, 1],
  [2, 1],
  [2, 1],
], {
  3: 1,
  4: -1,
})

distinct("multiple counts undone interleaved", [
  [1, 1],
  [1, 1],
  [1, 1],
  [2, -1],
  [2, -1],
  [2, -1],

  [1, -1],
  [1, -1],
  [1, -1],

  [3,1],
  [3,1],
  [3,1],
  [4,-1],
  [4,-1],
  [4,-1],

  [2, 1],
  [2, 1],
  [2, 1],
], {
  3: 1,
  4: -1,
})

distinct("multiple disparate counts", [
  [1, 1],
  [1, 1],
  [1, 1],
  [2, -1],
  [2, -1],
  [2, -1],

  [3,1],
  [4,-1],
], {
  1: 1,
  2: -1,
  3: 1,
  4: -1,
})

distinct("multiple disparate counts with extra removes", [
  [1, 1],
  [1, 1],
  [1, 1],

  [2, -1],
  [2, -1],
  [2, -1],

  [1, -1],
  [1, -1],
  [1, -1],

  [2, 1],
  [2, 1],
  [2, 1],

  [3,1],
  [4,-1],
], {
  3: 1,
  4: -1,
})

//------------------------------------------------------------
// Josh's section
//------------------------------------------------------------

