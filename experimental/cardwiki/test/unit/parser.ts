/// <reference path="../../typings/chai/chai.d.ts" />
/// <reference path="../../typings/mocha/mocha.d.ts" />
import {expect} from "chai";
import {Token, Sexpr, readSexprs, macroexpandDSL, parseDSL} from "../../src/parser";

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
// Macro expansion
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
    it("should splat into the child form", () => {
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

  describe("parseDSL()", () => {
    it("should", () => {

    });
  });
