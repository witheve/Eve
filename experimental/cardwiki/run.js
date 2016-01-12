var browserify = require("browserify");
var blessed = require("blessed");
var fs = require("fs");
var program = require("commander");
var pkg = require("./package.json");
var tsify = require("tsify");
var watchify = require("watchify");
var util = require("util");

var pkgs = {
  wiki: {entries: ["src/wiki.ts"], adds: ["typings/tsd.d.ts"]},
  slides: {entries: ["src/slides.ts"], adds: ["typings/tsd.d.ts"]},
  queryParserTest: {entries: ["test/queryParserTest.ts"], adds: ["typings/tsd.d.ts"]},
  runtimeTest: {entries: ["test/runtimeTest.ts"], adds: ["typings/tsd.d.ts"]},
  richTextEditorTest: {entries: ["test/richTextEditor.ts"], adds: ["typings/tsd.d.ts"]}
};
var pkgList = Object.keys(pkgs);

//------------------------------------------------------------
// Bundling
//------------------------------------------------------------
var state = {};
function makeBundler(name, opts) {
  opts.cache === undefined ? opts.cache = {} : undefined;
  opts.packageCache === undefined ? opts.packageCache = {} : undefined;
  opts.debug === undefined ? opts.debug = true : undefined;
  opts.plugin === undefined ? opts.plugin = [] : undefined;
  opts.require === undefined ? opts.require = [] : undefined;
  opts.plugin.push(tsify);

  state[name] = {errors: []};
  var bundler = browserify(opts)
      .on("reset", function() {
	state[name] = {errors: []};
	render();
      });
  bundler.run = function bundle() {
    state[name].startTime = Date.now();
    bundler.bundle()
      .on("error", function(err) {
	state[name].errors.push(err);
	tagLog(name, err);
	this.emit("end");
      })
      .on("end", function() {
	state[name].completed = true;
	state[name].endTime = Date.now();
	render();
      })
      .pipe(fs.createWriteStream("bin/" + name + ".bundle.js"));
  };
  if(opts.verbose) {
    if(opts.watch) bundler.on("log", function(msg) { tagLog(name, msg); });
  }
    if(opts.watch) {
    bundler.plugin(watchify);
    bundler.on("update", bundler.run);
  }
  if(opts.adds) {
    for(var addIx = 0; addIx < opts.adds.length; addIx++) bundler.add(opts.adds[addIx]);
  }

  return bundler;
}


function build(bundles) {
  for(var bundleIx = 0; bundleIx < bundles.length; bundleIx++) {
    var bundleName = bundles[bundleIx];
    pkgs[bundleName].watch = program.watch;
    pkgs[bundleName].verbose = program.verbose;
    var bundler = makeBundler(bundleName, pkgs[bundleName])
    bundler.run();
  }
}

//------------------------------------------------------------
// UI
//------------------------------------------------------------
var _logTarget;
function pad(str, padding, length) {
  str = ""+str;
  if(str.length >= length) return str;
  var diff = length - str.length;
  return new Array(Math.ceil(diff / padding.length + 1)).join(padding) + str;
}
function time() {
  var d = new Date();
  return pad(d.getHours(), "0", 2) + ":" + pad(d.getMinutes(), "0", 2) + ":" + pad(d.getSeconds(), "0", 2);
}
function maybeInspect(obj) {
  return typeof obj === "string" ? obj : util.inspect(obj);
}
function log() {
  var args = [].slice.call(arguments);
  _logTarget.add(time() + " " + args.map(maybeInspect).join(" "));
}
function tagLog(tag) {
  var args = [].slice.call(arguments, 1);
  _logTarget.add(time() + " [" + tag + "] " + args.map(maybeInspect).join(" "));
}
  

function root(program, state) {
  var screen = blessed.screen({
    autoPadding: true,
    smartCSR: true,
    dockBorders: true,
    mouse: true,
    //debug: true
  });
  screen.key(["C-c", "q"], function(ch, key) {
    screen.destroy();
    process.exit(0);
  });
  screen.program.enableMouse();

  var logBox = _logTarget = blessed.log({
    parent: screen,
    top: 0,
    left: 0,
    bottom: 0,
    scrollable: true,
    scrollbar: {ch: "#", inverse: true},
    keys: true
  });
  
  var status = blessed.box({
    parent: screen,
    top: 0,
    right: 1,
    height: "shrink",
    width: "shrink",
    border: {type: "line"},
  });

  var statusLines = {
    all: blessed.text({
      parent: status,
      mouse: true,
      autoFocus: true,
      top: 0,
      left: 2,
      height: 1,
      padding: {left: 1, right: 1},
      content: "all",
      style: {hover: {}, focus: {bold: true}},
    })
  };
  var statusLights = {};
  program.bundles.map(function(bundleName, bundleIx) {
    statusLines[bundleName] = blessed.text({
      parent: status,
      mouse: true,
      autoFocus: true,
      top: bundleIx + 1,
      left: 2,
      height: 1,
      padding: {left: 1, right: 1},
      content: bundleName,
      style: {hover: {}, focus: {bold: true}},
    });
    statusLights[bundleName] = blessed.box({
      parent: statusLines[bundleName],
      left: -2,
      height: 1,
      width: 2,
      content: "■",
      style: {}
    });
    statusLights[bundleName].on("prerender", function() {
      this.style.fg = state[bundleName] && state[bundleName].completed ? (state[bundleName].errors.length ? "red" : "green") : "yellow";
    });
  });
  
  return screen;
}

//------------------------------------------------------------
// Go!
//------------------------------------------------------------
function asList(str) {
  return str.split(",");
}

program
  .version(pkg.version)
  .option("-b, --bundles [bundles...]", "Whitelist packages to bundle [" + pkgList.join(",") + "]", asList, pkgList)
  .option("-w, --watch", "Watch bundles for changes", false)
  .option("-v, --verbose", "Log informational events", false)
  .parse(process.argv);
var screen = root(program, state);

function render() {
  var start = Date.now();
  screen.render();
  screen.program.flush();
}
render();

//if(program.bundles) build(program.bundles);

