var utils_1 = require("./utils");
var app_1 = require("./app");
var ui_1 = require("./ui");
var masonry_1 = require("./masonry");
//------------------------------------------------------------------------------
// Utilities
//------------------------------------------------------------------------------
function resolveName(maybeId) {
    var display = app_1.eve.findOne("display name", { id: maybeId });
    return display ? display.name : maybeId;
}
exports.resolveName = resolveName;
function resolveId(maybeName) {
    var display = app_1.eve.findOne("display name", { name: maybeName });
    return display ? display.id : maybeName;
}
exports.resolveId = resolveId;
function resolveValue(maybeValue) {
    if (typeof maybeValue !== "string")
        return maybeValue;
    var val = maybeValue.trim();
    if (val.indexOf("=") === 0) {
        // @TODO: Run through the full NLP.
        var search = val.substring(1).trim();
        return resolveId(search);
    }
    return val;
}
exports.resolveValue = resolveValue;
function isEntity(maybeId) {
    return !!app_1.eve.findOne("entity", { entity: maybeId });
}
exports.isEntity = isEntity;
var wordSplitter = /\s+/gi;
var statWeights = { links: 100, pages: 200, words: 1 };
function classifyEntities(rawEntities) {
    var entities = rawEntities.slice();
    var collections = [];
    var systems = [];
    // Measure relatedness + length of entities
    // @TODO: mtimes of entities
    var relatedCounts = {};
    var wordCounts = {};
    var childCounts = {};
    var scores = {};
    for (var _i = 0; _i < entities.length; _i++) {
        var entity = entities[_i];
        var _a = (app_1.eve.findOne("entity", { entity: entity }) || {}).content, content = _a === void 0 ? "" : _a;
        relatedCounts[entity] = app_1.eve.find("directionless links", { entity: entity }).length;
        wordCounts[entity] = content.trim().replace(wordSplitter, " ").split(" ").length;
        var _b = (app_1.eve.findOne("collection", { collection: entity }) || {}).count, childCount = _b === void 0 ? 0 : _b;
        childCounts[entity] = childCount;
        scores[entity] =
            relatedCounts[entity] * statWeights.links +
                wordCounts[entity] * statWeights.words +
                childCounts[entity] * statWeights.pages;
    }
    // Separate system entities
    var ix = 0;
    while (ix < entities.length) {
        if (app_1.eve.findOne("is a attributes", { collection: utils_1.builtinId("system"), entity: entities[ix] })) {
            systems.push(entities.splice(ix, 1)[0]);
        }
        else
            ix++;
    }
    // Separate user collections from other entities
    ix = 0;
    while (ix < entities.length) {
        if (childCounts[entities[ix]]) {
            collections.push(entities.splice(ix, 1)[0]);
        }
        else
            ix++;
    }
    return { systems: systems, collections: collections, entities: entities, scores: scores, relatedCounts: relatedCounts, wordCounts: wordCounts, childCounts: childCounts };
}
//------------------------------------------------------------------------------
// Handlers
//------------------------------------------------------------------------------
function preventDefault(event) {
    event.preventDefault();
}
function preventDefaultUnlessFocused(event) {
    if (event.target !== document.activeElement)
        event.preventDefault();
}
function closePopup() {
    var popout = app_1.eve.findOne("ui pane", { kind: ui_1.PANE.POPOUT });
    if (popout)
        app_1.dispatch("remove popup", { paneId: popout.pane }).commit();
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
function navigateOrEdit(event, elem) {
    var popout = app_1.eve.findOne("ui pane", { kind: ui_1.PANE.POPOUT });
    var peeking = popout && popout.contains === elem.link;
    if (event.target === document.activeElement) { }
    else if (!peeking)
        navigate(event, elem);
    else {
        closePopup();
        event.target.focus();
    }
}
function updateEntityValue(event, elem) {
    var value = utils_1.coerceInput(event.detail);
    var rowElem = elem.row, field = elem.field;
    var tableElem = rowElem.table, row = rowElem.row;
    var entity = tableElem["entity"];
    var rows = elem.rows || [row];
    var chain = app_1.dispatch();
    for (var _i = 0; _i < rows.length; _i++) {
        var row_1 = rows[_i];
        if (field === "value" && row_1.value !== value && row_1.attribute !== undefined) {
            chain.dispatch("update entity attribute", { entity: entity, attribute: row_1.attribute, prev: row_1.value, value: value });
        }
        else if (field === "attribute" && row_1.attribute !== value && row_1.value !== undefined) {
            chain.dispatch("rename entity attribute", { entity: entity, prev: row_1.attribute, attribute: value, value: row_1.value });
        }
    }
    chain.commit();
}
function updateEntityAttributes(event, elem) {
    var _a = elem.row, tableElem = _a.table, row = _a.row;
    var entity = tableElem["entity"];
    if (event.detail === "add") {
        var state = elem["state"]["adder"];
        var valid = elem["fields"].every(function (field) {
            return state[field] !== undefined;
        });
        if (valid) {
            app_1.dispatch("add sourced eav", { entity: entity, attribute: state.attribute, value: resolveValue(state.value) }).commit();
            elem["state"]["adder"] = {};
        }
    }
    else {
        app_1.dispatch("remove entity attribute", { entity: entity, attribute: row.attribute, value: row.value }).commit();
    }
}
function sortTable(event, elem) {
    var key = elem.key, _a = elem.field, field = _a === void 0 ? undefined : _a, _b = elem.direction, direction = _b === void 0 ? undefined : _b;
    console.log(key, field, direction);
    if (field === undefined && direction === undefined) {
        field = event.target.value;
        console.log("ETV", field);
    }
    app_1.dispatch("sort table", { key: key, field: field, direction: direction }).commit();
}
//------------------------------------------------------------------------------
// Embedded cell representation wrapper
//------------------------------------------------------------------------------
var uitk = this;
function embeddedCell(elem) {
    var children = [];
    var childInfo = elem.childInfo, rep = elem.rep;
    if (childInfo.constructor === Array) {
        for (var _i = 0; _i < childInfo.length; _i++) {
            var child = childInfo[_i];
            child["data"] = child["data"] || childInfo.params;
            children.push(uitk[rep](child));
        }
    }
    else {
        children.push(uitk[rep](childInfo));
    }
    children.push({ c: "edit-button-container", children: [
            { c: "edit-button ion-edit", click: elem.click, cell: elem.cell }
        ] });
    return { c: "non-editing-embedded-cell", children: children, cell: elem.cell };
}
exports.embeddedCell = embeddedCell;
//------------------------------------------------------------------------------
// Representations for Errors
//------------------------------------------------------------------------------
function error(elem) {
    elem.c = "error-rep " + (elem.c || "");
    console.log(elem);
    return elem;
}
exports.error = error;
function name(elem) {
    var entity = elem.entity;
    var _a = (app_1.eve.findOne("display name", { id: entity }) || {}).name, name = _a === void 0 ? entity : _a;
    elem.text = name;
    elem.c = "entity " + (elem.c || "");
    return elem;
}
exports.name = name;
function link(elem) {
    var entity = elem.entity;
    var name = resolveName(entity);
    elem.c = (elem.c || "") + " entity link inline";
    elem.text = elem.text || name;
    elem["link"] = elem["link"] || entity;
    elem.click = elem.click || navigate;
    elem["peek"] = elem["peek"] !== undefined ? elem["peek"] : true;
    return elem;
}
exports.link = link;
function attributes(elem) {
    var entity = elem.entity;
    var attributes = [];
    for (var _i = 0, _a = app_1.eve.find("entity eavs", { entity: entity }); _i < _a.length; _i++) {
        var eav = _a[_i];
        attributes.push({ attribute: eav.attribute, value: eav.value });
    }
    attributes.sort(function (a, b) {
        if (a.attribute === b.attribute)
            return 0;
        else if (a.attribute < b.attribute)
            return -1;
        return 1;
    });
    elem["groups"] = ["attribute"];
    elem["rows"] = attributes;
    elem["editCell"] = updateEntityValue;
    elem["editRow"] = updateEntityAttributes;
    elem["noHeader"] = true;
    return table(elem);
}
exports.attributes = attributes;
function related(elem) {
    var entity = elem.entity, _a = elem.data, data = _a === void 0 ? undefined : _a;
    var name = resolveName(entity);
    var relations = [];
    for (var _i = 0, _b = app_1.eve.find("directionless links", { entity: entity }); _i < _b.length; _i++) {
        var link_1 = _b[_i];
        relations.push(link_1.link);
    }
    elem.c = elem.c !== undefined ? elem.c : "flex-row flex-wrap csv";
    if (relations.length) {
        elem.children = [{ t: "h2", text: name + " is related to " + relations.length + " " + pluralize("entities", relations.length) + ":" }];
        for (var _c = 0; _c < relations.length; _c++) {
            var rel = relations[_c];
            elem.children.push(link({ entity: rel, data: data }));
        }
    }
    else
        elem.text = name + " is not related to any other entities.";
    return elem;
}
exports.related = related;
function index(elem) {
    var entity = elem.entity;
    var name = resolveName(entity);
    var facts = app_1.eve.find("is a attributes", { collection: entity });
    var list = { t: "ul", children: [] };
    for (var _i = 0; _i < facts.length; _i++) {
        var fact = facts[_i];
        list.children.push(link({ t: "li", entity: fact.entity, data: elem.data }));
    }
    elem.children = [
        { t: "h2", text: "There " + pluralize("are", facts.length) + " " + facts.length + " " + pluralize(name, facts.length) + ":" },
        list
    ];
    return elem;
}
exports.index = index;
function view(elem) {
    var entity = elem.entity;
    var name = resolveName(entity);
    // @TODO: Check if given entity is a view, or render an error
    var rows = app_1.eve.find(entity);
    elem["rows"] = rows;
    return table(elem);
}
exports.view = view;
function results(elem) {
    var entity = elem.entity, _a = elem.data, data = _a === void 0 ? undefined : _a;
    elem.children = [name({ entity: entity, data: data })];
    for (var _i = 0, _b = app_1.eve.find("entity eavs", { entity: entity, attribute: "artifact" }); _i < _b.length; _i++) {
        var eav = _b[_i];
        elem.children.push(name({ t: "h3", entity: eav.value, data: data }), view({ entity: eav.value, data: data }));
    }
    return elem;
}
exports.results = results;
function value(elem) {
    var _a = elem.text, val = _a === void 0 ? "" : _a, _b = elem.autolink, autolink = _b === void 0 ? true : _b, _c = elem.editable, editable = _c === void 0 ? false : _c;
    elem["original"] = val;
    var cleanup;
    if (isEntity(val)) {
        elem["entity"] = val;
        elem.text = resolveName(val);
        if (autolink)
            elem = link(elem);
        if (editable && autolink) {
            elem.mousedown = preventDefaultUnlessFocused;
            elem.click = navigateOrEdit;
            cleanup = closePopup;
        }
    }
    if (editable) {
        if (elem.t !== "input") {
            elem.contentEditable = true;
        }
        // elem.t = "input";
        elem.placeholder = "<empty>";
        elem.value = elem.text || "";
        var _blur = elem.blur;
        elem.blur = function (event, elem) {
            var node = event.target;
            if (_blur)
                _blur(event, elem);
            if (node.value === "= " + elem.value)
                node.value = elem.value;
            if (elem.value !== val)
                node.classList.add("link");
            if (cleanup)
                cleanup(event, elem);
        };
        var _focus = elem.focus;
        elem.focus = function (event, elem) {
            var node = event.target;
            if (elem.value !== val) {
                node.value = "= " + elem.value;
                node.classList.remove("link");
            }
            if (_focus)
                _focus(event, elem);
        };
    }
    return elem;
}
exports.value = value;
function CSV(elem) {
    var values = elem.values, _a = elem.autolink, autolink = _a === void 0 ? undefined : _a, data = elem.data;
    return { c: "flex-row csv", children: values.map(function (val) { return value({ t: "span", autolink: autolink, text: val, data: data }); }) };
}
exports.CSV = CSV;
function table(elem) {
    var rows = elem.rows, _a = elem.ignoreFields, ignoreFields = _a === void 0 ? ["__id"] : _a, _b = elem.sortable, sortable = _b === void 0 ? false : _b, _c = elem.ignoreTemp, ignoreTemp = _c === void 0 ? true : _c, _d = elem.data, data = _d === void 0 ? undefined : _d, _e = elem.noHeader, noHeader = _e === void 0 ? false : _e, _f = elem.groups, groups = _f === void 0 ? [] : _f;
    if (!rows.length) {
        elem.text = "<Empty Table>";
        return elem;
    }
    if (sortable && !elem.key)
        throw new Error("Cannot track sorting state for a table without a key");
    var localState = ui_1.uiState.widget.table[elem.key] || {};
    ui_1.uiState.widget.table[elem.key] = localState;
    var _g = elem.editCell, editCell = _g === void 0 ? undefined : _g, _h = elem.editRow, editRow = _h === void 0 ? undefined : _h, _j = elem.editField, editField = _j === void 0 ? undefined : _j;
    if (editCell) {
        var _editCell = editCell;
        editCell = function (event, elem) {
            var node = event.target;
            var val;
            if (node.nodeName === "INPUT") {
                val = resolveValue(node.value);
            }
            else {
                val = resolveValue(node.textContent);
            }
            if (val === elem["original"])
                return;
            var neueEvent = new CustomEvent("editcell", { detail: val });
            _editCell(neueEvent, elem);
        };
    }
    if (editRow) {
        var addRow = function (evt, elem) {
            var event = new CustomEvent("editrow", { detail: "add" });
            editRow(event, elem);
        };
        var trackInput = function (evt, elem) {
            var node = evt.target;
            localState["adder"][elem["field"]] = node.value;
            app_1.dispatch().commit();
        };
        var removeRow = function (evt, elem) { return editRow(new CustomEvent("editrow", { detail: "remove" }), elem); };
    }
    if (editField) {
        // @FIXME: Wrap these with the logic for the editing modal, only add/remove on actual completed field
        var addField = function (evt, elem) { return editRow(new CustomEvent("editfield", { detail: "add" }), elem); };
        var removeField = function (evt, elem) { return editRow(new CustomEvent("editfield", { detail: "remove" }), elem); };
    }
    // Collate non-ignored fields
    var fields = Object.keys(rows[0]);
    var fieldIx = 0;
    while (fieldIx < fields.length) {
        if (ignoreFields && ignoreFields.indexOf(fields[fieldIx]) !== -1)
            fields.splice(fieldIx, 1);
        else if (ignoreTemp && fields[fieldIx].indexOf("$$temp") === 0)
            fields.splice(fieldIx, 1);
        else
            fieldIx++;
    }
    var header = { t: "header", children: [] };
    var _k = localState.field, sortField = _k === void 0 ? undefined : _k, sortDirection = localState.direction;
    sortDirection = sortDirection || 1;
    for (var _i = 0; _i < fields.length; _i++) {
        var field = fields[_i];
        var isActive = field === sortField;
        var direction = (field === sortField) ? sortDirection : 0;
        header.children.push({ c: "column field flex-row", children: [
                value({ text: field, data: data, autolink: false }),
                { c: "flex-grow" },
                { c: "controls", children: [
                        sortable ? {
                            c: "sort-toggle " + (isActive && direction < 0 ? "ion-arrow-up-b" : "ion-arrow-down-b") + " " + (isActive ? "active" : ""),
                            key: elem.key,
                            field: field,
                            direction: -direction,
                            click: sortTable
                        } : undefined
                    ] }
            ] });
    }
    if (sortable && sortField) {
        var back = -1 * sortDirection;
        var fwd = sortDirection;
        rows.sort(function sorter(rowA, rowB) {
            var a = resolveName(resolveValue(rowA[sortField])), b = resolveName(resolveValue(rowB[sortField]));
            return (a === b) ? 0 :
                (a === undefined) ? fwd :
                    (b === undefined) ? back :
                        (a > b) ? fwd : back;
        });
    }
    //@TODO: allow this to handle multiple groups
    if (groups.length > 1)
        throw new Error("Tables only support grouping on one field");
    if (groups.length) {
        var toGroup = groups[0];
        rows.sort(function (a, b) {
            var ag = a[toGroup];
            var bg = b[toGroup];
            if (ag === bg)
                return 0;
            if (ag < bg)
                return -1;
            return 1;
        });
    }
    //@FIXME: the grouping strategy here is a disaster
    var body = { c: "body", children: [] };
    var ix = 0;
    var rowsLen = rows.length;
    while (ix < rowsLen) {
        var row = rows[ix];
        var rowElem = { c: "row group", table: elem, row: row, children: [] };
        for (var _l = 0; _l < groups.length; _l++) {
            var grouped = groups[_l];
            var collected = [];
            rowElem.children.push(value({ c: "column field", text: row[grouped], editable: editCell ? true : false, blur: editCell, row: rowElem, grouped: true, rows: collected, field: grouped, data: data, keydown: handleCellKeys }));
            var subgroup = { c: "column sub-group", table: elem, row: row, children: [] };
            rowElem.children.push(subgroup);
            var subrow = rows[ix];
            while (ix < rowsLen && subrow[grouped] === row[grouped]) {
                var subrowElem = { c: "sub-row", table: elem, row: subrow, children: [] };
                subgroup.children.push(subrowElem);
                collected.push(subrow);
                for (var _m = 0; _m < fields.length; _m++) {
                    var field = fields[_m];
                    if (field === grouped)
                        continue;
                    subrowElem.children.push(value({ c: "field", text: subrow[field], editable: editCell ? true : false, blur: editCell, row: subrowElem, field: field, data: data, keydown: handleCellKeys }));
                }
                if (editRow)
                    subrowElem.children.push({ c: "controls", children: [{ c: "remove-row ion-android-close", row: subrowElem, click: removeRow }] });
                ix++;
                subrow = rows[ix];
            }
        }
        if (groups.length === 0) {
            for (var _o = 0; _o < fields.length; _o++) {
                var field = fields[_o];
                rowElem.children.push(value({ c: "column field", text: row[field], editable: editCell ? true : false, blur: editCell, row: rowElem, field: field, data: data, keydown: handleCellKeys }));
            }
            if (editRow)
                rowElem.children.push({ c: "controls", children: [{ c: "remove-row ion-android-close", row: rowElem, click: removeRow }] });
            ix++;
        }
        body.children.push(rowElem);
    }
    if (editRow) {
        if (!localState["adder"]) {
            localState["adder"] = {};
        }
        var rowElem = { c: "row group add-row", table: elem, row: [], children: [] };
        for (var _p = 0; _p < fields.length; _p++) {
            var field = fields[_p];
            rowElem.children.push(value({ t: "input", c: "column field", editable: true, input: trackInput, blur: addRow, row: rowElem, keydown: handleCellKeys, attribute: field, field: field, fields: fields, data: data, table: elem, state: localState, text: localState["adder"][field] || "" }));
        }
        body.children.push(rowElem);
    }
    elem.c = "table " + (elem.c || "");
    elem.children = [header, body];
    if (noHeader) {
        elem.children.shift();
    }
    return elem;
}
exports.table = table;
function handleCellKeys(event, elem) {
    if (event.keyCode === utils_1.KEYS.ENTER) {
        elem.blur(event, elem);
        event.preventDefault();
    }
}
function tableFilter(elem) {
    var key = elem.key, _a = elem.search, search = _a === void 0 ? undefined : _a, _b = elem.sortFields, sortFields = _b === void 0 ? undefined : _b;
    elem.children = [];
    if (sortFields) {
        var state = ui_1.uiState.widget.table[key] || { field: undefined, direction: undefined };
        var sortOpts = [];
        for (var _i = 0; _i < sortFields.length; _i++) {
            var field = sortFields[_i];
            sortOpts.push({ t: "option", text: resolveName(field), value: field, selected: field === state.field });
        }
        elem.children.push({ c: "flex-grow" });
        elem.children.push({ c: "sort", children: [
                { text: "Sort by" },
                { t: "select", c: "select-sort-field select", value: state.field, children: sortOpts, key: key, change: sortTable },
                { c: "toggle-sort-dir " + (state.direction === -1 ? "ion-arrow-up-b" : "ion-arrow-down-b"), key: key, direction: -state.direction || 1, click: sortTable },
            ] });
    }
    elem.c = "table-filter " + (elem.c || "");
    return elem;
}
exports.tableFilter = tableFilter;
function externalLink(elem) {
    elem.t = "a";
    elem.c = "link " + (elem.c || "");
    elem.href = elem.url;
    elem.text = elem.text || elem.url;
    return elem;
}
exports.externalLink = externalLink;
function externalImage(elem) {
    elem.t = "img";
    elem.c = "img " + (elem.c || "");
    elem.src = elem.url;
    return elem;
}
exports.externalImage = externalImage;
function externalVideo(elem) {
    var ext = elem.url.slice(elem.url.lastIndexOf(".")).trim().toLowerCase();
    var domain = elem.url.slice(elem.url.indexOf("//") + 2).split("/")[0];
    var isFile = ["mp4", "ogv", "webm", "mov", "avi", "flv"].indexOf(ext) !== -1;
    if (isFile) {
        elem.t = "video";
    }
    else {
        elem.t = "iframe";
    }
    elem.c = "video " + (elem.c || "");
    elem.src = elem.url;
    elem.allowfullscreen = true;
    return elem;
}
exports.externalVideo = externalVideo;
function collapsible(elem) {
    if (elem.key === undefined)
        throw new Error("Must specify a key to maintain collapsible state");
    var state = ui_1.uiState.widget.collapsible[elem.key] || { open: elem.open !== undefined ? elem.open : true };
    var content = { children: elem.children };
    var header = { t: "header", children: [{ c: "collapse-toggle " + (state.open ? "ion-chevron-up" : "ion-chevron-down"), collapsible: elem.key, open: state.open, click: toggleCollapse }, elem.header] };
    elem.c = "collapsible " + (elem.c || "");
    elem.children = [header, state.open ? content : undefined];
    return elem;
}
exports.collapsible = collapsible;
function toggleCollapse(evt, elem) {
    app_1.dispatch("toggle collapse", { collapsible: elem.collapsible, open: !elem.open });
}
var directoryTileLayouts = [
    { size: 4, c: "big", format: function (elem) {
            elem.children.unshift;
            elem.children.push({ text: "(" + elem["stats"][elem["stats"].best] + " " + elem["stats"].best + ")" });
            return elem;
        } },
    { size: 2, c: "detailed", format: function (elem) {
            elem.children.push({ text: "(" + elem["stats"][elem["stats"].best] + " " + elem["stats"].best + ")" });
            return elem;
        } },
    { size: 1, c: "normal", grouped: 2 }
];
var directoryTileStyles = ["tile-style-1", "tile-style-2", "tile-style-3", "tile-style-4", "tile-style-5", "tile-style-6", "tile-style-7"];
function directory(elem) {
    var MAX_ENTITIES_BEFORE_OVERFLOW = 14;
    var rawEntities = elem.entities, _a = elem.data, data = _a === void 0 ? undefined : _a;
    var _b = classifyEntities(rawEntities), systems = _b.systems, collections = _b.collections, entities = _b.entities, scores = _b.scores, relatedCounts = _b.relatedCounts, wordCounts = _b.wordCounts, childCounts = _b.childCounts;
    var sortByScores = utils_1.sortByLookup(scores);
    entities.sort(sortByScores);
    collections.sort(sortByScores);
    systems.sort(sortByScores);
    // Link to entity
    // Peek with most significant statistic (e.g. 13 related; or 14 childrenpages; or 5000 words)
    // Slider pane will all statistics
    // Click opens popup preview
    function formatTile(entity) {
        var stats = { best: "", links: relatedCounts[entity], pages: childCounts[entity], words: wordCounts[entity] };
        var maxContribution = 0;
        for (var stat in stats) {
            if (!statWeights[stat])
                continue;
            var contribution = stats[stat] * statWeights[stat];
            if (contribution > maxContribution) {
                maxContribution = contribution;
                stats.best = stat;
            }
        }
        return { size: scores[entity], stats: stats, children: [
                link({ entity: entity, data: data })
            ] };
    }
    function formatOverflow(key, entities, skipChildren) {
        if (skipChildren === void 0) { skipChildren = false; }
        var rows = [];
        for (var _i = 0; _i < entities.length; _i++) {
            var entity = entities[_i];
            rows.push({
                name: entity,
                score: scores[entity],
                words: wordCounts[entity],
                links: relatedCounts[entity],
                pages: childCounts[entity]
            });
            if (skipChildren)
                delete rows[rows.length - 1].pages;
        }
        return table({ c: "overflow-list", key: key, rows: rows, sortable: true, data: data });
    }
    // @TODO: Put formatOverflow into a collapsed container.
    return { c: "directory flex-column", children: [
            { t: "h2", text: "Collections" },
            exports.masonry({ c: "directory-listing", layouts: directoryTileLayouts, styles: directoryTileStyles, children: collections.map(formatTile) }),
            { t: "h2", text: "Entities" },
            exports.masonry({ c: "directory-listing", layouts: directoryTileLayouts, styles: directoryTileStyles, children: entities.slice(0, MAX_ENTITIES_BEFORE_OVERFLOW).map(formatTile) }),
            collapsible({
                key: elem.key + "|directory entities collapsible",
                header: { text: "Show all entities..." },
                children: [
                    //tableFilter({key: `${elem.key}|directory entities overflow`, sortFields: ["name", "score", "words", "links"]}),
                    formatOverflow(elem.key + "|directory entities overflow", entities, true)
                ],
                open: false
            }),
            { t: "h2", text: "Internals" },
            collapsible({
                key: elem.key + "|directory systems collapsible",
                header: { text: "Show all internal entities..." },
                children: [formatOverflow(elem.key + "|directory systems overflow", systems)],
                open: false
            }),
        ] };
}
exports.directory = directory;
exports.masonry = masonry_1.masonry;
//# sourceMappingURL=uitk.js.map