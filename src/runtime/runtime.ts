import {Index, ListIndex, HashIndex, DistinctIndex} from "./indexes";

//------------------------------------------------------------------------
// Debugging utilities
//------------------------------------------------------------------------

// Turning this on causes all of the debug(.*) statements to print to the
// console.  This is useful to see exactly what the runtime is doing as it
// evaluates a transaction, but it incurs both a pretty serious performance
// cost and prints a lot of stuff.
const DEBUG = false;

export var debug:Function = () => {};
if(DEBUG) {
  debug = function() {
    console.log.apply(console, arguments);
  }
}

export function printField(field:ScanField) {
  if(isRegister(field)) return "[" + field.offset + "]";
  if(field === undefined || field === null) return field;
  return GlobalInterner.reverse(field);
}

export function printPrefix(prefix:Prefix) {
  return prefix.map((v) => GlobalInterner.reverse(v));
}

export function printScan(constraint:Scan) {
  return `Scan: ${printField(constraint.e)} ${printField(constraint.a)} ${printField(constraint.v)} ${printField(constraint.n)}`;
}

export function printFunction(constraint:FunctionConstraint) {
  return `Function ${constraint.name} ${constraint.fieldNames.map((v) => v + ": " + printField(constraint.fields[v]))}`;
}

export function printConstraint(constraint:Constraint) {
  if(constraint instanceof Scan) {
    return printScan(constraint);
  } else if(constraint instanceof FunctionConstraint) {
    return printFunction(constraint);
  }
}

export function maybeReverse(value?:ID):ID|RawValue|undefined {
  if(value === undefined) return value;
  let raw = GlobalInterner.reverse(value);
  return (""+raw).indexOf("|") === -1 ? raw : value;
}

//------------------------------------------------------------------------
// Allocations
//------------------------------------------------------------------------

// As this is a language runtime, we want to get insight into how we're using
// memory and what allocation costs we're eating as we run. To track that, we
// use createHash and createArray to give us some rough numbers. The JIT will
// inline these functions, so the cost over just using {} or [], is fairly
// negligible. In a release build we can also strip the allocation tracking.

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

export function copyHash(hash:any, place = "unknown") {
  if(!ALLOCATION_COUNT[place]) ALLOCATION_COUNT[place] = 0;
  ALLOCATION_COUNT[place]++;
  let neue:any = {};
  for(let key of Object.keys(hash)) {
    neue[key] = hash[key];
  }
  return neue;
}

// given two arrays, append the second's items on to the first
export function concatArray(arr:any[], arr2:any[]) {
  let ix = arr.length;
  for(let elem of arr2) {
    arr[ix] = elem;
    ix++;
  }
  return arr;
}

// overwrite the first array with the values of the second array
// and fix the length if it's different
export function moveArray(arr:any[], arr2:any[]) {
  let ix = 0;
  for(let elem of arr) {
    arr2[ix] = arr[ix];
  }
  if(arr2.length !== arr.length) arr2.length = arr.length;
  return arr2;
}

//------------------------------------------------------------------------
// Iterator
//------------------------------------------------------------------------

// To reduce allocations as much as possible, we want to reuse arrays as much
// as possible. If we reused the array by setting its length to 0 or to some
// new size that is smaller than its current length, we eat the cost of
// deallocating some chunk of memory as well as the potential cost in
// fragmentation. Instead, the Iterator class never changes the size of its
// backing array, and instead keeps its own length. You iterate through the
// array using the next() method:
//
// let current;
// while((current = iterator.next()) !== undefined) {
//   ...
// }
//
// Through the magic of the JIT, this has no performance penalty over using a
// standard for loop. You can get some of those "zero-cost abstractions" in JS
// too!

export class Iterator<T> {
  array:T[] = [];
  length:number = 0;
  ix:number = 0;

  push(value:T) {
    this.array[this.length++] = value;
  }

  clear() {
    this.length = 0;
    this.reset();
  }

  reset() {
    this.ix = 0;
  }

  next():T|undefined {
    if(this.ix < this.length) return this.array[this.ix++];
    return;
  }
}

//------------------------------------------------------------------------
// Interning
//------------------------------------------------------------------------

// Every value that touches the runtime is interned. While that may seem kind
// of crazy, there are lots of good reasons for this. The first is that it
// turns an infinite space of values into a bounded space of integers. This
// gives us a lot more options in how we index values and dramatically improves
// our memory layout. On top of that, every lookup and equality is now on
// fixed-size integers, which computers can do near instantly.  Similarly,
// nearly every function in the runtime is now monomorphic, giving the JIT free
// reign to compile our loops into very fast native code.
//
// This is of course a tradeoff. It means that when we need to do operations on
// the actual values, we have to look them up. In practice all of the above
// benefits have greatly outweighed the lookup cost, the cache-line savings
// alone makes that pretty irrelevant.  The main cost is that as values flow
// out of the system, if we don't clean them up, we'll end up leaking ids.
// Also, at current you can have a maximum of a 32bit integer's worth of unique
// values in your program. Chances are that doesn't matter in practice on the
// client side, but could be a problem in the server at some point. To combat
// this, our intener keeps a ref-count, but we're not freeing any of the IDs at
// the moment.
//
// @TODO: we don't ever release IDs in the current runtime because we're not
// sure who might be holding onto a transaction, which contain references to
// IDs. At some point we should probably reference count transactions as well
// and when they are released, that gives us an opportunity to release any
// associated IDs that are no longer in use.

/** The union of value types we support in Eve. */
export type RawValue = string|number;
/**  An interned value's ID. */
export type ID = number;

function isNumber(thing:any): thing is number {
  return typeof thing === "number";
}

export class Interner {
  // IDs are only positive integers so that they can be used as array indexes
  // for efficient lookup.
  currentID: number = 0;

  // We currently only have two value types in Eve at the moment, strings and
  // numbers.  Because keys in a javascript object are always converted to
  // strings, we have to keep dictionaries for the two types separate,
  // otherwise the number 1 and the string "1" would end up being the same
  // value;
  strings: {[value:string]: ID|undefined} = createHash(); numbers:
    {[value:number]: ID|undefined} = createHash();

  // We use this array as a lookup from an integer ID to a RawValue since the
  // IDs are guaranteed to be densely packed, this gives us much better
  // performance than using another hash.
  IDs: RawValue[] = createArray();

  // This is used as another lookup from ID to the number of references this ID
  // has in the system. As the ref count goes to zero, we can add the ID to the
  // free list so that it can be reused.
  IDRefCount: number[] = createArray(); IDFreeList: number[] = createArray();

  // During the course of evaluation, we might allocate a bunch of intermediate
  // IDs whose values might just be thrown away. For example if we generate a
  // value just to use as a filter, there's no sense in us keeping the value in
  // the interned space.  Arenas are named groups of allocations that we may
  // want to dereference all together.  Note that just because we may
  // dereference it once, that doesn't mean the ID should be released - other
  // uses of the ID may exist.
  arenas: {[arena:string]: Iterator<ID>} = createHash();

  constructor() {
    // The only arena we *know* we want from the beginning is for the output of functions.
    this.arenas["functionOutput"] = new Iterator<ID>();
  }

  _getFreeID() {
    return this.IDFreeList.pop() || this.currentID++;
  }

  reference(id:ID) {
    this.IDRefCount[id]++;
  }

  // Intern takes a value and gives you the ID associated with it. If there isn't an
  // ID it should create one for this value and in either case it should add a reference.
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

  // Get neither creates an ID nor adds a reference to the ID, it only looks up the
  // ID for a value if it exists.
  get(value: RawValue): ID|undefined {
    let coll;
    if(isNumber(value)) {
      coll = this.numbers;
    } else {
      coll = this.strings;
    }
    return coll[value];
  }

  // Go from an ID to the RawValue
  reverse(id: ID): RawValue {
    return this.IDs[id];
  }

  // Dereference an ID and if there are no remaining references, add it to the freelist.
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
      this.IDs[id] = undefined as any;
      this.IDFreeList.push(id);
    }
  }

  arenaIntern(arenaName:string, value:RawValue):ID {
    // @FIXME: Unfortunately we can't use arena intern at the moment due to the
    // fact that while we can know what values end up in the primary indexes,
    // we don't know what values might be hiding in intermediate indexes that
    // runtime nodes sometimes need to keep. If we *did* deallocate an arena
    // and the value didn't make it to a primary index, but ended up in an
    // intermediate one, we'd have effectively corrupted our program. The ID
    // would be freed, and then used for some completely different value. Until
    // we can find an accurate (and cheap!) way to track what values are still
    // hanging around, we'll just have to eat the cost of interning all the
    // values we've seen. Keep in mind that this isn't as bad as it sounds, as
    // the only values that would actually be freed this way are values that
    // are calculated but never end up touching the primary indexes. This is
    // rare enough that in practice, this probably isn't a big deal.
    throw new Error("Arena interning isn't ready for primetime yet.")

    // let arena = this.arenas[arenaName];
    // if(!arena) {
    //   arena = this.arenas[arenaName] = new Iterator<ID>();
    // }
    // // @NOTE: for performance reasons it might make more sense to prevent duplicates
    // // from ending up in the list. If that's the case, we could either keep a seen
    // // hash or do a get and only intern if it hasn't been seen. This is (probably?)
    // // a pretty big performance gain in the case where a bunch of rows might repeat
    // // the same function output over and over.
    // let id = this.intern(value);
    // arena.push(id);
    // return id;
  }

  releaseArena(arenaName:string) {
    let arena = this.arenas[arenaName];
    if(!arena) {
      console.warn("Trying to release unknown arena: " + arenaName)
      return;
    }

    let id;
    while((id = arena.next()) !== undefined) {
      this.release(id);
    }
    arena.clear();
  }
}

// The runtime uses a single global interner so that all values remain comparable.
export var GlobalInterner = new Interner();
(global as any)["GlobalInterner"] = GlobalInterner;

//------------------------------------------------------------------------
// Changes
//
//------------------------------------------------------------------------

// Because Eve's runtime is incremental from the ground up, the primary unit of
// information in the runtime is a Change. The content of a change is in the
// form of "triples," a tuple of entity, attribute, and value (or in the RDF
// world, subject, object, predicate). For example, if we wanted to talk about
// my age, we might have a triple of ("chris", "age", 30). Beyond the content
// of the change, we also want to know who created this change and what
// transaction it came from. This gives us enough information to work out the
// provenance of this information, which is very useful for debugging as well
// as doing clever things around verification and trust. The final two pieces
// of information in a change are the round and count, which are used to help
// us maintain our program incrementally. Because Eve runs all blocks to
// fixedpoint, a single change may cause multiple "rounds" of evaluation which
// introduce more changes. By tracking what round these changes happened in, we
// can do some clever reconciling to handle removal inside recursive rules
// efficiently, which we'll go into more depth later. Count tells us how many
// of these triples we are adding or, if the number is negative, removing from
// the system.

// We track counts as Multiplicities, which are just signed integers.
type Multiplicity = number;

// In a change entity, attribute, value, and node are stored as e, a, v, and n
// respectively.  We often need to look these up in loops or pass around
// information about what property we might currently be talking about, so we
// have a type representing those fields.
export type EAVNField = "e"|"a"|"v"|"n";

export class Change {
  // Change expects that all values have already been interned.
  constructor(public e: ID, public a: ID, public v: ID, public n: ID, public transaction:number, public round:number, public count:Multiplicity) {}

  // As a convenience, you can generate a change from values that haven't been
  // interned yet.
  static fromValues(e: any, a: any, v: any, n: any, transaction: number, round: number, count:Multiplicity) {
    return new Change(GlobalInterner.intern(e), GlobalInterner.intern(a), GlobalInterner.intern(v),
                      GlobalInterner.intern(n), transaction, round, count);
  }

  toString() {
    // let e = GlobalInterner.reverse(this.e);
    let e = this.e;
    return `Change(${e}, ${GlobalInterner.reverse(this.a)}, ${maybeReverse(this.v)}, ${GlobalInterner.reverse(this.n)}, ${this.transaction}, ${this.round}, ${this.count})`;
  }

  // For testing purposes, you often want to compare two Changes ignoring their
  // node, as you don't know exactly what node will generate a value when you
  // run. withoutE is also used in testing to check if a triple whose entity
  // may have been generated by the program *could* match this change.
  equal(other:Change, withoutNode?:boolean, withoutE?:boolean) {
   return (withoutE || this.e == other.e) &&
          this.a == other.a &&
          this.v == other.v &&
          (withoutNode || this.n == other.n) &&
          this.transaction == other.transaction &&
          this.round == other.round &&
          this.count == other.count;
  }

  reverse(interner:Interner = GlobalInterner) {
    let {e, a, v, n, transaction, round, count} = this;
    return new RawChange(interner.reverse(e), interner.reverse(a), interner.reverse(v), interner.reverse(n), transaction, round, count);
  }

  toRawEAV(interner:Interner = GlobalInterner):RawEAV {
    let {e, a, v} = this;
    return [interner.reverse(e), interner.reverse(a), interner.reverse(v)];
  }
}

// When interatcint with the outside world, we need to pass changes around that
// are no longer interned. A RawChange is the same as Change, but all the
// information in the triple has been convered back into RawValues instead of
// interned IDs.
export class RawChange {
  constructor(public e: RawValue, public a: RawValue, public v: RawValue, public n: RawValue,
              public transaction:number, public round:number, public count:Multiplicity) {}

  toString() {
    let {e, a, v, n, transaction, round, count} = this;
    let internedE = GlobalInterner.get(e);
    let internedV = GlobalInterner.get(v);
    return `RawChange(${internedE}, ${a}, ${maybeReverse(internedV) || v}, ${n}, ${transaction}, ${round}, ${count})`;
  }
}

//------------------------------------------------------------------------
// Joins
//------------------------------------------------------------------------

// Buckle up, we're going for a ride.
//
// Now that we have a change representation, we need to actually do something
// with it. Eve is a relational language, which means the primary action in
// the language is to join tuples together. Unlike in most relational databases
// where we might do joins by looking at full relations pair-wise and joining
// them together, we need to operate on changes and we want to sidestep the
// cost of figuring out a good query plan for the pair-wise joins. Both of
// these properties require us to look at joins very differently than we
// normally would in say Postgres. Instead, we're going to use a magical join
// algorithm called Generic Join [1] and extend it to work on incremental
// changes instead of just fully realized relations.
//
// The core idea behind Generic Join is that instead of breaking a query down
// into a set of binary joins on relations, we look at each unique variable in
// the query and have all of the relations that might say something about that
// variable do an intersection. Let's look at an example:
//
//  people(person-id, name)
//  dogs(person-id, dog-name, dog-age)
//
// Here we have two relations we want to join together: "people" and "dogs".
// The people relation has two fields that are represented by the variables
// "person-id" and "name." The dogs relation has three fields: "person-id",
// "dog-name", and "dog-age." In postgres, we'd take these two relations and do
// a hash or merge join based on the first column of each. In generic join we
// look at all the variables we need to solve for, in this case four of them,
// and then ask each relation which variable they could propose values for.
// These proposals include not just what variable this relation could solve
// for, but also an estimate of how many values the variable would have. In the
// interest of doing the least amount of work possible, we select the proposal
// with the smallest estimate and then for each proposed value of the variable,
// we ask all the other relations if they "accept" the value.  If they do, we
// recursively solve for the rest of the variables in depth-first fashion.
//
// In this algorithm, each relation acts as a constraint on the space of
// valid solutions. We don't just look at every row in the people table or
// every row in the dogs table, but instead look at the unique values per
// variable given some set of already solved variables. We call that
// solved set of variables a "prefix". So when we ask a constraint to propose
// values, we hand it the prefix and ask it which variable it would solve for
// next. We then ask each constraint if they accept the new prefix and continue
// to solve for the rest of the variables. By selecting the proposal with the
// smallest estimate, we can make some interesting guarantees about the upper
// bound [2] of the work we will do to satisfy our join and we side step the
// need for the insanely complex query planners that exist in most commercial
// databases. An interesting aspect of this algorithm is that it's basically
// making planning decisions for every unique value of a variable, which means
// that it is resilient to the high skew you often end up with in real-world
// data.
//
// So the key parts of Generic Join are prefixes, constraints, and proposals,
// which we'll start to layout below. We'll talk more about the ways we have
// to change Generic Join to make it work incrementally later.
//
// [1]: Generic Join is presented in "Skew Strikes Back: New Developments in
//      the Theory of Join Algorithms" https://arxiv.org/abs/1310.3314
// [2]: "Worst-case Optimal Join Algorithms "https://arxiv.org/abs/1203.1952

//------------------------------------------------------------------------
// Prefixes and registers
//------------------------------------------------------------------------

export type Prefix = ID[];

// A register is a numerical offset into a prefix. We can't just make this a
// type alias to number because we need to be able to tell the difference between
// IDs which represent static values and registers which represent dynamic values
// in the prefix. For example I might have a constraint that looks for the
// pattern (register1, "tag", "person"), which if we treated Registers as numbers
// might just look like (1, 2, 3) after the values have been interned. Instead
// we make Register a class.

export class Register {
  constructor(public offset:number) {}
}

export function isRegister(x: any): x is Register {
  return x && x.constructor === Register;
}

// In some cases we have a constraint whose value we may want to ignore.
// IGNORE_REG is a sentinel value that tells us we don't care what the value of
// something is when we're solving.
export var IGNORE_REG = null;
type IgnoreRegister = typeof IGNORE_REG;

//------------------------------------------------------------------------
// Proposal
//------------------------------------------------------------------------

export interface Proposal {
  cardinality:number,
  forFields:Iterator<EAVNField>,
  forRegisters:Iterator<Register>,
  proposer:Constraint,
  skip?:boolean,
  info?:any,
}

//------------------------------------------------------------------------
// Constraints
//------------------------------------------------------------------------

export type NTRCArray = number[];

enum ApplyInputState {
  pass,
  fail,
  none,
}

export interface Constraint {
  isInput:boolean;
  setup():void;
  getRegisters():Register[];
  applyInput(input:Change, prefix:Prefix):ApplyInputState;
  propose(context:EvaluationContext, prefix:Prefix, transaction:number, round:number, results:any[]):Proposal;
  resolveProposal(context:EvaluationContext, prefix:Prefix, proposal:Proposal, transaction:number, round:number, results:any[]):ID[][];
  accept(context:EvaluationContext, prefix:Prefix, transaction:number, round:number, solvingFor:Register[]):boolean;
  acceptInput(context:EvaluationContext, input:Change, prefix:Prefix, transaction:number, round:number):boolean;
  getDiffs(context:EvaluationContext, prefix:Prefix):NTRCArray;
}

//------------------------------------------------------------------------
// Resolved values
//------------------------------------------------------------------------

/** A scan field may contain a register, a static interned value, or the IGNORE_REG sentinel value. */
type ScanField = Register|ID|IgnoreRegister;
/** A resolved value is a scan field that, if it contained a register, now contains the register's resolved value. */
export type ResolvedValue = ID|undefined|IgnoreRegister;

type ResolvedEAVN = {e:ResolvedValue, a:ResolvedValue, v:ResolvedValue, n:ResolvedValue};

export class EAVN {
  constructor(public e:ID, public a:ID, public v:ID, public n:ID) {}
};

type EAV = [ID, ID, ID];
export type RawEAV = [RawValue, RawValue, RawValue];
export type RawEAVC = [RawValue, RawValue, RawValue, number];

//------------------------------------------------------------------------
// Move Constraint
//------------------------------------------------------------------------

export class MoveConstraint {

  constructor(public from:Register|ID, public to:Register) { }

  proposal:Proposal = {cardinality: 1, forFields: new Iterator<EAVNField>(), forRegisters: new Iterator<Register>(), proposer: this};
  registers:Register[] = createArray("MoveConstriantRegisters");
  resolved:(ID|undefined)[] = createArray("MoveConstraintResolved");

  isInput:boolean = false;
  setup():void {
    if(isRegister(this.from)) {
      this.registers.push(this.from);
    }
    this.registers.push(this.to);

    // we are always only proposing for our to register
    this.proposal.forRegisters.clear();
    this.proposal.forRegisters.push(this.to);
  }

  resolve(prefix:Prefix) {
    if(isRegister(this.from)) {
      this.resolved[0] = prefix[this.from.offset];
    } else {
      this.resolved[0] = this.from;
    }
    this.resolved[1] = prefix[this.to.offset];
    return this.resolved;
  }

  getRegisters():Register[] {
    return this.registers;
  }

  applyInput(input:Change, prefix:Prefix):ApplyInputState {
    return ApplyInputState.none;
  }

  propose(context:EvaluationContext, prefix:Prefix, transaction:number, round:number, results:any[]):Proposal {
    let [from, to] = this.resolve(prefix);
    this.proposal.skip = true;
    if(from !== undefined && to === undefined) {
      this.proposal.skip = false;
    }
    return this.proposal;
  }

  resolveProposal(context:EvaluationContext, prefix:Prefix, proposal:Proposal, transaction:number, round:number, results:any[]):ID[][] {
    let [from, to] = this.resolve(prefix);
    let arr = createArray("MoveResult") as Prefix;
    arr[0] = from!;
    return arr as any;
  }

  accept(context:EvaluationContext, prefix:Prefix, transaction:number, round:number, solvingFor:Register[]):boolean {
    let [from, to] = this.resolve(prefix);
    if(from !== undefined && to !== undefined) {
      return from == to;
    }
    return true;
  }

  acceptInput(context:EvaluationContext, input:Change, prefix:Prefix, transaction:number, round:number):boolean {
    return this.accept(context, prefix, transaction, round, this.registers);
  }

  getDiffs(context:EvaluationContext, prefix:Prefix):NTRCArray {
    throw new Error("Asking for Diffs from MoveConstraint");
  }
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

  isInput:boolean = false;
  proposal:Proposal = {cardinality: 0, forFields: new Iterator<EAVNField>(), forRegisters: new Iterator<Register>(), proposer: this};

  /**
   * Resolve each scan field.
   * The resolved object may contain one of three possible value types:
   * - IGNORE_REG -- this field is entirely ignored by the scan.
   * - undefined -- this field is a register that hasn't been filled in yet.
   *                We'll fill it if possible.
   * - ID -- this field contains a static or already solved value.
   */
  resolve(prefix:Prefix) {
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
  applyInput(input:Change, prefix:Prefix) {
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

  propose(context:EvaluationContext, prefix:Prefix, transaction:number, round:number, results:any[]):Proposal {
    let {index} = context;
    let {e,a,v,n} = this.resolve(prefix);
    this.proposal.skip = false;
    let proposal = index.propose(this.proposal, e, a, v, n, transaction, round);
    let {forRegisters, forFields} = proposal;

    forRegisters.clear();
    let field;
    while((field = forFields.next()) !== undefined) {
      forRegisters.push(this[field as EAVNField] as Register);
    }
    if(proposal.forFields.length === 0) proposal.skip = true;
    return proposal;
  }

  resolveProposal(context:EvaluationContext, prefix:Prefix, proposal:Proposal, transaction:number, round:number, results:any[]):ID[][] {
    let {index} = context;
    return index.resolveProposal(proposal);
  }

  accept(context:EvaluationContext, prefix:Prefix, transaction:number, round:number, solvingFor:Register[]):boolean {
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
    let {e,a,v,n} = this.resolve(prefix);
    if(!solving) return true;
    // let {e,a,v,n} = this.resolve(prefix);
    return context.index.check(e, a, v, n, transaction, round);
  }

  acceptInput(context:EvaluationContext, input:Change, prefix:Prefix, transaction:number, round:number):boolean {
    let {e,a,v,n} = this.resolve(prefix);
    if((e === IGNORE_REG || input.e === e) &&
       (a === IGNORE_REG || input.a === a) &&
       (v === IGNORE_REG || input.v === v) &&
       (n === IGNORE_REG || input.n === n)) {
      return true;
    } else {
      return this.accept(context, prefix, transaction, round, this.registers);
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

  getDiffs(context:EvaluationContext, prefix:Prefix):NTRCArray {
    let {e,a,v,n} = this.resolve(prefix);
    return context.index.getDiffs(e,a,v,n);
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

  static filter = false;
  static variadic = false;
  static fetchInfo(name:string):typeof FunctionConstraint {
    let info = FunctionConstraint.registered[name];
    if(!info) throw new Error("No function info for: " + name);
    return info;
  }

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
  estimate?:(context:EvaluationContext, prefix:Prefix, transaction:number, round:number) => number
  isInput:boolean = false;

  fieldNames:string[];
  proposal:Proposal = {cardinality:0, forFields: new Iterator<EAVNField>(), forRegisters: new Iterator<Register>(), proposer: this};
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
  resolve(prefix:Prefix) {
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
  resolveRest(prefix:Prefix) {
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
  applyInput(input:Change, prefix:Prefix):ApplyInputState { return ApplyInputState.none; }

  propose(context:EvaluationContext, prefix:Prefix, transaction:number, round:number, results:any[]):Proposal {
    let proposal = this.proposal;
    proposal.forRegisters.clear();
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
      proposal.cardinality = this.estimate(context, prefix, transaction, round);

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
  packInputs(prefix:Prefix) {
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
    if(!outputs) return;
    for(let ix = 0; ix < outputs.length; ix++) {
      // @NOTE: we'd like to use arenaIntern here, but because of intermediate values
      // that's not currently a possibility. We should revisit this if a practical solution
      // for arenas surfaces.
      outputs[ix] = GlobalInterner.intern(outputs[ix]);
    }
    return outputs as Prefix;
  }

  resolveProposal(context:EvaluationContext, prefix:Prefix, proposal:Proposal, transaction:number, round:number, results:any[]):ID[][] {
    // First we build the args array to provide the apply function.
    let inputs = this.packInputs(prefix);

    // Then we actually apply it and then unpack the outputs.
    // @FIXME: We don't have any intelligent support for not computing unnecessary returns atm.
    // @FIXME: We only support single-return atm.
    let outputs = this.unpackOutputs(this.apply.apply(this, inputs));
    if(!outputs) return results;

    // Finally, if we had results, we create the result prefixes and pass them along.
    let result = createArray("functionResult") as Prefix;

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

  accept(context:EvaluationContext, prefix:Prefix, transaction:number, round:number, solvingFor:Register[]):boolean {
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

  acceptInput(context:EvaluationContext, input:Change, prefix:Prefix, transaction:number, round:number):boolean {
    return this.accept(context, prefix, transaction, round, this.registers);
  }

  getDiffs(context:EvaluationContext, prefix:Prefix):NTRCArray {
    return [];
  }
}

interface FunctionSetup {
  name:string,
  variadic?: boolean,
  args:{[argName:string]: string},
  returns:{[argName:string]: string},
  apply:(... things: any[]) => undefined|(number|string)[],
  estimate?:(index:Index, prefix:Prefix, transaction:number, round:number) => number
}

export function makeFunction({name, variadic = false, args, returns, apply, estimate}:FunctionSetup) {
  class NewFunctionConstraint extends FunctionConstraint {
    static variadic = variadic;
    static filter = Object.keys(returns).length === 0;
    name = name;
    args = args;
    returns = returns;
    argNames = Object.keys(args);
    returnNames = Object.keys(returns);
    apply = apply;
  }
  FunctionConstraint.register(name, NewFunctionConstraint);
}

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
  exec(context:EvaluationContext, input:Change, prefix:Prefix, transaction:number, round:number, results:Iterator<Prefix>, changes:Transaction):boolean;
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
  registerLookup:boolean[];
  registerArrays:Register[][];
  proposedResultsArrays:ID[][];
  emptyProposal:Proposal = {cardinality: Infinity, forFields: new Iterator<EAVNField>(), forRegisters: new Iterator<Register>(), skip: true, proposer: {} as Constraint};
  inputCount:Multiplicity;
  protected affectedConstraints = new Iterator<Constraint>();

  constructor(public constraints:Constraint[]) {
    // We need to find all the registers contained in our scans so that
    // we know how many rounds of Generic Join we need to do.
    let registerLength = 0;
    let registerLookup = [];
    let registers = createArray() as Register[][];
    let proposedResultsArrays = createArray() as ID[][];
    for(let constraint of constraints) {
      constraint.setup();
      for(let register of constraint.getRegisters()) {
        if(!registerLookup[register.offset]) {
          registers.push(createArray() as Register[]);
          proposedResultsArrays.push(createArray() as Prefix);
          registerLookup[register.offset] = true;
          registerLength++;
        }
      }
    }
    this.registerLookup = registerLookup;
    this.registerArrays = registers;
    this.registerLength = registerLength;
    this.proposedResultsArrays = proposedResultsArrays;
  }

  findAffectedConstraints(input:Change, prefix:Prefix):Iterator<Constraint> {
    // @TODO: Hoist me out.
    let affectedConstraints = this.affectedConstraints;
    affectedConstraints.clear();
    for(let ix = 0, len = this.constraints.length; ix < len; ix++) {
      let constraint = this.constraints[ix];
      let result = constraint.applyInput(input, prefix);

      if(result !== ApplyInputState.none) {
        affectedConstraints.push(constraint);
      }
    }

    return affectedConstraints;
  }

  applyCombination(context:EvaluationContext, input:Change, prefix:Prefix, transaction:number, round:number, results:Iterator<Prefix>) {
    //debug("        Join combo:", prefix.slice());
    let countOfSolved = 0;
    for(let ix = 0; ix < this.registerLookup.length; ix++) {
      if(!this.registerLookup[ix]) continue;
      if(prefix[ix] !== undefined) countOfSolved++;
    }
    let remainingToSolve = this.registerLength - countOfSolved;
    let valid = this.presolveCheck(context, input, prefix, transaction, round);
    if(!valid) {
      // do nothing
      return false;

    } else if(!remainingToSolve) {
      // if it is valid and there's nothing left to solve, then we've found
      // a full result and we should just continue
      prefix[prefix.length - 2] = round;
      prefix[prefix.length - 1] = input.count;
      results.push(copyArray(prefix, "results"));
      prefix[prefix.length - 2] = undefined as any;
      prefix[prefix.length - 1] = undefined as any;
      return true;

    } else {
      //debug("              GJ:", remainingToSolve, this.constraints);
      // For each node, find the new results that match the prefix.
      let ol = results.length;
      this.genericJoin(context, prefix, transaction, round, results, remainingToSolve);
      return true;
    }
  }

  unapplyConstraint(constraint:Constraint, prefix:Prefix) {
    for(let register of constraint.getRegisters()) {
      prefix[register.offset] = undefined as any;
    }
  }

  presolveCheck(context:EvaluationContext, input:Change, prefix:Prefix, transaction:number, round:number):boolean {
    let {constraints} = this;

    for(let constraint of constraints) {
      let valid = constraint.acceptInput(context, input, prefix, transaction, round);
      if(!valid) {
        return false;
      }
    }

    return true;
  }

  computeMultiplicities(results:Iterator<Prefix>, prefix:Prefix, currentRound:number, diffs: NTRCArray[], diffIndex:number = -1) {
    if(diffIndex === -1) {
      prefix[prefix.length - 2] = currentRound;
      prefix[prefix.length - 1] = this.inputCount;
      this.computeMultiplicities(results, prefix, currentRound, diffs, diffIndex + 1);
      prefix[prefix.length - 2] = undefined as any;
      prefix[prefix.length - 1] = undefined as any;
    } else if(diffIndex === diffs.length) {
      results.push(copyArray(prefix, "gjResultsArray"));
    } else {
      let startingRound = prefix[prefix.length - 2];
      let startingMultiplicity = prefix[prefix.length - 1];
      let ntrcs = diffs[diffIndex];
      let roundToMultiplicity:{[round:number]: number} = {};
      let maxRound = currentRound;
      for(let ix = 0; ix < ntrcs.length; ix += 4) {
        // n = ix, t = ix + 1, r = ix + 2, c = ix + 3
        let round = ntrcs[ix + 2];
        let count = ntrcs[ix + 3];
        let v = roundToMultiplicity[round] || 0;
        roundToMultiplicity[round] = v + count;
        maxRound = Math.max(maxRound, round);
      }
      let currentRoundCount = 0;
      for(let round = 0; round <= currentRound; round++) {
        let count = roundToMultiplicity[round];
        if(count) currentRoundCount += count;
      }
      if(currentRoundCount) {
        prefix[prefix.length - 2] = currentRound;
        prefix[prefix.length - 1] = startingMultiplicity * currentRoundCount;
        this.computeMultiplicities(results, prefix, currentRound, diffs, diffIndex + 1);
      }
      for(let round = currentRound + 1; round <= maxRound; round++) {
        let count = roundToMultiplicity[round];
        if(!count) continue;
        prefix[prefix.length - 2] = Math.max(startingRound, round);
        prefix[prefix.length - 1] = startingMultiplicity * count;
        this.computeMultiplicities(results, prefix, currentRound, diffs, diffIndex + 1);
      }
      prefix[prefix.length - 2] = startingRound;
      prefix[prefix.length - 1] = startingMultiplicity;
    }
    return results;
  }

  genericJoin(context:EvaluationContext, prefix:Prefix, transaction:number, round:number, results:Iterator<Prefix>, roundIx:number = this.registerLength):Iterator<Prefix> {
    let {constraints, emptyProposal} = this;
    let proposedResults = this.proposedResultsArrays[roundIx - 1];
    let forRegisters:Register[] = this.registerArrays[roundIx - 1];
    proposedResults.length = 0;

    let bestProposal:Proposal = emptyProposal;

    for(let constraint of constraints) {
      let current = constraint.propose(context, prefix, transaction, round, proposedResults);
      if(!current.skip && current.cardinality === 0) {
        return results;
      } else if(current.cardinality < bestProposal.cardinality && !current.skip) {
        bestProposal = current;
      }
    }

    if(bestProposal.skip) {
      //debug("             BAILING", bestProposal);
      return results;
    }


    let {proposer} = bestProposal;
    // We have to copy here because we need to keep a reference to this even if later
    // rounds might overwrite the proposal
    moveArray(bestProposal.forRegisters.array, forRegisters);
    let resolved:any[] = proposer.resolveProposal(context, prefix, bestProposal, transaction, round, proposedResults);
    if(resolved[0].constructor === Array) {
      resultLoop: for(let result of resolved) {
        let ix = 0;
        for(let register of forRegisters) {
          prefix[register.offset] = result[ix];
          ix++;
        }
        for(let constraint of constraints) {
          if(constraint === proposer) continue;
          if(!constraint.accept(context, prefix, transaction, round, forRegisters)) {
            continue resultLoop;
          }
        }
        if(roundIx === 1) {
          let diffs = [];
          for(let constraint of constraints) {
            if(constraint.isInput || !(constraint instanceof Scan)) continue;
            diffs.push(constraint.getDiffs(context, prefix));
          }
          this.computeMultiplicities(results, prefix, round, diffs);
        } else {
          this.genericJoin(context, prefix, transaction, round, results, roundIx - 1);
        }
      }
    } else {
      let register = forRegisters[0];
      resultLoop: for(let result of resolved) {
        prefix[register.offset] = result as ID;
        for(let constraint of constraints) {
          if(constraint === proposer) continue;
          if(!constraint.accept(context, prefix, transaction, round, forRegisters)) {
            //debug("             BAILING", printConstraint(constraint));
            continue resultLoop;
          }
        }
        if(roundIx === 1) {
          let diffs = [];
          for(let constraint of constraints) {
            if(constraint.isInput || !(constraint instanceof Scan)) continue;
            diffs.push(constraint.getDiffs(context, prefix));
          }
          this.computeMultiplicities(results, prefix, round, diffs);
        } else {
          this.genericJoin(context, prefix, transaction, round, results, roundIx - 1);
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

  exec(context:EvaluationContext, input:Change, prefix:Prefix, transaction:number, round:number, results:Iterator<Prefix>):boolean {
    this.inputCount = input.count;
    let didSomething = false;
    let affectedConstraints = this.findAffectedConstraints(input, prefix);

    // @FIXME: This is frivolously wasteful.
    for(let constraintIxz = 0; constraintIxz < affectedConstraints.length; constraintIxz++) {
      let constraint = affectedConstraints.array[constraintIxz];
      this.unapplyConstraint(constraint, prefix);
    }

    let combinationCount = Math.pow(2, affectedConstraints.length);
    for(let comboIx = combinationCount - 1; comboIx > 0; comboIx--) {
      //console.log("  Combo:", comboIx);

      let constraint;
      affectedConstraints.reset();
      while((constraint = affectedConstraints.next()) !== undefined) {
        this.unapplyConstraint(constraint, prefix);
      }

      let shouldApply = true;

      for(let constraintIx = 0; constraintIx < affectedConstraints.length; constraintIx++) {
        let mask = 1 << constraintIx;
        let isIncluded = (comboIx & mask) !== 0;
        let constraint = affectedConstraints.array[constraintIx];
        constraint.isInput = isIncluded;

        if(isIncluded) {
          let valid = constraint.applyInput(input, prefix);
          // If any member of the input constraints fails, this whole combination is doomed.
          if(valid === ApplyInputState.fail) {
            shouldApply = false;
            break;
          }
          //console.log("    " + printConstraint(constraint));
        }
      }

      //console.log("    ", printPrefix(prefix));
      if(shouldApply) {
        didSomething = this.applyCombination(context, input, prefix, transaction, round, results) || didSomething;
      }
    }

    affectedConstraints.reset();
    let constraint;
    while((constraint = affectedConstraints.next()) !== undefined) {
      constraint.isInput = false;
    }

    return didSomething;
  }

}

export class DownstreamJoinNode extends JoinNode {
  exec(context:EvaluationContext, input:Change, prefix:Prefix, transaction:number, round:number, results:Iterator<Prefix>):boolean {
    this.inputCount = prefix[prefix.length - 1];
    return this.applyCombination(context, input, prefix, transaction, round, results);
  }
}

export class WatchNode implements Node {
  constructor(public e:ID|Register,
              public a:ID|Register,
              public v:ID|Register,
              public n:ID|Register,
              public blockId:number) {}

  protected resolved:ResolvedFields = {};
  resolve = Scan.prototype.resolve;

  exec(context:EvaluationContext, input:Change, prefix:Prefix, transactionId:number, round:number, results:Iterator<Prefix>, transaction:Transaction):boolean {
    let resolved = this.resolve(prefix);
    let {e,a,v,n} = resolved;

    // @NOTE: This is wasteful.
    results.push(prefix);

    if(e === undefined || a === undefined || v === undefined || n === undefined) {
      throw new Error(`Unable to produce an output with an undefined EAVN field [${e}, ${a}, ${v}, ${n}]`);
    }

    let prefixRound = prefix[prefix.length - 2];
    let prefixCount = prefix[prefix.length - 1];

    // @FIXME: Make sure I still work now that I'm sending all my deltas. I think I still need to use local intermediates.
    let change = new Change(e!, a!, v!, n!, transactionId, prefixRound + 1, prefixCount);
    transaction.export(this.blockId, change);
    return true;
  }
}

export class OutputWrapperNode implements Node {
  constructor(public nodes:OutputNode[]) {}

  changes = new Iterator<Change>();

  exec(context:EvaluationContext, input:Change, prefix:Prefix, transactionId:number, round:number, results:Iterator<Prefix>, transaction:Transaction):boolean {
    let {distinctIndex} = context;
    let {changes} = this;
    changes.clear();
    for(let node of this.nodes) {
      node.exec(context, input, prefix, transactionId, round, changes, transaction);
    }

    changes.reset();
    let change;
    while(change = changes.next()) {
      transaction.output(context, change);
    }

    return true;
  }
}

export interface OutputNode {
  exec(context:EvaluationContext, input:Change, prefix:Prefix, transactionId:number, round:number, results:Iterator<Change>, transaction:Transaction):void;
}

export class InsertNode implements OutputNode {
  multiplier:number = 1;

  constructor(public e:ID|Register,
              public a:ID|Register,
              public v:ID|Register,
              public n:ID|Register) {}

  protected resolved:ResolvedEAVN = {e: undefined, a: undefined, v:undefined, n: undefined};

  resolve = Scan.prototype.resolve;

  exec(context:EvaluationContext, input:Change, prefix:Prefix, transactionId:number, round:number, results:Iterator<Change>, transaction:Transaction):boolean {
    let resolved = this.resolve(prefix);
    let {e,a,v,n} = resolved;

    if(e === undefined || a === undefined || v === undefined || n === undefined) {
      throw new Error(`Unable to produce an output with an undefined EAVN field [${e}, ${a}, ${v}, ${n}]`);
    }

    let prefixRound = prefix[prefix.length - 2];
    let prefixCount = prefix[prefix.length - 1];

    let change = new Change(e!, a!, v!, n!, transactionId, prefixRound + 1, prefixCount * this.multiplier);
    results.push(change);
    return true;
  }
}

export class CommitInsertNode extends InsertNode {
  lastRound = 0;
  lastTransaction = 0;
  roundCounts:{[key:string]:number} = {};

  shouldOutput(resolved:ResolvedEAVN, prefixRound:number, prefixCount:Multiplicity, transaction:Transaction) {
    if(this.lastRound !== transaction.round || this.lastTransaction !== transaction.transaction) {
      this.lastTransaction = transaction.transaction;
      this.lastRound = transaction.round;
      this.roundCounts = {};
    }

    let {roundCounts} = this;
    let {e,a,v,n} = resolved;
    let key = `${e}|${a}|${v}|`;
    let prevCount = roundCounts[key] || 0;
    let newCount = prevCount + prefixCount;
    roundCounts[key] = newCount;

    // if we said something previously and now we're saying nothing, we should be negative
    // if we haven't said anything and we get a negative, we should be 0
    let delta = 0;
    if(prevCount > 0 && newCount <= 0) delta = -1;
    if(prevCount === 0 && newCount > 0) delta = 1;

    //debug("       C?? <-", e, a, v, prefixRound + 1, {prevCount, newCount, delta})
    return delta;
  }

  exec(context:EvaluationContext, input:Change, prefix:Prefix, transactionId:number, round:number, results:Iterator<Change>, transaction:Transaction):boolean {
    let resolved = this.resolve(prefix);
    let {e,a,v,n} = resolved;

    if(e === undefined || a === undefined || v === undefined || n === undefined) {
      throw new Error(`Unable to produce an output with an undefined EAVN field [${e}, ${a}, ${v}, ${n}]`);
    }

    let prefixRound = prefix[prefix.length - 2];
    let prefixCount = prefix[prefix.length - 1];

    // @FIXME: Does direction matter here?
    if(this.shouldOutput(resolved, prefixRound, prefixCount, transaction)) {
      let change = new Change(e!, a!, v!, n!, transactionId, prefixRound + 1, prefixCount * this.multiplier);
      results.push(change);
    }
    return true;
  }
}

export class RemoveNode extends InsertNode {
  multiplier:number = -1;

  shouldOutput(resolved:ResolvedEAVN, prefixRound:number, prefixCount:Multiplicity, transaction:Transaction) {
    return true;
  }

  exec(context:EvaluationContext, input:Change, prefix:Prefix, transactionId:number, round:number, results:Iterator<Change>, transaction:Transaction):boolean {
    let resolved = this.resolve(prefix);
    let {e,a,v,n} = resolved;

    if(e === undefined || a === undefined || (v === undefined && this.v !== IGNORE_REG) || n === undefined) {
      return false;
    }

    let prefixRound = prefix[prefix.length - 2];
    let prefixCount = prefix[prefix.length - 1];

    if(this.v !== IGNORE_REG) {
      // @FIXME: We're unsure why it's correct to not match on the
      // input in the specified v case here the way we have to in the
      // unspecified v case. The only examples it could impact
      // (e.g. removing a specific EAV matching the input works this
      // way).

      let delta = this.shouldOutput(resolved, prefixRound, prefixCount, transaction);
      if(delta) {
        let change = new Change(e!, a!, v!, n!, transactionId, prefixRound + 1, prefixCount * this.multiplier);
        results.push(change);
      }

    } else {
      let {index} = context;
      // If we match the input change, we need to remove it too.
      if(e === input.e && a === input.a && (v === input.v || this.v === IGNORE_REG)) {
        resolved.v = input.v;
        if(this.shouldOutput(resolved, prefixRound, prefixCount, transaction)) {
          let change = new Change(e!, a!, input.v, n!, transactionId, prefixRound + 1, prefixCount * this.multiplier);
          results.push(change);
        }
        resolved.v = v;
      }

      let matches = index.get(e, a, IGNORE_REG, IGNORE_REG, transactionId, Infinity);
      for(let {v} of matches) {
        resolved.v = v;
        if(this.shouldOutput(resolved, prefixRound, prefixCount, transaction)) {
          let ntrcs = index.getDiffs(e, a, v, IGNORE_REG);
          let roundToMultiplicity:{[round:number]: number} = {};
          for(let ix = 0; ix < ntrcs.length; ix += 4) {
            // n = ix, t = ix + 1, r = ix + 2, c = ix + 3
            let round = ntrcs[ix + 2];
            let count = ntrcs[ix + 3];
            let cur = roundToMultiplicity[round] || 0;
            roundToMultiplicity[round] = cur + count;
          }
          for(let roundString in roundToMultiplicity) {
            let curRound = +roundString;
            let count = roundToMultiplicity[curRound] * prefixCount;
            if(count === 0) continue;
            let changeRound = Math.max(prefixRound + 1, curRound);
            let change = new Change(e!, a!, v!, n!, transactionId, changeRound, count * this.multiplier);
            results.push(change);
          }
        }
      }
      resolved.v = v;
    }

    return true;
  }
}

export class CommitRemoveNode extends CommitInsertNode {
  multiplier = -1;

  protected _exec = RemoveNode.prototype.exec;

  exec(context:EvaluationContext, input:Change, prefix:Prefix, transactionId:number, round:number, results:Iterator<Change>, transaction:Transaction):boolean {
    return this._exec(context, input, prefix, transactionId, round, results, transaction);
  }
}

//------------------------------------------------------------------------------
// BinaryFlow
//------------------------------------------------------------------------------

type KeyFunction = (prefix:Prefix) => string;

class IntermediateIndex {
  static CreateKeyFunction(registers:Register[]):KeyFunction {
    let items = registers.map((reg) => {
      return `prefix[${reg.offset}]`;
    })
    let code = `
      return ${items.join(' + "|" + ')};
      `;
    return new Function("prefix", code) as KeyFunction;
  }

  index:{[key:string]: ID[][]} = {};

  // @TODO: we should probably consider compacting these times as they're
  // added
  insert(key:string, prefix:Prefix) {
    let found = this.index[key];
    if(!found) found = this.index[key] = createArray("IntermediateIndexDiffs");
    found.push(prefix);
  }

  get(key:string) {
    return this.index[key];
  }
}

abstract class BinaryFlow implements Node {
  leftResults = new Iterator<Prefix>();
  rightResults = new Iterator<Prefix>();

  constructor(public left:Node, public right:Node) { }

  exec(context:EvaluationContext, input:Change, prefix:Prefix, transaction:number, round:number, results:Iterator<Prefix>, changes:Transaction):boolean {
    let {left, right, leftResults, rightResults} = this;
    leftResults.clear();
    left.exec(context, input, prefix, transaction, round, leftResults, changes);
    rightResults.clear();
    right.exec(context, input, prefix, transaction, round, rightResults, changes);
    let result;
    while((result = leftResults.next()) !== undefined) {
      this.onLeft(context, result, transaction, round, results);
    }
    while((result = rightResults.next()) !== undefined) {
      this.onRight(context, result, transaction, round, results);
    }
    return true;
  }

  abstract onLeft(context:EvaluationContext, prefix:Prefix, transaction:number, round:number, results:Iterator<Prefix>):void;
  abstract onRight(context:EvaluationContext, prefix:Prefix, transaction:number, round:number, results:Iterator<Prefix>):void;
}

export class BinaryJoinRight extends BinaryFlow {
  leftIndex = new IntermediateIndex();
  rightIndex = new IntermediateIndex();
  keyFunc:KeyFunction;

  constructor(public left:Node, public right:Node, public keyRegisters:Register[]) {
    super(left, right);
    this.keyFunc = IntermediateIndex.CreateKeyFunction(keyRegisters);
  }

  onLeft(context:EvaluationContext, prefix:Prefix, transaction:number, round:number, results:Iterator<Prefix>):void {
    let key = this.keyFunc(prefix);
    let count = prefix[prefix.length - 1];
    this.leftIndex.insert(key, prefix);
    let diffs = this.rightIndex.get(key)
    //debug("       left", key, printPrefix(prefix), diffs);
    if(!diffs) return;
    for(let rightPrefix of diffs) {
      let rightRound = rightPrefix[rightPrefix.length - 2];
      let rightCount = rightPrefix[rightPrefix.length - 1];
      let upperBound = Math.max(round, rightRound);
      let result = copyArray(rightPrefix, "BinaryJoinResult");
      result[result.length - 2] = upperBound;
      result[result.length - 1] = count * rightCount;
      results.push(result);
    }
  }

  onRight(context:EvaluationContext, prefix:Prefix, transaction:number, round:number, results:Iterator<Prefix>):void {
    let key = this.keyFunc(prefix);
    let count = prefix[prefix.length - 1];
    this.rightIndex.insert(key, prefix);
    let diffs = this.leftIndex.get(key)
    //debug("       right", key, printPrefix(prefix), diffs);
    if(!diffs) return;
    for(let leftPrefix of diffs) {
      let leftRound = leftPrefix[leftPrefix.length - 2];
      let leftCount = leftPrefix[leftPrefix.length - 1];
      let upperBound = Math.max(round, leftRound);
      let result = copyArray(prefix, "BinaryJoinResult");
      result[result.length - 2] = upperBound;
      result[result.length - 1] = count * leftCount;
      results.push(result);
      //debug("               -> ", printPrefix(result));
    }
  }
}

export class AntiJoin extends BinaryFlow {
  leftIndex = new IntermediateIndex();
  rightIndex = new IntermediateIndex();
  keyFunc:KeyFunction;

  constructor(public left:Node, public right:Node, public keyRegisters:Register[]) {
    super(left, right);
    this.keyFunc = IntermediateIndex.CreateKeyFunction(keyRegisters);
  }

  exec(context:EvaluationContext, input:Change, prefix:Prefix, transaction:number, round:number, results:Iterator<Prefix>, changes:Transaction):boolean {
    //debug("            antijoin:")
    return super.exec(context,input,prefix,transaction,round,results,changes);
  }

  onLeft(context:EvaluationContext, prefix:Prefix, transaction:number, round:number, results:Iterator<Prefix>):void {
    let key = this.keyFunc(prefix);
    let count = prefix[prefix.length - 1];
    this.leftIndex.insert(key, prefix);
    let diffs = this.rightIndex.get(key)
    //debug("                left:", key, count, diffs)
    if(!diffs || !diffs.length) {
      //debug("                    ->", key, count, diffs)
      return results.push(prefix);
    } else {
      let sum = 0;
      for(let diff of diffs) {
        let count = diff[diff.length - 1];
        sum += count;
      }
      if(!sum) {
        return results.push(prefix);
      }
    }
  }

  onRight(context:EvaluationContext, prefix:Prefix, transaction:number, round:number, results:Iterator<Prefix>):void {
    let key = this.keyFunc(prefix);
    let count = prefix[prefix.length - 1];
    this.rightIndex.insert(key, prefix);
    let diffs = this.leftIndex.get(key)
    //debug("                right:", key, count, diffs.slice())
    if(!diffs) return;
    for(let leftPrefix of diffs) {
      let leftRound = leftPrefix[leftPrefix.length - 2];
      let leftCount = leftPrefix[leftPrefix.length - 1];
      let upperBound = Math.max(round, leftRound);
      let result = copyArray(leftPrefix, "AntiJoinResult");
      result[result.length - 2] = upperBound;
      result[result.length - 1] = count * leftCount * -1;
      results.push(result);
      //debug("                    ->", key, count, leftCount, result[result.length - 1])
    }
  }
}

export class AntiJoinPresolvedRight extends AntiJoin {
  exec(context:EvaluationContext, input:Change, prefix:Prefix, transaction:number, round:number, results:Iterator<Prefix>, changes:Transaction):boolean {
    let {left, right, leftResults, rightResults} = this;
    leftResults.clear();
    left.exec(context, input, prefix, transaction, round, leftResults, changes);
    rightResults.reset();
    let result;
    while((result = leftResults.next()) !== undefined) {
      this.onLeft(context, result, transaction, round, results);
    }
    while((result = rightResults.next()) !== undefined) {
      this.onRight(context, result, transaction, round, results);
    }
    return true;
  }
}

export class UnionFlow implements Node {
  constructor(public branches:Node[], public registers:Register[]) { }

  exec(context:EvaluationContext, input:Change, prefix:Prefix, transaction:number, round:number, results:Iterator<Prefix>, changes:Transaction):boolean {
    for(let node of this.branches) {
      node.exec(context, input, prefix, transaction, round, results, changes);
    }
    return true;
  }
}

export class ChooseFlow implements Node {
  branches:Node[] = [];
  branchResults:Iterator<Prefix>[] = [];

  constructor(initialBranches:Node[], public registers:Register[]) {
    let {branches, branchResults} = this;
    let prev:Node|undefined;
    for(let branch of initialBranches) {
      if(prev) {
        branches.push(new AntiJoinPresolvedRight(branch, prev, registers));
      } else {
        branches.push(branch);
      }
      branchResults.push(new Iterator<Prefix>());
      prev = branch;
    }
  }

  exec(context:EvaluationContext, input:Change, prefix:Prefix, transaction:number, round:number, results:Iterator<Prefix>, changes:Transaction):boolean {
    let {branchResults, branches} = this;
    let prev:Iterator<Prefix>|undefined;
    let ix = 0;
    for(let node of branches) {
      if(prev) {
        (node as AntiJoinPresolvedRight).rightResults = prev;
      }
      let branchResult = branchResults[ix];
      branchResult.clear();
      node.exec(context, input, prefix, transaction, round, branchResult, changes);
      let result;
      while((result = branchResult.next()) !== undefined) {
        results.push(result);
      }
      prev = branchResult;
      ix++;
    }
    return true;
  }
}

export class MergeAggregateFlow extends BinaryFlow {
  leftIndex = new IntermediateIndex();
  rightIndex = new IntermediateIndex();
  keyFunc:KeyFunction;

  constructor(public left:Node, public right:Node, public keyRegisters:Register[], public registersToMerge:Register[]) {
    super(left, right);
    this.keyFunc = IntermediateIndex.CreateKeyFunction(keyRegisters);
  }

  merge(left:Prefix, right:Prefix) {
    for(let register of this.registersToMerge) {
      left[register.offset] = right[register.offset];
    }
  }

  onLeft(context:EvaluationContext, prefix:Prefix, transaction:number, round:number, results:Iterator<Prefix>):void {
    let key = this.keyFunc(prefix);
    let count = prefix[prefix.length - 1];
    this.leftIndex.insert(key, prefix);
    let diffs = this.rightIndex.get(key)
    //debug("       left", key, printPrefix(prefix), diffs);
    if(!diffs) return;
    for(let rightPrefix of diffs) {
      let rightRound = rightPrefix[rightPrefix.length - 2];
      let rightCount = rightPrefix[rightPrefix.length - 1];
      let upperBound = Math.max(round, rightRound);
      let result = copyArray(prefix, "MergeAggregateResult");
      this.merge(result, rightPrefix);
      result[result.length - 2] = upperBound;
      result[result.length - 1] = count * rightCount;
      results.push(result);
    }
  }

  onRight(context:EvaluationContext, prefix:Prefix, transaction:number, round:number, results:Iterator<Prefix>):void {
    let key = this.keyFunc(prefix);
    let count = prefix[prefix.length - 1];
    this.rightIndex.insert(key, prefix);
    let diffs = this.leftIndex.get(key)
    //debug("       right", key, printPrefix(prefix), diffs);
    if(!diffs) return;
    for(let leftPrefix of diffs) {
      let leftRound = leftPrefix[leftPrefix.length - 2];
      let leftCount = leftPrefix[leftPrefix.length - 1];
      let upperBound = Math.max(round, leftRound);
      let result = copyArray(leftPrefix, "MergeAggregateResult");
      this.merge(result, prefix);
      result[result.length - 2] = upperBound;
      result[result.length - 1] = count * leftCount;
      results.push(result);
      //debug("               -> ", printPrefix(result));
    }
  }

  exec(context:EvaluationContext, input:Change, prefix:Prefix, transaction:number, round:number, results:Iterator<Prefix>, changes:Transaction):boolean {
    //debug("        AGG MERGE");
    let result;
    let {left, right, leftResults, rightResults} = this;
    leftResults.clear();
    left.exec(context, input, prefix, transaction, round, leftResults, changes);
    //debug("              left results: ", leftResults);

    // we run the left's results through the aggregate to capture all the aggregate updates
    rightResults.clear();
    while((result = leftResults.next()) !== undefined) {
      //debug("              left result: ", result.slice());
      right.exec(context, input, result, transaction, round, rightResults, changes);
    }

    // now we go through all the lefts and rights like normal
    leftResults.reset();
    while((result = leftResults.next()) !== undefined) {
      this.onLeft(context, result, transaction, round, results);
    }
    while((result = rightResults.next()) !== undefined) {
      this.onRight(context, result, transaction, round, results);
    }
    return true;
  }
}

export abstract class AggregateNode implements Node {
  groupKey:Function;
  projectKey:Function;
  groups:{[group:string]: {result:any[], [projection:string]: Multiplicity[]}} = {};
  resolved:RawValue[] = [];

  // @TODO: allow for multiple returns
  constructor(public groupRegisters:Register[], public projectRegisters:Register[], public inputs:(ID|Register)[], public results:Register[]) {
    this.groupKey = IntermediateIndex.CreateKeyFunction(groupRegisters);
    this.projectKey = IntermediateIndex.CreateKeyFunction(projectRegisters);
  }

  groupPrefix(group:string, prefix:Prefix) {
    let projection = this.projectKey(prefix);
    let prefixRound = prefix[prefix.length - 2];
    let prefixCount = prefix[prefix.length - 1];
    let delta = 0;
    let found = this.groups[group];
    if(!found) {
      found = this.groups[group] = {result: []};
    }
    let counts = found[projection] || [];
    let totalCount = 0;

    let countIx = 0;
    for(let count of counts) {
      // we need the total up to our current round
      if(countIx > prefixRound) break;
      if(!count) continue;
      totalCount += count;
      countIx++;
    }
    if(totalCount && totalCount + prefixCount <= 0) {
      // subtract
      delta = -1;
    } else if(totalCount === 0 && totalCount + prefixCount > 0) {
      // add
      delta = 1;
    } else if(totalCount + prefixCount < 0) {
      // we have removed more values than exist?
      throw new Error("Negative total count for an aggregate projection");
    } else {
      // otherwise this change doesn't impact the projected count, we've just added
      // or removed a support.
    }
    counts[prefixRound] = (counts[prefixRound] || 0) + prefixCount;
    found[projection] = counts;
    return delta;
  }

  getResultPrefix(prefix:Prefix, result:ID, count:Multiplicity):Prefix {
    let neue = copyArray(prefix, "aggregateResult");
    neue[this.results[0].offset] = result;
    neue[neue.length - 1] = count;
    return neue;
  }

  resolve(prefix:Prefix):RawValue[] {
    let resolved = this.resolved;
    let ix = 0;
    for(let field of this.inputs) {
      if(isRegister(field)) {
        resolved[ix] = GlobalInterner.reverse(prefix[field.offset]);
      } else {
        resolved[ix] = GlobalInterner.reverse(field);
      }
      ix++;
    }
    return resolved;
  }

  stateToResult(state:any):ID {
    let current = this.getResult(state);
    return GlobalInterner.intern(current);
  }

  exec(context:EvaluationContext, input:Change, prefix:Prefix, transaction:number, round:number, results:Iterator<Prefix>, changes:Transaction):boolean {
    let group = this.groupKey(prefix);
    let prefixRound = prefix[prefix.length - 2];
    let delta = this.groupPrefix(group, prefix);
    let op = this.add;
    if(!delta) return false;
    if(delta < 0) op = this.remove;

    let groupStates = this.groups[group].result;
    let currentState = groupStates[prefixRound];
    if(!currentState) {
      // otherwise we have to find the most recent result that we've seen
      for(let ix = 0, len = Math.min(groupStates.length, prefixRound); ix < len; ix++) {
        let current = groupStates[ix];
        if(current === undefined) continue;
        currentState = copyHash(current, "AggregateState");
      }
    }
    let resolved = this.resolve(prefix);
    let start = prefixRound;
    groupStates[prefixRound] = currentState;
    if(!currentState) {
      currentState = groupStates[prefixRound] = op(this.newResultState(), resolved);
      results.push(this.getResultPrefix(prefix, this.stateToResult(currentState), 1));
      start = prefixRound + 1;
    }
    for(let ix = start, len = Math.max(groupStates.length, prefixRound + 1); ix < len; ix++) {
      let current = groupStates[ix];
      if(current === undefined) continue;

      let prevResult = this.getResultPrefix(prefix, this.stateToResult(current), -1);
      current = groupStates[prefixRound] = op(current, resolved);
      let neueResult = this.getResultPrefix(prefix, this.stateToResult(current), 1);
      results.push(prevResult);
      results.push(neueResult);
    }
    return true;
  }

  abstract add(state:any, resolved:RawValue[]):any;
  abstract remove(state:any, resolved:RawValue[]):any;
  abstract getResult(state:any):RawValue;
  abstract newResultState():any;

}

type SumAggregateState = {total:number};
export class SumAggregate extends AggregateNode {
  add(state:SumAggregateState, resolved:RawValue[]):any {
    state.total += resolved[0] as number;
    return state;
  }
  remove(state:SumAggregateState, resolved:RawValue[]):any {
    state.total -= resolved[0] as number;
    return state;
  }
  getResult(state:SumAggregateState):RawValue {
    return state.total;
  }
  newResultState():SumAggregateState {
    return {total: 0};
  };
}


//------------------------------------------------------------------------------
// Block
//------------------------------------------------------------------------------

export class Block {
  constructor(public name:string, public nodes:Node[], public totalRegisters:number) {}

  // We're going to essentially double-buffer the result arrays so we can avoid allocating in the hotpath.
  results = new Iterator<Prefix>();
  initial:Prefix = createArray();
  protected nextResults = new Iterator<Prefix>();

  exec(context:EvaluationContext, input:Change, transaction:Transaction):boolean {
    let blockState = ApplyInputState.none;
    this.results.clear();
    this.results.push(this.initial);
    for(let ix = 0; ix < this.totalRegisters + 2; ix++) {
      this.initial[ix] = undefined as any;
    }
    this.nextResults.clear();
    let prefix;
    // We populate the prefix with values from the input change so we only derive the
    // results affected by it.
    for(let node of this.nodes) {
      while((prefix = this.results.next()) !== undefined) {
        let valid = node.exec(context, input, prefix, transaction.transaction, transaction.round, this.nextResults, transaction);
        if(!valid) {
          return false;
        }
      }
      let tmp = this.results;
      this.results = this.nextResults;
      this.nextResults = tmp;
      // @NOTE: We don't really want to shrink this array probably.
      this.nextResults.clear();
    }

    return true;
  }
}

//------------------------------------------------------------------------------
// EvaluationContext
//------------------------------------------------------------------------------

export class EvaluationContext {
  distinctIndex = new DistinctIndex();
  intermediates:{[key:string]: IntermediateIndex} = {};

  constructor(public index:Index) {}
}

//------------------------------------------------------------------------------
// Transaction
//------------------------------------------------------------------------------

export type ExportHandler = (blockChanges:{[id:number]: Change[]|undefined}) => void;

export class Transaction {
  round = -1;
  protected outputs = new Iterator<Change>();
  protected roundChanges:Change[][] = [];
  protected exportedChanges:{[blockId:number]: Change[]} = {};
  constructor(public transaction:number, public blocks:Block[], public changes:Change[], protected exportHandler?:ExportHandler) {}

  output(context:EvaluationContext, change:Change) {
    let {outputs} = this;
    let {distinctIndex} = context;
    outputs.clear();
    distinctIndex.distinct(change, this.transaction, outputs);

    outputs.reset();
    let output;
    while(output = outputs.next()) {
      //debug("          <-", change.toString())
      let cur = this.roundChanges[output.round] || createArray("roundChangesArray");
      cur.push(output);
      this.roundChanges[output.round] = cur;
    }
  }

  export(blockId:number, change:Change) {
    if(!this.exportedChanges[blockId]) this.exportedChanges[blockId] = [change];
    else this.exportedChanges[blockId].push(change);
  }

  protected prepareRound(changeIx:number) {
    let {roundChanges, changes} = this;
    let next = changes[changeIx];
    let maxRound = roundChanges.length;
    if(!next && this.round < maxRound) {
      for(let ix = this.round + 1; ix < maxRound; ix++) {
        let nextRoundChanges = roundChanges[ix];
        if(nextRoundChanges) {
          let oldLength = changes.length;
          this.collapseMultiplicity(nextRoundChanges, changes);

          // We only want to break to begin the next fixedpoint when we have something new to run.
          if(oldLength < changes.length) break;
        }
      }
    }
  }

  protected collapseMultiplicity(changes:Change[], results:Change[] /* output */) {
    // We sort the changes to group all the same EAVs together.
    changes.sort((a,b) => {
      let eDiff = a.e - b.e;
      if(!eDiff) {
        let aDiff = a.a - b.a;
        if(!aDiff) {
          return a.v - b.v;
        }
        return aDiff;
      }
      return eDiff;
    });
    let changeIx = 0;
    for(let changeIx = 0; changeIx < changes.length; changeIx++) {
      let current = changes[changeIx];

      // Collapse each subsequent matching EAV's multiplicity into the current one's.
      while(changeIx + 1 < changes.length) {
        let next = changes[changeIx + 1];
        if(next.e == current.e && next.a == current.a && next.v == current.v) {
          current.count += next.count;
          changeIx++;
        } else {
          break;
        }
      }
      // console.log("next round change:", current.toString())
      if(current.count !== 0) results.push(current);
    }

    return results;
  }

  exec(context:EvaluationContext) {
    let {changes, roundChanges} = this;
    let {index} = context;
    let changeIx = 0;
    this.prepareRound(changeIx);
    while(changeIx < changes.length) {
      let change = changes[changeIx];
      this.round = change.round;
      if(this.round > 20) {
        console.error("Failed to terminate");
        break;
      }
      //debug("Round:", this.round);

      //debug("-> " + change, index.hasImpact(change));
      if(index.hasImpact(change)) {
        for(let block of this.blocks) {
          // if(block.name === "Show the targeted tag") {
          //   debug = console.log;
          // } else {
          //   debug = function() {}
          // }
          //debug("    ", block.name);
          let start = changes.length;
          block.exec(context, change, this);
        }
      } else {
        console.warn("NO CHANGE", change.toString())
      }
      //debug("");
      index.insert(change);

      changeIx++;
      this.prepareRound(changeIx);
    }

    let exportingBlocks = Object.keys(this.exportedChanges);
    if(exportingBlocks.length) {
      if(!this.exportHandler) throw new Error("Unable to export changes without export handler.");

      for(let blockId of exportingBlocks) {
        let exports = createArray("exportsArray");
        this.collapseMultiplicity(this.exportedChanges[+blockId], exports);
        this.exportedChanges[+blockId] = exports;
      }
      this.exportHandler(this.exportedChanges);
    }

    // Once the transaction is effectively done, we need to clean up after ourselves. We
    // arena allocated a bunch of IDs related to function call outputs, which we can now
    // safely release.
    GlobalInterner.releaseArena("functionOutput");
  }
}
