import * as commonmark from "commonmark";
import {CodeMirror} from "CodeMirror";
import {sendSwap, sendSave, sendParse, nodeToRelated} from "./client";
import {setActiveIds, renderer, renderEditor} from "./renderer";

let parser = new commonmark.Parser();

let codeEditor:any;

function Span(start, len, source) {
  this.start = start;
  this.len = len;
  this.end = start + len;
  this.source = source
}

function findMark(mark) {
  let loc = mark.find();
  if(loc.from) return loc;
  return {from: loc, to: loc};
}

let lineMarks = {"item": true, "heading1": true, "heading2": true, "heading3": true, "heading4": true};
let typeToBgClass = {"code_block": "CODE"};
let typeToTextClass = {"item": "ITEM", "heading1": "HEADING1", "heading2": "HEADING2", "heading3": "HEADING3", "heading4": "HEADING4"};

function createFullClear(editor, mark) {
  let origClear = mark.clear
  return function() {
    let loc = findMark(mark);
    let start = loc.from.line;
    let end = loc.to.line;
    if(start == end) {
      end += 1;
    }
    let type = mark.source.type;
    for(let line = start; line < end; line++) {
      if(typeToBgClass[type]) {
        editor.removeLineClass(line, "background", typeToBgClass[type]);
      } else if(typeToTextClass[type]) {
        editor.removeLineClass(line, "text", typeToTextClass[type]);
      }
    }
    origClear.apply(mark);
  }
}

function addMarkClasses(editor, type, line) {
  if(typeToBgClass[type]) {
    editor.addLineClass(line, "background", typeToBgClass[type]);
  } else if(typeToTextClass[type]) {
    editor.addLineClass(line, "text", typeToTextClass[type]);
  }
}

function addMark(editor, from, to, source) {
  let className = source.type.toUpperCase();
  if(className == "HEADING") {
    className += source.level;
  }
  let marker;
  if(!samePos(from, to)) {
    marker = editor.markText(from, to, {className})
  } else {
    marker = editor.setBookmark(from, {});
  }
  marker.source = source;

  let type = source.type;
  if(type == "heading") {
    type += source.level;
  }
  if(typeToBgClass[type] || typeToTextClass[type]) {
    let start = from.line;
    let end = to.line;
    if(start == end) {
      end += 1;
    }
    for(let line = start; line < end; line++) {
      addMarkClasses(editor, type, line)
    }
    marker.clear = createFullClear(editor, marker);
  }
  return marker;
}

function injectMarkdown(editor, markdown) {
  let parsed = parser.parse(markdown);
  let walker = parsed.walker();
  var cur;
  var text = [];
  var pos = 0;
  var lastLine = 1;
  var spans = [];
  var context = [];
  while(cur = walker.next()) {
    let node = cur.node;
    if(cur.entering) {
      while(node.sourcepos && node.sourcepos[0][0] > lastLine) {
        lastLine++;
        pos++;
        text.push("\n");
      }
      if(node.type !== "text") {
        context.push({node, start: pos});
      }
      if(node.type == "text" || node.type == "code_block" || node.type == "code") {
        text.push(node.literal);
        pos += node.literal.length;
        // lastLine += node.literal.split("\n").length - 1;
      }
      if(node.type == "softbreak") {
        text.push("\n");
        pos += 1;
        lastLine++;
      }
      if(node.type == "code_block") {
        let start = context[context.length - 1].start;
        spans.push(new Span(start, pos - start, node));
        lastLine = node.sourcepos[1][0] + 1;
      }
      if(node.type == "code") {
        let start = context[context.length - 1].start;
        spans.push(new Span(start, pos - start, node));
      }
    } else {
      let info = context.pop();
      if(node.type == "emph" || node.type == "strong" || node.type == "link") {
        spans.push(new Span(info.start, pos - info.start, node));
      } else if(node.type == "heading" || node.type == "item") {
        spans.push(new Span(info.start, 0, node));
      }
    }
  }

  editor.operation(function() {
    editor.setValue(text.join(""));
    for(let span of spans) {
      addMark(editor, editor.posFromIndex(span.start), editor.posFromIndex(span.end), span.source);
    }
  });
}

function toMarkdown(editor) {
  let marks = editor.getAllMarks();
  let markers = [];
  let fullText = editor.getValue();
  let pieces = [];
  let pos = 0;
  for(let mark of marks) {
    let loc = findMark(mark);
    let from = editor.indexFromPos(loc.from);
    let to = editor.indexFromPos(loc.to);
    markers.push({pos: from, start: true, source: mark.source});
    markers.push({pos: to, start: false, source: mark.source});
  }
  markers.sort(function(a, b) {
    return a.pos - b.pos;
  });
  for(let mark of markers) {
    if(!mark.source) continue;
    if(pos !== mark.pos) {
      pieces.push(fullText.substring(pos, mark.pos));
      pos = mark.pos;
    }
    let source = mark.source;
    let type = source.type;
    if(type == "heading" && mark.start) {
      for(let ix = 0; ix < mark.source.level; ix++) {
        pieces.push("#");
      }
      pieces.push(" ");
    } else if(type == "emph") {
      pieces.push("_");
    } else if(type == "strong") {
      pieces.push("**");
    } else if(type == "code") {
      pieces.push("`");
    } else if(type == "code_block" && mark.start) {
      pieces.push("```\n");
    } else if(type == "code_block" && !mark.start) {
      // if the last character of the block is not a \n, we need to
      // add one since the closing fence must be on its own line.
      let last = pieces[pieces.length - 1];
      if(last[last.length - 1] !== "\n") {
        pieces.push("\n");
      }
      pieces.push("```\n");
    } else if(type == "item" && mark.start && source._listData.type == "bullet") {
      pieces.push("- ");
    } else if(type == "item" && mark.start && source._listData.type == "ordered") {
      pieces.push(`${source._listData.start}. `);
    } else if(type == "link" && mark.start) {
      pieces.push("[");
    } else if(type == "link" && !mark.start) {
      pieces.push(`](${source._destination})`);
    }
  }
  if(pos < fullText.length) {
    pieces.push(fullText.substring(pos));
  }
  return pieces.join("");
}

function posToToken(pos, lines) {
  if(!lines) return false;
  let tokens = lines[pos.line + 1] || [];
  for(let token of tokens) {
    if(token.offset <= pos.ch && token.offset + token.value.length >= pos.ch) {
      return token;
    }
  }
  return false;
}

function getCodeBlocks(editor) {
  let blocks = [];
  for(let mark of editor.getAllMarks()) {
    if(!mark.source) continue;
    if(mark.source.type == "code_block") {
      blocks.push(mark);
      let loc = mark.find();
    }
  }
  return blocks;
}

function doSwap(editor) {
  sendSwap(toMarkdown(editor));
}

export function doSave() {
  sendSave(toMarkdown(codeEditor));
}

function handleEditorParse(parse) {
  let parseLines = parse.lines;
  let from:any = {};
  let to:any = {};
  let ix = 0;
  let parseBlocks = parse.root.children;
  codeEditor.operation(function() {
    for(let block of getCodeBlocks(codeEditor)) {
      if(!parseBlocks[ix]) continue;
      let loc = findMark(block);
      let fromLine = loc.from.line;
      let toLine = loc.to.line;
      let parseStart = parse[parseBlocks[ix]].line;
      let offset = parseStart - fromLine + 1;

      for(let line = fromLine; line < toLine; line++) {
        // clear all the marks on that line?
        for(let mark of codeEditor.findMarks({line, ch: 0}, {line, ch: 1000000})) {
          if(!mark.source) {
            mark.clear();
          }
        }
        from.line = line;
        to.line = line;
        let tokens = parseLines[line + offset];
        if(tokens) {
          let firstToken = tokens[0];
          let state;
          for(let token of tokens) {
            from.ch = token.surrogateOffset;
            to.ch = token.surrogateOffset + token.surrogateLength;
            let className = token.type;
            if(state == "TAG" || state == "NAME") {
              className += " " + state;
            }
            codeEditor.markText(from, to, {className, inclusiveRight: true});
            state = token.type
          }
        }
      }
      codeEditor.dirtyLines = [];
      ix++;
    }
  });
}

function ctrlify(keymap) {
  let finalKeymap = {};
  for(let key in keymap) {
    finalKeymap[key] = keymap[key];
    if(key.indexOf("Cmd") > -1) {
      finalKeymap[key.replace("Cmd", "Ctrl")] = keymap[key];
    }
  }
  return finalKeymap;
}


function samePos(a, b) {
  return comparePos(a,b) === 0;
}

function comparePos(a, b) {
  if(a.line === b.line && a.ch === b.ch) return 0;
  if(a.line > b.line) return 1;
  if(a.line === b.line && a.ch > b.ch) return 1;
  return -1;
}

function whollyEnclosed(inner, outer) {
  let left = comparePos(inner.from, outer.from);
  let right = comparePos(inner.to, outer.to);
  if((left === 1 || left === 0) && (right === -1 || right === 0)) {
    return true;
  }
  return false;
}

function fullyMark(editor, selection, source) {
  let marks = getMarksByType(editor, source.type, selection.from, selection.to);
  let marked = false;
  for(let mark of marks) {
    let loc = findMark(mark);
    // if this mark is wholly equalivent to the selection
    // then we remove it and we've "marked" the span
    if(samePos(loc.from, selection.from) && samePos(loc.to, selection.to)) {
      marked = true;
      mark.clear();
      // if the mark is wholly enclosed by the selection, then
      // we remove it as we'll be replacing it with a larger span
    } else if(whollyEnclosed(loc, selection)) {
      mark.clear();
      // if the selection is wholly enclosed in the mark, we have to split
      // the mark so the selection is no longer contained in it
    } else if(whollyEnclosed(selection, loc)) {
      let startMarker = addMark(editor, loc.from, selection.to, source);
      let endMarker = addMark(editor, selection.to, loc.to, source);
      mark.clear();
      marked = true;
      // otherwise we need to trim the mark to not include the selection.
      // if the mark is on the left
    } else if(comparePos(loc.to, selection.from) > 0) {
      let startMarker = addMark(editor, loc.from, selection.from, source);
      mark.clear();
      // if the mark is on the right
    } else if(comparePos(loc.from, selection.to) < 0) {
      let startMarker = addMark(editor, selection.to, loc.to, source);
      mark.clear();
    }
  }
  if(!marked) {
    let marker = addMark(editor, selection.from, selection.to, source);
    marker.source = source;
  }
}

function doFormat(editor, type) {
  editor.operation(function() {
    if(editor.somethingSelected()) {
      let from = editor.getCursor("from");
      let to = editor.getCursor("to");
      fullyMark(editor, {from, to}, {type: type});
    } else {
      // by default, we want to add boldness to the next change we make
      let action = "add";
      let cursor = editor.getCursor("from");
      let marks = editor.findMarksAt(cursor);
      // get the marks at the cursor, if we're at the end of or in the middle
      // of a strong span, then we need to set that the next change is meant
      // to be remove for strong
      for(let mark of marks) {
        if(!mark.source || mark.source.type !== type) continue;
        let loc = findMark(mark);
        if(samePos(loc.to, cursor)) {
          // if we're at the end of a bold span, we don't want the next change
          // to be bold
          action = "remove";
        } else if (samePos(loc.from, cursor)) {
          // if we're at the beginning of a bold span, we're stating we want
          // to add more bold to the front
          action = "add";
        } else {
          // otherwise you're in the middle of a span, and we want the next
          // change to not be bold
          action = "split";
        }
      }
      editor.formatting[type] = action;
    }
  });
}

function doLineFormat(editor, source) {
  editor.operation(function() {
    let loc = {from: editor.getCursor("from"), to: editor.getCursor("to")};
    let start = loc.from.line;
    let end = loc.to.line;
    let existing = [];
    let changed = false;
    for(let line = start; line <= end; line++) {
      let from = {line, ch: 0};
      // if there are line marks of another type, we need to remove them
      let allMarks = editor.findMarksAt(from);
      for(let mark of allMarks) {
        let type = mark.source.type
        if(type !== source.type && lineMarks[type]) {
          mark.clear();
        }
      }
      let marks = getMarksByType(editor, source.type, from);
      // if there's already a mark, we don't need to do anything
      if(!marks.length) {
        changed = true;
        fullyMark(editor, {from, to: from}, source);
      } else {
        // we want to store the found marks in case we need to clear
        // them in the event that all the lines are already formatted
        existing.push.apply(existing, marks);
      }
    }
    // if all the lines were already formatted, then we need to remove
    // the formatting from all of them instead.
    if(!changed) {
      for(let mark of existing) {
        mark.clear();
      }
    }
    editor.refresh();
  });
}

// @TODO: formatting shouldn't apply in codeblocks.
function formatBold(editor) {
  doFormat(editor, "strong");
}

function formatItalic(editor) {
  doFormat(editor, "emph");
}

function formatCode(editor) {
  doFormat(editor, "code");
}

function formatHeader(editor) {
  doLineFormat(editor, {type: "heading1", level: "1"});
}

function formatList(editor) {
  doLineFormat(editor, {type: "item", _listData: {type: "bullet"}});
}

function formatCodeBlock(editor) {
  editor.operation(function() {
    let cursor = editor.getCursor("from");
    let to = {line: cursor.line, ch: 0};
    let text = editor.getLine(cursor.line);
    if(text !== "") {
      to.line += 1;
    }
    addMark(editor, {line: cursor.line, ch: 0}, to, {type: "code_block"});
  });
}

function getMarksByType(editor, type, start, stop?, inclusive?) {
  let marks;
  if(start && stop && !samePos(start, stop)) {
    if(inclusive) {
      marks = editor.findMarks({line: start.line, ch: start.ch - 1}, {line: stop.line, ch: stop.ch + 1});
    } else {
      marks = editor.findMarks(start, stop);
    }
  } else if(start) {
    marks = editor.findMarksAt(start);
  } else {
    marks = editor.getAllMarks();
  }
  let valid = [];
  for(let mark of marks) {
    if(mark.source && mark.source.type === type) {
      valid.push(mark);
    }
  }
  return valid;
}

function splitMark(editor, mark, from, to) {
  if(!to) to = from;
  let loc = findMark(mark);
  let source = mark.source;
  let startMarker = addMark(editor, loc.from, from, source);
  startMarker.source = source;
  if(comparePos(to, loc.to) === -1) {
    let endMarker = addMark(editor, to, loc.to, source);
    endMarker.source = source;
  }
  mark.clear();
}

function isNewlineChange(change) {
  return change.text.length == 2 && change.text[1] == "";
}

function makeEditor() {
  let editor = new CodeMirror(function() {}, {
    tabSize: 2,
    lineWrapping: true,
    extraKeys: ctrlify({
      "Cmd-Enter": doSwap,
      "Cmd-B": formatBold,
      "Cmd-I": formatItalic,
      "Cmd-E": formatHeader,
      "Cmd-Y": formatList,
      "Cmd-K": formatCodeBlock,
      "Cmd-L": formatCode,
    })
  });
  editor.dirtyLines = [];
  editor.formatting = {};
  editor.formats = ["strong", "emph", "code"];
  editor.on("beforeChange", function(editor, change) {
    let {from, to, text} = change;
    if(change.origin === "+delete") {
      let marks = getMarksByType(editor, "item", to);
      for(let mark of marks) {
        // clear the old bookmark
        mark.clear();
        change.cancel();
      }
      marks = getMarksByType(editor, "code_block", to);
      for(let mark of marks) {
        let loc = findMark(mark);
        if(loc.from == loc.to) {
          // clear the old bookmark
          mark.clear();
          change.cancel();
        }
      }
    }
    if(change.origin === "+input") {
      // if we are at the start of a list item and adding a new line, we're really removing the
      // list item-ness of this row
      let marks = getMarksByType(editor, "item", {line: from.line, ch: 0});
      if(marks.length && isNewlineChange(change) && editor.getLine(from.line) === "") {
        for(let mark of marks) {
          mark.clear();
        }
        change.cancel();
      }
    }
  });
  editor.on("change", function(editor, change) {
    let {from, to, text} = change;
    let adjusted = {line: from.line, ch: from.ch + text.length};
    if(change.origin === "+input") {

      // check if we're adding a new line from a list line. If so, we continue
      // the list.
      let marks = getMarksByType(editor, "item", {line: from.line, ch: 0});
      if(marks.length && isNewlineChange(change)) {
        let nextLine = {line: from.line + 1, ch: 0};
        let parentSource = marks[0].source;
        addMark(editor, nextLine, nextLine, {type: parentSource.type, _listData: parentSource._listData});
      }

      // check if we're adding a new line inside of a code_block. If so, that line is also a
      // code_block line
      let codeBlockMarks = getMarksByType(editor, "code_block", to);
      if(codeBlockMarks.length) {
        let mark = codeBlockMarks[0];
        let loc = findMark(mark);
        if(samePos(from, loc.from)) {
          mark.clear();
          if(isNewlineChange(change)) {
            let newTo = {line: adjusted.line + 1, ch: 0};
            let marker = addMark(editor, {line: loc.from.line, ch: 0}, newTo, mark.source);
          } else {
            // if we're typing at the beginning of a code_block, we need to
            // extend the block
            let newTo = loc.to;
            if(comparePos(adjusted, newTo) > 0) {
              newTo = {line: adjusted.line + 1, ch: 0};
            }
            let marker = addMark(editor, {line: loc.from.line, ch: 0}, newTo, mark.source);
          }
        } else if(isNewlineChange(change)) {
          addMarkClasses(editor, "code_block", from.line);
          addMarkClasses(editor, "code_block", from.line + 1);
        }
      }

      // handle formatting
      for(let format of editor.formats) {
        let action = editor.formatting[format];
        let className = format.toUpperCase();
        let source = {type: format};
        if(action == "add") {
          let marker = addMark(editor, from, adjusted, source);
        } else if(action == "split") {
          let marks = getMarksByType(editor, format, from);
          for(let mark of marks) {
            splitMark(editor, mark, from, adjusted);
          }
        } else if(!action) {
          let marks = getMarksByType(editor, format, from);
          for(let mark of marks) {
            let loc = findMark(mark);
            // if we're at the end of this mark
            if(samePos(loc.to, from)) {
              let marker = addMark(editor, loc.from, adjusted, source);
              mark.clear();
            }
          }
        }
      }
    } else if(change.origin === "+delete") {
      let marks = getMarksByType(editor, "heading", to);
      for(let mark of marks) {
        if(from.ch == 0) {
          addMark(editor, from, from, mark.source);
        }
        // clear the old bookmark
        mark.clear();
      }

      let codeBlockMarks = getMarksByType(editor, "code_block", from, to, "inclusive");
      for(let mark of codeBlockMarks) {
        let loc = findMark(mark);
        // if the code_block is now empty, then we need to turn this mark into
        // a bookmark
        if(editor.getRange(loc.from, loc.to) === "\n") {
          mark.clear();
          addMark(editor, loc.from, loc.from, mark.source);
        } else if(loc.to.ch !== 0) {
          // if we removed the end of the block, we have to make sure that this mark
          // ends up terminating at the beginning of the next line.
          let to = {line: from.line + 1, ch: 0};
          mark.clear();
          addMark(editor, loc.from, to, mark.source);
          // we then have to check if any formatting marks ended up in here
          // and remove them
          for(let containedMark of editor.findMarks(loc.from, to)) {
            if(containedMark.source && containedMark.source.type !== "code_block") {
              containedMark.clear();
            }
          }
        }
      }
    } else if(change.origin === "paste") {
      let codeBlockMarks = getMarksByType(editor, "code_block", from);
      for(let mark of codeBlockMarks) {
        let loc = findMark(mark);

        if(samePos(from, loc.from) || comparePos(loc.to, from) > 0) {
          // mark all the pasted lines with the code classes
          let ix = 0;
          for(let text of change.text) {
            addMarkClasses(editor, "code_block", from.line + ix);
            ix++;
          }
        }

        if(samePos(from, loc.from)) {
          mark.clear();
          // if we're typing at the beginning of a code_block, we need to
          // extend the block
          let newTo = {line: adjusted.line + change.text.length, ch: 0};
          let marker = addMark(editor, {line: loc.from.line, ch: 0}, newTo, mark.source);
        }

        if(loc.to.ch !== 0) {
          // if we removed the end of the block, we have to make sure that this mark
          // ends up terminating at the beginning of the next line.
          let to = {line: from.line + 1, ch: 0};
          mark.clear();
          addMark(editor, loc.from, to, mark.source);
          // we then have to check if any formatting marks ended up in here
          // and remove them
          for(let containedMark of editor.findMarks(loc.from, to)) {
            if(containedMark.source && containedMark.source.type !== "code_block") {
              containedMark.clear();
            }
          }
        }
      }
    }
  });
  editor.on("cursorActivity", function(editor) {
    // remove any formatting that may have been applied
    editor.formatting = {};
  });
  editor.on("paste", function(editor) {
    // remove any formatting that may have been applied
    editor.formatting = {};
  });
  editor.on("copy", function(editor) {

  });
  editor.on("changes", function(editor, changes) {
    // remove any formatting that may have been applied
    editor.formatting = {};
    sendParse(toMarkdown(editor));
  });
  return editor;
}

function injectCodeMirror(node, elem) {
  if(!node.editor) {
    codeEditor = makeEditor();
    let editor = codeEditor;
    node.editor = editor;
    node.editor.on("cursorActivity", function() {
      let pos = editor.getCursor();
      setActiveIds(nodeToRelated(pos, posToToken(pos, renderer.tree[elem.id].parse.lines), renderer.tree[elem.id].parse));
      renderEditor();
    });
    injectMarkdown(editor, elem.value);
    editor.clearHistory();
    node.appendChild(editor.getWrapperElement());
    editor.refresh();
  }
}

export function setKeyMap(event) {
  codeEditor.setOption("keyMap", event.currentTarget.value);
}

export function CodeMirrorNode(info) {
  info.postRender = injectCodeMirror;
  info.c = "cm-container";
  return info;
}

export function compileAndRun() {
  doSwap(codeEditor);
}

export function applyFix(event, elem) {
  //we need to do the changes in reverse order to ensure
  //the positions remain the same?
  let changes = elem.fix.changes.slice();
  changes.sort((a, b) => {
    let line = b.to.line - a.to.line;
    if(line == 0) {
      return b.to.offset - a.to.offset;
    }
    return line;
  });
  for(let change of changes) {
    codeEditor.replaceRange(change.value, {line: change.from.line - 1, ch: change.from.offset}, {line: change.to.line - 1, ch: change.to.offset});
  }
  doSwap(codeEditor);
}
