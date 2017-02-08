import {Program, BlockFunction} from "../runtime/dsl";

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
