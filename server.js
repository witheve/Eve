var express = require('express');
var app = express();

var oneDay = 86400000;

// Twilio Credentials
var accountSid = process.env["TWILIO_SID"];
var authToken = process.env["TWILIO_AUTH"];

//require the Twilio module and create a REST client
var client = require('twilio')(accountSid, authToken);

app.use(express.compress());
app.use(express.json());
app.use(express.urlencoded());

app.use(express.static(__dirname + '/resources', { maxAge: 1000 }));

app.post("/text", function(req, res) {

  console.log(JSON.stringify(req.params));

  client.messages.create({
    to: req.param('to'),
    from: "+17742955216",
    body: req.param('body'),
  }, function(err, message) {
    console.log(message.sid);
  });

});

app.listen(process.env.PORT || 3000);
