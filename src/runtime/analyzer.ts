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
// AnalysisContext
//---------------------------------------------------------------------

class AnalysisContext {
  static ScanId = 0;
  changes: Changes
  block: ParseBlock

  request(scopes: string[], entity: any, attribute: string, value: any) {
    let changes = this.changes;
    let scanId = `scan|${AnalysisContext.ScanId++}`;
    changes.store("session", scanId, "tag", "scan", "analyzer");
    changes.store("session", scanId, "block", this.block.id, "analyzer");
    changes.store("session", scanId, "entity", entity.id, "analyzer");
    changes.store("session", scanId, "attribute", attribute, "analyzer");
    if(value.id !== undefined) {
      changes.store("session", scanId, "value", value.id, "analyzer");
      changes.store("session", value.id, "tag", "variable", "analyzer");
    } else {
      changes.store("session", scanId, "value", value, "analyzer");
    }
    for(let scope of scopes) {
      changes.store("session", scanId, "scopes", scope, "analyzer");
    }
  }

  provide(scopes: string[], entity: any, attribute: string, value: any) {
    let changes = this.changes;
    let actionId = `action|${AnalysisContext.ScanId++}`;
    changes.store("session", actionId, "tag", "action", "analyzer");
    changes.store("session", actionId, "block", this.block.id, "analyzer");
    changes.store("session", actionId, "entity", entity.id, "analyzer");
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
  // Scans
  //---------------------------------------------------------------------

  _scans(context: AnalysisContext, scans) {
    for(let scan of scans) {
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
    for(let attr of node.attributes) {
      if(attr.value.type === "parenthesis") {
        for(let item of attr.value.items) {
          context.request(node.scopes, node.variable, attr.attribute, context.value(item));
        }
      } else {
        context.request(node.scopes, node.variable, attr.attribute, context.value(attr.value));
      }
    }
  }

  _scanScan(context: AnalysisContext, node) {
    if(node.attribute.type === "variable") {
      context.request(node.scopes, context.value(node.entity), "any", context.value(node.value));
    } else {
      context.request(node.scopes, context.value(node.entity), context.value(node.attribute), context.value(node.value));
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
      if(action.type === "record") {
        this._actionRecord(context, action);
      } else if(action.type === "action") {
        this._actionAction(context, action);
      }
    }
  }

  _actionRecord(context: AnalysisContext, node) {
    for(let attr of node.attributes) {
      if(attr.value.type === "parenthesis") {
        for(let item of attr.value.items) {
          context.provide(node.scopes, node.variable, attr.attribute, context.value(item));
        }
      } else {
        context.provide(node.scopes, node.variable, attr.attribute, context.value(attr.value));
      }
    }
  }

  _actionAction(context: AnalysisContext, node) {
    if(node.action === "erase") {
      // if(node.attribute === undefined) {
      //   context.provide(node.scopes, "any", "");
      // } else {
      //   context.provide(node.scopes, "all", "");
      // }
    } else if(typeof node.attribute === "string") {
      context.provide(node.scopes, node.entity, node.attribute, context.value(node.value));
    } else if(node.attribute.type === "variable") {
      context.provide(node.scopes, node.entity, "any", context.value(node.value));
    } else {
      context.provide(node.scopes, node.entity, context.value(node.attribute), context.value(node.value));
    }
  }

  //---------------------------------------------------------------------
  // Variables
  //---------------------------------------------------------------------

  _variables(context: AnalysisContext, variables) {
    let changes = context.changes;
    for(let name of Object.keys(variables)) {
      let variable = variables[name];
      changes.store("session", variable.id, "tag", "variable");
      changes.store("session", variable.id, "name", variable.name);
      changes.store("session", variable.id, "block", context.block.id);
      if(variable.generated) {
        changes.store("session", variable.id, "tag", "generated");
      }
      if(variable.nonProjecting) {
        changes.store("session", variable.id, "tag", "non-projecting");
      }
    }
  }

  //---------------------------------------------------------------------
  // Equalities
  //---------------------------------------------------------------------

  _equalities(context: AnalysisContext, equalities) {
    let changes = context.changes;
    let ix = 0;
    for(let [a, b] of equalities) {
      let equalityId = `${context.block.id}|equality|${ix++}`;
      a = context.value(a);
      b = context.value(b);
      let aId = a.id ? a.id : a;
      let bId = b.id ? b.id : b;
      changes.store("session", equalityId, "tag", "equality");
      changes.store("session", equalityId, "block", context.block.id);
      changes.store("session", equalityId, "a", aId);
      changes.store("session", equalityId, "b", bId);
    }
  }

  //---------------------------------------------------------------------
  // Links
  //---------------------------------------------------------------------

  _links(context: AnalysisContext, links) {
    let changes = context.changes;
    for(let ix = 0, len = links.length; ix < len; ix += 2) {
      let equalityId = `${context.block.id}|link|${ix}`;
      let aId = links[ix];
      let bId = links[ix + 1];
      if(!aId || !bId) throw new Error("WAT")
      changes.store("session", equalityId, "tag", "link");
      changes.store("session", equalityId, "block", context.block.id);
      changes.store("session", equalityId, "a", aId);
      changes.store("session", equalityId, "b", bId);
    }
  }
  //---------------------------------------------------------------------
  // Block
  //---------------------------------------------------------------------

  _block(context: AnalysisContext, block: ParseBlock) {
    context.changes.store("session", block.id, "tag", "block");
    this._links(context, block.links);
    this._variables(context, block.variables);
    this._equalities(context, block.equalities);
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
  let {results, errors} = parser.parseDoc(global["examples"]["analyzer.eve"]);
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

