"use strict";
var test = require("tape");
var runtime_1 = require("../src/runtime/runtime");
var parser = require("../src/runtime/parser");
var builder = require("../src/runtime/builder");
var actions_1 = require("../src/runtime/actions");
function dedent(str) {
    var lines = [];
    var indent;
    for (var _i = 0, _a = str.split("\n"); _i < _a.length; _i++) {
        var line = _a[_i];
        var match = line.match(/^[ \t]+/);
        if (match) {
            if (!indent) {
                indent = match[0].length;
            }
            line = line.substr(indent);
        }
        lines.push(line);
    }
    return lines.join("\n");
}
function eavsToComparables(eavs, entities, index) {
    if (index === void 0) { index = {}; }
    var results = [];
    for (var _i = 0, eavs_1 = eavs; _i < eavs_1.length; _i++) {
        var eav = eavs_1[_i];
        var e = eav[0], a = eav[1], v = eav[2];
        var cur = index[e];
        if (!index[e]) {
            cur = index[e] = { list: [], links: [], e: e };
            results.push(cur);
        }
        if (entities[v]) {
            cur.links.push([a, v]);
        }
        else {
            var avKey = a + ", " + v;
            cur.list.push(avKey);
        }
    }
    return results;
}
function isSetEqual(as, bs) {
    if (as.length !== bs.length)
        return false;
    for (var _i = 0, as_1 = as; _i < as_1.length; _i++) {
        var a = as_1[_i];
        if (bs.indexOf(a) === -1)
            return false;
    }
    return true;
}
function collectEntities(eavs, index) {
    if (index === void 0) { index = {}; }
    for (var _i = 0, eavs_2 = eavs; _i < eavs_2.length; _i++) {
        var e = eavs_2[_i][0];
        index[e] = true;
    }
    return index;
}
var Resolution;
(function (Resolution) {
    Resolution[Resolution["unknown"] = 0] = "unknown";
    Resolution[Resolution["resolved"] = 1] = "resolved";
    Resolution[Resolution["failed"] = 2] = "failed";
})(Resolution || (Resolution = {}));
function resolveLinks(aLinks, bLinks, entities) {
    if (aLinks.length !== bLinks.length)
        return Resolution.failed;
    var _loop_1 = function(a, v) {
        var resolved = entities[v];
        if (resolved === true) {
            return { value: Resolution.unknown };
        }
        else if (resolved === undefined) {
            throw new Error("Found a link for a non entity. " + [a, v]);
        }
        if (bLinks.some(function (_a) {
            var a2 = _a[0], v2 = _a[1];
            return a2 === a && v2 === resolved;
        }).length === 0) {
            return { value: Resolution.failed };
        }
    };
    for (var _i = 0, aLinks_1 = aLinks; _i < aLinks_1.length; _i++) {
        var _a = aLinks_1[_i], a = _a[0], v = _a[1];
        var state_1 = _loop_1(a, v);
        if (typeof state_1 === "object") return state_1.value;
    }
    return Resolution.resolved;
}
function resolveActualExpected(assert, actuals, expecteds, entities) {
    var ix = 0;
    var max = actuals.length * actuals.length;
    while (actuals[ix]) {
        var actual = actuals[ix];
        if (ix === max) {
            assert.true(false, "Cyclic test found");
            return;
        }
        ix++;
        var found = void 0;
        var expectedIx = 0;
        for (var _i = 0, expecteds_1 = expecteds; _i < expecteds_1.length; _i++) {
            var expected = expecteds_1[_i];
            var listEqual = void 0, linkEqual = void 0;
            if (isSetEqual(expected.list, actual.list)) {
                listEqual = true;
            }
            else {
                found = false;
            }
            if (actual.links || expected.links) {
                var res = resolveLinks(actual.links, expected.links, entities);
                if (res === Resolution.failed) {
                    linkEqual = false;
                }
                else if (res === Resolution.resolved) {
                    linkEqual = true;
                }
                else {
                    linkEqual = false;
                    actuals.push(actual);
                    break;
                }
            }
            else {
                linkEqual = true;
            }
            if (listEqual && linkEqual) {
                expecteds.splice(expectedIx, 1);
                entities[actual.e] = expected.e;
                found = true;
                break;
            }
            expectedIx++;
        }
        if (found === false) {
            assert.true(false, "No matching add found for object: " + JSON.stringify(actual.list));
        }
    }
}
function verify(assert, adds, removes, data) {
    assert.equal(data.insert.length, adds.length, "Wrong number of inserts");
    assert.equal(data.remove.length, removes.length, "Wrong number of removes");
    // get all the entities
    var entities = collectEntities(adds);
    entities = collectEntities(data.insert, entities);
    entities = collectEntities(removes, entities);
    entities = collectEntities(data.remove, entities);
    //
    var expectedAdd = eavsToComparables(adds, entities);
    var expectedRemove = eavsToComparables(removes, entities);
    var actualRemove = eavsToComparables(data.remove, entities);
    var actualAdd = eavsToComparables(data.insert, entities);
    resolveActualExpected(assert, actualAdd, expectedAdd, entities);
    resolveActualExpected(assert, actualRemove, expectedRemove, entities);
}
function evaluate(assert, expected, code, session) {
    if (session === void 0) { session = new runtime_1.Database(); }
    var parsed = parser.parseDoc(dedent(code), "0");
    var _a = builder.buildDoc(parsed.results), blocks = _a.blocks, errors = _a.errors;
    if (expected.errors) {
        assert.true(parsed.errors.length > 0 || errors.length > 0, "This test is supposed to produce errors");
    }
    session.blocks = session.blocks.concat(blocks);
    var evaluation = new runtime_1.Evaluation();
    evaluation.registerDatabase("session", session);
    var changes = evaluation.fixpoint();
    verify(assert, expected.insert, expected.remove, changes.result());
    var next = { execute: function (expected, actions) {
            var changes = evaluation.executeActions(actions);
            verify(assert, expected.insert, expected.remove, changes.result());
            return next;
        }, session: session };
    return next;
}
test("create a record", function (assert) {
    var expected = {
        insert: [["2", "tag", "person"], ["2", "name", "chris"],],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\"]\n    ~~~\n  ");
    assert.end();
});
test("search and create a record", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
            ["2", "name", "chris"],
            ["5", "tag", "person"],
            ["5", "name", "joe"],
            ["8|2", "dude", "2"],
            ["8|5", "dude", "5"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\"]\n        [#person name: \"joe\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person]\n      commit\n        [dude: p]\n    ~~~\n  ");
    assert.end();
});
test("search with constant filter", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
            ["2", "name", "chris"],
            ["5", "tag", "person"],
            ["5", "name", "joe"],
            ["9|2", "dude", "2"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\"]\n        [#person name: \"joe\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person name]\n        name = \"chris\"\n      commit\n        [dude: p]\n    ~~~\n  ");
    assert.end();
});
test("search with constant attribute", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
            ["2", "name", "chris"],
            ["5", "tag", "person"],
            ["5", "name", "joe"],
            ["9|2", "dude", "2"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\"]\n        [#person name: \"joe\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person name: \"chris\"]\n      commit\n        [dude: p]\n    ~~~\n  ");
    assert.end();
});
test("search with attribute having multiple values", function (assert) {
    var expected = {
        insert: [
            ["3", "tag", "person"],
            ["3", "name", "chris"],
            ["3", "name", "michael"],
            ["6", "tag", "person"],
            ["6", "name", "chris"],
            ["11|3", "dude", "3"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\" name: \"michael\"]\n        [#person name: \"chris\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person name: \"chris\" name: \"michael\"]\n      commit\n        [dude: p]\n    ~~~\n  ");
    assert.end();
});
test("search with attribute having multiple values in parenthesis", function (assert) {
    var expected = {
        insert: [
            ["3", "tag", "person"],
            ["3", "name", "chris"],
            ["3", "name", "michael"],
            ["8|3", "dude", "3"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\" name: \"michael\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person name: (\"chris\", \"michael\")]\n      commit\n        [dude: p]\n    ~~~\n  ");
    assert.end();
});
test("search with attribute having multiple values in parenthesis with a function", function (assert) {
    var expected = {
        insert: [
            ["3", "tag", "person"],
            ["3", "name", "chris"],
            ["3", "name", 13],
            ["9|3", "dude", "3"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\" name: 13]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person name: (\"chris\", 4 + 9)]\n      commit\n        [dude: p]\n    ~~~\n  ");
    assert.end();
});
test("create a record with numeric attributes", function (assert) {
    var expected = {
        insert: [
            ["4", "tag", "json-array"],
            ["4", 1, "cool"],
            ["4", 2, "om nom"],
            ["4", 3, "om nom nom"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    array\n    ~~~\n      commit\n        [#json-array 1: \"cool\" 2: \"om nom\" 3: \"om nom nom\"]\n    ~~~\n  ");
    assert.end();
});
test("search a record with numeric attributes", function (assert) {
    var expected = {
        insert: [
            ["4", "tag", "json-array"],
            ["4", 1, "cool"],
            ["4", 2, "om nom"],
            ["4", 3, "om nom nom"],
            ["11", "foo", "cool - om nom - om nom nom"]
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    array\n    ~~~\n      commit\n        [#json-array 1: \"cool\" 2: \"om nom\" 3: \"om nom nom\"]\n    ~~~\n\n    ~~~\n      search\n        [#json-array 1: first, 2: second, 3: third]\n      commit\n        [| foo: \"{{first}} - {{second}} - {{third}}\"}]\n    ~~~\n  ");
    assert.end();
});
test("search with incompatible filters", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
            ["2", "name", "chris"],
            ["5", "tag", "person"],
            ["5", "name", "joe"],
        ],
        remove: [],
        errors: true,
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\"]\n        [#person name: \"joe\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person name]\n        name = \"chris\"\n        name = \"joe\"\n      commit\n        [dude: p]\n    ~~~\n  ");
    assert.end();
});
test("search with unprovided variable", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
            ["2", "name", "chris"],
            ["5", "tag", "person"],
            ["5", "name", "joe"],
        ],
        remove: [],
        errors: true,
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\"]\n        [#person name: \"joe\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        [#person]\n      commit\n        [dude: p]\n    ~~~\n  ");
    assert.end();
});
test("search with unprovided root in an attribute access", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
            ["2", "name", "chris"],
            ["5", "tag", "person"],
            ["5", "name", "joe"],
        ],
        remove: [],
        errors: true,
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\"]\n        [#person name: \"joe\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        [#person]\n      commit\n        [dude: p.name]\n    ~~~\n  ");
    assert.end();
});
test("search with escaped strings", function (assert) {
    var expected = {
        insert: [
            ["3", "tag", "person"],
            ["3", "name", "chris"],
            ["3", "info", "{\"age\": 10, \"school\": \"Lincoln\"}"],
            ["7|{\"age\": 10, \"school\": \"Lincoln\"}", "info", "{\"age\": 10, \"school\": \"Lincoln\"}"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\" info: \"{\\\"age\\\": 10, \\\"school\\\": \\\"Lincoln\\\"}\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        [#person info]\n      commit\n        [info]\n    ~~~\n  ");
    assert.end();
});
test("search with escaped embeds", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
            ["2", "name", "chris"],
            ["7|{chris}", "info", "{chris}"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        [#person name]\n      commit\n        [info: \"\\{{{name}}\\}\"]\n    ~~~\n  ");
    assert.end();
});
test("setting an attribute", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
            ["2", "name", "chris"],
            ["2", "dude", "chris"],
            ["5", "tag", "person"],
            ["5", "name", "joe"],
            ["5", "dude", "joe"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\"]\n        [#person name: \"joe\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person name]\n      commit\n        p.dude := name\n    ~~~\n  ");
    assert.end();
});
test("setting an attribute to itself", function (assert) {
    // TODO: should this really be showing name inserted twice?
    var expected = {
        insert: [
            ["2", "tag", "person"],
            ["2", "name", "chris"],
            ["2", "name", "chris"],
            ["5", "tag", "person"],
            ["5", "name", "joe"],
            ["5", "name", "joe"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\"]\n        [#person name: \"joe\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person name]\n      commit\n        p.name := name\n    ~~~\n  ");
    assert.end();
});
test("setting an attribute in multiple blocks", function (assert) {
    var expected = {
        insert: [
            ["1", "tag", "person"],
            ["1", "meep", "maup"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person]\n    ~~~\n\n    stuff\n    ~~~\n      search\n        p = [#person not(meep)]\n      commit\n        p.meep := \"moop\"\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person meep]\n      commit\n        p.meep := \"maup\"\n    ~~~\n  ");
    assert.end();
});
test("setting an attribute to multiple values", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
            ["2", "name", "chris"],
            ["2", "dude", "chris"],
            ["2", "dude", "foo"],
            ["2", "dude", 3],
            ["5", "tag", "person"],
            ["5", "name", "joe"],
            ["5", "dude", "joe"],
            ["5", "dude", "foo"],
            ["5", "dude", 3],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\"]\n        [#person name: \"joe\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person name]\n      commit\n        p.dude := (name, \"foo\", 3)\n    ~~~\n  ");
    assert.end();
});
test("merging multiple values into an attribute", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
            ["2", "name", "chris"],
            ["2", "dude", "chris"],
            ["2", "dude", "foo"],
            ["2", "dude", 3],
            ["5", "tag", "person"],
            ["5", "name", "joe"],
            ["5", "dude", "joe"],
            ["5", "dude", "foo"],
            ["5", "dude", 3],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\"]\n        [#person name: \"joe\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person name]\n      commit\n        p <- [dude: (name, \"foo\", 3)]\n    ~~~\n  ");
    assert.end();
});
test("merges with subobjects pick up the parent object as part of their projection", function (assert) {
    var expected = {
        insert: [
            ["a", "tag", "person"],
            ["a", "name", "chris"],
            ["b", "tag", "person"],
            ["b", "name", "chris"],
            ["a", "foo", "c"],
            ["b", "foo", "d"],
            ["c", "tag", "bar"],
            ["c", "name", "chris"],
            ["d", "tag", "bar"],
            ["d", "name", "chris"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\"]\n        [#person name: \"chris\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person name]\n      commit\n        p <- [foo: [#bar name]]\n    ~~~\n  ");
    assert.end();
});
test("creating an object with multiple values for an attribute", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
            ["2", "name", "chris"],
            ["13|chris|8", "tag", "dude"],
            ["13|chris|8", "dude", "chris"],
            ["13|chris|8", "dude", "foo"],
            ["13|chris|8", "dude", 8],
            ["5", "tag", "person"],
            ["5", "name", "joe"],
            ["13|joe|8", "tag", "dude"],
            ["13|joe|8", "dude", "joe"],
            ["13|joe|8", "dude", "foo"],
            ["13|joe|8", "dude", 8],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\"]\n        [#person name: \"joe\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person name]\n      commit\n        [#dude dude: (name, \"foo\", 3 + 5)]\n    ~~~\n  ");
    assert.end();
});
test("creating an object with multiple complex values for an attribute", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
            ["2", "name", "chris"],
            ["6", "tag", "foo"],
            ["8", "tag", "bar"],
            ["12", "tag", "dude"],
            ["12", "dude", "6"],
            ["12", "dude", "8"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person name]\n      commit\n        [#dude dude: ([#foo], [#bar])]\n    ~~~\n  ");
    assert.end();
});
test("setting an attribute on an object with multiple complex values", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
            ["2", "name", "chris"],
            ["6", "tag", "foo"],
            ["8", "tag", "bar"],
            ["2", "dude", "6"],
            ["2", "dude", "8"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person name]\n      commit\n        p.dude := ([#foo], [#bar])\n    ~~~\n  ");
    assert.end();
});
test("merging an attribute on an object with multiple complex values", function (assert) {
    var expected = {
        insert: [
            ["a", "tag", "person"],
            ["a", "name", "chris"],
            ["b", "tag", "foo"],
            ["b", "eve-auto-index", 1],
            ["c", "tag", "bar"],
            ["c", "eve-auto-index", 2],
            ["a", "dude", "b"],
            ["a", "dude", "c"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person name]\n      commit\n        p <- [dude: [#foo] [#bar]]\n    ~~~\n  ");
    assert.end();
});
test("setting an attribute that removes a previous value", function (assert) {
    var expected = {
        insert: [
            ["3", "tag", "person"],
            ["3", "name", "chris"],
            ["3", "dude", "chris"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\" dude: \"joe\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person name]\n      commit\n        p.dude := name\n    ~~~\n  ");
    assert.end();
});
test("setting an attribute on click", function (assert) {
    var expected = {
        insert: [
            ["3", "tag", "person"],
            ["3", "name", "chris"],
            ["3", "dude", "joe"],
        ],
        remove: []
    };
    var eve = evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\" dude: \"joe\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        [#click]\n        p = [#person name]\n      commit\n        p.dude := name\n    ~~~\n  ");
    var expected2 = {
        insert: [["3", "dude", "chris"], ["click-event", "tag", "click"]],
        remove: [["3", "dude", "joe"],]
    };
    eve.execute(expected2, [new actions_1.InsertAction("blah", "click-event", "tag", "click")]);
    assert.end();
});
test("erase a record", function (assert) {
    var expected = {
        insert: [],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\" dude: \"joe\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person name]\n      commit\n        p := none\n    ~~~\n  ");
    assert.end();
});
test("erase an attribute", function (assert) {
    var expected = {
        insert: [
            ["4", "tag", "person"]
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person age: 19 age: 21 age: 30]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person]\n      commit\n        p.age := none\n    ~~~\n  ");
    assert.end();
});
test("sum constant", function (assert) {
    var expected = {
        insert: [
            ["a", "tag", "person"],
            ["a", "name", "joe"],
            ["b", "tag", "person"],
            ["b", "name", "chris"],
            ["c", "tag", "total"],
            ["c", "total", 2],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"joe\"]\n        [#person name: \"chris\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person]\n        total = sum[value: 1, given: p]\n      commit\n        [#total total]\n    ~~~\n  ");
    assert.end();
});
test("sum variable", function (assert) {
    var expected = {
        insert: [
            ["3", "tag", "person"],
            ["3", "name", "joe"],
            ["3", "age", 10],
            ["7", "tag", "person"],
            ["7", "name", "chris"],
            ["7", "age", 20],
            ["13|30", "tag", "total"],
            ["13|30", "total", 30],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"joe\" age: 10]\n        [#person name: \"chris\" age: 20]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person age]\n        total = sum[value: age, given: p]\n      commit\n        [#total total]\n    ~~~\n  ");
    assert.end();
});
test("sum variable with multiple givens", function (assert) {
    var expected = {
        insert: [
            ["3", "tag", "person"],
            ["3", "name", "joe"],
            ["3", "age", 10],
            ["7", "tag", "person"],
            ["7", "name", "chris"],
            ["7", "age", 20],
            ["13|30", "tag", "total"],
            ["13|30", "total", 30],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"joe\" age: 10]\n        [#person name: \"chris\" age: 20]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person age]\n        total = sum[value: age, given: (p, age)]\n      commit\n        [#total total]\n    ~~~\n  ");
    assert.end();
});
test("sum groups", function (assert) {
    var expected = {
        insert: [
            ["3", "tag", "person"],
            ["3", "name", "joe"],
            ["3", "age", 10],
            ["7", "tag", "person"],
            ["7", "name", "chris"],
            ["7", "age", 20],
            ["11", "tag", "person"],
            ["11", "name", "mike"],
            ["11", "age", 20],
            ["17|1", "tag", "total"],
            ["17|1", "total", 1],
            ["17|2", "tag", "total"],
            ["17|2", "total", 2],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"joe\" age: 10]\n        [#person name: \"chris\" age: 20]\n        [#person name: \"mike\" age: 20]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person age]\n        total = sum[value: 1, given: p, per: age]\n      commit\n        [#total total]\n    ~~~\n  ");
    assert.end();
});
test("sum groups with multiple pers", function (assert) {
    var expected = {
        insert: [
            ["3", "tag", "person"],
            ["3", "name", "joe"],
            ["3", "age", 10],
            ["7", "tag", "person"],
            ["7", "name", "chris"],
            ["7", "age", 20],
            ["11", "tag", "person"],
            ["11", "name", "mike"],
            ["11", "age", 20],
            ["17|1", "tag", "total"],
            ["17|1", "total", 1],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"joe\" age: 10]\n        [#person name: \"chris\" age: 20]\n        [#person name: \"mike\" age: 20]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person age]\n        total = sum[value: 1, given: p, per: (age, p)]\n      commit\n        [#total total]\n    ~~~\n  ");
    assert.end();
});
test("aggregate stratification", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
            ["2", "name", "joe"],
            ["5", "tag", "person"],
            ["5", "name", "chris"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"joe\"]\n        [#person name: \"chris\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person]\n        total = sum[value: 1, given: p]\n        total > 2\n      commit\n        [#total total]\n    ~~~\n  ");
    assert.end();
});
test("aggregate stratification with results", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
            ["2", "name", "joe"],
            ["5", "tag", "person"],
            ["5", "name", "chris"],
            ["11|12", "tag", "total"],
            ["11|12", "total", 12],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"joe\"]\n        [#person name: \"chris\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person]\n        total = sum[value: 1, given: p]\n        total-plus-10 = total + 10\n      commit\n        [#total total: total-plus-10]\n    ~~~\n  ");
    assert.end();
});
test("aggregate stratification with another aggregate", function (assert) {
    var expected = {
        insert: [
            ["a", "tag", "person"],
            ["a", "name", "joe"],
            ["a", "age", 10],
            ["7", "tag", "person"],
            ["7", "name", "chris"],
            ["7", "age", 20],
            ["11", "tag", "person"],
            ["11", "name", "mike"],
            ["11", "age", 20],
            ["18|3", "tag", "total"],
            ["18|3", "total", 3],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"joe\" age: 10]\n        [#person name: \"chris\" age: 20]\n        [#person name: \"mike\" age: 20]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person age]\n        total = sum[value: 1, given: p, per: age]\n        count-all = sum[value: total, given: total]\n      commit\n        [#total total: count-all]\n    ~~~\n  ");
    assert.end();
});
test("unstratifiable aggregate", function (assert) {
    assert.throws(function () {
        var expected = {
            insert: [],
            remove: []
        };
        evaluate(assert, expected, "\n      people\n      ~~~\n        commit\n          [#person name: \"joe\" age: 10]\n          [#person name: \"chris\" age: 20]\n          [#person name: \"mike\" age: 20]\n      ~~~\n\n      foo bar\n      ~~~\n        search\n          p = [#person age]\n          total = sum[value: 1, given: count-all, per: age]\n          count-all = sum[value: total, given: total]\n        commit\n          [#total total: count-all]\n      ~~~\n    ");
    }, "Unstratifiable aggregates should throw an error");
    assert.end();
});
test("single argument is", function (assert) {
    var expected = {
        insert: [["7|false|true", "tag", "result"], ["7|false|true", "result", false], ["7|false|true", "result2", true]],
        remove: []
    };
    evaluate(assert, expected, "\n    is test\n    ~~~\n      search\n        result = is(3 > 4)\n        result2 = is(3 < 4)\n      commit\n        [#result result result2]\n    ~~~\n  ");
    assert.end();
});
test("multiple argument is", function (assert) {
    var expected = {
        insert: [["9|true|false", "tag", "result"], ["9|true|false", "result", true], ["9|true|false", "result2", false]],
        remove: []
    };
    evaluate(assert, expected, "\n    is test\n    ~~~\n      search\n        result = is(5 > 4, 6 != 9)\n        result2 = is(5 > 4, 6 = 9)\n      commit\n        [#result result result2]\n    ~~~\n  ");
    assert.end();
});
test("block order shouldn't matter", function (assert) {
    var expected = {
        insert: [
            ["7|bye!", "tag", "result"], ["7|bye!", "result", "bye!"],
            ["7|hi!", "tag", "result"], ["7|hi!", "result", "hi!"],
            ["10", "tag", "foo"], ["10", "value", "hi!"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    is test\n    ~~~\n      search\n        result = if [#foo value] then value\n                 else \"bye!\"\n      commit\n        [#result result]\n    ~~~\n\n    add a foo\n    ~~~\n      commit\n        [#foo value: \"hi!\"]\n    ~~~\n  ");
    var expected2 = {
        insert: [
            ["10|bye!", "tag", "result"], ["10|bye!", "result", "bye!"],
            ["10|hi!", "tag", "result"], ["10|hi!", "result", "hi!"],
            ["2", "tag", "foo"], ["2", "value", "hi!"],
        ],
        remove: []
    };
    evaluate(assert, expected2, "\n    add a foo\n    ~~~\n      commit\n        [#foo value: \"hi!\"]\n    ~~~\n\n    is test\n    ~~~\n      search\n        result = if [#foo value] then value\n                 else \"bye!\"\n      commit\n        [#result result]\n    ~~~\n  ");
    assert.end();
});
test("if with variable", function (assert) {
    var expected = {
        insert: [
            ["7|bye!", "tag", "result"], ["7|bye!", "result", "bye!"],
            ["7|hi!", "tag", "result"], ["7|hi!", "result", "hi!"],
            ["10", "tag", "foo"], ["10", "value", "hi!"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    is test\n    ~~~\n      search\n        result = if [#foo value] then value\n                 else \"bye!\"\n      commit\n        [#result result]\n    ~~~\n\n    add a foo\n    ~~~\n      commit\n        [#foo value: \"hi!\"]\n    ~~~\n\n  ");
    assert.end();
});
test("else with value", function (assert) {
    var expected = {
        insert: [["6|bye!", "tag", "result"], ["6|bye!", "result", "bye!"]],
        remove: []
    };
    evaluate(assert, expected, "\n    is test\n    ~~~\n      search\n        result = if [#foo] then \"hi!\"\n                 else \"bye!\"\n      commit\n        [#result result]\n    ~~~\n  ");
    assert.end();
});
test("if with constant equality", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "foo"], ["2", "value", "hi!"],
            ["13|meh", "tag", "result"], ["13|meh", "result", "meh"]
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    add a foo\n    ~~~\n      commit\n        [#foo value: \"hi!\"]\n    ~~~\n\n    is test\n    ~~~\n      search\n        [#foo value]\n        result = if value = \"yo\" then \"cool\"\n                 else if x = \"meh\" then x\n                 else \"ok\"\n      commit\n        [#result result]\n    ~~~\n  ");
    assert.end();
});
test("if with an aggregate", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "foo"], ["2", "value", "hi!"],
            ["10|0", "tag", "result"], ["10|0", "result", 0],
            ["10|1", "tag", "result"], ["10|1", "result", 1]
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    add a foo\n    ~~~\n      commit\n        [#foo value: \"hi!\"]\n    ~~~\n\n    is test\n    ~~~\n      search\n        result = if c = count[given: [#foo]] then c\n                 else 0\n      commit\n        [#result result]\n    ~~~\n  ");
    assert.end();
});
test("if with an external equality", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "foo"], ["2", "value", "hi!"],
            ["11|1", "tag", "result"], ["11|1", "result", 1]
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    add a foo\n    ~~~\n      commit\n        [#foo value: \"hi!\"]\n    ~~~\n\n    is test\n    ~~~\n      search\n        [#foo value]\n        moof = \"hi!\"\n        result = if moof = value then 1\n                 else 0\n      commit\n        [#result result]\n    ~~~\n  ");
    assert.end();
});
test("bind adds results", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "foo"], ["2", "value", "hi!"],
            ["7|hi!", "tag", "result"], ["7|hi!", "value", "hi!"]
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    add a foo\n    ~~~\n      commit\n        [#foo value: \"hi!\"]\n    ~~~\n\n    is test\n    ~~~\n      search\n        [#foo value]\n      bind\n        [#result value]\n    ~~~\n  ");
    assert.end();
});
test("bind removes dead results", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "foo"],
            ["2", "value", "hi!"],
            ["7|hi!", "tag", "result"],
            ["7|hi!", "value", "hi!"]
        ],
        remove: []
    };
    var eve = evaluate(assert, expected, "\n    add a foo\n    ~~~\n      commit\n        [#foo value: \"hi!\"]\n    ~~~\n\n    is test\n    ~~~\n      search\n        [#foo value]\n      bind\n        [#result value]\n    ~~~\n  ");
    var expected2 = {
        insert: [],
        remove: [
            ["2", "tag", "foo"],
            ["2", "value", "hi!"],
            ["7|hi!", "tag", "result"],
            ["7|hi!", "value", "hi!"]
        ]
    };
    evaluate(assert, expected2, "\n    remove foo\n    ~~~\n    search\n      foo = [#foo]\n    commit\n      foo := none\n    ~~~\n  ", eve.session);
    assert.end();
});
test("you only search facts in the specified database", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
            ["2", "name", "chris"],
            ["5", "tag", "person"],
            ["5", "name", "joe"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\"]\n        [#person name: \"joe\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search @foo\n        p = [#person]\n      commit\n        [dude: p]\n    ~~~\n  ");
    assert.end();
});
test("you can search from multiple databases", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
            ["2", "name", "chris"],
            ["5", "tag", "person"],
            ["5", "name", "joe"],
            ["8|2", "dude", "2"],
            ["8|5", "dude", "5"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\"]\n      commit @foo\n        [#person name: \"joe\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search (@foo, @session)\n        p = [#person]\n      commit\n        [dude: p]\n    ~~~\n  ");
    assert.end();
});
test("writing is scoped to databases", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
            ["2", "name", "chris"],
            ["5", "tag", "person"],
            ["5", "name", "joe"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit @foo\n        [#person name: \"chris\"]\n        [#person name: \"joe\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person]\n      commit\n        [dude: p]\n    ~~~\n  ");
    assert.end();
});
test("you can write into multiple databases", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
            ["2", "name", "chris"],
            ["5", "tag", "person"],
            ["5", "name", "joe"],
            ["2", "tag", "person"],
            ["2", "name", "chris"],
            ["5", "tag", "person"],
            ["5", "name", "joe"],
            ["8|2", "dude", "2"],
            ["8|5", "dude", "5"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit (@foo, @session)\n        [#person name: \"chris\"]\n        [#person name: \"joe\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person]\n      commit\n        [dude: p]\n    ~~~\n  ");
    assert.end();
});
test("reading in a scoped write uses the search scope", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
            ["2", "name", "chris"],
            ["5", "tag", "person"],
            ["5", "name", "joe"],
            ["9|chris", "dude", "chris"],
            ["9|joe", "dude", "joe"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\"]\n        [#person name: \"joe\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person]\n      commit @foo\n        [dude: p.name]\n    ~~~\n  ");
    assert.end();
});
test("reading in multiple scopes write uses the search scope", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
            ["2", "name", "chris"],
            ["5", "tag", "person"],
            ["5", "name", "joe"],
            ["8", "tag", "person"],
            ["8", "name", "woop"],
            ["12|chris", "dude", "chris"],
            ["12|joe", "dude", "joe"],
            ["12|woop", "dude", "woop"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit @blah\n        [#person name: \"chris\"]\n        [#person name: \"joe\"]\n      commit\n        [#person name: \"woop\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search (@blah, @session)\n        p = [#person]\n      commit @foo\n        [dude: p.name]\n    ~~~\n  ");
    assert.end();
});
test("scoped attribute mutators pick up the search scope", function (assert) {
    var expected = {
        insert: [
            ["6", "tag", "person"],
            ["6", "name", "chris"],
            ["6", "brother", "2|6"],
            ["2|6", "tag", "person"],
            ["2|6", "name", "ryan"],
            ["2|6", "name", "meep"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\" brother: [#person name: \"ryan\"]]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person]\n      commit @foo\n        p.brother.name := \"meep\"\n    ~~~\n  ");
    assert.end();
});
test("multi-level attribute accesses", function (assert) {
    var expected = {
        insert: [
            ["6", "tag", "person"],
            ["6", "name", "chris"],
            ["6", "brother", "2|6"],
            ["2|6", "tag", "person"],
            ["2|6", "name", "ryan"],
            ["15|ryan", "tag", "dude"],
            ["15|ryan", "dude", "ryan"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\" brother: [#person name: \"ryan\"]]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person]\n        p2 = [#person name: p.brother.name]\n      commit\n        [#dude dude: p2.name]\n    ~~~\n  ");
    assert.end();
});
test("split function", function (assert) {
    var expected = {
        insert: [
            ["2|foo", "dude", "foo"],
            ["2|bar", "dude", "bar"],
            ["2|baz", "dude", "baz"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    foo bar\n    ~~~\n      search\n        token = split[text: \"foo|bar|baz\" by: \"|\"]\n      commit\n        [dude: token]\n    ~~~\n  ");
    assert.end();
});
test("split function with multiple returns", function (assert) {
    var expected = {
        insert: [
            ["3|foo|1", "dude", "foo"],
            ["3|foo|1", "index", 1],
            ["3|bar|2", "dude", "bar"],
            ["3|bar|2", "index", 2],
            ["3|baz|3", "dude", "baz"],
            ["3|baz|3", "index", 3],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    foo bar\n    ~~~\n      search\n        (token, index) = split[text: \"foo|bar|baz\" by: \"|\"]\n      commit\n        [dude: token, index]\n    ~~~\n  ");
    assert.end();
});
test("split function with attribute returns", function (assert) {
    var expected = {
        insert: [
            ["3|foo|1", "dude", "foo"],
            ["3|foo|1", "index", 1],
            ["3|bar|2", "dude", "bar"],
            ["3|bar|2", "index", 2],
            ["3|baz|3", "dude", "baz"],
            ["3|baz|3", "index", 3],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    foo bar\n    ~~~\n      search\n         split[text: \"foo|bar|baz\" by: \"|\", token, index]\n      commit\n        [dude: token, index]\n    ~~~\n  ");
    assert.end();
});
test("split function with fixed return", function (assert) {
    var expected = {
        insert: [
            ["4|bar", "dude", "bar"],
            ["4|bar", "index", 2],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    foo bar\n    ~~~\n      search\n        (token, 2) = split[text: \"foo|bar|baz\" by: \"|\"]\n      commit\n        [dude: token, index: 2]\n    ~~~\n  ");
    assert.end();
});
test("split function with fixed return attribute", function (assert) {
    var expected = {
        insert: [
            ["4|bar", "dude", "bar"],
            ["4|bar", "index", 2],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    foo bar\n    ~~~\n      search\n        split[text: \"foo|bar|baz\" by: \"|\", token, index: 2]\n      commit\n        [dude: token, index: 2]\n    ~~~\n  ");
    assert.end();
});
test("split function with fixed token", function (assert) {
    var expected = {
        insert: [
            ["4|2", "dude", "bar"],
            ["4|2", "index", 2],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    foo bar\n    ~~~\n      search\n        split[text: \"foo|bar|baz\" by: \"|\", token: \"bar\", index]\n      commit\n        [dude: \"bar\", index]\n    ~~~\n  ");
    assert.end();
});
test("split function with both fixed", function (assert) {
    var expected = {
        insert: [
            ["5", "dude", "bar"],
            ["5", "index", 2],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    foo bar\n    ~~~\n      search\n        split[text: \"foo|bar|baz\" by: \"|\", token: \"bar\", index: 2]\n      commit\n        [dude: \"bar\", index: 2]\n    ~~~\n  ");
    assert.end();
});
test("pipe allows you to select ", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
            ["2", "name", "chris"],
            ["5", "tag", "person"],
            ["5", "name", "joe"],
            ["10|2", "dude", "2"],
            ["10|2", "name", "chris"],
            ["10|5", "dude", "5"],
            ["10|5", "name", "joe"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\"]\n        [#person name: \"joe\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person name]\n      commit\n        [dude: p | name]\n    ~~~\n  ");
    assert.end();
});
test("lookup with bound record", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
            ["2", "name", "chris"],
            ["7", "info", "Has tag with value person"],
            ["7", "info", "Has name with value chris"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        lookup[record: [#person], attribute, value]\n      commit\n        [| info: \"Has {{attribute}} with value {{value}}\"]\n    ~~~\n  ");
    assert.end();
});
test("lookup with bound attribute", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
            ["2", "name", "chris"],
            ["6", "record", "2"],
            ["6", "value", "chris"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        lookup[record, attribute: \"name\", value]\n      commit\n        [| record value]\n    ~~~\n  ");
    assert.end();
});
test("lookup with free attribute, node and bound value", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
            ["2", "name", "chris"],
            ["7", "record", "2"],
            ["7", "attribute", "name"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        record = [#person]\n        lookup[record, attribute, value: \"chris\", node]\n      commit\n        [| record attribute]\n    ~~~\n  ");
    assert.end();
});
test("lookup on node", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
            ["2", "name", "chris"],
            ["6", "record", "2"],
            ["6", "attribute", "tag"],
            ["6", "value", "person"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        lookup[record, attribute, value, node: \"0|block|0|node|3|build\"]\n      commit\n        [| record attribute value]\n    ~~~\n  ");
    assert.end();
});
test("lookup all free", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
            ["2", "name", "chris"],
            ["6", "record", "2"],
            ["6", "attribute", "tag"],
            ["6", "value", "person"],
            ["6", "node", "0|block|0|node|3|build"],
            ["6", "attribute", "name"],
            ["6", "value", "chris"],
            ["6", "node", "0|block|0|node|5|build"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        lookup[record, attribute, value, node]\n      commit @foo\n        [| record attribute value node]\n    ~~~\n  ");
    assert.end();
});
test("lookup action", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
            ["2", "name", "chris"],
            ["2", "woo4", "yep"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        record = [#person]\n        attribute = \"woo{{1 + 3}}\"\n        value = \"yep\"\n      commit\n        lookup[record, attribute, value]\n    ~~~\n  ");
    assert.end();
});
test("lookup action without value errors", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
            ["2", "name", "chris"],
        ],
        remove: [],
        errors: true,
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        record = [#person]\n        attribute = \"woo{{1 + 3}}\"\n        value = \"yep\"\n      commit\n        lookup[record, attribute]\n    ~~~\n  ");
    assert.end();
});
test("lookup action remove", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        record = [#person]\n        attribute = \"name\"\n        value = \"chris\"\n      commit\n        lookup[record, attribute, value] := none\n    ~~~\n  ");
    assert.end();
});
test("lookup action remove free value", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        record = [#person]\n        attribute = \"name\"\n      commit\n        lookup[record, attribute] := none\n    ~~~\n  ");
    assert.end();
});
test("an identifier followed by whitespace should not be interpreted as a function", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
            ["2", "name", "chris"],
            ["2", "dude", "chris"],
            ["5", "tag", "person"],
            ["5", "name", "joe"],
            ["5", "dude", "joe"],
            ["10", "tag", "cool"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\"]\n        [#person name: \"joe\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person name]\n      commit\n        p.dude := name\n        [#cool]\n    ~~~\n  ");
    assert.end();
});
test("indented code blocks are not evaled", function (assert) {
    var expected = {
        insert: [],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n\n        commit\n          [#person name: \"chris\"]\n          [#person name: \"joe\"]\n\n    foo bar\n    ~~~\n      search\n        p = [#person name]\n      commit\n        p.dude := name\n        [#cool]\n    ~~~\n  ");
    assert.end();
});
test("single value sort", function (assert) {
    var expected = {
        insert: [
            ["2", "tag", "person"],
            ["2", "name", "a"],
            ["5", "tag", "person"],
            ["5", "name", "b"],
            ["8", "tag", "person"],
            ["8", "name", "c"],
            ["14|1 a", "dude", "1 a"],
            ["14|2 b", "dude", "2 b"],
            ["14|3 c", "dude", "3 c"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"a\"]\n        [#person name: \"b\"]\n        [#person name: \"c\"]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person name]\n        ix = sort[value: name]\n      commit\n        [dude: \"{{ix}} {{name}}\"]\n    ~~~\n  ");
    assert.end();
});
test("multi value sort", function (assert) {
    var expected = {
        insert: [
            ["3", "tag", "person"],
            ["3", "name", "a"],
            ["3", "age", 1],
            ["7", "tag", "person"],
            ["7", "name", "a"],
            ["7", "age", 2],
            ["11", "tag", "person"],
            ["11", "name", "b"],
            ["11", "age", 1],
            ["18|1 a 1", "dude", "1 a 1"],
            ["18|2 a 2", "dude", "2 a 2"],
            ["18|3 b 1", "dude", "3 b 1"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"a\" age: 1]\n        [#person name: \"a\" age: 2]\n        [#person name: \"b\" age: 1]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person name age]\n        ix = sort[value: (name, age)]\n      commit\n        [dude: \"{{ix}} {{name}} {{age}}\"]\n    ~~~\n  ");
    assert.end();
});
test("multi value sort with multiple directions", function (assert) {
    var expected = {
        insert: [
            ["3", "tag", "person"],
            ["3", "name", "a"],
            ["3", "age", 1],
            ["7", "tag", "person"],
            ["7", "name", "a"],
            ["7", "age", 2],
            ["11", "tag", "person"],
            ["11", "name", "b"],
            ["11", "age", 1],
            ["18|2 a 1", "dude", "2 a 1"],
            ["18|3 a 2", "dude", "3 a 2"],
            ["18|1 b 1", "dude", "1 b 1"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"a\" age: 1]\n        [#person name: \"a\" age: 2]\n        [#person name: \"b\" age: 1]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person name age]\n        ix = sort[value: (name, age), direction: (\"down\", \"up\")]\n      commit\n        [dude: \"{{ix}} {{name}} {{age}}\"]\n    ~~~\n  ");
    assert.end();
});
test("sort with group", function (assert) {
    var expected = {
        insert: [
            ["3", "tag", "person"],
            ["3", "name", "a"],
            ["3", "age", 1],
            ["7", "tag", "person"],
            ["7", "name", "a"],
            ["7", "age", 2],
            ["11", "tag", "person"],
            ["11", "name", "b"],
            ["11", "age", 1],
            ["18|1 a 1", "dude", "1 a 1"],
            ["18|2 a 2", "dude", "2 a 2"],
            ["18|1 b 1", "dude", "1 b 1"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"a\" age: 1]\n        [#person name: \"a\" age: 2]\n        [#person name: \"b\" age: 1]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person name age]\n        ix = sort[value: age, per: name]\n      commit\n        [dude: \"{{ix}} {{name}} {{age}}\"]\n    ~~~\n  ");
    assert.end();
});
test("if with expression-only arguments", function (assert) {
    var expected = {
        insert: [
            ["7|0", "tag", "div"],
            ["7|0", "text", 0],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    test\n    ~~~\n    search\n      foo = -1 + 1\n      text = if foo < 1 then foo else \"baz\"\n    bind @browser\n      [#div text]\n    ~~~\n  ");
    assert.end();
});
test("multiple inequalities in a row", function (assert) {
    var expected = {
        insert: [
            ["3", "tag", "person"],
            ["3", "name", "chris"],
            ["3", "age", 20],
            ["7", "tag", "person"],
            ["7", "name", "joe"],
            ["7", "age", 10],
            ["14|3", "dude", "3"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    people\n    ~~~\n      commit\n        [#person name: \"chris\" age: 20]\n        [#person name: \"joe\" age: 10]\n    ~~~\n\n    foo bar\n    ~~~\n      search\n        p = [#person name age]\n        15 < age < 30\n      commit\n        [dude: p]\n    ~~~\n  ");
    assert.end();
});
test("range positive increment", function (assert) {
    var expected = {
        insert: [
            ["a", "dude", 1],
            ["a", "dude", 2],
            ["a", "dude", 3],
            ["a", "dude", 4],
            ["a", "dude", 5],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    foo bar\n    ~~~\n      search\n        i = range[from: 1 to: 5]\n      commit\n        [| dude: i]\n    ~~~\n  ");
    assert.end();
});
test("range negative increment", function (assert) {
    var expected = {
        insert: [
            ["2", "dude", -1],
            ["2", "dude", -2],
            ["2", "dude", -3],
            ["2", "dude", -4],
            ["2", "dude", -5],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    foo bar\n    ~~~\n      search\n        i = range[from: -1 to: -5 increment: -1]\n      commit\n        [| dude: i]\n    ~~~\n  ");
    assert.end();
});
test("range increment on an edge boundary", function (assert) {
    var expected = {
        insert: [
            ["2", "dude", 1],
            ["2", "dude", 4],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    foo bar\n    ~~~\n      search\n        i = range[from: 1 to: 5 increment: 3]\n      commit\n        [| dude: i]\n    ~~~\n  ");
    assert.end();
});
test("range with a single increment", function (assert) {
    var expected = {
        insert: [
            ["2", "dude", 1],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    foo bar\n    ~~~\n      search\n        i = range[from: 1 to: 5 increment: 10]\n      commit\n        [| dude: i]\n    ~~~\n  ");
    assert.end();
});
test("range with infinite increment", function (assert) {
    var expected = {
        insert: [],
        remove: []
    };
    evaluate(assert, expected, "\n    foo bar\n    ~~~\n      search\n        i = range[from: -1 to: -5 increment: 1]\n      commit\n        [| dude: i]\n    ~~~\n  ");
    assert.end();
});
test("accessing the same attribute sequence natural joins instead of product joining", function (assert) {
    var expected = {
        insert: [
            ["a", "tag", "user"],
            ["a", "name", "Corey Montella"],
            ["5", "tag", "user"],
            ["5", "name", "Chris Granger"],
            ["14|2|23", "tag", "message"],
            ["14|2|23", "sender", "a"],
            ["14|2|23", "text", "Hello, Chris"],
            ["14|2|23", "eve-auto-index", 1],
            ["19|5|23", "tag", "message"],
            ["19|5|23", "sender", "5"],
            ["19|5|23", "text", "Hello there!"],
            ["19|5|23", "eve-auto-index", 2],
            ["23", "tag", "conversation"],
            ["23", "messages", "19|5|23"],
            ["23", "messages", "14|2|23"],
            ["34|23", "tag", "div"],
            ["34|23", "convos", "23"],
            ["34|23", "text", "Chris Granger - Hello there!"],
            ["34|23", "text", "Corey Montella - Hello, Chris"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    We have users:\n\n    ~~~\n    commit\n      [#user name: \"Corey Montella\"]\n      [#user name: \"Chris Granger\"]\n    ~~~\n\n    And we have conversations with messages between users:\n\n    ~~~\n    search\n      corey = [#user name: \"Corey Montella\"]\n      chris = [#user name: \"Chris Granger\"]\n\n    commit\n      [#conversation messages:\n        [#message sender: corey, text: \"Hello, Chris\"]\n        [#message sender: chris, text: \"Hello there!\"]]\n    ~~~\n\n    Now I want to display all the messages and their senders\n\n    ~~~\n    search\n      convos =  [#conversation]\n\n    bind @browser\n      [#div convos | text: \"{{convos.messages.sender.name}} - {{convos.messages.text}}\"]\n    ~~~\n  ");
    assert.end();
});
test("not with no external dependencies", function (assert) {
    var expected = {
        insert: [],
        remove: []
    };
    evaluate(assert, expected, "\n    foo bar\n    ~~~\n    search\n      not (9 = 4 + 5)\n    commit @browser\n      [#success]\n    ~~~\n  ");
    expected = {
        insert: [
            ["3", "tag", "success"],
        ],
        remove: []
    };
    evaluate(assert, expected, "\n    foo bar\n    ~~~\n    search\n      not (2 = 4 + 5)\n    commit @browser\n      [#success]\n    ~~~\n  ");
    assert.end();
});
test("not can't provide a variable for an attribute access", function (assert) {
    var expected = {
        insert: [],
        remove: [],
        errors: true,
    };
    evaluate(assert, expected, "\n    foo bar\n    ~~~\n    search\n      not(threads = [#zom])\n      foo = threads.foo\n    bind\n      [#foo foo]\n    ~~~\n  ");
    assert.end();
});
test("indirect constant equality in if", function (assert) {
    var expected = {
        insert: [
            ["a", "tag", "div"],
            ["a", "text", "1 is true"],
            ["b", "tag", "div"],
            ["b", "text", "2 is false"],
            ["c", "tag", "div"],
            ["c", "text", "3 is false"],
        ],
        remove: [],
    };
    evaluate(assert, expected, "\n    Now consider this:\n\n    ~~~\n      search\n        one = 1\n        x = range[from: 1, to: 3]\n        value = if x = one then \"true\" else \"false\"\n\n      bind @browser\n        [#div text: \"{{x}} is {{value}}\"]\n    ~~~\n  ");
    assert.end();
});
test("constant filter in if", function (assert) {
    var expected = {
        insert: [
            ["a", "tag", "div"],
            ["a", "text", 3],
        ],
        remove: [],
    };
    evaluate(assert, expected, "\n    Now consider this:\n\n    ~~~\n      search\n        x = 3\n        \"woohoo\" = if x < 3 then \"cool\"\n                   else if x >= 3 then \"woohoo\"\n\n      bind @browser\n        [#div text: x]\n    ~~~\n  ");
    assert.end();
});
//# sourceMappingURL=join.js.map