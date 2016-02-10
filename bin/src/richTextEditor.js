var microReact_1 = require("./microReact");
var utils_1 = require("./utils");
var CodeMirror = require("codemirror");
require("codemirror/mode/gfm/gfm");
require("codemirror/mode/clojure/clojure");
function replaceAll(str, find, replace) {
    var regex = new RegExp(find.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
    return str.replace(regex, replace);
}
function wrapWithMarkdown(cm, wrapping) {
    cm.operation(function () {
        var from = cm.getCursor("from");
        // if there's something selected wrap it
        if (cm.somethingSelected()) {
            var selected = cm.getSelection();
            var cleaned = replaceAll(selected, wrapping, "");
            if (selected.substring(0, wrapping.length) === wrapping
                && selected.substring(selected.length - wrapping.length) === wrapping) {
                cm.replaceRange(cleaned, from, cm.getCursor("to"));
                cm.setSelection(from, cm.getCursor("from"));
            }
            else {
                var str = "" + wrapping + cleaned + wrapping;
                cm.replaceRange(str, from, cm.getCursor("to"));
                cm.setSelection(from, cm.getCursor("from"));
            }
        }
        else {
            cm.replaceRange("" + wrapping + wrapping, from);
            var newLocation = { line: from.line, ch: from.ch + wrapping.length };
            cm.setCursor(newLocation);
        }
    });
}
function prefixWithMarkdown(cm, prefix) {
    cm.operation(function () {
        var from = cm.getCursor("from");
        var to = cm.getCursor("to");
        var toPrefix = [];
        for (var lineIx = from.line; lineIx <= to.line; lineIx++) {
            var currentPrefix = cm.getRange({ line: lineIx, ch: 0 }, { line: lineIx, ch: prefix.length });
            if (currentPrefix !== prefix && currentPrefix !== "") {
                toPrefix.push(lineIx);
            }
        }
        // if everything in the selection has been prefixed, then we need to unprefix
        if (toPrefix.length === 0) {
            for (var lineIx = from.line; lineIx <= to.line; lineIx++) {
                cm.replaceRange("", { line: lineIx, ch: 0 }, { line: lineIx, ch: prefix.length });
            }
        }
        else {
            for (var _i = 0; _i < toPrefix.length; _i++) {
                var lineIx = toPrefix[_i];
                cm.replaceRange(prefix, { line: lineIx, ch: 0 });
            }
        }
    });
}
var defaultKeys = {
    "Cmd-B": function (cm) {
        wrapWithMarkdown(cm, "**");
    },
    "Cmd-I": function (cm) {
        wrapWithMarkdown(cm, "_");
    },
};
var RichTextEditor = (function () {
    function RichTextEditor(node, options) {
        //format bar
        this.formatBarDelay = 100;
        this.showingFormatBar = false;
        this.formatBarElement = null;
        this.marks = {};
        this.meta = {};
        var extraKeys = utils_1.mergeObject(utils_1.copy(defaultKeys), options.keys || {});
        this.cmInstance = CodeMirror(node, {
            mode: "eve",
            lineWrapping: true,
            autoCloseBrackets: true,
            viewportMargin: Infinity,
            extraKeys: extraKeys
        });
        var cm = this.cmInstance;
        var self = this;
        cm.on("changes", function (cm, changes) {
            self.onChanges(cm, changes);
            if (self.onUpdate) {
                self.onUpdate(self.meta, cm.getValue());
            }
        });
        cm.on("cursorActivity", function (cm) { self.onCursorActivity(cm); });
        cm.on("mousedown", function (cm, e) { self.onMouseDown(cm, e); });
        cm.getWrapperElement().addEventListener("mouseup", function (e) {
            self.onMouseUp(cm, e);
        });
    }
    RichTextEditor.prototype.showFormatBar = function () {
        //@ TODO: re-enable the format bar
        return;
        this.showingFormatBar = true;
        var renderer = new microReact_1.Renderer();
        var cm = this.cmInstance;
        var head = cm.getCursor("head");
        var from = cm.getCursor("from");
        var to = cm.getCursor("to");
        var start = cm.cursorCoords(head, "local");
        var top = start.bottom + 5;
        if ((head.line === from.line && head.ch === from.ch)
            || (cm.cursorCoords(from, "local").top === cm.cursorCoords(to, "local").top)) {
            top = start.top - 40;
        }
        var barSize = 300 / 2;
        var item = { c: "formatBar", style: "position:absolute; left: " + (start.left - barSize) + "px; top:" + top + "px;", children: [
                { c: "button ", text: "H1", click: function () { prefixWithMarkdown(cm, "# "); } },
                { c: "button ", text: "H2", click: function () { prefixWithMarkdown(cm, "## "); } },
                { c: "sep" },
                { c: "button bold", text: "B", click: function () { wrapWithMarkdown(cm, "**"); } },
                { c: "button italic", text: "I", click: function () { wrapWithMarkdown(cm, "_"); } },
                { c: "sep" },
                { c: "button ", text: "-", click: function () { prefixWithMarkdown(cm, "- "); } },
                { c: "button ", text: "1.", click: function () { prefixWithMarkdown(cm, "1. "); } },
                { c: "button ", text: "[ ]", click: function () { prefixWithMarkdown(cm, "[ ] "); } },
                { c: "sep" },
                { c: "button ", text: "link" },
            ] };
        renderer.render([item]);
        var elem = renderer.content.firstChild;
        this.formatBarElement = elem;
        cm.getWrapperElement().appendChild(elem);
        // this.cmInstance.addWidget(pos, elem);
    };
    RichTextEditor.prototype.hideFormatBar = function () {
        this.showingFormatBar = false;
        this.formatBarElement.parentNode.removeChild(this.formatBarElement);
        this.formatBarElement = null;
    };
    RichTextEditor.prototype.onChanges = function (cm, changes) {
        var self = this;
    };
    RichTextEditor.prototype.onCursorActivity = function (cm) {
        if (this.showingFormatBar && !cm.somethingSelected()) {
            this.hideFormatBar();
        }
    };
    RichTextEditor.prototype.onMouseUp = function (cm, e) {
        if (!this.showingFormatBar) {
            var self = this;
            clearTimeout(this.timeout);
            this.timeout = setTimeout(function () {
                if (cm.somethingSelected()) {
                    self.showFormatBar();
                }
            }, this.formatBarDelay);
        }
    };
    RichTextEditor.prototype.onMouseDown = function (cm, e) {
        var cursor = cm.coordsChar({ left: e.clientX, top: e.clientY });
        var pos = cm.indexFromPos(cursor);
        var marks = cm.findMarksAt(cursor);
    };
    return RichTextEditor;
})();
exports.RichTextEditor = RichTextEditor;
function createEditor(node, elem) {
    var options = elem.options || {};
    var editor = node.editor;
    var cm;
    if (!editor) {
        editor = node.editor = new RichTextEditor(node, options);
        cm = node.editor.cmInstance;
        if (!options.noFocus) {
            cm.focus();
        }
        cm.refresh(); // @FIXME: This also needs to be called any time it is hidden and added again.
    }
    else {
        cm = node.editor.cmInstance;
    }
    editor.onUpdate = elem.onUpdate;
    editor.meta = elem.meta || editor.meta;
    var doc = cm.getDoc();
    if (doc.getValue() !== elem.value) {
        doc.setValue(elem.value || "");
        doc.clearHistory();
        doc.setCursor({ line: 1, ch: 0 });
    }
    if (elem.cells) {
        cm.operation(function () {
            var cellIds = {};
            for (var _i = 0, _a = elem.cells; _i < _a.length; _i++) {
                var cell = _a[_i];
                cellIds[cell.id] = true;
                var mark = editor.marks[cell.id];
                var add = false;
                if (!mark) {
                    add = true;
                }
                else {
                    var found = mark.find();
                    if (!found) {
                        add = true;
                    }
                    else {
                        // if the mark doesn't contain the correct text, we need to nuke it.
                        var from = found.from, to = found.to;
                        if (cm.getRange(from, to) !== cell.value || cell.start !== cm.indexFromPos(from)) {
                            add = true;
                        }
                    }
                }
                if (add) {
                    var dom = void 0;
                    if (!mark) {
                        dom = document.createElement("div");
                        dom.id = elem["meta"].paneId + "|" + cell.id + "|container";
                    }
                    else {
                        dom = mark.replacedWith;
                        mark.clear();
                    }
                    var newMark = cm.markText(cm.posFromIndex(cell.start), cm.posFromIndex(cell.start + cell.length), { replacedWith: dom });
                    newMark.cell = cell;
                    dom["mark"] = newMark;
                    editor.marks[cell.id] = newMark;
                }
            }
            for (var markId in editor.marks) {
                if (!cellIds[markId]) {
                    editor.marks[markId].clear();
                    delete editor.marks[markId];
                }
            }
        });
    }
}
exports.createEditor = createEditor;
CodeMirror.defineMode("eve", function () {
    return {
        startState: function () {
            return {};
        },
        token: function (stream, state) {
            if (stream.sol() && stream.peek() === "#") {
                state.header = true;
                stream.eatWhile("#");
                state.headerNum = stream.current().length;
                return "header-indicator header-indicator-" + state.headerNum;
            }
            else if (state.header) {
                stream.skipToEnd();
                state.header = false;
                return "header header-" + state.headerNum;
            }
            else {
                state.header = false;
                stream.skipToEnd();
            }
        }
    };
});
CodeMirror.defineMIME("text/x-eve", "eve");
//# sourceMappingURL=richTextEditor.js.map