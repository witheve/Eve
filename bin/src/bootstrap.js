var utils_1 = require("./utils");
var runtime = require("./runtime");
var app = require("./app");
var app_1 = require("./app");
var parser_1 = require("./parser");
var uiRenderer_1 = require("./uiRenderer");
exports.ixer = app_1.eve;
//-----------------------------------------------------------------------------
// Utilities
//-----------------------------------------------------------------------------
// export function UIFromDSL(str:string):UI {
//   function processElem(data:UIElem):UI {
//     let elem = new UI(data.id || uuid());
//     if(data.binding) elem.bind(data.bindingKind === "query" ? parseDSL(data.binding);
//     if(data.embedded) elem.embed(data.embedded);
//     if(data.attributes) elem.attributes(data.attributes);
//     if(data.events) elem.events(data.events);
//     if(data.children) {
//       for(let child of data.children) elem.child(processElem(child));
//     }
//     return elem;
//   }
//   return processElem(parseUI(str));
// }
var BSPhase = (function () {
    function BSPhase(ixer, changeset) {
        if (changeset === void 0) { changeset = ixer.diff(); }
        this.ixer = ixer;
        this.changeset = changeset;
        this._views = {};
        this._viewFields = {};
        this._entities = [];
        this._uis = {};
        this._queries = {};
        this._names = {};
    }
    BSPhase.prototype.viewKind = function (view) {
        return this._views[view];
    };
    BSPhase.prototype.viewFields = function (view) {
        return this._viewFields[view];
    };
    BSPhase.prototype.apply = function (nukeExisting) {
        for (var view in this._views) {
            if (this._views[view] === "table")
                exports.ixer.addTable(view, this._viewFields[view]);
        }
        if (nukeExisting) {
            for (var view in this._views) {
                if (this._views[view] !== "table")
                    this.changeset.merge(runtime.Query.remove(view, this.ixer));
            }
            for (var _i = 0, _a = this._entities; _i < _a.length; _i++) {
                var entity = _a[_i];
                this.changeset.remove("builtin entity", { entity: entity });
            }
            for (var ui in this._uis)
                this.changeset.merge(uiRenderer_1.UI.remove(ui, this.ixer));
        }
        exports.ixer.applyDiff(this.changeset);
    };
    //-----------------------------------------------------------------------------
    // Macros
    //-----------------------------------------------------------------------------
    BSPhase.prototype.addFact = function (table, fact) {
        this.changeset.add(table, fact);
        return this;
    };
    BSPhase.prototype.addEntity = function (entity, name, kinds, attributes, extraContent) {
        entity = utils_1.builtinId(entity);
        this._names[name] = entity;
        this._entities.push(entity);
        this.addFact("display name", { id: entity, name: name });
        var isAs = [];
        for (var _i = 0; _i < kinds.length; _i++) {
            var kind = kinds[_i];
            var sourceId = entity + ",is a," + kind;
            isAs.push("{" + kind + "|rep=link; eav source = " + sourceId + "}");
            var collEntity = utils_1.builtinId(kind);
            this.addFact("display name", { id: collEntity, name: kind });
            this.addFact("sourced eav", { entity: entity, attribute: "is a", value: collEntity, source: sourceId });
        }
        var collectionsText = "";
        if (isAs.length)
            collectionsText = utils_1.titlecase(name) + " is a " + isAs.slice(0, -1).join(", ") + " " + (isAs.length > 1 ? "and" : "") + " " + isAs[isAs.length - 1] + ".";
        var content = (_a = ["\n      #", "\n      ", "\n    "], _a.raw = ["\n      #", "\n      ", "\n    "], utils_1.unpad(6)(_a, name, collectionsText));
        if (attributes) {
            content += "\n##Attributes\n";
            for (var attr in attributes) {
                var sourceId = entity + "," + attr + "," + attributes[attr];
                var query = name + "'s " + attr;
                var queryId = query.replace(" ", "-");
                content += attr + ": {" + query + "|rep=CSV; field=" + attr + "; eav source = " + sourceId + "}\n";
                var value = this._names[attributes[attr]] || attributes[attr];
                this.addFact("sourced eav", { entity: entity, attribute: attr, value: value, source: sourceId });
                var artifacts = parser_1.parseDSL("(query :$$view \"" + queryId + "\"\n                                     (entity-eavs :entity \"" + entity + "\" :attribute \"" + attr + "\" :value v)\n                                     (project! :entity \"" + entity + "\" :" + attr + " v))");
                this.addArtifacts(artifacts);
                this.addFact("query to id", { query: query, id: queryId });
            }
        }
        if (extraContent)
            content += "\n" + extraContent;
        var page = entity + "|root";
        this.addFact("page content", { page: page, content: content });
        this.addFact("entity page", { entity: entity, page: page });
        return this;
        var _a;
    };
    BSPhase.prototype.addView = function (view, kind, fields) {
        this._views[view] = kind;
        this._viewFields[view] = fields;
        this.addFact("view", { view: view, kind: kind });
        for (var _i = 0; _i < fields.length; _i++) {
            var field = fields[_i];
            this.addFact("field", { view: view, field: field });
        }
        var entity = view + " view";
        this.addEntity(entity, entity, ["system", kind], undefined, (_a = ["\n      ## Fields\n      ", "\n    "], _a.raw = ["\n      ## Fields\n      ", "\n    "], utils_1.unpad(6)(_a, fields.map(function (field) { return ("* " + field); }).join("\n      "))));
        return this;
        var _a;
    };
    BSPhase.prototype.addTable = function (view, fields) {
        this.addView(view, "table", fields);
        return this;
    };
    BSPhase.prototype.addUnion = function (view, fields, builtin) {
        if (builtin === void 0) { builtin = true; }
        this.addView(view, "union", fields);
        if (builtin) {
            var table = "builtin " + view;
            this.addTable(table, fields);
            this.addUnionMember(view, table);
        }
        return this;
    };
    BSPhase.prototype.addUnionMember = function (union, member, mapping) {
        // apply the natural mapping.
        if (!mapping) {
            if (this.viewKind(union) !== "union")
                throw new Error("Union '" + union + "' must be added before adding members");
            mapping = {};
            for (var _i = 0, _a = this.viewFields(union); _i < _a.length; _i++) {
                var field = _a[_i];
                mapping[field] = field;
            }
        }
        var action = union + " <-- " + member + " <-- " + JSON.stringify(mapping);
        this.addFact("action", { view: union, action: action, kind: "union", ix: 0 })
            .addFact("action source", { action: action, "source view": member });
        for (var field in mapping) {
            var mapped = mapping[field];
            if (mapped.constructor === Array) {
                this.addFact("action mapping constant", { action: action, from: field, "value": mapped[0] });
            }
            else {
                this.addFact("action mapping", { action: action, from: field, "to source": member, "to field": mapped });
            }
        }
        return this;
    };
    BSPhase.prototype.addQuery = function (view, query) {
        query.name = view;
        this._queries[view] = query;
        this.addView(view, "query", Object.keys(query.projectionMap || {}));
        this.changeset.merge(query.changeset(this.ixer));
        return this;
    };
    BSPhase.prototype.addArtifacts = function (artifacts) {
        var views = artifacts.views;
        for (var view in artifacts.views) {
            this._views[view] = "query";
        }
        for (var id in views)
            this.changeset.merge(views[id].changeset(app_1.eve));
        return this;
    };
    BSPhase.prototype.addUI = function (id, ui) {
        ui.id = id;
        this._uis[id] = ui;
        this.addEntity(id, id, ["system", "ui"]);
        this.changeset.merge(ui.changeset(this.ixer));
        return this;
    };
    return BSPhase;
})();
//-----------------------------------------------------------------------------
// Runtime Setup
//-----------------------------------------------------------------------------
app.init("bootstrap", function bootstrap() {
    //-----------------------------------------------------------------------------
    // Entity System
    //-----------------------------------------------------------------------------
    var phase = new BSPhase(app_1.eve);
    phase.addTable("manual entity", ["entity", "content"]);
    phase.addTable("sourced eav", ["entity", "attribute", "value", "source"]);
    phase.addTable("page content", ["page", "content"]);
    phase.addTable("entity page", ["entity", "page"]);
    phase.addTable("action entity", ["entity", "content", "source"]);
    phase
        .addEntity("entity", "entity", ["system"])
        .addEntity("collection", "collection", ["system"])
        .addEntity("system", "system", ["system", "collection"])
        .addEntity("union", "union", ["system", "collection"])
        .addEntity("query", "query", ["system", "collection"])
        .addEntity("table", "table", ["system", "collection"])
        .addEntity("ui", "ui", ["system", "collection"])
        .addEntity("home", "home", ["system"], undefined, (_a = ["\n      {entity|rep = directory}\n    "], _a.raw = ["\n      {entity|rep = directory}\n    "], utils_1.unpad(6)(_a)));
    phase.addUnion("entity eavs", ["entity", "attribute", "value"], true)
        .addUnionMember("entity eavs", "generated eav", { entity: "entity", attribute: "attribute", value: "value" })
        .addUnionMember("entity eavs", "sourced eav", { entity: "entity", attribute: "attribute", value: "value" })
        .addUnionMember("entity eavs", "added eavs");
    phase.addUnion("entity links", ["entity", "link", "type"])
        .addUnionMember("entity links", "eav entity links")
        .addUnionMember("entity links", "is a attributes", { entity: "entity", link: "collection", type: ["is a"] });
    phase.addUnion("directionless links", ["entity", "link"])
        .addUnionMember("directionless links", "entity links")
        .addUnionMember("directionless links", "entity links", { entity: "link", link: "entity" });
    phase.addUnion("collection entities", ["entity", "collection"])
        .addUnionMember("collection entities", "is a attributes");
    phase.addArtifacts(parser_1.parseDSL("\n    (query :$$view \"bs: entity\"\n      (entity-page :entity entity :page page)\n      (page-content :page page :content content)\n      (project! \"entity\" :entity entity :content content))\n  "));
    phase.addArtifacts(parser_1.parseDSL("\n    (query :$$view \"bs: unmodified added bits\"\n      (added-bits :entity entity :content content)\n      (negate (manual-entity :entity entity))\n      (project! \"unmodified added bits\" :entity entity :content content))\n  "));
    phase.addArtifacts(parser_1.parseDSL("\n    (query :$$view \"bs: is a attributes\"\n      (entity-eavs :attribute \"is a\" :entity entity :value value)\n      (project! \"is a attributes\" :collection value :entity entity))\n  "));
    // @HACK: this view is required because you can't currently join a select on the result of a function.
    // so we create a version of the eavs table that already has everything lowercased.
    phase.addArtifacts(parser_1.parseDSL("\n    (query :$$view \"bs: lowercase eavs\"\n      (entity-eavs :entity entity :attribute attribute :value value)\n      (lowercase :text value :result lowercased)\n      (project! \"lowercase eavs\" :entity entity :attribute attribute :value lowercased))\n  "));
    phase.addArtifacts(parser_1.parseDSL("\n    (query :$$view \"bs: eav entity links\"\n      (entity-eavs :entity entity :attribute attribute :value value)\n      (entity :entity value)\n      (project! \"eav entity links\" :entity entity :type attribute :link value))\n  "));
    phase.addArtifacts(parser_1.parseDSL("\n    (query :$$view \"bs: collection\"\n      (is-a-attributes :collection entity)\n      (query :$$view \"bs: collection count\"\n        (is-a-attributes :collection entity :entity child)\n        (count :count childCount))\n      (project! \"collection\" :collection entity :count childCount))\n  "));
    phase.addEntity("entity", "entity", ["system"]);
    phase.addEntity("collection", "collection", ["system"]);
    phase.addArtifacts(parser_1.parseDSL((_b = ["\n    (query :$$view \"bs: entity eavs from entities\"\n      (entity :entity entity)\n      (project! \"entity eavs\" :entity entity :attribute \"is a\" :value \"", "\"))\n  "], _b.raw = ["\n    (query :$$view \"bs: entity eavs from entities\"\n      (entity :entity entity)\n      (project! \"entity eavs\" :entity entity :attribute \"is a\" :value \"", "\"))\n  "], utils_1.unpad(4)(_b, utils_1.builtinId("entity")))));
    phase.addArtifacts(parser_1.parseDSL((_c = ["\n    (query :$$view \"bs: entity eavs from collections\"\n      (is-a-attributes :collection coll)\n      (project! \"entity eavs\" :entity coll :attribute \"is a\" :value \"", "\"))\n  "], _c.raw = ["\n    (query :$$view \"bs: entity eavs from collections\"\n      (is-a-attributes :collection coll)\n      (project! \"entity eavs\" :entity coll :attribute \"is a\" :value \"", "\"))\n  "], utils_1.unpad(4)(_c, utils_1.builtinId("collection")))));
    /*  phase.addArtifacts(parseDSL(unpad(4) `
        (query
          (entity :entity entity)
          (negate (query
            (directionless-links :entity entity :link link)
            (!= link "AUTOGENERATED entity THIS SHOULDN'T SHOW UP ANYWHERE")
            (!= link "AUTOGENERATED orphaned THIS SHOULDN'T SHOW UP ANYWHERE")
            ))
          (project! "entity eavs" :entity coll :attribute "is a" :value "AUTOGENERATED collection THIS SHOULDN'T SHOW UP ANYWHERE"))
    `));*/
    phase.addTable("ui pane", ["pane", "contains", "kind"]);
    if (app_1.eve.find("ui pane").length === 0)
        phase.addFact("ui pane", { pane: "p1", contains: "pet", kind: 0 });
    phase.apply(true);
    //-----------------------------------------------------------------------------
    // UI
    //-----------------------------------------------------------------------------
    phase = new BSPhase(app_1.eve);
    // @FIXME: These should probably be unionized.
    function resolve(table, fields) {
        return fields.map(function (field) { return (table + ": " + field); });
    }
    phase.addTable("ui template", resolve("ui template", ["template", "parent", "ix"]));
    phase.addTable("ui template binding", resolve("ui template binding", ["template", "query"]));
    phase.addTable("ui embed", resolve("ui embed", ["embed", "template", "parent", "ix"]));
    phase.addTable("ui embed scope", resolve("ui embed scope", ["embed", "key", "value"]));
    phase.addTable("ui embed scope binding", resolve("ui embed scope binding", ["embed", "key", "source", "alias"]));
    phase.addTable("ui attribute", resolve("ui attribute", ["template", "property", "value"]));
    phase.addTable("ui attribute binding", resolve("ui attribute binding", ["template", "property", "source", "alias"]));
    phase.addTable("ui event", resolve("ui event", ["template", "event"]));
    phase.addTable("ui event state", resolve("ui event state", ["template", "event", "key", "value"]));
    phase.addTable("ui event state binding", resolve("ui event state binding", ["template", "event", "key", "source", "alias"]));
    phase.addTable("system ui", ["template"]);
    phase.apply(true);
    //-----------------------------------------------------------------------------
    // Testing
    //-----------------------------------------------------------------------------
    phase = new BSPhase(app_1.eve);
    var testData = {
        "test data": [],
        pet: [],
        exotic: [],
        dangerous: [],
        cat: ["pet"],
        dog: ["pet"],
        fish: ["pet"],
        snake: ["pet", "exotic"],
        koala: ["pet", "exotic"],
        sloth: ["pet", "exotic"],
        kangaroo: ["exotic"],
        giraffe: ["exotic"],
        gorilla: ["exotic", "dangerous"],
        company: [],
        kodowa: ["company"],
        department: [],
        engineering: ["department"],
        operations: ["department"],
        magic: ["department"],
        employee: [],
        josh: ["employee"],
        corey: ["employee"],
        chris: ["employee"],
        rob: ["employee"],
        eric: ["employee"],
    };
    var testAttrs = {
        cat: { length: 4 },
        dog: { length: 3 },
        fish: { length: 1 },
        snake: { length: 4 },
        koala: { length: 3 },
        sloth: { length: 3 },
        engineering: { company: "kodowa" },
        operations: { company: "kodowa" },
        magic: { company: "kodowa" },
        josh: { department: "engineering", salary: 7 },
        corey: { department: "engineering", salary: 10 },
        chris: { department: "engineering", salary: 10 },
        eric: { department: "engineering", salary: 7 },
        rob: { department: "operations", salary: 10 },
    };
    for (var entity in testData)
        phase.addEntity(entity, entity, ["test data"].concat(testData[entity]), testAttrs[entity], "");
    // phase.addTable("department", ["department"])
    //   .addFact("department", {department: "engineering"})
    //   .addFact("department", {department: "operations"})
    //   .addFact("department", {department: "magic"});
    // phase.addTable("employee", ["department", "employee", "salary"])
    //   .addFact("employee", {department: "engineering", employee: "josh", salary: 10})
    //   .addFact("employee", {department: "engineering", employee: "corey", salary: 11})
    //   .addFact("employee", {department: "engineering", employee: "chris", salary: 7})
    //   .addFact("employee", {department: "operations", employee: "rob", salary: 7});
    phase.apply(true);
    window["p"] = phase;
    var _a, _b, _c;
});
window["bootstrap"] = exports;
//# sourceMappingURL=bootstrap.js.map