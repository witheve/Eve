import * as microReact from "./microReact";
import * as runtime from "./runtime";
import {eve} from "./app";
import * as app from "./app";

declare var pluralize;
declare var uuid;

window["eve"] = eve;

//---------------------------------------------------------
// Token types
//---------------------------------------------------------

export enum TokenTypes {
  ENTITY,
  COLLECTION,
  ATTRIBUTE,
  MODIFIER,
  PATTERN,
  VALUE,
  TEXT,
}

//---------------------------------------------------------
// Modifiers
//---------------------------------------------------------

var modifiers = {
  "and": {and: true},
  "or": {or: true},
  "without": {deselected: true},
  "aren't": {deselected: true},
  "don't": {deselected: true},
  "not": {deselected: true},
  "isn't": {deselected: true},
  "per": {group: true},
  ",": {separator: true},
  "all": {every: true},
  "every": {every: true},
};

//---------------------------------------------------------
// Patterns
//---------------------------------------------------------

var patterns = {
  "older": {
    type: "rewrite",
    rewrites: [{attribute: "age", text: "age >"}],
  },
  "younger": {
    type: "rewrite",
    rewrites: [{attribute: "age", text: "age <"}],
  },
  "cheaper": {
    type: "rewrite",
    rewrites: [{attribute: "price", text: "price <"}, {attribute: "cost", text: "cost <"}]
  },
  "greater than": {
    type: "rewrite",
    rewrites: [{text: ">"}],
  },
  "years old": {
    type: "rewrite",
    rewrites: [{attribute: "age", text: "age"}],
  },
  "sum" :{
    type: "aggregate",
    op: "sum",
    args: ["a"],
  },
  "average" :{
    type: "aggregate",
    op: "average",
    args: ["a"],
  },
  "top": {
    type: "sort and limit",
    resultingIndirectObject: 1,
    direction: "descending",
    args: ["limit", "attribute"],
  },
  "<": {
    type: "filter",
    op: "<",
    infix: true,
    resultingIndirectObject: 0,
    args: ["a", "b"],
  },
  ">": {
    type: "filter",
    op: ">",
    infix: true,
    resultingIndirectObject: 0,
    args: ["a", "b"],
  },
  "=": {
    type: "filter",
    op: "=",
    infix: true,
    resultingIndirectObject: 0,
    args: ["a", "b"],
  },
  "+": {
    type: "calculate",
    op: "+",
    infix: true,
    resultingIndirectObject: 0,
    args: ["a", "b"],
  },
  "-": {
    type: "calculate",
    op: "+",
    infix: true,
    resultingIndirectObject: 0,
    args: ["a", "b"],
  },
  "*": {
    type: "calculate",
    op: "+",
    infix: true,
    resultingIndirectObject: 0,
    args: ["a", "b"],
  },
  "/": {
    type: "calculate",
    op: "+",
    infix: true,
    resultingIndirectObject: 0,
    args: ["a", "b"],
  }
};

//---------------------------------------------------------
// Tokenizer
//---------------------------------------------------------

function checkForToken(token): any {
  var found;
  if(!token) return {};
  if(found = eve.findOne("collection", {collection: token})) {
    return {found, type: TokenTypes.COLLECTION};
  } else if(found = eve.findOne("entity", {entity: token})) {
    return {found, type: TokenTypes.ENTITY};
  } else if(found = eve.findOne("entity eavs", {attribute: token})) {
    return {found, type: TokenTypes.ATTRIBUTE};
  } else if(found = modifiers[token]) {
    return {found, type: TokenTypes.MODIFIER};
  } else if(found = patterns[token]) {
    return {found, type: TokenTypes.PATTERN};
  } else if(token.match(/^-?[\d]+$/gm)) {
    return {type: TokenTypes.VALUE, found: JSON.parse(token), valueType: "number"};
  } else if(token.match(/^["][^"]*["]$/gm)) {
    return {type: TokenTypes.VALUE, found: JSON.parse(token), valueType: "string"};
  } else if(found = token.match(/^([\d]+)-([\d]+)$/gm)) {
    return {type: TokenTypes.VALUE, found: token, valueType: "range", start: found[1], stop: found[2]};
  }
  return {};
}

export function getTokens(string) {
  // remove all non-word non-space characters
  let cleaned = string.replace(/'s/gi, "  ").toLowerCase();
  cleaned = cleaned.replace(/[,.?!]/gi, " , ");
  let words = cleaned.split(" ");
  let front = 0;
  let back = words.length;
  let results = [];
  let pos = 0;
  while(front < words.length) {
    let str = words.slice(front, back).join(" ");
    let orig = str;
    var {found, type} = checkForToken(str);
    if(!found) {
      str = pluralize(str, 1);
      var {found, type} = checkForToken(str);
      if(!found) {
        str = pluralize(str, 2);
        var {found, type} = checkForToken(str);
      }
    }
    if(found) {
      results.push({found: str, orig, pos, type, info: found, id: uuid(), children: []});
      front = back;
      pos += orig.length + 1;
      back = words.length;
    } else if(back - 1 > front) {
      back--;
    } else {
      if(orig) {
        results.push({found: orig, orig, pos, type: TokenTypes.TEXT});
      }
      back = words.length;
      pos += words[front].length + 1;
      front++;
    }
  }
  return results;
}

//---------------------------------------------------------
// Relationships between tokens
//---------------------------------------------------------

enum RelationshipTypes {
  NONE,
  ENTITY_ENTITY,
  ENTITY_ATTRIBUTE,
  COLLECTION_COLLECTION,
  COLLECTION_INTERSECTION,
  COLLECTION_ENTITY,
  COLLECTION_ATTRIBUTE,
}

var tokenRelationships = {
  [TokenTypes.COLLECTION]: {
    [TokenTypes.COLLECTION]: findCollectionToCollectionRelationship,
    [TokenTypes.ENTITY]: findCollectionToEntRelationship,
    [TokenTypes.ATTRIBUTE]: findCollectionToAttrRelationship,
  },
  [TokenTypes.ENTITY]: {
    [TokenTypes.ENTITY]: findEntToEntRelationship,
    [TokenTypes.ATTRIBUTE]: findEntToAttrRelationship,
  },
}

function determineRelationship(parent, child) {
  if(!tokenRelationships[parent.type] || !tokenRelationships[parent.type][child.type]) return {distance: Infinity, type: RelationshipTypes.NONE};
  return tokenRelationships[parent.type][child.type](parent.found, child.found);
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

function findEntToEntRelationship(ent, ent2) {
  return {distance: Infinity, type: RelationshipTypes.ENTITY_ENTITY};
}

// e.g. "salaries in engineering"
// e.g. "chris's age"
function findEntToAttrRelationship(ent, attr):any {
  // check if this ent has that attr
  let directAttribute = eve.findOne("entity eavs", {entity: ent, attribute: attr});
  if(directAttribute) {
    return {distance: 0, type: RelationshipTypes.ENTITY_ATTRIBUTE};
  }
  let relationships = eve.query(``)
                .select("entity links", {entity: ent}, "links")
                .select("entity eavs", {entity: ["links", "link"], attribute: attr}, "eav")
                .exec();
  if(relationships.unprojected.length) {
    let entities = extractFromUnprojected(relationships.unprojected, 0, "link", 2);
    return {distance: 1, type: RelationshipTypes.ENTITY_ATTRIBUTE, nodes: [findCommonCollections(entities)]};
  }
  let relationships2 = eve.query(``)
                .select("entity links", {entity: ent}, "links")
                .select("entity links", {entity: ["links", "link"]}, "links2")
                .select("entity eavs", {entity: ["links2", "link"], attribute: attr}, "eav")
                .exec();
  if(relationships2.unprojected.length) {
    let entities = extractFromUnprojected(relationships2.unprojected, 0, "link", 3);
    let entities2 = extractFromUnprojected(relationships2.unprojected, 1, "link", 3);
    return {distance: 2, type: RelationshipTypes.ENTITY_ATTRIBUTE, nodes: [findCommonCollections(entities), findCommonCollections(entities2)]};
  }

  //otherwise we assume it's direct and mark it as unfound.
  return {distance: 0, type: RelationshipTypes.ENTITY_ATTRIBUTE, unfound: true};
}

// e.g. "salaries per department"
function findCollectionToAttrRelationship(coll, attr) {
  let direct = eve.query(``)
                .select("collection entities", {collection: coll}, "collection")
                .select("entity eavs", {entity: ["collection", "entity"], attribute: attr}, "eav")
                .exec();
  if(direct.unprojected.length) {
    return {distance: 0, type: RelationshipTypes.COLLECTION_ATTRIBUTE, nodes: []};
  }
  let relationships = eve.query(``)
                .select("collection entities", {collection: coll}, "collection")
                .select("directionless links", {entity: ["collection", "entity"]}, "links")
                .select("entity eavs", {entity: ["links", "link"], attribute: attr}, "eav")
                .exec();
  if(relationships.unprojected.length) {
    let entities = extractFromUnprojected(relationships.unprojected, 1, "link", 3);
    return {distance: 1, type: RelationshipTypes.COLLECTION_ATTRIBUTE, nodes: [findCommonCollections(entities)]};
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
    return {distance: 2, type: RelationshipTypes.COLLECTION_ATTRIBUTE, nodes: [findCommonCollections(entities), findCommonCollections(entities2)]};
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
    return {distance: 0, type: RelationshipTypes.COLLECTION_ENTITY, nodes: []};
  }
  let relationships = eve.query(``)
                .select("collection entities", {collection: coll}, "collection")
                .select("directionless links", {entity: ["collection", "entity"], link: ent}, "links")
                .exec();
  if(relationships.unprojected.length) {
    return {distance: 1, type: RelationshipTypes.COLLECTION_ENTITY, nodes: []};
  }
  // e.g. events with chris granger (events -> meetings -> chris granger)
  let relationships2 = eve.query(``)
                .select("collection entities", {collection: coll}, "collection")
                .select("directionless links", {entity: ["collection", "entity"]}, "links")
                .select("directionless links", {entity: ["links", "link"], link: ent}, "links2")
                .exec();
  if(relationships2.unprojected.length) {
    let entities = extractFromUnprojected(relationships2.unprojected, 1, "link", 3);
    return {distance: 2, type: RelationshipTypes.COLLECTION_ENTITY, nodes: [findCommonCollections(entities)]};
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
    return {distance: 1, type: RelationshipTypes.COLLECTION_COLLECTION};
  } else if(intersectionSize > maxRel.count) {
    return {distance: 0, type: RelationshipTypes.COLLECTION_INTERSECTION};
  } else if(maxRel.count === 0 && intersectionSize === 0) {
    return;
  } else {
    return {distance: 1, type: RelationshipTypes.COLLECTION_COLLECTION};
  }
}

//---------------------------------------------------------
// Token tree
//---------------------------------------------------------

function tokensToTree(origTokens) {
  let tokens = origTokens;
  let roots = [];
  let operations = [];
  let groups = [];
  // Find the direct object
  // The direct object is the first collection we find, or if there are none,
  // the first entity, or finally the first attribute.
  let directObject;
  for(let token of tokens) {
    if(token.type === TokenTypes.COLLECTION) {
      directObject = token;
      break;
    } else if(token.type === TokenTypes.ENTITY) {
      directObject = token;
    } else if(token.type === TokenTypes.ATTRIBUTE && !directObject) {
      directObject = token;
    }
  }

  let tree = {directObject, roots, operations, groups};
  if(!directObject) return tree;

  // the direct object is always the first root
  roots.push(directObject);
  // we need to keep state as we traverse the tokens for modifiers and patterns
  let state = {patternStack: [], currentPattern: null, lastAttribute: null};
  // as we parse the query we may encounter other subjects in the sentence, we
  // need a reference to those previous subjects to see if the current token is
  // related to that or the directObject
  let indirectObject = directObject;

  for(let tokenIx = 0, len = tokens.length; tokenIx < len; tokenIx++) {
    let token = tokens[tokenIx];
    let {type, info, found} = token;

    // check if the last pass finshed our current pattern.
    if(state.currentPattern && state.currentPattern.args.length) {
      let args = state.currentPattern.args;
      let infoArgs = state.currentPattern.info.args;
      let latestArg = args[args.length - 1];
      let latestArgComplete = latestArg.type === TokenTypes.ATTRIBUTE || latestArg.type === TokenTypes.VALUE;
      while(args.length === infoArgs.length && latestArgComplete) {
        let {resultingIndirectObject} = state.currentPattern.info;
        if(resultingIndirectObject !== undefined) {
          indirectObject = args[resultingIndirectObject];
        } else {
          indirectObject = state.currentPattern;
        }
        state.currentPattern = state.patternStack.pop();
        if(!state.currentPattern) break;
        args = state.currentPattern.args;
        infoArgs = state.currentPattern.info.args;
        args.push(indirectObject);
        latestArg = args[args.length - 1];
        latestArgComplete = latestArg.type === TokenTypes.ATTRIBUTE || latestArg.type === TokenTypes.VALUE;
      }
    }

    // deal with modifiers
    if(type === TokenTypes.MODIFIER) {
      // if this is a deselect modifier, we need to roll forward through the tokens
      // to figure out roughly how far the deselection should go. Also if we run into
      // an and or an or, we need to deal with that specially.
      if(info.deselected) {
        // we're going to move forward from this token and deselect as we go
        let localTokenIx = tokenIx + 1;
        // get to the first non-text token
        while(localTokenIx < len && tokens[localTokenIx].type === TokenTypes.TEXT) {
          localTokenIx++;
        }
        // negate until we find a reason to stop
        while(localTokenIx < len) {
          let localToken = tokens[localTokenIx];
          if(localToken.type === TokenTypes.TEXT) {
            break;
          }
          localToken.deselected = true;
          localTokenIx++;
        }
      }
      // if we're dealing with an "or" we have two cases, we're either dealing with a negation
      // or a split. If this is a deselected or, we don't really need to do anything because that
      // means we just do a deselected join. If it's not negated though, we're now dealing with
      // a second query context. e.g. people who are employees or spouses of employees
      if(info.or && !token.deslected) {
        let localTokenIx = tokenIx + 1;
        // get to the first non-text token
        while(localTokenIx < len && tokens[localTokenIx].type === TokenTypes.TEXT) {
          localTokenIx++;
        }
        // consume until we hit a separator
        while(localTokenIx < len) {
          let localToken = tokens[localTokenIx];
          if(localToken.type === TokenTypes.TEXT) {
            break;
          }
          localTokenIx++;
        }
      }
      // a group adds a group for the next collection and checks to see if there's an and
      // or a separator that would indicate multiple groupings
      if(info.group) {
        // we're going to move forward from this token and deselect as we go
        let localTokenIx = tokenIx + 1;
        // get to the first non-text token
        while(localTokenIx < len && tokens[localTokenIx].type === TokenTypes.TEXT) {
          localTokenIx++;
        }
        // if we've run out of tokens, bail
        if(localTokenIx === len) break;
        // otherwise, the next thing we found is what we're trying to group by
        let localToken = tokens[localTokenIx];
        localToken.grouped = true;
        groups.push(localToken);
        localTokenIx++;
        // now we have to check if we're trying to group by multiple things, e.g.
        // "per department and age" or "per department, team, and age"
        let next = tokens[localTokenIx];
        while(next && next.type === TokenTypes.MODIFIER && (next.info.separator || next.info.and)) {
          localTokenIx++;
          next = tokens[localTokenIx];
          // if we have another modifier directly after (e.g. ", and") loop again
          // to see if this is valid.
          if(next && next.type === TokenTypes.MODIFIER) {
            continue;
          }
          next.grouped = true;
          groups.push(next);
          localTokenIx++;
          next = tokens[localTokenIx];
        }
      }
      continue;
    }
    // deal with patterns
    if(type === TokenTypes.PATTERN) {
      if(info.type === "rewrite") {
        let newText;
        // if we only have one possible rewrite, we can just take it
        if(info.rewrites.length === 1) {
          newText = info.rewrites[0].text;
        } else {
          // @TODO: we have to go through every possibility and deal with it
          newText = info.rewrites[0].text;
        }
        // Tokenize the new string
        let newTokens = getTokens(newText);
        // Splice in the new tokens, adjust the length and make sure we revisit this token.
        len += newTokens.length;
        tokens.splice.apply(tokens, [tokenIx+1, 0].concat(newTokens));
        // apply any deselects, or's, or and's to this token
        for(let newToken of newTokens) {
          newToken.deselected = token.deselected;
          newToken.and = token.and;
          newToken.or = token.or;
        }
        continue;
      } else {
        // otherwise it's an operation of some kind
        operations.push(token);
        // keep track of any other patterns we're trying to fill right now
        if(state.currentPattern) {
          state.patternStack.push(state.currentPattern);
        }
        state.currentPattern = token;
        state.currentPattern.args = [];
      }
      if(info.infix) {
        state.currentPattern.args.push(indirectObject);
      }
      continue;
    }

    // deal with values
    if(type === TokenTypes.VALUE) {
      // if we still have a currentPattern to fill
      if(state.currentPattern && state.currentPattern.args.length < state.currentPattern.info.args.length) {
        state.currentPattern.args.push(token);
      }
      continue;
    }

    //We don't do anything with text nodes at this point
    if(type === TokenTypes.TEXT) continue;

    // once modifiers and patterns have been applied, we don't need to worry
    // about the directObject as it's already been asigned to the first root.
    if(directObject === token) {
      indirectObject = directObject;
      continue;
    }

    if(directObject === indirectObject) {
      directObject.children.push(token);
      token.relationship = determineRelationship(directObject, token);
      token.parent = directObject;
      indirectObject = token;
    } else {
      let potentialParent = indirectObject;
      // if our indirect object is an attribute and we encounter another one, we want to check
      // the parent of this node for a match
      if(indirectObject.type === TokenTypes.ATTRIBUTE && token.type === TokenTypes.ATTRIBUTE) {
        potentialParent = indirectObject.parent;
      }
      // if the indirect object is an attribute, anything other than another attribute will create
      // a new root
      if(indirectObject.type === TokenTypes.ATTRIBUTE && token.type !== TokenTypes.ATTRIBUTE) {
        let rootRel = determineRelationship(directObject, token);
        if(!rootRel || (rootRel.distance === 0 && token.type === TokenTypes.ENTITY)) {
          indirectObject = token;
          roots.push(indirectObject);
        } else {
          directObject.children.push(token);
          token.relationship = rootRel;
          token.parent = directObject;
        }
      }
      // the only valid child of an entity is an attribute, if the parent is an entity and
      // the child is not an attribute, then this must be related to the directObject
      else if(potentialParent.type === TokenTypes.ENTITY && token.type !== TokenTypes.ATTRIBUTE) {
        directObject.children.push(token);
        token.relationship = determineRelationship(directObject, token);
        token.parent = directObject;
        indirectObject = token;
      }
      else {
        let cursorRel = determineRelationship(potentialParent, token);
        let rootRel = determineRelationship(directObject, token);
        // if this token is an entity and either the directObject or indirectObject has a direct relationship
        // we don't really want to use that as it's most likely meant to filter a set down
        // instead of reduce the set to exactly one member.
        if(token.type === TokenTypes.ENTITY) {
          if(cursorRel && cursorRel.distance === 0) cursorRel = null;
          if(rootRel && rootRel.distance === 0) rootRel = null;
        }
        if(!cursorRel) {
          directObject.children.push(token);
          token.relationship = rootRel;
          token.parent = directObject;
        } else if(!rootRel) {
          potentialParent.children.push(token);
          token.relationship = cursorRel;
          token.parent = potentialParent;
        } else if(cursorRel.distance <= rootRel.distance) {
          potentialParent.children.push(token);
          token.relationship = cursorRel;
          token.parent = potentialParent;
        } else {
          // @TODO: maybe if there's a cursorRel we should just always ignore the rootRel even if it
          // is a "better" relationship. Sentence structure-wise it seems pretty likely that attributes
          // following an entity are related to that entity and not something else.
          directObject.children.push(token);
          token.relationship = rootRel;
          token.parent = directObject;
        }
        indirectObject = token;
      }
    }

    // if we are still looking to fill in a pattern
    if(state.currentPattern) {
      let args = state.currentPattern.args;
      let infoArgs = state.currentPattern.info.args;
      let latestArg = args[args.length - 1];
      let latestArgComplete = !latestArg || latestArg.type === TokenTypes.ATTRIBUTE || latestArg.type === TokenTypes.VALUE;
      let firstArg = args[0];
      if(!latestArgComplete && indirectObject.type === TokenTypes.ATTRIBUTE) {
        args.pop();
        args.push(indirectObject);
      } else if(latestArgComplete && args.length < infoArgs.length) {
          args.push(indirectObject);
          latestArg = indirectObject;
      }
    }
  }
  // if we've run out of tokens and are still looking to fill in a pattern,
  // we might need to carry the attribute through.
  if(state.currentPattern && state.currentPattern.args.length) {
    let args = state.currentPattern.args;
    let infoArgs = state.currentPattern.info.args;
    let latestArg = args[args.length - 1];
    let latestArgComplete = latestArg.type === TokenTypes.ATTRIBUTE || latestArg.type === TokenTypes.VALUE;
    let firstArg = args[0];
    // e.g. people older than chris granger => people age > chris granger age
    if(!latestArgComplete && firstArg && firstArg.type === TokenTypes.ATTRIBUTE) {
      let newArg:any = {type: firstArg.type, found: firstArg.found, orig: firstArg.orig, info: firstArg.info, id: uuid(), children: []};
      let cursorRel = determineRelationship(latestArg, newArg);
      newArg.relationship = cursorRel;
      newArg.parent = latestArg;
      latestArg.children.push(newArg);
      args.pop();
      args.push(newArg);
    }
  }
  return tree;
}

//---------------------------------------------------------
// Query plans
//---------------------------------------------------------

enum StepType {
  FIND,
  GATHER,
  LOOKUP,
  FILTERBYENTITY,
  INTERSECT,
  CALCULATE,
  AGGREGATE,
  FILTER,
  SORT,
  LIMIT,
  GROUP,
}

function ignoreHiddenCollections(colls) {
  for(let coll of colls) {
    if(coll !== "generic related to") {
      return coll;
    }
  }
}

function nodeToPlanSteps(node, parent, parentPlan) {
  //TODO: figure out what to do with operations
  let id = node.id || uuid();
  let {deselected} = node;
  let rel = node.relationship;
  if(parent && rel) {
    switch(rel.type) {
      case RelationshipTypes.COLLECTION_ATTRIBUTE:
        var plan = [];
        var curParent = parentPlan;
        for(let node of rel.nodes) {
          let coll = ignoreHiddenCollections(node);
          let item = {type: StepType.GATHER, relatedTo: curParent, subject: coll, id: uuid()};
          plan.push(item);
          curParent = item;
        }
        plan.push({type: StepType.LOOKUP, relatedTo: curParent, subject: node.found, id, deselected});
        return plan;
        break;
      case RelationshipTypes.COLLECTION_ENTITY:
        var plan = [];
        var curParent = parentPlan;
        for(let node of rel.nodes) {
          let coll = ignoreHiddenCollections(node);
          let item = {type: StepType.GATHER, relatedTo: curParent, subject: coll, id: uuid()};
          plan.push(item);
          curParent = item;
        }
        plan.push({type: StepType.FILTERBYENTITY, relatedTo: curParent, subject: node.found, id, deselected});
        return plan;
        break;
      case RelationshipTypes.COLLECTION_COLLECTION:
        return [{type: StepType.GATHER, relatedTo: parentPlan, subject: node.found, id, deselected}];
        break;
      case RelationshipTypes.COLLECTION_INTERSECTION:
        return [{type: StepType.INTERSECT, relatedTo: parentPlan, subject: node.found, id, deselected}];
        break;
      case RelationshipTypes.ENTITY_ATTRIBUTE:
        if(rel.distance === 0) {
          return [{type: StepType.LOOKUP, relatedTo: parentPlan, subject: node.found, id, deselected}];
        } else {
          let plan = [];
          let curParent = parentPlan;
          for(let node of rel.nodes) {
            let coll = ignoreHiddenCollections(node);
            let item = {type: StepType.GATHER, relatedTo: curParent, subject: coll, id: uuid()};
            plan.push(item);
            curParent = item;
          }
          plan.push({type: StepType.LOOKUP, relatedTo: curParent, subject: node.found, id, deselected});
          return plan;
        }
        break;
    }
  } else {
    if(node.type === TokenTypes.COLLECTION) {
      return [{type: StepType.GATHER, subject: node.found, id, deselected}];
    } else if(node.type === TokenTypes.ENTITY) {
      return [{type: StepType.FIND, subject: node.found, id, deselected}];
    } else if(node.type === TokenTypes.ATTRIBUTE) {
      return [{type: StepType.LOOKUP, subject: node.found, id, deselected}];
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

/*enum PatternTypes {
  COLLECTION,
  ENTITY,
  ATTRIBUTE,
  VALUE,
  GROUP,
  AGGREGATE,
  SORTLIMIT,
  FILTER,
  REWRITE,
}*/

function groupsToPlan(nodes) {
  if(!nodes.length) return [];
  let groups = [];
  for(let node of nodes) {
    if(node.type === "collection") {
      groups.push([node.id, "entity"]);
    } else if(node.type === "attribute") {
      groups.push([node.id, "value"]);
    } else {
      throw new Error("Invalid node to group on: " + JSON.stringify(nodes));
    }
  }
  return [{type: "group", id: uuid(), groups, groupNodes: nodes}];
}

function opToPlan(op,groups): any {
  let info = op.info;
  let args = {};
  if(info.args) {
    let ix = 0;
    for(let arg of info.args) {
      let argValue = op.args[ix];
      if(argValue === undefined) continue;
      if(argValue.type === TokenTypes.VALUE) {
        args[arg] = JSON.parse(argValue.orig);
      } else if(argValue.type === TokenTypes.ATTRIBUTE) {
        args[arg] = [argValue.id, "value"];
      } else {
        console.error(`Invalid operation argument: ${argValue.orig} for ${op.found}`);
      }
      ix++;
    }
  }
  if(info.type === "aggregate") {
    return [{type: StepType.AGGREGATE, subject: info.op, args, id: uuid(), argArray: op.args}];
  } else if(info.type === "sort and limit") {
    var sortLimitArgs = op.args.map((arg) => arg.found);
    var sortField = {parent: op.args[1].parent.found , subject: op.args[1].found };
    var subject = "results";
    // If groups are formed, check if we are sorting on one of them
    for(var group of groups) {
      if(group.found === sortField.parent) {
        subject = "per group";
        break;
      }
    }
    var sortStep = {type: StepType.SORT, subject: subject, direction: info.direction, field: sortField, id: uuid()};
    var limitStep = {type: StepType.LIMIT, subject: subject, value: sortLimitArgs[0], id: uuid()};
    return [sortStep, limitStep];
  } else if(info.type === "filter") {
    return [{type: StepType.FILTER, subject: info.op, args, id: uuid(), argArray: op.args}];
  } else {
    return [{type: StepType.CALCULATE, subject: info.op, args, id: uuid(), argArray: op.args}];
  }
}

// Since intermediate plan steps can end up duplicated, we need to walk the plan to find
// nodes that are exactly the same and only do them once. E.g. salaries per department and age
// will bring in two employee gathers.
function dedupePlan(plan) {
  let dupes = {};
  // for every node in the plan backwards
  for(let planIx = plan.length - 1; planIx > -1; planIx--) {
    let step = plan[planIx];
    // check all preceding nodes for a node that is equivalent
    for(let dupeIx = planIx - 1; dupeIx > -1;  dupeIx--) {
      let dupe = plan[dupeIx];
      // equivalency requires the same type, subject, deselect, and parent
      if(step.type === dupe.type && step.subject === dupe.subject && step.deselected === dupe.deselected && step.relatedTo === dupe.relatedTo) {
        // store the dupe and what node will replace it
        dupes[step.id] = dupe.id;
      }
    }
  }
  return plan.filter((step) => {
    // remove anything we found to be a dupe
    if(dupes[step.id]) return false;
    // if this step references a dupe, relate it to the new node
    if(dupes[step.relatedTo]) {
      step.relatedTo = dupes[step.relatedTo];
    }
    return true;
  })
}

function treeToPlan(tree) : Plan {
  let plan: Step[] = [];
  for(let root of tree.roots) {
    plan = plan.concat(nodeToPlan(root));
  }
  plan = dedupePlan(plan);
  for(let group of tree.groups) {
    plan.push({type: StepType.GROUP, subject: group.found, subjectNode: group});
  }
  for(let op of tree.operations) {
    plan = plan.concat(opToPlan(op,tree.groups));
  }
  // Create a plan type for return
  let pplan: Plan = new Plan();
  pplan.valid = Validated.INVALID;
  for (let step of plan) {
    pplan.push(step);
  }

  return pplan;
}

//---------------------------------------------------------
// Validate queries
//---------------------------------------------------------

// Test the actualStep and expectedStep for equivalence
function validateStep(actualStep, expectedStep) : boolean {
  if(actualStep === undefined || actualStep.type !== expectedStep.type || actualStep.subject !== expectedStep.subject || actualStep.deselected !== expectedStep.deselected) {
    return false;
  }
  // Compare args
  if(expectedStep.args !== undefined) {
    let ix = 0;
    for(let exArg of expectedStep.args) {
      if(actualStep.argArray === undefined) {
        return false;
      }
      let arg = actualStep.argArray[ix];
      if(arg.found !== exArg.subject) {
        return false;
      }
      if(exArg.parent && (!arg.parent || arg.parent.found !== exArg.parent)) {
        return false;
      }
      ix++
    }
  }
  // Compare fields
  if((expectedStep.field !== undefined && actualStep.field !== undefined) &&
     (actualStep.field.parent !== expectedStep.field.parent || actualStep.field.subject !== expectedStep.field.subject)) {
    return false;
  }
  // Compare values
  if((expectedStep.value !== undefined && actualStep.value !== undefined) &&
     (actualStep.value !== expectedStep.value)) {
    return false;
  }
  return true;
}

// Test the actual plan and expected plan for equivalence.
// Equivelence here means the expected and actual plans have the same
// steps. Order of steps does not matter.
// Doesn't return anything, put adds a valid member to the plan and steps
function validatePlan(actualPlan: Plan, expectedPlan: Step[]) {
  let invalidSteps = actualPlan.length;
  // Loop through the steps of the actual plan and test it against candidate steps.
  // When a match is found, remove it from the canditate steps. Continue until all
  // actual steps are validated.
  // @TODO: remove matched steps
  for(let actualStep of actualPlan) {
    for(let expectedStep of expectedPlan) {
      console.log(`Plan length ${expectedPlan.length}`);
      if(validateStep(actualStep,expectedStep)) {
        actualStep.valid = Validated.VALID;
        invalidSteps--;
        break;
      }
      actualStep.valid = Validated.INVALID;
    }
  }
  // If every step is validated, the plan is valid
  if(invalidSteps === 0) {
    actualPlan.valid = Validated.VALID;
  } else {
    actualPlan.valid = Validated.INVALID;
  }
}

interface TestQuery {
  query: string;
  expected: Step[];
}

class Plan extends Array<Step> {
  valid: Validated;
}

interface Step {
  type: StepType;
  subject?: string;
  direction?: string;
  field?: any;
  value?: any;
  args?: any;
  deselected?: boolean;
  subjectNode?: any;
  valid?: Validated;
}

var tests: TestQuery[] = [
  /*
  {
    query: "chris granger's age",
    expectedPlan: [
      {type: StepType.FIND, subject: "chris granger"},
      {type: StepType.LOOKUP, subject: "age"}
    ],
  },
  "robert attorri's age": {
    expected: [
      {type: StepType.FIND, subject: "robert attorri"},
      {type: StepType.LOOKUP, subject: "age"}
    ]
  },
  "people older than chris granger": {
    expected: [
      {type: StepType.GATHER, subject: "person"},
      {type: StepType.LOOKUP, subject: "age"},
      {type: StepType.FIND, subject: "chris granger"},
      {type: StepType.LOOKUP, subject: "age"},
      {type: StepType.FILTER, subject: ">", args: [
        {parent: "person", subject: "age"},
        {parent: "chris granger", subject: "age"}
      ]}
    ]
  },
  "people whose age < 30": {
    expected: [
      {type: StepType.GATHER, subject: "person"},
      {type: StepType.LOOKUP, subject: "age"},
      {type: StepType.FILTER, subject: "<", args: [
        {parent: "person", subject: "age"},
        {subject: "30"}
      ]}
    ]
  },
  "people whose age < chris granger's age": {
    expected: [
      {type: StepType.GATHER, subject: "person"},
      {type: StepType.LOOKUP, subject: "age"},
      {type: StepType.FIND, subject: "chris granger"},
      {type: StepType.LOOKUP, subject: "age"},
      {type: StepType.FILTER, subject: "<", args: [
        {parent: "person", subject: "age"},
        {parent: "chris granger", subject: "age"}
      ]}
    ]
  },
  "people whose age < chris granger's": {
    expected: [
      {type: StepType.GATHER, subject: "person"},
      {type: StepType.LOOKUP, subject: "age"},
      {type: StepType.FIND, subject: "chris granger"},
      {type: StepType.LOOKUP, subject: "age"},
      {type: StepType.FILTER, subject: "<", args: [
        {parent: "person", subject: "age"},
        {parent: "chris granger", subject: "age"}
      ]}
    ]
  },

  "people older than chris granger and younger than edward norton": {

  },
  "people between 50 and 65 years old": {

  },
  "people whose age is between 50 and 65": {

  },
  "people who are 50-65 years old": {

  },
  "people older than chris granger's spouse": {

  },
  "people older than their spouse": {

  },
  "people who are either heads or spouses of heads": {

  },
  "people who have a hair color of red or black": {

  },
  "people who have neither attended a meeting nor had a one-on-one": {

  },
  "salaries per department": {
    expected: [
      {type: StepType.GATHER, subject: "department"},
      {type: StepType.GATHER, subject: "employee"},
      {type: StepType.LOOKUP, subject: "salary"},
      {type: StepType.GROUP, subject: "department"}
    ]
  },
  "salaries per department and age": {
    expected: [
      {type: StepType.GATHER, subject: "department"},
      {type: StepType.GATHER, subject: "employee"},
      {type: StepType.LOOKUP, subject: "salary"},
      {type: StepType.LOOKUP, subject: "age"},
      {type: StepType.GROUP, subject: "department"},
      {type: StepType.GROUP, subject: "age"}
    ]
  },
  "salaries per department, employee, and age": {
    expected: [
      {type: StepType.GATHER, subject: "department"},
      {type: StepType.GATHER, subject: "employee"},
      {type: StepType.LOOKUP, subject: "salary"},
      {type: StepType.LOOKUP, subject: "age"},
      {type: StepType.GROUP, subject: "department"},
      {type: StepType.GROUP, subject: "employee"},
      {type: StepType.GROUP, subject: "age"}
    ]
  },
  */
  {
    query: "sum of the salaries per department",
    expected: [
      {type: StepType.GATHER, subject: "department"},
      {type: StepType.GATHER, subject: "employee"},
      {type: StepType.LOOKUP, subject: "salary"},
      {type: StepType.GROUP, subject: "department"},
      {type: StepType.AGGREGATE, subject: "sum", args: [
        {parent: "department", subject: "salary"}
      ]}
    ]
  },
  {
    query: "average of the salaries per department",
    expected: [
      {type: StepType.GATHER, subject: "department"},
      {type: StepType.GATHER, subject: "employee"},
      {type: StepType.LOOKUP, subject: "salary"},
      {type: StepType.GROUP, subject: "department"},
      {type: StepType.AGGREGATE, subject: "average", args: [
        {parent: "department", subject: "salary"}
      ]}
    ]
  },
  {
    query: "top 2 employee salaries",
    expected: [
      {type: StepType.GATHER, subject: "employee"},
      {type: StepType.LOOKUP, subject: "salary"},
      {type: StepType.SORT, subject: "results", direction: "descending", field: {parent: "employee", subject: "salary"} },
      {type: StepType.LIMIT, subject: "results", value: "2"},
    ]
  },
  {
    query: "top 2 salaries per department",
    expected: [
      {type: StepType.GATHER, subject: "department"},
      {type: StepType.GATHER, subject: "employee"},
      {type: StepType.LOOKUP, subject: "salary"},
      {type: StepType.GROUP, subject: "department"},
      {type: StepType.SORT, subject: "per group", direction: "descending", field: {parent: "department", subject: "salary"} },
      {type: StepType.LIMIT, subject: "per group", value: "2"},
    ]
  },
  {
    query: "sum of the top 2 salaries per department",
    expected: [
      {type: StepType.GATHER, subject: "department"},
      {type: StepType.GATHER, subject: "employee"},
      {type: StepType.LOOKUP, subject: "salary"},
      {type: StepType.GROUP, subject: "department"},
      {type: StepType.SORT, subject: "per group", direction: "descending", field: {parent: "department", subject: "salary"} },
      {type: StepType.LIMIT, subject: "per group", value: "2"},
      {type: StepType.AGGREGATE, subject: "sum", args: [
        {parent: "department", subject: "salary"}
      ]}
    ]
  },
  /*
  {
    query: "top 2 salaries of the first 3 departments",
  },
  "departments where all the employees are male": {

  },
  "departments where all the employees are over-40 males": {

  },
  "employees whose sales are greater than their salary": {

  },
  "count employees and their spouses": {

  },
  "dishes with eggs and chicken": {
    expected: [
      {type: StepType.GATHER, subject: "dish"},
      {type: StepType.FILTERBYENTITY, subject: "egg"},
      {type: StepType.FILTERBYENTITY, subject: "chicken"}
    ]
  },
  "dishes with eggs or chicken": {

  },
  "dishes without eggs and chicken": {

  },
  "dishes without eggs or chicken": {
    expected: [
      {type: StepType.GATHER, subject: "dish"},
      {type: StepType.FILTERBYENTITY, subject: "egg", deselected: true},
      {type: StepType.FILTERBYENTITY, subject: "chicken", deselected: true}
    ]
  },
  "dishes with eggs that aren't desserts": {
    expected: [
      {type: StepType.GATHER, subject: "dish"},
      {type: StepType.FILTERBYENTITY, subject: "egg"},
      {type: StepType.INTERSECT, subject: "dessert", deselected: true}
    ]
  },
  "dishes that don't have eggs or chicken": {
    expected: [
      {type: StepType.GATHER, subject: "dish"},
      {type: StepType.FILTERBYENTITY, subject: "egg", deselected: true},
      {type: StepType.FILTERBYENTITY, subject: "chicken", deselected: true}
    ]
  },
  "dishes with a cook time < 30 that have eggs and are sweet": {

  },
  "dishes that take 30 minutes to an hour": {

  },
  "dishes that take 30-60 minutes": {

  },

  "people who live alone": {

  },

  "everyone in this room speaks at least two languages": {

  },
  "at least two languages are spoken by everyone in this room": {

  },


  "friends older than the average age of people with pets": {

  },

  "meetings john was in in the last 10 days": {

  },

  "parts that have a color of \"red\", \"green\", \"blue\", or \"yellow\"": {

  },

  "per book get the average price of books(2) that are cheaper": {

  },
  "per book get the average price of books(2) that cost less": {

  },
  "per book get the average price of books(2) where books(2) price < book price": {

  },

  "head's last name = employee's last name and head != employee and head's department = employee's department": {

  },

  "person loves person(2) and person(2) loves person(3) and person(3) loves person": {

  },

  "employee salary / employee's department total cost ": {

  },

  "Return the average number of publications by Bob in each year": {

  },
  "Return authors who have more papers than Bob in VLDB after 2000": {

  },
  "Return the conference in each area whose papers have the most total citations": {

  },
  "return all conferences in the database area": {

  },
  "return all the organizations, where the number of papers by the organization is more than the number of authors in IBM": {

  },
  "return all the authors, where the number of papers by the author in VLDB is more than the number of papers in ICDE": {

  },
  "Where are the restaurants in San Francisco that serve good French food?": {

  },
  "What are the population sizes of cities that are located in California?": {

  },
  "What are the names of rivers in the state that has the largest city in the united states of america?": {

  },
  "What is the average elevation of the highest points in each state?": {

  },
  "What jobs as a senior software developer are available in houston but not san antonio?": {

  },
  */
];

//---------------------------------------------------------
// Debug drawing
//---------------------------------------------------------

function groupTree(root) {
  if(root.type === TokenTypes.TEXT) return;
  let kids = root.children.map(groupTree);
  let relationship = "root";
  let unfound = "";
  let distance = "";
  let nodes = "";
  if(root.relationship) {
    relationship = RelationshipTypes[root.relationship.type];
    unfound = root.relationship.unfound ? " (unfound)" : unfound;
    distance = ` (${root.relationship.distance})`;
    if(root.relationship.nodes && root.relationship.nodes.length) {
      nodes = ` (${root.relationship.nodes.map((nodes) => nodes[0]).join(", ")})`;
    }
  }

  return {c: "", children: [
    {c: `node ${TokenTypes[root.type]}`, text: `${root.found} (${relationship})${unfound}${distance}${nodes}`},
    {c: "kids", children: kids},
  ]};
}

enum Validated {
  INVALID,
  VALID,
  UNVALIDATED,
}

function validateTestQuery(test: TestQuery) : any {
  let start = performance.now();
  let tokens = getTokens(test.query);
  let tree = tokensToTree(tokens);
  let plan = treeToPlan(tree);
  let expectedPlan:any;

  validatePlan(plan, test.expected);

  return { valid: plan.valid, tokens, tree, plan, searchString: test.query, time: performance.now() - start };
}

function queryTestUI(result) {
  let {tokens, tree, plan, valid, searchString} = result;

  //tokens
  let tokensNode = {c: "tokens", children: [
    {c: "header", text: "Tokens"},
    {c: "kids", children: tokens.map((token) => {
      return {c: `node ${TokenTypes[token.type]}`, text: `${token.found} (${TokenTypes[token.type]})`}
    })}
  ]};

  //tree
  let treeNode = {c: "tree", children: [
    {c: "header", text: "Tree"},
    {c: "kids", children: [
      {c: "header2", text: "Roots"},
      {c: "kids", children: tree.roots.map(groupTree)},
      {c: "header2", text: "Operations"},
      {c: "kids", children: tree.operations.map((root) => {
        //console.log(root);
        return {c: "tokens", children: [
          {c: `node ${TokenTypes[root.type]}`, text: `${root.found}`},
          {c: "kids", children: root.args.map((token) => {
            let parent = token.parent ? token.parent.found + "." : "";
            return {c: `node ${TokenTypes[token.type]}`, text: `${parent}${token.found}`}
          })}
        ]};
      })},
      {c: "header2", text: "Groups"},
      {c: "kids", children: tree.groups.map((root) => {
        return {c: `node ${TokenTypes[root.type]}`, text: `${root.found}`};
      })},
    ]}
  ]};

  // Format the plan for display
  let planDisplay = plan.map((step) => {
    let args = "";
    if(step.argArray) {
      args = " (" + step.argArray.map((arg) => arg.found).join(", ") + ")";
    }
    let deselected = step.deselected ? "!" : "";
    return {c: `step v${step.valid}`, text: `${StepType[step.type]} ${deselected}${step.subject}${args}`};
  });

  let planNode = {c: "tokens", children: [
    {c: "header", text: "Plan"},
    {c: "kids", children: planDisplay}
  ]};

  /*
  // If the parser produced more steps than we expected, display those as well
  if(plan.length > expectedPlan.length) {
    var extraPlans = plan.slice(expectedPlan.length);
    for(var extraPlan of extraPlans) {
      planDisplay.push({c: `step v0`, text: `${StepType[extraPlan.type]} ${extraPlan.deselected ? "!" : ""}${extraPlan.subject}:: expected none`});
    }
  }*/

  // The final display for rendering
  return {c: `search v${valid}`, click: toggleQueryResult, children: [
    {c: "search-header", text: `${searchString}`},
    {c: "search-body", children: [
    tokensNode,
    treeNode,
    planNode,
    {c: "tokens", children: [
      {c: "header", text: "Performance"},
      {c: "kids", children: [
        {c: "time", text: `Total: ${result.time.toFixed(2)}ms`},
      ]}
    ]}
    ]}
  ]};
}

function toggleQueryResult(evt, elem) {

}

export function root() {
  let results = [];
  let resultStats = {unvalidated: 0, succeeded: 0, failed: 0};
  for(let test of tests) {
    let result = validateTestQuery(test);
    results.push(result);
    if(result.valid === Validated.UNVALIDATED) {
      resultStats.unvalidated++;
    } else if(result.valid === Validated.INVALID) {
      resultStats.failed++;
    } else {
      resultStats.succeeded++;
    }
  }
  let resultItems = results.map(queryTestUI);
  return {id: "root", c: "test-root", children: [
    {c: "stats row", children: [
      {c: "failed", text: resultStats.failed},
      {c: "succeeded", text: resultStats.succeeded},
      {c: "unvalidated", text: resultStats.unvalidated},
    ]},
    {children: resultItems}
  ]};
}

//---------------------------------------------------------
// Utils
//---------------------------------------------------------

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