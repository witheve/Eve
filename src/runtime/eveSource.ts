export let workspaces:{[name:string]: string} = {};

export function add(name: string, directory: string) {
  if(workspaces[name] && workspaces[name] !== directory)
    throw new Error(`Unable to link pre-existing workspace '$[name}' to '${directory}' (currently '${workspaces[name]}')`);

  workspaces[name] = directory;
}

export function get(file:string, workspace = "eve"):string|undefined {
  if(!workspaces[workspace]) throw new Error(`Unable to get '${file}' from unregistered workspace '${workspace}'`);

  return fetchFile(file, workspace);
}

// If we're running on the client, we use the global _workspaceCache, created in the build phase or served by the server.
var fetchFile = function(file:string, workspace:string):string|undefined {
  let cache = global["_workspaceCache"][workspace];
  if(file.indexOf("/" + workspace) !== 0) file = "/" + workspace + "/" + file;
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

  var getAbsolutePath = function(file:string, workspace:string) {
    let directory = workspaces[workspace];
    if(file.indexOf("/" + workspace) === 0) file = file.slice(workspace.length + 1);
    return path.join(directory, file).replace("/", path.sep);
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
    for(let file of glob.sync(directory + "/**/*.eve")) {
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
