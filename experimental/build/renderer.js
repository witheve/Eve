"use strict";
var microReact_1 = require("microReact");
var util_1 = require("./util");
var editor_1 = require("./editor");
var MarkdownEditor = require("./editor");
var client_1 = require("./client");
;
;
function isInputElem(elem) {
    return elem && elem.tagName === "INPUT";
}
function isSelectElem(elem) {
    return elem && elem.tagName === "SELECT";
}
function setActiveIds(ids) {
    for (var k in exports.activeIds) {
        exports.activeIds[k] = undefined;
    }
    for (var k in ids) {
        exports.activeIds[k] = ids[k];
    }
}
exports.setActiveIds = setActiveIds;
//---------------------------------------------------------
// MicroReact-based record renderer
//---------------------------------------------------------
exports.renderer = new microReact_1.Renderer();
document.body.appendChild(exports.renderer.content);
// These will get maintained by the client as diffs roll in
exports.sentInputValues = {};
exports.activeIds = {};
// root will get added to the dom by the program microReact element in renderEditor
exports.activeElements = { "root": document.createElement("div") };
exports.activeElements.root.className = "program";
var supportedTags = {
    "div": true, "span": true, "input": true, "ul": true, "li": true, "label": true, "button": true, "header": true, "footer": true, "a": true, "strong": true,
    "h1": true, "h2": true, "h3": true, "h4": true, "h5": true, "h6": true,
    "ol": true, "p": true, "pre": true, "em": true, "img": true, "canvas": true, "script": true, "style": true, "video": true,
    "table": true, "tbody": true, "thead": true, "tr": true, "th": true, "td": true,
    "form": true, "optgroup": true, "option": true, "select": true, "textarea": true,
    "title": true, "meta": true, "link": true,
    "svg": true, "circle": true, "line": true, "rect": true, "polygon": true, "text": true, "image": true, "defs": true, "pattern": true, "linearGradient": true, "g": true, "path": true
};
var svgs = { "svg": true, "circle": true, "line": true, "rect": true, "polygon": true, "text": true, "image": true, "defs": true, "pattern": true, "linearGradient": true, "g": true, "path": true };
// Map of input entities to a queue of their values which originated from the client and have not been received from the server yet.
var lastFocusPath = null;
var selectableTypes = { "": true, undefined: true, text: true, search: true, password: true, tel: true, url: true };
function insertSorted(parent, child) {
    var current;
    for (var curIx = 0; curIx < parent.childNodes.length; curIx++) {
        var cur = parent.childNodes[curIx];
        if (cur.sort !== undefined && cur.sort > child.sort) {
            current = cur;
            break;
        }
    }
    if (current) {
        parent.insertBefore(child, current);
    }
    else {
        parent.appendChild(child);
    }
}
var _suppressBlur = false; // This global is set when the records are being re-rendered, to prevent false blurs from mucking up focus tracking.
function renderRecords() {
    _suppressBlur = true;
    var lastActiveElement = null;
    if (document.activeElement && document.activeElement.entity) {
        lastActiveElement = document.activeElement;
    }
    var records = client_1.indexes.records.index;
    var dirty = client_1.indexes.dirty.index;
    var activeClasses = client_1.indexes.byClass.index || {};
    var activeStyles = client_1.indexes.byStyle.index || {};
    var activeChildren = client_1.indexes.byChild.index || {};
    var regenClassesFor = [];
    var regenStylesFor = [];
    for (var entityId in dirty) {
        var entity = records[entityId];
        var elem = exports.activeElements[entityId];
        if (dirty[entityId].indexOf("tag") !== -1) {
            var values = entity.tag || [];
            var tag = void 0;
            for (var _i = 0, values_1 = values; _i < values_1.length; _i++) {
                var val = values_1[_i];
                if (supportedTags[val]) {
                    if (tag)
                        console.error("Unable to set 'tag' multiple times on entity", entity, entity.tag);
                    tag = val;
                }
            }
            if (!tag && elem && elem !== exports.activeElements.root) {
                var parent_1 = elem.parentNode;
                if (parent_1)
                    parent_1.removeChild(elem);
                elem = exports.activeElements[entityId] = null;
            }
            else if (tag && elem && elem.tagName !== tag.toUpperCase()) {
                var parent_2 = elem.parentNode;
                if (parent_2)
                    parent_2.removeChild(elem);
                if (svgs[tag]) {
                    elem = document.createElementNS("http://www.w3.org/2000/svg", tag);
                }
                else {
                    elem = document.createElement(tag || "div");
                }
                // Mark all attributes of the entity dirty to rerender them into the new element
                for (var attribute in entity) {
                    if (dirty[entityId].indexOf(attribute) == -1) {
                        dirty[entityId].push(attribute);
                    }
                }
                elem.entity = entityId;
                exports.activeElements[entityId] = elem;
                elem.sort = entity.sort || entity["eve-auto-index"] || "";
                if (parent_2)
                    insertSorted(parent_2, elem);
            }
            else if (tag && !elem) {
                if (svgs[tag]) {
                    elem = document.createElementNS("http://www.w3.org/2000/svg", tag);
                }
                else {
                    elem = document.createElement(tag || "div");
                }
                elem.entity = entityId;
                exports.activeElements[entityId] = elem;
                if (entity.sort && entity.sort.length > 1)
                    console.error("Unable to set 'sort' multiple times on entity", entity, entity.sort);
                elem.sort = (entity.sort && entity.sort[0]) || (entity["eve-auto-index"] && entity["eve-auto-index"][0]) || "";
                var parent_3 = exports.activeElements[activeChildren[entityId] || "root"];
                if (parent_3) {
                    insertSorted(parent_3, elem);
                }
            }
        }
        if (activeClasses[entityId]) {
            for (var _a = 0, _b = activeClasses[entityId]; _a < _b.length; _a++) {
                var entId = _b[_a];
                regenClassesFor.push(entId);
            }
        }
        else if (activeStyles[entityId]) {
            for (var _c = 0, _d = activeStyles[entityId]; _c < _d.length; _c++) {
                var entId = _d[_c];
                regenStylesFor.push(entId);
            }
        }
        if (!elem)
            continue;
        for (var _e = 0, _f = dirty[entityId]; _e < _f.length; _e++) {
            var attribute = _f[_e];
            var value = entity[attribute];
            if (attribute === "children") {
                if (!value) {
                    while (elem.lastElementChild) {
                        elem.removeChild(elem.lastElementChild);
                    }
                }
                else {
                    var children = (value && util_1.clone(value)) || [];
                    // Remove any children that no longer belong
                    for (var ix = elem.childNodes.length - 1; ix >= 0; ix--) {
                        if (!(elem.childNodes[ix] instanceof Element))
                            continue;
                        var child = elem.childNodes[ix];
                        var childIx = children.indexOf(child.entity);
                        if (childIx == -1) {
                            elem.removeChild(child);
                            child._parent = null;
                        }
                        else {
                            children.splice(childIx, 1);
                        }
                    }
                    // Add any new children which already exist
                    for (var _g = 0, children_1 = children; _g < children_1.length; _g++) {
                        var childId = children_1[_g];
                        var child = exports.activeElements[childId];
                        if (child) {
                            insertSorted(elem, child);
                        }
                    }
                }
            }
            else if (attribute === "class") {
                regenClassesFor.push(entityId);
            }
            else if (attribute === "style") {
                regenStylesFor.push(entityId);
            }
            else if (attribute === "text") {
                elem.textContent = (value && value.join(", ")) || "";
            }
            else if (attribute === "value") {
                var input = elem;
                if (!value) {
                    input.value = "";
                }
                else if (value.length > 1) {
                    console.error("Unable to set 'value' multiple times on entity", entity, JSON.stringify(value));
                }
                else {
                    input.value = value[0]; // @FIXME: Should this really be setAttribute?
                }
            }
            else if (attribute === "checked") {
                if (value && value.length > 1) {
                    console.error("Unable to set 'checked' multiple times on entity", entity, value);
                }
                else if (value && value[0]) {
                    elem.setAttribute("checked", "true");
                }
                else {
                    elem.removeAttribute("checked");
                }
            }
            else {
                value = value && value.join(", ");
                if (value === undefined) {
                    elem.removeAttribute(attribute);
                }
                else {
                    elem.setAttribute(attribute, value);
                }
            }
        }
        var attrs = Object.keys(entity);
    }
    for (var _h = 0, regenClassesFor_1 = regenClassesFor; _h < regenClassesFor_1.length; _h++) {
        var entityId = regenClassesFor_1[_h];
        var elem = exports.activeElements[entityId];
        if (!elem)
            continue;
        var entity = records[entityId];
        var value = entity["class"];
        if (!value) {
            elem.className = "";
        }
        else {
            var neue = [];
            for (var _j = 0, value_1 = value; _j < value_1.length; _j++) {
                var klassId = value_1[_j];
                if (klassId[0] == "⦑" && klassId[klassId.length - 1] == "⦒" && activeClasses[klassId]) {
                    var klass = records[klassId];
                    for (var name_1 in klass) {
                        if (!klass[name_1])
                            continue;
                        if (klass[name_1].length > 1) {
                            console.error("Unable to set class attribute to multiple values on entity", entity, name_1, klass[name_1]);
                            continue;
                        }
                        if (klass[name_1][0] && neue.indexOf(name_1) === -1) {
                            neue.push(name_1);
                        }
                    }
                }
                else {
                    neue.push(klassId);
                }
            }
            elem.className = neue.join(" ");
        }
    }
    for (var _k = 0, regenStylesFor_1 = regenStylesFor; _k < regenStylesFor_1.length; _k++) {
        var entityId = regenStylesFor_1[_k];
        var elem = exports.activeElements[entityId];
        if (!elem)
            continue;
        var entity = records[entityId];
        var value = entity["style"];
        elem.removeAttribute("style"); // @FIXME: This could be optimized to care about the diff rather than blowing it all away
        if (value) {
            var neue = [];
            for (var _l = 0, value_2 = value; _l < value_2.length; _l++) {
                var styleId = value_2[_l];
                if (styleId[0] == "⦑" && styleId[styleId.length - 1] == "⦒" && activeStyles[styleId]) {
                    var style = records[styleId];
                    for (var attr in style) {
                        elem.style[attr] = style[attr] && style[attr].join(", ");
                    }
                }
                else {
                    neue.push(styleId);
                }
            }
            if (neue.length) {
                var s = elem.getAttribute("style");
                elem.setAttribute("style", (s ? (s + "; ") : "") + neue.join("; "));
            }
        }
    }
    if (lastFocusPath && lastActiveElement && isInputElem(lastActiveElement)) {
        var current = exports.activeElements.root;
        var ix = 0;
        for (var _m = 0, lastFocusPath_1 = lastFocusPath; _m < lastFocusPath_1.length; _m++) {
            var segment = lastFocusPath_1[_m];
            current = current.childNodes[segment];
            if (!current) {
                lastActiveElement.blur();
                lastFocusPath = null;
                break;
            }
            ix++;
        }
        if (current && current.entity !== lastActiveElement.entity) {
            var curElem = current;
            curElem.focus();
            if (isInputElem(lastActiveElement) && isInputElem(current) && selectableTypes[lastActiveElement.type] && selectableTypes[current.type]) {
                current.setSelectionRange(lastActiveElement.selectionStart, lastActiveElement.selectionEnd);
            }
        }
    }
    _suppressBlur = false;
}
exports.renderRecords = renderRecords;
//---------------------------------------------------------
// Event bindings to forward events to the server
//---------------------------------------------------------
window.addEventListener("click", function (event) {
    var target = event.target;
    var current = target;
    var objs = [];
    while (current) {
        if (current.entity) {
            var tag = ["click"];
            if (current == target) {
                tag.push("direct-target");
            }
            objs.push({ tag: tag, element: current.entity });
        }
        current = current.parentElement;
    }
    client_1.sendEvent(objs);
});
window.addEventListener("dblclick", function (event) {
    var target = event.target;
    var current = target;
    var objs = [];
    while (current) {
        if (current.entity) {
            var tag = ["double-click"];
            if (current == target) {
                tag.push("direct-target");
            }
            objs.push({ tag: tag, element: current.entity });
        }
        current = current.parentElement;
    }
    client_1.sendEvent(objs);
});
window.addEventListener("input", function (event) {
    var target = event.target;
    if (target.entity) {
        if (!exports.sentInputValues[target.entity]) {
            exports.sentInputValues[target.entity] = [];
        }
        exports.sentInputValues[target.entity].push(target.value);
        client_1.sendEvent([{ tag: ["change"], element: target.entity, value: target.value }]);
    }
});
window.addEventListener("change", function (event) {
    var target = event.target;
    if (target.tagName == "INPUT" || target.tagName == "TEXTAREA")
        return;
    if (target.entity) {
        if (!exports.sentInputValues[target.entity]) {
            exports.sentInputValues[target.entity] = [];
        }
        var value = target.value;
        if (isSelectElem(target)) {
            value = target.options[target.selectedIndex].value;
        }
        exports.sentInputValues[target.entity].push(value);
        var tag = ["change"];
        if (target == target) {
            tag.push("direct-target");
        }
        client_1.sendEvent([{ tag: tag, element: target.entity, value: target.value }]);
    }
});
function getFocusPath(target) {
    var root = exports.activeElements.root;
    var current = target;
    var path = [];
    while (current !== root && current) {
        var parent_4 = current.parentElement;
        path.unshift(Array.prototype.indexOf.call(parent_4.children, current));
        current = parent_4;
    }
    return path;
}
window.addEventListener("focus", function (event) {
    var target = event.target;
    if (target.entity) {
        var objs = [{ tag: ["focus"], element: target.entity }];
        client_1.sendEvent(objs);
        lastFocusPath = getFocusPath(target);
    }
}, true);
window.addEventListener("blur", function (event) {
    if (_suppressBlur) {
        event.preventDefault();
        return;
    }
    var target = event.target;
    if (target.entity) {
        var objs = [{ tag: ["blur"], element: target.entity }];
        client_1.sendEvent(objs);
        if (lastFocusPath) {
            var curFocusPath = getFocusPath(target);
            if (curFocusPath.length === lastFocusPath.length) {
                var match = true;
                for (var ix = 0; ix < curFocusPath.length; ix++) {
                    if (curFocusPath[ix] !== lastFocusPath[ix]) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    lastFocusPath = null;
                }
            }
        }
    }
}, true);
var keyMap = { 13: "enter", 27: "escape" };
window.addEventListener("keydown", function (event) {
    var target = event.target;
    var current = target;
    var objs = [];
    var key = event.keyCode;
    while (current) {
        if (current.entity) {
            var tag = ["keydown"];
            if (current == target) {
                tag.push("direct-target");
            }
            objs.push({ tag: tag, element: current.entity, key: keyMap[key] || key });
        }
        current = current.parentElement;
    }
    client_1.sendEvent(objs);
});
window.addEventListener("keyup", function (event) {
    var target = event.target;
    var current = target;
    var objs = [];
    var key = event.keyCode;
    while (current) {
        if (current.entity) {
            var tag = ["keyup"];
            if (current == target) {
                tag.push("direct-target");
            }
            objs.push({ tag: tag, element: current.entity, key: keyMap[key] || key });
        }
        current = current.parentElement;
    }
    objs.push({ tag: ["keyup"], element: "window", key: key });
    client_1.sendEvent(objs);
});
//---------------------------------------------------------
// Editor Renderer
//---------------------------------------------------------
var activeLayers = {};
var editorParse = {};
var allNodeGraphs = {};
var showGraphs = false;
function injectProgram(node, elem) {
    node.appendChild(exports.activeElements.root);
}
function renderEve() {
    var program = { c: "program-container", postRender: injectProgram };
    var _a = renderEditor(), editor = _a.editor, errors = _a.errors;
    var rootUi = { c: "parse-info", children: [
            editor,
            errors,
            program,
            MarkdownEditor.viewBar.render(),
        ] };
    exports.renderer.render([{ c: "graph-root", children: [rootUi] }]);
}
exports.renderEve = renderEve;
function renderEditor() {
    var parseGraphs = client_1.indexes.byTag.index["parse-graph"];
    if (!parseGraphs || parseGraphs.length === 0)
        return { editor: undefined, errors: undefined };
    if (parseGraphs.length > 1) {
        console.error("Multiple parse graphs in the compiler bag, wut do?", parseGraphs);
        return {};
    }
    var records = client_1.indexes.records.index;
    var root = records[parseGraphs[0]];
    var context = records[root.context[root.context.length - 1]];
    var program;
    var errors;
    if (root && context.errors && context.errors.length) {
        context.errors.sort(function (a, b) { return records[records[a].pos].line - records[records[b].pos].line; });
        var items = context.errors.map(function (errorId) {
            var errorInfo = records[errorId];
            var fix;
            if (errorInfo.fixes) {
                fix = { c: "fix-it", text: "Fix it for me", fix: errorInfo.fixes, click: editor_1.applyFix };
            }
            return { c: "error", children: [
                    { c: "error-title", text: errorInfo.type },
                    { c: "error-context", text: errorInfo.pos.file || "(passed string)" },
                    { t: "pre", dangerouslySetInnerHTML: errorInfo.final.trim().replace(/\n /gi, "\n") },
                    fix,
                ] };
        });
        errors = { c: "errors", children: items };
    }
    var editor = { c: "run-info", children: [
            MarkdownEditor.outline ? MarkdownEditor.outline.render() : undefined,
            { c: "editor-content", children: [
                    MarkdownEditor.toolbar(),
                    editor_1.CodeMirrorNode({ value: context.code && context.code[0] || "", parse: client_1.parseInfo }),
                    MarkdownEditor.comments ? MarkdownEditor.comments.render() : undefined,
                    { c: "toolbar", children: [
                            { c: "stats" },
                            { t: "select", c: "show-graphs", change: editor_1.setKeyMap, children: [
                                    { t: "option", value: "default", text: "default" },
                                    { t: "option", value: "vim", text: "vim" },
                                    { t: "option", value: "emacs", text: "emacs" },
                                ] },
                            { c: "show-graphs", text: "save", click: editor_1.doSave },
                            { c: "show-graphs", text: "compile and run", click: editor_1.compileAndRun }
                        ] },
                ] },
        ] };
    return { editor: editor, errors: errors };
}
exports.renderEditor = renderEditor;
//# sourceMappingURL=renderer.js.map