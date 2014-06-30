var btree = aurora.btree;

var Aggregate = function (index, deltaIndex, groupLen, limitIx, isAscending, aggIxes, aggFuns) {
  this.index = index;
  this.deltaIndex = deltaIndex;
  this.groupLen = groupLen;
  this.limitIx = limitIx;
  this.isAscending = isAscending;
  this.aggIxes = aggIxes;
  this.aggFuns = aggFuns;
};

Aggregate.prototype.reset = function () {
  // TODO this is a temporary hack until we have scantrees

  // update input
  this.deltaIndex.foreach(function (key, val) {
    this.index.update(key, val);
  });
  this.deltaIndex.reset();
};

Aggregate.prototype.elems = function () {
  // TODO this is a temporary hack until we have scantrees

  // set up aggregation
  var currentKey;
  var currentLimit;
  var currentIndex;
  var inputs = [];
  var aggs = this.aggIxes.slice();
  var newOutput = btree.tree(10, this.groupLen + 1 + aggs.length);
  var pushInput = function (key) {
    if (currentKey === undefined) {
      currentKey = key;
      currentLimit = key[this.limitIx];
      currentIndex = 1;
    }
    if (btree.prefix_not_EQ_(key, currentKey, this.groupLen)) {
      for (var i = 0; i < aggs.length; i++) {
        aggs[i] = this.aggFuns[i](this.aggIxes[i], inputs);
      }
      for (var j = 0; j < inputs.length; j++) {
        var output = inputs[j];
        for (var k = 0; k < aggs.length; k++) {
          output.push(aggs[k]);
        }
        newOutput.update(output, 1);
      }
      inputs = [];
    }
  };

  // figure out new output
  if (this.isAscending) {
    this.index.foreach(pushInput);
  } else {
    this.index.foreach_reverse(pushInput);
  }
  pushInput(btree.greatest_key(this.groupLen));

  // diff against old output
  var oldOutput;
  if (this.index.output === undefined) {
    oldOutput = btree.tree(10, this.groupLen + 1 + aggs.length);
  } else {
    oldOutput = this.index.output;
  }
  var deltaOutput = btree.tree(10, this.groupLen + 1 + aggs.length);
  oldOutput.foreach(function (key, val) {
    deltaOutput.update(key, -val);
  });
  newOutput.foreach(function (key, val) {
    deltaOutput.update(key, val);
  });

  // save new output
  this.index.output = newOutput;

  return deltaOutput.elems;
};

var Flow = function (rule, sources, mixer, sinks) {
  this.rule = rule;
  this.sources = sources;
  this.mixer = mixer;
  this.sinks = sinks;
};

Flow.prototype.run = function () {
  for (var i = 0; i < this.sources.length; i++) {
    if (this.sources[i].index.empty_QMARK_()) {
      return; // bail out
    }
  }
  this.mixer.reset();
  var elems = this.mixer.elems();
  for (var j = 0; j < this.sinks.length; j++) {
    this.sinks[j].update(elems);
  }
};

var Transient = function (knowSink, deltaSink, deltaSource) {
  this.knowSink = knowSink;
  this.deltaSink = deltaSink;
  this.deltaSource = deltaSource;
};

Transient.prototype.run = function () {
  this.knowSink.update(this.deltaSource.index.elems());
  this.deltaSink.clear();
};

var Persistent = function (deltaSink, rememberSink, forgetSink, knowSource, rememberSource, forgetSource) {
  this.deltaSink = deltaSink;
  this.rememberSink = rememberSink;
  this.forgetSink = forgetSink;
  this.knowSource = knowSource;
  this.rememberSource = rememberSource;
  this.forgetSource = forgetSource;
};

Persistent.prototype.run = function () {
  var knowIter = btree.iterator(this.knowSource.index);
  var rememberIter = btree.iterator(this.rememberSource.index);
  var forgetIter = btree.iterator(this.forgetSource.index);
  var elems = [];
  this.rememberSource.index.foreach(function (key) {
    if (!knowIter.contains_QMARK_(key) && !forgetIter.contains_QMARK_(key)) {
      elems.push(key, 1);
    }
  });
  this.forgetSource.index.foreach(function (key) {
    if (knowIter.contains_QMARK_(key) && !rememberIter.contains_QMARK_(key)) {
      elems.push(key, -1);
    }
  });
  this.knowSink.update(elems);
};

var Logic = function (flows, transients, persistents) {
  this.flows = flows;
  this.transients = transients;
  this.persistents = persistents;
};

Logic.prototype.run = function () {
  for (var i = 0; i < this.flows.length; i++) {
    this.flows[i].run();
  }
};

Logic.prototype.tick = function () {
  for (var i = 0; i < this.transients.length; i++) {
    this.transients[i].run();
  }
  for (var j = 0; j < this.persistents.length; j++) {
    this.persistents[j].run();
  }
};
