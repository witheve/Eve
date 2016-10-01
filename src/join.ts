//---------------------------------------------------------------------
// Generic join in Typescript over triples (EAVs)
//---------------------------------------------------------------------

const TRACK = false;

//---------------------------------------------------------------------
// Performance
//---------------------------------------------------------------------

class NoopPerformanceTracker {
  constructor() { }
  reset() { }
  time(start?): number | number[] | string { return 0; }
  lookup(start) { }
  store(start) { }
  block(name, start) { }
  send(start) { }
  blockCheck(start) { }
  fixpoint(start) { }
  report() { }
}

class PerformanceTracker {

  storeTime: number;
  storeCalls: number;

  lookupTime: number;
  lookupCalls: number;

  blockTime: any;
  blockCalls: any;

  sendTime: number;
  sendCalls: number;

  fixpointTime: number;
  fixpointCalls: number;

  blockCheckTime: number;
  blockCheckCalls: number;

  constructor() {
    this.reset();
  }

  reset() {
    this.storeTime = 0;
    this.storeCalls = 0;
    this.lookupTime = 0;
    this.lookupCalls = 0;
    this.sendTime = 0;
    this.sendCalls = 0;
    this.fixpointTime = 0;
    this.fixpointCalls = 0;
    this.blockCheckTime = 0;
    this.blockCheckCalls = 0;
    this.blockTime = {};
    this.blockCalls = {};
  }

  time(start?): number | number[] | string {
    if(global.process) {
      if ( !start ) return process.hrtime();
      let end = process.hrtime(start);
      return ((end[0]*1000) + (end[1]/1000000)).toFixed(3);
    } else {
      if ( !start ) return performance.now();
      let end = performance.now();
      return end - start;
    }
  }

  lookup(start) {
    this.lookupTime += time(start) as number;
    this.lookupCalls++;
  }

  store(start) {
    this.storeTime += time(start) as number;
    this.storeCalls++;
  }

  block(name, start) {
    if(this.blockTime[name] === undefined) {
      this.blockTime[name] = 0;
      this.blockCalls[name] = 0;
    }
    this.blockTime[name] += time(start) as number;
    this.blockCalls[name]++;
  }

  send(start) {
    this.sendTime += time(start) as number;
    this.sendCalls++;
  }

  blockCheck(start) {
    this.blockCheckTime += time(start) as number;
    this.blockCheckCalls++;
  }

  fixpoint(start) {
    this.fixpointTime += time(start) as number;
    this.fixpointCalls++;
  }

  report() {
    console.log("------------------ Performance --------------------------")
    console.log("%cFixpoint", "font-size:14pt; margin:10px 0;");
    console.log("");
    console.log(`    Time: ${this.fixpointTime}`)
    console.log(`    Count: ${this.fixpointCalls}`)
    console.log(`    Average time: ${this.fixpointTime / this.fixpointCalls}`)
    console.log("");
    console.log("%cBlocks", "font-size:16pt;");
    console.log("");
    let blocks = Object.keys(this.blockTime);
    blocks.sort((a,b) => {
     return this.blockTime[b] - this.blockTime[a];
    });
    for(let name of blocks) {
      let time = this.blockTime[name];
      let calls = this.blockCalls[name];
      let avg = time / calls;
      let color = avg > 5 ? "red" : (avg > 1 ? "orange" : "green");
      console.log(`    %c${name.substring(0,40)}`, "font-weight:bold;");
      console.log(`        Time: ${time}`);
      console.log(`        Calls: ${calls}`);
      console.log(`        Average: %c${avg}`, `color:${color};`);
      console.log(`        Fixpoint: %c${(time * 100 / this.fixpointTime).toFixed(1)}%`, `color:${color};`);
      console.log("");
    }
    console.log("");
    console.log("Block check")
    console.log("");
    console.log(`    Time: ${this.blockCheckTime}`)
    console.log(`    Count: ${this.blockCheckCalls}`)
    console.log(`    Average time: ${this.blockCheckTime / this.blockCheckCalls}`)
    console.log("");
    console.log("Lookup")
    console.log("");
    console.log(`    Time: ${this.lookupTime}`)
    console.log(`    Count: ${this.lookupCalls}`)
    console.log(`    Average time: ${this.lookupTime / this.lookupCalls}`)
    console.log("");
    console.log("Store")
    console.log("");
    console.log(`    Time: ${this.storeTime}`)
    console.log(`    Count: ${this.storeCalls}`)
    console.log(`    Average store: ${this.storeTime / this.storeCalls}`)
    console.log("");
    console.log("send");
    console.log("");
    console.log(`    Time: ${this.sendTime}`)
    console.log(`    Count: ${this.sendCalls}`)
    console.log(`    Average time: ${this.sendTime / this.sendCalls}`)
  }
}

let perf;
if(TRACK) {
  perf = global["perf"] = new PerformanceTracker();
} else {
  perf = global["perf"] = new NoopPerformanceTracker();
}

//---------------------------------------------------------------------
// Indexes
//---------------------------------------------------------------------

export class MultiIndex {
  indexes: {[name: string]: TripleIndex};
  scopes: string[];
  constructor() {
    this.indexes = {};
    this.scopes = [];
  }

  register(name, index = new TripleIndex(0)) {
    this.indexes[name] = index;
    this.scopes.push(name);
    return index;
  }

  unregister(name) {
    this.indexes[name] = undefined;
    this.scopes.splice(this.scopes.indexOf(name), 1);
  }

  getIndex(name) {
    let index = this.indexes[name];
    if(!index) return this.register(name);
    return index;
  }

  dangerousMergeLookup(e,a?,v?,node?) {
    let results = [];
    let indexes = this.indexes;
    for(let scope of this.scopes) {
      let index = indexes[scope];
      if(index === undefined) continue;
      let found = index.lookup(e,a,v,node);
      if(found) {
        let foundIndex = found.index;
        for(let key of Object.keys(foundIndex)) {
          results.push(foundIndex[key].value);
        }
      }
    }
    return results;
  }

  contains(scopes, e, a?, v?, node?) {
    let indexes = this.indexes;
    for(let scope of scopes) {
      let index = indexes[scope];
      if(index === undefined) continue;
      if(index.lookup(e,a,v,node) !== undefined) return true;
    }
    return;
  }

  store(scopes, e, a?, v?, node?) {
    let indexes = this.indexes;
    for(let scope of scopes) {
      let index = indexes[scope];
      if(index === undefined) {
        index = this.register(scope);
      }
      index.store(e,a,v,node)
    }
  }

  unstore(scopes, e, a?, v?, node?) {
    let indexes = this.indexes;
    for(let scope of scopes) {
      let index = indexes[scope];
      if(index === undefined) continue;
      index.unstore(e,a,v,node)
    }
  }
}

export class TripleIndex {
  version: number;
  eavIndex: IndexLevel;
  aveIndex: IndexLevel;
  constructor(version: number, eavIndex?: IndexLevel, aveIndex?: IndexLevel) {
    this.version = version;
    this.eavIndex = eavIndex !== undefined ? eavIndex : new IndexLevel(0, "eavRoot");
    this.aveIndex = aveIndex !== undefined ? aveIndex : new IndexLevel(0, "aveRoot");
  }

  // our simple indexing function that takes an eav and stores it for us
  // in all the indexes we'll need and keeps track of the index sides
  store(e,a,v,node = "user") {
    this.eavIndex = this.eavIndex.store(this.version, e,a,v,node);
    this.aveIndex = this.aveIndex.store(this.version, a,v,e,node);
  }

  unstore(e,a,v,node?) {
    let changed = this.eavIndex.unstore(this.version,e,a,v,node);
    if(changed) {
      this.eavIndex = changed;
      this.aveIndex = this.aveIndex.unstore(this.version,a,v,e,node);
    }
  }

  // find an eav in the indexes
  lookup(e,a?,v?,node?) {
    let start = perf.time();
    let result = this.eavIndex.lookup(e,a,v,node)
    perf.lookup(start);
    return result;
  }

  nextVersion() {
    return new TripleIndex(this.version + 1, this.eavIndex, this.aveIndex);
  }
}

class IndexLevel {
  version: number;
  value: any;
  cardinality: number;
  index: {[key: string]: IndexLevel | string};
  constructor(version: number, value: any) {
    this.version = version;
    this.value = value;
    this.cardinality = 0;
    this.index = {};
  }

  store(version, a,b?,c?,d?,e?,f?,g?,h?,i?,j?) {
    let child = this.index[a];
    let newChild = a;
    if(child === undefined && b !== undefined) {
      newChild = new IndexLevel(version, a);
      newChild.store(version, b,c,d,e,f,g,h,i,j);
    } else if(b !== undefined) {
      newChild = (child as IndexLevel).store(version, b,c,d,e,f,g,h,i,j);
    }
    let updated : IndexLevel = this;
    if(newChild.version > this.version) {
      // updated = this.clone(version)
    }
    if(child === undefined) { updated.cardinality++; }
    updated.index[a] = newChild;
    return updated;
  }

  unstore(version, a,b?,c?,d?,e?,f?,g?,h?,i?,j?) {
    let child = this.index[a];
    if(child === undefined) return;

    let updated: IndexLevel = this;

    if(child instanceof IndexLevel) {
      let updatedChild = child.unstore(version, b,c,d,e,f,g,h,i,j);
      if(updatedChild === undefined) {
        // updated = this.clone(version);
        delete updated.index[a];
        updated.cardinality--;
      } else {
        // updated = this.clone(version);
        updated.index[a] = updatedChild;
      }
    } else {
      // updated = this.clone(version);
      delete updated.index[a];
      updated.cardinality--;
    }
    if(updated.cardinality <= 0) {
      return;
    }
    return updated;
  }

  lookup(a,b?,c?,d?,e?,f?,g?,h?,i?,j?) {
    let child = this.index[a];
    if(child === undefined) return;
    if(b !== undefined && child instanceof IndexLevel) {
      return child.lookup(b,c,d,e,f,g,h,i,j);
    }
    return child;
  }

  clone(version) {
    let next = new IndexLevel(version, this.value);
    next.cardinality = this.cardinality;
    let index = next.index;
    let originalIndex = this.index;
    let keys = Object.keys(originalIndex);
    for(let key of keys) {
      index[key] = originalIndex[key];
    }
    return next;
  }
}

//---------------------------------------------------------------------
// Timing
//---------------------------------------------------------------------

export function time(start?): number | number[] | string {
  if(global.process) {
    if ( !start ) return process.hrtime();
    let end = process.hrtime(start);
    return ((end[0]*1000) + (end[1]/1000000)).toFixed(3);
  } else {
    if ( !start ) return performance.now();
    let end = performance.now();
    return end - start;
  }
}

//---------------------------------------------------------------------
// UUID
//---------------------------------------------------------------------

function makeUUID(idprefix, projection) {
  let items = [idprefix];
  for(let proj of projection) {
    items.push(proj);
  }
  return items.join("|");
}

var currentId = 0;
export function nextId(set?) {
  if(set !== undefined) {
    currentId = set;
    return currentId;
  }
  return currentId++;
}

//---------------------------------------------------------------------
// Variable
//---------------------------------------------------------------------

// We'll use Variable to represent relational variables in our "queries."
// These will be values used in both scans and constraints
export class Variable {
  id: number;
  constant?: any;
  constructor(id) {
    this.id = id;
  }
}

export function isVariable(thing) {
  return thing instanceof Variable;
}

//---------------------------------------------------------------------
// Proposal
//---------------------------------------------------------------------

// In generic join, each scan/constraint proposes a variable to solve for
// and what cardinality that variable would have if you choose its proposal.
export interface Proposal {
  providing: Variable | Variable[],
  cardinality: number,
  // optional bits of information for someone trying to resolve a proposal
  index?:any, // the index to use when resolving
  indexType?: any, // type of the index used to resolve
}

// Constraints/scans/etc are providers of proposals
export interface ProposalProvider {
  vars: Variable[],
  // Given a prefix of solved variables, return a proposal for
  // solving a new variable
  propose(index: MultiIndex, prefix: any[]) : Proposal,
  // Take a proposal and resolve it into the actual values being
  // proposed
  resolveProposal(index: MultiIndex, proposal: Proposal, prefix: any[]) : any[],
  // Check if a prefix of solved variables is a valid potential solution
  // for this provider. SolvingFor is used to ignore accept calls that
  // aren't related to variables the provider is solving for.
  accept(index: MultiIndex, prefix: any[], solvingFor: Variable, force?: boolean): boolean
}

//---------------------------------------------------------------------
// Prefix functions
//---------------------------------------------------------------------

// Turn a "register" (either an arg or return) into a value based
// on a prefix of variables
function toValue(register, prefix) {
  if(isVariable(register)) {
    return prefix[register.id];
  }
  return register;
}

// Resolve an array of registers based on a prefix of variables
function resolve(toResolve, prefix, resolved = []) {
  let ix = 0;
  for(let register of toResolve) {
    resolved[ix] = toValue(register, prefix);
    ix++;
  }
  return resolved;
}

// Check if this entire array of registers has values (all variables have been
// filled in by the prefix.)
function fullyResolved(toCheck, prefix) {
  for(let register of toCheck) {
    if(register === undefined) continue;
    if(toValue(register, prefix) === undefined) return false;
  }
  return true;
}

//---------------------------------------------------------------------
// Scan
//---------------------------------------------------------------------

// Scans are structures that represent looking up eavs in the indexes.
// You specify a triple that they should look for which can have variables
// or constant values for e, a, or v that we'll attempt to solve for.
export class Scan {
  id: number;
  // array representation of the eav
  eav: any[];
  // a "bitmap" for what variables this scan is solving for
  // we use index as the key and the variable as the value
  vars: Variable[];
  // blown out eav for convenience
  e: any;
  a: any;
  v: any;
  node: any;
  proposalObject: Proposal;
  resolved: any[];
  scopes: string[];

  constructor(e,a,v,node?,scopes?) {
    this.id = nextId();
    this.resolved = [];
    this.eav = [e,a,v,node];
    this.e = e;
    this.a = a;
    this.v = v;
    this.node = node;
    this.proposalObject = {providing: null, index: [], cardinality: 0};
    this.scopes = scopes || ["session"];

    // check if any of the supplied params are variables and store them
    this.vars = [];
    for(let register of this.eav) {
      if(isVariable(register)) {
        this.vars[register.id] = register;
      }
    }
  }

  // Return an array of the current values for all the registers
  resolve(prefix) {
    let resolved = this.resolved;
    resolved[0] = toValue(this.e, prefix);
    resolved[1] = toValue(this.a, prefix);
    resolved[2] = toValue(this.v, prefix);
    resolved[3] = toValue(this.node, prefix);
    return resolved;
  }

  _getProposal(index, a, b, bToProvide, cToProvide, scopeIx) {
    let proposal = this.proposalObject;
    let abIx, bIx;
    if(a !== undefined && (abIx = index.index[a])) {
      if(b !== undefined && (bIx = abIx.index[b])) {
        proposal.providing = cToProvide;
        proposal.index[scopeIx] = bIx.index;
        proposal.indexType = "final";
        proposal.cardinality += bIx.cardinality;
        return true;
      }
      // we only have a proposal if there's no a, because if there is an a that just means we didn't
      // find it in the index and we have nothing to offer.
      if(b === undefined) {
        proposal.providing = bToProvide;
        proposal.index[scopeIx] = abIx.index;
        proposal.cardinality += abIx.cardinality;
        return true;
      }
    }
    proposal.index[scopeIx] = undefined;
    return false;
  }

  // Given a resolved array of values for all the registers, find out which variable we could
  // make a proposal for, what index we'd use to get the values for it, and what the cardinality
  // of the proposal is.
  getProposal(multiIndex, resolved) {
    let [e,a,v,node] = resolved;
    let proposal = this.proposalObject;
    proposal.providing = this.e;
    proposal.cardinality = 0;
    let accepted, acceptedIndex, acceptedA, acceptedB, acceptedBToProvide, acceptedCToProvide;
    let scopeIx = 0;
    for(let scope of this.scopes) {
      let curIndex = multiIndex.getIndex(scope);
      if(e !== undefined && this._getProposal(curIndex.eavIndex, e, a, this.a, this.v, scopeIx)) {
        accepted = scope;
        acceptedIndex = "eavIndex";
        acceptedA = e;
        acceptedB = proposal.providing === this.v ? a : undefined;
        acceptedBToProvide = this.a;
        acceptedCToProvide = this.v;
        break;
      } else if(e === undefined && this._getProposal(curIndex.aveIndex, a, v, this.v, this.e, scopeIx)) {
        accepted = scope;
        acceptedIndex = "aveIndex";
        acceptedA = a;
        acceptedB = proposal.providing === this.e ? v : undefined;
        acceptedBToProvide = this.v;
        acceptedCToProvide = this.e;
        break;
      }
      scopeIx++;
    }
    if(accepted) {
      scopeIx = 0;
      for(let scope of this.scopes) {
        let curIndex = multiIndex.getIndex(scope);
        if(scope !== accepted) {
          this._getProposal(curIndex[acceptedIndex], acceptedA, acceptedB, acceptedBToProvide, acceptedCToProvide, scopeIx);
        }
        scopeIx++;
      }
    }
    return proposal;
  }

  // Return a proposal or nothing based on the currently solved prefix of variables.
  propose(tripleIndex, prefix) : Proposal | undefined {
    let resolved = this.resolve(prefix);
    let [e,a,v] = resolved;
    // if this scan is fully resolved, then there's no variable for us to propose
    if(e !== undefined && a !== undefined && v !== undefined) {
      return;
    }
    return this.getProposal(tripleIndex, resolved);
  }

  // Given a proposal, get the values for that proposal. There are two proposal types
  // for scans purely because of the way we wrote our indexes. Because JS will turn all
  // object keys into strings, we have to check if we're looking for real values. If we aren't
  // we can just return the string keys, otherwise we have to take the extra step of getting
  // all the actual values. If we didn't do this, we'd end up with strings instead of numbers
  // for things like someone's age.
  resolveProposal(proposal, prefix) {
    let values = [];
    let indexes = proposal.index;
    if(indexes === undefined || indexes.length == 0) {
      return values;
    }
    let ix = 0;
    for(let index of indexes) {
      if(index === undefined) continue;
      let keys = Object.keys(index);
      // otherwise we pull out the values, making sure to skip our cardinality keys
      let node = this.node;
      if(proposal.indexType === "final" && node !== undefined) {
        for(let key of keys) {
          let value = index[key];
          if(value.index && value.index[this.node]) {
            values[ix] = value.value;
            ix++;
          }
        }
      } else {
        for(let key of keys) {
          let value = index[key];
          values[ix] = value.value === undefined ? value : value.value;
          ix++;
        }
      }
    }
    return values;
  }

  // Given a prefix and a variable that we're solving for, we check if we agree with the
  // current set of values. If this scan is completely resolved, we check for the presence
  // of the value given all the filled variables. If not, we check if there's an index that
  // could provide us the rest of it.
  accept(multiIndex: MultiIndex, prefix, solvingFor, force?) {
    // we only need to check if we're solving for a variable that is actually part of our
    // scan
    if(!force && !this.vars[solvingFor.id]) return true;
    let resolved = this.resolve(prefix);
    let [e,a,v,node] = resolved;
    // check if we're fully resolved and if so lookup to see if we accept
    if(e !== undefined && a !== undefined && v !== undefined) {
      if(this.node !== undefined) {
        //multidb
        return multiIndex.contains(this.scopes,e,a,v,node) !== undefined;
      }
      return multiIndex.contains(this.scopes,e,a,v) !== undefined;
    }
    // we can check if we get a proposal with a cardinality to determine if we can
    // accept this prefix. If we don't it means there are no values for the remaining
    // vars in the indexes.
    let proposal = this.getProposal(multiIndex, resolved);
    return proposal && proposal.cardinality > 0;
  }
}

// Convenience method for creating scans
export function scan(e,a,v,node?,scopes?) {
  return new Scan(e,a,v,node,scopes);
}

//---------------------------------------------------------------------
// Constraint
//---------------------------------------------------------------------

// Like Scan, Constraint is a structure that represents a constraint or function
// in our "queries". Constraints have both an array of args and an array of returns,
// either of which can contain variables or constants.
export abstract class Constraint {
  id: number;
  args: any[];
  returns: any[];
  proposalObject: Proposal;
  resolvedArgs: any[];
  resolvedReturns: any[];
  resolved: {args: any[], returns: any[]};
  // like in scan this is a "bitmap" of the variables this constraint
  // deals with. This includes vars from both args and returns.
  vars: Variable[];

  constructor(args: any[], returns: any[]) {
    this.id = nextId();
    this.args = args;
    this.returns = returns;
    this.proposalObject = {providing: null, cardinality: 0}
    this.resolvedArgs = [];
    this.resolvedReturns = [];
    this.resolved = {args: null, returns: null};
    this.vars = [];
    // capture our variables
    for(let register of this.args) {
      if(isVariable(register)) {
        this.vars[register.id] = register;
      }
    }
    for(let register of this.returns) {
      if(isVariable(register)) {
        this.vars[register.id] = register;
      }
    }
  }

  resolve(prefix) {
    let resolved = this.resolved;
    resolved.args = resolve(this.args, prefix, this.resolvedArgs);
    resolved.returns = resolve(this.returns, prefix, this.resolvedReturns);
    return resolved;
  }

  // In the case of a constraint, it only makes sense to propose an extension
  // to the prefix if either our args are fully resolved, but our returns aren't.
  // If that's the case, then our proposal will be to fill in our returns.
  propose(tripleIndex, prefix) {
    // if either our inputs aren't resolved or our returns are all filled
    // in, then we don't have anything to propose
    if(!fullyResolved(this.args, prefix)
       || fullyResolved(this.returns, prefix)) return;

     // find out which of our returns we could propose a value for
     let proposed;
     for(let ret of this.returns) {
       if(toValue(ret, prefix) === undefined) {
         proposed = ret;
         break;
       }
     }

     // Each implementation of a constraint has to provide what its potential
     // cardinality will be. Raw constraints like >, for example, will never
     // make a proposal, while something like + might return cardinality 1, and
     // split some approximation.
     return this.getProposal(tripleIndex, proposed, prefix);
  }

  // Constraints accept a prefix if either we're solving for something unrelated,
  // if their args aren't fully resolved yet (we can't compute yet!) or if their
  // returns aren't fully resolved (what would we check against?)
  accept(tripleIndex, prefix, solvingFor, force?) {
    if(!force &&
       !this.vars[solvingFor.id]
       || !fullyResolved(this.args, prefix)
       || !fullyResolved(this.returns, prefix)) return true;

     // otherwise we leave it to the constraint to implement an acceptance test
     return this.test(prefix);
  }

  // Given a variable to solve for and a prefix of solved variables, return
  // a proposal for that variable
  abstract getProposal(tripleIndex: TripleIndex, proposed: Variable, prefix: any) : Proposal | undefined;

  // Resolve a proposal you provided into the actual values for a variable
  abstract resolveProposal(proposal: Proposal, prefix: any[]) : any[];

  // Test if a prefix adheres to the constraint being implemented
  abstract test(prefix: any) : boolean;
}

//---------------------------------------------------------------------
// Some constraint implementations
//---------------------------------------------------------------------

// Concat strings together. Args expects a set of variables/string constants
// to concatenate together and an array with a single return variable
class Concat extends Constraint {
  // To resolve a proposal, we concatenate our resolved args
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [args.join("")];
  }

  // We accept a prefix if the return is equivalent to concatentating
  // all the args
  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return args.join("") === returns[0];
  }

  // concat always returns cardinality 1
  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}


abstract class BooleanOperation extends Constraint {
  // Greater than never proposes new values for a variable
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [this.compare(args[0], args[1])];
  }

  getProposal(tripleIndex, proposed, prefix) {
    if(this.returns.length) {
      let proposal = this.proposalObject;
      proposal.providing = proposed;
      proposal.cardinality = 1;
      return proposal;
    }
    return;
  }

  // We accept if our first resolved arg is greater than our
  // second
  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    let result = this.compare(args[0], args[1]);
    if(returns.length) {
      return result === returns[0];
    }
    return result;
  }

  abstract compare(a,b): boolean;
}

class Equal extends BooleanOperation {
  compare(a, b) { return a === b; }
}

class NotEqual extends BooleanOperation {
  compare(a, b) { return a !== b; }
}

class GreaterThan extends BooleanOperation {
  compare(a, b) { return a > b; }
}

class LessThan extends BooleanOperation {
  compare(a, b) { return a < b; }
}

class GreaterThanEqualTo extends BooleanOperation {
  compare(a, b) { return a >= b; }
}

class LessThanEqualTo extends BooleanOperation {
  compare(a, b) { return a <= b; }
}

class AssertValue extends Constraint {
  resolveProposal(proposal, prefix) {
    let {args, returns} = this.resolve(prefix);
    return [args[0]];
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return args[0] === returns[0];
  }

  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}

class And extends Constraint {
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    let result = true;
    for(let arg of args) {
      if(arg === false) {
        result = false;
        break;
      }
    }
    return [result];
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    let result = true;
    for(let arg of args) {
      if(arg === false) {
        result = false;
        break;
      }
    }
    return result === returns[0];
  }

  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}


class Or extends Constraint {
  // To resolve a proposal, we concatenate our resolved args
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    let result = false;
    for(let arg of args) {
      if(arg !== false) {
        result = true;
        break;
      }
    }
    return [result];
  }

  // We accept a prefix if the return is equivalent to concatentating
  // all the args
  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    let result = false;
    for(let arg of args) {
      if(arg !== false) {
        result = true;
        break;
      }
    }
    return result === returns[0];
  }

  // concat always returns cardinality 1
  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}

class Add extends Constraint {
  // Add proposes the addition of its args as its value for the
  // proposed variable.
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [args[0] + args[1]];
  }

  // Check if our return is equivalent to adding our args
  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return args[0] + args[1] === returns[0];
  }

  // Add always has a cardinality of 1
  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}

class Subtract extends Constraint {
  // subtract proposes the subtractition of its args as its value for the
  // proposed variable.
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [args[0] - args[1]];
  }

  // Check if our return is equivalent to subtracting our args
  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return args[0] - args[1] === returns[0];
  }

  // subtract always has a cardinality of 1
  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}

class Multiply extends Constraint {
  // multiply proposes the multiplyition of its args as its value for the
  // proposed variable.
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [args[0] * args[1]];
  }

  // Check if our return is equivalent to multiplying our args
  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return args[0] * args[1] === returns[0];
  }

  // multiply always has a cardinality of 1
  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}

class Divide extends Constraint {
  // divide proposes the divideition of its args as its value for the
  // proposed variable.
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [args[0] / args[1]];
  }

  // Check if our return is equivalent to divideing our args
  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return args[0] / args[1] === returns[0];
  }

  // divide always has a cardinality of 1
  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}

class Sin extends Constraint {
  static AttributeMapping = {
    "angle": 0,
  }
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [Math.sin(args[0] * (Math.PI / 180))];
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return Math.sin(args[0] * (Math.PI / 180)) === returns[0];
  }

  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}


class Mod extends Constraint {
  static AttributeMapping = {
    "value": 0,
    "by": 1,
  }
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [args[0] % args[1]];
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return args[0] % args[1] === returns[0];
  }

  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}

class Abs extends Constraint {
  static AttributeMapping = {
    "value": 0,
  }
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [Math.abs(args[0])];
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return Math.abs(args[0]) === returns[0];
  }

  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}

class Floor extends Constraint {
  static AttributeMapping = {
    "value": 0,
  }
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [Math.floor(args[0])];
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return Math.floor(args[0]) === returns[0];
  }

  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}

class Cos extends Constraint {
  static AttributeMapping = {
    "angle": 0,
  }
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [Math.cos(args[0] * (Math.PI / 180))];
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return Math.cos(args[0] * (Math.PI / 180)) === returns[0];
  }

  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}

class Toggle extends Constraint {
  static AttributeMapping = {
    "value": 0,
  }
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [!(args[0] === true)];
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return !(args[0] === true) === returns[0];
  }

  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}

class Split extends Constraint {
  static AttributeMapping = {
    "text": 0,
    "by": 1,
  }
  static ReturnMapping = {
    "token": 0,
    "index": 1,
  }

  returnType: "both" | "index" | "token";

  constructor(args: any[], returns: any[]) {
    super(args, returns);
    if(this.returns[1] !== undefined && this.returns[0] !== undefined) {
      this.returnType = "both"
    } else if(this.returns[1] !== undefined) {
      this.returnType = "index";
    } else {
      this.returnType = "token";
    }
  }

  resolveProposal(proposal, prefix) {
    let {returns} = this.resolve(prefix);
    let tokens = proposal.index;
    let results = tokens;
    if(this.returnType === "both") {
      results = [];
      let ix = 1;
      for(let token of tokens) {
        results.push([token, ix]);
        ix++;
      }
    } else if(this.returnType === "index") {
      results = [];
      let ix = 1;
      for(let token of tokens) {
        results.push(ix);
        ix++;
      }
    }
    return results;
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    // @TODO: this is expensive, we should probably try to cache the split somehow
    return args[0].split(args[1])[returns[1]] === returns[0];
  }

  getProposal(tripleIndex, proposed, prefix) {
    let {args} = this.resolve(prefix);
    let proposal = this.proposalObject;
    if(this.returnType === "both") {
      proposal.providing = [this.returns[0], this.returns[1]];
    } else if(this.returnType == "index") {
      proposal.providing = this.returns[1];
    } else {
      proposal.providing = this.returns[0];
    }
    proposal.index = args[0].split(args[1]);
    proposal.cardinality = proposal.index.length;
    return proposal;
  }
}

class Random extends Constraint {
  static AttributeMapping = {
    "seed": 0,
  }

  static cache = {};

  getRandom(seed) {
    let found = Random.cache[seed];
    if(found) return found;
    return Random.cache[seed] = Math.random();
  }

  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [this.getRandom(args[0])];
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return this.getRandom(args[0]) === returns[0];
  }

  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}

class GenerateId extends Constraint {
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [makeUUID(this.id, args)];
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return returns[0] === makeUUID(this.id, args);
  }

  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}

export abstract class Aggregate extends Constraint {
  static isAggregate = true;
  static AttributeMapping = {
    "value": 0,
    "given": 1,
    "per": 2,
  }

  projectionVars: any[];
  groupVars: any[];
  resolvedGroup: any[];
  resolvedProjection: any[];
  resolvedAggregate: {group: any[], projection: any[], value: any};
  aggregateResults: any;
  value: any;

  constructor(args: any[], returns: any[]) {
    super(args, returns);
    let [value, given, per] = args;
    if(given === undefined) {
      this.projectionVars = [];
    } else if(isVariable(given)) {
      this.projectionVars = [given];
    } else {
      this.projectionVars = given;
    }
    if(per === undefined) {
      this.groupVars = [];
    } else if(isVariable(per)) {
      this.groupVars = [per];
    } else {
      this.groupVars = per;
    }
    this.value = value;
    this.resolvedGroup = [];
    this.resolvedProjection = [];
    this.resolvedAggregate = {group: this.resolvedGroup, projection: this.resolvedProjection, value: undefined};
    this.aggregateResults = {};
  }

  resolveAggregate(prefix) {
    resolve(this.projectionVars, prefix, this.resolvedProjection)
    resolve(this.groupVars, prefix, this.resolvedGroup)
    let resolved = this.resolvedAggregate;
    resolved.value = toValue(this.value, prefix);
    return resolved;
  }

  aggregate(rows: any[]) {
    let groups = {};
    for(let row of rows) {
      let {group, projection, value} = this.resolveAggregate(row);
      let groupKey = "[]";
      if(group.length !== 0) {
        groupKey = JSON.stringify(group);
      }
      let groupValues = groups[groupKey];
      if(groupValues === undefined) {
        groupValues = groups[groupKey] = {};
      }
      let projectionKey = JSON.stringify(projection);
      if(groupValues[projectionKey] === undefined) {
        groupValues[projectionKey] = true;
        this.adjustAggregate(groupValues, value);
      }
    }
    this.aggregateResults = groups;
    return groups;
  }

  resolveProposal(proposal, prefix) {
    if(proposal.index) {
      return [proposal.index.result];
    }
    return [];
  }

  test(prefix) {
    let {group} = this.resolveAggregate(prefix);
    let resultGroup = this.aggregateResults[JSON.stringify(group)];
    if(resultGroup !== undefined) {
      let returns = resolve(this.returns, prefix, this.resolvedReturns);
      return returns[0] === resultGroup.result;
    }
  }

  getProposal(multiIndex, proposed, prefix) {
    let {group} = this.resolveAggregate(prefix);
    let resultGroup = this.aggregateResults[JSON.stringify(group)];
    let proposal = this.proposalObject;
    if(resultGroup) {
      proposal.index = resultGroup
      proposal.providing = proposed;
      proposal.cardinality = 1;
    } else {
      proposal.index = undefined;
      proposal.providing = proposed;
      proposal.cardinality = 0;
    }
    return proposal;
  }

  abstract adjustAggregate(group, value): any;
}

export class Sum extends Aggregate {
  adjustAggregate(group, value) {
    if(group.result === undefined) {
      group.result = value;
    } else {
      group.result += value;
    }
    return group.result;
  }
}

export class Count extends Aggregate {
  adjustAggregate(group, value) {
    if(group.result === undefined) {
      group.result = 1;
    } else {
      group.result += 1;
    }
    return group.result;
  }
}

export class Average extends Aggregate {
  adjustAggregate(group, value) {
    if(group.count === undefined) {
      group.count = 1;
      group.sum = value;
      group.result = group.sum / group.count;
    } else {
      group.count += 1;
      group.sum += value;
      group.result = group.sum / group.count;
    }
    return group.result;
  }
}

export var ExpressionImplementations = {
  "+": Add,
  "-": Subtract,
  "*": Multiply,
  "/": Divide,
  "concat": Concat,
  ">": GreaterThan,
  "<": LessThan,
  ">=": GreaterThanEqualTo,
  "<=": LessThanEqualTo,
  "!=": NotEqual,
  "=": Equal,
  "and": And,
  "or": Or,
  "sin": Sin,
  "cos": Cos,
  "floor": Floor,
  "abs": Abs,
  "mod": Mod,
  "toggle": Toggle,
  "random": Random,
  "generateId": GenerateId,
  "sum": Sum,
  "count": Count,
  "average": Average,
  "mean": Average,
  "split": Split,
}

//---------------------------------------------------------------------
// NotScan
//---------------------------------------------------------------------

export class NotScan {
  strata: BlockStratum[];
  vars: Variable[];
  args: Variable[];
  internalVars: Variable[];
  resolved: any[];

  constructor(args: Variable[], strata: BlockStratum[]) {
    this.strata = strata;
    this.resolved = [];
    let blockVars = [];
    scansToVars(strata, blockVars);
    this.vars = args;
    this.args = args;
    this.internalVars = blockVars;
  }

  resolve(prefix) {
    return resolve(this.args, prefix, this.resolved);
  }

  propose() { return; }
  resolveProposal() { throw new Error("Resolving a not proposal"); }

  accept(multiIndex: MultiIndex, prefix, solvingFor, force?) {
    if(!force && !this.internalVars[solvingFor.id] || !fullyResolved(this.args, prefix)) return true;
    let resolved = this.resolve(prefix);
    let notPrefix = [];
    let ix = 0;
    for(let arg of this.args) {
      notPrefix[arg.id] = resolved[ix];
      ix++;
    }
    // console.log("checking not", notPrefix, this.internalVars);
    let results = [notPrefix];
    if(this.strata.length === 1) {
      results = this.strata[0].execute(multiIndex, results, {single: true});
    } else {
      for(let stratum of this.strata) {
        results = stratum.execute(multiIndex, results);
        if(results.length === 0) break;
      }
    }
    // console.log("checked not!", results.length);
    return !results.length;
  }

}

//---------------------------------------------------------------------
// IfScan
//---------------------------------------------------------------------

export class IfBranch {
  outputs: any[];
  strata: BlockStratum[];
  prefix: any[];
  variables: any[];
  exclusive: boolean;
  constantReturn: boolean;
  constructor(strata: BlockStratum[], outputs: any[], exclusive?: boolean) {
    this.strata = strata;
    this.outputs = outputs;
    this.exclusive = exclusive;
    this.variables = [];
    this.constantReturn = true;
    scansToVars(strata, this.variables);
    for(let output of outputs) {
      if(isVariable(output)) {
        this.constantReturn = false;
        this.variables[output.id] = output;
      }
    }
    this.prefix = [];
  }
  resolve(prefix) {
    return resolve(this.variables, prefix, this.prefix);
  }

  execute(multiIndex: MultiIndex, result) {
    if(this.constantReturn && this.strata.length === 1) {
      result = this.strata[0].execute(multiIndex, result, {single: true});
    } else {
      for(let stratum of this.strata) {
        result = stratum.execute(multiIndex, result);
        if(result.length === 0) break;
      }
    }
    return result;
  }
}

export class IfScan implements ProposalProvider {
  branches: IfBranch[];
  vars: Variable[];
  args: Variable[];
  outputs: Variable[];
  internalVars: Variable[];
  resolved: any[];
  exclusive: boolean;
  hasAggregate: boolean;
  proposalObject: Proposal;

  constructor(args: Variable[], outputs: Variable[], branches: IfBranch[], hasAggregate = false) {
    this.branches = branches;
    this.outputs = outputs;
    this.hasAggregate = hasAggregate;
    this.resolved = [];
    let blockVars = [];
    for(let branch of branches) {
      if(branch.exclusive) this.exclusive = true;
      scansToVars(branch.strata, blockVars);
    }
    this.vars = args.slice();
    for(let output of outputs) {
      if(output !== undefined) {
        this.vars[output.id] = output;
      }
    }
    this.args = args;
    this.internalVars = blockVars;
    this.proposalObject = {providing: null, index: null, cardinality: 0};
  }

  resolve(prefix) {
    return resolve(this.args, prefix, this.resolved);
  }

  getProposal(multiIndex: MultiIndex, proposed, proposedIx, prefix) {
    let proposalValues = [];
    let cardinality = 0;
    let outputs = this.outputs;
    let projection = {};
    for(let branch of this.branches) {
      let branchPrefix = branch.resolve(prefix);
      let result = [branchPrefix];
      result = branch.execute(multiIndex, result);
      if(result.length) {
        for(let row of result) {
          let outputRow = [];
          for(let output of branch.outputs) {
            let value = toValue(output, row);
            outputRow.push(value);
          }
          let key = outputRow.join("|");
          if(projection[key] === undefined) {
            projection[key] = true;
            proposalValues.push(outputRow);
            cardinality++;
          }
        }
        if(this.exclusive) break;
      }
    }
    let proposal = this.proposalObject;
    proposal.providing = this.outputs;
    proposal.index = proposalValues;
    proposal.cardinality = cardinality;
    return proposal;
  }

  propose(multiIndex: MultiIndex, prefix) {
    // if either our inputs aren't resolved or our outputs are all filled
    // in, then we don't have anything to propose
    if(!fullyResolved(this.args, prefix)
       || fullyResolved(this.outputs, prefix)) return;

     // find out which of our outputs we could propose a value for
     let proposed;
     let proposedIx = 0;
     for(let ret of this.outputs) {
       if(toValue(ret, prefix) === undefined) {
         proposed = ret;
         break;
       }
       proposedIx++;
     }

     return this.getProposal(multiIndex, proposed, proposedIx, prefix);
  }
  resolveProposal(proposal, prefix) {
    return proposal.index;
  }

  accept(multiIndex: MultiIndex, prefix, solvingFor, force?) {
    if(!force && !this.internalVars[solvingFor.id] || !fullyResolved(this.args, prefix)) return true;
    let resolved = this.resolve(prefix);
    for(let branch of this.branches) {
      let branchPrefix = branch.resolve(prefix);
      let accepted = true;
      for(let stratum of branch.strata) {
        let result = preJoinAccept(multiIndex, stratum.scans, stratum.vars, branchPrefix);
        accepted = result.accepted;
        if(!accepted) break;
      }
      if(accepted) return true;
    }
    return false;
  }

}

//---------------------------------------------------------------------
// Generic Join
//---------------------------------------------------------------------

// Generic join functions by going through proposals for each variable being
// solved for. This happens in "rounds" where we solve an individual variable
// at a time. Unlike most join algorithms, no ordering is fixed here. Instead,
// proposals are issued and the best, based on lowest cardinality, is selected
// and used as the current variable to solve for. It's important to note that this
// happens based on the values of the currently solved "prefix" - a partially filled
// row of values - which means that generic join chooses an order for each unique
// set of values it comes into contact with. This implementation uses recursion to
// do subsequent rounds for a given prefix and only allocates a row when a fully
// validated result has been found.
//
// A join round takes a set of providers, the current prefix, how many rounds are remaining,
// and an array to hold accepted rows.
function joinRound(multiIndex: MultiIndex, providers: ProposalProvider[], prefix: any[], rounds: number, rows: any[], options: any) {
  // To start out we need to find the best proposal given the providers we have. We'll
  // start our bestProposal out at some horrible cardinality
  let bestProposal: Proposal = {providing: undefined, cardinality: Infinity};
  let bestProvider;
  // Walk through the providers and ask for proposals
  for(let provider of providers) {
    let proposed = provider.propose(multiIndex, prefix);
    // if we've found a lower cardinality, we want to keep track of that provider
    if(proposed !== undefined && proposed.cardinality < bestProposal.cardinality) {
      bestProposal = proposed;
      bestProvider = provider;
    }
  }

  // console.log("Best provider", rounds, bestProvider, bestProposal);
  // if we never found a provider that means we have no more valid solutions
  // and we have nothing more to do
  if(bestProvider === undefined) return;

  // Otherwise, we ask the provider to resolve their proposal into values that
  // we then need to see if the other providers accept.
  let values = bestProvider.resolveProposal(bestProposal, prefix);
  let providing:any = bestProposal.providing;
  let providingOne = providing.constructor !== Array;
  if(providingOne) {
    providing = [providing];
  }
  let providingLength = providing.length;
  for(let value of values) {
    // Set the current value in our prefix of solved variables
    let providingIx = 0;
    for(let currentProvide of providing) {
      if(providingOne) {
        prefix[currentProvide.id] = value;
      } else {
        prefix[currentProvide.id] = value[providingIx];
      }
      providingIx++;
    }
    // Unless someone tells us otherwise, we'll assume that we can accept
    // this proposal and continue solving
    let accepted = true;
    for(let provider of providers) {
      // we don't need to check this prefix against ourselves since we're the ones
      // who proposed it
      if(provider !== bestProvider) {
        for(let currentProvide of providing) {
          if(!provider.accept(multiIndex, prefix, currentProvide)) {
            // console.log("bailing", provider);
            accepted = false;
            break;
          }
        }
      }
    }

    // if we accepted this prefix and we're not on our final round, then
    // we continue on to the next round by recursing with this prefix
    if(accepted && rounds - providingLength > 0) {
      joinRound(multiIndex, providers, prefix, rounds - providingLength, rows, options);
    } else if(accepted) {
      // otherwise if we're accepted, we have a valid result and we add it
      // to our list of rows
      rows.push(prefix.slice());
    }
    // if we are only looking for a single result, e.g. for a NotScan, and we have
    // a row, bail out of the evaluation
    if(options.single && rows.length) return;
    // since we're using the same prefix in our recursions, we have to clean
    // up after ourselves so that parent rounds don't see our solved variables
    // in their prefix.
    for(let currentProvide of providing) {
      prefix[currentProvide.id] = undefined;
    }
  }
}

function preJoinAccept(multiIndex: MultiIndex, providers : ProposalProvider[], vars : Variable[], prefix: any[] = []) {
  let ix = 0;
  let presolved = 0;
  for(let value of prefix) {
    let solvingFor = vars[ix];
    if(value !== undefined && vars[ix] !== undefined) {
      presolved++;
      for(let provider of providers) {
        if(!provider.accept(multiIndex, prefix, solvingFor)) {
          return {accepted: false, presolved};
        }
      }
    }
    ix++;
  }
  return {accepted: true, presolved};
}

interface JoinOptions {
  single?: boolean,
  acceptOnly?: boolean,
  rows?: any[]
}

// Convenient function to kick off a join. We only care about vars here
// to determine how may rounds of generic join we need to do. Since we solve
// for one variable each round, it's the number of vars in the query.
function join(multiIndex: MultiIndex, providers : ProposalProvider[], vars : Variable[], prefix: any[] = [], options: JoinOptions = {}) {
  let rows = options.rows || [];
  let {presolved, accepted} = preJoinAccept(multiIndex, providers, vars, prefix);
  if(!accepted) return rows;
  let rounds = 0;
  for(let variable of vars) {
    if(variable !== undefined) rounds++;
  }
  rounds = rounds - presolved;
  if(presolved > 0 && rounds === 0) {
    rows.push(prefix.slice());
  } else if(rounds === 0) {
    for(let provider of providers) {
      if(!provider.accept(multiIndex, prefix, null, true)) {
        return rows;
      }
    }
    rows.push(prefix.slice());
  } else {
    joinRound(multiIndex, providers, prefix, rounds, rows, options);
  }
  return rows;
}

//---------------------------------------------------------------------
// Actions
//---------------------------------------------------------------------

abstract class Action {
  id: number;
  e: any;
  a: any;
  v: any;
  node: string;
  vars: Variable[];
  resolved: any[];
  scopes: string[];
  constructor(e,a,v,node?,scopes?) {
    this.id = nextId();
    this.resolved = [];
    let eav = [e,a,v];
    this.e = e;
    this.a = a;
    this.v = v;
    this.node = node || this.id;
    this.vars = [];
    this.scopes = scopes || ["session"];
    for(let register of eav) {
      if(isVariable(register)) {
        this.vars[register.id] = register;
      }
    }
  }

  // Return an array of the current values for all the registers
  resolve(prefix) {
    let resolved = this.resolved;
    resolved[0] = toValue(this.e, prefix);
    resolved[1] = toValue(this.a, prefix);
    resolved[2] = toValue(this.v, prefix);
    return resolved;
  }

  abstract execute(multiIndex: MultiIndex, row: any, changes: Changes);
}

export class InsertAction extends Action {
  execute(multiIndex, row, changes) {
    let [e,a,v] = this.resolve(row);
    for(let scope of this.scopes) {
      changes.store(scope,e,a,v,this.node);
    }
  }
}

export class RemoveAction extends Action {
  execute(multiIndex, row, changes) {
    let [e,a,v] = this.resolve(row);
    for(let scope of this.scopes) {
      changes.unstore(scope,e,a,v);
    }
  }
}

export class RemoveSupportAction extends Action {
  execute(multiIndex, row, changes) {
    let [e,a,v] = this.resolve(row);
    // console.log("removing support for", e,a,v, this.node);
    for(let scope of this.scopes) {
      changes.unstore(scope,e,a,v,this.node);
    }
  }
}

export class EraseAction extends Action {
  removeVs(index, changes, scope, e, a) {
    let keys = Object.keys(index);
    for(let key of keys) {
      let value = index[key].value;
      changes.unstore(scope,e,a,value);
    }
  }
  execute(multiIndex, row, changes) {
    let [e,a] = this.resolve(row);
    // multidb
    for(let scope of this.scopes) {
      let avIndex = multiIndex.getIndex(scope).lookup(e,undefined,undefined);
      if(avIndex !== undefined) {
        if(a !== undefined) {
          let level = avIndex.index[a];
          if(level) {
            this.removeVs(level.index, changes, scope, e, level.value);
          }
        } else {
          let keys = Object.keys(avIndex.index);
          for(let key of keys) {
            let level = avIndex.index[key];
            this.removeVs(level.index, changes, scope, e, level.value);
          }
        }
      }
    }
  }
}

export class SetAction extends Action {
  execute(multiIndex, row, changes) {
    let [e,a,v] = this.resolve(row);
    // multidb
    for(let scope of this.scopes) {
      let curIndex = multiIndex.getIndex(scope);
      let vIndex = curIndex.lookup(e,a,undefined);
      if(vIndex !== undefined) {
        let keys = Object.keys(vIndex.index);
        for(let key of keys) {
          let value = vIndex.index[key].value;
          if(value !== v) {
            changes.unstore(scope,e,a,value);
          }
        }
      }
      changes.store(scope,e,a,v,this.node);
    }
  }
}

export var ActionImplementations = {
  ":=": SetAction,
  "+=": InsertAction,
  "-=": RemoveAction,
  "erase": EraseAction,
}

function executeActions(multiIndex: MultiIndex, actions: Action[], rows: any[], changes: Changes, capture = false) {
  if(capture) {
    changes.capture();
  }
  for(let row of rows) {
    for(let action of actions) {
      action.execute(multiIndex, row, changes);
    }
  }
  if(capture) {
    return changes.captureEnd();
  }
}

//---------------------------------------------------------------------
// Changes
//---------------------------------------------------------------------

const ADDED = 1;
const REMOVED = 2;
const ADDED_REMOVED = 3;

class ChangesIndex {
  pos: number;
  positions: any;
  info: any[];
  constructor() {
    this.positions = {};
    this.info = [];
    this.pos = 0;
  }

  store(scope,e,a,v,node,key?) {
    let start = perf.time()
    key = key || `${scope}|${e}|${a}|${v}|${node}`;
    let keyPos = this.positions[key];
    let info = this.info;
    if(keyPos === undefined) {
      let pos = this.pos;
      this.positions[key] = pos;
      info[pos] = ADDED;
      info[pos + 1] = e;
      info[pos + 2] = a;
      info[pos + 3] = v;
      info[pos + 4] = node;
      info[pos + 5] = scope;
      this.pos += 6;
    } else if(info[keyPos] === REMOVED) {
      info[keyPos] = ADDED_REMOVED;
    }
    perf.store(start);
    return key;
  }
  unstore(scope,e,a,v,node,key?) {
    key = key || `${scope}|${e}|${a}|${v}|${node}`;
    let keyPos = this.positions[key];
    let info = this.info;
    if(keyPos === undefined) {
      let pos = this.pos;
      this.positions[key] = pos;
      info[pos] = REMOVED;
      info[pos + 1] = e;
      info[pos + 2] = a;
      info[pos + 3] = v;
      info[pos + 4] = node;
      info[pos + 5] = scope;
      this.pos += 6;
    } else if(info[keyPos] === ADDED) {
      info[keyPos] = ADDED_REMOVED;
    }
    return key;
  }

  inc(scope, e,a,v,node,key?) {
    key = key || `${scope}|${e}|${a}|${v}|${node}`;
    let keyPos = this.positions[key];
    let info = this.info;
    if(keyPos === undefined) {
      let pos = this.pos;
      this.positions[key] = pos;
      info[pos] = 1;
      info[pos + 1] = e;
      info[pos + 2] = a;
      info[pos + 3] = v;
      info[pos + 4] = node;
      info[pos + 5] = scope;
      this.pos += 6;
    } else {
      info[keyPos] += 1;
    }
    return key;
  }
  dec(scope,e,a,v,node,key?) {
    key = key || `${scope}|${e}|${a}|${v}|${node}`;
    let keyPos = this.positions[key];
    let info = this.info;
    if(keyPos === undefined) {
      let pos = this.pos;
      this.positions[key] = pos;
      info[pos] = -1;
      info[pos + 1] = e;
      info[pos + 2] = a;
      info[pos + 3] = v;
      info[pos + 4] = node;
      info[pos + 5] = scope;
      this.pos += 6;
    } else {
      info[keyPos] -= 1;
    }
    return key;
  }
}

class Changes {
  round: number;
  changed: boolean;
  index: MultiIndex;
  changes: any[];
  finalChanges: ChangesIndex;
  capturedChanges: any;

  constructor(index: MultiIndex) {
    this.index = index;
    this.round = 0;
    this.changed = false;
    this.changes = [new ChangesIndex()];
    this.finalChanges = new ChangesIndex();
  }

  capture() {
    this.capturedChanges = new ChangesIndex();
  }

  captureEnd() {
    let cur = this.capturedChanges;
    this.capturedChanges = undefined;
    return cur;
  }

  store(scope, e,a,v,node?) {
    // console.log("STORING", e, a, v, node, this.index.lookup(e,a,v,node) === undefined);
    let key = this.changes[this.round].store(scope,e,a,v,node);
    let captured = this.capturedChanges;
    if(captured !== undefined) {
      captured.store(scope,e,a,v,node,key);
    }
  }

  unstore(scope, e,a,v,node?) {
    // console.log("REMOVING", e, a, v, node, this.index.lookup(e,a,v,node) === undefined);
    if(node === undefined) {
      //multidb
      let level = this.index.getIndex(scope).lookup(e,a,v);
      if(level) {
        let index = level.index;
        for(let key of Object.keys(index)) {
          let nodeValue = index[key];
          this.unstore(scope,e,a,v,nodeValue);
        }
      }
    } else {
      let key = this.changes[this.round].unstore(scope,e,a,v,node);
      let captured = this.capturedChanges;
      if(captured !== undefined) {
        captured.unstore(scope, e,a,v,node,key);
      }
    }
  }

  commit() {
    let final = this.finalChanges;
    let changes = this.changes[this.round];
    let {info, positions} = changes;
    let keys = Object.keys(positions);
    let multiIndex = this.index;
    let committed = [];
    let committedIx = 0;
    for(let key of keys) {
      let pos = positions[key];
      let mult = info[pos];
      if(mult === ADDED_REMOVED) {
        continue;
      }
      let e = info[pos + 1];
      let a = info[pos + 2];
      let v = info[pos + 3];
      let node = info[pos + 4];
      let scope = info[pos + 5];
      let curIndex = multiIndex.getIndex(scope);
      if(mult === REMOVED && curIndex.lookup(e,a,v,node) !== undefined) {
        this.changed = true;
        curIndex.unstore(e,a,v,node);
        final.dec(scope,e,a,v,node,key);
        committed[committedIx] = REMOVED;
        committed[committedIx+1] = e;
        committed[committedIx+2] = a;
        committed[committedIx+3] = v;
        committed[committedIx+4] = scope;
        committedIx += 5;
      } else if(mult === ADDED && curIndex.lookup(e,a,v,node) === undefined) {
        this.changed = true;
        curIndex.store(e,a,v,node);
        final.inc(scope,e,a,v,node,key);
        committed[committedIx] = ADDED;
        committed[committedIx+1] = e;
        committed[committedIx+2] = a;
        committed[committedIx+3] = v;
        committed[committedIx+4] = scope;
        committedIx += 5;
      }
    }
    return committed;
  }

  nextRound() {
    this.round++;
    this.changed = false;
    this.changes[this.round] = new ChangesIndex();
  }

  result(scopeLookup?: Object) {
    let insert = [];
    let remove = [];
    let {positions, info} = this.finalChanges;
    let indexes = this.index.indexes;
    let keys = Object.keys(positions);
    for(let key of keys) {
      let pos = positions[key];
      let count = info[pos];
      let e = info[pos + 1];
      let a = info[pos + 2];
      let v = info[pos + 3];
      let scope = info[pos + 5];
      if(scopeLookup === undefined || scopeLookup[scope]) {
        if(count < 0 && indexes[scope].lookup(e,a,v) === undefined) {
          remove.push([e,a,v]);
        } else if(count > 0 && indexes[scope].lookup(e,a,v) !== undefined) {
          insert.push([e,a,v]);
        }
      }
    }
    return {type: "result", insert, remove};
  }
}

//---------------------------------------------------------------------
// Block
//---------------------------------------------------------------------

function hasDatabaseScan(strata) {
  for(let stratum of strata) {
    for(let scan of stratum.scans) {
      if(scan instanceof Scan) return true;
      if(scan instanceof IfScan) return true;
      if(scan instanceof NotScan) return true;
    }
  }
  return false;
}

function scansToVars(scans, output = []) {
  for(let scan of scans) {
    for(let variable of scan.vars) {
      if(variable) {
        output[variable.id] = variable;
      }
    }
  }
  return output;
}

export class BlockStratum {
  scans: ProposalProvider[];
  aggregates: Aggregate[];
  vars: Variable[];
  constructor(scans, aggregates = []) {
    this.scans = scans;
    this.aggregates = aggregates;
    let vars = [];
    scansToVars(scans, vars);
    this.vars = vars;
  }

  execute(multiIndex: MultiIndex, rows: any[], options: JoinOptions = {}) {
    let results = [];
    for(let aggregate of this.aggregates) {
      aggregate.aggregate(rows);
    }
    for(let row of rows) {
      options.rows = results;
      results = join(multiIndex, this.scans, this.vars, row, options);
    }
    return results;
  }
}

export class Block {
  id: number;
  strata: BlockStratum[];
  commitActions: Action[];
  bindActions: Action[];
  name: string;
  vars: Variable[];
  solvingVars: Variable[];
  dormant: boolean;
  singleRun: boolean;
  prevInserts: ChangesIndex;
  checker: DependencyChecker;

  constructor(name: string, strata: BlockStratum[], commitActions: Action[], bindActions: Action[]) {
    this.id = nextId();
    this.name = name;
    this.strata = strata;
    this.commitActions = commitActions;
    this.bindActions = bindActions;

    this.dormant = false;
    if(!hasDatabaseScan(strata)) {
      this.singleRun = true;
    }

    let blockVars = [];
    scansToVars(strata, blockVars);
    scansToVars(commitActions, blockVars);
    scansToVars(bindActions, blockVars);

    this.vars = blockVars;
    this.prevInserts = new ChangesIndex();
    this.checker = new DependencyChecker(this);
  }

  execute(multiIndex: MultiIndex, changes: Changes) {
    if(this.dormant) {
      return changes;
    } else if(this.singleRun) {
      this.dormant = true;
    }
    // console.groupCollapsed(this.name);
    // console.log("--- " + this.name + " --------------------------------");
    let start = perf.time();
    let results = [[]];
    for(let stratum of this.strata) {
      results = stratum.execute(multiIndex, results);
      if(results.length === 0) break;
    }
    // console.log("results :: ", time(start));
    // console.log(" >>> RESULTS")
    // console.log(results);
    // console.log(" <<<< RESULTS")
    if(this.commitActions.length !== 0) {
      executeActions(multiIndex, this.commitActions, results, changes);
    }

    if(this.bindActions.length !== 0) {
      let start = perf.time();
      let diff = executeActions(multiIndex, this.bindActions, results, changes, true);
      let newPositions = diff.positions;
      let newInfo = diff.info;
      let {positions, info} = this.prevInserts;
      for(let key of Object.keys(positions)) {
        let pos = positions[key];
        // if this was added
        if(info[pos] === ADDED) {
          let neuePos = newPositions[key];
          // and it wasn't added in this one, we need to remove it
          if(newInfo[neuePos] !== ADDED) {
            let e = info[pos + 1];
            let a = info[pos + 2];
            let v = info[pos + 3];
            let node = info[pos + 4];
            let scope = info[pos + 5];
            changes.unstore(scope,e,a,v,node);
          }
        }
      }
      this.prevInserts = diff;
    }

    // console.log(changes);
    // console.groupEnd();
    return changes;
  }
}

//---------------------------------------------------------------------
// Setups
//---------------------------------------------------------------------

abstract class Setup {
  abstract setup(evaluation: Evaluation);
  abstract close();
}

class TimeSetup extends Setup {

  static attributeOrdering = ["year", "month", "day", "hours", "minutes", "seconds", "frames"];
  static updateIntervals = {
    "year": 1000 * 60 * 60,
    "month": 1000 * 60 * 60,
    "day": 1000 * 60 * 60,
    "hours": 1000 * 60 * 60,
    "minutes": 1000 * 60,
    "seconds": 1000,
    "frames": 16,
  };

  timeout: any;
  interval: number;
  frames: number;
  constructor(record) {
    super();
    let max = -1;
    let interval = TimeSetup.updateIntervals["year"];
    for(let attribute of record.attributes) {
      let attr = attribute.attribute;
      let index = TimeSetup.attributeOrdering.indexOf(attr)
      if(index > max) {
        max = index;
        interval = TimeSetup.updateIntervals[attr];
      }
    }
    this.interval = interval;
    this.frames = 0;
  }

  timeActions() {
    let time = new Date();
    this.frames++;
    return [
      new InsertAction("time", "tag", "time"),
      new SetAction("time", "hours", time.getHours() % 12),
      new SetAction("time", "minutes", time.getMinutes()),
      new SetAction("time", "seconds", time.getSeconds()),
      new SetAction("time", "frames", this.frames),
    ];
  }

  setup(evaluation: Evaluation) {
    let self = this;
    evaluation.executeActions(this.timeActions());
    this.timeout = setInterval(function() {
      evaluation.executeActions(self.timeActions());
    }, this.interval);
  }

  close() {
    clearTimeout(this.timeout);
  }
}

export var SetupTags = {
  "time": TimeSetup,
}

//---------------------------------------------------------------------
// Database
//---------------------------------------------------------------------

class Database {
  blocks: Block[];
  watchers: Watcher[];
}

//---------------------------------------------------------------------
// Watcher
//---------------------------------------------------------------------

interface Watcher {
  handle(changes: Changes): void;
}

//---------------------------------------------------------------------
// Evaluation
//---------------------------------------------------------------------

export class Evaluation {
  blocks: Block[];
  setups: Setup[];
  client: any;
  multiIndex: MultiIndex;
  constructor(client, blocks, setups, index?) {
    this.blocks = blocks;
    this.setups = setups;
    this.client = client;
    this.multiIndex = index || new MultiIndex();
    this.multiIndex.register("session");
    for(let setup of setups) {
      setup.setup(this);
    }
  }

  blocksFromCommit(commit) {
    let start = perf.time();
    let blocks = [];
    let index = this.multiIndex;
    for(let block of this.blocks) {
      if(block.dormant) continue;
      let checker = block.checker;
      for(let ix = 0, len = commit.length; ix < len; ix += 5) {
        let change = commit[ix];
        let e = commit[ix + 1];
        let a = commit[ix + 2];
        let v = commit[ix + 3];
        if(checker.check(index, change, e, a, v)) {
          blocks.push(block);
          break;
        }
      }
    }
    perf.blockCheck(start);
    // console.log("executing blocks", blocks.map((x) => x));
    return blocks;
  }

  executeActions(actions: Action[]) {
    let changes = new Changes(this.multiIndex);
    for(let action of actions) {
      action.execute(this.multiIndex, [], changes);
    }
    let committed = changes.commit();
    return this.fixpoint(changes, this.blocksFromCommit(committed));
  }

  fixpoint(changes = new Changes(this.multiIndex), blocks = this.blocks) {
    let start = time();
    changes.changed = true;
    while(changes.changed && changes.round < 10) {
      changes.nextRound();
      // console.groupCollapsed("Round" + changes.round);
      for(let block of blocks) {
        let start = perf.time();
        block.execute(this.multiIndex, changes);
        perf.block(block.name, start);
      }
      // console.log(changes);
      let commit = changes.commit();
      blocks = this.blocksFromCommit(commit);
      // console.groupEnd();
    }
    console.log("TOTAL ROUNDS", changes.round, time(start));
    let result = changes.result();
    perf.fixpoint(start);
    // console.log(changes);
    // console.log("result", result);
    start = perf.time();
    this.client.send(JSON.stringify(result));
    perf.send(start)
    return {changes, result};
  }

  close() {
    for(let setup of this.setups) {
      setup.close();
    }
  }
}


//---------------------------------------------------------------------
// DependencyChecker
//---------------------------------------------------------------------

export class DependencyChecker {
  dependencies: any;
  alwaysTrue: boolean;

  constructor(block) {
    this.alwaysTrue = block.singleRun;
    let map = this.buildVariableMap(block);
    this.dependencies = this.buildDependencies(map);
  }

  buildVariableMap(block, variableMap = {}) {
    for(let level of block.strata) {
      for(let scan of level.scans) {
        if(scan instanceof Scan) {
          let {e,a,v} = scan;
          let cur;
          if(isVariable(e)) {
            cur = variableMap[e.id];
            if(cur === undefined) {
              cur = variableMap[e.id] = {attributes: {}};
            }
          }
          if(!isVariable(a)) {
            let attrInfo = cur.attributes[a];
            if(attrInfo === undefined) {
              attrInfo = cur.attributes[a] = {values: []};
            }
            if(!isVariable(v)) {
              cur.attributes[a].values.push(v);
            } else {
              attrInfo.any = true;
            }
          } else {
            cur.any = true;
          }
        } else if(scan instanceof NotScan) {
          // this.alwaysTrue = true;
          this.buildVariableMap(scan, variableMap);
        } else if(scan instanceof IfScan) {
          // this.alwaysTrue = true;
          for(let branch of scan.branches) {
            this.buildVariableMap(branch, variableMap);
          }
        }
      }
    }
    return variableMap;
  }

  _depsForTag(deps, attributes, tag) {
    let attributeIndex = deps[tag];
    if(!attributeIndex) {
      attributeIndex = deps[tag] = {};
    }
    for(let attribute of Object.keys(attributes)) {
      let attributeInfo = attributes[attribute];
      let vIndex = attributeIndex[attribute];
      if(!vIndex && !attributeInfo.any) {
        vIndex = attributeIndex[attribute] = {};
      } else if(attributeInfo.any || vIndex === true) {
        attributeIndex[attribute] = true;
        continue;
      }
      for(let value of attributeInfo.values) {
        vIndex[value] = true;
      }
    }
  }

  buildDependencies(variableMap) {
    let deps = {"any": {"tag": {}}};
    for(let variableId of Object.keys(variableMap)) {
      let {any, attributes} = variableMap[variableId];
      let tagAttributes = attributes["tag"];
      if(!tagAttributes || tagAttributes.any) {
        this._depsForTag(deps, attributes, "any")
      } else {
        for(let tag of tagAttributes.values) {
          deps["any"]["tag"][tag] = true;
          this._depsForTag(deps, attributes, tag);
        }
      }
    }
    return deps;
  }

  check(multiIndex: MultiIndex, change, e, a, v) {
    //multidb
    if(this.alwaysTrue) return true;
    let deps = this.dependencies;
    let tags = multiIndex.dangerousMergeLookup(e,"tag",undefined);
    if(tags.length === 0) {
      let attrIndex = deps["any"];
      if(!attrIndex) return false;
      let attr = attrIndex[a];
      if(attr === true) return true;
      if(attr === undefined) return false;
      return attr[v];
    }
    for(let tag of tags) {
      let attrIndex = deps[tag];
      if(!attrIndex) continue;
      let attr = attrIndex[a];
      if(attr === undefined) continue;
      if(attr === true || attr[v] === true) return true;
    }
    return false
  }
}
