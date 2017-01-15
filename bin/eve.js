#!/usr/bin/env node
"use strict";

var path = require("path");
var fs = require("fs");
var minimist = require("minimist");

var config = require("../build/src/config");
var Owner = config.Owner;
var Mode = config.Mode;
var server = require("../build/src/runtime/server");

const argv = minimist(process.argv.slice(2), {boolean: ["help", "version", "localControl", "server", "editor"]});

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
var runtimeOwner = argv["server"] ? Owner.server : Owner.client;
var controlOwner = argv["localControl"] ? Owner.client : Owner.server;
var editor = argv["editor"] || false;
var filepath = argv["_"][0];
var internal = false;

var root = findRoot(process.cwd());
var eveRoot = findRoot(__dirname);

if(argv["help"]) {
  let pkg = require(path.join(eveRoot, "package.json"));
  console.log(`
    Eve ${pkg.version}

    Usage: eve [flags] [file]

    --help          Display this message.
    --version       Display installed version and exit.
    --server        Execute code on the server rather than the client.
    --editor        Display the editor (default if no file is specified).
    --port <number> Change the port the Eve server listens to (default 8080).
    --localControl  Entirely disable server interaction. File changes will be
                    stored in localStorage.

    If the Eve binary is run in a project directory (a directory containing a
    package.json file), it will use that directory as your workspace. Otherwise
    Eve will use the built-in examples workspace.

    If a file is provided, Eve will run it in application-only mode unless the
    --editor flag is supplied.

    Please refer questions and comments to the mailing list:
    https://groups.google.com/forum/#!forum/eve-talk

    Please report bugs via GH issues:
    https://github.com/witheve/eve/issues
`);
  process.exit(0);
}
if(argv["version"]) {
  let pkg = require(path.join(eveRoot, "package.json"));
  console.log(pkg.version);
  process.exit(0);
}


// If we're executing within the eve module/repo, we're running internally and should expose our examples, src, etc.
// This should be handled down the road by some sort of a manifest in conjunction with the `root` rather than hardcoding.
if(root === eveRoot) internal = true;
else if(!root) {
  internal = true;
  // We shouldn't (and when globally installed, *can't*) taint the internal examples when running as an installed binary.
  // @TODO: In the future we should have a more flexible solution that can copy out the examples into your current workspace when edited.
  controlOwner = Owner.client;
}


// If we're not given an explicit filepath to run, assume the user wanted the editor (rather than a blank page).
// Similarly, if we're running internally, send the user over to the quickstart, since they're likely testing the waters.
if(!filepath) {
  editor = true;
  if(internal) filepath = eveRoot + "/" + "examples/quickstart.eve";
} else {
  filepath = path.resolve(filepath);
  if(process.platform.indexOf("win") === 0) {
    filepath = filepath.replace(/\\/g, "/");
  }
}

let mode = Mode.workspace;
if(filepath && !editor) mode = Mode.file

var opts = {internal: internal, runtimeOwner: runtimeOwner, controlOwner: controlOwner, editor: editor, port: port, path: filepath, internal: internal, root: root, eveRoot: eveRoot, mode};
config.init(opts);

server.run(opts);
