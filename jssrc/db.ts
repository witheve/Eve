export type EAV = [string, string, any];
export type Record = any;

type IndexSubscriber<T> = (index: T, dirty?: T, self?: Index<T>) => void
class Index<T> {
  public index:T = {} as any;
  public dirty:T = {} as any;
  private subscribers:IndexSubscriber<T>[] = [];

  constructor(public attribute?:string) {}

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
      this.subscribers[ix] = this.subscribers.pop();
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
      this.index[key][ix] = this.index[key].pop();
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
