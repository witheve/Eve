import * as path from "path";
export {RawValue, RawEAV, RawEAVC} from "../runtime/runtime";
import {ID, GlobalInterner, RawValue, RawEAV, RawEAVC, Change, createArray, ExportHandler} from "../runtime/runtime";
export {Program} from "../runtime/dsl2";
import {Program, LinearFlowFunction} from "../runtime/dsl2";
import {v4 as uuid} from "uuid";

//------------------------------------------------------------------------------
// Watcher
//------------------------------------------------------------------------------

export class Watcher {
  protected static _registry:{[id:string]: typeof Watcher} = {};

  static register(id:string, watcher:typeof Watcher) {
    if(this._registry[id]) {
      if(this._registry[id] === watcher) return;
      throw new Error(`Attempting to overwrite existing watcher with id '${id}'`);
    }
    this._registry[id] = watcher;
  }

  static unregister(id:string) {
    delete this._registry[id];
  }

  static get(id:string) {
    let watcher = this._registry[id];;
    if(watcher) return watcher;
  }

  get program() { return this._program; }

  constructor(protected _program:Program) {
    this.setup();
  }

  setup() {}
}

//------------------------------------------------------------------------------
// Exporter
//------------------------------------------------------------------------------

export interface Map<V> {[key:number]: V};
export interface RawMap<V> {[key:string]: V, [key:number]: V};
export interface RawRecord extends RawMap<RawValue> {}

export interface Diffs<V> {adds: V, removes: V};
export interface EAVDiffs extends Diffs<RawEAV[]> {}
export interface ObjectDiffs<T extends RawRecord> extends Diffs<RawMap<T>> {}

export type DiffConsumer = (diffs:EAVDiffs) => void;
export type ObjectConsumer<T extends RawRecord> = (diffs:ObjectDiffs<T>) => void;

export class Exporter {
  protected _diffTriggers:Map<DiffConsumer[]> = {};
  protected _objectTriggers:Map<ObjectConsumer<{}>[]> = {};
  protected _blocks:ID[] = [];

  triggerOnDiffs(blockId:ID, handler:DiffConsumer):void {
    if(!this._diffTriggers[blockId]) this._diffTriggers[blockId] = createArray();
    if(this._diffTriggers[blockId].indexOf(handler) === -1) {
      this._diffTriggers[blockId].push(handler);
    }
    if(this._blocks.indexOf(blockId) === -1) {
      this._blocks.push(blockId);
    }
  }

  triggerOnObjects<Pattern extends RawRecord>(blockId:ID, handler:ObjectConsumer<Pattern>):void {
    if(!this._objectTriggers[blockId]) this._objectTriggers[blockId] = createArray();
    if(this._objectTriggers[blockId].indexOf(handler) === -1) {
      this._objectTriggers[blockId].push(handler);
    }
    if(this._blocks.indexOf(blockId) === -1) {
      this._blocks.push(blockId);
    }
  }

  accumulateChangesAs<T extends RawRecord>(changes:Change[]) {
    let adds:RawMap<T> = {};
    let removes:RawMap<T> = {};

    for(let change of changes) {
      let {e, a, v, count} = change.reverse();
      if(count === 1) {
        let record = adds[e] = adds[e] || Object.create(null);
        if(record[a]) throw new Error("@FIXME: accumulateChanges supports only a single value per attribute.");
        record[a] = v;
      } else {
        let record = removes[e] = removes[e] || Object.create(null);
        if(record[a]) throw new Error("@FIXME: accumulateChanges supports only a single value per attribute.");
        record[a] = v;
      }
    }

    return {adds, removes};
  }

  handle:ExportHandler = (blockChanges) => {
    for(let blockId of this._blocks) {
      let changes = blockChanges[blockId];
      if(changes && changes.length) {
        let diffTriggers = this._diffTriggers[blockId];
        if(diffTriggers) {
          let output:EAVDiffs = {adds: [], removes: []};
          for(let change of changes) {
            let eav = change.toRawEAV();
            if(change.count > 0) {
              output.adds.push(eav);
            } else {
              output.removes.push(eav);
            }
          }

          for(let trigger of diffTriggers) {
            trigger(output);
          }
        }

        let objectTriggers = this._objectTriggers[blockId];
        if(objectTriggers) {
          let output:ObjectDiffs<{}> = this.accumulateChangesAs<{}>(changes);
          for(let trigger of objectTriggers) {
            trigger(output);
          }
        }
      }
    }
  }
}

//------------------------------------------------------------------------------
// Convenience Diff Handlers
//------------------------------------------------------------------------------

export function maybeIntern(value?:RawValue):ID|RawValue|undefined {
  if(value === undefined) return value;
  return (""+value).indexOf("|") === -1 ? value : GlobalInterner.get(value);
}

export function forwardDiffs(destination:Program, name:string = "Unnamed", debug = false) {
  return (diffs:EAVDiffs) => {
    let eavs:RawEAVC[] = [];
    for(let [e, a, v] of diffs.removes) {
      eavs.push([e, a, v, -1]);
    }
    for(let [e, a, v] of diffs.adds) {
      eavs.push([e, a, v, 1]);
    }
    if(eavs.length) {
      if(debug) {
        console.log("FWD", name, "=>", destination.name);
        console.log(eavs.map((c) => `[${c.map(maybeIntern).join(", ")}]`).join("\n"));
      }
      destination.inputEAVs(eavs);
    }
  };
}

//--------------------------------------------------------------------
// Watcher / Program Utils
//--------------------------------------------------------------------

export function createId() {
  return "|" + uuid();
}

export function isRawValue(x:any): x is RawValue {
  return x !== undefined && (typeof x === "string" || typeof x === "number");
}

export function isRawValueArray(x:any): x is RawValue[] {
  if(x && x.constructor === Array) {
    for(let value of x) {
      if(!isRawValue(value)) return false;
    }
    return true;
  }
  return false;
}

export function isRawEAVArray(x:any): x is RawEAV[] {
  if(x && x.constructor === Array) {
    for(let value of x) {
      if(!isRawValueArray(value)) return false;
      if(value.length !== 3) return false;
    }
    return true;
  }
  return false;
}


export interface Attrs extends RawMap<RawValue|RawValue[]|RawEAV[]|RawEAV[][]> {}
export function appendAsEAVs(eavs:any[], record: Attrs, id = createId()) {
  for(let attr in record) {
    let value = record[attr];
    if(isRawValue(value)) {
      eavs.push([id, attr, value]);

    } else if(isRawValueArray(value)) {
      // We have a set of scalars
      for(let val of value) eavs.push([id, attr, val]);

    } else if(isRawEAVArray(value)) {
      // We have a single nested sub-object (i.e. a set of EAVs).
      let childEAVs = value;
      let [childId] = childEAVs[0];
      eavs.push([id, attr, childId]);
      for(let childEAV of childEAVs) eavs.push(childEAV);

    } else {
      // We have a set of nested sub-objects.
      for(let childEAVs of value) {
        let [childId] = childEAVs[0];
        eavs.push([id, attr, childId]);
        for(let childEAV of childEAVs) eavs.push(childEAV);
      }
    }
  }

  return eavs;
}
