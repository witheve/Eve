import {eve} from "./app";

declare var pluralize;
declare var nlp;

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
  // Get parts of speach with sentence information. It's okay if they're wrong; they 
  // will be corrected as we create the tree and match against the underlying data model    
  let nlpTokens = nlp.pos(processedString, {dont_combine: true}).sentences[0].tokens;
  let preTags: Array<PreToken> = nlpTokens.map((token) => {
    return {text: token.text, tag: token.pos.tag};
  });
  return preTags;
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
  noun: Token;
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
  let unusedAdjectives = findAll(tokens,(token: Token) => token.used === false && getMajorPOS(token.POS) === MajorPartsOfSpeech.ADJECTIVE);
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
  let unusedDeterminers = findAll(tokens, (token: Token) => token.used === false && token.POS === MinorPartsOfSpeech.DT);
  for (let token of unusedDeterminers) {
    nounGroups.push(newNounGroup(token));  
    token.used = true;
  }
    
  // Heuristic: combine adjacent proper noun groups
  /*
  let properNounGroups = findAll(nounGroups,(ng: NounGroup) => ng.isProper === true);
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
  }*/
  
  // Remove the superfluous noun groups
  nounGroups = findAll(nounGroups,(ng: NounGroup) => ng.subsumed === false);
  
  // Resolve pronoun coreferences
  nounGroups = resolveReferences(nounGroups);
  
  // Sort the noun groups to reflect their order in the root sentence
  nounGroups = nounGroups.sort((ngA: NounGroup, ngB: NounGroup) => ngA.begin - ngB.begin);
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
    let isPersonal = intersect(firstPersonPersonal,[ng.noun.normalizedWord]).length > 0;
    return (ng.isReference && !isPersonal);
  });
  let antecedents: Array<NounGroup> = findAll(nounGroups,(ng: NounGroup) => ng.isReference === false);

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
    noun: token,
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

function formTree(tokens: Array<Token>): Array<NounGroup> {
  let nounGroups = formNounGroups(tokens);
  
  // Get unused tokens
  let unusedTokens = findAll(tokens,(token: Token) => token.used === false);
  

  return nounGroups;
  

  //console.log(nounGroupArrayToString(tree));
  //console.log(tokenArrayToString(unusedTokens));
  
  //let token = "corey";
  //let display = eve.findOne("display name", {name: token})
  //let info = eve.findOne("entity", { entity: display.id });
  //console.log(token);
  //console.log(display);
  
  //let nouns = nounGroups.map((ng: NounGroup) => ng.noun);
  //console.log(nouns);
  
  //let display = eve.findOne("display name", {name: token})
  
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

interface Entity {
  id: string;
  displayName: string;
  content: string;
}

interface Field {
  name: string,
  value: string | number,
}

interface Term {
  type: string,
  table: string,
  fields: Array<Field>
}

type Query = Array<Term>;

interface Attribute {
  
}

// take a parse tree, form a DSL AST
function formDSL(tree: Array<NounGroup>): string {

  let entities: Array<Entity> = [];
  // Walk the tree and create the query
  tree.forEach((ng: NounGroup) => {
    let entity = findEntity(ng.noun.normalizedWord);
    entities.push(entity);
  });
  
  // Create a query term for each entity
  let query: Query = entities.map((entity: Entity) => {
    let field: Field = {name: "Entity", value: entity.id};
    let queryTerm: Term = {
      type: "select",
      table: "Entity",
      fields: [field],
    };
    return queryTerm;
  });
  return queryToString(query);
}

// Converts the AST into a string for parsing
function queryToString(query: Query): string {
  let queryString = "(query "
  
  // Map each term to a string
  queryString += query.map((term: Term)=>{
    let termString = "(";
    termString += `${term.type} `;
    termString += `${term.table} `;
    termString += term.fields.map((field) => `:${field.name} ${field.value}`).join(" ");
    termString += ")";
    return termString;
  }).join("");
  
  // Close out the query
  queryString += ")";
  console.log(queryString);
  return queryString;
}

// Returns the entity with the given display name.
// If the entity is not found, returns undefined
// Two error modes here: 
// 1) the name is not found in "display name"
// 2) the name is found in "display name" but not found in "entity"
// can 2) ever happen?
function findEntity(displayName: string): Entity {
  let display = eve.findOne("display name",{ name: displayName });
  if (display !== undefined) {
    let foundEntity = eve.findOne("entity", { entity: display.id });
    if (foundEntity !== undefined) {
      let entity: Entity = {
        id: foundEntity.entity,
        displayName: displayName,
        content: foundEntity.content,
      }
      return entity;
    }
  }
  return undefined;
}

// Returns an attribute associated with an entity
function findAttrubute(displayName: string) {
  
}


// ----------------------------------------------------------------------------
// Debug utility functions
// ---------------------------------------------------------------------------- 

export function tokenToString(token: Token): string {
  let isPossessive = token.isPossessive === undefined ? "" : token.isPossessive === true ? "possessive ": "";
  let isProper = token.isProper === undefined ? "" : token.isProper === true ? "proper ": "";
  let isPlural = token.isPlural === undefined ? "" : token.isPlural === true ? "plural ": "";
  let isReference = token.isReference === undefined ? "" : token.isReference === true ? "reference ": "";
  let isComparative = token.isComparative === undefined ? "" : token.isComparative === true ? "comparative ": "";
  let isSuperlative = token.isSuperlative === undefined ? "" : token.isSuperlative === true ? "superlative ": "";
  let tokenString = `${token.ix}: ${token.originalWord} | ${token.normalizedWord} | ${MajorPartsOfSpeech[getMajorPOS(token.POS)]} | ${MinorPartsOfSpeech[token.POS]} | ${isPossessive}${isProper}${isPlural}${isReference}${isComparative}${isSuperlative}` ;
  return tokenString;
}

export function tokenArrayToString(tokens: Array<Token>): string {
  let tokenArrayString = tokens.map((token) => tokenToString(token)).join("\n");
  return tokenArrayString;
}

export function nounGroupToString(nounGroup: NounGroup): string {
  let noun = nounGroup.noun.normalizedWord;
  let refersTo: NounGroup = nounGroup.refersTo;
  let reference = refersTo === undefined ? "" : " (" + refersTo.noun.normalizedWord + ")";
  let children = nounGroup.children.sort((childA: Token, childB: Token) => childA.ix - childB.ix).map((child: Token) => child.normalizedWord).join(" ");
  let propertiesString = `Properties:\n${nounGroup.isPlural ? `-plural\n` : ``}${nounGroup.isPossessive ? `-possessive\n` : ``}${nounGroup.isProper ? `-proper\n` : ``}${nounGroup.isQuantity ? `-quantity\n` : ``}${nounGroup.isReference ? `-reference\n` : ``}${nounGroup.isComparative ? `-comparative\n` : ``}${nounGroup.isSuperlative ? `-superlative\n` : ``}`;
  let nounGroupString = `(${nounGroup.begin}-${nounGroup.end})\n${noun}${reference}\n  ${children}\n\n${propertiesString}`;
  return nounGroupString;
}

export function nounGroupArrayToString(nounGroups: Array<NounGroup>): string {
  let nounGroupsString =  nounGroups.map((ng: NounGroup)=> nounGroupToString(ng)).join("\n----------------------------------------\n");
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

declare var exports;
window["NLQP"] = exports;