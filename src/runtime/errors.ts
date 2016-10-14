
//--------------------------------------------------------------
// Errors
//--------------------------------------------------------------

import {exceptions, Token, EOF} from "chevrotain";
import * as parser from "./parser";

const SPAN_TYPE = "document_comment";

//--------------------------------------------------------------
// EveError
//--------------------------------------------------------------

class EveError {
  static ID = 0;

  type = "error";
  id: string;
  blockId: string;
  message: string;
  start: number;
  stop: number;
  context?: any;
  spanId: string;

  constructor(blockId, start, stop, message, context?) {
    this.blockId = blockId;
    this.id = `${blockId}|error|${EveError.ID++}`;
    this.start = start;
    this.stop = stop;
    this.message = message;
    this.context = context;
  }

  injectSpan(spans, extraInfo) {
    spans.push(this.start, this.stop, SPAN_TYPE, this.id);
    extraInfo[this.id] = this;
  }
}

//--------------------------------------------------------------
// Parse error utils
//--------------------------------------------------------------

function regexGroup(str, regex, group = 1) {
  var matches = [];
  var match;
  while (match = regex.exec(str)) {
    matches.push(match[group]);
  }
  return matches;
}

function className(thing) {
   var funcNameRegex = /function (.{1,})\(/;
   var results = (funcNameRegex).exec((thing).constructor.toString());
   return (results && results.length > 1) ? results[1] : "";
};

function lastTokenWithType(tokens, type) {
  let ix = tokens.length - 1;
  while(ix >= 0) {
    let cur = tokens[ix];
    if(cur instanceof type) {
      return cur;
    }
    ix--;
  }
}


//--------------------------------------------------------------
// Parse errors
//--------------------------------------------------------------

export function parserErrors(errors: any[], parseInfo: {blockId: string, blockStart: number, spans: any[], extraInfo: any, tokens: Token[]}) {
  let {blockId, blockStart, spans, extraInfo} = parseInfo;
  let normalized = [];
  let errorIx = 1;

  for(let error of errors) {
    let {token, context, message, resyncedTokens, name} = error;
    let eveError: EveError;
    if(name === "MismatchedTokenException") {
      eveError = mismatchedToken(error, parseInfo);
    } else if(name === "NotAllInputParsedException") {
      eveError = notAllInputParsed(error, parseInfo);
    } else {
      console.log("UNHANDLED ERROR TYPE", name);
      let start = token.startOffset;
      let stop = token.startOffset + token.image.length;
      eveError = new EveError(blockId, start, stop, message, context);
    }

    eveError.injectSpan(spans, extraInfo);
    normalized.push(eveError);
  }
  return normalized;
}

//--------------------------------------------------------------
// MismatchedToken parse error
//--------------------------------------------------------------

const MismatchRegex = /-->\s*(.*?)\s*<--/gi;

function mismatchedToken(error, parseInfo) {
  const Pairs = {
    "CloseString": parser.OpenString,
    "CloseBracket": parser.OpenBracket,
    "CloseParen": parser.OpenParen,
  }

  let {blockId, blockStart, spans, extraInfo, tokens} = parseInfo;
  let {token, context, message, resyncedTokens, name} = error;

  let blockEnd = tokens[tokens.length - 1].endOffset + 1;

  let [expectedType, foundType] = regexGroup(message, MismatchRegex);

  let start, stop;

  if(token instanceof EOF) {
    let pair = Pairs[expectedType];
    if(pair) {
      token = lastTokenWithType(tokens, pair);
      message = messages.unclosedPair(expectedType);
    } else {
      token = tokens[tokens.length - 1];
    }
    stop = blockEnd;
  }

  if(start === undefined) start = token.startOffset;
  if(stop === undefined) stop = token.startOffset + token.image.length;

  return new EveError(blockId, start, stop, message, context);
}

//--------------------------------------------------------------
// NotAllInputParsed parse error
//--------------------------------------------------------------

const NotAllInputRegex = /found:\s*([^\s]+)/gi;
const CloseChars = {")": true, "]": true};

function notAllInputParsed(error, parseInfo) {
  let {blockId, blockStart, spans, extraInfo, tokens} = parseInfo;
  let {token, context, message, resyncedTokens, name} = error;

  let blockEnd = tokens[tokens.length - 1].endOffset + 1;

  let [foundChar] = regexGroup(message, NotAllInputRegex);

  let start, stop;

  if(CloseChars[foundChar]) {
    message = messages.extraCloseChar(foundChar);
  } else {
    console.log("WEIRD STUFF AT THE END", context);
  }

  if(start === undefined) start = token.startOffset;
  if(stop === undefined) stop = token.startOffset + token.image.length;

  return new EveError(blockId, start, stop, message, context);
}

//--------------------------------------------------------------
// Build errors
//--------------------------------------------------------------

export function unprovidedVariableGroup(block, variables) {
  let {id, start: blockStart} = block;
  let token;
  for(let variable of variables) {
    if(!variable.generated) {
      token = variable.from[0];
    }
  }
  let start = token.startOffset;
  let stop = token.startOffset + token.image.length;
  return new EveError(id, start, stop, messages.unprovidedVariable(token.image));
}

export function unimplementedExpression(block, expression) {
  let {id, start: blockStart} = block;
  let [start, stop] = parser.nodeToBoundaries(expression, blockStart);
  return new EveError(id, start, stop, messages.unimplementedExpression(expression.op));
}

export function incompatabileConstantEquality(block, left, right) {
  let {id, start: blockStart} = block;
  let [start] = parser.nodeToBoundaries(left, blockStart);
  let [_, stop] = parser.nodeToBoundaries(right, blockStart);
  return new EveError(id, start, stop, messages.neverEqual(left.value, right.value));
}

export function incompatabileVariableToConstantEquality(block, variable, variableValue, constant) {
  let {id, start: blockStart} = block;
  let [start] = parser.nodeToBoundaries(variable, blockStart);
  let [_, stop] = parser.nodeToBoundaries(constant, blockStart);
  return new EveError(id, start, stop, messages.variableNeverEqual(variable, variableValue, constant.value));
}

export function incompatabileTransitiveEquality(block, variable, value) {
  let {id, start: blockStart} = block;
  let [start, stop] = parser.nodeToBoundaries(variable, blockStart);
  return new EveError(id, start, stop, messages.variableNeverEqual(variable, variable.constant, value));
}

//--------------------------------------------------------------
// Messages
//--------------------------------------------------------------

const PairToName = {
  "CloseString": "quote",
  "CloseBracket": "bracket",
  "CloseParen": "paren",
  "]": "bracket",
  ")": "paren",
  "\"": "quote",
}

export var messages = {

  unclosedPair: (type) => `Looks like a close ${PairToName[type]} is missing`,

  extraCloseChar: (char) => `This close ${PairToName[char]} is missing an open ${PairToName[char]}`,

  unprovidedVariable: (varName) => `Nothing is providing a value for ${varName}`,

  unimplementedExpression: (op) => `There's no definition for the function ${op}`,

  neverEqual: (left, right) => `${left} can never equal ${right}`,
  variableNeverEqual: (variable, value, right) => `${variable.name} is equivalent to ${value}, which can't be equal to ${right}`,

};
