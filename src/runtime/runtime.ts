type ID = number;
type Multiplicity = number;

function createHash() {
  return Object.create(null);
}

function isNumber(thing:any) {
  return typeof thing === "number";
}

export class Interner {
  strings: {[value:string]: ID|undefined} = createHash();
  numbers: {[value:number]: ID|undefined} = createHash();
  IDs: (string|number)[] = [];
  IDRefCount: number[] = [];
  IDFreeList: number[] = [];
  ix: number = 0;

  _getFreeID() {
    return this.IDFreeList.pop() || this.ix++;
  }

  intern(value: (string|number)): ID {
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

  get(value: (string|number)): ID|undefined {
    let coll;
    if(isNumber(value)) {
      coll = this.numbers;
    } else {
      coll = this.strings;
    }
    return coll[value];
  }

  reverse(id: ID): (string|number) {
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

type ResolvedEAVN = {e:ID|undefined|IgnoreRegister, a:ID|undefined|IgnoreRegister, v:ID|undefined|IgnoreRegister, n:ID|undefined|IgnoreRegister};

/**
 * A scan maps a set of bound variables to unbound variables.
 */

class Scan {
  constructor(public e:ScanField,
              public a:ScanField,
              public v:ScanField,
              public n:ScanField) {}

  protected resolved:ResolvedEAVN = {e: undefined, a: undefined, v:undefined, n: undefined};

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
  exec(state:ChangeSet, prefix:ID[], results:ID[][] = []) {
    let resolved = this.resolve(prefix);

    for(let change of state) {
      // For each field that has a pre-existing static or prefix value, bail if the value doesn't match the current change.
      if(!this.fieldUnresolved(resolved, "e") && change.e !== resolved.e) continue;
      if(!this.fieldUnresolved(resolved, "a") && change.a !== resolved.a) continue;
      if(!this.fieldUnresolved(resolved, "v") && change.v !== resolved.v) continue;
      if(!this.fieldUnresolved(resolved, "n") && change.n !== resolved.n) continue;

      // The current change is a match for this scan + prefix, so we'll create a new EAVN containing its values for our output fields.
      let result = [];
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
    let resolved = this.resolve(prefix);

    // If this change isn't relevant to this scan, skip it.
    if(this.notStaticMatch(input, "e")) return true;
    if(this.notStaticMatch(input, "a")) return true;
    if(this.notStaticMatch(input, "v")) return true;
    if(this.notStaticMatch(input, "n")) return true;

    // For each register field of this scan, if the required value is impossible fail, otherwise add this new value to the
    // appropriate register in the prefix.
    // @NOTE: Technically, we republish existing values here too. In practice, that's harmless and eliminates the need for extra
    // branching.
    if(isRegister(this.e)) {
      if(prefix[this.e.offset] !== undefined && prefix[this.e.offset] !== input.e) return false;
      prefix[this.e.offset] = input.e;
    }

    if(isRegister(this.a)) {
      if(prefix[this.a.offset] !== undefined && prefix[this.a.offset] !== input.a) return false;
      prefix[this.a.offset] = input.a;
    }

    if(isRegister(this.v)) {
      if(prefix[this.v.offset] !== undefined && prefix[this.v.offset] !== input.v) return false;
      prefix[this.v.offset] = input.v;
    }

    if(isRegister(this.n)) {
      if(prefix[this.n.offset] !== undefined && prefix[this.n.offset] !== input.n) return false;
      prefix[this.n.offset] = input.n;
    }

    return true;
  }
}

/**
 * Base class for nodes, the building blocks of blocks.
 */
abstract class Node {
  /**
   * See Scan.applyInput()
   */
  abstract applyInput(input:Change, prefix:ID[]):boolean;

  /**
   * See Scan.exec()
   * @NOTE: The result format is slightly different. Rather than a packed list of EAVNs, we instead return a set of valid prefixes.
   */
  abstract exec(state:ChangeSet, prefix:ID[], results?:ID[][], scanIx?:number):ID[][];
}

class JoinNode extends Node {
  constructor(public scans:Scan[]) {
    super();
  }

  applyInput(input:Change, prefix:ID[]) {
    for(let scan of this.scans) {
      if(!scan.applyInput(input, prefix)) return false;
    }
    return true;
  }

  exec(state:ChangeSet, prefix:ID[], results:ID[][] = [], scanIx:number = 0) {
    let scan = this.scans[scanIx];
    let currentPrefix:ID[] = prefix.slice();
    let matches = scan.exec(state, prefix);
    for(let match of matches) {
      if(match[0] !== undefined) currentPrefix[(scan.e as Register).offset] = match[0];
      if(match[1] !== undefined) currentPrefix[(scan.a as Register).offset] = match[1];
      if(match[2] !== undefined) currentPrefix[(scan.v as Register).offset] = match[2];
      if(match[3] !== undefined) currentPrefix[(scan.n as Register).offset] = match[3];

      if(scanIx === this.scans.length - 1) results.push(currentPrefix.slice());
      else this.exec(state, currentPrefix, results, scanIx + 1);
    }

    return results;
  }
}

//------------------------------------------------------------------------------
// Testing logic
//------------------------------------------------------------------------------

// We'll accumulate the current program state here as we stream in changes.
let currentState:ChangeSet = [];

// A list of changesets to stream into the program. Each changeset corresponds to an input event.
let changes:ChangeSet[] = [
  [Change.fromValues("<1>", "tag", "person", 1, 1, 1, 1), Change.fromValues("<1>", "name", "RAB", 1, 1, 1, 1)],
  [Change.fromValues("<2>", "tag", "person", 1, 1, 1, 1), Change.fromValues("<2>", "name", "KERY", 1, 1, 1, 1)],
  [Change.fromValues("<3>", "tag", "dog", 1, 1, 1, 1), Change.fromValues("<3>", "name", "jeff", 1, 1, 1, 1)],
  [Change.fromValues("<4>", "tag", "person", 1, 1, 1, 1)],
  [Change.fromValues("<4>", "name", "BORSCHT", 1, 1, 1, 1)],
];

// Manually created registers for the testing program below.
let eReg = new Register(1);
let vReg = new Register(0);

// Test program. It evaluates:
// search
//   eid = [#person name]
// bind
//   [0: name, 1: eid]
let nodes:Node[] = [
  new JoinNode([
    new Scan(eReg, GlobalInterner.intern("tag"), GlobalInterner.intern("person"), null),
    new Scan(eReg, GlobalInterner.intern("name"), vReg, null),
  ])
];

for(let changeset of changes) {
  for(let change of changeset) {
    console.log("Applying", ""+change);

    // For each change (remember, a single EAVNTFC), we evaluate the program with a fresh prefix.
    let prefix:ID[] = [];
    let failed = false;

    // We populate the prefix with values from the input change so we only derive the
    // results affected by it.
    for(let node of nodes) {
      let ok = node.applyInput(change, prefix);

      // If a scan failed to apply, there is no possible result for this program.
      if(!ok) {
        failed = true;
        break;
      }
    }

    if(failed) {
      console.log("-> FAILED");
    } else if(prefix.length > 0) {
      for(let node of nodes) {
        // For each node, find the new results that match the prefix.
        let results = node.exec(currentState.concat(change), prefix);
        console.log("->", results.map((result) => result.map((value) => GlobalInterner.reverse(value))));
      }
    } else {
      // If there is no affected prefix then tautologically there is no affected result, so we skip execution.
      console.log("-> SKIPPED");
    }

    // Finally, add the new change to the current state and repeat.
    // @NOTE: This doesn't currently respect transaction boundaries.
    currentState.push(change);
  }
}
