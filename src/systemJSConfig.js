SystemJS.config({
  baseURL: "/build/src",
  defaultJSExtensions: true,
  map: {fs: "@empty", path: "@empty", glob: "@empty", mkdirp: "@empty"},
  meta: {"/build/src/codemirror.js": { format: "cjs" }}
});

// Kicks off requiring everyone else
SystemJS.register("uuid", [], function($export) {
  $export("default", uuid);
  $export("v4", uuid);
});
SystemJS.registerDynamic("codemirror", [], false, function(require, exports, module) {
  module.exports = window.CodeMirror;
});
SystemJS.register("microReact", [], function($export) {
  $export("Renderer", Renderer);
});
SystemJS.register("commonmark", [], function($export) {
  $export(commonmark);
});
