import * as microReact from "./microReact";
import * as runtime from "./runtime";
import {eve} from "./app";
import * as app from "./app";
import * as wiki from "./wiki";

declare var pluralize;
declare var uuid;

window["eve"] = eve;

//---------------------------------------------------------
// Tokens
//---------------------------------------------------------

var modifiers = {
  "and": "and",
  "or": "or",
  "without": "without",
  "aren't": "aren't",
  "per": {group: true},
};
var patterns = {};

enum TokenTypes {
  entity,
  collection,
  attribute,
  modifier,
  pattern,
  text,
}

function checkForToken(token): any {
  var found;
  if(found = eve.findOne("collection", {collection: token})) {
    return {found, type: TokenTypes.collection};
  } else if(found = eve.findOne("entity", {entity: token})) {
    return {found, type: TokenTypes.entity};
  } else if(found = eve.findOne("entity eavs", {attribute: token})) {
    return {found, type: TokenTypes.attribute};
  } else if(found = modifiers[token]) {
    return {found, type: TokenTypes.modifier};
  } else if(found = patterns[token]) {
    return {found, type: TokenTypes.pattern};
  }
  return {};
}

function getTokens(string) {
  // remove all non-word non-space characters
  let cleaned = string.replace(/'s/gi, "  ").toLowerCase();
  let words = cleaned.split(/[ ,.?!]/gi);
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
      results.push({found: orig, orig, pos, type: TokenTypes.text});
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
  none,
  entityToEntity,
  entityToAttribute,
  collectionToCollection,
  collectionIntersection,
  collectionToEntity,
  collectionToAttribute,
}

var tokenRelationships = {
  [TokenTypes.collection]: {
    [TokenTypes.collection]: findCollectionToCollectionRelationship,
    [TokenTypes.entity]: findCollectionToEntRelationship,
    [TokenTypes.attribute]: findCollectionToAttrRelationship,
  },
  [TokenTypes.entity]: {
    [TokenTypes.entity]: findEntToEntRelationship,
    [TokenTypes.attribute]: findEntToAttrRelationship,
  },
}

function determineRelationship(parent, child) {
  if(!tokenRelationships[parent.type] || !tokenRelationships[parent.type][child.type]) return {distance: Infinity, type: RelationshipTypes.none};
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
  return {distance: Infinity, type: RelationshipTypes.entityToEntity};
}

// e.g. "salaries in engineering"
// e.g. "chris's age"
function findEntToAttrRelationship(ent, attr):any {
  // check if this ent has that attr
  let directAttribute = eve.findOne("entity eavs", {entity: ent, attribute: attr});
  if(directAttribute) {
    return {distance: 0, type: RelationshipTypes.entityToAttribute};
  }
  let relationships = eve.query(``)
                .select("entity links", {entity: ent}, "links")
                .select("entity eavs", {entity: ["links", "link"], attribute: attr}, "eav")
                .exec();
  if(relationships.unprojected.length) {
    let entities = extractFromUnprojected(relationships.unprojected, 0, "link", 2);
    return {distance: 1, type: RelationshipTypes.entityToAttribute, nodes: [findCommonCollections(entities)]};
  }
  let relationships2 = eve.query(``)
                .select("entity links", {entity: ent}, "links")
                .select("entity links", {entity: ["links", "link"]}, "links2")
                .select("entity eavs", {entity: ["links2", "link"], attribute: attr}, "eav")
                .exec();
  if(relationships2.unprojected.length) {
    let entities = extractFromUnprojected(relationships2.unprojected, 0, "link", 3);
    let entities2 = extractFromUnprojected(relationships2.unprojected, 1, "link", 3);
    return {distance: 2, type: RelationshipTypes.entityToAttribute, nodes: [findCommonCollections(entities), findCommonCollections(entities2)]};
  }

  //otherwise we assume it's direct and mark it as unfound.
  return {distance: 0, type: RelationshipTypes.entityToAttribute, unfound: true};
}

// e.g. "salaries per department"
function findCollectionToAttrRelationship(coll, attr) {
  let direct = eve.query(``)
                .select("collection entities", {collection: coll}, "collection")
                .select("entity eavs", {entity: ["collection", "entity"], attribute: attr}, "eav")
                .exec();
  if(direct.unprojected.length) {
    return {distance: 0, type: RelationshipTypes.collectionToAttribute, nodes: []};
  }
  let relationships = eve.query(``)
                .select("collection entities", {collection: coll}, "collection")
                .select("directionless links", {entity: ["collection", "entity"]}, "links")
                .select("entity eavs", {entity: ["links", "link"], attribute: attr}, "eav")
                .exec();
  if(relationships.unprojected.length) {
    let entities = extractFromUnprojected(relationships.unprojected, 1, "link", 3);
    return {distance: 1, type: RelationshipTypes.collectionToAttribute, nodes: [findCommonCollections(entities)]};
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
    return {distance: 2, type: RelationshipTypes.collectionToAttribute, nodes: [findCommonCollections(entities), findCommonCollections(entities2)]};
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
    return {distance: 0, type: RelationshipTypes.collectionToEntity, nodes: []};
  }
  let relationships = eve.query(``)
                .select("collection entities", {collection: coll}, "collection")
                .select("directionless links", {entity: ["collection", "entity"], link: ent}, "links")
                .exec();
  if(relationships.unprojected.length) {
    return {distance: 1, type: RelationshipTypes.collectionToEntity, nodes: []};
  }
  // e.g. events with chris granger (events -> meetings -> chris granger)
  let relationships2 = eve.query(``)
                .select("collection entities", {collection: coll}, "collection")
                .select("directionless links", {entity: ["collection", "entity"]}, "links")
                .select("directionless links", {entity: ["links", "link"], link: ent}, "links2")
                .exec();
  if(relationships2.unprojected.length) {
    let entities = extractFromUnprojected(relationships2.unprojected, 1, "link", 3);
    return {distance: 2, type: RelationshipTypes.collectionToEntity, nodes: [findCommonCollections(entities)]};
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
    return {distance: 1, type: RelationshipTypes.collectionToCollection};
  } else if(intersectionSize > maxRel.count) {
    return {distance: 0, type: RelationshipTypes.collectionIntersection};
  } else if(maxRel.count === 0 && intersectionSize === 0) {
    return;
  } else {
    return {distance: 1, type: RelationshipTypes.collectionToCollection};
  }
}

//---------------------------------------------------------
// Token tree
//---------------------------------------------------------

function tokensToTree(tokens) {
  let roots = [];
  let operations = [];
  let groups = [];
  // Find the direct object
  // The direct object is the first collection we find, or if there are none,
  // the first entity, or finally the first attribute.
  let directObject;
  for(let token of tokens) {
    if(token.type === TokenTypes.collection) {
      directObject = token;
      break;
    } else if(token.type === TokenTypes.entity) {
      directObject = token;
    } else if(token.type === TokenTypes.attribute && !directObject) {
      directObject = token;
    }
  }

  if(!directObject) return {directObject, roots, operations, groups};

  // the direct object is always the first root
  roots.push(directObject);
  // we need to keep state as we traverse the tokens for modifiers and patterns
  let state = {};
  // as we parse the query we may encounter other subjects in the sentence, we
  // need a reference to those previous subjects to see if the current token is
  // related to that or the directObject
  let indirectObject = directObject;

  for(let token of tokens) {
    let {type, info, found} = token;

    // deal with modifiers
    if(type === TokenTypes.modifier) {
      continue;
    }
    // deal with patterns
    if(type === TokenTypes.pattern) {
      continue;
    }

    // once modifiers and patterns have been applied, we don't need to worry
    // about the directObject as it's already been asigned to the first root.
    if(directObject === token || type === TokenTypes.text) continue;

    if(directObject === indirectObject) {
      directObject.children.push(token);
      token.relationship = determineRelationship(directObject, token);
    }

  }

  return {directObject, roots, operations, groups};
}

//---------------------------------------------------------
// Query plans
//---------------------------------------------------------

function treeToPlan(tree) {
  return [];
}

//---------------------------------------------------------
// Debug drawing
//---------------------------------------------------------

function groupTree(root) {
  if(root.type === TokenTypes.text) return;
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

function testSearch(search) {
  let tokens = getTokens(search);
  let tree = tokensToTree(tokens);
  let plan = treeToPlan(tree);

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
      {c: "kids", children: tree.operations.map(groupTree)},
      {c: "header2", text: "Groups"},
      {c: "kids", children: tree.groups.map(groupTree)},
    ]}
  ]};

  //tokens
  let planNode = {c: "tokens", children: [
    {c: "header", text: "Plan"},
    {c: "kids", children: plan.map((step) => {
      return {c: "node", text: `${step.type} (${step.found})`}
    })}
  ]};

  return {c: "search", children: [
    {c: "search-header", text: `${search}`},
    tokensNode,
    treeNode,
    planNode,
  ]};
}

function root() {
  return {id: "root", c: "test-root", children: [
    testSearch("chris granger's age"),
    testSearch("robert attorri's age"),
    testSearch("salaries per department"),
    testSearch("dishes with eggs and chicken"),
    testSearch("dishes with eggs or chicken"),
    testSearch("dishes without eggs and chicken"),
    testSearch("dishes without eggs or chicken"),
    testSearch("dishes with eggs that aren't desserts"),
  ]};
}

wiki.coerceInput("foo");
app.renderRoots["wiki"] = root;

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