//---------------------------------------------------------------------
// Compiler Database
//---------------------------------------------------------------------

import {Changes} from "../changes";
import {Evaluation, Database} from "../runtime";
import {Block, BlockStratum} from "../block";
import {Scan, Variable, isVariable} from "../join";
import {InsertAction} from "../actions";
import * as providers from "../providers/index";

export class CompilerDatabase extends Database {

  objectCache: any = {};

  checkForVariable(field) {
    return this.objectCache[field] || field;
  }

  assignVariable(field, curVar, seenVars) {
    if(isVariable(field) && (field.id === -1 || !seenVars[field.info])) {
      field.id = curVar++;
      seenVars[field.info] = true;
    }
    return curVar;
  }

  updateTransform(transform, changes) {
  // constructor(name: string, strata: BlockStratum[], commitActions: Action[], bindActions: Action[], parse?: any) {
  // constructor(scans, aggregates = []) {
    let {assignVariable} = this;
    let id = transform["_eveId"];
    let curVar = 0;
    let seenVars = {};
    let scans = [];
    let binds = [];
    let commits = [];
    // assign register numbers to variables
    if(transform.scans) {
      for(let scanId of transform.scans) {
        let scan = this.objectCache[scanId];
        if(!scan) continue;
        console.log(scan);

        curVar = assignVariable(scan.e, curVar, seenVars);
        curVar = assignVariable(scan.a, curVar, seenVars);
        curVar = assignVariable(scan.v, curVar, seenVars);
        curVar = assignVariable(scan.n, curVar, seenVars);

        scan.setVars();
        scans.push(scan);
      }
    }
    if(transform.expressions) {
      for(let expId of transform.expressions) {
        let expression = this.objectCache[expId];
        if(!expression) continue;
        for(let arg of expression.args) {
          curVar = assignVariable(arg, curVar, seenVars);
        }
        for(let arg of expression.returns) {
          curVar = assignVariable(arg, curVar, seenVars);
        }
        expression.setVars();
        scans.push(expression);
      }
    }
    if(transform.binds) {
      for(let bindId of transform.binds) {
        let bind = this.objectCache[bindId];
        if(!bind) continue;

        curVar = assignVariable(bind.e, curVar, seenVars);
        curVar = assignVariable(bind.a, curVar, seenVars);
        curVar = assignVariable(bind.v, curVar, seenVars);

        binds.push(bind);
      }
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
    console.log("MADE BLOCK!", transform, block);
  }

  updateVariable(id, variable) {
    this.objectCache[id] = new Variable(-1, id);
  }

  updateScan(id, scan) {
    let {scopes} = scan;
    console.log("UPDATE SCAN", scan);
    let e = this.checkForVariable(scan.e && scan.e[0]);
    let a = this.checkForVariable(scan.a && scan.a[0]);
    let v = this.checkForVariable(scan.v && scan.v[0]);
    let n = this.checkForVariable(scan.n && scan.n[0]);
    let neueScan = new Scan(id, e, a, v, n, scopes);
    this.objectCache[id] = neueScan;
  }

  updateAction(id, action) {
    let {scopes} = action;
    let e = this.checkForVariable(action.e && action.e[0]);
    let a = this.checkForVariable(action.a && action.a[0]);
    let v = this.checkForVariable(action.v && action.v[0]);
    let n = this.checkForVariable(action.n && action.n[0]);
    let neueAction = new InsertAction(id, e, a, v, n, scopes);
    this.objectCache[id] = neueAction;
  }

  updateExpression(id, expression) {
    let index = this.index;
    let args = [];
    let results = [];
    for(let arg of expression.args) {
      let obj = index.asObject(arg)
      let ix = obj.index[0];
      let v = obj.v[0];
      args[ix - 1] = this.checkForVariable(v);
    }
    for(let result of expression.results) {
      let obj = index.asObject(result)
      let ix = obj.index[0];
      let v = obj.v[0];
      results[ix - 1] = this.checkForVariable(v);
    }
    let klass = providers.get(expression.operation[0]);
    let neueExpression = new klass(id, args, results)
    this.objectCache[id] = neueExpression;
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
        } else if(index.lookup(e, "tag", "compiler/expression")) {
          this.updateExpression(e, record);
        }
      }
    }
    for(let remove of result.remove) {
      let [e,a,v] = remove;
      if(!handled[e]) {
        handled[e] = true;
        let justRemove = {"compiler/scan": true, "compiler/insert": true, "compiler/expression": true};
        if(a === "tag" && justRemove[v]) {
          this.objectCache[e] = undefined;
        } else if(a === "tag" && v === "compiler/transform") {
          // @TODO: remove a block
        } else if(index.lookup(e, "tag", "compiler/transform")) {
          let record = index.asObject(e);
          record["_eveId"] = e;
          dirty.push(record);
        }
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
        nextChanges.commit();
        evaluation.fixpoint(nextChanges);
        console.log(nextChanges);
      });
    }
  }

}

