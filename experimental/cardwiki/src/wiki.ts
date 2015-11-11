/// <reference path="app.ts" />
/// <reference path="microReact.ts" />
/// <reference path="runtime.ts" />
"use strict"

module wiki {

  declare var CodeMirror;
  declare var pluralize;
  declare var uuid;

  //---------------------------------------------------------
  // App state
  //---------------------------------------------------------

  var eve = app.eve;

  //---------------------------------------------------------
  // Article
  //---------------------------------------------------------

  export function coerceInput(input) {
    if (input.match(/^-?[\d]+$/gim)) {
      return parseInt(input);
    }
    else if (input.match(/^-?[\d]+\.[\d]+$/gim)) {
      return parseFloat(input);
    }
    else if (input === "true") {
      return true;
    }
    else if (input === "false") {
      return false;
    }
    return input;
  }

  var breaks = /[\[\]\|=\n#]/;
  var types = {
    "#": "header",
    "[": "link open",
    "]": "link close",
    "[[": "collection open",
    "]]": "collection close",
    "|": "link separator",
    "=": "assignment",
  }
  function tokenize(article) {
    let line = 0;
    let ix = 0;
    let len = article.length;
    let tokens = [];
    let cur = {ix, line, type: "text", text: ""};
    for(; ix < len; ix++) {
      let ch = article[ix];
      if(ch.match(breaks)) {
        let type = types[ch];
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
        while(ch === article[ix + 1]) {
          ix++;
          ch = article[ix];
          cur.text += ch;
        }
        if(types[cur.text]) {
          cur.type = types[cur.text];
        }
        if(type === "header") {
          //trim the next character if it's a space between the header indicator
          //and the text;
          if(article[ix+1] === " ") ix++;
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
            state.type = "eav";
            eavs.push(state);
          } else {
            links.push(state);
          }
          line.items.push(state);
          state = {items: []};
          break;
        case "collection open":
          state.capturing = true;
          state.mode = "collection";
          state.items.push(token);
          break;
        case "collection close":
          state.items.push(token);
          state.type = "collection";
          line.items.push(state);
          collections.push(state);
          state = {items: []};
          break;
        case "link separator":
          state.mode = "link type";
          state.items.push(token);
          break;
        case "assignment":
          state.mode = "assignment";
          state.attribute = state.link;
          break;
        case "text":
          if(!state.capturing) {
            line.items.push(token);
          } else if(state.mode === "link") {
            state.link = token.text.trim();
            state.items.push(token);
          } else if(state.mode === "link type") {
            state.linkType = token.text.trim();
            state.items.push(token);
          } else if(state.mode === "collection") {
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
  function parsePage(pageId, content) {
    if(!parseCache) parseCache = {};
    let cached = parseCache[pageId];
    if(!cached || cached[0] !== content) {
      cached = parseCache[pageId] = [content, parse(tokenize(content))];
    }
    return cached[1];
  }

  function articleToHTML(lines, searchId) {
    let children = [];
    for (let line of lines) {
      let lineChildren = [];
      let items = line.items;
      for (var item of items) {
        if(item.type === "text") {
          lineChildren.push({t: "span", text: item.text});
          continue;
        }
        if(item.type === "eav") {
          lineChildren.push({t: "span", c: `${item.type}`, text: item.value});
          continue;
        }
        let link = item.link.toLowerCase();
        let found = eve.findOne("page", {page: link}) || eve.findOne("collection", {page: link});
        lineChildren.push({t: "span", c: `${item.type} ${found ? 'found' : ""}`, text: item.link, linkText: link, click: followLink, searchId});
      }
      if(line.header) {
        lineChildren = [{t: "h1", children: lineChildren}];
      }
      children.push({t: "pre", c: `${line.header ? 'header' : ''}`, children: lineChildren});
    }
    return children;
  }

  function stringMatches2(string, type, index) {
    // remove all non-word non-space characters
    let cleaned = string.replace(/[^\s\w]/gi, " ").toLowerCase();
    let words = cleaned.split(" ");
    let front = 0;
    let back = words.length;
    let results = [];
    let pos = 0;
    while(front < words.length) {
      let str = words.slice(front, back).join(" ");
      let orig = str;
      let found = index[str];
      if(!found) {
        str = pluralize(str, 1);
        found = index[str];
        if(!found) {
          str = pluralize(str, 12);
          found = index[str];
        }
      }
      if(found) {
        results.push({found: str, orig, pos, type});
        front = back;
        pos += orig.length + 1;
        back = words.length;
      } else if(back - 1 > front) {
        back--;
      } else {
        back = words.length;
        pos += words[front].length + 1;
        front++;
      }
    }
    return results;
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
    "highest": {op: "sort limit", argCount: 1, direction: "descending"},
    "lowest": {op: "sort limit", argCount: 1, direction: "ascending"},
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
    // search the string for entities / collections
    // TODO: this is stupidly slow
    let cleaned = searchString.toLowerCase();
    eve.find("entity", {entity: ""});
    var index = eve.table("entity").indexes["entity"].index;
    let entities = stringMatches2(searchString, "entity", index);
    eve.find("collection", {collection: ""});
    var collectionIndex = eve.table("collection").indexes["collection"].index;
    let collections = stringMatches2(searchString, "collection", collectionIndex);
    eve.find("page eavs", {attribute: ""});
    var eavIndex = eve.table("page eavs").indexes["attribute"].index;
    let eavs = stringMatches2(searchString, "attribute", eavIndex);
    let all = entities.concat(collections).concat(eavs);
    all.sort((a, b) => a.pos - b.pos);
    let remaining = cleaned;
    for(let part of all) {
      let spaces = "";
      for(var i = 0; i < part.orig.length; i++) spaces += " ";
      remaining = remaining.replace(part.orig, spaces);
    }
    let words = remaining.split(" ");
    let ix = 0;
    let wordIx = 0;
    for(let wordLen = words.length; wordIx < wordLen; wordIx++) {
      let word = words[wordIx];
      if(!word) {
        ix++;
        continue;
      }
      if(modifiers[word]) {
        all.push({type: "modifier", orig: word, modifier: modifiers[word], pos: ix});
      } else if(operations[word]) {
        all.push({type: "operation", orig: word, operation: operations[word], pos: ix});
      } else if(word === "collection" || word === "collections") {
        all.push({type: "collection", found: word, orig: word, pos: ix})
      } else if(parseFloat(word)) {
        all.push({type: "value", value: word, orig: word, pos: ix});
      } else if(word[0] === "\"") {
        // @TODO: account for multi word quotes
        let total = word;
        let next = words[++wordIx];
        while(next) {
          total += ` ${next}`;
          if(next[next.length - 1] === "\"") {
            break;
          }
          wordIx++;
          next = words[wordIx];
        }
        word = total;
        all.push({type: "value", value: word, orig: word, pos: ix});
      }
      ix += word.length + 1;
    }
    all.sort((a, b) => a.pos - b.pos);
    return all;
  }

function walk(tree, indent = 0) {
    if(!tree) return console.log("UNDEFINED TREE");
    let text = tree.found;
    if(!text && tree.operation) {
      text = tree.operation.op;
    } else if(!text && tree.value) {
      text = tree.value;
    }
    console.group(text, `(${tree.type})`);
    if(tree.children) {
      for(let child of tree.children) {
        walk(child, indent+1);
      }
    }
    console.groupEnd(text, `(${tree.type})`);
}


  var tokenRelationships = {
    "collection": {
      "collection": findCollectionToCollectionRelationship,
      "attribute": findCollectionToAttrRelationship,
      "entity": findCollectionToEntRelationship,
    },
    "entity": {
      "attribute": findEntToAttrRelationship,
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
      if(token.type === "collection") {
        token.children = [];
        root = token;
        break;
      } else if(token.type === "entity" && (!root || root.type === "attribute")) {
        token.children = [];
        root = token;
      } else if(token.type === "attribute" && !root) {
        token.children = [];
        root = token;
      }
    }
    tree.roots.push(root);
    for(let tokenIx = 0, len = tokens.length; tokenIx < len; tokenIx++) {
      let token = tokens[tokenIx];
      token.id = uuid();
      let {type} = token;

      if(state.group && (type === "collection" || type === "attribute")) {
        token.group = true;
        tree.groups.push(token);
      }

      if(token === root) continue;

      if(type === "modifier") {
        state[token.modifier] = true;
        continue;
      }

      token.children = [];

      if(type === "operation") {
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

      if(!state.consuming && type === "value") {
        state.lastValue = token;
        continue;
      }

      let maybeSubject = (type === "collection" || type === "entity");
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
            if(child.type === "attribute") {
              cursor.children.push(child);
              operatorChildren[ix] = child;
            } else if(child.type !== "value") {
              // we have something that could nest.
              let tip = child;
              while(tip.children.length) {
                tip = tip.children[tip.children.length - 1];
              }
              if(operation.attribute) {
                tip.children.push({type: "attribute", found: operation.attribute, orig: operation.attribute, id: uuid(), children: []});
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
            let attr = {type: "attribute", found: operation.attribute, orig: operation.attribute, id: uuid(), children: []};
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
      else if(type === "value") {
        activeRoot.children.push(token);
      }
      // if the current cursor is an entity and this is anything other than an attribute, this is related
      // to the root.
      else if(cursor.type === "entity" && type !== "attribute") {
        activeRoot.children.push(token);
      }
      // if the current cursor is an entity or a collection, we have to check if it should go to the cursor
      // or the root
      else if(cursor.type === "entity" || cursor.type === "collection") {
        let cursorRel = tokensToRelationship(cursor, token);
        let rootRel = tokensToRelationship(root, token);
        // if this token is an entity and either root or cursor has a direct relationship
        // we don't really want to use that as it's most likely meant to filter a set down
        // instead of reduce the set to exactly one ent
        if(token.type === "entity") {
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
      } else if(cursor.type === "operation") {
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
          if(child.type === "attribute") {
            cursor.children.push(child);
            operatorChildren[ix] = child;
          } else if(child.type && child.type !== "value") {
            // we have something that could nest.
            let tip = child;
            while(tip.children.length) {
              tip = tip.children[0];
            }
            if(operation.attribute) {
              let neueAttr = {type: "attribute", found: operation.attribute, orig: operation.attribute, id: uuid(), children: []};
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
          let attr = {type: "attribute", found: operation.attribute, orig: operation.attribute, id: uuid(), children: []};
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
    //TODO: figure out what to do with operations
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
            let item = {type: "gather", relatedTo: curParent, collection: coll, id: uuid()};
            plan.push(item);
            curParent = item;
          }
          plan.push({type: "lookup", relatedTo: curParent, attribute: node.found, id, deselect});
          return plan;
          break;
        case "coll->ent":
          var plan = [];
          var curParent = parentPlan;
          for(let node of rel.nodes) {
            let coll = ignoreHiddenCollections(node);
            let item = {type: "gather", relatedTo: curParent, collection: coll, id: uuid()};
            plan.push(item);
            curParent = item;
          }
          plan.push({type: "filter by entity", relatedTo: curParent, entity: node.found, id, deselect});
          return plan;
          break;
        case "coll->coll":
          if(rel.distance === 0) {
            return [{type: "intersect", relatedTo: parentPlan, collection: node.found, id, deselect}];
          } else {
            return [{type: "gather", relatedTo: parentPlan, collection: node.found, id, deselect}];
          }
          break;
        case "ent->eav":
          if(rel.distance === 0) {
            return [{type: "lookup", relatedTo: parentPlan, attribute: node.found, id, deselect}];
          } else {
            let plan = [];
            let curParent = parentPlan;
            for(let node of rel.nodes) {
              let coll = ignoreHiddenCollections(node);
              let item = {type: "gather", relatedTo: curParent, collection: coll, id: uuid()};
              plan.push(item);
              curParent = item;
            }
            plan.push({type: "lookup", relatedTo: curParent, attribute: node.found, id, deselect});
            return plan;
          }
          break;
        case "collection->ent":
          break;
      }
    } else {
      if(node.type === "collection") {
        return [{type: "gather", collection: node.found, id, deselect}];
      } else if(node.type === "entity") {
        return [{type: "find", entity: node.found, id, deselect}];
      } else if(node.type === "attribute") {
        return [{type: "lookup", attribute: node.found, id, deselect}];
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
        if(value.type && value.type === "value") {
          args[arg] = JSON.parse(value.value);
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
      for(let child of op.children) {
        if(child.type && child.type === "value") {
          limit = child.value;
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
      if(node.type === "collection") {
        groups.push([node.id, "page"]);
      } else if(node.type === "attribute") {
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

  function planToQuery(plan) {
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
              query.select("directionless links", {page: related.entity}, linkId);
              join.page = [linkId, "link"];
              query.select("collection pages", join, step.id);
            } else {
              step.size = 2;
              let linkId = `${step.id} | link`;
              query.select("directionless links", {page: [related.id, "page"]}, linkId);
              join.page = [linkId, "link"];
              query.select("collection pages", join, step.id);
            }
          } else {
            step.size = 1;
            query.select("collection pages", join, step.id);
          }
          step.name = safeProjectionName(step.collection, projection);
          projection[step.name] = [step.id, "page"];
          break;
        case "lookup":
          var join:any = {attribute: step.attribute};
          var related = step.relatedTo;
          if(related) {
            if(related.type === "find") {
              join.page = related.entity;
            } else {
              join.page = [related.id, "page"];
            }
          }
          step.size = 1;
          query.select("page eavs", join, step.id);
          step.name = safeProjectionName(step.attribute, projection);
          projection[step.name] = [step.id, "value"];
          break;
        case "intersect":
          var related = step.relatedTo;
          if(step.deselect) {
            step.size = 0;
            query.deselect("collection pages", {collection: step.collection, page: [related.id, "page"]});
          } else {
            step.size = 0;
            query.select("collection pages", {collection: step.collection, page: [related.id, "page"]}, step.id);
          }
          break;
        case "filter by entity":
          var related = step.relatedTo;
          var linkId = `${step.id} | link`;
          if(step.deselect) {
            step.size = 0;
            query.deselect("directionless links", {page: [related.id, "page"], link: step.entity});
          } else {
            step.size = 1;
            query.select("directionless links", {page: [related.id, "page"], link: step.entity}, step.id);
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

  function newSearch(searchString) {
    let all = newSearchTokens(searchString);
    let tree = planTree(searchString);
    console.log(tree);
    let plan = treeToPlan(tree);
    let query = planToQuery(plan);
    return {tokens: all, plan, query};
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

  function pageTocollectionsArray(page) {
    let pages = eve.find("collection pages", {page});
    return pages.map((a) => a["collection"]);
  }

  function extractFromUnprojected(coll, ix, field, size) {
    let results = [];
    for(var i = 0, len = coll.length; i < len; i += size) {
      results.push(coll[i + ix][field]);
    }
    return results;
  }

  function findCommonCollections(ents) {
    let intersection = pageTocollectionsArray(ents[0]);
    intersection.sort();
    for(let entId of ents.slice(1)) {
      let cur = pageTocollectionsArray(entId);
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
    let directAttribute = eve.findOne("page eavs", {page: ent, attribute: attr});
    if(directAttribute) {
      return {distance: 0, type: "ent->eav"};
    }
    let relationships = eve.query(``)
                  .select("page links", {page: ent}, "links")
                  .select("page eavs", {page: ["links", "link"], attribute: attr}, "eav")
                  .exec();
    if(relationships.unprojected.length) {
      let pages = extractFromUnprojected(relationships.unprojected, 0, "link", 2);
      return {distance: 1, type: "ent->eav", nodes: [findCommonCollections(pages)]};
    }
    let relationships2 = eve.query(``)
                  .select("page links", {page: ent}, "links")
                  .select("page links", {page: ["links", "link"]}, "links2")
                  .select("page eavs", {page: ["links2", "link"], attribute: attr}, "eav")
                  .exec();
    if(relationships2.unprojected.length) {
      let pages = extractFromUnprojected(relationships2.unprojected, 0, "link", 3);
      let pages2 = extractFromUnprojected(relationships2.unprojected, 1, "link", 3);
      return {distance: 2, type: "ent->eav", nodes: [findCommonCollections(pages), findCommonCollections(pages2)]};
    }
  }

  // e.g. "salaries per department"
  function findCollectionToAttrRelationship(coll, attr) {
    let direct = eve.query(``)
                  .select("collection pages", {collection: coll}, "collection")
                  .select("page eavs", {page: ["collection", "page"], attribute: attr}, "eav")
                  .exec();
    if(direct.unprojected.length) {
      return {distance: 0, type: "coll->eav", nodes: []};
    }
    let relationships = eve.query(``)
                  .select("collection pages", {collection: coll}, "collection")
                  .select("directionless links", {page: ["collection", "page"]}, "links")
                  .select("page eavs", {page: ["links", "link"], attribute: attr}, "eav")
                  .exec();
    if(relationships.unprojected.length) {
      let pages = extractFromUnprojected(relationships.unprojected, 1, "link", 3);
      return {distance: 1, type: "coll->eav", nodes: [findCommonCollections(pages)]};
    }
    let relationships2 = eve.query(``)
                  .select("collection pages", {collection: coll}, "collection")
                  .select("directionless links", {page: ["collection", "page"]}, "links")
                  .select("directionless links", {page: ["links", "link"]}, "links2")
                  .select("page eavs", {page: ["links2", "link"], attribute: attr}, "eav")
                  .exec();
    if(relationships2.unprojected.length) {
      let pages = extractFromUnprojected(relationships2.unprojected, 1, "link", 4);
      let pages2 = extractFromUnprojected(relationships2.unprojected, 2, "link", 4);
      return {distance: 2, type: "coll->eav", nodes: [findCommonCollections(pages), findCommonCollections(pages2)]};
    }
  }

  // e.g. "meetings john was in"
  function findCollectionToEntRelationship(coll, ent):any {
    if(coll === "collections") {
      if(eve.findOne("collection pages", {page: ent})) {
        return {distance: 0, type: "ent->collection"};
      }
    }
    if(eve.findOne("collection pages", {collection: coll, page: ent})) {
      return {distance: 0, type: "coll->ent", nodes: []};
    }
    let relationships = eve.query(``)
                  .select("collection pages", {collection: coll}, "collection")
                  .select("directionless links", {page: ["collection", "page"], link: ent}, "links")
                  .exec();
    if(relationships.unprojected.length) {
      return {distance: 1, type: "coll->ent", nodes: []};
    }
    // e.g. events with chris granger (events -> meetings -> chris granger)
    let relationships2 = eve.query(``)
                  .select("collection pages", {collection: coll}, "collection")
                  .select("directionless links", {page: ["collection", "page"]}, "links")
                  .select("directionless links", {page: ["links", "link"], link: ent}, "links2")
                  .exec();
    if(relationships2.unprojected.length) {
      let pages = extractFromUnprojected(relationships2.unprojected, 1, "link", 3);
      return {distance: 2, type: "coll->ent", nodes: [findCommonCollections(pages)]};
    }
  }

  // e.g. "authors and papers"
  function findCollectionToCollectionRelationship(coll, coll2) {
    // are there things in both sets?
    let intersection = eve.query(`${coll}->${coll2}`)
                     .select("collection pages", {collection: coll}, "coll1")
                     .select("collection pages", {collection: coll2, page: ["coll1", "page"]}, "coll2")
                     .exec();
    //is there a relationship between things in both sets
    let relationships = eve.query(`relationships between ${coll} and ${coll2}`)
                  .select("collection pages", {collection: coll}, "coll1")
                  .select("directionless links", {page: ["coll1", "page"]}, "links")
                  .select("collection pages", {collection: coll2, page: ["links", "link"]}, "coll2")
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
            commitArticle(cm, latest);
            },
            "Ctrl-Enter": (cm) => {
                  let latest = app.renderer.tree[elem.id];
                  commitArticle(cm, latest);
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
          state.marks.push(cm.markText(start, stop, {className: token.type}));
        }
      });
      cm.focus();
    }
    if(cm.getValue() !== elem.value) {
      cm.setValue(elem.value);
    }
  }

  function articleToGraph(pageId, content) {
    let parsed = parsePage(pageId, content);
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

  app.handle("startEditingArticle", (result, info) => {
    result.add("editing", {editing: true, search: info.searchId});
  });

  app.handle("stopEditingArticle", (result, info) => {
    if(!eve.findOne("editing")) return;
    result.remove("editing");
    let {page, value} = info;
    page = page.toLowerCase();
    result.add("manual page", {page, content: value});
    result.remove("manual page", {page});
  });

  app.handle("setSearch", (result, info) => {
    let searchId = info.searchId;
    let search = eve.findOne("search query", {id: searchId})["search"];
    if(search === info.value) return;

    if(!eve.findOne("history stack", {page: search})) {
      let stack = eve.find("history stack");
      result.add("history stack", {page: search, pos: stack.length});
    }
    let newSearchValue = info.value.trim();
    app.activeSearches[searchId] = newSearch(newSearchValue);
    result.remove("search query", {id: searchId});
    result.add("search query", {id: searchId, search: newSearchValue});
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
      result.merge(addBitAction(search, info.template, app.activeSearches[searchId].query));
    }
  });

  app.handle("addNewSearch", (result, info) => {
    let id = uuid();
    let search = info.search || "foo";
    app.activeSearches[id] = newSearch(search);
    result.add("search", {id, top: info.top || 100, left: info.left || 100});
    result.add("search query", {id, search});
  });

  app.handle("removeSearch", (result, info) => {
    let {searchId} = info;
    if(!searchId) return;
    result.remove("search", {id: searchId});
    result.remove("search query", {id: searchId});
    app.activeSearches[searchId] = null;
  });

  app.handle("startAddingAction", (result, info) => {
    result.remove("adding action");
    result.add("adding action", {type: info.type, search: info.searchId});
  });

  app.handle("stopAddingAction", (result, info) => {
    result.remove("adding action");
  });

  app.handle("startDragging", (result, info) => {
    let {searchId, x, y} = info;
    let pos = eve.findOne("search", {id: searchId});
    dragging = {id: searchId, offsetTop: y - pos.top, offsetLeft: x - pos.left};
  });

  app.handle("stopDragging", (result, info) => {
    dragging = null;
  });

  app.handle("moveSearch", (result, info) => {
    let {searchId, x, y} = info;
    result.remove("search", {id: searchId});
    result.add("search", {id: searchId, top: y - dragging.offsetTop, left: x - dragging.offsetLeft});
  });

  app.handle("toggleShowPlan", (result, info) => {
    if(eve.findOne("showPlan", {search: info.searchId})) {
      result.remove("showPlan", {search: info.searchId});
    } else {
      result.add("showPlan", {search: info.searchId});
    }
  });

  function randomlyLetter(phrase, klass = "") {
    let children = [];
    let ix = 0;
    for(var letter of phrase) {
      let rand = Math.round(Math.random() * 5);
      children.push({id: phrase + ix, t: "span", c: `letter`, text: letter, enter: {opacity: 1, duration: (rand * 100) + 150, delay: (0 * 30) + 300}, leave: {opacity: 0, duration: 250}});
      ix++;
    }
    return {c: `phrase ${klass}`, children};
  }

  var slideNumber = 0;
  var slides = [
    {type: "slide",
     content: {children: [
       randomlyLetter("The world is full of bits of information.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("We spend our lives exploring those bits.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("They form the foundation of our understanding, our decisions, our work...")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("And yet the tools we have to work with them are fairly primitive.")
     ]}},
    {type: "slide",
     content: {children: [
       {id: "slide-list", c: "list", children: [
         randomlyLetter("- Our communications are static"),
         randomlyLetter("- Information requires rigid structure"),
         randomlyLetter("- Exploration is either limited or it's code"),
       ]}
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("That's where I come in.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("I help collect, explore, and communicate aspects of the world around you.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("My name is Eve.")
     ]}},
    {type: "slide",
     setup: () => {
       let diff = eve.diff();
       diff.add("search", {id: "vin diesel", top: 0, left: 0});
       diff.add("search query", {id: "vin diesel", search: "vin diesel"});
       eve.applyDiff(diff);
       app.activeSearches["vin diesel"] = newSearch("vin diesel");
     },
     teardown: () => {
       let diff = eve.diff();
       diff.remove("search", {id: "vin diesel"});
       diff.remove("search query", {id: "vin diesel"});
       eve.applyDiff(diff);
       app.activeSearches["vin diesel"] = null;
     },
     content: () => {
       let search:any = newSearchResults("vin diesel");
       search.leave = {opacity:0, duration: 300},
       search.enter = {opacity:1, duration: 2500, delay: 300, begin: (node) => {
         if(!node[0]) return;
         setTimeout(() => {
           node[0].querySelector(".search-box").editor.refresh();
         }, 30);
       }};
       return {children: [
         randomlyLetter("And I collect bits like this one"),
         search,
         //        {c: "bit entity", text: "George Washington"}
       ]}}
    },
    {type: "slide",
     content: {children: [
       randomlyLetter("There are some serious advantages to collecting information in bits.")
     ]}},
    {type: "slide",
     content: {children: [
       {id: "slide-list", c: "list", children: [
         randomlyLetter("- Capture information however it comes."),
         randomlyLetter("- No planning or pre-structuring"),
         randomlyLetter("- Nothing is too big or too small"),
         randomlyLetter("- Not just tables, it's the whole story"),
       ]}
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("I can also pull in information from the outside world.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("But the most important thing is that I was designed to be malleable.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("You can..."),
       {id: "slide-list", c: "list", children: [
         randomlyLetter("- Add structure at any time"),
         randomlyLetter("- Work with heterogenous collections"),
         randomlyLetter("- Handle one off tasks"),
         randomlyLetter("- Cleanly deal with special cases"),
       ]}
     ]}},
    {type: "eve"},
    {type: "slide",
     content: {children: [
       randomlyLetter("The purpose of collecting all this is to explore it.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("But I likely mean something different than what you're thinking.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("Exploration isn't just navigation. It's discovering new information.")
     ]}},
    {type: "slide",
     setup: () => {
       let diff = eve.diff();
       diff.add("search", {id: "vin diesel", top: 0, left: 0});
       diff.add("search query", {id: "vin diesel", search: "sum salaries per department"});
       eve.applyDiff(diff);
       app.activeSearches["vin diesel"] = newSearch("sum salaries per department");
     },
     teardown: () => {
       let diff = eve.diff();
       diff.remove("search", {id: "vin diesel"});
       diff.remove("search query", {id: "vin diesel"});
       eve.applyDiff(diff);
       app.activeSearches["vin diesel"] = null;
     },
     content: () => {
       let search:any = newSearchResults("vin diesel");
       search.leave = {opacity:0, duration: 300},
       search.enter = {opacity:1, duration: 1000, delay: 300, begin: (node) => {
         if(!node[0]) return;
         setTimeout(() => {
           node[0].querySelector(".search-box").editor.refresh();
         }, 30);
       }};
       return {children: [
         search,
         //        {c: "bit entity", text: "George Washington"}
       ]}}
    },
    {type: "slide",
     content: {children: [
       randomlyLetter("My search is more powerful than most searches you're used to.")
     ]}},
    {type: "slide",
     content: {children: [
       {id: "slide-list", c: "list", children: [
         randomlyLetter("- It's live"),
         randomlyLetter("- It's tangible"),
         randomlyLetter("- It's manipulable"),
       ]}
     ]}},
    {type: "eve"},
    {type: "slide",
     content: {children: [
       randomlyLetter("I can also peer into the past and help explore alternative futures.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("Exploration is simply a matter of searching and formatting the results.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("But you also need to be able to communicate, not just explore.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("Fortunately, you can send bits to other people and systems. You can even search over the communcations themselves.")
     ]}},
    {type: "eve"},
    {type: "slide",
     content: {children: [
       randomlyLetter("Communicating isn't just about sending messages though. It's about representing information in useful ways.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("You can create documents, dashboards, even custom interfaces, by drawing and embedding bits.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("And you can still pull them apart to see how they're made.")
     ]}},
     {type: "slide",
     content: {children: [
       randomlyLetter("That allows people to explore beyond what you send them. They can remix it and create new bits based on the information.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("This enables people to collaborate in a much deeper way.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("Sometimes we are just exploring by ourselves, but much of the time there are teams, businesses, even times when we want to work with the whole world.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("One thing I've learned about collaboration is that that doesn't always mean consensus.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("Instead, many versions of a bit can exist, you can have yours and others can have theirs.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("But we can still propose changes to each other and select people to approve updates to the final version.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("This enables others to contribute to the overall process, while maintaining control of the end result.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("This form of collaboration also allows for different world views and different ideas of correctness.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("Which is important because I was meant to fit in the real world, not some idealized version where everything fits neatly in a box.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("And it is that world that is rapidly becoming something new.")
     ]}},
    {type: "slide",
     content: {children: [
       {id: "slide-list", c: "list", children: [
         randomlyLetter("There are new inputs: pen, voice"),
         randomlyLetter("New displays: mobile, VR, AR"),
         randomlyLetter("New kinds of systems: everything is distributed"),
         randomlyLetter("New version of work: everything is constantly changing data"),
       ]}
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("I am built to collect, explore and communicate in that world.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("I am alive, malleable, and everywhere.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("I am the approachable genius: honest, genuine, curious, and conversational.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("I am Eve.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("Questions"),
       {id: "slide-list", c: "list", children: [
         randomlyLetter("- She vs. it"),
         randomlyLetter("- Mobile?"),
         randomlyLetter("- What is eve? Jarvis? A workspace? ..?"),
       ]}
     ]}},
     {type: "slide",
     content: {children: [
       randomlyLetter("Technical questions"),
       {id: "slide-list", c: "list", children: [
         randomlyLetter("- Incrementalism with cycles"),
         randomlyLetter("- Efficient incrementalism in an EAV world"),
         randomlyLetter("- Federation"),
         randomlyLetter("- Supporting integrations"),
         randomlyLetter("- Version control"),
         randomlyLetter("- How far can the natural language stuff go, before heuristics stop working?"),
         randomlyLetter("- Progressive storage/querying"),
       ]}
     ]}},
  ]

  function nextSlide(e, elem) {
    let prev:any = slides[slideNumber];
    if(prev.teardown) {
      prev.teardown();
    }
    if(!elem.back) {
      slideNumber++;
    } else {
      slideNumber--;
    }
    if(slideNumber < 0) slideNumber = 0;
    if(slideNumber >= slides.length) slideNumber = slides.length - 1;
    let slide:any = slides[slideNumber];
    if(slide.setup) {
      slide.setup();
    }
    e.stopPropagation();
    e.preventDefault();
    console.log(slideNumber);
    app.render();
  }

  function slideControls() {
    return {c: "slide-controls", children: [
      {c: "ion-ios-arrow-back", back: true, click: nextSlide},
      {c: "ion-ios-arrow-forward", click: nextSlide}
    ]};
  }

  export function root() {
    let slide:any = slides[slideNumber] || {type: "slide"};
    if(false) {
      let content = slide.content;
      if(typeof content === "function") {
        content = content();
      }
      return {id: "root", c: "root slide", children: [
        slideControls(),
        content
      ]};
    } else {
      return eveRoot();
    }
  }

  function eveRoot() {
    let searchers = [];
    for(let search of eve.find("search")) {
      searchers.push(newSearchResults(search.id));
    }
    return {id: "root", c: "root", dblclick: addNewSearch, children: [
//       slideControls(),
//       randomlyLetter("Let's get started."),
      {c: "canvas", mousemove: maybeDrag, children: searchers},
//       relatedItems(),
//       historyStack(),
    ]};
  }

  function maybeDrag(e, elem) {
    if(dragging) {
      app.dispatch("moveSearch", {searchId: dragging.id, x: e.clientX, y: e.clientY}).commit();
      e.preventDefault();
    }
  }

  function addNewSearch(e, elem) {
    if(e.target.classList.contains("canvas")) {
      app.dispatch("addNewSearch", {top: e.clientY, left: e.clientX}).commit();
      e.preventDefault();
    }
  }

  function articleUi(articleId, instance:string|number = "", searchId) {
    let article = eve.findOne("page", {page: articleId}) || {content: ""};
    let articleView;
    if(!eve.findOne("editing", {search: searchId})) {
      articleView = {id: `${articleId}${instance}`, c: "article", searchId, page: articleId, children: articleToHTML(parsePage(articleId, article.content).lines, searchId), dblclick: editArticle, enter: {display: "flex", opacity: 1, duration: 300}};
    } else {
      articleView = {id: `${articleId}${instance}|editor`, c: "article editor", page: articleId, searchId, postRender: CodeMirrorElement, value: article.content, blur: commitArticle};
    }
    let relatedBits = [];
    for(let added of eve.find("added eavs", {page: articleId})) {
      relatedBits.push({c: "bit attribute", click: followLink, searchId, linkText: added["source view"], children: [
        {c: "header attribute", text: added.attribute},
        {c: "value", text: added.value},
      ]})
    }
    for(let added of eve.find("added collections", {page: articleId})) {
      relatedBits.push({c: "bit collection", click: followLink, searchId, linkText: added["source view"], children: [
        {c: "header collection", text: added.collection},
      ]})
    }
    for(let incoming of eve.find("page links", {link: articleId})) {
      if(incoming.page === articleId) continue;
      relatedBits.push({c: "bit entity", click: followLink, searchId, linkText: incoming.page, children: [
        {c: "header entity", text: incoming.page},
      ]})
    }

    return {c: "article-container", children: [
      articleView,
      {c: "related-bits", children: relatedBits},
    ]};
  }

  function relatedItems() {
    let items = [];
    for(let inbound of eve.find("active page incoming")) {
      items.push({text: inbound["page"], linkText: inbound["page"], click: followLink});
    }
    return {children: items};
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
        planChildren.push({c: "text operation", text: `sort them by `});
      } else if(step.type === "group") {
        planChildren.push({c: "text operation", text: `group them by `});
      } else if(step.type === "limit") {
        let limit;
        if(step.limit.results) {
          limit = `to ${step.limit.results} results`;
        } else {
          limit = `to ${step.limit.perGroup} items per group`;
        }
        planChildren.push({c: "text operation", text: `limit ${limit}`});
      } else if(step.type === "calculate") {
        planChildren.push({c: "text operation", text: `${step.type}->`});
      } else if(step.type === "aggregate") {
        planChildren.push({c: "text operation", text: `${step.aggregate}`});
      } else {
        planChildren.push({c: "text", text: `${step.type}->`});
      }
    }
    return {c: "container", children: [
      {c: "search-plan", children: planChildren}
    ]};
  }

  function newSearchResults(searchId) {
    let {top, left} = eve.findOne("search", {id: searchId});
    let search = eve.findOne("search query", {id: searchId})["search"];
    let {tokens, plan, query} = app.activeSearches[searchId];
    let resultItems = [];
    let groupedFields = {};
    if(query) {
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
              text = resultPart["page"];
              klass = "entity";
              click = followLink;
              link = resultPart["page"];
              if(planIx > 0) {
//                 klass += " small";
//                 text = first2Letters(text);
              }
            } else if(planItem.type === "lookup") {
              text = resultPart["value"];
              klass = "attribute";

            } else if(planItem.type === "aggregate") {
              text = resultPart[planItem.aggregate];
              klass = "value";
            } else if(planItem.type === "filter by entity") {
              // we don't really want these to show up.
            } else {
              text = JSON.stringify(resultPart);
            }
            if(text) {
              let rand = Math.floor(Math.random() * 20) + 1;
              let item = {id: `${searchId} ${ix} ${planIx}`, c: `bit ${klass}`, text, click, searchId, linkText: link, enter: {opacity:1, duration: rand * 100, delay: ix * 0}};
              if(groupedFields[planItem.name] && !resultItem.children[planIx]) {
                resultItem.children[planIx] = {c: "sub-group", children: [item]};
              } else if(!groupedFields[planItem.name] && !resultItem.children[planIx]) {
                resultItem.children[planIx] = {c: "sub-group", children: [item]};
              } else if(!groupedFields[planItem.name]) {
                resultItem.children[planIx].children.push(item);
              }
            }
            planOffset += planItem.size;
          }
        }
      }
    }
    if(plan.length === 1 && plan[0].type === "find") {
      resultItems.push({c: "singleton", children: [articleUi(plan[0].entity, searchId, searchId)]});
    } else if(plan.length === 0) {
      resultItems.push({c: "singleton", children: [articleUi(search, searchId, searchId)]});
    }
    let actions = [];
    for(let eavAction of eve.find("add eav action", {view: search})) {
      actions.push({c: "action", children: [
        {c: "collection", text: `${pluralize(eavAction.entity, 3)}`},
        {text: " have "},
        {c: "header attribute", text: eavAction.attribute},
        {text: " = "},
        {c: "value", text: eavAction.field},
      ]})
    }
    for(let collectionAction of eve.find("add collection action", {view: search})) {
      actions.push({c: "action", children: [
        {text: "These "},
        {c: "collection", text: `${pluralize(collectionAction.field,3)}`},
        {text: " are "},
        {c: "header collection", text: pluralize(collectionAction.collection, 2)},
      ]})
    }
    for(let bitAction of eve.find("add bit action", {view: search})) {
      let {template, action} = bitAction;
      actions.push({c: "action new-bit", children: [
        {c: "description", text: "actions"},
        {c: "bit entity", children: articleToHTML(parsePage(action, template).lines, null)}
      ]})
    }

    let addActionChildren = [];
    let adding = eve.findOne("adding action", {search: searchId});
    if(adding) {
     if(adding.type === "attribute") {
      addActionChildren.push({c: "add-attribute", children: [
        {t: "input", c: "entity", placeholder: "entity"},
        {text: " have "},
        {t: "input", c: "attribute", placeholder: "attribute"},
        {text: " = "},
        {t: "input", c: "value", placeholder: "value"},
        {c: "spacer"},
        {c: "button", text: "submit", click: submitAction, searchId},
        {c: "button", text: "cancel", click: stopAddingAction},
      ]});
     } else if(adding.type === "collection") {
      addActionChildren.push({c: "add-collection", children: [
        {text: "These "},
        {t: "input", c: "entity", placeholder: "entity"},
        {text: " are "},
        {t: "input", c: "collection", placeholder: "collection"},
        {c: "spacer"},
        {c: "button", text: "submit", click: submitAction, searchId},
        {c: "button", text: "cancel", click: stopAddingAction},
      ]});
     } else if(adding.type === "bit") {
      addActionChildren.push({c: "add-collection", children: [
        {c: "new-bit-editor", searchId, value: "hi!", postRender: NewBitEditor},
        {c: "spacer"},
//         {c: "button", text: "submit", click: submitAction},
        {c: "button", text: "cancel", click: stopAddingAction},
      ]});

     }
    } else {
      addActionChildren.push({c: "", text: "+ entity", actionType: "bit", searchId, click: startAddingAction});
      addActionChildren.push({c: "", text: "+ attribute", actionType: "attribute", searchId, click: startAddingAction});
      addActionChildren.push({c: "", text: "+ collection", actionType: "collection", searchId, click: startAddingAction});
    }

    let headers = []
    // figure out what the headers are
    for(let step of plan) {
      if(step.type === "filter by entity") continue;
      if(step.size === 0) continue;
      headers.push({text: step.name});
    }
    let isDragging = dragging && dragging.id === searchId ? "dragging" : "";
    let showPlan = eve.findOne("showPlan", {search: searchId}) ? searchDescription(tokens, plan) : undefined;
    return {id: `${searchId}|container`, c: `container search-container ${isDragging}`, top, left, children: [
      {c: "search-input", mousedown: startDragging, mouseup: stopDragging, searchId, children: [
        {c: "search-box", value: search, postRender: CMSearchBox, searchId},
        {c: "ion-android-close close", click: removeSearch, searchId},
        {c: `ion-ios-arrow-${showPlan ? 'up' : 'down'} plan`, click: toggleShowPlan, searchId},
      ]},
      showPlan,
      {c: "search-headers", children: headers},
      {c: "search-results", children: resultItems},
//       randomlyLetter(`I found ${resultItems.length} results.`),
      {c: "", children: actions},
      {c: "add-action", children: addActionChildren}
    ]};
  }

  function toggleShowPlan(e, elem) {
    app.dispatch("toggleShowPlan", {searchId: elem.searchId}).commit();
  }

  function startDragging(e, elem) {
    if(e.target === e.currentTarget) {
      app.dispatch("startDragging", {searchId: elem.searchId, x: e.clientX, y: e.clientY}).commit();
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

  function commitArticle(cm, elem) {
    app.dispatch("stopEditingArticle", {searchId: elem.searchId, page: elem.page, value: cm.getValue()}).commit();
  }

  function editArticle(e, elem) {
    app.dispatch("startEditingArticle", {searchId: elem.searchId, page: elem.page}).commit();
    e.preventDefault();
  }

  function followLink(e, elem) {
    app.dispatch("setSearch", {value: elem.linkText, searchId: elem.searchId}).commit();
  }

  function first2Letters(str) {
    let items = str.split(" ");
    let text = "";
    if(items.length > 1) {
      text = items[0][0] + items[1][0];
    } else if(items.length) {
      text = items[0].substring(0, 2);
    }
    return text;
  }

  function historyStack() {
    let stack = eve.find("history stack");
    stack.sort((a, b) => a.pos - b.pos);
    let stackItems = stack.map((item) => {
      let link = item["page"];
      let text = first2Letters(link);
      return {c: "link", text, linkText: link, click: followLink};
    });
    return {c: "history-stack", children: stackItems};
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
    diff.add("action mapping", {action, from: "page", "to source": action, "to field": field});
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

  function addEavAction(name, entity, attribute, field) {
    let diff = eve.diff();
    // add an action
    let action = `${name}|${entity}|${attribute}|${field}`;
    diff.add("add eav action", {view: name, action, entity, attribute, field,});
    diff.add("action", {view: "added eavs", action, kind: "union", ix: 1});
    // a source
    diff.add("action source", {action, "source view": name});
    // a mapping
    diff.add("action mapping", {action, from: "page", "to source": action, "to field": entity});
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

  function addBitAction(name, template, query) {
    console.log(name, template, query);
    let diff = eve.diff();
    let names = Object.keys(query.projectionMap);
    // add an action
    let bitQueryId = `${name}|bit`;
    let action = `${name}|${template}`;
    diff.add("add bit action", {view: name, action, template});
    diff.remove("add bit action", {view: name});
    let bitQuery = eve.query(bitQueryId)
                   .select("add bit action", {view: name}, "action")
                   .select(name, {}, "table")
                   .calculate("bit template", {row: ["table"], name, template: ["action", "template"]}, "result")
                   .project({page: ["result", "page"], content: ["result", "content"]});
    diff.merge(queryObjectToDiff(bitQuery));
    diff.merge(removeView(bitQueryId));
    diff.add("action", {view: "added bits", action, kind: "union", ix: 1});
    // a source
    diff.add("action source", {action, "source view": bitQueryId});
    // a mapping
    diff.add("action mapping", {action, from: "page", "to source": action, "to field": "page"});
    diff.add("action mapping", {action, from: "content", "to source": action, "to field": "content"});
    diff.add("action mapping constant", {action, from: "source view", value: name});
    return diff;
  }

  export function removeView(view) {
    let diff = eve.diff();
    diff.remove("view", {view});
    for(let actionItem of eve.find("action", {view})) {
      let action = actionItem.action;
      diff.remove("action", {action});
      diff.remove("action source", {action});
      diff.remove("action mapping", {action});
      diff.remove("action mapping constant", {action});
      diff.remove("action mapping sorted", {action});
      diff.remove("action mapping limit", {action});
    }
    return diff;
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
  // AST and compiler
  //---------------------------------------------------------

  // view: view, kind[union|query]
  // action: view, action, kind[select|calculate|project|union|ununion|stateful|limit|sort|group|aggregate], ix
  // action source: action, source view
  // action mapping: action, from, to source, to field
  // action mapping constant: action, from, value

  var recompileTrigger = {
    exec: () => {
      for(let view of eve.find("view")) {
        let query = compile(eve, view["view"]);
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

  function mappingToDiff(diff, action, mapping, aliases, reverseLookup) {
    for(let from in mapping) {
      let to = mapping[from];
      if(to.constructor === Array) {
        let source = to[0];
        if(typeof source === "number") {
          source = aliases[reverseLookup[source]];
        } else {
          source = aliases[source];
        }
        diff.add("action mapping", {action, from, "to source": source, "to field": to[1]});
      } else {
        diff.add("action mapping constant", {action, from, value: to});
      }
    }
    return diff;
  }

  function queryObjectToDiff(query) {
    let diff = eve.diff();
    let aliases = {};
    let reverseLookup = {};
    for(let alias in query.aliases) {
      reverseLookup[query.aliases[alias]] = alias;
    }
    let view = query.name;
    diff.add("view", {view, kind: "query"});
    //joins
    for(let join of query.joins) {
      let action = uuid();
      aliases[join.as] = action;
      if(!join.negated) {
        diff.add("action", {view, action, kind: "select", ix: join.ix});
      } else {
        diff.add("action", {view, action, kind: "deselect", ix: join.ix});
      }
      diff.add("action source", {action, "source view": join.table});
      mappingToDiff(diff, action, join.join, aliases, reverseLookup);
    }
    //functions
    for(let func of query.funcs) {
      let action = uuid();
      aliases[func.as] = action;
      diff.add("action", {view, action, kind: "calculate", ix: func.ix});
      diff.add("action source", {action, "source view": func.name});
      mappingToDiff(diff, action, func.args, aliases, reverseLookup);
    }
    //aggregates
    for(let agg of query.aggregates) {
      let action = uuid();
      aliases[agg.as] = action;
      diff.add("action", {view, action, kind: "aggregate", ix: agg.ix});
      diff.add("action source", {action, "source view": agg.name});
      mappingToDiff(diff, action, agg.args, aliases, reverseLookup);
    }
    //sort
    if(query.sorts) {
      let action = uuid();
      diff.add("action", {view, action, kind: "sort", ix: Number.MAX_SAFE_INTEGER});
      let ix = 0;
      for(let sort of query.sorts) {
        let [source, field, direction] = sort;
        if(typeof source === "number") {
          source = aliases[reverseLookup[source]];
        } else {
          source = aliases[source];
        }
        diff.add("action mapping sorted", {action, ix, source, field, direction});
        ix++;
      }
    }
    //group
    if(query.groups) {
      let action = uuid();
      diff.add("action", {view, action, kind: "group", ix: Number.MAX_SAFE_INTEGER});
      let ix = 0;
      for(let group of query.groups) {
        let [source, field] = group;
        if(typeof source === "number") {
          source = aliases[reverseLookup[source]];
        } else {
          source = aliases[source];
        }
        diff.add("action mapping sorted", {action, ix, source, field, direction: "ascending"});
        ix++;
      }
    }
    //limit
    if(query.limitInfo) {
      let action = uuid();
      diff.add("action", {view, action, kind: "limit", ix: Number.MAX_SAFE_INTEGER});
      for(let limitType in query.limitInfo) {
        diff.add("action mapping limit", {action, "limit type": limitType, value: query.limitInfo[limitType]});
      }
    }
    //projection
    if(query.projectionMap) {
      let action = uuid();
      diff.add("action", {view, action, kind: "project", ix: Number.MAX_SAFE_INTEGER});
      mappingToDiff(diff, action, query.projectionMap, aliases, reverseLookup);
    }
    return diff;
  }

  // add the added collections union so that sources can be added to it by
  // actions.
  var diff = eve.diff();
  diff.add("view", {view: "added collections", kind: "union"});
  diff.add("view", {view: "added eavs", kind: "union"});
  diff.add("view", {view: "added bits", kind: "union"});
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

  runtime.define("page to graph", {multi: true}, function(page, text) {
    return articleToGraph(page, text);
  });

  runtime.define("parse eavs", {multi: true}, function(page, text) {
    return parsePage(page, text).eavs;
  });

  runtime.define("bit template", {multi: true}, function(row, name, template) {
    let content = template;
    for(let key in row) {
      let item = row[key];
      content = content.replace(new RegExp(`{${key}}`, "gi"), item);
    }
    let page;
    let header = content.match(/#.*$/mgi);
    if(header) {
      page = header[0].replace("#", "").toLowerCase().trim();
    } else {
      let rowId = eve.table(name).stringify(row);
      page = `${name}|${rowId}`;
    }
    return [{page, content}];
  });

  runtime.define("count", {}, function(prev) {
    if(!prev.count) {
      prev.count = 0;
    }
    prev.count++;
    return prev;
  });

  runtime.define("sum", {}, function(prev, value) {
    if(!prev.sum) {
      prev.sum = 0;
    }
    prev.sum += value;
    return prev;
  });

  runtime.define("average", {}, function(prev, value) {
    if(!prev.sum) {
      prev.sum = 0;
      prev.count = 0;
    }
    prev.count++;
    prev.sum += value;
    prev.average = prev.sum / prev.count;
    return prev;
  });

  runtime.define("=", {filter: true}, function(a, b) {
    return a === b ? runtime.SUCCEED : runtime.FAIL;
  });

  runtime.define(">", {filter: true}, function(a, b) {
    return a > b ? runtime.SUCCEED : runtime.FAIL;
  });

  runtime.define("<", {filter: true}, function(a, b) {
    return a < b ? runtime.SUCCEED : runtime.FAIL;
  });

  runtime.define(">=", {filter: true}, function(a, b) {
    return a >= b ? runtime.SUCCEED : runtime.FAIL;
  });

  runtime.define("<=", {filter: true}, function(a, b) {
    return a <= b ? runtime.SUCCEED : runtime.FAIL;
  });

  runtime.define("+", {}, function(a, b) {
    return {result: a + b};
  });

  runtime.define("-", {}, function(a, b) {
    return {result: a - b};
  });

  runtime.define("*", {}, function(a, b) {
    return {result: a * b};
  });

  runtime.define("/", {}, function(a, b) {
    return {result: a / b};
  });

  //---------------------------------------------------------
  // Queries
  //---------------------------------------------------------

  eve.asView(eve.union("page")
                .union("manual page", {page: ["page"], content: ["content"]})
                .union("unmodified added bits", {page: ["page"], content: ["content"]}));

  eve.asView(eve.query("unmodified added bits")
                .select("added bits", {}, "added")
                .deselect("manual page", {page: ["added", "page"]})
                .project({page: ["added", "page"], content: ["added", "content"]}));

  eve.asView(eve.query("page links")
             .select("page", {}, "page")
             .calculate("page to graph", {text: ["page", "content"], page: ["page", "page"]}, "links")
             .project({page: ["page", "page"], link: ["links", "link"], type: ["links", "type"]}));

  eve.asView(eve.union("directionless links")
                .union("page links", {page: ["page"], link: ["link"]})
                .union("page links", {page: ["link"], link: ["page"]}));

  eve.asView(eve.query("active page incoming")
             .select("active page", {}, "active")
             .select("page links", {link: ["active", "page"]}, "links")
             .project({page: ["links", "page"], link: ["links", "link"], type: ["links", "type"]}));

  eve.asView(eve.query("collection links")
             .select("page links", {type: "collection"}, "links")
             .project({page: ["links", "page"], collection: ["links", "link"]}));

  eve.asView(eve.query("parsed eavs")
             .select("page", {}, "page")
             .calculate("parse eavs", {page: ["page", "page"], text: ["page", "content"]}, "parsed")
             .project({page: ["page", "page"], attribute: ["parsed", "attribute"], value: ["parsed", "value"]}));

  eve.asView(eve.union("page eavs")
             .union("parsed eavs", {page: ["page"], attribute: ["attribute"], value: ["value"]})
             // this is a stored union that is used by the add eav action to take query results and
             // push them into eavs, e.g. sum salaries per department -> [total salary = *]
             .union("added eavs", {page: ["page"], attribute: ["attribute"], value: ["value"]}));

  eve.asView(eve.union("collection pages")
             // the rest of these are editor-level views
             .union("collection links", {page: ["page"], collection: ["collection"]})
             .union("history stack", {page: ["page"], collection: "history"})
             .union("page links", {page: ["link"], collection: ["type"]})
             // this is a stored union that is used by the add to collection action to take query results and
             // push them into collections, e.g. people older than 21 -> [[can drink]]
             .union("added collections", {page: ["page"], collection: ["collection"]}));

  eve.asView(eve.union("entity")
             .union("page", {entity: ["page"]}));

  eve.asView(eve.query("collection")
             .select("collection pages", {}, "collections")
             .group([["collections", "collection"]])
             .aggregate("count", {}, "count")
             .project({collection: ["collections", "collection"], count: ["count", "count"]}));

  //---------------------------------------------------------
  // Go
  //---------------------------------------------------------

  function initEve() {
    let stored = localStorage["eve"];
    if(!stored) {
      var diff = eve.diff();
      diff.add("manual page", {page: "foo", content: "[pixar] movies:\n[up]\n[toy story]"});
      diff.add("manual page", {page: "pixar", content: "[Pixar] is an animation studio owned by disney"});
      let id = uuid();
      diff.add("search", {id, top: 100, left: 100});
      diff.add("search query", {id, search: "foo"});
      eve.applyDiff(diff);
    } else {
      eve.load(stored);
    }
    for(let search of eve.find("search")) {
      app.activeSearches[search.id] = newSearch(eve.findOne("search query", {id: search.id})["search"]);
    }
    // compile all stored views
    for(let view of eve.find("view")) {
      let query = compile(eve, view["view"]);
      eve.asView(query);
    }
  }

  app.renderRoots["wiki"] = root;
  app.init("wiki", function() {
    app.activeSearches = {};
    initEve();
  });

}