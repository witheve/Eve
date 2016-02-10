var fs = require("fs");
var path = require("path");
var express = require('express');
var compress = require("compression");
var app = require("./app");
var parser = require("./parser");
var WebSocketServer = require('ws').Server;
var wss = new WebSocketServer({ port: 8080 });
var eve = app.eve;
try {
    fs.statSync("server.evedb");
    eve.load(fs.readFileSync("server.evedb").toString());
}
catch (err) { }
var diff = eve.diff();
diff.addMany("foo", [{ a: "bar" }, { a: "baz" }]);
eve.applyDiff(diff);
var clients = {};
wss.on('connection', function connection(ws) {
    //when we connect, send them all the pages.
    ws.send(JSON.stringify({ kind: "load", time: (new Date()).getTime(), me: "server", data: eve.serialize() }));
    ws.on('close', function () {
        delete clients[ws.me];
    });
    ws.on('message', function incoming(message) {
        var parsed = JSON.parse(message);
        if (parsed.kind === "code") {
            try {
                var artifacts = parser.parseDSL(parsed.data);
                if (artifacts.changeset) {
                    eve.applyDiff(artifacts.changeset);
                    // fs.writeFileSync("server.evedb", eve.serialize());
                    ws.send(JSON.stringify({ kind: "code changeset", me: "server", data: artifacts.changeset.length }));
                }
                if (Object.keys(artifacts.views).length) {
                    var views = artifacts.views;
                    var viewIds = Object.keys(views);
                    for (var _i = 0; _i < viewIds.length; _i++) {
                        var viewId = viewIds[_i];
                        var view = views[viewId];
                        eve.asView(view);
                    }
                    var results = eve.find(viewIds[0]);
                    ws.send(JSON.stringify({ kind: "code result", me: "server", data: results }));
                    for (var _a = 0; _a < viewIds.length; _a++) {
                        var viewId = viewIds[_a];
                        var view = views[viewId];
                        eve.removeView(viewId);
                    }
                }
            }
            catch (e) {
                ws.send(JSON.stringify({ kind: "code error", me: "server", data: e.message }));
            }
        }
        else if (parsed.kind === "changeset") {
            var diff_1 = eve.diff();
            diff_1.tables = parsed.data;
            eve.applyDiff(diff_1);
            // dispatch and store.
            for (var client in clients) {
                if (client === parsed.me)
                    continue;
                if (!clients[client])
                    continue;
                clients[client].send(message);
            }
        }
        else if (parsed.kind === "connect") {
            clients[parsed.data] = ws;
            ws.me = parsed.data;
        }
    });
});
var httpserver = express();
httpserver.use(compress());
httpserver.use("/bin", express.static(__dirname + '/../../bin'));
httpserver.use("/css", express.static(__dirname + '/../../css'));
httpserver.use("/node_modules", express.static(__dirname + '/../../node_modules'));
httpserver.use("/vendor", express.static(__dirname + '/../../vendor'));
httpserver.use("/fonts", express.static(__dirname + '/../../fonts'));
httpserver.use("/test", express.static(__dirname + '/../../test'));
httpserver.use("/images", express.static(__dirname + '/../../images'));
httpserver.get("/*", function (req, res) {
    res.sendFile(path.resolve(__dirname + "/../../editor.html"));
});
httpserver.listen(process.env.PORT || 3000);
//# sourceMappingURL=server.js.map