let test = "Add **some**\n_fruits to the_ system\n```\n  match\n    [#session-connect]\n  commit\n    [#fruit @lemon color: \"yellow\"]\n    [#fruit @cherry color: \"red\"]\n    [#fruit @orange color: \"orange\"]\n    [#fruit @apple color: \"green\"]\n    [#fruit @banana color: \"yellow\"]\n    [#fruit #exotic @lychee color: \"white\"]\n```\n\nDraw a list of fruits\n```\n  match\n    [#fruit color name]\n  bind\n    [#div #foo sort: name, text: name, style: [color]]\n```\n\ndraw clicks\n```\n  match\n    click = [#click element]\n  commit\n    [#div sort: \"zzz\", click, text: \"yo\"]\n```\n"
let test2 = "# Tic-Tac-Toe\n\n## Game logic\n\nTic-Tac-Toe is a classic game played by two players, \"X\" and \"O\", who take turns marking their letter on a 3x3 grid. The first player to mark 3 adjacent cells in a line wins. The game can potentially result in a draw, where all grid cells are marked, but neither player has 3 adjacent cells. To build this game in Eve, we need several parts:\n\n- A game board with cells\n- A way to mark a cell as \"X\" or \"O\"\n- A way to recognize that a player has won the game.\n\nTo begin, we initialize the board. We commit an object named `@board` to hold our global state and create a set of `#cell`s. These `#cell`s will keep track of the moves players have made. Common connect-N games (a generalized tic-tac-toe for any NxN grid) are scored along 4 axes (horizontal, vertical, the diagonal, and the anti-diagonal). We group cells together along each axis up front to make scoring easier later.\n\nThe game board is square, with a given `size`. It contains `size ^ 2 cells`,\neach with a row and column index.\n\n```\n  match\n    [#session-connect]\n\n    // board constants\n    size = 3\n    starting-player = \"X\"\n\n    // generate the cells\n    i = range[from: 0, to: size]\n    j = range[from: 0, to: size]\n\n commit\n    board = [@board size player: starting-player]\n    [#cell board row: i column: j]\n```\n\nA subtlety here is the last line, `[#cell board row: i column: j]`. Thanks to our relational semantics, this line actually generates all 9 cells. Since the sets of values computed in `i` and `j` have no relation to each other, when we use them together we get the [cartesian product](https://en.wikipedia.org/wiki/Cartesian_product) of their values. This means that if `i = {0, 1, 2}` and `j = {0, 1, 2}`, then `i x j = {(0, 0), (0, 1), ... (2, 1), (2, 2)}`. These are exactly the indices we need for our grid!\n\nNow we tag some special cell groupings: diagonal and anti-diagonal cells. The diagonal cells are (0, 0), (1, 1), and (2, 2). From this we can see that diagonal cells have a row index equal to its column index\n\n```\n  match\n    cells = [#cell row column]\n    row = column\n  bind\n    cells += #diagonal\n```\n\nSimilarly, the anti-diagonal cells are (0, 2), (1, 1), and (2, 0).\n\nAnti-diagonal cells satisfy the equation `row + col = N - 1`,\nwhere N is the size of the board.\n\n```\n  match\n    cells = [#cell row column]\n    [@board size: N]\n    row + column = N - 1\n  bind\n    cells += #anti-diagonal\n```\n\nA game is won when a player marks N cells in a row, column, or diagonal.\nThe game can end in a tie, where no player has N in a row.\n\n```\n  match\n    board = [@board size: N, not(winner)]\n                     // Check for a winning row\n    (winner, cell) = if cell = [#cell row player]\n                       N = count[given: cell, per: (row, player)] then (player, cell)\n                     // Check for a winning column\n                     else if cell = [#cell column player]\n                       N = count[given: cell, per: (column, player)] then (player, cell)\n                     // Check for a diagonal win\n                     else if cell = [#diagonal row column player]\n                       N = count[given: cell, per: player] then (player, cell)\n                     // Check for an anti-diagonal win\n                     else if cell = [#anti-diagonal row column player]\n                       N = count[given: cell, per: player] then (player, cell)\n                     // If all cells are filled but there are no winners\n                     else if cell = [#cell player]\n                       N * N = count[given: cell] then (\"nobody\", cell)\n  commit\n    board.winner := winner\n    cell += #winner\n```\n\nWe use the `count` aggregate in the above block. Count returns the number of discrete values (the cardinality) of the variables in `given`. The optional `per` attribute allows you to specify groupings, which yield one result for each set of values in the group.\n\nFor example, in `count[given: cell, per: player]` we group by `player`, which returns two values: the count of cells marked by player `X` and those marked by `O`. This can be read \"count the cells per player\". In the scoring block, we group by `column` and `player`. This will return the count of cells marked by a player in a particular column. Like wise with the row case. By equating this with N, we ensure the winning player is only returned when she has marked N cells in the given direction.\n\nThis is how Eve works without looping. Rather than writing a nested `for` loop and iterating over the cells, we can use Eve's semantics to our advantage.\n\nWe first search every row, then every column. Finally we check the diagonal and anti-diagonal. To do this, we leverage the `#diagonal` and `#anti-diagonal` tags we created earlier; instead of selecting `[#cell]`, we can select on `[#diagonal]` and `[#anti-diagonal]` to select only a subset of cells.\n\n### React to Events\n\nNext, we handle user input. Any time a cell is directly clicked, we:\n\n1. Ensure the cell hasn't already been played\n2. Check for a winner\n3. Switch to the next player\n\nThen update the cell to reflect its new owner, and switch board's `player` to the next player.\n\nClick on a cell to make your move\n\n```\n  match\n    [#click #direct-target element: [#div cell]]\n    not(cell.player)                               // Ensures the cell hasn't been played\n    board = [@board player: current, not(winner)]  // Ensures the game has not been won\n    next_player = if current = \"X\" then \"O\"        // Switches to the next player\n                  else \"X\"\n  commit\n    board.player := next_player\n    cell.player := current\n```\n\nSince games of tic-tac-toe are often very short and extremely competitive, it's imperative that it be quick and easy to begin a new match. When the game is over (the board has a `winner` attribute), a click anywhere on the drawing area will reset the game for another round of play.\n\nA reset consists of:\n- Clearing the board of a `winner`\n- Clearing all of the cells\n- Removing the `#winner` tag from the winning cell set\n\n```\n  match\n    [#click #direct-target]\n    board = [@board winner]\n    cell = [#cell player]\n  commit\n    board.winner -= winner\n    cell.player -= player\n    cell -= #winner\n```\n\n## Drawing the Game Board\n\nWe've implemented the game logic, but now we need to actually draw the board so players have something to see and interact with. Our general strategy will be that the game board is a `#div` with one child `#div` for each cell. Each cell will be drawn with an \"X\", \"O\", or empty string as text. We also add a `#status` div, which we'll write game state into later. Our cells have the CSS inlined, but you could just as easily link to an external file.\n\nDraw the board\n\n```\n  match\n    board = [@board]\n    cell = [#cell board row column]\n    contents = if cell.player then cell.player\n              else \"\"\n  bind\n    [#div board @container style: [font-family: \"sans-serif\"], children:\n      [#div #status board class: \"status\", style: [text-align: \"center\", width: 150, padding-bottom: 10]]\n      [#div class: \"board\" style: [color: \"black\"] children:\n        [#div class: \"row\" sort: row children:\n          [#div #cell class: \"cell\" cell text: contents sort: column style:\n            [display: \"inline-block\" width: \"50px\" height: \"50px\" border: \"1px solid black\" background: \"white\" font-size: \"2em\" line-height: \"50px\" text-align: \"center\"]]]]\n```\n\nWinning cells are drawn in a different color\n\n```\n  match\n    winning-cells = [#cell #winner]\n    cell-elements = [#div cell: winning-cells, style]\n  bind\n    style.color := \"blue\"\n```\n\nFinally, we fill the previously mentioned `#status` div with our current game state. If no winner has been declared, we remind the competitors of whose turn it is, and once a winner is found we announce her newly-acquired bragging rights.\n\nDisplay the current player if the game isn't won\n\n```\n  match\n    status = [#status board]\n    not(board.winner)\n  bind\n    status.text += \"It's {{board.player}}'s turn!\"\n```\n\nWhen the game is won, display the winner\n\n```\n  match\n    status = [#status board]\n    winner = board.winner\n  bind\n    status.text += \"{{winner}} wins! Click anywhere to restart!\"\n```\n"

let parser = new commonmark.Parser();
let parsed = parser.parse(test2);

function Span(start, len, source) {
  this.start = start;
  this.len = len;
  this.end = start + len;
  this.source = source
}

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
    console.log("OUT", node);
    let info = context.pop();
    if(node.type == "emph" || node.type == "strong" || node.type == "heading" || node.type == "item" || node.type == "link") {
      spans.push(new Span(info.start, pos - info.start, node));
    }
  }
}
console.log(spans);

let codeEditor = makeEditor();

codeEditor.setValue(text.join(""));

let colors = ["red", "blue", "green", "orange", "lightblue"];
for(let span of spans) {
  let className = span.source.type.toUpperCase();
  if(className == "HEADING") {
    className += span.source.level;
  }
  let marker = codeEditor.markText(codeEditor.posFromIndex(span.start), codeEditor.posFromIndex(span.end), {className})
  marker.source = span.source;
}

let typeToBgClass = {"code_block": "CODE"};
let typeToTextClass = {"item": "ITEM"};
let marks = codeEditor.getAllMarks();
for(let mark of marks) {
  if(mark.source.type == "code_block" || mark.source.type == "item") {
    console.log("HERE!", mark.source.type);
    let loc = mark.find();
    let start = loc.from.line;
    let end = loc.to.line;
    if(start == end) {
      end += 1;
    }
    // console.log(loc);
    for(let line = start; line < end; line++) {
      if(typeToBgClass[mark.source.type]) {
        codeEditor.addLineClass(line, "background", typeToBgClass[mark.source.type]);
      } else if(typeToTextClass[mark.source.type]) {
        codeEditor.addLineClass(line, "text", typeToTextClass[mark.source.type]);
      }
      // console.log(line);
    }
  }
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

let testing = toMarkdown(codeEditor);
console.log("SAME?", testing == test2);

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
    if(mark.source.type == "code_block") {
      blocks.push(mark);
    }
  }
  return blocks;
}

function doSwap(editor) {
  sendSwap(editor.getValue());
}

function doSave() {
  sendSave(codeEditor.getValue());
}

function handleEditorParse(parse) {
  let parseLines = parse.lines;
  let from = {};
  let to = {};
  let ix = 0;
  let parseBlocks = parse.root.children;
  for(let block of getCodeBlocks(codeEditor)) {
    let loc = block.find();
    let fromLine = loc.from.line;
    let toLine = loc.to.line;
    let parseStart = parse[parseBlocks[ix]].line;
    let offset = parseStart - fromLine + 3;
    console.log(fromLine, parseStart, offset);

    for(let line = fromLine; line < toLine; line++) {
      // clear all the marks on that line?
      for(let mark of codeEditor.findMarks({line, ch: 0}, {line, ch: 1000000})) {
        mark.clear();
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
  // codeEditor.operation(function() {
  //   for(let line of codeEditor.dirtyLines) {
  //     // clear all the marks on that line?
  //     for(let mark of codeEditor.findMarks({line, ch: 0}, {line, ch: 1000000})) {
  //       mark.clear();
  //     }
  //     from.line = line;
  //     to.line = line;
  //     let tokens = parseLines[line + 1];
  //     if(tokens) {
  //       let firstToken = tokens[0];
  //       // figure out what type of line this is and set the appropriate
  //       // line classes
  //       let state;
  //       for(let token of tokens) {
  //         from.ch = token.surrogateOffset;
  //         to.ch = token.surrogateOffset + token.surrogateLength;
  //         let className = token.type;
  //         if(state == "TAG" || state == "NAME") {
  //           className += " " + state;
  //         }
  //         codeEditor.markText(from, to, {className, inclusiveRight: true});
  //         state = token.type
  //       }
  //     }
  //   }
  //   codeEditor.dirtyLines = [];
  // });
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
      // if(lineInfo) {
      //   let prevInfo = cm.lineInfo(start - 1);
      //   let codeAbove = prevInfo && prevInfo.bgClass && prevInfo.bgClass.indexOf("CODE") > -1;
      //   if(lineInfo.text.match(/^\s*```/)) {
      //     cm.addLineClass(start, "background", "CODE");
      //     // there are two possible cases, eight this line is the beginning
      //     // of a code block, or it's the end of one we can determine that
      //     // by checking if the line above us is marked CODE
      //     if(codeAbove) {
      //       cm.addLineClass(start, "background", "BLOCK_END");
      //     } else {
      //       cm.removeLineClass(start, "background", "BLOCK_END");
      //     }
      //   } else if(codeAbove && prevInfo.bgClass.indexOf("BLOCK_END") == -1) {
      //     // if the thing above us is code and it's not the end of a block, then
      //     // this is also code.
      //     cm.addLineClass(start, "background", "CODE");
      //     cm.removeLineClass(start, "background", "BLOCK_END");
      //   } else {
      //     cm.removeLineClass(start, "background", "CODE");
      //     cm.removeLineClass(start, "background", "BLOCK_END");
      //   }
      // }
    }
  });
  editor.on("changes", function(cm, changes) {
    sendParse(toMarkdown(cm));
  });
  return editor;
}

function injectCodeMirror(node, elem) {
  if(!node.editor) {
    editor = codeEditor;
    node.editor = editor;
    node.editor.on("cursorActivity", function() {
      let pos = editor.getCursor();
      activeIds = nodeToRelated(pos, posToToken(pos, renderer.tree[elem.id].parse.lines), renderer.tree[elem.id].parse);
      drawNodeGraph();
    });
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

