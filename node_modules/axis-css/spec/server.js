var express = require('express'),
    path = require('path'),
    colors = require('colors'),
    http = require('http'),
    open = require('open'),
    stylus = require('stylus'),
    axis = require('../axis');

var app = express();

function compile(str, path) {
  return stylus(str).set('filename', path).use(axis());
}

app.configure(function(){
  app.set('port', process.env.PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.favicon());
  app.use(stylus.middleware({
    src: path.join(__dirname, 'public'),
    compile: compile
  }));
  app.use(express.logger('dev'));
  app.use(express.static(path.join(__dirname, 'public')));
});

app.get('/', function(req, res){ res.render('index') });

http.createServer(app).listen(app.get('port'), function(){
  console.log(('server started on port ' + app.get('port')).green);
  open('http://localhost:' + app.get('port'));
});
