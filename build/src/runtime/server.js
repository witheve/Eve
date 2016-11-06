//---------------------------------------------------------------------
// Server
//---------------------------------------------------------------------
"use strict";
var http = require("http");
var fs = require("fs");
var path = require("path");
var express = require("express");
var bodyParser = require("body-parser");
var actions_1 = require("./actions");
var persisted_1 = require("./databases/persisted");
var server_1 = require("./databases/node/server");
var contentTypes = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".map": "application/javascript",
    ".css": "text/css",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
};
var PORT = process.env.PORT || 8080;
var serverDatabase = new server_1.ServerDatabase();
var app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.get("/build/examples.js", function (request, response) {
    var files = {};
    for (var _i = 0, _a = fs.readdirSync("examples/"); _i < _a.length; _i++) {
        var file = _a[_i];
        if (path.extname(file) === ".eve") {
            try {
                files[file] = fs.readFileSync(path.join("examples", file)).toString();
            }
            catch (err) { }
        }
    }
    fs.writeFileSync("build/examples.js", "var examples = " + JSON.stringify(files));
    response.setHeader("Content-Type", "application/javascript; charset=utf-8");
    response.end("var examples = " + JSON.stringify(files));
});
app.get("*", function (request, response) {
    var url = request.url;
    if (url === "/" || url.indexOf(".eve") > -1) {
        url = "/index.html";
    }
    fs.stat("." + url, function (err, result) {
        if (err) {
            return serverDatabase.handleHttpRequest(request, response);
        }
        response.setHeader("Content-Type", contentTypes[path.extname(url)] + "; charset=utf-8");
        response.end(fs.readFileSync("." + url));
    });
});
app.post("*", function (request, response) {
    return serverDatabase.handleHttpRequest(request, response);
});
var server = http.createServer(app);
var WebSocketServer = require('ws').Server;
var wss = new WebSocketServer({ server: server });
function handleEvent(evaluation, data) {
    var actions = [];
    for (var _i = 0, _a = data.insert; _i < _a.length; _i++) {
        var insert = _a[_i];
        actions.push(new actions_1.ActionImplementations["+="]("add", insert[0], insert[1], insert[2]));
    }
    evaluation.executeActions(actions);
}
var shared = new persisted_1.PersistedDatabase();
wss.on('connection', function connection(ws) {
    var queue = [];
    var evaluation;
    ws.on('message', function incoming(message) {
        var data = JSON.parse(message);
        if (data.type === "init") {
            var url_1 = data.url;
            fs.stat("." + url_1, function (err, stats) {
                if (err || !stats.isFile()) {
                    ws.send(JSON.stringify({ type: "initLocal" }));
                }
                else {
                    var content = fs.readFileSync("." + url_1).toString();
                    ws.send(JSON.stringify({ type: "initLocal", code: content }));
                }
            });
        }
        else if (data.type === "event") {
            if (!evaluation) {
                queue.push(data);
            }
            else {
                handleEvent(evaluation, data);
            }
        }
        // console.log('received: %s', message);
    });
    ws.on("close", function () {
        if (evaluation) {
            evaluation.close();
        }
    });
});
server.listen(PORT, function () {
    console.log("Server listening on: http://localhost:%s", PORT);
});
//# sourceMappingURL=server.js.map