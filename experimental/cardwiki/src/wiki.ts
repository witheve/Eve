"use strict"
import {parse as marked, Renderer as MarkedRenderer} from "../vendor/marked";
import {Element} from "./microReact";
import * as runtime from "./runtime";
import {TokenTypes, getTokens} from "./queryParser";
import {eve} from "./app";
import * as app from "./app";
import * as microreact from "./microreact";
import * as utils from "./utils";

declare var CodeMirror;
declare var pluralize;
declare var uuid;

const MAX_NUMBER = runtime.MAX_NUMBER;

//---------------------------------------------------------
// Entity
//---------------------------------------------------------

export var coerceInput = utils.coerceInput;

var breaks = /[{}\|:\n#"]/;
var types = {
  "#": "header",
  "{": "link open",
  "}": "link close",
  ":": "assignment",
  "\"": "text",
}
function tokenize(entity) {
  let line = 0;
  let ix = 0;
  let len = entity.length;
  let tokens = [];
  let cur = {ix, line, type: "text", text: ""};
  for(; ix < len; ix++) {
    let ch = entity[ix];
    if(ch.match(breaks)) {
      let type = types[ch];
      if(type === "text") {
        ch = entity[++ix];
        while(ch && ch !== "\"") {
          if(ch === "\n") line++;
          cur.text += ch;
          ch = entity[++ix];
        }
        tokens.push(cur);
        ix++;
        cur = {ix: ix+1, line, type: "text", text: ""};
        continue;
      }
      if(ch === "\n") line++;
      if(cur.text !== "" || cur.line !== line) {
        tokens.push(cur);
      }
      if(ch === "\n") {
        cur = {ix: ix+1, line, type: "text", text: ""};
        continue;
      }
      cur = {ix, line, type, text: ch};
      tokens.push(cur);
      if(types[cur.text]) {
        cur.type = types[cur.text];
      }
      if(type === "header") {
        //trim the next character if it's a space between the header indicator
        //and the text;
        if(entity[ix+1] === " ") ix++;
      }
      cur = {ix: ix+1, line, type: "text", text: ""};
    } else {
      cur.text += ch;
    }
  }
  tokens.push(cur);
  return tokens;
}

function parse(tokens) {
  let links = [];
  let eavs = [];
  let collections = [];
  let state:any = {items: []};
  let lines = [];
  let line;
  let lineIx = -1;
  for(let token of tokens) {
    if(token.line !== lineIx) {
      // this accounts for blank lines.
      while(lineIx < token.line) {
        line = {ix: token.line, header: false, items: []};
        lines.push(line);
        lineIx++;
      }
    }
    let {type} = token;
    switch(type) {
      case "header":
        line.header = true;
        break;
      case "link open":
        state.capturing = true;
        state.mode = "link";
        state.items.push(token);
        break;
      case "link close":
        state.items.push(token);
        state.type = "link";
        if(state.mode === "assignment") {
          if(state.attribute === "is a") {
            state.type = "collection";
            state.link = state.value;
          } else {
            state.type = "eav";
          }
          eavs.push(state);
        } else {
          state.type = "eav";
          state.attribute = "generic related to";
          state.value = state.link;
          eavs.push(state);
        }
        line.items.push(state);
        state = {items: []};
        break;
      case "assignment":
        if(!state.capturing) {
          token.type = "text";
          line.items.push(token);
          break;
        }
        state.mode = "assignment";
        state.attribute = state.link;
        break;
      case "text":
        if(!state.capturing) {
          line.items.push(token);
        } else if(state.mode === "link") {
          state.link = token.text.trim();
          state.items.push(token);
        } else if(state.mode === "assignment") {
          state.value = coerceInput(token.text.trim());
          state.items.push(token);
        }
        break;
    }
  }
  return {lines, links, collections, eavs};
}

var parseCache;
function parseEntity(entityId, content) {
  if(!parseCache) parseCache = {};
  let cached = parseCache[entityId];
  if(!cached || cached[0] !== content) {
    cached = parseCache[entityId] = [content, parse(tokenize(content))];
  }
  return cached[1];
}

var modifiers = {
  "per": "group",
  "each": "group",
  "grouped": "group",
  "without": "deselect",
  "not": "deselect",
  "aren't": "deselect",
  "except": "deselect",
  "don't": "deselect",
}
var operations = {
  "sum": {op: "sum", argCount: 1, aggregate: true, args: ["value"]},
  "count": {op: "count", argCount: 0, aggregate: true, args: []},
  "average": {op: "average", argCount: 1, aggregate: true, args: ["value"]},
  "mean": {op: "average", argCount: 1, aggregate: true, args: ["value"]},
  "top": {op: "sort limit", argCount: 2, direction: "descending"},
  "bottom": {op: "sort limit", argCount: 2, direction: "ascending"},
  "highest": {op: "sort limit", argCount: 1, direction: "descending", limit: 1},
  "lowest": {op: "sort limit", argCount: 1, direction: "ascending", limit: 1},
  ">": {op: ">", argCount: 2, infix: true, args: ["a", "b"], filter: true},
  ">=": {op: ">=", argCount: 2, infix: true, args: ["a", "b"], filter: true},
  "greater": {op: ">", argCount: 2, infix: true, args: ["a", "b"], filter: true},
  "bigger": {op: ">", argCount: 2, infix: true, args: ["a", "b"], filter: true},
  "<": {op: "<", argCount: 2, infix: true, args: ["a", "b"], filter: true},
  "<=": {op: "<=", argCount: 2, infix: true, args: ["a", "b"], filter: true},
  "lower": {op: "<", argCount: 2, infix: true, args: ["a", "b"], filter: true},
  "smaller": {op: "<", argCount: 2, infix: true, args: ["a", "b"], filter: true},
  "=": {op: "=", argCount: 2, infix: true, args: ["a", "b"], filter: true},
  "equal": {op: "=", argCount: 2, infix: true, args: ["a", "b"], filter: true},
  "contains": {op: "contains", argCount: 2, infix: true, args: ["haystack", "needle"]},
  "older": {op: ">", argCount: 2, infix: true, attribute: "age", args: ["a", "b"], filter: true},
  "younger": {op: "<", argCount: 2, infix: true, attribute: "age", args: ["a", "b"], filter: true},
  "+": {op: "+", argCount: 2, infix: true, args: ["a", "b"]},
  "-": {op: "-", argCount: 2, infix: true, args: ["a", "b"]},
  "/": {op: "/", argCount: 2, infix: true, args: ["a", "b"]},
  "*": {op: "*", argCount: 2, infix: true, args: ["a", "b"]},
}
function newSearchTokens(searchString) {
  let cleaned = searchString.toLowerCase();
  let all = getTokens(cleaned);
  all.forEach((token) => {
    if(token.type === TokenTypes.MODIFIER) {
      token.modifier = modifiers[token.found];
    } else if(token.type === TokenTypes.PATTERN) {
      token.type = TokenTypes.OPERATION;
      token.operation = operations[token.found];
    }
  });
  return all.filter((token) => token.type !== TokenTypes.TEXT);
}

function walk(tree, indent = 0) {
  if(!tree) return console.log("UNDEFINED TREE");
  let text = tree.found;
  if(!text && tree.operation) {
    text = tree.operation.op;
  } else if(!text && tree.value) {
    text = tree.value;
  }
  if(tree.children) {
    for(let child of tree.children) {
      walk(child, indent+1);
    }
  }
  console.groupEnd();
}


var tokenRelationships = {
  [TokenTypes.COLLECTION]: {
    [TokenTypes.COLLECTION]: findCollectionToCollectionRelationship,
    [TokenTypes.ATTRIBUTE]: findCollectionToAttrRelationship,
    [TokenTypes.ENTITY]: findCollectionToEntRelationship,
  },
  [TokenTypes.ENTITY]: {
    [TokenTypes.ATTRIBUTE]: findEntToAttrRelationship,
  },
}
function tokensToRelationship(token1, token2) {
  let func = tokenRelationships[token1.type];
  if(func) func = func[token2.type];
  if(func) {
    return func(token1.found, token2.found);
  }
}

function planTree(searchString) {
  let tokens = newSearchTokens(searchString);
  var tree = {roots: [], operations: [], groups: []}
  let root:any;
  let cursor:any;
  let state:any = {operationStack: []};
  // find the root subject which is either the first collection found
  // or if there are not collections, the first entity
  for(let token of tokens) {
    if(token.type === TokenTypes.COLLECTION) {
      token.children = [];
      root = token;
      break;
    } else if(token.type === TokenTypes.ENTITY && (!root || root.type === TokenTypes.ATTRIBUTE)) {
      token.children = [];
      root = token;
    } else if(token.type === TokenTypes.ATTRIBUTE && !root) {
      token.children = [];
      root = token;
    }
  }
  tree.roots.push(root);
  for(let tokenIx = 0, len = tokens.length; tokenIx < len; tokenIx++) {
    let token = tokens[tokenIx];
    token.id = uuid();
    let {type} = token;

    if(state.group && (type === TokenTypes.COLLECTION || type === TokenTypes.ATTRIBUTE)) {
      token.group = true;
      tree.groups.push(token);
    }

    if(token === root) continue;

    if(type === TokenTypes.MODIFIER) {
      state[token.modifier] = true;
      continue;
    }

    token.children = [];

    if(type === TokenTypes.OPERATION) {
      if(state.lastValue) {
        state.lastValue = null;
        token.children.push(state.lastValue);
      }
      state.operationStack.push({cursor, operator: state.operator});
      state.consuming = true;
      state.operator = token;
      cursor = token;
      continue;
    }

    if(!state.consuming && type === TokenTypes.VALUE) {
      state.lastValue = token;
      continue;
    }

    let maybeSubject = (type === TokenTypes.COLLECTION || type === TokenTypes.ENTITY);
    if(state.deselect && maybeSubject) {
      token.deselect = true;
      state.deselect = false;
    }

    let activeRoot = root;
    if(state.consuming) {
      activeRoot = state.operator;
      let argCount = state.operator.operation.argCount;
      if(state.operator.operation.infix) argCount--;
      while(state.operator.children.length > argCount) {
        let item = state.operationStack.pop();
        cursor = item.cursor;
        // we consumed one too many, so push that onto either the parent operator or
        // the root
        let overflowCursor = item.operator ? item.operator : root;
        overflowCursor.children.push(state.operator.children.pop());

        // run through the items, determine if they're a totally different root,
        // or if they belong to the current cursor/root
        let operation = state.operator.operation;
        let operatorChildren = state.operator.children;
        let ix = 0;
        for(let child of operatorChildren) {
          if(child.type === TokenTypes.ATTRIBUTE) {
            cursor.children.push(child);
            operatorChildren[ix] = child;
          } else if(child.type !== TokenTypes.VALUE) {
            // we have something that could nest.
            let tip = child;
            while(tip.children.length) {
              tip = tip.children[tip.children.length - 1];
            }
            if(operation.attribute) {
              tip.children.push({type: TokenTypes.ATTRIBUTE, found: operation.attribute, orig: operation.attribute, id: uuid(), children: []});
            }
            // if this is an infix operation, then this is an entirely different root now
            if(operation.infix) {
              tree.roots.push(child);
            } else {
              throw new Error("Non infix operation with a non-attribute child: " + JSON.stringify(state.operator));
            }
            operatorChildren[ix] = tip;
          }
          ix++;
        }

        // if this is an infix operator that invokes an attribute, e.g. "older", push
        // that attribute onto the cursor
        if(operation.infix && operation.attribute) {
          let attr = {type: TokenTypes.ATTRIBUTE, found: operation.attribute, orig: operation.attribute, id: uuid(), children: []};
          cursor.children.push(attr);
          // we also need to add this as the first arg to the function
          state.operator.children.unshift(attr);
        } else if(operation.infix) {
          // we need to add the closest thing before this as the first arg to the function.
          let tip = cursor || root;
          while(tip.children.length) {
            tip = tip.children[tip.children.length - 1];
          }
          state.operator.children.unshift(tip);
          // if we don't have an attribute to attach to the right side, let's assume
          // that it mirrors the left.
//             var rightSide = state.operator.children[state.operator.children.length - 1];
//             if(rightSide.type !== "attribute") {
//               let attr = {type: "attribute", found: tip.found, orig: tip.found, id: uuid(), children: []};
//               rightSide.children.push(attr);
//               state.operator.children[state.operator.children.length - 1] = attr;
//             }
        }

        tree.operations.push(state.operator);

        if(item.operator) {
          activeRoot = state.operator = item.operator;
          argCount = state.operator.operation.argCount;
          if(state.operator.operation.infix) argCount--;
        } else {
          // we're done consuming now
          state.consuming = false;
          state.operator = null;
          state.lastValue = false;
          activeRoot = root;
          break;
        }
      }
    }

    // if we don't have a cursor, then associate to the root
    if(!cursor) {
      activeRoot.children.push(token);
    }
    // all values just get pushed onto the activeRoot
    else if(type === TokenTypes.VALUE) {
      activeRoot.children.push(token);
    }
    // if the current cursor is an entity and this is anything other than an attribute, this is related
    // to the root.
    else if(cursor.type === TokenTypes.ENTITY && type !== TokenTypes.ATTRIBUTE) {
      activeRoot.children.push(token);
    }
    // if the current cursor is an entity or a collection, we have to check if it should go to the cursor
    // or the root
    else if(cursor.type === TokenTypes.ENTITY || cursor.type === TokenTypes.COLLECTION) {
      let cursorRel = tokensToRelationship(cursor, token);
      let rootRel = tokensToRelationship(root, token);
      // if this token is an entity and either root or cursor has a direct relationship
      // we don't really want to use that as it's most likely meant to filter a set down
      // instead of reduce the set to exactly one ent
      if(token.type === TokenTypes.ENTITY) {
        if(cursorRel && cursorRel.distance === 0) cursorRel = null;
        if(rootRel && rootRel.distance === 0) rootRel = null;
      }
      if(!cursorRel) {
        activeRoot.children.push(token);
      } else if(!rootRel) {
        cursor.children.push(token);
      } else if(cursorRel.distance <= rootRel.distance) {
        cursor.children.push(token);
      } else {
        // @TODO: maybe if there's a cursorRel we should just always ignore the rootRel even if it
        // is a "better" relationship. Sentence structure-wise it seems pretty likely that attributes
        // following an entity are related to that entity and not something else.
        activeRoot.children.push(token);
      }
    } else if(cursor.type === TokenTypes.OPERATION) {
      activeRoot.children.push(token);
    }
    // if this was a subject, then this is now the cursor
    if(maybeSubject) {
      cursor = token;
    }

  }
  if(state.consuming) {
    let item = state.operationStack.pop();
    while(item) {
      cursor = item.cursor || root;
      if(state.operator.children.length > state.operator.operation.argCount) {
        // we consumed one too many, so push that onto either the parent operator or
        // the root
        let overflowCursor = item.operator ? item.operator : root;
        overflowCursor.children.push(state.operator.children.pop());
      }

      // run through the items, determine if they're a totally different root,
      // or if they belong to the current cursor/root
      let operation = state.operator.operation;
      let operatorChildren = state.operator.children;
      let ix = 0;
      for(let child of operatorChildren) {
        if(child.type === TokenTypes.ATTRIBUTE) {
          cursor.children.push(child);
          operatorChildren[ix] = child;
        } else if(child.type && child.type !== TokenTypes.VALUE) {
          // we have something that could nest.
          let tip = child;
          while(tip.children.length) {
            tip = tip.children[0];
          }
          if(operation.attribute) {
            let neueAttr = {type: TokenTypes.ATTRIBUTE, found: operation.attribute, orig: operation.attribute, id: uuid(), children: []};
            tip.children.push(neueAttr);
            tip = neueAttr;
          }
          // if this is an infix operation, then this is an entirely different root now
          if(operation.infix) {
            tree.roots.push(child);
          } else {
            throw new Error("Non infix operation with a non-attribute child: " + JSON.stringify(state.operator));
          }
          operatorChildren[ix] = tip;
        }
        ix++;
      }

      // if this is an infix operator that invokes an attribute, e.g. "older", push
      // that attribute onto the cursor
      if(operation.infix && operation.attribute) {
        let attr = {type: TokenTypes.ATTRIBUTE, found: operation.attribute, orig: operation.attribute, id: uuid(), children: []};
        cursor.children.push(attr);
        // we also need to add this as the first arg to the function
        state.operator.children.unshift(attr);
      } else if(operation.infix) {
        // we need to add the closest thing before this as the first arg to the function.
        let tip = cursor || root;
        while(tip.children.length) {
          tip = tip.children[tip.children.length - 1];
        }
        state.operator.children.unshift(tip);
        // if we don't have an attribute to attach to the right side, let's assume
        // that it mirrors the left.
//           var rightSide = state.operator.children[state.operator.children.length - 1];
//           if(rightSide.type !== "attribute") {
//             let attr = {type: "attribute", found: tip.found, orig: tip.found, id: uuid(), children: []};
//             rightSide.children.push(attr);
//             state.operator.children[state.operator.children.length - 1] = attr;
//           }
      }

      tree.operations.push(state.operator);

      if(item.operator) {
        state.operator = item.operator;
      } else {
        // we're done consuming now
        state.consuming = false;
        state.operator = null;
        state.lastValue = false;
        break;
      }
      item = state.operationStack.pop();
    }
  }
  if(root) walk(root);
  return tree;
}

function ignoreHiddenCollections(colls) {
  for(let coll of colls) {
    if(coll !== "unknown" && coll !== "history" && coll !== "collection") {
      return coll;
    }
  }
}

function nodeToPlanSteps(node, parent, parentPlan) {
  let id = node.id || uuid();
  let {deselect} = node;
  if(parent) {
    let rel = tokensToRelationship(parent, node);
    if(!rel) {
      return [];
    }
    switch(rel.type) {
      case "coll->eav":
        var plan = [];
        var curParent = parentPlan;
        for(let node of rel.nodes) {
          let coll = ignoreHiddenCollections(node);
          let item = {type: "gather", relatedTo: curParent, collection: coll, subject: coll, id: uuid()};
          plan.push(item);
          curParent = item;
        }
        plan.push({type: "lookup", relatedTo: curParent, attribute: node.found, subject: node.found, id, deselect});
        return plan;
        break;
      case "coll->ent":
        var plan = [];
        var curParent = parentPlan;
        for(let node of rel.nodes) {
          let coll = ignoreHiddenCollections(node);
          let item = {type: "gather", relatedTo: curParent, collection: coll, subject: coll, id: uuid()};
          plan.push(item);
          curParent = item;
        }
        plan.push({type: "filter by entity", relatedTo: curParent, entity: node.found, subject: node.found, id, deselect});
        return plan;
        break;
      case "coll->coll":
        if(rel.distance === 0) {
          return [{type: "intersect", relatedTo: parentPlan, collection: node.found, subject: node.found, id, deselect}];
        } else {
          return [{type: "gather", relatedTo: parentPlan, collection: node.found, subject: node.found, id, deselect}];
        }
        break;
      case "ent->eav":
        if(rel.distance === 0) {
          return [{type: "lookup", relatedTo: parentPlan, attribute: node.found, subject: node.found, id, deselect}];
        } else {
          let plan = [];
          let curParent = parentPlan;
          for(let node of rel.nodes) {
            let coll = ignoreHiddenCollections(node);
            let item = {type: "gather", relatedTo: curParent, collection: coll, subject: coll, id: uuid()};
            plan.push(item);
            curParent = item;
          }
          plan.push({type: "lookup", relatedTo: curParent, attribute: node.found, subject: node.found, id, deselect});
          return plan;
        }
        break;
      case "collection->ent":
        break;
    }
  } else {
    if(node.type === TokenTypes.COLLECTION) {
      return [{type: "gather", collection: node.found, subject: node.found, id, deselect}];
    } else if(node.type === TokenTypes.ENTITY) {
      return [{type: "find", entity: node.found, subject: node.found, id, deselect}];
    } else if(node.type === TokenTypes.ATTRIBUTE) {
      return [{type: "lookup", attribute: node.found, subject: node.found, id, deselect}];
    }
    return [];
  }
}

function nodeToPlan(tree, parent = null, parentPlan = null) {
  if(!tree) return [];
  let plan = [];
  //process you, then your children
  plan.push.apply(plan, nodeToPlanSteps(tree, parent, parentPlan));
  let neueParentPlan = plan[plan.length - 1];
  for(let child of tree.children) {
    plan.push.apply(plan, nodeToPlan(child, tree, neueParentPlan));
  }
  return plan;
}

function opToPlan(op, groupLookup) {
  let info = op.operation;
  let args = {};
  let ix = 0;
  if(info.args) {
    for(let arg of info.args) {
      let value = op.children[ix];
      if(value === undefined) continue;
      if(value.type && value.type === TokenTypes.VALUE) {
        args[arg] = JSON.parse(value.found);
      } else if(value.type) {
        args[arg] = [value.id, "value"];
      } else {
        throw new Error("Invalid operation argument: " + JSON.stringify(op));
      }
      ix++;
    }
  }
  if(info.aggregate) {
    return [{type: "aggregate", aggregate: info.op, args, id: uuid()}];
  } else if(info.op === "sort limit") {
    let sort, limit, grouped;
    limit = info.limit;
    for(let child of op.children) {
      if(child.type && child.type === TokenTypes.ATTRIBUTE) {
        limit = coerceInput(child.found);
      } else {
        sort = [child.id, "value", info.direction];
        grouped = groupLookup[child];
      }
    }
    let plan = [];
    if(sort) {
      plan.push({type: "sort", id: uuid(), sort: [sort]});
    }
    if(limit) {
      let limitInfo:any = {};
      if(grouped || Object.keys(groupLookup).length === 0) {
        limitInfo.results = limit;
      } else {
        limitInfo.perGroup = limit;
      }
      plan.push({type: "limit", id: uuid(), limit: limitInfo});
    }
    return plan;
  } else if(info.filter) {
    return [{type: "filter", func: info.op, args, id: uuid()}];
  } else {
    return [{type: "calculate", func: info.op, args, id: uuid()}];
  }
}

function groupsToPlan(nodes) {
  if(!nodes.length) return [];
  let groups = [];
  for(let node of nodes) {
    if(node.type === TokenTypes.COLLECTION) {
      groups.push([node.id, "entity"]);
    } else if(node.type === TokenTypes.ATTRIBUTE) {
      groups.push([node.id, "value"]);
    } else {
      throw new Error("Invalid node to group on: " + JSON.stringify(nodes));
    }
  }
  return [{type: "group", id: uuid(), groups, groupNodes: nodes}];
}

function treeToPlan(tree) {
  let plan = [];
  for(let root of tree.roots) {
    plan.push.apply(plan, nodeToPlan(root));
  }
  plan.push.apply(plan, groupsToPlan(tree.groups));
  let groupLookup = {};
  for(let node of tree.groups) {
    groupLookup[node.id] = true;
  }
  for(let op of tree.operations) {
    plan.push.apply(plan, opToPlan(op, groupLookup));
  }
  return plan;
}

function safeProjectionName(name, projection) {
  if(!projection[name]) {
    return name;
  }
  let ix = 2;
  while(projection[name]) {
    name = `${name} ${ix}`;
    ix++;
  }
  return name;
}

export function planToQuery(plan) {
  let projection = {};
  let query = eve.query();
  for(var step of plan) {
    switch(step.type) {
      case "find":
        // find is a no-op
        step.size = 0;
        break;
      case "gather":
        var join:any = {};
        if(step.collection) {
          join.collection = step.collection;
        }
        var related = step.relatedTo;
        if(related) {
          if(related.type === "find") {
            step.size = 2;
            let linkId = `${step.id} | link`;
            query.select("directionless links", {entity: related.entity}, linkId);
            join.entity = [linkId, "link"];
            query.select("collection entities", join, step.id);
          } else {
            step.size = 2;
            let linkId = `${step.id} | link`;
            query.select("directionless links", {entity: [related.id, "entity"]}, linkId);
            join.entity = [linkId, "link"];
            query.select("collection entities", join, step.id);
          }
        } else {
          step.size = 1;
          query.select("collection entities", join, step.id);
        }
        step.name = safeProjectionName(step.collection, projection);
        projection[step.name] = [step.id, "entity"];
        break;
      case "lookup":
        var join:any = {attribute: step.attribute};
        var related = step.relatedTo;
        if(related) {
          if(related.type === "find") {
            join.entity = related.entity;
          } else {
            join.entity = [related.id, "entity"];
          }
        }
        step.size = 1;
        query.select("entity eavs", join, step.id);
        step.name = safeProjectionName(step.attribute, projection);
        projection[step.name] = [step.id, "value"];
        break;
      case "intersect":
        var related = step.relatedTo;
        if(step.deselect) {
          step.size = 0;
          query.deselect("collection entities", {collection: step.collection, entity: [related.id, "entity"]});
        } else {
          step.size = 0;
          query.select("collection entities", {collection: step.collection, entity: [related.id, "entity"]}, step.id);
        }
        break;
      case "filter by entity":
        var related = step.relatedTo;
        var linkId = `${step.id} | link`;
        if(step.deselect) {
          step.size = 0;
          query.deselect("directionless links", {entity: [related.id, "entity"], link: step.entity});
        } else {
          step.size = 1;
          query.select("directionless links", {entity: [related.id, "entity"], link: step.entity}, step.id);
        }
        break;
      case "filter":
        step.size = 0;
        query.calculate(step.func, step.args, step.id);
        break;
      case "calculate":
        step.size = 1;
        query.calculate(step.func, step.args, step.id);
        step.name = safeProjectionName(step.func, projection);
        projection[step.name] = [step.id, "result"];
        break;
      case "aggregate":
        step.size = 1;
        query.aggregate(step.aggregate, step.args, step.id);
        step.name = safeProjectionName(step.aggregate, projection);
        projection[step.name] = [step.id, step.aggregate];
        break;
      case "group":
        step.size = 0;
        query.group(step.groups);
        break;
      case "sort":
        step.size = 0;
        query.sort(step.sort);
        break;
      case "limit":
        step.size = 0;
        query.limit(step.limit);
        break;
    }
  }
  query.project(projection);
  return query;
}

export function newSearch(searchString) {
  let all = newSearchTokens(searchString);
  let tree = planTree(searchString);
  let plan = treeToPlan(tree);
  let query = planToQuery(plan);
  return {text: searchString, tokens: all, plan, query};
}

function arrayIntersect(a, b) {
  let ai = 0;
  let bi = 0;
  let result = [];
  while(ai < a.length && bi < b.length){
      if (a[ai] < b[bi] ) ai++;
      else if (a[ai] > b[bi] ) bi++;
      else {
        result.push(a[ai]);
        ai++;
        bi++;
      }
  }
  return result;
}

function entityTocollectionsArray(entity) {
  let entities = eve.find("collection entities", {entity});
  return entities.map((a) => a["collection"]);
}

function extractFromUnprojected(coll, ix, field, size) {
  let results = [];
  for(var i = 0, len = coll.length; i < len; i += size) {
    results.push(coll[i + ix][field]);
  }
  return results;
}

function findCommonCollections(ents) {
  let intersection = entityTocollectionsArray(ents[0]);
  intersection.sort();
  for(let entId of ents.slice(1)) {
    let cur = entityTocollectionsArray(entId);
    cur.sort();
    arrayIntersect(intersection, cur);
  }
  intersection.sort((a, b) => {
    return eve.findOne("collection", {collection: b})["count"] - eve.findOne("collection", {collection: a})["count"];
  })
  return intersection;
}

// e.g. "salaries in engineering"
// e.g. "chris's age"
function findEntToAttrRelationship(ent, attr):any {
  // check if this ent has that attr
  let directAttribute = eve.findOne("entity eavs", {entity: ent, attribute: attr});
  if(directAttribute) {
    return {distance: 0, type: "ent->eav"};
  }
  let relationships = eve.query(``)
                .select("entity links", {entity: ent}, "links")
                .select("entity eavs", {entity: ["links", "link"], attribute: attr}, "eav")
                .exec();
  if(relationships.unprojected.length) {
    let entities = extractFromUnprojected(relationships.unprojected, 0, "link", 2);
    return {distance: 1, type: "ent->eav", nodes: [findCommonCollections(entities)]};
  }
  let relationships2 = eve.query(``)
                .select("entity links", {entity: ent}, "links")
                .select("entity links", {entity: ["links", "link"]}, "links2")
                .select("entity eavs", {entity: ["links2", "link"], attribute: attr}, "eav")
                .exec();
  if(relationships2.unprojected.length) {
    let entities = extractFromUnprojected(relationships2.unprojected, 0, "link", 3);
    let entities2 = extractFromUnprojected(relationships2.unprojected, 1, "link", 3);
    return {distance: 2, type: "ent->eav", nodes: [findCommonCollections(entities), findCommonCollections(entities2)]};
  }
}

// e.g. "salaries per department"
function findCollectionToAttrRelationship(coll, attr) {
  let direct = eve.query(``)
                .select("collection entities", {collection: coll}, "collection")
                .select("entity eavs", {entity: ["collection", "entity"], attribute: attr}, "eav")
                .exec();
  if(direct.unprojected.length) {
    return {distance: 0, type: "coll->eav", nodes: []};
  }
  let relationships = eve.query(``)
                .select("collection entities", {collection: coll}, "collection")
                .select("directionless links", {entity: ["collection", "entity"]}, "links")
                .select("entity eavs", {entity: ["links", "link"], attribute: attr}, "eav")
                .exec();
  if(relationships.unprojected.length) {
    let entities = extractFromUnprojected(relationships.unprojected, 1, "link", 3);
    return {distance: 1, type: "coll->eav", nodes: [findCommonCollections(entities)]};
  }
  let relationships2 = eve.query(``)
                .select("collection entities", {collection: coll}, "collection")
                .select("directionless links", {entity: ["collection", "entity"]}, "links")
                .select("directionless links", {entity: ["links", "link"]}, "links2")
                .select("entity eavs", {entity: ["links2", "link"], attribute: attr}, "eav")
                .exec();
  if(relationships2.unprojected.length) {
    let entities = extractFromUnprojected(relationships2.unprojected, 1, "link", 4);
    let entities2 = extractFromUnprojected(relationships2.unprojected, 2, "link", 4);
    return {distance: 2, type: "coll->eav", nodes: [findCommonCollections(entities), findCommonCollections(entities2)]};
  }
}

// e.g. "meetings john was in"
function findCollectionToEntRelationship(coll, ent):any {
  if(coll === "collections") {
    if(eve.findOne("collection entities", {entity: ent})) {
      return {distance: 0, type: "ent->collection"};
    }
  }
  if(eve.findOne("collection entities", {collection: coll, entity: ent})) {
    return {distance: 0, type: "coll->ent", nodes: []};
  }
  let relationships = eve.query(``)
                .select("collection entities", {collection: coll}, "collection")
                .select("directionless links", {entity: ["collection", "entity"], link: ent}, "links")
                .exec();
  if(relationships.unprojected.length) {
    return {distance: 1, type: "coll->ent", nodes: []};
  }
  // e.g. events with chris granger (events -> meetings -> chris granger)
  let relationships2 = eve.query(``)
                .select("collection entities", {collection: coll}, "collection")
                .select("directionless links", {entity: ["collection", "entity"]}, "links")
                .select("directionless links", {entity: ["links", "link"], link: ent}, "links2")
                .exec();
  if(relationships2.unprojected.length) {
    let entities = extractFromUnprojected(relationships2.unprojected, 1, "link", 3);
    return {distance: 2, type: "coll->ent", nodes: [findCommonCollections(entities)]};
  }
}

// e.g. "authors and papers"
function findCollectionToCollectionRelationship(coll, coll2) {
  // are there things in both sets?
  let intersection = eve.query(`${coll}->${coll2}`)
                    .select("collection entities", {collection: coll}, "coll1")
                    .select("collection entities", {collection: coll2, entity: ["coll1", "entity"]}, "coll2")
                    .exec();
  //is there a relationship between things in both sets
  let relationships = eve.query(`relationships between ${coll} and ${coll2}`)
                .select("collection entities", {collection: coll}, "coll1")
                .select("directionless links", {entity: ["coll1", "entity"]}, "links")
                .select("collection entities", {collection: coll2, entity: ["links", "link"]}, "coll2")
                .group([["links", "type"]])
                .aggregate("count", {}, "count")
                .project({type: ["links", "type"], count: ["count", "count"]})
                .exec();

  let maxRel = {count: 0};
  for(let result of relationships.results) {
    if(result.count > maxRel.count) maxRel = result;
  }

  // we divide by two because unprojected results pack rows next to eachother
  // and we have two selects.
  let intersectionSize = intersection.unprojected.length / 2;
  if(maxRel.count > intersectionSize) {
    return {distance: 1, type: "coll->coll"};
  } else if(intersectionSize > maxRel.count) {
    return {distance: 0, type: "coll->coll"};
  } else if(maxRel.count === 0 && intersectionSize === 0) {
    return;
  } else {
    return {distance: 1, type: "coll->coll"};
  }
}

function CodeMirrorElement(node, elem) {
  let cm = node.editor;
  if(!cm) {
    cm = node.editor = new CodeMirror(node, {
      mode: "gfm",
      lineWrapping: true,
      extraKeys: {
        "Cmd-Enter": (cm) => {
          let latest = app.renderer.tree[elem.id];
          commitEntity(cm, latest);
          },
          "Ctrl-Enter": (cm) => {
                let latest = app.renderer.tree[elem.id];
                commitEntity(cm, latest);
          }
      }
    });
    if(elem.onInput) {
      cm.on("change", elem.onInput)
    }
    if(elem.keydown) {
      cm.on("keydown", (cm) => { elem.keydown(cm, elem); });
    }
    if(elem.blur) {
      cm.on("blur", (cm) => { elem.blur(cm, elem); });
    }
    cm.focus();
  }
  if(cm.getValue() !== elem.value) {
    cm.setValue(elem.value);
  }
}

function NewBitEditor(node, elem) {
  let cm = node.editor;
  if(!cm) {
    cm = node.editor = new CodeMirror(node, {
      mode: "gfm",
      lineWrapping: true,
      extraKeys: {
        "Cmd-Enter": (cm) => {
          let latest = app.renderer.tree[elem.id];
          submitAction(cm, latest);
        },
        "Ctrl-Enter": (cm) => {
            let latest = app.renderer.tree[elem.id];
            submitAction(cm, latest);
        }
      }
    });
    if(elem.onInput) {
      cm.on("change", elem.onInput)
    }
    if(elem.keydown) {
      cm.on("keydown", (cm) => { elem.keydown(cm, elem); });
    }
    if(elem.blur) {
      cm.on("blur", (cm) => { elem.blur(cm, elem); });
    }
    cm.focus();
    cm.setValue("\n");
    // create a line widget
    let widget = document.createElement("div");
    widget.className = "header-line";
    cm.addLineWidget(0, widget);
    cm.addLineClass(0, "text", "header");
  }
  if(cm.getValue() !== elem.value) {
    cm.setValue(elem.value);
  }
}

function CMSearchBox(node, elem) {
  let cm = node.editor;
  if(!cm) {
    let state = {marks: []};
    cm = node.editor = new CodeMirror(node, {
      lineWrapping: true,
      extraKeys: {
        "Enter": (cm) => {
          let latest = app.renderer.tree[elem.id];
          app.dispatch("setSearch", {value: cm.getValue(), searchId: latest.searchId}).commit();
        }
      }
    });
    cm.on("change", (cm) => {
      let value = cm.getValue();
      let tokens = newSearchTokens(value);
      for(let mark of state.marks) {
        mark.clear();
      }
      state.marks = [];
      for(let token of tokens) {
        let start = cm.posFromIndex(token.pos);
        let stop = cm.posFromIndex(token.pos + token.orig.length);
        state.marks.push(cm.markText(start, stop, {className: TokenTypes[token.type].toLowerCase()}));
      }
    });
    cm.focus();
  }
  if(cm.getValue() !== elem.value) {
    cm.setValue(elem.value);
  }
}

function entityToGraph(entityId, content) {
  let parsed = parseEntity(entityId, content);
  let links = [];
  for(let link of parsed.links) {
    links.push({link: link.link.toLowerCase(), type: (link.linkType || "unknown").toLowerCase()});
  }
  for(let collection of parsed.collections) {
    links.push({link: collection.link.toLowerCase(), type: "collection"});
  }
  return links;
}

//---------------------------------------------------------
// Wiki
//---------------------------------------------------------

var dragging = null;

app.handle("startEditingEntity", (result, info) => {
  result.add("editing", {editing: true, search: info.searchId});
});

app.handle("stopEditingEntity", (result, info) => {
  if(!eve.findOne("editing")) return;
  result.remove("editing");
  let {entity, value} = info;
  entity = entity.toLowerCase();
//   result.add("manual entity", {entity, content: value});
//   result.remove("manual entity", {entity});
  var blockId = entity + "|manual content block";
  if(!eve.findOne("manual eav", {entity: blockId})) {
    result.add("manual eav", {entity: blockId, attribute: "is a", value: "content block"});
    result.add("manual eav", {entity: blockId, attribute: "source", value: "manual"});
    result.add("manual eav", {entity: blockId, attribute: "associated entity", value: entity});
  } else {
    result.remove("manual eav", {entity: blockId, attribute: "content"});
  }
  result.add("manual eav", {entity: blockId, attribute: "content", value});
});

app.handle("setSearch", (result, info) => {
  let searchId = info.searchId;
  let search = eve.findOne("search query", {id: searchId})["search"];
  if(search === info.value) return;

  if(!eve.findOne("history stack", {entity: search})) {
    let stack = eve.find("history stack");
    result.add("history stack", {entity: search, pos: stack.length});
  }
  let newSearchValue = info.value.trim();
  app.activeSearches[searchId] = newSearch(newSearchValue);
  result.remove("builtin search query", {id: searchId});
  result.add("builtin search query", {id: searchId, search: newSearchValue});
});

app.handle("submitAction", (result, info) => {
  let searchId = info.searchId;
  let search = eve.findOne("search query", {id: searchId})["search"];
  result.merge(saveSearch(search, app.activeSearches[searchId].query));
  if(info.type === "attribute") {
    if(!info.entity || !info.attribute || !info.value) return;
    result.merge(addEavAction(search, info.entity, info.attribute, info.value));
  } else if(info.type === "collection") {
    result.merge(addToCollectionAction(search, info.entity, info.collection));
  } else if(info.type === "bit") {
    let template = info.template.trim();
    if(template[0] !== "#") {
      template = "#" + template;
    }
    result.merge(addBitAction(search, template));
  }
});

app.handle("addNewSearch", (result, info) => {
  let id = uuid();
  let search = info.search || "";
  app.activeSearches[id] = newSearch(search);
  result.add("builtin search", {id, top: info.top || 100, left: info.left || 100});
  result.add("builtin search query", {id, search});
});

app.handle("addNewSyntaxSearch", (result, info) => {
  let id = uuid();
  let code = info.search || "";
  result.add("builtin syntax search", {id, top: info.top || 100, left: info.left || 100});
  result.add("builtin syntax search code", {id, code});
});

app.handle("removeSearch", (result, info) => {
  let {searchId} = info;
  if(!searchId) return;
  result.remove("builtin search", {id: searchId});
  result.remove("builtin search query", {id: searchId});
  result.remove("builtin syntax search", {id: searchId});
  result.remove("builtin syntax search code", {id: searchId});
  for(let view of eve.find("builtin syntax search view", {id: searchId})) {
    let diff = removeView(view.view);
    result.merge(diff);
  }
  result.remove("builtin syntax search view", {id: searchId});
  result.remove("builtin syntax search error", {id: searchId});
  app.activeSearches[searchId] = null;
});

app.handle("startAddingAction", (result, info) => {
  result.remove("adding action");
  result.add("adding action", {type: info.type, search: info.searchId});
});

app.handle("stopAddingAction", (result, info) => {
  result.remove("adding action");
});

app.handle("removeAction", (result, info) => {
  if(info.type === "eav") {
    result.merge(removeAddEavAction(info.actionId));
  } else if(info.type === "collection") {
    result.merge(removeAddToCollectionAction(info.actionId));
  } else if(info.type === "bit") {
    result.merge(removeAddBitAction(info.actionId));
  }
});

app.handle("startDragging", (result, info) => {
  let {searchId, x, y} = info;
  let pos = eve.findOne("search", {id: searchId});
  if(!pos) {
    pos = eve.findOne("builtin syntax search", {id: searchId});
  }
  dragging = {id: searchId, offsetTop: y - pos.top, offsetLeft: x - pos.left, action: info.action || "moveSearch"};
});

app.handle("stopDragging", (result, info) => {
  dragging = null;
});

app.handle("moveSearch", (result, info) => {
  let {searchId, x, y} = info;
  if(eve.findOne("builtin search", {id: searchId})) {
    result.remove("builtin search", {id: searchId});
    result.add("builtin search", {id: searchId, top: y - dragging.offsetTop, left: x - dragging.offsetLeft});
  } else {
    result.remove("builtin syntax search", {id: searchId});
    result.add("builtin syntax search", {id: searchId, top: y - dragging.offsetTop, left: x - dragging.offsetLeft});
  }
});

app.handle("resizeSearch", (result, info) => {
  let {searchId, x, y} = info;
  let type = "builtin search size";
  let pos = eve.findOne("builtin search", {id: searchId});
  if(!pos) {
    pos = eve.findOne("builtin syntax search", {id: searchId});
  }
  result.remove("builtin search size", {id: searchId});
  let height = y - pos.top + 5;
  let width = x - pos.left + 5;
  if(width <= 100) {
    width = 100;
  }
  if(height <= 100) {
    height = 100;
  }
  result.add(type, {id: searchId, width, height});
});

app.handle("toggleShowPlan", (result, info) => {
  if(eve.findOne("showPlan", {search: info.searchId})) {
    result.remove("showPlan", {search: info.searchId});
  } else {
    result.add("showPlan", {search: info.searchId});
  }
});

export function root() {
  if(window["slides"]) {
    return window["slides"].root();
  } else {
    return eveRoot();
  }
}

export function eveRoot():Element {
  let searchers = [];
  for(let search of eve.find("search")) {
    searchers.push(newSearchResults(search.id));
  }
  for(let search of eve.find("builtin syntax search")) {
    searchers.push(syntaxSearch(search.id));
  }
  return {id: "root", c: "root", dblclick: addNewSearch, children: [
//       slideControls(),
    {c: "canvas", mousemove: maybeDrag, children: searchers},
  ]};
}

function maybeDrag(e, elem) {
  if(dragging) {
    app.dispatch(dragging.action, {searchId: dragging.id, x: e.clientX, y: e.clientY}).commit();
    e.preventDefault();
  }
}

function addNewSearch(e, elem) {
  if(e.target.classList.contains("canvas")) {
    if(e.shiftKey) {
      app.dispatch("addNewSyntaxSearch", {top: e.clientY, left: e.clientX}).commit();
    } else {
      app.dispatch("addNewSearch", {top: e.clientY, left: e.clientX}).commit();
    }
    e.preventDefault();
  }
}

function injectEmbeddedSearches(node:HTMLElement, elem:Element) {
  let embedded:HTMLElement[] = <any>node.querySelectorAll("[data-embedded-search]");
  for(let embed of embedded) {
    let search, searchId, searchText = embed.getAttribute("data-embedded-search");
    for(let id in app.activeSearches) {
      if(app.activeSearches[id].text === searchText) {
        searchId = id;
        break;
      }
    }
    if(searchId) search = app.activeSearches[searchId];
    else {
      searchId = uuid();
      search = app.activeSearches[searchId] = newSearch(searchText);
    }
    // @FIXME: Horrible, horrible kludge.
    let subRenderer = new microreact.Renderer();
    subRenderer.render(entityContents(elem["searchId"], searchId, search));
    embed.appendChild(subRenderer.content);
  }
}

var markedEntityRenderer = new MarkedRenderer();
markedEntityRenderer.heading = function(text:string, level: number) {
  return `<h${level}>${text}</h${level}>`; // override auto-setting an id based on content.
};
function entityToHTML(entityId:string, searchId:string, content:string, passthrough?: string[]):string {
  let md = marked(content, {breaks: true, renderer: markedEntityRenderer});
  let ix = md.indexOf("{");
  let queryCount = 0;
  let stack = [];
  while(ix !== -1) {
    if(md[ix - 1] === "\\") {
      md = md.slice(0, ix - 1) + md.slice(ix);
      ix--;

    } else if(md[ix] === "{") stack.push(ix);
    else if(md[ix] === "}") {
      let startIx = stack.pop();
      let content = md.slice(startIx + 1, ix);
      let colonIx = content.indexOf(":");

      let value = (colonIx !== -1 ? content.slice(colonIx + 1) : content).trim();
      let replacement;
      let type = "attribute";
      if(eve.findOne("entity", {entity: value})) type = "entity";
      else if(passthrough && passthrough.indexOf(value) !== -1) type = "passthrough";
      else if(colonIx === -1) type = "query";

      if(type === "attribute") {
        let attr = content.slice(0, colonIx).trim();
        replacement = `<span class="attribute" data-attribute="${attr}">${value}</span>`;

      } else if(type === "entity") {
        let attr = content.slice(0, colonIx !== -1 ? colonIx : undefined).trim();
        let onClick = `app.dispatch('setSearch', {value: '${value}', searchId: '${searchId}'}).commit();`;
        replacement = `<a class="attribute entity" data-attribute="${attr}" onclick="${onClick}">${value}</a>`;

      } else if(type === "query") {
        //throw new Error("@TODO: Implement embedded projections");
        // add postRender to newSearch pane container that checks for data-search attribute. If it exists, compile the search template for each of them and insert.
        let containerId = `${searchId}|${content}|${queryCount++}`;
        replacement = `<div class="embedded-query search-results" id="${containerId}" data-embedded-search="${content}"></div>`;
      }

      if(type !== "passthrough") {
        md = md.slice(0, startIx) + replacement + md.slice(ix + 1);
        ix += replacement.length - content.length - 2;
      }

    } else {
      throw new Error(`Unexpected character '${md[ix]}' at index ${ix}`);
    }

    // @NOTE: There has got to be a more elegant solution for (min if > 0) here.
    let nextCloseIx = md.indexOf("}", ix + 1);
    let nextOpenIx = md.indexOf("{", ix + 1);
    if(nextCloseIx === -1) ix = nextOpenIx;
    else if(nextOpenIx === -1) ix = nextCloseIx;
    else if(nextCloseIx < nextOpenIx) ix = nextCloseIx;
    else ix = nextOpenIx;
  }

  return md;
}

function entityUi(entityId, instance:string|number = "", searchId) {
  let entityBlocks = eve.find("content blocks", {entity: entityId});
  let entityViews = [];
  for(let block of entityBlocks) {
    let isManual = eve.findOne("entity eavs", {entity: block.block, attribute: "source", value: "manual"});
    let entityView;
    if(isManual) {
      if(!eve.findOne("editing", {search: searchId})) {
        entityView = {
        id: `${block.block}${instance}`,
        c: "entity",
        searchId,
        entity: entityId,
        dangerouslySetInnerHTML: entityToHTML(entityId, searchId, block.content),
        postRender: injectEmbeddedSearches,
        dblclick: editEntity
      };
      } else {
        entityView = {id: `${block.block}${instance}|editor`, c: "entity editor", entity: entityId, searchId, postRender: CodeMirrorElement, value: block.content, blur: commitEntity};
      }
      entityViews.unshift(entityView);
    } else {
      let source = eve.findOne("entity eavs", {entity: block.block, attribute: "source"}).value;
      let children:Element[] = [{dangerouslySetInnerHTML: entityToHTML(entityId, searchId, block.content)}];
      children.push({c: "source-link ion-help", text: "", click: followLink, linkText: source, searchId});
      entityView = {id: `${block.block}${instance}`, c: "entity generated", searchId, entity: entityId, children};
      entityViews.push(entityView);
    }
  }
  if(entityViews.length === 0) {
    if(!eve.findOne("editing", {search: searchId})) {
      entityViews.push({id: `${entityId}${instance}`, c: "entity", searchId, entity: entityId, children: [{c: "placeholder", text: "Add a description"}], dblclick: editEntity});
    } else {
      entityViews.push({id: `${entityId}${instance}|editor`, c: "entity editor", entity: entityId, searchId, postRender: CodeMirrorElement, value: "", blur: commitEntity});
    }
  }
  let relatedBits = [];
  for(let incoming of eve.find("entity links", {link: entityId})) {
    if(incoming.entity === entityId) continue;
    if(eve.findOne("entity eavs", {entity: incoming.entity, attribute: "is a", value: "content block"})) continue;
    if(eve.findOne("entity eavs", {entity: incoming.entity, attribute: "is a", value: entityId})) continue;
    relatedBits.push({c: "entity link", click: followLink, searchId, linkText: incoming.entity, text: incoming.entity});
  }
  if(relatedBits.length) {
    entityViews.push({c: "entity related-bits", children: [
      {text: "Related cards: "},
      {c: "related-list", children: relatedBits}
    ]});
  }

  return {c: "entity-container", children: [
    {c: "entity-blocks", children: entityViews},
  ]};
}

function searchDescription(tokens, plan) {
  let planChildren = [];
  for(let step of plan) {
    if(step.type === "gather") {
      let related = step.relatedTo ? "related to those" : "";
      let coll = "anything"
      if(step.collection) {
        coll = pluralize(step.collection, 2);
      }
      planChildren.push({c: "text collection", text: `gather ${coll} ${related}`});
    } else if(step.type === "intersect") {
      if(step.deselect) {
        planChildren.push({c: "text", text: `remove the ${pluralize(step.collection, 2)}`});
      } else {
        planChildren.push({c: "text", text: `keep only the ${pluralize(step.collection, 2)}`});
      }
    } else if(step.type === "lookup") {
      planChildren.push({c: "text attribute", text: `lookup ${step.attribute}`});
    } else if(step.type === "find") {
      planChildren.push({c: "text entity", text: `find ${step.entity}`});
    } else if(step.type === "filter by entity") {
      if(step.deselect) {
        planChildren.push({c: "text entity", text: `remove anything related to ${step.entity}`});
      } else {
        planChildren.push({c: "text entity", text: `related to ${step.entity}`});
      }
    } else if(step.type === "filter") {
      planChildren.push({c: "text operation", text: `filter those by ${step.func}`});
    } else if(step.type === "sort") {
      planChildren.push({c: "text operation", text: `sort them`});
    } else if(step.type === "group") {
      planChildren.push({c: "text operation", text: `group them`});
    } else if(step.type === "limit") {
      let limit;
      if(step.limit.results) {
        limit = `to ${step.limit.results} results`;
      } else {
        limit = `to ${step.limit.perGroup} items per group`;
      }
      planChildren.push({c: "text operation", text: `limit ${limit}`});
    } else if(step.type === "calculate") {
      planChildren.push({c: "text operation", text: `${step.type} ${step.func}`});
    } else if(step.type === "aggregate") {
      planChildren.push({c: "text operation", text: `${step.aggregate}`});
    } else {
      planChildren.push({c: "text", text: `${step.type}->`});
    }
  }
  planChildren.unshift();
  return {c: "plan-container", children: [
    {c: "description", text: "Search plan:"},
    {c: "search-plan", children: planChildren}
  ]};
}

export function entityContents(paneId:string, searchId:string, search) {
  let plan = search.plan;
  if(!plan.length)
    return [{c: "singleton", children: [entityUi(search.toLowerCase(), searchId, searchId)]}];

  let contents = [];
  let singleton = true;
  if(plan.length === 1 && (plan.type === "find" || plan.type === "gather")) {
    contents.push({c: "singleton", children: [entityUi(plan[0].collection || plan[0].entity, searchId, searchId)]});
  } else singleton = false;

  if(singleton) return contents;
  let resultItems = [];
  contents.push({c: "results", children: resultItems});
  let headers = []
  // figure out what the headers are
  for(let step of plan) {
    if(step.type === "filter by entity") continue;
    if(step.size === 0) continue;
    headers.push({text: step.name});
  }

  let groupedFields = {};
  // figure out what fields are grouped, if any
  for(let step of plan) {
    if(step.type === "group") {
      for(let node of step.groupNodes) {
        for(let searchStep of plan) {
          if(searchStep.id === node.id) {
            groupedFields[searchStep.name] = true;
            break;
          }
        }
      }
    } else if(step.type === "aggregate") {
      groupedFields[step.name] = true;
    }
  }

  let results = search.query.exec();
  let groupInfo = results.groupInfo;
  let planLength = plan.length;
  let itemClass = planLength > 1 ? " bit" : " link list-item";
  row: for(let ix = 0, len = results.unprojected.length; ix < len; ix += search.query.unprojectedSize) {
    if(groupInfo && ix > groupInfo.length) break;
    if(groupInfo && groupInfo[ix] === undefined) continue;

    // Get content row to insert into
    let resultItem;
    if(groupInfo && resultItems[groupInfo[ix]]) resultItem = resultItems[groupInfo[ix]];
    else if(groupInfo) resultItem = resultItems[groupInfo[ix]] = {c: "path", children: []};
    else {
      resultItem = {c: "path", children: []};
      resultItems.push(resultItem);
    }

    let planOffset = 0;
    for(let planIx = 0; planIx < planLength; planIx++) {
      let planItem = plan[planIx];
      let item, id = `${searchId} ${ix} ${planIx}`;
      if(planItem.size) {
        let resultPart = results.unprojected[ix + planOffset + planItem.size - 1];
        if(!resultPart) continue row;
        let text, klass, click, link;
        if(planItem.type === "gather") {
          item = {id, c: `${itemClass} entity bit`, text: resultPart["entity"], click: followLink, searchId: paneId, linkText: resultPart["entity"]};
        } else if(planItem.type === "lookup") {
          item = {id, c: `${itemClass} attribute`, text: resultPart["value"]};
        } else if(planItem.type === "aggregate") {
          item = {id, c: `${itemClass} value`, text: resultPart[planItem.aggregate]};
        } else if(planItem.type === "filter by entity") {
          // we don't really want these to show up.
        } else if(planItem.type === "calculate") {
          item = {id, c: `${itemClass} value`, text: resultPart["result"]};
        } else {
          item = {id, c: itemClass, text: JSON.stringify(resultPart)};
        }
        if(item) {
          if(groupedFields[planItem.name] && !resultItem.children[planIx]) {
            resultItem.children[planIx] = {c: "sub-group", children: [item]};
          } else if(!groupedFields[planItem.name] && !resultItem.children[planIx]) {
            resultItem.children[planIx] = {c: "sub-group", children: [item]};
          } else if(!groupedFields[planItem.name]) {
            resultItem.children[planIx].children.push(item);
          }
          if(planLength === 1) resultItem.c = "path list-row";
        }
        planOffset += planItem.size;
      }
    }
  }
  resultItems.unshift({c: "search-headers", children: headers});

  return contents;
}

export function newSearchResults(searchId) {
  let {top, left} = eve.findOne("search", {id: searchId});
  let search = eve.findOne("search query", {id: searchId})["search"];
  let {tokens, plan, query} = app.activeSearches[searchId];
  let resultItems = [];
  let groupedFields = {};
  if(query && plan.length && (plan.length > 1 || plan[0].type === "gather")) {
    // figure out what fields are grouped, if any
    for(let step of plan) {
      if(step.type === "group") {
        for(let node of step.groupNodes) {
          let name;
          for(let searchStep of plan) {
            if(searchStep.id === node.id) {
              name = searchStep.name;
              break;
            }
          }
          groupedFields[name] = true;
        }
      } else if(step.type === "aggregate") {
        groupedFields[step.name] = true;
      }
    }

    let results = query.exec();
    let groupInfo = results.groupInfo;
    let planLength = plan.length;
    row: for(let ix = 0, len = results.unprojected.length; ix < len; ix += query.unprojectedSize) {
      if(groupInfo && ix > groupInfo.length) break;
      if(groupInfo && groupInfo[ix] === undefined) continue;
      let resultItem;
      if(groupInfo && !resultItems[groupInfo[ix]]) {
        resultItem = resultItems[groupInfo[ix]] = {c: "path", children: []};
      } else if(!groupInfo) {
        resultItem = {c: "path", children: []};
        resultItems.push(resultItem);
      } else {
        resultItem = resultItems[groupInfo[ix]];
      }
      let planOffset = 0;
      for(let planIx = 0; planIx < planLength; planIx++) {
        let planItem = plan[planIx];
        if(planItem.size) {
          let resultPart = results.unprojected[ix + planOffset + planItem.size - 1];
          if(!resultPart) continue row;
          let text, klass, click, link;
          if(planItem.type === "gather") {
            text = resultPart["entity"];
            klass = "entity";
            click = followLink;
            link = resultPart["entity"];
          } else if(planItem.type === "lookup") {
            text = resultPart["value"];
            klass = "attribute";
          } else if(planItem.type === "aggregate") {
            text = resultPart[planItem.aggregate];
            klass = "value";
          } else if(planItem.type === "filter by entity") {
            // we don't really want these to show up.
          } else if(planItem.type === "calculate") {
            text = JSON.stringify(resultPart.result);
            klass = "value";
          } else {
            text = JSON.stringify(resultPart);
          }
          if(text) {
            klass += planLength > 1 ? " bit" : " link list-item";
            let item = {id: `${searchId} ${ix} ${planIx}`, c: `${klass}`, text, click, searchId, linkText: link};
            if(groupedFields[planItem.name] && !resultItem.children[planIx]) {
              resultItem.children[planIx] = {c: "sub-group", children: [item]};
            } else if(!groupedFields[planItem.name] && !resultItem.children[planIx]) {
              resultItem.children[planIx] = {c: "sub-group", children: [item]};
            } else if(!groupedFields[planItem.name]) {
              resultItem.children[planIx].children.push(item);
            }
            if(planLength === 1) {
              resultItem.c = "path list-row";
            }
          }
          planOffset += planItem.size;
        }
      }
    }
  }
  let entityContent = [];
  let noHeaders = false;
  if(plan.length === 1 && plan[0].type === "find") {
    entityContent.push({c: "singleton", children: [entityUi(plan[0].entity, searchId, searchId)]});
  } else if(plan.length === 1 && plan[0].type === "gather") {
    entityContent.unshift({c: "singleton", children: [entityUi(plan[0].collection, searchId, searchId)]});
    let text = `There are no ${pluralize(plan[0].collection, resultItems.length)} in the system.`;
    if(resultItems.length > 0) {
      text = `There ${pluralize("are", resultItems.length)} ${resultItems.length} ${pluralize(plan[0].collection, resultItems.length)}:`;
    }
    resultItems.unshift({c: "description", text});
    noHeaders = true;
  } else if(plan.length === 0) {
    entityContent.push({c: "singleton", children: [entityUi(search.toLowerCase(), searchId, searchId)]});
  } else {
    let headers = []
    // figure out what the headers are
    if(!noHeaders) {
      for(let step of plan) {
        if(step.type === "filter by entity") continue;
        if(step.size === 0) continue;
        headers.push({text: step.name});
      }
    }
    resultItems.unshift({c: "search-headers", children: headers});
  }

  let actions = [];
  for(let bitAction of eve.find("add bit action", {view: search})) {
    let {template, action} = bitAction;
    actions.push({c: "action new-bit", children: [
      {c: "bit entity", dangerouslySetInnerHTML: entityToHTML(action, searchId, template, Object.keys(query.projectionMap))},
      {c: "remove ion-android-close", click: removeAction, actionType: "bit", actionId: bitAction.action}
    ]})
  }

  let actionContainer;
  let addActionChildren = [];
  let adding = eve.findOne("adding action", {search: searchId});
  if(adding) {
    if(adding.type === "bit") {
      addActionChildren.push({c: "add-card-editor", children: [
        {c: "new-bit-editor", searchId, value: "\n", postRender: NewBitEditor},
        {c: "spacer"},
        //         {c: "button", text: "submit", click: submitAction},
        {c: "ion-android-close close", click: stopAddingAction},
      ]});
    }
  }
  if(plan.length && plan[0].type !== "find") {
    let text = "Add a card";
    if(actions.length) {
      text = "Add another card"
    }
    actionContainer = {c: "actions-container", children: [
      {c: "actions-header", children: [
        {c: "add-card-link", text: text, actionType: "bit", searchId, click: startAddingAction},
//         {c: "spacer"},
//         {c: "", text: "+", actionType: "bit", searchId, click: startAddingAction}
      ]},
      actions.length ? {c: "actions", children: actions} : undefined,
    ]};
  }

  let size = eve.findOne("builtin search size", {id: searchId});
  let width, height;
  if(size) {
    width = size.width;
    height = size.height;
  }

  let isDragging = dragging && dragging.id === searchId ? "dragging" : "";
  let showPlan = eve.findOne("showPlan", {search: searchId}) ? searchDescription(tokens, plan) : undefined;
  return {id: `${searchId}|container`, c: `container search-container ${isDragging}`, top, left, width, height, children: [
    {c: "search-input", mousedown: startDragging, mouseup: stopDragging, searchId, children: [
      {c: "search-box", value: search, postRender: CMSearchBox, searchId},
      {c: "spacer"},
      {c: `ion-ios-arrow-${showPlan ? 'up' : 'down'} plan`, click: toggleShowPlan, searchId},
      {c: "ion-android-close close", click: removeSearch, searchId},
    ]},
    showPlan,
    {c: "entity-content", children: entityContent},
    resultItems.length ? {c: "search-results", children: resultItems} : {},
    actionContainer,
    {c: "add-action", children: addActionChildren},
    {c: "resize", mousedown: startDragging, mouseup: stopDragging, searchId, action: "resizeSearch"}
  ]};
}

function removeAction(e, elem) {
  app.dispatch("removeAction", {type: elem.actionType, actionId: elem.actionId}).commit();
}

function toggleShowPlan(e, elem) {
  app.dispatch("toggleShowPlan", {searchId: elem.searchId}).commit();
}

function startDragging(e, elem) {
  if(e.target === e.currentTarget) {
    app.dispatch("startDragging", {searchId: elem.searchId, x: e.clientX, y: e.clientY, action: elem.action}).commit();
  }
}

function stopDragging(e, elem) {
  if(e.target === e.currentTarget) {
    app.dispatch("stopDragging", {}).commit();
  }
}

function removeSearch(e, elem) {
  app.dispatch("removeSearch", {searchId: elem.searchId}).commit();
}

function startAddingAction(e, elem) {
  app.dispatch("startAddingAction", {type: elem.actionType, searchId: elem.searchId}).commit();
}

function stopAddingAction(e, elem) {
  app.dispatch("stopAddingAction", {}).commit();
}

function submitAction(e, elem) {
  let values:any = {type: eve.findOne("adding action")["type"],
                    searchId: elem.searchId};
  if(values.type === "bit") {
    if(e.getValue) {
      values.template = e.getValue();
    } else {
      let editor = e.currentTarget.parentNode.querySelector("new-bit-editor").editor;
      values.template = editor.getValue();
    }
  } else {
    let parent = e.currentTarget.parentNode;
    for(let child of parent.childNodes) {
      if(child.nodeName === "INPUT") {
        values[child.className] = child.value;
      }
    }
  }
  app.dispatch("submitAction", values)
      .dispatch("stopAddingAction", {})
      .commit();
}

function commitEntity(cm, elem) {
  app.dispatch("stopEditingEntity", {searchId: elem.searchId, entity: elem.entity, value: cm.getValue()}).commit();
}

function editEntity(e, elem) {
  app.dispatch("startEditingEntity", {searchId: elem.searchId, entity: elem.entity}).commit();
  e.preventDefault();
}

function followLink(e, elem) { // @DEPRECATED
  app.dispatch("setSearch", {value: elem.linkText, searchId: elem.searchId}).commit();
}

function saveSearch(name, query) {
  if(!eve.findOne("view", {view: name})) {
    query.name = name;
    let diff = queryObjectToDiff(query);
    return diff;
  } else {
    return eve.diff();
  }
}

function addToCollectionAction(name, field, collection) {
  let diff = eve.diff();
  // add an action
  let action = `${name}|${field}|${collection}`;
  diff.add("add collection action", {view: name, action, field, collection});
  diff.add("action", {view: "added collections", action, kind: "union", ix: 1});
  // a source
  diff.add("action source", {action, "source view": name});
  // a mapping
  diff.add("action mapping", {action, from: "entity", "to source": action, "to field": field});
  diff.add("action mapping constant", {action, from: "collection", value: collection});
  diff.add("action mapping constant", {action, from: "source view", value: name});
  return diff;
}

function removeAddToCollectionAction(action) {
  let info = eve.findOne("add collection action", {action});
  if(info) {
    let diff = addToCollectionAction(info.view, info.field, info.collection);
    return diff.reverse();
  } else {
    return eve.diff();
  }
}

export function addEavAction(name, entity, attribute, field) {
  let diff = eve.diff();
  // add an action
  let action = `${name}|${entity}|${attribute}|${field}`;
  diff.add("add eav action", {view: name, action, entity, attribute, field,});
  diff.add("action", {view: "added eavs", action, kind: "union", ix: 1});
  // a source
  diff.add("action source", {action, "source view": name});
  // a mapping
  diff.add("action mapping", {action, from: "entity", "to source": action, "to field": entity});
  diff.add("action mapping", {action, from: "value", "to source": action, "to field": field});
  diff.add("action mapping constant", {action, from: "attribute", value: attribute});
  diff.add("action mapping constant", {action, from: "source view", value: name});
  return diff;
}

function removeAddEavAction(action) {
  let info = eve.findOne("add eav action", {action});
  if(info) {
    let diff = addEavAction(info.view, info.entity, info.attribute, info.field);
    return diff.reverse();
  } else {
    return eve.diff();
  }
}

export function addBitAction(name, template) {
  // console.log(name, "|", template, "|", query);
  let diff = eve.diff();
  // add an action
  let bitQueryId = `${name}|bit`;
  let action = `${name}|${template}`;
  diff.add("add bit action", {view: name, action, template});
//   diff.remove("add bit action", {view: name});
  let bitQuery = eve.query(bitQueryId)
                  .select("add bit action", {view: name}, "action")
                  .select(name, {}, "table")
                  .calculate("bit template", {row: ["table"], name, template: ["action", "template"], action: ["action", "action"]}, "result")
                  .project({entity: ["result", "entity"], attribute: ["result", "attribute"], value: ["result", "value"]});
  diff.merge(queryObjectToDiff(bitQuery));
  // diff.merge(removeView(bitQueryId));
  diff.add("action", {view: "generated eav", action, kind: "union", ix: 1});
  // a source
  diff.add("action source", {action, "source view": bitQueryId});
  // a mapping
  diff.add("action mapping", {action, from: "entity", "to source": action, "to field": "entity"});
  diff.add("action mapping", {action, from: "attribute", "to source": action, "to field": "attribute"});
  diff.add("action mapping", {action, from: "value", "to source": action, "to field": "value"});
  diff.add("action mapping constant", {action, from: "source view", value: name});
  return diff;
}

function removeAddBitAction(action) {
  let info = eve.findOne("add bit action", {action});
  if(info) {
    let diff = addBitAction(info.view, info.template);
    return diff.reverse();
  } else {
    return eve.diff();
  }
}

export function removeView(view) {
  return runtime.Query.remove(view, eve);
}

export function clearSaved() {
  let diff = eve.diff();
  diff.remove("view");
  diff.remove("action");
  diff.remove("action source");
  diff.remove("action mapping");
  diff.remove("action mapping constant");
  diff.remove("action mapping sorted");
  diff.remove("action mapping limit");
  diff.remove("add collection action");
  diff.remove("add eav action");
  return diff;
}

//---------------------------------------------------------
// Syntax search
//---------------------------------------------------------

app.handle("setSyntaxSearch", (result, info) => {
  let searchId = info.searchId;
  let code = eve.findOne("builtin syntax search code", {id: searchId})["code"];
  if(code === info.code) return;

  let newSearchValue = info.code.trim();
  let wrapped = newSearchValue;
  if(wrapped.indexOf("(query") !== 0) {
    wrapped = `(query :$$view "${searchId}"\n${wrapped})`;
  }
  // remove the old one
  for(let view of eve.find("builtin syntax search view", {id: searchId})) {
    let diff = removeView(view.view);
    result.merge(diff);
  }
  result.remove("builtin syntax search view", {id: searchId});
  result.remove("builtin syntax search error", {id: searchId});

  try {
    var parsed = window["parser"].parseDSL(wrapped);
    for(let view in parsed) {
      result.add("builtin syntax search view", {id: searchId, view});
    }
    result.merge(window["parser"].asDiff(eve, parsed));
  } catch(e) {
    result.add("builtin syntax search error", {id: searchId, error: e.toString()})
  }

  result.remove("builtin syntax search code", {id: searchId});
  result.add("builtin syntax search code", {id: searchId, code: newSearchValue});
});


function CMSyntaxEditor(node, elem) {
  let cm = node.editor;
  if(!cm) {
    let state = {marks: []};
    cm = node.editor = new CodeMirror(node, {
      mode: "clojure",
      lineWrapping: true,
      extraKeys: {
        "Ctrl-Enter": (cm) => {
          app.dispatch("setSyntaxSearch", {searchId:elem.searchId, code: cm.getValue()}).commit();
        },
        "Cmd-Enter": (cm) => {
          app.dispatch("setSyntaxSearch", {searchId:elem.searchId, code: cm.getValue()}).commit();
        }
      }
    });
    cm.on("change", (cm) => {
//       let value = cm.getValue();
//       let tokens = newSearchTokens(value);
//       for(let mark of state.marks) {
//         mark.clear();
//       }
//       state.marks = [];
//       for(let token of tokens) {
//         let start = cm.posFromIndex(token.pos);
//         let stop = cm.posFromIndex(token.pos + token.orig.length);
//         state.marks.push(cm.markText(start, stop, {className: token.type}));
//       }
    });
    cm.focus();
  }
  if(cm.getValue() !== elem.value) {
    cm.setValue(elem.value);
  }
}

function syntaxSearch(searchId) {
  let {top, left} = eve.findOne("builtin syntax search", {id: searchId});
  let code = eve.findOne("builtin syntax search code", {id: searchId})["code"];
  let isDragging = dragging && dragging.id === searchId ? "dragging" : "";
  let error = eve.findOne("builtin syntax search error", {id: searchId});
  let resultUi;
  if(!error) {
    let results = eve.find(searchId);
    let fields = Object.keys(results[0] || {}).filter((field) => field !== "__id");
    let headers = [];
    for(let field of fields) {
      headers.push({c: "header", text: field});
    }
    let resultItems = [];
    for(let result of results) {
      let fieldItems = [];
      for(let field of fields) {
        fieldItems.push({c: "field", text: result[field]});
      }
      resultItems.push({c: "row", children: fieldItems});
    }
    resultUi = {c: "results", children: [
      {c: "headers", children: headers},
      {c: "rows", children: resultItems}
    ]};
  } else {
    resultUi = {c: "error", text: error.error};
  }

  let size = eve.findOne("builtin search size", {id: searchId});
  let width, height;
  if(size) {
    width = size.width;
    height = size.height;
  }
  return {id: `${searchId}|container`, c: `container search-container ${isDragging} syntax-search`, top, left, width, height, children: [
    {c: "search-input", mousedown: startDragging, mouseup: stopDragging, searchId, children: [
      {c: "search-box syntax-editor", value: code, postRender: CMSyntaxEditor, searchId},
      {c: "ion-android-close close", click: removeSearch, searchId},
    ]},
    resultUi,
    {c: "resize", mousedown: startDragging, mouseup: stopDragging, searchId, action: "resizeSearch"}
  ]};
}


//---------------------------------------------------------
// AST and compiler
//---------------------------------------------------------

// view: view, kind[union|query|table]
// action: view, action, kind[select|calculate|project|union|ununion|stateful|limit|sort|group|aggregate], ix
// action source: action, source view
// action mapping: action, from, to source, to field
// action mapping constant: action, from, value

var recompileTrigger = {
  exec: () => {
    for(let view of eve.find("view")) {
      if(view.kind === "table") continue;
      let query = compile(eve, view.view);
      eve.asView(query);
    }
    return {};
  }
}

eve.addTable("view", ["view", "kind"]);
eve.addTable("action", ["view", "action", "kind", "ix"]);
eve.addTable("action source", ["action", "source view"]);
eve.addTable("action mapping", ["action", "from", "to source", "to field"]);
eve.addTable("action mapping constant", ["action", "from", "value"]);
eve.addTable("action mapping sorted", ["action", "ix", "source", "field", "direction"]);
eve.addTable("action mapping limit", ["action", "limit type", "value"]);

eve.table("view").triggers["recompile"] = recompileTrigger;
eve.table("action").triggers["recompile"] = recompileTrigger;
eve.table("action source").triggers["recompile"] = recompileTrigger;
eve.table("action mapping").triggers["recompile"] = recompileTrigger;
eve.table("action mapping constant").triggers["recompile"] = recompileTrigger;
eve.table("action mapping sorted").triggers["recompile"] = recompileTrigger;
eve.table("action mapping limit").triggers["recompile"] = recompileTrigger;

function queryObjectToDiff(query:runtime.Query) {
  return query.changeset(eve);
}
// add the added collections union so that sources can be added to it by
// actions.
var diff = eve.diff();
diff.add("view", {view: "generated eav", kind: "union"});
eve.applyDiff(diff);


export function compile(ixer, viewId) {
  let view = ixer.findOne("view", {view: viewId});
  if(!view) {
    throw new Error(`No view found for ${viewId}.`);
  }
  let compiled = ixer[view.kind](viewId);
  let actions = ixer.find("action", {view: viewId});
  if(!actions) {
    throw new Error(`View ${viewId} has no actions.`);
  }
  // sort actions by ix
  actions.sort((a, b) => a.ix - b.ix);
  for(let action of actions) {
    let actionKind = action.kind;
    if(actionKind === "limit") {
      let limit = {};
      for(let limitMapping of ixer.find("action mapping limit", {action: action.action})) {
        limit[limitMapping["limit type"]] = limitMapping["value"];
      }
      compiled.limit(limit);
    } else if(actionKind === "sort" || actionKind === "group") {
      let sorted = [];
      let mappings = ixer.find("action mapping sorted", {action: action.action});
      mappings.sort((a, b) => a.ix - b.ix);
      for(let mapping of mappings) {
        sorted.push([mapping["source"], mapping["field"], mapping["direction"]]);
      }
      if(sorted.length) {
        compiled[actionKind](sorted);
      } else {
        throw new Error(`${actionKind} without any mappings: ${action.action}`)
      }
    } else {
      let mappings = ixer.find("action mapping", {action: action.action});
      let mappingObject = {};
      for(let mapping of mappings) {
        let source = mapping["to source"];
        let field = mapping["to field"];
        if(actionKind === "union" || actionKind === "ununion") {
          mappingObject[mapping.from] = [field];
        } else {
          mappingObject[mapping.from] = [source, field];
        }
      }
      let constants = ixer.find("action mapping constant", {action: action.action});
      for(let constant of constants) {
        mappingObject[constant.from] = constant.value;
      }
      let source = ixer.findOne("action source", {action: action.action});
      if(!source && actionKind !== "project") {
        throw new Error(`${actionKind} action without a source in '${viewId}'`);
      }
      if(actionKind !== "project") {
        compiled[actionKind](source["source view"], mappingObject, action.action);
      } else {
        compiled[actionKind](mappingObject);
      }
    }
  }
  return compiled;
}

//---------------------------------------------------------
// Eve functions
//---------------------------------------------------------

runtime.define("entity to graph", {multi: true}, function(entity, text) {
  return entityToGraph(entity, text);
});

runtime.define("parse eavs", {multi: true}, function(entity, text) {
  return parseEntity(entity, text).eavs;
});

runtime.define("bit template", {multi: true}, function(row, name, template, action) {
  let content = template;
  for(let key in row) {
    let item = row[key];
    content = content.replace(new RegExp(`{${key}}`, "gi"), item);
  }
  let entity;
  let header = content.match(/#.*$/mgi);
  if(header) {
    entity = header[0].replace("#", "").toLowerCase().trim();
  } else {
    entity = `${name}|${row.__id}`;
  }
  let blockId = `${action}|${row.__id}`;
  return [{entity: blockId, attribute: "is a", value: "content block"},
          {entity: blockId, attribute: "associated entity", value: entity},
          {entity: blockId, attribute: "content", value: content},
          {entity: blockId, attribute: "source", value: name}];
});

runtime.define("collection content", {}, function(collection) {
  return {content: `# ${pluralize(collection, 2)}`};
});


//---------------------------------------------------------
// Queries
//---------------------------------------------------------

// eve.addTable("manual entity", ["entity", "content"]);
// eve.addTable("action entity", ["entity", "content", "source"]);

// eve.asView(eve.union("entity")
//               .union("manual entity", {entity: ["entity"], content: ["content"]})
//               .union("action entity", {entity: ["entity"], content: ["content"]})
//               .union("unmodified added bits", {entity: ["entity"], content: ["content"]})
//               .union("automatic collection entities", {entity: ["entity"], content: ["content"]}));

// eve.asView(eve.query("unmodified added bits")
//               .select("added bits", {}, "added")
//               .deselect("manual entity", {entity: ["added", "entity"]})
//               .project({entity: ["added", "entity"], content: ["added", "content"]}));

// eve.asView(eve.query("parsed eavs")
//             .select("entity", {}, "entity")
//             .calculate("parse eavs", {entity: ["entity", "entity"], text: ["entity", "content"]}, "parsed")
//             .project({entity: ["entity", "entity"], attribute: ["parsed", "attribute"], value: ["parsed", "value"]}));

// eve.asView(eve.union("entity eavs")
//             .union("added collections", {entity: ["entity"], attribute: "is a", value: ["collection"]})
//             .union("parsed eavs", {entity: ["entity"], attribute: ["attribute"], value: ["value"]})
//             // this is a stored union that is used by the add eav action to take query results and
//             // push them into eavs, e.g. sum salaries per department -> [total salary = *]
//             .union("added eavs", {entity: ["entity"], attribute: ["attribute"], value: ["value"]}));

// eve.asView(eve.query("is a attributes")
//               .select("entity eavs", {attribute: "is a"}, "is a")
//               .project({collection: ["is a", "value"], entity: ["is a", "entity"]}));

// @HACK: this view is required because you can't currently join a select on the result of a function.
// so we create a version of the eavs table that already has everything lowercased.
// eve.asView(eve.query("lowercase eavs")
//               .select("entity eavs", {}, "eav")
//               .calculate("lowercase", {text: ["eav", "value"]}, "lower")
//               .project({entity: ["eav", "entity"], attribute: ["eav", "attribute"], value: ["lower", "result"]}));

// eve.asView(eve.query("entity links")
//               .select("lowercase eavs", {}, "eav")
//               .select("entity", {entity: ["eav", "value"]}, "entity")
//               .project({entity: ["eav", "entity"], link: ["entity", "entity"], type: ["eav", "attribute"]}));

// eve.asView(eve.union("directionless links")
//               .union("entity links", {entity: ["entity"], link: ["link"]})
//               .union("entity links", {entity: ["link"], link: ["entity"]}));

// eve.asView(eve.union("collection entities")
//             // the rest of these are editor-level views
//             .union("is a attributes", {entity: ["entity"], collection: ["collection"]})
//             // this is a stored union that is used by the add to collection action to take query results and
//             // push them into collections, e.g. people older than 21 -> [[can drink]]
//             .union("added collections", {entity: ["entity"], collection: ["collection"]}));

// eve.asView(eve.query("collection")
//             .select("collection entities", {}, "collections")
//             .group([["collections", "collection"]])
//             .aggregate("count", {}, "count")
//             .project({collection: ["collections", "collection"], count: ["count", "count"]}));

// eve.asView(eve.query("automatic collection entities")
//               .select("collection", {}, "coll")
//               .deselect("manual entity", {entity: ["coll", "collection"]})
//               .calculate("collection content", {collection: ["coll", "collection"]}, "content")
//               .project({entity: ["coll", "collection"], content: ["content", "content"]}));

//---------------------------------------------------------
// Go
//---------------------------------------------------------

function initSearches() {
  for(let search of eve.find("builtin search")) {
    app.activeSearches[search.id] = newSearch(eve.findOne("builtin search query", {id: search.id})["search"]);
  }
}

// @TODO: KILL ME
import "./bootstrap";

function initEve() {
  let stored = localStorage[app.eveLocalStorageKey];
  if(!stored) {
    var diff = eve.diff();
    let id = uuid();
    diff.add("builtin search", {id, top: 100, left: 100});
    diff.add("builtin search query", {id, search: "foo"});
    eve.applyDiffIncremental(diff);
  }
  initSearches();
}

app.renderRoots["wiki"] = root;
app.init("wiki", function() {
  document.body.classList.add(localStorage["theme"] || "light");
  app.activeSearches = {};
  initEve();
});

declare var exports;
window["wiki"] = exports;
