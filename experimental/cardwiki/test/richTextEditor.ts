import * as app from "../src/app";
import {RichTextEditor} from "../src/richTextEditor";
/// <reference path="marked-ast/marked.d.ts" />
import * as marked from "marked-ast";

declare var CodeMirror;
declare var uuid;

function embedQuery(query) {
  var span = document.createElement("span");
  span.textContent = `Exec ${query}`;
  span.classList.add("link");
  return span;
}

function replaceInlineAttribute(query) {
  return `{${uuid()}}`;
}

function removeAttribute(sourceId) {

}

function CMSearchBox2(node, elem) {
  let editor = node.editor;
  let cm;
  if(!editor) {
    node.editor = new RichTextEditor(node, {});
    cm = node.editor.cmInstance;
    cm.focus();
  }
  if(cm.getValue() !== elem.value) {
    cm.setValue(elem.value || "");
  }
  cm.refresh();
  cm.getWrapperElement().setAttribute("style", "flex: 1; font-family: 'Helvetica Neue'; font-weight:400; ");
}

var testText2 = `# Engineering

Engineering is a {department} at {Kodowa} and stuff.
`;

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
    {style: " background: #fff; padding:10px 10px; margin: 100px auto; width: 800px; flex: 1;", postRender: CMSearchBox2, value: testText2},
  ]};
}

app.renderRoots["richEditorTest"] = root;
