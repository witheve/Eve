function isInteger(n) {
    return n === +n && n === (n|0);
}

// GENERATORS

function resize(size) {
  return size; // TODO
}

function rebias(bias) {
  return bias; // TODO
}

function Generator(grow, shrink) {
  this.grow = grow; // size -> Shrinkable
  this.shrink = shrink; // value, bias -> Shrinkable
}

var integer = new Generator(
  function numberGrow(size) {
    return Math.floor(size * ((Math.random() * 2) - 1));
  },
  function numberShrink(value, bias) {
    if (Math.random() < bias) {
      return 0;
    } else {
      return Math.floor(value * ((Math.random() * 2) - 1));
    }
  }
);

var number = new Generator(
  function numberGrow(size) {
    return size * ((Math.random() * 2) - 1);
  },
  function numberShrink(value, bias) {
    if (isInteger(value)) {
      return integer.shrink(value, bias);
    } else if (Math.random() < bias) {
      return Math.floor(value);
    } else {
      return value * ((Math.random() * 2) - 1);
    }
  });

function array(elem, length) {
  return new Generator(
    function arrayGrow(size) {
      var len = length || Math.random() * size;
      var value = [];
      for (var i = 0; i < len; i++) {
        value[i] = elem.grow(resize(size));
      }
      return value;
    },
    function arrayShrink(value, bias) {
      if ((value.length === 0) || ((length === undefined) && (Math.random() < bias))) {
        return [];
      } else {
        var newValue = value.slice();
        var i = Math.floor(Math.random() * newValue.length);
        if ((length === undefined) && (Math.random() < 0.5)) {
          newValue.splice(i, 1);
        } else {
          newValue[i] = elem.shrink(newValue[i], rebias(bias));
        }
        return newValue;
      }
    });
}

function tuple(elems) {
  return new Generator(
    function arrayGrow(size) {
      var len = elems.length;
      var value = [];
      for (var i = 0; i < len; i++) {
        value[i] = elems[i].grow(resize(size));
      }
      return value;
    },
    function arrayShrink(value, bias) {
      var newValue = value.slice();
      var i = Math.floor(Math.random() * newValue.length);
      newValue[i] = elems[i].shrink(newValue[i], rebias(bias));
      return newValue;
    });
}

// PROPERTIES

function Success(numTests, options, prop) {
  this.numTests = numTests;
  this.options = options;
  this.prop = prop;
}

var lastFailure;

function Failure(size, numTests, numShrinks, shrunkInput, shrunkOutput, input, output, options, prop) {
  lastFailure = this;
  this.size = size;
  this.numTests = numTests;
  this.numShrinks = numShrinks;
  this.shrunkInput = shrunkInput;
  this.shrunkOutput = shrunkOutput;
  this.inputs = input;
  this.output = output;
  this.options = options;
  this.prop = prop;
}

Failure.prototype = {
  recheck: function() {
    return this.prop.fun.apply(null, this.shrunkInput);
  }
};

function ForAll(gen, fun) {
  this.gen = gen;
  this.fun = fun;
}

function forall(gen, fun) {
  return new ForAll(gen, fun);
}

function foralls() {
  var gens = Array.prototype.slice.call(arguments);
  var fun = gens.pop();
  var gen = tuple(gens);
  return new ForAll(gen, fun);
}

ForAll.prototype = {
  check: function (options) {
    options = options || {};

    var numTests = 0;
    var maxTests = options.maxTests || 100;
    var maxSize = options.maxSize || maxTests;
    var input;
    var output;

    while (true) {
      var size = maxSize * (numTests / maxTests);
      input = this.gen.grow(size);
      try {
        output = this.fun.apply(null, input);
      } catch (exception) {
        output = exception;
      }
      if (output !== true) break;
      numTests += 1;
      if (numTests >= maxTests) return new Success(numTests, options, this);
    }

    var numShrinks = 0;
    var maxShrinks = options.maxShrinks || 100;
    var bias = options.bias || 0.25; // TODO grow/shrink bias
    var shrunkInput = input;
    var shrunkOutput;

    while (true) {
      var tryInput = this.gen.shrink(shrunkInput, bias);
      var tryOutput;
      try {
        tryOutput = this.fun.apply(null, tryInput);
      } catch (exception) {
        tryOutput = exception;
      }
      if (tryOutput !== true) {
        shrunkInput = tryInput;
        shrunkOutput = tryOutput;
      }
      numShrinks += 1;
      if (numShrinks >= maxShrinks) return new Failure(size, numTests, numShrinks, shrunkInput, shrunkOutput, input, output, options, this);
    }
  }
};

function recheck() {
  lastFailure.prop.recheck(lastFailure);
}

// TESTS

// foralls(number, number,
//        function (a, b) {
//          return (a + b) >= a;
//        }).check();

// console.time("Random tuple failure");
// foralls(array(tuple([number, number, number])),
//        function(_) {
//          return Math.random() < 0.999;
//        }).check({maxTests: 10000, maxShrinks: 20000, bias: 0});
// console.timeEnd("Random tuple failure");

// console.time("Random array failure");
// foralls(array(array(number)),
//        function(_) {
//          return Math.random() < 0.999;
//        }).check({maxTests: 10000, maxShrinks: 20000, bias: 0});
// console.timeEnd("Random array failure");

// console.time("Arrays are not strictly sorted");
// foralls(array(number, 9),
//        function(nums) {
//          for (var i = 0; i < nums.length - 1; i++) {
//            if (nums[i] >= nums[i+1]) return true;
//          }
//          return false;
//        }).check({maxTests: 10000000, maxShrinks: 20000000, bias: 0});
// console.timeEnd("Arrays are not strictly sorted");

// lastFailure.recheck();
