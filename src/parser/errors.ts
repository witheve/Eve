//--------------------------------------------------------------
// Errors
//--------------------------------------------------------------

import {exceptions, Token, EOF} from "chevrotain";
import * as parser from "./parser";

const SPAN_TYPE = "document_comment";

//--------------------------------------------------------------
// EveError
//--------------------------------------------------------------

export class EveError {
  static ID = 0;

  type = "error";
  id: string;
  blockId: string;
  message: string;
  start: number;
  stop: number;
  context?: any;
  spanId: string;

  constructor(blockId:string, start:number, stop:number, message:string, context?:any) {
    this.blockId = blockId;
    this.id = `${blockId}|error|${EveError.ID++}`;
    this.start = start;
    this.stop = stop;
    this.message = message;
    this.context = context;
  }

  injectSpan(spans:any, extraInfo:any) {
    spans.push(this.start, this.stop, SPAN_TYPE, this.id);
    extraInfo[this.id] = this;
  }
}

//--------------------------------------------------------------
// Parse error utils
//--------------------------------------------------------------

function regexGroup(str:string, regex:RegExp, group = 1) {
  var matches = [];
  var match;
  while (match = regex.exec(str)) {
    matches.push(match[group]);
  }
  return matches;
}

function className(thing:any) {
   var funcNameRegex = /function (.{1,})\(/;
   var results = (funcNameRegex).exec((thing).constructor.toString());
   return (results && results.length > 1) ? results[1] : "";
};

function lastTokenWithType(tokens:any, type:any) {
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
      // console.log("UNHANDLED ERROR TYPE", name);
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

function mismatchedToken(error:any, parseInfo:any) {
  const Pairs:any = {
    "CloseString": parser.OpenString,
    "CloseBracket": parser.OpenBracket,
    "CloseParen": parser.OpenParen,
  };

  let {blockId, blockStart, spans, extraInfo, tokens} = parseInfo;
  let {token, context, message, resyncedTokens, name} = error;

  let blockEnd = tokens[tokens.length - 1].endOffset + 1;

  let [expectedType, foundType] = regexGroup(message, MismatchRegex);

  let start, stop;

  if(token instanceof EOF) {
    let pair = Pairs[expectedType] as any;
    if(pair) {
      token = lastTokenWithType(tokens, pair);
      message = messages.unclosedPair(expectedType);
    } else {
      token = tokens[tokens.length - 1];
    }
    stop = blockEnd;
  }

  // We didn't find a matching pair, check if we're some other mistmatched bit of syntax.
  if(stop === undefined) {
    if(expectedType === "Tag") {
      if(token.label === "identifier") {
        message = messages.actionRawIdentifier(token.image);
      } else {
        message = messages.actionNonTag(token.image);
      }
    }
  }

  if(start === undefined) start = token.startOffset;
  if(stop === undefined) stop = token.startOffset + token.image.length;

  return new EveError(blockId, start, stop, message, context);
}

//--------------------------------------------------------------
// NotAllInputParsed parse error
//--------------------------------------------------------------

const NotAllInputRegex = /found:\s*([^\s]+)/gi;
const CloseChars:any = {")": true, "]": true};

function notAllInputParsed(error:any, parseInfo:any) {
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

export function unprovidedVariableGroup(block:any, variables:any) {
  let {id, start: blockStart} = block;
  let found;
  for(let variable of variables) {
    if(!variable.generated) {
      found = variable;
      break;
    }
  }
  if(!found) {
    found = variables[0];
  }
  let [start, stop] = parser.nodeToBoundaries(found, blockStart);
  return new EveError(id, start, stop, messages.unprovidedVariable(found.name));
}

export function blankScan(block:any, scan:any) {
  let {id, start: blockStart} = block;
  let [start, stop] = parser.nodeToBoundaries(scan, blockStart);
  return new EveError(id, start, stop, messages.blankScan());
}

export function invalidLookupAction(block:any, action:any) {
  let {id, start: blockStart} = block;
  let [start, stop] = parser.nodeToBoundaries(action, blockStart);
  let missing = [];
  if(action.entity === undefined) missing.push("record");
  if(action.attribute === undefined) missing.push("attribute");
  if(action.value === undefined) missing.push("value");
  return new EveError(id, start, stop, messages.invalidLookupAction(missing));
}

export function unimplementedExpression(block:any, expression:any) {
  let {id, start: blockStart} = block;
  let [start, stop] = parser.nodeToBoundaries(expression, blockStart);
  return new EveError(id, start, stop, messages.unimplementedExpression(expression.op));
}

export function incompatabileConstantEquality(block:any, left:any, right:any) {
  let {id, start: blockStart} = block;
  let [start] = parser.nodeToBoundaries(left, blockStart);
  let [_, stop] = parser.nodeToBoundaries(right, blockStart);
  return new EveError(id, start, stop, messages.neverEqual(left.value, right.value));
}

export function incompatabileVariableToConstantEquality(block:any, variable:any, variableValue:any, constant:any) {
  let {id, start: blockStart} = block;
  let [start] = parser.nodeToBoundaries(variable, blockStart);
  let [_, stop] = parser.nodeToBoundaries(constant, blockStart);
  return new EveError(id, start, stop, messages.variableNeverEqual(variable, variableValue, constant.value));
}

export function incompatabileTransitiveEquality(block:any, variable:any, value:any) {
  let {id, start: blockStart} = block;
  let [start, stop] = parser.nodeToBoundaries(variable, blockStart);
  return new EveError(id, start, stop, messages.variableNeverEqual(variable, variable.constant, value));
}

export function unrecognisedFunctionAttribute(block:any, expression:any, attribute:any) {
  let {id, start: blockStart} = block;
  return new EveError(id, attribute.startOffset , attribute.endOffset, messages.unrecognisedFunctionAttribute(attribute.attribute, expression.op));
}

//--------------------------------------------------------------
// Messages
//--------------------------------------------------------------

const PairToName:any = {
  "CloseString": "quote",
  "CloseBracket": "bracket",
  "CloseParen": "paren",
  "]": "bracket",
  ")": "paren",
  "\"": "quote",
}

export var messages = {

  unclosedPair: (type:string) => `Looks like a close ${PairToName[type]} is missing`,

  extraCloseChar: (char:string) => `This close ${PairToName[char]} is missing an open ${PairToName[char]}`,

  unprovidedVariable: (varName:string) => `Nothing is providing a value for ${varName}`,
  unrecognisedFunctionAttribute: (attributeName:string, functionName:string) => `${attributeName} is not a recognised attribute for ${functionName}.`,

  unimplementedExpression: (op:string) => `There's no definition for the function ${op}`,

  blankScan: () => 'Lookup requires at least one attribute: record, attribute, value, or node',
  invalidLookupAction: (missing:string[]) => `Updating a lookup requires that record, attribute, and value all be provided. Looks like ${missing.join("and")} ${missing.length > 1 ? "are" : "is"} missing.`,

  neverEqual: (left:string, right:string) => `${left} can never equal ${right}`,
  variableNeverEqual: (variable:any, value:string, right:string) => `${variable.name} is equivalent to ${value}, which can't be equal to ${right}`,

  actionNonTag: (found:string) => `Looks like this should be a tag, try changing the ${found} to #${found}`,
  actionRawIdentifier: (found:string) => `I can only add/remove tags directly on a record. If you meant to add ${found} as an attribute to the record, try 'my-record.${found} += ${found}'; if you meant to add the #${found} tag, add #.`
};
