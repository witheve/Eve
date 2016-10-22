//---------------------------------------------------------------------
// Actions
//---------------------------------------------------------------------

import {Variable, isVariable, toValue} from "./join";
import {MultiIndex} from "./indexes";
import {Changes} from "./changes";

//---------------------------------------------------------------------
// Actions
//---------------------------------------------------------------------

export abstract class Action {
  id: string;
  e: any;
  a: any;
  v: any;
  node: string;
  vars: Variable[];
  resolved: any[];
  scopes: string[];
  constructor(id: string, e,a,v,node?,scopes?) {
    this.id = id;
    this.resolved = [];
    let eav = [e,a,v];
    this.e = e;
    this.a = a;
    this.v = v;
    this.node = node || this.id;
    this.vars = [];
    this.scopes = scopes || ["session"];
    for(let register of eav) {
      if(isVariable(register)) {
        this.vars[register.id] = register;
      }
    }
  }

  // Return an array of the current values for all the registers
  resolve(prefix) {
    let resolved = this.resolved;
    resolved[0] = toValue(this.e, prefix);
    resolved[1] = toValue(this.a, prefix);
    resolved[2] = toValue(this.v, prefix);
    return resolved;
  }

  abstract execute(multiIndex: MultiIndex, row: any, changes: Changes);
}

export class InsertAction extends Action {
  execute(multiIndex, row, changes) {
    let [e,a,v] = this.resolve(row);
    for(let scope of this.scopes) {
      changes.store(scope,e,a,v,this.node);
    }
  }
}

export class RemoveAction extends Action {
  execute(multiIndex, row, changes) {
    let [e,a,v] = this.resolve(row);
    for(let scope of this.scopes) {
      changes.unstore(scope,e,a,v);
    }
  }
}

export class RemoveSupportAction extends Action {
  execute(multiIndex, row, changes) {
    let [e,a,v] = this.resolve(row);
    // console.log("removing support for", e,a,v, this.node);
    for(let scope of this.scopes) {
      changes.unstore(scope,e,a,v,this.node);
    }
  }
}

export class EraseAction extends Action {
  removeVs(index, changes, scope, e, a) {
    let keys = Object.keys(index);
    for(let key of keys) {
      let value = index[key].value;
      changes.unstore(scope,e,a,value);
    }
  }
  execute(multiIndex, row, changes) {
    let [e,a] = this.resolve(row);
    // multidb
    for(let scope of this.scopes) {
      let avIndex = multiIndex.getIndex(scope).lookup(e,undefined,undefined);
      if(avIndex !== undefined) {
        if(a !== undefined) {
          let level = avIndex.index[a];
          if(level) {
            this.removeVs(level.index, changes, scope, e, level.value);
          }
        } else {
          let keys = Object.keys(avIndex.index);
          for(let key of keys) {
            let level = avIndex.index[key];
            this.removeVs(level.index, changes, scope, e, level.value);
          }
        }
      }
    }
  }
}

export class SetAction extends Action {
  execute(multiIndex, row, changes) {
    let [e,a,v] = this.resolve(row);
    // multidb
    for(let scope of this.scopes) {
      let curIndex = multiIndex.getIndex(scope);
      let vIndex = curIndex.lookup(e,a,undefined);
      if(vIndex !== undefined) {
        let keys = Object.keys(vIndex.index);
        for(let key of keys) {
          let value = vIndex.index[key].value;
          if(value !== v) {
            changes.unstore(scope,e,a,value);
          }
        }
      }
      changes.store(scope,e,a,v,this.node);
    }
  }
}

export var ActionImplementations = {
  ":=": SetAction,
  "+=": InsertAction,
  "-=": RemoveAction,
  "erase": EraseAction,
}

export function executeActions(multiIndex: MultiIndex, actions: Action[], rows: any[], changes: Changes, capture = false) {
  if(capture) {
    changes.capture();
  }
  for(let row of rows) {
    for(let action of actions) {
      action.execute(multiIndex, row, changes);
    }
  }
  if(capture) {
    return changes.captureEnd();
  }
}
