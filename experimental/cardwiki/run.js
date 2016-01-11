var browserify = require("browserify");
var blessed = require("blessed");
var commander = require("commander");
var fs = require("fs");
var tsify = require("tsify");
var watchify = require("watchify");

function makeBundler(name, opts) {
  opts.cache === undefined ? opts.cache = {} : undefined;
  opts.packageCache === undefined ? opts.packageCache = {} : undefined;
  opts.debug === undefined ? opts.debug = true : undefined;
  opts.plugin === undefined ? opts.plugin = [] : undefined;
  opts.require === undefined ? opts.require = [] : undefined;
  opts.plugin.push(tsify);

  

  var state = {};
  var bundler = browserify(opts)
      .on("reset", function() { state = {}; })
  bundler.run = function bundle() {
    bundler.bundle()
      .on("error", function(err) {
	state.errors = state.errors || [];
	state.errors.push(err);
	console.log("err", err);
	this.emit("end");
      })
      .on("end", function() {
	console.log("rerender", state);
      })
      .pipe(fs.createWriteStream("bin/" + name + ".bundle.js"));
      
  }
  if(opts.verbose) bundler.on("log", function(msg) { console.log("[" + name + "]", msg); });
  if(opts.watch) {
    console.log("watching");
    bundler.plugin(watchify);
    bundler.on("update", bundler.run);
  }
  if(opts.adds) {
    for(var addIx = 0; addIx < opts.adds.length; addIx++) bundler.add(opts.adds[addIx]);
  }

  bundler.name = name;
  return bundler;
}

var pkgs = {
  wiki: {entries: ["src/wiki.ts"], adds: ["typings/tsd.d.ts"]},
  slides: {entries: ["src/slides.ts"], adds: ["typings/tsd.d.ts"]},
  queryParserTest: {entries: ["test/queryParserTest.ts"], adds: ["typings/tsd.d.ts"]},
  runtimeTest: {entries: ["test/runtimeTest.ts"], adds: ["typings/tsd.d.ts"]},
  richTextEditorTest: {entries: ["test/richTextEditor.ts"], adds: ["typings/tsd.d.ts"]}
};



for(var pkgName in pkgs) {
  pkgs[pkgName].watch = true;
  pkgs[pkgName].verbose = true;
  var bundler = makeBundler(pkgName, pkgs[pkgName])
  bundler.run();
}

