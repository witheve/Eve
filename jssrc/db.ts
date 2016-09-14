export type UUID = string;
type Value = string | number | boolean | UUID;
export type EAV = [string, string, Value];
export type Record = any; //{[attribute:string]: Value[], [attribute:number]: Value[]};

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
  insert(key: Value, value: V) {
    key = ""+key;
    if(!this.index[key] || this.index[key].indexOf(value) === -1) {
      if(!this.index[key]) this.index[key] = [];
      if(!this.dirty[key]) this.dirty[key] = [];
      this.index[key].push(value);
      this.dirty[key].push(value);
      return true;
    }
    return false;
  }

  remove(key: Value, value: V) {
    key = ""+key;
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
  insert(key: Value, value: V) {
    key = ""+key;
    if(this.index[key] === undefined) {
      this.index[key] = value;
      this.dirty[key] = value;
      return true;
    } else if(this.index[key] !== value) {
      throw new Error(`Unable to set multiple values on scalar index for key: '${key}' old: '${this.index[key]}' new: '${value}'`);
    }
    return false;
  }

  remove(key: Value, value: V) {
    key = ""+key;
    if(this.index[key] === undefined) return false;
    this.dirty[key] = this.index[key];
    delete this.index[key];
    return true;
  }
}

//---------------------------------------------------------
// DB
//---------------------------------------------------------
export class DB {
  _indexes:{[attribute:string]: IndexList<UUID>} = {}; // A: V -> E[]
  _records = new IndexScalar<Record>();                // E -> A : V[]
  _attributes = new IndexList<UUID>();                 // A -> E[]
  _dirty = new IndexList<string>();                    // E -> A[]

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

  querySelector(selector:string, args?:Value[]):UUID[] {
    let entities:UUID[] = [];

    // Strip whitespace before and after colons
    selector = selector.replace(/\s*:\s/, ":");

    // Split into attributes and/or attribute:value pairs
    let parts = selector.split(" ");
    for(let part of parts) {
      let [attr, val] = part.split(":");
      let value;
      if(attr[0] === "#") {
        if(val) throw new InvalidSelectorError(part, "tag");
        value = attr.substring(1);
        attr = "tag";
      } else if(attr[0] == "@") {
        if(val) throw new InvalidSelectorError(part, "name");
        value = attr.substring(1);
        attr = "name";
      } else if(val && val[0] !== "%") throw new InvalidSelectorError(part, "value");
      else if(val === "") throw new InvalidSelectorError(part, "colon");

      if(val && val[0] === "%") {
        if(!args) throw new InvalidSelectorError(part, "args");
        value = args[+val.substring(1) + 1];
      }

      let matches;
      if(value) {
        let index = this.index(attr);
        matches = index.index[value];
      } else {
        let index = this._attributes;
        matches = index.index[attr];
      }

      // Special case the first run to just copy the match instead of running over every entity for no good reason
      if(entities.length === 0) entities.push.apply(entities, matches);
      else {
        for(let ix = 0; ix < entities.length;) {
          let entity = entities[ix];
          if(matches.indexOf(entity) === -1) {
            entities[ix] = entities.pop()!;
          } else {
            ix++;
          }
        }
      }

      if(entities.length === 0) break;
    }
    return entities;
  }

  forEach(selector:string, args:Value[], callback:(...attrs:Value[][]) => void) {
    let entities = this.querySelector(selector, args);

    let attributes:string[] = [];

    // Strip whitespace before and after colons
    selector = selector.replace(/\s*:\s/, ":");
    // Split into attributes and/or attribute:value pairs
    let parts = selector.split(" ");
    for(let part of parts) {
      let [attr, val] = part.split(":");
      if(attr[0] === "#" ||
         attr[0] === "@" ||
         val !== undefined) {
        break;
      }
      attributes.push(attr);
    }

    // This will get reused on each entity
    let row:Value[][] = [];

    for(let entity of entities) {
      let record = this._records.index[entity];
      for(let ix = 0; ix < attributes.length; ix++) {
        row[ix] = record[attributes[ix]];
      }
      callback.apply(this, row);
      row.length = 0; // Clear the row for the next guy.
    }
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
class InvalidSelectorError extends Error {
  constructor(selector: string, kind:"tag"|"name"|"value"|"colon"|"args") {
    let issue;
    if(kind === "tag") issue = "Tag literals may not specify a value.";
    else if(kind === "name") issue = "Name literals may not specify a value.";
    else if(kind === "value") issue = "Attribute values must be sanitized through placeholders (e.g.: %1).";
    else if(kind === "colon") issue = "Colons in selectors *must* be followed by a placeholder (e.g.: %1).";
    else if(kind === "args") issue = "Placeholders may only be used when an args list is provided.";
    super(`Invalid Selector: '${selector}'. ${issue}`);
  }
}
