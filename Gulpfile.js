var gulp = require("gulp-help")(require("gulp"));
var sourcemaps = require("gulp-sourcemaps");
var browserify = require('gulp-browserify');
var to5ify = require('6to5ify');

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

gulp.task("build", "Build all the things.", ["build-editor"]);
