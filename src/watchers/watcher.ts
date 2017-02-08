import {Program, BlockFunction} from "../runtime/dsl";
import * as glob from "glob";

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


// If we're running on the machine, we can autoload all the watchers
// for you.  For the browser, we'll still need to build an explicit
// bundle of watchers.
// @TODO: We should also import modules with the `eve-watcher`
//        attribute in their package.json.

if(glob && glob.sync) {
  let watcherFiles = glob.sync(__dirname.replace(new RegExp("\\\\", "g"), "/") + "/**/*.js");
  for(let watcherFile of watcherFiles) {
    console.log(watcherFile);
    if(watcherFile === __filename) continue;
    require(watcherFile);
  }
}
