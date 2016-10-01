"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var commonmark_1 = require("commonmark");
var CodeMirror_1 = require("CodeMirror");
var client_1 = require("./client");
var renderer_1 = require("./renderer");
var codeEditor;
var lineMarks = { "item": true, "heading": true, "heading1": true, "heading2": true, "heading3": true, "heading4": true };
var parser = new commonmark_1.Parser();
var Span = (function () {
    function Span(editor, from, to, source) {
        this.id = Span.spanId++;
        this.source = source;
        this.from = from;
        this.to = to;
    }
    Span.prototype.getMarkAttributes = function () {
        return { className: this.source.type.toUpperCase() };
    };
    Span.prototype.applyMark = function (editor) {
        this.editor = editor;
        var cm = editor.editor;
        var _a = this, from = _a.from, to = _a.to;
        if (!samePos(from, to)) {
            var attributes = this.getMarkAttributes();
            this.textMarker = cm.markText(from, to, attributes);
        }
        else {
            this.textMarker = cm.setBookmark(from, {});
        }
        this.textMarker.span = this;
        if (this.lineTextClass || this.lineBackgroundClass) {
            var start = from.line;
            var end = to.line;
            if (start == end) {
                end += 1;
            }
            for (var line = start; line < end; line++) {
                if (this.lineBackgroundClass)
                    cm.addLineClass(line, "background", this.lineBackgroundClass);
                if (this.lineTextClass)
                    cm.addLineClass(line, "text", this.lineTextClass);
            }
        }
    };
    Span.prototype.find = function () {
        if (this.textMarker) {
            var loc = this.textMarker.find();
            if (!loc)
                return;
            if (loc.from)
                return loc;
            return { from: loc, to: loc };
        }
        return { from: this.from, to: this.to };
    };
    Span.prototype.clear = function (origin) {
        if (origin === void 0) { origin = "+delete"; }
        if (this.textMarker) {
            var cm = this.editor.editor;
            var loc = this.find();
            this.from = loc.from;
            this.to = loc.to;
            this.editor.clearMark(this, origin);
            this.textMarker.clear();
            this.textMarker.span = undefined;
            this.textMarker = undefined;
            var start = loc.from.line;
            var end = loc.to.line;
            if (start == end) {
                end += 1;
            }
            for (var line = start; line < end; line++) {
                if (this.lineBackgroundClass)
                    cm.removeLineClass(line, "background", this.lineBackgroundClass);
                if (this.lineTextClass)
                    cm.removeLineClass(line, "text", this.lineTextClass);
            }
        }
    };
    Span.prototype.attached = function () {
        return this.textMarker !== undefined && this.find();
    };
    Span.prototype.clone = function () {
        var spanType = TypeToSpanType[this.source.type] || Span;
        var loc = this.find();
        return new spanType(loc.from, loc.to, this.source);
    };
    Span.prototype.refresh = function (change) { };
    Span.prototype.onChange = function (change) { };
    Span.prototype.onBeforeChange = function (change) { };
    Span.spanId = 0;
    return Span;
}());
function cmLength(cm) {
    var lastLine = cm.lineCount() - 1;
    return cm.indexFromPos({ line: lastLine, ch: cm.getLine(lastLine).length });
}
function normalizeChange(editor, change) {
    // if there's a text property, we're dealing with a codemirror change
    // object
    if (change.text) {
        var from = change.from, text = change.text, removed = change.removed;
        var removedText = removed.join("\n");
        var addedText = text.join("\n");
        var start = editor.indexFromPos(from);
        var end = start + addedText.length;
        return { type: "range", start: start, removed: removedText, added: addedText };
    }
    else {
        // otherwise we're dealing with a span change which is already normalized
        // for us
        return change;
    }
}
function inverseNormalizedChange(change) {
    var type = change.type, start = change.start, removed = change.removed, added = change.added;
    return { type: type, start: start, added: removed, removed: added };
}
function changeToOps(editor, change) {
    var _a = normalizeChange(editor, change), start = _a.start, added = _a.added, removed = _a.removed;
    var remaining = cmLength(editor) - start - added.length;
    var ops = [];
    ops.push(start);
    ops.push(added);
    ops.push(removed.length * -1);
    ops.push(remaining);
    var invert = [];
    invert.push(start);
    invert.push(removed);
    invert.push(added.length * -1);
    invert.push(remaining);
}
function changeToFinalPos(change) {
    var from = change.from, to = change.to, text = change.text;
    var adjusted = { line: from.line + (text.length - 1), ch: 0 };
    if (text.length == 1) {
        adjusted.ch = from.ch + text[0].length;
    }
    else {
        adjusted.ch = text[text.length - 1].length;
    }
    return adjusted;
}
function formattingChange(span, change, action) {
    var editor = span.editor;
    var source = { type: span.source.type };
    var from = change.from, to = change.to;
    var adjusted = changeToFinalPos(change);
    if (action == "split") {
        splitMark(editor, span, from, adjusted);
    }
    else if (!action) {
        var loc = span.find();
        // if we're at the end of this mark
        if (samePos(loc.to, from)) {
            span.clear();
            editor.mark(loc.from, adjusted, source);
        }
    }
}
var HeadingSpan = (function (_super) {
    __extends(HeadingSpan, _super);
    function HeadingSpan(editor, from, to, source) {
        _super.call(this, editor, from, to, source);
        this.lineTextClass = "HEADING" + this.source.level;
        this.lineBackgroundClass = "HEADING" + this.source.level;
        this.active = false;
    }
    HeadingSpan.prototype.getMarkAttributes = function () {
        return { className: "HEADING" + this.source.level };
    };
    HeadingSpan.prototype.onChange = function (change) {
        var from = change.from, to = change.to;
        if (change.origin === "+delete") {
            var marks = getMarksByType(this.editor.editor, "heading", to);
            for (var _i = 0, marks_1 = marks; _i < marks_1.length; _i++) {
                var mark = marks_1[_i];
                if (from.ch == 0) {
                    this.editor.mark(from, from, mark.span.source);
                }
                // clear the old bookmark
                mark.clear();
            }
        }
    };
    return HeadingSpan;
}(Span));
var ListItemSpan = (function (_super) {
    __extends(ListItemSpan, _super);
    function ListItemSpan(editor, from, to, source) {
        _super.call(this, editor, from, to, source);
        this.lineTextClass = "ITEM";
    }
    ListItemSpan.prototype.onBeforeChange = function (change) {
        var from = change.from, to = change.to, text = change.text;
        var loc = this.find();
        if (!samePos(loc.from, from))
            return;
        if (change.origin === "+delete") {
            this.clear();
            change.cancel();
        }
        if (change.origin === "+input") {
            // if we are at the start of a list item and adding a new line, we're really removing the
            // list item-ness of this row
            if (isNewlineChange(change) && this.editor.editor.getLine(from.line) === "") {
                this.clear();
                change.cancel();
            }
        }
    };
    ListItemSpan.prototype.onChange = function (change) {
        var from = change.from, to = change.to, text = change.text;
        var loc = this.find();
        if (!samePos(loc.from, from))
            return;
        // check if we're adding a new line from a list line. If so, we continue
        // the list.
        if (isNewlineChange(change)) {
            var nextLine = { line: from.line + 1, ch: 0 };
            var parentSource = this.source;
            this.editor.mark(nextLine, nextLine, { type: parentSource.type, _listData: parentSource._listData });
        }
    };
    return ListItemSpan;
}(Span));
var CodeBlockSpan = (function (_super) {
    __extends(CodeBlockSpan, _super);
    function CodeBlockSpan(editor, from, to, source) {
        _super.call(this, editor, from, to, source);
        this.lineBackgroundClass = "CODE";
    }
    CodeBlockSpan.prototype.onBeforeChange = function (change) {
        if (change.origin === "+delete") {
            var loc = this.find();
            if (samePos(loc.from, change.to)) {
                this.clear();
                change.cancel();
            }
        }
    };
    CodeBlockSpan.prototype.refresh = function (change) {
        var loc = this.find();
        var cm = this.editor.editor;
        for (var ix = loc.from.line; ix < loc.to.line; ix++) {
            var info = cm.lineInfo(ix);
            if (!info.bgClass || info.bgClass.indexOf(this.lineBackgroundClass) === -1) {
                cm.addLineClass(ix, "background", this.lineBackgroundClass);
            }
        }
    };
    CodeBlockSpan.prototype.onChange = function (change) {
        var from = change.from, to = change.to, text = change.text;
        var adjusted = changeToFinalPos(change);
        var mark = this;
        var loc = mark.find();
        if (from.line < loc.from.line || (from.line === loc.from.line && loc.from.ch !== 0) || samePos(loc.from, loc.to)) {
            mark.clear();
            // if we're typing at the beginning of a code_block, we need to
            // extend the block
            // let newTo = {line: adjusted.line + change.text.length, ch: 0};
            var newFrom = { line: from.line, ch: 0 };
            var newTo = { line: loc.to.line > loc.from.line ? loc.to.line : from.line + 1, ch: 0 };
            var marker = this.editor.mark(newFrom, newTo, mark.source);
        }
        else if (loc.to.ch !== 0) {
            // if we removed the end of the block, we have to make sure that this mark
            // ends up terminating at the beginning of the next line.
            var to_1 = { line: from.line + 1, ch: 0 };
            mark.clear();
            this.editor.mark(loc.from, to_1, mark.source);
            // we then have to check if any formatting marks ended up in here
            // and remove them
            for (var _i = 0, _a = this.editor.editor.findMarks(loc.from, to_1); _i < _a.length; _i++) {
                var containedMark = _a[_i];
                if (containedMark.source && containedMark.source.type !== "code_block") {
                    containedMark.clear();
                }
            }
        }
        else {
            this.refresh(change);
        }
    };
    return CodeBlockSpan;
}(Span));
var CodeSpan = (function (_super) {
    __extends(CodeSpan, _super);
    function CodeSpan() {
        _super.apply(this, arguments);
    }
    CodeSpan.prototype.onChange = function (change) {
        var action = this.editor.formatting["strong"];
        if (change.origin === "+input") {
            formattingChange(this, change, action);
        }
    };
    return CodeSpan;
}(Span));
var StrongSpan = (function (_super) {
    __extends(StrongSpan, _super);
    function StrongSpan() {
        _super.apply(this, arguments);
    }
    StrongSpan.prototype.onChange = function (change) {
        var action = this.editor.formatting["strong"];
        if (change.origin === "+input") {
            formattingChange(this, change, action);
        }
    };
    return StrongSpan;
}(Span));
var EmphasisSpan = (function (_super) {
    __extends(EmphasisSpan, _super);
    function EmphasisSpan() {
        _super.apply(this, arguments);
    }
    EmphasisSpan.prototype.onChange = function (change) {
        var action = this.editor.formatting["strong"];
        if (change.origin === "+input") {
            formattingChange(this, change, action);
        }
    };
    return EmphasisSpan;
}(Span));
var ImageSpan = (function (_super) {
    __extends(ImageSpan, _super);
    function ImageSpan() {
        _super.apply(this, arguments);
    }
    return ImageSpan;
}(Span));
var LinkSpan = (function (_super) {
    __extends(LinkSpan, _super);
    function LinkSpan() {
        _super.apply(this, arguments);
    }
    return LinkSpan;
}(Span));
var ElisionSpan = (function (_super) {
    __extends(ElisionSpan, _super);
    function ElisionSpan(editor, from, to, source) {
        _super.call(this, editor, from, to, source);
        this.lineBackgroundClass = "elision";
    }
    ElisionSpan.prototype.getMarkAttributes = function () {
        if (!this.element) {
            this.element = document.createElement("div");
            this.element.className = "elision-marker";
        }
        return { className: this.source.type.toUpperCase(), replacedWith: this.element };
    };
    return ElisionSpan;
}(Span));
var MarkdownFormats = ["strong", "emph", "code"];
var TypeToSpanType = {
    "heading": HeadingSpan,
    "item": ListItemSpan,
    "code_block": CodeBlockSpan,
    "strong": StrongSpan,
    "emphasis": EmphasisSpan,
    "code": CodeSpan,
    "image": ImageSpan,
    "link": LinkSpan,
    "elision": ElisionSpan,
};
var MarkdownEditor = (function () {
    function MarkdownEditor(value) {
        var self = this;
        var editor = new CodeMirror_1.CodeMirror(function () { }, {
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
        editor.markdownEditor = this;
        this.editor = editor;
        this.formatting = {};
        this.queued = false;
        this.affectedMarks = [];
        this.markIndexes = {
            type: {}
        };
        this.history = { position: 0, items: [] };
        CodeMirror_1.CodeMirror.commands.undo = function (cm) {
            cm.markdownEditor.undo();
        };
        CodeMirror_1.CodeMirror.commands.redo = function (cm) {
            cm.markdownEditor.redo();
        };
        editor.on("beforeChange", function (editor, change) { self.onBeforeChange(change); });
        editor.on("change", function (editor, change) { self.onChange(change); });
        editor.on("cursorActivity", function (editor) { self.onCursorActivity(); });
        editor.on("paste", function (editor, event) { self.onPaste(event); });
        editor.on("copy", function (editor, event) { self.onCopy(event); });
        editor.on("changes", function (editor, changes) { self.onChanges(changes); });
        // editor.on("scroll", function(editor) { self.onScroll(); });
        this.loadMarkdown(value);
        this.editor.clearHistory();
        this.history = { position: 0, items: [] };
        this.version = 0;
    }
    MarkdownEditor.prototype.onScroll = function () {
    };
    MarkdownEditor.prototype.onBeforeChange = function (change) {
        var from = change.from, to = change.to;
        var marks;
        if (!samePos(from, to)) {
            var adjustedFrom = this.editor.posFromIndex(this.editor.indexFromPos(from) - 1);
            var adjustedTo = this.editor.posFromIndex(this.editor.indexFromPos(to) + 1);
            marks = this.editor.findMarks(adjustedFrom, adjustedTo);
        }
        else {
            marks = this.editor.findMarksAt(from);
        }
        for (var _i = 0, marks_2 = marks; _i < marks_2.length; _i++) {
            var mark = marks_2[_i];
            if (mark.span && mark.span.onBeforeChange) {
                if (!mark.find()) {
                    mark.clear();
                }
                else {
                    mark.span.onBeforeChange(change);
                }
            }
        }
        if (!change.canceled) {
            this.changing = true;
            this.affectedMarks.push.apply(this.affectedMarks, marks);
        }
    };
    MarkdownEditor.prototype.onChange = function (change) {
        var marks = this.affectedMarks;
        if (change.origin === "+mdredo" || change.origin === "+mdundo") {
            for (var _i = 0, marks_3 = marks; _i < marks_3.length; _i++) {
                var mark = marks_3[_i];
                if (mark.span && mark.span.refresh) {
                    mark.span.refresh(change);
                }
            }
            return;
        }
        // any multi-line change should be in its own undo block
        if (change.text.length > 1) {
            this.finalizeLastHistoryEntry();
        }
        this.addToHistory(change);
        var from = change.from, to = change.to;
        for (var _a = 0, marks_4 = marks; _a < marks_4.length; _a++) {
            var mark = marks_4[_a];
            if (mark.span && mark.span.onChange) {
                if (!mark.find()) {
                    mark.span.clear();
                }
                else {
                    mark.span.onChange(change);
                }
            }
        }
        for (var format in this.formatting) {
            var action = this.formatting[format];
            if (action == "add") {
                var from_1 = change.from;
                var adjusted = changeToFinalPos(change);
                var marker = this.mark(from_1, adjusted, { type: format });
            }
        }
    };
    MarkdownEditor.prototype.onChanges = function (changes) {
        this.affectedMarks = [];
        this.changing = false;
        this.history.transitioning = false;
        // remove any formatting that may have been applied
        this.formatting = {};
        this.queueUpdate();
    };
    MarkdownEditor.prototype.onCursorActivity = function () {
        if (!this.changing) {
            this.finalizeLastHistoryEntry();
        }
        // remove any formatting that may have been applied
        this.formatting = {};
    };
    MarkdownEditor.prototype.onCopy = function (event) { };
    MarkdownEditor.prototype.onPaste = function (event) {
        this.finalizeLastHistoryEntry();
        // remove any formatting that may have been applied
        this.formatting = {};
    };
    MarkdownEditor.prototype.finalizeLastHistoryEntry = function () {
        var history = this.history;
        if (history.items.length) {
            history.items[history.items.length - 1].finalized = true;
        }
    };
    MarkdownEditor.prototype.addToHistory = function (change) {
        var history = this.history;
        if (history.transitioning)
            return;
        // if we're not in the last position, we need to remove all the items
        // after since we're effectively branching in history
        if (history.items.length !== history.position) {
            history.items = history.items.slice(0, history.position);
        }
        var changeSet = { changes: [] };
        var last = history.items[history.items.length - 1];
        var normalized = changeSet.changes;
        if (last && !last.finalized) {
            normalized = last.changes;
        }
        if (change.origin !== "+mdundo" && change.origin !== "+mdredo") {
            normalized.push(normalizeChange(this.editor, change));
        }
        if (normalized.length && (!last || last.finalized)) {
            history.position++;
            history.items.push(changeSet);
        }
    };
    MarkdownEditor.prototype.undo = function () {
        var self = this;
        var history = this.history;
        if (history.position === 0)
            return;
        this.finalizeLastHistoryEntry();
        history.position--;
        var changeSet = history.items[history.position];
        var editor = this.editor;
        history.transitioning = true;
        editor.operation(function () {
            for (var ix = changeSet.changes.length - 1; ix > -1; ix--) {
                var change = changeSet.changes[ix];
                var inverted = inverseNormalizedChange(change);
                if (inverted.type === "range") {
                    editor.replaceRange(inverted.added, editor.posFromIndex(inverted.start), editor.posFromIndex(inverted.start + inverted.removed.length), "+mdundo");
                }
                else if (inverted.type === "span") {
                    for (var _i = 0, _a = inverted.removed; _i < _a.length; _i++) {
                        var removed = _a[_i];
                        removed.clear("+mdundo"); // Is this correct? It seems like this is a string elsewhere?
                    }
                    for (var _b = 0, _c = inverted.added; _b < _c.length; _b++) {
                        var added = _c[_b];
                        self._markSpan(added, "+mdundo");
                    }
                }
            }
        });
    };
    MarkdownEditor.prototype.redo = function () {
        var self = this;
        var history = this.history;
        if (history.position > history.items.length - 1)
            return;
        var changeSet = history.items[history.position];
        history.position++;
        var editor = this.editor;
        history.transitioning = true;
        editor.operation(function () {
            for (var _i = 0, _a = changeSet.changes; _i < _a.length; _i++) {
                var change = _a[_i];
                if (change.type === "range") {
                    editor.replaceRange(change.added, editor.posFromIndex(change.start), editor.posFromIndex(change.start + change.removed.length), "+mdredo");
                }
                else if (change.type === "span") {
                    for (var _b = 0, _c = change.removed; _b < _c.length; _b++) {
                        var removed = _c[_b];
                        removed.clear("+mdredo");
                    }
                    for (var _d = 0, _e = change.added; _d < _e.length; _d++) {
                        var added = _e[_d];
                        self._markSpan(added, "+mdredo");
                    }
                }
            }
        });
    };
    MarkdownEditor.prototype._markSpan = function (span, origin) {
        if (origin === void 0) { origin = "+input"; }
        this.addToHistory({ type: "span", added: [span], removed: [], origin: origin });
        span.applyMark(this);
    };
    MarkdownEditor.prototype._indexMark = function (span) {
        var type = span.source.type;
        if (!this.markIndexes.type[type]) {
            this.markIndexes.type[type] = [];
        }
        this.markIndexes.type[type].push(span);
    };
    MarkdownEditor.prototype._unindexMark = function (span) {
        var type = span.source.type;
        var index = this.markIndexes.type[type];
        var ix = index.indexOf(span);
        if (ix > -1) {
            index.splice(ix, 1);
        }
    };
    MarkdownEditor.prototype.mark = function (from, to, source) {
        var type = source.type;
        var spanClass = TypeToSpanType[type] || Span;
        var span = new spanClass(this, from, to, source);
        this._markSpan(span);
        this.queueUpdate();
        this._indexMark(span);
        return span;
    };
    MarkdownEditor.prototype.clearMark = function (mark, origin) {
        if (origin === void 0) { origin = "+delete"; }
        this.addToHistory({ type: "span", added: [], removed: [mark], origin: origin });
        this.queueUpdate();
        this._unindexMark(mark);
    };
    MarkdownEditor.prototype.marksByType = function (type, from, to) {
        var index = this.markIndexes.type[type];
        if (!index)
            return [];
        // if we're not being picky, just return them all
        if (from === undefined && to === undefined)
            return index.slice();
        // otherwise find each mark and check for intersection
        // if we don't have a to, set it to from for the sake of intersection
        if (to === undefined) {
            to = from;
        }
        var results = [];
        for (var _i = 0, index_1 = index; _i < index_1.length; _i++) {
            var mark = index_1[_i];
            var loc = mark.find();
            if ((comparePos(loc.from, from) <= 0 && comparePos(loc.to, from) >= 0) ||
                (comparePos(loc.from, to) <= 0 && comparePos(loc.to, to) >= 0)) {
                results.push(mark);
            }
        }
        return results;
    };
    MarkdownEditor.prototype.updateElisions = function () {
        var headings = this.marksByType("heading");
        var self = this;
        var _a = this, history = _a.history, editor = _a.editor;
        var last = { line: 0, ch: 0 };
        editor.operation(function () {
            history.transitioning = true;
            var elisions = self.marksByType("elision");
            for (var _i = 0, elisions_1 = elisions; _i < elisions_1.length; _i++) {
                var elision = elisions_1[_i];
                elision.clear();
            }
            for (var _a = 0, headings_1 = headings; _a < headings_1.length; _a++) {
                var heading = headings_1[_a];
                var loc = heading.find();
                if (!last && !heading.active) {
                    last = loc.from;
                }
                if (last && heading.active) {
                    self.mark(last, { line: loc.from.line - 1, ch: 10000000000 }, { type: "elision" });
                    last = null;
                }
            }
            if (last) {
                self.mark(last, { line: editor.lineCount(), ch: 0 }, { type: "elision" });
            }
            history.transitioning = false;
        });
    };
    MarkdownEditor.prototype.clearElisions = function () {
        var _a = this, history = _a.history, editor = _a.editor;
        var elisions = getMarksByType(this.editor, "elision");
        editor.operation(function () {
            history.transitioning = true;
            for (var _i = 0, elisions_2 = elisions; _i < elisions_2.length; _i++) {
                var elision = elisions_2[_i];
                elision.span.clear();
            }
            history.transitioning = false;
        });
    };
    MarkdownEditor.prototype.dom = function () {
        return this.editor.getWrapperElement();
    };
    MarkdownEditor.prototype.refresh = function () {
        this.editor.refresh();
    };
    MarkdownEditor.prototype.focus = function () {
        this.editor.focus();
    };
    MarkdownEditor.prototype.queueUpdate = function () {
        var self = this;
        if (!this.queued) {
            this.queued = true;
            setTimeout(function () {
                renderer_1.renderEve();
                self.sendParse();
                self.queued = false;
                self.version++;
            }, 1);
        }
    };
    MarkdownEditor.prototype.sendParse = function () {
        client_1.sendParse(toMarkdown(this.editor));
    };
    MarkdownEditor.prototype.loadMarkdown = function (markdownText) {
        var editor = this.editor;
        var self = this;
        var _a = parseMarkdown(markdownText), text = _a.text, spans = _a.spans;
        editor.operation(function () {
            editor.setValue(text);
            for (var _i = 0, spans_1 = spans; _i < spans_1.length; _i++) {
                var span = spans_1[_i];
                var start = span[0], end = span[1], source = span[2];
                self.mark(editor.posFromIndex(start), editor.posFromIndex(end), source);
            }
        });
    };
    MarkdownEditor.prototype.getMarkdown = function () {
        return toMarkdown(this.editor);
    };
    return MarkdownEditor;
}());
function parseMarkdown(markdown) {
    var parsed = parser.parse(markdown);
    var walker = parsed.walker();
    var cur;
    var text = [];
    var pos = 0;
    var lastLine = 1;
    var spans = [];
    var context = [];
    while (cur = walker.next()) {
        var node = cur.node;
        if (cur.entering) {
            while (node.sourcepos && node.sourcepos[0][0] > lastLine) {
                lastLine++;
                pos++;
                text.push("\n");
            }
            if (node.type !== "text") {
                context.push({ node: node, start: pos });
            }
            if (node.type == "text" || node.type == "code_block" || node.type == "code") {
                text.push(node.literal);
                pos += node.literal.length;
            }
            if (node.type == "softbreak") {
                text.push("\n");
                pos += 1;
                lastLine++;
            }
            if (node.type == "code_block") {
                var start = context[context.length - 1].start;
                spans.push([start, pos, node]);
                lastLine = node.sourcepos[1][0] + 1;
            }
            if (node.type == "code") {
                var start = context[context.length - 1].start;
                spans.push([start, pos, node]);
            }
        }
        else {
            var info = context.pop();
            if (node.type == "emph" || node.type == "strong" || node.type == "link") {
                spans.push([info.start, pos, node]);
            }
            else if (node.type == "heading" || node.type == "item") {
                spans.push([info.start, info.start, node]);
            }
        }
    }
    return { text: text.join(""), spans: spans };
}
function toMarkdown(editor) {
    var marks = editor.getAllMarks();
    var markers = [];
    var fullText = editor.getValue();
    var pieces = [];
    var pos = 0;
    for (var _i = 0, marks_5 = marks; _i < marks_5.length; _i++) {
        var m = marks_5[_i];
        var mark = m.span;
        if (!mark)
            continue;
        var loc = mark.find();
        var from = editor.indexFromPos(loc.from);
        var to = editor.indexFromPos(loc.to);
        markers.push({ pos: from, start: true, source: mark.source });
        markers.push({ pos: to, start: false, source: mark.source });
    }
    markers.sort(function (a, b) {
        return a.pos - b.pos;
    });
    for (var _a = 0, markers_1 = markers; _a < markers_1.length; _a++) {
        var mark = markers_1[_a];
        if (!mark.source)
            continue;
        if (pos !== mark.pos) {
            pieces.push(fullText.substring(pos, mark.pos));
            pos = mark.pos;
        }
        var source = mark.source;
        var type = source.type;
        if (type == "heading" && mark.start) {
            for (var ix = 0; ix < mark.source.level; ix++) {
                pieces.push("#");
            }
            pieces.push(" ");
        }
        else if (type == "emph") {
            pieces.push("_");
        }
        else if (type == "strong") {
            pieces.push("**");
        }
        else if (type == "code") {
            pieces.push("`");
        }
        else if (type == "code_block" && mark.start) {
            pieces.push("```\n");
        }
        else if (type == "code_block" && !mark.start) {
            // if the last character of the block is not a \n, we need to
            // add one since the closing fence must be on its own line.
            var last = pieces[pieces.length - 1];
            if (last[last.length - 1] !== "\n") {
                pieces.push("\n");
            }
            pieces.push("```\n");
        }
        else if (type == "item" && mark.start && source._listData.type == "bullet") {
            pieces.push("- ");
        }
        else if (type == "item" && mark.start && source._listData.type == "ordered") {
            pieces.push(source._listData.start + ". ");
        }
        else if (type == "link" && mark.start) {
            pieces.push("[");
        }
        else if (type == "link" && !mark.start) {
            pieces.push("](" + source._destination + ")");
        }
    }
    if (pos < fullText.length) {
        pieces.push(fullText.substring(pos));
    }
    return pieces.join("");
}
function doSwap(editor) {
    editor = editor.markdownEditor || editor;
    client_1.sendSwap(editor.getMarkdown());
}
function doSave() {
    client_1.sendSave(codeEditor.getMarkdown());
}
exports.doSave = doSave;
function handleEditorParse(parse) {
    console.log(parse);
    if (!codeEditor)
        return;
    var parseLines = parse.lines;
    var from = {};
    var to = {};
    var ix = 0;
    var parseBlocks = parse.blocks;
    codeEditor.editor.operation(function () {
        for (var _i = 0, _a = codeEditor.marksByType("code_block"); _i < _a.length; _i++) {
            var block = _a[_i];
            if (!parseBlocks[ix])
                continue;
            var loc = block.find();
            var fromLine = loc.from.line;
            var toLine = loc.to.line;
            var parseStart = parseBlocks[ix].line;
            var offset = parseStart - fromLine + 1;
            for (var line = fromLine; line < toLine; line++) {
                // clear all the marks on that line?
                for (var _b = 0, _c = codeEditor.editor.findMarks({ line: line, ch: 0 }, { line: line, ch: 1000000 }); _b < _c.length; _b++) {
                    var mark = _c[_b];
                    if (!mark.span) {
                        mark.clear();
                    }
                }
                from.line = line;
                to.line = line;
                var tokens = parseLines[line + offset];
                if (tokens) {
                    var state = void 0;
                    for (var _d = 0, tokens_1 = tokens; _d < tokens_1.length; _d++) {
                        var token = tokens_1[_d];
                        from.ch = token.surrogateOffset;
                        to.ch = token.surrogateOffset + token.surrogateLength;
                        var className = token.type;
                        if (state == "TAG" || state == "NAME") {
                            className += " " + state;
                        }
                        codeEditor.editor.markText(from, to, { className: className, inclusiveRight: true });
                        state = token.type;
                    }
                }
            }
            ix++;
        }
    });
}
exports.handleEditorParse = handleEditorParse;
function ctrlify(keymap) {
    var finalKeymap = {};
    for (var key in keymap) {
        finalKeymap[key] = keymap[key];
        if (key.indexOf("Cmd") > -1) {
            finalKeymap[key.replace("Cmd", "Ctrl")] = keymap[key];
        }
    }
    return finalKeymap;
}
function samePos(a, b) {
    return comparePos(a, b) === 0;
}
function comparePos(a, b) {
    if (a.line === b.line && a.ch === b.ch)
        return 0;
    if (a.line > b.line)
        return 1;
    if (a.line === b.line && a.ch > b.ch)
        return 1;
    return -1;
}
function whollyEnclosed(inner, outer) {
    var left = comparePos(inner.from, outer.from);
    var right = comparePos(inner.to, outer.to);
    if ((left === 1 || left === 0) && (right === -1 || right === 0)) {
        return true;
    }
    return false;
}
function fullyMark(editor, selection, source) {
    var marks = getMarksByType(editor.editor, source.type, selection.from, selection.to);
    var marked = false;
    for (var _i = 0, marks_6 = marks; _i < marks_6.length; _i++) {
        var m = marks_6[_i];
        var mark = m.span;
        var loc = mark.find();
        // if this mark is wholly equalivent to the selection
        // then we remove it and we've "marked" the span
        if (samePos(loc.from, selection.from) && samePos(loc.to, selection.to)) {
            marked = true;
            mark.clear();
        }
        else if (whollyEnclosed(loc, selection)) {
            mark.clear();
        }
        else if (whollyEnclosed(selection, loc)) {
            var startMarker = editor.mark(loc.from, selection.from, source);
            var endMarker = editor.mark(selection.to, loc.to, source);
            mark.clear();
            marked = true;
        }
        else if (comparePos(loc.to, selection.from) > 0) {
            var startMarker = editor.mark(loc.from, selection.from, source);
            mark.clear();
        }
        else if (comparePos(loc.from, selection.to) < 0) {
            var startMarker = editor.mark(selection.to, loc.to, source);
            mark.clear();
        }
    }
    if (!marked) {
        editor.mark(selection.from, selection.to, source);
    }
}
function doFormat(editor, type) {
    var cm = editor.editor;
    editor.finalizeLastHistoryEntry();
    cm.operation(function () {
        if (cm.somethingSelected()) {
            var from = cm.getCursor("from");
            var to = cm.getCursor("to");
            fullyMark(editor, { from: from, to: to }, { type: type });
        }
        else {
            // by default, we want to add boldness to the next change we make
            var action = "add";
            var cursor = cm.getCursor("from");
            var marks = cm.findMarksAt(cursor);
            // get the marks at the cursor, if we're at the end of or in the middle
            // of a strong span, then we need to set that the next change is meant
            // to be remove for strong
            for (var _i = 0, marks_7 = marks; _i < marks_7.length; _i++) {
                var m = marks_7[_i];
                var mark = m.span;
                if (!mark.source || mark.source.type !== type)
                    continue;
                var loc = mark.find();
                if (samePos(loc.to, cursor)) {
                    // if we're at the end of a bold span, we don't want the next change
                    // to be bold
                    action = "remove";
                }
                else if (samePos(loc.from, cursor)) {
                    // if we're at the beginning of a bold span, we're stating we want
                    // to add more bold to the front
                    action = "add";
                }
                else {
                    // otherwise you're in the middle of a span, and we want the next
                    // change to not be bold
                    action = "split";
                }
            }
            editor.formatting[type] = action;
        }
        editor.finalizeLastHistoryEntry();
    });
}
function doLineFormat(editor, source) {
    var cm = editor.editor;
    editor.finalizeLastHistoryEntry();
    cm.operation(function () {
        var loc = { from: cm.getCursor("from"), to: cm.getCursor("to") };
        var start = loc.from.line;
        var end = loc.to.line;
        var existing = [];
        var changed = false;
        for (var line = start; line <= end; line++) {
            var from = { line: line, ch: 0 };
            // if there are line marks of another type, we need to remove them
            var allMarks = cm.findMarksAt(from);
            for (var _i = 0, allMarks_1 = allMarks; _i < allMarks_1.length; _i++) {
                var mark = allMarks_1[_i];
                if (!mark.span)
                    continue;
                var type = mark.span.source.type;
                if (type !== source.type && lineMarks[type]) {
                    mark.span.clear();
                }
            }
            var marks = getMarksByType(cm, source.type, from);
            // if there's already a mark, we don't need to do anything
            if (!marks.length) {
                changed = true;
                fullyMark(editor, { from: from, to: from }, source);
            }
            else {
                // we want to store the found marks in case we need to clear
                // them in the event that all the lines are already formatted
                existing.push.apply(existing, marks);
            }
        }
        // if all the lines were already formatted, then we need to remove
        // the formatting from all of them instead.
        if (!changed) {
            for (var _a = 0, existing_1 = existing; _a < existing_1.length; _a++) {
                var mark = existing_1[_a];
                mark.span.clear();
            }
        }
        editor.finalizeLastHistoryEntry();
        editor.refresh();
    });
}
// @TODO: formatting shouldn't apply in codeblocks.
function formatBold(editor) {
    editor = (editor && editor.markdownEditor) || codeEditor;
    doFormat(editor, "strong");
    editor.focus();
}
function formatItalic(editor) {
    editor = (editor && editor.markdownEditor) || codeEditor;
    doFormat(editor, "emph");
    editor.focus();
}
function formatCode(editor) {
    editor = (editor && editor.markdownEditor) || codeEditor;
    doFormat(editor, "code");
    editor.focus();
}
function formatHeader(editor, elem) {
    var level = (elem ? elem.level : 1) || 1;
    editor = (editor && editor.markdownEditor) || codeEditor;
    doLineFormat(editor, { type: "heading", level: level });
    editor.focus();
}
function formatList(editor) {
    editor = (editor && editor.markdownEditor) || codeEditor;
    doLineFormat(editor, { type: "item", _listData: { type: "bullet" } });
    editor.focus();
}
function formatCodeBlock(editor) {
    editor = (editor && editor.markdownEditor) || codeEditor;
    var cm = editor.editor;
    editor.finalizeLastHistoryEntry();
    cm.operation(function () {
        var cursor = cm.getCursor("from");
        var to = { line: cursor.line, ch: 0 };
        var text = cm.getLine(cursor.line);
        if (text !== "") {
            to.line += 1;
        }
        editor.mark({ line: cursor.line, ch: 0 }, to, { type: "code_block" });
        editor.finalizeLastHistoryEntry();
    });
    editor.focus();
}
function getMarksByType(editor, type, start, stop, inclusive) {
    var marks;
    if (start && stop && !samePos(start, stop)) {
        if (inclusive) {
            marks = editor.findMarks({ line: start.line, ch: start.ch - 1 }, { line: stop.line, ch: stop.ch + 1 });
        }
        else {
            marks = editor.findMarks(start, stop);
        }
    }
    else if (start) {
        marks = editor.findMarksAt(start);
    }
    else {
        marks = editor.getAllMarks();
    }
    var valid = [];
    for (var _i = 0, marks_8 = marks; _i < marks_8.length; _i++) {
        var mark = marks_8[_i];
        if (mark.span && mark.span.source.type === type) {
            valid.push(mark);
        }
    }
    return valid;
}
function splitMark(editor, mark, from, to) {
    if (!to)
        to = from;
    var loc = mark.find();
    var source = mark.source;
    var startMarker = editor.mark(loc.from, from, source);
    if (comparePos(to, loc.to) === -1) {
        var endMarker = editor.mark(to, loc.to, source);
    }
    mark.clear();
}
function isNewlineChange(change) {
    return change.text.length == 2 && change.text[1] == "";
}
function setKeyMap(event) {
    codeEditor.editor.setOption("keyMap", event.currentTarget.value);
}
exports.setKeyMap = setKeyMap;
function injectCodeMirror(node, elem) {
    if (!node.editor) {
        codeEditor = new MarkdownEditor(elem.value);
        exports.outline = new Outline(codeEditor);
        exports.comments = new Comments(codeEditor);
        var editor = codeEditor;
        node.editor = editor;
        node.appendChild(editor.dom());
        editor.refresh();
    }
}
function CodeMirrorNode(info) {
    info.postRender = injectCodeMirror;
    info.c = "cm-container";
    return info;
}
exports.CodeMirrorNode = CodeMirrorNode;
function toolbar() {
    var toolbar = { c: "md-toolbar", children: [
            { c: "bold", text: "B", click: formatBold },
            { c: "italic", text: "I", click: formatItalic },
            { c: "header", text: "H1", click: formatHeader },
            { c: "header", text: "H2", click: formatHeader, level: 2 },
            { c: "header", text: "H3", click: formatHeader, level: 3 },
            { c: "list", text: "List", click: formatList },
            { c: "inline-code", text: "Inline code", click: formatCode },
            { c: "code-block", text: "Code block", click: formatCodeBlock },
            { c: "run", text: "Run", click: compileAndRun },
        ] };
    return toolbar;
}
exports.toolbar = toolbar;
var Outline = (function () {
    function Outline(editor) {
        this.editor = editor;
        this.eliding = false;
    }
    Outline.prototype.gotoItem = function (event, elem) {
        var self = elem.outline;
        var editor = self.editor;
        var span = elem.span;
        var loc = span.find();
        if (loc) {
            if (self.eliding) {
                span.active = !span.active;
                editor.updateElisions();
            }
            else {
                var coords = editor.editor.charCoords(loc.from, "local");
                editor.editor.scrollTo(null, coords.top - 50);
                editor.focus();
            }
        }
        renderer_1.renderEve();
    };
    Outline.prototype.toggleEliding = function (event, elem) {
        var self = elem.outline;
        var editor = self.editor;
        self.eliding = !self.eliding;
        if (!self.eliding) {
            editor.clearElisions();
            var headings = editor.marksByType("heading");
            for (var _i = 0, headings_2 = headings; _i < headings_2.length; _i++) {
                var heading = headings_2[_i];
                heading.active = false;
            }
        }
        else {
        }
        renderer_1.renderEve();
    };
    Outline.prototype.render = function () {
        var contents = [];
        var cm = this.editor.editor;
        var headings = this.editor.marksByType("heading");
        headings.sort(function (a, b) {
            var locA = a.find().from;
            var locB = b.find().from;
            return comparePos(locA, locB);
        });
        for (var _i = 0, headings_3 = headings; _i < headings_3.length; _i++) {
            var heading = headings_3[_i];
            var loc = heading.find();
            var text = cm.getRange(loc.from, { line: loc.from.line + 1, ch: 0 });
            contents.push({ c: "heading heading-level-" + heading.source.level + " " + (heading.active ? "active" : ""), text: text, span: heading, outline: this, click: this.gotoItem });
        }
        return { c: "outline " + (this.eliding ? "eliding" : ""), children: [
                { c: "elide", text: "elide", click: this.toggleEliding, outline: this },
                { children: contents },
            ] };
    };
    return Outline;
}());
var Comments = (function () {
    function Comments(editor) {
        this.editor = editor;
    }
    Comments.prototype.render = function () {
        var editor = this.editor;
        var comments = [];
        var cm = editor.editor;
        var blocks = editor.marksByType("code_block");
        // let blocks = [];
        var scroll = cm.getScrollInfo();
        for (var _i = 0, blocks_1 = blocks; _i < blocks_1.length; _i++) {
            var block = blocks_1[_i];
            var loc = block.find();
            var coords = editor.editor.charCoords(loc.from || loc, "local");
            var text = "This line says I should search for a tag with the value \"session-connect\",\n        but since it's not in an object, I don't know what it applies to.\n\n        If you wrap it in square brackets, that tells me you're looking\n        for an object with that tag.";
            comments.push({ c: "comment", top: coords.top, width: 260, height: 20, text: text });
        }
        var height = scroll.top + editor.editor.charCoords({ line: editor.editor.lineCount() - 1, ch: 0 }).bottom;
        return { c: "comments", width: 290, children: comments, postRender: function (node) {
                document.querySelector(".CodeMirror-sizer").appendChild(node);
            } };
    };
    return Comments;
}());
function compileAndRun() {
    doSwap(codeEditor);
}
exports.compileAndRun = compileAndRun;
function applyFix(event, elem) {
    //we need to do the changes in reverse order to ensure
    //the positions remain the same?
    var changes = elem.fix.changes.slice();
    changes.sort(function (a, b) {
        var line = b.to.line - a.to.line;
        if (line == 0) {
            return b.to.offset - a.to.offset;
        }
        return line;
    });
    for (var _i = 0, changes_1 = changes; _i < changes_1.length; _i++) {
        var change = changes_1[_i];
        codeEditor.editor.replaceRange(change.value, { line: change.from.line - 1, ch: change.from.offset }, { line: change.to.line - 1, ch: change.to.offset });
    }
    doSwap(codeEditor);
}
exports.applyFix = applyFix;
//-----------------------------------------------------------------
// views
//-----------------------------------------------------------------
var ViewBar = (function () {
    function ViewBar() {
        this.dragging = false;
    }
    ViewBar.prototype.down = function (event, elem) {
        var self = elem.viewBar;
        self.dragging = true;
    };
    ViewBar.prototype.render = function () {
        var ghost;
        if (this.dragging) {
            ghost = { c: "view ghost" };
        }
        return { c: "view-bar", children: [
                { c: "view", mousedown: this.down, viewBar: this },
                ghost
            ] };
    };
    return ViewBar;
}());
window.addEventListener("mouseup", function (event) {
    if (exports.viewBar.dragging) {
        exports.viewBar.dragging = false;
        console.log("done dragging!");
    }
});
window.addEventListener("mousemove", function (event) {
    if (exports.viewBar.dragging) {
        console.log(event);
    }
});
exports.viewBar = new ViewBar();
//# sourceMappingURL=editor.js.map