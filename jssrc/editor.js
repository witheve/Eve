let parser = new commonmark.Parser();

function Span(start, len, source) {
  this.start = start;
  this.len = len;
  this.end = start + len;
  this.source = source
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
      if(node.type == "emph" || node.type == "strong" || node.type == "heading" || node.type == "item" || node.type == "link") {
        spans.push(new Span(info.start, pos - info.start, node));
      }
    }
  }

  editor.operation(function() {
    editor.setValue(text.join(""));

    for(let span of spans) {
      let className = span.source.type.toUpperCase();
      if(className == "HEADING") {
        className += span.source.level;
      }
      let marker = editor.markText(editor.posFromIndex(span.start), editor.posFromIndex(span.end), {className})
      marker.source = span.source;
    }

    let typeToBgClass = {"code_block": "CODE"};
    let typeToTextClass = {"item": "ITEM"};
    let marks = editor.getAllMarks();
    for(let mark of marks) {
      if(mark.source.type == "code_block" || mark.source.type == "item") {
        let loc = mark.find();
        let start = loc.from.line;
        let end = loc.to.line;
        if(start == end) {
          end += 1;
        }
        for(let line = start; line < end; line++) {
          if(typeToBgClass[mark.source.type]) {
            editor.addLineClass(line, "background", typeToBgClass[mark.source.type]);
          } else if(typeToTextClass[mark.source.type]) {
            editor.addLineClass(line, "text", typeToTextClass[mark.source.type]);
          }
        }
      }
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
    let loc = mark.find();
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
    } else if(type == "code_block") {
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
    }
  }
  return blocks;
}

function doSwap(editor) {
  sendSwap(toMarkdown(editor));
}

function doSave() {
  sendSave(toMarkdown(codeEditor));
}

function handleEditorParse(parse) {
  let parseLines = parse.lines;
  let from = {};
  let to = {};
  let ix = 0;
  let parseBlocks = parse.root.children;
  codeEditor.operation(function() {
    for(let block of getCodeBlocks(codeEditor)) {
      if(!parseBlocks[ix]) continue;
      let loc = block.find();
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
  let marks = editor.findMarks(selection.from, selection.to);
  let marked = false;
  for(let mark of marks) {
    let loc = mark.find();
    if(mark.source.type == source.type) {
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
        let startMarker = editor.markText(loc.from, selection.from, {className: source.type.toUpperCase(), addToHistory: true});
        startMarker.source = mark.source;
        let endMarker = editor.markText(selection.to, loc.to, {className: source.type.toUpperCase(), addToHistory: true});
        endMarker.source = mark.source;
        mark.clear();
        marked = true;
      // otherwise we need to trim the mark to not include the selection.
      // if the mark is on the left
      } else if(comparePos(loc.to, selection.from) > 0) {
        let startMarker = editor.markText(loc.from, selection.from, {className: source.type.toUpperCase(), addToHistory: true});
        startMarker.source = mark.source;
        mark.clear();
      // if the mark is on the right
      } else if(comparePos(loc.from, selection.to) < 0) {
        let startMarker = editor.markText(selection.to, loc.to, {className: source.type.toUpperCase(), addToHistory: true});
        startMarker.source = mark.source;
        mark.clear();
      }
    }
  }
  if(!marked) {
    let marker = editor.markText(selection.from, selection.to, {className: source.type.toUpperCase(), addToHistory: true});
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
        let loc = mark.find();
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

// @TODO: formatting shouldn't apply in codeblocks.
function formatBold(editor) {
  doFormat(editor, "strong");
}

function formatItalic(editor) {
  doFormat(editor, "emph");
}

function formatHeader(editor) {
  editor.operation(function() {
    let line = editor.getCursor("from").line;
    let from = {line, ch: 0};
    let to = {line, ch: editor.getLine(line).length};
    console.log(from, to);
    fullyMark(editor, {from, to}, {type: "heading1", level: "1"});
  });
}

function getMarksByType(editor, type, start, stop) {
  let marks;
  if(start && stop) {
    marks = editor.findMarks(start, stop);
  } else if(start && !stop) {
    marks = editor.findMarksAt(start);
  } else {
    marks = editor.getAllMarks();
  }
  let valid = [];
  for(let mark of marks) {
    console.log("MARK", mark, mark.source.type, type)
    if(mark.source && mark.source.type === type) {
      valid.push(mark);
    }
  }
  return valid;
}

function splitMark(editor, mark, from, to) {
  if(!to) to = from;
  let loc = mark.find();
  let source = mark.source;
  let startMarker = editor.markText(loc.from, from, {className: source.type.toUpperCase(), addToHistory: true});
  startMarker.source = source;
  if(comparePos(to, loc.to) === -1) {
    let endMarker = editor.markText(to, loc.to, {className: source.type.toUpperCase(), addToHistory: true});
    endMarker.source = source;
  }
  mark.clear();
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
    })
  });
  editor.dirtyLines = [];
  editor.formatting = {};
  editor.formats = ["strong", "emph"];
  editor.on("change", function(editor, change) {
    let {from, to, text} = change;
    let adjusted = {line: from.line, ch: from.ch + text.length};
    if(change.origin === "+input") {
      // handle formatting
      for(let format of editor.formats) {
        let action = editor.formatting[format];
        let className = format.toUpperCase();
        let source = {type: format};
        if(action == "add") {
          let marker = editor.markText(from, adjusted, {className});
          marker.source = source;
        } else if(action == "split") {
          let marks = getMarksByType(editor, format, from);
          for(let mark of marks) {
            splitMark(editor, mark, from, adjusted);
          }
        } else if(!action) {
          let marks = getMarksByType(editor, format, from);
          for(let mark of marks) {
            let loc = mark.find();
            // if we're at the end of this mark
            if(samePos(loc.to, from)) {
              let marker = editor.markText(loc.from, adjusted, mark);
              marker.source = mark.source;
              mark.clear();
            }
          }
        }
      }
    }
    let end = to.line > from.line + text.length ? to.line : from.line + text.length;
    for(let start = from.line; start <= end; start++) {
      let lineInfo = editor.lineInfo(start);
      if(lineInfo && lineInfo.bgClass && lineInfo.bgClass.indexOf("CODE") > -1) {
        editor.dirtyLines.push(start);
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
      activeIds = nodeToRelated(pos, posToToken(pos, renderer.tree[elem.id].parse.lines), renderer.tree[elem.id].parse);
      drawNodeGraph();
    });
    injectMarkdown(editor, elem.value);
    editor.clearHistory();
    node.appendChild(editor.getWrapperElement());
    editor.refresh();
  }
}

function setKeyMap(event) {
  codeEditor.setOption("keyMap", event.currentTarget.value);
}

function CodeMirrorNode(info) {
  info.postRender = injectCodeMirror;
  info.c = "cm-container";
  return info;
}

function compileAndRun() {
  doSwap(codeEditor);
}

function applyFix(event, elem) {
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

