var browserify = require("browserify");
var blessed = require("blessed");
var fs = require("fs");
var livereload = require("livereload");
var program = require("commander");
var pkg = require("./package.json");
var tsify = require("tsify");
var watchify = require("watchify");
var util = require("util");
var exec = require("child_process").exec;
var spawn = require("child_process").spawn;

var state = {};

var pkgs = {
  wiki: {entries: ["src/wiki.ts"], adds: ["typings/tsd.d.ts"]},
  repl: {entries: ["src/repl.ts"], adds: ["typings/tsd.d.ts"]},
  editor: {entries: ["src/editor.ts"], adds: ["typings/tsd.d.ts"]},
  nlqpTest: {entries: ["test/NLQPTest.ts"], adds: ["typings/tsd.d.ts"]},
  runtimeTest: {entries: ["test/runtimeTest.ts"], adds: ["typings/tsd.d.ts"]},
};
var pkgList = Object.keys(pkgs);

//------------------------------------------------------------
// Bundling
//------------------------------------------------------------
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
	tagLog(name, err.message);
	render();
      })
      .pipe(fs.createWriteStream("bin/" + name + ".bundle.js"))
      .on("error", function(err) {
	state[name].errors.push(err);
	tagLog(name, err.message);
        render();
      })
      .on("close", function() {
	state[name].completed = true;
	state[name].endTime = Date.now();
	render();
      });
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
  try {
    fs.statSync("bin")
  } catch(e) {
    fs.mkdirSync("bin");
  }
  try {
    fs.statSync("bin/vendor");
  } catch(e) {
    fs.symlinkSync("../vendor", "bin/vendor");
  }
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
function formatTag(tag) {
  var fmt;
  if(tag === "livereload") fmt = "#784C97-fg";
  else if(tag in pkgs) fmt = "#0087DD-fg";

  if(!fmt) return tag;
  else return "{" + fmt + "}" + tag + "{/" + fmt + "}";
};
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
var errorRegex = /error/gi;
var warnRegex = /warn/gi;
var infoRegex = /info/gi;
function tagLog(tag) {
  var args = [].slice.call(arguments, 1);
  var msg = args.map(maybeInspect).join(" ");
  var state;
  if(msg.match(errorRegex)) state = "red-fg";
  else if(msg.match(warnRegex)) state = "orange-fg";
  else if(msg.match(infoRegex)) state = "gray-fg";
  var timestamp = (state ? "{" + state + "}" : "") + time() + (state ? "{/" + state + "}" : "");
  _logTarget.add(timestamp + " [{bold}" + formatTag(tag) + "{/bold}] " + msg);
}

function root(program, uiState) {
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
  screen.width = screen.cols = 20;

  var frame = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: program.width || screen.width,
    height: program.height || screen.height
  })

  var logBox = _logTarget = blessed.log({
    parent: frame,
    top: 0,
    left: 0,
    bottom: 0,
    width: "100%-26",
    scrollable: true,
    scrollbar: {ch: "#", inverse: true},
    keys: true,
    tags: true
  });

  var logo = blessed.box({
    parent: frame,
    tags: true,
    bottom: 0,
    right: 1,
    width: "shrink",
    height: "shrink",
    content:
      "          ,'`.         \n" +
      "       ,'      `.      \n" +
      "    ,'`.        | `.   \n" +
      " ,'      `.     |    `.\n" +
      "|`.     ,' |    |     |\n" +
      "|   `.'    |    |     |\n" +
      "|    |     |  ,'`.    |\n" +
      "|    |     |'      `. |\n" +
      " `.  |     `.        ;'\n" +
      "    `|,       `.  ,'   \n" +
      "       `.      ,'      \n" +
      "          `.,'         \n",
    style: {fg: "gray"}
  });

  var status = blessed.box({
    parent: frame,
    top: 0,
    right: 1,
    height: "shrink",
    width: "shrink",
    border: {type: "line"}
  });

  function statusLine(name, lineIx, parent, stateless) {
    var line = blessed.text({
      parent: parent,
      mouse: true,
      autoFocus: true,
      top: lineIx,
      left: 2,
      height: 1,
      padding: {left: 1, right: 1},
      content: name,
      style: {hover: {bold: true}, focus: {bold: true, fg: "blue"}},
    });

    if(stateless) return line;
    
    var light = blessed.box({
      parent: line,
      left: -2,
      height: 1,
      width: 2,
      content: "■",
      style: {}
    });
    light.on("prerender", function() {
      var state = uiState[name];
      this.style.fg = state && state.completed ? (state.errors.length ? "red" : "green") : "yellow";
    });

    return line;
  }

  var statusLines = {
    all: statusLine("all", 0, status, true),
    server: statusLine("server", 1, status)
  };
  for(var programIx = 0; programIx < program.bundles.length; programIx++) {
    var programName = program.bundles[programIx];
    statusLines[programName] = statusLine(programName, programIx + 2, status);
  }

  var spacer = blessed.box({
    parent: frame,
    top: program.bundles.length + 4,
    bottom: logo.content.split("\n").length,
    right: 0,
    width: 26,
    style: {}
  });

  return screen;
}

//------------------------------------------------------------
// Go!
//------------------------------------------------------------

var procs = [];

function asList(str) {
  return str.split(",");
}
function asNumber(str) {
  return +str;
}

program
  .version(pkg.version)
  .option("-b, --bundles [bundles...]", "Whitelist packages to bundle [" + pkgList.join(",") + "]", asList, pkgList)
  .option("-s, --server", "Start the server", false)
  .option("-w, --watch", "Watch bundles for changes", false)
  .option("-v, --verbose", "Log informational events", false)
  .option("--width <number>", "Set explicit screen width", asNumber)
  .parse(process.argv);
var screen = root(program, state);

function render() {
  var start = Date.now();
  screen.render();
  screen.program.flush();
}
render();


if(program.watch) {
  var server = livereload.createServer({exts: ["html", "js", "css"]});
  server.watch(["./*.html", "css/**/*.css", "bin/*.bundle.js", "vendor/**/*.js", "vendor/**/*.css"]);
  if(program.verbose) server.watcher.on("change", function(path) {
    tagLog("livereload", "Reloading " + path)
  })
}

// @FIXME: We need to watch the server and it's deps for changes.
if(program.server) {
  state.server = {errors: [], startTime: Date.now()};
  exec("node node_modules/tsify/node_modules/typescript/bin/tsc", function(err, out) {
    if (err) {
      tagLog("server", "Failed to compile server");
      tagLog("server", err.toString());
      tagLog("server", out);
      state.server.errors.push(err);
      state.server.completed = true;
      state.server.endTime = Date.now();
      render();
      return;
    } else {
      tagLog("server", "Compilation complete");
    }
    var server = spawn("node", ["bin/src/server.js"]);
    state.server.completed = true;
    state.server.endTime = Date.now();
    tagLog("server", "Server started at http://localhost:3000");
    server.stdout.on("data", function(data) {
      tagLog("server", data.toString());
    });
    server.stderr.on("data", function(data) {
      tagLog("server", data.toString());
    });
    procs.push(server);
    render();
  });
}

if(program.bundles) build(program.bundles);

var killProcs = function() {
  console.log("KILLING PROCS");
  procs.forEach(function(proc) {
    console.log("KILLED");
    proc.kill();
  });
}

process.on("uncaughtException", killProcs);
process.on("SIGINT", killProcs);
process.on("SIGTERM", killProcs);
process.on("exit", killProcs);
