//---------------------------------------------------------------------
// Analyzer
//---------------------------------------------------------------------

import {ParseBlock, ParseNode} from "./parser"
import {Evaluation, Database} from "./runtime";
import {Changes} from "./changes";
import * as join from "./join";
import * as client from "../client";
import * as parser from "./parser";
import * as builder from "./builder";
import * as analyzer from "./analyzer";
import * as browser from "./browser";
import {BrowserSessionDatabase} from "./databases/browserSession";

enum ActionType { Bind, Commit }

//---------------------------------------------------------------------
// Register
//---------------------------------------------------------------------

class Register {
  static id = 0
  id: number
  variables: ParseNode[] = []

  constructor() {
    this.id = Register.id++;
  }

  constant(value) {
    if(this.constant !== undefined && this.constant !== value) {
      throw new Error(`Trying to set a register to unequal constants: ${value} !== ${this.constant}`)
    }
    this.constant = value;
  }

  merge(other) {
    for(let variable in this.variables) {
      if(other.variables.indexOf(variable) === -1) {
        other.variables.push(variable);
      }
    }
    if(this.constant !== undefined) {
      other.constant(this.constant);
    }
    this.variables = other.variables;
    this.id = other.id;
    this.constant = other.constant;
  }
}

//---------------------------------------------------------------------
// Record
//---------------------------------------------------------------------

type AnyValue = {};
type Value = string | number | boolean | Register | AnyValue;

export const ALL: AnyValue = {};

class Record {
  static RequestId = 0;
  static RecordId = 0;
  id: string

  constructor() {
    this.id = `record|${Record.RecordId++}`;
  }

  requested: {[scope: string]: {[attribute: string]: Value[]}} = {}
  provided: {[scope: string]: {[attribute: string]: Value[]}} = {}
  removed: {[scope: string]: {[attribute: string]: Value[]}} = {}

  _update(collection, scopes, attribute, value) {
    for(let scope of scopes) {
      let currentScope = collection[scope];
      if(!currentScope) {
        currentScope = collection[scope] = {};
      }
      let current = currentScope[attribute];
      if(!current) {
        current = currentScope[attribute] = [];
      }
      current.push(value);
    }
  }

  request(changes: Changes, scopes: string[], attribute: string, value: any) {
    let requestId = `request|${Record.RequestId++}`;
    changes.store("session", requestId, "tag", "request", "analyzer");
    changes.store("session", requestId, "entity", this.id, "analyzer");
    changes.store("session", requestId, "attribute", attribute, "analyzer");
    if(value.id !== undefined) {
      changes.store("session", requestId, "value", value.id, "analyzer");
      changes.store("session", value.id, "tag", "variable", "analyzer");
    } else {
      changes.store("session", requestId, "value", value, "analyzer");
    }
    for(let scope of scopes) {
      changes.store("session", requestId, "scopes", scope, "analyzer");
    }
    this._update(this.requested, scopes, attribute, value);
  }

  provide(changes: Changes, scopes: string[], attribute: string, value: any) {
    let actionId = `action|${Record.RequestId++}`;
    changes.store("session", actionId, "tag", "action", "analyzer");
    changes.store("session", actionId, "entity", this.id, "analyzer");
    changes.store("session", actionId, "attribute", attribute, "analyzer");
    if(value.id !== undefined) {
      changes.store("session", actionId, "value", value.id, "analyzer");
      changes.store("session", value.id, "tag", "variable", "analyzer");
    } else {
      changes.store("session", actionId, "value", value, "analyzer");
    }
    for(let scope of scopes) {
      changes.store("session", actionId, "scopes", scope, "analyzer");
    }
    this._update(this.provided, scopes, attribute, value);
  }

  remove(scopes: string[], attribute: string, value: Value) {
    this._update(this.removed, scopes, attribute, value);
  }

}

//---------------------------------------------------------------------
// AnalysisContext
//---------------------------------------------------------------------

class AnalysisContext {
  changes: Changes
  block: ParseBlock
  records: {[register: string]: Record} = {}

  record(node) {
    let current = this.records[node.id];
    if(!current) {
      current = this.records[node.id] = new Record();
    }
    return current;
  }

  value(node) {
    if(node.type === "constant") return node.value;
    if(node.type === "variable") return node;
    throw new Error("Trying to get value of non-value type: " + node.type)
  }
}

//---------------------------------------------------------------------
// Analysis
//---------------------------------------------------------------------

class Analysis {

  changes: Changes

  constructor(changes) {
    this.changes = changes;
  }

  //---------------------------------------------------------------------
  // Links
  //---------------------------------------------------------------------

  nodes: {[id: string]: ParseNode} = {}

  downLinks: {[id: string]: string[]} = {}
  upLinks: {[id: string]: string[]} = {}

  _upLink(context, parent, child) {
    if(!parent.id) throw new Error("Trying to link a node without an id: " + parent.type);
    this.nodes[parent.id] = parent;
    let current = this.upLinks[parent.id];
    if(!current) {
      current = this.upLinks[parent.id] = [];
    }
    current.push(parent.id);
  }

  _link(context: AnalysisContext, parent, children, recurse = false) {
    if(!parent.id) throw new Error("Trying to link a node without an id: " + parent.type);
    this.nodes[parent.id] = parent;
    let current = this.downLinks[parent.id];
    if(!current) {
      current = this.downLinks[parent.id] = [];
    }
    if(children.constructor === Array) {
      for(let child of children) {
        current.push(child.id);
        this._upLink(context, child, parent);
        this._upLink(context, child, context.block);
        if(recurse && child.from) {
          this._link(context, child, child.from, recurse);
        }
      }
    } else {
      current.push(children.id);
      this._upLink(context, children, parent);
      this._upLink(context, children, context.block);
      if(recurse && children.from) {
        this._link(context, children, children.from, recurse);
      }
    }
  }

  //---------------------------------------------------------------------
  // Scans
  //---------------------------------------------------------------------

  _scans(context: AnalysisContext, scans) {
    for(let scan of scans) {
      this._link(context, scan, scan.from, true);
      if(scan.type === "record") {
        this._scanRecord(context, scan);
      } else if(scan.type === "scan") {
        this._scanScan(context, scan);
      } else if(scan.type === "ifExpression") {
        this._scanIf(context, scan);
      } else if(scan.type === "not") {
        this._scanNot(context, scan);
      }
    }
  }

  _scanRecord(context: AnalysisContext, node) {
    let record = context.record(node.variable);
    for(let attr of node.attributes) {
      if(attr.value.type === "parenthesis") {
        for(let item of attr.value.items) {
          record.request(context.changes, node.scopes, attr.attribute, context.value(item));
        }
      } else {
        record.request(context.changes, node.scopes, attr.attribute, context.value(attr.value));
      }
    }
    console.log("RECORD", record);
  }

  _scanScan(context: AnalysisContext, node) {
    let record = context.record(node.entity);
    if(node.attribute.type === "variable") {
      record.request(context.changes, node.scopes, "any", context.value(node.value));
    } else {
      record.request(context.changes, node.scopes, context.value(node.attribute), context.value(node.value));
    }
  }

  _scanIf(context: AnalysisContext, ifExpression) {

  }
  _scanNot(context: AnalysisContext, not) {

  }

  //---------------------------------------------------------------------
  // Expressions
  //---------------------------------------------------------------------

  _expressions(context: AnalysisContext, expressions) {
    for(let expression of expressions) {
      this._link(context, expression, expression.from, true);
      if(expression.type === "expression") {

      } else if(expression.type === "functionRecord") {

      }
    }

  }

  //---------------------------------------------------------------------
  // Actions
  //---------------------------------------------------------------------

  _actions(context: AnalysisContext, type: ActionType, actions) {
    for(let action of actions) {
      this._link(context, action, action.from, true);
      if(action.type === "record") {
        this._actionRecord(context, action);
      } else if(action.type === "action") {
        this._actionAction(context, action);
      }
    }
  }

  _actionRecord(context: AnalysisContext, node) {
    let record = context.record(node.variable);
    for(let attr of node.attributes) {
      if(attr.value.type === "parenthesis") {
        for(let item of attr.value.items) {
          record.provide(context.changes, node.scopes, attr.attribute, context.value(item));
        }
      } else {
        record.provide(context.changes, node.scopes, attr.attribute, context.value(attr.value));
      }
    }
    console.log(record);
  }

  _actionAction(context: AnalysisContext, node) {
    let record = context.record(node.entity);
    if(node.action === "erase") {
      if(node.attribute === undefined) {
        record.provide(context.changes, node.scopes, "any", ALL);
      } else {
        record.provide(context.changes, node.scopes, "all", ALL);
      }
    } else if(typeof node.attribute === "string") {
      record.provide(context.changes, node.scopes, node.attribute, context.value(node.value));
    } else if(node.attribute.type === "variable") {
      record.provide(context.changes, node.scopes, "any", context.value(node.value));
    } else {
      record.provide(context.changes, node.scopes, context.value(node.attribute), context.value(node.value));
    }
  }

  //---------------------------------------------------------------------
  // Provided
  //---------------------------------------------------------------------

  provided: {[scope: string]: {[attribute: string]: Value[]}} = {}
  // tag -> attrs -> values -> blocks
  //              -> scopes -> values -> blocks
  //              -> blocks
  _provide(context: AnalysisContext) {
  }

  //---------------------------------------------------------------------
  // Block
  //---------------------------------------------------------------------

  _block(context: AnalysisContext, block: ParseBlock) {
    this._scans(context, block.scanLike);
    this._expressions(context, block.expressions);
    this._actions(context, ActionType.Bind, block.binds);
    this._actions(context, ActionType.Commit, block.commits);
  }

  //---------------------------------------------------------------------
  // Public
  //---------------------------------------------------------------------

  block(block: ParseBlock) {
    let context = this.createContext(block);
    this._block(context, block);
  }

  createContext(block: ParseBlock) {
    let context = new AnalysisContext();
    context.block = block;
    context.changes = this.changes;
    return context;
  }

}

function makeEveAnalyzer() {
  let {results, errors} = parser.parseDoc(global["examples"]["test.eve"]);
  console.log(errors);
  let {text, spans, extraInfo} = results;
  let {blocks} = builder.buildDoc(results);
  // analyzer.analyze(results.blocks);
  console.log("analyzer", blocks);
  let session = new BrowserSessionDatabase(browser.responder);
  session.blocks = blocks;
  let evaluation = new Evaluation();
  evaluation.registerDatabase("session", session);
  return evaluation;
}

export function analyze(blocks: ParseBlock[]) {
  let eve = makeEveAnalyzer();
  let changes = eve.createChanges();
  let analysis = new Analysis(changes);
  for(let block of blocks) {
    analysis.block(block);
  }
  eve.executeActions([], changes);
  console.log(changes);
}

