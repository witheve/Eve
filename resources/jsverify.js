!function(e){if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.jsc=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
/* jshint node: true */
"use strict";

var random = _dereq_("./random.js");

function arbitraryArray(arbitrary, size) {
  var arrsize = random(0, size);
  var arr = new Array(arrsize);
  for (var i = 0; i < arrsize; i++) {
    arr[i] = arbitrary(size);
  }
  return arr;
}

function arbitraryString(size) {
  return arbitraryArray(function () {
    return String.fromCharCode(random(0, 0xff));
  }, size).join("");
}

function arbitraryObject(arbitrary, size) {
  var objsize = random(0, size);
  var obj = {};
  for (var i = 0; i < objsize; i++) {
    obj[arbitraryString(size)] = arbitrary(size);
  }
  return obj;
}

module.exports = {
  array: arbitraryArray,
  string: arbitraryString,
  object: arbitraryObject,
};

},{"./random.js":9}],2:[function(_dereq_,module,exports){
/* jshint node:true */
"use strict";

var shrink = _dereq_("./shrink.js");

/**
  ### Generator combinators
*/

/**
  #### suchthat (gen : generator a) (p : a -> bool) : generator {a | p a == true}

  Generator of values that satisfy `p` predicate. It's adviced that `p`'s accept rate is high.
*/
function suchthat(generator, predicate) {
  return {
    arbitrary: function (size) {
      for (var i = 0; ; i++) {
        // if 5 tries failed, increase size
        if (i > 5) {
          i = 0;
          size += 1;
        }

        var x = generator.arbitrary(size);
        if (predicate(x)) {
          return x;
        }
      }
    },

    shrink: function (x) {
      return generator.shrink(x).filter(predicate);
    },

    show: generator.show,
  };
}

/**
  #### nonshrink (gen : generator a) : generator a

  Non shrinkable version of generator `gen`.
*/
function nonshrink(generator) {
  return {
    arbitrary: generator.arbitrary,
    shrink: shrink.noop,
    show: generator.show,
  };
}

module.exports = {
  suchthat: suchthat,
  nonshrink: nonshrink,
};

},{"./shrink.js":11}],3:[function(_dereq_,module,exports){
/* jshint node:true */
"use strict";

var arbitrary = _dereq_("./arbitrary.js");
var shrink = _dereq_("./shrink.js");
var show = _dereq_("./show.js");
var primitive = _dereq_("./primitive.js");

/**
  #### array (gen : generator a) : generator (array a)
*/
function array(generator) {
  generator = generator || primitive.value();

  return {
    arbitrary: function (size) {
      return arbitrary.array(generator.arbitrary, size);
    },

    shrink: shrink.array.bind(null, generator.shrink),
    show: show.array.bind(null, generator.show),
  };
}

/**
  #### pair (a : generator A) (b : generator B) : generator (A * B)

  If not specified `a` and `b` are equal to `value()`.
*/
function pair(a, b) {
  a = a || primitive.value();
  b = b || primitive.value();

  return {
    arbitrary: function (size) {
      return [a.arbitrary(size), b.arbitrary(size)];
    },

    shrink: function (p) {
      return shrink.tuple([a.shrink, b.shrink], p);
    },

    show: show.def,
  };
}

module.exports = {
  pair: pair,
  array: array,
};

},{"./arbitrary.js":1,"./primitive.js":8,"./show.js":10,"./shrink.js":11}],4:[function(_dereq_,module,exports){
/* jshint node:true */
"use strict";

var utils = _dereq_("./utils.js");

/**
  #### FMap (eq : a -> a -> bool) : FMap a

  Finite map, with any object a key.

  Short summary of member functions:

  - FMap.insert (key : a) (value : any) : void
  - FMap.get (key : a) : any
  - FMap.contains (key : a) : obool
*/
function FMap(eq) {
  this.eq = eq || utils.isEqual;
  this.data = [];
}

FMap.prototype.contains = function FMap_contains(key) {
  for (var i = 0; i < this.data.length; i++) {
    if (this.eq(this.data[i][0], key)) {
      return true;
    }
  }

  return false;
};

FMap.prototype.insert = function FMap_insert(key, value) {
  for (var i = 0; i < this.data.length; i++) {
    if (this.eq(this.data[i][0], key)) {
      this.data[i] = [key, value];
      return;
    }
  }

  this.data.push([key, value]);
};

FMap.prototype.get = function FMap_get(key) {
  for (var i = 0; i < this.data.length; i++) {
    if (this.eq(this.data[i][0], key)) {
      return this.data[i][1];
    }
  }
};

module.exports = FMap;

},{"./utils.js":12}],5:[function(_dereq_,module,exports){
/* jshint node:true */
"use strict";

var shrink = _dereq_("./shrink.js");
var primitive = _dereq_("./primitive.js");
var FMap = _dereq_("./finitemap.js");

/**
  #### fn (gen : generator a) : generator (b -> a)

  Unary functions.

  _fun_ alias for _fn_
*/

function fn(gen) {
  gen = gen || primitive.value();

  return {
    arbitrary: function (size) {
      var m = new FMap();

      var f = function (arg) {
        if (!m.contains(arg)) {
          var value = gen.arbitrary(size);
          m.insert(arg, value);
        }

        return m.get(arg);
      };

      f.internalMap = m;
      return f;
    },

    shrink: shrink.noop,
    show: function (f) {
      return "[" + f.internalMap.data.map(function (item) {
        return "" + item[0] + ": " + gen.show(item[1]);
      }).join(", ") + "]";
    }
  };
}

module.exports = {
  fn: fn,
  fun: fn,
};

},{"./finitemap.js":4,"./primitive.js":8,"./shrink.js":11}],6:[function(_dereq_,module,exports){
/* jshint node:true */
"use strict";

/**
  #### isPromise p : bool

  Optimistic duck-type check for promises.
  Returns `true` if p is an object with `.then` function property.
*/
function isPromise(p) {
  return new Object(p) === p && typeof p.then === "function";
}

/**
  #### map (Functor f) => (p : f a) (g : a -> b) : f b

  This is functor map, known as `map` or `fmap`.
  Essentially `f(p)`. If `p` is promise, returns new promise.
  Using `map` makes code look very much [CPS-style](http://en.wikipedia.org/wiki/Continuation-passing_style).
*/
function map(p, g) {
  if (isPromise(p)) {
    return p.then(g);
  } else {
    return g(p);
  }
}

/**
  #### bind (Functor f) => (k : a -> f b) (xs : a) (h : b -> f c) -> f c

  This is almost monadic bind.
*/
function bind(f, xs, h) {
  var r;
  var exc;
  try {
    r = f.apply(undefined, xs);
  } catch (e) {
    r = false;
    exc = e;
  }

  if (isPromise(r)) {
    return r.then(
      h,
      function (e) { return h(false, exc); }
    );
  } else {
    return h(r, exc);
  }
}

module.exports = {
  isPromise: isPromise,
  map: map,
  bind: bind,
};

},{}],7:[function(_dereq_,module,exports){
/**
  # JSVerify

  > Property based checking.

  [![Build Status](https://secure.travis-ci.org/phadej/jsverify.svg?branch=master)](http://travis-ci.org/phadej/jsverify)
  [![NPM version](https://badge.fury.io/js/jsverify.svg)](http://badge.fury.io/js/jsverify)
  [![Dependency Status](https://gemnasium.com/phadej/jsverify.svg)](https://gemnasium.com/phadej/jsverify)
  [![Code Climate](https://img.shields.io/codeclimate/github/phadej/jsverify.svg)](https://codeclimate.com/github/phadej/jsverify)

  ## Getting Started

  Install the module with: `npm install jsverify`

  ## Synopsis

  ```js
  var jsc = require("jsverify");

  // forall (f : bool -> bool) (b : bool), f (f (f b)) = f(b).
  var bool_fn_applied_thrice =
    jsc.forall(jsc.fn(jsc.bool()), jsc.bool(), function (f, b) {
      return f(f(f(b))) === f(b);
    });

  jsc.assert(bool_fn_applied_thrice);
  // OK, passed 100 tests
  ```
*/
/* jshint node:true */
  "use strict";

/**
  ## Documentation

  ### Usage with [mocha](http://visionmedia.github.io/mocha/)

  Using jsverify with mocha is easy, just define the properties and use `jsverify.assert`.

  You can also provide `--jsverifyRngState state` command line argument, to run tests with particular random generator state.

  ```
  $ mocha examples/nat.js

  1) natural numbers are less than 90:
   Error: Failed after 49 tests and 1 shrinks. rngState: 074e9b5f037a8c21d6; Counterexample: 90;

  $ mocha examples/nat.js --grep 'are less than' --jsverifyRngState 074e9b5f037a8c21d6

  1) natural numbers are less than 90:
     Error: Failed after 1 tests and 1 shrinks. rngState: 074e9b5f037a8c21d6; Counterexample: 90;
  ```

  Errorneous case is found with first try.

  ### Usage with [jasmine](http://pivotal.github.io/jasmine/)

  Check [jasmineHelpers.js](helpers/jasmineHelpers.js) and [jasmineHelpers2.js](helpers/jasmineHelpers2.js) for jasmine 1.3 and 2.0 respectively.

  ## API

  > _Testing shows the presence, not the absence of bugs._
  >
  > Edsger W. Dijkstra

  To show that propositions hold, we need to construct proofs.
  There are two extremes: proof by example (unit tests) and formal (machine-checked) proof.
  Property-based testing is something in between.
  We formulate propositions, invariants or other properties we believe to hold, but
  only test it to hold for numerous (random generated) values.

  Types and function signatures are written in [Coq](http://coq.inria.fr/)/[Haskell](http://www.haskell.org/haskellwiki/Haskell) influented style:
  C# -style `List<T> filter(List<T> v, Func<T, bool> predicate)` is represented by
  `filter (v : array T) (predicate : T -> bool) : array T` in our style.

  `jsverify` can operate with both synchronous and asynchronous-promise properties.
  Generally every property can be wrapped inside [functor](http://learnyouahaskell.com/functors-applicative-functors-and-monoids),
  for now in either identity or promise functor, for synchronous and promise properties respectively.

  Some type definitions to keep developers sane:

  - Functor f => property (size : nat) : f result
  - result := true | { counterexample: any }
  - Functor f => property_rec := f (result | property)
  - generator a := { arbitrary : a, shrink : a -> [a] }
*/

var assert = _dereq_("assert");
var shrink = _dereq_("./shrink.js");
var random = _dereq_("./random.js");
var primitive = _dereq_("./primitive.js");
var composite = _dereq_("./composite.js");
var fn = _dereq_("./fn.js");
var combinator = _dereq_("./combinator.js");
var show = _dereq_("./show.js");
var FMap = _dereq_("./finitemap.js");
var utils = _dereq_("./utils.js");
var functor = _dereq_("./functor.js");

/**
  ### Properties
*/

function shrinkResult(gens, x, test, size, shrinks, exc, transform) {
  var shrinked = shrink.tuple(utils.pluck(gens, "shrink"), x);
  var shrinkP = shrinked.reduce(function (res, y) {
    return functor.map(res, function (resPrime) {
      if (resPrime !== true) {
        return resPrime;
      }

      return test(size, y, shrinks + 1);
    });
  }, true);

  return functor.map(shrinkP, function (shrinkPPrime) {
    if (shrinkPPrime === true) {
      var res = {
        counterexample: x,
        counterexamplestr: show.tuple(utils.pluck(gens, "show"), x),
        shrinks: shrinks,
        exc: exc,
      };
      return transform ? transform(res) : res;
    } else {
      return shrinkPPrime;
    }
  });
}

/**
  #### forall (gens : generator a ...) (prop : a -> property_rec) : property

  Property constructor
*/
function forall() {
  var gens = Array.prototype.slice.call(arguments, 0, -1);
  var property = arguments[arguments.length - 1];

  assert(typeof property === "function", "property should be a function");

  function test(size, x, shrinks) {
    assert(x !== undefined, "generator result should be always not undefined -- temporary self check");
    shrinks = shrinks || 0;

    return functor.bind(property, x, function(r, exc) {
      if (r === true) { return true; }
      if (typeof r === "function") {
        var r_rec = r(size);

        return functor.map(r_rec, function (r_recPrime) {
          if (r_recPrime === true) {
            return true;
          } else {
            return shrinkResult(gens, x, test, size, shrinks, exc, function (r) {
              return {
                counterexample: r.counterexample.concat(r_recPrime.counterexample),
                counterexamplestr: r.counterexamplestr ,//+ "; " + r_rec.counterexamplestr,
                shrinks: r.shrinks,
                exc: r.exc || r_recPrime.exc,
              };
            });
          }
        });
      }

      return shrinkResult(gens, x, test, size, shrinks, exc);
    });
  }

  return function (size) {
    var x = gens.map(function (gen) { return gen.arbitrary(size); });
    var r =  test(size, x);
    return r;
  };
}

function formatFailedCase(r) {
  var msg =  "Failed after " + r.tests + " tests and " + r.shrinks + " shrinks. ";
  msg += "rngState: " + r.rngState + "; ";
  msg += "Counterexample: " + r.counterexamplestr + "; ";
  if (r.exc) {
    msg += "Exception: " + (r.exc instanceof Error ? r.exc.message : r.exc);
  }
  return msg;
}

function findRngState(argv) {
  for (var i = 0; i < argv.length - 1; i++) {
    if (argv[i] === "--jsverifyRngState") {
      return argv[i + 1];
    }
  }
}

/**
  #### check (prop : property) (opts : checkoptions) : promise result + result

  Run random checks for given `prop`. If `prop` is promise based, result is also wrapped in promise.

  Options:
  - `opts.tests` - test count to run, default 100
  - `opts.size`  - maximum size of generated values, default 5
  - `opts.quiet` - do not `console.log`
  - `opts.rngState` - state string for the rng
*/
function check(property, opts) {
  opts = opts || {};
  opts.size = opts.size || 5;
  opts.tests = opts.tests || 100;
  opts.quiet = opts.quiet || false;

  assert(typeof property === "function", "property should be a function");

  var state;

  if (opts.rngState) {
    random.setStateString(opts.rngState);
  } else if (typeof process !== "undefined") {
    var argvState = findRngState(process.argv);
    if (argvState) {
      random.setStateString(argvState);
    }
  }

  function loop(i) {
    state = random.currentStateString();
    if (i > opts.tests) {
      return true;
    }

    var size = random(0, opts.size);

    var r = property(size);
    return functor.map(r, function (rPrime) {
      if (rPrime === true) {
        return loop(i + 1);
      } else {
        rPrime.tests = i;
        /* global console */
        if (!opts.quiet) {
          console.error(formatFailedCase(rPrime), rPrime.counterexample);
        }
        return rPrime;
      }
    });
  }

  return functor.map(loop(1), function (r) {
    if (r === true) {
      if (!opts.quiet) { console.info("OK, passed " + opts.tests + " tests"); }
    } else {
      r.rngState = state;
    }

    return r;
  });
}

/**
  #### assert (prop : property) (opts : checkoptions) : void

  Same as `check`, but throw exception if property doesn't hold.
*/
function checkThrow(property, opts) {
  opts = opts || {};
  if (opts.quiet === undefined) {
    opts.quiet = true;
  }

  return functor.map(check(property, opts), function (r) {
    if (r !== true) {
      throw new Error(formatFailedCase(r));
    }
  });
}

/// include ./primitive.js
/// include ./composite.js
/// include ./fn.js
/// include ./combinator.js

/**
  ### jsc._ - miscellaneous utilities

  #### assert (exp : bool) (message : string) : void

  Throw an error with `message` if `exp` is falsy.
  Resembles [node.js assert](http://nodejs.org/api/assert.html).
*/
/// include ./utils.js
/// include ./random.js
/// include ./finitemap.js

// Export
var jsc = {
  forall: forall,
  check: check,
  assert: checkThrow,

  // generators
  nat: primitive.nat,
  integer: primitive.integer,
  number : primitive.number,
  bool: primitive.bool,
  string: primitive.string,
  value: primitive.value,
  oneof: primitive.oneof,
  pair: composite.pair,
  array: composite.array,
  fn: fn.fn,
  fun: fn.fn,
  suchthat: combinator.suchthat,
  nonshrink: combinator.nonshrink,

  // internal utility lib
  _: {
    assert: assert,
    isEqual: utils.isEqual,
    random: random,
    FMap: FMap,
  },
};

module.exports = jsc;

/// plain ../CONTRIBUTING.md
/// plain ../CHANGELOG.md
/// plain ../related-work.md
/// plain ../LICENSE

},{"./combinator.js":2,"./composite.js":3,"./finitemap.js":4,"./fn.js":5,"./functor.js":6,"./primitive.js":8,"./random.js":9,"./show.js":10,"./shrink.js":11,"./utils.js":12,"assert":13}],8:[function(_dereq_,module,exports){
/* jshint node:true */
"use strict";
var assert = _dereq_("assert");
var random = _dereq_("./random.js");
var arbitrary = _dereq_("./arbitrary.js");
var shrink = _dereq_("./shrink.js");
var show = _dereq_("./show.js");

/**
  ### Primitive generators
*/

/**
  #### integer (maxsize : nat) : generator integer

  Integers, ℤ
*/
function integer(maxsize) {
  maxsize = maxsize || 1000;

  return {
    arbitrary: function (size) {
      size = Math.min(maxsize, size);

      return random(-size, size);
    },
    shrink: function (i) {
      i = Math.abs(i);
      if (i === 0) {
        return [];
      } else {
        // TODO: redo
        return [0, -i+1, i-1];
      }
    },

    show: show.def,
  };
}

/**
  #### nat (maxsize : nat) : generator nat

  Natural numbers, ℕ (0, 1, 2...)
*/
function nat(maxsize) {
  maxsize = maxsize || 1000;

  return {
    arbitrary: function (size) {
      size = Math.min(maxsize, size);
      return random(0, size);
    },
    shrink: function (i) {
      var arr = [];
      for (var j = 0; j < i; j++) {
        arr.push(j);
      }
      return arr;
    },
    show: show.def,
  };
}

/**
  #### number (maxsize : number) : generator number

  JavaScript numbers, "doubles", ℝ. `NaN` and `Infinity` are not included.
*/
function number(maxsize) {
  maxsize = maxsize || 1000;

  return {
    arbitrary: function (size) {
      size = Math.min(maxsize, size);

      return random.number(-size, size);
    },
    shrink: shrink.noop,
    show: show.def,
  };
}

/**
  #### bool () : generator bool

  Booleans, `true` or `false`.
*/
function bool() {
  return {
    arbitrary: function (size) {
      var i = random(0, 1);
      return i === 0 ? false : true;
    },

    shrink: function (b) {
      return b === true ? [false] : [];
    },
    show: show.def,
  };
}

/**
  #### oneof (args : array any) : generator any

  Random element of `args` array.
*/
function oneof(args) {
  assert(args.length !== 0, "oneof: at least one parameter expected");

  return {
    arbitrary: function (size) {
      var i = random(0, args.length-1);
      return args[i];
    },

    // TODO: make shrink
    shrink: shrink.noop,
    show: show.def,
  };
}

/**
  #### string () : generator string

  Strings
*/
function string() {
  return {
    arbitrary: arbitrary.string,
    shrink: shrink.noop, // TODO:
    show: show.def,
  };
}

/**
  #### value : generator value

  JavaScript value: boolean, number, string, array of values or object with `value` values.
*/
function value() {
  function arbitraryValue(size) {
    var type = random(0, 5);
    if (size === 0) {
      switch (type) {
        case 0: return 0;
        case 1: return random.number(0, 1);
        case 2: return random(0, 1) === 0;
        case 3: return "";
        case 4: return [];
        case 5: return {};
      }
    }

    size = size - 1;

    switch (type) {
      case 0: return random(-size, size);
      case 1: return random.number(-size, size);
      case 2: return random(0, 1) === 0;
      case 3: return arbitrary.string(size);
      case 4: return arbitrary.array(arbitraryValue, size);
      case 5: return arbitrary.object(arbitraryValue, size);
    }
  }

  return {
    arbitrary: arbitraryValue,
    shrink: shrink.noop,
    show: function (v) {
      return JSON.stringify(v);
    }
  };
}

module.exports = {
  integer: integer,
  nat: nat,
  number: number,
  value: value,
  string: string,
  oneof: oneof,
  bool: bool,
};

},{"./arbitrary.js":1,"./random.js":9,"./show.js":10,"./shrink.js":11,"assert":13}],9:[function(_dereq_,module,exports){
/* jshint node: true */
"use strict";

var generator = new (_dereq_("rc4").RC4small)();

/**
  #### random (min max : int) : int

  Returns random int from `[min, max]` range inclusively.

  ```js
  getRandomInt(2, 3) // either 2 or 3
  ```
*/
function randomInteger(min, max) {
  return generator.random(min, max);
}

/**
  #### random.number (min max : number) : number

  Returns random number from `[min, max)` range.
*/
function randomNumber(min, max) {
  return generator.randomFloat() * (max - min) + min;
}

randomInteger.integer = randomInteger;
randomInteger.number = randomNumber;

randomInteger.currentStateString = generator.currentStateString.bind(generator);
randomInteger.setStateString = generator.setStateString.bind(generator);

module.exports = randomInteger;

},{"rc4":17}],10:[function(_dereq_,module,exports){
/* jshint node: true */
"use strict";

function showDef(obj) {
  return "" + obj;
}

function showTuple(shows, objs) {
  var strs = [];
  for (var i = 0; i < shows.length; i++) {
    strs.push(shows[i](objs[i]));
  }
  return strs.join("; ");
}

function showArray(show, arr) {
  return "[" + arr.map(show).join(", ") + "]";
}

module.exports = {
  def: showDef,
  tuple: showTuple,
  array: showArray,
};

},{}],11:[function(_dereq_,module,exports){
"use strict";
/* jshint node:true */

var assert = _dereq_("assert");

function shrinkNoop() {
  return [];
}

function shrinkTuple(shrinks, tup) {
  assert(shrinks.length === tup.length, "there should be as much shrinks as values in the tuple");

  var shrinked = new Array(tup.length);

  for (var i = 0; i < tup.length; i++) {
    /* jshint -W083 */
    shrinked[i] = shrinks[i](tup[i]).map(function (x) {
      var c = tup.slice(); // clone array
      c[i] = x;
      return c;
    });
    /* jshint +W083 */
  }

  return Array.prototype.concat.apply([], shrinked);
}

function shrinkArray(shrink, arr) {
  if (arr.length === 0) {
    return [];
  } else {
    var x = arr[0];
    var xs = arr.slice(1);

    return [xs].concat(
      shrink(x).map(function (xp) { return [xp].concat(xs); }),
      shrinkArray(shrink, xs).map(function (xsp) { return [x].concat(xsp); })
    );
  }
}

module.exports = {
  noop: shrinkNoop,
  tuple: shrinkTuple,
  array: shrinkArray,
};

},{"assert":13}],12:[function(_dereq_,module,exports){
/* jshint node:true */
"use strict";

var isArray = Array.isArray;
function isObject(o) {
  return new Object(o) === o;
}


/**
  #### isEqual (a b : value) : bool

  Equality test for `value` objects. See `value` generator.
*/
function isEqual(a, b) {
  var i;

  if (a === b) {
    return true;
  } else if (isArray(a) && isArray(b) && a.length === b.length) {
    for (i = 0; i < a.length; i++) {
      if (!isEqual(a[i], b[i])) {
        return false;
      }
    }
    return true;
  } else if (isObject(a) && isObject(b) && !isArray(a) && !isArray(b)) {
    var akeys = Object.keys(a);
    var bkeys = Object.keys(b);
    if (!isEqual(akeys, bkeys)) {
      return false;
    }

    for (i = 0; i < akeys.length; i++) {
      if (!isEqual(a[akeys[i]], b[akeys[i]])) {
        return false;
      }
    }
    return true;
  }

  return false;
}

function pluck(arr, key) {
  return arr.map(function (e) {
    return e[key];
  });
}

module.exports = {
  isArray: isArray,
  isObject: isObject,
  isEqual: isEqual,
  pluck: pluck,
};

},{}],13:[function(_dereq_,module,exports){
// http://wiki.commonjs.org/wiki/Unit_Testing/1.0
//
// THIS IS NOT TESTED NOR LIKELY TO WORK OUTSIDE V8!
//
// Originally from narwhal.js (http://narwhaljs.org)
// Copyright (c) 2009 Thomas Robinson <280north.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the 'Software'), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
// ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

// when used in node, this will actually load the util module we depend on
// versus loading the builtin util module as happens otherwise
// this is a bug in node module loading as far as I am concerned
var util = _dereq_('util/');

var pSlice = Array.prototype.slice;
var hasOwn = Object.prototype.hasOwnProperty;

// 1. The assert module provides functions that throw
// AssertionError's when particular conditions are not met. The
// assert module must conform to the following interface.

var assert = module.exports = ok;

// 2. The AssertionError is defined in assert.
// new assert.AssertionError({ message: message,
//                             actual: actual,
//                             expected: expected })

assert.AssertionError = function AssertionError(options) {
  this.name = 'AssertionError';
  this.actual = options.actual;
  this.expected = options.expected;
  this.operator = options.operator;
  if (options.message) {
    this.message = options.message;
    this.generatedMessage = false;
  } else {
    this.message = getMessage(this);
    this.generatedMessage = true;
  }
  var stackStartFunction = options.stackStartFunction || fail;

  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, stackStartFunction);
  }
  else {
    // non v8 browsers so we can have a stacktrace
    var err = new Error();
    if (err.stack) {
      var out = err.stack;

      // try to strip useless frames
      var fn_name = stackStartFunction.name;
      var idx = out.indexOf('\n' + fn_name);
      if (idx >= 0) {
        // once we have located the function frame
        // we need to strip out everything before it (and its line)
        var next_line = out.indexOf('\n', idx + 1);
        out = out.substring(next_line + 1);
      }

      this.stack = out;
    }
  }
};

// assert.AssertionError instanceof Error
util.inherits(assert.AssertionError, Error);

function replacer(key, value) {
  if (util.isUndefined(value)) {
    return '' + value;
  }
  if (util.isNumber(value) && (isNaN(value) || !isFinite(value))) {
    return value.toString();
  }
  if (util.isFunction(value) || util.isRegExp(value)) {
    return value.toString();
  }
  return value;
}

function truncate(s, n) {
  if (util.isString(s)) {
    return s.length < n ? s : s.slice(0, n);
  } else {
    return s;
  }
}

function getMessage(self) {
  return truncate(JSON.stringify(self.actual, replacer), 128) + ' ' +
         self.operator + ' ' +
         truncate(JSON.stringify(self.expected, replacer), 128);
}

// At present only the three keys mentioned above are used and
// understood by the spec. Implementations or sub modules can pass
// other keys to the AssertionError's constructor - they will be
// ignored.

// 3. All of the following functions must throw an AssertionError
// when a corresponding condition is not met, with a message that
// may be undefined if not provided.  All assertion methods provide
// both the actual and expected values to the assertion error for
// display purposes.

function fail(actual, expected, message, operator, stackStartFunction) {
  throw new assert.AssertionError({
    message: message,
    actual: actual,
    expected: expected,
    operator: operator,
    stackStartFunction: stackStartFunction
  });
}

// EXTENSION! allows for well behaved errors defined elsewhere.
assert.fail = fail;

// 4. Pure assertion tests whether a value is truthy, as determined
// by !!guard.
// assert.ok(guard, message_opt);
// This statement is equivalent to assert.equal(true, !!guard,
// message_opt);. To test strictly for the value true, use
// assert.strictEqual(true, guard, message_opt);.

function ok(value, message) {
  if (!value) fail(value, true, message, '==', assert.ok);
}
assert.ok = ok;

// 5. The equality assertion tests shallow, coercive equality with
// ==.
// assert.equal(actual, expected, message_opt);

assert.equal = function equal(actual, expected, message) {
  if (actual != expected) fail(actual, expected, message, '==', assert.equal);
};

// 6. The non-equality assertion tests for whether two objects are not equal
// with != assert.notEqual(actual, expected, message_opt);

assert.notEqual = function notEqual(actual, expected, message) {
  if (actual == expected) {
    fail(actual, expected, message, '!=', assert.notEqual);
  }
};

// 7. The equivalence assertion tests a deep equality relation.
// assert.deepEqual(actual, expected, message_opt);

assert.deepEqual = function deepEqual(actual, expected, message) {
  if (!_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'deepEqual', assert.deepEqual);
  }
};

function _deepEqual(actual, expected) {
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;

  } else if (util.isBuffer(actual) && util.isBuffer(expected)) {
    if (actual.length != expected.length) return false;

    for (var i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) return false;
    }

    return true;

  // 7.2. If the expected value is a Date object, the actual value is
  // equivalent if it is also a Date object that refers to the same time.
  } else if (util.isDate(actual) && util.isDate(expected)) {
    return actual.getTime() === expected.getTime();

  // 7.3 If the expected value is a RegExp object, the actual value is
  // equivalent if it is also a RegExp object with the same source and
  // properties (`global`, `multiline`, `lastIndex`, `ignoreCase`).
  } else if (util.isRegExp(actual) && util.isRegExp(expected)) {
    return actual.source === expected.source &&
           actual.global === expected.global &&
           actual.multiline === expected.multiline &&
           actual.lastIndex === expected.lastIndex &&
           actual.ignoreCase === expected.ignoreCase;

  // 7.4. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if (!util.isObject(actual) && !util.isObject(expected)) {
    return actual == expected;

  // 7.5 For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else {
    return objEquiv(actual, expected);
  }
}

function isArguments(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

function objEquiv(a, b) {
  if (util.isNullOrUndefined(a) || util.isNullOrUndefined(b))
    return false;
  // an identical 'prototype' property.
  if (a.prototype !== b.prototype) return false;
  //~~~I've managed to break Object.keys through screwy arguments passing.
  //   Converting to array solves the problem.
  if (isArguments(a)) {
    if (!isArguments(b)) {
      return false;
    }
    a = pSlice.call(a);
    b = pSlice.call(b);
    return _deepEqual(a, b);
  }
  try {
    var ka = objectKeys(a),
        kb = objectKeys(b),
        key, i;
  } catch (e) {//happens when one is a string literal and the other isn't
    return false;
  }
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length != kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] != kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!_deepEqual(a[key], b[key])) return false;
  }
  return true;
}

// 8. The non-equivalence assertion tests for any deep inequality.
// assert.notDeepEqual(actual, expected, message_opt);

assert.notDeepEqual = function notDeepEqual(actual, expected, message) {
  if (_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'notDeepEqual', assert.notDeepEqual);
  }
};

// 9. The strict equality assertion tests strict equality, as determined by ===.
// assert.strictEqual(actual, expected, message_opt);

assert.strictEqual = function strictEqual(actual, expected, message) {
  if (actual !== expected) {
    fail(actual, expected, message, '===', assert.strictEqual);
  }
};

// 10. The strict non-equality assertion tests for strict inequality, as
// determined by !==.  assert.notStrictEqual(actual, expected, message_opt);

assert.notStrictEqual = function notStrictEqual(actual, expected, message) {
  if (actual === expected) {
    fail(actual, expected, message, '!==', assert.notStrictEqual);
  }
};

function expectedException(actual, expected) {
  if (!actual || !expected) {
    return false;
  }

  if (Object.prototype.toString.call(expected) == '[object RegExp]') {
    return expected.test(actual);
  } else if (actual instanceof expected) {
    return true;
  } else if (expected.call({}, actual) === true) {
    return true;
  }

  return false;
}

function _throws(shouldThrow, block, expected, message) {
  var actual;

  if (util.isString(expected)) {
    message = expected;
    expected = null;
  }

  try {
    block();
  } catch (e) {
    actual = e;
  }

  message = (expected && expected.name ? ' (' + expected.name + ').' : '.') +
            (message ? ' ' + message : '.');

  if (shouldThrow && !actual) {
    fail(actual, expected, 'Missing expected exception' + message);
  }

  if (!shouldThrow && expectedException(actual, expected)) {
    fail(actual, expected, 'Got unwanted exception' + message);
  }

  if ((shouldThrow && actual && expected &&
      !expectedException(actual, expected)) || (!shouldThrow && actual)) {
    throw actual;
  }
}

// 11. Expected to throw an error:
// assert.throws(block, Error_opt, message_opt);

assert.throws = function(block, /*optional*/error, /*optional*/message) {
  _throws.apply(this, [true].concat(pSlice.call(arguments)));
};

// EXTENSION! This is annoying to write outside this module.
assert.doesNotThrow = function(block, /*optional*/message) {
  _throws.apply(this, [false].concat(pSlice.call(arguments)));
};

assert.ifError = function(err) { if (err) {throw err;}};

var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) {
    if (hasOwn.call(obj, key)) keys.push(key);
  }
  return keys;
};

},{"util/":15}],14:[function(_dereq_,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],15:[function(_dereq_,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = _dereq_('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = _dereq_('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

},{"./support/isBuffer":14,"inherits":16}],16:[function(_dereq_,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],17:[function(_dereq_,module,exports){
"use strict";

// Based on RC4 algorithm, as described in
// http://en.wikipedia.org/wiki/RC4

function createRC4(N) {
  function identityPermutation() {
    var s = new Array(N);
    for (var i = 0; i < N; i++) {
      s[i] = i;
    }
    return s;
  }

  // :: string | array integer -> array integer
  function seed(key) {
    if (key === undefined) {
      key = new Array(N);
      for (var k = 0; k < N; k++) {
        key[k] = Math.floor(Math.random() * N);
      }
    } else if (typeof key === "string") {
      // to string
      key = "" + key;
      key = key.split("").map(function (c) { return c.charCodeAt(0) % N; });
    } else if (Array.isArray(key)) {
      if (!key.every(function (v) {
        return typeof v === "number" && v === (v | 0);
      })) {
        throw new TypeError("invalid seed key specified: not array of integers");
      }
    } else {
      throw new TypeError("invalid seed key specified");
    }

    var keylen = key.length;

    // resed state
    var s = identityPermutation();

    var j = 0;
    for (var i = 0; i < N; i++) {
      j = (j + s[i] + key[i % keylen]) % N;
      var tmp = s[i];
      s[i] = s[j];
      s[j] = tmp;
    }

    return s;
  }

  function RC4(key) {
    this.s = seed(key);
    this.i = 0;
    this.j = 0;
  }

  RC4.prototype.randomNative = function () {
    this.i = (this.i + 1) % N;
    this.j = (this.j + this.s[this.i]) % N;

    var tmp = this.s[this.i];
    this.s[this.i] = this.s[this.j];
    this.s[this.j] = tmp;

    var k = this.s[(this.s[this.i] + this.s[this.j]) % N];

    return k;
  };

  RC4.prototype.randomUInt32 = function () {
    var a = this.randomByte();
    var b = this.randomByte();
    var c = this.randomByte();
    var d = this.randomByte();

    return ((a * 256 + b) * 256 + c) * 256 + d;
  };

  RC4.prototype.randomFloat = function () {
    return this.randomUInt32() / 0x100000000;
  };

  RC4.prototype.random = function() {
    var a, b;
    if (arguments.length === 1) {
      a = 0;
      b = arguments[0];
    } else if (arguments.length === 2) {
      a = arguments[0];
      b = arguments[1];
    } else {
      throw new TypeError("random takes one or two integer arguments");
    }

    if (a !== (a | 0) || b !== (b | 0)) {
      throw new TypeError("random takes one or two integer arguments");
    }

    return a + this.randomUInt32() % (b - a + 1);
  };

  RC4.prototype.currentState = function () {
    return {
      i: this.i,
      j: this.j,
      s: this.s.slice(), // copy
    };
  };

  RC4.prototype.setState = function(state) {
    var s = state.s;
    var i = state.i;
    var j = state.j;

    if (!(i === (i | 0) && 0 <= i && i < N)) {
      throw new Error("state.i should be integer [0, " + (N-1) + "]");
    }

    if (!(j === (j | 0) && 0 <= j && j < N)) {
      throw new Error("state.j should be integer [0, " + (N-1) + "]");
    }

    // check length
    if (!Array.isArray(s) || s.length !== N) {
      throw new Error("state should be array of length " + N);
    }

    // check that all params are there
    for (var k = 0; k < N; k++) {
      if (s.indexOf(k) === -1) {
        throw new Error("state should be permutation of 0.." + (N-1) + ": " + k + " is missing");
      }
    }

    this.i = i;
    this.j = j;
    this.s = s.slice(); // assign copy
  };

  return RC4;
}

var RC4 = createRC4(256);
RC4.prototype.randomByte = RC4.prototype.randomNative;

var RC4small = createRC4(16);
RC4small.prototype.randomByte = function () {
  var a = this.randomNative();
  var b = this.randomNative();

  return a * 16 + b;
};

var ordA = "a".charCodeAt(0);
var ord0 = "0".charCodeAt(0);

function toHex(n) {
  return n < 10 ? String.fromCharCode(ord0 + n) : String.fromCharCode(ordA + n - 10);
}

function fromHex(c) {
  return parseInt(c, 16);
}

RC4small.prototype.currentStateString = function () {
  var state = this.currentState();

  var i = toHex(state.i);
  var j = toHex(state.j);

  var res =  i + j + state.s.map(toHex).join("");
  return res;
};

RC4small.prototype.setStateString = function (stateString) {
  if (!stateString.match(/^[0-9a-f]{18}$/)) {
    throw new TypeError("RC4small stateString should be 18 hex character string");
  }

  var i = fromHex(stateString[0]);
  var j = fromHex(stateString[1]);
  var s = stateString.split("").slice(2).map(fromHex);

  this.setState({
    i: i,
    j: j,
    s: s,
  });
};

RC4.RC4small = RC4small;

module.exports = RC4;

},{}]},{},[7])
(7)
});