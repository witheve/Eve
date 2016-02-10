var utils_1 = require("./utils");
var runtime_1 = require("./runtime");
function resolve(table, fact) {
    var neue = {};
    for (var field in fact)
        neue[(table + ": " + field)] = fact[field];
    return neue;
}
function humanize(table, fact) {
    var neue = {};
    for (var field in fact)
        neue[field.slice(table.length + 2)] = fact[field];
    return neue;
}
function resolvedAdd(changeset, table, fact) {
    return changeset.add(table, resolve(table, fact));
}
function resolvedRemove(changeset, table, fact) {
    return changeset.remove(table, resolve(table, fact));
}
function humanizedFind(ixer, table, query) {
    var results = [];
    for (var _i = 0, _a = ixer.find(table, resolve(table, query)); _i < _a.length; _i++) {
        var fact = _a[_i];
        results.push(humanize(table, fact));
    }
    var diag = {};
    for (var table_1 in ixer.tables)
        diag[table_1] = ixer.tables[table_1].table.length;
    return results;
}
var UI = (function () {
    function UI(id) {
        this.id = id;
        this._children = [];
        this._attributes = {};
        this._events = {};
    }
    UI.remove = function (template, ixer) {
        var changeset = ixer.diff();
        resolvedRemove(changeset, "ui template", { template: template });
        resolvedRemove(changeset, "ui template binding", { template: template });
        var bindings = humanizedFind(ixer, "ui template binding", { template: template });
        for (var _i = 0; _i < bindings.length; _i++) {
            var binding = bindings[_i];
            changeset.merge(runtime_1.Query.remove(binding.binding, ixer));
        }
        resolvedRemove(changeset, "ui embed", { template: template });
        var embeds = humanizedFind(ixer, "ui embed", { template: template });
        for (var _a = 0; _a < embeds.length; _a++) {
            var embed = embeds[_a];
            resolvedRemove(changeset, "ui embed scope", { template: template, embed: embed.embed });
            resolvedRemove(changeset, "ui embed scope binding", { template: template, embed: embed.embed });
        }
        resolvedRemove(changeset, "ui attribute", { template: template });
        resolvedRemove(changeset, "ui attribute binding", { template: template });
        resolvedRemove(changeset, "ui event", { template: template });
        var events = humanizedFind(ixer, "ui event", { template: template });
        for (var _b = 0; _b < events.length; _b++) {
            var event_1 = events[_b];
            resolvedRemove(changeset, "ui event state", { template: template, event: event_1.event });
            resolvedRemove(changeset, "ui event state binding", { template: template, event: event_1.event });
        }
        for (var _c = 0, _d = humanizedFind(ixer, "ui template", { parent: template }); _c < _d.length; _c++) {
            var child = _d[_c];
            changeset.merge(UI.remove(child.template, ixer));
        }
        return changeset;
    };
    UI.prototype.copy = function () {
        var neue = new UI(this.id);
        neue._binding = this._binding;
        neue._embedded = this._embedded;
        neue._children = this._children;
        neue._attributes = this._attributes;
        neue._events = this._events;
        neue._parent = this._parent;
        return neue;
    };
    UI.prototype.changeset = function (ixer) {
        var changeset = ixer.diff();
        var parent = this._attributes["parent"] || (this._parent && this._parent.id) || "";
        var ix = this._attributes["ix"];
        if (ix === undefined)
            ix = (this._parent && this._parent._children.indexOf(this));
        if (ix === -1 || ix === undefined)
            ix = "";
        if (this._embedded)
            parent = "";
        resolvedAdd(changeset, "ui template", { template: this.id, parent: parent, ix: ix });
        if (this._binding) {
            if (!this._binding.name || this._binding.name === "unknown")
                this._binding.name = "bound view " + this.id;
            changeset.merge(this._binding.changeset(ixer));
            resolvedAdd(changeset, "ui template binding", { template: this.id, binding: this._binding.name });
        }
        if (this._embedded) {
            var embed = utils_1.uuid();
            resolvedAdd(changeset, "ui embed", { embed: embed, template: this.id, parent: (this._parent || {}).id, ix: ix });
            for (var key in this._embedded) {
                var value = this._attributes[key];
                if (value instanceof Array)
                    resolvedAdd(changeset, "ui embed scope binding", { embed: embed, key: key, source: value[0], alias: value[1] });
                else
                    resolvedAdd(changeset, "ui embed scope", { embed: embed, key: key, value: value });
            }
        }
        for (var property in this._attributes) {
            var value = this._attributes[property];
            if (value instanceof Array)
                resolvedAdd(changeset, "ui attribute binding", { template: this.id, property: property, source: value[0], alias: value[1] });
            else
                resolvedAdd(changeset, "ui attribute", { template: this.id, property: property, value: value });
        }
        for (var event_2 in this._events) {
            resolvedAdd(changeset, "ui event", { template: this.id, event: event_2 });
            var state = this._events[event_2];
            for (var key in state) {
                var value = state[key];
                if (value instanceof Array)
                    resolvedAdd(changeset, "ui event state binding", { template: this.id, event: event_2, key: key, source: value[0], alias: value[1] });
                else
                    resolvedAdd(changeset, "ui event state", { template: this.id, event: event_2, key: key, value: value });
            }
        }
        for (var _i = 0, _a = this._children; _i < _a.length; _i++) {
            var child = _a[_i];
            changeset.merge(child.changeset(ixer));
        }
        return changeset;
    };
    UI.prototype.load = function (template, ixer, parent) {
        var fact = humanizedFind(ixer, "ui template", { template: template })[0];
        if (!fact)
            return this;
        if (parent || fact.parent)
            this._parent = parent || new UI(this._parent);
        var binding = humanizedFind(ixer, "ui template binding", { template: template })[0];
        if (binding)
            this.bind((new runtime_1.Query(ixer, binding.binding)));
        var embed = humanizedFind(ixer, "ui embed", { template: template, parent: this._parent ? this._parent.id : "" })[0];
        if (embed) {
            var scope = {};
            for (var _i = 0, _a = humanizedFind(ixer, "ui embed scope", { embed: embed.embed }); _i < _a.length; _i++) {
                var attr = _a[_i];
                scope[attr.key] = attr.value;
            }
            for (var _b = 0, _c = humanizedFind(ixer, "ui embed scope binding", { embed: embed.embed }); _b < _c.length; _b++) {
                var attr = _c[_b];
                scope[attr.key] = [attr.source, attr.alias];
            }
            this.embed(scope);
        }
        for (var _d = 0, _e = humanizedFind(ixer, "ui attribute", { template: template }); _d < _e.length; _d++) {
            var attr = _e[_d];
            this.attribute(attr.property, attr.value);
        }
        for (var _f = 0, _g = humanizedFind(ixer, "ui attribute binding", { template: template }); _f < _g.length; _f++) {
            var attr = _g[_f];
            this.attribute(attr.property, [attr.source, attr.alias]);
        }
        for (var _h = 0, _j = humanizedFind(ixer, "ui event", { template: template }); _h < _j.length; _h++) {
            var event_3 = _j[_h];
            var state = {};
            for (var _k = 0, _l = humanizedFind(ixer, "ui event state", { template: template, event: event_3.event }); _k < _l.length; _k++) {
                var attr = _l[_k];
                state[event_3.key] = event_3.value;
            }
            for (var _m = 0, _o = humanizedFind(ixer, "ui event state binding", { template: template, event: event_3.event }); _m < _o.length; _m++) {
                var attr = _o[_m];
                state[event_3.key] = [event_3.source, event_3.alias];
            }
            this.event(event_3.event, state);
        }
        for (var _p = 0, _q = humanizedFind(ixer, "ui template", { parent: template }); _p < _q.length; _p++) {
            var child = _q[_p];
            this.child((new UI(child.template)).load(child.template, ixer, this));
        }
        return this;
    };
    UI.prototype.children = function (neue, append) {
        if (append === void 0) { append = false; }
        if (!neue)
            return this._children;
        if (!append)
            this._children.length = 0;
        for (var _i = 0; _i < neue.length; _i++) {
            var child = neue[_i];
            var copied = child.copy();
            copied._parent = this;
            this._children.push(copied);
        }
        return this._children;
    };
    UI.prototype.child = function (child, ix, embed) {
        child = child.copy();
        child._parent = this;
        if (embed)
            child.embed(embed);
        if (!ix)
            this._children.push(child);
        else
            this._children.splice(ix, 0, child);
        return child;
    };
    UI.prototype.removeChild = function (ix) {
        return this._children.splice(ix, 1);
    };
    UI.prototype.attributes = function (properties, merge) {
        if (merge === void 0) { merge = false; }
        if (!properties)
            return this._attributes;
        if (!merge) {
            for (var prop in this._attributes)
                delete this._attributes[prop];
        }
        for (var prop in properties)
            this._attributes[prop] = properties[prop];
        return this;
    };
    UI.prototype.attribute = function (property, value) {
        if (value === undefined)
            return this._attributes[property];
        this._attributes[property] = value;
        return this;
    };
    UI.prototype.removeAttribute = function (property) {
        delete this._attributes[property];
        return this;
    };
    UI.prototype.events = function (events, merge) {
        if (merge === void 0) { merge = false; }
        if (!events)
            return this._events;
        if (!merge) {
            for (var event_4 in this._events)
                delete this._events[event_4];
        }
        for (var event_5 in events)
            this._events[event_5] = events[event_5];
        return this;
    };
    UI.prototype.event = function (event, state) {
        if (state === undefined)
            return this._events[event];
        this._attributes[event] = state;
        return this;
    };
    UI.prototype.removeEvent = function (event) {
        delete this._events[event];
        return this;
    };
    UI.prototype.embed = function (scope) {
        if (scope === void 0) { scope = {}; }
        if (!scope) {
            this._embedded = undefined;
            return this;
        }
        if (scope === true)
            scope = {};
        this._embedded = scope;
        return this;
    };
    UI.prototype.bind = function (binding) {
        this._binding = binding;
        return this;
    };
    return UI;
})();
exports.UI = UI;
// @TODO: Finish reference impl.
// @TODO: Then build bit-generating version
var UIRenderer = (function () {
    function UIRenderer(ixer) {
        this.ixer = ixer;
        this.compiled = 0;
        this._tagCompilers = {};
        this._handlers = [];
    }
    UIRenderer.prototype.compile = function (roots) {
        if (utils_1.DEBUG.RENDERER)
            console.group("ui compile");
        var compiledElems = [];
        for (var _i = 0; _i < roots.length; _i++) {
            var root = roots[_i];
            // @TODO: reparent dynamic roots if needed.
            if (typeof root === "string") {
                var elems = this._compileWrapper(root, compiledElems.length);
                compiledElems.push.apply(compiledElems, elems);
                var base = this.ixer.findOne("ui template", { "ui template: template": root });
                if (!base)
                    continue;
                var parent_1 = base["ui template: parent"];
                if (parent_1) {
                    for (var _a = 0; _a < elems.length; _a++) {
                        var elem = elems[_a];
                        elem.parent = parent_1;
                    }
                }
            }
            else {
                if (!root.ix)
                    root.ix = compiledElems.length;
                compiledElems.push(root);
            }
        }
        if (utils_1.DEBUG.RENDERER)
            console.groupEnd();
        return compiledElems;
    };
    UIRenderer.prototype._compileWrapper = function (template, baseIx, constraints, bindingStack, depth) {
        if (constraints === void 0) { constraints = {}; }
        if (bindingStack === void 0) { bindingStack = []; }
        if (depth === void 0) { depth = 0; }
        var elems = [];
        var binding = this.ixer.findOne("ui template binding", { "ui template binding: template": template });
        if (!binding) {
            var elem = this._compileElement(template, bindingStack, depth);
            if (elem)
                elems[0] = elem;
        }
        else {
            var boundQuery = binding["ui template binding: binding"];
            var facts = this.getBoundFacts(boundQuery, constraints);
            var ix = 0;
            for (var _i = 0; _i < facts.length; _i++) {
                var fact = facts[_i];
                bindingStack.push(fact);
                var elem = this._compileElement(template, bindingStack, depth);
                bindingStack.pop();
                if (elem)
                    elems.push(elem);
            }
        }
        elems.sort(function (a, b) { return a.ix - b.ix; });
        var prevIx = undefined;
        for (var _a = 0; _a < elems.length; _a++) {
            var elem = elems[_a];
            elem.ix = elem.ix ? elem.ix + baseIx : baseIx;
            if (elem.ix === prevIx)
                elem.ix++;
            prevIx = elem.ix;
        }
        return elems;
    };
    UIRenderer.prototype._compileElement = function (template, bindingStack, depth) {
        if (utils_1.DEBUG.RENDERER)
            console.log(utils_1.repeat("  ", depth) + "* compile", template);
        var elementToChildren = this.ixer.index("ui template", ["ui template: parent"]);
        var elementToEmbeds = this.ixer.index("ui embed", ["ui embed: parent"]);
        var embedToScope = this.ixer.index("ui embed scope", ["ui embed scope: embed"]);
        var embedToScopeBinding = this.ixer.index("ui embed scope binding", ["ui embed scope binding: embed"]);
        var elementToAttrs = this.ixer.index("ui attribute", ["ui attribute: template"]);
        var elementToAttrBindings = this.ixer.index("ui attribute binding", ["ui attribute binding: template"]);
        var elementToEvents = this.ixer.index("ui event", ["ui event: template"]);
        this.compiled++;
        var base = this.ixer.findOne("ui template", { "ui template: template": template });
        if (!base) {
            console.warn("ui template " + template + " does not exist. Ignoring.");
            return undefined;
        }
        var attrs = elementToAttrs[template];
        var boundAttrs = elementToAttrBindings[template];
        var events = elementToEvents[template];
        // Handle meta properties
        var elem = { _template: template, ix: base["ui template: ix"] };
        // Handle static properties
        if (attrs) {
            for (var _i = 0; _i < attrs.length; _i++) {
                var _a = attrs[_i], prop = _a["ui attribute: property"], val = _a["ui attribute: value"];
                elem[prop] = val;
            }
        }
        // Handle bound properties
        if (boundAttrs) {
            // @FIXME: What do with source?
            for (var _b = 0; _b < boundAttrs.length; _b++) {
                var _c = boundAttrs[_b], prop = _c["ui attribute binding: property"], source = _c["ui attribute binding: source"], alias = _c["ui attribute binding: alias"];
                elem[prop] = this.getBoundValue(source, alias, bindingStack);
            }
        }
        // Attach event handlers
        if (events) {
            for (var _d = 0; _d < events.length; _d++) {
                var event_6 = events[_d]["ui event: event"];
                elem[event_6] = this.generateEventHandler(elem, event_6, bindingStack);
            }
        }
        // Compile children
        var children = elementToChildren[template] || [];
        var embeds = elementToEmbeds[template] || [];
        if (children.length || embeds.length) {
            elem.children = [];
            var childIx = 0, embedIx = 0;
            while (childIx < children.length || embedIx < embeds.length) {
                var child = children[childIx];
                var embed = embeds[embedIx];
                var add = void 0, constraints = {}, childBindingStack = bindingStack;
                if (!embed || child && child.ix <= embed.ix) {
                    add = children[childIx++]["ui template: template"];
                    // Resolve bound aliases into constraints
                    constraints = this.getBoundScope(bindingStack);
                }
                else {
                    add = embeds[embedIx++]["ui embed: template"];
                    for (var _e = 0, _f = embedToScope[embed["ui embed: embed"]] || []; _e < _f.length; _e++) {
                        var scope = _f[_e];
                        constraints[scope["ui embed scope: key"]] = scope["ui embed scope: value"];
                    }
                    for (var _g = 0, _h = embedToScopeBinding[embed["ui embed: embed"]] || []; _g < _h.length; _g++) {
                        var scope = _h[_g];
                        // @FIXME: What do about source?
                        var key = scope["ui embed scope binding: key"], source = scope["ui embed scope binding: source"], alias = scope["ui embed scope binding: alias"];
                        constraints[key] = this.getBoundValue(source, alias, bindingStack);
                    }
                    childBindingStack = [constraints];
                }
                elem.children.push.apply(elem.children, this._compileWrapper(add, elem.children.length, constraints, childBindingStack, depth + 1));
            }
        }
        if (this._tagCompilers[elem.t]) {
            try {
                this._tagCompilers[elem.t](elem);
            }
            catch (err) {
                console.warn("Failed to compile template: '" + template + "' due to '" + err + "' for element '" + JSON.stringify(elem) + "'");
                elem.t = "ui-error";
            }
        }
        return elem;
    };
    UIRenderer.prototype.getBoundFacts = function (query, constraints) {
        return this.ixer.find(query, constraints);
    };
    UIRenderer.prototype.getBoundScope = function (bindingStack) {
        var scope = {};
        for (var _i = 0; _i < bindingStack.length; _i++) {
            var fact = bindingStack[_i];
            for (var alias in fact)
                scope[alias] = fact[alias];
        }
        return scope;
    };
    //@FIXME: What do about source?
    UIRenderer.prototype.getBoundValue = function (source, alias, bindingStack) {
        for (var ix = bindingStack.length - 1; ix >= 0; ix--) {
            var fact = bindingStack[ix];
            if (source in fact && fact[alias])
                return fact[alias];
        }
    };
    UIRenderer.prototype.generateEventHandler = function (elem, event, bindingStack) {
        var template = elem["_template"];
        var memoKey = template + "::" + event;
        var attrKey = event + "::state";
        elem[attrKey] = this.getEventState(template, event, bindingStack);
        if (this._handlers[memoKey])
            return this._handlers[memoKey];
        var self = this;
        if (event === "change" || event === "input") {
            this._handlers[memoKey] = function (evt, elem) {
                var props = {};
                if (elem.t === "select" || elem.t === "input" || elem.t === "textarea")
                    props.value = evt.target.value;
                if (elem.type === "checkbox")
                    props.value = evt.target.checked;
                self.handleEvent(template, event, evt, elem, props);
            };
        }
        else {
            this._handlers[memoKey] = function (evt, elem) {
                self.handleEvent(template, event, evt, elem, {});
            };
        }
        return this._handlers[memoKey];
    };
    UIRenderer.prototype.handleEvent = function (template, eventName, event, elem, eventProps) {
        var attrKey = eventName + "::state";
        var state = elem[attrKey];
        var content = (_a = ["\n      # ", " ({is a: event})\n      ## Meta\n      event target: {event target: ", "}\n      event template: {event template: ", "}\n      event type: {event type: ", "}\n\n      ## State\n    "], _a.raw = ["\n      # ", " ({is a: event})\n      ## Meta\n      event target: {event target: ", "}\n      event template: {event template: ", "}\n      event type: {event type: ", "}\n\n      ## State\n    "], utils_1.unpad(6)(_a, eventName, elem.id, template, eventName));
        if (state["*event*"]) {
            for (var prop in state["*event*"])
                content += prop + ": {" + prop + ": " + eventProps[state["*event*"][prop]] + "}\n";
        }
        for (var prop in state) {
            if (prop === "*event*")
                continue;
            content += prop + ": {" + prop + ": " + state[prop] + "}\n";
        }
        var changeset = this.ixer.diff();
        var raw = utils_1.uuid();
        var entity = eventName + " event " + raw.slice(-12);
        changeset.add("builtin entity", { entity: entity, content: content });
        this.ixer.applyDiff(changeset);
        console.log(entity);
        var _a;
    };
    UIRenderer.prototype.getEventState = function (template, event, bindingStack) {
        var state = {};
        var staticAttrs = this.ixer.find("ui event state", { "ui event state: template": template, "ui event state: event": event });
        for (var _i = 0; _i < staticAttrs.length; _i++) {
            var _a = staticAttrs[_i], key = _a["ui event state: key"], val = _a["ui event state: value"];
            state[key] = val;
        }
        var boundAttrs = this.ixer.find("ui event state binding", { "ui event state binding: template": template, "ui event state binding: event": event });
        for (var _b = 0; _b < boundAttrs.length; _b++) {
            var _c = boundAttrs[_b], key = _c["ui event state binding: key"], source = _c["ui event state binding: source"], alias = _c["ui event state binding: alias"];
            if (source === "*event*") {
                state["*event*"] = state["*event*"] || {};
                state["*event*"][key] = alias;
            }
            else {
                state[key] = this.getBoundValue(source, alias, bindingStack);
            }
        }
        return state;
    };
    return UIRenderer;
})();
exports.UIRenderer = UIRenderer;
if (this.window)
    window["uiRenderer"] = exports;
//# sourceMappingURL=uiRenderer.js.map