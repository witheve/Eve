var gulp = require("gulp-help")(require("gulp"));
var batch = require("gulp-batch");
var livereload = require("gulp-livereload");
// Styles

function stylus() {
  console.log("compiling stylus...");
  return gulp.src("stylus/**/*.styl");
}
gulp.task("compile-stylus", "Compile stylus files to CSS.", stylus);

gulp.task("watch-css", "Watch css files for changes.", function() {
  livereload.listen();
  return gulp.watch("css/**/*.css", batch(function(events, cb) {
    events.on('data', function(event) {
      var file = "css/" + event.path.split("/").pop();
      livereload.changed(file);
    }).on('end', cb);
  }));
});

//gulp.task("compile", "Compile all the things.", ["compile-stylus"]);
gulp.task("watch", "Watch all the things.", ["watch-stylus"]);
