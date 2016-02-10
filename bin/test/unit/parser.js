/// <reference path="../../typings/chai/chai.d.ts" />
/// <reference path="../../typings/mocha/mocha.d.ts" />
var chai_1 = require("chai");
var utils_1 = require("../../src/utils");
var app_1 = require("../../src/app");
var parser_1 = require("../../src/parser");
function assertSexprEqual(a, b) {
    chai_1.expect(a).length(b.length);
    var argIx = 1;
    for (var _i = 0, _a = a.arguments; _i < _a.length; _i++) {
        var arg = _a[_i];
        var other = b.nth(argIx++);
        chai_1.expect(arg).to.be.an.instanceOf(other.constructor);
        if (arg instanceof parser_1.Token) {
            chai_1.expect(arg).property("type").to.equal(other.type);
            chai_1.expect(arg).property("value").to.equal(other.value);
        }
        else
            assertSexprEqual(arg, other);
    }
}
function applyAsViews(artifacts) {
    var views = artifacts.views;
    for (var viewId in views)
        app_1.eve.asView(views[viewId]);
}
function applyIds(facts, fields) {
    for (var _i = 0; _i < facts.length; _i++) {
        var fact = facts[_i];
        var parts = [];
        for (var _a = 0; _a < fields.length; _a++) {
            var field = fields[_a];
            parts.push(fact[field]);
        }
        fact.__id = parts.join("|");
    }
    return facts;
}
//-----------------------------------------------------------------------------
// Token
//-----------------------------------------------------------------------------
describe("Token", function () {
    // Shortcut initializers
    var values = ["foo", 7, true, ""];
    ["identifier", "keyword", "string", "literal"].map(function (kind) {
        describe("#" + kind + "()", function () {
            it("should return a newly initialized token with the given value", function () {
                var tokens = [];
                for (var _i = 0; _i < values.length; _i++) {
                    var val = values[_i];
                    tokens.push(parser_1.Token[kind](val));
                }
                for (var ix = values.length - 1; ix >= 0; ix--)
                    chai_1.expect(tokens[ix]).to.be.an.instanceOf(parser_1.Token).with.property("value", values[ix]);
            });
        });
    });
    describe("#toString()", function () {
        it("should coerce its value to a literal text representation", function () {
            chai_1.expect(parser_1.Token.identifier("foo").toString()).to.equal("foo");
            chai_1.expect(parser_1.Token.keyword("foo").toString()).to.equal(":foo");
            chai_1.expect(parser_1.Token.string("foo").toString()).to.equal("\"foo\"");
            chai_1.expect(parser_1.Token.literal(true).toString()).to.equal("true");
        });
    });
});
//-----------------------------------------------------------------------------
// Sexpr
//-----------------------------------------------------------------------------
describe("Sexpr", function () {
    // Shortcut initializers
    var values = [
        [parser_1.Token.string("foo"), parser_1.Token.literal(7), parser_1.Token.literal(true)],
        [parser_1.Token.identifier("sum"), parser_1.Token.keyword("foo"), parser_1.Token.string("test")],
        [parser_1.Token.identifier("-"), parser_1.Token.keyword("a"), parser_1.Token.literal(7), parser_1.Token.keyword("b"), parser_1.Token.literal(3)],
        [parser_1.Token.identifier("negate"), new parser_1.Sexpr([parser_1.Token.identifier("error"), parser_1.Token.keyword("id"), parser_1.Token.literal("id")])],
        [parser_1.Token.keyword("foo"), parser_1.Token.string("bar"), parser_1.Token.keyword("baz"), parser_1.Token.identifier("quux")],
        []
    ];
    ["list", "hash"].map(function (kind) {
        describe("#" + kind + "()", function () {
            it("should return a newly initialized sexpr with the given operator and value", function () {
                var sexprs = [];
                for (var _i = 0; _i < values.length; _i++) {
                    var val = values[_i];
                    sexprs.push(parser_1.Sexpr[kind](val));
                }
                for (var ix = values.length - 1; ix >= 0; ix--) {
                    chai_1.expect(sexprs[ix]).to.be.an.instanceOf(parser_1.Sexpr).with.property("operator").that.is.an.instanceOf(parser_1.Token);
                    chai_1.expect(sexprs[ix].operator).to.have.property("type", parser_1.Token.TYPE.IDENTIFIER);
                    chai_1.expect(sexprs[ix].operator).to.have.property("value", kind);
                    chai_1.expect(sexprs[ix]).to.have.property("arguments").which.deep.equal(values[ix]);
                }
            });
        });
    });
    describe("#push()", function () {
        it("should append a new token to an empty sexpr", function () {
            var sexpr = new parser_1.Sexpr([]);
            var token = parser_1.Token.literal(true);
            sexpr.push(token);
            chai_1.expect(sexpr.value).to.have.length(1).and.property("0").that.equals(token);
        });
        it("should append a new token to an existing sexpr", function () {
            var sexpr = new parser_1.Sexpr([parser_1.Token.identifier("+"), parser_1.Token.string("foo")]);
            var token = parser_1.Token.literal(true);
            sexpr.push(token);
            chai_1.expect(sexpr).to.have.property("arguments").with.length(2).and.property("1").that.equals(token);
        });
    });
    describe("#nth()", function () {
        var value = values[2];
        it("should return the nth token of the sexpr", function () {
            var sexpr = new parser_1.Sexpr(value);
            var ix = 0;
            for (var _i = 0; _i < value.length; _i++) {
                var v = value[_i];
                chai_1.expect(sexpr.nth(ix)).to.equal(value[ix++]);
            }
        });
        it("should overwrite the nth token of a sexpr", function () {
            var sexpr = new parser_1.Sexpr(value);
            var token = parser_1.Token.identifier("quux");
            sexpr.nth(3, token);
            chai_1.expect(sexpr.nth(3)).to.equal(token);
        });
    });
    describe("#toString()", function () {
        it("should coerce its value to a literal text representation", function () {
            chai_1.expect(new parser_1.Sexpr(values[2]).toString()).to.equal("(- :a 7 :b 3)");
            chai_1.expect(new parser_1.Sexpr(values[3]).toString()).to.equal("(negate (error :id id))");
            var sexpr = parser_1.Sexpr.list(values[0]);
            sexpr.syntax = "list";
            chai_1.expect(sexpr.toString()).to.equal("[\"foo\" 7 true]");
            sexpr.arguments = values[3];
            chai_1.expect(sexpr.toString()).to.equal("[negate (error :id id)]");
            sexpr = parser_1.Sexpr.hash(values[4]);
            sexpr.syntax = "hash";
            chai_1.expect(sexpr.toString()).to.equal("{:foo \"bar\" :baz quux}");
            sexpr.arguments = values[3];
            chai_1.expect(sexpr.toString()).to.equal("{negate (error :id id)}");
        });
    });
});
//-----------------------------------------------------------------------------
// Reader
//-----------------------------------------------------------------------------
describe("readSexprs()", function () {
    var testCases = [
        { input: "(foo)", output: [new parser_1.Sexpr([parser_1.Token.identifier("foo", 0, 1)], 0, 0)] },
        {
            input: "(foo \"bar\" :baz quux (quux))\n(fizz)",
            output: [
                new parser_1.Sexpr([
                    parser_1.Token.identifier("foo", 0, 1),
                    parser_1.Token.string("bar", 0, 5),
                    parser_1.Token.keyword("baz", 0, 11),
                    parser_1.Token.identifier("quux", 0, 16),
                    new parser_1.Sexpr([parser_1.Token.identifier("quux", 0, 22)], 0, 21)
                ], 0, 0),
                new parser_1.Sexpr([parser_1.Token.identifier("fizz", 1, 1)], 1, 0)
            ]
        },
        {
            macro: true,
            input: "{:foo a :bar \"b\"}",
            output: [parser_1.Sexpr.hash([
                    parser_1.Token.keyword("foo", 0, 1),
                    parser_1.Token.identifier("a", 0, 6),
                    parser_1.Token.keyword("bar", 0, 8),
                    parser_1.Token.string("b", 0, 13)
                ], 0, 0, true)]
        },
        {
            macro: true,
            input: "(project! \"foo\" {:a 1})",
            output: [new parser_1.Sexpr([
                    parser_1.Token.identifier("project!", 0, 1),
                    parser_1.Token.string("foo", 0, 10),
                    parser_1.Sexpr.hash([
                        parser_1.Token.keyword("a", 0, 17),
                        parser_1.Token.literal(1, 0, 20)
                    ], 0, 16, true)
                ], 0, 0)]
        },
        {
            macro: true,
            input: "[a \"b\" true]",
            output: [parser_1.Sexpr.list([
                    parser_1.Token.identifier("a", 0, 1),
                    parser_1.Token.string("b", 0, 3),
                    parser_1.Token.literal(true, 0, 7)
                ], 0, 0, true)]
        },
        {
            macro: true,
            input: "(sort! [\"a\" \"b\"])",
            output: [new parser_1.Sexpr([
                    parser_1.Token.identifier("sort!", 0, 1),
                    parser_1.Sexpr.list([
                        parser_1.Token.string("a", 0, 8),
                        parser_1.Token.string("b", 0, 12)
                    ], 0, 7, true)
                ], 0, 0)]
        }
    ];
    it("should return an empty list on empty input", function () {
        chai_1.expect(parser_1.readSexprs("")).to.deep.equal(parser_1.Sexpr.list());
    });
    it("should return a sexpr for each expr in the input", function () {
        for (var _i = 0; _i < testCases.length; _i++) {
            var test_1 = testCases[_i];
            if (test_1.macro)
                continue;
            chai_1.expect(parser_1.readSexprs(test_1.input)).to.have.length(test_1.output.length + 1);
        }
    });
    it("should return a correct sexpr for each expr in the input", function () {
        for (var _i = 0; _i < testCases.length; _i++) {
            var test_2 = testCases[_i];
            var sexprIx = 0;
            for (var _a = 0, _b = parser_1.readSexprs(test_2.input).arguments; _a < _b.length; _a++) {
                var sexpr = _b[_a];
                if (test_2.macro)
                    continue;
                chai_1.expect(sexpr).to.deep.equal(test_2.output[sexprIx++]);
            }
        }
    });
    it("should fully expand syntax macro exprs", function () {
        for (var _i = 0; _i < testCases.length; _i++) {
            var test_3 = testCases[_i];
            var sexprIx = 0;
            for (var _a = 0, _b = parser_1.readSexprs(test_3.input).arguments; _a < _b.length; _a++) {
                var sexpr = _b[_a];
                if (!test_3.macro)
                    continue;
                chai_1.expect(sexpr).to.deep.equal(test_3.output[sexprIx++]);
            }
        }
    });
});
//-----------------------------------------------------------------------------
// Macro Expansion
//-----------------------------------------------------------------------------
describe("macroexpandDSL()", function () {
    var testCases = [
        { input: "(select \"foo\" :bar baz)", output: "(select \"foo\" :bar baz)" },
        { input: "(project! \"widget\" :wiggly \"woo\")", output: "(project! \"widget\" :wiggly \"woo\")" },
        { input: "(union (re \"mi\" :fa))", output: "(union (re \"mi\" :fa))" },
    ];
    it("should pass through terminal forms", function () {
        for (var _i = 0; _i < testCases.length; _i++) {
            var test_4 = testCases[_i];
            if (test_4.macro)
                continue;
            var input = parser_1.readSexprs(test_4.input);
            var output = parser_1.readSexprs(test_4.output);
            chai_1.expect(input).length(output.length);
            var ix = 1;
            for (var _a = 0, _b = input.arguments; _a < _b.length; _a++) {
                var sexpr = _b[_a];
                var expanded = parser_1.macroexpandDSL(sexpr);
                chai_1.expect(expanded).to.deep.equal(output.nth(ix++));
            }
        }
    });
    describe("select", function () {
        it("should expand (foo ...) => (select \"foo\" ...\")", function () {
            var expanded = parser_1.macroexpandDSL(parser_1.readSexprs("(foo :a a)").nth(1));
            var expected = parser_1.readSexprs("(select \"foo\" :a a)").nth(1);
            assertSexprEqual(expanded, expected);
        });
    });
    describe("negate", function () {
        it("should expand (negate (...)) => (... $$negated true)", function () {
            var expanded = parser_1.macroexpandDSL(parser_1.readSexprs("(negate (select \"foo\" :a a))").nth(1));
            var expected = parser_1.readSexprs("(select \"foo\" :a a :$$negated true)").nth(1);
            assertSexprEqual(expanded, expected);
        });
        it("should recursively expand its child form", function () {
            var expanded = parser_1.macroexpandDSL(parser_1.readSexprs("(negate (foo :a a))").nth(1));
            var expected = parser_1.readSexprs("(select \"foo\" :a a :$$negated true)").nth(1);
            assertSexprEqual(expanded, expected);
        });
    });
});
//-----------------------------------------------------------------------------
// DSL Parser
//-----------------------------------------------------------------------------
describe("parseDSL()", function () {
    app_1.eve.clearTable("test:employee");
    app_1.eve.clearTable("test:department");
    var changeset = app_1.eve.diff();
    changeset.addMany("test:department", [
        { department: "engineering", head: "chris" },
        { department: "distinction", head: "josh" },
        { department: "operations", head: "rob" },
        { department: "magic", head: "hermione" }
    ]);
    changeset.addMany("test:employee", [
        { "employee": "Hazel Bernier", "department": "engineering", "salary": 78.99 },
        { "employee": "Candice Will", "department": "distinction", "salary": 233.73 },
        { "employee": "Celine Hauck", "department": "operations", "salary": 973.00 },
        { "employee": "Loyal Ullrich", "department": "engineering", "salary": 109.03 },
        { "employee": "Gregorio Wolf", "department": "operations", "salary": 971.28 },
        { "employee": "Adalberto Feil", "department": "distinction", "salary": 986.62 },
        { "employee": "Ettie Bergstrom", "department": "engineering", "salary": 990.50 },
        { "employee": "Adam Von", "department": "distinction", "salary": 874.19 },
        { "employee": "Baby Hintz", "department": "engineering", "salary": 666.23 },
        { "employee": "Anibal Fahey", "department": "distinction", "salary": 353.84 }
    ]);
    app_1.eve.applyDiff(changeset);
    function idSort(facts) {
        return facts.slice().sort(function (a, b) { return a.__id === b.__id ? 0 : (a.__id > b.__id ? 1 : -1); });
    }
    it("should select all departments", function () {
        var artifacts = parser_1.parseDSL("(query :$$view \"test:1\" (test:department :department department :head head))");
        var results = artifacts.views["test:1"].exec().results;
        chai_1.expect(results).to.deep.equal(app_1.eve.find("test:department"));
    });
    it("should select all employees", function () {
        var artifacts = parser_1.parseDSL("(query :$$view \"test:2\" (test:employee :employee employee :department department :salary salary))");
        var results = artifacts.views["test:2"].exec().results;
        chai_1.expect(results).to.deep.equal(app_1.eve.find("test:employee"));
    });
    it("should project itself", function () {
        var artifacts = parser_1.parseDSL("(query :$$view \"test:3\"\n      (test:employee :employee emp :department dept :salary sal)\n      (project! :employee emp :department dept :salary sal))\n    ");
        var results = artifacts.views["test:3"].exec().results;
        chai_1.expect(results).to.deep.equal(app_1.eve.find("test:employee"));
    });
    it("should join selects sharing variables", function () {
        var artifacts = parser_1.parseDSL("(query :$$view \"test:3\"\n      (test:department :department dept :head head)\n      (test:employee :employee emp :department dept)\n      (project! :employee emp :head head))\n    ");
        var results = artifacts.views["test:3"].exec().results;
        var expected = [];
        for (var _i = 0, _a = app_1.eve.find("test:employee"); _i < _a.length; _i++) {
            var employee = _a[_i];
            var fact = { employee: employee.employee, head: app_1.eve.findOne("test:department", { department: employee.department }).head };
            fact.__id = fact.employee + "|" + fact.head;
            expected.push(fact);
        }
        chai_1.expect(idSort(results)).to.deep.equal(idSort(expected));
    });
    it("should product selects not sharing variables", function () {
        var artifacts = parser_1.parseDSL("(query :$$view \"test:4\"\n      (test:department :head head)\n      (test:department :head other-guy)\n      (project! :employee head :coworker other-guy))\n    ");
        var results = artifacts.views["test:4"].exec().results;
        var departments = app_1.eve.find("test:department");
        var expected = [];
        for (var _i = 0; _i < departments.length; _i++) {
            var department = departments[_i];
            for (var _a = 0; _a < departments.length; _a++) {
                var department2 = departments[_a];
                var fact = { employee: department.head, coworker: department2.head, __id: department.head + "|" + department2.head };
                expected.push(fact);
            }
        }
        chai_1.expect(idSort(results)).to.deep.equal(idSort(expected));
    });
    it("should calculate selects on primitives", function () {
        var artifacts = parser_1.parseDSL("(query :$$view \"test:5\"\n      (test:employee :employee emp :salary sal)\n      (+ :a sal :b 1 :result res)\n      (project! :employee emp :sal-and-one res))\n    ");
        var results = artifacts.views["test:5"].exec().results;
        var expected = [];
        for (var _i = 0, _a = app_1.eve.find("test:employee"); _i < _a.length; _i++) {
            var employee = _a[_i];
            var fact = { employee: employee.employee, "sal-and-one": employee.salary + 1 };
            fact.__id = fact.employee + "|" + fact["sal-and-one"];
            expected.push(fact);
        }
        chai_1.expect(idSort(results)).to.deep.equal(idSort(expected));
    });
    it("should aggregate selects on aggregation primitives", function () {
        var artifacts = parser_1.parseDSL("(query :$$view \"test:6\"\n      (test:employee :employee emp :salary sal)\n      (sum :value sal :sum res)\n      (project! :total res))\n    ");
        var results = artifacts.views["test:6"].exec().results;
        var total = 0;
        for (var _i = 0, _a = app_1.eve.find("test:employee"); _i < _a.length; _i++) {
            var employee = _a[_i];
            total += employee.salary;
        }
        var expected = [{ total: total, __id: total }];
        chai_1.expect(idSort(results)).to.deep.equal(idSort(expected));
    });
    it("should auto-select all projected vars from subqueries", function () {
        var artifacts = parser_1.parseDSL("(query :$$view \"test:7\"\n      (test:department :department dept)\n      (query :$$view \"test:7-1\"\n        (test:employee :department dept :employee emp :salary sal))\n      (project! :department dept :employee emp :salary sal))\n    ");
        applyAsViews(artifacts);
        var results = app_1.eve.find("test:7");
        var expected = applyIds(app_1.eve.find("test:employee").map(utils_1.copy), ["department", "employee", "salary"]);
        chai_1.expect(idSort(results)).to.deep.equal(idSort(expected));
    });
    it("should group subqueries by their parent's context", function () {
        var artifacts = parser_1.parseDSL("(query :$$view \"test:8\"\n      (test:department :department dept)\n      (query :$$view \"test:8-1\"\n        (test:employee :department dept :salary sal)\n        (sum :value sal :sum sum))\n      (project! :department dept :cost sum))\n    ");
        applyAsViews(artifacts);
        var results = app_1.eve.find("test:8");
        var costs = {};
        for (var _i = 0, _a = app_1.eve.find("test:employee"); _i < _a.length; _i++) {
            var employee = _a[_i];
            if (!costs[employee.department])
                costs[employee.department] = employee.salary;
            else
                costs[employee.department] += employee.salary;
        }
        var expected = [];
        for (var dept in costs)
            expected.push({ department: dept, cost: costs[dept] });
        applyIds(expected, ["department", "cost"]);
        chai_1.expect(idSort(results)).to.deep.equal(idSort(expected));
    });
    it("should project into a named union", function () {
        var artifacts = parser_1.parseDSL("\n      (query :$$view \"test:9-1\"\n        (test:department :head head)\n        (project! \"test:9\" :person head))\n      (query :$$view \"test:9-2\"\n        (test:employee :employee employee)\n        (project! \"test:9\" :person employee))\n    ");
        applyAsViews(artifacts);
        var results = app_1.eve.find("test:9");
        var expected = [];
        for (var _i = 0, _a = app_1.eve.find("test:department"); _i < _a.length; _i++) {
            var head = _a[_i].head;
            if (expected.indexOf(head) === -1)
                expected.push({ person: head });
        }
        for (var _b = 0, _c = app_1.eve.find("test:employee"); _b < _c.length; _b++) {
            var employee = _c[_b].employee;
            if (expected.indexOf(employee) === -1)
                expected.push({ person: employee });
        }
        applyIds(expected, ["person"]);
        chai_1.expect(idSort(results)).to.deep.equal(idSort(expected));
    });
    it("should map all fields from union members when they are unprojected");
    it("should map all fields from union members when they are explicitly self-projected");
    it("should group member queries by its parent query");
    it("should select its entire mapping into the parent query based on ...?");
});
//# sourceMappingURL=parser.js.map