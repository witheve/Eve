"use strict";
var test = require("tape");
var changes_1 = require("../src/runtime/changes");
var indexes_1 = require("../src/runtime/indexes");
var eavs_1 = require("../src/runtime/util/eavs");
function setup() {
    var index = new indexes_1.TripleIndex(0);
    var multi = new indexes_1.MultiIndex();
    multi.register("session", index);
    var changes = new changes_1.Changes(multi);
    return { index: index, multi: multi, changes: changes };
}
function convert(thing, assert) {
    var _a = setup(), index = _a.index, changes = _a.changes;
    var id = eavs_1.fromJS(changes, thing, "http", "session");
    changes.commit();
    var reconstituted = eavs_1.toJS(index, id);
    assert.deepEqual(reconstituted, thing);
}
test("converting js objects to eavs and back", function (assert) {
    convert({ foo: "bar", blah: "baz" }, assert);
    assert.end();
});
test("converting js nested objects", function (assert) {
    convert({ foo: { meh: "meh" }, blah: { beep: "boop" } }, assert);
    assert.end();
});
test("converting js arrays", function (assert) {
    convert(["a", "b", "c"], assert);
    assert.end();
});
test("converting nested js arrays", function (assert) {
    convert(["a", ["b", "c", "d"], "e"], assert);
    assert.end();
});
test("converting nested js objects and arrays", function (assert) {
    convert({
        fips: ["a", ["b", "c", "d"], "e"],
        moops: { meeps: "mops" },
        beep: ["boop", 3.45],
    }, assert);
    assert.end();
});
//# sourceMappingURL=eavs.js.map