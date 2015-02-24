var express = require('express')();
var server = require("http").Server(express);
var io = require("socket.io")(server);
var fs = require("fs");
var path = require("path");

var oneDay = 86400000;

express.use(require("compression")());
express.use(require("body-parser").json());
express.use(require("body-parser").urlencoded({extended: true}));

express.use(require("serve-static")(__dirname + '/resources', { maxAge: 1000 }));
express.use("/src", require("serve-static")(__dirname + '/src', { maxAge: 1000 }));
express.use("/build", require("serve-static")(__dirname + '/build', { maxAge: 1000 }));
express.use("/stylus", require("serve-static")(__dirname + '/stylus', { maxAge: 1000 }));

//---------------------------------------------------------
// Examples / tests loading
//---------------------------------------------------------
function bundleFiles(dir, ext) {
  var bundle = {};
  var files = fs.readdirSync(dir);
  for(var i in files) {
    var file = files[i];
    if(path.extname(file) === ext) {
      var content = fs.readFileSync(path.join(dir, file)).toString();
      bundle[path.basename(file, ext)] = content;
    }
  }

  return bundle;
}

function updateFile(path, content)  {
  content = content.replace(/[ \t]+$/gm, "");
  if(content[content.length-1] != "\n") {
    content += "\n";
  }
  // Only update existing files
  if(fs.existsSync(path)) {
    fs.writeFileSync(path, content);
  }
}

express.get("/src/examples.js", function(req, res) {
  var examples = bundleFiles("examples", ".eve");
  res.send("var examples = " + JSON.stringify(examples));
});


express.post("/src/examples.js/update", function(req, res) {
  var stack = req.body.stack;
  // my stack shouldn't get written out.
  if(stack === "My Stack") return res.send("");
  updateFile("examples/" + stack + ".eve", req.body.content);
  res.send("");
});

express.get("/src/tests.js", function(req, res) {
  var tests = bundleFiles("tests", ".eve");
  res.send("var tests = " + JSON.stringify(tests));
});

express.post("/src/tests.js/update", function(req, res) {
  var stack = req.body.stack;
  updateFile("tests/" + stack + ".eve", req.body.content);
  res.send("");
});

express.get("*", function(req, res) {
  res.send(fs.readFileSync("resources/index.html").toString());
});

//---------------------------------------------------------
// Go
//---------------------------------------------------------

var port = process.env.PORT || 3000;
server.listen(port);
console.log("Eve is up and running at http://localhost:" + port + "/");

