var marked_1 = require("../vendor/marked");
var app_1 = require("./app");
var actions = {};
function titlecase(str) {
    return str.split(" ").map(function (word) { return word[0].toUpperCase() + word.slice(1); }).join(" ");
}
function autoContent(id, action) {
    return "\n    # " + titlecase(id) + "\n    " + (id[0].toUpperCase() + id.slice(1)) + " is an auto-generated collection that is used by {action: " + action + "}.\n\n    @TODO: Show contents via projection\n  ";
}
function add(id, action) {
    if (actions[id]) {
        console.warn("Overwriting existing action for id: '" + id + "'.");
        remove(id);
    }
    actions[id] = action;
    var changeset = app_1.eve.diff();
    changeset.add("action entity", { entity: id, content: action.content || "" });
    for (var _i = 0, _a = action.inputs; _i < _a.length; _i++) {
        var input = _a[_i];
        changeset.add("action entity", { entity: input, content: autoContent(input, id) });
    }
    for (var _b = 0, _c = action.outputs; _b < _c.length; _b++) {
        var output = _c[_b];
        changeset.add("action entity", { entity: output, content: autoContent(output, id) });
    }
    console.log(changeset);
    app_1.eve.applyDiff(changeset);
    for (var trigger in action.triggers) {
        var queryId = id + "|" + trigger;
        var query = app_1.eve.query(queryId)
            .select("collection entities", { collection: trigger }, "coll");
        var projectionMap = {};
        for (var _d = 0, _e = action.triggerAttributes[trigger]; _d < _e.length; _d++) {
            var attr = _e[_d];
            query.select("entity eavs", { entity: ["coll", "entity"], attribute: attr }, attr);
            projectionMap[attr] = [attr, "value"];
        }
        query.project(projectionMap);
        app_1.eve.asView(query);
        app_1.eve.trigger(queryId + "-trigger", queryId, action.triggers[trigger]);
    }
}
exports.add = add;
function remove(id) {
    if (!actions[id])
        return;
    var action = actions[id];
    delete actions[id];
    var changeset = app_1.eve.diff();
    changeset.remove("action entity", { entity: id, source: id });
    for (var _i = 0, _a = action.inputs; _i < _a.length; _i++) {
        var input = _a[_i];
        changeset.remove("action entity", { entity: input, source: id });
    }
    for (var _b = 0, _c = action.outputs; _b < _c.length; _b++) {
        var output = _c[_b];
        changeset.remove("action entity", { entity: output, source: id });
    }
    app_1.eve.applyDiff(changeset);
}
exports.remove = remove;
function get(id) {
    return actions[id];
}
exports.get = get;
add("marked", {
    inputs: ["markdown input"],
    outputs: ["markdown"],
    triggerAttributes: {
        "markdown input": ["md"]
    },
    triggers: {
        "markdown input": function () {
            var changeset = app_1.eve.diff();
            var actionId = "marked";
            var existingEntities = [];
            var inputs = app_1.eve.find(actionId + "|markdown input");
            // we want to add an attribute, not create an entity
            for (var _i = 0; _i < inputs.length; _i++) {
                var input = inputs[_i];
                var entityId = "markdown " + input.md;
                existingEntities.push(entityId);
                if (app_1.eve.findOne("action entity", { entity: entityId, source: "marked" }))
                    continue;
                changeset.add("action entity", { entity: entityId, source: "marked", content: "\n          " + marked_1.parse(input.md) + "\n        " });
            }
            for (var _a = 0, _b = app_1.eve.find("action entity", { source: "marked" }); _a < _b.length; _a++) {
                var entity = _b[_a];
                if (existingEntities.indexOf(entity.entity) === -1)
                    changeset.remove("action entity", { entity: entity.entity });
            }
            app_1.eve.applyDiff(changeset);
            // @FIXME: When diffs are available to properly execute, implement a post-fixpoint trigger for actions.
            app_1.render();
        }
    }
});
//# sourceMappingURL=actions.js.map