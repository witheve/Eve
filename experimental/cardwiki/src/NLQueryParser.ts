import {eve} from "./app";

declare var pluralize;
declare var nlp;
declare var uuid;

// Entry point for NLQP
export function parse(preTokens: Array<PreToken>) {
  
  let tokens = formTokens(preTokens);
  let tree = formTree(tokens);
  let ast = formDSL(tree);
      
  return {tokens: tokens, tree: tree, ast: ast};
}

// Performs some transformations to the query string before tokenizing
export function preprocessQueryString(queryString: string): Array<PreToken> {
  // Add whitespace before commas
  let processedString = queryString.replace(new RegExp(",", 'g')," ,");
  processedString = processedString.replace(new RegExp(";", 'g')," ;");
  // Get parts of speach with sentence information. It's okay if they're wrong; they 
  // will be corrected as we create the tree and match against the underlying data model    
  let nlpTokens = nlp.pos(processedString, {dont_combine: true}).sentences[0].tokens;
  let preTokens: Array<PreToken> = nlpTokens.map((token,i) => {
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

export interface PreToken {
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
  ix: number;
  originalWord: string;
  normalizedWord: string;
  POS: MinorPartsOfSpeech;
  properties: Array<TokenProperties>,
  node?: Node,
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
      // --- if the word is a (not proper) noun, singularize
      if (getMajorPOS(token.POS) === MajorPartsOfSpeech.NOUN && !hasProperty(token,TokenProperties.PROPER)) {
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
        case "thier":
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
      originalWord: "ROOT", 
      normalizedWord: "ROOT", 
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
  let isSpecial = intersect([word],specialCases).length > 0;
  if (isSpecial) {
      return word;  
  } else { 
    return pluralize(word, 1);
  }
}

// ----------------------------------------------------------------------------
// Tree functions
// ----------------------------------------------------------------------------

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
  
  // Heuristic: Leftover determiners are themselves a noun group 
  // e.g. neither of these boys. ng = ([neither],[of these boys])
  let unusedDeterminers = findAll(tokens, (token: Token) => token.node === undefined && token.POS === MinorPartsOfSpeech.DT);
  for (let token of unusedDeterminers) {
    nounGroups.push(newNode(token));  
  }
  
  // Remove the superfluous noun groups
  //nounGroups = findAll(nounGroups,(ng: NounGroup) => ng.used === false);
  
  // Resolve pronoun coreferences
  // nounGroups = resolveReferences(nounGroups);
  
  // Sort the noun groups to reflect their order in the root sentence
  nounGroups = nounGroups.sort((ngA, ngB) => ngA.ix - ngB.ix);
  return nounGroups;
}


/*function resolveReferences(nounGroups: Array<NounGroup>): Array<NounGroup>  {
  
  // Define some pronouns
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

  // Get all the non personal pronouns
  let pronounGroups: Array<NounGroup> = findAll(nounGroups,(ng: NounGroup) => {
    let isPersonal = intersect(firstPersonPersonal,[ng.token.normalizedWord]).length > 0;
    return (hasProperty(ng,TokenProperties.REFERENCE) && !isPersonal);
  });
  let antecedents: Array<NounGroup> = findAll(nounGroups,(ng: NounGroup) => hasProperty(ng,TokenProperties.REFERENCE) === false);

  // Heuristic: Find the closest antecedent, set that as the noun group reference
  for (let png of pronounGroups) {
    // If the png already has a reference, we don't need to find one.
    // This will come in handy when the user specifies this with autocomplete    
    if (png.refersTo != undefined) {
      continue;
    }
    let closestAntecedent = null;
    for (let ng of antecedents) {
      if(ng.begin >= png.end) {
        break;
      }
      // Heuristic: possessive nouns are never antecedents
      if (hasProperty(ng,TokenProperties.POSSESSIVE) === true) {
        continue;
      }
      closestAntecedent = ng;
    }
    if (closestAntecedent != null)  {
      png.refersTo = closestAntecedent;  
    }
  }

  // Heuristic: joining singular nouns with "and" creates a plural antecedent
  // e.g. "The beetle and baby snake were thankful they escaped the lawnmower blade."
  
  return nounGroups;
}*/

// Adds a child token to a noun group and subsumes its properties. Marks token as used
function addChildToNounGroup(nounGroup: Node, token: Token) {
  let tokenNode = newNode(token);
  nounGroup.children.push(tokenNode);
  nounGroup.children.sort((a,b) => a.ix - b.ix);
  tokenNode.parent = nounGroup;
  //nounGroup.properties = nounGroup.properties.concat(token.properties);
}

interface Node {
  ix: number,
  name: string,
  parent: Node,
  children: Array<Node>,
  entity?: Entity,
  collection?: Collection,
  attribute?: Attribute,
  fxn?: BuiltInFunction,
  token: Token,
  properties: Array<TokenProperties>,
  hasProperty(TokenProperties): boolean;
}

// Transfer noun group properties to a node
function subsumeProperties(node: Node, nounGroup: Node) {
  node.properties = nounGroup.properties;
  // Make sure the properties are unique  
  node.properties = node.properties.filter(onlyUnique);
}

  function hasProperty(token: Token, property: TokenProperties): boolean {
    let found = token.properties.filter((p: TokenProperties) => p === property);
    if (found.length > 0) {
      return true;
    } else {
      return false;
    }
  }

function newNode(token: Token): Node {
  let node: Node = {
    ix: token.ix,
    name: token.normalizedWord,
    parent: undefined,
    children: [],
    token: token, 
    properties: token.properties,
    hasProperty: hasProperty,    
  };
  function hasProperty(property: TokenProperties): boolean {
    let found = node.properties.filter((p: TokenProperties) => p === property);
    if (found.length > 0) {
      return true;
    } else {
      return false;
    }
  }
  token.node = node;
  return node;  
}

interface BuiltInFunction {
  fxn: string,
  attribute?: string,
}

function wordToFunction(word: string): BuiltInFunction {
  switch (word) {
    case "taller":
      return {fxn: ">", attribute: "height"};
    case "shorter":
      return {fxn: "<", attribute: "length"};
    case "longer":
      return {fxn: ">", attribute: "length"};
    case "younger":
      return {fxn: "<", attribute: "age"};
    case "and":
      return {fxn: "AND"};
    case "or":
      return {fxn: "OR"};
    case "sum":
      return {fxn: "SUM"};
    case "average":
      return {fxn: "MEAN"};
    case "mean":
      return {fxn: "MEAN"};
    default:
      return {fxn: ""};
  }
}

function formTree(tokens: Array<Token>): Node {  
  let tree: Node;
  let subsumedNodes: Array<Node> = [];
  
  // First, find noun groups
  let nodes = formNounGroups(tokens);
  console.log("NOUN GROUPS");
  console.log(nodeArrayToString(nodes));
  
  // Fold in all the other tokens
  let unusedNodes = tokens.filter((token) => token.node === undefined).map(newNode);
  nodes = nodes.concat(unusedNodes);
  nodes.sort((a,b) => a.ix - b.ix);
  
  // Do a quick pass to identify functions
  tokens.forEach((token) => {
    let node = token.node;
    let fxn = wordToFunction(node.name);
    if (fxn.fxn !== "") {
      node.fxn = fxn;
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
  console.log(nodeToString(tree,tree.ix));
  // Split nodes
  let i = 0;
  let length = tokens.length * 2;
  while (true) {
    if (i > length) {
      console.log("Stopping runaway loop!");
      break;
    }
    function reroot(node: Node, target: Node): void {
      node.parent.children.splice(node.parent.children.indexOf(node),1);  
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
    function insertAfterNode(node: Node, target: Node): void {
      node.parent = target;
      node.children = target.children;
      target.children.map((n) => n.parent = node);
      target.children = [node];
    }
    function swapNodeWithParent(node: Node): void {
      let parent = node.parent;
      // Do not swap with root, instead, set everything as the children of the node
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
    //----------------------------
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
    // Heuristic: If the node is proper but not quoted, see if the next node is proper and 
    // if so create a compound node from the two
    } else if (node.hasProperty(TokenProperties.PROPER) && !node.hasProperty(TokenProperties.QUOTED)) {
      let properNouns = node.children.filter((child) => child.hasProperty(TokenProperties.PROPER) && !child.hasProperty(TokenProperties.COMPOUND));
      for (let pNoun of properNouns) {
        let newOriginalName = node.token.originalWord + " " + pNoun.token.originalWord;
        let newNormalizedName = node.name + " " + pNoun.name;
        let newToken: Token = {
          ix: pNoun.ix + 0.5,
          originalWord: newOriginalName,
          normalizedWord: newNormalizedName,
          POS: MinorPartsOfSpeech.NN,
          properties: node.properties.concat(pNoun.properties),
        };
        newToken.properties.push(TokenProperties.COMPOUND);
        let childProperties = node.children.map((child) => child.properties);
        let flatProperties = [].concat.apply([],childProperties);
        newToken.properties = newToken.properties.concat(flatProperties);
        newToken.properties = newToken.properties.filter(onlyUnique);
        let newProperNode = newNode(newToken);
        insertAfterNode(newProperNode,pNoun);
        tokens.splice(tokens.indexOf(token)+2,0,newToken);
      }
    // Heuristic: If the node is comaprative, swap with its parent
    } else if (node.hasProperty(TokenProperties.COMPARATIVE)) {
      swapNodeWithParent(node);
    } else if (node.hasProperty(TokenProperties.CONJUNCTION)) {
      swapNodeWithParent(node);
    }
    
    i++;
  }
    
  function sortChildren(node: Node): void {
    node.children.sort((a,b) => a.ix - b.ix);
    node.children.map(sortChildren);    
  }  
  sortChildren(tree);  
    
  console.log(tokenArrayToString(tokens));   
  console.log(nodeToString(tree,tree.ix));

  // THIS IS WHERE THE MAGIC HAPPENS!
  // Go through each node array and try to resolve entities
  function resolveEntities(node: Node): Node {
    console.log(node);
    let found = false;
    
    // Skip certain nodes
    if (node.hasProperty(TokenProperties.FUNCTION) ||
        node.hasProperty(TokenProperties.ROOT)) {
      console.log("Skipping");
      found = true;
    }
    // Attempt to match a function
    if (!found) {
      console.log("Search for a built in function")
      let fxn = wordToFunction(node.name);
      if (fxn.fxn !== "") {
        console.log(fxn);
        found = true;
      }
    }
    // If there is a backward relationship e.g. age of Corey, then try to find attrs
    // in the maybeAttr stack
    if (!found && node.hasProperty(TokenProperties.BACKRELATIONSHIP)) {
      console.log("Backrelationship: Searching for previously unmatched attributes");
      for (let maybeAttr of maybeAttributes) {
        // Find the parent entities and try to match attributes
        let entity = node.parent.entity;
        console.log(entity);
        if (entity === undefined) {
          let collection = node.parent.collection;
          // TODO find relationship between collection and attribute
        } else {
          let attribute = findAttribute(maybeAttr.name,entity);
          if (attribute !== undefined) {
            maybeAttr.attribute = attribute;
            attributes.push(attribute);  
            attribute.node = maybeAttr;
            found = true;
          }
        }
      }
    }
    // If the node is a pronoun, find an entity to substitute
    if (!found && node.hasProperty(TokenProperties.PRONOUN)) {
      console.log("Pronoun: finding reference");
      // If the pronoun is plural, the entity is probably the latest collection
      if (node.hasProperty(TokenProperties.PLURAL)) {
        let collection = collections[collections.length - 1];
        if (collection !== undefined) {
          console.log(collection.displayName);
          node.collection = collection;
          found = true;
        }
      } else {
        let entity = entities[entities.length - 1];
        if (entity !== undefined) {
          console.log(entity.displayName);
          node.entity = entity;
          found = true;
        }
      }
    }
    // If the node is possessive or proper, it's probably an entity
    if (!found && (node.hasProperty(TokenProperties.POSSESSIVE) || node.hasProperty(TokenProperties.PROPER))) {
      console.log("Possessive: finding entity");
      let entity = findEntityByDisplayName(node.name);
      if (entity !== undefined) {
        entities.push(entity);
        entity.node = node;
        node.entity = entity;
        found = true;
      }
    }
    // If the node is plural, it's probably a collection
    if (!found && node.hasProperty(TokenProperties.PLURAL)) {
      console.log("Plural: finding collection");
      let collection = findCollection(node.name);
      if (collection !== undefined) {
        collections.push(collection);
        found = true;
      }
    }
    // Try to find an attribute
    if (!found && (entities.length !== 0 || collections.length !== 0)) {
      console.log("Entity/Collection already found: finding attribute");
      let entity = entities[entities.length - 1];
      if (entity !== undefined) {
        let attribute = findAttribute(node.name,entity);
        if (attribute !== undefined) {
          attributes.push(attribute);
          node.attribute = attribute;
          attribute.node = node;
          // If the attribute is possessive, check to see if it is an entity
          if (node.hasProperty(TokenProperties.POSSESSIVE)) {
            let entity = findEntityByID(`${attribute.dbValue}`); // @HACK force string | number into string
            if (entity != undefined) {
              entities.push(entity);
              entity.node = node;
              node.entity = entity;
            }
          }
          found = true;
        }
      }      
    }
        
    // If we've gotten here and we haven't found anything, go crazy with searching
    if (!found) {
      console.log("Find this thing anywhere we can");
      let entity = findEntityByDisplayName(node.name);
      if (entity !== undefined) {
        entities.push(entity);
        entity.node = node;
        node.entity = entity;
        found = true;
      } else {
        let collection = findCollection(node.name);
        if (collection !== undefined) {
          collections.push(collection);
          collection.node = node;
          node.collection = collection;
          found = true;
        }  
      }
    }
    
    // If we still haven't found anything, it's probably an attribute we can find later
    if (!found) {
      maybeAttributes.push(node);
    }

    // Do the same for all the children
    node.children.map(resolveEntities);
    
    return node;
  }
  console.log("Finding Entities!");
  let entities: Array<Entity> = [];
  let collections: Array<Collection> = [];
  let attributes: Array<Attribute> = [];
  let maybeAttributes: Array<Node> = [];
  resolveEntities(tree);
  
  // rewire matched nodes to the correct parents
  for (let token of tokens) {
    let node = token.node;
    let attribute: Attribute = node.attribute;
    if (attribute !== undefined) {
      let maybeEntity = attribute.entity;
      if (typeof maybeEntity === "object") {
        let entity: Entity = maybeEntity;
        let node = attribute.node;
        // @HACK Is there a better way to do this?
        console.log(node)
        node.parent.children.splice(node.parent.children.indexOf(node),1);
        node.parent = entity.node;
        entity.node.children.push(node);
      }
    }
  }
  
  console.log(nodeToString(tree,0));
  
  console.log("Done");
  return;
  
  // Pull out comparator nodes
  
  
  /*
  let comparatorNodes: Array<Node> = roots.map((node) => {

  });*/
  
  /*
  // Identify the comparative functions for each node
  for (let node of comparatorNodes) {
    if (node === undefined) {
      continue;
    }
    let cng = node.nounGroups.filter((ng) => ng.isComparative);
    let comparativeTokens = cng.map((ng) => {
      let premods = ng.preModifiers.filter((token: Token) => token.isComparative);
      let postmods = ng.postModifiers.filter((token: Token) => token.isComparative);
      let compTokens = premods.concat(postmods);
      if (compTokens.length > 0) {
        return compTokens[0];  
      }
    });
    let functions = comparativeTokens.map((token) => wordToFunction(token.normalizedWord));
    // find the appropriate attribute for the node's entity
    let comparator = functions[0];
    let attribute: Attribute;
    if (node.entity !== undefined) {
      attribute = findAttribute(comparator.attribute,node.entity);  
    // TODO FIX THIS! It's not complete
    } else if (hasProperty(node,TokenProperties.QUANTITY)) {
      attribute = {
        id: comparator.attribute,
        displayName: comparator.attribute,
        entity: "",
        value: "",
      }
    }
    if (attribute !== undefined) {
      node.attributes.push(attribute);
      // Create a node for the function
      let comparatorNode: Node = {
        ix: undefined,
        name: comparator.function,
        parent: undefined,
        children: [node],
        nounGroups: [],
        function: comparator,
        entity: undefined,
        collection: undefined,
        attributes: [],
        properties: [TokenProperties.COMPARATIVE],        
      };
      node.parent = comparatorNode;
      // Heuristic: node to compare to is to the left of the comparator's index
      let boundary = comparativeTokens[0].ix;
      let lhsNode: Node;
      loop1:
      for (let nodeArray of nodeArrays) {
        for (let node of nodeArray) {
          if (node.ix < boundary) {
            lhsNode = node;
          } else {
            break loop1; 
          }  
        }
      }
      if (lhsNode !== undefined) {
        lhsNode.parent = comparatorNode;
        // If the lhs node is an entity, add an entity attribute
        let lhsAttribute: Attribute;
        if (lhsNode.entity !== undefined) {
          // TODO
        } else if (lhsNode.collection !== undefined) {
          lhsAttribute = {
            id: attribute.id,
            displayName: attribute.displayName,
            entity: lhsNode.collection.displayName,
            value: `${lhsNode.collection.displayName}|${attribute.displayName}`,
          }
        }
        lhsNode.attributes.push(lhsAttribute);
        comparatorNode.children.push(lhsNode); 
      }
      nodeArrays.push([comparatorNode]);
    }
  }
  */
  
  // Identify any aggregates
  
  // Get unused tokens
  //unusedTokens = findAll(tokens,(token: Token) => token.used === false);
  //unusedNG = nounGroups.filter((ng: NounGroup) => ng.used === false);

  //console.log(entities);
  //console.log(attributes);
  //console.log("Unused Tokens:");
  //console.log(tokenArrayToString(unusedTokens));
  //console.log("Unused Noun Groups:");
  //console.log(nounGroupArrayToString(unusedNG));
  //console.log("Unmatched Tokens:");
  console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
  
  // Remove nodes with parents
  /*let roots: Array<Node> = [];
  for (let nodeArray of nodeArrays) {
    for (let node of nodeArray) {
      if (node.parent === undefined) {
        roots.push(node);
      }
    }
  }*/

  return tree;
  
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
}

interface Entity {
  id: string,
  displayName: string,
  content: string,
  node?: Node,
}

interface Collection {
  id: string,
  displayName: string,
  count: number,
  node?: Node,
}

interface Attribute {
  id: string,
  displayName: string,
  entity: Entity | string,
  value: string,
  dbValue?: string | number,
  node?: Node,
}

// Returns the entity with the given display name.
// If the entity is not found, returns undefined
// Two error modes here: 
// 1) the name is not found in "display name"
// 2) the name is found in "display name" but not found in "entity"
// can 2) ever happen?
function findEntityByDisplayName(name: string): Entity {
  console.log("Searching for entity: " + name);
  let display = eve.findOne("display name",{ name: name });
  if (display !== undefined) {
    let foundEntity = eve.findOne("entity", { entity: display.id });
    if (foundEntity !== undefined) {
      let entity: Entity = {
        id: foundEntity.entity,
        displayName: name,
        content: foundEntity.content,
      }
      console.log(" Found: " + name);
      return entity;
    }
  }
  console.log(" Not found: " + name);
  return undefined;
}

function findEntityByID(id: string): Entity {  
  console.log("Searching for entity: " + id);
  let foundEntity = eve.findOne("entity", { entity: id });
  if (foundEntity !== undefined) {
    let display = eve.findOne("display name",{ id: id });
    if (display !== undefined) {
      let entity: Entity = {
        id: foundEntity.entity,
        displayName: display.name,
        content: foundEntity.content,
      }
      console.log(" Found: " + display.name);
      return entity; 
    }
  }
  console.log(" Not found: " + id);
  return undefined;
}

// Returns the collection with the given display name.
function findCollection(name: string): Collection {
  console.log("Searching for collection: " + name);
  let display = eve.findOne("display name",{ name: name });
  if (display !== undefined) {
    let foundCollection = eve.findOne("collection", { collection: display.id });
    if (foundCollection !== undefined) {
      let collection: Collection = {
        id: foundCollection.collection,
        displayName: name,
        count: foundCollection.count,
      }
      console.log(" Found: " + name);
      return collection;
    }
  }
  console.log(" Not found: " + name);
  return undefined;
}

// Returns the attribute with the given display name attached to the given entity
// If the entity does not have that attribute, or the entity does not exist, returns undefined
function findAttribute(name: string, entity: Entity): Attribute {
  console.log("Searching for attribute: " + name);
  console.log(" Entity: " + entity.displayName);
  let foundAttribute = eve.findOne("entity eavs", { entity: entity.id, attribute: name });
  if (foundAttribute !== undefined) {
    let attribute: Attribute = {
      id: foundAttribute.attribute,
      displayName: name,
      entity: entity,
      value: `${entity.displayName}|${name}`.replace(/ /g,''),
      dbValue: foundAttribute.value,
    }
    console.log(` Found: ${name} ${attribute.dbValue} => ${attribute.value}`);
    return attribute;
  }
  console.log(" Not found: " + name);
  return undefined;
}

function findCollectionToAttrRelationship(coll: string, attr: string): any {
  // Finds a direct relationship between collection and attribute
  // e.g. "pets' lengths"" => pet -> snake -> length
  let relationship = eve.query(``)
    .select("collection entities", { collection: coll }, "collection")
    .select("entity eavs", { entity: ["collection", "entity"], attribute: attr }, "eav")
    .exec();
  if (relationship.unprojected.length > 0) {
    console.log(relationship);
    return
  }
  // Finds a one hop relationship
  relationship = eve.query(``)
    .select("collection entities", { collection: coll }, "collection")
    .select("directionless links", { entity: ["collection", "entity"] }, "links")
    .select("entity eavs", { entity: ["links", "link"], attribute: attr }, "eav")
    .exec();
  if (relationship.unprojected.length > 0) {
    return
  }
  // Not sure if this one works... using the entity table, a 2 hop link can
  // be found almost anywhere, yielding results like
  // e.g. "Pets heights" => pets -> snake -> entity -> corey -> height
  relationship = eve.query(``)
    .select("collection entities", { collection: coll }, "collection")
    .select("directionless links", { entity: ["collection", "entity"] }, "links")
    .select("directionless links", { entity: ["links", "link"] }, "links2")
    .select("entity eavs", { entity: ["links2", "link"], attribute: attr }, "eav")
    .exec();
  if (relationship.unprojected.length > 0) {
    return
  }
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

// ----------------------------------------------------------------------------
// DSL functions
// ----------------------------------------------------------------------------

interface Field {
  name: string,
  value: string | number,
  variable: boolean;
}

interface Term {
  type: string,
  table?: string,
  fields: Array<Field>
}

type Query = Array<Term>;

// Build terms from a node using a DFS algorithm
function buildTerm(node: Node): Array<Term> {
  let terms: Array<Term> = [];
  // Build a term for each of the children
  let childTerms = node.children.map(buildTerm);
  // Fold the child terms into the term array
  childTerms.forEach((cTerms) => {
    terms = terms.concat(cTerms);
  });
  // Now take care of the node itself.
  // Function terms
  if (node.fxn !== undefined) {
    // Get variables from the already formed terms
    let vars: Array<string> = [];
    terms.forEach((term) => {
      let variables = term.fields.filter((field) => (field.name === "value" && field.variable));
      variables.forEach((variable) => {
        let value = variable.value;
        if (typeof value === "string") {
          vars.push(value);  
        }
      })
    });
    // @HACK: Will break with more than 6 attributes :(
    let names = ["a","b","c","d","e","f"];
    let fields = vars.reverse().map((variable,i) => {
      let field: Field = {
        name: names[i],
        value: variable,
        variable: true,
      };
      return field;
    })
    let term: Term = {
      type: "select",
      table: node.fxn.fxn,
      fields: fields,
    }
    terms.push(term);
  }
  // Attribute terms
  /*else if (node.attribute != undefined) {
    let attributeTerm = node.attributes.map((attr: Attribute) => {
      let entity = attr.entity;
      let entityID: string;
      let entityVariable = false;
      if (typeof entity === 'object') {
        entityID = entity.id;
      } else if (typeof entity === 'string') {
        entityID = entity;
        entityVariable = true;
      }
      let entityField: Field = {name: "entity", value: entityID, variable: entityVariable};
      let attrField: Field = {name: "attribute", value: attr.id, variable: false};
      let valueField: Field = {name: "value", value: attr.value, variable: true};
      let fields: Array<Field> = [entityField, attrField, valueField];
      let term: Term = {
        type: "select",
        table: "entity eavs",
        fields: fields,  
      }      
      return term;
    });
    terms = terms.concat(attributeTerms);
  }*/
  // Collection terms
  if (node.collection !== undefined) {
    let entityField: Field = {name: "entity", value: node.collection.displayName, variable: true};
    let collectionField: Field = {name: "collection", value: node.collection.id, variable: false};
    let term: Term = {
      type: "select",
      table: "is a attributes",
      fields: [entityField, collectionField],
    }
    terms.push(term);
  }
  // Entity terms
  else if (node.entity !== undefined) {
    // We don't do anything with entities right now
  }
  return terms;
} 


// take a parse tree, form a DSL AST
function formDSL(tree: Node): string {
  
  let project = {
    type: "project!",
    fields: [],
  };
  
  let query: Query = [];
  // Walk the tree, parsing each node as we go along
  /*for (let node of tree) {
    query = query.concat(buildTerm(node));
  }*/
  query.push(project);

  let queryString = queryToString(query);
  return queryString;
}

// Converts the AST into a string for parsing
function queryToString(query: Query): string {
  let queryString = "(query \n\t"
  
  // Map each term to a string
  queryString += query.map(termToString).join("\n\t");
  
  // Close out the query
  queryString += "\n)";
  return queryString;
}

function termToString(term: Term): string {
  let termString = "(";
  termString += `${term.type} `;
  termString += `${term.table === undefined ? "" : `"${term.table}" `}`;
  termString += term.fields.map((field) => `:${field.name} ${field.variable ? field.value : `"${field.value}"`}`).join(" ");
  termString += ")";
  return termString;
}

// ----------------------------------------------------------------------------
// Debug utility functions
// ---------------------------------------------------------------------------- 

export function nodeToString(node: Node, depth: number): string {
  
  let childrenStrings = node.children.map((childNode) => nodeToString(childNode,depth+1)).join("\n");
  let children = childrenStrings.length > 0 ? "\n" + childrenStrings : "";
  let spacing = Array(depth+1).join(" ");
  let index = node.ix === undefined ? "+ " : `${node.ix}: `;
  let properties = `(${node.properties.map((property: TokenProperties) => TokenProperties[property]).join("|")})`;
  let attribute = node.attribute === undefined ? "" : `[${node.attribute.dbValue}] `;
  let entity = node.entity === undefined ? "" : `[${node.entity.displayName}] `;
  properties = properties.length === 2 ? "" : properties;
  let nodeString = `| ${spacing}${index}${node.name} ${entity}${attribute}${properties}${children}`; 
  return nodeString;
}

export function nodeArrayToString(nodes: Array<Node>): string {
  let divider = "\n----------------------------------------\n";
  let nodesString = nodes.map((node) => nodeToString(node,0)).join("\n----------------------------------------\n");  
  return divider + nodesString + divider;
}

export function tokenToString(token: Token): string {
  let properties = `(${token.properties.map((property: TokenProperties) => TokenProperties[property]).join("|")})`;
  properties = properties.length === 2 ? "" : properties;
  let tokenString = `${token.ix}: ${token.originalWord} | ${token.normalizedWord} | ${MajorPartsOfSpeech[getMajorPOS(token.POS)]} | ${MinorPartsOfSpeech[token.POS]} | ${properties}` ;
  return tokenString;
}

export function tokenArrayToString(tokens: Array<Token>): string {
  let divider = "\n----------------------------------------\n";
  let tokenArrayString = tokens.map((token) => tokenToString(token)).join("\n");
  return divider + tokenArrayString + divider;
}

// ----------------------------------------------------------------------------
// Utility functions
// ----------------------------------------------------------------------------

// combines two arrays into a single array
function zip(array1: Array<any>, array2: Array<any>): Array<Array<any>> {
  let returnArray: Array<any> = [];
  for (let i = 0; i < array1.length; i++) {
    let el1 = array1[i];
    if (i+1 > array2.length) {
      break;
    }
    let el2 = array2[i];
    returnArray.push([el1, el2]);
  }
  return returnArray;
}

// Finds all elements in an array matching a specified condition
function findAll(array: Array<any>, condition: Function): Array<any> {
  return array.filter((element) => condition(element));
}

// Finds the intersection of two arrays
function intersect(arr1: Array<any>, arr2: Array<any>): Array<any> {
     var r = [], o = {}, l = arr2.length, i, v;
     for (i = 0; i < l; i++) {
         o[arr2[i]] = true;
     }
     l = arr1.length;
     for (i = 0; i < l; i++) {
         v = arr1[i];
         if (v in o) {
             r.push(v);
         }
     }
     return r;
}

function onlyUnique(value, index, self) { 
  return self.indexOf(value) === index;
}

// ----------------------------------------------------------------------------

declare var exports;
window["NLQP"] = exports;