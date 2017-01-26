import {Index, ListIndex, HashIndex} from "./indexes";

//------------------------------------------------------------------------
// Debugging
//------------------------------------------------------------------------

function printField(field:ScanField) {
  if(isRegister(field)) return "[" + field.offset + "]";
  if(field === undefined || field === null) return field;
  return GlobalInterner.reverse(field);
}

function printPrefix(prefix:ID[]) {
  return prefix.map((v) => GlobalInterner.reverse(v));
}

function printScan(constraint:Scan) {
  return `Scan: ${printField(constraint.e)} ${printField(constraint.a)} ${printField(constraint.v)} ${printField(constraint.n)}`;
}

function printFunction(constraint:FunctionConstraint) {
  return `Function ${constraint.name} ${constraint.fieldNames.map((v) => v + ": " + printField(constraint.fields[v]))}`;
}

function printConstraint(constraint:Constraint) {
  if(constraint instanceof Scan) {
    return printScan(constraint);
  } else if(constraint instanceof FunctionConstraint) {
    return printFunction(constraint);
  }
}

//------------------------------------------------------------------------
// Runtime
//------------------------------------------------------------------------

export var ALLOCATION_COUNT:any = {};

export function createHash(place = "unknown-hash") {
  if(!ALLOCATION_COUNT[place]) ALLOCATION_COUNT[place] = 0;
  ALLOCATION_COUNT[place]++;
  return Object.create(null);
}

export function createArray(place = "unknown") {
  if(!ALLOCATION_COUNT[place]) ALLOCATION_COUNT[place] = 0;
  ALLOCATION_COUNT[place]++;
  return [];
}

export function copyArray(arr:any[], place = "unknown") {
  if(!ALLOCATION_COUNT[place]) ALLOCATION_COUNT[place] = 0;
  ALLOCATION_COUNT[place]++;
  return arr.slice();
}

export function moveArray(arr:any[], arr2:any[]) {
  let ix = 0;
  for(let elem of arr) {
    arr2[ix] = arr[ix];
  }
  if(arr2.length === arr.length) arr2.length = arr.length;
  return arr2;
}

function isNumber(thing:any): thing is number {
  return typeof thing === "number";
}

//------------------------------------------------------------------------
// Interning
//------------------------------------------------------------------------

/** The union of value types we support in Eve. */
export type RawValue = string|number;
/**  An interned value's ID. */
export type ID = number;

export class Interner {
  strings: {[value:string]: ID|undefined} = createHash();
  numbers: {[value:number]: ID|undefined} = createHash();
  IDs: RawValue[] = createArray();
  IDRefCount: number[] = createArray();
  IDFreeList: number[] = createArray();
  ix: number = 0;
  arenas: {[arena:string]: ID[]} = createHash();

  constructor() {
    this.arenas["functionOutput"] = createArray("interner-arena-array");
  }

  _getFreeID() {
    return this.IDFreeList.pop() || this.ix++;
  }

  reference(id:ID) {
    this.IDRefCount[id]++;
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
      this.IDRefCount[found] = 1;
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
      let coll;
      if(isNumber(value)) {
        coll = this.numbers;
      } else {
        coll = this.strings;
      }
      coll[value] = undefined;
      this.IDs[id] = undefined;
      this.IDFreeList.push(id);
    }
  }

  arenaIntern(arenaName:string, value:RawValue):ID {
    let arena = this.arenas[arenaName];
    if(!arena) {
      arena = this.arenas[arenaName] = createArray("interner-arena-array");
    }
    // @NOTE: for performance reasons it might make more sense to prevent duplicates
    // from ending up in the list. If that's the case, we could either keep a seen
    // hash or do a get and only intern if it hasn't been seen. This is (probably?)
    // a pretty big performance gain in the case where a bunch of rows might repeat
    // the same function output over and over.
    let id = this.intern(value);
    arena.push(id);
    return id;
  }

  releaseArena(arenaName:string) {
    let arena = this.arenas[arenaName];
    if(!arena) {
      console.warn("Trying to release unknown arena: " + arenaName)
      return;
    }

    for(let id of arena) {
      this.release(id);
    }
    arena.length = 0;
  }
}

export var GlobalInterner = new Interner();

//------------------------------------------------------------------------
// EAVNs
//------------------------------------------------------------------------

export type EAVNField = "e"|"a"|"v"|"n";

/**
 * An EAVN is a single Attribute:Value pair of an Entity (a record),
 * produced by a given Node.
 * E.g., the record `[#person name: "josh"]` translates to two EAVNs:
 * (<1>, "tag", "person", <node id>),
 * (<1>, "name", "josh", <node id>)
 */

export class EAVN {
  constructor(public e:ID, public a:ID, public v:ID, public n:ID) {}
};

//------------------------------------------------------------------------
// Changes
//------------------------------------------------------------------------

type Multiplicity = number;

/**
 * A change is an expanded variant of an EAVN, which also tracks the
 * transaction, round, and count of the fact.  These additional fields
 * are used by the executor and index to provide an incremental view
 * of the DB.
 */

export class Change {
  constructor(public e: ID, public a: ID, public v: ID, public n: ID, public transaction:number, public round:number, public count:Multiplicity) {}

  static fromValues(e: any, a: any, v: any, n: any, transaction: number, round: number, count:Multiplicity) {
    return new Change(GlobalInterner.intern(e), GlobalInterner.intern(a), GlobalInterner.intern(v),
                      GlobalInterner.intern(n), transaction, round, count);
  }

  toString() {
    return `Change(${GlobalInterner.reverse(this.e)}, ${GlobalInterner.reverse(this.a)}, ${GlobalInterner.reverse(this.v)}, ${GlobalInterner.reverse(this.n)}, ${this.transaction}, ${this.round}, ${this.count})`;
  }
}

/** A changeset is a list of changes, intended to occur in a single transaction. */
type ChangeSet = Change[];

//------------------------------------------------------------------------
// Constraints
//------------------------------------------------------------------------

enum ApplyInputState {
  pass,
  fail,
  none,
}

export interface Constraint {
  setup():void;
  getRegisters():Register[];
  applyInput(input:Change, prefix:ID[]):ApplyInputState;
  propose(index:Index, prefix:ID[], transaction:number, round:number, results:any[]):Proposal;
  resolveProposal(index:Index, prefix:ID[], proposal:Proposal, transaction:number, round:number, results:any[]):ID[][];
  accept(index:Index, prefix:ID[], transaction:number, round:number, solvingFor:Register[]):boolean;
  acceptInput(index:Index, input:Change, prefix:ID[], transaction:number, round:number):boolean;
}

//------------------------------------------------------------------------
// Scans
//------------------------------------------------------------------------

/**
 * A scan maps a set of bound variables to unbound variables.
 */

export class Scan implements Constraint {
  constructor(public e:ScanField,
              public a:ScanField,
              public v:ScanField,
              public n:ScanField) {}

  protected resolved:ResolvedEAVN = {e: undefined, a: undefined, v:undefined, n: undefined};
  protected registers:Register[] = createArray();
  protected registerLookup:boolean[] = createArray();

  proposal:Proposal = {cardinality: 0, forFields: [], forRegisters: [], proposer: this};

  /**
   * Resolve each scan field.
   * The resolved object may contain one of three possible value types:
   * - IGNORE_REG -- this field is entirely ignored by the scan.
   * - undefined -- this field is a register that hasn't been filled in yet.
   *                We'll fill it if possible.
   * - ID -- this field contains a static or already solved value.
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
   * A field is unresolved if it is completely ignored by the scan or
   * is an output of the scan.
   */
  fieldUnresolved(resolved:ResolvedEAVN, key: keyof ResolvedEAVN) {
    return resolved[key] === IGNORE_REG || resolved[key] === undefined;
  }

  /**
   * A field is not a static match if it is ignored, not a static
   * field, or the input value does not match the static value.
   */
  notStaticMatch(input:Change, key: "e"|"a"|"v"|"n") {
    return this[key] !== IGNORE_REG && !isRegister(this[key]) && this[key] !== input[key];
  }

  /**
   * Apply new changes that may affect this scan to the prefix to
   * derive only the results affected by this change.  If the change
   * was successfully applied or irrelevant we'll return true. If the
   * change was relevant but invalid (i.e., this scan could not be
   * satisfied due to proposals from previous scans) we'll return
   * false.
   */
  applyInput(input:Change, prefix:ID[]) {
    // If this change isn't relevant to this scan, skip it.
    if(this.notStaticMatch(input, "e")) return ApplyInputState.none;
    if(this.notStaticMatch(input, "a")) return ApplyInputState.none;
    if(this.notStaticMatch(input, "v")) return ApplyInputState.none;
    if(this.notStaticMatch(input, "n")) return ApplyInputState.none;

    // For each register field of this scan:
    //   if the required value is impossible fail,
    //   else add this new value to the appropriate prefix register.
    // @NOTE: Technically, we republish existing values here too.
    //   In practice, that's harmless and eliminates the need for a branch.
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

  resolveProposal(index:Index, prefix:ID[], proposal:Proposal, transaction:number, round:number, results:any[]):ID[][] {
    return index.resolveProposal(proposal);
  }

  accept(index:Index, prefix:ID[], transaction:number, round:number, solvingFor:Register[]):boolean {
    // Before we start trying to accept, we check if we care about the
    // registers we are currently solving.
    let solving = false;
    for(let register of solvingFor) {
      if(this.registerLookup[register.offset]) {
        solving = true;
        break;
      }
    }
    // If we aren't looking at any of these registers, then we just
    // say we accept.
    if(!solving) return true;
    let {e,a,v,n} = this.resolve(prefix);
    return index.check(e, a, v, n, transaction, round);
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


  // We precompute the registers we're interested in for fast accepts.
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
// Function constraint
//------------------------------------------------------------------------

type ConstraintFieldMap = {[name:string]: ScanField};
type ResolvedFields = {[fieldName:string]: ResolvedValue};

export class FunctionConstraint implements Constraint {
  static registered: {[name:string]: typeof FunctionConstraint} = {};
  static register(name:string, klass: typeof FunctionConstraint) {
    FunctionConstraint.registered[name] = klass;
  }

  static variadic = false;

  static create(name:string, fields:ConstraintFieldMap, restFields:(ID|Register)[] = createArray()):FunctionConstraint|undefined {
    let cur = FunctionConstraint.registered[name];
    if(!cur) {
      throw new Error(`No function named ${name} is registered.`);
    }

    if(restFields.length && !cur.variadic) {
      console.error(`The ${name} function is not variadic, so may not accept restFields.`);
      restFields = createArray();
    }

    let created = new cur(fields, restFields);
    return created;
  }

  constructor(public fields:ConstraintFieldMap, public restFields:(ID|Register)[]) {}

  name:string;
  args:{[name:string]: string};
  returns:{[name:string]: string};
  argNames:string[];
  returnNames:string[];
  apply: (... things: any[]) => undefined|(number|string)[]; // @FIXME: Not supporting multi-return yet.
  estimate?:(index:Index, prefix:ID[], transaction:number, round:number) => number

  fieldNames:string[];
  proposal:Proposal = {cardinality:0, forFields: createArray(), forRegisters: createArray(), proposer: this};
  protected resolved:ResolvedFields = {};
  protected resolvedRest:(number|undefined)[] = createArray();
  protected registers:Register[] = createArray();
  protected registerLookup:boolean[] = createArray();
  protected applyInputs:(RawValue|RawValue[])[] = createArray();
  protected applyRestInputs:RawValue[] = createArray();

  // We precompute the registers we're interested in for fast accepts.
  setup() {
    this.fieldNames = Object.keys(this.fields);

    for(let fieldName of this.fieldNames) {
      let field = this.fields[fieldName];
      if(isRegister(field)) this.registers.push(field);
    }

    for(let field of this.restFields) {
      if(isRegister(field)) this.registers.push(field);
    }

    for(let register of this.registers) {
      this.registerLookup[register.offset] = true;
    }
  }

  getRegisters() {
    return this.registers;
  }

  /**
   * Similar to `Scan.resolve`, but resolving a map of the function's
   * fields rather than an EAVN.
   */
  resolve(prefix:ID[]) {
    let resolved = this.resolved;

    for(let fieldName of this.fieldNames) {
      let field = this.fields[fieldName];
      if(isRegister(field)) {
        resolved[fieldName] = prefix[field.offset];
      } else {
        resolved[fieldName] = field;
      }
    }

    return resolved;
  }

  /**
   * If a function is variadic, we need to resolve its rest fields as well.
   */
  resolveRest(prefix:ID[]) {
    let resolvedRest = this.resolvedRest;

    let ix = 0;
    for(let field of this.restFields) {
      if(isRegister(field)) {
        resolvedRest[ix] = prefix[field.offset];
      } else {
        resolvedRest[ix] = field;
      }
      ix++;
    }

    return resolvedRest;
  }

  // Function constraints have nothing to apply to the input, so they
  // always return ApplyInputState.none
  applyInput(input:Change, prefix:ID[]):ApplyInputState { return ApplyInputState.none; }

  propose(index:Index, prefix:ID[], transaction:number, round:number, results:any[]):Proposal {
    let proposal = this.proposal;
    proposal.forRegisters.length = 0;
    let resolved = this.resolve(prefix);

    // If none of our returns are unbound
    // @NOTE: We don't need to worry about the filter case here, since he'll be
    let unresolvedOutput = false;
    for(let output of this.returnNames) {
      if(resolved[output] === undefined) {
        unresolvedOutput = true;
        let field = this.fields[output];
        if(isRegister(field)) {
          proposal.forRegisters.push(field);
        }
      }
    }
    if(!unresolvedOutput) {
      proposal.skip = true;
      return proposal;
    }

    // If any of our args aren't resolved yet, we can't compute results either.
    // @NOTE: This'll need to be touched up when we add optional support if they
    //   co-inhabit the args object.
    for(let input of this.argNames) {
      if(resolved[input] === undefined) {
        proposal.skip = true;
        return proposal;
      }
    }

    // Similarly, if we're variadic we need to check that all of our
    // variadic inputs bound to registers are resolved too.
    // @NOTE: We really need to bend over backwards at the moment to
    //   convince TS to check a static member of the current class...
    if((this.constructor as (typeof FunctionConstraint)).variadic) {
      let resolvedRest = this.resolveRest(prefix);
      for(let field of resolvedRest) {
        if(field === undefined) {
          proposal.skip = true;
          return proposal;
        }
      }
    }

    // Otherwise, we're ready to propose.
    proposal.skip = false;

    if(this.estimate) {
      // If the function provides a cardinality estimator, invoke that.
      proposal.cardinality = this.estimate(index, prefix, transaction, round);

    } else {
      // Otherwise, we'll just return 1 for now, since computing a
      // function is almost always cheaper than a scan.
      // @NOTE: If this is an issue, we can just behave like scans and
      //   compute ourselves here, caching the results.
      proposal.cardinality = 1;
    }

    return proposal;
  }

  /**
   * Pack the resolved register values for the functions argument
   * fields into an array.
   */
  packInputs(prefix:ID[]) {
    let resolved = this.resolve(prefix);
    let inputs = this.applyInputs;
    let argIx = 0;
    for(let argName of this.argNames) {
      // If we're asked to resolve the propoal we know that we've
      // proposed, and we'll only propose if these are resolved.
      inputs[argIx] = GlobalInterner.reverse(resolved[argName]!);
      argIx++;
    }

    // If we're variadic, we also need to pack our var-args up and
    // attach them as the last argument.
    if((this.constructor as (typeof FunctionConstraint)).variadic) {
      let resolvedRest = this.resolveRest(prefix);
      let restInputs = this.applyRestInputs;
      restInputs.length = 0;
      let ix = 0;
      for(let value of resolvedRest) {
        if(value !== undefined) {
          restInputs[ix] = GlobalInterner.reverse(value);
        }
        ix++;
      }

      inputs[argIx] = restInputs;
    }
    return inputs;
  }

  unpackOutputs(outputs:undefined|RawValue[]) {
    console.log("unpacking!", outputs);
    if(!outputs) return;
    for(let ix = 0; ix < outputs.length; ix++) {
      outputs[ix] = GlobalInterner.arenaIntern("functionOutput", outputs[ix]);
    }
    return outputs as ID[];
  }

  resolveProposal(index:Index, prefix:ID[], proposal:Proposal, transaction:number, round:number, results:any[]):ID[][] {
    console.log("RESOLVING!");
    // First we build the args array to provide the apply function.
    let inputs = this.packInputs(prefix);

    // Then we actually apply it and then unpack the outputs.
    // @FIXME: We don't have any intelligent support for not computing unnecessary returns atm.
    // @FIXME: We only support single-return atm.
    let outputs = this.unpackOutputs(this.apply.apply(this, inputs));
    if(!outputs) return results;

    // Finally, if we had results, we create the result prefixes and pass them along.
    let result = createArray("functionResult") as ID[];

    let ix = 0;
    for(let returnName of this.returnNames) {
      let field = this.fields[returnName];
      if(isRegister(field) && !prefix[field.offset]) {
        result[ix] = outputs[ix];
      }
      ix++;
    }
    results.push(result);

    return results;
  }

  accept(index:Index, prefix:ID[], transaction:number, round:number, solvingFor:Register[]):boolean {
    // If none of the registers we're solving for intersect our inputs
    // or outputs, we're not relevant to the solution.
    let isRelevant = false;
    for(let register of solvingFor) {
      if(this.registerLookup[register.offset]) {
        isRelevant = true;
        break;
      }
    }
    if(!isRelevant) return true;

    // If we're missing a field, we can't verify our output yet so we preliminarily accept.
    for(let fieldName of this.fieldNames) {
      let field = this.fields[fieldName];
      if(isRegister(field) && prefix[field.offset] === undefined) return true;
    }

    // First we build the args array to provide the apply function.
    let inputs = this.packInputs(prefix);

    // Then we actually apply it and then unpack the outputs.
    // @FIXME: We don't have any intelligent support for not computing unnecessary returns atm.
    // @FIXME: We only support single-return atm.
    let outputs = this.unpackOutputs(this.apply.apply(this, inputs));
    if(!outputs) {
      return false;
    }

    // Finally, we make sure every return register matches up with our outputs.
    // @NOTE: If we just use solvingFor then we don't know the offsets into the outputs array,
    // so we check everything...
    let ix = 0;
    for(let returnName of this.returnNames) {
      let field = this.fields[returnName];
      if(isRegister(field) && prefix[field.offset]) {
        if(prefix[field.offset] !== outputs[ix]) {
          return false;
        }
      }
      ix++;
    }

    return true;
  }

  acceptInput(index:Index, input:Change, prefix:ID[], transaction:number, round:number):boolean {
    return this.accept(index, prefix, transaction, round, this.registers);
  }
}

interface FunctionSetup {
  name:string,
  variadic?: boolean,
  args:{[argName:string]: string},
  returns:{[argName:string]: string},
  apply:(... things: any[]) => undefined|(number|string)[],
  estimate?:(index:Index, prefix:ID[], transaction:number, round:number) => number
}

function makeFunction({name, variadic = false, args, returns, apply, estimate}:FunctionSetup) {
  class NewFunctionConstraint extends FunctionConstraint {
    static variadic = variadic;
    name = name;
    args = args;
    returns = returns;
    argNames = Object.keys(args);
    returnNames = Object.keys(returns);
    apply = apply;
  }
  FunctionConstraint.register(name, NewFunctionConstraint);
}


makeFunction({
  name: ">",
  args: {a: "number", b: "number"},
  returns: {},
  apply: (a:number, b:number) => {
    return (a > b) ? [] : undefined;
  }
});

makeFunction({
  name: "=",
  args: {a: "number", b: "number"},
  returns: {},
  apply: (a:number, b:number) => {
    return (a === b) ? [] : undefined;
  }
});

makeFunction({
  name: "+",
  args: {a: "number", b: "number"},
  returns: {result: "number"},
  apply: (a:number, b:number) => {
    return [a + b];
  }
});

makeFunction({
  name: "eve/internal/gen-id",
  args: {},
  variadic: true,
  returns: {result: "string"},
  apply: (values:RawValue[]) => {
    // @FIXME: This is going to be busted in subtle cases.
    //   If a record exists with a "1" and 1 value for the same
    //   attribute, they'll collapse for gen-id, but won't join
    //   elsewhere.  This means aggregate cardinality will disagree with
    //   action node cardinality.
    return [values.join("|")];
  }
});

makeFunction({
  name: "eve/internal/concat",
  args: {},
  variadic: true,
  returns: {result: "string"},
  apply: (values:RawValue[]) => {
    return [values.join("")];
  }
});

//------------------------------------------------------------------------
// Proposal
//------------------------------------------------------------------------

export interface Proposal {
  cardinality:number,
  forFields:EAVNField[],
  forRegisters:Register[],
  proposer:Constraint,
  skip?:boolean,
  info?:any,
}

//------------------------------------------------------------------------
// Registers
//------------------------------------------------------------------------

/**
 * A register is just a numerical offset into the solved prefix.
 * We can't make this a type alias because we wouldn't be able to
 * tell the difference between static numbers and registers in scans.
 */

export class Register {
  constructor(public offset:number) {}
}

export function isRegister(x: any): x is Register {
  return x && x.constructor === Register;
}

/** The ignore register is a sentinel value for ScanFields that tell the scan to completely ignore that field. */
export var IGNORE_REG = null;
type IgnoreRegister = typeof IGNORE_REG;

/** A scan field may contain a register, a static interned value, or the IGNORE_REG sentinel value. */
type ScanField = Register|ID|IgnoreRegister;
/** A resolved value is a scan field that, if it contained a register, now contains the register's resolved value. */
export type ResolvedValue = ID|undefined|IgnoreRegister;

type ResolvedEAVN = {e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue};


//------------------------------------------------------------------------
// Nodes
//------------------------------------------------------------------------

/**
 * Base class for nodes, the building blocks of blocks.
 */
export interface Node {
  /**
   * Evaluate the node in the context of the currently solved prefix,
   * returning a set of valid prefixes to continue the query as
   * results.
   */
  exec(index:Index, input:Change, prefix:ID[], transaction:number, round:number, results?:ID[][], changes?:Change[]):boolean;
}

/**
 * The JoinNode implements generic join across multiple constraints.
 * Since our system is incremental, we need to do something slightly
 * fancier than we did in the previous runtime.  For each new change
 * that enters the system, we ask each of our constraints whether they
 * are capable of producing a new result. In the case where a single
 * constraint can, we presolve that constraint and then run the rest
 * normally, limited to only producing results that match the first
 * constraint. However, if multiple constraints might apply the input,
 * we need to run for each *combination* of heads. E.g.:
 *
 * Given a join node with constraints [A, B, C, and D], where A and D
 * can both apply the input, we must combine the results of the
 * following computations to get the full result set:
 *
 * Apply {A} -> Do {B, C, D}
 * Apply {A, D} -> Do {B, C}
 * Apply {D} -> Do {A, B, C}
 *
 * We calculate this using the power set in exec.
 *
 * We then apply each of these combinations by running a genericJoin
 * over the remaining unresolved registers.  We ask each un-applied
 * constraint to propose a register to be solved. If a constraint is
 * capable of resolving one, it returns the set of registers it can
 * resolve and an estimate of the result set's cardinality. Generic
 * Join chooses the cheapest proposal, which the winning constraint
 * then fully computes (or retrieves from cache and returns). Next it
 * asks each other constraint to accept or reject the proposal. If the
 * constraint doesn't apply to the solved registers, it accepts.  If
 * the solution contains results that match the output of the
 * constraint, it also accepts. Otherwise, it must reject the solution
 * and that particular run yields no results.
 */

export class JoinNode implements Node {
  registerLength = 0;
  registerArrays:Register[][];
  proposedResultsArrays:ID[][];
  emptyProposal:Proposal = {cardinality: Infinity, forFields: [], forRegisters: [], skip: true, proposer: {} as Constraint};
  inputState = {constraintIx: 0, state: ApplyInputState.none};
  protected affectedConstraints:Constraint[] = createArray();

  constructor(public constraints:Constraint[]) {
    // We need to find all the registers contained in our scans so that
    // we know how many rounds of Generic Join we need to do.
    let registers = createArray() as Register[][];
    let proposedResultsArrays = createArray() as ID[][];
    for(let constraint of constraints) {
      constraint.setup();
      for(let register of constraint.getRegisters()) {
        registers[register.offset] = createArray() as Register[];
        proposedResultsArrays[register.offset] = createArray() as ID[];
      }
    }
    this.registerArrays = registers;
    this.registerLength = registers.length;
    this.proposedResultsArrays = proposedResultsArrays;
  }

  findAffectedConstraints(input:Change, prefix:ID[]) {
    // @TODO: Hoist me out.
    let affectedConstraints = this.affectedConstraints;
    affectedConstraints.length = 0;
    for(let ix = 0, len = this.constraints.length; ix < len; ix++) {
      let constraint = this.constraints[ix];
      let result = constraint.applyInput(input, prefix);

      if(result !== ApplyInputState.none) {
        affectedConstraints.push(constraint);
      }
    }

    return affectedConstraints;
  }

  applyCombination(index:Index, input:Change, prefix:ID[], transaction:number, round:number, results:ID[][]) {
    let countOfSolved = 0;
    for(let field of prefix) {
      if(field !== undefined) countOfSolved++;
    }
    let remainingToSolve = this.registerLength - countOfSolved;
    let valid = this.presolveCheck(index, input, prefix, transaction, round);
    if(!valid) {
      // do nothing
      return false;

    } else if(!remainingToSolve) {
      // if it is valid and there's nothing left to solve, then we've found
      // a full result and we should just continue
      results.push(copyArray(prefix, "results"));
      return true;

    } else {
      // For each node, find the new results that match the prefix.
      this.genericJoin(index, prefix, transaction, round, results, remainingToSolve);
      return true;
    }
  }

  unapplyConstraint(constraint:Constraint, prefix:ID[]) {
    for(let register of constraint.getRegisters()) {
      prefix[register.offset] = undefined as any;
    }
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

  genericJoin(index:Index, prefix:ID[], transaction:number, round:number, results:ID[][] = createArray("gjResultsArray"), roundIx:number = this.registerLength):ID[][] {
    // console.log("GJ: ", roundIx, printPrefix(prefix));
    let {constraints, emptyProposal} = this;
    let proposedResults = this.proposedResultsArrays[roundIx - 1];
    let forRegisters:Register[] = this.registerArrays[roundIx - 1];
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


    let {proposer} = bestProposal;
    // We have to copy here because we need to keep a reference to this even if later
    // rounds might overwrite the proposal
    moveArray(bestProposal.forRegisters, forRegisters);
    let resolved:any[] = proposer.resolveProposal(index, prefix, bestProposal, transaction, round, proposedResults);
    if(resolved[0].constructor === Array) {
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
          results.push(copyArray(prefix, "gjResults"));
        } else {
          this.genericJoin(index, prefix, transaction, round, results, roundIx - 1);
        }
      }
    } else {
      let register = forRegisters[0];
      resultLoop: for(let result of resolved) {
        prefix[register.offset] = result as ID;
        for(let constraint of constraints) {
          if(constraint === proposer) continue;
          if(!constraint.accept(index, prefix, transaction, round, forRegisters)) {
            continue resultLoop;
          }
        }
        if(roundIx === 1) {
          results.push(copyArray(prefix, "gjResults"));
        } else {
          this.genericJoin(index, prefix, transaction, round, results, roundIx - 1);
        }
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

  exec(index:Index, input:Change, prefix:ID[], transaction:number, round:number, results:ID[][] = createArray("joinNodeExec")):boolean {
    let didSomething = false;
    let affectedConstraints = this.findAffectedConstraints(input, prefix);

    // @FIXME: This is frivolously wasteful.
    for(let constraintIxz = 0; constraintIxz < affectedConstraints.length; constraintIxz++) {
      let constraint = affectedConstraints[constraintIxz];
      this.unapplyConstraint(constraint, prefix);
    }

    let combinationCount = Math.pow(2, affectedConstraints.length);
    for(let comboIx = combinationCount - 1; comboIx > 0; comboIx--) {
      //console.log("  Combo:", comboIx);

      for(let constraintIx = 0; constraintIx < affectedConstraints.length; constraintIx++) {
        let mask = 1 << constraintIx;
        let isIncluded = (comboIx & mask) !== 0;
        let constraint = affectedConstraints[constraintIx];

        if(isIncluded) {
          let valid = constraint.applyInput(input, prefix);
          // If any member of the input constraints fails, this whole combination is doomed.
          if(valid === ApplyInputState.fail) break;

          //console.log("    " + printConstraint(constraint));
        } else {
          this.unapplyConstraint(constraint, prefix);
        }
      }

      //console.log("    ", printPrefix(prefix));
      didSomething = this.applyCombination(index, input, prefix, transaction, round, results) || didSomething;
    }

    return didSomething;
  }

}

export class InsertNode implements Node {
  constructor(public e:ID|Register,
              public a:ID|Register,
              public v:ID|Register,
              public n:ID|Register) {}

  protected resolved:ResolvedEAVN = {e: undefined, a: undefined, v:undefined, n: undefined};

  resolve = Scan.prototype.resolve;

  exec(index:Index, input:Change, prefix:ID[], transaction:number, round:number, results:ID[][], changes:Change[]):boolean {
    let {e,a,v,n} = this.resolve(prefix);

    // @FIXME: This is pretty wasteful to copy one by one here.
    results!.push(prefix);

    if(e === undefined || a === undefined || v === undefined || n === undefined) {
      return false;
    }

    // @TODO: when we do removes, we could say that if the result is a remove, we want to
    // dereference these ids instead of referencing them. This would allow us to clean up
    // the interned space based on what's "in" the indexes. The only problem is that if you
    // held on to a change, the IDs of that change may no longer be in the interner, or worse
    // they may have been reassigned to something else. For now, we'll just say that once something
    // is in the index, it never goes away.
    GlobalInterner.reference(e);
    GlobalInterner.reference(a);
    GlobalInterner.reference(v);
    GlobalInterner.reference(n);
    let change = new Change(e!, a!, v!, n!, transaction, round + 1, 1);
    changes.push(change);

    return true;
  }
}

//------------------------------------------------------------------------------
// Block
//------------------------------------------------------------------------------

export class Block {
  constructor(public name:string, public nodes:Node[]) {}

  // We're going to essentially double-buffer the result arrays so we can avoid allocating in the hotpath.
  results:ID[][] = createArray();
  initial:ID[] = createArray();
  protected nextResults:ID[][] = createArray();

  exec(index:Index, input:Change, transaction:number, round:number, changes:Change[]):boolean {
    let blockState = ApplyInputState.none;
    this.results.length = 0;
    this.initial.length = 0;
    this.results.push(this.initial);
    this.nextResults.length = 0;
    // We populate the prefix with values from the input change so we only derive the
    // results affected by it.
    for(let node of this.nodes) {
      for(let prefix of this.results) {
        let valid = node.exec(index, input, prefix, transaction, round, this.nextResults, changes);
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
// Transaction
//------------------------------------------------------------------------------

export class Transaction {

  round = 0;
  constructor(public transaction:number, public blocks:Block[], public changes:Change[]) {}

  exec(index:Index) {
    let {changes, transaction, round} = this;
    let changeIx = 0;
    while(changeIx < changes.length) {
      let change = changes[changeIx];
      this.round = change.round;

      //console.log("Round:", this.round);

      for(let block of this.blocks) {
        block.exec(index, change, transaction, this.round, changes);
      }
      index.insert(change);
      changeIx++;
    }

    // Once the transaction is effectively done, we need to clean up after ourselves. We
    // arena allocated a bunch of IDs related to function call outputs, which we can now
    // safely release.
    GlobalInterner.releaseArena("functionOutput");
  }
}

//------------------------------------------------------------------------------
// Testing logic
//------------------------------------------------------------------------------

type RawEAVN = [RawValue, RawValue, RawValue, RawValue];
type RawEAVNC = [RawValue, RawValue, RawValue, RawValue, number];

let _currentTransaction = 0;
export function createChangeSet(...eavns:(RawEAVN|RawEAVNC)[]) {
  let changes:ChangeSet = [];
  for(let [e, a, v, n, c = 1] of eavns as RawEAVNC[]) {
    changes.push(Change.fromValues(e, a, v, n, _currentTransaction, 0, c));
  }
  _currentTransaction++;

  return changes;
}

// We'll accumulate the current program state here as we stream in changes.
let currentState:ChangeSet = [];

// A list of changesets to stream into the program. Each changeset corresponds to an input event.
let changes:ChangeSet[] = [];
changes.push(
  createChangeSet(["<1>", "tag", "person", 1]),
  createChangeSet(["<1>", "name", "RAB", 1]),
  createChangeSet(["<1>", "age", 7, 1]),
  createChangeSet(["<2>", "tag", "person", 1], ["<2>", "name", "KERY", 1], ["<2>", "age", 41, 1]),
  createChangeSet(["<3>", "tag", "dog", 1], ["<3>", "name", "jeff", 1], ["<3>", "age", 3, 1]),
  createChangeSet(["<4>", "name", "BORSCHT", 1], ["<4>", "tag", "person", 1]),
);

// Manually created registers for the testing program below.
let nameReg = new Register(0);
let eReg = new Register(1);
let idReg = new Register(2);
let textReg = new Register(3);

let p1Reg = new Register(0);
let p2Reg = new Register(1);
let age1Reg = new Register(2);
let age2Reg = new Register(3);
let resultReg = new Register(4);

// Test program. It evaluates:
// search
//   eid = [#person name]
// bind
//   [#div | text: name]
let _blocks:Block[] = [
  new Block("things are happening", [
    new JoinNode([
      new Scan(eReg, GlobalInterner.intern("tag"), GlobalInterner.intern("person"), null),
      new Scan(eReg, GlobalInterner.intern("name"), nameReg, null),
      FunctionConstraint.create("eve/internal/gen-id", {result: idReg}, [eReg, nameReg])!,
      FunctionConstraint.create("eve/internal/concat", {result: textReg}, [GlobalInterner.intern("meep moop: "), nameReg])!
    ]),
    new InsertNode(idReg, GlobalInterner.intern("tag"), GlobalInterner.intern("div"), GlobalInterner.intern(2)),
    new InsertNode(idReg, GlobalInterner.intern("text"), GlobalInterner.intern("foo"), GlobalInterner.intern(3)),
  ]),
  // new Block("> filters are cool", [
  //   new JoinNode([
  //     new Scan(p1Reg, GlobalInterner.intern("age"), age1Reg, null),
  //     new Scan(p2Reg, GlobalInterner.intern("age"), age2Reg, null),
  //     FunctionConstraint.create(">", {a: age1Reg, b: age2Reg})!
  //   ]),
  //   new InsertNode(GlobalInterner.intern("is-greater-than"), GlobalInterner.intern("age1"), age1Reg, GlobalInterner.intern(76)),
  //   new InsertNode(GlobalInterner.intern("is-greater-than"), GlobalInterner.intern("age2"), age2Reg, GlobalInterner.intern(76)),
  // ]),
  // new Block("= filters are cool", [
  //   new JoinNode([
  //     new Scan(p1Reg, GlobalInterner.intern("age"), age1Reg, null),
  //     new Scan(p2Reg, GlobalInterner.intern("age"), age2Reg, null),
  //     FunctionConstraint.create("=", {a: age1Reg, b: age2Reg})!
  //   ]),
  //   new InsertNode(GlobalInterner.intern("is-equal"), GlobalInterner.intern("age1"), age1Reg, GlobalInterner.intern(76)),
  //   new InsertNode(GlobalInterner.intern("is-equal"), GlobalInterner.intern("age2"), age2Reg, GlobalInterner.intern(76)),
  // ]),
  // new Block("There's a + function in there and it knows whats up", [
  //   new JoinNode([
  //     new Scan(p1Reg, GlobalInterner.intern("age"), age1Reg, null),
  //     new Scan(p2Reg, GlobalInterner.intern("age"), age2Reg, null),
  //     FunctionConstraint.create("+", {a: age1Reg, b: age2Reg, result: resultReg})!
  //   ]),
  //   new InsertNode(GlobalInterner.intern("adds-to"), GlobalInterner.intern("age1"), age1Reg, GlobalInterner.intern(76)),
  //   new InsertNode(GlobalInterner.intern("adds-to"), GlobalInterner.intern("age2"), age2Reg, GlobalInterner.intern(76)),
  //   new InsertNode(GlobalInterner.intern("adds-to"), GlobalInterner.intern("result"), resultReg, GlobalInterner.intern(76)),
  // ]),

];

export function doIt(size = 10000) {
  _currentTransaction = 0;
  // changes = [];
  for(let i = 0; i < size; i++) {
    changes.push(createChangeSet([i - 1, "name", i - 1, 1], [i, "tag", "person", 1]));
  }
  let index = new HashIndex();
  ALLOCATION_COUNT = {};
  console.time("do it");

  for(let changeset of changes) {

    let trans = new Transaction(changeset[0].transaction, _blocks, changeset);
    // console.log(`TX ${trans.transaction}\n` + changeset.map((change, ix) => `  -> ${change}`).join("\n"));
    trans.exec(index);
    console.log(trans.changes.map((change, ix) => `    <- ${change}`).join("\n"));
  }
  console.timeEnd("do it");
  // console.log(changes);

  console.log("INDEX SIZE", index.cardinality);
  console.log("TOTAL ALLOCS", ALLOCATION_COUNT);
}

for(let ix = 0; ix < 1; ix++) {
  doIt(0);
}

console.log(GlobalInterner);

if(typeof window === "object") {
  (window as any)["doit"] = doIt as any;
}
