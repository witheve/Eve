//------------------------------------------------------------------------
// Runtime
//------------------------------------------------------------------------

type RawValue = string|number;
type ID = number;
type Multiplicity = number;

function createHash() {
  return Object.create(null);
}

function createArray() {
  return [];
}

function isNumber(thing:any): thing is number {
  return typeof thing === "number";
}

//------------------------------------------------------------------------
// Interning
//------------------------------------------------------------------------

export class Interner {
  strings: {[value:string]: ID|undefined} = createHash();
  numbers: {[value:number]: ID|undefined} = createHash();
  IDs: RawValue[] = createArray();
  IDRefCount: number[] = createArray();
  IDFreeList: number[] = createArray();
  ix: number = 0;

  _getFreeID() {
    return this.IDFreeList.pop() || this.ix++;
  }

  intern(value: RawValue): ID {
    let coll;
    if(isNumber(value)) {
      coll = this.numbers;
    } else {
      coll = this.strings;
    }
    let found = coll[value];
    if(found === undefined) {
      found = this._getFreeID();
      coll[value] = found;
      this.IDs[found] = value;
      this.IDRefCount[found]++;
    } else {
      this.IDRefCount[found]++;
    }
    return found;
  }

  get(value: RawValue): ID|undefined {
    let coll;
    if(isNumber(value)) {
      coll = this.numbers;
    } else {
      coll = this.strings;
    }
    return coll[value];
  }

  reverse(id: ID): RawValue {
    return this.IDs[id];
  }

  release(id: ID|undefined) {
    if(id === undefined) return;

    this.IDRefCount[id]--;
    if(!this.IDRefCount[id]) {
      let value = this.IDs[id];
      this.numbers[value as number] = undefined;
      this.strings[value as string] = undefined;
      this.IDFreeList.push(id);
    }
  }
}

export var GlobalInterner = new Interner();

//------------------------------------------------------------------------
// EAVNs
//------------------------------------------------------------------------

type EAVNField = "e"|"a"|"v"|"n";
class EAVN {
  constructor(public e:ID, public a:ID, public v:ID, public n:ID) {}
};

//------------------------------------------------------------------------
// Values
//------------------------------------------------------------------------

type ResolvedValue = ID|undefined|IgnoreRegister;

//------------------------------------------------------------------------
// Proposal
//------------------------------------------------------------------------

interface Proposal {
  cardinality:number,
  forFields:EAVNField[],
  forRegisters:Register[],
  proposer:Constraint,
  skip?:boolean,
  info?:any,
}

//------------------------------------------------------------------------
// Indexes
//------------------------------------------------------------------------

interface Index {
  insert(change:Change):void;
  propose(proposal:Proposal, e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue, transaction:number, round:number):Proposal;
  resolveProposal(proposal:Proposal):any[][];
  get(e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue, transaction:number, round:number):EAVN[];
}

class ListIndex implements Index {
  changes: Change[] = createArray();
  insert(change:Change) {
     this.changes.push(change);
  }

  resolveProposal(proposal:Proposal) {
    return proposal.info;
  }

  propose(proposal:Proposal, e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue, transaction = Infinity, round = Infinity) {
    let final = createArray() as ID[][];
    let forFields:EAVNField[] = createArray();
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

  get(e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue, transaction = Infinity, round = Infinity):EAVN[] {
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
}

//------------------------------------------------------------------------
// Changes
//------------------------------------------------------------------------

/**
 * A change is a single changed EAV row of a changeset.
 *  E.g., if we add [#person name: "josh"] then
 *  (<1>, "tag", "person", ...) and
 *  (<1>, "name", "josh", ...) are each separate changes.
 */

class Change {
  constructor(public e: ID, public a: ID, public v: ID, public n: ID, public transaction:number, public round:number, public count:Multiplicity) {}

  static fromValues(e: any, a: any, v: any, n: any, transaction: number, round: number, count:Multiplicity) {
    return new Change(GlobalInterner.intern(e), GlobalInterner.intern(a), GlobalInterner.intern(v),
                      GlobalInterner.intern(n), transaction, round, count);
  }

  toString() {
    return `Change(${GlobalInterner.reverse(this.e)}, ${GlobalInterner.reverse(this.a)}, ${GlobalInterner.reverse(this.v)}, ${GlobalInterner.reverse(this.n)}, ${this.transaction}, ${this.round}, ${this.count})`;
  }
}

//------------------------------------------------------------------------
// Registers
//------------------------------------------------------------------------

type ChangeSet = Change[];

/**
 * A register is just a numerical offset into the solved prefix.
 * We can't make this a type alias because we wouldn't be able to
 * tell the difference between static numbers and registers in scans.
 */

class Register {
  constructor(public offset:number) {}
}

function isRegister(x: any): x is Register {
  return x && x.constructor === Register;
}

/** The ignore register is a sentinel value for ScanFields that tell the scan to completely ignore that field. */
type IgnoreRegister = null;
let IGNORE_REG:IgnoreRegister = null;

/** A scan field may contain a register, a static interned value, or the IGNORE_REG sentinel value. */
type ScanField = Register|ID|IgnoreRegister;

type ResolvedEAVN = {e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue};

//------------------------------------------------------------------------
// Scans
//------------------------------------------------------------------------

/**
 * A scan maps a set of bound variables to unbound variables.
 */

class Scan implements Constraint {
  constructor(public e:ScanField,
              public a:ScanField,
              public v:ScanField,
              public n:ScanField) {}

  protected resolved:ResolvedEAVN = {e: undefined, a: undefined, v:undefined, n: undefined};
  protected registers:Register[] = [];
  protected registerLookup:boolean[] = [];

  proposal:Proposal = {cardinality: 0, forFields: [], forRegisters: [], proposer: this};

  /**
   * Resolve each scan field. The resolved object may contain one of three possible value types:
   * - IGNORE_REG -- this field is entirely ignored by the scan.
   * - undefined -- this field is a register that hasn't been filled in yet. We'll fill it if possible.
   * - ID -- this field contains a static or already solved interned value.
   */
  resolve(prefix:ID[]) {
    let resolved = this.resolved;
    if(isRegister(this.e)) {
      resolved.e = prefix[this.e.offset];
    } else {
      resolved.e = this.e;
    }

    if(isRegister(this.a)) {
      resolved.a = prefix[this.a.offset];
    } else {
      resolved.a = this.a;
    }

    if(isRegister(this.v)) {
      resolved.v = prefix[this.v.offset];
    } else {
      resolved.v = this.v;
    }

    if(isRegister(this.n)) {
      resolved.n = prefix[this.n.offset];
    } else {
      resolved.n = this.n;
    }

    return resolved;
  }

  /**
   * A field is unresolved if it is completely ignored by the scan or is an output of the scan.
   */
  fieldUnresolved(resolved:ResolvedEAVN, key: keyof ResolvedEAVN) {
    return resolved[key] === IGNORE_REG || resolved[key] === undefined;
  }

  /**
   * A field is not a static match if it is ignored, not a static field, or the input value does not match the static value.
   */
  notStaticMatch(input:Change, key: "e"|"a"|"v"|"n") {
    return this[key] !== IGNORE_REG && !isRegister(this[key]) && this[key] !== input[key];
  }

  /**
   * Given the set of changes that have happened over the lifetime of the program (the `state`)
   * and the current prefix of already-solved registers, return every set of values that fill
   * our outputs (undefined registers) without violating the prefix. These will be added to the
   * prefix for scans that follow us. The result format is a sparse list of EAVNS, which is pretty
   * inefficient, but this code will change significantly when GenericJoin is re-implemented, so it's
   * not worth optimizing yet.
   */
  exec(state:ChangeSet, prefix:ID[], results:ID[][] = createArray()) {
    let resolved = this.resolve(prefix);

    for(let change of state) {
      // For each field that has a pre-existing static or prefix value, bail if the value doesn't match the current change.
      if(!this.fieldUnresolved(resolved, "e") && change.e !== resolved.e) continue;
      if(!this.fieldUnresolved(resolved, "a") && change.a !== resolved.a) continue;
      if(!this.fieldUnresolved(resolved, "v") && change.v !== resolved.v) continue;
      if(!this.fieldUnresolved(resolved, "n") && change.n !== resolved.n) continue;

      // The current change is a match for this scan + prefix, so we'll create a new EAVN containing its values for our output fields.
      let result = createArray() as ID[];
      if(resolved.e === undefined) result[0] = change.e;
      if(resolved.a === undefined) result[1] = change.a;
      if(resolved.v === undefined) result[2] = change.v;
      if(resolved.n === undefined) result[3] = change.n;

      results.push(result);
    }

    return results;
  }

  /**
   * Apply new changes that may affect this scan to the prefix to derive only the results affected by this change.
   * If the change was successfully applied or irrelevant we'll return true. If the change was relevant but invalid
   * (i.e., this scan could not be satisfied due to proposals from previous scans) we'll return false.
   */
  applyInput(input:Change, prefix:ID[]) {
    // If this change isn't relevant to this scan, skip it.
    if(this.notStaticMatch(input, "e")) return ApplyInputState.none;
    if(this.notStaticMatch(input, "a")) return ApplyInputState.none;
    if(this.notStaticMatch(input, "v")) return ApplyInputState.none;
    if(this.notStaticMatch(input, "n")) return ApplyInputState.none;

    // For each register field of this scan, if the required value is impossible fail, otherwise add this new value to the
    // appropriate register in the prefix.
    // @NOTE: Technically, we republish existing values here too. In practice, that's harmless and eliminates the need for extra
    // branching.
    if(isRegister(this.e)) {
      if(prefix[this.e.offset] !== undefined && prefix[this.e.offset] !== input.e) return ApplyInputState.fail;
      prefix[this.e.offset] = input.e;
    }

    if(isRegister(this.a)) {
      if(prefix[this.a.offset] !== undefined && prefix[this.a.offset] !== input.a) return ApplyInputState.fail;
      prefix[this.a.offset] = input.a;
    }

    if(isRegister(this.v)) {
      if(prefix[this.v.offset] !== undefined && prefix[this.v.offset] !== input.v) return ApplyInputState.fail;
      prefix[this.v.offset] = input.v;
    }

    if(isRegister(this.n)) {
      if(prefix[this.n.offset] !== undefined && prefix[this.n.offset] !== input.n) return ApplyInputState.fail;
      prefix[this.n.offset] = input.n;
    }

    return ApplyInputState.pass;
  }

  propose(index:Index, prefix:ID[], transaction:number, round:number, results:any[]):Proposal {
    let {e,a,v,n} = this.resolve(prefix);
    this.proposal.skip = false;
    let proposal = index.propose(this.proposal, e, a, v, n, transaction, round);

    let ix = 0;
    for(let field of proposal.forFields) {
      proposal.forRegisters[ix] = this[field] as Register;
      ix++;
    }
    if(proposal.forFields.length === 0) proposal.skip = true;
    return proposal;
  }

  resolveProposal(index:Index, proposal:Proposal, transaction:number, round:number, results:any[]):ID[][] {
    return index.resolveProposal(proposal);
  }

  accept(index:Index, prefix:ID[], transaction:number, round:number, solvingFor:Register[]):boolean {
    // before we start trying to accept, we need to make sure we care about the registers
    // we are currently solving for
    let solving = false;
    for(let register of solvingFor) {
      if(this.registerLookup[register.offset]) {
        solving = true;
        break;
      }
    }
    // if we aren't looking at any of these registers, then we just say we accept
    if(!solving) return true;
    let {e,a,v,n} = this.resolve(prefix);
    let results = index.get(e, a, v, n, transaction, round)
    return results.length > 0;
  }

  acceptInput(index:Index, input:Change, prefix:ID[], transaction:number, round:number):boolean {
    let {e,a,v,n} = this.resolve(prefix);
    if((e === IGNORE_REG || input.e === e) &&
       (a === IGNORE_REG || input.a === a) &&
       (v === IGNORE_REG || input.v === v) &&
       (n === IGNORE_REG || input.n === n)) {
      return true;
    } else  {
      return this.accept(index, prefix, transaction, round, this.registers);
    }
  }


  // Scans don't have any inherent setup
  setup() {
    if(isRegister(this.e)) this.registers.push(this.e);
    if(isRegister(this.a)) this.registers.push(this.a);
    if(isRegister(this.v)) this.registers.push(this.v);
    if(isRegister(this.n)) this.registers.push(this.n);
    for(let register of this.registers) {
      this.registerLookup[register.offset] = true;
    }
  }

  getRegisters():Register[] {
    return this.registers;
  }

}

//------------------------------------------------------------------------
// Constraints
//------------------------------------------------------------------------

enum ApplyInputState {
  pass,
  fail,
  none,
}

interface Constraint {
  setup():void;
  getRegisters():Register[];
  applyInput(input:Change, prefix:ID[]):ApplyInputState;
  propose(index:Index, prefix:ID[], transaction:number, round:number, results:any[]):Proposal;
  resolveProposal(index:Index, proposal:Proposal, transaction:number, round:number, results:any[]):ID[][];
  accept(index:Index, prefix:ID[], transaction:number, round:number, solvingFor:Register[]):boolean;
  acceptInput(index:Index, input:Change, prefix:ID[], transaction:number, round:number):boolean;
}

//------------------------------------------------------------------------
// Function constraint
//------------------------------------------------------------------------

type ConstraintFieldMap = {[name:string]: ScanField};

abstract class FunctionConstraint implements Constraint {
  static registered: {[name:string]: new (args:ConstraintFieldMap, returns:ConstraintFieldMap) => FunctionConstraint} = {};
  static register(name:string, klass: new (args:ConstraintFieldMap, returns:ConstraintFieldMap) => FunctionConstraint) {
    FunctionConstraint.registered[name] = klass;
  }

  static create(name:string, args:ConstraintFieldMap, returns:ConstraintFieldMap):FunctionConstraint|undefined {
    let cur = FunctionConstraint.registered[name];
    if(!cur) return;
    let created = new cur(args, returns);
    created.setup();
    return created;
  }

  constructor(args:ConstraintFieldMap, returns:ConstraintFieldMap) {

  }

  proposal:Proposal = {cardinality:0, forFields: createArray(), forRegisters: createArray(), proposer: this};

  setup() {
    console.log(this.args);
  }

  // @TODO
  getRegisters() {
    return createArray();
  }

  args: any;
  returns: any;
  apply: (... things: any[]) => any;

  // Function constraints have nothing to apply to the input, so they
  // always return ApplyInputState.none
  applyInput(input:Change, prefix:ID[]):ApplyInputState { return ApplyInputState.none; }

  // @TODO: fill this in
  propose(index:Index, prefix:ID[], transaction:number, round:number, results:any[]):Proposal {
    // we should only attempt to propose if our args are filled and at least one
    // return is not
    this.proposal.skip = true;
    return this.proposal;
  }

  resolveProposal(index:Index, proposal:Proposal, transaction:number, round:number, results:any[]):ID[][] {
    return results;
  }

  accept(index:Index, prefix:ID[], transaction:number, round:number, solvingFor:Register[]):boolean {
    return true;
  }

  acceptInput(index:Index, input:Change, prefix:ID[], transaction:number, round:number):boolean {
    return true;
  }

}

function makeFunction({name,args,returns,apply,cardinality}:{name:string, args:any, returns:any, apply:(... things: any[]) => any, cardinality?:Function}) {
  class NewFunctionConstraint extends FunctionConstraint {
    args = args;
    returns = returns;
    apply = apply;
  }
  FunctionConstraint.register(name, NewFunctionConstraint);
}


makeFunction({
  name: "<",
  args: {a: "number", b: "number"},
  returns: {c: "number"},
  apply: (a:number, b:number) => {
    return a < b;
  }});


//------------------------------------------------------------------------
// Nodes
//------------------------------------------------------------------------

/**
 * Base class for nodes, the building blocks of blocks.
 */
interface Node {
  /**
   * See Scan.exec()
   * @NOTE: The result format is slightly different. Rather than a packed list of EAVNs, we instead return a set of valid prefixes.
   */
  exec(index:Index, input:Change, prefix:ID[], transaction:number, round:number, results?:ID[][]):boolean;
}

class JoinNode implements Node {
  registerLength = 0;
  registerArrays:ID[][] = [];
  emptyProposal:Proposal = {cardinality: Infinity, forFields: [], forRegisters: [], skip: true, proposer: {} as Constraint};

  constructor(public constraints:Constraint[]) {
    // We need to find all the registers contained in our scans so that
    // we know how many rounds of Generic Join we need to do.
    let registers = createArray() as ID[][];
    for(let constraint of constraints) {
      constraint.setup();
      for(let register of constraint.getRegisters()) {
        registers[register.offset] = createArray() as ID[];
      }
    }
    this.registerArrays = registers;
    this.registerLength = registers.length;
  }

  applyInput(input:Change, prefix:ID[]) {
    let handled = ApplyInputState.none;
    for(let constraint of this.constraints) {
      let result = constraint.applyInput(input, prefix);
      if(result === ApplyInputState.fail) return ApplyInputState.fail;
      else if(result === ApplyInputState.pass) handled = ApplyInputState.pass;
    }
    return handled;
  }

  presolveCheck(index:Index, input:Change, prefix:ID[], transaction:number, round:number):boolean {
    let {constraints} = this;

    for(let constraint of constraints) {
      let valid = constraint.acceptInput(index, input, prefix, transaction, round);
      if(!valid) {
        return false;
      }
    }

    return true;
  }

  genericJoin(index:Index, prefix:ID[], transaction:number, round:number, results:ID[][] = createArray(), roundIx:number = this.registerLength):ID[][] {
    let {constraints, emptyProposal} = this;
    let proposedResults = this.registerArrays[roundIx];
    proposedResults.length = 0;

    let bestProposal:Proposal = emptyProposal;

    for(let constraint of constraints) {
      let current = constraint.propose(index, prefix, transaction, round, proposedResults);
      if(!current.skip && current.cardinality === 0) {
        return results;
      } else if(current.cardinality < bestProposal.cardinality && !current.skip) {
        bestProposal = current;
      }
    }


    if(bestProposal.skip) {
      return results;
    }

    let {forRegisters, proposer} = bestProposal;
    let resolved = proposer.resolveProposal(index, bestProposal, transaction, round, proposedResults);
    resultLoop: for(let result of resolved) {
      let ix = 0;
      for(let register of forRegisters) {
        prefix[register.offset] = result[ix];
        ix++;
      }
      for(let constraint of constraints) {
        if(constraint === proposer) continue;
        if(!constraint.accept(index, prefix, transaction, round, forRegisters)) {
          continue resultLoop;
        }
      }
      if(roundIx === 1) {
        results.push(prefix.slice());
      } else {
        this.genericJoin(index, prefix, transaction, round, results, roundIx - 1);
      }
    }
    for(let register of forRegisters) {
      // @NOTE: marking this as any is spoopy at best, but since we should never
      // iterate over the prefix, but instead use it almost like a hash, this
      // should be fine.
      prefix[register.offset] = undefined as any;
    }

    return results;
  }

  exec(index:Index, input:Change, prefix:ID[], transaction:number, round:number, results:ID[][] = createArray()):boolean {
    let ok = this.applyInput(input, prefix);
    let countOfSolved = 0;
    for(let elem of prefix) {
      if(elem !== undefined) countOfSolved++;
    }
    let remainingToSolve = this.registerLength - countOfSolved;
    let valid = this.presolveCheck(index, input, prefix, transaction, round);
    if(!valid) {
      return false;
    } else if(!remainingToSolve) {
      // if it is valid and there's nothing left to solve, then we've found
      // a full result and we chould just continue
      results.push(prefix.slice());
      return true;
    }

    if(ok === ApplyInputState.fail) {
      return false;
    } else if(ok === ApplyInputState.pass && remainingToSolve) {
      // For each node, find the new results that match the prefix.
      this.genericJoin(index, prefix, transaction, round, results, remainingToSolve);
      return true;
    } else {
      // If there is no affected prefix then tautologically there is no affected result, so we skip execution.
      return true;
    }
  }
}

class InsertNode implements Node {
  constructor(public e:ID|Register,
              public a:ID|Register,
              public v:ID|Register,
              public n:ID|Register) {}

  protected resolved:ResolvedEAVN = {e: undefined, a: undefined, v:undefined, n: undefined};

  resolve = Scan.prototype.resolve;

  exec(index:Index, input:Change, prefix:ID[], transaction:number, round:number, results?:ID[][]):boolean {
    let resolved = this.resolve(prefix);

    // @FIXME: This is pretty wasteful to copy one by one here.
    results!.push(prefix);

    if(resolved.e === undefined || resolved.a === undefined || resolved.v === undefined || resolved.n === undefined) {
      return false;
    }

    let change = new Change(resolved.e!, resolved.a!, resolved.v!, resolved.n!, transaction, round + 1, 1);
    console.log(""+change);

    return true;
  }
}

class Block {
  constructor(public name:string, public nodes:Node[]) {}

  // We're going to essentially double-buffer the result arrays so we can avoid allocating in the hotpath.
  results:ID[][];
  protected nextResults:ID[][];

  exec(index:Index, input:Change, transaction:number, round:number):boolean {
    let blockState = ApplyInputState.none;
    this.results = [[]];
    this.nextResults = [];
    // We populate the prefix with values from the input change so we only derive the
    // results affected by it.
    for(let node of this.nodes) {
      for(let prefix of this.results) {
        //console.log("P", prefix);
        let valid = node.exec(index, input, prefix, transaction, round, this.nextResults);
        if(!valid) {
          return false;
        }
      }
      let tmp = this.results;
      this.results = this.nextResults;
      this.nextResults = tmp;
      // @NOTE: We don't really want to shrink this array probably.
      this.nextResults.length = 0;
    }

    return true;
  }
}

//------------------------------------------------------------------------------
// Testing logic
//------------------------------------------------------------------------------

// We'll accumulate the current program state here as we stream in changes.
let currentState:ChangeSet = [];

// A list of changesets to stream into the program. Each changeset corresponds to an input event.
let changes:ChangeSet[] = [
  [Change.fromValues("<1>", "tag", "person", 1, 0, 0, 1)],
  [Change.fromValues("<1>", "name", "RAB", 1, 1, 0, 1)],
  [Change.fromValues("<2>", "tag", "person", 1, 2, 0, 1), Change.fromValues("<2>", "name", "KERY", 1, 2, 0, 1)],
  [Change.fromValues("<3>", "tag", "dog", 1, 3, 0, 1), Change.fromValues("<3>", "name", "jeff", 1, 3, 0, 1)],
  [Change.fromValues("<4>", "name", "BORSCHT", 1, 4, 0, 1)],
  [Change.fromValues("<4>", "tag", "person", 1, 5, 0, 1)],
];

// Manually created registers for the testing program below.
let eReg = new Register(1);
let vReg = new Register(0);

// Test program. It evaluates:
// search
//   eid = [#person name]
// bind
//   [#div | text: name]
let blocks:Block[] = [
  new Block("things are happening", [
    new JoinNode([
      new Scan(eReg, GlobalInterner.intern("tag"), GlobalInterner.intern("person"), null),
      new Scan(eReg, GlobalInterner.intern("name"), vReg, null),
    ]),
    new InsertNode(GlobalInterner.intern("floopy div"), GlobalInterner.intern("tag"), GlobalInterner.intern("div"), GlobalInterner.intern(2)),
    new InsertNode(GlobalInterner.intern("floopy div"), GlobalInterner.intern("text"), vReg, GlobalInterner.intern(2)),
  ])
];

let index = new ListIndex();
let transaction = 0;
let round = 0;

for(let changeset of changes) {
  for(let change of changeset) {
    console.log("Applying", ""+change);

    for(let block of blocks) {
      // Finally, add the new change to the current state and repeat.
      // @NOTE: This doesn't currently respect transaction boundaries.
      block.exec(index, change, transaction, round);
    }
    index.insert(change);
  }
  transaction++;
}
//console.log(results.map((prefix) => prefix.map((x) => GlobalInterner.reverse(x))));
