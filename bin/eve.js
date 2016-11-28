#!/usr/bin/env node

var path = require("path");
var fs = require("fs");
var minimist = require("minimist");

var config = require("../build/src/config");
var server = require("../build/src/runtime/server");

const argv = minimist(process.argv.slice(2), {boolean: ["server", "editor"]});

// Since our current development pattern uses npm as its package repository, we treat the nearest ancestor directory with a package.json (inclusive) as the directory's "root".
function findRoot(root) {
  var pkg;
  root = root.split(path.sep);
  while(!pkg && root.length > 1) {
    var cur = root.join(path.sep);
    if(fs.existsSync(path.join(cur, "package.json"))) {
      return cur;
    }
    root.pop();
  }
}


var port = argv["port"] || process.env.PORT || 8080;
var browser = !argv["server"];
var editor = argv["editor"] || false;
var filepath = argv["_"][0];
var internal = false;

var root = findRoot(process.cwd());
var eveRoot = findRoot(__dirname);


// If we're executing within the eve module/repo, we're running internally and should expose our examples, src, etc.
// This should be handled down the road by some sort of a manifest in conjunction with the `root` rather than hardcoding.
if(root === eveRoot) internal = true;


// If we're not given an explicit filepath to run, assume the user wanted the editor (rather than a blank page).
// Similarly, if we're running internally, send the user over to the quickstart, since they're likely testing the waters.
if(!filepath) {
  editor = true;
  if(internal) filepath = "examples/quickstart.eve";
} else {
  filepath = path.resolve(filepath);
}

var opts = {internal: internal, browser: browser, editor: editor, port: port, path: filepath, internal: internal, root: root, eveRoot: eveRoot};
config.init(opts);

server.run(opts);
