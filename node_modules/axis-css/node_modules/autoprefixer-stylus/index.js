var autoprefixer = require('autoprefixer');

module.exports = function() {
  var args = Array.prototype.slice.call(arguments);

  return function(style){
    this.on('end', function(err, css){
      if (args) return autoprefixer.apply(this, args).compile(css);
      autoprefixer.compile(css);
    });
  }

}
