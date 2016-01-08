import * as app from "../src/app";

declare var CodeMirror;

function formatHeader(cm) {
    if(cm.lineCount() < 2) {
        cm.replaceRange("\n", {line: 2, ch: 0});
    }
    let info = cm.lineInfo(0);
    if(info.textClass !== "header") {
        cm.addLineClass(0, "text", "header");
        let div = document.createElement("div");
        div.classList.add("header-padding");
        cm.addLineWidget(0, div);
    }
    if(cm.lineInfo(1).textClass === "header") {
        cm.removeLineClass(0, "text", "header");
        for(let widget of cm.lineInfo(1).widgets) {
            widget.clear();
        }
    }
    if(cm.getLine(0).trim() === "" && !cm.findMarksAt({line: 0, ch: 0}).length) {
        var headerPlaceholder = document.createElement("span");
        headerPlaceholder.classList.add("placeholder");
        headerPlaceholder.innerText = "Let's start with a name";
        cm.setBookmark({line:0, ch:0}, {widget: headerPlaceholder});
    } else if(cm.getLine(0).trim() !== "") {
        let marks = cm.findMarksAt({line: 0, ch: 0});
        for(let mark of marks) {
            mark.clear();
        }
    }
    if(cm.lineCount() === 2 && cm.getLine(1).trim() === "" && !cm.findMarksAt({line: 1, ch: 0}).length) {
        var bodyPlaceholder = document.createElement("span");
        bodyPlaceholder.classList.add("placeholder");
        bodyPlaceholder.innerText = "And get going!";
        cm.setBookmark({line:1, ch:0}, {widget: bodyPlaceholder});
    } else if(cm.getLine(1).trim() !== "") {
        let marks = cm.findMarksAt({line: 1, ch: 0});
        for(let mark of marks) {
            mark.clear();
        }
    }
}

function spanFromSelection(cm): any {
  let start = cm.indexFromPos(cm.getCursor("from"));
  let length = 0;
  if(cm.somethingSelected()) {
    length = cm.indexFromPos(cm.getCursor("to")) - start;
  }
  return {pos: start, length};
}

function cloneSpan(span):any {
  let neue:any = {};
  for(let key in span) {
    neue[key] = span[key];
  }
  return neue;
}

function getIntersecting(spans, toToggle) {
  let pos = 0;
  let before = [];
  let intersection = [];
  let beforeEndPos = -1;
  let after = [];
  let toToggleEnd = toToggle.pos + toToggle.length;
  for(let span of spans) {
    pos += span.offset;
    let spanEnd = pos + span.length;
    if(spanEnd <= toToggle.pos) {
      before.push(span);
      pos += span.length;
      continue;
    }
    if(beforeEndPos === -1) {
      beforeEndPos = pos - span.offset;
    }
    if(toToggleEnd <= pos) {
      after.push(span);
    } else {
      intersection.push(span);
    }
    pos += span.length;
  }
  if(beforeEndPos === -1) {
    beforeEndPos = pos;
  }
  return {before, intersection, after, beforeEndPos};
}

function toggleSpan2(spans, toToggle) {
  let {before, intersection, after, beforeEndPos} = getIntersecting(spans, toToggle);
  // console.log(getIntersecting(spans, toToggle));
  let toToggleOffset = toToggle.pos - beforeEndPos;
  let spanJustBefore = before[before.length - 1];
  let newSpans = [];
  // if toToggle is at the end of the only intersecting span, and the span contains the type
  // we're trying to toggle, then we need to either clear, or create a new span that doesn't contain the given type
  if(spanJustBefore
      && toToggle.length === 0
      && toToggle.pos === beforeEndPos
      && spanJustBefore.type.indexOf(toToggle.type) > -1) {
    console.log("CLEAR");
    // if it is exactly the same type, we're going to add a clear span
    let type = "clear";
    // but if the types aren't the same, we create a span that has a type
    // with the toToggle.type removed
    if(spanJustBefore.type !== toToggle.type) {
      type = spanJustBefore.type.replace(toToggle.type, "");
    }
    let newSpan = {offset: toToggleOffset, length: 0, type};
    newSpans.push(newSpan);
  // if there are no intersecting spans
  } else if(intersection.length === 0) {
    let newSpan = {offset: toToggleOffset, length: toToggle.length, type: toToggle.type};
    newSpans.push(newSpan);
    if(after.length > 0) {
      let cloned = cloneSpan(after[0]);
      cloned.offset = cloned.offset - (newSpan.offset + newSpan.length);
      after[0] = cloned;
    }
  } else {
    let toToggleOffset = toToggle.pos - beforeEndPos;
    let completelyCovered = false;
    let coveredLength = intersection.reduce((prev, x) => prev + x.length, 0);
    if(beforeEndPos + intersection[0].offset <= toToggle.pos && beforeEndPos + intersection[0].offset + coveredLength >= toToggle.pos + toToggle.length) {
      completelyCovered = true;
    }
    // if the intersecting spans completely cover the toToggle space
    // and they all have the type we're looking for, then we remove that type
    // from all the spans
    if(completelyCovered && intersection.every((x) => x.type.indexOf(toToggle.type) > -1)) {
      // console.log("COMPELTELY COVERED");
      let carriedOffset = 0;
      for(let span of intersection) {
        let cloned = cloneSpan(span);
        cloned.type = cloned.type.replace(toToggle.type, "");
        if(cloned.type.trim() !== "") {
          // console.log("carriedOffset", carriedOffset);
          cloned.offset += carriedOffset;
          newSpans.push(cloned);
          carriedOffset = 0;
        } else {
          carriedOffset += cloned.offset + cloned.length;
        }
      }
      if(carriedOffset !== 0 && after.length > 0) {
        // console.log("AFTER CARRIED OFFSET", carriedOffset);
        let cloned = cloneSpan(after[0]);
        cloned.offset = cloned.offset + carriedOffset;
        after[0] = cloned;
      }
    // otherwise, we need to find cover all the gaps with spans that have that
    // type or add it to any existing span that doesn't currently have that type
    } else {
      // console.log("FILLING");
      let totalFilledLength = 0;
      let initialFillOffset = toToggle.pos - beforeEndPos;
      let toggleEnd = toToggle.pos + toToggle.length;
      let pos = beforeEndPos;
      // we are intersecting the first item
      if(intersection[0].offset + beforeEndPos < toToggle.pos) {

      }
      // fill and adjust
      for(let span of intersection) {
        pos += span.offset;
        let spanEnd = pos + span.length;
        let cloned = cloneSpan(span);
        let intersectingLeft = spanEnd > toToggle.pos && pos < toToggle.pos;
        let intersectingRight = pos < toggleEnd && spanEnd > toggleEnd;
        // we're intersecting both
        if(intersectingLeft && intersectingRight) {
          let overlap = spanEnd - toToggle.pos;
          let rightOverlap = toggleEnd - pos;
          cloned.length = cloned.length - overlap;
          newSpans.push(cloned);
          let cloned2 = cloneSpan(span);
          cloned2.offset = 0;
          cloned2.length = toToggle.length;
          cloned2.type = `${cloned2.type} ${toToggle.type}`;
          newSpans.push(cloned2);
          let cloned3 = cloneSpan(span);
          cloned3.offset = 0;
          cloned3.length = cloned3.length - cloned.length - cloned2.length;
          newSpans.push(cloned3);
          totalFilledLength += overlap;
          pos += overlap;
        // we're intersecting on the left
        } else if(intersectingLeft) {
          // console.log("INTERSECT LEFT", spanEnd, toToggle);
          let overlap = spanEnd - toToggle.pos;
          cloned.length = cloned.length - overlap;
          newSpans.push(cloned);
          let cloned2 = cloneSpan(span);
          cloned2.offset = 0;
          cloned2.length = overlap;
          cloned2.type = `${cloned2.type} ${toToggle.type}`;
          newSpans.push(cloned2);
          totalFilledLength += overlap;
          pos += overlap;
        // we're intersecting on the right
        } else if(intersectingRight) {
          // console.log("INTERSECT RIGHT", spanEnd, pos, toToggle);
          if(cloned.offset !== 0) {
            let fillerSpan = {offset: initialFillOffset, length: cloned.offset - initialFillOffset, type: toToggle.type};
            newSpans.push(fillerSpan);
            totalFilledLength += cloned.offset - initialFillOffset;
            initialFillOffset = 0;
          }
          let overlap = toggleEnd - pos;
          cloned.length = overlap;
          cloned.offset = initialFillOffset;
          cloned.type = `${cloned.type} ${toToggle.type}`;
          newSpans.push(cloned);
          let cloned2 = cloneSpan(span);
          cloned2.offset = 0;
          cloned2.length = cloned2.length - overlap;
          newSpans.push(cloned2);
          totalFilledLength += overlap;
          pos += overlap;
        // if we're just touching the span but there's no overlap with the toggle
        // range, just add the span as is.
        } else if(spanEnd === toToggle.pos) {
          newSpans.push(span);
        } else {
          if(cloned.type.indexOf(toToggle.type) === -1) {
            cloned.type = `${cloned.type} ${toToggle.type}`;
          }
          if(cloned.offset !== 0) {
            let fillerSpan = {offset: initialFillOffset, length: cloned.offset - initialFillOffset, type: toToggle.type};
            newSpans.push(fillerSpan);
            totalFilledLength += cloned.offset - initialFillOffset;
            initialFillOffset = 0;
          }
          cloned.offset = 0;
          newSpans.push(cloned);
          totalFilledLength += cloned.length;
          pos += cloned.length;
        }
      }
      // we may still need to fill after the last span and remove the
      // filled length from the offset of the first after span
      if(totalFilledLength !== toToggle.length) {
        let remainingLength = toToggle.length - totalFilledLength;
        // console.log("ADDING REMINAING", remainingLength);
        newSpans.push({offset: 0, length: remainingLength, type: toToggle.type});
        if(after.length > 0) {
          let cloned = cloneSpan(after[0]);
          cloned.offset = cloned.offset - remainingLength;
          after[0] = cloned;
        }
      }
    }
  }
  return before.concat(newSpans).concat(after);
}

function updateSpans(normalizedChanges, spans) {
  let tokens = spans;
  var ix = 0;
  var pos = 0;
  var changesIndex = 0;
  var curChange = normalizedChanges[changesIndex];
  var removes = [];
  for (let token of tokens) {
    pos += token.offset;
    if (curChange) console.log("INFO", curChange.pos, curChange.length, pos, token.length, token);
    // if the change is wholly contained in the full span
    if (curChange && pos < curChange.pos && pos + token.length >= curChange.pos + curChange.absLength) {
      console.log("INTERSECTION", curChange, token);
      token.length += curChange.length;
      changesIndex++;
      curChange = normalizedChanges[changesIndex];
      // if we're typing at the end of a zero length span
    } else if (curChange && curChange.pos === pos && curChange.length > 0 && token.length === 0) {
      // if it's a clear span then we just nuke it and adjust the offset of the next guy.
      if (token.type === "clear") {
        if (tokens[ix + 1]) {
          tokens[ix + 1].offset += token.offset + curChange.length;
        }
        removes.push(ix);
        ix++;
        changesIndex++;
        curChange = normalizedChanges[changesIndex];
        continue;
      } else {
        token.length += curChange.length;
        changesIndex++;
        curChange = normalizedChanges[changesIndex];
      }
      // if the span is wholly contained in the change
    } else if (curChange && curChange.pos <= pos && curChange.pos + curChange.absLength >= pos + token.length) {
      console.log("NUKE", token);
      pos -= token.offset;
      if (tokens[ix + 1]) {
        tokens[ix + 1].offset += token.offset + token.length;
      }
      removes.push(ix);
      ix++;
      continue;
      // if the change intersects the left side of a span
    } else if (curChange && curChange.pos < pos && curChange.pos + curChange.absLength > pos && curChange.pos + curChange.absLength <= pos + token.length) {
      // find the intersection
      let intersectedLength = curChange.length - (curChange.pos - pos);
      console.log("LEFT", curChange.pos - pos, intersectedLength);
      token.offset += curChange.pos - pos;
      pos += curChange.pos - pos;
      token.length += intersectedLength;
      changesIndex++;
      curChange = normalizedChanges[changesIndex];
      // if the change intersects the right side of a span
    } else if (curChange && curChange.pos >= pos && pos + token.length >= curChange.pos && curChange.pos + curChange.absLength >= pos + token.length) {
      // console.log("RIGHT");
      // if the next token is not a clear, then we add it to this guy, but otherwise this
      // change really needs to be handled by the clear.
      if (!tokens[ix + 1] || tokens[ix + 1].type !== "clear" || curChange.pos !== pos + token.length) {
        let intersectedLength = (pos + token.length) - curChange.pos;
        if(intersectedLength === 0) {
          if(curChange.length > 0) {
            token.length += curChange.length;
          }
        } else {
          token.length -= intersectedLength;
          // we insert a clear span here as you just replaced the right side of the span
          // beyond the span itself which almost assuredly means you don't want to start typing
          // in the same span as what you just removed.
          spans.splice(ix + 1,0,{offset:0, length: 0, type:"clear"});
          console.log("ADDED CLEAR", spans);
        }
        console.log("RIGHT", intersectedLength);
        pos += curChange.length - intersectedLength;
        changesIndex++;
        curChange = normalizedChanges[changesIndex];
      }
    } else if (curChange && (curChange.pos + curChange.absLength <= pos || curChange.pos === pos)) {
      console.log("SHIFT", curChange);
      pos += curChange.length;
      token.offset += curChange.length;
      changesIndex++;
      curChange = normalizedChanges[changesIndex];
    }
    pos += token.length;
    ix++;
  }
  for (let remove of removes) {
    spans[remove] = undefined;
  }
  spans = spans.filter((x) => x !== undefined);
  return spans;
}

function renderSpans(cm, spans, previousMarks = []) {
  let tokens = spans;
  for(let mark of previousMarks) {
      mark.clear();
  }
  let marks = [];
  let pos = 0;
  for (let token of tokens) {
    pos += token.offset;
    let start = cm.posFromIndex(pos);
    let stop = cm.posFromIndex(pos + token.length);
    let mark = cm.markText(start, stop, { className: token.type });
    mark.info = token;
    marks.push(mark);
    pos += token.length;
  }
  return marks;
}

function CMSearchBox(node, elem) {
  let cm = node.editor;
  if(!cm) {
    let state = {marks: []};
    cm = node.editor = new CodeMirror(node, {
      lineWrapping: true,
      extraKeys: {
        "Cmd-Enter": (cm) => {
          return CodeMirror.Pass;
        },
        "Cmd-B": (cm) => {
          let span = spanFromSelection(cm);
          span.type = "bold";
          // console.log(span);
          spans = toggleSpan2(spans, span);
          state.marks = renderSpans(cm, spans, state.marks);
          console.log(spans);
        },
        "Cmd-I": (cm) => {
          let span = spanFromSelection(cm);
          span.type = "italic";
          // console.log(span);
          spans = toggleSpan2(spans, span);
          state.marks = renderSpans(cm, spans, state.marks);
          console.log(spans);
        }
      }
    });
    cm.on("changes", (cm, changes) => {
      cm.operation(() => {
        formatHeader(cm);
        // console.log(changes);
        let normalizedChanges = [];
        for(let change of changes) {
            if(change.origin === "setValue") continue;
            //update the spans.
            let start = cm.indexFromPos(change.from);
            let text = change.text.join("\n");
            let length = text.length - change.removed.join("\n").length
            let info = {pos: start, length, absLength: Math.abs(length), text, obj: change};
            normalizedChanges.push(info);
        }
        spans = updateSpans(normalizedChanges, spans);
        state.marks = renderSpans(cm, spans, state.marks);
      });
    });

    cm.focus();
    var timeout;
    cm.on("cursorActivity", (cm) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        if(cm.somethingSelected()) {
          // console.log("TIME TO SHOW!");
        }
      }, 1000);
    });
    cm.on("mousedown", (cm, e) => {
      let cursor = cm.coordsChar({left: e.clientX, top: e.clientY});
      let pos = cm.indexFromPos(cursor);
      let marks = cm.findMarksAt(cursor);
      for(let mark of marks) {
        if(mark.info && mark.info.to) {
          // console.log("GOTO: ", mark.info.to);
        }
      }
    });
  }
  if(cm.getValue() !== elem.value) {
    cm.setValue(elem.value || "");
  }
  formatHeader(cm);
  cm.refresh();
  cm.getWrapperElement().setAttribute("style", "flex: 1; font-family: 'Helvetica Neue'; font-weight:400; ");
}

var testText = `Engineering
Engineering is a department at Kodowa and stuff.
`;

var spans = [{offset: 29, length: 4, type: "bold link", to: "department"}, {offset: 0, length: "rtment".length, type: "link", to: "department"}, {offset: 4, length: "kodowa".length, type: "link", to: "kodowa"}];

function root() {
  return {id: "root", style: "flex: 1; background: #666; align-items: stretch;", children: [
    {t: "style", text: `
      .link { color: #00F; border-bottom:1px solid #00f; }
      .bold { font-weight: bold; }
      .italic { font-style: italic; }
      .CodeMirror .header { font-size:20pt; }
      .header-padding { height:20px; }
      .placeholder { color: #bbb; position:absolute; pointer-events:none; }
    `},
    {style: " background: #fff; padding:10px 10px; margin: 100px auto; width: 800px; flex: 1;", postRender: CMSearchBox, value: testText},
  ]};
}

app.renderRoots["richEditorTest"] = root;