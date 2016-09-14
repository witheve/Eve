export type UUID = string;
export type EAV = [string, string, any];
export type Record = any;

//---------------------------------------------------------
// Indexes
//---------------------------------------------------------

type IndexSubscriber<T> = (index: T, dirty: T, self: Index<T>) => void
class Index<T> {
  public index:T = {} as any;
  public dirty:T = {} as any;
  private subscribers:IndexSubscriber<T>[] = [];

  constructor() {}

  subscribe(subscriber:IndexSubscriber<T>) {
    if(this.subscribers.indexOf(subscriber) === -1) {
      this.subscribers.push(subscriber);
      return true;
    }
    return false;
  }

  unsubscribe(subscriber:IndexSubscriber<T>) {
    let ix = this.subscribers.indexOf(subscriber);
    if(ix !== -1) {
      this.subscribers[ix] = this.subscribers.pop()!;
      return true;
    }
    return false;
  }

  dispatchIfDirty() {
    if(Object.keys(this.dirty).length === 0) return;
    for(let subscriber of this.subscribers) {
      subscriber(this.index, this.dirty, this);
    }
  }

  clearDirty() {
    this.dirty = {} as any;
  }

  clearIndex() {
    this.index = {} as any;
  }
}

interface IndexedList<V>{[v: string]: V[]}
export class IndexList<V> extends Index<IndexedList<V>> {
  insert(key: string, value: V) {
    if(!this.index[key] || this.index[key].indexOf(value) === -1) {
      if(!this.index[key]) this.index[key] = [];
      if(!this.dirty[key]) this.dirty[key] = [];
      this.index[key].push(value);
      this.dirty[key].push(value);
      return true;
    }
    return false;
  }

  remove(key: string, value: V) {
    if(!this.index[key]) return false;

    let ix = this.index[key].indexOf(value)
    if(ix !== -1) {
      if(!this.dirty[key]) this.dirty[key] = [];
      this.index[key][ix] = this.index[key].pop()!;
      this.dirty[key].push(value);
      return true;
    }
    return false;
  }
};

interface IndexedScalar<V>{[v: string]: V}
export class IndexScalar<V> extends Index<IndexedScalar<V>> {
  insert(key: string, value: V) {
    if(this.index[key] === undefined) {
      this.index[key] = value;
      this.dirty[key] = value;
      return true;
    } else if(this.index[key] !== value) {
      throw new Error(`Unable to set multiple values on scalar index for key: '${key}' old: '${this.index[key]}' new: '${value}'`);
    }
    return false;
  }

  remove(key: string, value: V) {
    if(this.index[key] === undefined) return false;
    this.dirty[key] = this.index[key];
    delete this.index[key];
    return true;
  }
}

//---------------------------------------------------------
// DB
//---------------------------------------------------------
type Value = string | number | boolean | UUID;

export class DB {
  protected _indexes:{[attribute:string]: IndexList<UUID>} = {}; // A: V -> E
  protected _records = new IndexScalar<Record>();                // E -> Record
  protected _dirty = new IndexList<string>();                    // E -> A

  constructor(public id:UUID) {}

  record(entity:UUID):Record {
    return this._records[entity];
  }

  index(attribute:string):IndexList<UUID> {
    let index = this._indexes[attribute];
    if(index) return index;

    index = new IndexList<UUID>();
    this._indexes[attribute] = index;

    for(let entity in this._records.index) {
      let record = this._records.index[entity];
      let values = record[attribute];
      if(!values) continue;
      for(let value of values) {
        index.insert(value, entity);
      }
    }

    return index;
  }

  exists(entity:UUID, attribute?:string):boolean {
    let record = this._records.index[entity];
    if(!attribute) return !!record;
    else if(record) return !!record[attribute];
    else return false;
  }

  every(entity:UUID, attribute:string):Value[] {
    let record = this._records.index[entity];
    if(!record) throw new UnknownEntityError(entity);
    if(!record[attribute]) throw new UnknownAttributeError(entity, attribute);
    return record[attribute];
  }
  only(entity:UUID, attribute:string):Value {
    let record = this._records.index[entity];
    if(!record) throw new UnknownEntityError(entity);
    if(!record[attribute]) throw new UnknownAttributeError(entity, attribute);
    if(record[attribute].length > 1) throw new CardinalityError(entity, attribute, 1, record[attribute].length);
    return record[attribute][0];
  }
  any(entity:UUID, attribute:string):Value[]|undefined {
    let record = this._records.index[entity];
    if(!record) throw new UnknownEntityError(entity);
    return record[attribute];
  }
  one(entity:UUID, attribute:string):Value|undefined {
    let record = this._records.index[entity];
    if(!record) throw new UnknownEntityError(entity);
    if(!record[attribute]) return;
    return record[attribute][0];
  }
}


class UnknownEntityError extends Error {
  constructor(entity:string) {
    super(`Unknown Entity: '${entity}'`);
  }
}
class UnknownAttributeError extends Error {
  constructor(entity:string, attribute:string) {
    super(`Unknown Attribute: '${entity}'.'${attribute}'`);
  }
}
class CardinalityError extends Error {
  constructor(entity:string, attribute:string, expected: number, actual: number) {
    super(`Invalid Cardinality in: '${entity}'.'${attribute}'. Expected ${expected}, got ${actual}`);
  }
}
