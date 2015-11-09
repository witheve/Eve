declare module nlp {
  type Tag = string;
  interface POS {name: string; parent: string, tag: Tag}
  interface Text {text: string;}
  interface Word {word: string; which: POS}
  export interface AnalyzedWord extends Word {
	analysis: Word;
	start: any;
	end: any;
	normalized: string;
	pos: POS;
	pos_reason: string;
	punctuated: any;
	noun_capital?: boolean;
	title_case?: boolean;
  }

  export interface Ngram extends Word {
    count: number;
    size: number;
  }
  export interface Value extends Word {
    date: () => _Date;
	is_date: () => boolean;
    number: () => number;
  }
  export interface _Date {
	year?: number;
	month?: number;
	day?: number;
	to?: _Date;
	from?: _Date;
	date_object?: Date;
  }

  export interface Noun extends Word {
    singularize: () => string;
    pluralize: () => string;
    is_plural: () => boolean;
    is_person: () => boolean;
    article: () => string;
    conjugate: () => {plural: string, singular: string};
    pronoun: () => string;
  }

  export interface Verb extends Word {
    conjugate: () => {infinitive: string, present: string, past: string, gerund: string};
    to_past: () => string;
    to_present: () => string;
    to_future: () => string;
  }

  export interface Adjective extends Word {
    conjugate: () => {comparative: string, superlative: string, adverb: string, noun: string};
  }

  export interface Adverb extends Word {
    conjugate: () => {adjective: string};
  }

  export interface Sentence {
    tense: () => string;
    text: () => string;
    to_past: () => Sentence;
    to_present: () => Sentence;
    to_future: () => Sentence;
    negate: () => Sentence;
    tags: () => Tag[];
    entities: () => AnalyzedWord[];
    people: () => AnalyzedWord[];
    nouns: () => AnalyzedWord[];
    adjectives: () => AnalyzedWord[];
    adverbs: () => AnalyzedWord[];
    verbs: () => AnalyzedWord[];
    values: () => AnalyzedWord[];
  }

  export interface Section extends Sentence {
	sentences: Sentence[];
  }

  export function noun(text: string): Noun;
  export function verb(text: string): Verb;
  export function adjective(text: string): Adjective;
  export function adverb(text: string): Adverb;
  export function value(text: string): Value;
  export function pos(text: string): Section;
  export function spot(text: string): AnalyzedWord[];

  export function sentences(text: string): string[];
  export function tokenize(text: string): any[];
  export function syllables(text: string): string[];
  export function americanize(text: string): string;
  export function britishize(text: string): string;
  export function ngram(text: string, opts: {min_count?: number, max_size?: number}): Ngram[][];

  export function normalize(text: string): string;
  export function denormalize(text: string): string;
}
