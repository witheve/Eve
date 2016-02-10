var uuid = require("uuid");
var pluralize = require("pluralize");
var WebSocket = require('ws');
var Table = require('cli-table');
var server, ws;
function connectToServer() {
    ws = new WebSocket("ws://localhost:8080");
    ws.on('open', function open() {
        console.log(colors.magenta("Connected to ws://localhost:8080"));
        console.log(separator);
        console.log("");
        recurse();
    });
    ws.on("error", function () {
        console.log(colors.red("No server running."));
        console.log(colors.magenta("Starting server.."));
        server = require("./server");
        connectToServer();
    });
    ws.on('message', function (data, flags) {
        // flags.binary will be set if a binary data is received.
        // flags.masked will be set if the data was masked.
        var parsed = JSON.parse(data);
        if (parsed.kind === "code error") {
            console.error(colors.red(parsed.data));
        }
        else if (parsed.kind === "code result") {
            console.log(resultsTable(parsed.data));
        }
        else if (parsed.kind === "code changeset") {
            console.log(parsed.data + " " + pluralize("row", parsed.data) + " added/removed");
        }
        else {
            return;
        }
        console.log("");
        console.log(separator);
        console.log("");
        recurse();
    });
}
connectToServer();
function resultsTable(rows) {
    var result = "No results";
    if (rows.length) {
        var headers = Object.keys(rows[0]).filter(function (header) { return header !== "__id"; });
        var table = new Table({ head: headers });
        for (var _i = 0; _i < rows.length; _i++) {
            var row = rows[_i];
            var tableRow = [];
            for (var _a = 0; _a < headers.length; _a++) {
                var field = headers[_a];
                tableRow.push(row[field]);
            }
            table.push(tableRow);
        }
        result = table.toString();
    }
    return result;
}
var colors = require("colors/safe");
var readline = require('readline');
function complete(line) {
    return [["asdf"], line];
}
var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});
var ix = 1;
var current = "";
var me = uuid();
var separator = colors.gray("------------------------------------------------------------");
var CURSOR_UP_ONE = '\x1b[1A';
rl.on("line", function (answer) {
    current += answer;
    ix++;
    if (answer === "") {
        ix = 1;
        if (current) {
            rl.write(CURSOR_UP_ONE + CURSOR_UP_ONE);
            rl.clearLine();
            console.log("   ");
            try {
                var code = current.trim();
                if (current.indexOf("(query") !== 0
                    && current.indexOf("(insert!") !== 0
                    && current.indexOf("(remove!") !== 0
                    && current.indexOf("(load!") !== 0) {
                    code = "(query " + code + ")";
                }
                ws.send(JSON.stringify({ me: me, kind: "code", data: code }));
            }
            catch (e) {
                console.error(colors.red(e.message));
            }
        }
        else {
            recurse();
        }
        current = "";
    }
    else {
        recurse();
    }
});
function recurse() {
    rl.setPrompt(colors.gray(ix + "| "), (ix + "| ").length);
    rl.prompt();
}
//# sourceMappingURL=repl.js.map