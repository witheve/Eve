//---------------------------------------------------------------------
// Compiler Database
//---------------------------------------------------------------------

import {Changes} from "../changes";
import {Evaluation, Database} from "../runtime";
import {Block, BlockStratum} from "../block";
import {Scan, Variable, isVariable} from "../join";
import {InsertAction} from "../actions";

export class CompilerDatabase extends Database {

  objectCache: any = {};

  checkForVariable(field) {
    return this.objectCache[field] || field;
  }

  assignVariable(field, curVar) {
    if(isVariable(field) && field.id === -1) {
      field.id = curVar++;
    }
    return curVar;
  }

  updateTransform(transform, changes) {
    console.log("transform!", transform);
  // constructor(name: string, strata: BlockStratum[], commitActions: Action[], bindActions: Action[], parse?: any) {
  // constructor(scans, aggregates = []) {
    let {assignVariable} = this;
    let id = transform["_eveId"];
    let curVar = 0;
    let scans = [];
    let binds = [];
    let commits = [];
    // assign register numbers to variables
    for(let scanId of transform.scans) {
      let scan = this.objectCache[scanId];
      if(!scan) throw new Error("Missing scan for transform");

      curVar = assignVariable(scan.e, curVar);
      curVar = assignVariable(scan.a, curVar);
      curVar = assignVariable(scan.v, curVar);
      curVar = assignVariable(scan.n, curVar);

      scan.setVars();
      scans.push(scan);
    }
    for(let bindId of transform.binds) {
      let bind = this.objectCache[bindId];
      if(!bind) throw new Error("Missing bind for transform");

      curVar = assignVariable(bind.e, curVar);
      curVar = assignVariable(bind.a, curVar);
      curVar = assignVariable(bind.v, curVar);

      binds.push(bind);
    }

    // build the strata for this block
    // @TODO: we need to stratify here at some point?
    let level = new BlockStratum(scans);

    // build the block
    let block = new Block(transform.name[0], [level], commits, binds, transform);

    let prev = this.objectCache[id];
    if(prev) {
      let ix = this.blocks.indexOf(prev);
      this.blocks.splice(ix,1);
      if(prev.bindActions.length) {
        prev.updateBinds({positions: {}, info: []}, changes);
      }
    }
    this.objectCache[id] = block;
    this.blocks.push(block);
    console.log("MADE BLOCK!", block);
    console.log(this.blocks);
  }

  updateVariable(id, variable) {
    console.log("GOT VAR!", variable);
    this.objectCache[id] = new Variable(-1);
  }

  updateScan(id, scan) {
    let {scopes} = scan;
    let e = this.checkForVariable(scan.e && scan.e[0]);
    let a = this.checkForVariable(scan.a && scan.a[0]);
    let v = this.checkForVariable(scan.v && scan.v[0]);
    let n = this.checkForVariable(scan.n && scan.n[0]);
    let neueScan = new Scan(id, e, a, v, n, scopes);
    console.log("scan!", neueScan);
    this.objectCache[id] = neueScan;
  }

  updateAction(id, action) {
    console.log("action!", action);
    let {scopes} = action;
    let e = this.checkForVariable(action.e && action.e[0]);
    let a = this.checkForVariable(action.a && action.a[0]);
    let v = this.checkForVariable(action.v && action.v[0]);
    let n = this.checkForVariable(action.n && action.n[0]);
    let neueAction = new InsertAction(id, e, a, v, n, scopes);
    console.log("action!", neueAction);
    this.objectCache[id] = neueAction;
  }

  onFixpoint(evaluation: Evaluation, changes: Changes) {
    super.onFixpoint(evaluation, changes);

    let name = evaluation.databaseToName(this);
    let result = changes.result({[name]: true});
    let handled = {};
    let index = this.index;
    let dirty = [];
    for(let insert of result.insert) {
      let [e,a,v] = insert;
      if(!handled[e]) {
        handled[e] = true;
        let record = index.asObject(e);
        if(index.lookup(e,"tag", "compiler/transform")) {
          record["_eveId"] = e;
          dirty.push(record);
        } else if(index.lookup(e, "tag", "compiler/scan")) {
          this.updateScan(e, record);
        } else if(index.lookup(e, "tag", "compiler/insert")) {
          this.updateAction(e, record);
        } else if(index.lookup(e, "tag", "compiler/variable")) {
          this.updateVariable(e, record);
        }
      }
    }
    for(let remove of result.remove) {
      let [e,a,v] = remove;
      if(!handled[e]) {
        handled[e] = true;
      }
    }

    //@TODO: this won't really work once we have other kinds of scans (not, if)
    // that also really need to wait until they're fully realized before moving on
    let nextChanges = evaluation.createChanges();
    for(let transform of dirty) {
      this.updateTransform(transform, nextChanges);
    }
    if(dirty.length) {
      setTimeout(() => {
        evaluation.fixpoint(nextChanges);
      });
    }
  }

}

