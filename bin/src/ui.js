var CodeMirror = require("codemirror");
var utils_1 = require("./utils");
var runtime_1 = require("./runtime");
var richTextEditor_1 = require("./richTextEditor");
var uitk = require("./uitk");
var app_1 = require("./app");
var parser_1 = require("./parser");
var NLQueryParser_1 = require("./NLQueryParser");
(function (PANE) {
    PANE[PANE["FULL"] = 0] = "FULL";
    PANE[PANE["WINDOW"] = 1] = "WINDOW";
    PANE[PANE["POPOUT"] = 2] = "POPOUT";
})(exports.PANE || (exports.PANE = {}));
var PANE = exports.PANE;
;
var BLOCK;
(function (BLOCK) {
    BLOCK[BLOCK["TEXT"] = 0] = "TEXT";
    BLOCK[BLOCK["PROJECTION"] = 1] = "PROJECTION";
})(BLOCK || (BLOCK = {}));
;
// Because html5 is full of broken promises and broken dreams
var popoutHistory = [];
//------------------------------------------------------------------------------
// State
//------------------------------------------------------------------------------
exports.uiState = {
    widget: {
        search: {},
        table: {},
        collapsible: {},
        attributes: {},
    },
    pane: {},
    prompt: { open: false, paneId: undefined, prompt: undefined },
};
//---------------------------------------------------------
// Utils
//---------------------------------------------------------
function preventDefault(event) {
    event.preventDefault();
}
function setURL(paneId, contains, replace) {
    var name = uitk.resolveName(contains);
    if (paneId !== "p1")
        return; // @TODO: Make this a constant
    var url;
    if (contains.length === 0)
        url = "/";
    else if (name === contains)
        url = "/search/" + contains.replace(/ /g, "_");
    else
        url = "/" + name.replace(/ /g, "_") + "/" + contains.replace(/ /g, "_");
    var state = { paneId: paneId, contains: contains };
    window["states"] = window["states"] || [];
    window["states"].push(state);
    if (replace)
        window.history.replaceState(state, null, url);
    else
        window.history.pushState(state, null, url);
}
exports.setURL = setURL;
//---------------------------------------------------------
// Dispatches
//---------------------------------------------------------
app_1.handle("ui focus search", function (changes, _a) {
    var paneId = _a.paneId, value = _a.value;
    var state = exports.uiState.widget.search[paneId] = exports.uiState.widget.search[paneId] || { value: value };
    state.focused = true;
});
app_1.handle("ui set search", function (changes, _a) {
    var paneId = _a.paneId, value = _a.value, peek = _a.peek, x = _a.x, y = _a.y, popState = _a.popState;
    var displays = app_1.eve.find("display name", { name: value });
    if (displays.length === 1)
        value = displays[0].id;
    var fact;
    if (paneId === "p1") {
        popoutHistory = [];
    }
    else if (!popState) {
        var popout = app_1.eve.findOne("ui pane", { kind: PANE.POPOUT });
        if (popout) {
            popoutHistory.push(popout.contains); // @FIXME: This is fragile
        }
    }
    if (!peek) {
        var state = exports.uiState.widget.search[paneId] = exports.uiState.widget.search[paneId] || { value: value };
        state.value = value;
        state.focused = false;
        fact = utils_1.copy(app_1.eve.findOne("ui pane", { pane: paneId }));
        fact.__id = undefined;
        fact.contains = value;
        changes.remove("ui pane", { pane: paneId });
        var children = app_1.eve.find("ui pane parent", { parent: paneId });
        for (var _i = 0; _i < children.length; _i++) {
            var child = children[_i].pane;
            changes.remove("ui pane position", { pane: child });
            changes.remove("ui pane", { pane: child });
        }
        changes.remove("ui pane parent", { parent: paneId });
        if (!popState)
            setURL(paneId, value);
    }
    else {
        var popout = app_1.eve.findOne("ui pane", { kind: PANE.POPOUT });
        var neuePaneId;
        if (!popout) {
            neuePaneId = utils_1.uuid();
        }
        else {
            neuePaneId = popout.pane;
            changes.remove("ui pane", { pane: neuePaneId });
        }
        var state = exports.uiState.widget.search[neuePaneId] = { value: value };
        fact = { contains: value, pane: neuePaneId, kind: PANE.POPOUT };
        if (!popout || paneId !== neuePaneId) {
            if (x !== undefined && y !== undefined) {
                changes.remove("ui pane position", { pane: neuePaneId });
                changes.add("ui pane position", { pane: neuePaneId, x: x, y: y });
            }
            changes.remove("ui pane parent", { parent: paneId });
            changes.add("ui pane parent", { pane: neuePaneId, parent: paneId });
        }
        paneId = neuePaneId;
    }
    changes.add("ui pane", fact);
});
app_1.handle("remove popup", function (changes, _a) {
    var popup = app_1.eve.findOne("ui pane", { kind: PANE.POPOUT });
    if (popup) {
        var paneId = popup.pane;
        changes.remove("ui pane", { pane: paneId });
        changes.remove("ui pane position", { pane: paneId });
    }
    popoutHistory = [];
});
app_1.handle("ui toggle search plan", function (changes, _a) {
    var paneId = _a.paneId;
    var state = exports.uiState.widget.search[paneId] = exports.uiState.widget.search[paneId] || { value: "" };
    state.plan = !state.plan;
});
app_1.handle("add sourced eav", function (changes, eav) {
    if (!eav.source) {
        eav.source = utils_1.uuid();
    }
    changes.add("sourced eav", eav);
});
app_1.handle("remove sourced eav", function (changes, eav) {
    changes.remove("sourced eav", eav);
});
app_1.handle("update page", function (changes, _a) {
    var page = _a.page, content = _a.content;
    changes.remove("page content", { page: page });
    changes.add("page content", { page: page, content: content });
    var trimmed = content.trim();
    var endIx = trimmed.indexOf("\n");
    var name = trimmed.slice(1, endIx !== -1 ? endIx : undefined).trim();
    var entity = app_1.eve.findOne("entity page", { page: page }).entity;
    var _b = (app_1.eve.findOne("display name", { id: entity }) || {}).name, prevName = _b === void 0 ? undefined : _b;
    if (name !== prevName) {
        changes.remove("display name", { id: entity, name: prevName });
        changes.add("display name", { id: entity, name: name });
        var parts = window.location.pathname.split("/");
        if (parts.length > 2 && parts[2].replace(/_/gi, " ") === entity) {
            window.history.replaceState(window.history.state, null, "/" + name.replace(/ /gi, "_") + "/" + entity.replace(/ /gi, "_"));
        }
    }
});
app_1.handle("create entity", function (changes, _a) {
    var entity = _a.entity, page = _a.page, _b = _a.name, name = _b === void 0 ? "Untitled" : _b;
    changes
        .add("entity page", { entity: entity, page: page })
        .add("display name", { id: entity, name: name });
});
app_1.handle("create page", function (changes, _a) {
    var page = _a.page, _b = _a.content, content = _b === void 0 ? undefined : _b;
    if (content === undefined)
        content = "This page is empty. Type something to add some content!";
    changes.add("page content", { page: page, content: content });
});
app_1.handle("create query", function (changes, _a) {
    var id = _a.id, content = _a.content;
    var page = utils_1.uuid();
    changes
        .add("page content", { page: page, content: "#" + content + " query" })
        .add("entity page", { id: id, page: page })
        .add("display name", { id: id, content: content })
        .add("sourced eav", { entity: id, attribute: "is a", value: utils_1.builtinId("query") })
        .add("sourced eav", { entity: id, attribute: "content", value: content });
    var artifacts = parser_1.parseDSL(content);
    if (artifacts.changeset)
        changes.merge(artifacts.changeset);
    for (var viewId in artifacts.views) {
        changes.add("sourced eav", { entity: id, attribute: "artifact", value: viewId });
        var name_1 = artifacts.views[viewId]["displayName"];
        if (!app_1.eve.findOne("display name", { id: viewId }) && name_1)
            changes.add("display name", { id: viewId, name: name_1 });
        changes.merge(artifacts.views[viewId].changeset(app_1.eve));
    }
});
app_1.handle("insert query", function (changes, _a) {
    var query = _a.query;
    if (app_1.eve.findOne("query to id", { query: query }))
        return;
    var parsed = NLQueryParser_1.parse(query);
    if (parsed[0].state === NLQueryParser_1.StateFlags.COMPLETE) {
        var artifacts = parser_1.parseDSL(parsed[0].query.toString());
        if (artifacts.changeset)
            changes.merge(artifacts.changeset);
        var rootId;
        for (var viewId in artifacts.views) {
            if (!rootId)
                rootId = viewId;
            var name_2 = artifacts.views[viewId]["displayName"];
            if (!app_1.eve.findOne("display name", { id: viewId }) && name_2)
                changes.add("display name", { id: viewId, name: name_2 });
            changes.merge(artifacts.views[viewId].changeset(app_1.eve));
        }
        changes.add("query to id", { query: query, id: rootId });
    }
});
// @TODO: there's a lot of duplication between insert query, create query, and insert implication
app_1.handle("insert implication", function (changes, _a) {
    var query = _a.query;
    var artifacts = parser_1.parseDSL(query);
    if (artifacts.changeset)
        changes.merge(artifacts.changeset);
    for (var viewId in artifacts.views) {
        var name_3 = artifacts.views[viewId]["displayName"];
        if (!app_1.eve.findOne("display name", { id: viewId }) && name_3)
            changes.add("display name", { id: viewId, name: name_3 });
        changes.merge(artifacts.views[viewId].changeset(app_1.eve));
    }
});
app_1.handle("remove entity attribute", function (changes, _a) {
    var entity = _a.entity, attribute = _a.attribute, value = _a.value;
    changes.remove("sourced eav", { entity: entity, attribute: attribute, value: value });
    console.log(changes);
    // @FIXME: Make embeds auto-gc themselves when invalidated.
});
app_1.handle("update entity attribute", function (changes, _a) {
    var entity = _a.entity, attribute = _a.attribute, prev = _a.prev, value = _a.value;
    // @FIXME: proper unique source id
    var _b = (app_1.eve.findOne("sourced eav", { entity: entity, attribute: attribute, value: prev }) || {}).source, source = _b === void 0 ? "<global>" : _b;
    if (prev !== undefined)
        changes.remove("sourced eav", { entity: entity, attribute: attribute, value: prev });
    changes.add("sourced eav", { entity: entity, attribute: attribute, value: value, source: source });
});
app_1.handle("rename entity attribute", function (changes, _a) {
    var entity = _a.entity, attribute = _a.attribute, prev = _a.prev, value = _a.value;
    // @FIXME: proper unique source id
    var _b = (app_1.eve.findOne("sourced eav", { entity: entity, attribute: prev, value: value }) || {}).source, source = _b === void 0 ? "<global>" : _b;
    if (prev !== undefined)
        changes.remove("sourced eav", { entity: entity, attribute: prev, value: value });
    changes.add("sourced eav", { entity: entity, attribute: attribute, value: value, source: source });
});
app_1.handle("sort table", function (changes, _a) {
    var key = _a.key, field = _a.field, direction = _a.direction;
    var state = exports.uiState.widget.table[key] || { field: undefined, direction: undefined };
    if (field !== undefined)
        state.field = field;
    if (direction !== undefined)
        state.direction = direction;
    exports.uiState.widget.table[key] = state;
});
app_1.handle("toggle settings", function (changes, _a) {
    var paneId = _a.paneId, _b = _a.open, open = _b === void 0 ? undefined : _b;
    var state = exports.uiState.pane[paneId] || { settings: false };
    state.settings = open !== undefined ? open : !state.settings;
    exports.uiState.pane[paneId] = state;
});
app_1.handle("toggle collapse", function (changes, _a) {
    var collapsible = _a.collapsible, _b = _a.open, open = _b === void 0 ? undefined : _b;
    var state = exports.uiState.widget.collapsible[collapsible] || { open: false };
    state.open = open !== undefined ? open : !state.open;
    exports.uiState.widget.collapsible[collapsible] = state;
});
app_1.handle("toggle prompt", function (changes, _a) {
    var _b = _a.prompt, prompt = _b === void 0 ? undefined : _b, _c = _a.paneId, paneId = _c === void 0 ? undefined : _c, _d = _a.open, open = _d === void 0 ? undefined : _d;
    var state = exports.uiState.prompt;
    if (state.prompt !== prompt) {
        state.prompt = prompt;
        state.open = open !== undefined ? open : true;
        state.paneId = paneId;
    }
    else {
        state.open !== undefined ? open : !state.open;
    }
    exports.uiState.prompt = state;
});
app_1.handle("remove entity", function (changes, _a) {
    var entity = _a.entity;
    changes.remove("sourced eav", { entity: entity })
        .remove("display name", { id: entity })
        .remove("manual eavs", { entity: entity })
        .remove("entity page", { entity: entity });
});
//---------------------------------------------------------
// Wiki Containers
//---------------------------------------------------------
function root() {
    var panes = [];
    for (var _i = 0, _a = app_1.eve.find("ui pane"); _i < _a.length; _i++) {
        var paneId = _a[_i].pane;
        panes.push(pane(paneId));
    }
    if (exports.uiState.prompt.open && exports.uiState.prompt.prompt && !exports.uiState.prompt.paneId) {
        panes.push({ style: "position: absolute; top: 0; left: 0; bottom: 0; right: 0; z-index: 10; background: rgba(0, 0, 0, 0.0);", click: closePrompt }, exports.uiState.prompt.prompt());
    }
    return { c: "wiki-root", id: "root", children: panes, click: removePopup };
}
exports.root = root;
// @TODO: Add search functionality + Pane Chrome
var paneChrome = (_a = {},
    _a[PANE.FULL] = function (paneId, entityId) { return ({
        c: "fullscreen",
        header: { t: "header", c: "flex-row", children: [
                { c: "logo eve-logo", data: { paneId: paneId }, link: "", click: navigate },
                searchInput(paneId, entityId),
                { c: "controls visible", children: [
                        { c: "ion-gear-a toggle-settings", style: "font-size: 1.35em;", prompt: paneSettings, paneId: paneId, click: openPrompt }
                    ] }
            ] }
    }); },
    _a[PANE.POPOUT] = function (paneId, entityId) {
        var parent = app_1.eve.findOne("ui pane parent", { pane: paneId })["parent"];
        return {
            c: "window",
            captureClicks: true,
            header: { t: "header", c: "", children: [
                    { t: "button", c: "ion-android-open", click: navigateParent, link: entityId, paneId: paneId, parentId: parent, text: "" },
                ] },
        };
    },
    _a[PANE.WINDOW] = function (paneId, entityId) { return ({
        c: "window",
        header: { t: "header", c: "flex-row", children: [
                { c: "flex-grow title", text: entityId },
                { c: "flex-row controls", children: [
                        { c: "ion-android-search" },
                        { c: "ion-minus-round" },
                        { c: "ion-close-round" }
                    ] }
            ] }
    }); },
    _a
);
function openPrompt(event, elem) {
    app_1.dispatch("toggle prompt", { prompt: elem.prompt, paneId: elem.paneId, open: true }).commit();
}
function closePrompt(event, elem) {
    app_1.dispatch("toggle prompt", { open: false }).commit();
}
function navigateParent(event, elem) {
    app_1.dispatch("remove popup", { paneId: elem.paneId })
        .dispatch("ui set search", { paneId: elem.parentId, value: elem.link })
        .commit();
}
function removePopup(event, elem) {
    if (!event.defaultPrevented) {
        app_1.dispatch("remove popup", {}).commit();
    }
}
function loadFromFile(event, elem) {
    var target = event.target;
    if (!target.files.length)
        return;
    if (target.files.length > 1)
        throw new Error("Cannot load multiple files at once");
    var file = target.files[0];
    var reader = new FileReader();
    reader.onload = function (event) {
        var serialized = event.target.result;
        app_1.eve.load(serialized);
        app_1.dispatch("toggle prompt", { prompt: loadedPrompt, open: true }).commit();
    };
    reader.readAsText(file);
}
function savePrompt() {
    var serialized = localStorage[app_1.eveLocalStorageKey];
    return { c: "modal-prompt save-prompt", children: [
            { t: "header", c: "flex-row", children: [
                    { t: "h2", text: "Save DB" },
                    { c: "flex-grow" },
                    { c: "controls", children: [{ c: "ion-close-round", click: closePrompt }] }
                ] },
            { t: "a", href: "data:application/octet-stream;charset=utf-16le;base64," + btoa(serialized), download: "save.evedb", text: "save to file" }
        ] };
}
function loadPrompt() {
    var serialized = localStorage[app_1.eveLocalStorageKey];
    return { c: "modal-prompt load-prompt", children: [
            { t: "header", c: "flex-row", children: [
                    { t: "h2", text: "Load DB" },
                    { c: "flex-grow" },
                    { c: "controls", children: [{ c: "ion-close-round", click: closePrompt }] }
                ] },
            { t: "p", children: [
                    { t: "span", text: "WARNING: This will overwrite your current database. This is irreversible. You should consider " },
                    { t: "a", href: "#", text: "saving your DB", prompt: savePrompt, click: openPrompt },
                    { t: "span", text: " first." }
                ] },
            { t: "input", type: "file", text: "load from file", change: loadFromFile }
        ] };
}
function loadedPrompt() {
    return { c: "modal-prompt load-prompt", children: [
            { t: "header", c: "flex-row", children: [
                    { t: "h2", text: "Load DB" },
                    { c: "flex-grow" },
                    { c: "controls", children: [{ c: "ion-close-round", click: closePrompt }] }
                ] },
            { text: "Successfully loaded DB from file" }
        ] };
}
function pane(paneId) {
    // @FIXME: Add kind to ui panes
    var _a = app_1.eve.findOne("ui pane", { pane: paneId }) || {}, _b = _a.contains, contains = _b === void 0 ? undefined : _b, _c = _a.kind, kind = _c === void 0 ? PANE.FULL : _c;
    var makeChrome = paneChrome[kind];
    if (!makeChrome)
        throw new Error("Unknown pane kind: '" + kind + "' (" + PANE[kind] + ")");
    var _d = makeChrome(paneId, contains), klass = _d.c, header = _d.header, footer = _d.footer, captureClicks = _d.captureClicks;
    var content;
    var display = app_1.eve.findOne("display name", { name: contains }) || app_1.eve.findOne("display name", { id: contains });
    var contentType = "entity";
    if (contains.length === 0) {
        content = entity(utils_1.builtinId("home"), paneId, kind);
    }
    else if (contains.indexOf("search: ") === 0) {
        contentType = "search";
        content = search(contains.substring("search: ".length), paneId);
    }
    else if (display) {
        var options = {};
        content = entity(display.id, paneId, kind, options);
    }
    else if (app_1.eve.findOne("query to id", { query: contains })) {
        contentType = "search";
        content = search(contains, paneId);
    }
    else if (contains !== "") {
        content = { c: "flex-row spaced-row", children: [
                { t: "span", text: "The page " + contains + " does not exist. Would you like to" },
                { t: "a", c: "link btn add-btn", text: "create it?", href: "#", name: contains, paneId: paneId, click: createPage }
            ] };
    }
    if (contentType === "search") {
        var disambiguation = { id: "search-disambiguation", c: "flex-row spaced-row disambiguation", children: [
                { text: "Did you mean to" },
                { t: "a", c: "link btn add-btn", text: "create a new page", href: "#", name: contains, paneId: paneId, click: createPage },
                { text: "with this name?" }
            ] };
    }
    var pane = { c: "wiki-pane " + (klass || ""), paneId: paneId, children: [header, disambiguation, content, footer] };
    var pos = app_1.eve.findOne("ui pane position", { pane: paneId });
    if (pos) {
        pane.style = "left: " + pos.x + "px; top: " + (pos.y + 20) + "px;";
    }
    if (captureClicks) {
        pane.click = preventDefault;
    }
    if (exports.uiState.prompt.open && exports.uiState.prompt.paneId === paneId) {
        pane.children.push({ style: "position: absolute; top: 0; left: 0; bottom: 0; right: 0; z-index: 10; background: rgba(0, 0, 0, 0.0);", paneId: paneId, click: closePrompt }, exports.uiState.prompt.prompt(paneId));
    }
    return pane;
}
exports.pane = pane;
function createPage(evt, elem) {
    var name = elem["name"];
    var entity = utils_1.uuid();
    var page = utils_1.uuid();
    app_1.dispatch("create page", { page: page, content: "# " + name + "\n" })
        .dispatch("create entity", { entity: entity, page: page, name: name })
        .dispatch("ui set search", { paneId: elem["paneId"], value: name }).commit();
}
function deleteEntity(event, elem) {
    var name = uitk.resolveName(elem.entity);
    app_1.dispatch("remove entity", { entity: elem.entity }).commit();
    app_1.dispatch("ui set search", { paneId: elem.paneId, value: name }).commit();
}
function paneSettings(paneId) {
    var pane = app_1.eve.findOne("ui pane", { pane: paneId });
    var _a = (app_1.eve.findOne("entity", { entity: uitk.resolveId(pane.contains) }) || {}).entity, entity = _a === void 0 ? undefined : _a;
    var isSystem = !!(entity && app_1.eve.findOne("entity eavs", { entity: entity, attribute: "is a", value: utils_1.builtinId("system") }));
    return { t: "ul", c: "settings", children: [
            { t: "li", c: "save-btn", text: "save", prompt: savePrompt, click: openPrompt },
            { t: "li", c: "load-btn", text: "load", prompt: loadPrompt, click: openPrompt },
            entity && !isSystem ? { t: "li", c: "delete-btn", text: "delete page", entity: entity, paneId: paneId, click: deleteEntity } : undefined
        ] };
}
function search(search, paneId) {
    var _a = search.split("|"), rawContent = _a[0], rawParams = _a[1];
    var parsedParams = getCellParams(rawContent, rawParams);
    var _b = queryUIInfo(search), results = _b.results, params = _b.params, content = _b.content;
    utils_1.mergeObject(params, parsedParams);
    var rep = represent(content, params["rep"], results, params);
    return { t: "content", c: "wiki-search", children: [
            rep
        ] };
}
exports.search = search;
function sizeColumns(node, elem) {
    // @FIXME: Horrible hack to get around randomly added "undefined" text node that's coming from in microreact.
    var cur = node;
    while (cur.parentElement)
        cur = cur.parentElement;
    if (cur.tagName !== "HTML")
        document.body.appendChild(cur);
    var child, ix = 0;
    var widths = {};
    var columns = node.querySelectorAll(".column");
    for (var _i = 0; _i < columns.length; _i++) {
        var column = columns[_i];
        column.style.width = "auto";
        widths[column["value"]] = widths[column["value"]] || 0;
        if (column.offsetWidth > widths[column["value"]])
            widths[column["value"]] = column.offsetWidth;
    }
    for (var _a = 0; _a < columns.length; _a++) {
        var column = columns[_a];
        column.style.width = widths[column["value"]] + 1;
    }
    if (cur.tagName !== "HTML")
        document.body.removeChild(cur);
}
//---------------------------------------------------------
// Wiki editor functions
//---------------------------------------------------------
function parseParams(rawParams) {
    var params = {};
    if (!rawParams)
        return params;
    for (var _i = 0, _a = rawParams.split(";"); _i < _a.length; _i++) {
        var kv = _a[_i];
        var _b = kv.split("="), key = _b[0], value = _b[1];
        if (!key || !key.trim())
            continue;
        if (!value || !value.trim())
            throw new Error("Must specify value for key '" + key + "'");
        params[key.trim()] = utils_1.coerceInput(value.trim());
    }
    return params;
}
function stringifyParams(params) {
    var rawParams = "";
    if (!params)
        return rawParams;
    for (var key in params)
        rawParams += "" + (rawParams.length ? "; " : "") + key + " = " + params[key];
    return rawParams;
}
function cellUI(paneId, query, cell) {
    var _a = queryUIInfo(query), params = _a.params, results = _a.results, content = _a.content;
    params["paneId"] = params["paneId"] || paneId;
    params["cell"] = cell;
    params["childRep"] = params["rep"];
    params["rep"] = "embeddedCell";
    return { c: "cell", children: [represent(content, params["rep"], results, params)] };
}
// Credit to https://mathiasbynens.be/demo/url-regex and @gruber
var urlRegex = /\b(([\w-]+:\/\/?|www[.])[^\s()<>]+(?:\([\w\d]+\)|([^[\.,\-\/#!$%' "^*;:{_`~()\-\s]|\/)))/i;
function queryUIInfo(query) {
    var _a = query.split("|"), content = _a[0], rawParams = _a[1];
    var embedType;
    // let params = getCellParams(content, rawParams);
    var params = parseParams(rawParams);
    var results;
    if (app_1.eve.findOne("display name", { id: content }) || app_1.eve.findOne("display name", { name: content })) {
        var id = content;
        var display = app_1.eve.findOne("display name", { name: content });
        if (display) {
            id = display["id"];
        }
        results = { unprojected: [{ entity: id }], results: [{ entity: id }] };
    }
    else if (urlRegex.exec(content)) {
        results = { unprojected: [{ url: content }], results: [{ url: content }] };
    }
    else {
        var queryId = app_1.eve.findOne("query to id", { query: content });
        if (queryId) {
            var queryResults = app_1.eve.find(queryId.id);
            var queryUnprojected = app_1.eve.table(queryId.id).unprojected;
            if (!queryResults.length) {
                params["rep"] = "error";
                params["message"] = "No results";
                results = {};
            }
            else {
                results = { unprojected: queryUnprojected, results: queryResults };
            }
        }
        else {
            params["rep"] = "error";
            params["message"] = "invalid search";
            results = {};
        }
    }
    return { results: results, params: params, content: content };
}
function getCellParams(content, rawParams) {
    content = content.trim();
    var display = app_1.eve.findOne("display name", { name: content });
    var params = parseParams(rawParams);
    var contentDisplay = app_1.eve.findOne("display name", { id: content }) || app_1.eve.findOne("display name", { name: content });
    if (contentDisplay) {
        params["rep"] = params["rep"] || "link";
    }
    else if (urlRegex.exec(content)) {
        params["rep"] = params["rep"] || "externalLink";
    }
    else {
        if (params["rep"])
            return params;
        var parsed = NLQueryParser_1.parse(content);
        var currentParse = parsed[0];
        var context_1 = currentParse.context;
        console.log(content, currentParse);
        var hasCollections = context_1.collections.length;
        var field;
        var rep;
        var aggregates = [];
        for (var _i = 0, _a = context_1.fxns; _i < _a.length; _i++) {
            var fxn = _a[_i];
            if (fxn.type === NLQueryParser_1.FunctionTypes.AGGREGATE) {
                aggregates.push(fxn);
            }
        }
        if (aggregates.length === 1 && context_1["groupings"].length === 0) {
            rep = "CSV";
            field = aggregates[0].name;
        }
        else if (!hasCollections && context_1.fxns.length === 1) {
            rep = "CSV";
            field = context_1.fxns[0].name;
        }
        else if (!hasCollections && context_1.attributes.length === 1) {
            rep = "CSV";
            field = context_1.attributes[0].displayName;
        }
        else {
            params["rep"] = "table";
        }
        if (rep) {
            params["rep"] = rep;
            params["field"] = field;
        }
    }
    return params;
}
var paneEditors = {};
function wikiEditor(node, elem) {
    richTextEditor_1.createEditor(node, elem);
    paneEditors[elem.meta.paneId] = node.editor;
}
function reparentCell(node, elem) {
    if (node.parentNode.id !== elem.containerId) {
        document.getElementById(elem.containerId).appendChild(node);
    }
    node.parentNode["mark"].changed();
}
function focusCellEditor(node, elem) {
    utils_1.autoFocus(node, elem);
    if (!node.didFocus) {
        node.didFocus = true;
        utils_1.setEndOfContentEditable(node);
    }
}
//---------------------------------------------------------
function cellEditor(entityId, paneId, cell) {
    var text = activeCells[cell.id].query;
    var _a = autocompleterOptions(entityId, paneId, cell), options = _a.options, selected = _a.selected;
    var autoFocus = true;
    if (text.match(/\$\$.*\$\$/)) {
        text = "";
    }
    var display = app_1.eve.findOne("display name", { id: text });
    if (display) {
        text = display["name"];
    }
    return { children: [
            { c: "embedded-cell", children: [
                    { c: "adornment", text: "=" },
                    { t: "span", c: "", contentEditable: true, text: text, input: updateActiveCell, keydown: embeddedCellKeys, cell: cell, selected: selected, paneId: paneId, postRender: autoFocus ? focusCellEditor : undefined },
                ] },
            autocompleter(options, paneId, cell)
        ] };
}
function autocompleter(options, paneId, cell) {
    var children = [];
    for (var _i = 0; _i < options.length; _i++) {
        var option = options[_i];
        var item = { c: "option", children: option.children, text: option.text, selected: option, cell: cell, paneId: paneId, click: executeAutocompleterOption, keydown: optionKeys };
        if (option.selected) {
            item.c += " selected";
        }
        children.push(item);
    }
    return { c: "autocompleter", key: performance.now().toString(), cell: cell, containerId: paneId + "|" + cell.id + "|container", children: children, postRender: positionAutocompleter };
}
function optionKeys(event, elem) {
    if (event.keyCode === utils_1.KEYS.ENTER) {
        executeAutocompleterOption(event.currentTarget, elem);
    }
}
function executeAutocompleterOption(event, elem) {
    var paneId = elem.paneId, cell = elem.cell;
    var editor = paneEditors[paneId];
    var cm = editor.cmInstance;
    var mark = editor.marks[cell.id];
    var doEmbed = makeDoEmbedFunction(cm, mark, cell, paneId);
    if (elem.selected && elem.selected.action) {
        if (typeof elem.selected.action === "function") {
            elem.selected.action(elem, cell.query, doEmbed);
        }
    }
}
function autocompleterOptions(entityId, paneId, cell) {
    var _a = cell.query.trim().split("|"), text = _a[0], rawParams = _a[1];
    if (text.match(/\$\$.*\$\$/)) {
        return { options: [], selected: {} };
    }
    var params = {};
    try {
        params = getCellParams(text, rawParams);
    }
    catch (e) {
    }
    var display = app_1.eve.findOne("display name", { id: text });
    if (display) {
        text = display["name"];
    }
    var isEntity = app_1.eve.findOne("display name", { name: text });
    var parsed = [];
    if (text !== "") {
        try {
            parsed = NLQueryParser_1.parse(text); // @TODO: this should come from the NLP parser once it's hooked up.
        }
        catch (e) {
        }
    }
    // the autocomplete can have multiple states
    var state = cell.state || "query";
    // every option has a score for how pertinent it is
    // things with a score of 0 will be filtered, everything else
    // will be sorted descending.
    var options;
    if (state === "query") {
        options = queryAutocompleteOptions(isEntity, parsed, text, params, entityId);
    }
    else if (state === "represent") {
        options = representAutocompleteOptions(isEntity, parsed, text, params, entityId);
    }
    else if (state === "create") {
        options = createAutocompleteOptions(isEntity, parsed, text, params, entityId);
    }
    else if (state === "define") {
        options = defineAutocompleteOptions(isEntity, parsed, text, params, entityId);
    }
    else if (state === "url") {
        options = urlAutocompleteOptions(isEntity, parsed, text, params, entityId);
    }
    options = options.sort(function (a, b) { return b.score - a.score; });
    var selected;
    if (options.length) {
        var selectedIx = cell.selected % options.length;
        if (selectedIx < 0)
            selectedIx = options.length + selectedIx;
        selected = options[selectedIx];
        selected.selected = true;
    }
    return { options: options, selected: selected };
}
function positionAutocompleter(node, elem) {
    var containerId = elem.containerId;
    var container = document.getElementById(containerId);
    var _a = container.getBoundingClientRect(), bottom = _a.bottom, left = _a.left;
    document.body.appendChild(node);
    node.style.top = bottom;
    node.style.left = left;
}
function queryAutocompleteOptions(isEntity, parsed, text, params, entityId) {
    var pageName = app_1.eve.findOne("display name", { id: entityId })["name"];
    var options = [];
    var hasValidParse = parsed.some(function (parse) { return parse.state === NLQueryParser_1.StateFlags.COMPLETE; });
    parsed.sort(function (a, b) { return b.score - a.score; });
    var topOption = parsed[0];
    var joiner = "a";
    if (text && text[0].match(/[aeiou]/i)) {
        joiner = "an";
    }
    if (topOption) {
        var totalFound = 0;
        var context_2 = topOption.context;
        for (var item in context_2) {
            totalFound += context_2[item].length;
        }
        if (totalFound === 2 && context_2.entities.length === 1 && context_2.maybeAttributes.length === 1) {
            options.push({ score: 4, action: setCellState, state: "define", text: "Add " + text });
        }
        else if (totalFound === 2 && context_2.entities.length === 1 && context_2.attributes.length === 1) {
            options.push({ score: 1, action: setCellState, state: "define", text: "Add another " + context_2.attributes[0].displayName });
        }
    }
    // create
    if (!isEntity && text !== "" && text != "=") {
        options.push({ score: 1, action: setCellState, state: "create", text: "Create " + joiner + " \"" + text + "\" page" });
    }
    // disambiguations
    if (parsed.length > 1) {
        options.push({ score: 3, action: "disambiguate stuff", text: "DISAMBIGUATE!" });
    }
    if (!isEntity && hasValidParse && params["rep"]) {
        options.push({ score: 4, action: embedAs, rep: params["rep"], params: params, text: "embed as a " + params["rep"] });
    }
    // repesentation
    // we can only repesent things if we've found them
    if (isEntity || hasValidParse) {
        // @TODO: how do we figure out what representations actually make sense to show?
        options.push({ score: 2, action: setCellState, state: "represent", text: "embed as ..." });
    }
    // set attribute
    if (isEntity && app_1.eve.findOne("display name", { id: entityId }).name !== text) {
        var isAScore = 2.5;
        if (app_1.eve.findOne("collection", { collection: isEntity.id })) {
            isAScore = 3;
        }
        options.push({ score: 2.5, action: addAttributeAndEmbed, replace: "is a", entityId: entityId, value: isEntity.id, attribute: "related to", text: pageName + " is related to " + text });
        options.push({ score: isAScore, action: addAttributeAndEmbed, replace: "related to", entityId: entityId, value: isEntity.id, attribute: "is a", text: pageName + " is " + joiner + " " + text });
    }
    // url embedding
    if (urlRegex.exec(text)) {
        options.push({ score: 3, action: setCellState, state: "url", text: "embed url as..." });
    }
    return options;
}
function addAttributeAndEmbed(elem, strValue, doEmbed) {
    var _a = elem.selected, entityId = _a.entityId, value = _a.value, attribute = _a.attribute, replace = _a.replace;
    var chain = app_1.dispatch("add sourced eav", { entity: entityId, attribute: attribute, value: value, source: utils_1.uuid() });
    if (replace) {
        chain.dispatch("remove entity attribute", { entity: entityId, attribute: replace, value: value });
    }
    chain.commit();
    doEmbed(value + "|rep=link;");
}
function setCellState(elem, value, doEmbed) {
    app_1.dispatch("setCellState", { id: elem.cell.id, state: elem.selected.state }).commit();
}
function createAutocompleteOptions(isEntity, parsed, text, params, entityId) {
    var options = [];
    var pageName = app_1.eve.findOne("display name", { id: entityId })["name"];
    var isCollection = isEntity ? app_1.eve.findOne("collection", { collection: isEntity.id }) : false;
    var joiner = "a";
    if (text && text[0].match(/[aeiou]/i)) {
        joiner = "an";
    }
    var isAScore = 2.5;
    if (isCollection) {
        isAScore = 3;
    }
    options.push({ score: 2.5, action: createAndEmbed, replace: "is a", entityId: entityId, attribute: "related to", text: pageName + " is related to " + text });
    options.push({ score: isAScore, action: createAndEmbed, replace: "related to", entityId: entityId, attribute: "is a", text: pageName + " is " + joiner + " " + text });
    return options;
}
function createAndEmbed(elem, value, doEmbed) {
    //create the page and embed a link to it
    var entity = utils_1.uuid();
    var page = utils_1.uuid();
    var _a = elem.selected, entityId = _a.entityId, attribute = _a.attribute, replace = _a.replace;
    var chain = app_1.dispatch("create page", { page: page, content: "#" + value + "\n" })
        .dispatch("create entity", { entity: entity, page: page, name: value })
        .dispatch("add sourced eav", { entity: entityId, attribute: attribute, value: entity, source: utils_1.uuid() });
    if (replace) {
        chain.dispatch("remove entity attribute", { entity: entityId, attribute: replace, value: entity });
    }
    chain.commit();
    doEmbed(value + "|rep=link;");
}
function representAutocompleteOptions(isEntity, parsed, text, params, entityId) {
    var options = [];
    var isCollection = isEntity ? app_1.eve.findOne("collection", { collection: isEntity.id }) : false;
    options.push({ score: 1, text: "a table", action: embedAs, rep: "table", params: params });
    // options.push({score:1, text: "embed as a value", action: embedAs, rep: "value"});
    if (isEntity) {
        options.push({ score: 1, text: "a link", action: embedAs, rep: "link", params: params });
    }
    if (isCollection) {
        options.push({ score: 1, text: "an index", action: embedAs, rep: "index", params: params });
        options.push({ score: 1, text: "a directory", action: embedAs, rep: "directory", params: params });
    }
    if (isEntity) {
        options.push({ score: 1, text: "a list of related pages", action: embedAs, rep: "related", params: params });
        options.push({ score: 1, text: "a properties table", action: embedAs, rep: "attributes", params: params });
    }
    return options;
}
function urlAutocompleteOptions(isEntity, parsed, url, params, entityId) {
    // @NOTE: url must be normalized before reaching here.
    // @FIXME: Need to get a url property onto the params. Should that be done here?
    var ext = url.slice(url.lastIndexOf(".") + 1).trim().toLowerCase();
    var domain = url.slice(url.indexOf("//") + 2).split("/")[0];
    var isImage = ["png", "jpg", "jpeg", "bmp", "tiff"].indexOf(ext) !== -1;
    var isVideo = (["mp4", "ogv", "webm", "mov", "avi", "flv"].indexOf(ext) !== -1) || (["www.youtube.com", "youtu.be"].indexOf(domain) !== -1);
    var options = [
        { score: 2, text: "a link", action: embedAs, rep: "externalLink", params: params },
        { score: isImage ? 3 : 1, text: "an image", action: embedAs, rep: "externalImage", params: params },
        { score: isVideo ? 3 : 1, text: "a video", action: embedAs, rep: "externalVideo", params: params },
    ];
    return options;
}
function embedAs(elem, value, doEmbed) {
    var text = value.split("|")[0];
    var params = elem.selected.params;
    var rawParams = "rep=" + elem.selected.rep;
    for (var param in params) {
        if (param !== "rep") {
            rawParams += "; " + param + "=" + params[param];
        }
    }
    doEmbed(text + "|" + rawParams);
}
function defineAutocompleteOptions(isEntity, parsed, text, params, entityId) {
    var options = [];
    var topParse = parsed[0];
    var context = topParse.context;
    var attribute;
    if (context.maybeAttributes[0]) {
        attribute = context.maybeAttributes[0].name;
    }
    else {
        attribute = context.attributes[0].displayName;
    }
    var entity = context.entities[0].id;
    var option = { score: 1, action: defineAndEmbed, attribute: attribute, entity: entity };
    option.children = [
        { text: attribute },
        { c: "inline-cell", contentEditable: true, selected: option, keydown: defineKeys, postRender: utils_1.autoFocus }
    ];
    options.push(option);
    return options;
}
function interpretAttributeValue(value) {
    var cleaned = value.trim();
    if (cleaned[0] === "=") {
        //parse it
        cleaned = cleaned.substring(1).trim();
        var display = app_1.eve.findOne("display name", { name: cleaned });
        if (display) {
            return { isValue: true, value: display.id };
        }
        var parsed = NLQueryParser_1.parse(cleaned);
        return { isValue: false, parse: parsed, value: cleaned };
    }
    else {
        return { isValue: true, value: utils_1.coerceInput(cleaned) };
    }
}
function handleAttributeDefinition(entity, attribute, search, chain) {
    if (!chain) {
        chain = app_1.dispatch();
    }
    var _a = interpretAttributeValue(search), isValue = _a.isValue, value = _a.value, parse = _a.parse;
    if (isValue) {
        chain.dispatch("add sourced eav", { entity: entity, attribute: attribute, value: value }).commit();
    }
    else {
        var queryText = value.trim();
        // add the query
        app_1.dispatch("insert query", { query: queryText }).commit();
        // create another query that projects eavs
        var id = app_1.eve.findOne("query to id", { query: queryText }).id;
        var params = getCellParams(queryText, "");
        if (!params["field"]) {
            return false;
        }
        else {
            //build a query
            var eavProject = "(query :$$view \"" + entity + "|" + attribute + "|" + id + "\" (select \"" + id + "\" :" + params["field"].replace(" ", "-") + " value)\n                               (project! \"generated eav\" :entity \"" + entity + "\" :attribute \"" + attribute + "\" :value value :source \"" + id + "\"))";
            chain.dispatch("insert implication", { query: eavProject }).commit();
        }
    }
    return true;
}
function defineAndEmbed(elem, text, doEmbed) {
    var selected = elem.selected;
    var entity = selected.entity, attribute = selected.attribute, defineValue = selected.defineValue;
    var success = handleAttributeDefinition(entity, attribute, defineValue);
    if (success) {
        doEmbed(text + "|rep=CSV;field=" + attribute);
    }
    else {
        console.error("Couldn't figure out subject of: " + defineValue);
        doEmbed(text + "|rep=error;message=I couldn't figure out the subject of that search;");
    }
}
function defineKeys(event, elem) {
    if (event.keyCode === utils_1.KEYS.ENTER) {
        elem.selected.defineValue = event.currentTarget.textContent;
        event.preventDefault();
    }
}
function entity(entityId, paneId, kind, options) {
    if (options === void 0) { options = {}; }
    var _a = (app_1.eve.findOne("entity", { entity: entityId }) || {}).content, content = _a === void 0 ? undefined : _a;
    if (content === undefined)
        return { text: "Could not find the requested page" };
    var page = app_1.eve.findOne("entity page", { entity: entityId })["page"];
    var name = app_1.eve.findOne("display name", { id: entityId }).name;
    var cells = getCells(content);
    var keys = {
        "Backspace": function (cm) { return maybeActivateCell(cm, paneId); },
        "Cmd-Enter": function (cm) { return maybeNavigate(cm, paneId); },
        "=": function (cm) { return createEmbedPopout(cm, paneId); }
    };
    if (kind === PANE.POPOUT) {
        keys["Esc"] = function () {
            app_1.dispatch("remove popup", {}).commit();
            var parent = app_1.eve.findOne("ui pane parent", { pane: paneId })["parent"];
            paneEditors[parent].cmInstance.focus();
        };
    }
    var finalOptions = utils_1.mergeObject({ keys: keys }, options);
    var cellItems = cells.map(function (cell, ix) {
        var ui;
        var active = activeCells[cell.id];
        if (active) {
            ui = cellEditor(entityId, paneId, active || cell);
        }
        else {
            ui = cellUI(paneId, cell.query, cell);
        }
        ui.id = paneId + "|" + cell.id;
        ui.postRender = reparentCell;
        ui["containerId"] = paneId + "|" + cell.id + "|container";
        ui["cell"] = cell;
        return ui;
    });
    var attrs;
    if (kind !== PANE.POPOUT) {
        // attrs = uitk.attributes({entity: entityId, data: {paneId}, key: `${paneId}|${entityId}`});
        attrs = attributesUI(entityId, paneId);
        attrs.c += " page-attributes";
    }
    return { id: paneId + "|" + entityId + "|editor", t: "content", c: "wiki-entity", children: [
            /* This is disabled because searching for just the name of a single entity resolves to a single find step which blows up on query compilation
               {c: "flex-row spaced-row disambiguation", children: [
               {text: "Did you mean to"},
               {t: "a", c: "link btn add-btn", text: `search for '${name}'`, href: "#", name: search, data: {paneId}, link: `search: ${name}`, click: navigate},
               {text: "instead?"}
               ]},
             */
            { c: "wiki-editor", postRender: wikiEditor, onUpdate: updatePage, meta: { entity: entityId, page: page, paneId: paneId }, value: content, options: finalOptions, cells: cells, children: cellItems },
            attrs,
        ] };
}
exports.entity = entity;
function maybeActivateCell(cm, paneId) {
    if (!cm.somethingSelected()) {
        var pos = cm.getCursor("from");
        var marks = cm.findMarksAt(pos);
        var cell;
        for (var _i = 0; _i < marks.length; _i++) {
            var mark = marks[_i];
            var to = mark.find().to;
            if (mark.cell && to.ch === pos.ch) {
                cell = mark.cell;
                break;
            }
        }
        if (cell) {
            var query = cell.query.split("|")[0];
            app_1.dispatch("addActiveCell", { id: cell.id, cell: cell, query: query }).commit();
            return;
        }
    }
    return CodeMirror.Pass;
}
function maybeNavigate(cm, paneId) {
    if (!cm.somethingSelected()) {
        var pos = cm.getCursor("from");
        var marks = cm.findMarksAt(pos);
        var toClick;
        for (var _i = 0; _i < marks.length; _i++) {
            var mark = marks[_i];
            if (mark.cell) {
                toClick = mark;
            }
        }
        if (toClick) {
            // @HACK: there really should be a better way for me to find out
            // if there's a link in this cell and if it is what that link is
            // to.
            var link = toClick.widgetNode.querySelector(".link");
            if (link) {
                var elem = app_1.renderer.tree[link._id];
                var coords = cm.cursorCoords(true, "page");
                navigate({ clientX: coords.left, clientY: coords.top, preventDefault: function () { } }, elem);
            }
        }
    }
}
var activeCells = {};
app_1.handle("addActiveCell", function (changes, info) {
    var id = info.id;
    info.selected = 0;
    activeCells[id] = info;
});
app_1.handle("removeActiveCell", function (changes, info) {
    var id = info.id;
    delete activeCells[id];
});
app_1.handle("setCellState", function (changes, info) {
    var active = activeCells[info.id];
    active.selected = 0;
    active.state = info.state;
});
app_1.handle("updateActiveCell", function (changes, info) {
    var active = activeCells[info.id];
    active.query = info.query;
    active.selected = 0;
    active.state = "query";
});
app_1.handle("moveCellAutocomplete", function (changes, info) {
    var active = activeCells[info.cell.id];
    var direction = info.direction;
    active.selected += direction;
});
function updateActiveCell(event, elem) {
    var cell = elem.cell;
    app_1.dispatch("updateActiveCell", { id: cell.id, cell: cell, query: event.currentTarget.textContent }).commit();
}
function activateCell(event, elem) {
    var cell = elem.cell;
    var query = cell.query.split("|")[0];
    app_1.dispatch("addActiveCell", { id: cell.id, cell: cell, query: query }).commit();
}
function createEmbedPopout(cm, paneId) {
    console.log("CREATING POPOUT");
    var coords = cm.cursorCoords("head", "page");
    // dispatch("createEmbedPopout", {paneId, x: coords.left, y: coords.top - 20}).commit();
    cm.operation(function () {
        var from = cm.getCursor("from");
        var id = utils_1.uuid();
        var range = "{$$" + id + "$$}";
        cm.replaceRange(range, from, cm.getCursor("to"));
        app_1.dispatch("addActiveCell", { id: range, query: "", placeholder: true });
    });
}
function makeDoEmbedFunction(cm, mark, cell, paneId) {
    return function (value) {
        var _a = mark.find(), from = _a.from, to = _a.to;
        if (value[0] === "=") {
            value = value.substring(1);
        }
        value = value.trim();
        var _b = value.split("|"), text = _b[0], rawParams = _b[1];
        text = text.trim();
        // @TODO: this doesn't take disambiguations into account
        var display = app_1.eve.findOne("display name", { name: text });
        if (display) {
            text = display.id;
        }
        var replacement = "{" + text + "|" + (rawParams || "") + "}";
        if (cm.getRange(from, to) !== replacement) {
            cm.replaceRange(replacement, from, to);
        }
        paneEditors[paneId].cmInstance.focus();
        app_1.dispatch("insert query", { query: text }).dispatch("removeActiveCell", cell).commit();
    };
}
function embeddedCellKeys(event, elem) {
    var paneId = elem.paneId, cell = elem.cell;
    var target = event.currentTarget;
    var value = target.textContent;
    var editor = paneEditors[paneId];
    var cm = editor.cmInstance;
    var mark = editor.marks[cell.id];
    if (event.keyCode === utils_1.KEYS.BACKSPACE && value === "") {
        var _a = mark.find(), from = _a.from, to = _a.to;
        cm.replaceRange("", from, to);
        paneEditors[paneId].cmInstance.focus();
        app_1.dispatch("removeActiveCell", cell).commit();
        event.preventDefault();
    }
    else if (event.keyCode === utils_1.KEYS.ESC || (event.keyCode === utils_1.KEYS.ENTER && value.trim() === "")) {
        if (cell.placeholder || (cell.cell && cell.cell.placeholder)) {
            var _b = mark.find(), from = _b.from, to = _b.to;
            cm.replaceRange("= ", from, to);
        }
        paneEditors[paneId].cmInstance.focus();
        app_1.dispatch("removeActiveCell", cell).commit();
        event.preventDefault();
    }
    else if (event.keyCode === utils_1.KEYS.ENTER) {
        var doEmbed = makeDoEmbedFunction(cm, mark, cell, paneId);
        if (elem.selected && elem.selected.action) {
            if (typeof elem.selected.action === "function") {
                elem.selected.action(elem, value, doEmbed);
            }
        }
        event.preventDefault();
    }
    else if (event.keyCode === utils_1.KEYS.UP) {
        app_1.dispatch("moveCellAutocomplete", { cell: cell, direction: -1 }).commit();
        event.preventDefault();
    }
    else if (event.keyCode === utils_1.KEYS.DOWN) {
        app_1.dispatch("moveCellAutocomplete", { cell: cell, direction: 1 }).commit();
        event.preventDefault();
    }
    event.stopPropagation();
}
function updatePage(meta, content) {
    app_1.dispatch("update page", { page: meta.page, content: content }).commit();
}
function navigate(event, elem) {
    var paneId = elem.data.paneId;
    var info = { paneId: paneId, value: elem.link, peek: elem.peek };
    if (event.clientX) {
        info.x = event.clientX;
        info.y = event.clientY;
    }
    app_1.dispatch("ui set search", info).commit();
    event.preventDefault();
}
//---------------------------------------------------------
// Page parsing
//---------------------------------------------------------
function getCells(content) {
    var cells = [];
    var ix = 0;
    var ids = {};
    for (var _i = 0, _a = content.split(/({[^]*?})/gm); _i < _a.length; _i++) {
        var part = _a[_i];
        if (part[0] === "{") {
            var id = part;
            if (!ids[part]) {
                ids[part] = 2;
            }
            else if (ids[part] >= 2) {
                id += ids[part];
                ids[part]++;
            }
            var placeholder = false;
            if (part.match(/\{\$\$.*\$\$\}/)) {
                placeholder = true;
            }
            cells.push({ start: ix, length: part.length, value: part, query: part.substring(1, part.length - 1), id: id, placeholder: placeholder });
        }
        ix += part.length;
    }
    return cells;
}
//---------------------------------------------------------
// Attributes
//---------------------------------------------------------
function sortOnAttribute(a, b) {
    var aAttr = a.eav.attribute;
    var bAttr = b.eav.attribute;
    if (aAttr < bAttr)
        return -1;
    if (aAttr > bAttr)
        return 1;
    return 0;
}
function attributesUI(entityId, paneId) {
    var eavs = app_1.eve.find("entity eavs", { entity: entityId });
    var items = [];
    for (var _i = 0; _i < eavs.length; _i++) {
        var eav = eavs[_i];
        var entity_1 = eav.entity, attribute = eav.attribute, value = eav.value;
        var found = app_1.eve.findOne("generated eav", { entity: entity_1, attribute: attribute, value: value });
        var item = { eav: eav, isManual: !found };
        if (found) {
            item.sourceView = found.source;
        }
        items.push(item);
    }
    items.sort(sortOnAttribute);
    var state = exports.uiState.widget.attributes[entityId] || {};
    var ix = 0;
    var len = items.length;
    var tableChildren = [];
    while (ix < len) {
        var item = items[ix];
        var group = { children: [] };
        var subItem = item;
        while (ix < len && subItem.eav.attribute === item.eav.attribute) {
            var child = { c: "value", eav: subItem.eav, children: [] };
            var valueUI = subItem;
            var relatedSourceView = false;
            valueUI.value = subItem.eav.value;
            valueUI["submit"] = submitAttribute;
            valueUI["eav"] = subItem.eav;
            if (!subItem.isManual) {
                child.c += " generated";
                relatedSourceView = state.sourceView === subItem.sourceView;
                valueUI.text = valueUI.value;
                if (state.active && state.active.__id === subItem.eav.__id) {
                    var query = app_1.eve.findOne("query to id", { id: subItem.sourceView }).query;
                    child.style = "background: red;";
                    valueUI.t = "input";
                    valueUI.value = "= " + query;
                    valueUI["query"] = valueUI.value;
                    valueUI["sourceView"] = subItem.sourceView;
                    valueUI.postRender = utils_1.autoFocus;
                    valueUI.text = undefined;
                    child.children.push(valueUI);
                }
                else if (relatedSourceView) {
                    child.style = "background: red;";
                    valueUI.text = "editing search...";
                }
                child["sourceView"] = subItem.sourceView;
                child.click = setActiveAttribute;
            }
            else {
                valueUI.t = "input";
            }
            var display = app_1.eve.findOne("display name", { id: valueUI.value });
            if (display && !relatedSourceView) {
                if (!state.active || state.active.__id !== subItem.eav.__id) {
                    child.children.push({ c: "link", text: display.name, data: { paneId: paneId }, link: display.id, click: navigate, peek: true });
                    child.click = setActiveAttribute;
                }
                else {
                    valueUI.value = "= " + display.name;
                    valueUI.postRender = utils_1.autoFocus;
                    child.children.push(valueUI);
                }
            }
            else {
                child.children.push(valueUI);
            }
            if (valueUI.t === "input") {
                valueUI.keydown = handleAttributesKey;
            }
            group.children.push(child);
            ix++;
            subItem = items[ix];
        }
        tableChildren.push({ id: entityId + "|" + paneId + "|" + item.eav.attribute, c: "attribute", children: [
                { text: item.eav.attribute },
                group,
            ] });
    }
    tableChildren.push({ c: "attribute adder", children: [
            { t: "input", c: "", placeholder: "property", keydown: handleAttributesKey, input: setAdder, submit: submitAdder, field: "adderAttribute", entityId: entityId, value: state.adderAttribute },
            { t: "input", c: "value", placeholder: "value", keydown: handleAttributesKey, input: setAdder, submit: submitAdder, field: "adderValue", entityId: entityId, value: state.adderValue },
        ] });
    return { c: "attributes", children: tableChildren };
}
app_1.handle("setActiveAttribute", function (changes, _a) {
    var eav = _a.eav, sourceView = _a.sourceView;
    if (!exports.uiState.widget.attributes[eav.entity]) {
        exports.uiState.widget.attributes[eav.entity] = {};
    }
    var cur = exports.uiState.widget.attributes[eav.entity];
    cur.active = eav;
    cur.sourceView = sourceView;
});
app_1.handle("clearActiveAttribute", function (changes, _a) {
    var entity = _a.entity;
    var cur = exports.uiState.widget.attributes[entity];
    if (cur) {
        cur.active = false;
        cur.sourceView = false;
    }
});
function setActiveAttribute(event, elem) {
    if (!event.defaultPrevented) {
        app_1.dispatch("setActiveAttribute", { eav: elem.eav, sourceView: elem.sourceView }).commit();
    }
}
function handleAttributesKey(event, elem) {
    console.log("HERE");
    if ((event.keyCode === utils_1.KEYS.ENTER || (event.keyCode === utils_1.KEYS.BACKSPACE && event.currentTarget.value === "")) && elem.submit) {
        elem.submit(event, elem);
    }
    else if (event.keyCode === utils_1.KEYS.ESC) {
        app_1.dispatch("setActiveAttribute", { eav: { entity: elem.eav.entity }, sourceView: false }).commit();
    }
}
app_1.handle("setAttributeAdder", function (changes, _a) {
    var entityId = _a.entityId, field = _a.field, value = _a.value;
    var cur = exports.uiState.widget.attributes[entityId];
    if (!exports.uiState.widget.attributes[entityId]) {
        cur = exports.uiState.widget.attributes[entityId] = {};
    }
    cur[field] = value;
});
function setAdder(event, elem) {
    var value = event.currentTarget.value;
    app_1.dispatch("setAttributeAdder", { entityId: elem.entityId, field: elem.field, value: value }).commit();
}
function submitAdder(event, elem) {
    var entityId = elem.entityId;
    var state = exports.uiState.widget.attributes[entityId];
    if (!state)
        return;
    var adderAttribute = state.adderAttribute, adderValue = state.adderValue;
    if (adderAttribute && adderValue) {
        var chain = app_1.dispatch("setAttributeAdder", { entityId: entityId, field: "adderAttribute", value: "" })
            .dispatch("setAttributeAdder", { entityId: entityId, field: "adderValue", value: "" });
        handleAttributeDefinition(entityId, adderAttribute, adderValue, chain);
    }
}
app_1.handle("remove attribute generating query", function (changes, _a) {
    var eav = _a.eav, view = _a.view;
    var queryId = eav.entity + "|" + eav.attribute + "|" + view;
    app_1.eve.removeView(queryId);
    changes.merge(runtime_1.Query.remove(queryId, app_1.eve));
    //find all the unions this was used with
    for (var _i = 0, _b = app_1.eve.find("action source", { "source view": queryId }); _i < _b.length; _i++) {
        var source = _b[_i];
        var action = source.action;
        changes.remove("action", { action: action });
        changes.remove("action mapping", { action: action });
        changes.remove("action mapping constant", { action: action });
    }
    changes.remove("action source", { source: queryId });
    console.log(changes);
});
function submitAttribute(event, elem) {
    var eav = elem.eav, sourceView = elem.sourceView, query = elem.query;
    var chain = app_1.dispatch("clearActiveAttribute", { entity: eav.entity });
    var value = event.currentTarget.value;
    if (value === query) {
        console.log("BAILING");
        return chain.commit();
    }
    if (elem.sourceView !== undefined) {
        //remove the previous source
        chain.dispatch("remove attribute generating query", { eav: eav, view: sourceView });
    }
    else {
        //remove the previous eav
        var fact = utils_1.copy(eav);
        fact.__id = undefined;
        chain.dispatch("remove entity attribute", fact);
    }
    if (value !== "") {
        handleAttributeDefinition(eav.entity, eav.attribute, value, chain);
    }
    else {
        chain.commit();
    }
}
//---------------------------------------------------------
// Wiki Widgets
//---------------------------------------------------------
function searchInput(paneId, value) {
    var display = app_1.eve.findOne("display name", { id: value });
    var name = value;
    if (display) {
        name = display.name;
    }
    var state = exports.uiState.widget.search[paneId] || { focused: false, plan: false };
    return {
        c: "flex-grow wiki-search-wrapper",
        children: [
            codeMirrorElement({
                c: "flex-grow wiki-search-input " + (state.focused ? "selected" : ""),
                paneId: paneId,
                value: name,
                focus: focusSearch,
                blur: setSearch,
                // change: updateSearch,
                shortcuts: { "Enter": setSearch }
            }),
            { c: "controls", children: [
                    { c: "ion-ios-arrow-" + (state.plan ? 'up' : 'down') + " plan", click: toggleSearchPlan, paneId: paneId },
                    // while technically a button, we don't need to do anything as clicking it will blur the editor
                    // which will execute the search
                    { c: "ion-android-search visible", paneId: paneId }
                ] },
        ]
    };
}
exports.searchInput = searchInput;
;
function focusSearch(event, elem) {
    app_1.dispatch("ui focus search", elem).commit();
}
function setSearch(event, elem) {
    var value = event.value;
    app_1.dispatch("insert query", { query: value })
        .dispatch("ui set search", { paneId: elem.paneId, value: event.value })
        .commit();
}
function updateSearch(event, elem) {
    app_1.dispatch("ui update search", elem).commit();
}
function toggleSearchPlan(event, elem) {
    console.log("toggle search plan", elem);
    app_1.dispatch("ui toggle search plan", elem).commit();
}
;
function codeMirrorElement(elem) {
    elem.postRender = codeMirrorPostRender(elem.postRender);
    return elem;
}
exports.codeMirrorElement = codeMirrorElement;
var _codeMirrorPostRenderMemo = {};
function handleCMEvent(handler, elem) {
    return function (cm) {
        var evt = (new CustomEvent("CMEvent"));
        evt.editor = cm;
        evt.value = cm.getDoc().getValue();
        handler(evt, elem);
    };
}
function codeMirrorPostRender(postRender) {
    var key = postRender ? postRender.toString() : "";
    if (_codeMirrorPostRenderMemo[key])
        return _codeMirrorPostRenderMemo[key];
    return _codeMirrorPostRenderMemo[key] = function (node, elem) {
        var cm = node.cm;
        if (!cm) {
            var extraKeys = {};
            if (elem.shortcuts) {
                for (var shortcut in elem.shortcuts)
                    extraKeys[shortcut] = handleCMEvent(elem.shortcuts[shortcut], elem);
            }
            cm = node.cm = CodeMirror(node, {
                lineWrapping: elem.lineWrapping !== false ? true : false,
                lineNumbers: elem.lineNumbers,
                mode: elem.mode || "text",
                extraKeys: extraKeys
            });
            if (elem.change)
                cm.on("change", handleCMEvent(elem.change, elem));
            if (elem.blur)
                cm.on("blur", handleCMEvent(elem.blur, elem));
            if (elem.focus)
                cm.on("focus", handleCMEvent(elem.focus, elem));
            if (elem.autofocus)
                cm.focus();
        }
        if (cm.getDoc().getValue() !== elem.value)
            cm.setValue(elem.value || "");
        if (postRender)
            postRender(node, elem);
    };
}
function getEntitiesFromResults(results, _a) {
    var _b = (_a === void 0 ? {} : _a).fields, fields = _b === void 0 ? ["entity"] : _b;
    var entities = [];
    if (!results.length)
        return entities;
    for (var _i = 0; _i < fields.length; _i++) {
        var field = fields[_i];
        if (results[0][field] === undefined)
            field = utils_1.builtinId(field);
        for (var _c = 0; _c < results.length; _c++) {
            var fact = results[_c];
            entities.push(fact[field]);
        }
    }
    return entities;
}
function getURLsFromResults(results, _a) {
    var _b = (_a === void 0 ? {} : _a).fields, fields = _b === void 0 ? ["url"] : _b;
    var urls = [];
    if (!results.length)
        return urls;
    for (var _i = 0; _i < fields.length; _i++) {
        var field = fields[_i];
        if (results[0][field] === undefined)
            field = utils_1.builtinId(field);
        for (var _c = 0; _c < results.length; _c++) {
            var fact = results[_c];
            if (urlRegex.exec(fact[field]))
                urls.push(fact[field]);
        }
    }
    return urls;
}
function prepareEntity(results, params) {
    var elem = {};
    var entities = getEntitiesFromResults(results, { fields: params.field ? [params.field] : undefined });
    var elems = [];
    for (var _i = 0; _i < entities.length; _i++) {
        var entity_2 = entities[_i];
        var elem_1 = utils_1.copy(params);
        elem_1.entity = entity_2;
        elems.push(elem_1);
    }
    if (elems.length === 1)
        return elems[0];
    else
        return elems;
}
function prepareURL(results, params) {
    var elem = {};
    var urls = getURLsFromResults(results, { fields: params.field ? [params.field] : undefined });
    var elems = [];
    for (var _i = 0; _i < urls.length; _i++) {
        var url = urls[_i];
        var elem_2 = utils_1.copy(params);
        elem_2.url = url;
        elems.push(elem_2);
    }
    if (elems.length === 1)
        return elems[0];
    else
        return elems;
}
var _prepare = {
    name: prepareEntity,
    link: prepareEntity,
    attributes: prepareEntity,
    related: prepareEntity,
    index: prepareEntity,
    view: prepareEntity,
    results: prepareEntity,
    value: function (results, params) {
        if (!params.field)
            throw new Error("Value representation requires a 'field' param indicating which field to represent");
        var field = params.field;
        if (!results.length)
            return [];
        // If field isn't in results, try to resolve it as a field name, otherwise error out
        if (results[0][field] === undefined) {
            var potentialIds = app_1.eve.find("display name", { name: field });
            var neueField;
            for (var _i = 0; _i < potentialIds.length; _i++) {
                var display = potentialIds[_i];
                if (results[0][display.id] !== undefined) {
                    if (neueField) {
                        neueField = undefined;
                        break;
                    }
                    neueField = display.id;
                }
            }
            if (!neueField)
                throw new Error("Unable to uniquely resolve field name " + field + " in result fields " + Object.keys(results[0]));
            else
                field = neueField;
        }
        var elems = [];
        for (var _a = 0; _a < results.length; _a++) {
            var row = results[_a];
            elems.push({ text: row[field], data: params.data });
        }
        return elems;
    },
    CSV: function (results, params) {
        if (!params.field)
            throw new Error("Value representation requires a 'field' param indicating which field to represent");
        var field = params.field;
        if (!results.length)
            return [];
        // If field isn't in results, try to resolve it as a field name, otherwise error out
        if (results[0][field] === undefined) {
            var potentialIds = app_1.eve.find("display name", { name: field });
            var neueField;
            for (var _i = 0; _i < potentialIds.length; _i++) {
                var display = potentialIds[_i];
                if (results[0][display.id] !== undefined) {
                    if (neueField) {
                        neueField = undefined;
                        break;
                    }
                    neueField = display.id;
                }
            }
            if (!neueField)
                throw new Error("Unable to uniquely resolve field name " + field + " in result fields " + Object.keys(results[0]));
            else
                field = neueField;
        }
        var values = [];
        for (var _a = 0; _a < results.length; _a++) {
            var row = results[_a];
            values.push(row[field]);
        }
        return { values: values, data: params.data };
    },
    error: function (results, params) {
        return { text: params["message"] };
    },
    table: function (results, params) {
        return { rows: results, data: params.data };
    },
    directory: function (results, params) {
        var entities = getEntitiesFromResults(results, { fields: params.field ? [params.field] : undefined });
        if (entities.length === 1) {
            var collection = entities[0];
            entities.length = 0;
            for (var _i = 0, _a = app_1.eve.find("is a attributes", { collection: collection }); _i < _a.length; _i++) {
                var fact = _a[_i];
                entities.push(fact.entity);
            }
        }
        return { entities: entities, data: params.data };
    },
    externalLink: prepareURL,
    externalImage: prepareURL,
    externalVideo: prepareURL,
    embeddedCell: function (results, params) {
        var rep = params["childRep"];
        var childInfo;
        if (_prepare[rep]) {
            params["data"] = params["data"] || params;
            childInfo = _prepare[rep](results, params);
            childInfo.data = childInfo.data || params;
        }
        else {
            childInfo = { data: params };
        }
        return { childInfo: childInfo, rep: rep, click: activateCell, cell: params["cell"] };
    },
};
function represent(search, rep, results, params) {
    // console.log("repping:", results, " as", rep, " with params ", params);
    if (rep in _prepare) {
        var embedParamSets = _prepare[rep](results.results, params);
        var isArray = embedParamSets && embedParamSets.constructor === Array;
        try {
            if (!embedParamSets || isArray && embedParamSets.length === 0) {
                return uitk.error({ text: search + " as " + rep });
            }
            else if (embedParamSets.constructor === Array) {
                var wrapper = { c: "flex-column", children: [] };
                for (var _i = 0; _i < embedParamSets.length; _i++) {
                    var embedParams = embedParamSets[_i];
                    embedParams["data"] = embedParams["data"] || params;
                    wrapper.children.push(uitk[rep](embedParams));
                }
                return wrapper;
            }
            else {
                var embedParams = embedParamSets;
                embedParams["data"] = embedParams["data"] || params;
                return uitk[rep](embedParams);
            }
        }
        catch (err) {
            console.error("REPRESENTATION ERROR");
            console.error({ search: search, rep: rep, results: results, params: params });
            console.error(err);
            return uitk.error({ text: "Failed to embed as " + (params["childRep"] || rep) });
        }
    }
}
var historyState = window.history.state;
var historyURL = window.location.pathname;
window.addEventListener("popstate", function (evt) {
    var popout = app_1.eve.findOne("ui pane", { kind: PANE.POPOUT });
    if (popout && popoutHistory.length) {
        window.history.pushState(historyState, null, historyURL);
        var search_1 = popoutHistory.pop();
        app_1.dispatch("ui set search", { paneId: popout.pane, value: search_1, peek: true, popState: true }).commit();
        return;
    }
    else if (evt.state && evt.state.root) {
        window.history.back();
        return;
    }
    historyState = evt.state;
    historyURL = window.location.pathname;
    var _a = evt.state || {}, _b = _a.paneId, paneId = _b === void 0 ? undefined : _b, _c = _a.contains, contains = _c === void 0 ? undefined : _c;
    if (paneId === undefined || contains === undefined)
        return;
    app_1.dispatch("ui set search", { paneId: paneId, value: contains, popState: true }).commit();
});
// @NOTE: Uncomment this to enable the new UI, or type `window["NEUE_UI"] = true; app.render()` into the console to enable it transiently.
window["NEUE_UI"] = true;
var _a;
//# sourceMappingURL=ui.js.map