import {Program, LinearFlowFunction} from "../runtime/dsl2";
import * as glob from "glob";
import * as fs from "fs";

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
