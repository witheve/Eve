export let workspaces:{[name:string]: string} = {};

//---------------------------------------------------------
// Public
//---------------------------------------------------------

export function add(name: string, directory: string) {
  // If we're running on a windows server, normalize slashes
  if(typeof window === undefined) {
    if(process.platform.search(/^win/)) {
      directory = directory.replace("\\", "/");
    }
  }

  if(directory[directory.length - 1] !== "/") directory += "/";

  if(workspaces[name] && workspaces[name] !== directory)
    throw new Error(`Unable to link pre-existing workspace '$[name}' to '${directory}' (currently '${workspaces[name]}')`);

  workspaces[name] = directory;
}

/** Given an explicit workspace, return the contents of the file. */
export function get(file:string, workspace = "eve"):string|undefined {
  if(!workspaces[workspace]) {
    console.error(`Unable to get '${file}' from unregistered workspace '${workspace}'`);
    return;
  }

  return fetchFile(file, workspace);
}

/** Using the inferred workspace from the file path, return the contents of the file. */
export function find(file:string):string|undefined {
  let workspace = getWorkspaceFromPath(file);
  if(!workspace) return;

  return get(file, workspace);
}

/** Given an explicit workspace, update the contents of the file. */
export function set(file:string, content:string, workspace = "eve") {
  if(!workspaces[workspace]) {
    console.error(`Unable to set '${file}' from unregistered workspace '${workspace}'`);
    return;
  }

  saveFile(file, content, workspace);
}

/** Using the inferred workspace from the file path, update the contents of the file. */
export function save(file:string, content:string) {
  let workspace = getWorkspaceFromPath(file);
  if(!workspace) return;

  return set(file, content, workspace);
}

//---------------------------------------------------------
// Utilities
//---------------------------------------------------------


export function getWorkspaceFromPath(file:string):string|undefined {
  var parts = file.split("/");
  var basename = parts.pop();
  var workspace = parts[1];
  if(!basename || !workspace) return;
  if(!workspaces[workspace]) {
    console.error(`Unable to get '${file}' from unregistered workspace '${workspace}'`);
  }

  return workspace;
}

export function getRelativePath(file:string, workspace:string):string|undefined {
  let directory = workspaces[workspace];
  if(!directory) {
    console.error(`Unable to get relative path for '${file}' in unregistered workspace '${workspace}'`);
    return;
  }

  if(file.indexOf("./") === 0) {
    file = file.slice(2);
  }

  if(file.indexOf(directory) === 0) {
    file = file.slice(directory.length);
  }
  return "/" + workspace + "/" + file;
}

export function getAbsolutePath(file:string, workspace:string) {
  let directory = workspaces[workspace];
  if(file.indexOf(directory) === 0) return file;

  if(file.indexOf("/" + workspace + "/") === 0) file = file.slice(workspace.length + 2);
  return directory + file;
}

//---------------------------------------------------------
// Server/Client Implementations
//---------------------------------------------------------

var saveFile = function(file:string, content:string, workspace:string) {
  let cache = global["_workspaceCache"][workspace];
  cache = global["_workspaceCache"][workspace] = {};
  file = getRelativePath(file, workspace);
  cache[file] = content;
}

// If we're running on the client, we use the global _workspaceCache, created in the build phase or served by the server.
var fetchFile = function(file:string, workspace:string):string|undefined {
  let cache = global["_workspaceCache"][workspace];
  file = getRelativePath(file, workspace);
  return cache && cache[file];
}

var fetchWorkspace = function(workspace:string) {
  return global["_workspaceCache"][workspace];
}

// If we're running on the server, we use the actual file-system.
if(typeof window === "undefined") {
  let glob = require("glob");
  let fs = require("fs");
  let path = require("path");
  let mkdirp = require("mkdirp");

  saveFile = function(file:string, content:string, workspace:string) {
    try {
      let filepath = getAbsolutePath(file, workspace);
      let dirname = path.dirname(filepath);
      mkdirp.sync(dirname);
      fs.writeFileSync(filepath, content);
    } catch(err) {
      console.warn(`Unable to save file '${file}' in '${workspace}' containing:\n${content}`);
    }
  }

  fetchFile = function(file:string, workspace:string):string|undefined {
    try {
      let filepath = getAbsolutePath(file, workspace);
      return fs.readFileSync(filepath).toString();
    } catch(err) {
      console.warn(`Unable to find file '${file}' in '${workspace}'`);
    }
  }

  fetchWorkspace = function(workspace:string) {
    let directory = workspaces[workspace];
    let files = {};
    for(let file of glob.sync(directory + "/**/*.eve", {ignore: directory + "**/node_modules/**/*.eve"})) {
      let rel = path.relative(directory, file);
      files["/" + workspace + "/" + rel] = fs.readFileSync(file).toString();
    }

    return files;
  }
}

export function pack() {
  let packaged = {};
  for(let workspace in workspaces) {
    packaged[workspace] = fetchWorkspace(workspace);
  }

  return `var _workspaceCache = ${JSON.stringify(packaged, null, 2)};\n`;
}

// If we're running on the client, load the server's workspaces from the cache it passes us.
if(global["_workspaceCache"]) {
  for(let workspace in global["_workspaceCache"]) {
    add(workspace, workspace);
  }
}
