import {Proposal, Change, ResolvedValue, createArray, createHash, IGNORE_REG, ID, EAVN, EAVNField,
        Iterator, Register, Constraint, ALLOCATION_COUNT, RoundArray} from "./runtime";

//------------------------------------------------------------------------
// Utils
//------------------------------------------------------------------------

function isResolved(field:ResolvedValue): field is ID {
  return !!field || field === 0;
}

function sumTimes(roundArray:RoundArray, transaction:number, round:number) {
  if(!roundArray) return 0;
  let total = 0;
  for(let cur of roundArray) {
    if(Math.abs(cur) - 1 <= round) {
      total += cur > 0 ? 1 : -1;
    }
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
  check(e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue, transaction:number, round:number):boolean;
  getDiffs(e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue):RoundArray;
  get(e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue, transaction:number, round:number):EAVN[];
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

  roundArrayInsert(arr:RoundArray, change:Change) {
    let round = change.round + 1;
    let neue =  round * change.count;
    let ix = 0;
    let handled = false;
    for(let cur of arr) {
      let curRound = Math.abs(cur);
      if(curRound === round) {
        let updated = curRound + neue;
        if(updated === 0) {
          arr.splice(ix,1);
        } else {
          arr[ix] = updated;
        }
        handled = true;
      } else if(curRound > round) {
        arr.splice(ix, 0, neue);
        handled = true;
      }
      ix++;
    }
    if(!handled) arr.push(neue)
  }

  insert(change:Change) {
    let {getOrCreateHash, getOrCreateArray} = this;
    let eIx = getOrCreateHash(this.eavIndex, change.e);
    let aIx = getOrCreateHash(eIx, change.a);
    let vIx = getOrCreateArray(aIx, change.v);
    this.roundArrayInsert(vIx, change);
    let shouldRemove = false;
    if(!vIx.length) {
      this.cardinality--;
      delete aIx[change.v];
      if(!Object.keys(aIx).length) {
        delete eIx[change.a];
        if(!Object.keys(eIx).length) {
          delete this.eavIndex[change.e];
        }
      }
      shouldRemove = true;
    }

    aIx = getOrCreateHash(this.aveIndex, change.a);
    vIx = getOrCreateHash(aIx, change.v);
    eIx = getOrCreateArray(vIx, change.e);
    if(shouldRemove) {
      delete vIx[change.e];
      if(!Object.keys(vIx).length) {
        delete aIx[change.v];
        if(!Object.keys(aIx).length) {
          delete this.aveIndex[change.a];
        }
      }
    } else {
      this.roundArrayInsert(eIx, change)
      this.cardinality++;
    }

  }

  hasImpact(input:Change) {
    let {e,a,v,n} = input;
    let rounds = this.getDiffs(e,a,v,n);
    let count = sumTimes(rounds, input.transaction, input.round);
    // console.log("      ntrcs:", ntrcs);
    // console.log("      count:", count);
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
        let roundArray = cIx[c];
        if(roundArray) {
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
        let roundArray = cIx[c];
        if(roundArray) {
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
          let roundArray = cIx[c];
          if(roundArray) {
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
          results.push({[fieldA]: +a!, [fieldB]: +b, [fieldC]: +c, n} as any);
        }
        return results;

      } else { // ABc
        for(let c of Object.keys(cIx)) {
          if(sumTimes(cIx[c], transaction, round) > 0) {
            results.push({[fieldA]: +a!, [fieldB]: +b, [fieldC]: +c, n} as any);
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
            results.push({[fieldA]: +a!, [fieldB]: +b, [fieldC]: +c, n} as any);
          }
        } else { // Abc
          for(let c of Object.keys(cIx)) {
            if(sumTimes(cIx[c], transaction, round) > 0) {
              results.push({[fieldA]: +a!, [fieldB]: +b, [fieldC]: +c, n} as any);
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

  getDiffs(e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue):RoundArray {
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

    if(prefixCount === -Infinity) {
      if(curCount === Infinity) {
        curCount = 1;
        startingCount = 1;
      }
      prefixCount = -curCount;
    }
    let nextCount = curCount + prefixCount;
    let delta = 0;
    if(curCount == 0 && nextCount > 0) delta = 1;
    if(curCount > 0 && nextCount == 0) delta = -1;
    if(delta) {
      deltas.push(prefixRound, delta);
    }
    curCount = nextCount;
    roundCounts[prefixRound] = startingCount + prefixCount;
    // console.log("          DISTINCT",  {curCount, nextCount, delta, roundCounts})

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
