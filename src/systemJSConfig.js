if(typeof _watchers === "undefined") {
  console.warn("Please run `npm run build` in order to bundle the watchers for the browser.")
}

SystemJS.config({
  baseURL: "node_modules/",
  map: {
    fs: "@empty",
    path: "@empty",
    glob: "@empty",
    mkdirp: "@empty"
  },
  meta: {"/build/src/bootstrap.js": {deps: (typeof _watchers === "undefined") ? [] : _watchers}},
  packages: {
    "/build": {defaultExtension: "js"},
    "node-uuid": {main: "uuid.js"},
    "falafel": {main: "index.js"},
    "acorn": {main: "dist/acorn.js"},
    "isarray": {main: "index.js"},
    "object-keys": {main: "index.js"},
    "foreach": {main: "index.js"},
    "setimmediate": {main: "setImmediate.js"},
    "javascript-natural-sort": {main: "naturalSort.js"}
  }
});
