import * as parser from "./parser";

let uuid = require("uuid");
let pluralize = require("pluralize");
let WebSocket = require('ws');
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

    ws.on("error", () => {
        console.log(colors.red("No server running."));
        console.log(colors.magenta("Starting server.."));
        server = require("./server");
        connectToServer();
    });

    ws.on('message', function(data, flags) {
        // flags.binary will be set if a binary data is received.
        // flags.masked will be set if the data was masked.
        let parsed = JSON.parse(data);
        if(parsed.kind === "code error") {
            console.error(colors.red(parsed.data));
        } else if(parsed.kind === "code result") {
            console.log(resultsTable(parsed.data));
        } else if(parsed.kind === "code changeset") {
            console.log(`${parsed.data} ${pluralize("row", parsed.data)} added/removed`);
        } else {
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
    let result = "No results";
    if(rows.length) {
        let headers = Object.keys(rows[0]).filter((header) => header !== "__id");
        var table = new Table({head: headers});
        for(let row of rows) {
            let tableRow = [];
            for(let field of headers) {
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
//   completer: complete,
});

var ix = 1;
var current = "";
var me = uuid();

var separator = colors.gray("------------------------------------------------------------");

let CURSOR_UP_ONE = '\x1b[1A';

rl.on("line", function(answer) {
    current += answer;
    ix++;
    if(answer === "") {
        ix = 1;
        if(current) {
            rl.write(CURSOR_UP_ONE + CURSOR_UP_ONE);
            rl.clearLine();
            console.log("   ");
            try {
                let code = current.trim();
                if(current.indexOf("(query") !== 0
                   && current.indexOf("(insert!") !== 0
                   && current.indexOf("(remove!") !== 0
                   && current.indexOf("(load!") !== 0
                   ) {
                    code = `(query ${code})`;
                }
                ws.send(JSON.stringify({me, kind: "code", data: code}));
            } catch(e) {
                console.error(colors.red(e.message));
            }
        } else {
            recurse();
        }
        current = "";
        // rl.close();

    } else {
        recurse();
    }
});

function recurse() {
  rl.setPrompt(colors.gray(ix + "| "), (`${ix}| `).length);
  rl.prompt();
}