SystemJS.config({
  baseURL: "node_modules/",
  map: {
    fs: "@empty",
    path: "@empty",
    glob: "@empty",
    mkdirp: "@empty"
  },
  packages: {
    "/build": {defaultExtension: "js"},
    "node-uuid": {main: "uuid.js"}
  }
});
