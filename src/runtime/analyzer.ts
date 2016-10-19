//---------------------------------------------------------------------
// Analyzer
//---------------------------------------------------------------------

import {ParseBlock, ParseNode, nodeToBoundaries} from "./parser"
import {Evaluation, Database} from "./runtime"
import {TripleIndex} from "./indexes"
import {Changes} from "./changes"
import * as join from "./join"
import * as client from "../client"
import * as parser from "./parser"
import * as builder from "./builder"
import * as analyzer from "./analyzer"
import * as browser from "./browser"
import {BrowserSessionDatabase} from "./databases/browserSession"

enum ActionType { Bind, Commit }

//---------------------------------------------------------------------
// AnalysisContext
//---------------------------------------------------------------------

class AnalysisContext {
  ScanId = 0;
  changes: Changes
  block: ParseBlock
  spans: any[];
  extraInfo: any;

  constructor(spans, extraInfo) {
    this.spans = spans;
    this.extraInfo = extraInfo;
  }

  record(parseNode: any) {
    let changes = this.changes;
    let recordId = `${this.block.id}|record|${this.ScanId++}`;
    let [start, stop] = nodeToBoundaries(parseNode);
    changes.store("session", recordId, "tag", "record", "analyzer");
    changes.store("session", recordId, "block", this.block.id, "analyzer");
    changes.store("session", recordId, "start", start, "analyzer");
    changes.store("session", recordId, "stop", stop, "analyzer");
    changes.store("session", recordId, "entity", parseNode.variable.id, "analyzer");
    for(let scope of parseNode.scopes) {
      changes.store("session", recordId, "scopes", scope, "analyzer");
    }
    this.spans.push(start, stop, "record", recordId);
    return recordId;
  }

  scan(parseNode: any, scopes: string[], entity: any, attribute: string, value: any) {
    let changes = this.changes;
    let scanId = `${this.block.id}|scan|${this.ScanId++}`;
    let [start, stop] = nodeToBoundaries(parseNode, this.block.start);
    changes.store("session", scanId, "tag", "scan", "analyzer");
    changes.store("session", scanId, "block", this.block.id, "analyzer");
    changes.store("session", scanId, "start", start, "analyzer");
    changes.store("session", scanId, "stop", stop, "analyzer");
    changes.store("session", scanId, "entity", entity.id, "analyzer");
    changes.store("session", scanId, "attribute", attribute, "analyzer");
    if(parseNode.buildId !== undefined) {
      changes.store("session", scanId, "build-node", parseNode.buildId, "analyzer");
    }
    if(value.id !== undefined) {
      changes.store("session", scanId, "value", value.id, "analyzer");
      changes.store("session", value.id, "tag", "variable", "analyzer");
    } else {
      changes.store("session", scanId, "value", value, "analyzer");
    }
    for(let scope of scopes) {
      changes.store("session", scanId, "scopes", scope, "analyzer");
    }
    return scanId;
  }

  provide(parseNode: any, scopes: string[], entity: any, attribute: string, value: any) {
    let changes = this.changes;
    let actionId = `${this.block.id}|action|${this.ScanId++}`;
    let [start, stop] = nodeToBoundaries(parseNode, this.block.start);
    changes.store("session", actionId, "tag", "action", "analyzer");
    changes.store("session", actionId, "block", this.block.id, "analyzer");
    changes.store("session", actionId, "start", start, "analyzer");
    changes.store("session", actionId, "stop", stop, "analyzer");
    changes.store("session", actionId, "entity", entity.id, "analyzer");
    changes.store("session", actionId, "attribute", attribute, "analyzer");
    if(parseNode.buildId !== undefined) {
      changes.store("session", actionId, "build-node", parseNode.buildId, "analyzer");
    }
    if(value.id !== undefined) {
      changes.store("session", actionId, "value", value.id, "analyzer");
      changes.store("session", value.id, "tag", "variable", "analyzer");
    } else {
      changes.store("session", actionId, "value", value, "analyzer");
    }
    for(let scope of scopes) {
      changes.store("session", actionId, "scopes", scope, "analyzer");
    }
    return actionId;
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
    context.record(node);
    for(let attr of node.attributes) {
      if(attr.value.type === "parenthesis") {
        for(let item of attr.value.items) {
          let id = context.scan(item, node.scopes, node.variable, attr.attribute, context.value(item));
          this._link(context, id, item.id)
        }
      } else {
        let id = context.scan(attr, node.scopes, node.variable, attr.attribute, context.value(attr.value));
        this._link(context, id, attr.id)
      }
    }
  }

  _scanScan(context: AnalysisContext, node) {
    if(node.attribute.type === "variable") {
      let id = context.scan(node, node.scopes, context.value(node.entity), "any", context.value(node.value));
      this._link(context, id, node.id)
    } else {
      let id = context.scan(node, node.scopes, context.value(node.entity), context.value(node.attribute), context.value(node.value));
      this._link(context, id, node.id)
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
    context.record(node);
    for(let attr of node.attributes) {
      if(attr.value.type === "parenthesis") {
        for(let item of attr.value.items) {
          let id = context.provide(item, node.scopes, node.variable, attr.attribute, context.value(item));
          this._link(context, id, attr.id)
        }
      } else {
        let id = context.provide(attr, node.scopes, node.variable, attr.attribute, context.value(attr.value));
        this._link(context, id, attr.id)
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
      let id = context.provide(node, node.scopes, node.entity, node.attribute, context.value(node.value));
      this._link(context, id, node.id)
    } else if(node.attribute.type === "variable") {
      let id = context.provide(node, node.scopes, node.entity, "any", context.value(node.value));
      this._link(context, id, node.id)
    } else {
      let id = context.provide(node, node.scopes, node.entity, context.value(node.attribute), context.value(node.value));
      this._link(context, id, node.id)
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
      if(variable.register !== undefined) {
        changes.store("session", variable.id, "register", variable.register);
      }
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

  _link(context, aId, bId) {
    let changes = context.changes;
    if(!aId || !bId) throw new Error("WAT");
    let linkId = `${context.block.id}|link|${context.ScanId++}`;
    changes.store("session", linkId, "tag", "link");
    changes.store("session", linkId, "block", context.block.id);
    changes.store("session", linkId, "a", aId);
    changes.store("session", linkId, "b", bId);
  }

  _links(context: AnalysisContext, links) {
    for(let ix = 0, len = links.length; ix < len; ix += 2) {
      let aId = links[ix];
      let bId = links[ix + 1];
      this._link(context, aId, bId);
    }
  }

  //---------------------------------------------------------------------
  // Tokens
  //---------------------------------------------------------------------

  _tokens(context, tokens) {
    let changes = context.changes;
    for(let token of tokens) {
      let tokenId = token.id;
      changes.store("session", tokenId, "tag", "token");
      changes.store("session", tokenId, "block", context.block.id);
      changes.store("session", tokenId, "start", token.startOffset);
      changes.store("session", tokenId, "stop", token.endOffset);
    }
  }

  //---------------------------------------------------------------------
  // Block
  //---------------------------------------------------------------------

  _block(context: AnalysisContext, block: ParseBlock) {
    context.changes.store("session", block.id, "tag", "block");
    this._links(context, block.links);
    this._tokens(context, block.tokens);
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

  block(block: ParseBlock, spans, extraInfo) {
    let context = this.createContext(block, spans, extraInfo);
    this._block(context, block);
  }

  createContext(block: ParseBlock, spans, extraInfo) {
    let context = new AnalysisContext(spans, extraInfo);
    context.block = block;
    context.changes = this.changes;
    return context;
  }

}

export class EditorDatabase extends Database {
  spans: any[];
  extraInfo: any;

  constructor(spans, extraInfo) {
    super();
    this.spans = spans;
    this.extraInfo = extraInfo;
  }

  onFixpoint(evaluation: Evaluation, changes: Changes) {
    super.onFixpoint(evaluation, changes);
    let name = evaluation.databaseToName(this);
    let index = this.index;
    let comments = index.alookup("tag", "comment");
    if(comments) {
      for(let commentId of Object.keys(comments.index)) {
        let comment = index.asObject(commentId, false, true);
        this.spans.push(comment.start, comment.stop, "document_comment", commentId);
        comment.spanId = commentId;
        this.extraInfo[commentId] = comment;
      }
    }
  }
}

function makeEveAnalyzer() {
  if(eve) return eve;
  let {results, errors} = parser.parseDoc(global["examples"]["analyzer.eve"]);
  let {text, spans, extraInfo} = results;
  let {blocks} = builder.buildDoc(results);
  let browserDb = new BrowserSessionDatabase(browser.responder);
  let session = new Database();
  session.blocks = blocks;
  let evaluation = new Evaluation();
  evaluation.registerDatabase("session", session);
  evaluation.registerDatabase("browser", browserDb);
  return evaluation;
}

let eve;

export function analyze(blocks: ParseBlock[], spans: any[], extraInfo: any) {
  console.time();
  eve = makeEveAnalyzer();
  let session = new Database();
  let prev = eve.getDatabase("session")
  session.blocks = prev.blocks;
  console.log("ANALYZER BLOCKS", session.blocks);
  eve.unregisterDatabase("session");
  eve.registerDatabase("session", session);
  let editorDb = new EditorDatabase(spans, extraInfo);
  eve.unregisterDatabase("editor");
  eve.registerDatabase("editor", editorDb);
  let changes = eve.createChanges();
  let analysis = new Analysis(changes);
  for(let block of blocks) {
    analysis.block(block, spans, extraInfo);
  }
  changes.commit();
  console.log(changes);
  console.timeEnd();
  // eve.executeActions([], changes);
}


let prevQuery;
function doQuery(queryId, query, spans, extraInfo) {
  eve = makeEveAnalyzer();
  let editorDb = new EditorDatabase(spans, extraInfo);
  eve.unregisterDatabase("editor");
  eve.registerDatabase("editor", editorDb);
  let changes = eve.createChanges();
  if(prevQuery) {
    changes.unstoreObject(prevQuery.queryId, prevQuery.query, "analyzer", "session");
  }
  changes.storeObject(queryId, query, "analyzer", "session");
  eve.executeActions([], changes);
  prevQuery = {queryId, query};
  return eve;
}

export function tokenInfo(evaluation: Evaluation, tokenId: string, spans: any[], extraInfo: any) {
  let queryId = `query|${tokenId}`;
  let query = {tag: "query", token: tokenId};
  let eve = doQuery(queryId, query, spans, extraInfo);

  // look at the results and find out which action node we were looking
  // at
  let sessionIndex = eve.getDatabase("session").index;
  let queryInfo = sessionIndex.alookup("tag", "query");
  let evSession = evaluation.getDatabase("session");
  if(queryInfo) {
    for(let entity of Object.keys(queryInfo.index)) {
      let info = sessionIndex.asObject(entity);

      console.log("INFO", info);
      // why is this failing?
      let nodeArray = info.scan || info.action;
      if(nodeArray) {
        let node = sessionIndex.asObject(nodeArray[0]);
        let blockId = node["block"][0];
        let found;
        for(let block of evSession.blocks) {
          console.log("BLOCK ID", block.id, node["block"]);
          if(block.id === blockId) {
            found = block;
            break;
          }
        }
        console.log("NODE BLOCK", blockId, found);
        console.log("FAILING SCAN", blockToFailingScan(found));
        console.log("CARDINALITIES", resultsToCardinalities(found.results))
        console.log("SPECIFIC ROWS", findResultRows(found.results, 2, "cherry"))
      }

      // look for the facts that action creates
      if(info.action) {
        for(let actionId of info.action) {
          let action = sessionIndex.asObject(actionId);
          let evIndex = evaluation.getDatabase(action.scopes[0]).index;
          let nodeItems = evIndex.nodeLookup(action["build-node"][0]);
          if(nodeItems) {
            console.log("ACTION", action["build-node"][0]);
            console.log(evIndex.toTriples(false, nodeItems.index));
          }
        }
      }
    }
  }
}

export function nodeIdToRecord(nodeId) {
  let queryId = `query|${nodeId}`;
  let query = {tag: "query", build-id: nodeId};
  let eve = doQuery(queryId, query, spans, extraInfo);

  let sessionIndex = eve.getDatabase("session").index;
  let queryInfo = sessionIndex.alookup("tag", "query");
  let evSession = evaluation.getDatabase("session");
  if(queryInfo) {
    let [entity] = queryInfo.toValues();
    let obj = sessionIndex.asObject(obj);
  }
}

function blockToFailingScan(block) {
  let scanId;
  for(let stratum of block.strata) {
    if(stratum.resultCount === 0) {
      let {solverInfo} = stratum;
      let scanIx = 0;
      let maxFailures = 0;
      let maxIx = 0;
      for(let failures of solverInfo) {
        if(failures > maxFailures) {
          maxFailures = failures;
          maxIx = scanIx;
        }
        scanIx++;
      }
      scanId = stratum.scans[maxIx].id;
    }
  }
  return scanId;
}

function resultsToCardinalities(results) {
  let cardinalities = [];
  let ix = 0;
  while(ix < results[0].length) {
    cardinalities[ix] = {cardinality: 0, values: {}};
    ix++;
  }

  for(let result of results) {
    let ix = 0;
    for(let value of result) {
      let info = cardinalities[ix];
      if(!info.values[value]) {
        info.values[value] = true;
        info.cardinality++;
      }
      ix++;
    }
  }

  return cardinalities;
}

function findResultRows(results, register, value) {
  let found = [];
  for(let result of results) {
    if(result[register] === value) {
      found.push(result);
    }
  }
  return found;
}
