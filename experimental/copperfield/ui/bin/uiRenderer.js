var UiRenderer;
(function (UiRenderer_1) {
    Api.ixer.addIndex("ui parent to elements", "uiElement", Indexing.create.collector(["uiElement: parent"]));
    Api.ixer.addIndex("ui element to attributes", "uiAttribute", Indexing.create.collector(["uiAttribute: element"]));
    Api.ixer.addIndex("ui element to attribute bindings", "uiAttributeBinding", Indexing.create.collector(["uiAttributeBinding: element"]));
    var UiRenderer = (function () {
        function UiRenderer(renderer) {
            this.renderer = renderer;
            this.refreshRate = 16; // Duration of a frame in ms.
            this.queued = false; // Whether the model is dirty and requires rerendering.
            this.warnings = []; // Warnings from the previous render (or all previous compilations).
            this.compiled = 0; // # of elements compiled since last render.
        }
        // Mark the renderer dirty so it will rerender next frame.
        UiRenderer.prototype.queue = function (root) {
            if (this.queued === false) {
                this.queued = true;
                // @FIXME: why does using request animation frame cause events to stack up and the renderer to get behind?
                var self_1 = this;
                setTimeout(function () {
                    var start = performance.now();
                    Api.ixer.clearTable("uiWarning");
                    var warnings;
                    // Rerender until all generated warnings have been committed to the indexer.
                    do {
                        var tree = root();
                        var elements = (Api.ixer.select("tag", { tag: "editor-ui" }) || []).map(function (tag) { return tag["tag: view"]; });
                        start = performance.now();
                        elements.unshift(tree);
                        warnings = self_1.render(elements);
                        if (warnings.length) {
                            Api.ixer.handleDiffs(Api.toDiffs(Api.insert("uiWarning", warnings)));
                        }
                    } while (warnings.length > 0);
                    var total = performance.now() - start;
                    if (total > 10) {
                        console.log("Slow render: " + total);
                    }
                    self_1.queued = false;
                }, this.refreshRate);
            }
        };
        // Render the given list of elements to the builtin MicroReact renderer.
        UiRenderer.prototype.render = function (roots) {
            this.compiled = 0;
            this.warnings = [];
            var elems = this.compile(roots);
            this.renderer.render(elems);
            var warnings = this.warnings;
            return warnings;
        };
        // @NOTE: In the interests of performance, roots will not be checked for ancestry --
        // instead of being a noop, specifying a child of a root as another root results in undefined behavior.
        // If this becomes a problem, it can be changed in the loop that initially populates compiledElements.
        UiRenderer.prototype.compile = function (roots) {
            var elementToChildren = Api.ixer.index("ui parent to elements", true);
            var elementToAttrs = Api.ixer.index("ui element to attributes", true);
            var elementToAttrBindings = Api.ixer.index("ui element to attribute bindings", true);
            var stack = [];
            var compiledElements = [];
            var keyToRow = {};
            var boundAncestors = {};
            for (var _i = 0; _i < roots.length; _i++) {
                var root = roots[_i];
                if (typeof root === "object") {
                    compiledElements.push(root);
                    continue;
                }
                var fact = Api.ixer.selectOne("uiElement", { element: root });
                var elem = { id: root, __template: root };
                if (fact && fact["uiElement: parent"]) {
                    elem.parent = fact["uiElement: parent"];
                }
                compiledElements.push(elem);
                stack.push(elem);
            }
            var start = Date.now();
            while (stack.length > 0) {
                var elem = stack.shift();
                var templateId = elem.__template;
                var fact = Api.ixer.selectOne("uiElement", { element: templateId });
                if (!fact) {
                    continue;
                }
                var attrs = elementToAttrs[templateId];
                var boundAttrs = elementToAttrBindings[templateId];
                var children = elementToChildren[templateId];
                var elems = [elem];
                var binding = Api.ixer.selectOne("uiElementBinding", { element: templateId });
                if (binding) {
                    // If the element is bound, it must be repeated for each row.
                    var boundView = binding["uiElementBinding: view"];
                    var rowToKey = this.generateRowToKeyFn(boundView);
                    var oldKey = elem.__binding;
                    var boundRows = this.getBoundRows(boundView, oldKey);
                    elems = [];
                    var ix = 0;
                    for (var _a = 0; _a < boundRows.length; _a++) {
                        var row = boundRows[_a];
                        // We need an id unique per row for bound elements.
                        var key = rowToKey(row);
                        var childId = elem.id + "." + ix;
                        elems.push({ t: elem.t, parent: elem.id, id: childId, __template: templateId, __binding: key });
                        keyToRow[key] = row;
                        if (DEBUG.RENDERER) {
                            console.log("* Linking " + childId + " -> " + (boundAncestors[elem.id] && boundAncestors[elem.id].id) + ".");
                        }
                        boundAncestors[childId] = boundAncestors[elem.id];
                        ix++;
                    }
                }
                var rowIx = 0;
                for (var _b = 0; _b < elems.length; _b++) {
                    var elem_1 = elems[_b];
                    this.compiled++;
                    // Handle meta properties.
                    var key = elem_1.__binding;
                    elem_1.t = fact["uiElement: tag"];
                    // Handle static properties.
                    if (attrs) {
                        for (var _c = 0; _c < attrs.length; _c++) {
                            var attr = attrs[_c];
                            var prop = attr["uiAttribute: property"], val = attr["uiAttribute: value"];
                            elem_1[prop] = val;
                            if (prop === "__binding") {
                                binding = true;
                                key = val;
                            }
                        }
                    }
                    // Handle bound properties.
                    // @NOTE: making __binding dynamically bindable is possible, but requires processing it as the first bound attribute to have the intended effect.
                    if (boundAttrs) {
                        for (var _d = 0; _d < boundAttrs.length; _d++) {
                            var attr = boundAttrs[_d];
                            var prop = attr["uiAttributeBinding: property"], field = attr["uiAttributeBinding: field"];
                            var curElem = elem_1;
                            var val = void 0;
                            var scopeIx = 0;
                            while (curElem && val === undefined) {
                                var key_1 = curElem.__binding;
                                var row = keyToRow[key_1];
                                val = row[field];
                                if (val === undefined) {
                                    curElem = boundAncestors[curElem.id];
                                    if (scopeIx > 100) {
                                        console.error("Recursion detected in bound attribute resolution for key '" + key_1 + "'.");
                                        break;
                                    }
                                    scopeIx++;
                                }
                            }
                            elem_1[prop] = val;
                            if (DEBUG.RENDERER) {
                                console.log("\n                * Binding " + elem_1.id + "['" + prop + "'] to " + field + " (" + val + ")\n                   source elem: " + (curElem && curElem.id) + "\n                   row: " + (curElem && JSON.stringify(keyToRow[curElem.__binding])) + "\n                ");
                            }
                        }
                    }
                    // Prep children and add them to the stack.
                    if (children) {
                        var boundAncestor = boundAncestors[elem_1.id];
                        if (binding) {
                            boundAncestor = elem_1;
                        }
                        elem_1.children = [];
                        for (var _e = 0; _e < children.length; _e++) {
                            var child = children[_e];
                            var childTemplateId = child["uiElement: element"];
                            var childId = elem_1.id + "__" + childTemplateId;
                            boundAncestors[childId] = boundAncestor;
                            var childElem = { id: childId, __template: childTemplateId, __binding: key };
                            elem_1.children.push(childElem);
                            stack.push(childElem);
                        }
                    }
                    // Handle compiled element tags.
                    var elementCompiler = UiRenderer_1.elementCompilers[elem_1.t];
                    if (elementCompiler) {
                        try {
                            elementCompiler(elem_1);
                        }
                        catch (err) {
                            var row = keyToRow[key];
                            var warning = { element: elem_1.id, row: row || "", warning: err.message };
                            if (!Api.ixer.selectOne("uiWarning", warning)) {
                                this.warnings.push(warning);
                            }
                            elem_1["message"] = warning.warning;
                            elem_1["element"] = warning.element;
                            Ui.uiError(elem_1);
                            console.warn("Invalid element:", elem_1);
                        }
                    }
                    if (DEBUG.RENDERER) {
                        elem_1.debug = elem_1.id;
                    }
                    rowIx++;
                }
                if (binding) {
                    elem.children = elems;
                }
            }
            if (DEBUG.RENDER_TIME) {
                console.log(Date.now() - start);
            }
            return compiledElements;
        };
        // Generate a unique key for the given row based on the structure of the given view.
        UiRenderer.prototype.generateRowToKeyFn = function (viewId) {
            var keys = Api.ixer.getKeys(viewId);
            if (keys.length > 1) {
                return function (row) {
                    return viewId + ": " + keys.map(function (key) { return row[key]; }).join(",");
                };
            }
            else if (keys.length > 0) {
                return function (row) {
                    return viewId + ": " + row[keys[0]];
                };
            }
            else {
                return function (row) { return (viewId + ": " + JSON.stringify(row)); };
            }
        };
        UiRenderer.prototype.getViewForKey = function (key) {
            return key.slice(0, key.indexOf(":"));
        };
        // Get only the rows of view matching the key (if specified) or all rows from the view if not.
        UiRenderer.prototype.getBoundRows = function (viewId, key) {
            var keys = Api.ixer.getKeys(viewId);
            if (key && keys.length === 1) {
                return Api.ixer.select(viewId, (_a = {}, _a[Api.code.name(keys[0])] = key, _a));
            }
            else if (key && keys.length > 0) {
                var rowToKey = this.generateRowToKeyFn(viewId);
                return Api.ixer.select(viewId, {}).filter(function (row) { return rowToKey(row) === key; });
            }
            else {
                return Api.ixer.select(viewId, {});
            }
            var _a;
        };
        return UiRenderer;
    })();
    UiRenderer_1.UiRenderer = UiRenderer;
    UiRenderer_1.elementCompilers = {
        chart: function (elem) {
            elem.pointLabels = (elem.pointLabels) ? [elem.pointLabels] : elem.pointLabels;
            elem.ydata = (elem.ydata) ? [elem.ydata] : [];
            elem.xdata = (elem.xdata) ? [elem.xdata] : elem.xdata;
            Ui.chart(elem);
        }
    };
    function addElementCompiler(tag, compiler) {
        if (UiRenderer_1.elementCompilers[tag]) {
            throw new Error("Refusing to overwrite existing compilfer for tag: \"" + tag + "\"");
        }
        UiRenderer_1.elementCompilers[tag] = compiler;
    }
    UiRenderer_1.addElementCompiler = addElementCompiler;
})(UiRenderer || (UiRenderer = {}));
//# sourceMappingURL=uiRenderer.js.map