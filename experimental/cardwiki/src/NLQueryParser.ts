declare var pluralize;
declare var nlp;

// Entry point for NLQP
// @TODO as an input argument, take a list of nominal tags generated as the user types the query
export function parse(queryString: string) {
  queryString = preprocessQueryString(queryString)
  let tokens = getTokens(queryString);
  let tree = formTree(tokens);
  let ast = formDSL(tree);
      
  return {tokens: tokens, tree: tree, ast: ast};
}

// Performs some transformations to the query string before tokenizing
export function preprocessQueryString(queryString: string): string {
  // Add whitespace before commas
  let processedString = queryString.replace(new RegExp(",", 'g')," ,");
  return processedString;
}

function parseTest(queryString: string, n: number) {
  let parseResult;
  let avgTime = 0;
  let maxTime = 0;
  let minTime;
  
  // Parse string and measure how long it takes
  for (let i = 0; i < n; i++) {
    let start = performance.now();
    parseResult = parse(queryString);
    let stop = performance.now();
    avgTime += stop-start;
    if (stop-start > maxTime) {
      maxTime = stop-start;
    }  
    if (minTime === undefined) {
      minTime = stop-start;
    }
    else if (stop-start < minTime) {
      minTime = stop-start;
    }  
  }
  // Display result
  let tokenStrings = tokenArrayToString(parseResult.tokens);
  let timingDisplay = `Timing (avg, max, min): ${(avgTime/n).toFixed(2)} | ${maxTime.toFixed(2)} | ${minTime.toFixed(2)} `;
  console.log(queryString);
  console.log(tokenStrings);
  console.log(timingDisplay);
  console.log("==============================================================");
}

// ----------------------------------------------------------------------------
// Token functions
// ----------------------------------------------------------------------------

enum MajorPartsOfSpeech {
  VERB,
  ADJECTIVE,
  ADVERB,
  NOUN,
  GLUE,
  WHWORD,
  SYMBOL,
}

enum MinorPartsOfSpeech {
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
  SEP,  // Separator (,)
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
  // Attributes for nouns only
  isPossessive?: boolean;
  isProper?: boolean;
  isPlural?: boolean;
  // Properties relevant to parsing
  used: boolean;
}

// take an input string, extract tokens
function getTokens(queryString: string): Array<Token> {
    
    // get parts of speach with sentence information. It's okay if they're wrong; they will be corrected as we create the tree.    
    let nlpTokens = nlp.pos(queryString, {dont_combine: true}).sentences[0].tokens;
    let wordsnTags = nlpTokens.map((token) => {
      return [token.text,token.pos.tag];
    });
    
    // Form a token for each word
    let tokens: Array<Token> = wordsnTags.map((wordnTag, i) => {
      let word = wordnTag[0];
      let tag: string = wordnTag[1];
      let token: Token = {ix: i, originalWord: word, normalizedWord: word, POS: MinorPartsOfSpeech[tag], used: false};
      let before = "";
      
      // Heuritic: queries cannot begin or end with a verb. These are most likely nouns
      if ((i === 0 || i === wordsnTags.length - 1) && getMajorPOS(token.POS) === MajorPartsOfSpeech.VERB) {
        token.POS = MinorPartsOfSpeech.NN;
      }
      
      // Add default attribute markers to nouns
      if (getMajorPOS(token.POS) === MajorPartsOfSpeech.NOUN) {
        token.isPossessive = false;
        token.isPlural = false;
        token.isProper = false;
        if (token.POS === MinorPartsOfSpeech.NNO || 
            token.POS === MinorPartsOfSpeech.PP) {
         token.isPossessive = true;
        }
        if (token.POS === MinorPartsOfSpeech.NNP  ||
            token.POS === MinorPartsOfSpeech.NNPS ||
            token.POS === MinorPartsOfSpeech.NNPA) {
          token.isProper = true;
        }
        if (token.POS === MinorPartsOfSpeech.NNPS  ||
            token.POS === MinorPartsOfSpeech.NNS) {
          token.isPlural = true;
        }
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
        token.isPossessive = true;
      }
      // --- convert to lowercase
      before = normalizedWord;
      normalizedWord = normalizedWord.toLowerCase();
      // Heuristic: if the word is not the first word in the sentence and it had capitalization, then it is probably a proper noun
      if (before !== normalizedWord && i !== 0) {
        token.POS = MinorPartsOfSpeech.NNP;
        token.isProper = true;        
      }
      // --- if the word is a (not proper) noun, singularize
      if (getMajorPOS(token.POS) === MajorPartsOfSpeech.NOUN && token.isProper === false) {
        before = normalizedWord;
        normalizedWord = singularize(normalizedWord);
        // Heuristic: If the word changed after singularizing it, then it was plural to begin with
        if (before !== normalizedWord) {
          token.isPlural = true;
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
        case "all":
          token.POS = MinorPartsOfSpeech.PDT;
          break;
        case "had":
          token.POS = MinorPartsOfSpeech.VBD;
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
        case "will":
          // will can be a noun
          if (getMajorPOS(token.POS) !== MajorPartsOfSpeech.NOUN) {
            token.POS = MinorPartsOfSpeech.MD;
          }
          break;
        case "years":
          token.POS = MinorPartsOfSpeech.NN;
          token.normalizedWord = "year";
          token.isPlural = true;
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
          break;
      }
        
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
        token.isProper = false;
        token.isPossessive = true;
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

    return tokens;
}

function getMajorPOS(minorPartOfSpeech: MinorPartsOfSpeech): MajorPartsOfSpeech {
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
      minorPartOfSpeech === MinorPartsOfSpeech.CD ||
      minorPartOfSpeech === MinorPartsOfSpeech.DA ||
      minorPartOfSpeech === MinorPartsOfSpeech.NU ||
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
  if (minorPartOfSpeech === MinorPartsOfSpeech.LT ||
      minorPartOfSpeech === MinorPartsOfSpeech.GT ||
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
  if (word === "his" || 
      word === "united states") {
      return word;  
  } else { 
    return pluralize(word, 1);
  }
}

// ----------------------------------------------------------------------------
// Tree functions
// ----------------------------------------------------------------------------

interface Tree {
  node: Token;
  parent: Token;
  children: Array<Token>;
}

interface NounGroup {
  noun: Array<Token>;
  children: Array<Token>;
  begin: number; // Index of the first token in the noun group
  end: number;   // Index of the last token in the noun group
  isPossessive: boolean;
  isProper: boolean;
  isPlural: boolean;
  subsumed: boolean;
}

// take tokens, form a parse tree
function formNounGroups(tokens: Array<Token>): Array<NounGroup> {
 
  let tree: Tree;
  let processedTokens = 0;
  
  // Entity types ORGANIZATION, PERSON, THING, ANIMAL, LOCATION, DATE, TIME, MONEY, and GEOPOLITICAL
  
  // Find noun groups. These are like noun phrases, but smaller. A noun phrase may be a single noun group
  // or it may consist of several noun groups. e.g. "the yellow dog who lived in the town ran away from home".
  // here, the noun phrase "the yellow dog who lived in the town" is a noun phrase consisting of the noun
  // groups "the yellow dog" and "the town"
  // Modifiers that come before a noun: articles, possessive nouns/pronouns, adjectives, participles
  // Modifiers that come after a noun: prepositional phrases, adjective clauses, participle phrases, infinitives
  // Less frequently, noun phrases have pronouns as a base 
  let i = 0;
  let nounGroups: Array<NounGroup> = [];
  let lastFoundNounIx = 0;
  for (let token of tokens) {
    // If the token is a noun, start a noun group
    if (getMajorPOS(token.POS) === MajorPartsOfSpeech.NOUN && token.used === false) {
      let nounGroup: NounGroup = {
        noun: [token], 
        children: [], 
        begin: i, 
        end: i, 
        isPlural: token.isPlural, 
        isPossessive: token.isPossessive, 
        isProper: token.isProper,
        subsumed: false
      };
      token.used = true;
      
      // Now we need to pull in other words to attach to the noun. We have some hueristics for that!
      
      // Heuristic: search left until we find a predeterminer. Everything between is part of the noun group
      let latestDeterminerIx = null;
      let latestPrepositionIx = null;
      let latestAdjectiveIx = null;
      let verbBoundary = null;
      let conjunctionBoundary = null;
      for (let j = i-1; j >= lastFoundNounIx; j--) {
        let backtrackToken: Token = tokens[j];
        // First look for a predeterminer.
        if (backtrackToken.POS === MinorPartsOfSpeech.PDT) {
          latestDeterminerIx = j;
          break;
        // Keep track of the ix of the latest determiner
        } else if (backtrackToken.POS === MinorPartsOfSpeech.DT) {
          latestDeterminerIx = j;
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
      }
      // If we found a determiner, gobble up tokens between the latest determiner and the noun
      if (latestDeterminerIx !== null) {
        nounGroup = subsumeTokens(nounGroup,latestDeterminerIx,tokens);
      }
      // Heuristic: search to the left for a preposition
      if (latestPrepositionIx !== null && latestPrepositionIx < nounGroup.begin) {
        nounGroup = subsumeTokens(nounGroup,latestPrepositionIx,tokens);
      }
      // Heuristic: search to the left for an adjective
      if (latestAdjectiveIx !== null && latestAdjectiveIx < nounGroup.begin) {
        nounGroup = subsumeTokens(nounGroup,latestAdjectiveIx,tokens);
      }
            
      // Heuristic: don't include verbs at this stage
      
      nounGroups.push(nounGroup);
      lastFoundNounIx = i;
    }
    // End noun group formation
    i++;
  }
  
  // Now we have some noun groups. Are there any adjectives 
  // left over? Attach them to the closest noun group to the left
  let unusedAdjectives = findAll(tokens,(token: Token) => { return token.used === false && getMajorPOS(token.POS) === MajorPartsOfSpeech.ADJECTIVE});
  
  
  // Heuristic: combine adjacent proper noun groups
  let properNounGroups = findAll(nounGroups,(ng: NounGroup) => { return ng.isProper === true; });
  for (let i = 0; i < properNounGroups.length - 1; i++) {
    let thisNG: NounGroup = properNounGroups[i];
    let nextNG: NounGroup = properNounGroups[++i];    
    // Combine adjacent proper noun groups
    while (nextNG.isProper && nextNG.begin === thisNG.end + 1) {
      thisNG.noun = thisNG.noun.concat(nextNG.noun);
      thisNG.children = thisNG.children.concat(nextNG.children);
      thisNG.end = nextNG.end;
      // Inherit noun properties from nextNG
      if (nextNG.isPlural) { thisNG.isPlural = true; }
      if (nextNG.isPossessive) { thisNG.isPossessive = true; }
      // Mark the absobed NG as subsumed for filtering later 
      nextNG.subsumed = true;
      i++;
      if (i < properNounGroups.length) {
        nextNG = properNounGroups[i];  
      }
    }
    i--;
  }
  
  // Remove the superfluous noun groups
  nounGroups = findAll(nounGroups,(ng: NounGroup) => { return ng.subsumed === false});
  
  
  console.log(nounGroupArrayToString(nounGroups));
  
   
  // Get unused tokens
  let unusedTokens = findAll(tokens,(token: Token) => { return token.used === false; });
  console.log(tokenArrayToString(unusedTokens));
  
  return nounGroups;
  
  
  // Find noun phrases. Noun phrases are a group of words that describe a root noun
  // e.g. "4-star restaurant" "the united states of america"
  // Heuristic: CD, DT, and JJ typically preceed a noun phrase
  // Heuristic: All noun phrases contain nouns. Corollary: all nouns belong to some noun phrase
  // common error: JJ/VB
  
  // Find relationships between noun groups. In the previous example, "the yellow dog" is related to "the town"
  // by the words "lived in"
  // Heuristic: relationships often exist between noun groups 
  
  // Heuristic: The skeleton of the sentence can be constructed by looking only at nouns. All other words are achored to those nouns.
  // Once that is done, you can form noun phrases  
  
  // Find adjective phrases. These are analagous to noun phrases but for adjectives. E.g. "very tall person",
  // "very tall" is an adjective group
  // Adjective phrases contain modifiers on the adjective: Premodifiers, Postmodifiers, and Discontinuous Modifiers
  //   Premodifiers are always adverb phrases
  //   Postmodifiers can be an adverb phrase, a prepositional phrase, or a clause
  //   Discontinuous modifiers can be before and after the adjective.
  
  // Heuristic: Adjective phrases exist in proximity to a noun group and within a noun phrase
  
  // Linking verbs: be [am is ar was wer has been are being etc.], become, seem. These are always linking verbs
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
  //let firstAdjective = tokens.find((token) => {
  //  return token.majorPOS === MajorPartsOfSpeech.ADJECTIVE;   
  //});
}

function formTree(tokens: Array<Token>): any {
  formNounGroups(tokens);
}

function subsumeTokens(nounGroup: NounGroup, ix: number, tokens: Array<Token>): NounGroup {
  nounGroup.begin = ix ;
  for (let j = ix ; j < nounGroup.end; j++) {
    let nounGroupToken: Token = tokens[j];
    if (nounGroupToken.used === false) {
      nounGroup.children.push(nounGroupToken);
      nounGroupToken.used = true;  
    }
  }
  return nounGroup;
}

// ----------------------------------------------------------------------------
// DSL functions
// ----------------------------------------------------------------------------

// take a parse tree, form a DSL AST
function formDSL(tree: Tree): any {

}


// ----------------------------------------------------------------------------
// Debug utility functions
// ---------------------------------------------------------------------------- 

function tokenToString(token: Token): string {
  let isPossessive = token.isPossessive === undefined ? "" : token.isPossessive === true ? "possessive ": "";
  let isProper = token.isProper === undefined ? "" : token.isProper === true ? "proper ": "";
  let isPlural = token.isPlural === undefined ? "" : token.isPlural === true ? "plural ": "";
  let tokenString = `${token.ix}.: ${token.originalWord} | ${token.normalizedWord} | ${MajorPartsOfSpeech[getMajorPOS(token.POS)]} | ${MinorPartsOfSpeech[token.POS]} | ${isPossessive}${isProper}${isPlural}` ;
  return tokenString;
}

function tokenArrayToString(tokens: Array<Token>): string {
  let tokenArrayString = tokens.map((token) => {return tokenToString(token);}).join("\n");
  return tokenArrayString;
}

function nounGroupToString(nounGroup: NounGroup): string {
  let nouns = nounGroup.noun.map((noun: Token) => {return noun.normalizedWord;}).join(" ");
  let children = nounGroup.children.map((child: Token) => {return child.normalizedWord;}).join(" ");
  let nounGroupString = `${nouns} \n  ${children}`;
  return nounGroupString;
}

function nounGroupArrayToString(nounGroups: Array<NounGroup>): string {
  let nounGroupsString =  nounGroups.map((ng: NounGroup)=>{return nounGroupToString(ng);}).join("\n----------------------------------------\n");
  return "----------------------------------------\nNOUN GROUPS\n----------------------------------------\n" + nounGroupsString + "\n----------------------------------------\n";
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
  let matchingElements: Array<any> = [];
  for (let element of array) {
    if (condition(element)) {
      matchingElements.push(element);
    }
  }
  return matchingElements;  
}

// ----------------------------------------------------------------------------

let n = 1;
let phrases = [
  /*"Ages of Chris Steve Granger, Corey James Irvine Montella, and Josh Cole",  
  "The sweet potatoes in the vegetable bin are green with mold.",
  "States in the United States of America",
  "People older than Chris Granger and younger than Edward Norton",
  "Sum of the salaries per department",
  "Dishes with eggs and chicken",*/
  "People whose age < 30",
  "People between 50 and 60 years old",
  "Steve is 10 years old and Sven is 12 years old",
  /*"salaries per department, employee, and age",
  "Where are the restaurants in San Francisco that serve good French food?",
  "Dishes that do not have eggs or chicken",
  "Who had the most sales last year?",
  "departments where all of the employees are male",
  "sum of the top 2 salaries per department",
  "What is Corey Montella's age?",
  "People older than Corey Montella",
  "How many 4 star restaurants are in San Francisco?",
  "What is the average elevation of the highest points in each state?",
  "What is the name of the longest river in the state that has the largest city in the United States of America?"*/
];

phrases.map((phrase) => {parseTest(phrase,n)});