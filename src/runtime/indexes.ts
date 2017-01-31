
import {Proposal, Change, ResolvedValue, createArray, createHash, IGNORE_REG, ID, EAVN, EAVNField, Register, Constraint, ALLOCATION_COUNT, NTRCArray} from "./runtime";

//------------------------------------------------------------------------
// Utils
//------------------------------------------------------------------------

function isResolved(field:ResolvedValue): field is ID {
  return field !== undefined && field !== IGNORE_REG;
}

// This function sums the counts of a packed array of node,
// transcation, round, count (ntrc) up to the given transaction and
// round based on the partial order (t1 <= t2 && r1 <= r2)
function sumTimes(ntrcArray:number[], transaction:number, round:number) {
  if(!ntrcArray) return 0;
  let total = 0;
  for(let i = 0, len = ntrcArray.length; i < len; i += 4) {
    let t = ntrcArray[i + 1];
    let r = ntrcArray[i + 2];
    if(t <= transaction && r <= round) total += ntrcArray[i + 3];
  }
  return total;
}

//------------------------------------------------------------------------
// Indexes
//------------------------------------------------------------------------

export interface Index {
  insert(change:Change):void;
  hasImpact(change:Change):boolean;
  propose(proposal:Proposal, e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue, transaction:number, round:number):Proposal;
  resolveProposal(proposal:Proposal):any[][];
  get(e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue, transaction:number, round:number):EAVN[];
  check(e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue, transaction:number, round:number):boolean;
  getDiffs(e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue):NTRCArray;
}

export class ListIndex implements Index {
  changes: Change[] = createArray();
  insert(change:Change) {
     this.changes.push(change);
  }

  hasImpact(input:Change) {
    let {e,a,v,n} = input;
    let count = 0;
    for(let change of this.changes) {
      if((e === undefined || e === IGNORE_REG || e === change.e) &&
         (a === undefined || a === IGNORE_REG || a === change.a) &&
         (v === undefined || v === IGNORE_REG || v === change.v) &&
         (n === undefined || n === IGNORE_REG || n === change.n) &&
         (change.transaction <= input.transaction) &&
         (change.round <= input.round)) {
        count += change.count;
      }
    }
    if((count > 0 && count + input.count == 0) ||
       (count == 0 && count + input.count > 0)) {
      return true;
    }
    return false;
  }

  resolveProposal(proposal:Proposal) {
    return proposal.info;
  }

  propose(proposal:Proposal, e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue, transaction:number, round:number) {
    let final = createArray("indexProposeResults") as ID[][];
    let forFields:EAVNField[] = createArray("indexForFields");
    let seen = createHash();

    if(a === undefined) forFields.push("a");
    else if(v === undefined) forFields.push("v");
    else if(e === undefined) forFields.push("e");
    else if(n === undefined) forFields.push("n");

    for(let change of this.changes) {
      if((e === undefined || e === IGNORE_REG || e === change.e) &&
         (a === undefined || a === IGNORE_REG || a === change.a) &&
         (v === undefined || v === IGNORE_REG || v === change.v) &&
         (n === undefined || n === IGNORE_REG || n === change.n) &&
         (change.transaction <= transaction) &&
         (change.round <= round)) {
        let current = change[forFields[0]];
        if(!seen[current]) {
          seen[current] = true;
          final.push([current]);
        }
      }
    }

    proposal.cardinality = final.length;
    proposal.info = final;
    proposal.forFields = forFields;
    return proposal;
  }

  check(e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue, transaction:number, round:number):boolean {
    for(let change of this.changes) {
      if((e === undefined || e === IGNORE_REG || e === change.e) &&
         (a === undefined || a === IGNORE_REG || a === change.a) &&
         (v === undefined || v === IGNORE_REG || v === change.v) &&
         (n === undefined || n === IGNORE_REG || n === change.n) &&
         (change.transaction <= transaction) &&
         (change.round <= round)) {
        return true;
      }
    }
    return false;
  }

  get(e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue, transaction:number, round:number):EAVN[] {
    let final = createArray() as EAVN[];
    for(let change of this.changes) {
      if((e === undefined || e === IGNORE_REG || e === change.e) &&
         (a === undefined || a === IGNORE_REG || a === change.a) &&
         (v === undefined || v === IGNORE_REG || v === change.v) &&
         (n === undefined || n === IGNORE_REG || n === change.n) &&
         (change.transaction <= transaction) &&
         (change.round <= round)) {
        final.push(new EAVN(change.e, change.a, change.v, change.n))
      }
    }
    return final;
  }

  getDiffs(e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue):NTRCArray {
    let final = createArray() as NTRCArray;
    for(let change of this.changes) {
      if((e === undefined || e === IGNORE_REG || e === change.e) &&
         (a === undefined || a === IGNORE_REG || a === change.a) &&
         (v === undefined || v === IGNORE_REG || v === change.v) &&
         (n === undefined || n === IGNORE_REG || n === change.n)) {
        final.push(change.n, change.transaction, change.round, change.count);
      }
    }
    return final;

  }
}

export class HashIndex implements Index {
  eavIndex = createHash();
  aveIndex = createHash();
  cardinality = 0;

  getOrCreateHash(parent:any, key:any) {
    let found = parent[key];
    if(!found) {
      found = parent[key] = createHash("hashLevel");
    }
    return found;
  }

  getOrCreateArray(parent:any, key:any) {
    let found = parent[key];
    if(!found) {
      found = parent[key] = createArray("hashVix");
    }
    return found;
  }

  insert(change:Change) {
    let {getOrCreateHash, getOrCreateArray} = this;
    let eIx = getOrCreateHash(this.eavIndex, change.e);
    let aIx = getOrCreateHash(eIx, change.a);
    let vIx = getOrCreateArray(aIx, change.v);
    vIx.push(change.n, change.transaction, change.round, change.count);

    aIx = getOrCreateHash(this.aveIndex, change.a);
    vIx = getOrCreateHash(aIx, change.v);
    eIx = getOrCreateArray(vIx, change.e);
    eIx.push(change.n, change.transaction, change.round, change.count);

    this.cardinality++;
  }

  hasImpact(input:Change) {
    let {e,a,v,n} = input;
    let ntrcs = this.getDiffs(e,a,v,n);
    let count = sumTimes(ntrcs, input.transaction, input.round);
    if((count > 0 && count + input.count == 0) ||
       (count == 0 && count + input.count > 0)) {
      return true;
    }
    return false;
  }

  resolveProposal(proposal:Proposal) {
    return proposal.info;
  }

  propose(proposal:Proposal, e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue, transaction:number, round:number) {
    let forFields = proposal.forFields;
    forFields.length = 0;
    if(isResolved(e)) {
      return this.walkPropose(proposal, this.eavIndex, e, a, v, n, "a", "v", transaction, round);
    } else if(isResolved(a)) {
      return this.walkPropose(proposal, this.aveIndex, a, v, e, n, "v", "e", transaction, round);
    } else {
      // propose for attribute since that's likely to be the smallest
      forFields[0] = "a";
      proposal.info = Object.keys(this.aveIndex);
      proposal.cardinality = proposal.info.length;
    }
    return proposal;
  }

  walkPropose(proposal:Proposal, index:any, a:ResolvedValue, b:ResolvedValue, c:ResolvedValue, n:ResolvedValue,
              fieldB:EAVNField, fieldC:EAVNField, transaction:number, round:number):Proposal {
    let {forFields} = proposal;
    let bIx = index[a as ID];
    if(!bIx) {
      proposal.cardinality = 0;
      return proposal;
    }
    if(isResolved(b)) {
      let cIx = bIx[b];
      if(!cIx) {
        proposal.cardinality = 0;
        return proposal;
      }
      if(isResolved(c)) {
        let ntrcArray = cIx[c];
        if(ntrcArray) {
          proposal.skip = true;
          return proposal;
        }
        proposal.cardinality = 0;
        return proposal;
      } else {
        forFields[0] = fieldC;
        proposal.info = Object.keys(cIx);
        proposal.cardinality = proposal.info.length;
        return proposal;
      }
    } else {
      forFields[0] = fieldB;
      proposal.info = Object.keys(bIx);
      proposal.cardinality = proposal.info.length;
      return proposal;
    }
  }

  // This function checks that there is at least one value in the index that matches the
  // given pattern. If a level is free, we have to run through the potential values
  // until we come across one that could match or we run out of values to check.
  walkCheck(index:any, a:ResolvedValue, b:ResolvedValue, c:ResolvedValue, n:ResolvedValue, transaction:number, round:number):boolean {
    let bIx = index[a as ID];
    if(!bIx) return false;
    if(isResolved(b)) {
      let cIx = bIx[b];
      if(!cIx) return false;
      if(isResolved(c)) {
        let ntrcArray = cIx[c];
        if(ntrcArray) {
          return true;
        }
        return false;
      } else {
        return Object.keys(cIx).length !== 0;
      }
    } else {
      for(let key of Object.keys(bIx)) {
        let cIx = bIx[key];
        if(!cIx) return false;
        if(isResolved(c)) {
          let ntrcArray = cIx[c];
          if(ntrcArray) {
            return true;
          }
          return false;
        } else {
          return Object.keys(cIx).length !== 0;
        }
      }
    }
    return false;
  }

  check(e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue, transaction:number, round:number):boolean {
    if(isResolved(e)) {
      return this.walkCheck(this.eavIndex, e, a, v, n, transaction, round);
    } else if(isResolved(a)) {
      return this.walkCheck(this.aveIndex, a, v, e, n, transaction, round);
    }
    return true;
  }

  get(e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue, transaction:number, round:number):EAVN[] {
    throw new Error("Not implemented");
  }

  getDiffs(e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue):NTRCArray {
    let aIx = this.eavIndex[e!];
    if(aIx) {
      let vIx = aIx[a!];
      if(vIx) {
        return vIx[v!];
      }
    }
    return createArray();
  }

}

export class InsertOnlyHashIndex implements Index {
  eavIndex = createHash();
  aveIndex = createHash();
  cardinality = 0;

  getOrCreateHash(parent:any, key:any) {
    let found = parent[key];
    if(!found) {
      found = parent[key] = createHash("hashLevel");
    }
    return found;
  }

  getOrCreateArray(parent:any, key:any) {
    let found = parent[key];
    if(!found) {
      found = parent[key] = createArray("hashVix");
    }
    return found;
  }

  insert(change:Change) {
    let {getOrCreateHash, getOrCreateArray} = this;
    let eIx = getOrCreateHash(this.eavIndex, change.e);
    let aIx = getOrCreateHash(eIx, change.a);
    let vIx = getOrCreateArray(aIx, change.v);
    vIx.push(change.n, change.transaction, change.round, change.count);

    aIx = getOrCreateHash(this.aveIndex, change.a);
    vIx = getOrCreateHash(aIx, change.v);
    eIx = getOrCreateArray(vIx, change.e);
    eIx.push(change.n, change.transaction, change.round, change.count);

    this.cardinality++;
  }

  hasImpact(input:Change) {
    let {e,a,v,n} = input;
    let ntrcs = this.getDiffs(e,a,v,n);
    let count = sumTimes(ntrcs, input.transaction, input.round);
    if((count > 0 && count + input.count == 0) ||
       (count == 0 && count + input.count > 0)) {
      return true;
    }
    return false;
  }


  resolveProposal(proposal:Proposal) {
    return createArray();
  }

  propose(proposal:Proposal, e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue, transaction:number, round:number) {
    return proposal;
  }

  check(e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue, transaction:number, round:number):boolean {
    return false;
  }

  get(e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue, transaction:number, round:number):EAVN[] {
    let final = createArray() as EAVN[];
    return final;
  }

  getDiffs(e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue):NTRCArray {
    return [];
  }

}


// @TODO: Implement
class MatrixIndex implements Index {

  constructor() {
    throw new Error("Not implemented");
  }

  insert(change:Change) {
  }

  hasImpact(input:Change) {
    let {e,a,v,n} = input;
    return false;
  }

  resolveProposal(proposal:Proposal) {
    return createArray();
  }

  propose(proposal:Proposal, e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue, transaction:number, round:number) {
    return proposal;
  }

  check(e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue, transaction:number, round:number):boolean {
    return false;
  }

  get(e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue, transaction:number, round:number):EAVN[] {
    let final = createArray() as EAVN[];
    return final;
  }

  getDiffs(e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue):NTRCArray {
    return [];
  }
}

class BitMatrixTree {

  root: any[];
  bins: number;
  levels: number;
  cardinality: number;

  constructor(bins = 8, levels = 5) {
    this.root = [];
    this.bins = bins;
    this.levels = levels;
    this.cardinality = 0;
  }

  size() {
    return Math.pow(this.bins, this.levels);
  }

  insert(row:number, col:number, n:ID, transaction:number, round:number, count:number) {
    let {bins} = this;
    // let path = [];
    let size = this.size();
    let rowStart = 0;
    let colStart = 0;
    let current = this.root;
    for(let i = 0; i < this.levels - 1; i++) {
      let rowEdge = (rowStart + size/bins);
      let colEdge = (colStart + size/bins);
      let rowIx = Math.floor(row / rowEdge)
      let colIx = Math.floor(col / colEdge)
      let pos = rowIx * this.bins + colIx;
      // path.push(pos);
      let next = current[pos];
      if(!next) next = current[pos] = [];
      size = size / bins
      if(rowIx) rowStart = rowEdge;
      if(colIx) colStart = colEdge;
      current = next;
    }
    let rowIx = row - rowStart;
    let colIx = (col - colStart) % bins;
    let pos = (rowIx * bins) + colIx;
    // console.log("LAST", {size, rowIx, colIx, pos, row, rowStart});
    // path.push(pos);
    // console.log("CURRENT POS", path);
    if(!current[pos]) {
      current[pos] = [n,transaction,round,count];
      this.cardinality++;
      return true;
    } else {
      current[pos].push(n,transaction,round,count);
      this.cardinality++;
    }
    return false;
  }

  checkMultiplicity(row:number, col:number, transaction:number, round:number):number {
    let {bins} = this;
    let size = this.size();
    let rowStart = 0;
    let colStart = 0;
    let current = this.root;
    for(let i = 0; i < this.levels - 1; i++) {
      let rowEdge = (rowStart + size/bins);
      let colEdge = (colStart + size/bins);
      let rowIx = Math.floor(row / rowEdge)
      let colIx = Math.floor(col / colEdge)
      let pos = rowIx * this.bins + colIx;
      let next = current[pos];
      if(!next) return 0;
      size = size / bins
      if(rowIx) rowStart = rowEdge;
      if(colIx) colStart = colEdge;
      current = next;
    }
    let rowIx = row - rowStart;
    let colIx = (col - colStart) % bins;
    let pos = (rowIx * bins) + colIx;
    let ntrcArray = current[pos];
    if(ntrcArray) return sumTimes(ntrcArray, transaction, round);
    return 0;
  }

  findRows(col: number, fill:ID[] = []) {
    let {levels, bins} = this;
    // @TODO: we shouldn't need an allocation here
    // Each frame on the stack is encoded as:
    //    level, level-array, row-start, col-start
    let queue = [0, this.root, 0, 0];
    let queuePos = 0;
    let queueLength = 1;
    let maxLevel = levels - 1;
    let fullSize = this.size();
    while(queuePos < queueLength) {
      let curPos = queuePos * 4;
      let level = queue[curPos] as number;
      let matrix = queue[curPos + 1] as number[];
      let rowStart = queue[curPos + 2] as number;
      let colStart = queue[curPos + 3] as number;
      let size = fullSize / Math.pow(bins, level);
      // since only the column is fixed, we need to look at all the rows.
      for(let rowIx = 0; rowIx < bins; rowIx++) {
        // find the subarray that contain that column and the current row
        let colEdge = colStart + size/bins;
        let colIx = Math.floor(col / colEdge)
        let rowValue = rowStart + rowIx * size / bins;
        let pos = rowIx * this.bins + colIx;
        let next = matrix[pos];
        if(next) {
          // if we are at the leaves, add this to the fill
          if(level === maxLevel) {
            fill.push(rowValue);
          } else {
            // if we're not at the leaves, push them onto the stack
            queue.push(level + 1, next, rowValue, colStart + colIx * size);
            queueLength = queueLength + 1;
          }
        }
      }

      // now that we've looked at all the rows, we move the queue forward
      queuePos = queuePos + 1;
    }
    return fill;
  }

  findCols(row: number, fill:ID[] = []) {
    let {levels, bins} = this;
    // @TODO: we shouldn't need an allocation here
    // Each frame on the stack is encoded as:
    //    level, level-array, row-start, col-start
    let queue = [0, this.root, 0, 0];
    let queuePos = 0;
    let queueLength = 1;
    let maxLevel = levels - 1;
    let fullSize = this.size();
    while(queuePos < queueLength) {
      let curPos = queuePos * 4;
      let level = queue[curPos] as number;
      let matrix = queue[curPos + 1] as ID[];
      let rowStart = queue[curPos + 2] as number;
      let colStart = queue[curPos + 3] as number;
      let size = fullSize / Math.pow(bins, level);
      // since only the row is fixed, we need to look at all the rows.
      for(let colIx = 0; colIx < bins; colIx++) {
        // find the subarray that contain that row and the current column
        let rowEdge = rowStart + size/bins;
        let rowIx = Math.floor(row / rowEdge)
        let colValue = colStart + colIx * size / bins;
        let pos = rowIx * this.bins + colIx;
        let next = matrix[pos];
        if(next) {
          // if we are at the leaves, add this to the fill
          if(level === maxLevel) {
            fill.push(colValue);
          } else {
            // if we're not at the leaves, push them onto the stack
            queue.push(level + 1, next, rowStart + rowIx * size, colValue);
            queueLength = queueLength + 1;
          }
        }
      }

      // now that we've looked at all the rows, we move the queue forward
      queuePos = queuePos + 1;
    }
    return fill;
  }

  toValues(fill:ID[] = []) {
    let {levels, bins} = this;
    // @TODO: we shouldn't need an allocation here
    // Each frame on the stack is encoded as:
    //    level, level-array, row-start, col-start
    let queue = [0, this.root, 0, 0];
    let queuePos = 0;
    let queueLength = 1;
    let maxLevel = levels - 1;
    let fullSize = this.size();
    let levelSize = bins * bins;
    while(queuePos < queueLength) {
      let curPos = queuePos * 4;
      let level = queue[curPos] as number;
      let matrix = queue[curPos + 1] as ID[];
      let rowStart = queue[curPos + 2] as number;
      let colStart = queue[curPos + 3] as number;
      let size = fullSize / Math.pow(bins, level);
      for(let pos = 0; pos < levelSize; pos++) {
        let next = matrix[pos];
        if(next) {
          let rowIx = Math.floor(pos / bins);
          let rowValue = rowStart + rowIx * size / bins;
          let colIx = pos % bins;
          let colValue = colStart + colIx * size / bins;
          // if we are at the leaves, add this to the fill
          if(level === maxLevel) {
            fill.push(rowValue, colValue);
          } else {
            // if we're not at the leaves, push them onto the stack
            queue.push(level + 1, next, rowValue, colValue);
            queueLength = queueLength + 1;
          }
        }
      }

      // now that we've looked at all the rows, we move the queue forward
      queuePos = queuePos + 1;
    }
    return fill;
  }
}

export class BitIndex implements Index {
  indexes: {[attr: string]: BitMatrixTree};
  attributes: ID[];
  cardinality: number = 0;
  constructor() {
    this.attributes = createArray();
    this.indexes = createHash();
  }

  insert(change:Change) {
    let {e,a,v,n,transaction,round,count} = change;
    let index = this.indexes[a];
    if(!index) {
      this.attributes.push(a);
      index = this.indexes[a] = new BitMatrixTree(8, 5);
    }
    let inserted = index.insert(e,v,n,transaction,round,count);
    this.cardinality++;
    // console.log("inserting", e, a, v, ei, vi, inserted);
  }

  hasImpact(input:Change) {
    let {e,a,v,n} = input;
    return false;
  }

  resolveProposal(proposal:Proposal) {
    return createArray();
  }

  propose(proposal:Proposal, e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue, transaction:number, round:number) {
    return proposal;
  }

  check(e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue, transaction:number, round:number):boolean {
    return false;
  }

  get(e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue, transaction:number, round:number):EAVN[] {
    let final = createArray() as EAVN[];
    return final;
  }

  getDiffs(e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue):NTRCArray {
    return [];
  }

  // contains() {
  //   let {e,a,v,n,transaction,round,count} = change;
  //   let index = this.indexes[a];
  //   if(!index) return false;
  //   let ei = this.interner.check(e);
  //   let vi = this.interner.check(v);
  //   return index.check(ei,vi);
  // }

  // get_AV(e,a,v,fill = []): any[] {
  //   let index = this.indexes[a];
  //   if(!index) return fill;
  //   let vi = this.interner.check(v);
  //   return index.findRows(vi, fill, this.interner.indexes);
  // }

  // getEA_(e,a,v,fill = []): any[] {
  //   let index = this.indexes[a];
  //   if(!index) return fill;
  //   let ei = this.interner.check(e);
  //   return index.findCols(ei, fill, this.interner.indexes);
  // }

  // get_A_(e,a,v,fill = []): any[] {
  //   let index = this.indexes[a];
  //   if(!index) return fill;
  //   return index.toValues(fill, this.interner.indexes);
  // }

  // getE__(e,a,v,fill = []): any[] {
  //   let ei = this.interner.check(e);
  //   let throwAway = [];
  //   for(let attribute of this.attributes) {
  //     let index = this.indexes[attribute];
  //     if(index.findCols(ei, throwAway, this.interner.indexes).length) {
  //       fill.push(attribute);
  //     }
  //   }
  //   return fill;
  // }

  // get__V(e,a,v,fill = []): any[] {
  //   let vi = this.interner.check(v);
  //   let throwAway = [];
  //   for(let attribute of this.attributes) {
  //     let index = this.indexes[attribute];
  //     if(index.findRows(vi, throwAway, this.interner.indexes).length) {
  //       fill.push(attribute);
  //     }
  //   }
  //   return fill;
  // }

  // getE_V(e,a,v,fill = []): any[] {
  //   let ei = this.interner.check(e);
  //   let vi = this.interner.check(v);
  //   for(let attribute of this.attributes) {
  //     let index = this.indexes[attribute];
  //     if(index.check(ei,vi)) {
  //       fill.push(attribute);
  //     }
  //   }
  //   return fill;
  // }

  // get___(e,a,v,fill = []): any[] {
  //   for(let attribute of this.attributes) {
  //     fill.push(attribute);
  //   }
  //   return fill;
  // }


}

