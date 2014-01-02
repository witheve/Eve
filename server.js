var express = require('express');
var app = express();

var oneDay = 86400000;

app.use(express.compress());

app.use(express.static(__dirname + '/resources', { maxAge: 1000 }));

app.listen(process.env.PORT || 3000);