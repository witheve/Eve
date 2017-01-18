
type ID = number;

function createHash() {
  return Object.create(null);
}

function isNumber(thing) {
  return typeof thing === "number";
}

export class Interner {
  strings: {[value:string]: ID} = createHash();
  numbers: {[value:number]: ID} = createHash();
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

  get(value: (string|number)): ID {
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

  release(id: ID) {
    this.IDRefCount[id]--;
    if(!this.IDRefCount[id]) {
      let value = this.IDs[id];
      this.numbers[value] = undefined;
      this.strings[value] = undefined;
      this.IDFreeList.push(id);
    }
  }
}

export var GlobalInterner = new Interner();

console.log(GlobalInterner.intern("hey"))
console.log(GlobalInterner.intern("hey"))
console.log(GlobalInterner.intern("yo"))
console.log(GlobalInterner.release(GlobalInterner.get("yo")))
console.log(GlobalInterner.intern("zomg"))
console.log(GlobalInterner.intern("yo"))



