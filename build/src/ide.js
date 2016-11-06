"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var microReact_1 = require("microReact");
var commonmark_1 = require("commonmark");
var CodeMirror = require("codemirror");
var util_1 = require("./util");
var spans_1 = require("./ide/spans");
var Spans = require("./ide/spans");
var renderer_1 = require("./renderer");
var client_1 = require("./client");
var Navigator = (function () {
    function Navigator(ide, rootId, nodes, currentId) {
        var _this = this;
        if (rootId === void 0) { rootId = "root"; }
        if (nodes === void 0) { nodes = { root: { type: "folder", name: "/", children: [] } }; }
        if (currentId === void 0) { currentId = rootId; }
        this.ide = ide;
        this.rootId = rootId;
        this.nodes = nodes;
        this.currentId = currentId;
        this.labels = {
            folder: "Workspace",
            document: "Table of Contents"
        };
        this.open = true;
        // Event Handlers
        this.togglePane = function (event, elem) {
            _this.open = !_this.open;
            _this.ide.render();
            event.stopPropagation();
        };
        this.navigate = function (event, elem) {
            _this.currentId = elem.nodeId || _this.rootId;
            var node = _this.nodes[elem.nodeId];
            if (node && node.type === "document") {
                _this.ide.loadFile(elem.nodeId);
            }
            _this.ide.render();
        };
        this.toggleBranch = function (event, _a) {
            var nodeId = _a.nodeId;
            var node = _this.nodes[nodeId];
            if (!node)
                return;
            node.open = !node.open;
            _this.ide.render();
            event.stopPropagation();
        };
        this.gotoSpan = function (event, _a) {
            var nodeId = _a.nodeId;
            var node = _this.nodes[nodeId];
            if (!node)
                return;
            var loc = node.span.find();
            if (!loc)
                return;
            if (node.span.constructor === spans_1.HeadingSpan) {
                var heading = node.span;
                loc = heading.getSectionRange() || loc;
            }
            _this.ide.editor.cm.scrollIntoView(loc, 20);
        };
        this._inheritParentElision = function (nodeId, parentId) {
            var node = _this.nodes[nodeId];
            var parent = _this.nodes[parentId];
            if (!node || !parent)
                return;
            node.hidden = parent.hidden;
        };
        this.toggleElision = function (event, _a) {
            var nodeId = _a.nodeId;
            var node = _this.nodes[nodeId];
            if (!node)
                return;
            _this.ide.editor.cm.operation(function () {
                node.hidden = !node.hidden;
                _this.walk(nodeId, _this._inheritParentElision);
                _this.updateElision();
            });
            _this.ide.render();
            event.stopPropagation();
        };
        this.toggleInspectorFocus = function () {
            if (_this.isFocused()) {
                client_1.sendEvent([{ tag: ["inspector", "unfocus-current"] }]);
                for (var nodeId in _this.nodes) {
                    var node = _this.nodes[nodeId];
                    if (!node)
                        continue;
                    if (node.hidden)
                        node.hidden = false;
                }
                _this.updateElision();
            }
            else {
                client_1.sendEvent([{ tag: ["inspector", "focus-current"] }]);
            }
        };
    }
    Navigator.prototype.currentType = function () {
        var node = this.nodes[this.currentId];
        return node && node.type || "folder";
    };
    Navigator.prototype.walk = function (rootId, callback, parentId) {
        var node = this.nodes[rootId];
        if (!node)
            return;
        callback(rootId, parentId);
        if (node.children) {
            for (var _i = 0, _a = node.children; _i < _a.length; _i++) {
                var childId = _a[_i];
                this.walk(childId, callback, rootId);
            }
        }
    };
    Navigator.prototype.loadWorkspace = function (id, name, files, parentId) {
        if (parentId === void 0) { parentId = this.rootId; }
        var root = this.nodes[id] = { id: id, name: name, type: "folder", open: true };
        var parent = root;
        for (var curId in files) {
            var node = { id: curId, name: curId, type: "document" };
            this.nodes[curId] = node;
            if (!parent.children)
                parent.children = [curId];
            else
                parent.children.push(curId);
        }
        if (id !== this.rootId) {
            parent = this.nodes[parentId];
            if (!parent)
                throw new Error("Unable to load document into non-existent folder " + parentId);
            if (!parent.children)
                parent.children = [];
            if (parent.children.indexOf(id) === -1) {
                parent.children.push(id);
            }
        }
    };
    Navigator.prototype.loadDocument = function (id, name) {
        var editor = this.ide.editor;
        var doc = editor.cm.getDoc();
        var headings = editor.getAllSpans("heading");
        headings.sort(spans_1.compareSpans);
        var root = this.nodes[id];
        if (!root)
            throw new Error("Cannot load non-existent document.");
        root.open = true;
        root.children = undefined;
        var stack = [root];
        for (var _i = 0, headings_1 = headings; _i < headings_1.length; _i++) {
            var heading = headings_1[_i];
            var curId = heading.id;
            var loc = heading.find();
            if (!loc)
                continue;
            while ((stack.length > 1) && heading.source.level <= stack[stack.length - 1].level)
                stack.pop();
            var parent_1 = stack[stack.length - 1];
            if (!parent_1.children)
                parent_1.children = [curId];
            else
                parent_1.children.push(curId);
            var old = this.nodes[curId];
            var node = { id: curId, name: doc.getLine(loc.from.line), type: "section", level: heading.source.level, span: heading, open: old ? old.open : true, hidden: old ? old.hidden : false, elisionSpan: old ? old.elisionSpan : undefined };
            stack.push(node);
            this.nodes[curId] = node;
        }
        this.nodes[id] = root;
    };
    Navigator.prototype.updateNode = function (span) {
        if (this.currentType() !== "document")
            return;
        var nodeId = span.id;
        var node = this.nodes[nodeId];
        var loc = span.find();
        if (node && !loc) {
            if (node.elisionSpan)
                node.elisionSpan.clear();
            this.nodes[nodeId] = undefined;
        }
        else if (node) {
            node.hidden = span.isHidden();
        }
        else if (!node && loc) {
            var cur = loc.from;
            var parentId = void 0;
            var siblingId = void 0;
            do {
                var parentSpan = this.ide.editor.findHeadingAt(cur);
                var parentLoc = parentSpan && parentSpan.find();
                cur = parentLoc ? parentLoc.from : { line: 0, ch: 0 };
                siblingId = parentId;
                parentId = parentSpan ? parentSpan.id : this.currentId;
            } while (parentId !== this.currentId && this.nodes[parentId].level >= span.source.level);
            var parentNode = this.nodes[parentId];
            if (!parentNode.children)
                parentNode.children = [nodeId];
            else {
                var ix = parentNode.children.length;
                if (siblingId) {
                    ix = parentNode.children.indexOf(siblingId);
                    ix = (ix === -1) ? parentNode.children.length : ix;
                }
                parentNode.children.splice(ix, 0, nodeId);
            }
            var doc = this.ide.editor.cm.getDoc();
            this.nodes[nodeId] = { id: nodeId, name: doc.getLine(loc.from.line), type: "section", level: span.source.level, span: span, open: true, hidden: span.isHidden() };
        }
    };
    Navigator.prototype.updateElision = function () {
        var sections = [];
        for (var nodeId in this.nodes) {
            var node = this.nodes[nodeId];
            if (!node || node.type !== "section")
                continue;
            var heading = node.span;
            var range = heading.getSectionRange();
            sections.push({ nodeId: nodeId, hidden: node.hidden, range: range });
        }
        if (!sections.length) {
            // Only one source can be safely eliding at any given time.
            for (var _i = 0, _a = this.ide.editor.getAllSpans("elision"); _i < _a.length; _i++) {
                var span = _a[_i];
                span.clear();
            }
            return;
        }
        sections.sort(function (a, b) {
            var fromDir = util_1.comparePositions(a.range.from, b.range.from);
            if (fromDir)
                return fromDir;
            return util_1.comparePositions(a.range.to, b.range.to);
        });
        var visibleRanges = [];
        var currentRange;
        for (var _b = 0, sections_1 = sections; _b < sections_1.length; _b++) {
            var section = sections_1[_b];
            if (!section.hidden) {
                if (!currentRange)
                    currentRange = { from: section.range.from, to: section.range.to };
                else
                    currentRange.to = section.range.to;
            }
            else {
                if (currentRange) {
                    if (util_1.comparePositions(section.range.from, currentRange.to) < 0) {
                        currentRange.to = section.range.from;
                    }
                    visibleRanges.push(currentRange);
                    currentRange = undefined;
                }
            }
        }
        if (currentRange) {
            visibleRanges.push(currentRange);
        }
        var editor = this.ide.editor;
        var doc = editor.cm.getDoc();
        // Capture the current topmost un-elided line in the viewport. We'll use this to maintain your scroll state (to some extent) when elisions are nuked.
        // Only one source can be safely eliding at any given time.
        var topVisible;
        for (var _c = 0, _d = editor.getAllSpans("elision"); _c < _d.length; _c++) {
            var span = _d[_c];
            var loc = span.find();
            if (loc && (!topVisible || loc.to.line < topVisible)) {
                topVisible = loc.to.line;
            }
            span.clear();
        }
        if (visibleRanges.length) {
            editor.markBetween(visibleRanges, { type: "elision" });
        }
        else {
            editor.markSpan({ line: 0, ch: 0 }, { line: doc.lineCount(), ch: 0 }, { type: "elision" });
        }
        if (visibleRanges.length === 1 && topVisible) {
            var firstRange = visibleRanges[0];
            if (firstRange.from.line === 0 && firstRange.to.line >= doc.lastLine()) {
                editor.scrollToPosition({ line: topVisible + 1, ch: 0 });
            }
        }
    };
    Navigator.prototype.isFocused = function () {
        return this.ide.editor.getAllSpans("elision").length;
    };
    // Elements
    Navigator.prototype.workspaceItem = function (nodeId) {
        var node = this.nodes[nodeId];
        if (!node)
            return { c: "tree-item", nodeId: nodeId };
        var subtree;
        if (node.type === "folder") {
            var items = [];
            if (node.open) {
                for (var _i = 0, _a = node.children || []; _i < _a.length; _i++) {
                    var childId = _a[_i];
                    items.push(this.workspaceItem(childId));
                }
            }
            subtree = { c: "tree-items", children: items };
        }
        return { c: "tree-item " + (subtree ? "branch" : "leaf") + " " + node.type + " " + (subtree && !node.open ? "collapsed" : ""), nodeId: nodeId, children: [
                { c: "flex-row", children: [
                        { c: "label " + (subtree ? "ion-ios-arrow-down" : "no-icon"), text: node.name, nodeId: nodeId, click: subtree ? this.toggleBranch : this.navigate },
                        { c: "controls", children: [
                                subtree ? { c: "new-btn ion-ios-plus-empty", click: function () { return console.log("new folder or document"); } } : undefined,
                                { c: "delete-btn ion-ios-close-empty", click: function () { return console.log("delete folder or document w/ confirmation"); } }
                            ] }
                    ] },
                subtree
            ] };
    };
    Navigator.prototype.tocItem = function (nodeId) {
        var node = this.nodes[nodeId];
        if (!node)
            return { c: "tree-item", nodeId: nodeId };
        var subtree;
        if (node.children) {
            var items = [];
            if (node.open) {
                for (var _i = 0, _a = node.children; _i < _a.length; _i++) {
                    var childId = _a[_i];
                    items.push(this.tocItem(childId));
                }
            }
            subtree = { c: "tree-items", children: items };
        }
        if (node.type === "document") {
            return { c: "tree-item " + (nodeId === this.rootId ? "root" : "") + " " + node.type, nodeId: nodeId, children: [
                    subtree
                ] };
        }
        return { c: "tree-item " + (subtree ? "branch" : "leaf") + " " + (nodeId === this.rootId ? "root" : "") + " " + node.type + "  item-level-" + node.level + " " + (subtree && !node.open ? "collapsed" : "") + " " + (node.hidden ? "hidden" : ""), nodeId: nodeId, children: [
                { c: "flex-row", children: [
                        { c: "label " + (subtree && !node.level ? "ion-ios-arrow-down" : "no-icon"), text: node.name, nodeId: nodeId, click: node.span ? this.gotoSpan : undefined },
                        { c: "controls", children: [
                                { c: "elide-btn " + (node.hidden ? "ion-android-checkbox-outline-blank" : "ion-android-checkbox-outline"), nodeId: nodeId, click: this.toggleElision },
                            ] }
                    ] },
                subtree
            ] };
    };
    Navigator.prototype.inspectorControls = function () {
        return { c: "inspector-controls", children: [
                { t: "button", c: "inspector-hide", text: this.isFocused() ? "Show all" : "Filter to selected", click: this.toggleInspectorFocus }
            ] };
    };
    Navigator.prototype.header = function () {
        var type = this.currentType();
        return { c: "navigator-header", children: [
                { c: "controls", children: [
                        this.open ? { c: "up-btn flex-row", click: this.navigate, children: [
                                { c: "up-btn ion-android-arrow-up " + ((type === "folder") ? "disabled" : "") },
                                { c: "label", text: "examples" },
                            ] } : undefined,
                        { c: "flex-spacer" },
                        { c: (this.open ? "expand-btn" : "collapse-btn") + " ion-ios-arrow-back", click: this.togglePane },
                    ] },
                this.ide.inspecting ? this.inspectorControls() : { c: "inspector-controls" },
            ] };
    };
    Navigator.prototype.render = function () {
        var nodeId = this.currentId;
        var root = this.nodes[nodeId];
        if (!root)
            return { c: "navigator-pane", children: [
                    { c: "navigator-pane-inner", children: [
                            this.header(),
                            { c: "new-btn ion-ios-plus-empty", click: function () { return console.log("new folder or document"); } }
                        ] }
                ] };
        var tree;
        if (root.type === "folder") {
            tree = this.workspaceItem(nodeId);
        }
        else if (root.type === "document") {
            tree = this.tocItem(nodeId);
        }
        return { c: "navigator-pane " + (this.open ? "" : "collapsed"), click: this.open ? undefined : this.togglePane, children: [
                { c: "navigator-pane-inner", children: [
                        this.header(),
                        tree
                    ] }
            ] };
    };
    return Navigator;
}());
var _mdParser = new commonmark_1.Parser();
function parseMarkdown(input) {
    var parsed = _mdParser.parse(input);
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
            if (!info)
                throw new Error("Invalid context stack while parsing markdown");
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
var Change = (function () {
    function Change(_raw) {
        this._raw = _raw;
        this.type = "range";
    }
    Object.defineProperty(Change.prototype, "origin", {
        /** String representing the origin of the change event and whether it can be merged with history. */
        get: function () { return this._raw.origin; },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Change.prototype, "text", {
        /** Lines of text that used to be between from and to, which is overwritten by this change. */
        get: function () { return this._raw.text; },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Change.prototype, "removed", {
        /** Lines of text that used to be between from and to, which is overwritten by this change. */
        get: function () { return this._raw.removed; },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Change.prototype, "from", {
        /** Position (in the pre-change coordinate system) where the change started. */
        get: function () { return this._raw.from; },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Change.prototype, "to", {
        /** Position (in the pre-change coordinate system) where the change ended. */
        get: function () { return this._raw.to; },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Change.prototype, "final", {
        /** Position (in the post-change coordinate system) where the change eneded. */
        get: function () {
            var _a = this, from = _a.from, to = _a.to, text = _a.text;
            var final = { line: from.line + (text.length - 1), ch: text[text.length - 1].length };
            if (text.length == 1) {
                final.ch += from.ch;
            }
            return final;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Change.prototype, "addedText", {
        /** String of all text added in the change. */
        get: function () { return this.text.join("\n"); },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Change.prototype, "removedText", {
        /** String of all text removed in the change. */
        get: function () { return this.removed.join("\n"); },
        enumerable: true,
        configurable: true
    });
    /** Whether this change just a single enter. */
    Change.prototype.isNewlineChange = function () {
        return this.text.length == 2 && this.text[1] == "";
    };
    /** Inverts a change for undo. */
    Change.prototype.invert = function () { return new ChangeInverted(this._raw); };
    return Change;
}());
exports.Change = Change;
var ChangeLinkedList = (function (_super) {
    __extends(ChangeLinkedList, _super);
    function ChangeLinkedList(_raw) {
        _super.call(this, _raw);
        this._raw = _raw;
    }
    /** Next change object in sequence, if any. */
    ChangeLinkedList.prototype.next = function () {
        return this._raw.next && new ChangeLinkedList(this._raw.next);
    };
    return ChangeLinkedList;
}(Change));
function isRangeChange(x) {
    return x && x.type === "range";
}
var ChangeCancellable = (function (_super) {
    __extends(ChangeCancellable, _super);
    function ChangeCancellable(_raw) {
        _super.call(this, _raw);
        this._raw = _raw;
    }
    Object.defineProperty(ChangeCancellable.prototype, "canceled", {
        get: function () { return this._raw.canceled; },
        enumerable: true,
        configurable: true
    });
    ChangeCancellable.prototype.update = function (from, to, text) {
        return this._raw.update(from, to, text);
    };
    ChangeCancellable.prototype.cancel = function () {
        return this._raw.cancel();
    };
    return ChangeCancellable;
}(Change));
exports.ChangeCancellable = ChangeCancellable;
var ChangeInverted = (function (_super) {
    __extends(ChangeInverted, _super);
    function ChangeInverted() {
        _super.apply(this, arguments);
    }
    Object.defineProperty(ChangeInverted.prototype, "text", {
        /** Lines of text that used to be between from and to, which is overwritten by this change. */
        get: function () { return this._raw.removed; },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(ChangeInverted.prototype, "removed", {
        /** Lines of text that used to be between from and to, which is overwritten by this change. */
        get: function () { return this._raw.text; },
        enumerable: true,
        configurable: true
    });
    /** Inverts a change for undo. */
    ChangeInverted.prototype.invert = function () { return new Change(this._raw); };
    return ChangeInverted;
}(Change));
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
// Register static commands
var _rawUndo = CodeMirror.commands["undo"];
CodeMirror.commands["undo"] = function (cm) {
    if (!cm.editor)
        _rawUndo.apply(this, arguments);
    else
        cm.editor.undo();
};
var _rawRedo = CodeMirror.commands["redo"];
CodeMirror.commands["redo"] = function (cm) {
    if (!cm.editor)
        _rawRedo.apply(this, arguments);
    else
        cm.editor.redo();
};
function debugTokenWithContext(text, start, end) {
    var lineStart = text.lastIndexOf("\n", start) + 1;
    var lineEnd = text.indexOf("\n", end);
    if (lineEnd === -1)
        lineEnd = undefined;
    var tokenStart = start - lineStart;
    var tokenEnd = end - lineStart;
    var line = text.substring(lineStart, lineEnd);
    return line.substring(0, tokenStart) + "|" + line.substring(tokenStart, tokenEnd) + "|" + line.substring(tokenEnd);
}
var Editor = (function () {
    function Editor(ide) {
        var _this = this;
        this.ide = ide;
        this.defaults = {
            scrollPastEnd: true,
            scrollbarStyle: "simple",
            tabSize: 2,
            lineWrapping: true,
            lineNumbers: false,
            extraKeys: ctrlify({
                "Cmd-Enter": function () { return _this.ide.eval(true); },
                "Shift-Cmd-Enter": function () { return _this.ide.eval(false); },
                "Alt-Enter": function () { return _this.ide.tokenInfo(); },
                "Cmd-B": function () { return _this.format({ type: "strong" }); },
                "Cmd-I": function () { return _this.format({ type: "emph" }); },
                "Cmd-Y": function () { return _this.format({ type: "code" }); },
                "Cmd-K": function () { return _this.format({ type: "code_block" }); },
                "Cmd-1": function () { return _this.format({ type: "heading", level: 1 }); },
                "Cmd-2": function () { return _this.format({ type: "heading", level: 2 }); },
                "Cmd-3": function () { return _this.format({ type: "heading", level: 3 }); },
                "Cmd-L": function () { return _this.format({ type: "item" }); }
            })
        };
        /** Whether the editor has changed since the last update. */
        this.dirty = false;
        /** Whether the editor is being externally updated with new content. */
        this.reloading = false;
        /** Formatting state for the editor at the cursor. */
        this.formatting = {};
        /** Whether the editor is currently processing CM change events */
        this.changing = false;
        /** Cache of spans currently in a denormalized state. So long as this is non-empty, the editor may not sync with the language service. */
        this.denormalizedSpans = [];
        /** Undo history state */
        this.history = { position: 0, items: [], transitioning: false };
        /** Whether to show the new block button at the cursor. */
        this.showNewBlockBar = false;
        /** Whether to show the format bar at the cursor. */
        this.showFormatBar = false;
        this.queueUpdate = util_1.debounce(function (shouldEval) {
            if (shouldEval === void 0) { shouldEval = false; }
            if (!_this.reloading && _this.denormalizedSpans.length === 0)
                _this.ide.queueUpdate(shouldEval);
        }, 0);
        //-------------------------------------------------------
        // Undo History
        //-------------------------------------------------------
        this.undo = function () {
            var history = _this.history;
            // We're out of undo steps.
            if (history.position === 0)
                return;
            _this.finalizeLastHistoryEntry(); // @FIXME: wut do?
            history.position--;
            var changeSet = history.items[history.position];
            _this._historyDo(changeSet, true);
        };
        this.redo = function () {
            var history = _this.history;
            // We're out of redo steps.
            if (history.position > history.items.length - 1)
                return;
            var changeSet = history.items[history.position];
            history.position++;
            _this._historyDo(changeSet);
        };
        //-------------------------------------------------------
        // Handlers
        //-------------------------------------------------------
        this.injectCodeMirror = function (node, elem) {
            if (!node.cm) {
                node.cm = _this.cm;
                node.appendChild(_this.cm.getWrapperElement());
            }
            _this.cm.refresh();
            _this.ide.render();
        };
        this.onBeforeChange = function (raw) {
            _this.dirty = true;
            var doc = _this.cm.getDoc();
            var change = new ChangeCancellable(raw);
            var from = change.from, to = change.to;
            var spans;
            if (util_1.samePosition(from, to)) {
                spans = _this.findSpansAt(from);
            }
            else {
                var inclusiveFrom = doc.posFromIndex(doc.indexFromPos(from) - 1);
                var inclusiveTo = doc.posFromIndex(doc.indexFromPos(to) + 1);
                spans = _this.findSpans(inclusiveFrom, inclusiveTo);
            }
            // Grab all of the line spans intersecting this change too.
            for (var line = from.line, end = to.line; line <= end; line++) {
                var maybeLineSpans = _this.findSpansAt({ line: line, ch: 0 });
                for (var _i = 0, maybeLineSpans_1 = maybeLineSpans; _i < maybeLineSpans_1.length; _i++) {
                    var maybeLineSpan = maybeLineSpans_1[_i];
                    if (maybeLineSpan.isLine() && spans.indexOf(maybeLineSpan) === -1) {
                        spans.push(maybeLineSpan);
                    }
                }
            }
            for (var _a = 0, spans_2 = spans; _a < spans_2.length; _a++) {
                var span = spans_2[_a];
                var loc = span.find();
                if (!loc) {
                    span.clear();
                    return;
                }
                if (span.onBeforeChange) {
                    span.onBeforeChange(change);
                }
                // If we clear the span lazily, we can't capture it's position for undo/redo
                if (span.isInline() && util_1.comparePositions(change.from, loc.from) <= 0 && util_1.comparePositions(change.to, loc.to) >= 0) {
                    span.clear(change.origin);
                }
            }
            if (!change.canceled) {
                _this.changing = true;
                if (_this.changingSpans) {
                    _this.changingSpans.push.apply(_this.changingSpans, spans);
                }
                else {
                    _this.changingSpans = spans;
                }
            }
        };
        this.onChange = function (raw) {
            var doc = _this.cm.getDoc();
            _this.cm.operation(function () {
                var lastLine = doc.lastLine();
                var pos = CodeMirror.Pos(lastLine + 1, 0);
                if (doc.getLine(lastLine) !== "") {
                    var cursor = doc.getCursor();
                    doc.replaceRange("\n", pos, pos, "+normalize");
                    doc.setCursor(cursor);
                }
            });
            var change = new ChangeLinkedList(raw);
            var spans = _this.changingSpans || [];
            if (change.origin === "+mdredo" || change.origin === "+mdundo") {
                for (var _i = 0, spans_3 = spans; _i < spans_3.length; _i++) {
                    var span = spans_3[_i];
                    if (span.refresh)
                        span.refresh();
                }
                return;
            }
            // Collapse multiline changes into their own undo step
            if (change.text.length > 1)
                _this.finalizeLastHistoryEntry();
            var cur = change;
            var affectedLines = {};
            while (cur) {
                affectedLines[cur.from.line] = true;
                affectedLines[cur.to.line] = true;
                affectedLines[cur.final.line] = true;
                _this.addToHistory(cur);
                cur = cur.next();
            }
            for (var l in affectedLines) {
                var line = +l;
                var text = doc.getLine(line);
                if (!text)
                    continue;
                var pos = { line: line, ch: 0 };
                if ((text[0] === " " || text[text.length - 1] === " ") && !_this.inCodeBlock(pos)) {
                    var handled = false;
                    for (var _a = 0, _b = _this.findSpansAt(pos); _a < _b.length; _a++) {
                        var span = _b[_a];
                        if (span.isLine()) {
                            handled = true;
                            break;
                        }
                    }
                    if (!handled) {
                        var span = _this.markSpan(pos, pos, { type: "whitespace" });
                        _this.denormalizedSpans.push(span);
                    }
                }
            }
            for (var _c = 0, spans_4 = spans; _c < spans_4.length; _c++) {
                var span = spans_4[_c];
                if (!span.onChange)
                    continue;
                if (!span.find())
                    span.clear();
                else {
                    var cur_1 = change;
                    while (cur_1) {
                        span.onChange(cur_1);
                        cur_1 = cur_1.next();
                    }
                }
            }
            for (var _d = 0, spans_5 = spans; _d < spans_5.length; _d++) {
                var span = spans_5[_d];
                _this.trackDenormalized(span);
            }
            if (change.origin !== "+normalize") {
                for (var format in _this.formatting) {
                    var action = _this.formatting[format];
                    if (action === "add") {
                        var span = _this.markSpan(change.from, change.final, { type: format });
                        _this.trackDenormalized(span);
                    }
                }
            }
            // We need to refresh in on change because line measurement information will get cached by CM before we hit onChanges.
            // If we see lots of slowness when typing, this is a probable culprit and we can get smarter about this.
            if (change.isNewlineChange()) {
                for (var _e = 0, _f = _this.changingSpans; _e < _f.length; _e++) {
                    var span = _f[_e];
                    if (span.refresh)
                        span.refresh();
                }
            }
        };
        this.onChanges = function (raws) {
            if (_this.changingSpans) {
                for (var _i = 0, _a = _this.changingSpans; _i < _a.length; _i++) {
                    var span = _a[_i];
                    if (span.refresh)
                        span.refresh();
                }
            }
            _this.changingSpans = undefined;
            _this.changing = false;
            _this.history.transitioning = false;
            _this.formatting = {};
            _this.queueUpdate();
        };
        this.onCursorActivity = function () {
            var doc = _this.cm.getDoc();
            var cursor = doc.getCursor();
            if (!_this.changing) {
                _this.finalizeLastHistoryEntry();
            }
            // Remove any formatting that may have been applied
            _this.formatting = {};
            // If any spans are currently denormalized, attempt to normalize them if they're not currently being edited.
            if (_this.denormalizedSpans.length) {
                console.log("Denormalized:", _this.denormalizedSpans.length);
                for (var ix = 0; ix < _this.denormalizedSpans.length;) {
                    var span = _this.denormalizedSpans[ix];
                    var loc = span.find();
                    if (!loc)
                        span.clear();
                    else if ((span.isInline() || span.isBlock()) &&
                        (util_1.comparePositions(cursor, loc.from) < 0 || util_1.comparePositions(cursor, loc.to) > 0)) {
                        span.normalize();
                    }
                    else if (span.isLine() && cursor.line !== loc.from.line) {
                        span.normalize();
                    }
                    else {
                        ix++;
                        continue;
                    }
                    console.log("- normalized", span);
                    if (_this.denormalizedSpans.length > 1) {
                        _this.denormalizedSpans[ix] = _this.denormalizedSpans.pop();
                    }
                    else {
                        _this.denormalizedSpans.pop();
                    }
                }
                // If everybody is normalized now, we can queue an update to resync immediately.
                if (!_this.denormalizedSpans.length) {
                    _this.queueUpdate();
                }
            }
            _this.updateFormatters();
        };
        this.onScroll = function () {
            _this.updateFormatters();
        };
        this.updateFormatters = util_1.debounce(function () {
            var doc = _this.cm.getDoc();
            var cursor = doc.getCursor();
            // If we're outside of a codeblock, display our rich text controls.
            var codeBlocks = _this.findSpansAt(cursor, "code_block");
            //If the cursor is at the beginning of a new line, display the new block button.
            var old = _this.showNewBlockBar;
            _this.showNewBlockBar = (!codeBlocks.length &&
                cursor.ch === 0 &&
                doc.getLine(cursor.line) === "");
            if (_this.showNewBlockBar !== old) {
                _this.newBlockBar.active = false;
                _this.queueUpdate();
            }
            if (_this.showNewBlockBar) {
                _this.queueUpdate();
            }
            // Otherwise if there's a selection, show the format bar.
            var inputState = _this.ide.inputState;
            var modifyingSelection = inputState.mouse["1"] || inputState.keyboard.shift;
            codeBlocks = _this.findSpans(doc.getCursor("from"), doc.getCursor("to"), "code_block");
            old = _this.showFormatBar;
            _this.showFormatBar = (!modifyingSelection && !codeBlocks.length && doc.somethingSelected());
            if (_this.showFormatBar !== old || _this.showFormatBar)
                _this.queueUpdate();
        }, 30);
        this.cm = CodeMirror(function () { return undefined; }, this.defaults);
        this.cm.editor = this;
        this.cm.on("beforeChange", function (editor, rawChange) { return _this.onBeforeChange(rawChange); });
        this.cm.on("change", function (editor, rawChange) { return _this.onChange(rawChange); });
        this.cm.on("changes", function (editor, rawChanges) { return _this.onChanges(rawChanges); });
        this.cm.on("cursorActivity", this.onCursorActivity);
        this.cm.on("scroll", this.onScroll);
        this.newBlockBar = { editor: this, active: false };
    }
    Editor.prototype.reset = function () {
        this.history.position = 0;
        this.history.items = [];
        this.history.transitioning = true;
        this.reloading = true;
        this.cm.setValue("");
        for (var _i = 0, _a = this.getAllSpans(); _i < _a.length; _i++) {
            var span = _a[_i];
            span.clear();
        }
        this.reloading = false;
        this.history.transitioning = false;
    };
    // This is a new document and we need to rebuild it from scratch.
    Editor.prototype.loadDocument = function (id, text, packed, attributes) {
        var _this = this;
        // Reset history and suppress storing the load as a history step.
        this.history.position = 0;
        this.history.items = [];
        this.history.transitioning = true;
        if (packed.length % 4 !== 0)
            throw new Error("Invalid span packing, unable to load.");
        this.cm.operation(function () {
            _this.reloading = true;
            // this is a new document and we need to rebuild it from scratch.
            _this.cm.setValue(text);
            var doc = _this.cm.getDoc();
            for (var i = 0; i < packed.length; i += 4) {
                var from = doc.posFromIndex(packed[i]);
                var to = doc.posFromIndex(packed[i + 1]);
                var type = packed[i + 2];
                var id_1 = packed[i + 3];
                //console.info(type, debugTokenWithContext(text, packed[i], packed[i + 1]));
                var source = attributes[id_1] || {};
                source.type = type;
                source.id = id_1;
                _this.markSpan(from, to, source);
            }
        });
        this.reloading = false;
        this.history.transitioning = false;
        this.dirty = false;
    };
    // This is an update to an existing document, so we need to figure out what got added and removed.
    Editor.prototype.updateDocument = function (packed, attributes) {
        var _this = this;
        if (packed.length % 4 !== 0)
            throw new Error("Invalid span packing, unable to load.");
        var addedDebug = [];
        var removedDebug = [];
        this.cm.operation(function () {
            _this.reloading = true;
            var doc = _this.cm.getDoc();
            var cursorLine = doc.getCursor().line;
            // Find all runtime-controlled spans (e.g. syntax highlighting, errors) that are unchanged and mark them as such.
            // Unmarked spans will be swept afterwards.
            // Set editor-controlled spans aside. We'll match them up to maintain id stability afterwards
            var controlledOffsets = {};
            var touchedIds = {};
            for (var i = 0; i < packed.length; i += 4) {
                // if(isEditorControlled(packed[i + 2]))
                //   console.info(packed[i + 2], debugTokenWithContext(doc.getValue(), packed[i], packed[i + 1]));
                var start = packed[i];
                var type = packed[i + 2];
                if (spans_1.isEditorControlled(type)) {
                    if (!controlledOffsets[type])
                        controlledOffsets[type] = [i];
                    else
                        controlledOffsets[type].push(i);
                }
                else {
                    var from = doc.posFromIndex(packed[i]);
                    var to = doc.posFromIndex(packed[i + 1]);
                    var type_1 = packed[i + 2];
                    var id = packed[i + 3];
                    var source = attributes[id] || {};
                    source.type = type_1;
                    source.id = id;
                    if (type_1 === "document_comment") {
                        source.delay = 1000;
                    }
                    var spans = _this.findSpansAt(from, type_1);
                    var unchanged = false;
                    for (var _i = 0, spans_6 = spans; _i < spans_6.length; _i++) {
                        var span = spans_6[_i];
                        var loc = span.find();
                        if (loc && util_1.samePosition(to, loc.to) && span.sourceEquals(source)) {
                            span.source = source;
                            if (span.refresh)
                                span.refresh();
                            if (type_1 === "document_comment") {
                                span.updateWidget();
                            }
                            touchedIds[span.id] = true;
                            unchanged = true;
                            break;
                        }
                    }
                    if (!unchanged) {
                        var span = _this.markSpan(from, to, source);
                        touchedIds[span.id] = true;
                        addedDebug.push(span);
                    }
                }
            }
            for (var type in controlledOffsets) {
                var offsets = controlledOffsets[type];
                var spans = _this.getAllSpans(type);
                if (offsets.length !== spans.length) {
                    throw new Error("The runtime may not add, remove, or move editor controlled spans of type '" + type + "'. Expected " + spans.length + " got " + offsets.length);
                }
                spans.sort(spans_1.compareSpans);
                for (var spanIx = 0; spanIx < spans.length; spanIx++) {
                    var span = spans[spanIx];
                    var offset = offsets[spanIx];
                    var id = packed[offset + 3];
                    span.source.id = id;
                }
            }
            // Nuke untouched spans
            for (var _a = 0, _b = _this.getAllSpans(); _a < _b.length; _a++) {
                var span = _b[_a];
                if (span.isEditorControlled())
                    continue; // If the span is editor controlled, it's not our business.
                if (touchedIds[span.id])
                    continue; // If the span was added or updated, leave it be.
                removedDebug.push(span);
                span.clear();
            }
        });
        //console.log("updated:", this.getAllSpans().length, "added:", addedDebug, "removed:", removedDebug);
        this.reloading = false;
    };
    // This is an update to an existing document, so we need to figure out what got added and removed.
    Editor.prototype.injectSpans = function (packed, attributes) {
        var _this = this;
        if (packed.length % 4 !== 0)
            throw new Error("Invalid span packing, unable to load.");
        this.cm.operation(function () {
            _this.reloading = true;
            var doc = _this.cm.getDoc();
            var controlledOffsets = {};
            var touchedIds = {};
            for (var i = 0; i < packed.length; i += 4) {
                if (spans_1.isEditorControlled(packed[i + 2]))
                    console.info(packed[i + 2], debugTokenWithContext(doc.getValue(), packed[i], packed[i + 1]));
                var start = packed[i];
                var type = packed[i + 2];
                if (spans_1.isEditorControlled(type)) {
                    throw new Error("The parser may not inject editor controlled spans of type '" + type + "'");
                }
                else {
                    var from = doc.posFromIndex(packed[i]);
                    var to = doc.posFromIndex(packed[i + 1]);
                    var type_2 = packed[i + 2];
                    var id = packed[i + 3];
                    var source = attributes[id] || {};
                    source.type = type_2;
                    source.id = id;
                    var spans = _this.findSpansAt(from, type_2);
                    var unchanged = false;
                    for (var _i = 0, spans_7 = spans; _i < spans_7.length; _i++) {
                        var span = spans_7[_i];
                        var loc = span.find();
                        if (loc && util_1.samePosition(to, loc.to) && span.sourceEquals(source)) {
                            span.source = source;
                            if (span.refresh)
                                span.refresh();
                            unchanged = true;
                            break;
                        }
                    }
                    if (!unchanged) {
                        var span = _this.markSpan(from, to, source);
                    }
                }
            }
        });
        this.reloading = false;
    };
    Editor.prototype.toMarkdown = function () {
        var cm = this.cm;
        var doc = cm.getDoc();
        var spans = this.getAllSpans();
        var fullText = cm.getValue();
        var markers = [];
        for (var _i = 0, spans_8 = spans; _i < spans_8.length; _i++) {
            var span = spans_8[_i];
            var loc = span.find();
            if (!loc)
                continue;
            markers.push({ pos: doc.indexFromPos(loc.from), start: true, isBlock: span.isBlock(), isLine: span.isLine(), source: span.source, span: span });
            markers.push({ pos: doc.indexFromPos(loc.to), start: false, isBlock: span.isBlock(), isLine: span.isLine(), source: span.source, span: span });
        }
        markers.sort(function (a, b) {
            var delta = a.pos - b.pos;
            if (delta !== 0)
                return delta;
            if (a.isBlock && !b.isBlock)
                return -1;
            if (b.isBlock && !a.isBlock)
                return 1;
            if (a.isLine && !b.isLine)
                return -1;
            if (b.isLine && !a.isLine)
                return 1;
            if (a.start && !b.start)
                return 1;
            if (b.start && !a.start)
                return -1;
            if (a.source.type === b.source.type)
                return 0;
            else if (a.source.type === "link")
                return a.start ? 1 : -1;
            else if (b.source.type === "link")
                return b.start ? -1 : 1;
            return 0;
        });
        var pos = 0;
        var pieces = [];
        for (var _a = 0, markers_1 = markers; _a < markers_1.length; _a++) {
            var mark = markers_1[_a];
            if (!mark.source)
                continue;
            // If the cursor isn't at this mark yet, push the range between and advance the cursor.
            if (pos !== mark.pos) {
                pieces.push(fullText.substring(pos, mark.pos));
                pos = mark.pos;
            }
            // Break each known span type out into its markdown equivalent.
            var type = mark.source.type;
            if (type === "heading" && mark.start) {
                for (var ix = 0; ix < mark.source.level; ix++) {
                    pieces.push("#");
                }
                pieces.push(" ");
            }
            else if (type == "link" && !mark.start) {
                pieces.push("](" + mark.source.destination + ")");
            }
            else if (type === "emph") {
                pieces.push("*");
            }
            else if (type == "strong") {
                pieces.push("**");
            }
            else if (type == "code") {
                pieces.push("`");
            }
            else if (type == "code_block" && mark.start) {
                pieces.push("```" + (mark.source.info || "") + "\n");
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
            else if (type == "item" && mark.start && mark.source.listData.type == "bullet") {
                pieces.push("- ");
            }
            else if (type == "item" && mark.start && mark.source.listData.type == "ordered") {
                pieces.push(mark.source.listData.start + ". ");
            }
            else if (type == "link" && mark.start) {
                pieces.push("[");
            }
        }
        // If there's any text after all the markers have been processed, glom that on.
        if (pos < fullText.length) {
            pieces.push(fullText.substring(pos));
        }
        return pieces.join("");
    };
    Editor.prototype.refresh = function () {
        this.cm.refresh();
    };
    Editor.prototype.jumpTo = function (id) {
        for (var _i = 0, _a = this.getAllSpans(); _i < _a.length; _i++) {
            var span = _a[_i];
            if (span.source.id === id) {
                var loc = span.find();
                if (!loc)
                    break;
                this.cm.scrollIntoView(loc, 20);
                break;
            }
        }
    };
    Editor.prototype.scrollToPosition = function (position) {
        var top = this.cm.cursorCoords(position, "local").top;
        this.cm.scrollTo(0, Math.max(top - 100, 0));
    };
    //-------------------------------------------------------
    // Spans
    //-------------------------------------------------------
    Editor.prototype.getSpanBySourceId = function (id) {
        for (var _i = 0, _a = this.getAllSpans(); _i < _a.length; _i++) {
            var span = _a[_i];
            if (span.source.id === id)
                return span;
        }
    };
    Editor.prototype.getAllSpans = function (type) {
        var doc = this.cm.getDoc();
        var marks = doc.getAllMarks();
        var spans = [];
        for (var _i = 0, marks_1 = marks; _i < marks_1.length; _i++) {
            var mark = marks_1[_i];
            if (mark.span && (!type || mark.span.source.type === type)) {
                spans.push(mark.span);
            }
        }
        return spans;
    };
    Editor.prototype.findSpans = function (start, stop, type) {
        var doc = this.cm.getDoc();
        var marks = doc.findMarks(start, stop);
        var spans = [];
        for (var _i = 0, marks_2 = marks; _i < marks_2.length; _i++) {
            var mark = marks_2[_i];
            if (mark.span && (!type || mark.span.source.type === type)) {
                spans.push(mark.span);
            }
        }
        return spans;
    };
    Editor.prototype.findSpansAt = function (pos, type) {
        var doc = this.cm.getDoc();
        var marks = doc.findMarksAt(pos);
        var spans = [];
        for (var _i = 0, marks_3 = marks; _i < marks_3.length; _i++) {
            var mark = marks_3[_i];
            if (mark.span && (!type || mark.span.source.type === type)) {
                spans.push(mark.span);
            }
        }
        return spans;
    };
    /** Create a new Span representing the given source in the document. */
    Editor.prototype.markSpan = function (from, to, source) {
        var SpanClass = spans_1.spanTypes[source.type] || spans_1.spanTypes["default"];
        var span = new SpanClass(this, from, to, source);
        return span;
    };
    /** Create new Spans wrapping the text between each given span id or range. */
    Editor.prototype.markBetween = function (idsOrRanges, source, bounds) {
        var _this = this;
        return this.cm.operation(function () {
            if (!idsOrRanges.length)
                return [];
            var ranges;
            if (typeof idsOrRanges[0] === "string") {
                var ids = idsOrRanges;
                ranges = [];
                var spans = void 0;
                if (bounds) {
                    spans = _this.findSpansAt(bounds.from).concat(_this.findSpans(bounds.from, bounds.to));
                }
                else {
                    spans = _this.getAllSpans();
                }
                for (var _i = 0, spans_9 = spans; _i < spans_9.length; _i++) {
                    var span = spans_9[_i];
                    if (ids.indexOf(span.source.id) !== -1) {
                        var loc = span.find();
                        if (!loc)
                            continue;
                        if (span.isLine()) {
                            loc = { from: loc.from, to: { line: loc.from.line + 1, ch: 0 } };
                        }
                        ranges.push(loc);
                    }
                }
            }
            else {
                ranges = idsOrRanges;
            }
            if (!ranges.length)
                return;
            var doc = _this.cm.getDoc();
            ranges.sort(util_1.compareRanges);
            var createdSpans = [];
            var start = bounds && bounds.from || { line: 0, ch: 0 };
            for (var _a = 0, ranges_1 = ranges; _a < ranges_1.length; _a++) {
                var range = ranges_1[_a];
                var from = doc.posFromIndex(doc.indexFromPos(range.from) - 1);
                if (util_1.comparePositions(start, from) < 0) {
                    createdSpans.push(_this.markSpan(start, { line: from.line, ch: 0 }, source));
                }
                start = doc.posFromIndex(doc.indexFromPos(range.to) + 1);
            }
            var last = ranges[ranges.length - 1];
            var to = doc.posFromIndex(doc.indexFromPos(last.to) + 1);
            var end = bounds && bounds.to || doc.posFromIndex(doc.getValue().length);
            if (util_1.comparePositions(to, end) < 0) {
                createdSpans.push(_this.markSpan(to, end, source));
            }
            for (var _b = 0, ranges_2 = ranges; _b < ranges_2.length; _b++) {
                var range = ranges_2[_b];
                for (var _c = 0, _d = _this.findSpans(range.from, range.to); _c < _d.length; _c++) {
                    var span = _d[_c];
                    span.unhide();
                    if (span.refresh)
                        span.refresh();
                }
            }
            _this.queueUpdate();
            return createdSpans;
        });
    };
    Editor.prototype.clearSpans = function (type, bounds) {
        var _this = this;
        this.cm.operation(function () {
            var spans;
            if (bounds)
                spans = _this.findSpans(bounds.from, bounds.to, type);
            else
                spans = _this.getAllSpans(type);
            for (var _i = 0, spans_10 = spans; _i < spans_10.length; _i++) {
                var span = spans_10[_i];
                span.clear();
            }
        });
    };
    Editor.prototype.findHeadingAt = function (pos) {
        var from = { line: 0, ch: 0 };
        var headings = this.findSpans(from, pos, "heading");
        if (!headings.length)
            return undefined;
        headings.sort(spans_1.compareSpans);
        var next = headings[headings.length - 1];
        return next;
    };
    //-------------------------------------------------------
    // Formatting
    //-------------------------------------------------------
    Editor.prototype.inCodeBlock = function (pos) {
        var inCodeBlock = false;
        for (var _i = 0, _a = this.getAllSpans("code_block"); _i < _a.length; _i++) {
            var span = _a[_i];
            var loc = span.find();
            if (!loc)
                continue;
            if (loc.from.line <= pos.line && util_1.comparePositions(loc.to, pos) > 0) {
                return true;
            }
        }
    };
    /** Create a new span representing the given source, collapsing and splitting existing spans as required to maintain invariants. */
    Editor.prototype.formatSpan = function (from, to, source) {
        var selection = { from: from, to: to };
        var spans = this.findSpans(from, to, source.type);
        var formatted = false;
        var neue = [];
        for (var _i = 0, spans_11 = spans; _i < spans_11.length; _i++) {
            var span = spans_11[_i];
            var loc = span.find();
            if (!loc)
                continue;
            // If the formatted range matches an existing span of the same type, clear it.
            if (util_1.samePosition(loc.from, from) && util_1.samePosition(loc.to, to)) {
                span.clear();
                formatted = true;
            }
            else if (util_1.whollyEnclosed(loc, selection)) {
                span.clear();
            }
            else if (util_1.whollyEnclosed(selection, loc)) {
                if (!util_1.samePosition(loc.from, from))
                    neue.push(this.markSpan(loc.from, from, source));
                if (!util_1.samePosition(to, loc.to))
                    neue.push(this.markSpan(to, loc.to, source));
                span.clear();
                formatted = true;
            }
            else if (util_1.comparePositions(loc.to, from) > 0) {
                neue.push(this.markSpan(loc.from, from, source));
                span.clear();
            }
            else if (util_1.comparePositions(loc.from, to) < 0) {
                neue.push(this.markSpan(to, loc.to, source));
                span.clear();
            }
        }
        // If we haven't already formatted by removing existing span(s) then we should create a new span
        if (!formatted) {
            neue.push(this.markSpan(from, to, source));
        }
        for (var _a = 0, neue_1 = neue; _a < neue_1.length; _a++) {
            var span = neue_1[_a];
            this.trackDenormalized(span);
        }
        return neue;
    };
    Editor.prototype.format = function (source, refocus) {
        if (refocus === void 0) { refocus = false; }
        var SpanClass = spans_1.spanTypes[source.type] || spans_1.spanTypes["default"];
        var style = SpanClass.style();
        if (style === "inline") {
            this.formatInline(source);
        }
        else if (style === "line") {
            this.formatLine(source);
        }
        else if (style === "block") {
            this.formatBlock(source);
        }
        if (refocus)
            this.cm.focus();
        this.newBlockBar.active = false;
        this.queueUpdate();
    };
    Editor.prototype.formatInline = function (source) {
        var _this = this;
        this.finalizeLastHistoryEntry();
        var doc = this.cm.getDoc();
        this.cm.operation(function () {
            var from = doc.getCursor("from");
            from = { line: from.line, ch: util_1.adjustToWordBoundary(from.ch, doc.getLine(from.line), "left") };
            // If we have a selection, format it, expanded to the nearest word boundaries.
            // Or, if we're currently in a word, format the word.
            if (doc.somethingSelected() || from.ch !== doc.getCursor("from").ch) {
                var to = doc.getCursor("to");
                to = { line: to.line, ch: util_1.adjustToWordBoundary(to.ch, doc.getLine(to.line), "right") };
                // No editor-controlled span may be created within a codeblock.
                // @NOTE: This feels like a minor layor violation.
                if (from.line !== to.line && _this.findSpans(from, to, "code_block").length || _this.findSpansAt(from, "code_block").length)
                    return;
                _this.formatSpan(from, to, source);
            }
            else {
                var action = "add"; // By default, we just want our following changes to be bold
                var cursor = doc.getCursor("from");
                var spans = _this.findSpansAt(cursor);
                for (var _i = 0, spans_12 = spans; _i < spans_12.length; _i++) {
                    var span = spans_12[_i];
                    if (!span.isInline())
                        continue;
                    var loc = span.find();
                    if (!loc)
                        continue;
                    // If we're at the end of a bold span, we want to stop bolding.
                    if (util_1.samePosition(loc.to, cursor))
                        action = "remove";
                    // If we're at the start of a bold span, we want to continue bolding.
                    if (util_1.samePosition(loc.from, cursor))
                        action = "add";
                    else
                        action = "split";
                }
                _this.formatting[source.type] = action;
            }
            _this.finalizeLastHistoryEntry();
        });
    };
    Editor.prototype.formatLine = function (source) {
        var _this = this;
        this.finalizeLastHistoryEntry();
        var doc = this.cm.getDoc();
        this.cm.operation(function () {
            var from = doc.getCursor("from");
            var to = doc.getCursor("to");
            // No editor-controlled span may be created within a codeblock.
            // @NOTE: This feels like a minor layor violation.
            if (from.line !== to.line && _this.findSpans(from, to, "code_block").length || _this.findSpansAt(from, "code_block").length)
                return;
            var existing = [];
            var formatted = false;
            for (var line = from.line, end = to.line; line <= end; line++) {
                var cur = { line: line, ch: 0 };
                // Line formats are exclusive, so we clear intersecting line spans of other types.
                var spans = _this.findSpansAt(cur);
                for (var _i = 0, spans_13 = spans; _i < spans_13.length; _i++) {
                    var span = spans_13[_i];
                    if (span.isLine() && span.source.type !== source.type) {
                        span.clear();
                    }
                }
                spans = _this.findSpansAt(cur, source.type);
                // If this line isn't already formatted to this type, format it.
                if (!spans.length) {
                    _this.formatSpan(cur, cur, source);
                    formatted = true;
                }
                else {
                    existing.push.apply(existing, spans);
                }
            }
            // If no new lines were formatted, we mean to clear the existing format.
            if (!formatted) {
                for (var _a = 0, existing_1 = existing; _a < existing_1.length; _a++) {
                    var span = existing_1[_a];
                    span.clear();
                }
            }
            _this.finalizeLastHistoryEntry();
            _this.refresh();
        });
    };
    Editor.prototype.formatBlock = function (source) {
        var _this = this;
        this.finalizeLastHistoryEntry();
        var doc = this.cm.getDoc();
        this.cm.operation(function () {
            var from = { line: doc.getCursor("from").line, ch: 0 };
            var to = { line: doc.getCursor("to").line + 1, ch: 0 };
            if (doc.getLine(to.line) !== "") {
                var cursor = doc.getCursor();
                doc.replaceRange("\n", to, to, "+normalize");
                doc.setCursor(cursor);
            }
            // Determine if a block span in this range already exists.
            var exists;
            var existing = _this.findSpansAt(from, source.type);
            for (var _i = 0, existing_2 = existing; _i < existing_2.length; _i++) {
                var span = existing_2[_i];
                var loc = span.find();
                if (!loc)
                    continue;
                exists = span;
                break;
            }
            // If the span already exists, we mean to clear it.
            if (exists) {
                exists.clear();
            }
            else {
                // Block formats are exclusive, so we clear intersecting spans of other types.
                var spans = _this.findSpans(doc.posFromIndex(doc.indexFromPos(from) - 1), to);
                for (var _a = 0, spans_14 = spans; _a < spans_14.length; _a++) {
                    var span = spans_14[_a];
                    if (span.isEditorControlled()) {
                        span.clear();
                    }
                }
                _this.formatSpan(from, to, source);
            }
        });
    };
    Editor.prototype.trackDenormalized = function (span) {
        if (span.isDenormalized) {
            var denormalized = span.isDenormalized();
            var existingIx = this.denormalizedSpans.indexOf(span);
            if (denormalized && existingIx === -1) {
                this.denormalizedSpans.push(span);
            }
            else if (!denormalized && existingIx !== -1) {
                this.denormalizedSpans.splice(existingIx, 1);
            }
        }
    };
    Editor.prototype._historyDo = function (changeSet, invert) {
        var _this = this;
        if (invert === void 0) { invert = false; }
        this.history.transitioning = true;
        var noRangeChanges = true;
        this.cm.operation(function () {
            var doc = _this.cm.getDoc();
            for (var ix = 0, len = changeSet.changes.length; ix < len; ix++) {
                var change = changeSet.changes[invert ? len - ix - 1 : ix];
                if (invert)
                    change = change.invert();
                if (isRangeChange(change)) {
                    noRangeChanges = false;
                    var removedPos = doc.posFromIndex(doc.indexFromPos(change.from) + change.removedText.length);
                    doc.replaceRange(change.addedText, change.from, removedPos);
                }
                else if (spans_1.isSpanChange(change)) {
                    for (var _i = 0, _a = change.removed; _i < _a.length; _i++) {
                        var removed = _a[_i];
                        removed.span.clear("+mdundo");
                    }
                    for (var _b = 0, _c = change.added; _b < _c.length; _b++) {
                        var added = _c[_b];
                        added.span.apply(added.from, added.to, "+mdundo");
                    }
                }
            }
        });
        // Because updating the spans doesn't trigger a change, we can't rely on the changes handler to
        // clear the transitioning state for us if we don't have any range changes.
        if (noRangeChanges) {
            this.history.transitioning = false;
        }
    };
    Editor.prototype.addToHistory = function (change) {
        var history = this.history;
        // Bail if we're currently doing an undo or redo
        if (history.transitioning)
            return;
        // Truncate the history tree to ancestors of the current state.
        // @NOTE: In a fancier implementation we could maintain branching history instead.
        if (history.items.length > history.position) {
            history.items.length = history.position;
        }
        var changeSet;
        // If the last history step hasn't been finalized, we want to keep glomming onto it.
        var last = history.items[history.items.length - 1];
        if (last && !last.finalized)
            changeSet = last;
        else
            changeSet = { changes: [] };
        // @FIXME: Is this check still necessary with history.transitioning?
        if (change.origin !== "+mdundo" && change.origin !== "+mdredo") {
            changeSet.changes.push(change);
        }
        // Finally add the history step to the history stack (if it's not already in there).
        if (changeSet !== last) {
            history.position++;
            history.items.push(changeSet);
        }
    };
    Editor.prototype.finalizeLastHistoryEntry = function () {
        var history = this.history;
        if (!history.items.length)
            return;
        history.items[history.items.length - 1].finalized = true;
    };
    // Elements
    // @NOTE: Does this belong in the IDE?
    Editor.prototype.controls = function () {
        var _this = this;
        var inspectorButton = { c: "inspector-button ion-wand", text: "", title: "Inspect", click: function () { return _this.ide.toggleInspecting(); } };
        if (this.ide.inspectingClick)
            inspectorButton.c += " waiting";
        else if (this.ide.inspecting)
            inspectorButton.c += " inspecting";
        return { c: "flex-row controls", children: [
                { c: "ion-refresh", title: "Reset (⌃⇧⏎ or ⇧⌘⏎ )", click: function () { return _this.ide.eval(false); } },
                { c: "ion-ios-play", title: "Run (⌃⏎ or ⌘⏎)", click: function () { return _this.ide.eval(true); } },
                inspectorButton
            ] };
    };
    Editor.prototype.render = function () {
        return { c: "editor-pane", postRender: this.injectCodeMirror, children: [
                this.controls(),
                this.showNewBlockBar ? newBlockBar(this.newBlockBar) : undefined,
                this.showFormatBar ? formatBar({ editor: this }) : undefined
            ] };
    };
    return Editor;
}());
exports.Editor = Editor;
var Comments = (function () {
    function Comments(ide) {
        var _this = this;
        this.ide = ide;
        this.comments = {};
        this.highlight = function (event, _a) {
            var commentId = _a.commentId;
            var comment = _this.comments[commentId];
            _this.active = commentId;
            var loc = comment.find();
            if (!loc)
                return;
            // @TODO: Separate highlighted span
        };
        this.unhighlight = function (event, _a) {
            var commentId = _a.commentId;
            var comment = _this.comments[commentId];
            _this.active = undefined;
            var loc = comment.find();
            if (!loc)
                return;
            // @TODO: Remove separate highlighted span.
        };
        this.goTo = function (event, _a) {
            var commentId = _a.commentId;
            var comment = _this.comments[commentId];
            var cm = _this.ide.editor.cm;
            var loc = comment.find();
            if (!loc)
                return;
            cm.scrollIntoView(loc, 20);
        };
        this.openComment = function (event, _a) {
            var commentId = _a.commentId;
            _this.active = commentId;
            _this.ide.render();
        };
        this.closeComment = function (event, _a) {
            var commentId = _a.commentId;
            _this.active = undefined;
            _this.ide.render();
        };
        this.inject = function (node, elem) {
            var commentId = elem.commentId;
            var comment = _this.comments[commentId];
            if (comment.commentElem) {
                comment.commentElem.appendChild(node);
            }
        };
        this.update();
    }
    Comments.prototype.collapsed = function () {
        return this._currentWidth <= 300;
    };
    Comments.prototype.update = function () {
        var _this = this;
        var touchedIds = {};
        for (var _i = 0, _a = this.ide.editor.getAllSpans("document_comment"); _i < _a.length; _i++) {
            var span = _a[_i];
            var commentId = span.id;
            touchedIds[commentId] = true;
            if (this.comments[commentId])
                continue;
            this.comments[commentId] = span;
        }
        for (var commentId in this.comments) {
            if (!touchedIds[commentId]) {
                this.comments[commentId].clear();
                delete this.comments[commentId];
            }
        }
        this.ordered = Object.keys(this.comments);
        this.ordered.sort(function (a, b) { return spans_1.compareSpans(_this.comments[a], _this.comments[b]); });
    };
    Comments.prototype.comment = function (commentId) {
        var comment = this.comments[commentId];
        if (!comment)
            return;
        var actions = [];
        return {
            c: "comment " + comment.kind, commentId: commentId, dirty: true,
            postRender: this.inject,
            mouseover: this.highlight, mouseleave: this.unhighlight, click: this.goTo,
            children: [
                { c: "comment-inner", children: [
                        comment.message ? { c: "message", text: comment.message } : undefined,
                        actions.length ? { c: "quick-actions", children: actions } : undefined,
                    ] }
            ] };
    };
    Comments.prototype.render = function () {
        var children = [];
        for (var _i = 0, _a = this.ordered; _i < _a.length; _i++) {
            var commentId = _a[_i];
            children.push(this.comment(commentId));
        }
        return { c: "comments-pane", children: children };
    };
    return Comments;
}());
function formatBar(_a) {
    var editor = _a.editor;
    var doc = editor.cm.getDoc();
    var cursor = doc.getCursor("to");
    var bottom = editor.cm.cursorCoords(cursor, undefined).bottom;
    var left = editor.cm.cursorCoords(cursor, "local").left;
    return { id: "format-bar", c: "format-bar", top: bottom, left: left, children: [
            { text: "B", click: function () { return editor.format({ type: "strong" }, true); } },
            { text: "I", click: function () { return editor.format({ type: "emph" }, true); } },
            { text: "code", click: function () { return editor.format({ type: "code" }, true); } },
            { text: "H1", click: function () { return editor.format({ type: "heading", level: 1 }, true); } },
            { text: "H2", click: function () { return editor.format({ type: "heading", level: 2 }, true); } },
            { text: "H3", click: function () { return editor.format({ type: "heading", level: 3 }, true); } },
            { text: "block", click: function () { return editor.format({ type: "code_block" }, true); } },
        ] };
}
//---------------------------------------------------------
// New Block
//---------------------------------------------------------
/* - Button in left margin
 * - Only appears on blank lines with editor focused
 * - Text: Block / List / Quote / H(?)
 */
function newBlockBar(elem) {
    var editor = elem.editor, active = elem.active;
    var doc = editor.cm.getDoc();
    var cursor = doc.getCursor();
    var top = editor.cm.cursorCoords(cursor, undefined).top;
    var left = 0;
    return { id: "new-block-bar", c: "new-block-bar " + (active ? "active" : ""), top: top, left: left, children: [
            { c: "new-block-bar-toggle ion-plus", click: function () {
                    elem.active = !elem.active;
                    editor.cm.focus();
                    editor.queueUpdate();
                } },
            { c: "flex-row controls", children: [
                    { text: "block", click: function () { return editor.format({ type: "code_block" }, true); } },
                    { text: "list", click: function () { return editor.format({ type: "item" }, true); } },
                    { text: "H1", click: function () { return editor.format({ type: "heading", level: 1 }, true); } },
                    { text: "H2", click: function () { return editor.format({ type: "heading", level: 2 }, true); } },
                    { text: "H3", click: function () { return editor.format({ type: "heading", level: 3 }, true); } }
                ] }
        ] };
}
//---------------------------------------------------------
// Modals
//---------------------------------------------------------
/* - Transient
 * - Anchors to bottom of screen
 * - Scrolls targeted element back into view, if any
 * - Modals:
 *   - Something's wrong
 */
function modalWrapper() {
    return {};
}
//---------------------------------------------------------
// Root
//---------------------------------------------------------
var IDE = (function () {
    function IDE() {
        var _this = this;
        this._fileCache = {};
        /** Whether the active document has been loaded. */
        this.loaded = false;
        /** Whether the IDE is currently loading a new document. */
        this.loading = false;
        /** The current editor generation. Used for imposing a relative ordering on parses. */
        this.generation = 0;
        /** Whether the currently open document is a modified version of an example. */
        this.modified = false;
        /** Whether the inspector is currently active. */
        this.inspecting = false;
        /** Whether the next click should be an inspector click automatically (as opposed to requiring Cmd or Ctrl modifiers. */
        this.inspectingClick = false;
        this.renderer = new microReact_1.Renderer();
        this.notices = [];
        this.languageService = new LanguageService();
        this.navigator = new Navigator(this);
        this.editor = new Editor(this);
        this.comments = new Comments(this);
        this.queueUpdate = util_1.debounce(function (shouldEval) {
            if (shouldEval === void 0) { shouldEval = false; }
            if (_this.editor.dirty) {
                _this.generation++;
                if (_this.onChange)
                    _this.onChange(_this);
                _this.editor.dirty = false;
                client_1.sendEvent([{ tag: ["inspector", "clear"] }]);
                _this.saveDocument();
                if (shouldEval) {
                    if (_this.documentId === "quickstart.eve") {
                        _this.eval(false);
                    }
                    else {
                        _this.eval(true);
                    }
                }
            }
            _this.render();
        }, 1, true);
        this.inputState = {
            mouse: { 1: false },
            keyboard: { shift: false }
        };
        this.updateMouseInputState = function (event) {
            var mouse = _this.inputState.mouse;
            var neue = !!(event.buttons & 1);
            if (!neue && mouse["1"])
                _this.editor.updateFormatters();
            mouse["1"] = neue;
        };
        this.updateKeyboardInputState = function (event) {
            var keyboard = _this.inputState.keyboard;
            var neue = event.shiftKey;
            if (!neue && keyboard.shift)
                _this.editor.updateFormatters();
            keyboard.shift = neue;
        };
        //-------------------------------------------------------
        // Actions
        //-------------------------------------------------------
        this.activeActions = {};
        this.actions = {
            insert: {
                "mark-between": function (action) {
                    var source = { type: action.type[0] };
                    for (var attribute in action) {
                        if (action[attribute] === undefined)
                            continue;
                        source[attribute] = action[attribute].length === 1 ? action[attribute][0] : action[attribute];
                    }
                    if (action.span) {
                        action.spans = _this.editor.markBetween(action.span, source, action.bounds);
                    }
                    if (action.range) {
                        var doc = _this.editor.cm.getDoc();
                        action.spans = action.spans || [];
                        var ranges = [];
                        for (var _i = 0, _a = action.range; _i < _a.length; _i++) {
                            var rangeId = _a[_i];
                            var rangeRecord = client_1.indexes.records.index[rangeId];
                            if (!rangeRecord || !rangeRecord.start || !rangeRecord.stop)
                                continue;
                            ranges.push({ from: doc.posFromIndex(rangeRecord.start[0]), to: doc.posFromIndex(rangeRecord.stop[0]) });
                        }
                        action.spans.push.apply(action.spans, _this.editor.markBetween(ranges, source, action.bounds));
                    }
                },
                "mark-span": function (action) {
                    action.spans = [];
                    var ranges = [];
                    if (action.span) {
                        for (var _i = 0, _a = action.span; _i < _a.length; _i++) {
                            var spanId = _a[_i];
                            var span = _this.editor.getSpanBySourceId(spanId);
                            var range = span && span.find();
                            if (span.isBlock() && action.type[0] === "document_widget") {
                                range = { from: range.from, to: { line: range.to.line - 1, ch: 0 } };
                            }
                            if (range)
                                ranges.push(range);
                        }
                    }
                    var source = { type: action.type[0] };
                    for (var attribute in action) {
                        if (action[attribute] === undefined)
                            continue;
                        source[attribute] = action[attribute].length === 1 ? action[attribute][0] : action[attribute];
                    }
                    for (var _b = 0, ranges_3 = ranges; _b < ranges_3.length; _b++) {
                        var range = ranges_3[_b];
                        action.spans.push(_this.editor.markSpan(range.from, range.to, source));
                    }
                },
                "mark-range": function (action) {
                    var source = { type: action.type[0] };
                    for (var attribute in action) {
                        var value = action[attribute];
                        if (value === undefined)
                            continue;
                        source[attribute] = value.length === 1 ? value[0] : value;
                    }
                    var doc = _this.editor.cm.getDoc();
                    var start = doc.posFromIndex(action.start[0]);
                    var stop = doc.posFromIndex(action.stop[0]);
                    action.span = _this.editor.markSpan(start, stop, source);
                },
                "jump-to": function (action) {
                    var from;
                    if (action.position) {
                        var doc = _this.editor.cm.getDoc();
                        var min = Infinity;
                        for (var _i = 0, _a = action.position; _i < _a.length; _i++) {
                            var index = _a[_i];
                            if (index < min)
                                min = index;
                        }
                        from = doc.posFromIndex(min);
                    }
                    if (action.span) {
                        for (var _b = 0, _c = action.span; _b < _c.length; _b++) {
                            var spanId = _c[_b];
                            var span = _this.editor.getSpanBySourceId(spanId);
                            if (!span)
                                continue;
                            var loc = span.find();
                            if (!loc)
                                continue;
                            if (!from || util_1.comparePositions(loc.from, from) < 0)
                                from = loc.from;
                        }
                    }
                    if (from) {
                        _this.editor.scrollToPosition(from);
                    }
                },
                "find-section": function (action, actionId) {
                    var doc = _this.editor.cm.getDoc();
                    var records = [];
                    if (action.position) {
                        for (var _i = 0, _a = action.position; _i < _a.length; _i++) {
                            var index = _a[_i];
                            var pos = doc.posFromIndex(index);
                            var heading = _this.editor.findHeadingAt(pos);
                            if (heading) {
                                var range = heading.getSectionRange();
                                records.push({ tag: ["section", "editor"], position: index, heading: heading.source.id, start: doc.indexFromPos(range.from), stop: doc.indexFromPos(range.to) });
                            }
                            else {
                                records.push({ tag: ["section", "editor"], position: index, start: 0, stop: doc.getValue().length });
                            }
                        }
                    }
                    if (action.span) {
                        for (var _b = 0, _c = action.span; _b < _c.length; _b++) {
                            var spanId = _c[_b];
                            var span = _this.editor.getSpanBySourceId(spanId);
                            if (!span)
                                continue;
                            var loc = span.find();
                            if (!loc)
                                continue;
                            var pos = loc.from;
                            var heading = _this.editor.findHeadingAt(pos);
                            if (heading) {
                                var range = heading.getSectionRange();
                                records.push({ tag: ["section", "editor"], span: spanId, heading: heading.source.id, start: doc.indexFromPos(range.from), stop: doc.indexFromPos(range.to) });
                            }
                            else {
                                records.push({ tag: ["section", "editor"], span: spanId, start: 0, stop: doc.getValue().length });
                            }
                        }
                    }
                    if (records.length) {
                        for (var _d = 0, records_1 = records; _d < records_1.length; _d++) {
                            var record = records_1[_d];
                            record.action = actionId;
                        }
                        client_1.sendEvent(records);
                    }
                },
                "elide-between-sections": function (action, actionId) {
                    var doc = _this.editor.cm.getDoc();
                    var visibleHeadings = [];
                    if (action.position) {
                        for (var _i = 0, _a = action.position; _i < _a.length; _i++) {
                            var index = _a[_i];
                            var pos = doc.posFromIndex(index);
                            var heading = _this.editor.findHeadingAt(pos);
                            if (heading)
                                visibleHeadings.push(heading);
                        }
                    }
                    if (action.span) {
                        for (var _b = 0, _c = action.span; _b < _c.length; _b++) {
                            var spanId = _c[_b];
                            var span = _this.editor.getSpanBySourceId(spanId);
                            if (!span)
                                continue;
                            var loc = span.find();
                            if (!loc)
                                continue;
                            var pos = loc.from;
                            var heading = _this.editor.findHeadingAt(pos);
                            if (heading)
                                visibleHeadings.push(heading);
                        }
                    }
                    var headings = _this.editor.getAllSpans("heading");
                    for (var _d = 0, headings_2 = headings; _d < headings_2.length; _d++) {
                        var heading = headings_2[_d];
                        if (visibleHeadings.indexOf(heading) === -1) {
                            heading.hide();
                        }
                        else {
                            heading.unhide();
                        }
                    }
                    _this.navigator.updateElision();
                },
                "find-source": function (action, actionId) {
                    var record = action.record && action.record[0];
                    var attribute = action.attribute && action.attribute[0];
                    var span = action.span && action.span[0];
                    _this.languageService.findSource({ record: record, attribute: attribute, span: span }, _this.languageService.unpackSource(function (records) {
                        for (var _i = 0, records_2 = records; _i < records_2.length; _i++) {
                            var record_1 = records_2[_i];
                            record_1.tag.push("editor");
                            record_1["action"] = actionId;
                        }
                        client_1.sendEvent(records);
                    }));
                },
                "find-related": function (action, actionId) {
                    _this.languageService.findRelated({ span: action.span, variable: action.variable }, _this.languageService.unpackRelated(function (records) {
                        for (var _i = 0, records_3 = records; _i < records_3.length; _i++) {
                            var record = records_3[_i];
                            record.tag.push("editor");
                            record["action"] = actionId;
                        }
                        client_1.sendEvent(records);
                    }));
                },
                "find-value": function (action, actionId) {
                    var given;
                    if (action.given) {
                        given = {};
                        for (var _i = 0, _a = action.given; _i < _a.length; _i++) {
                            var avId = _a[_i];
                            var av = client_1.indexes.records.index[avId];
                            given[av.attribute] = av.value;
                        }
                    }
                    _this.languageService.findValue({ variable: action.variable, given: given }, _this.languageService.unpackValue(function (records) {
                        var doc = _this.editor.cm.getDoc();
                        for (var _i = 0, records_4 = records; _i < records_4.length; _i++) {
                            var record = records_4[_i];
                            record.tag.push("editor");
                            record["action"] = actionId;
                        }
                        client_1.sendEvent(records);
                    }));
                },
                "find-cardinality": function (action, actionId) {
                    _this.languageService.findCardinality({ variable: action.variable }, _this.languageService.unpackCardinality(function (records) {
                        for (var _i = 0, records_5 = records; _i < records_5.length; _i++) {
                            var record = records_5[_i];
                            record.tag.push("editor");
                            record["action"] = actionId;
                        }
                        client_1.sendEvent(records);
                    }));
                },
                "find-affector": function (action, actionId) {
                    _this.languageService.findAffector({
                        record: action.record && action.record[0],
                        attribute: action.attribute && action.attribute[0],
                        span: action.span && action.span[0]
                    }, _this.languageService.unpackAffector(function (records) {
                        for (var _i = 0, records_6 = records; _i < records_6.length; _i++) {
                            var record = records_6[_i];
                            record.tag.push("editor");
                            record["action"] = actionId;
                        }
                        client_1.sendEvent(records);
                    }));
                },
                "find-failure": function (action, actionId) {
                    _this.languageService.findFailure({ block: action.block }, _this.languageService.unpackFailure(function (records) {
                        for (var _i = 0, records_7 = records; _i < records_7.length; _i++) {
                            var record = records_7[_i];
                            record.tag.push("editor");
                            record["action"] = actionId;
                        }
                        client_1.sendEvent(records);
                    }));
                },
                "find-root-drawers": function (action, actionId) {
                    _this.languageService.findRootDrawer(null, _this.languageService.unpackRootDrawer(function (records) {
                        for (var _i = 0, records_8 = records; _i < records_8.length; _i++) {
                            var record = records_8[_i];
                            record.tag.push("editor");
                            record["action"] = actionId;
                        }
                        client_1.sendEvent(records);
                    }));
                },
                "find-performance": function (action, actionId) {
                    _this.languageService.findPerformance(null, _this.languageService.unpackPerformance(function (records) {
                        for (var _i = 0, records_9 = records; _i < records_9.length; _i++) {
                            var record = records_9[_i];
                            record.tag.push("editor");
                            record["action"] = actionId;
                        }
                        client_1.sendEvent(records);
                    }));
                },
                "inspector": function (action, actionId) {
                    _this.inspecting = true;
                    var inspectorElem = renderer_1.activeElements[actionId];
                    if (!inspectorElem)
                        return;
                    if (action["in-editor"])
                        _this.editor.cm.getWrapperElement().appendChild(inspectorElem);
                    if (action.x && action.y) {
                        inspectorElem.style.position = "absolute";
                        inspectorElem.style.left = action.x[0];
                        inspectorElem.style.top = action.y[0];
                    }
                    _this.queueUpdate();
                }
            },
            remove: {
                "mark-between": function (action) {
                    if (!action.spans)
                        return;
                    for (var _i = 0, _a = action.spans; _i < _a.length; _i++) {
                        var span = _a[_i];
                        span.clear();
                    }
                },
                "mark-span": function (action) {
                    if (!action.spans)
                        return;
                    for (var _i = 0, _a = action.spans; _i < _a.length; _i++) {
                        var span = _a[_i];
                        span.clear();
                    }
                },
                "mark-range": function (action) {
                    if (!action.span)
                        return;
                    action.span.clear();
                },
                "elide-between-sections": function (action, actionId) {
                    for (var _i = 0, _a = _this.editor.getAllSpans("elision"); _i < _a.length; _i++) {
                        var span = _a[_i];
                        span.clear();
                    }
                },
                "inspector": function (action, actionId) {
                    _this.inspecting = false;
                    _this.queueUpdate();
                }
            },
        };
        //-------------------------------------------------------
        // Views
        //-------------------------------------------------------
        this.activeViews = {};
        this.updateInspector = function (event) {
            var pane = _this.findPaneAt(event.pageX, event.pageY);
            if (!(event.ctrlKey || event.metaKey || _this.inspectingClick))
                return;
            _this.inspectingClick = false;
            var events = [];
            if (pane === "editor") {
                var pos = _this.editor.cm.coordsChar({ left: event.pageX, top: event.pageY });
                var spans = _this.editor.findSpansAt(pos).sort(spans_1.compareSpans);
                var editorContainer = _this.editor.cm.getWrapperElement();
                var bounds = editorContainer.getBoundingClientRect();
                var x = event.clientX - bounds.left;
                var y = event.clientY - bounds.top;
                while (spans.length) {
                    var span = spans.shift();
                    if (!span.isEditorControlled() || span.type === "code_block") {
                        events.push({ tag: ["inspector", "inspect", spans.length === 0 ? "direct-target" : undefined], target: span.source.id, type: span.source.type, x: x, y: y });
                    }
                }
            }
            else if (pane === "application") {
                var appContainer = document.querySelector(".application-root > .application-container > .program");
                var x = event.clientX - appContainer.offsetLeft;
                var y = event.clientY - appContainer.offsetTop;
                var current = event.target;
                while (current && current.entity) {
                    events.push({ tag: ["inspector", "inspect", current === event.target ? "direct-target" : undefined], target: current.entity, type: "element", x: x, y: y });
                    current = current.parentNode;
                }
                // If we didn't click on an element, inspect the root.
                if (events.length === 0) {
                    events.push({ tag: ["inspector", "inspect", "direct-target"], type: "root", x: x, y: y });
                }
            }
            _this.queueUpdate();
            if (events.length) {
                client_1.sendEvent(events);
                event.preventDefault();
                event.stopPropagation();
            }
        };
        document.body.appendChild(this.renderer.content);
        this.renderer.content.classList.add("ide-root");
        this.enableInspector();
        this.monitorInputState();
    }
    IDE.prototype.elem = function () {
        return { c: "editor-root", children: [
                this.navigator.render(),
                { c: "main-pane", children: [
                        this.noticesElem(),
                        this.editor.render(),
                    ] },
                this.comments.render()
            ] };
    };
    IDE.prototype.noticesElem = function () {
        var items = [];
        for (var _i = 0, _a = this.notices; _i < _a.length; _i++) {
            var notice = _a[_i];
            var time = new Date(notice.time);
            items.push({ c: "notice " + notice.type + " flex-row", children: [
                    { c: "time", text: time.getHours() + ":" + time.getMinutes() + ":" + time.getSeconds() },
                    { c: "message", text: notice.message }
                ] });
        }
        if (items.length) {
            return { c: "notices", children: items };
        }
    };
    IDE.prototype.render = function () {
        // Update child states as necessary
        this.renderer.render([this.elem()]);
    };
    IDE.prototype.loadFile = function (docId) {
        if (this.loading || this.documentId === docId)
            return;
        var saves = JSON.parse(localStorage.getItem("eve-saves") || "{}");
        var code = saves[docId];
        if (code) {
            this.modified = true;
        }
        else {
            code = this._fileCache[docId];
            this.modified = false;
        }
        if (!code)
            throw new Error("Unable to load uncached file: '" + docId + "'");
        this.loaded = false;
        this.documentId = docId;
        this.editor.reset();
        this.notices = [];
        this.loading = true;
        this.onLoadFile(this, docId, code);
    };
    IDE.prototype.loadWorkspace = function (directory, files) {
        this._fileCache = files;
        this.navigator.loadWorkspace("root", directory, files);
    };
    IDE.prototype.loadDocument = function (generation, text, packed, attributes) {
        if (generation < this.generation && generation !== undefined)
            return;
        if (this.loaded) {
            this.editor.updateDocument(packed, attributes);
        }
        else {
            this.editor.loadDocument(this.documentId, text, packed, attributes);
            this.loaded = true;
            this.loading = false;
        }
        if (this.documentId) {
            var name_1 = this.documentId; // @FIXME
            this.navigator.loadDocument(this.documentId, name_1);
            this.navigator.currentId = this.documentId;
            this.comments.update();
        }
        else {
        }
        this.render();
    };
    IDE.prototype.saveDocument = function () {
        if (!this.documentId || !this.loaded)
            return;
        var saves = JSON.parse(localStorage.getItem("eve-saves") || "{}");
        var md = this.editor.toMarkdown();
        if (md !== this._fileCache[this.documentId]) {
            saves[this.documentId] = md;
            this.modified = true;
        }
        else {
            this.modified = false;
        }
        localStorage.setItem("eve-saves", JSON.stringify(saves));
    };
    IDE.prototype.revertDocument = function () {
        if (!this.documentId || !this.loaded)
            return;
        var docId = this.documentId;
        var saves = JSON.parse(localStorage.getItem("eve-saves") || "{}");
        delete saves[docId];
        localStorage.setItem("eve-saves", JSON.stringify(saves));
        this.documentId = undefined;
        this.loadFile(docId);
    };
    IDE.prototype.injectSpans = function (packed, attributes) {
        this.editor.injectSpans(packed, attributes);
        this.comments.update();
        this.render();
    };
    IDE.prototype.injectNotice = function (type, message) {
        var time = Date.now();
        this.notices.push({ type: type, message: message, time: time });
        this.render();
        this.editor.cm.refresh();
    };
    IDE.prototype.eval = function (persist) {
        if (this.notices.length) {
            this.notices = [];
            this.render();
            this.editor.cm.refresh();
        }
        if (this.onEval)
            this.onEval(this, persist);
    };
    IDE.prototype.tokenInfo = function () {
        var doc = this.editor.cm.getDoc();
        var cursor = doc.getCursor();
        var spans = this.editor.findSpansAt(cursor).filter(function (span) { return span instanceof Spans.ParserSpan; });
        if (spans.length && this.onTokenInfo) {
            this.onTokenInfo(this, spans[0].source.id);
        }
    };
    IDE.prototype.monitorInputState = function () {
        window.addEventListener("mousedown", this.updateMouseInputState);
        window.addEventListener("mouseup", this.updateMouseInputState);
        window.addEventListener("keydown", this.updateKeyboardInputState);
        window.addEventListener("keyup", this.updateKeyboardInputState);
    };
    IDE.prototype.updateActions = function (inserts, removes, records) {
        var _this = this;
        this.editor.cm.operation(function () {
            for (var _i = 0, removes_1 = removes; _i < removes_1.length; _i++) {
                var recordId = removes_1[_i];
                var action = _this.activeActions[recordId];
                if (!action)
                    return;
                var run = _this.actions.remove[action.tag];
                //console.log("STOP", action.tag, recordId, action, !!run);
                if (run)
                    run(action);
                delete _this.activeActions[recordId];
            }
            for (var _a = 0, inserts_1 = inserts; _a < inserts_1.length; _a++) {
                var recordId = inserts_1[_a];
                var record = records[recordId];
                var bounds = void 0;
                if (record.within) {
                    var span = _this.editor.getSpanBySourceId(record.within[0]);
                    if (span)
                        bounds = span.find();
                }
                var action = { bounds: bounds };
                for (var _b = 0, _c = record.tag; _b < _c.length; _b++) {
                    var tag = _c[_b];
                    if (tag in _this.actions.insert || tag in _this.actions.remove) {
                        action.tag = tag;
                        break;
                    }
                }
                if (!action.tag)
                    continue;
                for (var attr in record) {
                    if (!action[attr])
                        action[attr] = record[attr];
                }
                _this.activeActions[recordId] = action;
                var run = _this.actions.insert[action.tag];
                //console.log("START", action.tag, recordId, action, !!run);
                if (!run)
                    console.warn("Unable to run unknown action type '" + action.tag + "'", recordId, record);
                else
                    run(action, recordId);
            }
        });
    };
    IDE.prototype.updateViews = function (inserts, removes, records) {
        for (var _i = 0, removes_2 = removes; _i < removes_2.length; _i++) {
            var recordId = removes_2[_i];
            var view = this.activeViews[recordId];
            if (!view)
                continue;
            // Detach view
            if (view.widget)
                view.widget.clear();
            view.widget = undefined;
        }
        for (var _a = 0, inserts_2 = inserts; _a < inserts_2.length; _a++) {
            var recordId = inserts_2[_a];
            // if the view already has a parent, leave it be.
            if (client_1.indexes.byChild.index[recordId])
                continue;
            // If the view is already active, he doesn't need inserted again.
            if (this.activeViews[recordId] && this.activeViews[recordId].widget)
                continue;
            // Otherwise, we'll grab it and attach it to its creator in the editor.
            var record = records[recordId];
            var view = this.activeViews[recordId] = this.activeViews[recordId] || { record: recordId, container: document.createElement("div") };
            view.container.className = "view-container";
            //this.attachView(recordId, record.node)
            // Find the source node for this view.
            if (record.span) {
                this.attachView(recordId, record.span[0]);
            }
            else if (record.node) {
                client_1.send({ type: "findNode", recordId: recordId, node: record.node[0] });
            }
            else {
                console.warn("Unable to parent view that doesn't provide its origin node  or span id", record);
            }
        }
    };
    IDE.prototype.attachView = function (recordId, spanId) {
        var view = this.activeViews[recordId];
        // @NOTE: This isn't particularly kosher.
        var node = renderer_1.activeElements[recordId];
        if (!node)
            return;
        if (node !== view.container.firstChild) {
            view.container.appendChild(node);
        }
        var sourceSpan = view.span;
        if (spanId !== undefined) {
            sourceSpan = this.editor.getSpanBySourceId(spanId);
        }
        if (!sourceSpan)
            return;
        view.span = sourceSpan;
        var loc = sourceSpan.find();
        if (!loc)
            return;
        var line = loc.to.line;
        if (sourceSpan.isBlock())
            line -= 1;
        if (view.widget && line === view.line)
            return;
        if (view.widget) {
            view.widget.clear();
        }
        view.line = line;
        view.widget = this.editor.cm.addLineWidget(line, view.container);
    };
    //-------------------------------------------------------
    // Inspector
    //-------------------------------------------------------
    IDE.prototype.findPaneAt = function (x, y) {
        var editorContainer = this.editor.cm.getWrapperElement();
        var editor = editorContainer && editorContainer.getBoundingClientRect();
        var appContainer = document.querySelector(".application-container");
        var app = appContainer && appContainer.getBoundingClientRect(); // @FIXME: Not particularly durable
        if (editor && x >= editor.left && x <= editor.right &&
            y >= editor.top && y <= editor.bottom) {
            return "editor";
        }
        else if (app && x >= app.left && x <= app.right &&
            y >= app.top && y <= app.bottom) {
            return "application";
        }
    };
    IDE.prototype.enableInspector = function () {
        //window.addEventListener("mouseover", this.updateInspector);
        window.addEventListener("click", this.updateInspector, true);
    };
    IDE.prototype.disableInspector = function () {
        //window.removeEventListener("mouseover", this.updateInspector);
        window.removeEventListener("click", this.updateInspector, true);
    };
    IDE.prototype.toggleInspecting = function () {
        if (this.inspecting) {
            client_1.sendEvent([{ tag: ["inspector", "clear"] }]);
        }
        else {
            this.inspectingClick = true;
        }
        this.queueUpdate();
    };
    return IDE;
}());
exports.IDE = IDE;
var LanguageService = (function () {
    function LanguageService() {
        var _this = this;
        this._listeners = {};
        this.handleMessage = function (message) {
            var type = message.type;
            if (type === "findSource" || type === "findRelated" || type === "findValue" || type === "findCardinality" || type === "findAffector" || type === "findFailure" || type === "findRootDrawers" || type === "findPerformance") {
                var id = message.requestId;
                var listener = _this._listeners[id];
                if (listener) {
                    listener(message);
                    return true;
                }
            }
            return false;
        };
    }
    LanguageService.prototype.findSource = function (args, callback) {
        this.send("findSource", args, callback);
    };
    LanguageService.prototype.unpackSource = function (callback) {
        return function (message) {
            var records = [];
            for (var _i = 0, _a = message.source; _i < _a.length; _i++) {
                var source = _a[_i];
                var span = message.span || source.span;
                records.push({ tag: ["source"], record: message.record, attribute: message.attribute, span: span, block: source.block });
            }
            callback(records);
        };
    };
    LanguageService.prototype.findRelated = function (args, callback) {
        this.send("findRelated", args, callback);
    };
    LanguageService.prototype.unpackRelated = function (callback) {
        return function (message) {
            var records = [];
            // This isn't really correct, but we're rolling with it for now.
            for (var _i = 0, _a = message.span; _i < _a.length; _i++) {
                var span = _a[_i];
                records.push({ tag: ["related"], span: span, variable: message.variable });
            }
            callback(records);
        };
    };
    LanguageService.prototype.findValue = function (args, callback) {
        this.send("findValue", args, callback);
    };
    LanguageService.prototype.unpackValue = function (callback) {
        return function (message) {
            if (message.totalRows > message.rows.length) {
                // @TODO: Turn this into a fact.
                console.warn("Too many possible values, showing {{message.rows.length}} of {{message.totalRows}}");
            }
            var mappings = message.variableMappings;
            var names = message.variableNames;
            var records = [];
            for (var rowIx = 0, rowCount = message.rows.length; rowIx < rowCount; rowIx++) {
                var row = message.rows[rowIx];
                for (var variable in mappings) {
                    var register = mappings[variable];
                    records.push({ tag: ["value"], row: rowIx + 1, variable: variable, value: row[register], register: register, name: names[variable] });
                }
            }
            callback(records);
        };
    };
    LanguageService.prototype.findCardinality = function (args, callback) {
        this.send("findCardinality", args, callback);
    };
    LanguageService.prototype.unpackCardinality = function (callback) {
        return function (message) {
            var records = [];
            for (var variable in message.cardinality) {
                records.push({ tag: ["cardinality"], variable: variable, cardinality: message.cardinality[variable] });
            }
            callback(records);
        };
    };
    LanguageService.prototype.findAffector = function (args, callback) {
        this.send("findAffector", args, callback);
    };
    LanguageService.prototype.unpackAffector = function (callback) {
        return function (message) {
            var records = [];
            for (var _i = 0, _a = message.affector; _i < _a.length; _i++) {
                var affector = _a[_i];
                records.push({ tag: ["affector"], record: message.record, attribute: message.attribute, span: message.span, block: affector.block, action: affector.action });
            }
            callback(records);
        };
    };
    LanguageService.prototype.findFailure = function (args, callback) {
        this.send("findFailure", args, callback);
    };
    LanguageService.prototype.unpackFailure = function (callback) {
        return function (message) {
            var records = [];
            for (var _i = 0, _a = message.span; _i < _a.length; _i++) {
                var failure = _a[_i];
                records.push({ tag: ["failure"], block: failure.block, start: failure.start, stop: failure.stop });
            }
            callback(records);
        };
    };
    LanguageService.prototype.findRootDrawer = function (args, callback) {
        this.send("findRootDrawers", args || {}, callback);
    };
    LanguageService.prototype.unpackRootDrawer = function (callback) {
        return function (message) {
            var records = [];
            for (var _i = 0, _a = message.drawers; _i < _a.length; _i++) {
                var drawer = _a[_i];
                records.push({ tag: ["root-drawer"], span: drawer.id, start: drawer.start, stop: drawer.stop });
            }
            callback(records);
        };
    };
    LanguageService.prototype.findPerformance = function (args, callback) {
        this.send("findPerformance", args || {}, callback);
    };
    LanguageService.prototype.unpackPerformance = function (callback) {
        return function (message) {
            var records = [];
            for (var blockId in message.blocks) {
                var block = message.blocks[blockId];
                records.push({ tag: ["performance"], block: blockId, average: block.avg, calls: block.calls, color: block.color, max: block.max, min: block.min, percent: block.percentFixpoint, total: block.time });
            }
            callback(records);
        };
    };
    LanguageService.prototype.send = function (type, args, callback) {
        var id = LanguageService._requestId++;
        args.requestId = id;
        this._listeners[id] = callback;
        args.type = type;
        //console.log("SENT", args);
        client_1.send(args);
    };
    LanguageService._requestId = 0;
    return LanguageService;
}());
//# sourceMappingURL=ide.js.map