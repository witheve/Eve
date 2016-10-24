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

  record(parseNode: any, kind: "action" | "scan") {
    let changes = this.changes;
    let recordId = parseNode.id;
    let [start, stop] = nodeToBoundaries(parseNode);
    changes.store("session", recordId, "tag", "record", "analyzer");
    changes.store("session", recordId, "block", this.block.id, "analyzer");
    changes.store("session", recordId, "start", start, "analyzer");
    changes.store("session", recordId, "stop", stop, "analyzer");
    changes.store("session", recordId, "entity", parseNode.variable.id, "analyzer");
    changes.store("session", recordId, "kind", kind, "analyzer");
    for(let scope of parseNode.scopes) {
      changes.store("session", recordId, "scopes", scope, "analyzer");
    }
    return recordId;
  }

  scan(parseNode: any, scopes: string[], entity: any, attribute: string, value: any) {
    let changes = this.changes;
    let scanId = parseNode.id;
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
    let actionId = parseNode.id;
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
    context.record(node, "scan");
    for(let attr of node.attributes) {
      if(attr.value.type === "parenthesis") {
        for(let item of attr.value.items) {
          let id = context.scan(item, node.scopes, node.variable, attr.attribute, context.value(item));
        }
      } else {
        let id = context.scan(attr, node.scopes, node.variable, attr.attribute, context.value(attr.value));
      }
    }
  }

  _scanScan(context: AnalysisContext, node) {
    if(node.attribute.type === "variable") {
      let id = context.scan(node, node.scopes, context.value(node.entity), "any", context.value(node.value));
    } else {
      let id = context.scan(node, node.scopes, context.value(node.entity), context.value(node.attribute), context.value(node.value));
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
    context.record(node, "action");
    for(let attr of node.attributes) {
      if(attr.value.type === "parenthesis") {
        for(let item of attr.value.items) {
          let id = context.provide(item, node.scopes, node.variable, attr.attribute, context.value(item));
        }
      } else {
        let id = context.provide(attr, node.scopes, node.variable, attr.attribute, context.value(attr.value));
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
    } else {
      let attribute = typeof node.attribute === "string" ? node.attribute : context.value(node.attribute);
      if(node.value.type === "parenthesis") {
        for(let item of node.value.items) {
          let id = context.provide(item, node.scopes, node.entity, attribute, context.value(item));
        }
      } else {
        let id = context.provide(node, node.scopes, node.entity, attribute, context.value(node.value));
      }
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
  let {results, errors} = parser.parseDoc(global["examples"]["analyzer.eve"], "analyzer");
  let {text, spans, extraInfo} = results;
  let {blocks, errors: buildErrors} = builder.buildDoc(results);
  if(errors.length || buildErrors.length) {
    console.error("ANALYZER CREATION ERRORS", errors, buildErrors);
  }
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
  eve.fixpoint();
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

export function findCardinality(evaluation: Evaluation, info: any, spans: any[], extraInfo: any) {
  let queryId = `query|${info.requestId}`;
  let query = {tag: "query", token: info.variable};
  let eve = doQuery(queryId, query, spans, extraInfo);

  let sessionIndex = eve.getDatabase("session").index;
  let evSession = evaluation.getDatabase("session");
  let lookup = {};
  let blockId;
  let cardinalities;

  let queryInfo = sessionIndex.alookup("tag", "query");
  if(queryInfo) {
    let [entity] = queryInfo.toValues();
    let obj = sessionIndex.asObject(entity);
    if(obj.register) {
      for(let variable of obj.register) {
        let varObj = sessionIndex.asObject(variable);
        if(varObj) {
          if(!blockId) {
            let found;
            blockId = varObj.block[0];
            for(let block of evSession.blocks) {
              if(block.id === blockId) {
                found = block;
                break;
              }
            }
            cardinalities = resultsToCardinalities(found.results);
          }
          lookup[varObj.token[0]] = cardinalities[varObj.register[0]].cardinality;
        }
      }
    }
  }
  info.cardinality = lookup;
  return info;
}

export function findValue(evaluation: Evaluation, info: any, spans: any[], extraInfo: any) {
  let queryId = `query|${info.requestId}`;
  let query = {tag: "query", token: info.variable};
  let eve = doQuery(queryId, query, spans, extraInfo);

  let sessionIndex = eve.getDatabase("session").index;
  let evSession = evaluation.getDatabase("session");
  let lookup = {};
  let blockId, found;
  let rows = [];
  let varToRegister = {};
  let names = {};

  let queryInfo = sessionIndex.alookup("tag", "query");
  if(queryInfo) {
    let [entity] = queryInfo.toValues();
    let obj = sessionIndex.asObject(entity);
    if(obj.register) {
      for(let variable of obj.register) {
        let varObj = sessionIndex.asObject(variable);
        if(varObj) {
          if(!blockId) {
            blockId = varObj.block[0];
            for(let block of evSession.blocks) {
              if(block.id === blockId) {
                found = block;
                break;
              }
            }
          }
          if(varObj.attribute) {
            for(let attribute of varObj.attribute) {
              varToRegister[attribute] = varObj.register[0];
            }
          }
          lookup[varObj.token[0]] = varObj.register[0];
          names[varObj.token[0]] = varObj.name[0];
        }
      }
    }
  }
  if(info.given) {
    let keys = Object.keys(info.given);
    let registers = [];
    let registerValues = [];
    for(let key of keys) {
      let reg = varToRegister[key];
      if(reg !== undefined && registers.indexOf(reg) === -1) {
        registers.push(reg);
        registerValues.push(info.given[key][0]);
      }
    }
    rows = findResultRows(found.results, registers, registerValues);
  } else {
    rows = found.results;
  }
  info.rows = rows.slice(0,100);
  info.totalRows = rows.length;
  info.variableMappings = lookup;
  info.variableNames = names;
  return info;
}


export function nodeIdToRecord(evaluation, nodeId, spans, extraInfo) {
  let queryId = `query|${nodeId}`;
  let query = {tag: "query", "build-node": nodeId};
  let eve = doQuery(queryId, query, spans, extraInfo);

  let sessionIndex = eve.getDatabase("session").index;
  let queryInfo = sessionIndex.alookup("tag", "query");
  if(queryInfo) {
    let [entity] = queryInfo.toValues();
    let obj = sessionIndex.asObject(entity);
    if(obj.record) {
      return obj.record[0]
    }
  }
  return;
}

export function findSource(evaluation, info, spans, extraInfo) {
  let queryId = `query|${info.requestId}`;
  let query: any = {tag: ["query", "findSource"]};
  if(info.record) query.recordId = info.record;
  if(info.attribute) query.attribute = info.attribute;
  if(info.span) query.span = info.span;

  let evSession = evaluation.getDatabase("session");
  let evBrowser = evaluation.getDatabase("browser");
  evSession.nonExecuting = true;
  evBrowser.nonExecuting = true;
  eve.registerDatabase("evaluation-session", evSession);
  eve.registerDatabase("evaluation-browser", evBrowser);
  doQuery(queryId, query, spans, extraInfo);
  eve.unregisterDatabase("evaluation-session");
  eve.unregisterDatabase("evaluation-browser");
  evSession.nonExecuting = false;
  evBrowser.nonExecuting = false;

  let sessionIndex = eve.getDatabase("session").index;
  let queryInfo = sessionIndex.alookup("tag", "findSource");
  if(queryInfo) {
    let [entity] = queryInfo.toValues();
    let obj = sessionIndex.asObject(entity);
    console.log("FIND SOURCE", obj);
    if(obj.source) {
      info.source = obj.source.map((source) => sessionIndex.asObject(source, false, true));
      return info;
    } else if(obj.block) {
      info.block = obj.block;
      return info;
    } else {
      info.block = [];
      info.source = [];
      return info;
    }
  }
  return;
}

export function findRelated(evaluation, info, spans, extraInfo) {
  let queryId = `query|${info.requestId}`;
  let query: any = {tag: ["query", "findRelated"]};
  let queryType;
  if(info.span) {
    query.span = info.span;
    queryType = "span";
  }
  if(info.variable) {
    query.variable = info.variable;
    queryType = "variable"
  }
  query.for = queryType

  let evSession = evaluation.getDatabase("session");
  eve.registerDatabase("evaluation-session", evSession);
  doQuery(queryId, query, spans, extraInfo);
  eve.unregisterDatabase("evaluation-session");

  let sessionIndex = eve.getDatabase("session").index;
  let queryInfo = sessionIndex.alookup("tag", "findRelated");
  if(queryInfo) {
    let [entity] = queryInfo.toValues();
    let obj = sessionIndex.asObject(entity);
    if(queryType === "span" && obj.variable) {
      info.variable = obj.variable;
    } else if(queryType === "variable" && obj.span) {
      info.span = obj.span;
    } else {
      info.variable = [];
      info.span = [];
    }
    return info;
  }
  return;
}

export function findAffector(evaluation, info, spans, extraInfo) {
  let queryId = `query|${info.requestId}`;
  let query: any = {tag: ["query", "findAffector"]};
  if(info.record) query.recordId = info.record;
  if(info.attribute) query.attribute = info.attribute;
  if(info.span) query.span = info.span;

  let evSession = evaluation.getDatabase("session");
  let evBrowser = evaluation.getDatabase("browser");
  evSession.nonExecuting = true;
  evBrowser.nonExecuting = true;
  eve.registerDatabase("evaluation-session", evSession);
  eve.registerDatabase("evaluation-browser", evBrowser);
  doQuery(queryId, query, spans, extraInfo);
  eve.unregisterDatabase("evaluation-session");
  eve.unregisterDatabase("evaluation-browser");
  evSession.nonExecuting = false;
  evBrowser.nonExecuting = false;

  let sessionIndex = eve.getDatabase("session").index;
  let queryInfo = sessionIndex.alookup("tag", "findAffector");
  if(queryInfo) {
    let [entity] = queryInfo.toValues();
    let obj = sessionIndex.asObject(entity);
    console.log("FIND AFFECTOR", obj);
    if(obj.affector) {
      info.affector = obj.affector.map((affector) => sessionIndex.asObject(affector, false, true));
      return info;
    } else {
      info.affector = [];
      return info;
    }
  }
  return;
}

export function findFailure(evaluation, info, spans, extraInfo) {
  let evSession = evaluation.getDatabase("session");
  let failingSpans = info.span = [];
  let sessionIndex = eve.getDatabase("session").index;

  for(let queryBlockId of info.block) {
    let found;
    for(let block of evSession.blocks) {
      if(block.id === queryBlockId) {
        found = block;
        break;
      }
    }
    let scan = blockToFailingScan(found);
    if(scan) {
      let level = sessionIndex.alookup("build-node", scan.id);
      if(level) {
        let analyzerScanId = level.toValues()[0];
        let analyzerScan = sessionIndex.asObject(analyzerScanId, false, true);

        failingSpans.push({id: analyzerScanId, buildId: scan.id, block: found.id, start: analyzerScan.start, stop: analyzerScan.stop});
      }
    }
  }
  return info;
}

export function findRootDrawers(evaluation, info, spans, extraInfo) {
  let queryId = `query|${info.requestId}`;
  let query = {tag: "findRootDrawers"};
  let eve = doQuery(queryId, query, spans, extraInfo);

  let sessionIndex = eve.getDatabase("session").index;
  let queryInfo = sessionIndex.alookup("tag", "findRootDrawers");
  if(queryInfo) {
    let [entity] = queryInfo.toValues();
    let obj = sessionIndex.asObject(entity);
    if(obj.drawer) {
      info.drawers = obj.drawer.map((id) => sessionIndex.asObject(id, false, true));
    } else {
      info.drawers = [];
    }
  }
  return info;
}

export function findMaybeDrawers(evaluation, info, spans, extraInfo) {
  let queryId = `query|${info.requestId}`;
  let query = {tag: "findMaybeDrawers"};
  let eve = doQuery(queryId, query, spans, extraInfo);

  let sessionIndex = eve.getDatabase("session").index;
  let queryInfo = sessionIndex.alookup("tag", "findMaybeDrawers");
  if(queryInfo) {
    let [entity] = queryInfo.toValues();
    let obj = sessionIndex.asObject(entity);
    if(obj.drawer) {
      info.drawers = obj.drawer.map((id) => sessionIndex.asObject(id, false, true));
    } else {
      info.drawers = [];
    }
  }
  return info;
}



function blockToFailingScan(block) {
  let scan;
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
      scan = stratum.scans[maxIx];
      break;
    }
  }
  return scan;
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

function findResultRows(results, registers, values) {
  let found = [];
  for(let result of results) {
    let skip;
    let ix = 0;
    for(let register of registers) {
      if(result[register] !== values[ix]) {
        skip = true;
        break;
      }
      ix++;
    }
    if(!skip) {
      found.push(result);
    }
  }
  return found;
}
