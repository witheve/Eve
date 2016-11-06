"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var util_1 = require("../util");
function formattingChange(span, change, action) {
    var editor = span.editor;
    var loc = span.find();
    if (!loc)
        return;
    // Cut the changed range out of a span
    if (action == "split") {
        var final = change.final;
        editor.markSpan(loc.from, change.from, span.source);
        // If the change is within the right edge of the span, recreate the remaining segment
        if (util_1.comparePositions(final, loc.to) === -1) {
            editor.markSpan(final, loc.to, span.source);
        }
        span.clear();
    }
    else if (!action) {
        // If we're at the end of the span, expand it to include the change
        if (util_1.samePosition(loc.to, change.from)) {
            span.clear();
            editor.markSpan(loc.from, change.final, span.source);
        }
    }
}
function updateLineClasses(start, end, editor, _a) {
    var lineBackgroundClass = _a.lineBackgroundClass, lineTextClass = _a.lineTextClass;
    var cm = editor.cm;
    if (start === end) {
        var line = start;
        var info = cm.lineInfo(line);
        if (lineBackgroundClass && (!info || !info.bgClass || info.bgClass.indexOf(lineBackgroundClass) === -1)) {
            cm.addLineClass(line, "background", lineBackgroundClass);
        }
        if (lineTextClass && (!info || !info.textClass || info.textClass.indexOf(lineTextClass) === -1)) {
            cm.addLineClass(line, "text", lineTextClass);
        }
    }
    for (var line = start; line < end; line++) {
        var info = cm.lineInfo(line);
        if (lineBackgroundClass && (!info || !info.bgClass || info.bgClass.indexOf(lineBackgroundClass) === -1)) {
            cm.addLineClass(line, "background", lineBackgroundClass);
        }
        if (lineTextClass && (!info || !info.textClass || info.textClass.indexOf(lineTextClass) === -1)) {
            cm.addLineClass(line, "text", lineTextClass);
        }
    }
}
function clearLineClasses(start, end, editor, _a) {
    var lineBackgroundClass = _a.lineBackgroundClass, lineTextClass = _a.lineTextClass;
    var cm = editor.cm;
    if (start === end) {
        var line = start;
        if (lineBackgroundClass)
            cm.removeLineClass(line, "background", lineBackgroundClass);
        if (lineTextClass)
            cm.removeLineClass(line, "text", lineTextClass);
    }
    for (var line = start; line < end; line++) {
        if (lineBackgroundClass)
            cm.removeLineClass(line, "background", lineBackgroundClass);
        if (lineTextClass)
            cm.removeLineClass(line, "text", lineTextClass);
    }
}
function isSpanMarker(x) {
    return x && x["span"];
}
exports.isSpanMarker = isSpanMarker;
function isEditorControlled(type) {
    return exports.spanTypes[type] && exports.spanTypes[type]["_editorControlled"] || false;
}
exports.isEditorControlled = isEditorControlled;
function compareSpans(a, b) {
    var aLoc = a.find();
    var bLoc = b.find();
    if (!aLoc && !bLoc)
        return 0;
    if (!aLoc)
        return -1;
    if (!bLoc)
        return 1;
    if (aLoc.from.line === bLoc.from.line) {
        if (aLoc.from.ch === bLoc.from.ch)
            return 0;
        return aLoc.from.ch < bLoc.from.ch ? -1 : 1;
    }
    return aLoc.from.line < bLoc.from.line ? -1 : 1;
}
exports.compareSpans = compareSpans;
var Span = (function () {
    function Span(editor, from, to, source, origin) {
        if (origin === void 0) { origin = "+input"; }
        this.source = source;
        this._editorControlled = true;
        /** Whether the span is currently elided. */
        this.hidden = false;
        this._attributes = {};
        this.editor = editor;
        if (!source.type)
            throw new Error("Unable to initialize Span without a type.");
        this.type = source.type;
        this.id = this.type + "_" + Span._nextId++;
        this.apply(from, to, origin);
    }
    Span.prototype.apply = function (from, to, origin) {
        if (origin === void 0) { origin = "+input"; }
        if (this.marker) {
            var loc = this.find();
            if (!loc || !util_1.samePosition(from, loc.from) || !util_1.samePosition(to, loc.to)) {
                this.marker.clear();
                this.marker = this.marker.span = undefined;
            }
            else {
                // Nothing has changed.
                return;
            }
        }
        this._attributes.className = this._attributes.className || this.type;
        var doc = this.editor.cm.getDoc();
        if (util_1.samePosition(from, to)) {
            this.marker = doc.setBookmark(from, this._attributes);
        }
        else {
            this.marker = doc.markText(from, to, this._attributes);
        }
        this.marker.span = this;
        if (this.refresh)
            this.refresh();
        if (this.isEditorControlled()) {
            var spanRange = this.spanRange();
            if (spanRange) {
                this.editor.addToHistory(new SpanChange([spanRange], [], origin));
            }
        }
    };
    Span.prototype.clear = function (origin) {
        if (origin === void 0) { origin = "+delete"; }
        if (!this.marker)
            return;
        var loc = this.find();
        if (this.isEditorControlled()) {
            var spanRange = this.spanRange();
            if (spanRange) {
                this.editor.addToHistory(new SpanChange([], [spanRange], origin));
            }
        }
        this.marker.clear();
        this.marker = this.marker.span = undefined;
        this.editor.queueUpdate();
    };
    Span.prototype.find = function () {
        if (!this.marker)
            return undefined;
        var loc = this.marker.find();
        if (!loc)
            return;
        if (util_1.isRange(loc))
            return loc;
        return { from: loc, to: loc };
    };
    Span.prototype.spanRange = function () {
        var loc = this.find();
        if (!loc)
            return;
        return { from: loc.from, to: loc.to, span: this };
    };
    Span.prototype.hide = function () {
        if (!this.hidden) {
            this.hidden = true;
            if (this.refresh)
                this.refresh();
        }
    };
    Span.prototype.unhide = function () {
        if (this.hidden) {
            this.hidden = false;
            if (this.refresh)
                this.refresh();
        }
    };
    Span.prototype.isHidden = function () {
        return this.hidden;
    };
    Span.prototype.sourceEquals = function (other) {
        return this.source.type = other.type;
    };
    Span.prototype.isInline = function () {
        return this._spanStyle == "inline";
    };
    Span.prototype.isLine = function () {
        return this._spanStyle == "line";
    };
    Span.prototype.isBlock = function () {
        return this._spanStyle == "block";
    };
    Span.prototype.isEditorControlled = function () {
        return this._editorControlled;
    };
    Span.style = function () {
        return this._spanStyle;
    };
    Span._nextId = 0;
    Span._editorControlled = true;
    return Span;
}());
exports.Span = Span;
var InlineSpan = (function (_super) {
    __extends(InlineSpan, _super);
    function InlineSpan() {
        _super.apply(this, arguments);
        this._spanStyle = "inline";
    }
    InlineSpan.prototype.apply = function (from, to, origin) {
        if (origin === void 0) { origin = "+input"; }
        if (util_1.samePosition(from, to))
            throw new Error("Unable to create zero-width InlineSpan. Maybe you meant to use LineSpan?");
        _super.prototype.apply.call(this, from, to, origin);
    };
    // Handlers
    InlineSpan.prototype.onChange = function (change) {
        var loc = this.find();
        if (!loc)
            return;
        var intersecting = this.editor.findSpansAt(loc.from);
        for (var _i = 0, intersecting_1 = intersecting; _i < intersecting_1.length; _i++) {
            var span = intersecting_1[_i];
            // If the space between this span and a preceding inline span is removed
            // delete this span and extend that one to contain it.
            if (span.isInline() && span.isEditorControlled()) {
                var otherLoc = span.find();
                if (!otherLoc)
                    continue;
                // If this is another span on the same word, ignore it.
                if (util_1.samePosition(otherLoc.to, loc.to))
                    continue;
                this.clear();
                span.clear();
                this.editor.markSpan(otherLoc.from, loc.to, span.source);
                return;
            }
        }
        if (change.origin === "+input") {
            var action = this.editor.formatting[this.type];
            formattingChange(this, change, action);
        }
    };
    InlineSpan.prototype.isDenormalized = function () {
        var loc = this.find();
        if (!loc)
            return;
        var doc = this.editor.cm.getDoc();
        var fromLine = doc.getLine(loc.from.line);
        var toLine = doc.getLine(loc.to.line);
        // Inline spans may not have internal leading or trailing whitespace.
        if (loc.from.ch < fromLine.length && fromLine[loc.from.ch].search(/\s/) === 0)
            return true;
        if (loc.to.ch - 1 < toLine.length && loc.to.ch - 1 >= 0 && toLine[loc.to.ch - 1].search(/\s/) === 0)
            return true;
    };
    InlineSpan.prototype.normalize = function () {
        var loc = this.find();
        if (!loc)
            return this.clear();
        var doc = this.editor.cm.getDoc();
        var cur = doc.getRange(loc.from, loc.to);
        // Remove leading and trailing whitespace.
        // Because trimLeft/Right aren't standard, we kludge a bit.
        var adjustLeft = cur.length - (cur + "|").trim().length + 1;
        var adjustRight = cur.length - ("|" + cur).trim().length + 1;
        var from = { line: loc.from.line, ch: loc.from.ch + adjustLeft };
        var to = { line: loc.to.line, ch: loc.to.ch - adjustRight };
        this.clear("+normalize");
        this.editor.markSpan(from, to, this.source);
    };
    InlineSpan._spanStyle = "inline";
    return InlineSpan;
}(Span));
exports.InlineSpan = InlineSpan;
var LineSpan = (function (_super) {
    __extends(LineSpan, _super);
    function LineSpan() {
        _super.apply(this, arguments);
        this._spanStyle = "line";
    }
    LineSpan.prototype.apply = function (from, to, origin) {
        if (origin === void 0) { origin = "+input"; }
        if (!util_1.samePosition(from, to))
            throw new Error("Unable to create non-zero-width LineSpan. Maybe you meant to use BlockSpan?");
        if (from.ch !== 0)
            throw new Error("Unable to create LineSpan in middle of line at (" + from.line + ", " + from.ch + ")");
        _super.prototype.apply.call(this, from, to, origin);
    };
    LineSpan.prototype.clear = function (origin) {
        if (origin === void 0) { origin = "+delete"; }
        if (!this.marker)
            return;
        // If the line is still in the document, clear its classes.
        var loc = this.find();
        if (loc) {
            var end = loc.to.line + ((loc.from.line === loc.to.line) ? 1 : 0);
            clearLineClasses(loc.from.line, end, this.editor, this);
        }
        _super.prototype.clear.call(this, origin);
    };
    // Handlers
    LineSpan.prototype.refresh = function () {
        var loc = this.find();
        if (!loc)
            return;
        var end = loc.to.line + ((loc.from.line === loc.to.line) ? 1 : 0);
        if (!this.hidden) {
            updateLineClasses(loc.from.line, end, this.editor, this);
        }
        else {
            clearLineClasses(loc.from.line, end, this.editor, this);
        }
    };
    LineSpan.prototype.onBeforeChange = function (change) {
        var loc = this.find();
        if (!loc)
            return;
        var doc = this.editor.cm.getDoc();
        var isEmpty = doc.getLine(loc.from.line) === "";
        //If we're at the beginning of an empty line and delete we mean to remove the span.
        if (util_1.samePosition(loc.from, change.to) && isEmpty && change.origin === "+delete") {
            this.clear();
            change.cancel();
        }
        else if (util_1.samePosition(loc.from, change.to) &&
            doc.getLine(change.from.line) !== "" &&
            change.origin === "+delete") {
            this.clear();
            change.cancel();
        }
        else if (util_1.samePosition(loc.from, change.from) && change.isNewlineChange() && isEmpty) {
            this.clear();
            change.cancel();
        }
    };
    LineSpan.prototype.onChange = function (change) {
        var loc = this.find();
        if (!loc)
            return;
        // If we're normalizing to put some space between the line and another span, make sure the span tracks its content.
        if (change.origin === "+normalize" && util_1.samePosition(loc.from, change.from) && util_1.samePosition(loc.from, change.to)) {
            this.editor.markSpan(change.final, change.final, this.source);
            this.clear();
        }
    };
    LineSpan.prototype.isDenormalized = function () {
        // Line spans may not have leading or trailing whitespace.
        var loc = this.find();
        if (!loc)
            return;
        var doc = this.editor.cm.getDoc();
        var line = doc.getLine(loc.from.line);
        if (!line)
            return;
        if (line[0].search(/\s/) === 0 || line[line.length - 1].search(/\s/) === 0)
            return true;
    };
    LineSpan.prototype.normalize = function () {
        var loc = this.find();
        if (!loc)
            return this.clear();
        var doc = this.editor.cm.getDoc();
        var to = doc.posFromIndex(doc.indexFromPos({ line: loc.to.line + 1, ch: 0 }) - 1);
        var cur = doc.getRange(loc.from, to);
        doc.replaceRange(cur.trim(), loc.from, to, "+normalize");
    };
    LineSpan._spanStyle = "line";
    return LineSpan;
}(Span));
exports.LineSpan = LineSpan;
var BlockSpan = (function (_super) {
    __extends(BlockSpan, _super);
    function BlockSpan() {
        _super.apply(this, arguments);
        this._spanStyle = "block";
    }
    BlockSpan.prototype.apply = function (from, to, origin) {
        if (origin === void 0) { origin = "+input"; }
        if (util_1.samePosition(from, to))
            throw new Error("Unable to create zero-width BlockSpan. Maybe you meant to use LineSpan?");
        if (from.ch !== 0)
            throw new Error("Unable to create BlockSpan starting in middle of line at (" + from.line + ", " + from.ch + ")");
        if (to.ch !== 0)
            throw new Error("Unable to create BlockSpan ending in middle of line at (" + to.line + ", " + to.ch + ")");
        _super.prototype.apply.call(this, from, to, origin);
    };
    BlockSpan.prototype.clear = function (origin) {
        if (origin === void 0) { origin = "+delete"; }
        if (!this.marker)
            return;
        // If the line is still in the document, clear its classes.
        var loc = this.find();
        if (loc) {
            clearLineClasses(loc.from.line, loc.to.line, this.editor, this);
        }
        _super.prototype.clear.call(this, origin);
    };
    BlockSpan.prototype.refresh = function () {
        var loc = this.find();
        if (!loc)
            return;
        if (!this.hidden) {
            updateLineClasses(loc.from.line, loc.to.line, this.editor, this);
        }
        else {
            clearLineClasses(loc.from.line, loc.to.line, this.editor, this);
        }
    };
    BlockSpan.prototype.onBeforeChange = function (change) {
        var loc = this.find();
        if (!loc)
            return;
        var doc = this.editor.cm.getDoc();
        var isEmpty = doc.getLine(loc.from.line) === "";
        //If we're at the beginning of an empty block and delete we mean to remove the span.
        if (util_1.samePosition(loc.from, change.to) && isEmpty && change.origin === "+delete") {
            this.clear();
            change.cancel();
        }
    };
    BlockSpan.prototype.onChange = function (change) {
        var loc = this.find();
        if (!loc)
            return;
        // Absorb local changes around a block.
        var from = { line: loc.from.line, ch: 0 };
        var to = { line: loc.to.line, ch: 0 };
        if (loc.to.ch !== 0) {
            to.line += 1;
        }
        // If new text has been inserted left of the block, absorb it
        // If the block's end has been removed, re-align it to the beginning of the next line.
        if (util_1.comparePositions(change.final, change.to) >= 0) {
            from.line = Math.min(loc.from.line, change.from.line);
            to.line = Math.max(loc.to.line, change.to.line);
            if (to.line === change.to.line && change.to.ch !== 0) {
                to.line += 1;
            }
        }
        if (!util_1.samePosition(from, loc.from) || !util_1.samePosition(to, loc.to)) {
            this.clear();
            this.editor.markSpan(from, to, this.source);
        }
    };
    BlockSpan._spanStyle = "block";
    return BlockSpan;
}(Span));
exports.BlockSpan = BlockSpan;
var ListItemSpan = (function (_super) {
    __extends(ListItemSpan, _super);
    function ListItemSpan() {
        _super.apply(this, arguments);
    }
    ListItemSpan.prototype.apply = function (from, to, origin) {
        if (origin === void 0) { origin = "+input"; }
        var source = this.source;
        source.listData = source.listData || { type: "bullet" };
        source.level = source.level || 1;
        if (!this.bulletElem) {
            this.bulletElem = document.createElement("span");
        }
        this.bulletElem.style.paddingRight = "" + 10;
        this.bulletElem.style.paddingLeft = "" + (20 * (source.level - 1));
        this._attributes.widget = this.bulletElem;
        if (source.listData.type === "bullet") {
            this.bulletElem.textContent = "-";
        }
        else {
            this.bulletElem.textContent = (source.listData.start !== undefined ? source.listData.start : 1) + ".";
        }
        this.lineTextClass = "ITEM " + this.source.listData.type + " level-" + this.source.level + " start-" + this.source.listData.start;
        _super.prototype.apply.call(this, from, to, origin);
    };
    ListItemSpan.prototype.onChange = function (change) {
        var loc = this.find();
        if (!loc)
            return;
        // If enter is pressed, continue the list
        if (loc.from.line === change.from.line && change.isNewlineChange()) {
            var next = change.final;
            var src = this.source;
            var ix = src.listData.start !== undefined ? src.listData.start + 1 : undefined;
            var newSource = { type: src.type, level: src.level, listData: { type: src.listData.type, start: ix } };
            this.editor.markSpan(next, next, newSource);
        }
    };
    return ListItemSpan;
}(LineSpan));
var HeadingSpan = (function (_super) {
    __extends(HeadingSpan, _super);
    function HeadingSpan() {
        _super.apply(this, arguments);
    }
    HeadingSpan.prototype.apply = function (from, to, origin) {
        if (origin === void 0) { origin = "+input"; }
        this.source.level = this.source.level || 1;
        var cls = "HEADING" + this.source.level;
        this.lineTextClass = cls;
        this.lineBackgroundClass = cls;
        _super.prototype.apply.call(this, from, to, origin);
        this.editor.ide.navigator.updateNode(this);
    };
    HeadingSpan.prototype.clear = function (origin) {
        if (origin === void 0) { origin = "+delete"; }
        _super.prototype.clear.call(this, origin);
        this.editor.ide.navigator.updateNode(this);
    };
    HeadingSpan.prototype.refresh = function () {
        _super.prototype.refresh.call(this);
        this.editor.ide.navigator.updateNode(this);
    };
    HeadingSpan.prototype.getSectionRange = function () {
        var loc = this.find();
        if (!loc)
            return;
        var from = { line: loc.from.line + 1, ch: 0 };
        var to = { line: this.editor.cm.getDoc().lastLine() + 1, ch: 0 };
        var headings = this.editor.findSpans(from, to, "heading");
        if (headings.length) {
            headings.sort(compareSpans);
            var nextIx = 0;
            var next = headings[nextIx++];
            while (next && next.source.level > this.source.level) {
                next = headings[nextIx++];
            }
            if (next) {
                var nextLoc = next.find();
                if (nextLoc)
                    return { from: loc.from, to: nextLoc.from };
            }
        }
        return { from: loc.from, to: { line: to.line - 1, ch: 0 } };
    };
    return HeadingSpan;
}(LineSpan));
exports.HeadingSpan = HeadingSpan;
var ElisionSpan = (function (_super) {
    __extends(ElisionSpan, _super);
    function ElisionSpan() {
        _super.apply(this, arguments);
    }
    ElisionSpan.prototype.apply = function (from, to, origin) {
        if (origin === void 0) { origin = "+input"; }
        this.lineBackgroundClass = "elision";
        this.element = document.createElement("div");
        this.element.className = "elision-marker";
        this._attributes.replacedWith = this.element;
        if (from.ch !== 0)
            from = { line: from.line, ch: 0 };
        if (to.ch !== 0)
            to = { line: to.line, ch: 0 };
        _super.prototype.apply.call(this, from, to, origin);
        var doc = this.editor.cm.getDoc();
        for (var _i = 0, _a = this.editor.findSpansAt(from).concat(this.editor.findSpans(from, to)); _i < _a.length; _i++) {
            var span = _a[_i];
            if (span === this)
                continue;
            span.hide();
        }
    };
    ElisionSpan.prototype.clear = function (origin) {
        if (origin === void 0) { origin = "+delete"; }
        var loc = this.find();
        _super.prototype.clear.call(this, origin);
        if (loc) {
            for (var _i = 0, _a = this.editor.findSpansAt(loc.from).concat(this.editor.findSpans(loc.from, loc.to)); _i < _a.length; _i++) {
                var span = _a[_i];
                if (span === this)
                    continue;
                span.unhide();
            }
        }
    };
    return ElisionSpan;
}(BlockSpan));
var CodeBlockSpan = (function (_super) {
    __extends(CodeBlockSpan, _super);
    function CodeBlockSpan() {
        _super.apply(this, arguments);
    }
    CodeBlockSpan.prototype.apply = function (from, to, origin) {
        if (origin === void 0) { origin = "+input"; }
        this.lineBackgroundClass = "code";
        this.lineTextClass = "code-text";
        if (this.source.disabled)
            this.disabled = this.source.disabled;
        else
            this.disabled = false;
        _super.prototype.apply.call(this, from, to, origin);
        if (!this.widget)
            this.createWidgets();
    };
    CodeBlockSpan.prototype.clear = function (origin) {
        if (origin === void 0) { origin = "+delete"; }
        this.clearWidgets();
        var loc = this.find();
        _super.prototype.clear.call(this, origin);
        // Nuke all parser spans that were in this range.
        // Since the parser isn't stateful, it won't send us removals for them.
        if (loc) {
            for (var _i = 0, _a = this.editor.findSpans(loc.from, loc.to); _i < _a.length; _i++) {
                var span = _a[_i];
                if (span.isEditorControlled())
                    continue;
                span.clear();
            }
        }
    };
    CodeBlockSpan.prototype.refresh = function () {
        _super.prototype.refresh.call(this);
        this.updateWidgets();
    };
    CodeBlockSpan.prototype.disable = function () {
        if (!this.disabled) {
            this.source.info = "eve disabled";
            // @FIXME: We don't currently style this because of a bug in updateLineClasses.
            // It's unable to intelligently remove unsupported classes, so we'd have to manually clear line classes.
            // We can come back to this later if we care.
            // this.lineBackgroundClass = "code code-disabled";
            // this.lineTextClass = "code-text code-disabled";
            this.disabled = true;
            this.refresh();
            this.editor.dirty = true;
            this.editor.queueUpdate(true);
        }
    };
    CodeBlockSpan.prototype.enable = function () {
        if (this.disabled) {
            this.source.info = "eve";
            this.disabled = false;
            this.refresh();
            this.editor.dirty = true;
            this.editor.queueUpdate(true);
        }
    };
    CodeBlockSpan.prototype.isDisabled = function () {
        return this.disabled;
    };
    CodeBlockSpan.prototype.createWidgets = function () {
        var _this = this;
        if (this.widget)
            this.widget.clear();
        if (this.footerWidget)
            this.footerWidget.clear();
        this.widgetElem = document.createElement("div");
        this.widgetElem.className = "code-controls-widget";
        this.enableToggleElem = document.createElement("div");
        this.enableToggleElem.classList.add("enable-btn");
        this.enableToggleElem.onclick = function () {
            if (_this.disabled)
                _this.enable();
            else
                _this.disable();
        };
        this.widgetElem.appendChild(this.enableToggleElem);
        this.footerWidgetElem = document.createElement("div");
        this.footerWidgetElem.className = "code-footer-widget";
        this.updateWidgets();
    };
    CodeBlockSpan.prototype.clearWidgets = function () {
        this.widget.clear();
        this.footerWidget.clear();
        this.widget = this.widgetElem = this.widgetLine = undefined;
        this.footerWidget = this.footerWidgetElem = this.footerWidgetLine = undefined;
    };
    CodeBlockSpan.prototype.updateWidgets = function () {
        if (!this.widgetElem)
            return;
        if (this.disabled) {
            this.enableToggleElem.classList.remove("ion-android-checkbox-outline");
            this.enableToggleElem.classList.add("disabled", "ion-android-checkbox-outline-blank");
        }
        else {
            this.enableToggleElem.classList.remove("disabled", "ion-android-checkbox-outline-blank");
            this.enableToggleElem.classList.add("ion-android-checkbox-outline");
        }
        var loc = this.find();
        if (loc) {
            if (this.widgetLine !== loc.from.line) {
                this.widgetLine = loc.from.line;
                if (this.widget)
                    this.widget.clear();
                this.widget = this.editor.cm.addLineWidget(this.widgetLine, this.widgetElem, { above: true });
            }
            if (this.footerWidgetLine !== loc.to.line - 1) {
                this.footerWidgetLine = loc.to.line - 1;
                if (this.footerWidget)
                    this.footerWidget.clear();
                this.footerWidget = this.editor.cm.addLineWidget(this.footerWidgetLine, this.footerWidgetElem);
            }
        }
    };
    return CodeBlockSpan;
}(BlockSpan));
exports.CodeBlockSpan = CodeBlockSpan;
var WhitespaceSpan = (function (_super) {
    __extends(WhitespaceSpan, _super);
    function WhitespaceSpan() {
        _super.apply(this, arguments);
    }
    WhitespaceSpan.prototype.normalize = function () {
        _super.prototype.normalize.call(this);
        this.clear();
    };
    return WhitespaceSpan;
}(LineSpan));
var BlockAnnotationSpan = (function (_super) {
    __extends(BlockAnnotationSpan, _super);
    function BlockAnnotationSpan() {
        _super.apply(this, arguments);
    }
    BlockAnnotationSpan.prototype.apply = function (from, to, origin) {
        if (origin === void 0) { origin = "+input"; }
        this.lineBackgroundClass = "annotated annotated_" + this.source.kind;
        this._attributes.className = null;
        _super.prototype.apply.call(this, from, to, origin);
    };
    BlockAnnotationSpan.prototype.clear = function (origin) {
        if (origin === void 0) { origin = "+delete"; }
        if (this.annotation) {
            this.annotation.clear();
            this.annotation = undefined;
        }
        if (!this.marker)
            return;
        var loc = this.find();
        if (loc) {
            clearLineClasses(loc.from.line, loc.to.line, this.editor, this);
        }
        _super.prototype.clear.call(this, origin);
    };
    BlockAnnotationSpan.prototype.refresh = function () {
        var loc = this.find();
        if (!loc)
            return this.clear();
        if (!this.annotation) {
            this.annotation = this.editor.cm.annotateScrollbar({ className: "scrollbar-annotation " + this.source.kind });
        }
        if (loc) {
            this.annotation.update([loc]);
            if (!this.hidden) {
                updateLineClasses(loc.from.line, loc.to.line, this.editor, this);
            }
            else {
                clearLineClasses(loc.from.line, loc.to.line, this.editor, this);
            }
        }
    };
    return BlockAnnotationSpan;
}(BlockSpan));
exports.BlockAnnotationSpan = BlockAnnotationSpan;
var AnnotationSpan = (function (_super) {
    __extends(AnnotationSpan, _super);
    function AnnotationSpan() {
        _super.apply(this, arguments);
    }
    AnnotationSpan.prototype.apply = function (from, to, origin) {
        if (origin === void 0) { origin = "+input"; }
        this.lineBackgroundClass = "annotated annotated_" + this.source.kind;
        this._attributes.className = null;
        _super.prototype.apply.call(this, from, to, origin);
    };
    AnnotationSpan.prototype.clear = function (origin) {
        if (origin === void 0) { origin = "+delete"; }
        if (this.annotation) {
            this.annotation.clear();
            this.annotation = undefined;
        }
        if (!this.marker)
            return;
        var loc = this.find();
        if (loc) {
            clearLineClasses(loc.from.line, loc.to.line, this.editor, this);
        }
        _super.prototype.clear.call(this, origin);
    };
    AnnotationSpan.prototype.refresh = function () {
        var loc = this.find();
        if (!loc)
            return this.clear();
        if (!this.annotation) {
            this.annotation = this.editor.cm.annotateScrollbar({ className: "scrollbar-annotation " + this.source.kind });
        }
        if (loc) {
            this.annotation.update([loc]);
            if (!this.hidden) {
                updateLineClasses(loc.from.line, loc.to.line, this.editor, this);
            }
            else {
                clearLineClasses(loc.from.line, loc.to.line, this.editor, this);
            }
        }
    };
    return AnnotationSpan;
}(Span));
exports.AnnotationSpan = AnnotationSpan;
var ParserSpan = (function (_super) {
    __extends(ParserSpan, _super);
    function ParserSpan() {
        _super.apply(this, arguments);
        this._editorControlled = false;
        this._spanStyle = "inline";
    }
    ParserSpan._editorControlled = false;
    ParserSpan._spanStyle = "inline";
    return ParserSpan;
}(Span));
exports.ParserSpan = ParserSpan;
var DocumentCommentSpan = (function (_super) {
    __extends(DocumentCommentSpan, _super);
    function DocumentCommentSpan() {
        _super.apply(this, arguments);
    }
    DocumentCommentSpan.prototype.apply = function (from, to, origin) {
        if (origin === void 0) { origin = "+input"; }
        this.lineBackgroundClass = "COMMENT_" + this.kind;
        this._attributes.className = this.type + " " + this.kind;
        if (!this.commentElem) {
            this.commentElem = document.createElement("div");
        }
        this.commentElem.className = "comment-widget" + " " + this.kind;
        if (this.editor.inCodeBlock(to)) {
            this.commentElem.className += " code-comment-widget";
        }
        if (this.source.delay) {
            this["updateWidget"] = util_1.debounce(this.updateWidget, this.source.delay);
        }
        _super.prototype.apply.call(this, from, to, origin);
    };
    DocumentCommentSpan.prototype.clear = function (origin) {
        if (origin === void 0) { origin = "+delete"; }
        if (!this.marker)
            return;
        // If the line is still in the document, clear its classes.
        var loc = this.find();
        if (loc) {
            clearLineClasses(loc.from.line, loc.to.line, this.editor, this);
        }
        _super.prototype.clear.call(this, origin);
        if (this.annotation) {
            this.annotation.clear();
            this.annotation = undefined;
        }
        if (this.commentWidget) {
            this.commentWidget.clear();
            this.commentElem.textContent = "";
        }
    };
    DocumentCommentSpan.prototype.refresh = function () {
        var loc = this.find();
        if (!loc)
            return this.clear();
        if (!this.annotation) {
            this.annotation = this.editor.cm.annotateScrollbar({ className: "scrollbar-annotation " + this.kind });
        }
        if (loc) {
            this.annotation.update([loc]);
            if (!this.hidden) {
                updateLineClasses(loc.from.line, loc.to.line, this.editor, this);
            }
            else {
                clearLineClasses(loc.from.line, loc.to.line, this.editor, this);
            }
            if (loc.to.line !== this.widgetLine) {
                this.widgetLine = loc.to.line;
                if (this.commentWidget)
                    this.commentWidget.clear();
                this.updateWidget();
            }
        }
    };
    DocumentCommentSpan.prototype.updateWidget = function () {
        if (this.commentWidget)
            this.commentWidget.clear();
        var loc = this.find();
        if (!loc)
            return;
        this.widgetLine = loc.to.line;
        this.commentElem.textContent = this.message;
        this.commentWidget = this.editor.cm.addLineWidget(this.widgetLine, this.commentElem);
    };
    Object.defineProperty(DocumentCommentSpan.prototype, "kind", {
        get: function () { return this.source.kind || "error"; },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(DocumentCommentSpan.prototype, "message", {
        get: function () { return this.source.message; },
        enumerable: true,
        configurable: true
    });
    return DocumentCommentSpan;
}(ParserSpan));
exports.DocumentCommentSpan = DocumentCommentSpan;
var DocumentWidgetSpan = (function (_super) {
    __extends(DocumentWidgetSpan, _super);
    function DocumentWidgetSpan() {
        _super.apply(this, arguments);
    }
    DocumentWidgetSpan.prototype.apply = function (from, to, origin) {
        if (origin === void 0) { origin = "+input"; }
        this.lineBackgroundClass = "COMMENT_" + this.kind;
        this._attributes.className = this.type + " " + this.kind;
        if (!this.commentElem) {
            this.commentElem = document.createElement("div");
        }
        this.commentElem.className = "comment-widget" + " " + this.kind;
        if (this.editor.inCodeBlock(to)) {
            this.commentElem.className += " code-comment-widget";
        }
        if (this.source.delay) {
            this["updateWidget"] = util_1.debounce(this.updateWidget, this.source.delay);
        }
        _super.prototype.apply.call(this, from, to, origin);
    };
    DocumentWidgetSpan.prototype.clear = function (origin) {
        if (origin === void 0) { origin = "+delete"; }
        if (!this.marker)
            return;
        // If the line is still in the document, clear its classes.
        var loc = this.find();
        if (loc) {
            clearLineClasses(loc.from.line, loc.to.line, this.editor, this);
        }
        _super.prototype.clear.call(this, origin);
        if (this.commentWidget) {
            this.commentWidget.clear();
            this.commentElem.textContent = "";
        }
    };
    DocumentWidgetSpan.prototype.refresh = function () {
        var loc = this.find();
        if (!loc)
            return this.clear();
        if (loc) {
            if (!this.hidden) {
                updateLineClasses(loc.from.line, loc.to.line, this.editor, this);
            }
            else {
                clearLineClasses(loc.from.line, loc.to.line, this.editor, this);
            }
            if (loc.to.line !== this.widgetLine) {
                this.widgetLine = loc.to.line;
                if (this.commentWidget)
                    this.commentWidget.clear();
                this.updateWidget();
            }
        }
    };
    DocumentWidgetSpan.prototype.updateWidget = function () {
        if (this.commentWidget)
            this.commentWidget.clear();
        var loc = this.find();
        if (!loc)
            return;
        this.widgetLine = loc.to.line;
        this.commentElem.textContent = this.message;
        this.commentWidget = this.editor.cm.addLineWidget(this.widgetLine, this.commentElem);
    };
    Object.defineProperty(DocumentWidgetSpan.prototype, "kind", {
        get: function () { return this.source.kind || "error"; },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(DocumentWidgetSpan.prototype, "message", {
        get: function () { return this.source.message; },
        enumerable: true,
        configurable: true
    });
    return DocumentWidgetSpan;
}(ParserSpan));
exports.DocumentWidgetSpan = DocumentWidgetSpan;
var BadgeSpan = (function (_super) {
    __extends(BadgeSpan, _super);
    function BadgeSpan() {
        _super.apply(this, arguments);
    }
    BadgeSpan.prototype.apply = function (from, to, origin) {
        if (origin === void 0) { origin = "+input"; }
        this._attributes.className = "badge " + (this.source.kind || "");
        if (!this.badgeElem) {
            this.badgeElem = document.createElement("div");
            this.badgeElem.className = "badge-widget " + (this.source.kind || "");
        }
        this.badgeElem.textContent = this.source.message;
        _super.prototype.apply.call(this, from, to, origin);
        var doc = this.editor.cm.getDoc();
        this.badgeMarker = doc.setBookmark(to, { widget: this.badgeElem });
        this.badgeMarker.span = this;
    };
    BadgeSpan.prototype.clear = function (origin) {
        if (origin === void 0) { origin = "+delete"; }
        _super.prototype.clear.call(this, origin);
        if (this.badgeMarker)
            this.badgeMarker.clear();
        if (this.badgeElem && this.badgeElem.parentNode) {
            this.badgeElem.parentNode.removeChild(this.badgeElem);
        }
        this.badgeElem = undefined;
    };
    return BadgeSpan;
}(ParserSpan));
var LinkSpan = (function (_super) {
    __extends(LinkSpan, _super);
    function LinkSpan() {
        _super.apply(this, arguments);
    }
    LinkSpan.prototype.apply = function (from, to, origin) {
        if (origin === void 0) { origin = "+input"; }
        if (this.bookmark)
            this.bookmark.clear();
        this.linkWidget = document.createElement("a");
        this.linkWidget.className = "ion-android-open link-widget";
        this.linkWidget.target = "_blank";
        this.linkWidget.href = this.source.destination;
        this.updateBookmark();
        _super.prototype.apply.call(this, from, to, origin);
    };
    LinkSpan.prototype.refresh = function () {
        this.updateBookmark();
    };
    LinkSpan.prototype.updateBookmark = function () {
        var loc = this.find();
        if (!loc)
            return;
        var to = { line: loc.to.line, ch: loc.to.ch + 1 };
        if (!this.bookmark) {
            this.bookmark = this.editor.cm.getDoc().setBookmark(to, { widget: this.linkWidget });
        }
        else {
            var bookmarkPos = this.bookmark.find();
            if (!loc || !bookmarkPos)
                return;
            if (!util_1.samePosition(bookmarkPos, to)) {
                this.bookmark.clear();
                this.bookmark = this.editor.cm.getDoc().setBookmark(to, { widget: this.linkWidget });
            }
        }
    };
    LinkSpan.prototype.clear = function (origin) {
        if (origin === void 0) { origin = "+delete"; }
        _super.prototype.clear.call(this, origin);
        if (this.bookmark)
            this.bookmark.clear();
    };
    return LinkSpan;
}(InlineSpan));
exports.spanTypes = {
    whitespace: WhitespaceSpan,
    strong: InlineSpan,
    emph: InlineSpan,
    code: InlineSpan,
    link: LinkSpan,
    heading: HeadingSpan,
    item: ListItemSpan,
    elision: ElisionSpan,
    elision_transient: ElisionSpan,
    highlight: InlineSpan,
    shadow: InlineSpan,
    code_block: CodeBlockSpan,
    document_comment: DocumentCommentSpan,
    document_widget: DocumentWidgetSpan,
    annotation: AnnotationSpan,
    block_annotation: BlockAnnotationSpan,
    badge: BadgeSpan,
    "default": ParserSpan
};
var SpanChange = (function () {
    function SpanChange(added, removed, origin) {
        if (added === void 0) { added = []; }
        if (removed === void 0) { removed = []; }
        if (origin === void 0) { origin = "+input"; }
        this.added = added;
        this.removed = removed;
        this.origin = origin;
        this.type = "span";
    }
    /** Inverts a change for undo. */
    SpanChange.prototype.invert = function () { return new SpanChange(this.removed, this.added, this.origin); };
    return SpanChange;
}());
exports.SpanChange = SpanChange;
function isSpanChange(x) {
    return x && x.type === "span";
}
exports.isSpanChange = isSpanChange;
//# sourceMappingURL=spans.js.map