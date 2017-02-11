export {RawValue, RawEAV, RawEAVC} from "../runtime/runtime";
import {ID, RawValue, RawEAV, Change, createArray, ExportHandler} from "../runtime/runtime";
import {Program} from "../runtime/dsl";
import * as glob from "glob";
import * as fs from "fs";

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

interface Map<V> {[key:number]: V};
export interface RawMap<V> {[key:string]: V, [key:number]: V};
export interface RawRecord extends RawMap<RawValue> {}

interface Diffs<V> {adds: V, removes: V};
interface EAVDiffs extends Diffs<RawEAV[]> {}
interface ObjectDiffs<T extends RawRecord> extends Diffs<RawMap<T>> {}

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
// Initialization / Packaging
//------------------------------------------------------------------------------

const WATCHER_PATHS = [
  __dirname + "/**/*.js"
  // @TODO: Import watchers from node_modules with the appropriate flag in their package.jsons
  // @TODO: Import watchers from the binary-local `watchers` directory.
  // @NOTE: We normalize backslash to forwardslash to make glob happy.
].map((path) => path.replace(new RegExp("\\\\", "g"), "/"));

export function findWatchers() {
  let watcherFiles:string[] = [];
  for(let watcherPath of WATCHER_PATHS) {
    for(let filepath of glob.sync(watcherPath)) {
      if(filepath === __filename) continue;
      watcherFiles.push(filepath);
    }
  }
  return watcherFiles;
}

export function bundleWatchers() {
  let bundle:{[path:string]: string} = {};
  for(let watcherFile of findWatchers()) {
    bundle[watcherFile] = fs.readFileSync(watcherFile).toString();
  }

  return bundle;
}

// If we're running on the machine, we can autoload all the watchers
// for you.  For the browser, we'll still need to build an explicit
// bundle of watchers.

if(glob && glob.sync) {
  for(let watcherFile of findWatchers()) {
    require(watcherFile);
  }
}
