import * as app from "../src/app";

declare var CodeMirror;

function CMSearchBox(node, elem) {
  let cm = node.editor;
  if(!cm) {
    let state = {marks: []};
    cm = node.editor = new CodeMirror(node, {
      lineWrapping: true,
      extraKeys: {
        "Cmd-Enter": (cm) => {
          return CodeMirror.Pass;
        }
      }
    });
    cm.on("changes", (cm, changes) => {
      console.log(changes);
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
      let value = cm.getValue();
      let tokens = spans;
      for(let mark of state.marks) {
        mark.clear();
      }
      state.marks = [];
      var pos = 0;
      var changesIndex = 0;
      var curChange = normalizedChanges[changesIndex];
      for(let token of tokens) {
        pos += token.offset;
        if(curChange) console.log("INFO", curChange.pos, curChange.length, pos, token.length);
        // if the change is wholly contained in the full span
        if(curChange && pos < curChange.pos && pos + token.length >= curChange.pos) {
          console.log("INTERSECTION", curChange);
          token.length += curChange.length;
          changesIndex++;
          curChange = normalizedChanges[changesIndex];
        // if the span is wholly contained in the change
        } else if(curChange && curChange.pos < pos && curChange.pos + curChange.absLength >= pos + token.length) {
          console.log("NUKE", token);
        // if the change intersects the left side of a span
        } else if(curChange && curChange.pos < pos && curChange.pos + curChange.absLength > pos && curChange.pos + curChange.absLength <= pos + token.length) {
          // find the intersection
          let intersectedLength = curChange.length - (curChange.pos - pos);
          console.log("LEFT", curChange.pos - pos, intersectedLength);
          token.offset += curChange.pos - pos;
          pos += curChange.pos - pos;
          token.length += intersectedLength;
          changesIndex++;
          curChange = normalizedChanges[changesIndex];
        // if the change intersects the right side of a span
        } else if(curChange && curChange.pos > pos && pos + token.length > curChange.pos && pos + token.length >= curChange.pos + curChange.absLength) {
          console.log("RIGHT");
        // if the change is entirely oustide of the span
        } else if(curChange && (curChange.pos + curChange.absLength <= pos || curChange.pos === pos)) {
          console.log("SHIFT", curChange);
          pos += curChange.length;
          token.offset += curChange.length;
          changesIndex++;
          curChange = normalizedChanges[changesIndex];
        }
        let start = cm.posFromIndex(pos);
        let stop = cm.posFromIndex(pos + token.length);
        let mark = cm.markText(start, stop, {className: token.type});
        mark.info = token;
        state.marks.push(mark);
        pos += token.length;
      }
    });

    cm.focus();
    var timeout;
    cm.on("cursorActivity", (cm) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        if(cm.somethingSelected()) {
          console.log("TIME TO SHOW!");
        }
      }, 1000);
    });
    cm.on("mousedown", (cm, e) => {
      let cursor = cm.coordsChar({left: e.clientX, top: e.clientY});
      let pos = cm.indexFromPos(cursor);
      let marks = cm.findMarksAt(cursor);
      for(let mark of marks) {
        if(mark.info && mark.info.to) {
          console.log("GOTO: ", mark.info.to);
        }
      }
    });
  }
  if(cm.getValue() !== elem.value) {
    cm.setValue(elem.value || "");
  }
  console.log(cm.getWrapperElement());
  cm.getWrapperElement().setAttribute("style", "flex: 1; font-family: 'Helvetica Neue'; font-weight:400; ");
}

var testText = `Engineering

Engineering is a department at Kodowa and stuff.
`;

var spans = [{offset: 30, length: 4, type: "bold link", to: "department"}, {offset: 0, length: "rtment".length, type: "link", to: "department"}, {offset: 4, length: "kodowa".length, type: "link", to: "kodowa"}];

function root() {
  return {id: "root", style: "flex: 1; background: #666; align-items: stretch;", children: [
    {t: "style", text: `
      .link { color: #00F; border-bottom:1px solid #00f; }
      .bold { font-weight: bold; }
    `},
    {style: " background: #fff; padding:10px 10px; margin: 100px auto; width: 800px; flex: 1;", postRender: CMSearchBox, value: testText},
  ]};
}

app.renderRoots["richEditorTest"] = root;