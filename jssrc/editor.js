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
          // figure out what type of line this is and set the appropriate
          // line classes
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

function makeEditor() {
  let editor = new CodeMirror(function() {}, {
    tabSize: 2,
    lineWrapping: true,
    extraKeys: {
      "Cmd-Enter": doSwap,
      "Ctrl-Enter": doSwap,
    }
  });
  editor.dirtyLines = [];
  editor.on("change", function(cm, change) {
    let {from, to, text} = change;
    let end = to.line > from.line + text.length ? to.line : from.line + text.length;
    for(let start = from.line; start <= end; start++) {
      let lineInfo = cm.lineInfo(start);
      if(lineInfo && lineInfo.bgClass && lineInfo.bgClass.indexOf("CODE") > -1) {
        cm.dirtyLines.push(start);
      }
    }
  });
  editor.on("changes", function(cm, changes) {
    sendParse(toMarkdown(cm));
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

