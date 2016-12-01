let path = require("path");
let mkdirp = require("mkdirp");
let serializer = require("../../node_modules/chevrotain/diagrams/src/diagrams_serializer");
let eveParser = require("../src/runtime/parser").Parser;


let parserInstance = new eveParser([]);
let outPath = path.join(__dirname, '../syntax_diagrams/serialized_syntax.js');
mkdirp.sync("../syntax_diagrams");
serializer.serializeGrammarToFile(outPath, "serializedGrammar", parserInstance);