var batch = require("gulp-batch");
var browserify = require("browserify");
var buffer = require("vinyl-buffer");
var glob = require("glob-all");
var gulp = require("gulp-help")(require("gulp"));
var source = require("vinyl-source-stream");
var sourcemaps = require("gulp-sourcemaps");
var stylus = require("gulp-stylus");
var sweetify = require("sweetify");

// Styles

gulp.task("stylus", "Compile stylus files to CSS.", function() {
  return gulp.src("stylus/**/*.stylus")
  .pipe(sourcemaps.init())
  .pipe(stylus())
  .pipe(sourcemaps.write("."))
  .pipe(gulp.dest("stylus"));
});

gulp.task("watch-stylus", "Watch stylus files for changes.", ["stylus"], function() {
  gulp.watch("stylus/**/*.stylus", batch(function(events, done) {
    gulp.start("stylus", done);
  }));
});

// JS Bundles

var editorSources = ["src/editor/**/*.js"];
var macroSources = ["src/**/*.sjs"];

gulp.task("build-editor", "Build the editor bundle.", function() {
  var editorFiles = glob.sync(editorSources).map(function(file) {
    return "./" + file;
  });
  var bundler = browserify({
    entries: editorFiles,
    debug: true
  });
  bundler.transform(sweetify, {
    extensions: /.+\.(js|sjs)$/,
    readableNames: true
  });

  return bundler.bundle()
  .pipe(source("editor.js"))
  .pipe(buffer())
  .pipe(sourcemaps.init({loadMaps: true}))
  .pipe(sourcemaps.write("build"))
  .pipe(gulp.dest("build"));
});

gulp.task("build", "Build all the things.", ["stylus", "build-editor"]);

// Watch tasks

gulp.task("watch-editor", "Watch editor related files for changes.", ["build-editor"], function() {
  gulp.watch(editorSources.concat(macroSources), function(events, done) {
    gulp.start("build-editor");
  });
});

// Run the server.
gulp.task("run-server", "Run the eve server.", function() {
  require('./server');
});

gulp.task("watch", "Watch all the things.", ["watch-stylus", "watch-editor", "run-server"]);
