import {Proposal, Change, ResolvedValue, createArray, createHash, IGNORE_REG, ID, EAVN, EAVNField,
        Iterator, Register, Constraint, ALLOCATION_COUNT, NTRCArray} from "./runtime";

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
  getImpact(change:Change):number;
  propose(proposal:Proposal, e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue, transaction:number, round:number):Proposal;
  resolveProposal(proposal:Proposal):any[][];
  check(e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue, transaction:number, round:number):boolean;
  getDiffs(e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue):NTRCArray;
  get(e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue, transaction:number, round:number):EAVN[];
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


  getImpact(input:Change) {
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
    return count + input.count;
  }

  resolveProposal(proposal:Proposal) {
    return proposal.info;
  }

  propose(proposal:Proposal, e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue, transaction:number, round:number) {
    let final = createArray("indexProposeResults") as ID[][];
    let forFields = proposal.forFields;
    forFields.clear();
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
        let current = change[forFields.array[0]];
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

  get(e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue, transaction:number, round:number):EAVN[] {
    throw new Error("not implemented");
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
    let shouldRemove = false;
    if(change.count < 0) {
      let total = sumTimes(vIx, Infinity, Infinity);
      if(!total) {
        delete aIx[change.v];
        shouldRemove = true;
      }
    }

    aIx = getOrCreateHash(this.aveIndex, change.a);
    vIx = getOrCreateHash(aIx, change.v);
    eIx = getOrCreateArray(vIx, change.e);
    if(shouldRemove) {
      delete vIx[change.e];
    } else {
      eIx.push(change.n, change.transaction, change.round, change.count);
    }

    this.cardinality++;
  }

  hasImpact(input:Change) {
    let {e,a,v,n} = input;
    let ntrcs = this.getDiffs(e,a,v,n);
    let count = sumTimes(ntrcs, input.transaction, input.round);
    // console.log("      ntrcs:", ntrcs);
    // console.log("      count:", count);
    if((count > 0 && count + input.count == 0) ||
       (count == 0 && count + input.count > 0)) {
      return true;
    }
    return false;
  }

  getImpact(input:Change) {
    let {e,a,v,n} = input;
    let ntrcs = this.getDiffs(e,a,v,n);
    let count = sumTimes(ntrcs, input.transaction, input.round);
    return count + input.count;
  }

  resolveProposal(proposal:Proposal) {
    return proposal.info;
  }

  propose(proposal:Proposal, e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue, transaction:number, round:number) {
    let forFields = proposal.forFields;
    forFields.clear();
    if(isResolved(e)) {
      return this.walkPropose(proposal, this.eavIndex, e, a, v, n, "a", "v", transaction, round);
    } else if(isResolved(a)) {
      return this.walkPropose(proposal, this.aveIndex, a, v, e, n, "v", "e", transaction, round);
    } else {
      // propose for attribute since that's likely to be the smallest
      forFields.push("a");
      proposal.info = Object.keys(this.aveIndex);
      proposal.cardinality = proposal.info.length;
    }
    return proposal;
  }

  walkPropose(proposal:Proposal, index:any, a:ResolvedValue, b:ResolvedValue, c:ResolvedValue, n:ResolvedValue,
              fieldB:EAVNField, fieldC:EAVNField, transaction:number, round:number):Proposal {
    let {forFields} = proposal;
    forFields.clear();
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
        forFields.push(fieldC);
        proposal.info = Object.keys(cIx);
        proposal.cardinality = proposal.info.length;
        return proposal;
      }
    } else {
      forFields.push(fieldB);
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
        if(!cIx) continue;
        if(isResolved(c)) {
          let ntrcArray = cIx[c];
          if(ntrcArray) {
            return true;
          }
          return false;
        } else if(Object.keys(cIx).length !== 0) {
          return true;
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

  // This function finds all EAVs in the index that match the given
  // pattern at the stated time. If a level is free, we have to run
  // through the potential values until we come across one that could
  // match or we run out of values to check.
  walkGet(index:any, a:ResolvedValue, b:ResolvedValue, c:ResolvedValue, n:ResolvedValue, fieldB:EAVNField, fieldC:EAVNField, transaction:number, round:number):EAVN[] {
    let fieldA:EAVNField = "e";
    if(fieldB === "e") fieldA = "a";

    let results:EAVN[] = createArray("IndexWalkGet");

    let bIx = index[a as ID];
    if(!bIx) return results;
    if(isResolved(b)) {
      let cIx = bIx[b];
      if(!cIx) return results;
      if(isResolved(c)) { // ABC
        if(sumTimes(cIx[c], transaction, round) > 0) {
          results.push({[fieldA]: +a, [fieldB]: +b, [fieldC]: +c, n} as any);
        }
        return results;

      } else { // ABc
        for(let c of Object.keys(cIx)) {
          if(sumTimes(cIx[c], transaction, round) > 0) {
            results.push({[fieldA]: +a, [fieldB]: +b, [fieldC]: +c, n} as any);
          }
        }
        return results;
      }
    } else {
      for(let b of Object.keys(bIx)) {
        let cIx = bIx[b];
        if(!cIx) continue;
        if(isResolved(c)) {  // AbC
          if(sumTimes(cIx[c], transaction, round) > 0) {
            results.push({[fieldA]: +a, [fieldB]: +b, [fieldC]: +c, n} as any);
          }
        } else { // Abc
          for(let c of Object.keys(cIx)) {
            if(sumTimes(cIx[c], transaction, round) > 0) {
              results.push({[fieldA]: +a, [fieldB]: +b, [fieldC]: +c, n} as any);
            }
          }
        }
      }
      return results;
    }

    // throw new Error("HashIndex.walkGet eav not implemented.");
  }

  get(e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue, transaction:number, round:number):EAVN[] {
    if(isResolved(e)) {
      return this.walkGet(this.eavIndex, e, a, v, n, "a", "v", transaction, round);
    } else if(isResolved(a)) {
      return this.walkGet(this.aveIndex, a, v, e, n, "v", "e", transaction, round);
    } else throw new Error("HashIndex.get eaV not implemented.");
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

//------------------------------------------------------------------------
// DistinctIndex
//------------------------------------------------------------------------

export class DistinctIndex {
  index:{[key:string]: (number|undefined)[]|undefined} = {};

  shouldOutput(e:ID, a:ID, v:ID, prefixRound:number, prefixCount:number):number[] {
    // @FIXME: When we start to unintern, we'll have invalid keys left in this index,
    // so we'll need to delete the keys themselves from the index
    let key = `${e}|${a}|${v}`;
    let {index} = this;
    let roundCounts = index[key] || createArray("Insert intermediate counts");
    index[key] = roundCounts;
    // console.log("         counts: ", roundCounts);

    let curCount = 0;
    let startingCount = roundCounts[prefixRound] = roundCounts[prefixRound] || 0;
    let minRound = Math.min(roundCounts.length, prefixRound + 1);
    for(let roundIx = 0; roundIx < minRound; roundIx++) {
      let prevCount = roundCounts[roundIx];
      if(!prevCount) continue;
      curCount += prevCount;
    }

    // console.log("           foo:", curCount);

    let deltas = [];

    // We only need delta changed here because if there's a round delta, it
    // would have been applied already.

    let nextCount = curCount + prefixCount;
    let delta = 0;
    if(curCount == 0 && nextCount > 0) delta = 1;
    if(curCount > 0 && nextCount == 0) delta = -1;
    if(delta) {
      deltas.push(prefixRound, delta);
    }
    if(e == 17 && a == 11) console.log("DISTINCT",  {curCount, nextCount, delta})
    curCount = nextCount;
    roundCounts[prefixRound] = startingCount + prefixCount;

    for(let roundIx = prefixRound + 1; roundIx < roundCounts.length; roundIx++) {
      let roundCount = roundCounts[roundIx];
      if(roundCount === undefined) continue;

      let lastCount = curCount - prefixCount;
      let nextCount = lastCount + roundCount;

      let delta = 0;
      if(lastCount == 0 && nextCount > 0) delta = 1;
      if(lastCount > 0 && nextCount == 0) delta = -1;

      let lastCountChanged = curCount;
      let nextCountChanged = curCount + roundCount;

      let deltaChanged = 0;
      if(lastCountChanged == 0 && nextCountChanged > 0) deltaChanged = 1;
      if(lastCountChanged > 0 && nextCountChanged == 0) deltaChanged = -1;

      // console.log("      round:", roundIx, {delta, deltaChanged, lastCountChanged, nextCountChanged});

      let finalDelta = deltaChanged - delta;
      // console.log("            loop:", roundIx, curCount, prev, nextCount, next, {prevDelta, newDelta, finalDelta})

      if(finalDelta) {
        // roundCounts[roundIx] += prefixCount * -1;
        // console.log("            changed:", roundIx, finalDelta)
        deltas.push(roundIx, finalDelta);
      }

      curCount = nextCountChanged;
    }
    // console.log("         post counts: ", roundCounts);

    return deltas;
  }

  distinct(input:Change, transactionId:number, results:Iterator<Change>):boolean {
    // console.log("     checking: ", input.toString());
    let {e, a, v, n, round, count} = input;
    let deltas = this.shouldOutput(e, a, v, round, count);
    for(let deltaIx = 0; deltaIx < deltas.length; deltaIx += 2) {
      let deltaRound = deltas[deltaIx];
      let delta = deltas[deltaIx + 1];
      let change = new Change(e!, a!, v!, n!, transactionId, deltaRound, delta);
      results.push(change)
    }
    return deltas.length > 0;
  }
}
