//---------------------------------------------------------------------
// Changes
//---------------------------------------------------------------------

import {MultiIndex} from "./indexes";

let perf = global["perf"];

//---------------------------------------------------------------------
// ChangeType
//---------------------------------------------------------------------

export enum ChangeType {
  ADDED,
  REMOVED,
  ADDED_REMOVED,
}

//---------------------------------------------------------------------
// ChangesIndex
//---------------------------------------------------------------------

export class ChangesIndex {
  pos: number;
  positions: any;
  info: any[];
  constructor() {
    this.positions = {};
    this.info = [];
    this.pos = 0;
  }

  store(scope,e,a,v,node,key?) {
    // let start = perf.time()
    key = key || `${scope}|${e}|${a}|${v}|${node}`;
    let keyPos = this.positions[key];
    let info = this.info;
    if(keyPos === undefined) {
      let pos = this.pos;
      this.positions[key] = pos;
      info[pos] = ChangeType.ADDED;
      info[pos + 1] = e;
      info[pos + 2] = a;
      info[pos + 3] = v;
      info[pos + 4] = node;
      info[pos + 5] = scope;
      this.pos += 6;
    } else if(info[keyPos] === ChangeType.REMOVED) {
      info[keyPos] = ChangeType.ADDED_REMOVED;
    }
    // perf.store(start);
    return key;
  }
  unstore(scope,e,a,v,node,key?) {
    key = key || `${scope}|${e}|${a}|${v}|${node}`;
    let keyPos = this.positions[key];
    let info = this.info;
    if(keyPos === undefined) {
      let pos = this.pos;
      this.positions[key] = pos;
      info[pos] = ChangeType.REMOVED;
      info[pos + 1] = e;
      info[pos + 2] = a;
      info[pos + 3] = v;
      info[pos + 4] = node;
      info[pos + 5] = scope;
      this.pos += 6;
    } else if(info[keyPos] === ChangeType.ADDED) {
      info[keyPos] = ChangeType.ADDED_REMOVED;
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

//---------------------------------------------------------------------
// Changes
//---------------------------------------------------------------------

export class Changes {
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
      if(mult === ChangeType.ADDED_REMOVED) {
        continue;
      }
      let e = info[pos + 1];
      let a = info[pos + 2];
      let v = info[pos + 3];
      let node = info[pos + 4];
      let scope = info[pos + 5];
      let curIndex = multiIndex.getIndex(scope);
      if(mult === ChangeType.REMOVED && curIndex.lookup(e,a,v,node) !== undefined) {
        this.changed = true;
        curIndex.unstore(e,a,v,node);
        final.dec(scope,e,a,v,node,key);
        committed[committedIx] = ChangeType.REMOVED;
        committed[committedIx+1] = e;
        committed[committedIx+2] = a;
        committed[committedIx+3] = v;
        committed[committedIx+4] = node;
        committed[committedIx+5] = scope;
        committedIx += 6;
      } else if(mult === ChangeType.ADDED && curIndex.lookup(e,a,v,node) === undefined) {
        this.changed = true;
        curIndex.store(e,a,v,node);
        final.inc(scope,e,a,v,node,key);
        committed[committedIx] = ChangeType.ADDED;
        committed[committedIx+1] = e;
        committed[committedIx+2] = a;
        committed[committedIx+3] = v;
        committed[committedIx+4] = node;
        committed[committedIx+5] = scope;
        committedIx += 6;
      }
    }
    return committed;
  }

  nextRound() {
    this.round++;
    this.changed = false;
    this.changes[this.round] = new ChangesIndex();
  }


  toCommitted(scopeLookup: Object) {
    let commit = [];
    let ix = 0;
    let {positions, info} = this.finalChanges;
    let indexes = this.index.indexes;
    let keys = Object.keys(positions);
    for(let key of keys) {
      let pos = positions[key];
      let count = info[pos];
      if(count === 0) continue;
      let scope = info[pos + 5];
      if(scopeLookup && !scopeLookup[scope]) continue;

      let action = count > 1 ? ChangeType.ADDED : ChangeType.REMOVED
      let e = info[pos + 1];
      let a = info[pos + 2];
      let v = info[pos + 3];
      let node = info[pos + 4];

      commit[ix] = action;
      commit[ix + 1] = e;
      commit[ix + 2] = a;
      commit[ix + 3] = v;
      commit[ix + 4] = node;
      commit[ix + 5] = scope;
      ix += 6;
    }
    return commit;
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

  _storeObject(operation: "store" | "unstore", id: string, object: any, node: string, scope: string) {
    for(let attr of Object.keys(object)) {
      let value = object[attr];
      if(value.constructor === Array) {
        for(let item of value) {
          this[operation](scope, id, attr, item, node);
        }
      } else if(typeof value === "object") {
        throw new Error("Attempting to store a non-value in an Eve database");
      } else {
        this[operation](scope, id, attr, value, node);
      }
    }
  }

  storeObject(id: string, object: any, node: string, scope: string) {
    this._storeObject("store", id, object, node, scope);
  }

  unstoreObject(id: string, object: any, node: string, scope: string) {
    this._storeObject("unstore", id, object, node, scope);
  }
}

