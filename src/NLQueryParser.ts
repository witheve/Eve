import {eve} from "./app";

declare var pluralize;

// ----------------------------------------------------------------------------
// User-Facing functions
// ----------------------------------------------------------------------------

export interface Result {
  intent: Intents,
  context: Context,
  tokens: Array<Token>,
  tree: Node,
  query: Query,
}

export enum Intents {
  QUERY,
  INSERT,
  MOREINFO,
  NORESULT,
}

// Entry point for NLQP
export function parse(queryString: string, lastParse?: Result): Array<Result> {
  let tree: Node;
  let context: Context;
  let tokens: Array<Token>;
  // If this is the first run, then create a root node.
  if (lastParse === undefined) {
    let rootToken = newToken("root");
    rootToken.properties.push(Properties.ROOT);
    tree = newNode(rootToken);
    tree.found = true;
    context = newContext();
    tokens = [rootToken];
  // Otherwise, use the previous parse tree
  } else {
    tree = lastParse.tree;
    context = lastParse.context;
    tokens = lastParse.tokens;
  }
  // Now do something with the query string
  let words = normalizeQueryString(queryString);
  for (let word of words) {
    // From a token
    let token = formToken(word);
    // Link new token with the rest
    let lastToken = tokens[tokens.length - 1];
    lastToken.next = token;
    token.prev = lastToken;
    tokens.push(token);
    // Add the token to the tree
    let node = newNode(token);
    let treeResult = formTree(node, tree, context);
    tree = treeResult.tree;
    context = treeResult.context;
  }
  // Create the query from the new tree
  log("Building query...");
  
  function allFound(node: Node): boolean {
    let cFound = node.children.map(allFound).every((c)=>c);
    if (cFound && node.found) {
      return true;
    } else {
      return false;
    }
  } 
  let query = newQuery();
  if (allFound(tree)) {
    query = formQuery(tree);
  }

  let intent = Intents.QUERY;
  return [{intent: intent, context: context, tokens: tokens, tree: tree, query: query}];
}

// Returns false if any nodes are not marked found
// Returns true if all nodes are marked found
function treeComplete(node: Node): boolean {
  if (node.found === false) {
    return false;
  } else {
    let childrenStatus = node.children.map(treeComplete);
    return childrenStatus.every((child) => child === true); 
  }
}

interface Word {
  ix: number;
  text: string;
}

// Performs some transformations to the query string before tokenizing
export function normalizeQueryString(queryString: string): Array<Word> {
  // Add whitespace before and after separator and operators
  let normalizedQueryString = queryString.replace(/,/g,' , ');
  normalizedQueryString = normalizedQueryString.replace(/;/g,' ; ');
  normalizedQueryString = normalizedQueryString.replace(/\+/g,' + ');
  normalizedQueryString = normalizedQueryString.replace(/-/g,' - ');
  normalizedQueryString = normalizedQueryString.replace(/\*/g,' * ');
  normalizedQueryString = normalizedQueryString.replace(/\//g,' / ');
  normalizedQueryString = normalizedQueryString.replace(/"/g,' " ');
  // Split possessive endings
  normalizedQueryString = normalizedQueryString.replace(/\'s/g,' \'s ');
  normalizedQueryString = normalizedQueryString.replace(/s'/g,'s \' ');
  // Clean various symbols we don't want to deal with
  normalizedQueryString = normalizedQueryString.replace(/`|\?|\:|\[|\]|\{|\}|\(|\)|\~|\`|~|@|#|\$|%|&|_|\|/g,' ');
  // Collapse whitespace   
  normalizedQueryString = normalizedQueryString.replace(/\s+/g,' ');
  // Split words at whitespace
  let splitStrings = normalizedQueryString.split(" ");
  let words = splitStrings.map((text, i) => {return {ix: i + 1, text: text};});
  words = words.filter((word) => word.text !== "");
  return words;
}

// ----------------------------------------------------------------------------
// Token functions
// ----------------------------------------------------------------------------

enum MajorPartsOfSpeech {
  ROOT,
  VERB,
  ADJECTIVE,
  ADVERB,
  NOUN,
  VALUE,
  GLUE,
  WHWORD,
  SYMBOL,
}

enum MinorPartsOfSpeech {
  ROOT,
  // Verb
  VB,   // verb, generic (eat)
  VBD,  // past-tense verb (ate)
  VBN,  // past-participle verb (eaten)
  VBP,  // infinitive verb (eat)
  VBZ,  // presnt-tense verb (eats)
  VBF,  // future-tense verb (eat)
  CP,   // copula (is, was, were)
  VBG,  // gerund verb (eating)
  // Adjective
  JJ,   // adjective, generic (big)
  JJR,  // comparative adjective (bigger)
  JJS,  // superlative adjective (biggest)
  // Adverb
  RB,   // adverb, generic (quickly)
  RBR,  // comparative adverb (cooler)
  RBS,  // superlative adverb (coolest (looking))
  // Noun
  NN,   // noun, singular (dog) 
  NNPA, // acronym (FBI)
  NNAB, // abbreviation (jr.)
  NG,   // gerund noun (eating, winning, but used as a noun)
  PRP,  // personal pronoun (I, you, she)
  PP,   // possessive pronoun (my, one's)
  // Legacy Noun
  NNP,  // Singular proper noun (Smith)
  NNPS, // Plural proper noun (Smiths)
  NNO,  // Possessive noun (people's)
  NNS,  // Plural noun (people)
  NNA,  // @TODO figure out what NNA is.
  NNQ,  // Quoted text
  // Glue
  FW,   // foreign word (voila) 
  IN,   // preposition (of, in, by)
  MD,   // modal verb (can, should)
  CC,   // coordinating conjunction (and, but, or)
  PDT,  // predeterminer (some, all, any)
  DT,   // determiner (the)
  UH,   // interjection (oh, oops)
  EX,   // existential there (there)
  // Value
  CD,   // cardinal value (one, two, first)
  DA,   // date (june 5th 1998)
  NU,   // number (100, one hundred)
  // Symbol
  LT,   // Symbol (<)
  GT,   // Symbol (>)
  GTE,  // Symbol (>=)
  LTE,  // Symbol (<=)
  EQ,   // Symbol (=)
  NEQ,  // Symbol (!=)
  PLUS, // Symbol (+)
  MINUS,// Symbol (-)
  DIV,  // Symbol (/)
  MUL,  // Symbol (*)
  POW,  // Symbol (^)
  SEP,  // Separator (, ; : ")
  POS,  // Possessive ending ('s)
  // Wh- word
  WDT,  // Wh-determiner (that what whatever which whichever)
  WP,   // Wh-pronoun (that what whatever which who whom)
  WPO,  // Wh-pronoun possessive (whose)
  WRB   // Wh-adverb (however whenever where why)
}

interface Token {
  ix: number,
  start?: number,
  end?: number,
  originalWord: string,
  normalizedWord: string,
  POS: MinorPartsOfSpeech,
  properties: Array<Properties>,
  node?: Node,
  prev?: Token,
  next?: Token,
}

function newToken(text: string): Token {
  let token = formToken({ix: 0, text: text});
  token.properties.push(Properties.IMPLICIT);
  return token;
}

function cloneToken(token: Token): Token {
  let clone: Token = {
    ix: token.ix,
    originalWord: token.originalWord,
    normalizedWord: token.normalizedWord,
    POS: token.POS,
    properties: [],
  };
  token.properties.map((property) => clone.properties.push(property));
  return clone;
}

enum Properties {
  // Node properties
  ROOT,
  // EVE attributes
  ENTITY,
  COLLECTION,
  ATTRIBUTE,
  // Function properties
  FUNCTION,
  OUTPUT,
  INPUT,
  ARGUMENT,
  AGGREGATE,
  CALCULATE,
  OPERATOR,
  // Token properties
  QUANTITY,
  PROPER,
  PLURAL,
  POSSESSIVE,
  BACKRELATIONSHIP,
  COMPARATIVE,
  SUPERLATIVE,
  PRONOUN,  
  SEPARATOR,
  CONJUNCTION,
  QUOTED,
  SETTER,
  SUBSUMED,
  COMPOUND,
  // Modifiers
  NEGATES,
  GROUPING,
  IMPLICIT,
}

// take an input string, extract tokens
function formToken(word: Word): Token {
  // Every word is tagged a noun unless some rule says otherwise
  let POS: MinorPartsOfSpeech = MinorPartsOfSpeech.NN;
  let properties: Array<Properties> = [];
  let originalWord = word.text;
  let normalizedWord = originalWord;
  let found = false;
  
  let upperCaseLetters = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
  let lowerCaseLetters = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z'];
  let digits = ['1','2','3','4','5','6','7','8','9','0'];
  let separators = [',',':',';','"'];
  let operators = ['+','-','*','/','^'];
  let comparators = ['>','>=','<','<=','=','!='];
  
  // Most of the following vectors were taken from NLP Compromise
  // https://github.com/nlp-compromise/nlp_compromise
  // Copyright (c) 2016 Spencer Kelly: 
  // Licensed under the MIT License: https://github.com/nlp-compromise/nlp_compromise/blob/master/LICENSE.txt
  let preDeterminers = ['all'];
  let determiners = ['this', 'any', 'enough', 'each', 'every', 'these', 'another', 'plenty', 'whichever', 'neither', 'an', 'a', 'least', 'own', 'few', 'both', 'those', 'the', 'that', 'various', 'what', 'either', 'much', 'some', 'else', 'no'];
  let copulae = ['am', 'is', 'are', 'was', 'were', 'as', 'am', 'be', 'has', 'become', 'became', 'seemed', 'seems', 'seeming'];
  let conjunctions = ['yet', 'therefore', 'or', 'while', 'nor', 'whether', 'though', 'because', 'but', 'for', 'and', 'if', 'before', 'although', 'plus', 'versus', 'not'];
  let prepositions = ['with', 'until', 'onto', 'of', 'into', 'out', 'except', 'across', 'by', 'between', 'at', 'down', 'as', 'from', 'around', 'among', 'upon', 'amid', 'to', 'along', 'since', 'about', 'off', 'on', 'within', 'in', 'during', 'per', 'without', 'throughout', 'through', 'than', 'via', 'up', 'unlike', 'despite', 'below', 'unless', 'towards', 'besides', 'after', 'whereas','amongst', 'atop', 'barring', 'circa', 'mid', 'midst', 'notwithstanding', 'sans', 'thru', 'till', 'versus'];
  let possessivePronouns = ['mine', 'something', 'none', 'anything', 'anyone', 'theirs', 'himself', 'ours', 'his', 'my', 'their', 'yours', 'your', 'our', 'its', 'nothing', 'herself', 'hers', 'themselves', 'everything', 'myself', 'itself', 'her'];
  let personalPronouns = ['it', 'they', 'i', 'them', 'you', 'she', 'me', 'he', 'him', 'ourselves', 'us', 'we', 'yourself'];
  let modals = ['can', 'may', 'could', 'might', 'will', 'would', 'must', 'shall', 'should', 'ought'];
  let whPronouns = ['who', 'what', 'whom'];
  let whDeterminers = ['whatever', 'which'];
  let whPossessivePronoun = ['whose'];
  let whAdverbs = ['how', 'when', 'however', 'whenever', 'where', 'why'];   

  // We have three cases: the word is a symbol (of which there are various kinds), a number, or a string
  
  // ----------------------
  // Case 1: handle symbols
  // ----------------------
  if (!found) {
    if (operators.indexOf(originalWord) >= 0) {
      found = true;
      properties.push(Properties.OPERATOR);
      switch (originalWord) {
        case "+":
          POS = MinorPartsOfSpeech.PLUS;
          break;
        case "-":
          POS = MinorPartsOfSpeech.MINUS;
          break;
        case "*":
          POS = MinorPartsOfSpeech.MUL;
          break;
        case "/":
          POS = MinorPartsOfSpeech.DIV;
          break;
        case "^":
          POS = MinorPartsOfSpeech.POW;
          break;
      }
    } else if (comparators.indexOf(originalWord) >= 0) {
      found = true;
      properties.push(Properties.COMPARATIVE);
      switch (originalWord) {
        case ">":
          POS = MinorPartsOfSpeech.GT;
          break;
        case ">=":
          POS = MinorPartsOfSpeech.GTE;
          break;
        case "<":
          POS = MinorPartsOfSpeech.LT;
          break;
        case "<=":
          POS = MinorPartsOfSpeech.LTE;
          break;
        case "=":
          POS = MinorPartsOfSpeech.EQ;
          break;
        case "!=":
          POS = MinorPartsOfSpeech.NEQ;
          break;
      }
    } else if (separators.indexOf(originalWord) >= 0) {
      found = true;
      properties.push(Properties.SEPARATOR);
      POS = MinorPartsOfSpeech.SEP;
      if (originalWord === `"`) {
        properties.push(Properties.QUOTED);
      }
    } else if (originalWord === "'s" || originalWord === "'") {
      properties.push(Properties.POSSESSIVE);  
      POS = MinorPartsOfSpeech.POS;    
    }
  }
  // ----------------------
  // Case 2: handle numbers
  // ----------------------
  if (!found) {
    if (digits.indexOf(originalWord[0]) >= 0 && isNumeric(originalWord)) {
      found = true;
      properties.push(Properties.QUANTITY);
      POS = MinorPartsOfSpeech.NU;
    }
  }
  // ----------------------
  // Case 3: handle strings
  // ----------------------
  if (!found) {
    // Normalize the word
    normalizedWord = normalizedWord.toLowerCase();
    let before = normalizedWord;
    normalizedWord = singularize(normalizedWord);
    if (before !== normalizedWord) {
      properties.push(Properties.PLURAL);
    }
    // Find the POS in the dictionary, apply some properties based on the word
    // Determiners
    if (determiners.indexOf(normalizedWord) >= 0) {
      POS = MinorPartsOfSpeech.DT;
    // Modals
    } else if (modals.indexOf(normalizedWord) >= 0) {
      POS = MinorPartsOfSpeech.MD;
    // Predeterminers
    } else if (preDeterminers.indexOf(normalizedWord) >= 0) {
      POS = MinorPartsOfSpeech.PDT;
    // Copulae
    } else if (copulae.indexOf(normalizedWord) >= 0) {
      POS = MinorPartsOfSpeech.CP;
    // Prepositions
    } else if (prepositions.indexOf(normalizedWord) >= 0) {
      POS = MinorPartsOfSpeech.IN;
    // Personal pronouns
    } else if (personalPronouns.indexOf(normalizedWord) >= 0) {
      POS = MinorPartsOfSpeech.PRP; 
      properties.push(Properties.PRONOUN);
    // Possessive pronouns
    } else if (possessivePronouns.indexOf(normalizedWord) >= 0) {
      POS = MinorPartsOfSpeech.PRP; 
      properties.push(Properties.PRONOUN);
      properties.push(Properties.POSSESSIVE);
    // Conjunctions
    } else if (conjunctions.indexOf(normalizedWord) >= 0) {
      POS = MinorPartsOfSpeech.CC; 
      properties.push(Properties.CONJUNCTION);
    // Wh-words
    } else if (whPronouns.indexOf(normalizedWord) >= 0) {
      POS = MinorPartsOfSpeech.WP; 
    } else if (whDeterminers.indexOf(normalizedWord) >= 0) {
      POS = MinorPartsOfSpeech.WDT; 
    } else if (whAdverbs.indexOf(normalizedWord) >= 0) {
      POS = MinorPartsOfSpeech.WRB; 
    } else if (whPossessivePronoun.indexOf(normalizedWord) >= 0) {
      POS = MinorPartsOfSpeech.WPO;
      properties.push(Properties.POSSESSIVE) 
    }
    // Set grouping property
    let groupingWords = ['per', 'by'];
    let negatingWords = ['except', 'without', 'sans', 'not', 'nor', 'neither', 'no'];
    let pluralWords = ['their'];
    if (groupingWords.indexOf(normalizedWord) >= 0) {
      properties.push(Properties.GROUPING);
    // Set negate property        
    } else if (negatingWords.indexOf(normalizedWord) >= 0) {
      properties.push(Properties.NEGATES);
    // Set plural property
    } else if (pluralWords.indexOf(normalizedWord) >= 0) {
      properties.push(Properties.PLURAL);
    }
    // If the word is still a noun, if it is upper case than it is a proper noun 
    if (getMajorPOS(POS) === MajorPartsOfSpeech.NOUN) {
      if (upperCaseLetters.indexOf(originalWord[0]) >= 0) {
        properties.push(Properties.PROPER);
      }
    }
  }
  // Build the token
  let token: Token = {
    ix: word.ix, 
    originalWord: word.text, 
    normalizedWord: normalizedWord,
    POS: POS,
    properties: properties,
  };
  return token;
}

function getMajorPOS(minorPartOfSpeech: MinorPartsOfSpeech): MajorPartsOfSpeech {
  // ROOT
  if (minorPartOfSpeech === MinorPartsOfSpeech.ROOT) {
    return MajorPartsOfSpeech.ROOT;
  }
  // Verb
  let verbs = ['VB','VBD','VBN','VBP','VBZ','VBF','VBG'];
  if (verbs.indexOf(MinorPartsOfSpeech[minorPartOfSpeech]) >= 0) {
        return MajorPartsOfSpeech.VERB;
  }
  // Adjective
  let adjectives = ['JJ','JJR','JJS'];
  if (adjectives.indexOf(MinorPartsOfSpeech[minorPartOfSpeech]) >= 0) {
        return MajorPartsOfSpeech.ADJECTIVE;
  }
  // Adverb
  let adverbs = ['RB','RBR','RBS'];
  if (adverbs.indexOf(MinorPartsOfSpeech[minorPartOfSpeech]) >= 0) {
        return MajorPartsOfSpeech.ADVERB;
  }
  // Noun
  let nouns = ['NN','NNA','NNPA','NNAB','NNP','NNPS','NNS','NNQ','NNO','NG','PRP','PP'];
  if (nouns.indexOf(MinorPartsOfSpeech[minorPartOfSpeech]) >= 0) {
    return MajorPartsOfSpeech.NOUN;
  }
  // Value
  let values = ['CD','DA','NU'];
  if (values.indexOf(MinorPartsOfSpeech[minorPartOfSpeech]) >= 0) {
    return MajorPartsOfSpeech.VALUE;
  }
  // Glue
  let glues = ['FW','IN','CP','MD','CC','PDT','DT','UH','EX'];
  if (glues.indexOf(MinorPartsOfSpeech[minorPartOfSpeech]) >= 0) {
    return MajorPartsOfSpeech.GLUE;
  }  
  // Symbol
  let symbols = ['LT','GT','LTE','GTE','EQ','NEQ',
                 'PLUS','MINUS','DIV','MUL','POW',
                 'SEP','POS'];
  if (symbols.indexOf(MinorPartsOfSpeech[minorPartOfSpeech]) >= 0) {
    return MajorPartsOfSpeech.SYMBOL;
  }
  // Wh-Word
  let whWords = ['WDT','WP','WPO','WRB'];
  if (whWords.indexOf(MinorPartsOfSpeech[minorPartOfSpeech]) >= 0) {
    return MajorPartsOfSpeech.WHWORD;
  }
}

// Wrap pluralize to special case certain words it gets wrong
export function singularize(word: string): string {
  let specialCases = ["his", "times", "has", "downstairs", "its", "'s"];
  for (let specialCase of specialCases) {
    if (specialCase === word) {
      return word;
    }
  }
  return pluralize(word, 1);
}

// ----------------------------------------------------------------------------
// Tree functions
// ----------------------------------------------------------------------------

interface Node {
  ix: number,
  name: string,
  parent: Node,
  children: Array<Node>,
  entity?: Entity,
  collection?: Collection,
  attribute?: Attribute,
  fxn?: BuiltInFunction,
  constituents?: Array<Node>,
  relationships: Array<Relationship>,
  token: Token,
  found: boolean,
  properties: Array<Properties>,
  hasProperty(Properties): boolean;
  toString(number?: number): string;
  next(): Node;
  prev(): Node;
  addChild(node: Node): void;
}

function cloneNode(node: Node): Node {
  let token = cloneToken(node.token);
  let cloneNode = newNode(token);
  cloneNode.entity = node.entity;
  cloneNode.collection = node.collection;
  cloneNode.attribute = node.attribute;
  cloneNode.fxn = node.fxn;
  cloneNode.found = node.found;
  node.properties.map((property) => cloneNode.properties.push(property));
  return cloneNode;
}

function newNode(token: Token): Node {
  let node: Node = {
    ix: token.ix,
    name: token.normalizedWord,
    parent: undefined,
    children: [],
    token: token, 
    properties: token.properties,
    relationships: [],
    found: false,
    hasProperty: hasProperty,
    toString: nodeToString,
    next: nextNode,
    prev: previousNode,
    addChild: addChild,
  };
  token.node = node;
  function hasProperty(property: Properties): boolean {
  let found = node.properties.indexOf(property);
  if (found !== -1) {
      return true;
    } else {
      return false;
    }
  }
  function nextNode(): Node {
    let token = node.token;
    let nextToken = token.next;
    if (nextToken !== undefined) {
      return nextToken.node;
    }
    return undefined;
  }
  function previousNode(): Node {
    let token = node.token;
    let prevToken = token.prev;
    if (prevToken !== undefined) {
      return prevToken.node;
    }
    return undefined;
  }
  function addChild(newChild: Node): void {
    node.children.push(newChild);
    newChild.parent = node;
  }
  function nodeToString(depth?: number): string {
    if (depth === undefined) {
      depth = 0;
    }
    let childrenStrings = node.children.map((childNode) => childNode.toString(depth+1)).join("\n");
    let children = childrenStrings.length > 0 ? "\n" + childrenStrings : "";
    let indent = Array(depth+1).join(" ");
    let index = node.ix === undefined ? "+ " : `${node.ix}: `;
    let properties = node.properties.length === 0 ? "" : `(${node.properties.map((property: Properties) => Properties[property]).join("|")})`;
    let attribute = node.attribute === undefined ? "" : `[${node.attribute.variable}]`;
    let entity = node.entity === undefined ? "" : `[${node.entity.displayName}]`;
    let collection = node.collection === undefined ? "" : `[${node.collection.displayName}]`;
    let fxn = node.fxn === undefined ? "" : `[${node.fxn.name}]`;
    let negated = node.hasProperty(Properties.NEGATES) ? "!" : "";
    let found = node.found ? "*" : " ";
    properties = properties.length === 2 ? "" : properties;
    let nodeString = `|${found}${indent}${index}${node.name} ${negated}${fxn}${entity}${collection}${attribute} ${properties}${children}`; 
    return nodeString;
  }
  return node;  
}

//------------------------------------
// Various node manipulation functions
//------------------------------------

// Removes the node and its children from the tree, 
// and makes it a child of the target node
function reroot(node: Node, target: Node): void {
  node.parent.children.splice(node.parent.children.indexOf(node),1);  
  target.addChild(node);
}

// Removes a node from the tree
// The node's children get added to its parent
// returns the node or undefined if the operation failed
function removeNode(node: Node): Node {
  if (node.hasProperty(Properties.ROOT)) {
    return undefined;
  }
  if (node.parent === undefined && node.children.length === 0) {
    return undefined;
  }
  let parent: Node = node.parent;
  let children: Array<Node> = node.children;
  // Rewire
  parent.children = parent.children.concat(children);
  parent.children.sort((a,b) => a.ix - b.ix);
  children.map((child) => child.parent = parent);
  // Get rid of references on current node
  parent.children.splice(parent.children.indexOf(node),1);
  node.parent = undefined;
  node.children = [];
  return node;
}

function removeBranch(node: Node): Node {
  let parent = node.parent;
  if (parent !== undefined) {
    parent.children.splice(parent.children.indexOf(node),1);
    node.parent = undefined;
    return node;  
  }
  return undefined;
}

// Returns the first ancestor node that has been found
function previouslyMatched(node: Node, ignoreFunctions?: boolean): Node {
  if (ignoreFunctions === undefined) {
    ignoreFunctions = false;
  }
  if (node.parent === undefined) {
    return undefined;
  } else if (!ignoreFunctions && 
             (node.parent.hasProperty(Properties.SETTER) ||
             (node.parent.hasProperty(Properties.FUNCTION) && !node.parent.hasProperty(Properties.CONJUNCTION))))  {
    return undefined;
  } else if (node.parent.hasProperty(Properties.ENTITY) ||
             node.parent.hasProperty(Properties.ATTRIBUTE) ||
             node.parent.hasProperty(Properties.COLLECTION)) {
    return node.parent;
  } else {
    return previouslyMatched(node.parent,ignoreFunctions);
  }
}

// Returns the first ancestor node that has been found
function previouslyMatchedEntityOrCollection(node: Node, ignoreFunctions?: boolean): Node {
  if (ignoreFunctions === undefined) {
    ignoreFunctions = false;
  }
  if (node.parent === undefined) {
    return undefined;
  } else if (!ignoreFunctions && 
             (node.parent.hasProperty(Properties.SETTER) ||
             (node.parent.hasProperty(Properties.FUNCTION) && !node.parent.hasProperty(Properties.CONJUNCTION))))  {
    return undefined;
  } else if (node.parent.hasProperty(Properties.ENTITY) ||
             node.parent.hasProperty(Properties.COLLECTION)) {
    return node.parent;
  } else {
    return previouslyMatchedEntityOrCollection(node.parent,ignoreFunctions);
  }
}

// Returns the first ancestor node that has been found
function previouslyMatchedAttribute(node: Node, ignoreFunctions?: boolean): Node {
  if (ignoreFunctions === undefined) {
    ignoreFunctions = false;
  }
  if (node.parent === undefined) {
    return undefined;
  } else if (!ignoreFunctions && 
             (node.parent.hasProperty(Properties.SETTER) ||
             (node.parent.hasProperty(Properties.FUNCTION) && !node.parent.hasProperty(Properties.CONJUNCTION))))  {
    return undefined;
  } else if (node.parent.hasProperty(Properties.ATTRIBUTE)) {
    return node.parent;
  } else {
    return previouslyMatchedAttribute(node.parent,ignoreFunctions);
  }
}

// Inserts a node after the target, moving all of the
// target's children to the node
// Before: [Target] -> [Children]
// After:  [Target] -> [Node] -> [Children]
function insertAfterNode(node: Node, target: Node): void {
  node.parent = target;
  node.children = target.children;
  target.children.map((n) => n.parent = node);
  target.children = [node];
}

function insertBeforeNode(node: Node, target: Node): void {
  let parent = target.parent;
  if (parent !== undefined) {
    parent.addChild(node);
    parent.children.splice(parent.children.indexOf(target),1);
    node.addChild(target);
  }
}

// Find all leaf nodes stemming from a given node
function findLeafNodes(node: Node): Array<Node> {
  if(node.children.length === 0) {
    return [node];
  }
  else {
    let foundLeafs = node.children.map(findLeafNodes);
    let flatLeafs = flattenNestedArray(foundLeafs);
    return flatLeafs;
  }
} 

/*function moveNode(node: Node, target: Node): void {
  if (node.hasProperty(Properties.ROOT)) {
    return;
  }
  let parent = node.parent;
  parent.children.splice(parent.children.indexOf(node),1);
  parent.children = parent.children.concat(node.children);
  node.children.map((child) => child.parent = parent);
  node.children = [];
  node.parent = target;
  target.children.push(node);
}*/

// Finds a parent node with the specified property, 
// returns undefined if no node was found
function findParentWithProperty(node: Node, property: Properties): Node {
  if (node.parent === undefined) {
    return undefined;
  }
   else if (node.parent.hasProperty(property)) {
    return node.parent;
  } else {
    return findParentWithProperty(node.parent,property);
  } 
}

// Finds a parent node with the specified property, 
// returns undefined if no node was found
function findChildWithProperty(node: Node, property: Properties): Node {
  if (node.children.length === 0) {
    return undefined;
  }
  if (node.hasProperty(property)) {
    return node;
  } else {
    let childrenWithProperty = node.children.filter((child) => child.hasProperty(property));
    if (childrenWithProperty !== undefined) {
      return childrenWithProperty[0];
    } else {
      let results = node.children.map((child) => findChildWithProperty(child,property)).filter((result) => result !== undefined);
      if (results.length > 0) {
        return results[0];
      }
    }
  } 
}

// Finds a parent node with the specified POS, 
// returns undefined if no node was found
function findParentWithPOS(node: Node, majorPOS: MajorPartsOfSpeech): Node {
  if (getMajorPOS(node.token.POS) === MajorPartsOfSpeech.ROOT) {
    return undefined;
  }
  if (getMajorPOS(node.parent.token.POS) === majorPOS) {
    return node.parent;
  } else {
    return findParentWithPOS(node.parent,majorPOS);
  } 
}

/*
// Sets node to be a sibling of its parent
// Before: [Grandparent] -> [Parent] -> [Node] 
// After:  [Grandparent] -> [Parent]
//                       -> [Node]
function promoteNode(node: Node): void {
  if (node.parent.hasProperty(Properties.ROOT)) {
    return;
  }
  let newSibling = node.parent;
  let newParent = newSibling.parent;
  // Set parent
  node.parent = newParent;
  // Remove node from parent's children
  newSibling.children.splice(newSibling.children.indexOf(node),1);
  // Add node to new parent's children
  newParent.children.push(node);
}*/

// Makes the node's parent a child of the node.
// The node's grandparent is then the node's parent
// Before: [Grandparent] -> [Parent] -> [Node]
// After: [Grandparen] -> [Node] -> [Parent]
function makeParentChild(node: Node): void {
  let parent = node.parent;
  // Do not swap with root
  if (parent.hasProperty(Properties.ROOT)) {
    return;
  }
  // Set parents
  node.parent = parent.parent
  parent.parent = node;
  // Remove node as a child from parent
  parent.children.splice(parent.children.indexOf(node),1);
  // Set children
  node.children = node.children.concat(parent);
  node.parent.children.push(node);
  node.parent.children.splice(node.parent.children.indexOf(parent),1);
}


// Swaps a node with its parent. The node's parent
// is then the parent's parent, and its child is the parent.
// The parent gets the node's children
function swapWithParent(node: Node): void {
  let parent = node.parent;
  let pparent = parent.parent;
  if (parent.hasProperty(Properties.ROOT)) {
    return;
  }
  parent.parent = node;
  parent.children = node.children;
  pparent.children.splice(pparent.children.indexOf(parent),1);
  node.parent = pparent;
  node.children = [parent];
  pparent.children.push(node);
}

interface Context {
  entities: Array<Entity>,
  collections: Array<Collection>,
  attributes: Array<Attribute>,
  setAttributes: Array<Attribute>, 
  fxns: Array<BuiltInFunction>,
  groupings: Array<Node>,
  relationships: Array<Relationship>,
  found: Array<Node>,
  maybeEntities: Array<Node>,
  maybeAttributes: Array<Node>,
  maybeCollections: Array<Node>,
  maybeFunctions: Array<Node>,
  maybeArguments: Array<Node>,
}

function newContext(): Context {
  return {
    entities: [],
    collections: [],
    attributes: [],
    setAttributes: [],
    fxns: [],
    groupings: [],
    relationships: [],
    found: [],
    maybeEntities: [],
    maybeAttributes: [],
    maybeCollections: [],
    maybeFunctions: [],
    maybeArguments: [],
  };
}

export enum FunctionTypes {
  FILTER,
  AGGREGATE,
  BOOLEAN,
  CALCULATE,
  INSERT,
  SELECT,
  GROUP,
}

interface BuiltInFunction {
  name: string,
  type: FunctionTypes,
  attribute?: string,
  fields: Array<string>,
  project: boolean,
  negated?: boolean,
  node?: Node,
}

function stringToFunction(word: string): BuiltInFunction {
  switch (word) {
    case ">":
      return {name: ">", type: FunctionTypes.FILTER, fields: ["a", "b"], project: false};
    case "<":
      return {name: "<", type: FunctionTypes.FILTER, fields: ["a", "b"], project: false};
    case ">=":
      return {name: ">=", type: FunctionTypes.FILTER, fields: ["a", "b"], project: false};
    case "<=":
      return {name: "<=", type: FunctionTypes.FILTER, fields: ["a", "b"], project: false};
    case "=":
      return {name: "=", type: FunctionTypes.FILTER, fields: ["a", "b"], project: false};
    case "!=":
      return {name: "!=", type: FunctionTypes.FILTER, fields: ["a", "b"], project: false};     
    case "taller":
      return {name: ">", type: FunctionTypes.FILTER, attribute: "height", fields: ["a", "b"], project: false};
    case "shorter":
      return {name: "<", type: FunctionTypes.FILTER, attribute: "length", fields: ["a", "b"], project: false};
    case "longer":
      return {name: ">", type: FunctionTypes.FILTER, attribute: "length", fields: ["a", "b"], project: false};
    case "younger":
      return {name: "<", type: FunctionTypes.FILTER, attribute: "age", fields: ["a", "b"], project: false};
    case "&":
    case "and":
      return {name: "and", type: FunctionTypes.BOOLEAN, fields: [], project: false};
    case "or":
      return {name: "or", type: FunctionTypes.BOOLEAN, fields: [], project: false};
    case "total":
    case "sum":
      return {name: "sum", type: FunctionTypes.AGGREGATE, fields: ["sum", "value"], project: true};
    case "average":
    case "avg":
    case "mean":
      return {name: "average", type: FunctionTypes.AGGREGATE, fields: ["average", "value"], project: true};
    case "plus":
    case "add":
    case "+":
      return {name: "+", type: FunctionTypes.CALCULATE, fields: ["result", "a", "b"], project: true};
    case "subtract":
    case "minus":
    case "-":
      return {name: "-", type: FunctionTypes.CALCULATE, fields: ["result", "a", "b"], project: true};
    case "times":
    case "multiply":
    case "multiplied":
    case "multiplied by":
    case "*":
      return {name: "*", type: FunctionTypes.CALCULATE, fields: ["result", "a", "b"], project: true};
    case "divide":
    case "divided":
    case "divided by":
    case "/":
      return {name: "/", type: FunctionTypes.CALCULATE, fields: ["result", "a", "b"], project: true};
    case "is a":
    case "is an":
      return {name: "insert", type: FunctionTypes.INSERT, fields: ["entity", "attribute", "set to"], project: false}; 
    case "'s":
    case "'":
      return {name: "select", type: FunctionTypes.SELECT, fields: ["entity", "attribute"], project: false}; 
    case "by":
    case "per":
      return {name: "group", type: FunctionTypes.GROUP, fields: ["root", "entity"], project: false};
    default:
      return undefined;
  }  
}

function findFunction(node: Node, context: Context): boolean {
  log(`Searching for function: ${node.name}`);
  let fxn = stringToFunction(node.name); 
  if (fxn === undefined) {  
    log(` Not Found: ${node.name}`);
    return false;
  }
  log(` Found: ${fxn.name}`);
  node.fxn = fxn;
  fxn.node = node;
  // Add arguments to the node
  let args = fxn.fields.map((name, i) => {
    let argToken = newToken(name);
    let argNode = newNode(argToken);
    argNode.properties.push(Properties.ARGUMENT);
    if (fxn.project && i === 0) {
      argNode.properties.push(Properties.OUTPUT);
      argNode.found = true;
      let outputToken = newToken("output");
      let outputNode = newNode(outputToken);
      let outputAttribute = {
        id: outputNode.name,
        displayName: outputNode.name,
        variable: outputNode.name,
        node: outputNode,
        project: false,
      }
      outputNode.attribute = outputAttribute;
      outputNode.found = true;
      argNode.addChild(outputNode);          
    } else {
      argNode.properties.push(Properties.INPUT);
      if (argNode.name === "root") {
        argNode.properties.push(Properties.ROOT);
      }
    }
    return argNode;
  });
  node.properties.push(Properties.FUNCTION);
  for (let arg of args) {
    node.addChild(arg);
  }
  node.found = true;
  context.fxns.push(fxn);
  return true;
}

function formTree(node: Node, tree: Node, context: Context): any {  
  log("--------------------------------");
  log(node.toString());
  log(context);
  
  // Don't do anything with subsumed nodes
  if (node.hasProperty(Properties.SUBSUMED)) {
    log("Skipping...");
    return {tree: tree, context: context};
  }
  
  // -------------------------------------
  // Step 1: Build n-grams
  // -------------------------------------
  log("ngrams:");
  
  // Flatten the tree
  let nextNode = tree;
  let nodes: Array<Node> = [];
  while(nextNode !== undefined) {
    nodes.push(nextNode);
    nextNode = nextNode.next();
  }
  
  // Build ngrams
  // Initialize the ngrams with 1-grams
  let ngrams: Array<Array<Node>> = nodes.map((node) => [node]);
  // Shift off the root node
  ngrams.shift();
  let n = 4;
  let m = ngrams.length;
  let offset = 0;
  for (let i = 0; i < n - 1; i++) {
    let newNgrams: Array<Array<Node>> = [];
    for (let j = offset; j < ngrams.length; j++) {
      let thisNgram = ngrams[j];
      let nextNgram = ngrams[j + 1];
      // Break at the end of the ngrams
      if (nextNgram === undefined) {
        break;
      }
      // From the new ngram
      let newNgram = thisNgram.concat([nextNgram[nextNgram.length-1]]);
      newNgrams.push(newNgram);
    }
    offset = ngrams.length;
    ngrams = ngrams.concat(newNgrams);
  }
  
  // Check each ngram for a display name
  let matchedNgrams: Array<Array<Node>> = [];
  for (let i = ngrams.length - 1; i >= 0; i--) {
    let ngram = ngrams[i];    
    let allFound = ngram.every((node) => node.found);
    if (allFound !== true) {
      let displayName = ngram.map((node)=>node.name).join(" ").replace(/ '/g,'\'');
      log(displayName)
      let foundName = eve.findOne("index name",{ name: displayName });
      // If the display name is in the system, mark all the nodes as found 
      if (foundName !== undefined) {
        ngram.map((node) => node.found = true);
        matchedNgrams.push(ngram);
      } else {
        let foundAttribute = eve.findOne("entity eavs", { attribute: displayName });
        if (foundAttribute !== undefined) {
          ngram.map((node) => node.found = true);
          matchedNgrams.push(ngram);  
        } else {
          let fxn = stringToFunction(displayName);
          if (fxn !== undefined) {
            matchedNgrams.push(ngram);
          }
        }
      }
    }
  }
  
  // Turn matched ngrams into compound nodes
  for (let ngram of matchedNgrams) {
    // Don't do anything for 1-grams
    if (ngram.length === 1) {
      ngram[0].found = false
      continue;
    }
    let displayName = ngram.map((node)=>node.name).join(" ").replace(/ '/g,'\'');
    log (`Creating compound node: ${displayName}`);
    let lastGram = ngram[ngram.length - 1];
    let compoundToken = newToken(displayName);
    let compoundNode = newNode(compoundToken);
    compoundNode.constituents = ngram;
    compoundNode.constituents.map((node) => node.properties.push(Properties.SUBSUMED));
    compoundNode.ix = lastGram.ix;
    // Inherit properties from the nodes
    compoundNode.properties = lastGram.properties;    
    compoundNode.properties.push(Properties.COMPOUND);
    compoundNode.properties.splice(compoundNode.properties.indexOf(Properties.SUBSUMED),1); // Don't inherit subsumed property
    // The compound node results from the new node,
    // so the compound node replaces it
    node = compoundNode;
  }
  log('-------');

  // -------------------------------------
  // Step 2: Identify the node
  // -------------------------------------
  
  // Find a collection, entity, attribute, or function
  if (!node.found) {
    findCollection(node, context);
    if (!node.found) {
      findEntity(node, context); 
      if (!node.found) {
        findAttribute(node, context);
        if (!node.found) {
          findFunction(node, context);  
          if (!node.found) {
            log(node.name + " was not found anywhere!");
          }
        }
      }
    }
  }
  
  if (!node.found) {
    return {tree: tree, context: context};
  }
  
  // -------------------------------------
  // Step 3: Insert the node into the tree
  // -------------------------------------
  
  log("Matching: " + node.name);
  
  // If the node is compound, replace the last subsumed node with it
  if (node.hasProperty(Properties.COMPOUND)) {
    let subsumedNode = node.constituents[node.constituents.length - 2];
    if (subsumedNode.parent !== undefined) {
      log(`Replacing ${subsumedNode.name} with ${node.name}`)
      insertBeforeNode(node,subsumedNode);
      removeBranch(subsumedNode);
      return {tree: tree, context: context};  
    }
  // Handle functions
  } else if (node.hasProperty(Properties.FUNCTION)) {
    // Attach the function to the root
    tree.addChild(node);
    
    // If the node is a grouping node, attach the old root to the new one
    if (node.fxn.type === FunctionTypes.GROUP) {
      let newRoot = node.children[0];
      for (let child of tree.children) {
        if (child === node) {
          continue;
        } else {
          reroot(child, newRoot);
        }
        newRoot.found = true;
      }
    // If the node is a filter, attach filter nodes  
    } else if (node.fxn.type === FunctionTypes.FILTER) {
      if (node.fxn.attribute !== undefined) {
        for (let i = 0; i < node.fxn.fields.length; i++) {
          let nToken = newToken(node.fxn.attribute);
          let nNode = newNode(nToken);
          formTree(nNode, tree, context);
        }
      } else {
       let orphans = context.found.filter((n) => n.hasProperty(Properties.ATTRIBUTE));
       for (let orphan of orphans) {
          removeNode(orphan);
          formTree(orphan, tree, context);
          // Break when all args are filled
          if (node.children.every((n) => n.found)) {
            break;
          }
        } 
      }
    // Otherwise, just attach arguments that are applicable
    } else {  
      if (node.fxn.fields.length > 0) {
        let orphans = context.found.filter((n) => n.relationships.length === 0);
        for (let orphan of orphans) {
          removeNode(orphan);
          formTree(orphan, tree, context);
          // Break when all args are filled
          if (node.children.every((n) => n.found)) {
            break;
          }
        } 
      }
    }
  // Handle everything else
  } else {
    console.log("foo")
    console.log(node);
    console.log(context.found);
    // Find a relationship if we have to
    let relationship: Relationship = {type: RelationshipTypes.NONE};
    if (node.relationships.length === 0) {
      console.log("here")
      //let orphans = tree.children.filter((child) => child.relationships.length === 0 && child.children.length === 0);  
      for (let i = context.found.length -1; i >= 0; i--) {
        let foundNode = context.found[i]; 
        if (node.relationships.length === 0) {
          removeNode(node);
        }
        relationship = findRelationship(node, foundNode, context);
        if (relationship.type !== RelationshipTypes.NONE) {
          break;
        }
      }
    }
    
    // Place the node onto a function if one is open
    let openFunctions = context.fxns.filter((fxn) => !fxn.node.children.every((c) => c.found)).map((fxn) => fxn.node);
    for (let fxnNode of openFunctions) {
      let added = addNodeToFunction(node, fxnNode, context);
      if (added) {
        relationship.type = RelationshipTypes.DIRECT;
        break;
      }
    }
    
    // If no relationships were found, stick the node onto the root
    if (node.parent === undefined && node.relationships.length === 0) {
      tree.addChild(node);
    // If there is a relationship, but the node has no parent, just put it on the root
    } else if (node.parent === undefined) {
      console.log(node);
      let relatedNodes = node.relationships.map((r) => r.nodes);
      let flatRelatedNodes = flattenNestedArray(relatedNodes);
      let relatedAttribute = flatRelatedNodes.filter((n) => n.hasProperty(Properties.ATTRIBUTE)).shift();
      if (relatedAttribute !== undefined) {
        let root = findParentWithProperty(relatedAttribute, Properties.ROOT);
        if (root !== undefined) {
          root.addChild(node);
        } else {
          tree.addChild(node);
        }
      } else {
        tree.addChild(node);
      }
    }
    // Finally add any nodes implicit in the relationship    
    if (relationship.implicitNodes !== undefined && relationship.implicitNodes.length > 0) {
      for (let implNode of relationship.implicitNodes) {
        formTree(implNode, tree, context);
      }
    }
  }
  log("Tree:");
  log(tree.toString());
  return {tree: tree, context: context};
}

// Adds a node to an argument. If adding the node completes a select,
// a new node will be returned
function addNodeToFunction(node: Node, fxnNode: Node, context: Context): boolean {
  log("Matching with function: " + fxnNode.name);
  // Find the correct arg
  let arg: Node;
  if (node.hasProperty(Properties.ENTITY) || node.hasProperty(Properties.COLLECTION)) {
    arg = fxnNode.children.filter((c) => c.name === "entity")[0];
  } else if (node.hasProperty(Properties.ATTRIBUTE)) {
    arg = fxnNode.children.filter((c) => (c.name === "attribute" || c.name === "value" || c.name === "a" || c.name === "b") && !c.found)[0];
  } else if (node.hasProperty(Properties.FUNCTION)) {
    
  }
  // Add the node to the arg
  if (arg !== undefined) {
    arg.addChild(node);
    arg.found = true;  
    return true;
  } else {
    return false;
  }
}

// EAV Functions

interface Entity {
  id: string,
  displayName: string,
  node?: Node,
  refs?: Array<Node>,
  variable: string,
  project: boolean,
  handled?: boolean,
}

function cloneEntity(entity: Entity): Entity {
  let clone: Entity = {
    id: entity.id,
    displayName: entity.displayName,
    node: entity.node,
    variable: entity.variable,
    project: entity.project,
  }
  return clone;
}

interface Collection {
  id: string,
  displayName: string,
  node?: Node,
  refs?: Array<Node>,
  variable: string,
  project: boolean,
  handled?: boolean,
}

function cloneCollection(collection: Collection): Collection {
  let clone: Collection = {
    id: collection.id,
    displayName: collection.displayName,
    node: collection.node,
    variable: collection.variable,
    project: collection.project,
  }
  return clone;
}

interface Attribute {
  id: string,
  displayName: string,
  node?: Node,
  refs?: Array<Node>,
  variable: string,
  project: boolean,
  handled?: boolean,
}

// Returns the entity with the given display name.
// If the entity is not found, returns undefined
// Two error modes here: 
// 1) the name is not found in "display name"
// 2) the name is found in "display name" but not found in "entity"
// can 2) ever happen?
// Returns the collection with the given display name.
function findEveEntity(search: string): Entity {
  log("Searching for entity: " + search);
  let foundEntity;
  let name: string;
  // Try to find by display name first
  let display = eve.findOne("index name",{ name: search });
  if (display !== undefined) {
    foundEntity = eve.findOne("entity", { entity: display.id });
    name = search;
  // If we didn't find it that way, try again by ID
  } else {
    foundEntity = eve.findOne("entity", { entity: search });
  }
  // Build the entity
  if (foundEntity !== undefined) {
    if (name === undefined) {
      display = eve.findOne("display name",{ id: search });
      name = display.name;  
    }
    let entity: Entity = {
      id: foundEntity.entity,
      displayName: name,
      variable: foundEntity.entity,
      project: true,
    }
    log(" Found: " + entity.id);
    return entity;
  } else {
    log(" Not found: " + search);
    return undefined;  
  }
}
// Returns the collection with the given display name.
function findEveCollection(search: string): Collection {
  log("Searching for collection: " + search);
  let foundCollection;
  let name: string;
  // Try to find by display name first
  let display = eve.findOne("index name",{ name: search });
  if (display !== undefined) {
    foundCollection = eve.findOne("collection", { collection: display.id });
    name = search;
  // If we didn't find it that way, try again by ID
  } else {
    foundCollection = eve.findOne("collection", { collection: search });
  }
  // Build the collection
  if (foundCollection !== undefined) {
    if (name === undefined) {
      display = eve.findOne("display name",{ id: search });
      name = display.name;  
    }
    let collection: Collection = {
      id: foundCollection.collection,
      displayName: name,
      variable: name,
      project: true,
    }
    log(" Found: " + collection.id);
    return collection;
  } else {
    log(" Not found: " + search);
    return undefined;  
  }
}

// Returns the attribute with the given display name attached to the given entity
// If the entity does not have that attribute, or the entity does not exist, returns undefined
function findEveAttribute(name: string): Attribute {
  log("Searching for attribute: " + name);
  let foundAttribute = eve.findOne("entity eavs", { attribute: name });
  if (foundAttribute !== undefined) {
    let attribute: Attribute = {
      id: foundAttribute.attribute,
      displayName: name,
      variable: `${name}`.replace(/ /g,''),
      project: true,
    }
    log(" Found: " + name);
    log(attribute);
    return attribute;
  }
  log(" Not found: " + name);
  return undefined;
}

enum RelationshipTypes {
  NONE,
  DIRECT,
  ONEHOP,
  TWOHOP,
  INTERSECTION,
}

interface Relationship {
  links?: Array<string>,
  type: RelationshipTypes,
  nodes?: Array<Node>,
  implicitNodes?: Array<Node>,
}

function findRelationship(nodeA: Node, nodeB: Node, context: Context): Relationship {
  let relationship = {type: RelationshipTypes.NONE};
  if (nodeA === nodeB) {
    return relationship;
  }
  log(`Finding relationship between "${nodeA.name}" and "${nodeB.name}"`);
  // Sort the nodes in order
  // 1) Collection 
  // 2) Entity 
  // 3) Attribute
  nodeA.properties.sort((a, b) => a - b);
  nodeB.properties.sort((a, b) => a - b);
  let nodes = [nodeA,nodeB].sort((a, b) => a.properties[0] - b.properties[0]);
  nodeA = nodes[0]
  nodeB = nodes[1];

  // Find the proper relationship
  if (nodeA.hasProperty(Properties.ENTITY) && nodeB.hasProperty(Properties.ATTRIBUTE)) {
    relationship = findEntToAttrRelationship(nodeA, nodeB, context);
  } else if (nodeA.hasProperty(Properties.COLLECTION) && nodeB.hasProperty(Properties.ATTRIBUTE)) {
    relationship = findCollToAttrRelationship(nodeA, nodeB, context);
  } else if (nodeA.hasProperty(Properties.COLLECTION) && nodeB.hasProperty(Properties.COLLECTION)) {
    relationship = findCollToCollRelationship(nodeA, nodeB, context);
  }
  
  // Add relationships to the nodes and context
  if (relationship.type !== RelationshipTypes.NONE) {
    nodeA.relationships.push(relationship);
    nodeB.relationships.push(relationship);
    context.relationships.push(relationship);
  }
  return relationship;
  
  /*
  // If both nodes are Collections, find their relationship
  if (nodeA.hasProperty(Properties.COLLECTION) && nodeB.hasProperty(Properties.COLLECTION)) {
    relationship = findCollectionToCollectionRelationship(nodeA.collection, nodeB.collection);
  // If one node is an entity and the other is a collection 
  } else if (nodeA.hasProperty(Properties.COLLECTION) && nodeB.hasProperty(Properties.ENTITY)) {
    relationship = findCollectionToEntRelationship(nodeA.collection, nodeB.entity);
  } else if (nodeB.hasProperty(Properties.COLLECTION) && nodeA.hasProperty(Properties.ENTITY)) {
    relationship = findCollectionToEntRelationship(nodeB.collection, nodeA.entity);
  }*/
}

// e.g. "meetings john was in"
function findCollToEntRelationship(coll: Collection, ent: Entity): Relationship {
  log(`Finding Coll -> Ent relationship between "${coll.displayName}" and "${ent.displayName}"...`);
  /*if (coll === "collections") {
    if (eve.findOne("collection entities", { entity: ent.id })) {
      return { type: RelationshipTypes.DIRECT };
    }
  }*/
  if (eve.findOne("collection entities", { collection: coll.id, entity: ent.id })) {
    log("Found Direct relationship")
    return { type: RelationshipTypes.DIRECT };
  }
  
  let relationship = eve.query(``)
    .select("collection entities", { collection: coll.id }, "collection")
    .select("directionless links", { entity: ["collection", "entity"], link: ent.id }, "links")
    .exec();
  if (relationship.unprojected.length) {
    log("Found One-Hop Relationship");
    return { type: RelationshipTypes.ONEHOP };
  }/*
  // e.g. events with chris granger (events -> meetings -> chris granger)
  let relationships2 = eve.query(``)
    .select("collection entities", { collection: coll }, "collection")
    .select("directionless links", { entity: ["collection", "entity"] }, "links")
    .select("directionless links", { entity: ["links", "link"], link: ent }, "links2")
    .exec();
  if (relationships2.unprojected.length) {
    let entities = extractFromUnprojected(relationships2.unprojected, 1, 3);
    return { type: RelationshipTypes.TWOHOP };
  }*/
  log("  No relationship found");
  return { type: RelationshipTypes.NONE };
}

function findEntToAttrRelationship(ent: Node, attr: Node, context: Context): Relationship {
  log(`Finding Ent -> Attr relationship between "${ent.name}" and "${attr.name}"...`);
  // Check for a direct relationship
  // e.g. "Josh's age"
  let relationship = eve.findOne("entity eavs", { entity: ent.entity.id, attribute: attr.attribute.id });
  if (relationship) {
    log("  Found a direct relationship.");
    let attribute = attr.attribute;
    let varName = `${ent.name}|${attr.name}`.replace(/ /g,'');
    attribute.variable = varName;
    attribute.refs = [ent];
    attribute.project = true;
    ent.entity.handled = true;
    return {type: RelationshipTypes.DIRECT, nodes: [ent, attr], implicitNodes: []};
  }
  /*
  // Check for a one-hop relationship
  // e.g. "Salaries in engineering"
  let relationship = eve.query(``)
    .select("directionless links", { entity: entity.id }, "links")
    .select("entity eavs", { entity: ["links", "link"], attribute: attr.name }, "eav")
    .exec();
  if (relationship.unprojected.length) {
    log("Found One-Hop Relationship");
    log(relationship);
    // Find the one-hop link
    let entities = extractFromUnprojected(relationship.unprojected, 0, 2);
    let collections = findCommonCollections(entities)
    let linkID;
    if (collections.length > 0) {
      // @HACK Choose the correct collection in a smart way. 
      // Largest collection other than entity or testdata?
      linkID = collections[0];  
    }
    let entityAttribute: Attribute = {
      id: attr.name,
      displayName: attr.name,
      value: `${entity.displayName}|${attr.name}`,
      variable: `${entity.displayName}|${attr.name}`,
      node: attr,
      project: true,
    }
    attr.attribute = entityAttribute;
    context.attributes.push(entityAttribute);
    attr.properties.push(Properties.ATTRIBUTE);
    attr.found = true;
    return {links: [linkID], type: RelationshipTypes.ONEHOP, nodes: [entity.node, attr]};
  }
  /*
  let relationships2 = eve.query(``)
    .select("directionless links", { entity: entity.id }, "links")
    .select("directionless links", { entity: ["links", "link"] }, "links2")
    .select("entity eavs", { entity: ["links2", "link"], attribute: attr }, "eav")
    .exec();
  if (relationships2.unprojected.length) {
    let entities = extractFromUnprojected(relationships2.unprojected, 0, 3);
    let entities2 = extractFromUnprojected(relationships2.unprojected, 1, 3);
    //return { distance: 2, type: RelationshipTypes.ENTITY_ATTRIBUTE, nodes: [findCommonCollections(entities), findCommonCollections(entities2)] };
  }*/
  log("  No relationship found.");
  return { type: RelationshipTypes.NONE };
}

export function findCollToCollRelationship(collA: Node, collB: Node, context: Context): Relationship {  
  log(`Finding Coll -> Coll relationship between "${collA.collection.displayName}" and "${collB.collection.displayName}"...`);
  // are there things in both sets?
  let intersection = eve.query(`${collA.collection.displayName}->${collB.collection.displayName}`)
    .select("collection entities", { collection: collA.collection.id }, "collA")
    .select("collection entities", { collection: collB.collection.id, entity: ["collA", "entity"] }, "collB")
    .exec();
  // is there a relationship between things in both sets
  let relationships = eve.query(`relationships between ${collA.collection.displayName} and ${collB.collection.displayName}`)
    .select("collection entities", { collection: collA.collection.id }, "collA")
    .select("directionless links", { entity: ["collA", "entity"] }, "links")
    .select("collection entities", { collection: collB.collection.id, entity: ["links", "link"] }, "collB")
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
    // @TODO
    return {type: RelationshipTypes.NONE};
  } else if (intersectionSize > maxRel.count) {
    log(" Found Intersection relationship.");
    collB.collection.variable = collA.collection.variable;
    collB.collection.project = false;
    return {type: RelationshipTypes.INTERSECTION, nodes: [collA, collB]};
  } else if (maxRel.count === 0 && intersectionSize === 0) {
    return {type: RelationshipTypes.NONE};
  } else {
    // @TODO
    return {type: RelationshipTypes.NONE};
  }
}

function findCollToAttrRelationship(coll: Node, attr: Node, context: Context): Relationship {
  // Finds a direct relationship between collection and attribute
  // e.g. "pets' lengths"" => pet -> length
  log(`Finding Coll -> Attr relationship between "${coll.name}" and "${attr.name}"...`);
  let eveRelationship = eve.query(``)
    .select("collection entities", { collection: coll.collection.id }, "collection")
    .select("entity eavs", { entity: ["collection", "entity"], attribute: attr.attribute.id }, "eav")
    .exec();
  if (eveRelationship.unprojected.length > 0) {    
    log("  Found Direct Relationship");
    // Build an attribute node
    let attribute = attr.attribute;
    let varName = `${coll.name}|${attr.name}`.replace(/ /g,'');
    attribute.variable = varName;
    attribute.refs = [coll];
    attribute.project = true;
    return {type: RelationshipTypes.DIRECT, nodes: [coll, attr], implicitNodes: []};
  }
  // Finds a one hop relationship
  // e.g. "department salaries" => department -> employee -> salary
  eveRelationship = eve.query(``)
    .select("collection entities", { collection: coll.collection.id }, "collection")
    .select("directionless links", { entity: ["collection", "entity"] }, "links")
    .select("entity eavs", { entity: ["links", "link"], attribute: attr.attribute.id }, "eav")
    .exec();
  if (eveRelationship.unprojected.length > 0) {
    log("  Found One-Hop Relationship");
    log(eveRelationship)
    // Find the one-hop link
    let entities = extractFromUnprojected(eveRelationship.unprojected, 1, 3);
    let collections = findCommonCollections(entities)
    let linkID;
    if (collections.length > 0) {
      // @HACK Choose the correct collection in a smart way. 
      // Largest collection other than entity or testdata?
      linkID = collections[0];  
    }    
    // Fill in the attribute
    let foundCollection = findEveCollection(linkID);
    let linkToken = newToken(foundCollection.displayName);
    let linkCollection = newNode(linkToken);
    findCollection(linkCollection, context);
    let attribute = attr.attribute;
    let varName = `${linkCollection.name}|${attr.name}`.replace(/ /g,'');
    attribute.variable = varName;
    attribute.refs = [linkCollection];
    attribute.project = true;
    // Build a link attribute node
    let newName = coll.collection.variable;
    let nToken = newToken(newName);
    let nNode = newNode(nToken);
    let nAttribute: Attribute = {
      id: coll.collection.displayName,
      refs: [linkCollection],
      node: nNode,
      displayName: newName,
      variable: newName,
      project: false,
    }
    nNode.attribute = nAttribute;
    
    nNode.properties.push(Properties.ATTRIBUTE);
    nNode.found = true;
    // Project what we need to
    linkCollection.collection.project = true;
    coll.collection.project = true;
    let relationship = {type: RelationshipTypes.ONEHOP, nodes: [coll, attr], implicitNodes: [nNode]};
    nNode.relationships.push(relationship);
    linkCollection.relationships.push(relationship);
    return relationship;
  }
  /*
  // Not sure if this one works... using the entity table, a 2 hop link can
  // be found almost anywhere, yielding results like
  // e.g. "Pets heights" => pets -> snake -> entity -> corey -> height
   relationship = eve.query(``)
    .select("collection entities", { collection: coll.id }, "collection")
    .select("directionless links", { entity: ["collection", "entity"] }, "links")
    .select("directionless links", { entity: ["links", "link"] }, "links2")
   .select("entity eavs", { entity: ["links2", "link"], attribute: attr }, "eav")
    .exec();
  if (relationship.unprojected.length > 0) {
    return true;
  }*/
  log("  No relationship found");
  return {type: RelationshipTypes.NONE};
}

// Extracts entities from unprojected results
function extractFromUnprojected(coll, ix: number, size: number) {
  let results = [];
  for (let i = 0, len = coll.length; i < len; i += size) {
    results.push(coll[i + ix]["link"]);
  }
  return results;
}

// Find collections that entities have in common
function findCommonCollections(entities: Array<string>): Array<string> {
  let intersection = entityTocollectionsArray(entities[0]);
  intersection.sort();
  for (let entId of entities.slice(1)) {
    let cur = entityTocollectionsArray(entId);
    cur.sort();
    arrayIntersect(intersection, cur);
  }
  intersection.sort((a, b) => {
    return eve.findOne("collection", { collection: a })["count"] - eve.findOne("collection", { collection: b })["count"];
  });
  return intersection;
}

function entityTocollectionsArray(entity: string): Array<string> {
  let entities = eve.find("collection entities", { entity });
  return entities.map((a) => a["collection"]);
}

/*
function findCollectionAttribute(node: Node, collection: Collection, context: Context, relationship: Relationship): boolean {
  
  // The attribute is an attribute of members of the collection
  if (relationship.type === RelationshipTypes.DIRECT) {
    let collectionAttribute: Attribute = {
      id: node.name,
      displayName: node.name,
      collection: collection,
      value: `${collection.displayName}|${node.name}`,
      variable: `${collection.displayName}|${node.name}`,
      node: node,
      project: true,
    }
    node.attribute = collectionAttribute;
    context.attributes.push(collectionAttribute);
    node.found = true;
    return true;
  // The attribute is an attribute of members of a collection which are
  // also members of this collection
  } else if (relationship.type === RelationshipTypes.ONEHOP) {
    let linkID = relationship.links[0];
    let nCollection = findEveCollection(linkID);
    if (nCollection !== undefined) {
      // Create a new link node
      let token: Token = {
        ix: 0, 
        originalWord: nCollection.displayName, 
        normalizedWord: nCollection.displayName, 
        POS: MinorPartsOfSpeech.NN,
        properties: [], 
      };
      let nNode = newNode(token);
      insertAfterNode(nNode,collection.node);
      nNode.collection = nCollection;
      nCollection.node = nNode;
      context.collections.push(nCollection);
      // Build a collection attribute to link with parent
      let collectionAttribute: Attribute = {
        id: collection.displayName,
        displayName: collection.displayName,
        collection: nCollection,
        value: `${collection.displayName}`,
        variable: `${collection.displayName}`,
        node: nNode,
        project: false,
      }
      nNode.attribute = collectionAttribute;
      context.attributes.push(collectionAttribute);
      nNode.found = true;
      // Build an attribute for the referenced node
      let attribute: Attribute = {
        id: node.name,
        displayName: node.name,
        collection: nCollection,
        value: `${nCollection.displayName}|${node.name}`,
        variable: `${nCollection.displayName}|${node.name}`,
        node: node,
        project: true,
      }
      node.attribute = attribute;
      context.attributes.push(attribute);
      node.found = true; 
      return true;             
    } else {
      let entity = findEveEntity(linkID);
      if (entity !== undefined) {
        // @TODO handle entities
      }
    }
  }
  return false;
}*/

function findCollection(node: Node, context: Context): boolean {
  let collection = findEveCollection(node.name);
  if (collection !== undefined) {
    context.collections.push(collection);
    context.found.push(node);
    collection.node = node;
    node.collection = collection;
    node.found = true;
    node.properties.push(Properties.COLLECTION)
    return true;
  }
  return false;
}

function findEntity(node: Node, context: Context): boolean {
  let entity = findEveEntity(node.name);
  if (entity !== undefined) {
    context.entities.push(entity);
    context.found.push(node);
    entity.node = node;
    node.entity = entity;
    node.found = true;
    node.properties.push(Properties.ENTITY)
    return true;
  }
  return false;
}

function findAttribute(node: Node, context: Context): boolean {
  let attribute = findEveAttribute(node.name);
  if (attribute !== undefined) {
    context.attributes.push(attribute);
    context.found.push(node);
    attribute.node = node;
    node.attribute = attribute;
    node.found = true;
    node.properties.push(Properties.ATTRIBUTE)
    return true;
  }
  return false;
}

// ----------------------------------------------------------------------------
// Query functions
// ----------------------------------------------------------------------------

interface Field {
  name: string,
  value: string | number,
  variable: boolean,
}

interface Term {
  type: string,
  table?: string,
  fields: Array<Field>
  project?: Array<string>,
}

export interface Query {
  type: string,
  terms: Array<Term>,
  subqueries: Array<Query>,
  projects: Array<Term>,
  toString(number?: number): string;
}


function negateTerm(term: Term): Query {
  let negate = newQuery([term]);
  negate.type = "negate";
  return negate;
}

export function newQuery(terms?: Array<Term>, subqueries?: Array<Query>, projects?: Array<Term>): Query {
  if (terms === undefined) {
    terms = [];
  }
  if (subqueries === undefined) {
    subqueries = [];
  }
  if (projects === undefined) {
    projects = [];
  }
  // Dedupe terms
  let termStrings = terms.map(termToString);
  let uniqueTerms: Array<boolean> = termStrings.map((value, index, self) => {
    return self.indexOf(value) === index;
  }); 
  terms = terms.filter((term, index) => uniqueTerms[index]);
  let query: Query = {
    type: "query",
    terms: terms,
    subqueries: subqueries,
    projects: projects,
    toString: queryToString,
  }
  function queryToString(depth?: number): string {
    if (query.terms.length === 0 && query.projects.length === 0) {
      return "";
    }
    if (depth === undefined) {
      depth = 0;
    }
    let indent = Array(depth+1).join("\t");
    let queryString = indent + "(";
    // Map each term/subquery/project to a string
    let typeString = query.type;
    let termString = query.terms.map((term) => termToString(term,depth+1)).join("\n");
    let subqueriesString = query.subqueries.map((query) => query.toString(depth + 1)).join("\n");
    let projectsString = query.projects.map((term) => termToString(term,depth+1)).join("\n");
    // Now compose the query string
    queryString += typeString;
    queryString += termString === "" ? "" : "\n" + termString;
    queryString += subqueriesString === "" ? "" : "\n" + subqueriesString;
    queryString += projectsString === "" ? "" : "\n" + projectsString;
    // Close out the query
    queryString += "\n" + indent + ")";
    return queryString;
  }
  function termToString(term: Term, depth?: number): string {
    if (depth === undefined) {
      depth = 0;
    }
    let indent = Array(depth+1).join("\t");
    let termString = indent + "(";
    termString += `${term.type} `;
    termString += `${term.table === undefined ? "" : `"${term.table}" `}`;
    termString += term.fields.map((field) => `:${field.name} ${field.variable ? field.value : `"${field.value}"`}`).join(" ");
    termString += ")";
    return termString;
  }
  return query;
}

function formQuery(node: Node): Query {
  let query: Query = newQuery();
  let projectFields: Array<Field> = [];
  
  // Handle the child nodes
  let childQueries = node.children.map(formQuery);
  // Subsume child queries
  let combinedProjectFields: Array<Field> = [];
  for (let cQuery of childQueries) {
    query.terms = query.terms.concat(cQuery.terms);
    query.subqueries = query.subqueries.concat(cQuery.subqueries);
    // Combine unnamed projects
    for (let project of cQuery.projects) {
      if (project.table === undefined) {
        combinedProjectFields = combinedProjectFields.concat(project.fields);
      }
    }
  }
  if (combinedProjectFields.length > 0) {
    projectFields = combinedProjectFields;
  }
  // Sort terms
  query.terms = query.terms.sort((a,b) => {
    let aRank = setRank(a.table);
    let bRank = setRank(b.table);
    function setRank(table: string): number {
      if (table === "entity eavs") { return 1 }
      else if (table === "is a attributes") { return 2 }
      else { return 3 }
    }
    return aRank - bRank;
  });

  /*
  // If the node is a grouping node, stuff the query into a subquery
  // and take its projects
  if (node.hasProperty(Properties.GROUPING)) {
    let subquery = query;
    query = newQuery();
    query.projects = query.projects.concat(subquery.projects);
    subquery.projects = [];
    query.subqueries.push(subquery);
  }*/
  
  // Handle the current node
  
  // Just return at the root
  /*
  if (node.hasProperty(Properties.ROOT)) {
    // Reverse the order of fields in the projects
    for (let project of query.projects) {
      project.fields = project.fields.reverse();
    }
    return query;
  }*/
  // Handle functions -------------------------------
  if (node.hasProperty(Properties.FUNCTION) && ( 
      node.fxn.type === FunctionTypes.AGGREGATE || 
      node.fxn.type === FunctionTypes.CALCULATE ||
      node.fxn.type === FunctionTypes.FILTER)) {
    // Collection all input and output nodes which were found
    let allArgsFound = node.children.every((child) => child.found);
        
    // If we have the right number of arguments, proceed
    // @TODO surface an error if the arguments are wrong
    let output;
    if (allArgsFound) {
      log("Building function term for: " + node.name);
      let args = node.children.filter((child) => child.hasProperty(Properties.ARGUMENT)).map((arg) => arg.children[0]);
      let fields: Array<Field> = args.map((arg,i) => {
        return {name: `${node.fxn.fields[i]}`, 
                value: `${arg.attribute.variable}`, 
                variable: true};
      });
      let term: Term = {
        type: "select",
        table: node.fxn.name,
        fields: fields,
      }
      query.terms.push(term);
      // project output if necessary
      if (node.fxn.project === true) {
        projectFields = args.filter((arg) => arg.parent.hasProperty(Properties.OUTPUT))
                            .map((arg) => {return {name: `${node.fxn.name}`, 
                                                            value: `${arg.attribute.variable}`, 
                                                            variable: true}});
        query.projects = []; // Clears all previous projects
      }
    } 
  }
  if (node.hasProperty(Properties.FUNCTION) && ( 
      node.fxn.type === FunctionTypes.GROUP)) {
    let allArgsFound = node.children.every((child) => child.found);
    if (allArgsFound) {
      log("Building function term for: " + node.name);
      
      let groupNode = node.children[1].children[0];
      
      groupNode.collection.handled = false;
      let subquery = query;
      let query2 = formQuery(groupNode);
      query = newQuery();
      query.subqueries.push(subquery);
      query.terms = query.terms.concat(query2.terms); 
    }
  }
  // Handle attributes -------------------------------
  if (node.hasProperty(Properties.ATTRIBUTE) && !node.attribute.handled) {
    log("Building attribute term for: " + node.name);
    let fields: Array<Field> = [];
    let attr = node.attribute;
    if (attr.refs !== undefined) {
      for (let ref of attr.refs) {
        let entityVar = ref.entity !== undefined ? ref.entity.variable : ref.collection.variable;
        let fieldVar = ref.entity !== undefined ? false : true;
        if (fields.length === 0) {
          let entityField = {
            name: "entity", 
            value: entityVar, 
            variable: fieldVar,
          };
          fields.push(entityField);
        }
        // Build a query for each ref and merge it with the current query
        let refQuery = formQuery(ref);
        query.terms = query.terms.concat(refQuery.terms);
        if (refQuery.projects.length > 0) {
          projectFields = projectFields.concat(refQuery.projects[0].fields);
        }
      }      
    }             
    let attrField = {
      name: "attribute", 
      value: attr.id, 
      variable: false
    };
    fields.push(attrField);                
    let valueField = {
      name: "value", 
      value: attr.variable, 
      variable: true
    };
    fields.push(valueField);            
    let term: Term = {
      type: "select",
      table: "entity eavs",
      fields: fields,
    }
    query.terms.push(term);
    // project if necessary
    if (node.attribute.project) {
      let projectAttribute = {
        name: attr.variable, 
        value: attr.variable, 
        variable: true
      };
      projectFields.push(projectAttribute);
    }
    node.attribute.handled = true;
  }
  // Handle collections -------------------------------
  if (node.hasProperty(Properties.COLLECTION) && !node.collection.handled) {
    log("Building collection term for: " + node.name);
    let entityField = {
      name: "entity", 
      value: node.collection.variable, 
      variable: true
    };
    let collectionField = {
      name: "collection", 
      value: node.collection.id, 
      variable: false
    };
    let term: Term = {
      type: "select",
      table: "is a attributes",
      fields: [entityField, collectionField],
    }
    query.terms.push(term);
    // project if necessary
    if (node.collection.project) {
      collectionField = {
        name: node.collection.variable, 
        value: node.collection.variable, 
        variable: true
      };
      projectFields.push(collectionField);
    }
    node.collection.handled = true;
  }
  // Handle entities -------------------------------
  if (node.hasProperty(Properties.ENTITY) && !node.entity.handled) {
    log("Building entity term for: " + node.name);
    let entity = node.entity;
    let entityField = {
      name: "entity", 
      value: entity.id, 
      variable: false,
    };
    let term: Term = {
      type: "select",
      table: "entity eavs",
      fields: [entityField],
    }
    query.terms.push(term);
    // project if necessary
    if (entity.project === true) {
      let entityField = {
        name: entity.displayName.replace(/ /g,''),
        value: entity.id, 
        variable: false
      };
      projectFields.push(entityField);  
    }
    node.entity.handled = true;
  }
  /*if (node.hasProperty(Properties.NEGATES)) {
    let negatedTerm = query.terms.pop();
    let negatedQuery = negateTerm(negatedTerm);
    query.subqueries.push(negatedQuery);
  }*/
  // Project something if necessary       
  if (projectFields.length > 0) {                        
    let project = {
      type: "project!",
      fields: projectFields,
    }
    query.projects.push(project);
  }
  return query;
}

// ----------------------------------------------------------------------------
// Debug utility functions
// ---------------------------------------------------------------------------- 
let divider = "--------------------------------------------------------------------------------";

export let debug = false;

function log(x: any) {
  if (debug) {
    console.log(x);
  }
}

function tokenToString(token: Token, s1?: number, s2?: number, s3?: number, s4?: number, s5?: number): string {
  let properties = `(${token.properties.map((property: Properties) => Properties[property]).join("|")})`;
  properties = properties.length === 2 ? "" : properties;
  let tokenSpan = token.start === undefined ? " " : ` [${token.start}-${token.end}] `;
  let spacer1 = Array(s1-`${token.ix}`.length + 1).join(" ");
  let spacer2 = Array(s2-`${token.originalWord}`.length + 1).join(" ");
  let spacer3 = Array(s3-`${token.normalizedWord}`.length + 1).join(" ");
  let spacer4 = Array(s4 - `${MajorPartsOfSpeech[getMajorPOS(token.POS)]}`.length + 1).join(" ");
  let spacer5 = Array(s5 - `${MinorPartsOfSpeech[token.POS]}`.length + 1).join(" ");
  let tokenString = `${token.ix}:${spacer1} ${token.originalWord}${spacer2} | ${token.normalizedWord}${spacer3} | ${MajorPartsOfSpeech[getMajorPOS(token.POS)]}${spacer4} | ${MinorPartsOfSpeech[token.POS]}${spacer5} | ${properties}` ;
  return tokenString;
}

export function tokenArrayToString(tokens: Array<Token>): string {
  let s1: number = `${tokens[tokens.length-1].ix}`.length; 
  let s2: number = tokens.map((token) => token.originalWord.length).reduce((a,b) => {
    if (b > a) { return b; } else { return a; }
  });
  let s3: number = tokens.map((token) => token.normalizedWord.length).reduce((a,b) => {
    if (b > a) { return b; } else { return a; } 
  });
  let s4: number = tokens.map((token) => `${MajorPartsOfSpeech[getMajorPOS(token.POS)]}`.length).reduce((a,b) => {
    if (b > a) { return b; } else { return a; } 
  });
  let s5: number = tokens.map((token) => `${MinorPartsOfSpeech[token.POS]}`.length).reduce((a,b) => {
    if (b > a) { return b; } else { return a; } 
  });
  let tokenArrayString = tokens.map((token) => tokenToString(token,s1,s2,s3,s4,s5)).join("\n");
  return divider + "\n" + tokenArrayString + "\n" + divider;
}

// ----------------------------------------------------------------------------
// Utility functions
// ----------------------------------------------------------------------------

function flattenNestedArray(nestedArray: Array<Array<any>>): Array<any> {
  let flattened: Array<any> = [].concat.apply([],nestedArray);
  return flattened;
}

function onlyUnique(value, index, self) { 
  return self.indexOf(value) === index;
}

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

function isNumeric(n: any): boolean {
  return !isNaN(parseFloat(n)) && isFinite(n);
}


// ----------------------------------------------------------------------------

declare var exports;
window["NLQP"] = exports;
