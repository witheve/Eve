var gulp = require("gulp-help")(require("gulp"));
var stylus = require("gulp-stylus");
var sourcemaps = require("gulp-sourcemaps");
var browserify = require("gulp-browserify");
var to5ify = require("6to5ify");
var watch = require("gulp-watch");
var batch = require("gulp-batch");

// Styles

gulp.task("stylus", "Compile stylus files to CSS.", function() {
  return gulp.src("stylus/**/*.stylus")
  .pipe(sourcemaps.init())
  .pipe(stylus())
  .pipe(sourcemaps.write("."))
  .pipe(gulp.dest("stylus"));
});

gulp.task("watch-stylus", "Watch stylus files for changes.", ["stylus"], function() {
  watch("stylus/**/*.stylus", batch(function(events, done) {
    gulp.start("stylus", done);
  }));
});

// JS Bundles

var editorSources = ["src/editor.js", "src/uiRenderers.js"];
gulp.task("build-editor", "Build the editor bundle.", function() {
  return gulp.src(editorSources, {read: false})
  .pipe(sourcemaps.init())
  .pipe(browserify({
    debug: true,
    transform: [to5ify]
  }))
  .pipe(sourcemaps.write("."))
  .pipe(gulp.dest("build"));
});

gulp.task("build", "Build all the things.", ["stylus", "build-editor"]);

// Watch tasks

gulp.task("watch-editor", "Watch editor related files for changes.", ["build-editor"], function() {
  watch(editorSources, batch(function(events, done) {
    gulp.start("build-editor", done);
  }));
});

gulp.task("watch", "Watch all the things.", ["watch-stylus", "watch-editor"]);
