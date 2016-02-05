import {eve} from "./app";

declare var pluralize;
declare var nlp;
declare var uuid;

// ----------------------------------------------------------------------------
// User-Facing functions
// ----------------------------------------------------------------------------

export interface ParseResult {
  tokens: Array<Token>,
  tree: Node,
  context: Context,
  query: Query,
  score: number,
  state: StateFlags,
}

export enum StateFlags {
  COMPLETE,
  MOREINFO,
  NORESULT,  
}

// Entry point for NLQP
export function parse(queryString: string): Array<ParseResult> {
  let preTokens = preprocessQueryString(queryString);
  let tokens = formTokens(preTokens);
  let treeResult = formTree(tokens);
  let query = formQuery(treeResult.tree);
  // Figure out the state flags
  let flag: StateFlags;
  if (query.projects.length === 0 && query.terms.length === 0) {
    flag = StateFlags.NORESULT;
  } else if (treeComplete(treeResult.tree)) {
    flag = StateFlags.COMPLETE; 
  } else {
    flag = StateFlags.MOREINFO;
  }
  return [{tokens: tokens, tree: treeResult.tree, context: treeResult.context, query: query, score: undefined, state: flag}];
}

function treeComplete(node: Node): boolean {
  if (node.found === false) {
    return false;
  } else {
    let childrenStatus = node.children.map(treeComplete);
    return childrenStatus.every((child) => child === true); 
  }
}

// Performs some transformations to the query string before tokenizing
export function preprocessQueryString(queryString: string): Array<PreToken> {
  // Add whitespace before commas
  let processedString = queryString.replace(new RegExp(",", 'g')," ,");
  processedString = processedString.replace(new RegExp(";", 'g')," ;");
  // Get parts of speach with sentence information. It's okay if they're wrong; they 
  // will be corrected as we create the tree and match against the underlying data model
  let sentences = nlp.pos(processedString, {dont_combine: true}).sentences;   
  // If no sentences were found, don't bother parsing
  if (sentences.length === 0) {
    return [];
  }
  let nlpcTokens = sentences[0].tokens;
  let preTokens: Array<PreToken> = nlpcTokens.map((token,i) => {
    return {ix: i, text: token.text, tag: token.pos.tag};
  });
  // Group quoted text here
  let quoteStarts = preTokens.filter((t) => t.text.charAt(0) === `"`);
  let quoteEnds = preTokens.filter((t) => t.text.charAt(t.text.length-1) === `"`);
  // If we have balanced quotes, combine tokens
  if (quoteStarts.length === quoteEnds.length) {
    let end, start; // @HACK to get around block scoped variable restriction
    for (let i = 0; i < quoteStarts.length; i++) {
      start = quoteStarts[i];
      end = quoteEnds[i];
      // Get all tokens between quotes (inclusive)
      let quotedTokens = preTokens.filter((token) => token.ix >= start.ix && token.ix <= end.ix)
                                  .map((token) => token.text);
      let quotedText = quotedTokens.join(" ");                  
      // Remove quotes                           
      quotedText = quotedText.replace(new RegExp("\"", 'g'),"");
      // Create a new pretoken
      let newPreToken: PreToken = {ix: start.ix, text: quotedText, tag: "NNQ"};
      preTokens.splice(preTokens.indexOf(start),quotedTokens.length,newPreToken);
    }
  }
  return preTokens;
}

// ----------------------------------------------------------------------------
// Token functions
// ----------------------------------------------------------------------------

interface PreToken {
  ix: number,
  text: string,
  tag: string,
}

enum MajorPartsOfSpeech {
  ROOT,
  VERB,
  ADJECTIVE,
  ADVERB,
  NOUN,
  GLUE,
  WHWORD,
  SYMBOL,
}

enum MinorPartsOfSpeech {
  ROOT,
  // Verb
  VB,   // verb, generic (eat) s
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
  SEP,  // Separator (, ;)
  // Wh- word
  WDT,  // Wh-determiner (that what whatever which whichever)
  WP,   // Wh-pronoun (that what whatever which who whom)
  WPO,  // Wh-pronoun possessive (whose)
  WRB   // Wh-adverb (however whenever where why)
}

interface Token {
  ix: number,
  originalWord: string,
  normalizedWord: string,
  POS: MinorPartsOfSpeech,
  properties: Array<TokenProperties>,
  node?: Node,
}

function cloneToken(token: Token): Token {
  let clone: Token = {
    ix: token.ix,
    originalWord: token.originalWord,
    normalizedWord: token.normalizedWord,
    POS: token.POS,
    properties: [],
  };
  token.properties.forEach((property) => clone.properties.push(property));
  return clone;
}

function newToken(word: string): Token {
  let token = {
    ix: 0,
    originalWord: word,
    normalizedWord: word,
    POS: MinorPartsOfSpeech.NN,
    properties: [],
  }
  return token;
}

enum TokenProperties {
  ROOT,
  PROPER,
  PLURAL,
  POSSESSIVE,
  BACKRELATIONSHIP,
  QUANTITY,
  COMPARATIVE,
  SUPERLATIVE,
  PRONOUN,  
  SEPARATOR,
  CONJUNCTION,
  COMPOUND,
  QUOTED,
  FUNCTION,
  GROUPING,
  OUTPUT,
}

// Finds a given property in a token
function hasProperty(token: Token, property: TokenProperties): boolean {
  let found = token.properties.indexOf(property);
  if (found !== -1) {
    return true;
  } else {
    return false;
  }
}


// take an input string, extract tokens
function formTokens(preTokens: Array<PreToken>): Array<Token> {
    
    // Form a token for each word
    let tokens: Array<Token> = preTokens.map((preToken: PreToken, i: number) => {
      let word = preToken.text;
      let tag = preToken.tag;
      let token: Token = {
        ix: i+1, 
        originalWord: word, 
        normalizedWord: word, 
        POS: MinorPartsOfSpeech[tag],
        properties: [], 
      };
      let before = "";
           
      // Add default attribute markers to nouns
      if (getMajorPOS(token.POS) === MajorPartsOfSpeech.NOUN) {
        if (token.POS === MinorPartsOfSpeech.NNO || 
            token.POS === MinorPartsOfSpeech.PP) {
         token.properties.push(TokenProperties.POSSESSIVE);
        }
        if (token.POS === MinorPartsOfSpeech.NNP  ||
            token.POS === MinorPartsOfSpeech.NNPS ||
            token.POS === MinorPartsOfSpeech.NNPA) {
          token.properties.push(TokenProperties.PROPER);
        }
        if (token.POS === MinorPartsOfSpeech.NNPS  ||
            token.POS === MinorPartsOfSpeech.NNS) {
          token.properties.push(TokenProperties.PLURAL);
        }
        if (token.POS === MinorPartsOfSpeech.CD ||
            token.POS === MinorPartsOfSpeech.DA ||
            token.POS === MinorPartsOfSpeech.NU) {
          token.properties.push(TokenProperties.QUANTITY);
        }
        if (token.POS === MinorPartsOfSpeech.PP ||
            token.POS === MinorPartsOfSpeech.PRP) {
          token.properties.push(TokenProperties.PRONOUN);
        }
        if (token.POS === MinorPartsOfSpeech.NNQ) {
          token.properties.push(TokenProperties.PROPER);
          token.properties.push(TokenProperties.QUOTED);
        }
      }
      
      // Add default properties to adjectives and adverbs
      if (token.POS === MinorPartsOfSpeech.JJR || token.POS === MinorPartsOfSpeech.RBR) {
        token.properties.push(TokenProperties.COMPARATIVE);
      }
      else if (token.POS === MinorPartsOfSpeech.JJS || token.POS === MinorPartsOfSpeech.RBS) {        
        token.properties.push(TokenProperties.SUPERLATIVE);
      }
      
      // Add default properties to separators
      if (token.POS === MinorPartsOfSpeech.CC) {
        token.properties.push(TokenProperties.CONJUNCTION);
      }
      
      // normalize the word with the following transformations: 
      // --- strip punctuation
      // --- get rid of possessive ending 
      // --- convert to lower case
      // --- singularize
      let normalizedWord = word;
      // --- strip punctuation
      normalizedWord = normalizedWord.replace(/\.|\?|\!|/g,'');
      // --- get rid of possessive ending
      before = normalizedWord;
      normalizedWord = normalizedWord.replace(/'s|'$/,'');
      // Heuristic: If the word had a possessive ending, it has to be a possessive noun of some sort      
      if (before !== normalizedWord) {
        if (getMajorPOS(token.POS) !== MajorPartsOfSpeech.NOUN) {
          token.POS = MinorPartsOfSpeech.NN;
        }
        token.properties.push(TokenProperties.POSSESSIVE);
      }
      // --- convert to lowercase
      before = normalizedWord;
      normalizedWord = normalizedWord.toLowerCase();
      // Heuristic: if the word is not the first word in the sentence and it had capitalization, then it is probably a proper noun
      if (before !== normalizedWord && i !== 0) {
        token.POS = MinorPartsOfSpeech.NNP;
        token.properties.push(TokenProperties.PROPER);     
      }
      // --- if the word is a (not proper) noun or verb, singularize
      if ((getMajorPOS(token.POS) === MajorPartsOfSpeech.NOUN || getMajorPOS(token.POS) === MajorPartsOfSpeech.VERB) && !hasProperty(token,TokenProperties.PROPER)) {
        before = normalizedWord;
        normalizedWord = singularize(normalizedWord);
        // Heuristic: If the word changed after singularizing it, then it was plural to begin with
        if (before !== normalizedWord) {
          token.properties.push(TokenProperties.PLURAL);
        }
      }      
      token.normalizedWord = normalizedWord;
           
      // Heuristic: Special case "in" classified as an adjective. e.g. "the in crowd". This is an uncommon usage
      if (token.normalizedWord === "in" && getMajorPOS(token.POS) === MajorPartsOfSpeech.ADJECTIVE) 
      {
        token.POS = MinorPartsOfSpeech.IN;
      }

      // Heuristic: Special case words with no ambiguous POS that NLPC misclassifies
      switch (token.normalizedWord) {
        case "of":
          token.properties.push(TokenProperties.BACKRELATIONSHIP); 
          break;
        case "per":
          token.properties.push(TokenProperties.BACKRELATIONSHIP); 
          token.properties.push(TokenProperties.GROUPING);
          break;
        case "all":
          token.POS = MinorPartsOfSpeech.PDT;
          break;
        case "had":
          token.POS = MinorPartsOfSpeech.VBD;
          break;
        case "has":
          token.POS = MinorPartsOfSpeech.VBZ;
          break;
        case "is": 
          token.POS = MinorPartsOfSpeech.VBZ;
          break;
        case "not":
          token.POS = MinorPartsOfSpeech.RB;
          break;
        case "was":
          token.POS = MinorPartsOfSpeech.VBD;
          break;
        case "do":
          token.POS = MinorPartsOfSpeech.VBP;
          break;
        case "average":
          token.POS = MinorPartsOfSpeech.NN;
          break;
        case "their":
          token.properties.push(TokenProperties.PLURAL);
          break;
        case "most":
          token.POS = MinorPartsOfSpeech.JJS;
          token.properties.push(TokenProperties.SUPERLATIVE);
          break;
        case "best":
          token.POS = MinorPartsOfSpeech.JJS;
          token.properties.push(TokenProperties.SUPERLATIVE);
          break;
        case "will":
          // 'will' can be a noun
          if (getMajorPOS(token.POS) !== MajorPartsOfSpeech.NOUN) {
            token.POS = MinorPartsOfSpeech.MD;
          }
          break;
        case "years":
          token.POS = MinorPartsOfSpeech.NN;
          token.normalizedWord = "year";
          token.properties.push(TokenProperties.PLURAL);
          break;
      }
      
      // Special case symbols
      switch (token.normalizedWord) {
        case ">": 
          token.POS = MinorPartsOfSpeech.GT;
          break;
        case "<":
          token.POS = MinorPartsOfSpeech.LT;
          break;
        case ",":
          token.POS = MinorPartsOfSpeech.SEP;
          token.properties.push(TokenProperties.SEPARATOR);
          break;
        case ";":
          token.POS = MinorPartsOfSpeech.SEP;
          token.properties.push(TokenProperties.SEPARATOR);
          break;
      }
      token.properties = token.properties.filter(onlyUnique);
      return token;
    });
    
    // Correct wh- tokens
    for (let token of tokens) {
      if (token.normalizedWord === "that"     || 
          token.normalizedWord === "whatever" ||
          token.normalizedWord === "which") {
        // determiners become wh- determiners
        if (token.POS === MinorPartsOfSpeech.DT) {
          token.POS = MinorPartsOfSpeech.WDT;
        }
        // pronouns become wh- pronouns
        else if (token.POS === MinorPartsOfSpeech.PRP || token.POS === MinorPartsOfSpeech.PP) {
          token.POS = MinorPartsOfSpeech.WP;
        }
        continue;
      }
      // who and whom are wh- pronouns
      if (token.normalizedWord === "who"  || 
          token.normalizedWord === "what" ||
          token.normalizedWord === "whom") {
        token.POS = MinorPartsOfSpeech.WP;
        continue;
      }
      // whose is the only wh- possessive pronoun
      if (token.normalizedWord === "whose") {
        token.POS = MinorPartsOfSpeech.WPO;
        token.properties.push(TokenProperties.POSSESSIVE);
        continue;
      }
      // adverbs become wh- adverbs
      if (token.normalizedWord === "how"      ||
          token.normalizedWord === "when"     ||
          token.normalizedWord === "however"  || 
          token.normalizedWord === "whenever" ||
          token.normalizedWord === "where"    ||
          token.normalizedWord === "why") {
        token.POS = MinorPartsOfSpeech.WRB;
        continue;
      }
    }
    
    // Sentence-level POS corrections
    // Heuristic: If there are no verbs in the sentence, there can be no adverbs. Turn them into adjectives
    let verbs = tokens.filter((token: Token) => getMajorPOS(token.POS) === MajorPartsOfSpeech.VERB );
    if (verbs.length === 0) {
      let adverbs: Array<Token> = tokens.filter((token: Token) => getMajorPOS(token.POS) === MajorPartsOfSpeech.ADVERB);
      adverbs.forEach((adverb: Token) => adverbToAdjective(adverb));
    } else {
      // Heuristic: Adverbs are located close to verbs
      // Get the distance from each adverb to the closest verb as a percentage of the length of the sentence.
      let adverbs: Array<Token> = tokens.filter((token: Token) => getMajorPOS(token.POS) === MajorPartsOfSpeech.ADVERB);
      adverbs.forEach((adverb: Token) => {
          let closestVerb = tokens.length;
          verbs.forEach((verb: Token) => {
            let dist = Math.abs(adverb.ix - verb.ix);
            if (dist < closestVerb) {
              closestVerb = dist;
            }
          });
          let distRatio = closestVerb/tokens.length;
          // Threshold the distance an adverb can be from the verb
          // if it is too far, make it an adjective instead
          if (distRatio > .25) {
            adverbToAdjective(adverb);
          }
      });
    }
    
    let rootToken = {
      ix: 0, 
      originalWord: tokens.map((token) => token.originalWord).join(" "), 
      normalizedWord: tokens.map((token) => token.normalizedWord).join(" "), 
      POS: MinorPartsOfSpeech.ROOT,
      properties: [TokenProperties.ROOT], 
    };
    
    tokens = [rootToken].concat(tokens);
    
    return tokens;
}

function adverbToAdjective(token: Token): Token {
  let word = token.normalizedWord;
  // Heuristic: Words that end in -est are superlative
  if (word.substr(word.length-3,word.length) === "est") {
    token.POS = MinorPartsOfSpeech.JJS;
    token.properties.push(TokenProperties.SUPERLATIVE);
  // Heuristic: Words that end in -er are comaprative
  } else if (word.substr(word.length-2,word.length) === "er"){
    token.POS = MinorPartsOfSpeech.JJR;
    token.properties.push(TokenProperties.COMPARATIVE);
  } else {
    token.POS = MinorPartsOfSpeech.JJ;
  }  
  return token;
}

function getMajorPOS(minorPartOfSpeech: MinorPartsOfSpeech): MajorPartsOfSpeech {
  // ROOT
  if (minorPartOfSpeech === MinorPartsOfSpeech.ROOT) {
    return MajorPartsOfSpeech.ROOT;
  }
  // Verb
  if (minorPartOfSpeech === MinorPartsOfSpeech.VB  ||
      minorPartOfSpeech === MinorPartsOfSpeech.VBD ||
      minorPartOfSpeech === MinorPartsOfSpeech.VBN ||
      minorPartOfSpeech === MinorPartsOfSpeech.VBP ||
      minorPartOfSpeech === MinorPartsOfSpeech.VBZ ||
      minorPartOfSpeech === MinorPartsOfSpeech.VBF ||
      minorPartOfSpeech === MinorPartsOfSpeech.CP  ||
      minorPartOfSpeech === MinorPartsOfSpeech.VBG) {
        return MajorPartsOfSpeech.VERB;
  }
  // Adjective
  if (minorPartOfSpeech === MinorPartsOfSpeech.JJ  ||
      minorPartOfSpeech === MinorPartsOfSpeech.JJR ||
      minorPartOfSpeech === MinorPartsOfSpeech.JJS) {
        return MajorPartsOfSpeech.ADJECTIVE;
  }
  // Adjverb
  if (minorPartOfSpeech === MinorPartsOfSpeech.RB  ||
      minorPartOfSpeech === MinorPartsOfSpeech.RBR ||
      minorPartOfSpeech === MinorPartsOfSpeech.RBS) {
        return MajorPartsOfSpeech.ADVERB;
  }
  // Noun
  if (minorPartOfSpeech === MinorPartsOfSpeech.NN   ||
      minorPartOfSpeech === MinorPartsOfSpeech.NNA  ||
      minorPartOfSpeech === MinorPartsOfSpeech.NNPA ||
      minorPartOfSpeech === MinorPartsOfSpeech.NNAB ||
      minorPartOfSpeech === MinorPartsOfSpeech.NNP  ||
      minorPartOfSpeech === MinorPartsOfSpeech.NNPS ||
      minorPartOfSpeech === MinorPartsOfSpeech.NNS  ||
      minorPartOfSpeech === MinorPartsOfSpeech.NNQ  ||
      minorPartOfSpeech === MinorPartsOfSpeech.CD   ||
      minorPartOfSpeech === MinorPartsOfSpeech.DA   ||
      minorPartOfSpeech === MinorPartsOfSpeech.NU   ||
      minorPartOfSpeech === MinorPartsOfSpeech.NNO  ||
      minorPartOfSpeech === MinorPartsOfSpeech.NG   ||
      minorPartOfSpeech === MinorPartsOfSpeech.PRP  ||
      minorPartOfSpeech === MinorPartsOfSpeech.PP) {
        return MajorPartsOfSpeech.NOUN;
  }
  // Glue
  if (minorPartOfSpeech === MinorPartsOfSpeech.FW  ||
      minorPartOfSpeech === MinorPartsOfSpeech.IN  ||
      minorPartOfSpeech === MinorPartsOfSpeech.MD  ||
      minorPartOfSpeech === MinorPartsOfSpeech.CC  ||
      minorPartOfSpeech === MinorPartsOfSpeech.PDT ||
      minorPartOfSpeech === MinorPartsOfSpeech.DT  ||
      minorPartOfSpeech === MinorPartsOfSpeech.UH  ||
      minorPartOfSpeech === MinorPartsOfSpeech.EX) {
        return MajorPartsOfSpeech.GLUE;
  }
  // Symbol
  if (minorPartOfSpeech === MinorPartsOfSpeech.LT  ||
      minorPartOfSpeech === MinorPartsOfSpeech.GT  ||
      minorPartOfSpeech === MinorPartsOfSpeech.SEP) {
        return MajorPartsOfSpeech.SYMBOL;
  }
  // Wh-Word
  if (minorPartOfSpeech === MinorPartsOfSpeech.WDT ||
      minorPartOfSpeech === MinorPartsOfSpeech.WP  ||
      minorPartOfSpeech === MinorPartsOfSpeech.WPO ||
      minorPartOfSpeech === MinorPartsOfSpeech.WRB) {
        return MajorPartsOfSpeech.WHWORD;
  }
}

// Wrap pluralize to special case certain words it gets wrong
function singularize(word: string): string {
  let specialCases = ["his","has","downstairs","united states","its"];
  specialCases.forEach((specialCase) => {
    if (specialCase === word) {
      return word;
    }
  });
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
  token: Token,
  found: boolean,
  properties: Array<TokenProperties>,
  hasProperty(TokenProperties): boolean;
  toString(number?: number): string;
}

function cloneNode(node: Node): Node {
  let token = cloneToken(node.token);
  let cloneNode = newNode(token);
  cloneNode.entity = node.entity;
  cloneNode.collection = node.collection;
  cloneNode.attribute = node.attribute;
  cloneNode.fxn = node.fxn;
  cloneNode.found = node.found;
  node.properties.forEach((property) => cloneNode.properties.push(property));
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
    found: false,
    hasProperty: hasProperty,
    toString: nodeToString,
  };
  token.node = node;
  function hasProperty(property: TokenProperties): boolean {
  let found = node.properties.indexOf(property);
  if (found !== -1) {
      return true;
    } else {
      return false;
    }
  }
  function nodeToString(depth?: number): string {
    if (depth === undefined) {
      depth = 0;
    }
    let childrenStrings = node.children.map((childNode) => childNode.toString(depth+1)).join("\n");
    let children = childrenStrings.length > 0 ? "\n" + childrenStrings : "";
    let indent = Array(depth+1).join(" ");
    let index = node.ix === undefined ? "+ " : `${node.ix}: `;
    let properties = node.properties.length === 0 ? "" : `(${node.properties.map((property: TokenProperties) => TokenProperties[property]).join("|")})`;
    let attribute = node.attribute === undefined ? "" : `[${node.attribute.variable} (${node.attribute.value})] `;
    let entity = node.entity === undefined ? "" : `[${node.entity.displayName}] `;
    let collection = node.collection === undefined ? "" : `[${node.collection.displayName}] `;
    let fxn = node.fxn === undefined ? "" : `[${node.fxn.name}] `;
    let found = node.found ? "*" : " ";
    let entityOrProperties = found === " " ? `${properties}` : `${fxn}${entity}${collection}${attribute}`;
    properties = properties.length === 2 ? "" : properties;
    let nodeString = `|${found}${indent}${index}${node.name} ${entityOrProperties}${children}`; 
    return nodeString;
  }
  return node;  
}

export enum FunctionTypes {
  COMPARATOR,
  AGGREGATE,
  BOOLEAN,
}

interface BuiltInFunction {
  name: string,
  type: FunctionTypes,
  attribute?: string,
  fields: Array<string>,
  project: boolean,
  node?: Node,
}

interface Context {
  entities: Array<Entity>,
  collections: Array<Collection>,
  attributes: Array<Attribute>,
  fxns: Array<BuiltInFunction>,
  groupings: Array<Token>,
  maybeEntities: Array<Token>,
  maybeAttributes: Array<Token>,
  maybeCollections: Array<Token>,
  maybeFunction: Array<Token>,
}

function newContext(): Context {
  return {
    entities: [],
    collections: [],
    attributes: [],
    fxns: [],
    groupings: [],
    maybeEntities: [],
    maybeAttributes: [],
    maybeCollections: [],
    maybeFunction: [],
  };
}

function wordToFunction(word: string): BuiltInFunction {
  switch (word) {
    case "taller":
      return {name: ">", type: FunctionTypes.COMPARATOR, attribute: "height", fields: ["a","b"], project: false};
    case "shorter":
      return {name: "<", type: FunctionTypes.COMPARATOR, attribute: "length", fields: ["a","b"], project: false};
    case "longer":
      return {name: ">", type: FunctionTypes.COMPARATOR, attribute: "length", fields: ["a","b"], project: false};
    case "younger":
      return {name: "<", type: FunctionTypes.COMPARATOR, attribute: "age", fields: ["a","b"], project: false};
    case "and":
      return {name: "and", type: FunctionTypes.BOOLEAN, fields: [], project: false};
    case "or":
      return {name: "or", type: FunctionTypes.BOOLEAN, fields: [], project: true};
    case "sum":
      return {name: "sum", type: FunctionTypes.AGGREGATE, fields: ["sum","value"], project: true};
    case "average":
      return {name: "average", type: FunctionTypes.AGGREGATE, fields: ["average","value"], project: true};
    case "mean":
      return {name: "average", type: FunctionTypes.AGGREGATE, fields: ["average","value"], project: true};
    default:
      return undefined;
  }
}

// take tokens, form a parse tree
function formNounGroups(tokens: Array<Token>): Array<Node> {

  let processedTokens = 0;
  
  // noun types ORGANIZATION, PERSON, THING, ANIMAL, LOCATION, DATE, TIME, MONEY, and GEOPOLITICAL
  
  // Find noun groups. These are like noun phrases, but smaller. A noun phrase may be a single noun group
  // or it may consist of several noun groups. e.g. "the yellow dog who lived in the town ran away from home".
  // here, the noun phrase "the yellow dog who lived in the town" is a noun phrase consisting of the noun
  // groups "the yellow dog" and "the town"
  // Modifiers that come before a noun: articles, possessive nouns/pronouns, adjectives, participles
  // Modifiers that come after a noun: prepositional phrases, adjective clauses, participle phrases, infinitives
  // Less frequently, noun phrases have pronouns as a base 
  let i = 0;
  let nounGroups: Array<Node> = [];
  let lastFoundNounIx = 0;
  for (let token of tokens) {
    // If the token is a noun, start a noun group
    if (getMajorPOS(token.POS) === MajorPartsOfSpeech.NOUN && token.node === undefined) {
      let nounGroup: Node = newNode(token);
      
      // Now we need to pull in other words to attach to the noun. We have some hueristics for that!
      
      // Heuristic: search left until we find a predeterminer. Everything between is part of the noun group
      let firstDeterminerIx = null;
      let latestPrepositionIx = null;
      let latestAdjectiveIx = null;
      let verbBoundary = null;
      let conjunctionBoundary = null;
      let separatorBoundary = null;
      for (let j = i-1; j >= lastFoundNounIx; j--) {
        // We look backwards from the current noun token
        let backtrackToken: Token = tokens[j];
        // First look for a predeterminer "such (PDT) a(DT) good time".
        if (backtrackToken.POS === MinorPartsOfSpeech.PDT) {
          firstDeterminerIx = j;
          break;
        // Keep track of the ix of the latest determiner "the (DT) golden dog"
        } else if (backtrackToken.POS === MinorPartsOfSpeech.DT) {
          if (firstDeterminerIx === null) {
            firstDeterminerIx = j;  
          }
        // Keep track of the ix of the latest preposition
        } else if (backtrackToken.POS === MinorPartsOfSpeech.IN) {
          latestPrepositionIx = j;
        // Keep track of the ix of the latest adjective
        } else if (getMajorPOS(backtrackToken.POS) === MajorPartsOfSpeech.ADJECTIVE) {
          latestAdjectiveIx = j;
        // If we find a verb, we've gone too far
        } else if (getMajorPOS(backtrackToken.POS) === MajorPartsOfSpeech.VERB) {
          verbBoundary = j;
          break;
        // If we find a conjuntion, we've gone too far
        } else if (backtrackToken.POS === MinorPartsOfSpeech.CC) {
          conjunctionBoundary = j;
          break;
        }
        // If we find a separator, we've gone to far
        else if (backtrackToken.POS === MinorPartsOfSpeech.SEP) {
          separatorBoundary = j;
          break;
        }
      }
      
      // If we found a determiner, gobble up tokens between the latest determiner and the noun
      if (firstDeterminerIx !== null) {
        nounGroup = subsumeTokens(nounGroup,firstDeterminerIx,tokens);
      }
      // Heuristic: search to the left for a preposition
      if (latestPrepositionIx !== null && latestPrepositionIx < nounGroup.ix) {
        nounGroup = subsumeTokens(nounGroup,latestPrepositionIx,tokens);
      }
      // Heuristic: search to the left for an adjective
      if (latestAdjectiveIx !== null && latestAdjectiveIx < nounGroup.ix) {
        nounGroup = subsumeTokens(nounGroup,latestAdjectiveIx,tokens);
      }
      
      nounGroups.push(nounGroup);
      lastFoundNounIx = i;
    }
    // End noun group formation
    i++;
  }
  
  // Heuristic: Leftover determiners are themselves a noun group 
  // e.g. neither of these boys. ng = ([neither],[of these boys])
  let unusedDeterminers = tokens.filter((token) => token.node === undefined && token.POS === MinorPartsOfSpeech.DT);
  for (let token of unusedDeterminers) {
    nounGroups.push(newNode(token));  
  }
  
  // Sort the noun groups to reflect their order in the root sentence
  nounGroups = nounGroups.sort((ngA, ngB) => ngA.ix - ngB.ix);
  return nounGroups;
}

function subsumeTokens(nounGroup: Node, ix: number, tokens: Array<Token>): Node {
  for (let j = ix ; j < nounGroup.ix; j++) {
    let token: Token = tokens[j];
    if (token.node === undefined) {
      addChildToNounGroup(nounGroup,token);  
    }
  }
  return nounGroup;
}

// Adds a child token to a noun group and subsumes its properties. Marks token as used
function addChildToNounGroup(nounGroup: Node, token: Token) {
  let tokenNode = newNode(token);
  nounGroup.children.push(tokenNode);
  nounGroup.children.sort((a,b) => a.ix - b.ix);
  tokenNode.parent = nounGroup;
  //nounGroup.properties = nounGroup.properties.concat(token.properties);
}

// Transfer noun group properties to a node
function subsumeProperties(node: Node, nounGroup: Node) {
  node.properties = nounGroup.properties;
  // Make sure the properties are unique  
  node.properties = node.properties.filter(onlyUnique);
}

function formTree(tokens: Array<Token>) {  
  let tree: Node;
  let subsumedNodes: Array<Node> = [];
  
  // First, find noun groups
  let nodes = formNounGroups(tokens);
  //console.log("NOUN GROUPS");
  //console.log(nodeArrayToString(nodes));
  
  // Fold in all the other tokens
  let unusedNodes = tokens.filter((token) => token.node === undefined).map(newNode);
  nodes = nodes.concat(unusedNodes);
  nodes.sort((a,b) => a.ix - b.ix);
  
  // Do a quick pass to identify functions
  tokens.forEach((token) => {
    let node = token.node;
    let fxn = wordToFunction(node.name);
    if (fxn !== undefined) {
      node.fxn = fxn;
      fxn.node = node;
      node.properties.push(TokenProperties.FUNCTION);
    }    
  });
  
  // Link nodes end to end
  nodes.forEach((thisNode,i) => {
    let nextNode = nodes[i + 1];
    if (nextNode !== undefined) {
      thisNode.children.push(nextNode);
      nextNode.parent = thisNode;  
    }
  })
  
  // At this point we should only have a single root. 
  nodes = nodes.filter((node) => node.parent === undefined);
  tree = nodes.pop();
  //console.log(tree.toString());
  
  // Split nodes
  let i = 0;
  let length = tokens.length * 2;
  while (true) {
    let token = tokens[i];
    if (token === undefined) {
      break;
    }
    let root = tokens[0].node;
    let node = token.node;
       
    // Heuristic: If the token is a semicolon, break and place the rest on the root
    if (node.hasProperty(TokenProperties.SEPARATOR) && node.name === ";") {
      reroot(node,root);
      removeNode(node);
    // Heuristic: If the node is a comma, break and place on the nearest proper noun or noun
    } else if (node.hasProperty(TokenProperties.SEPARATOR) && node.name === ",") {
      let properNode = findWithProperty(node,TokenProperties.PROPER);
      if (properNode !== undefined) {
        // reroot on proper node
        reroot(node,properNode);
        removeNode(node);
      } else {
        let nounNode = findWithPOS(node,MajorPartsOfSpeech.NOUN);
        if (nounNode !== undefined) {
          // if no proper nouns, reroot on noun node
          reroot(node,nounNode);
          removeNode(node);
        }
      }
    // Heuristic: If the node is "of", confer its properties onto its parent and delete the node
    } else if (node.hasProperty(TokenProperties.BACKRELATIONSHIP) && node.name === "of") {
      node.parent.properties.push(TokenProperties.BACKRELATIONSHIP);
      removeNode(node);
    } else if (node.name === "per") {
      node.parent.properties.push(TokenProperties.BACKRELATIONSHIP);
      node.parent.properties.push(TokenProperties.GROUPING);
      removeNode(node);
    // Heuristic: Remove determiners
    } else if (node.token.POS === MinorPartsOfSpeech.DT) {
      removeNode(node);
    // Heuristic: If the node is proper but not quoted, see if the next node is proper and 
    // if so create a compound node from the two
    } else if (node.hasProperty(TokenProperties.PROPER) && !node.hasProperty(TokenProperties.QUOTED)) {
      let properNouns = node.children.filter((child) => child.hasProperty(TokenProperties.PROPER) && !child.hasProperty(TokenProperties.COMPOUND));
      for (let pNoun of properNouns) {
        let newOriginalName = node.token.originalWord + " " + pNoun.token.originalWord;
        let newNormalizedName = node.name + " " + pNoun.name;
        // Create a compound token
        let nToken: Token = {
          ix: pNoun.ix,
          originalWord: newOriginalName,
          normalizedWord: newNormalizedName,
          POS: MinorPartsOfSpeech.NN,
          properties: node.properties.concat(pNoun.properties),
        };
        nToken.properties.push(TokenProperties.COMPOUND);
        // Subsume properties
        let childProperties = node.children.map((child) => child.properties);
        let flatProperties = flattenNestedArray(childProperties);
        nToken.properties = nToken.properties.concat(flatProperties);
        nToken.properties = nToken.properties.filter(onlyUnique);
        // Create the new node and insert it into the tree, removing the constituent nodes
        let nProperNode = newNode(nToken);
        insertAfterNode(nProperNode,pNoun);
        removeNode(node);
        removeNode(pNoun);
        // Keep nodes as constituents
        if (nProperNode.constituents === undefined) {
          nProperNode.constituents = [];
        }
        nProperNode.constituents.push(node);
        nProperNode.constituents.push(pNoun);
        if (node.constituents !== undefined) {
          nProperNode.constituents = nProperNode.constituents.concat(node.constituents);  
        }
        // Insert new tokens into token array
        tokens.splice(tokens.indexOf(token)+2,0,nToken);
      }    
    // Heuristic: If the node is comparative, swap with its parent
    } else if (node.hasProperty(TokenProperties.COMPARATIVE)) {
      // We can get rid of "than" or its misspelling "then" the exist as a sibling
      let parent = node.parent;
      let thanNode = parent.children.filter((n) => n.name === "than" || n.name === "then")
      for (let n of thanNode) {
        parent.children.splice(parent.children.indexOf(n),1);
      }
      makeParentChild(node);
    } else if (node.hasProperty(TokenProperties.CONJUNCTION)) {
      promoteNode(node);
    }
    i++;
  }
    
  function sortChildren(node: Node): void {
    node.children.sort((a,b) => a.ix - b.ix);
    node.children.map(sortChildren);    
  }  
  sortChildren(tree);  
    
  // THIS IS WHERE THE MAGIC HAPPENS!
  // Go through each node array and try to resolve entities
  function resolveEntities(node: Node, context: Context): Context {
    log(node);
    // Skip certain nodes
    if (node.token.POS === MinorPartsOfSpeech.IN ||
        node.hasProperty(TokenProperties.ROOT)) {
      log("Skipping");
      node.found = true;
    }
    if (!node.found && node.hasProperty(TokenProperties.FUNCTION)) {
      context.fxns.push(node.fxn);
      node.found = true;
    }
    // Try to find an attribute if we've already found an entity/collection
    if (!node.found && (context.entities.length !== 0 || context.collections.length !== 0)) {
      log("Entity/Collection already found: finding attribute");
      let entity = context.entities[context.entities.length - 1];
      if (entity !== undefined) {
        findEntityAttribute(node,entity,context);
      // Try to find it as an attribute of a collection
      } else {
        let collection = context.collections[context.collections.length - 1];
        if (collection !== undefined) {
          findCollectionAttribute(node,collection,context);
        }
      }     
    }
    // If the node is a pronoun, try to find the entity it references
    if (!node.found && node.hasProperty(TokenProperties.PRONOUN)) {
      log("Pronoun: finding reference");
      // If the pronoun is plural, the entity is probably the latest collection
      if (node.hasProperty(TokenProperties.PLURAL)) {
        let collection = context.collections[context.collections.length - 1];
        if (collection !== undefined) {
          log(collection.displayName);
          node.collection = cloneCollection(collection);
          node.collection.project = false;
          node.found = true;
        }
      } else {
        let entity = context.entities[context.entities.length - 1];
        if (entity !== undefined) {
          log(entity.displayName);
          node.entity = cloneEntity(entity);
          node.entity.project = false;
          node.found = true;
        }
      }
    }
    // Heuristic: If the node is plural, try to find a collection
    if (!node.found && node.hasProperty(TokenProperties.PLURAL)) {
      findCollection(node,context);
    }
    // If the node is possessive or proper, it's probably an entity
    if (!node.found && (node.hasProperty(TokenProperties.POSSESSIVE) || node.hasProperty(TokenProperties.PROPER))) {
      log("Possessive or Proper: finding entity");
      findEntity(node,context);
    }
    // If we've gotten here and we haven't found anything, go crazy with searching
    if (!node.found) {
      log("Find this thing anywhere we can");
      findCollectionOrEntity(node,context);
    }
    
    // If there is a backward relationship e.g. age of Corey, then try to find attrs
    // in the maybeAttr stack
    if (node.hasProperty(TokenProperties.BACKRELATIONSHIP)) {
      log("Backrelationship: Searching for previously unmatched attributes");
      // If the node is possessive, transfer the backrelationship to its children
      if (node.hasProperty(TokenProperties.POSSESSIVE)) {
        node.children.map((child) => child.properties.push(TokenProperties.BACKRELATIONSHIP));
        node.properties.splice(node.properties.indexOf(TokenProperties.BACKRELATIONSHIP),1);
      }
      for (let maybeAttr of context.maybeAttributes) {
        // Find the parent entities and try to match attributes
        let entity = node.entity;
        if (entity !== undefined) {
          findEntityAttribute(maybeAttr.node,entity,context);
        } else {
          let collection = node.collection;
          if (collection !== undefined) {
            findCollectionAttribute(maybeAttr.node,collection,context);
          }
        }
      }
    }
    if (!node.found) {
      /*if (node.parent.hasProperty(TokenProperties.POSSESSIVE)) {
        context.maybeAttributes.push(node.token);  
      }*/
      if (node.hasProperty(TokenProperties.PLURAL)) { 
        context.maybeCollections.push(node.token);
      }
      else if (node.hasProperty(TokenProperties.PROPER) ||
          node.parent.hasProperty(TokenProperties.FUNCTION) ||
          node.parent.hasProperty(TokenProperties.COMPARATIVE) || 
          node.hasProperty(TokenProperties.POSSESSIVE)) {
        context.maybeEntities.push(node.token);
      } else if (node.hasProperty(TokenProperties.COMPARATIVE)) {
        context.maybeFunction.push(node.token);
      }
      context.maybeAttributes.push(node.token);
    }
    
    // Resolve the child nodes
    node.children.map((child) => resolveEntities(child,context));

    // If we're here and we still haven't found anything, maybe
    // context gained from the children will help identify the node
    return context;
  }
  
  log(tree.toString());
  log("Finding entities...");
  
  // Resolve entities and attributes
  let context = newContext();
  resolveEntities(tree,context);
  
  log(tree.toString());
  log("Rewire attributes...")
  // Based on the entities we just found, rewire attributes to be children of their referenced entities
  for (let token of tokens) {
    let node = token.node;
    if (node.attribute !== undefined) {
      let entityNode: Node;
      if (node.attribute.entity !== undefined) {
        entityNode = node.attribute.entity.node;  
      } else if(node.attribute.collection !== undefined) {
        entityNode = node.attribute.collection.node;
      }
      if (node.parent.ix !== entityNode.ix) {
        if (node.parent.hasProperty(TokenProperties.CONJUNCTION)) {
          moveNode(node.parent,entityNode);
          moveNode(node,entityNode);
        } else {
          moveNode(node,entityNode);
        }
      }
    }
  }
  log(tree.toString());
  log("Rewire comparators...");
  // Rewrite comparators
  let comparatorNodes = context.fxns.filter((fxn) => fxn.type === FunctionTypes.COMPARATOR).map((n) => n.node);  
  let comparator: BuiltInFunction;
  for (let compNode of comparatorNodes) {
    comparator = compNode.fxn;
    // If a comparator node only has one child, swap with the parent
    if (compNode.children.length === 1) {
      makeParentChild(compNode);
    }
    // Check if the children have the requisite attribute, and if so add a node
    compNode.children.forEach((child) => { 
      // Find relationship for entities
      if (child.entity !== undefined) {
        let attribute = findEveAttribute(comparator.attribute,child.entity);
        if (attribute !== undefined) {
          //console.log(attribute);
          let nToken = newToken(comparator.attribute);
          let nNode = newNode(nToken);
          attribute.project = false;
          nNode.attribute = attribute;
          child.children.push(nNode);
          nNode.parent = child;
          nNode.found = true;
          child.entity.project = true;
          context.attributes.push(attribute);
        }
      // Find relationship for collections
      } else if (child.collection !== undefined) {
        let relationship = findCollectionToAttrRelationship(child.collection.id,comparator.attribute);
        if (relationship.type === RelationshipTypes.DIRECT) {
          let nToken = newToken(comparator.attribute);
          let nNode = newNode(nToken);
          let collectionAttribute: Attribute = {
            id: comparator.attribute,
            displayName: comparator.attribute,
            collection: child.collection,
            value: `${child.collection.displayName}|${comparator.attribute}`,
            variable: `${child.collection.displayName}|${comparator.attribute}`,
            node: nNode,
            project: false,
          }
          nNode.found = true;
          child.collection.project = true;
          nNode.attribute = collectionAttribute;
          child.collection.variable = "";
          child.children.push(nNode);
          nNode.parent = child;
        }
      }
    });    
  }   
  log(tree.toString());
  log("Rewire aggregates...");
  let aggregateNodes = context.fxns.filter((fxn) => fxn.type === FunctionTypes.AGGREGATE).map((n) => n.node);  
  let aggregate: BuiltInFunction;
  let aggNode;
  for (aggNode of aggregateNodes) {
    if (aggNode.children[0] !== undefined && aggNode.children[0].hasProperty(TokenProperties.GROUPING)) {
      swapWithParent(aggNode.children[0]);
      let token = newToken("output");
      let outputNode = newNode(token);
      outputNode.properties.push(TokenProperties.OUTPUT);
      let outputAttribute: Attribute = {
        id: outputNode.name,
        displayName: outputNode.name,
        value: `${aggNode.fxn.name}|${outputNode.name}`,
        variable: `${aggNode.fxn.name}|${outputNode.name}`,
        node: outputNode,
        project: false,
      }
      outputNode.found = true;
      outputNode.attribute = outputAttribute;
      aggNode.children.push(outputNode);
      outputNode.parent = aggNode;
    }
  }   
  
  log(tree.toString());
  return {tree: tree, context: context};
}

// Various node manipulation functions
function reroot(node: Node, target: Node): void {
  node.parent.children.splice(node.parent.children.indexOf(node),1);  
  node.parent = target;
  target.children.push(node);
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

function moveNode(node: Node, target: Node): void {
  if (node.hasProperty(TokenProperties.ROOT)) {
    return;
  }
  let parent = node.parent;
  parent.children.splice(parent.children.indexOf(node),1);
  parent.children = parent.children.concat(node.children);
  node.children.map((child) => child.parent = parent);
  node.children = [];
  node.parent = target;
  target.children.push(node);
}

function findWithProperty(node: Node, property: TokenProperties): Node {
  if (node.hasProperty(TokenProperties.ROOT)) {
    return undefined;
  }
  if (node.parent.hasProperty(property)) {
    return node.parent;
  } else {
    return findWithProperty(node.parent,property);
  } 
}

function findWithPOS(node: Node, majorPOS: MajorPartsOfSpeech): Node {
  if (getMajorPOS(node.token.POS) === MajorPartsOfSpeech.ROOT) {
    return undefined;
  }
  if (getMajorPOS(node.parent.token.POS) === majorPOS) {
    return node.parent;
  } else {
    return findWithPOS(node.parent,majorPOS);
  } 
}

function removeNode(node): void {
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

// Sets node to be a sibling of its parent
function promoteNode(node: Node): void {
  if (node.parent.hasProperty(TokenProperties.ROOT)) {
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
}

// Makes the node's parent a child of the node.
// The node's parent's parent is then the node's parent
function makeParentChild(node: Node): void {
  let parent = node.parent;
  // Do not swap with root
  if (parent.hasProperty(TokenProperties.ROOT)) {
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
  if (parent.hasProperty(TokenProperties.ROOT)) {
    return;
  }
  parent.parent = node;
  parent.children = node.children;
  pparent.children.splice(pparent.children.indexOf(parent),1);
  node.parent = pparent;
  node.children = [parent];
  pparent.children.push(node);
}

// EAV Functions

interface Entity {
  id: string,
  displayName: string,
  content: string,
  variable: string,
  entityAttribute: boolean,
  node?: Node,
  project: boolean,
}

function cloneEntity(entity: Entity): Entity {
  let clone: Entity = {
    id: entity.id,
    displayName: entity.displayName,
    content: entity.content,
    node: entity.node,
    entityAttribute: entity.entityAttribute,
    variable: entity.variable,
    project: entity.project,
  }
  return clone;
}

interface Collection {
  id: string,
  displayName: string,
  count: number,
  node?: Node,
  variable: string,
  project: boolean,
}

function cloneCollection(collection: Collection): Collection {
  let clone: Collection = {
    id: collection.id,
    displayName: collection.displayName,
    count: collection.count,
    node: collection.node,
    variable: collection.variable,
    project: collection.project,
  }
  return clone;
}

interface Attribute {
  id: string,
  displayName: string,
  entity?: Entity,
  collection?: Collection,
  value: string | number
  variable: string,
  node?: Node,
  project: boolean,
}

// Returns the entity with the given display name.
// If the entity is not found, returns undefined
// Two error modes here: 
// 1) the name is not found in "display name"
// 2) the name is found in "display name" but not found in "entity"
// can 2) ever happen?
// Returns the collection with the given display name.
export function findEveEntity(search: string): Entity {
  log("Searching for entity: " + search);
  let foundEntity;
  let name: string;
  // Try to find by display name first
  let display = eve.findOne("display name",{ name: search });
  if (display !== undefined) {
    foundEntity = eve.findOne("entity", { entity: display.id });
    name = search;
  // If we didn't find it that way, try again by ID
  } else {
    foundEntity = eve.findOne("entity", { entity: search });
  }
  // Build the collection
  if (foundEntity !== undefined) {
    if (name === undefined) {
      display = eve.findOne("display name",{ id: search });
      name = display.name;  
    }
    let entity: Entity = {
      id: foundEntity.entity,
      displayName: name,
      content: foundEntity.content,
      variable: foundEntity.entity,
      entityAttribute: false,
      project: true,
    }
    log(" Found: " + name);
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
  let display = eve.findOne("display name",{ name: search });
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
      count: foundCollection.count,
      variable: name,
      project: true,
    }
    log(" Found: " + name);
    return collection;
  } else {
    log(" Not found: " + search);
    return undefined;  
  }
}

// Returns the attribute with the given display name attached to the given entity
// If the entity does not have that attribute, or the entity does not exist, returns undefined
function findEveAttribute(name: string, entity: Entity): Attribute {
  log("Searching for attribute: " + name);
  log(" Entity: " + entity.displayName);
  let foundAttribute = eve.findOne("entity eavs", { entity: entity.id, attribute: name });
  if (foundAttribute !== undefined) {
    let attribute: Attribute = {
      id: foundAttribute.attribute,
      displayName: name,
      entity: entity,
      value: foundAttribute.value,
      variable: `${entity.displayName}|${name}`.replace(/ /g,''),
      project: true,
    }
    log(` Found: ${name} ${attribute.variable} => ${attribute.value}`);
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
}

interface Relationship {
  links?: Array<string>,
  type: RelationshipTypes,
}

function findCollectionToAttrRelationship(coll: string, attr: string): Relationship {
  // Finds a direct relationship between collection and attribute
  // e.g. "pets' lengths"" => pet -> snake -> length
  log(`Finding relationship between "${coll}" and "${attr}"...`);
  let relationship = eve.query(``)
    .select("collection entities", { collection: coll }, "collection")
    .select("entity eavs", { entity: ["collection", "entity"], attribute: attr }, "eav")
    .exec();
  if (relationship.unprojected.length > 0) {
    log("Found Direct Relationship");
    return {type: RelationshipTypes.DIRECT};
  }
  // Finds a one hop relationship
  // e.g. "department salaries" => department -> employee -> corey -> salary
  relationship = eve.query(``)
    .select("collection entities", { collection: coll }, "collection")
    .select("directionless links", { entity: ["collection", "entity"] }, "links")
    .select("entity eavs", { entity: ["links", "link"], attribute: attr }, "eav")
    .exec();
  if (relationship.unprojected.length > 0) {
    log("Found One-Hop Relationship");
    log(relationship)
    // Find the one-hop link
    let entities = extractFromUnprojected(relationship.unprojected, 1, 3);
    let collections = findCommonCollections(entities)
    let linkID;
    if (collections.length > 0) {
      // @HACK Choose the correct collection in a smart way. 
      // Largest collection other than entity or testdata?
      linkID = collections[0];  
    }
    return {links: [linkID], type: RelationshipTypes.ONEHOP};
  }
  // Not sure if this one works... using the entity table, a 2 hop link can
  // be found almost anywhere, yielding results like
  // e.g. "Pets heights" => pets -> snake -> entity -> corey -> height
  /*relationship = eve.query(``)
    .select("collection entities", { collection: coll }, "collection")
    .select("directionless links", { entity: ["collection", "entity"] }, "links")
    .select("directionless links", { entity: ["links", "link"] }, "links2")
    .select("entity eavs", { entity: ["links2", "link"], attribute: attr }, "eav")
    .exec();
  if (relationship.unprojected.length > 0) {
    return true;
  }*/
  log("No relationship found :(");
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

function findCollectionAttribute(node: Node, collection: Collection, context: Context): boolean {
  let relationship = findCollectionToAttrRelationship(collection.id,node.name);
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
}

function findEntityAttribute(node: Node, entity: Entity, context: Context): boolean {
  let attribute = findEveAttribute(node.name,entity);
  if (attribute !== undefined) {
    context.attributes.push(attribute);
    node.attribute = attribute;
    attribute.node = node;
    // If the node is possessive, check to see if it is an entity
    if (node.hasProperty(TokenProperties.POSSESSIVE) || node.hasProperty(TokenProperties.BACKRELATIONSHIP)) {
      let entity = findEveEntity(`${attribute.value}`);
      if (entity !== undefined) {
        node.entity = entity;
        entity.node = node;
        node.parent.entity.project = false;
        attribute.project = false;
        context.entities.push(entity); 
      }
    }
    node.found = true;
    return true;
  }
  return false;
}

// searches for a collection first, then tries to find an entity
function findCollectionOrEntity(node: Node, context: Context): boolean {
  let foundCollection = findCollection(node,context);
  if (foundCollection === true) {
    return true;
  } else {
    let foundEntity = findEntity(node,context);
    if (foundEntity === true) {
      return true;
    }
  }
  return false;
}

// searches for a collection first, then tries to find an entity
function findEntityOrCollection(node: Node, context: Context): boolean {
  let foundEntity = findEntity(node,context);
  if (foundEntity === true) {
    return true;
  } else {
    let foundCollection = findCollection(node,context);
    if (foundCollection === true) {
      return true;
    }
  }
  return false;
}

function findCollection(node: Node, context: Context): boolean {
  let collection = findEveCollection(node.name);
  if (collection !== undefined) {
    context.collections.push(collection);
    collection.node = node;
    node.collection = collection;
    node.found = true;
    if (node.hasProperty(TokenProperties.GROUPING)) {
      context.groupings.push(node.token);
    }
    return true;
  // Singularize and try to find a collection
  }
  return false;
}

function findEntity(node: Node, context: Context): boolean {
  let entity = findEveEntity(node.name);
  if (entity !== undefined) {
    context.entities.push(entity);
    entity.node = node;
    node.entity = entity;
    node.found = true;
    if (node.hasProperty(TokenProperties.GROUPING)) {
      context.groupings.push(node.token);
    }
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
  terms: Array<Term>,
  subqueries: Array<Query>,
  projects: Array<Term>,
  toString(number?: number): string;
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
    let queryString = indent + "(query";
    // Map each term/subquery/project to a string
    let termString = query.terms.map((term) => termToString(term,depth+1)).join("\n");
    let subqueriesString = query.subqueries.map((query) => query.toString(depth + 1)).join("\n");
    let projectsString = query.projects.map((term) => termToString(term,depth+1)).join("\n");
    // Now compose the query string
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
    let project = {
      type: "project!",
      fields: combinedProjectFields,
    }
    query.projects.push(project);
  }
  // If the node is a grouping node, stuff the query into a subquery
  // and take its projects
  if (node.hasProperty(TokenProperties.GROUPING)) {
    let subquery = query;
    query = newQuery();
    query.projects = query.projects.concat(subquery.projects);
    subquery.projects = [];
    query.subqueries.push(subquery);
  }
  
  // Handle the current node
  
  // Just return at the root
  if (node.hasProperty(TokenProperties.ROOT)) {
    // Reverse the order of fields in the projects
    for (let project of query.projects) {
      project.fields = project.fields.reverse();
    }
    return query;
  }
  // Handle functions
  if (node.fxn !== undefined) {
    // Skip functions with no arguments
    if (node.fxn.fields.length === 0) {
      return query;
    }
    let args = findLeafNodes(node).reverse();
    // If we have the right number of arguments, proceed
    // @TODO surface an error if the arguments are wrong
    let output;
    if (args.length === node.fxn.fields.length) {
      let fields: Array<Field> = args.map((arg,i) => {
        return {name: `${node.fxn.fields[i]}`, value: `${arg.attribute.variable}`, variable: true};
      });
      let term: Term = {
        type: "select",
        table: node.fxn.name,
        fields: fields,
      }  
      query.terms.push(term);
    }
    // project if necessary
    if (node.fxn.project === true) {
      let outputFields: Array<Field> = args.filter((arg) => arg.hasProperty(TokenProperties.OUTPUT))
                                           .map((arg) => {return {name: `${node.fxn.name}`, value: `${arg.attribute.variable}`, variable: true}});
      projectFields = projectFields.concat(outputFields);
      query.projects = []; 
    }
  }
  // Handle attributes
  if (node.attribute !== undefined) {
    let attr = node.attribute;
    let entity = attr.entity;
    let collection = attr.collection;
    let entityField: Field;
    if (entity !== undefined) {
      entityField = {name: "entity", value: `${attr.entity.entityAttribute ? attr.entity.variable : attr.entity.id}`, variable: attr.entity.entityAttribute};
    } else if (collection !== undefined) {
      entityField = {name: "entity", value: `${attr.collection.displayName}`, variable: true};
    } else {
      return query;
    }
    let attrField: Field = {name: "attribute", value: attr.id, variable: false};
    let valueField: Field = {name: "value", value: attr.variable, variable: true};
    let fields: Array<Field> = [entityField, attrField, valueField];
    let term: Term = {
      type: "select",
      table: "entity eavs",
      fields: fields,
    }
    query.terms.push(term);
    // project if necessary
    if (node.attribute.project === true) {
      let attributeField: Field = {name: `${node.attribute.id}` , value: node.attribute.variable, variable: true};
      projectFields.push(attributeField);
    }
  }
  // Handle collections
  if (node.collection !== undefined) {
    let entityField: Field = {name: "entity", value: node.collection.displayName, variable: true};
    let collectionField: Field = {name: "collection", value: node.collection.id, variable: false};
    let term: Term = {
      type: "select",
      table: "is a attributes",
      fields: [entityField, collectionField],
    }
    query.terms.push(term);
    // project if necessary
    if (node.collection.project === true) {
      let collectionField: Field = {name: `${node.collection.displayName.replace(new RegExp(" ", 'g'),"")}`, value: `${node.collection.displayName}`, variable: true};
      projectFields.push(collectionField);
    }
  }
  // Handle entities
  if (node.entity !== undefined) {
    // project if necessary
    if (node.entity.project === true) {
      let entityField: Field = {name: `${node.entity.displayName.replace(new RegExp(" ", 'g'),"")}`, value: `${node.entity.id}`, variable: false};
      projectFields.push(entityField);  
    }
  }
  let project = {
    type: "project!",
    fields: projectFields, 
  }
  query.projects.push(project);
  return query;
}

// ----------------------------------------------------------------------------
// Debug utility functions
// ---------------------------------------------------------------------------- 
let divider = "----------------------------------------";

export let debug = false;

function log(x: any) {
  if (debug) {
    console.log(x);
  }
}

export function nodeArrayToString(nodes: Array<Node>): string {
  let nodeArrayString = nodes.map((node) => node.toString()).join("\n" + divider + "\n");  
  return divider + "\n" + nodeArrayString + "\n" + divider;
}

export function tokenToString(token: Token): string {
  let properties = `(${token.properties.map((property: TokenProperties) => TokenProperties[property]).join("|")})`;
  properties = properties.length === 2 ? "" : properties;
  let tokenString = `${token.ix}: ${token.originalWord} | ${token.normalizedWord} | ${MajorPartsOfSpeech[getMajorPOS(token.POS)]} | ${MinorPartsOfSpeech[token.POS]} | ${properties}` ;
  return tokenString;
}

export function tokenArrayToString(tokens: Array<Token>): string {
  let tokenArrayString = tokens.map((token) => tokenToString(token)).join("\n");
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

// ----------------------------------------------------------------------------

declare var exports;
window["NLQP"] = exports;

  // Heuristic: don't include verbs at this stage
  
  // Find noun phrases. Noun phrases are a group of words that describe a root noun
  // e.g. "4-star restaurant" "the united states of america"
  // Heuristic: CD, DT, and JJ typically preceed a noun phrase
  // Heuristic: All noun phrases contain nouns. Corollary: all nouns belong to some noun phrase
  // common error: JJ/VB
  
  // Find relationships between noun groups. In the previous example, "the yellow dog" is related to "the town"
  // by the words "lived in"
  // Heuristic: relationships often exist between noun groups 
  
  // Find adjective phrases. These are analagous to noun phrases but for adjectives. E.g. "very tall person",
  // "very tall" is an adjective group
  // Adjective phrases contain modifiers on the adjective: Premodifiers, Postmodifiers, and Discontinuous Modifiers
  //   Premodifiers are always adverb phrases
  //   Postmodifiers can be an adverb phrase, a prepositional phrase, or a clause
  //   Discontinuous modifiers can be before and after the adjective.
  
  // Linking verbs: be [am is are was were has been are being etc.], become, seem. These are always linking verbs
  // Linking verb test: replace with am, is, or are and the sentence should still parse
  
  // Find prepositional phrases. These begin with a preposition and end with a noun, pronoun, gerund, or clause.
  // The object of the preposition will have zero or more modifiers describing it.
  // e.g. preposition + [modifiers] + noun | pronoun | gerund | clause
  // Purpose: as an adjective, prep phrase answers "which one?"
  //          as an adverb, answers "how" "when" or "where"
  
  // Heuristic: Prepositional phrase will NEVER contain the subject of the sentence 
  // Heuristic: Prepositional phrases begin with a preposition, and end with a noun group
  
  // Heuristic: The first noun is usually the subject
  // breaks this heuristic: "How many 4 star restaurants are in San Francisco?"
  // Here, star is the first noun, but 4-star is an adjective modifying restaurants,
  // which is the subject of the sentence.
  // Consider this alternative: the first noun group is the subject

  // Heuristic: attributes to a noun exist in close proximity to it

  /*
  let firstPersonPersonal: any = ["I","my","mine","myself"]
    
  let thirdPersonPersonal = ["he","him","his","himself",
                             "she","her","hers","herself",
                             "it","its","itself",
                             "they","them","their","theirs","themselves"];
                          
  let demonstrative= ["this","that","these","those"];
  
  let relative = ["who","whom","whose","that","which"];
  
  // Attach to a singular antecedent
  let singularIndefinite = ["each","either","neither",
                            "anybody","anyone","anything",
                            "everybody","everyone","everything",
                            "nobody","no one","nothing",
                            "somebody","someone","something"];
                            */
                            
                            
  // Heuristic: Now we have some noun groups. Are there any adjectives 
  // left over? Attach them to the closest noun group to the left
  /*
  let unusedAdjectives = findAll(tokens,(token: Token) => token.node !== undefined && getMajorPOS(token.POS) === MajorPartsOfSpeech.ADJECTIVE);
  console.log(unusedAdjectives);
  let targetNG: NounGroup;
  let foundConjunction: boolean;
  let adjIx = undefined 
  for (let adj of unusedAdjectives) {
    // finds the closest noun group to the left
    targetNG = null;
    foundConjunction = false;
    adjIx = adj.ix;
    for (let ng of nounGroups) {
      if (adj.ix - ng.end < 0) {
        break; 
      }
      targetNG = ng;
    }   
    // Are any conjunctions between the adjective and the targetNG?
    let conjunctions = tokens.filter((token) => token.POS === MinorPartsOfSpeech.CC);
    conjunctions.forEach((conj) => {
      if (conj.ix < adjIx && conj.ix > targetNG.end) {
        foundConjunction = true;
      } 
    });
    // If we found a NG to the left, and there are no CC inbetween
    // e.g. "Steve's age and salary". Salary should not be added as a child to age
    if (targetNG !== null && !foundConjunction) {
      addChildToNounGroup(targetNG,adj);
      targetNG.end = adj.ix;
    // If the target NG is null, this means there is no noun group to the left. 
    // This can happen in the case when a sentence begins with an adjective.
    // e.g. "Shortest flight between New York and San Francisco". Here, "shortest"
    // should be a child of "flight". But if "flight" is misclassified as a verb,
    // then the closest noun is "new york". But "new york" is prevented from attaching
    // "shortest" because it encountered a verb boundary during the left search heuristic.
    // Heuristic: reclassify the closest verb to the right as a noun
    } else {
      let targetVB: Token = null;
      // Start at the token to the right of the adj, scan for the closest verb
      for (let i = adj.ix + 1; i < tokens.length; i++) {
        let token = tokens[i];
        if (token.used === true) {
          continue; 
        }
        if (getMajorPOS(token.POS) === MajorPartsOfSpeech.VERB) {
          targetVB = token;
          // We found a verb, so we are done scanning  
          break;
        }
      }
      if (targetVB !== null) {
        targetVB.POS = MinorPartsOfSpeech.NN;
        // Start a new noun group
        let nounGroup: NounGroup = newNounGroup(targetVB);
        targetVB.used = true;
        // Add adjective and everything inbeetween as children to this new noun group
        for (let i = adj.ix; i < targetVB.ix; i++) {
          let token = tokens[i];
          addChildToNounGroup(nounGroup,token);
        }
        nounGroups.push(nounGroup);
      }  
    }
  }*/
