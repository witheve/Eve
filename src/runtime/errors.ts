//--------------------------------------------------------------
// Errors
//--------------------------------------------------------------

export function parserErrors(errors: any[], parseInfo: {blockId: string, blockStart: number, spans: any[], extraInfo: any}) {
  let {blockId, blockStart, spans, extraInfo} = parseInfo;
  let normalized = [];
  let errorIx = 1;
  for(let error of errors) {
    let {token, context, message, resyncedTokens} = error;
    // console.log("orig error", error);
    let spanId = `${blockId}|error|${errorIx++}`;
    let start = blockStart + token.startOffset;
    let stop = blockStart + token.startOffset + token.image.length;
    spans.push(start, stop, "document_comment", spanId);
    let info = {
      type: "error",
      message,
      context: context.ruleStack,
      start,
      stop,
    };
    extraInfo[spanId] = info;
    normalized.push(info);
  }
  return normalized;
}

export function unprovidedVariableGroup(variable) {

}
