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
  let {tree, context} = formTree(tokens);
  let query = formQuery(tree);
  // Figure out the state flags
  let flag: StateFlags;
  if (query.projects.length === 0 && query.terms.length === 0) {
    flag = StateFlags.NORESULT;
  } else if (treeComplete(tree)) {
    flag = StateFlags.COMPLETE; 
  } else {
    flag = StateFlags.MOREINFO;
  }
  return [{tokens: tokens, tree: tree, context: context, query: query, score: undefined, state: flag}];
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

// Performs some transformations to the query string before tokenizing
export function preprocessQueryString(queryString: string): Array<PreToken> {
  // Add whitespace before commas
  let processedString = queryString.replace(new RegExp(",", 'g')," , ");
  processedString = processedString.replace(new RegExp(";", 'g')," ; ");
  processedString = processedString.replace(new RegExp("\\+", 'g')," + ");
  processedString = processedString.replace(new RegExp("-", 'g')," - ");
  processedString = processedString.replace(new RegExp("\\*", 'g')," * ");
  processedString = processedString.replace(new RegExp("/", 'g')," / ");
  processedString = processedString.replace(new RegExp("\\s+", 'g')," ");
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
  PLUS, // Sumbol (+)
  MINUS,// Sumbol (-)
  DIV,  // Sumbol (/)
  MUL,  // Sumbol (*)
  SEP,  // Separator (, ;)
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

enum Properties {
  ROOT,
  ENTITY,
  COLLECTION,
  ATTRIBUTE,
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
  COMPOUND,
  QUOTED,
  FUNCTION,
  GROUPING,
  OUTPUT,
  INPUT,
  NEGATES,
  IMPLICIT,
  AGGREGATE,
  CALCULATE,
  OPERATOR,
}

// Finds a given property in a token
function hasProperty(token: Token, property: Properties): boolean {
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
    let cursorPos = -2;
    let tokens: Array<Token> = preTokens.map((preToken: PreToken, i: number) => {
      let word = preToken.text;
      let tag = preToken.tag;
      let token: Token = {
        ix: i+1, 
        originalWord: word, 
        normalizedWord: word,
        start: cursorPos += 2,
        end: cursorPos += word.length - 1,
        POS: MinorPartsOfSpeech[tag],
        properties: [], 
      };
      let before = "";
           
      // Add default attribute markers to nouns
      if (token.POS === MinorPartsOfSpeech.NNO || 
          token.POS === MinorPartsOfSpeech.PP) {
        token.properties.push(Properties.POSSESSIVE);
      }
      if (token.POS === MinorPartsOfSpeech.NNP  ||
          token.POS === MinorPartsOfSpeech.NNPS ||
          token.POS === MinorPartsOfSpeech.NNPA) {
        token.properties.push(Properties.PROPER);
      }
      if (token.POS === MinorPartsOfSpeech.NNPS  ||
          token.POS === MinorPartsOfSpeech.NNS) {
        token.properties.push(Properties.PLURAL);
      }
      if (token.POS === MinorPartsOfSpeech.PP ||
          token.POS === MinorPartsOfSpeech.PRP) {
        token.properties.push(Properties.PRONOUN);
      }
      if (token.POS === MinorPartsOfSpeech.NNQ) {
        token.properties.push(Properties.PROPER);
        token.properties.push(Properties.QUOTED);
      }
      
      
      // Add default properties to adjectives and adverbs
      if (token.POS === MinorPartsOfSpeech.JJR || token.POS === MinorPartsOfSpeech.RBR) {
        token.properties.push(Properties.COMPARATIVE);
      }
      else if (token.POS === MinorPartsOfSpeech.JJS || token.POS === MinorPartsOfSpeech.RBS) {        
        token.properties.push(Properties.SUPERLATIVE);
      }
      
      // Add default properties to values
      if (token.POS === MinorPartsOfSpeech.CD ||
          token.POS === MinorPartsOfSpeech.NU) {
        token.properties.push(Properties.QUANTITY);
      }
      
      // Add default properties to separators
      if (token.POS === MinorPartsOfSpeech.CC) {
        token.properties.push(Properties.CONJUNCTION);
      }
      
      // normalize the word with the following transformations: 
      // --- strip punctuation
      // --- get rid of possessive ending 
      // --- convert to lower case
      // --- singularize
      // If the word is quoted
      if (token.POS === MinorPartsOfSpeech.NNQ ||
          token.POS === MinorPartsOfSpeech.CD) {
        token.normalizedWord = word;
      } else {
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
          token.properties.push(Properties.POSSESSIVE);
        }
        // --- convert to lowercase
        before = normalizedWord;
        normalizedWord = normalizedWord.toLowerCase();
        // Heuristic: if the word is not the first word in the sentence and it had capitalization, then it is probably a proper noun
        if (before !== normalizedWord && i !== 0) {
          token.POS = MinorPartsOfSpeech.NNP;
          token.properties.push(Properties.PROPER);     
        }
        // --- if the word is a (not proper) noun or verb, singularize
        if ((getMajorPOS(token.POS) === MajorPartsOfSpeech.NOUN || getMajorPOS(token.POS) === MajorPartsOfSpeech.VERB) && !hasProperty(token,Properties.PROPER)) {
          before = normalizedWord;
          normalizedWord = singularize(normalizedWord);
          // Heuristic: If the word changed after singularizing it, then it was plural to begin with
          if (before !== normalizedWord) {
            token.properties.push(Properties.PLURAL);
          }
        }      
        token.normalizedWord = normalizedWord;
      }

           
      // Heuristic: Special case "in" classified as an adjective. e.g. "the in crowd". This is an uncommon usage
      if (token.normalizedWord === "in" && getMajorPOS(token.POS) === MajorPartsOfSpeech.ADJECTIVE) 
      {
        token.POS = MinorPartsOfSpeech.IN;
      }

      // Heuristic: Special case words with no ambiguous POS that NLPC misclassifies
      switch (token.normalizedWord) {
        case "of":
          token.properties.push(Properties.BACKRELATIONSHIP); 
          break;
        case "per":
          token.properties.push(Properties.BACKRELATIONSHIP); 
          token.properties.push(Properties.GROUPING);
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
          token.POS = MinorPartsOfSpeech.CP;
          break;
        case "was":
          token.POS = MinorPartsOfSpeech.CP;
          break;
        case "as": 
          token.POS = MinorPartsOfSpeech.CP;
          break;
        case "were":
          token.POS = MinorPartsOfSpeech.CP;
          break;
        case "be":
          token.POS = MinorPartsOfSpeech.CP;
          break;
        case "do":
          token.POS = MinorPartsOfSpeech.VBP;
          break;
        case "no":
          token.properties.push(Properties.NEGATES);
          break;
        case "neither":
          token.POS = MinorPartsOfSpeech.CC;
          token.properties.push(Properties.NEGATES);
          break;
        case "nor":
          token.POS = MinorPartsOfSpeech.CC;
          token.properties.push(Properties.NEGATES);
          break;
        case "except":
          token.POS = MinorPartsOfSpeech.CC;
          token.properties.push(Properties.NEGATES);
          break;
        case "without":
          token.POS = MinorPartsOfSpeech.CC;
          token.properties.push(Properties.NEGATES);
          break;
        case "not":
          token.POS = MinorPartsOfSpeech.CC;
          token.properties.push(Properties.NEGATES);
          break;
        case "average":
          token.POS = MinorPartsOfSpeech.NN;
          break;
        case "mean":
          token.POS = MinorPartsOfSpeech.NN;
          break;
        case "their":
          token.properties.push(Properties.PLURAL);
          break;
        case "most":
          token.POS = MinorPartsOfSpeech.JJS;
          token.properties.push(Properties.SUPERLATIVE);
          break;
        case "best":
          token.POS = MinorPartsOfSpeech.JJS;
          token.properties.push(Properties.SUPERLATIVE);
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
          token.properties.push(Properties.PLURAL);
          break;
      }
      
      // Special case symbols
      switch (token.normalizedWord) {
        case ">": 
          token.POS = MinorPartsOfSpeech.GT;
          token.properties.push(Properties.COMPARATIVE);
          break;
        case ">=": 
          token.POS = MinorPartsOfSpeech.GTE;
          token.properties.push(Properties.COMPARATIVE);
          break;
        case "<":
          token.POS = MinorPartsOfSpeech.LT;
          token.properties.push(Properties.COMPARATIVE);
          break;
        case "<=":
          token.POS = MinorPartsOfSpeech.LTE;
          token.properties.push(Properties.COMPARATIVE);
          break;
        case "=":
          token.POS = MinorPartsOfSpeech.EQ;
          token.properties.push(Properties.COMPARATIVE);
          break;
        case "!=":
          token.POS = MinorPartsOfSpeech.NEQ;
          token.properties.push(Properties.COMPARATIVE);
          break;
        case "+":
          token.POS = MinorPartsOfSpeech.PLUS;
          token.properties.push(Properties.OPERATOR);
          break;
        case "-":
          token.POS = MinorPartsOfSpeech.MINUS;
          token.properties.push(Properties.OPERATOR);
          break;
        case "*":
          token.POS = MinorPartsOfSpeech.MUL;
          token.properties.push(Properties.OPERATOR);
          break;
        case "/":
          token.POS = MinorPartsOfSpeech.DIV;
          token.properties.push(Properties.OPERATOR);
          break;
        case ",":
          token.POS = MinorPartsOfSpeech.SEP;
          token.properties.push(Properties.SEPARATOR);
          break;
        case ";":
          token.POS = MinorPartsOfSpeech.SEP;
          token.properties.push(Properties.SEPARATOR);
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
        token.properties.push(Properties.POSSESSIVE);
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
      adverbs.map((adverb: Token) => adverbToAdjective(adverb));
    } else {
      // Heuristic: Adverbs are located close to verbs
      // Get the distance from each adverb to the closest verb as a percentage of the length of the sentence.
      let adverbs: Array<Token> = tokens.filter((token: Token) => getMajorPOS(token.POS) === MajorPartsOfSpeech.ADVERB);
      adverbs.map((adverb: Token) => {
          let closestVerb = tokens.length;
          verbs.map((verb: Token) => {
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
      properties: [Properties.ROOT], 
    };
    
    tokens = [rootToken].concat(tokens);
    
    // Link tokens to eachother
    for (let i = 0; i < tokens.length; i++) {
      let token = tokens[i];
      token.prev = tokens[i - 1];
      token.next = tokens[i + 1];
    }
    
    log(tokenArrayToString(tokens));
    
    return tokens;
}

function adverbToAdjective(token: Token): Token {
  let word = token.normalizedWord;
  // Heuristic: Words that end in -est are superlative
  if (word.substr(word.length-3,word.length) === "est") {
    token.POS = MinorPartsOfSpeech.JJS;
    token.properties.push(Properties.SUPERLATIVE);
  // Heuristic: Words that end in -er are comaprative
  } else if (word.substr(word.length-2,word.length) === "er"){
    token.POS = MinorPartsOfSpeech.JJR;
    token.properties.push(Properties.COMPARATIVE);
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
      minorPartOfSpeech === MinorPartsOfSpeech.NNO  ||
      minorPartOfSpeech === MinorPartsOfSpeech.NG   ||
      minorPartOfSpeech === MinorPartsOfSpeech.PRP  ||
      minorPartOfSpeech === MinorPartsOfSpeech.PP) {
        return MajorPartsOfSpeech.NOUN;
  }
  // Value
  if (minorPartOfSpeech === MinorPartsOfSpeech.CD ||
      minorPartOfSpeech === MinorPartsOfSpeech.DA ||
      minorPartOfSpeech === MinorPartsOfSpeech.NU) {
        return MajorPartsOfSpeech.VALUE;
  }
  // Glue
  if (minorPartOfSpeech === MinorPartsOfSpeech.FW  ||
      minorPartOfSpeech === MinorPartsOfSpeech.IN  ||
      minorPartOfSpeech === MinorPartsOfSpeech.CP  ||
      minorPartOfSpeech === MinorPartsOfSpeech.MD  ||
      minorPartOfSpeech === MinorPartsOfSpeech.CC  ||
      minorPartOfSpeech === MinorPartsOfSpeech.PDT ||
      minorPartOfSpeech === MinorPartsOfSpeech.DT  ||
      minorPartOfSpeech === MinorPartsOfSpeech.UH  ||
      minorPartOfSpeech === MinorPartsOfSpeech.EX) {
        return MajorPartsOfSpeech.GLUE;
  }  
  // Symbol
  if (minorPartOfSpeech === MinorPartsOfSpeech.LT    ||
      minorPartOfSpeech === MinorPartsOfSpeech.GT    ||
      minorPartOfSpeech === MinorPartsOfSpeech.GTE   ||
      minorPartOfSpeech === MinorPartsOfSpeech.LTE   ||
      minorPartOfSpeech === MinorPartsOfSpeech.EQ    ||
      minorPartOfSpeech === MinorPartsOfSpeech.NEQ   ||
      minorPartOfSpeech === MinorPartsOfSpeech.PLUS  ||
      minorPartOfSpeech === MinorPartsOfSpeech.MINUS ||
      minorPartOfSpeech === MinorPartsOfSpeech.DIV   ||
      minorPartOfSpeech === MinorPartsOfSpeech.MUL   ||
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
  let specialCases = ["his", "times", "has", "downstairs", "united states", "its"];
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
    let attribute = node.attribute === undefined ? "" : `[${node.attribute.variable} (${node.attribute.value})] `;
    let entity = node.entity === undefined ? "" : `[${node.entity.displayName}] `;
    let collection = node.collection === undefined ? "" : `[${node.collection.displayName}] `;
    let fxn = node.fxn === undefined ? "" : `[${node.fxn.name}] `;
    let negated = node.hasProperty(Properties.NEGATES) ? "!" : "";
    let found = node.found ? "*" : " ";
    let entityOrProperties = found === " " ? `${properties}` : `${negated}${fxn}${entity}${collection}${attribute}`;
    properties = properties.length === 2 ? "" : properties;
    let nodeString = `|${found}${indent}${index}${node.name} ${entityOrProperties}${children}`; 
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
    return node;
  }
  if (node.parent === undefined && node.children.length === 0) {
    return node;
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


// Returns the first ancestor node that has been found
function previouslyMatched(node: Node, ignoreFunctions?: boolean): Node {
  if (ignoreFunctions === undefined) {
    ignoreFunctions = false;
  }
  if (node.parent === undefined) {
    return undefined;
  } else if (!ignoreFunctions && node.parent.hasProperty(Properties.FUNCTION) && !node.parent.hasProperty(Properties.CONJUNCTION))  {
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
  } else if (!ignoreFunctions && node.parent.hasProperty(Properties.FUNCTION) && !node.parent.hasProperty(Properties.CONJUNCTION))  {
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
  } else if (!ignoreFunctions && node.parent.hasProperty(Properties.FUNCTION) && !node.parent.hasProperty(Properties.CONJUNCTION))  {
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
  if (node.hasProperty(Properties.ROOT)) {
    return undefined;
  }
  if (node.parent.hasProperty(property)) {
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

export enum FunctionTypes {
  FILTER,
  AGGREGATE,
  BOOLEAN,
  CALCULATE,
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

interface Context {
  entities: Array<Entity>,
  collections: Array<Collection>,
  attributes: Array<Attribute>,
  setAttributes: Array<Attribute>, 
  fxns: Array<BuiltInFunction>,
  groupings: Array<Node>,
  relationships: Array<Relationship>,
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
    maybeEntities: [],
    maybeAttributes: [],
    maybeCollections: [],
    maybeFunctions: [],
    maybeArguments: [],
  };
}

function wordToFunction(word: string): BuiltInFunction {
  switch (word) {
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
    case "*":
      return {name: "*", type: FunctionTypes.CALCULATE, fields: ["result", "a", "b"], project: true};
    case "divide":
    case "divided":
    case "/":
      return {name: "/", type: FunctionTypes.CALCULATE, fields: ["result", "a", "b"], project: true};
    default:
      return undefined;
  }
}

function formTree(tokens: Array<Token>) {  
  let tree: Node;
  let subsumedNodes: Array<Node> = [];

  // Turn tokens into nodes
  let nodes = tokens.filter((token) => token.node === undefined).map(newNode);
  
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
  let stop = performance.now();

  // Check each ngram for a display name
  let matchedNgrams: Array<Array<Node>> = [];
  for (let i = ngrams.length - 1; i >= 0; i--) {
    let ngram = ngrams[i];
    let allFound = ngram.every((node) => node.found);
    if (allFound !== true) {
      let displayName = ngram.map((node)=>node.name).join(" ");
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
        }
      }
    }
  }
  
  // Turn ngrams into compound nodes
  log("Creating compound nodes...");
  for (let ngram of matchedNgrams) {
    // Don't do anything for 1-grams
    if (ngram.length === 1) {
      ngram[0].found = false
      continue;
    }
    log(ngram.map((node)=>node.name).join(" "));
    let displayName = ngram.map((node)=>node.name).join(" ");
    let lastGram = ngram[ngram.length - 1];
    let compoundToken = newToken(displayName);
    let compoundNode = newNode(compoundToken);
    compoundNode.constituents = ngram;
    compoundNode.ix = lastGram.ix;
    // Inherit properties from the nodes
    compoundNode.properties = lastGram.properties;    
    compoundNode.properties.push(Properties.COMPOUND);
    // Insert compound node and remove constituent nodes
    nodes.splice(nodes.indexOf(ngram[0]),ngram.length,compoundNode);
  }

  // Do a quick pass to identify functions
  log("Identifying functions...")
  tokens.map((token) => {
    let node = token.node;
    let fxn = wordToFunction(node.name);
    if (fxn !== undefined) {
      log(`Found: ${fxn.name}`);
      node.fxn = fxn;
      fxn.node = node;
      node.properties.push(Properties.FUNCTION);
      if (node.fxn.type === FunctionTypes.AGGREGATE) {
        node.properties.push(Properties.AGGREGATE);  
      } else if (node.fxn.type === FunctionTypes.CALCULATE) {
        node.properties.push(Properties.CALCULATE);
      }
    }    
  });
  
  // Link nodes end to end
  nodes.map((thisNode,i) => {
    let nextNode = nodes[i + 1];
    if (nextNode !== undefined) {
      thisNode.found = false;
      thisNode.addChild(nextNode);  
    }
  })

  // At this point we should only have a single root.
  nodes = nodes.filter((node) => node.parent === undefined);
  tree = nodes.pop();
  
  function resolveEntities(node: Node, context: Context): Context {
    let relationship: Relationship;
    
    loop0:
    while (node !== undefined) {
      context.maybeAttributes = context.maybeAttributes.filter((maybeAttr) => !maybeAttr.found);
      log("------------------------------------------");
      log(node);
      
      // Handle nodes that we previously found but need to get hooked up to a function
      if (node.found && node.hasProperty(Properties.ATTRIBUTE) && node.children.length === 0 && context.maybeArguments.length > 0) {
          log("Handling missing attribute")
          let argument = context.maybeArguments.shift();
          if (node.parent.hasProperty(Properties.ENTITY) || node.parent.hasProperty(Properties.COLLECTION)) {
            let parent = removeNode(node.parent);
            argument.addChild(parent);
            removeNode(node);
            parent.addChild(node);
            argument.found = true;
            if (parent.collection) {
              parent.collection.project = false;  
            } else {
              parent.entity.project = false;
            }
          }
          break;    
      }
      
      // Skip certain nodes
      if (node.found ||
          node.hasProperty(Properties.IMPLICIT) ||
          node.hasProperty(Properties.ROOT)) {
        log("Skipping...");
        break;
      }
      
      // Handle form of "is"
      if (node.name === "is") {
        console.log("Handling forms of 'is'...");
        node.properties.push(Properties.FUNCTION);
        let previouslyFound = previouslyMatchedEntityOrCollection(node);
        let targetAttribute = context.maybeAttributes[context.maybeAttributes.length - 1];
        if (targetAttribute === undefined) {
          targetAttribute = previouslyMatchedAttribute(node);
          if (targetAttribute === undefined) {
            break;
          }
        }
        node.found = true;
        let child = node.children[0];
        if (child !== undefined) {
          // Build an attribute
          if (previouslyFound.hasProperty(Properties.ENTITY)) {
            let attribute: Attribute = {
              id: targetAttribute.name,
              displayName: targetAttribute.name,
              entity: previouslyFound.entity,
              value: undefined,
              variable: `${previouslyFound.entity.id}|${targetAttribute.name}`.replace(/ /g,''),
              node: targetAttribute,
              project: false,
            };  
            previouslyFound.entity.project = false;
            targetAttribute.attribute = attribute;
          } 
          // If the next node is a quantiy, set the value of the attribute to 
          // the value of the quantity
          if (child.hasProperty(Properties.QUANTITY)) {
            targetAttribute.attribute.value = parseFloat(child.name);
            context.setAttributes.push(targetAttribute.attribute);
            targetAttribute.found = true;
            child.found = true;
          }
        }
        node = child.children[0];
        continue;
      }
      
      // Remove certain nodes
      if (!node.hasProperty(Properties.FUNCTION)) {
        if (node.hasProperty(Properties.SEPARATOR) ||
            getMajorPOS(node.token.POS) === MajorPartsOfSpeech.WHWORD ||
            getMajorPOS(node.token.POS) === MajorPartsOfSpeech.GLUE) {
          log(`Removing node "${node.name}"`);
          node = node.children[0];
          if (node !== undefined) {
            let rNode = removeNode(node.parent);
            if (rNode.hasProperty(Properties.GROUPING)) {
              node.properties.push(Properties.GROUPING);
            }
            if (rNode.hasProperty(Properties.NEGATES)) {
              node.properties.push(Properties.NEGATES);
            }
          }
          continue;
        }
      }
      
      // Handle quantities
      if (node.hasProperty(Properties.QUANTITY)) {
        log("Handling quantity...")
        if (isNumeric(node.name) === false) {
          break;
        }
        // Create an attribute for the quantity 
        let quantityAttribute: Attribute = {
          id: node.name,
          displayName: node.name,
          value: parseFloat(node.name),
          variable: `${node.name}`,
          node: node,
          project: false,
        }
        node.attribute = quantityAttribute;
        node.properties.push(Properties.ATTRIBUTE);
        node.found = true;
        // If there is a maybeArgument, attach the quantity to it
        if (context.maybeArguments.length > 0) {
          let argument = context.maybeArguments.shift();
          let qNode = node;
          node = qNode.children[0];
          removeNode(qNode);
          argument.addChild(qNode); 
          argument.found = true;
          continue;
        }
        break;
      }
      
      // Handle functions
      if (node.hasProperty(Properties.FUNCTION)) {
        log("Handling function...")
        
        // Handle comparative functions
        if (node.hasProperty(Properties.COMPARATIVE)) {
          let attribute = node.fxn.attribute;
          let compAttrToken = newToken(node.fxn.attribute);
          compAttrToken.properties.push(Properties.IMPLICIT);
          let compAttrNode = newNode(compAttrToken);
          compAttrNode.fxn = node.fxn;
          // Add two argument nodes
          let argumentTokenA = newToken("a");
          let argumentNodeA = newNode(argumentTokenA);
          argumentNodeA.properties.push(Properties.IMPLICIT);
          argumentNodeA.properties.push(Properties.INPUT);
          node.addChild(argumentNodeA);
          context.maybeArguments.push(argumentNodeA);
          let argumentTokenB = newToken("b");
          let argumentNodeB = newNode(argumentTokenB);
          argumentNodeB.properties.push(Properties.IMPLICIT);
          argumentNodeB.properties.push(Properties.INPUT);
          node.addChild(argumentNodeB);
          context.maybeArguments.push(argumentNodeB);

          // Find a node for the LHS of the comaparison
          let matchedNode = previouslyMatched(node);
          let compAttrNode1 = cloneNode(compAttrNode);
          relationship = findRelationship(matchedNode,compAttrNode1,context);
          if (relationship.type === RelationshipTypes.DIRECT) {
            removeNode(matchedNode);
            matchedNode.addChild(compAttrNode1);
            compAttrNode1.attribute.project = false;
            argumentNodeA.addChild(matchedNode);
            argumentNodeA.found = true;
            context.maybeArguments.shift();
          }
          // Push the RHS attribute onto the context and continue searching
          context.maybeAttributes.push(compAttrNode);
          node.found = true;
        // Handle aggregates
        } else if (node.hasProperty(Properties.AGGREGATE)) {
          // Add an output token
          let outputToken = newToken("output");
          let outputNode = newNode(outputToken);
          outputNode.found = true;
          outputNode.properties.push(Properties.IMPLICIT);
          outputNode.properties.push(Properties.OUTPUT);
          let outputAttribute: Attribute = {
            id: outputNode.name,
            displayName: outputNode.name,
            value: `${node.fxn.name}|${outputNode.name}`,
            variable: `${node.fxn.name}|${outputNode.name}`,
            node: outputNode,
            project: true,
          }
          outputNode.attribute = outputAttribute;          
          node.addChild(outputNode);
          // Add an input node
          let argumentToken = newToken("input");
          let argumentNode = newNode(argumentToken);
          argumentNode.properties.push(Properties.IMPLICIT);
          argumentNode.properties.push(Properties.INPUT);
          node.addChild(argumentNode);
          context.maybeArguments.push(argumentNode);
          node.found = true;
        // Handle calculations
        } else if (node.hasProperty(Properties.CALCULATE)) {
          // Create a result node
          let resultToken = newToken(node.fxn.fields[0]);
          let resultNode = newNode(resultToken);
          resultNode.properties.push(Properties.OUTPUT);
          resultNode.properties.push(Properties.IMPLICIT);
          let resultAttribute: Attribute = {
            id: resultNode.name,
            displayName: resultNode.name,
            value: `${node.fxn.name}|${resultNode.name}`,
            variable: `${node.fxn.name}|${resultNode.name}`,
            node: resultNode,
            project: true,
          }
          resultNode.attribute = resultAttribute;          
          node.addChild(resultNode);
          resultNode.found = true;
          // Add two argument nodes
          let argumentTokenA = newToken("a");
          let argumentNodeA = newNode(argumentTokenA);
          argumentNodeA.properties.push(Properties.IMPLICIT);
          argumentNodeA.properties.push(Properties.INPUT);
          node.addChild(argumentNodeA);
          let argumentTokenB = newToken("b");
          let argumentNodeB = newNode(argumentTokenB);
          argumentNodeB.properties.push(Properties.IMPLICIT);
          argumentNodeB.properties.push(Properties.INPUT);
          node.addChild(argumentNodeB);
          // If we already found a numerical attribute, rewire it
          let foundQuantity = findParentWithProperty(node, Properties.QUANTITY);
          if (foundQuantity !== undefined && foundQuantity.found === true) {
            removeNode(foundQuantity);
            argumentNodeA.addChild(foundQuantity);
            argumentNodeA.found = true;
            foundQuantity.attribute.project = false;
            // If the node has an entity, rewire it as a child of the function
            if (foundQuantity.attribute.entity) {
              foundQuantity.attribute.entity.project = false;
            }
          } else {
            context.maybeArguments.push(argumentNodeA);
          }
          context.maybeArguments.push(argumentNodeB);
          node.found = true;
        } else if (node.hasProperty(Properties.CONJUNCTION)) {
          node.found = true;
        }
        context.fxns.push(node.fxn);
        log(tree.toString());
        break;
      }
      
      // Handle pronouns
      if (node.hasProperty(Properties.PRONOUN)) {
        log("Handling pronoun...")
        let matchedNode = previouslyMatchedEntityOrCollection(node, true);
        if (matchedNode !== undefined) {
          if (matchedNode.collection !== undefined) {
            node.collection = matchedNode.collection;
            node.properties.push(Properties.COLLECTION);
            node.found = true;
            log(`Found: ${matchedNode.name}`);
            break;
          } else if (matchedNode.entity !== undefined) {
            node.entity = matchedNode.entity
            node.properties.push(Properties.ENTITY);
            node.found = true;
            log(`Found: ${matchedNode.name}`);
            break;
          }
        }
        log("No pronoun match found");
        break;
      }
      
      // Find the relationship between parent and child nodes
      // Previously matched node
      let matchedNode = previouslyMatched(node);
      if (matchedNode !== undefined) {
        log(`Match in context of previously matched node "${matchedNode.name}"`);
        // Find relationship between previously matched node and this one
        if (matchedNode.hasProperty(Properties.POSSESSIVE)) {
          if (matchedNode.hasProperty(Properties.ENTITY)) {
            let found = findEntityAttribute(node, matchedNode.entity, context);
            if (found === true) {
              relationship = {type: RelationshipTypes.DIRECT};
            } else {
              findCollectionOrEntity(node, context);  
            }
          } else {
            relationship = findRelationship(matchedNode, node, context);  
          }
        } else {
          findCollectionOrEntity(node, context);
          relationship = findRelationship(matchedNode, node, context);
        }
      // Nothing has been matched, try to match against any maybe attributes
      } else {
        findCollectionOrEntity(node, context);
        for (let maybeAttr of context.maybeAttributes) {
          log("Matching previously unmatched nodes...");
          relationship = findRelationship(maybeAttr, node, context);
          // Rewire found attributes
          if (maybeAttr.found === true) {
            removeNode(maybeAttr);
            // If the attr was an implicit attribute derived from a function,
            // move the node to be a child of the function and reroot the rest of the query
            if (maybeAttr.hasProperty(Properties.IMPLICIT)) {
              maybeAttr.attribute.project = false;
              let thisNode = node;
              node = node.children[0];
              if (node !== undefined) {
                reroot(node,findParentWithProperty(node,Properties.ROOT));   
              }
              thisNode.addChild(maybeAttr);
              if (context.maybeArguments.length > 0) {
                let fxnArgNode = context.maybeArguments.shift();
                reroot(thisNode, fxnArgNode);
                fxnArgNode.found = true;
                continue loop0;
              }
            } else {
              node.addChild(maybeAttr);
            }
          }
        };
      }

      // Rewire node to reflect an argument of a function
      if (node.hasProperty(Properties.ATTRIBUTE) && context.maybeArguments.length > 0) {
          let argument = context.maybeArguments.shift();
          let qNode = node;
          node = qNode.children[0];
          removeNode(qNode);
          argument.addChild(qNode); 
          argument.found = true;
          if (qNode.attribute.entity) {
            qNode.attribute.entity.project = false;  
          }
          continue;  
      }
      
      // Rewire nodes to reflect found relationship
      if (relationship !== undefined && relationship.type !== RelationshipTypes.NONE) {
        // For a direct relationship, move the found node to the entity/collection
        if (relationship.type === RelationshipTypes.DIRECT) {
          if (node.attribute) {
            let targetNode: Node;
            if (node.attribute.collection && node.parent !== node.attribute.collection.node) {
              targetNode = node.attribute.collection.node;
            } else if (node.attribute.entity && node.parent !== node.attribute.entity.node) {
              targetNode = node.attribute.entity.node;
            }
            if (targetNode !== undefined) {
              let rNode = node;
              node = node.children[0];
              removeNode(rNode);
              targetNode.addChild(rNode);
              continue;
            }
          }
        // For a one-hop relationship, we need to insert the linking node
        } else if (relationship.type === RelationshipTypes.ONEHOP) {
          log(relationship)
          if (relationship.nodes[0].collection) {
            let collection = relationship.nodes[0].collection;
            let linkID = relationship.links[0];
            let nCollection = findEveCollection(linkID);
            if (nCollection !== undefined) {
              // Create a new link node
              let token = newToken(nCollection.displayName);
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
              };
              nNode.properties.push(Properties.IMPLICIT);
              nNode.properties.push(Properties.ATTRIBUTE);
              nNode.properties.push(Properties.COLLECTION);
              nNode.attribute = collectionAttribute;
              context.attributes.push(collectionAttribute);
              nNode.found = true;
              nNode.children[0].attribute.collection = nCollection;
            }     
          } else if (relationship.nodes[0].entity) {
            let entity = relationship.nodes[0].entity;
            let linkID = relationship.links[0];
            let nCollection = findEveCollection(linkID);
            if (nCollection !== undefined) {
              // Create a new link node
              let token = newToken(nCollection.displayName);
              let nNode = newNode(token);
              insertAfterNode(nNode,entity.node);
              nNode.collection = nCollection;
              nCollection.node = nNode;
              nNode.properties.push(Properties.IMPLICIT);
              nNode.properties.push(Properties.ATTRIBUTE);
              nNode.properties.push(Properties.COLLECTION);
              nNode.found = true;
              context.collections.push(nCollection);
              // Build a collection attribute to link with parent
              let collectionAttribute: Attribute = {
                  id: undefined,
                  displayName: nCollection.displayName,
                  collection: nCollection,
                  value: `${entity.id}`,
                  variable: `${entity.displayName}`,
                  node: nNode,
                  project: false,
              };
              nNode.attribute = collectionAttribute;
              context.attributes.push(collectionAttribute);
              nNode.children[0].attribute.collection = nCollection;
            }     
          }
        // For an intersection, set the correct variables on collections
        } else if (relationship.type === RelationshipTypes.INTERSECTION) {
          let [nodeA, nodeB] = relationship.nodes;
          nodeA.collection.variable = nodeB.collection.variable;
          nodeB.collection.project = false;
        }
      }
      
      // If no collection or entity has been found, do some work depending on the node
      if (node.found === false && !node.hasProperty(Properties.IMPLICIT)) {
        log("Not found");
        log(context)
        context.maybeAttributes.push(node);
      }
      break;
    }
    
    // Resolve entities for the children
    if (node !== undefined) {
      node.children.map((child) => resolveEntities(child,context));
    }
    
    return context;
  }

  log(tree.toString());
  log("Resolving entities...");
  let context = newContext();
  resolveEntities(tree,context);
  log("Entities resolved!");

  // Rewire groupings and aggregates
  // @TODO Do this in a rewire step
  let aggregate = findChildWithProperty(tree, Properties.AGGREGATE);
  if (aggregate !== undefined) {
    let grouping = findChildWithProperty(aggregate, Properties.GROUPING);
      if (grouping !== undefined) {
      removeNode(grouping);
      insertAfterNode(grouping,aggregate.parent);
    }  
  }
  
  // Sort children to preserve argument order in functions
  function sortChildren(node: Node): void {
    node.children.sort((a,b) => a.ix - b.ix);
    node.children.map(sortChildren);
  }
  sortChildren(tree);
  
  // Mark root as found
  tree.found = true;
  log(tree.toString());
  return {tree: tree, context: context};
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
  INTERSECTION,
}

interface Relationship {
  links?: Array<string>,
  type: RelationshipTypes,
  nodes?: Array<Node>,
}

function findRelationship(nodeA: Node, nodeB: Node, context: Context): Relationship {
  if (nodeA.hasProperty(Properties.QUANTITY) || nodeB.hasProperty(Properties.QUANTITY)) {
    log ("Quantities have no relationship to anything else in the system");
    return {type: RelationshipTypes.NONE}; 
  }
  log(`Finding relationship between "${nodeA.name}" and "${nodeB.name}"`);
  let relationship: Relationship;
  // If both nodes are Collections, find their relationship
  if (nodeA.hasProperty(Properties.COLLECTION) && nodeB.hasProperty(Properties.COLLECTION)) {
    relationship = findCollectionToCollectionRelationship(nodeA.collection, nodeB.collection);
  // If one node is a Collection, and the other node is neither a collection nor an entity
  } else if (nodeA.hasProperty(Properties.COLLECTION) && !(nodeB.hasProperty(Properties.COLLECTION) ||nodeB.hasProperty(Properties.ENTITY))) {
    relationship = findCollectionToAttrRelationship(nodeA.collection, nodeB, context);
  } else if (nodeB.hasProperty(Properties.COLLECTION) && !(nodeA.hasProperty(Properties.COLLECTION) || nodeA.hasProperty(Properties.ENTITY))) {
    relationship = findCollectionToAttrRelationship(nodeB.collection, nodeA, context);
  // If one node is an entity and the other is a collection 
  } else if (nodeA.hasProperty(Properties.COLLECTION) && nodeB.hasProperty(Properties.ENTITY)) {
    relationship = findCollectionToEntRelationship(nodeA.collection, nodeB.entity);
  } else if (nodeB.hasProperty(Properties.COLLECTION) && nodeA.hasProperty(Properties.ENTITY)) {
    relationship = findCollectionToEntRelationship(nodeB.collection, nodeA.entity);
  // If one node is an Entity, and the other node is neither a collection nor an entity
  } else if (nodeA.hasProperty(Properties.ENTITY) && !(nodeB.hasProperty(Properties.COLLECTION) || nodeB.hasProperty(Properties.ENTITY))) {
    relationship = findEntToAttrRelationship(nodeA.entity, nodeB, context);
  } else if (nodeB.hasProperty(Properties.ENTITY) && !(nodeA.hasProperty(Properties.COLLECTION) || nodeA.hasProperty(Properties.ENTITY))) {
    relationship = findEntToAttrRelationship(nodeB.entity, nodeA, context);
 // If one node is an Attribute, and the other node is neither a collection nor an entity
  } else if (nodeA.hasProperty(Properties.ATTRIBUTE) && !(nodeB.hasProperty(Properties.COLLECTION) || nodeB.hasProperty(Properties.ENTITY))) {
    relationship = findEntToAttrRelationship(nodeA.attribute.entity, nodeB, context);
  } else if (nodeB.hasProperty(Properties.ATTRIBUTE) && !(nodeA.hasProperty(Properties.COLLECTION) || nodeA.hasProperty(Properties.ENTITY))) {
    relationship = findEntToAttrRelationship(nodeB.attribute.entity, nodeA, context);
  }
  // If we found a relationship, add it to the context
  if (relationship !== undefined && relationship.type !== RelationshipTypes.NONE) {
    context.relationships.push(relationship);
    return relationship; 
  } else {
    return {type: RelationshipTypes.NONE};  
  }
}

// e.g. "meetings john was in"
function findCollectionToEntRelationship(coll: Collection, ent: Entity): Relationship {
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
  log("No relationship found :(");
  return { type: RelationshipTypes.NONE };
}

function findEntToAttrRelationship(entity: Entity, attr: Node, context: Context): Relationship {
  log(`Finding Ent -> Attr relationship between "${entity.displayName}" and "${attr.name}"...`);
  // Check for a direct relationship
  // e.g. "Josh's age"
  let found = findEntityAttribute(attr,entity,context);
  if (found === true) {
    return { type: RelationshipTypes.DIRECT };
  }
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
  log("No relationship found :(");
  return { type: RelationshipTypes.NONE };
}

export function findCollectionToCollectionRelationship(collA: Collection, collB: Collection): Relationship {  
  log(`Finding Coll -> Coll relationship between "${collA.displayName}" and "${collB.displayName}"...`);
  // are there things in both sets?
  let intersection = eve.query(`${collA.displayName}->${collB.displayName}`)
    .select("collection entities", { collection: collA.id }, "collA")
    .select("collection entities", { collection: collB.id, entity: ["collA", "entity"] }, "collB")
    .exec();
  // is there a relationship between things in both sets
  let relationships = eve.query(`relationships between ${collA.displayName} and ${collB.displayName}`)
    .select("collection entities", { collection: collA.id }, "collA")
    .select("directionless links", { entity: ["collA", "entity"] }, "links")
    .select("collection entities", { collection: collB.id, entity: ["links", "link"] }, "collB")
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
    return {type: RelationshipTypes.INTERSECTION, nodes: [collA.node, collB.node]};
  } else if (maxRel.count === 0 && intersectionSize === 0) {
    return {type: RelationshipTypes.NONE};
  } else {
    // @TODO
    return {type: RelationshipTypes.NONE};
  }
}

function findCollectionToAttrRelationship(coll: Collection, attr: Node, context: Context): Relationship {
  // Finds a direct relationship between collection and attribute
  // e.g. "pets' lengths"" => pet -> length
  log(`Finding Coll -> Attr relationship between "${coll.displayName}" and "${attr.name}"...`);
  let relationship = eve.query(``)
    .select("collection entities", { collection: coll.id }, "collection")
    .select("entity eavs", { entity: ["collection", "entity"], attribute: attr.name }, "eav")
    .exec();
  if (relationship.unprojected.length > 0) {    
    log("Found Direct Relationship");
    let collectionAttribute: Attribute = {
      id: attr.name,
      displayName: attr.name,
      collection: coll,
      value: `${coll.displayName}|${attr.name}`,
      variable: `${coll.displayName}|${attr.name}`,
      node: attr,
      project: true,
    }
    attr.attribute = collectionAttribute;
    context.attributes.push(collectionAttribute);
    attr.properties.push(Properties.ATTRIBUTE);
    attr.found = true;
    return {type: RelationshipTypes.DIRECT, nodes: [coll.node, attr]};
  }
  // Finds a one hop relationship
  // e.g. "department salaries" => department -> employee -> salary
  relationship = eve.query(``)
    .select("collection entities", { collection: coll.id }, "collection")
    .select("directionless links", { entity: ["collection", "entity"] }, "links")
    .select("entity eavs", { entity: ["links", "link"], attribute: attr.name }, "eav")
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
    // Build an attribute for the node
    let attribute: Attribute = {
        id: attr.name,
        displayName: attr.name,
        collection: coll,
        value: `${coll.displayName}|${attr.name}`,
        variable: `${coll.displayName}|${attr.name}`,
        node: attr,
        project: true,
    };
    attr.attribute = attribute;
    context.attributes.push(attribute);
    attr.properties.push(Properties.ATTRIBUTE);
    attr.found = true;
    return {links: [linkID], type: RelationshipTypes.ONEHOP, nodes: [coll.node, attr]};
  }
  // Not sure if this one works... using the entity table, a 2 hop link can
  // be found almost anywhere, yielding results like
  // e.g. "Pets heights" => pets -> snake -> entity -> corey -> height
  /*relationship = eve.query(``)
    .select("collection entities", { collection: coll.id }, "collection")
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
}

function findEntityAttribute(node: Node, entity: Entity, context: Context): boolean {
  let attribute = findEveAttribute(node.name,entity);
  if (attribute !== undefined) {
    if (isNumeric(attribute.value)) {
      node.properties.push(Properties.QUANTITY);
    }
    context.attributes.push(attribute);
    node.attribute = attribute;
    node.properties.push(Properties.ATTRIBUTE);
    attribute.node = node;
    // If the node is possessive, check to see if it is an entity
    if (node.hasProperty(Properties.POSSESSIVE) || node.hasProperty(Properties.BACKRELATIONSHIP)) {
      let entity = findEveEntity(`${attribute.value}`);
      if (entity !== undefined) {
        node.entity = entity;
        entity.variable = attribute.variable;
        entity.entityAttribute = true;
        entity.node = node;
        node.parent.entity.project = false;
        attribute.project = false;
        context.entities.push(entity); 
        node.properties.push(Properties.ENTITY);
      }
    }
    node.found = true;
    let entityNode = entity.node;
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
    node.properties.push(Properties.COLLECTION)
    if (node.hasProperty(Properties.GROUPING)) {
      context.groupings.push(node);
    }
    return true;
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
    node.properties.push(Properties.ENTITY)
    if (node.hasProperty(Properties.GROUPING)) {
      context.groupings.push(node);
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
    let project = {
      type: "project!",
      fields: combinedProjectFields,
    }
    query.projects.push(project);
  }
  // If the node is a grouping node, stuff the query into a subquery
  // and take its projects
  if (node.hasProperty(Properties.GROUPING)) {
    let subquery = query;
    query = newQuery();
    query.projects = query.projects.concat(subquery.projects);
    subquery.projects = [];
    query.subqueries.push(subquery);
  }
  
  // Handle the current node
  
  // Just return at the root
  if (node.hasProperty(Properties.ROOT)) {
    // Reverse the order of fields in the projects
    for (let project of query.projects) {
      project.fields = project.fields.reverse();
    }
    return query;
  }
  // Handle functions -------------------------------
  if (node.fxn !== undefined) {
    // Skip functions with no arguments
    if (node.fxn.fields.length === 0) {
      return query;
    }
    
    // Collection all input and output nodes which were found
    let nestedArgs = node.children.filter((child) => (child.hasProperty(Properties.INPUT) || child.hasProperty(Properties.OUTPUT)) 
                                                      && child.found === true)
                                  .map(findLeafNodes);
    let args = flattenNestedArray(nestedArgs);

    // If we have the right number of arguments, proceed
    // @TODO surface an error if the arguments are wrong
    let output;
    if (args.length === node.fxn.fields.length) {
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
      // If an aggregate is grouped, we have to push the aggregate into a subquery
      if (node.fxn.type === FunctionTypes.AGGREGATE && query.subqueries.length > 0) {
        let subquery = query.subqueries[0];
        if (subquery !== undefined) {
          subquery.terms.push(term);
        } 
      } else {
        query.terms.push(term);  
      }
      // project output if necessary
      if (node.fxn.project === true) {
        let outputFields: Array<Field> = args.filter((arg) => arg.hasProperty(Properties.OUTPUT))
                                            .map((arg) => {return {name: `${node.fxn.name}`, 
                                                                  value: `${arg.attribute.variable}`, 
                                                                variable: true}});
        projectFields = projectFields.concat(outputFields);
        query.projects = [];
      }
    }
  }
  // Handle attributes -------------------------------
  if (node.attribute !== undefined) {
    let attr = node.attribute;
    let entity = attr.entity;
    let collection = attr.collection;
    let fields: Array<Field> = [];
    let entityField: Field;
    // Entity
    if (entity !== undefined) {
      entityField = {name: "entity", 
                    value: `${attr.entity.entityAttribute ? attr.entity.variable : attr.entity.id}`, 
                 variable: attr.entity.entityAttribute};
    } else if (collection !== undefined) {
      entityField = {name: "entity", 
                    value: `${attr.collection.displayName}`, 
                 variable: true};
    } else {
      return query;
    }
    fields.push(entityField);
    // Attribute
    if (attr.id !== undefined) {
      let attrField: Field = {name: "attribute", 
                        value: attr.id, 
                    variable: false};
      fields.push(attrField);
    }
    // Value
    let valueField: Field = {name: "value", 
                            value: attr.id === undefined ? attr.value : attr.variable, 
                         variable: attr.id !== undefined};
    fields.push(valueField);
    let term: Term = {
      type: "select",
      table: "entity eavs",
      fields: fields,
    }
    query.terms.push(term);
    // project if necessary
    if (node.attribute.project === true && !node.hasProperty(Properties.NEGATES)) {
      let attributeField: Field = {name: `${node.attribute.id.replace(new RegExp(" ", 'g'),"")}` , 
                                  value: node.attribute.variable, 
                               variable: true};
      projectFields.push(attributeField);
    }
  }
  // Handle collections -------------------------------
  if (node.collection !== undefined && !node.hasProperty(Properties.PRONOUN)) {
    let entityField: Field = {name: "entity", 
                             value: node.collection.variable, 
                          variable: true};
    let collectionField: Field = {name: "collection", 
                                 value: node.collection.id, 
                              variable: false};
    let term: Term = {
      type: "select",
      table: "is a attributes",
      fields: [entityField, collectionField],
    }
    query.terms.push(term);
    // project if necessary
    if (node.collection.project === true && !node.hasProperty(Properties.NEGATES)) {
      let collectionField: Field = {name: `${node.collection.displayName.replace(new RegExp(" ", 'g'),"")}`, 
                                   value: `${node.collection.variable}`, 
                                variable: true};
      projectFields.push(collectionField);
    }
  }
  // Handle entities -------------------------------
  if (node.entity !== undefined && !node.hasProperty(Properties.PRONOUN)) {
    // project if necessary
    if (node.entity.project === true) {
      let entityField: Field = {name: `${node.entity.displayName.replace(new RegExp(" ", 'g'),"")}`, 
                               value: `${node.entity.entityAttribute ? node.entity.variable : node.entity.id}`, 
                            variable: node.entity.entityAttribute};
      projectFields.push(entityField);  
    }
  }
  let project = {
    type: "project!",
    fields: projectFields, 
  }
  
  if (node.hasProperty(Properties.NEGATES)) {
    let negatedTerm = query.terms.pop();
    let negatedQuery = negateTerm(negatedTerm);
    query.subqueries.push(negatedQuery);
  }
  
  query.projects.push(project);
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

export function nodeArrayToString(nodes: Array<Node>): string {
  let nodeArrayString = nodes.map((node) => node.toString()).join("\n" + divider + "\n");  
  return divider + "\n" + nodeArrayString + "\n" + divider;
}

export function tokenToString(token: Token): string {
  let properties = `(${token.properties.map((property: Properties) => Properties[property]).join("|")})`;
  properties = properties.length === 2 ? "" : properties;
  let tokenSpan = token.start === undefined ? " " : ` [${token.start}-${token.end}] `;
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

function isNumeric(n: any): boolean {
  return !isNaN(parseFloat(n)) && isFinite(n);
}


// ----------------------------------------------------------------------------

declare var exports;
window["NLQP"] = exports;
