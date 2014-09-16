var autoprefixer = require('autoprefixer-stylus');

module.exports = function(opts) {
  var implicit = (opts && opts.implicit == false) ? false : true;

  return function(style){
    // include axis
    style.include(__dirname);

    // implicit import handling
    if (implicit) style.import('axis');
  }

}
