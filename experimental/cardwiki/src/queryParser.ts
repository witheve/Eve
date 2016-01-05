import * as microReact from "./microReact";
import * as runtime from "./runtime";
import {eve} from "./app";
import * as app from "./app";

declare var pluralize;
declare var uuid;
declare var nlp;

window["eve"] = eve;

// ---------------------------------------------------------
// Token types
// ---------------------------------------------------------

export enum TokenTypes {
  ENTITY,
  COLLECTION,
  ATTRIBUTE,
  MODIFIER,
  OPERATION,
  PATTERN,
  VALUE,
  TEXT,
}

// ---------------------------------------------------------
// Modifiers
// ---------------------------------------------------------

let modifiers = {
  "and": { and: true },
  "or": { or: true },
  "without": { deselected: true },
  "aren't": { deselected: true },
  "don't": { deselected: true },
  "not": { deselected: true },
  "isn't": { deselected: true },
  "per": { group: true },
  ",": { separator: true },
  "all": { every: true },
  "every": { every: true },
};

// ---------------------------------------------------------
// Patterns
// ---------------------------------------------------------

let patterns = {
  "older": {
    type: "rewrite",
    rewrites: [{ attribute: "age", text: "age >" }],
  },
  "younger": {
    type: "rewrite",
    rewrites: [{ attribute: "age", text: "age <" }],
  },
  "cheaper": {
    type: "rewrite",
    rewrites: [{ attribute: "price", text: "price <" }, { attribute: "cost", text: "cost <" }]
  },
  "greater than": {
    type: "rewrite",
    rewrites: [{ text: ">" }],
  },
  "years old": {
    type: "rewrite",
    rewrites: [{ attribute: "age", text: "age" }],
  },
  "sum": {
    type: "aggregate",
    op: "sum",
    args: ["value"],
  },
  "count": {
    type: "aggregate",
    op: "count",
    args: ["value"],
  },
  "average": {
    type: "aggregate",
    op: "average",
    args: ["value"],
  },
  "top": {
    type: "sort and limit",
    resultingIndirectObject: 1,
    direction: "descending",
    args: ["limit", "attribute"],
  },
  "bottom": {
    type: "sort and limit",
    resultingIndirectObject: 1,
    direction: "ascending",
    args: ["limit", "attribute"],
  },
  "highest": {
    type: "sort and limit",
    limit: 1,
    resultingIndirectObject: 0,
    direction: "descending",
    args: ["attribute"],
  },
  "lowest": {
    type: "sort and limit",
    limit: 1,
    resultingIndirectObject: 0,
    direction: "ascending",
    args: ["attribute"],
  },
  "between": {
    type: "bounds",
    args: ["lower bound", "upper bound", "attribute"],
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
  "<=": {
    type: "filter",
    op: "<=",
    infix: true,
    resultingIndirectObject: 0,
    args: ["a", "b"],
  },
  ">=": {
    type: "filter",
    op: ">=",
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
    op: "-",
    infix: true,
    resultingIndirectObject: 0,
    args: ["a", "b"],
  },
  "*": {
    type: "calculate",
    op: "*",
    infix: true,
    resultingIndirectObject: 0,
    args: ["a", "b"],
  },
  "/": {
    type: "calculate",
    op: "/",
    infix: true,
    resultingIndirectObject: 0,
    args: ["a", "b"],
  }
};

// ---------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------

function checkForToken(token): any {
  let info;
  if (!token) return;
  if (info = eve.findOne("collection", { collection: token })) {
    return { found: token, info, type: TokenTypes.COLLECTION };
  } else if (info = eve.findOne("entity", { entity: token })) {
    return { found: token, info, type: TokenTypes.ENTITY };
  } else if (info = eve.findOne("entity eavs", { attribute: token })) {
    return { found: token, info, type: TokenTypes.ATTRIBUTE };
  } else if (info = modifiers[token]) {
    return { found: token, info, type: TokenTypes.MODIFIER };
  } else if (info = patterns[token]) {
    return { found: token, info, type: TokenTypes.PATTERN };
  } else if (token === "true" || token === "false" || token === "true" || token === "false") {
    return { found: (token === "true" || token === "true" ? true : false), type: TokenTypes.VALUE, valueType: "boolean" };
  } else if (token.match(/^-?[\d]+$/gm)) {
    return { found: JSON.parse(token), type: TokenTypes.VALUE, valueType: "number" };
  } else if (token.match(/^["][^"]*["]$/gm)) {
    return { found: JSON.parse(token), type: TokenTypes.VALUE, valueType: "string" };
  } else if (info = /^([\d]+)-([\d]+)$/gm.exec(token)) {
    return { found: token, type: TokenTypes.VALUE, valueType: "range", start: info[1], stop: info[2] };
  }
  return;
}


export interface Token {
  id: string;
  found: string;
  orig: string;
  pos: number;
  type: TokenTypes;
  info: any;
  deselected?: boolean;
  and?: boolean;
  or?: boolean;
  group?: any;
  modifier?: any;
  children?: any;
  operation?: any;
  parent?: any;
  relationship?: any;
  grouped?: any;
  valueType?: any;
  start?: any;
  stop?: any;
  args?: any;
}

export function getTokens(queryString: string): Array<Token> {

  // remove all non-word non-space characters
  let cleaned = queryString.replace(/'s/gi, "  ").toLowerCase();
  cleaned = cleaned.replace(/[,.?!]/gi, " , ");
  let words = cleaned.split(" ");
  let front = 0;
  let back = words.length;
  let results = [];
  let pos = 0;

  while (front < words.length) {
    let info = undefined;
    let str = words.slice(front, back).join(" ");
    let orig = str;
    // Check for the word directly
    info = checkForToken(str);
    if (!info) {
      str = pluralize(str, 1);
      // Check the singular version of the word
      info = checkForToken(str);
      if (!info) {
        // Check the plural version of the word
        str = pluralize(str, 2);
        info = checkForToken(str);
      }
    }
    if (info) {
      let {found, type, valueType, start, stop} = info;
      // Create a new token
      results.push({ found, orig, pos, type, valueType, start, stop, info: info.info, id: uuid(), children: []});
      front = back;
      pos += orig.length + 1;
      back = words.length;
    } else if (back - 1 > front) {
      back--;
    } else {
      if (orig) {
        // Default case: the token is plain text
        results.push({ found: orig, orig, pos, type: TokenTypes.TEXT });
      }
      back = words.length;
      pos += words[front].length + 1;
      front++;
    }
  }
  return results;
}

// ---------------------------------------------------------
// Relationships between tokens
// ---------------------------------------------------------

export enum RelationshipTypes {
  NONE,
  ENTITY_ENTITY,
  ENTITY_ATTRIBUTE,
  COLLECTION_COLLECTION,
  COLLECTION_INTERSECTION,
  COLLECTION_ENTITY,
  COLLECTION_ATTRIBUTE,
}

let tokenRelationships = {
  [TokenTypes.COLLECTION]: {
    [TokenTypes.COLLECTION]: findCollectionToCollectionRelationship,
    [TokenTypes.ENTITY]: findCollectionToEntRelationship,
    [TokenTypes.ATTRIBUTE]: findCollectionToAttrRelationship,
  },
  [TokenTypes.ENTITY]: {
    [TokenTypes.ENTITY]: findEntToEntRelationship,
    [TokenTypes.ATTRIBUTE]: findEntToAttrRelationship,
  },
};

function determineRelationship(parent: Token, child: Token) {
  if (!tokenRelationships[parent.type] || !tokenRelationships[parent.type][child.type]) {
    return { distance: Infinity, type: RelationshipTypes.NONE };
  } else {
    return tokenRelationships[parent.type][child.type](parent.found, child.found);
  }
}

function entityTocollectionsArray(entity) {
  let entities = eve.find("collection entities", { entity });
  return entities.map((a) => a["collection"]);
}

function extractFromUnprojected(coll, ix, field, size) {
  let results = [];
  for (let i = 0, len = coll.length; i < len; i += size) {
    results.push(coll[i + ix][field]);
  }
  return results;
}

function findCommonCollections(ents) {
  let intersection = entityTocollectionsArray(ents[0]);
  intersection.sort();
  for (let entId of ents.slice(1)) {
    let cur = entityTocollectionsArray(entId);
    cur.sort();
    arrayIntersect(intersection, cur);
  }
  intersection.sort((a, b) => {
    return eve.findOne("collection", { collection: b })["count"] - eve.findOne("collection", { collection: a })["count"];
  });
  return intersection;
}

function findEntToEntRelationship(ent, ent2) {
  return { distance: Infinity, type: RelationshipTypes.ENTITY_ENTITY };
}

// e.g. "salaries in engineering"
// e.g. "chris's age"
function findEntToAttrRelationship(ent, attr): any {
  // check if this ent has that attr
  let directAttribute = eve.findOne("entity eavs", { entity: ent, attribute: attr });
  if (directAttribute) {
    return { distance: 0, type: RelationshipTypes.ENTITY_ATTRIBUTE };
  }
  let relationships = eve.query(``)
    .select("entity links", { entity: ent }, "links")
    .select("entity eavs", { entity: ["links", "link"], attribute: attr }, "eav")
    .exec();
  if (relationships.unprojected.length) {
    let entities = extractFromUnprojected(relationships.unprojected, 0, "link", 2);
    return { distance: 1, type: RelationshipTypes.ENTITY_ATTRIBUTE, nodes: [findCommonCollections(entities)] };
  }
  let relationships2 = eve.query(``)
    .select("entity links", { entity: ent }, "links")
    .select("entity links", { entity: ["links", "link"] }, "links2")
    .select("entity eavs", { entity: ["links2", "link"], attribute: attr }, "eav")
    .exec();
  if (relationships2.unprojected.length) {
    let entities = extractFromUnprojected(relationships2.unprojected, 0, "link", 3);
    let entities2 = extractFromUnprojected(relationships2.unprojected, 1, "link", 3);
    return { distance: 2, type: RelationshipTypes.ENTITY_ATTRIBUTE, nodes: [findCommonCollections(entities), findCommonCollections(entities2)] };
  }

  // otherwise we assume it's direct and mark it as unfound.
  return { distance: 0, type: RelationshipTypes.ENTITY_ATTRIBUTE, unfound: true };
}

// e.g. "salaries per department"
function findCollectionToAttrRelationship(coll, attr) {
  let direct = eve.query(``)
    .select("collection entities", { collection: coll }, "collection")
    .select("entity eavs", { entity: ["collection", "entity"], attribute: attr }, "eav")
    .exec();
  if (direct.unprojected.length) {
    return { distance: 0, type: RelationshipTypes.COLLECTION_ATTRIBUTE, nodes: [] };
  }
  let relationships = eve.query(``)
    .select("collection entities", { collection: coll }, "collection")
    .select("directionless links", { entity: ["collection", "entity"] }, "links")
    .select("entity eavs", { entity: ["links", "link"], attribute: attr }, "eav")
    .exec();
  if (relationships.unprojected.length) {
    let entities = extractFromUnprojected(relationships.unprojected, 1, "link", 3);
    return { distance: 1, type: RelationshipTypes.COLLECTION_ATTRIBUTE, nodes: [findCommonCollections(entities)] };
  }
  let relationships2 = eve.query(``)
    .select("collection entities", { collection: coll }, "collection")
    .select("directionless links", { entity: ["collection", "entity"] }, "links")
    .select("directionless links", { entity: ["links", "link"] }, "links2")
    .select("entity eavs", { entity: ["links2", "link"], attribute: attr }, "eav")
    .exec();
  if (relationships2.unprojected.length) {
    let entities = extractFromUnprojected(relationships2.unprojected, 1, "link", 4);
    let entities2 = extractFromUnprojected(relationships2.unprojected, 2, "link", 4);
    return { distance: 2, type: RelationshipTypes.COLLECTION_ATTRIBUTE, nodes: [findCommonCollections(entities), findCommonCollections(entities2)] };
  }
}

// e.g. "meetings john was in"
function findCollectionToEntRelationship(coll, ent): any {
  if (coll === "collections") {
    if (eve.findOne("collection entities", { entity: ent })) {
      return { distance: 0, type: "ent->collection" };
    }
  }
  if (eve.findOne("collection entities", { collection: coll, entity: ent })) {
    return { distance: 0, type: RelationshipTypes.COLLECTION_ENTITY, nodes: [] };
  }
  let relationships = eve.query(``)
    .select("collection entities", { collection: coll }, "collection")
    .select("directionless links", { entity: ["collection", "entity"], link: ent }, "links")
    .exec();
  if (relationships.unprojected.length) {
    return { distance: 1, type: RelationshipTypes.COLLECTION_ENTITY, nodes: [] };
  }
  // e.g. events with chris granger (events -> meetings -> chris granger)
  let relationships2 = eve.query(``)
    .select("collection entities", { collection: coll }, "collection")
    .select("directionless links", { entity: ["collection", "entity"] }, "links")
    .select("directionless links", { entity: ["links", "link"], link: ent }, "links2")
    .exec();
  if (relationships2.unprojected.length) {
    let entities = extractFromUnprojected(relationships2.unprojected, 1, "link", 3);
    return { distance: 2, type: RelationshipTypes.COLLECTION_ENTITY, nodes: [findCommonCollections(entities)] };
  }
}

// e.g. "authors and papers"
function findCollectionToCollectionRelationship(coll, coll2) {
  // are there things in both sets?
  let intersection = eve.query(`${coll}->${coll2}`)
    .select("collection entities", { collection: coll }, "coll1")
    .select("collection entities", { collection: coll2, entity: ["coll1", "entity"] }, "coll2")
    .exec();
  // is there a relationship between things in both sets
  let relationships = eve.query(`relationships between ${coll} and ${coll2}`)
    .select("collection entities", { collection: coll }, "coll1")
    .select("directionless links", { entity: ["coll1", "entity"] }, "links")
    .select("collection entities", { collection: coll2, entity: ["links", "link"] }, "coll2")
    .group([["links", "link"]])
    .aggregate("count", {}, "count")
    .project({ type: ["links", "link"], count: ["count", "count"] })
    .exec();

  let maxRel = { count: 0 };
  for (let result of relationships.results) {
    if (result.count > maxRel.count) maxRel = result;
  }

  // we divide by two because unprojected results pack rows next to eachother
  // and we have two selects.
  let intersectionSize = intersection.unprojected.length / 2;
  if (maxRel.count > intersectionSize) {
    return { distance: 1, type: RelationshipTypes.COLLECTION_COLLECTION };
  } else if (intersectionSize > maxRel.count) {
    return { distance: 0, type: RelationshipTypes.COLLECTION_INTERSECTION };
  } else if (maxRel.count === 0 && intersectionSize === 0) {
    return;
  } else {
    return { distance: 1, type: RelationshipTypes.COLLECTION_COLLECTION };
  }
}

// ---------------------------------------------------------
// Token tree
// ---------------------------------------------------------

interface Tree {
  directObject: any;
  roots: Array<any>;
  operations: Array<any>;
  groups: Array<any>;
}

function tokensToTree(origTokens: Array<Token>): Tree {

  let tokens = origTokens;
  let roots = [];
  let operations = [];
  let groups = [];
  // Find the direct object
  // The direct object is the first collection we find, or if there are none,
  // the first entity, or finally the first attribute.
  let directObject;
  for (let token of tokens) {
    if (token.type === TokenTypes.COLLECTION) {
      directObject = token;
      break;
    } else if (token.type === TokenTypes.ENTITY) {
      directObject = token;
    } else if (token.type === TokenTypes.ATTRIBUTE && !directObject) {
      directObject = token;
    }
  }

  let tree = { directObject, roots, operations, groups };
  if (!directObject) return tree;

  // the direct object is always the first root
  roots.push(directObject);
  // we need to keep state as we traverse the tokens for modifiers and patterns
  let state = { patternStack: [], currentPattern: null, lastAttribute: null };
  // as we parse the query we may encounter other subjects in the sentence, we
  // need a reference to those previous subjects to see if the current token is
  // related to that or the directObject
  let indirectObject = directObject;

  // Main token loop
  for (let tokenIx = 0, len = tokens.length; tokenIx < len; tokenIx++) {
    let token = tokens[tokenIx];
    let {type, info, found} = token;

    // check if the last pass finshed our current pattern.
    if (state.currentPattern && state.currentPattern.args.length) {
      let args = state.currentPattern.args;
      let infoArgs = state.currentPattern.info.args;
      let latestArg = args[args.length - 1];
      let latestArgComplete = latestArg.type === TokenTypes.ATTRIBUTE || latestArg.type === TokenTypes.VALUE;
      while (args.length === infoArgs.length && latestArgComplete) {
        let {resultingIndirectObject} = state.currentPattern.info;
        if (resultingIndirectObject !== undefined) {
          indirectObject = args[resultingIndirectObject];
        } else {
          indirectObject = state.currentPattern;
        }
        state.currentPattern = state.patternStack.pop();
        if (!state.currentPattern) break;
        args = state.currentPattern.args;
        infoArgs = state.currentPattern.info.args;
        args.push(indirectObject);
        latestArg = args[args.length - 1];
        latestArgComplete = latestArg.type === TokenTypes.ATTRIBUTE || latestArg.type === TokenTypes.VALUE;
      }
    }

    // deal with modifiers
    if (type === TokenTypes.MODIFIER) {
      // if this is a deselect modifier, we need to roll forward through the tokens
      // to figure out roughly how far the deselection should go. Also if we run into
      // an "and"" or an "or", we need to deal with that specially.
      if (info.deselected) {
        // we're going to move forward from this token and deselect as we go
        let localTokenIx = tokenIx + 1;
        // get to the first non-text token
        while (localTokenIx < len && tokens[localTokenIx].type === TokenTypes.TEXT) {
          localTokenIx++;
        }
        // negate until we find a reason to stop
        while (localTokenIx < len) {
          let localToken = tokens[localTokenIx];
          if (localToken.type === TokenTypes.TEXT) {
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
      if (info.or && !token.deselected) {
        let localTokenIx = tokenIx + 1;
        // get to the first non-text token
        while (localTokenIx < len && tokens[localTokenIx].type === TokenTypes.TEXT) {
          localTokenIx++;
        }
        // consume until we hit a separator
        while (localTokenIx < len) {
          let localToken = tokens[localTokenIx];
          if (localToken.type === TokenTypes.TEXT) {
            break;
          }
          localTokenIx++;
        }
      }
      // a group adds a group for the next collection and checks to see if there's an and
      // or a separator that would indicate multiple groupings
      if (info.group) {
        // we're going to move forward from this token and deselect as we go
        let localTokenIx = tokenIx + 1;
        // get to the first non-text token
        while (localTokenIx < len && tokens[localTokenIx].type === TokenTypes.TEXT) {
          localTokenIx++;
        }
        // if we've run out of tokens, bail
        if (localTokenIx === len) break;
        // otherwise, the next thing we found is what we're trying to group by
        let localToken = tokens[localTokenIx];
        localToken.grouped = true;
        groups.push(localToken);
        localTokenIx++;
        // now we have to check if we're trying to group by multiple things, e.g.
        // "per department and age" or "per department, team, and age"
        let next = tokens[localTokenIx];
        while (next && next.type === TokenTypes.MODIFIER && (next.info.separator || next.info.and)) {
          localTokenIx++;
          next = tokens[localTokenIx];
          // if we have another modifier directly after (e.g. ", and") loop again
          // to see if this is valid.
          if (next && next.type === TokenTypes.MODIFIER) {
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
    if (type === TokenTypes.PATTERN) {
      if (info.type === "rewrite") {
        let newText;
        // if we only have one possible rewrite, we can just take it
        if (info.rewrites.length === 1) {
          newText = info.rewrites[0].text;
        } else {
          // @TODO: we have to go through every possibility and deal with it
          newText = info.rewrites[0].text;
        }
        // Tokenize the new string.
        let newTokens: any = getTokens(newText);
        // Splice in the new tokens, adjust the length and make sure we revisit this token.
        len += newTokens.length;
        tokens.splice.apply(tokens, [tokenIx + 1, 0].concat(newTokens));
        // apply any deselects, or's, or and's to this token
        for (let newToken of newTokens) {
          newToken.deselected = token.deselected;
          newToken.and = token.and;
          newToken.or = token.or;
        }
        continue;
      } else {
        // otherwise it's an operation of some kind
        operations.push(token);
        // keep track of any other patterns we're trying to fill right now
        if (state.currentPattern) {
          state.patternStack.push(state.currentPattern);
        }
        state.currentPattern = token;
        state.currentPattern.args = [];
      }
      if (info.infix) {
        state.currentPattern.args.push(indirectObject);
      }
      continue;
    }

    // deal with values
    if (type === TokenTypes.VALUE) {

      // Deal with a range value. It's really a pattern
      if (token.valueType === "range") {
        token.found = "between";
        token.info = patterns["between"];
        token.args = [];
        let start: Token = {id: uuid(), found: token.start, orig: token.start, pos: token.pos, type: TokenTypes.VALUE, info: parseFloat(token.start), valueType: "number"};
        let stop: Token = {id: uuid(), found: token.stop, orig: token.stop, pos: token.pos, type: TokenTypes.VALUE, info: parseFloat(token.stop), valueType: "number"};
        token.args.push(start);
        token.args.push(stop);
        operations.push(token);
        state.patternStack.push(token);
        if (state.currentPattern === null) {
          state.currentPattern = state.patternStack.pop();
        }
        continue;
      }

      // if we still have a currentPattern to fill
      if (state.currentPattern && state.currentPattern.args.length < state.currentPattern.info.args.length) {
        state.currentPattern.args.push(token);
      }
      continue;
    }

    // We don't do anything with text nodes at this point
    if (type === TokenTypes.TEXT) continue;

    // once modifiers and patterns have been applied, we don't need to worry
    // about the directObject as it's already been assigned to the first root.
    if (directObject === token) {
      indirectObject = directObject;
      continue;
    }

    if (directObject === indirectObject) {
      directObject.children.push(token);
      token.relationship = determineRelationship(directObject, token);
      token.parent = directObject;
      indirectObject = token;
    } else {
      let potentialParent = indirectObject;
      // if our indirect object is an attribute and we encounter another one, we want to check
      // the parent of this node for a match
      if (indirectObject.type === TokenTypes.ATTRIBUTE && token.type === TokenTypes.ATTRIBUTE) {
        potentialParent = indirectObject.parent;
      }
      // if the indirect object is an attribute, anything other than another attribute will create
      // a new root
      if (indirectObject.type === TokenTypes.ATTRIBUTE && token.type !== TokenTypes.ATTRIBUTE) {
        let rootRel = determineRelationship(directObject, token);
        if (!rootRel || (rootRel.distance === 0 && token.type === TokenTypes.ENTITY)) {
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
      else if (potentialParent.type === TokenTypes.ENTITY && token.type !== TokenTypes.ATTRIBUTE) {
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
        if (token.type === TokenTypes.ENTITY) {
          if (cursorRel && cursorRel.distance === 0) cursorRel = null;
          if (rootRel && rootRel.distance === 0) rootRel = null;
        }
        if (!cursorRel) {
          directObject.children.push(token);
          token.relationship = rootRel;
          token.parent = directObject;
        } else if (!rootRel) {
          potentialParent.children.push(token);
          token.relationship = cursorRel;
          token.parent = potentialParent;
        } else if (cursorRel.distance <= rootRel.distance) {
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
    if (state.currentPattern) {
      let args = state.currentPattern.args;
      let infoArgs = state.currentPattern.info.args;
      let latestArg = args[args.length - 1];
      let latestArgComplete = !latestArg || latestArg.type === TokenTypes.ATTRIBUTE || latestArg.type === TokenTypes.VALUE;
      let firstArg = args[0];
      if (!latestArgComplete && indirectObject.type === TokenTypes.ATTRIBUTE) {
        args.pop();
        args.push(indirectObject);
      } else if (latestArgComplete && args.length < infoArgs.length) {
        args.push(indirectObject);
        latestArg = indirectObject;
      }
    }
  }
  // End main token loop

  // if we've run out of tokens and are still looking to fill in a pattern,
  // we might need to carry the attribute through.
  if (state.currentPattern && state.currentPattern.args.length <= state.currentPattern.info.args.length) {
    let args = state.currentPattern.args;
    let infoArgs = state.currentPattern.info.args;
    let latestArg = args[args.length - 1];
    if (!latestArg) return tree;
    let latestArgComplete = latestArg.type === TokenTypes.ATTRIBUTE || latestArg.type === TokenTypes.VALUE;
    let firstArg = args[0];
    // e.g. people older than chris granger => people age > chris granger age
    if (!latestArgComplete && firstArg && firstArg.type === TokenTypes.ATTRIBUTE) {
      let newArg: any = { type: firstArg.type, found: firstArg.found, orig: firstArg.orig, info: firstArg.info, id: uuid(), children: [] };
      let cursorRel = determineRelationship(latestArg, newArg);
      newArg.relationship = cursorRel;
      newArg.parent = latestArg;
      latestArg.children.push(newArg);
      args.pop();
      args.push(newArg);
    }
    // e.g. people whose age is between 50 and 65
    // @HACK special case this for now
    else if (state.currentPattern.found === "between") {
      // Backtrack from the pattern start until we find an attribute
      let patternStart = tokens.lastIndexOf(state.currentPattern);
      let arg = null;
      for (let ix = patternStart; ix > 0; ix--) {
        if (tokens[ix].type === TokenTypes.ATTRIBUTE) {
          arg = tokens[ix];
          break;
        }
      }
      // If we found an attribute, now add it to the arglist for the pattern
      if (arg != null) {
        state.currentPattern.args.push(arg);
      }
    }
  }
  return tree;
}

// ---------------------------------------------------------
// Query plans
// ---------------------------------------------------------

export enum StepType {
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

export function queryToPlan(query: string) {
  let tokens = getTokens(query);
  let tree = tokensToTree(tokens);
  let plan = treeToPlan(tree);
  return { tokens, tree, plan };
}

export class Plan extends Array<Step> {
  valid: Validated;
}

export interface Step {
  id: string;
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

export enum Validated {
  INVALID,
  VALID,
  UNVALIDATED,
}


function ignoreHiddenCollections(colls) {
  for (let coll of colls) {
    if (coll !== "generic related to") {
      return coll;
    }
  }
}

function nodeToPlanSteps(node, parent, parentPlan) {
  // TODO: figure out what to do with operations
  let id = node.id || uuid();
  let {deselected} = node;
  let rel = node.relationship;
  let plan = [];
  let curParent = parentPlan;
  if (parent && rel) {
    switch (rel.type) {
      case RelationshipTypes.COLLECTION_ATTRIBUTE:
        for (let node of rel.nodes) {
          let coll = ignoreHiddenCollections(node);
          let item = { type: StepType.GATHER, relatedTo: curParent, subject: coll, id: uuid() };
          plan.push(item);
          curParent = item;
        }
        plan.push({ type: StepType.LOOKUP, relatedTo: curParent, subject: node.found, id, deselected });
        return plan;
        break;
      case RelationshipTypes.COLLECTION_ENTITY:
        for (let node of rel.nodes) {
          let coll = ignoreHiddenCollections(node);
          let item = { type: StepType.GATHER, relatedTo: curParent, subject: coll, id: uuid() };
          plan.push(item);
          curParent = item;
        }
        plan.push({ type: StepType.FILTERBYENTITY, relatedTo: curParent, subject: node.found, id, deselected });
        return plan;
        break;
      case RelationshipTypes.COLLECTION_COLLECTION:
        return [{ type: StepType.GATHER, relatedTo: parentPlan, subject: node.found, id, deselected }];
        break;
      case RelationshipTypes.COLLECTION_INTERSECTION:
        return [{ type: StepType.INTERSECT, relatedTo: parentPlan, subject: node.found, id, deselected }];
        break;
      case RelationshipTypes.ENTITY_ATTRIBUTE:
        if (rel.distance === 0) {
          return [{ type: StepType.LOOKUP, relatedTo: parentPlan, subject: node.found, id, deselected }];
        } else {
          let plan = [];
          let curParent = parentPlan;
          for (let node of rel.nodes) {
            let coll = ignoreHiddenCollections(node);
            let item = { type: StepType.GATHER, relatedTo: curParent, subject: coll, id: uuid() };
            plan.push(item);
            curParent = item;
          }
          plan.push({ type: StepType.LOOKUP, relatedTo: curParent, subject: node.found, id, deselected });
          return plan;
        }
        break;
    }
  } else {
    if (node.type === TokenTypes.COLLECTION) {
      return [{ type: StepType.GATHER, subject: node.found, id, deselected }];
    } else if (node.type === TokenTypes.ENTITY) {
      return [{ type: StepType.FIND, subject: node.found, id, deselected }];
    } else if (node.type === TokenTypes.ATTRIBUTE) {
      return [{ type: StepType.LOOKUP, subject: node.found, id, deselected }];
    }
    return [];
  }
}

function nodeToPlan(tree, parent = null, parentPlan = null) {
  if (!tree) return [];
  let plan = [];
  // process you, then your children
  plan.push.apply(plan, nodeToPlanSteps(tree, parent, parentPlan));
  let neueParentPlan = plan[plan.length - 1];
  for (let child of tree.children) {
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
  if (!nodes.length) return [];
  let groups = [];
  for (let node of nodes) {
    if (node.type === "collection") {
      groups.push([node.id, "entity"]);
    } else if (node.type === "attribute") {
      groups.push([node.id, "value"]);
    } else {
      throw new Error("Invalid node to group on: " + JSON.stringify(nodes));
    }
  }
  return [{ type: StepType.GROUP, id: uuid(), groups, groupNodes: nodes }];
}

function opToPlan(op, groups): any {
  let info = op.info;
  let args = {};
  if (info.args) {
    let ix = 0;
    for (let arg of info.args) {
      let argValue = op.args[ix];
      if (argValue === undefined) continue;
      if (argValue.type === TokenTypes.VALUE) {
        args[arg] = argValue.found;
      } else if (argValue.type === TokenTypes.ATTRIBUTE) {
        args[arg] = [argValue.id, "value"];
      } else {
        console.error(`Invalid operation argument: ${argValue.orig} for ${op.found}`);
      }
      ix++;
    }
  }
  if (info.type === "aggregate") {
    return [{ type: StepType.AGGREGATE, subject: info.op, args, id: uuid(), argArray: op.args }];
  } else if (info.type === "sort and limit") {
    let sortLimitArgs = op.args.map((arg) => arg.found);
    let sortField = { parentId: op.args[1].id, parent: op.args[1].parent.found, subject: op.args[1].found };
    let subject = "results";
    // If groups are formed, check if we are sorting on one of them
    for (let group of groups) {
      if (group.found === sortField.parent) {
        subject = "per group";
        break;
      }
    }
    let sortStep = { type: StepType.SORT, subject: subject, direction: info.direction, field: sortField, id: uuid() };
    let limitStep = { type: StepType.LIMIT, subject: subject, value: sortLimitArgs[0], id: uuid() };
    return [sortStep, limitStep];
  } else if (info.type === "bounds") {
    let lowerBounds = { type: StepType.FILTER, subject: ">", id: uuid(), argArray: [op.args[2], op.args[0]]};
    let upperBounds = { type: StepType.FILTER, subject: "<", id: uuid(), argArray: [op.args[2], op.args[1]]};
    return [lowerBounds, upperBounds];
  } else if (info.type === "filter") {
    return [{ type: StepType.FILTER, subject: info.op, args, id: uuid(), argArray: op.args }];
  } else {
    return [{ type: StepType.CALCULATE, subject: info.op, args, id: uuid(), argArray: op.args }];
  }
}

// Since intermediate plan steps can end up duplicated, we need to walk the plan to find
// nodes that are exactly the same and only do them once. E.g. salaries per department and age
// will bring in two employee gathers.
function dedupePlan(plan) {
  let dupes = {};
  // for every node in the plan backwards
  for (let planIx = plan.length - 1; planIx > -1; planIx--) {
    let step = plan[planIx];
    // check all preceding nodes for a node that is equivalent
    for (let dupeIx = planIx - 1; dupeIx > -1; dupeIx--) {
      let dupe = plan[dupeIx];
      // equivalency requires the same type, subject, deselect, and parent
      if (step.type === dupe.type && step.subject === dupe.subject && step.deselected === dupe.deselected && step.relatedTo === dupe.relatedTo) {
        // store the dupe and what node will replace it
        dupes[step.id] = dupe.id;
      }
    }
  }
  return plan.filter((step) => {
    // remove anything we found to be a dupe
    if (dupes[step.id]) return false;
    // if this step references a dupe, relate it to the new node
    if (dupes[step.relatedTo]) {
      step.relatedTo = dupes[step.relatedTo];
    }
    return true;
  });
}

function treeToPlan(tree: Tree): Plan {
  let steps: Step[] = [];
  for (let root of tree.roots) {
    steps = steps.concat(nodeToPlan(root));
  }
  steps = dedupePlan(steps);
  for (let group of tree.groups) {
      let node;
      for (let step of steps) {
          if (step.id === group.id) {
              node = step;
              break;
          }
      }
    steps.push({ id: uuid(), type: StepType.GROUP, subject: group.found, subjectNode: node });
  }
  for (let op of tree.operations) {
    steps = steps.concat(opToPlan(op, tree.groups));
  }
  // Create a plan type for return
  let plan: Plan = new Plan();
  plan.valid = Validated.INVALID;
  for (let step of steps) {
    plan.push(step);
  }

  return plan;
}

// ---------------------------------------------------------
// Plan to query
// ---------------------------------------------------------

function safeProjectionName(name, projection) {
  if (!projection[name]) {
    return name;
  }
  let ix = 2;
  while (projection[name]) {
    name = `${name} ${ix}`;
    ix++;
  }
  return name;
}

export function planToExecutable(plan) {
  let projection = {};
  let query = eve.query();
  for (let step of plan) {
    switch (step.type) {
      case StepType.FIND:
        // find is a no-op
        step.size = 0;
        break;
      case StepType.GATHER:
        var join: any = {};
        if (step.subject) {
          join.collection = step.subject;
        }
        var related = step.relatedTo;
        if (related) {
          if (related.type === StepType.FIND) {
            step.size = 2;
            let linkId = `${step.id} | link`;
            query.select("directionless links", {entity: related.subject}, linkId);
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
        step.name = safeProjectionName(step.subject, projection);
        projection[step.name] = [step.id, "entity"];
        break;
      case StepType.LOOKUP:
        var join: any = {attribute: step.subject};
        var related = step.relatedTo;
        if (related) {
          if (related.type === StepType.FIND) {
            join.entity = related.subject;
          } else {
            join.entity = [related.id, "entity"];
          }
        }
        if (step.deselected) {
            step.size = 0;
            query.deselect("entity eavs", join, step.id);
        } else {
            step.size = 1;
            query.select("entity eavs", join, step.id);
            step.name = safeProjectionName(step.subject, projection);
            projection[step.name] = [step.id, "value"];
        }
        break;
      case StepType.INTERSECT:
        var related = step.relatedTo;
        if (step.deselected) {
          step.size = 0;
          query.deselect("collection entities", {collection: step.subject, entity: [related.id, "entity"]});
        } else {
          step.size = 1;
          query.select("collection entities", {collection: step.subject, entity: [related.id, "entity"]}, step.id);
        }
        break;
      case StepType.FILTERBYENTITY:
        var related = step.relatedTo;
        var linkId = `${step.id} | link`;
        if (step.deselected) {
          step.size = 0;
          query.deselect("directionless links", {entity: [related.id, "entity"], link: step.subject});
        } else {
          step.size = 1;
          query.select("directionless links", {entity: [related.id, "entity"], link: step.subject}, step.id);
        }
        break;
      case StepType.FILTER:
        step.size = 0;
        query.calculate(step.subject, step.args, step.id);
        break;
      case StepType.CALCULATE:
        step.size = 1;
        query.calculate(step.subject, step.args, step.id);
        step.name = safeProjectionName(step.subject, projection);
        projection[step.name] = [step.id, "result"];
        break;
      case StepType.AGGREGATE:
        step.size = 1;
        query.aggregate(step.subject, step.args, step.id);
        step.name = safeProjectionName(step.subject, projection);
        projection[step.name] = [step.id, step.subject];
        break;
      case StepType.GROUP:
        step.size = 0;
        var field = "entity";
        if (step.subjectNode.type === StepType.LOOKUP) {
          field = "value";
        }
        step.name = step.subjectNode.name;
        query.group([step.subjectNode.id, field]);
        break;
      case StepType.SORT:
        step.size = 0;
        query.sort([step.field.parentId, "value", step.direction]);
        break;
      case StepType.LIMIT:
        step.size = 0;
        query.limit(step.limit);
        break;
    }
  }
  query.project(projection);
  return query;
}

export function queryToExecutable(query) {
  let planInfo: any = queryToPlan(query);
  let executable = planToExecutable(planInfo.plan);
  planInfo.executable = executable;
  planInfo.queryString = query;
  return planInfo;
}

// ---------------------------------------------------------
// Utils
// ---------------------------------------------------------

function arrayIntersect(a, b) {
  let ai = 0;
  let bi = 0;
  let result = [];
  while (ai < a.length && bi < b.length) {
    if (a[ai] < b[bi]) ai++;
    else if (a[ai] > b[bi]) bi++;
    else {
      result.push(a[ai]);
      ai++;
      bi++;
    }
  }
  return result;
}

declare var exports;
window["queryParser"] = exports;