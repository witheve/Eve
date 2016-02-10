var app = require("../src/app");
var richTextEditor_1 = require("../src/richTextEditor");
function embedQuery(query) {
    var span = document.createElement("span");
    span.textContent = "Exec " + query;
    span.classList.add("link");
    return span;
}
function replaceInlineAttribute(query) {
    return "{" + uuid() + "}";
}
function removeAttribute(sourceId) {
}
function CMSearchBox2(node, elem) {
    var editor = node.editor;
    var cm;
    if (!editor) {
        node.editor = new richTextEditor_1.RichTextEditor(node, {});
        cm = node.editor.cmInstance;
        cm.focus();
    }
    if (cm.getValue() !== elem.value) {
        cm.setValue(elem.value || "");
    }
    cm.refresh();
    cm.getWrapperElement().setAttribute("style", "flex: 1; font-family: 'Helvetica Neue'; font-weight:400; ");
}
var testText2 = "# Engineering\n\nEngineering is a {department} at {Kodowa} and stuff.\n";
function root() {
    return { id: "root", style: "flex: 1; background: #666; align-items: stretch;", children: [
            { t: "style", text: "\n      .link { color: #00F; border-bottom:1px solid #00f; }\n      .bold { font-weight: bold; }\n      .italic { font-style: italic; }\n      .CodeMirror .header { font-size:20pt; }\n      .header-padding { height:20px; }\n      .placeholder { color: #bbb; position:absolute; pointer-events:none; }\n    " },
            { style: " background: #fff; padding:10px 10px; margin: 100px auto; width: 800px; flex: 1;", postRender: CMSearchBox2, value: testText2 },
        ] };
}
app.renderRoots["richEditorTest"] = root;
//# sourceMappingURL=richTextEditor.js.map