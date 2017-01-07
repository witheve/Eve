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

  assignVariable(field, curVar) {
    if(isVariable(field) && field.id === -1) {
      field.id = curVar++;
    }
    return curVar;
  }

  updateTransform(transform, changes) {
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
      if(!scan) continue;

      curVar = assignVariable(scan.e, curVar);
      curVar = assignVariable(scan.a, curVar);
      curVar = assignVariable(scan.v, curVar);
      curVar = assignVariable(scan.n, curVar);

      scan.setVars();
      scans.push(scan);
    }
    for(let expId of transform.expressions) {
      let expression = this.objectCache[expId];
      if(!expression) continue;
      for(let arg of expression.args) {
        curVar = assignVariable(arg, curVar);
      }
      for(let arg of expression.returns) {
        curVar = assignVariable(arg, curVar);
      }
      expression.setVars();
      scans.push(expression);
    }
    for(let bindId of transform.binds) {
      let bind = this.objectCache[bindId];
      if(!bind) continue;

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
  }

  updateVariable(id, variable) {
    this.objectCache[id] = new Variable(-1);
  }

  updateScan(id, scan) {
    let {scopes} = scan;
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

