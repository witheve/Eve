var express = require('express');
var app = express();
var server = require("http").Server(app);
var io = require("socket.io")(server);

var oneDay = 86400000;

app.use(require("compression")());
app.use(require("body-parser").json());
app.use(require("body-parser").urlencoded({extended: true}));

app.use(require("serve-static")(__dirname + '/resources', { maxAge: 1000 }));
app.use("/src", require("serve-static")(__dirname + '/src', { maxAge: 1000 }));
app.use("/stylus", require("serve-static")(__dirname + '/stylus', { maxAge: 1000 }));

io.on("connection", function(socket) {
  socket.emit("news", {hello: "world"});
  socket.on("my other event", function(data) {
    console.log(data);
  });
});

var port = process.env.PORT || 3000;
server.listen(port);
console.log("Eve is up and running at http://localhost:" + port + "/");

