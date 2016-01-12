import * as microReact from "./microReact";
import * as runtime from "./runtime";
import {eve} from "./app";
import * as app from "./app";

declare var pluralize;
declare var uuid;
declare var nlp;

//window["eve"] = eve;

// Entry point for NLQP
export function parse(queryString: string) {
    let tokens = getTokens(queryString);
    let tree = formTree(tokens);
    let ast = formDSL(tree);
    return {tokens: tokens, tree: tree, ast: ast};
}

// ----------------------------------
// Token functions
// ----------------------------------

enum MajorPartsOfSpeech {
  VERB,
  ADJECTIVE,
  ADVERB,
  NOUN,
  GLUE,
  VALUE,
  WHWORD,
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
  NNP,  // singular proper noun (Edinburgh)
  NNPA, // acronym (FBI)
  NNAB, // abbreviation (jr.)
  NNPS, // plural proper noun (Smiths)
  NNS,  // plural noun (dogs)
  NNO,  // possessive noun (dog's)
  NNOP, // possessive proper noun (John's)
  NG,   // gerund noun (eating, winning, but used as a noun)
  PRP,  // personal pronoun (I, you, she)
  PP,   // possessive pronoun (my, one's)
  // Glue
  FW,   // foreign word (voila) 
  IN,   // preposition (of, in, by)
  MD,   // modal verb (can, should)
  CC,   // coordinating conjunction (and, but, or)
  DT,   // determiner (the, some)
  UH,   // interjection (oh, oops)
  EX,   // existential there (there)
  // Value
  CD,   // cardinal value (one, two, first)
  DA,   // date (june 5th 1998)
  NU,   // number (100, one hundred)
  // Wh- word
  WDT,  // Wh-determiner (that what whatever which whichever)
  WP,   // Wh-pronoun (that what whatever which who whom)
  WPO,  // Wh-pronoun possessive (whose)
  WRB   // Wh-adverb (however whenever where why)
}

interface Token {
  originalWord: string;
  normalizedWord: string;
  majorPOS: MajorPartsOfSpeech;
  minorPOS: MinorPartsOfSpeech;
}

function tokenToString(token: Token): string {
  let tokenString = `${token.originalWord} | ${token.normalizedWord} | ${MajorPartsOfSpeech[token.majorPOS]} | ${MinorPartsOfSpeech[token.minorPOS]}` ;
  return tokenString;
}

// take an input string, extract tokens
function getTokens(queryString: string): Array<Token> {
    
    // get parts of speach with sentence information. It's okay if they're wrong, as we will correct them as we create the tree.    
    let nlpTokens = nlp.pos(queryString, {dont_combine: true}).sentences[0].tokens;
    let wordsnTags = nlpTokens.map((token) => {
      return [token.text,token.pos.tag];
    });
              
    // Form a token for each word
    let tokens: Array<Token> = wordsnTags.map((wordnTag) => {
      let word = wordnTag[0];
      let tag: string = wordnTag[1];
      let minorPOS = MinorPartsOfSpeech[tag];
      let majorPOS = minorToMajorPOS(minorPOS);
      let before = "";
      
      // normalize the word
      let normalizedWord = word;
      // strip punctuation
      normalizedWord = normalizedWord.replace(/\.|\?|\!|\,/g,'');
      // get rid of possessive ending
      before = normalizedWord;
      normalizedWord = normalizedWord.replace(/'s|'$/,'');
      // Heuristic: If the word has a possessive ending, it has to be a possessive noun of some sort      
      if (before !== normalizedWord) {
        // tag the word in isolation
        let a: string = nlp.pos(normalizedWord).tags()[0]; // @HACK: done in 2 lines to coerce the type checker
        let singleTag: MinorPartsOfSpeech = MinorPartsOfSpeech[a];
        if (singleTag === MinorPartsOfSpeech.NNP) {
          minorPOS = MinorPartsOfSpeech.NNOP;
          majorPOS = MajorPartsOfSpeech.NOUN;
        }
        else {
          minorPOS = MinorPartsOfSpeech.NNO;
          majorPOS = MajorPartsOfSpeech.NOUN;
        }
      }
      // convert to lowercase
      before = normalizedWord;
      normalizedWord = normalizedWord.toLowerCase();
      // Heuristic: infer some tag information from the case of the word
      // e.g. nouns beginning with a capital letter are usually proper nouns
      if (before !== normalizedWord && majorPOS === MajorPartsOfSpeech.NOUN) {
        if (minorPOS === MinorPartsOfSpeech.NNO) {
          minorPOS = MinorPartsOfSpeech.NNOP;
        } else {
          minorPOS = MinorPartsOfSpeech.NNP;
        }
      }
      // if the word is a noun, singularize
      if (majorPOS === MajorPartsOfSpeech.NOUN) {
        before = normalizedWord;
        normalizedWord = pluralize(normalizedWord, 1);
        // Heuristic: If the word changed after singularizing it, then it was plural to begin with
        if (before !== normalizedWord && (minorPOS !== MinorPartsOfSpeech.NNS && minorPOS !== MinorPartsOfSpeech.NNPS)) {
          if (minorPOS === MinorPartsOfSpeech.NN) {
            minorPOS = MinorPartsOfSpeech.NNS;
          }
          else if (minorPOS === MinorPartsOfSpeech.NNP) {
            minorPOS = MinorPartsOfSpeech.NNPS;
          }
        }
      }      
      return {originalWord: word, normalizedWord: normalizedWord, majorPOS: majorPOS, minorPOS: minorPOS};
    });
    
    // Correct wh- tokens
    for (let token of tokens) {
      if (token.normalizedWord === "that"     || 
          token.normalizedWord === "what"     ||
          token.normalizedWord === "whatever" ||
          token.normalizedWord === "which") {
        // determiners become wh- determiners
        if (token.minorPOS === MinorPartsOfSpeech.DT) {
          token.minorPOS = MinorPartsOfSpeech.WDT;
          token.majorPOS = MajorPartsOfSpeech.WHWORD;
        }
        // pronouns become wh- pronouns
        else if (token.minorPOS === MinorPartsOfSpeech.PRP || token.minorPOS === MinorPartsOfSpeech.PP) {
          token.minorPOS = MinorPartsOfSpeech.WP;
          token.majorPOS = MajorPartsOfSpeech.WHWORD;
        }
        continue;
      }
      // who and whom are wh- pronouns
      if (token.normalizedWord === "who" || 
          token.normalizedWord === "whom") {
        token.minorPOS = MinorPartsOfSpeech.WP;
        token.majorPOS = MajorPartsOfSpeech.WHWORD;
        continue;
      }
      // whose is the only wh- possessive pronoun
      if (token.normalizedWord === "whose") {
        token.minorPOS = MinorPartsOfSpeech.WPO;
        token.majorPOS = MajorPartsOfSpeech.WHWORD;
        continue;
      }
      // adverbs become wh- adverbs
      if (token.normalizedWord === "however"  || 
          token.normalizedWord === "whenever" ||
          token.normalizedWord === "where"    ||
          token.normalizedWord === "why") {
        token.minorPOS = MinorPartsOfSpeech.WRB;
        token.majorPOS = MajorPartsOfSpeech.WHWORD;
        continue;
      }
    }

    return tokens;
}

function minorToMajorPOS(minorPartOfSpeech: MinorPartsOfSpeech): MajorPartsOfSpeech {
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
      minorPartOfSpeech === MinorPartsOfSpeech.NNP  ||
      minorPartOfSpeech === MinorPartsOfSpeech.NNPA ||
      minorPartOfSpeech === MinorPartsOfSpeech.NNAB ||
      minorPartOfSpeech === MinorPartsOfSpeech.NNPS ||
      minorPartOfSpeech === MinorPartsOfSpeech.NNS  ||
      minorPartOfSpeech === MinorPartsOfSpeech.NNO  ||
      minorPartOfSpeech === MinorPartsOfSpeech.NNOP ||
      minorPartOfSpeech === MinorPartsOfSpeech.NG   ||
      minorPartOfSpeech === MinorPartsOfSpeech.PRP  ||
      minorPartOfSpeech === MinorPartsOfSpeech.PP) {
        return MajorPartsOfSpeech.NOUN;
  }
  // Glue
  if (minorPartOfSpeech === MinorPartsOfSpeech.FW ||
      minorPartOfSpeech === MinorPartsOfSpeech.IN ||
      minorPartOfSpeech === MinorPartsOfSpeech.MD ||
      minorPartOfSpeech === MinorPartsOfSpeech.CC ||
      minorPartOfSpeech === MinorPartsOfSpeech.DT ||
      minorPartOfSpeech === MinorPartsOfSpeech.UH ||
      minorPartOfSpeech === MinorPartsOfSpeech.EX) {
        return MajorPartsOfSpeech.GLUE;
  }
  // Value
  if (minorPartOfSpeech === MinorPartsOfSpeech.CD ||
      minorPartOfSpeech === MinorPartsOfSpeech.DA ||
      minorPartOfSpeech === MinorPartsOfSpeech.NU) {
        return MajorPartsOfSpeech.VALUE;
  }
  // Wh-Word
  if (minorPartOfSpeech === MinorPartsOfSpeech.WDT ||
      minorPartOfSpeech === MinorPartsOfSpeech.WP  ||
      minorPartOfSpeech === MinorPartsOfSpeech.WPO ||
      minorPartOfSpeech === MinorPartsOfSpeech.WRB) {
        return MajorPartsOfSpeech.WHWORD;
  }
}

function isPossessive(token: Token): boolean {
  if (token.minorPOS === MinorPartsOfSpeech.NNOP ||
      token.minorPOS === MinorPartsOfSpeech.NNO  ||
      token.minorPOS === MinorPartsOfSpeech.PP   || 
      token.minorPOS === MinorPartsOfSpeech.WPO) {
    return true;
  }
  else {
    return false;
  }
}

function isPlural(token: Token): boolean {
  if (token.minorPOS === MinorPartsOfSpeech.NNS ||
      token.minorPOS === MinorPartsOfSpeech.NNPS) {
    return true;
  }
  else {
    return false;
  }
}

// ----------------------------------
// Tree functions
// ----------------------------------

interface Tree {
  node: Token;
  parent: Token;
  children: Array<Token>;
  nominalChildrenCount: number; // the number of children this node is expected to have. A heuristic for where to stick leftover tokens 
}

// take tokens, form a parse tree
function formTree(tokens: any): any {
 
  let tree: Tree;
  let processedTokens = 0;
  
  // Entity types ORGANIZATION, PERSON, THING, ANIMAL, LOCATION, DATE, TIME, MONEY, and GPE 
  
  // Find noun groups. These are like noun phrases, but smaller. A noun phrase may be a single noun group
  // or it may consist of several noun groups. e.g. "the yellow dog who lived in the town ran away from home".
  // here, the noun phrase "the yellow dog who lived in the town" is a noun phrase consisting of the noun
  // groups "the yellow dog" and "the town"
  // Modifiers that come before a noun: articles, possessive nouns/pronouns, adjectives, participles
  // 
  
  
  // Find adjective phrases. These are analagous to noun phrases but for adjectives. E.g. "very tall person",
  // "very tall" is an adjective group
  // Adjective phrases contain modifiers on the adjective: Premodifiers, Postmodifiers, and Discontinuous Modifiers
  //   Premodifiers are always adverb phrases
  //   Postmodifiers can be an adverb phrase, a prepositional phrase, or a clause
  //   Discontinuous modifiers can be before and after the adjective.
  
  // Heuristic: Adjective phrases exist in proximity to a noun group and within a noun phrase
  
  
  // Find prepositional phrases. These begin with a preposition and end with a noun, pronoun, gerund, or clause.
  // The object of the preposition will have zero or more modifiers describing it.
  // e.g. preposition + [modifiers] + noun | pronoun | gerund | clause
  // Purpose: as an adjective, prep phrase answers "which one?"
  //          as an adverb, answers "how" "when" or "where"
  
  // Heuristic: Prepositional phrase will NEVER contain the subject of the sentence 
  // Heuristic: Prepositional phrases begin with a preposition, and end with a noun group
  
  // Find relationships between noun groups. In the previous example, "the yellow dog" is related to "the town"
  // by the words "lived in"
  
  // Heuristic: relationships often exist between noun groups 
  
  
  
  
  // Find noun phrases. Noun phrases are a group of words that describe a root noun
  // e.g. "4-star restaurant" "the united states of america"
  // Heuristic: CD, DT, and JJ typically preceed a noun phrase
  // Heuristic: All noun phrases contain nouns
  // common error: JJ/VB

  // Heuristic: The first noun is usually the subject
  // breaks this heuristic: "How many 4 star restaurants are in San Francisco?"
  // Here, star is the first noun, but 4-star is an adjective
  let firstNoun = tokens.find((token) => {
    return token.majorPOS === MajorPartsOfSpeech.NOUN;   
  });
  if (firstNoun !== undefined) {
    let expectedChildren = 0;
    // If the noun is possessive, we might expect a dependency exists between it and another noun
    if (isPossessive(firstNoun)) {
        expectedChildren = 1;
    }
    tree = {node: firstNoun, parent: null, children: undefined, nominalChildrenCount: expectedChildren};
    processedTokens++;  
  }
  // Heuristic: If there are no nouns, the root of the tree is just the first token
  // @TODO
  else {
    
  }

  // Heuristic: attributes to a noun exist in close proximity to it
  let firstAdjective = tokens.find((token) => {
    return token.majorPOS === MajorPartsOfSpeech.ADJECTIVE;   
  });
  
  // Heuristic: all nouns belong to a noun phrase
  // Heuristic: The skeleton of the sentence can be constructed by looking only at nouns. All other words are achored to those nouns.
  // Onnce that is done, you can form noun phrases  
    
}

// ----------------------------------
// DSL functions
// ----------------------------------

// take a parse tree, form a DSL AST
function formDSL(tree: Tree): any {

}

// ----------------------------------
// Utility functions
// ----------------------------------

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

// ----------------------------------

let query = "official knowledge";
parse(query);

let start = performance.now();
let parseResult = parse(query);
let stop = performance.now();

// Display result
let tokens = parseResult["tokens"];
let tokenStrings = tokens.map((token) => {
  return tokenToString(token);
});
console.log("===============================");
console.log(query);
console.log(tokenStrings.join("\n"));
console.log(stop-start);