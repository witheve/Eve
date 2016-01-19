declare var pluralize;
declare var nlp;

// Entry point for NLQP
// @TODO as an input argument, take a list of nominal tags generated as the user types the query
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
  // Get parts of speach with sentence information. It's okay if they're wrong; they 
  // will be corrected as we create the tree and match against the underlying data model    
  let nlpTokens = nlp.pos(processedString, {dont_combine: true}).sentences[0].tokens;
  let preTags: Array<PreToken> = nlpTokens.map((token) => {
    return {text: token.text, tag: token.pos.tag};
  });
  return preTags;
}

function parseTest(queryString: string, n: number) {
  let parseResult;
  let avgTime = 0;
  let maxTime = 0;
  let minTime;
  
  let preTags = preprocessQueryString(queryString)
  let pretagsToString = preTags.map((pt) => {return `(${pt.text}|${pt.tag})`}).join("");
  
  console.log(queryString);
  console.log(pretagsToString);
  
  // Parse string and measure how long it takes
  for (let i = 0; i < n; i++) {
    let start = performance.now();
    parseResult = parse(preTags);
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
  console.log(tokenStrings);
  console.log(timingDisplay);
  console.log("==============================================================");
}

// ----------------------------------------------------------------------------
// Token functions
// ----------------------------------------------------------------------------

export interface PreToken {
  text: string,
  tag: string,
}

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
  isQuantity?: boolean;
  isReference?: boolean;
  // Attributes for adjectives and adverbs
  isComparative?: boolean;
  isSuperlative?: boolean;
  // Properties relevant to parsing
  used: boolean;
}

// take an input string, extract tokens
function formTokens(preTokens: Array<PreToken>): Array<Token> {
    
    // Form a token for each word
    let tokens: Array<Token> = preTokens.map((preToken: PreToken, i: number) => {
      let word = preToken.text;
      let tag = preToken.tag;
      let token: Token = {ix: i, originalWord: word, normalizedWord: word, POS: MinorPartsOfSpeech[tag], used: false};
      let before = "";
           
      // Add default attribute markers to nouns
      if (getMajorPOS(token.POS) === MajorPartsOfSpeech.NOUN) {
        token.isPossessive = false;
        token.isPlural = false;
        token.isProper = false;
        token.isQuantity = false;
        token.isReference = false;
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
        if (token.POS === MinorPartsOfSpeech.CD ||
            token.POS === MinorPartsOfSpeech.DA ||
            token.POS === MinorPartsOfSpeech.NU) {
          token.isQuantity = true;     
        }
        if (token.POS === MinorPartsOfSpeech.PP ||
            token.POS === MinorPartsOfSpeech.PRP) {
          token.isReference = true;
        }
      }
      
      // Add default attribute markers to adjectives and adverbs
      if (token.POS === MinorPartsOfSpeech.JJR || token.POS === MinorPartsOfSpeech.RBR) {
        token.isComparative = true;
      }
      else if (token.POS === MinorPartsOfSpeech.JJS || token.POS === MinorPartsOfSpeech.RBS) {
        token.isSuperlative = true;
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
        case "most":
          token.POS = MinorPartsOfSpeech.JJS;
          token.isSuperlative = true;
          break;
        case "best":
          token.POS = MinorPartsOfSpeech.JJS;
          token.isSuperlative = true;
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

interface Tree {
  node: Token;
  parent: Token;
  children: Array<Token>;
}

interface NounGroup {
  noun: Array<Token>;
  refersTo?: NounGroup, // noun group to which a pronoun refers
  children: Array<Token>;
  begin: number; // Index of the first token in the noun group
  end: number;   // Index of the last token in the noun group
  isPossessive: boolean;
  isProper: boolean;
  isPlural: boolean;
  isQuantity: boolean;
  isComparative: boolean;
  isSuperlative: boolean;
  isReference: boolean;
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
      let nounGroup: NounGroup = newNounGroup(token);
      token.used = true;
      
      // Now we need to pull in other words to attach to the noun. We have some hueristics for that!
      
      // Heuristic: search left until we find a predeterminer. Everything between is part of the noun group
      let firstDeterminerIx = null;
      let latestPrepositionIx = null;
      let latestAdjectiveIx = null;
      let verbBoundary = null;
      let conjunctionBoundary = null;
      for (let j = i-1; j >= lastFoundNounIx; j--) {
        let backtrackToken: Token = tokens[j];
        // First look for a predeterminer.
        if (backtrackToken.POS === MinorPartsOfSpeech.PDT) {
          firstDeterminerIx = j;
          break;
        // Keep track of the ix of the latest determiner
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
      }
      // If we found a determiner, gobble up tokens between the latest determiner and the noun
      if (firstDeterminerIx !== null) {
        nounGroup = subsumeTokens(nounGroup,firstDeterminerIx,tokens);
      }
      // Heuristic: search to the left for a preposition
      if (latestPrepositionIx !== null && latestPrepositionIx < nounGroup.begin) {
        nounGroup = subsumeTokens(nounGroup,latestPrepositionIx,tokens);
      }
      // Heuristic: search to the left for an adjective
      if (latestAdjectiveIx !== null && latestAdjectiveIx < nounGroup.begin) {
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
  let unusedAdjectives = findAll(tokens,(token: Token) => { return token.used === false && getMajorPOS(token.POS) === MajorPartsOfSpeech.ADJECTIVE});
  for (let adj of unusedAdjectives) {
    // finds the closest noun group to the left
    let targetNG: NounGroup = null;
    for (let ng of nounGroups) {
      if (adj.ix - ng.end < 0) {
        break; 
      }
      targetNG = ng;
    }
    if (targetNG !== null) {
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
  }
  
  // Heuristic: Leftover determiners are themselves a noun group 
  // e.g. neither of these boys. ng = ([neither],[of these boys])
  let unusedDeterminers = findAll(tokens, (token: Token) => {return token.used === false && token.POS === MinorPartsOfSpeech.DT});
  for (let token of unusedDeterminers) {
    nounGroups.push(newNounGroup(token));  
    token.used = true;
  }
  
  // Heuristic: combine adjacent proper noun groups
  let properNounGroups = findAll(nounGroups,(ng: NounGroup) => { return ng.isProper === true; });
  for (let i = 0; i < properNounGroups.length - 1; i++) {
    let thisNG: NounGroup = properNounGroups[i];
    let nextNG: NounGroup = properNounGroups[++i];    
    // Combine adjacent proper noun groups
    while (nextNG.isProper && nextNG.begin === thisNG.end + 1) {
      thisNG.noun = thisNG.noun.concat(nextNG.noun);
      for (let child of nextNG.children) {
        addChildToNounGroup(thisNG,child);  
      }
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
  
  // Resolve pronoun coreferences
  nounGroups = resolveReferences(nounGroups);
  
  // Sort the noun groups to reflect their order in the root sentence
  nounGroups = nounGroups.sort((ngA: NounGroup, ngB: NounGroup) => {return ngA.begin - ngB.begin;});
  return nounGroups;
}


function resolveReferences(nounGroups: Array<NounGroup>): Array<NounGroup>  {
  
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
    let isPersonal = intersect(firstPersonPersonal,ng.noun.map((token:Token)=>{return token.normalizedWord})).length > 0;
    return (ng.isReference && !isPersonal);
  });
  let antecedents: Array<NounGroup> = findAll(nounGroups,(ng: NounGroup) => {return ng.isReference === false;});

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
      if (ng.isPossessive) {
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
}

// Adds a child token to a noun group and subsumes its properties. Marks token as used
function addChildToNounGroup(nounGroup: NounGroup, token: Token) {
  nounGroup.children.push(token);
  if(token.isComparative !== undefined) {
    nounGroup.isComparative = token.isComparative;
  }
  if(token.isSuperlative !== undefined) {
    nounGroup.isSuperlative = token.isSuperlative;
  }
  token.used = true;
}

function newNounGroup(token: Token): NounGroup {
  return {
    noun: [token],
    children: [],
    begin: token.ix,
    end: token.ix,
    isPlural: token.isPlural === undefined ? false : token.isPlural, 
    isPossessive: token.isPossessive === undefined ? false : token.isPossessive,
    isProper: token.isProper === undefined ? false : token.isProper,
    isQuantity: token.isQuantity === undefined ? false : token.isQuantity,
    isReference: token.isReference === undefined ? false : token.isReference,
    isComparative: token.isComparative === undefined ? false : token.isComparative,
    isSuperlative: token.isSuperlative === undefined ? false : token.isSuperlative,
    subsumed: false
  }  
}

function formTree(tokens: Array<Token>): any {
  let nounGroups = formNounGroups(tokens);
  
  // Get unused tokens
  let unusedTokens = findAll(tokens,(token: Token) => { return token.used === false; });
  
  console.log(nounGroupArrayToString(nounGroups));
  console.log(tokenArrayToString(unusedTokens));
  
  //console.log(nounGroupArrayToString(nounGroups));
  
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
  //let firstAdjective = tokens.find((token) => {
  //  return token.majorPOS === MajorPartsOfSpeech.ADJECTIVE;   
  //});
  
  
}

function subsumeTokens(nounGroup: NounGroup, ix: number, tokens: Array<Token>): NounGroup {
  nounGroup.begin = ix ;
  for (let j = ix ; j < nounGroup.end; j++) {
    let nounGroupToken: Token = tokens[j];
    if (nounGroupToken.used === false) {
      addChildToNounGroup(nounGroup,nounGroupToken);  
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
  let isReference = token.isReference === undefined ? "" : token.isReference === true ? "reference ": "";
  let isComparative = token.isComparative === undefined ? "" : token.isComparative === true ? "comparative ": "";
  let isSuperlative = token.isSuperlative === undefined ? "" : token.isSuperlative === true ? "superlative ": "";
  let tokenString = `${token.ix}: ${token.originalWord} | ${token.normalizedWord} | ${MajorPartsOfSpeech[getMajorPOS(token.POS)]} | ${MinorPartsOfSpeech[token.POS]} | ${isPossessive}${isProper}${isPlural}${isReference}${isComparative}${isSuperlative}` ;
  return tokenString;
}

function tokenArrayToString(tokens: Array<Token>): string {
  let tokenArrayString = tokens.map((token) => {return tokenToString(token);}).join("\n");
  return tokenArrayString;
}

function nounGroupToString(nounGroup: NounGroup): string {
  let nouns = nounGroup.noun.map((noun: Token) => {return noun.normalizedWord;}).join(" ");
  let refersTo: NounGroup = nounGroup.refersTo;
  let reference = refersTo === undefined ? "" : " (" + refersTo.noun.map((noun:Token) => {return noun.normalizedWord;}).join(" ") + ")";
  let children = nounGroup.children.sort((childA: Token, childB: Token) => {return childA.ix - childB.ix;}).map((child: Token) => {return child.normalizedWord;}).join(" ");
  let propertiesString = `Properties:\n${nounGroup.isPlural ? `-plural\n` : ``}${nounGroup.isPossessive ? `-possessive\n` : ``}${nounGroup.isProper ? `-proper\n` : ``}${nounGroup.isQuantity ? `-quantity\n` : ``}${nounGroup.isReference ? `-reference\n` : ``}${nounGroup.isComparative ? `-comparative\n` : ``}${nounGroup.isSuperlative ? `-superlative\n` : ``}`;
  let nounGroupString = `(${nounGroup.begin}-${nounGroup.end})\n${nouns}${reference}\n  ${children}\n\n${propertiesString}`;
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

// ----------------------------------------------------------------------------

let n = 1;
let phrases = [
  "Did the groundhog see its shadow?",
  "When did Corey go out with his wife or her friends?",
  /*
  "What is the name of the longest river in the state that has the largest city in the United States of America?",
  "how often does chase have lunch with his wife or her friends",
  "people who are under 30 years old",
  "people who are under 30 pounds",
  "people who are under 30",
  "people whose age < Chris Granger's",
  "people whose age < Chris Granger's age",
  "people whose age is less than Chris Granger's",
  "people who are younger than Chris Granger",
  "people older than Corey Montella's spouse",
  "people older than their spouse",
  "people who are either heads or spouses of heads",
  "people who have red or black hair",
  "people who have a hair color of red or black",
  "people who have neither attended a meeting nor had a one-on-one",
  "salaries per department",
  "salaries per department and age",
  "salaries per department, employee, and age",
  "sum of the salaries per department",
  "average of the salaries per department",
  "top 2 employee salaries",
  "top 2 salaries per department",
  "sum of the top 2 salaries per department",
  "departments where all the employees are over-40 males",
  "employees whose sales are greater than their salary",
  "count employees and their spouses",
  "dishes with eggs and chicken",
  "dishes without eggs and chicken",
  "dishes without eggs or chicken",
  "dishes with eggs that aren't desserts",
  "dishes that take 30 minutes to an hour",
  "people who live alone",
  "everyone in this room speaks at least two languages",
  "Birds can fly, but penguins can not, but Harry the Rocket Penguin can.",
  "at least two languages are spoken by everyone in this room",
  "friends older than the average age of people with pets",
  "meetings john was in in the last 10 days",
  "parts that have a color of red, green, blue, or yellow",
  "employee salary / employee's department total cost",
  "Return the average number of publications by Bob in each year",
  "Return the conference in each area whose papers have the most total citations",
  "return all conferences in the database area",
  "return all the organizations, where the number of papers by the organization is more than the number of authors in IBM",
  "return the authors, where the number of papers by each author in VLDB is more than the number of papers in ICDE",
  "What are the populations of cities that are located in California?",
  "What jobs as a senior software developer are available in Houston but not San Antonio?",
  "Neither of these boys wants to try a piece of pineapple pizza.",
  "Shortest flight between New York and San Francisco",
  "When did Corey Montella marry his spouse?",
  "Ages of Chris Steve Granger, Corey James Irvine Montella, and Josh Cole",  
  "The sweet potatoes in the vegetable bin are green with mold.",
  "States in the United States of America",
  "People older than Chris Granger and younger than Edward Norton",
  "Sum of the salaries per department",
  "Dishes with eggs and chicken",
  "People whose age < 30",
  "People between 50 and 60 years old",
  "Steve is 10 years old and Sven is 12 years old",
  "salaries per department, employee, and age",
  "Where are the restaurants in San Francisco that serve good French food?",
  "Dishes that do not have eggs or chicken",
  "Who had the most sales last year?",
  "Which salesman had the highest total sales last year?",
  "departments where all of the employees are male",
  "sum of the top 2 salaries per department",
  "What is Corey Montella's age?",
  "People older than Corey Montella",
  "How many 4 star restaurants are in San Francisco?",
  "What is the average elevation of the highest points in each state?",
  "What is the name of the longest river in the state that has the largest city in the United States of America?"
  */
];


let siriphrases = [
  "Find videos I took at Iva's birthday party",
  "Find pics from my trip to Aspen in 2014",
  "Find a table for four people tonight in Chicago",
  "Find a table for four tonight in Chicago",
  "How is the weather tomorrow?",
  "Wake me up at 7AM tomorrow",
  "Move my 2PM meeting to 2:30",
  "Do I have any new texts from Rick?",
  "Show my selfies from New Year's Eve",
  "Call Dad at work",
  "Aiesha Turner is my mom",
  "Read my latest email",
  "Text peet 'See you soon smiley exlamation point'",
  "What is trending on Twitter?",
  "Call back my last missed call.",
  "Where is Brian?",
  "Find tweets with the hashtag BayBridge",
  "Read my last message from Andrew",
  "Do I have any new voicemail?",
  "FaceTime Sarah",
  "Redial that last number",
  "Play the last voicemail from Aaron",
  "When did Ingrid call me?",
  "Get my call history",
  "Mark the third one complete",
  "Add Greg to my 2:30 meeting on Thursday",
  "Remind me about this email Friday at noon", // noon should be a quantity
  "Create a new list called Groceries", // why isn't a|DT includeded in "a new list"
  "Where is my next meeting?", // How can we make meeting a noun?
  "Set an alarm for 9 AM every Friday", // AM needs to be special cased to attach to 9
  "Cancel my meetings on Friday", // Cancel needs to be a verb
  "Turn off all my alarms",
  "Add brussels sprouts to my grocery list",
  "Remind me to pay Noah back tomorrow morning",
  // Sports
  "When is the next Mavericks home game?",
  "Who is the quarterback for Dallas?",
  "Who has the most RBIs",
  "Who won the NBA finals?",
  "Where is Wrigley Field?",
  "How many regular-season games does each NBA team play?",
  "When is the LA Galaxy's next home game?",
  "Who do the Chicago Cubs play on September 21?", // 21 needs to merge with September
  "When does the football season start?",
  "What hockey teams play today?",
  "Did the Chicago cubs win on Thursday?",
  // Entertainment
  "Play Third Eye Blind's new album",
  "Play more like this",
  "Play the number one song right now", // Needs help with noun grouping tag accuracy
  "What song is playing right now?", // right now is problematic
  "What movies are playing today?",
  "Where is Unbroken playing around here?", // playing around here is problematic
  "I like this song",
  "What are some PG movies playing this afternoon",
  "Who sings this?", // tags are all wrong, heuristics don't help it
  "I want to hear the live version of this song",
  "Play only songs by Nicki Minaj",
  "What won best picture in 2000?",
  "How are the ratings for The Boxtrolls?",
  "Who directed A Perfect World?",
  "Do people like The Theory of Everything?",
  // Out and about (aka Foursquare queries)
  "Where is a good Indian place around here?", // "place around here" is tagged wrong, heuristics don't help
  "I am running low on gas",
  "What time does Whole Foods close?",
  "Give me public transit direction to the De Young Museum", // Public is tagged a verb
  "Where is a good inexpensive place to eat around here?", // "To eat aroung here" is not recognized
  "Make a reservation at a romantic restaurant tonight at 7PM",
  "Find a happy hour nearby", // nearby should be an adverb?
  "Find coffee near me",
  "What planes are flying above me?", // Tags are all wrong: planes is a verb, flying is an adverb
  "I need some aspirin",
  "How are the reviews for Long Bridge Pizza in San Francisco?",
  "Where is a good hair salon?",
  "What's the best retaurant in San Francisco?",
  "I need a good electrician",
  "Where am I?",
  "What is my ETA?",
  // Homekit
  "Turn the lights blue",
  "Turn off the radio", // "off" should be a particle
  "Turn off the printer in the office", // "off" should be a particle
  "Lock the front door", // front is classified a noun, should be an adhective
  "Set the brightness of the downstairs lights to 50%",
  "Set the Tahoe house to 72 degrees", // house is a verb
  "Turn off Chloe's light", // "off" should be a particle 
  "Turn the living room lights all the way up", // lights is a verb
  "Turn on the bathroom heater",
  // Getting answers
  "Do I need an umbrella today?",
  "How is the Nikkei doing?",
  "When is daylight saving time?",
  "What is the definition of pragmatic?", // "pragmatic is an adjective"
  "What's the latest in San Francisco?",
  "Did the groundhog see its shadow?",
  "When is sunset in Paris", // sunset should be a noun
  "What is the population of Jamaica?",
  "What is the square root of 128?",
  "What is 40 degrees Farenheit in Celsius", // Here is an example where the proper noun combining heuristic fails
  "What is the temperature outside?", // outside is a preposition
  "What time is it in Berlin",
  "When was Abraham Lincoln born?", // This will get Abraham Lincoln, but we need to use "when" and "born" to figure out a date is expected
  "Show me the Orion constellation",
  "What's the high for Anchorage on Thursday?", // This breaks noun combining heuristic 
  "How many dollars is 45 Euros",
  "What day is it?",
  "How many calories in a bagel?",
  "What is Apple's P/E ratio?",
  "Compare AAPL and NASDAQ",
  "How humid is it in New York right now", // Heuristics mess up tagging, "is" is a noun in order to use "humid" as an adjective
  "What's an 18% tip on $85?",
  "What is the UV index outside?",
  "How many cups in a liter",
  "Is it going to snow next week?",
  ];

console.log(`Running ${phrases.length} tests...`);
phrases.map((phrase) => {parseTest(phrase,n)});
//siriphrases.map((phrase) => {parseTest(phrase,n)});