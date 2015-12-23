/// <reference path="../../typings/chai/chai.d.ts" />
/// <reference path="../../typings/mocha/mocha.d.ts" />
import {expect} from "chai";
import {copy} from "../../src/utils";
import {eve} from "../../src/app";
import {Query, Union} from "../../src/runtime";
import {Token, Sexpr, readSexprs, macroexpandDSL, parseDSL, applyAsDiffs, Artifacts} from "../../src/parser";

function assertSexprEqual(a:Sexpr, b:Sexpr) {
  expect(a).length(b.length);
  let argIx = 1;
  for(let arg of a.arguments) {
    let other = b.nth(argIx++);
    expect(arg).to.be.an.instanceOf(other.constructor);
    if(arg instanceof Token) {
      expect(arg).property("type").to.equal(other.type);
      expect(arg).property("value").to.equal(other.value);
    } else assertSexprEqual(<Sexpr>arg, <Sexpr>other);
  }
}

function applyAsViews(artifacts:Artifacts) {
  let views = artifacts.views;
  for(let viewId in views) eve.asView(views[viewId]);
}

function applyIds(facts:any[], fields:string[]):any[] {
  for(let fact of facts) {
    let parts = [];
    for(let field of fields) parts.push(fact[field]);
    fact.__id = parts.join("|");
  }
  return facts;
}

//-----------------------------------------------------------------------------
// Token
//-----------------------------------------------------------------------------
describe("Token", () => {
  // Shortcut initializers
  let values = ["foo", 7, true, ""];
  ["identifier", "keyword", "string", "literal"].map((kind) => {
    describe(`#${kind}()`, () => {
      it("should return a newly initialized token with the given value", () => {
        let tokens = [];
        for(let val of values) tokens.push(Token[kind](val));
        for(let ix = values.length - 1; ix >= 0; ix--)
          expect(tokens[ix]).to.be.an.instanceOf(Token).with.property("value", values[ix]);
      });
    });
  });

  describe("#toString()", () => {
    it("should coerce its value to a literal text representation", () => {
      expect(Token.identifier("foo").toString()).to.equal("foo");
      expect(Token.keyword("foo").toString()).to.equal(":foo");
      expect(Token.string("foo").toString()).to.equal(`"foo"`);
      expect(Token.literal(true).toString()).to.equal("true");
    });
  });
});

//-----------------------------------------------------------------------------
// Sexpr
//-----------------------------------------------------------------------------
describe("Sexpr", () => {
  // Shortcut initializers
  let values = [
    [Token.string("foo"), Token.literal(7), Token.literal(true)],
    [Token.identifier("sum"), Token.keyword("foo"), Token.string("test")],
    [Token.identifier("-"), Token.keyword("a"), Token.literal(7), Token.keyword("b"), Token.literal(3)],
    [Token.identifier("negate"), new Sexpr([Token.identifier("error"), Token.keyword("id"), Token.literal("id")])],
    [Token.keyword("foo"), Token.string("bar"), Token.keyword("baz"), Token.identifier("quux")],
    []
  ];
  ["list", "hash"].map((kind) => {
    describe(`#${kind}()`, () => {
      it("should return a newly initialized sexpr with the given operator and value", () => {
        let sexprs = [];
        for(let val of values) sexprs.push(Sexpr[kind](val));
        for(let ix = values.length - 1; ix >= 0; ix--) {
          expect(sexprs[ix]).to.be.an.instanceOf(Sexpr).with.property("operator").that.is.an.instanceOf(Token);
          expect(sexprs[ix].operator).to.have.property("type", Token.TYPE.IDENTIFIER);
          expect(sexprs[ix].operator).to.have.property("value", kind);
          expect(sexprs[ix]).to.have.property("arguments").which.deep.equal(values[ix]);
        }
      });
    });
  });

  describe("#push()", () => {
    it("should append a new token to an empty sexpr", () => {
      let sexpr = new Sexpr([]);
      let token = Token.literal(true);
      sexpr.push(token);
      expect(sexpr.value).to.have.length(1).and.property("0").that.equals(token);
    });
    it("should append a new token to an existing sexpr", () => {
      let sexpr = new Sexpr([Token.identifier("+"), Token.string("foo")]);
      let token = Token.literal(true);
      sexpr.push(token);
      expect(sexpr).to.have.property("arguments").with.length(2).and.property("1").that.equals(token);
    });
  });

  describe("#nth()", () => {
    let value = values[2];
    it("should return the nth token of the sexpr", () => {
      let sexpr = new Sexpr(value);
      let ix = 0;
      for(let v of value) expect(sexpr.nth(ix)).to.equal(value[ix++]);
    });

    it("should overwrite the nth token of a sexpr", () => {
      let sexpr = new Sexpr(value);
      let token = Token.identifier("quux");
      sexpr.nth(3, token);
      expect(sexpr.nth(3)).to.equal(token);
    });
  });

  describe("#toString()", () => {
    it("should coerce its value to a literal text representation", () => {
      expect(new Sexpr(values[2]).toString()).to.equal("(- :a 7 :b 3)");
      expect(new Sexpr(values[3]).toString()).to.equal("(negate (error :id id))");
      let sexpr = Sexpr.list(values[0]);
      sexpr.syntax = "list";
      expect(sexpr.toString()).to.equal(`["foo" 7 true]`);
      sexpr.arguments = values[3];
      expect(sexpr.toString()).to.equal(`[negate (error :id id)]`);
      sexpr = Sexpr.hash(values[4]);
      sexpr.syntax = "hash";
      expect(sexpr.toString()).to.equal(`{:foo "bar" :baz quux}`);
      sexpr.arguments = values[3];
      expect(sexpr.toString()).to.equal(`{negate (error :id id)}`);
    });
  });
});

//-----------------------------------------------------------------------------
// Reader
//-----------------------------------------------------------------------------
describe("readSexprs()", () => {
  let testCases:{macro?: boolean, input: string, output: Sexpr[]}[] = [
    {input: `(foo)`, output: [new Sexpr([Token.identifier("foo", 0, 1)], 0, 0)]},
    {
      input: `(foo "bar" :baz quux (quux))\n(fizz)`,
      output: [
        new Sexpr([
          Token.identifier("foo", 0, 1),
          Token.string("bar", 0, 5),
          Token.keyword("baz", 0, 11),
          Token.identifier("quux", 0, 16),
          new Sexpr([Token.identifier("quux", 0, 22)], 0, 21)
        ], 0, 0),
        new Sexpr([Token.identifier("fizz", 1, 1)], 1, 0)
      ]
    },
    {
      macro: true,
      input: `{:foo a :bar "b"}`,
      output: [Sexpr.hash([
        Token.keyword("foo", 0, 1),
        Token.identifier("a", 0, 6),
        Token.keyword("bar", 0, 8),
        Token.string("b", 0, 13)
      ], 0, 0, true)]
    },
    {
      macro: true,
      input: `(project! "foo" {:a 1})`,
      output: [new Sexpr([
        Token.identifier("project!", 0, 1),
        Token.string("foo", 0, 10),
        Sexpr.hash([
          Token.keyword("a", 0, 17),
          Token.literal(1, 0, 20)
        ], 0, 16, true)
      ], 0, 0)]
    },
    {
      macro: true,
      input: `[a "b" true]`,
      output: [Sexpr.list([
        Token.identifier("a", 0, 1),
        Token.string("b", 0, 3),
        Token.literal(true, 0, 7)
      ], 0, 0, true)]
    },
    {
      macro: true,
      input: `(sort! ["a" "b"])`,
      output: [new Sexpr([
        Token.identifier("sort!", 0, 1),
        Sexpr.list([
          Token.string("a", 0, 8),
          Token.string("b", 0, 12)
        ], 0, 7, true)
      ], 0, 0)]
    }
  ];

  it("should return an empty list on empty input", () => {
    expect(readSexprs("")).to.deep.equal(Sexpr.list());
  });
  it("should return a sexpr for each expr in the input", () => {
    for(let test of testCases) {
      if(test.macro) continue;
      expect(readSexprs(test.input)).to.have.length(test.output.length + 1);
    }
  });
  it("should return a correct sexpr for each expr in the input", () => {
    for(let test of testCases) {
      let sexprIx = 0;
      for(let sexpr of readSexprs(test.input).arguments) {
        if(test.macro) continue;
        expect(sexpr).to.deep.equal(test.output[sexprIx++]);
      }
    }
  });
  it("should fully expand syntax macro exprs", () => {
    for(let test of testCases) {
      let sexprIx = 0;
      for(let sexpr of readSexprs(test.input).arguments) {
        if(!test.macro) continue;
        expect(sexpr).to.deep.equal(test.output[sexprIx++]);
      }
    }
  });
});

//-----------------------------------------------------------------------------
// Macro Expansion
//-----------------------------------------------------------------------------
describe("macroexpandDSL()", () => {
  let testCases:{macro?: boolean, input: string, output: string}[] = [
    {input: `(select "foo" :bar baz)`, output: `(select "foo" :bar baz)`},
    {input: `(project! "widget" :wiggly "woo")`, output: `(project! "widget" :wiggly "woo")`},
    {input: `(union (re "mi" :fa))`, output: `(union (re "mi" :fa))`},

  ];
  it("should pass through terminal forms", () => {
    for(let test of testCases) {
      if(test.macro) continue;
      let input = readSexprs(test.input);
      let output = readSexprs(test.output);
      expect(input).length(output.length);
      let ix = 1;
      for(let sexpr of input.arguments) {
        let expanded = macroexpandDSL(<Sexpr>sexpr);
        expect(expanded).to.deep.equal(output.nth(ix++));
      }
    }
  });

  describe("select", () => {
    it(`should expand (foo ...) => (select "foo" ...")`, () => {
      let expanded = macroexpandDSL(<Sexpr>readSexprs(`(foo :a a)`).nth(1));
      let expected = <Sexpr>readSexprs(`(select "foo" :a a)`).nth(1);
      assertSexprEqual(expanded, expected);
    });
  });

  describe("negate", () => {
    it("should expand (negate (...)) => (... $$negated true)", () => {
      let expanded = macroexpandDSL(<Sexpr>readSexprs(`(negate (select "foo" :a a))`).nth(1));
      let expected = <Sexpr>readSexprs(`(select "foo" :a a :$$negated true)`).nth(1);
      assertSexprEqual(expanded, expected);
    });
    it("should recursively expand its child form", () => {
      let expanded = macroexpandDSL(<Sexpr>readSexprs(`(negate (foo :a a))`).nth(1));
      let expected = <Sexpr>readSexprs(`(select "foo" :a a :$$negated true)`).nth(1);
      assertSexprEqual(expanded, expected);
    })
  });

});

//-----------------------------------------------------------------------------
// DSL Parser
//-----------------------------------------------------------------------------
describe("parseDSL()", () => {
  eve.clearTable("test:employee");
  eve.clearTable("test:department");
  let changeset = eve.diff();
  changeset.addMany("test:department", [
    {department: "engineering", head: "chris"},
    {department: "distinction", head: "josh"},
    {department: "operations", head: "rob"},
    {department: "magic", head: "hermione"}
  ]);
  changeset.addMany("test:employee", [
    {"employee": "Hazel Bernier", "department": "engineering", "salary": 78.99},
    {"employee": "Candice Will", "department": "distinction", "salary": 233.73},
    {"employee": "Celine Hauck", "department": "operations", "salary": 973.00},
    {"employee": "Loyal Ullrich", "department": "engineering", "salary": 109.03},
    {"employee": "Gregorio Wolf", "department": "operations", "salary": 971.28},
    {"employee": "Adalberto Feil", "department": "distinction", "salary": 986.62},
    {"employee": "Ettie Bergstrom", "department": "engineering", "salary": 990.50},
    {"employee": "Adam Von", "department": "distinction", "salary": 874.19},
    {"employee": "Baby Hintz", "department": "engineering", "salary": 666.23},
    {"employee": "Anibal Fahey", "department": "distinction", "salary": 353.84}
  ]);

  eve.applyDiff(changeset);

  function idSort(facts:any[]) {
    return facts.slice().sort((a, b) => a.__id === b.__id ? 0 : (a.__id > b.__id ? 1 : -1));
  }

  it("should select all departments", () => {
    let artifacts = parseDSL(`(query :$$view "test:1" (test:department :department department :head head))`);
    let results = artifacts.views["test:1"].exec().results;
    expect(results).to.deep.equal(eve.find("test:department"));
  });

  it("should select all employees", () => {
    let artifacts = parseDSL(`(query :$$view "test:2" (test:employee :employee employee :department department :salary salary))`);
    let results = artifacts.views["test:2"].exec().results;
    expect(results).to.deep.equal(eve.find("test:employee"));
  });

  it("should project itself", () => {
    let artifacts = parseDSL(`(query :$$view "test:3"
      (test:employee :employee emp :department dept :salary sal)
      (project! :employee emp :department dept :salary sal))
    `);
    let results = artifacts.views["test:3"].exec().results;
    expect(results).to.deep.equal(eve.find("test:employee"));
  });

  it("should join selects sharing variables", () => {
    let artifacts = parseDSL(`(query :$$view "test:3"
      (test:department :department dept :head head)
      (test:employee :employee emp :department dept)
      (project! :employee emp :head head))
    `);
    let results = artifacts.views["test:3"].exec().results;

    let expected = [];
    for(let employee of eve.find("test:employee")) {
      let fact:any = {employee: employee.employee, head: eve.findOne("test:department", {department: employee.department}).head};
      fact.__id = fact.employee + "|" + fact.head;
      expected.push(fact);
    }
    expect(idSort(results)).to.deep.equal(idSort(expected));
  });

    it("should product selects not sharing variables", () => {
    let artifacts = parseDSL(`(query :$$view "test:4"
      (test:department :head head)
      (test:department :head other-guy)
      (project! :employee head :coworker other-guy))
    `);
    let results = artifacts.views["test:4"].exec().results;

    let departments = eve.find("test:department");
    let expected = [];
    for(let department of departments) {
      for(let department2 of departments) {
        let fact:any = {employee: department.head, coworker: department2.head, __id: department.head + "|" + department2.head};
        expected.push(fact);
      }
    }
    expect(idSort(results)).to.deep.equal(idSort(expected));
  });

  it("should calculate selects on primitives", () => {
     let artifacts = parseDSL(`(query :$$view "test:5"
      (test:employee :employee emp :salary sal)
      (+ :a sal :b 1 :result res)
      (project! :employee emp :sal-and-one res))
    `);
    let results = artifacts.views["test:5"].exec().results;

    let expected = [];
    for(let employee of eve.find("test:employee")) {
      let fact:any = {employee: employee.employee, "sal-and-one": employee.salary + 1};
      fact.__id = fact.employee + "|" + fact["sal-and-one"];
      expected.push(fact);
    }
    expect(idSort(results)).to.deep.equal(idSort(expected));
  });

  it("should aggregate selects on aggregation primitives", () => {
    let artifacts = parseDSL(`(query :$$view "test:6"
      (test:employee :employee emp :salary sal)
      (sum :value sal :sum res)
      (project! :total res))
    `);
    let results = artifacts.views["test:6"].exec().results;

    let total = 0;
    for(let employee of eve.find("test:employee")) total += employee.salary;
    let expected = [{total, __id: total}];
    expect(idSort(results)).to.deep.equal(idSort(expected));
  });

  it("should auto-select all projected vars from subqueries", () => {
    let artifacts = parseDSL(`(query :$$view "test:7"
      (test:department :department dept)
      (query :$$view "test:7-1"
        (test:employee :department dept :employee emp :salary sal))
      (project! :department dept :employee emp :salary sal))
    `);
    applyAsViews(artifacts);
    let results = eve.find("test:7");
    let expected = applyIds(eve.find("test:employee").map(copy), ["department", "employee", "salary"]);
    expect(idSort(results)).to.deep.equal(idSort(expected));
  });

  it("should group subqueries by their parent's context", () => {
    let artifacts = parseDSL(`(query :$$view "test:8"
      (test:department :department dept)
      (query :$$view "test:8-1"
        (test:employee :department dept :salary sal)
        (sum :value sal :sum sum))
      (project! :department dept :cost sum))
    `);
    applyAsViews(artifacts);
    let results = eve.find("test:8");
    let costs = {};
    for(let employee of eve.find("test:employee")) {
      if(!costs[employee.department]) costs[employee.department] = employee.salary;
      else costs[employee.department] += employee.salary;
    }
    let expected = [];
    for(let dept in costs) expected.push({department: dept, cost: costs[dept]});
    applyIds(expected, ["department", "cost"]);
    expect(idSort(results)).to.deep.equal(idSort(expected));
  });

  it("should project into a named union", () => {
    let artifacts = parseDSL(`
      (query :$$view "test:9-1"
        (test:department :head head)
        (project! "test:9" :person head))
      (query :$$view "test:9-2"
        (test:employee :employee employee)
        (project! "test:9" :person employee))
    `);
    applyAsViews(artifacts);
    let results = eve.find("test:9");

    let expected = [];
    for(let {head} of eve.find("test:department")) {
      if(expected.indexOf(head) === -1) expected.push({person: head});
    }
    for(let {employee} of eve.find("test:employee")) {
      if(expected.indexOf(employee) === -1) expected.push({person: employee});
    }
    applyIds(expected, ["person"]);
    expect(idSort(results)).to.deep.equal(idSort(expected));
  });

  it("should map all fields from union members when they are unprojected");
  it("should map all fields from union members when they are explicitly self-projected");
  it("should group member queries by its parent query");
  it("should select its entire mapping into the parent query based on ...?");
});
