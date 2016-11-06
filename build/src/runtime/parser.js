//-----------------------------------------------------------
// Parser
//-----------------------------------------------------------
"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var commonmark = require("commonmark");
var chev = require("chevrotain");
var errors_1 = require("./errors");
var performance_1 = require("./performance");
var Lexer = chev.Lexer;
var Token = chev.Token;
//-----------------------------------------------------------
// Utils
//-----------------------------------------------------------
function cleanString(str) {
    var cleaned = str
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\r/g, "\r")
        .replace(/\\"/g, "\"")
        .replace(/\\{/g, "{")
        .replace(/\\}/g, "}");
    return cleaned;
}
function toEnd(node) {
    if (node instanceof Token) {
        return node.endOffset + 1;
    }
    return node.endOffset;
}
//-----------------------------------------------------------
// Markdown
//-----------------------------------------------------------
var markdownParser = new commonmark.Parser();
function parseMarkdown(markdown, docId) {
    var parsed = markdownParser.parse(markdown);
    var walker = parsed.walker();
    var cur;
    var tokenId = 0;
    var text = [];
    var extraInfo = {};
    var pos = 0;
    var lastLine = 1;
    var spans = [];
    var context = [];
    var blocks = [];
    while (cur = walker.next()) {
        var node = cur.node;
        if (cur.entering) {
            while (node.sourcepos && node.sourcepos[0][0] > lastLine) {
                lastLine++;
                pos++;
                text.push("\n");
            }
            if (node.type !== "text") {
                context.push({ node: node, start: pos });
            }
            if (node.type == "text" || node.type === "code_block" || node.type == "code") {
                text.push(node.literal);
                pos += node.literal.length;
            }
            if (node.type == "softbreak") {
                text.push("\n");
                pos += 1;
                lastLine++;
                context.pop();
            }
            if (node.type == "code_block") {
                var spanId = docId + "|block|" + tokenId++;
                var start = context.pop().start;
                node.id = spanId;
                node.startOffset = start;
                var type = node.type;
                if (!node._isFenced) {
                    type = "indented_code_block";
                }
                else {
                    blocks.push(node);
                }
                spans.push(start, pos, node.type, spanId);
                lastLine = node.sourcepos[1][0] + 1;
            }
            if (node.type == "code") {
                var spanId = docId + "|" + tokenId++;
                var start = context.pop().start;
                spans.push(start, pos, node.type, spanId);
            }
        }
        else {
            var info = context.pop();
            if (node !== info.node) {
                throw new Error("Common mark is exiting a node that doesn't agree with the context stack");
            }
            if (node.type == "emph" || node.type == "strong" || node.type == "link") {
                var spanId = docId + "|" + tokenId++;
                spans.push(info.start, pos, node.type, spanId);
                if (node.type === "link") {
                    extraInfo[spanId] = { destination: node._destination };
                }
            }
            else if (node.type == "heading" || node.type == "item") {
                var spanId = docId + "|" + tokenId++;
                spans.push(info.start, info.start, node.type, spanId);
                extraInfo[spanId] = { level: node._level, listData: node._listData };
            }
        }
    }
    return { text: text.join(""), spans: spans, blocks: blocks, extraInfo: extraInfo };
}
//-----------------------------------------------------------
// Tokens
//-----------------------------------------------------------
var breakChars = "@#\\.,\\(\\)\\[\\]\\{\\}⦑⦒:\\\"";
// Markdown
var DocContent = (function (_super) {
    __extends(DocContent, _super);
    function DocContent() {
        _super.apply(this, arguments);
    }
    DocContent.PATTERN = /[^\n]+/;
    return DocContent;
}(Token));
exports.DocContent = DocContent;
var Fence = (function (_super) {
    __extends(Fence, _super);
    function Fence() {
        _super.apply(this, arguments);
    }
    Fence.PATTERN = /```|~~~/;
    Fence.PUSH_MODE = "code";
    return Fence;
}(Token));
exports.Fence = Fence;
var CloseFence = (function (_super) {
    __extends(CloseFence, _super);
    function CloseFence() {
        _super.apply(this, arguments);
    }
    CloseFence.PATTERN = /```|~~~/;
    CloseFence.POP_MODE = true;
    return CloseFence;
}(Token));
exports.CloseFence = CloseFence;
// Comments
var CommentLine = (function (_super) {
    __extends(CommentLine, _super);
    function CommentLine() {
        _super.apply(this, arguments);
        this.label = "comment";
    }
    CommentLine.PATTERN = /\/\/.*\n/;
    CommentLine.GROUP = "comments";
    return CommentLine;
}(Token));
exports.CommentLine = CommentLine;
// Operators
var Equality = (function (_super) {
    __extends(Equality, _super);
    function Equality() {
        _super.apply(this, arguments);
        this.label = "equality";
    }
    Equality.PATTERN = /:|=/;
    return Equality;
}(Token));
exports.Equality = Equality;
var Comparison = (function (_super) {
    __extends(Comparison, _super);
    function Comparison() {
        _super.apply(this, arguments);
        this.label = "comparison";
    }
    Comparison.PATTERN = />=|<=|!=|>|</;
    return Comparison;
}(Token));
exports.Comparison = Comparison;
var AddInfix = (function (_super) {
    __extends(AddInfix, _super);
    function AddInfix() {
        _super.apply(this, arguments);
        this.label = "infix";
    }
    AddInfix.PATTERN = /\+|-/;
    return AddInfix;
}(Token));
exports.AddInfix = AddInfix;
var MultInfix = (function (_super) {
    __extends(MultInfix, _super);
    function MultInfix() {
        _super.apply(this, arguments);
        this.label = "infix";
    }
    MultInfix.PATTERN = /\*|\//;
    return MultInfix;
}(Token));
exports.MultInfix = MultInfix;
var Merge = (function (_super) {
    __extends(Merge, _super);
    function Merge() {
        _super.apply(this, arguments);
        this.label = "merge";
    }
    Merge.PATTERN = /<-/;
    return Merge;
}(Token));
exports.Merge = Merge;
var Set = (function (_super) {
    __extends(Set, _super);
    function Set() {
        _super.apply(this, arguments);
        this.label = "set";
    }
    Set.PATTERN = /:=/;
    return Set;
}(Token));
exports.Set = Set;
var Mutate = (function (_super) {
    __extends(Mutate, _super);
    function Mutate() {
        _super.apply(this, arguments);
        this.label = "mutate";
    }
    Mutate.PATTERN = /\+=|-=/;
    return Mutate;
}(Token));
exports.Mutate = Mutate;
var Dot = (function (_super) {
    __extends(Dot, _super);
    function Dot() {
        _super.apply(this, arguments);
        this.label = "dot";
    }
    Dot.PATTERN = /\./;
    return Dot;
}(Token));
exports.Dot = Dot;
var Pipe = (function (_super) {
    __extends(Pipe, _super);
    function Pipe() {
        _super.apply(this, arguments);
        this.label = "pipe";
    }
    Pipe.PATTERN = /\|/;
    return Pipe;
}(Token));
exports.Pipe = Pipe;
// Identifier
var Identifier = (function (_super) {
    __extends(Identifier, _super);
    function Identifier() {
        _super.apply(this, arguments);
        this.label = "identifier";
    }
    Identifier.PATTERN = new RegExp("([\\+-/\\*][^\\s" + breakChars + "]+|[^\\d" + breakChars + "\\+-/\\*][^\\s" + breakChars + "]*)(?=[^\\[])");
    return Identifier;
}(Token));
exports.Identifier = Identifier;
var FunctionIdentifier = (function (_super) {
    __extends(FunctionIdentifier, _super);
    function FunctionIdentifier() {
        _super.apply(this, arguments);
        this.label = "functionIdentifier";
    }
    FunctionIdentifier.PATTERN = new RegExp("([\\+-/\\*][^\\s" + breakChars + "]+|[^\\d" + breakChars + "\\+-/\\*][^\\s" + breakChars + "]*)(?=\\[)");
    return FunctionIdentifier;
}(Token));
exports.FunctionIdentifier = FunctionIdentifier;
// Keywords
var Keyword = (function (_super) {
    __extends(Keyword, _super);
    function Keyword() {
        _super.apply(this, arguments);
    }
    Keyword.PATTERN = Lexer.NA;
    Keyword.LONGER_ALT = Identifier;
    return Keyword;
}(Token));
exports.Keyword = Keyword;
var Lookup = (function (_super) {
    __extends(Lookup, _super);
    function Lookup() {
        _super.apply(this, arguments);
        this.label = "lookup";
    }
    Lookup.PATTERN = /lookup(?=\[)/;
    return Lookup;
}(Keyword));
exports.Lookup = Lookup;
var Action = (function (_super) {
    __extends(Action, _super);
    function Action() {
        _super.apply(this, arguments);
        this.label = "action";
    }
    Action.PATTERN = /bind|commit/;
    return Action;
}(Keyword));
exports.Action = Action;
var Search = (function (_super) {
    __extends(Search, _super);
    function Search() {
        _super.apply(this, arguments);
        this.label = "search";
    }
    Search.PATTERN = /search/;
    return Search;
}(Keyword));
exports.Search = Search;
var Is = (function (_super) {
    __extends(Is, _super);
    function Is() {
        _super.apply(this, arguments);
        this.label = "is";
    }
    Is.PATTERN = /is/;
    return Is;
}(Keyword));
exports.Is = Is;
var If = (function (_super) {
    __extends(If, _super);
    function If() {
        _super.apply(this, arguments);
        this.label = "if";
    }
    If.PATTERN = /if/;
    return If;
}(Keyword));
exports.If = If;
var Else = (function (_super) {
    __extends(Else, _super);
    function Else() {
        _super.apply(this, arguments);
        this.label = "else";
    }
    Else.PATTERN = /else/;
    return Else;
}(Keyword));
exports.Else = Else;
var Then = (function (_super) {
    __extends(Then, _super);
    function Then() {
        _super.apply(this, arguments);
        this.label = "then";
    }
    Then.PATTERN = /then/;
    return Then;
}(Keyword));
exports.Then = Then;
var Not = (function (_super) {
    __extends(Not, _super);
    function Not() {
        _super.apply(this, arguments);
        this.label = "not";
    }
    Not.PATTERN = /not/;
    return Not;
}(Keyword));
exports.Not = Not;
// Values
var Bool = (function (_super) {
    __extends(Bool, _super);
    function Bool() {
        _super.apply(this, arguments);
        this.label = "bool";
    }
    Bool.PATTERN = /true|false/;
    return Bool;
}(Keyword));
exports.Bool = Bool;
var Num = (function (_super) {
    __extends(Num, _super);
    function Num() {
        _super.apply(this, arguments);
        this.label = "num";
    }
    Num.PATTERN = /-?\d+(\.\d+)?/;
    return Num;
}(Token));
exports.Num = Num;
var None = (function (_super) {
    __extends(None, _super);
    function None() {
        _super.apply(this, arguments);
        this.label = "none";
    }
    None.PATTERN = /none/;
    return None;
}(Keyword));
exports.None = None;
var Name = (function (_super) {
    __extends(Name, _super);
    function Name() {
        _super.apply(this, arguments);
        this.label = "name";
    }
    Name.PATTERN = /@/;
    return Name;
}(Token));
exports.Name = Name;
var Tag = (function (_super) {
    __extends(Tag, _super);
    function Tag() {
        _super.apply(this, arguments);
        this.label = "tag";
    }
    Tag.PATTERN = /#/;
    return Tag;
}(Token));
exports.Tag = Tag;
var Uuid = (function (_super) {
    __extends(Uuid, _super);
    function Uuid() {
        _super.apply(this, arguments);
        this.label = "uuid";
    }
    Uuid.PATTERN = /⦑.*⦒/;
    return Uuid;
}(Token));
exports.Uuid = Uuid;
// Delimiters
var OpenBracket = (function (_super) {
    __extends(OpenBracket, _super);
    function OpenBracket() {
        _super.apply(this, arguments);
        this.label = "open-bracket";
    }
    OpenBracket.PATTERN = /\[/;
    return OpenBracket;
}(Token));
exports.OpenBracket = OpenBracket;
var CloseBracket = (function (_super) {
    __extends(CloseBracket, _super);
    function CloseBracket() {
        _super.apply(this, arguments);
        this.label = "close-bracket";
    }
    CloseBracket.PATTERN = /\]/;
    return CloseBracket;
}(Token));
exports.CloseBracket = CloseBracket;
var OpenParen = (function (_super) {
    __extends(OpenParen, _super);
    function OpenParen() {
        _super.apply(this, arguments);
        this.label = "open-paren";
    }
    OpenParen.PATTERN = /\(/;
    return OpenParen;
}(Token));
exports.OpenParen = OpenParen;
var CloseParen = (function (_super) {
    __extends(CloseParen, _super);
    function CloseParen() {
        _super.apply(this, arguments);
        this.label = "close-paren";
    }
    CloseParen.PATTERN = /\)/;
    return CloseParen;
}(Token));
exports.CloseParen = CloseParen;
// Strings
var StringChars = (function (_super) {
    __extends(StringChars, _super);
    function StringChars() {
        _super.apply(this, arguments);
        this.label = "string";
    }
    StringChars.PATTERN = /(\\.|{(?=[^{])|[^"\\{])+/;
    return StringChars;
}(Token));
exports.StringChars = StringChars;
var OpenString = (function (_super) {
    __extends(OpenString, _super);
    function OpenString() {
        _super.apply(this, arguments);
        this.label = "quote";
    }
    OpenString.PATTERN = /"/;
    OpenString.PUSH_MODE = "string";
    return OpenString;
}(Token));
exports.OpenString = OpenString;
var CloseString = (function (_super) {
    __extends(CloseString, _super);
    function CloseString() {
        _super.apply(this, arguments);
        this.label = "quote";
    }
    CloseString.PATTERN = /"/;
    CloseString.POP_MODE = true;
    return CloseString;
}(Token));
exports.CloseString = CloseString;
// String Embeds
var StringEmbedOpen = (function (_super) {
    __extends(StringEmbedOpen, _super);
    function StringEmbedOpen() {
        _super.apply(this, arguments);
        this.label = "string-embed-open";
    }
    StringEmbedOpen.PATTERN = /{{/;
    StringEmbedOpen.PUSH_MODE = "code";
    return StringEmbedOpen;
}(Token));
exports.StringEmbedOpen = StringEmbedOpen;
var StringEmbedClose = (function (_super) {
    __extends(StringEmbedClose, _super);
    function StringEmbedClose() {
        _super.apply(this, arguments);
        this.label = "string-embed-close";
    }
    StringEmbedClose.PATTERN = /}}/;
    StringEmbedClose.POP_MODE = true;
    return StringEmbedClose;
}(Token));
exports.StringEmbedClose = StringEmbedClose;
// Whitespace
var WhiteSpace = (function (_super) {
    __extends(WhiteSpace, _super);
    function WhiteSpace() {
        _super.apply(this, arguments);
    }
    WhiteSpace.PATTERN = /\s+|,/;
    WhiteSpace.GROUP = Lexer.SKIPPED;
    return WhiteSpace;
}(Token));
exports.WhiteSpace = WhiteSpace;
//-----------------------------------------------------------
// Lexers
//-----------------------------------------------------------
var codeTokens = [
    CloseFence, WhiteSpace, CommentLine, OpenBracket, CloseBracket, OpenParen,
    CloseParen, StringEmbedClose, OpenString, Bool, Action, Set, Equality, Dot, Pipe, Merge,
    Mutate, Comparison, Num, Search, Lookup, Is, If, Else, Then,
    Not, None, Name, Tag, Uuid, FunctionIdentifier, Identifier, AddInfix, MultInfix
];
var stringEmbedTokens = [StringEmbedClose].concat(codeTokens);
var LexerModes = {
    "doc": [WhiteSpace, Fence, DocContent],
    "code": codeTokens,
    "string": [CloseString, StringEmbedOpen, StringChars],
};
var allTokens = codeTokens.concat([Fence, DocContent, CloseString, StringEmbedOpen, StringEmbedClose, StringChars]);
var EveDocLexer = new Lexer({ modes: LexerModes, defaultMode: "doc" }, true);
var EveBlockLexer = new Lexer({ modes: LexerModes, defaultMode: "code" }, true);
var ParseBlock = (function () {
    function ParseBlock(id, variableLookup) {
        this.nodeId = 0;
        this.variables = {};
        this.equalities = [];
        this.scanLike = [];
        this.expressions = [];
        this.binds = [];
        this.commits = [];
        this.links = [];
        this.searchScopes = [];
        this.id = id;
        this.variableLookup = variableLookup || {};
    }
    ParseBlock.prototype.toVariable = function (name, generated) {
        if (generated === void 0) { generated = false; }
        var variable = this.variableLookup[name];
        if (!variable) {
            this.variableLookup[name] = this.makeNode("variable", { name: name, from: [], generated: generated });
        }
        variable = this.variables[name] = this.variableLookup[name];
        return { id: variable.id, type: "variable", name: name, from: [], generated: generated };
    };
    ParseBlock.prototype.addUsage = function (variable, usage) {
        var global = this.variableLookup[variable.name];
        global.from.push(usage);
        if (global.from.length === 1) {
            global.startOffset = usage.startOffset;
            global.endOffset = toEnd(usage);
        }
        variable.from.push(usage);
        variable.startOffset = usage.startOffset;
        variable.endOffset = toEnd(usage);
        this.links.push(variable.id, usage.id);
    };
    ParseBlock.prototype.equality = function (a, b) {
        this.equalities.push([a, b]);
    };
    ParseBlock.prototype.commit = function (node) {
        this.commits.push(node);
    };
    ParseBlock.prototype.bind = function (node) {
        this.binds.push(node);
    };
    ParseBlock.prototype.expression = function (node) {
        this.expressions.push(node);
    };
    ParseBlock.prototype.scan = function (node) {
        this.scanLike.push(node);
    };
    ParseBlock.prototype.makeNode = function (type, node) {
        if (!node.id) {
            node.id = this.id + "|node|" + this.nodeId++;
        }
        for (var _i = 0, _a = node.from; _i < _a.length; _i++) {
            var from = _a[_i];
            this.links.push(node.id, from.id);
        }
        if (node.from.length) {
            node.startOffset = node.from[0].startOffset;
            node.endOffset = toEnd(node.from[node.from.length - 1]);
        }
        node.type = type;
        return node;
    };
    ParseBlock.prototype.addSearchScopes = function (scopes) {
        for (var _i = 0, scopes_1 = scopes; _i < scopes_1.length; _i++) {
            var scope = scopes_1[_i];
            if (this.searchScopes.indexOf(scope) === -1) {
                this.searchScopes.push(scope);
            }
        }
    };
    ParseBlock.prototype.subBlock = function () {
        var neue = new ParseBlock(this.id + "|sub" + this.nodeId++, this.variableLookup);
        return neue;
    };
    return ParseBlock;
}());
exports.ParseBlock = ParseBlock;
//-----------------------------------------------------------
// Parser
//-----------------------------------------------------------
var Parser = (function (_super) {
    __extends(Parser, _super);
    function Parser(input) {
        _super.call(this, input, allTokens, {});
        var self = this;
        var rule = function (name, func) {
            self[name] = self.RULE(name, func);
        };
        var asValue = function (node) {
            if (node.type === "constant" || node.type === "variable" || node.type === "parenthesis") {
                return node;
            }
            else if (node.variable) {
                return node.variable;
            }
            throw new Error("Tried to get value of a node that is neither a constant nor a variable.\n\n" + JSON.stringify(node));
        };
        var ifOutputs = function (expression) {
            var outputs = [];
            if (expression.type === "parenthesis") {
                for (var _i = 0, _a = expression.items; _i < _a.length; _i++) {
                    var item = _a[_i];
                    outputs.push(asValue(item));
                }
            }
            else {
                outputs.push(asValue(expression));
            }
            return outputs;
        };
        var makeNode = function (type, node) {
            return self.block.makeNode(type, node);
        };
        var blockStack = [];
        var pushBlock = function (blockId) {
            var block;
            var prev = blockStack[blockStack.length - 1];
            if (prev) {
                block = prev.subBlock();
            }
            else {
                block = new ParseBlock(blockId || "block");
            }
            blockStack.push(block);
            self.block = block;
            return block;
        };
        var popBlock = function () {
            var popped = blockStack.pop();
            self.block = blockStack[blockStack.length - 1];
            return popped;
        };
        //-----------------------------------------------------------
        // Doc rules
        //-----------------------------------------------------------
        rule("doc", function () {
            var doc = {
                full: [],
                content: [],
                blocks: [],
            };
            self.MANY(function () {
                self.OR([
                    { ALT: function () {
                            var content = self.CONSUME(DocContent);
                            doc.full.push(content);
                            doc.content.push(content);
                        } },
                    { ALT: function () {
                            var block = self.SUBRULE(self.fencedBlock);
                            if (doc.content.length) {
                                block.name = doc.content[doc.content.length - 1].image;
                            }
                            else {
                                block.name = "Unnamed block";
                            }
                            doc.full.push(block);
                            doc.blocks.push(block);
                        } },
                ]);
            });
            return doc;
        });
        rule("fencedBlock", function () {
            self.CONSUME(Fence);
            var block = self.SUBRULE(self.codeBlock);
            var fence = self.CONSUME(CloseFence);
            return block;
        });
        //-----------------------------------------------------------
        // Blocks
        //-----------------------------------------------------------
        rule("codeBlock", function (blockId) {
            if (blockId === void 0) { blockId = "block"; }
            blockStack = [];
            var block = pushBlock(blockId);
            self.MANY(function () { self.SUBRULE(self.section); });
            return popBlock();
        });
        rule("section", function () {
            return self.OR([
                { ALT: function () { return self.SUBRULE(self.searchSection); } },
                { ALT: function () { return self.SUBRULE(self.actionSection); } },
                { ALT: function () { return self.CONSUME(CommentLine); } },
            ]);
        });
        //-----------------------------------------------------------
        // Scope declaration
        //-----------------------------------------------------------
        rule("scopeDeclaration", function () {
            var scopes = [];
            self.OR([
                { ALT: function () {
                        self.CONSUME(OpenParen);
                        self.AT_LEAST_ONE(function () {
                            var name = self.SUBRULE(self.name);
                            scopes.push(name.name);
                        });
                        self.CONSUME(CloseParen);
                    } },
                { ALT: function () {
                        self.AT_LEAST_ONE2(function () {
                            var name = self.SUBRULE2(self.name);
                            scopes.push(name.name);
                        });
                    } },
            ]);
            return scopes;
        });
        //-----------------------------------------------------------
        // Search section
        //-----------------------------------------------------------
        rule("searchSection", function () {
            // @TODO fill in from
            var from = [];
            self.CONSUME(Search);
            var scopes = ["session"];
            self.OPTION(function () { scopes = self.SUBRULE(self.scopeDeclaration); });
            self.activeScopes = scopes;
            self.currentAction = "match";
            self.block.addSearchScopes(scopes);
            var statements = [];
            self.MANY(function () {
                var statement = self.SUBRULE(self.statement);
                if (statement) {
                    statements.push(statement);
                    statement.scopes = scopes;
                }
            });
            return makeNode("searchSection", { statements: statements, scopes: scopes, from: from });
        });
        rule("statement", function () {
            return self.OR([
                { ALT: function () { return self.SUBRULE(self.comparison); } },
                { ALT: function () { return self.SUBRULE(self.notStatement); } },
            ]);
        });
        //-----------------------------------------------------------
        // Action section
        //-----------------------------------------------------------
        rule("actionSection", function () {
            // @TODO fill in from
            var from = [];
            var action = self.CONSUME(Action).image;
            var actionKey = action;
            var scopes = ["session"];
            self.OPTION(function () { scopes = self.SUBRULE(self.scopeDeclaration); });
            self.activeScopes = scopes;
            self.currentAction = action;
            var statements = [];
            self.MANY(function () {
                var statement = self.SUBRULE(self.actionStatement, [actionKey]);
                if (statement) {
                    statements.push(statement);
                    statement.scopes = scopes;
                }
            });
            return makeNode("actionSection", { statements: statements, scopes: scopes, from: from });
        });
        rule("actionStatement", function (actionKey) {
            return self.OR([
                { ALT: function () {
                        var record = self.SUBRULE(self.record, [false, actionKey, "+="]);
                        return record;
                    } },
                { ALT: function () { return self.SUBRULE(self.actionEqualityRecord, [actionKey]); } },
                { ALT: function () {
                        var record = self.SUBRULE(self.actionOperation, [actionKey]);
                        self.block[actionKey](record);
                        return record;
                    } },
                { ALT: function () { return self.SUBRULE(self.actionLookup, [actionKey]); } },
            ]);
        });
        //-----------------------------------------------------------
        // Action operations
        //-----------------------------------------------------------
        rule("actionOperation", function (actionKey) {
            return self.OR([
                { ALT: function () { return self.SUBRULE(self.recordOperation, [actionKey]); } },
                { ALT: function () { return self.SUBRULE(self.attributeOperation, [actionKey]); } },
            ]);
        });
        rule("attributeOperation", function (actionKey) {
            var mutator = self.SUBRULE(self.attributeMutator);
            var attribute = mutator.attribute, parent = mutator.parent;
            return self.OR([
                { ALT: function () {
                        var variable = self.block.toVariable(attribute.image + "|" + attribute.startLine + "|" + attribute.startColumn, true);
                        var scan = makeNode("scan", { entity: parent, attribute: makeNode("constant", { value: attribute.image, from: [attribute] }), value: variable, scopes: self.activeScopes, from: [mutator] });
                        self.block.addUsage(variable, scan);
                        self.block.scan(scan);
                        self.CONSUME(Merge);
                        var record = self.SUBRULE(self.record, [true, actionKey, "+=", undefined, variable]);
                        record.variable = variable;
                        record.action = "<-";
                        return record;
                    } },
                { ALT: function () {
                        var op = self.CONSUME(Set);
                        var none = self.CONSUME(None);
                        return makeNode("action", { action: "erase", entity: asValue(parent), attribute: attribute.image, from: [mutator, op, none] });
                    } },
                { ALT: function () {
                        var op = self.CONSUME2(Set);
                        var value = self.SUBRULE(self.infix);
                        return makeNode("action", { action: op.image, entity: asValue(parent), attribute: attribute.image, value: asValue(value), from: [mutator, op, value] });
                    } },
                { ALT: function () {
                        var op = self.CONSUME3(Set);
                        var value = self.SUBRULE2(self.record, [false, actionKey, "+=", parent]);
                        return makeNode("action", { action: op.image, entity: asValue(parent), attribute: attribute.image, value: asValue(value), from: [mutator, op, value] });
                    } },
                { ALT: function () {
                        var variable = self.block.toVariable(attribute.image + "|" + attribute.startLine + "|" + attribute.startColumn, true);
                        var scan = makeNode("scan", { entity: parent, attribute: makeNode("constant", { value: attribute.image, from: [attribute] }), value: variable, scopes: self.activeScopes, from: [mutator] });
                        self.block.addUsage(variable, scan);
                        self.block.scan(scan);
                        var op = self.CONSUME(Mutate);
                        var tag = self.SUBRULE(self.tag);
                        return makeNode("action", { action: op.image, entity: variable, attribute: "tag", value: makeNode("constant", { value: tag.tag, from: [tag] }), from: [mutator, op, tag] });
                    } },
                { ALT: function () {
                        var op = self.CONSUME2(Mutate);
                        var value = self.SUBRULE2(self.actionAttributeExpression, [actionKey, op.image, parent]);
                        if (value.type === "record" && !value.extraProjection) {
                            value.extraProjection = [parent];
                        }
                        if (value.type === "parenthesis") {
                            for (var _i = 0, _a = value.items; _i < _a.length; _i++) {
                                var item = _a[_i];
                                if (item.type === "record" && !value.extraProjection) {
                                    item.extraProjection = [parent];
                                }
                            }
                        }
                        return makeNode("action", { action: op.image, entity: asValue(parent), attribute: attribute.image, value: asValue(value), from: [mutator, op, value] });
                    } },
            ]);
        });
        rule("recordOperation", function (actionKey) {
            var variable = self.SUBRULE(self.variable);
            return self.OR([
                { ALT: function () {
                        var set = self.CONSUME(Set);
                        var none = self.CONSUME(None);
                        return makeNode("action", { action: "erase", entity: asValue(variable), from: [variable, set, none] });
                    } },
                { ALT: function () {
                        self.CONSUME(Merge);
                        var record = self.SUBRULE(self.record, [true, actionKey, "+=", undefined, variable]);
                        record.needsEntity = true;
                        record.action = "<-";
                        return record;
                    } },
                { ALT: function () {
                        var op = self.CONSUME(Mutate);
                        var tag = self.SUBRULE(self.tag);
                        return makeNode("action", { action: op.image, entity: asValue(variable), attribute: "tag", value: makeNode("constant", { value: tag.tag, from: [tag] }), from: [variable, op, tag] });
                    } },
            ]);
        });
        rule("actionLookup", function (actionKey) {
            var lookup = self.CONSUME(Lookup);
            var record = self.SUBRULE(self.record, [true]);
            var info = {};
            for (var _i = 0, _a = record.attributes; _i < _a.length; _i++) {
                var attribute = _a[_i];
                info[attribute.attribute] = attribute.value;
            }
            var actionType = "+=";
            self.OPTION(function () {
                self.CONSUME(Set);
                self.CONSUME(None);
                if (info["value"] !== undefined) {
                    actionType = "-=";
                }
                else {
                    actionType = "erase";
                }
            });
            var action = makeNode("action", { action: actionType, entity: info.record, attribute: info.attribute, value: info.value, node: info.node, scopes: self.activeScopes, from: [lookup, record] });
            self.block[actionKey](action);
            return action;
        });
        rule("actionAttributeExpression", function (actionKey, action, parent) {
            return self.OR([
                { ALT: function () { return self.SUBRULE(self.record, [false, actionKey, action, parent]); } },
                { ALT: function () { return self.SUBRULE(self.infix); } },
            ]);
        });
        rule("actionEqualityRecord", function (actionKey) {
            var variable = self.SUBRULE(self.variable);
            self.CONSUME(Equality);
            var record = self.SUBRULE(self.record, [true, actionKey, "+="]);
            record.variable = variable;
            self.block[actionKey](record);
            return record;
        });
        //-----------------------------------------------------------
        // Record + attribute
        //-----------------------------------------------------------
        rule("record", function (noVar, blockKey, action, parent, passedVariable) {
            if (noVar === void 0) { noVar = false; }
            if (blockKey === void 0) { blockKey = "scan"; }
            if (action === void 0) { action = false; }
            var attributes = [];
            var start = self.CONSUME(OpenBracket);
            var from = [start];
            var info = { attributes: attributes, action: action, scopes: self.activeScopes, from: from };
            if (parent) {
                info.extraProjection = [parent];
            }
            if (passedVariable) {
                info.variable = passedVariable;
                info.variable.nonProjecting = true;
            }
            else if (!noVar) {
                info.variable = self.block.toVariable("record|" + start.startLine + "|" + start.startColumn, true);
                info.variable.nonProjecting = true;
            }
            var nonProjecting = false;
            self.MANY(function () {
                self.OR([
                    { ALT: function () {
                            var attribute = self.SUBRULE(self.attribute, [false, blockKey, action, info.variable]);
                            // Inline handles attributes itself and so won't return any attribute for us to add
                            // to this object
                            if (!attribute)
                                return;
                            if (attribute.constructor === Array) {
                                for (var _i = 0, _a = attribute; _i < _a.length; _i++) {
                                    var attr = _a[_i];
                                    attr.nonProjecting = nonProjecting;
                                    attributes.push(attr);
                                    from.push(attr);
                                }
                            }
                            else {
                                attribute.nonProjecting = nonProjecting;
                                attributes.push(attribute);
                                from.push(attribute);
                            }
                        } },
                    { ALT: function () {
                            nonProjecting = true;
                            var pipe = self.CONSUME(Pipe);
                            from.push(pipe);
                            return pipe;
                        } },
                ]);
            });
            from.push(self.CONSUME(CloseBracket));
            var record = makeNode("record", info);
            if (!noVar) {
                self.block.addUsage(info.variable, record);
                self.block[blockKey](record);
            }
            return record;
        });
        rule("attribute", function (noVar, blockKey, action, recordVariable) {
            return self.OR([
                { ALT: function () { return self.SUBRULE(self.attributeEquality, [noVar, blockKey, action, recordVariable]); } },
                { ALT: function () { return self.SUBRULE(self.attributeComparison); } },
                { ALT: function () { return self.SUBRULE(self.attributeNot, [recordVariable]); } },
                { ALT: function () { return self.SUBRULE(self.singularAttribute); } },
            ]);
        });
        rule("singularAttribute", function (forceGenerate) {
            return self.OR([
                { ALT: function () {
                        var tag = self.SUBRULE(self.tag);
                        return makeNode("attribute", { attribute: "tag", value: makeNode("constant", { value: tag.tag, from: [tag] }), from: [tag] });
                    } },
                { ALT: function () {
                        var variable = self.SUBRULE(self.variable, [forceGenerate]);
                        return makeNode("attribute", { attribute: variable.from[0].image, value: variable, from: [variable] });
                    } },
            ]);
        });
        rule("attributeMutator", function () {
            var scans = [];
            var entity, attribute, value;
            var needsEntity = true;
            var from = [];
            entity = self.SUBRULE(self.variable);
            var dot = self.CONSUME(Dot);
            from.push(entity, dot);
            self.MANY(function () {
                attribute = self.CONSUME(Identifier);
                from.push(attribute);
                from.push(self.CONSUME2(Dot));
                value = self.block.toVariable(attribute.image + "|" + attribute.startLine + "|" + attribute.startColumn, true);
                self.block.addUsage(value, attribute);
                var scopes = self.activeScopes;
                if (self.currentAction !== "match") {
                    scopes = self.block.searchScopes;
                }
                var scan = makeNode("scan", { entity: entity, attribute: makeNode("constant", { value: attribute.image, from: [value] }), value: value, needsEntity: needsEntity, scopes: scopes, from: [entity, dot, attribute] });
                self.block.scan(scan);
                needsEntity = false;
                entity = value;
            });
            attribute = self.CONSUME2(Identifier);
            from.push(attribute);
            return makeNode("attributeMutator", { attribute: attribute, parent: entity, from: from });
        });
        rule("attributeAccess", function () {
            var scans = [];
            var entity, attribute, value;
            var needsEntity = true;
            entity = self.SUBRULE(self.variable);
            var parentId = entity.name;
            self.AT_LEAST_ONE(function () {
                var dot = self.CONSUME(Dot);
                attribute = self.CONSUME(Identifier);
                parentId = parentId + "|" + attribute.image;
                value = self.block.toVariable(parentId, true);
                self.block.addUsage(value, attribute);
                var scopes = self.activeScopes;
                if (self.currentAction !== "match") {
                    scopes = self.block.searchScopes;
                }
                var scan = makeNode("scan", { entity: entity, attribute: makeNode("constant", { value: attribute.image, from: [attribute] }), value: value, needsEntity: needsEntity, scopes: scopes, from: [entity, dot, attribute] });
                self.block.scan(scan);
                needsEntity = false;
                entity = value;
            });
            return value;
        });
        rule("attributeEquality", function (noVar, blockKey, action, parent) {
            var attributes = [];
            var autoIndex = 1;
            var attributeNode;
            var attribute = self.OR([
                { ALT: function () {
                        attributeNode = self.CONSUME(Identifier);
                        return attributeNode.image;
                    } },
                { ALT: function () {
                        attributeNode = self.CONSUME(Num);
                        return parseFloat(attributeNode.image);
                    } }
            ]);
            var equality = self.CONSUME(Equality);
            var result;
            self.OR2([
                { ALT: function () {
                        result = self.SUBRULE(self.infix);
                    } },
                { ALT: function () {
                        result = self.SUBRULE(self.record, [noVar, blockKey, action, parent]);
                        self.MANY(function () {
                            autoIndex++;
                            var record = self.SUBRULE2(self.record, [noVar, blockKey, action, parent]);
                            record.attributes.push(makeNode("attribute", { attribute: "eve-auto-index", value: makeNode("constant", { value: autoIndex, from: [record] }), from: [record] }));
                            attributes.push(makeNode("attribute", { attribute: attribute, value: asValue(record), from: [attributeNode, equality, record] }));
                        });
                        if (autoIndex > 1) {
                            result.attributes.push(makeNode("attribute", { attribute: "eve-auto-index", value: makeNode("constant", { value: 1, from: [result] }), from: [result] }));
                        }
                    } },
            ]);
            attributes.push(makeNode("attribute", { attribute: attribute, value: asValue(result), from: [attributeNode, equality, result] }));
            return attributes;
        });
        rule("attributeComparison", function () {
            var attribute = self.CONSUME(Identifier);
            var comparator = self.CONSUME(Comparison);
            var result = self.SUBRULE(self.expression);
            var variable = self.block.toVariable("attribute|" + attribute.startLine + "|" + attribute.startColumn, true);
            var expression = makeNode("expression", { op: comparator.image, args: [asValue(variable), asValue(result)], from: [attribute, comparator, result] });
            self.block.addUsage(variable, expression);
            self.block.expression(expression);
            return makeNode("attribute", { attribute: attribute.image, value: variable, from: [attribute, comparator, expression] });
        });
        rule("attributeNot", function (recordVariable) {
            var block = pushBlock();
            block.type = "not";
            var not = self.CONSUME(Not);
            var start = self.CONSUME(OpenParen);
            var attribute = self.OR([
                { ALT: function () { return self.SUBRULE(self.attributeComparison); } },
                { ALT: function () { return self.SUBRULE(self.singularAttribute, [true]); } },
            ]);
            var end = self.CONSUME(CloseParen);
            // we have to add a record for this guy
            var scan = makeNode("scan", { entity: recordVariable, attribute: makeNode("constant", { value: attribute.attribute, from: [attribute] }), value: attribute.value, needsEntity: true, scopes: self.activeScopes, from: [attribute] });
            block.variables[recordVariable.name] = recordVariable;
            block.scan(scan);
            block.from = [not, start, attribute, end];
            block.startOffset = not.startOffset;
            block.endOffset = toEnd(end);
            popBlock();
            self.block.scan(block);
            return;
        });
        //-----------------------------------------------------------
        // Name and tag
        //-----------------------------------------------------------
        rule("name", function () {
            var at = self.CONSUME(Name);
            var name = self.CONSUME(Identifier);
            return makeNode("name", { name: name.image, from: [at, name] });
        });
        rule("tag", function () {
            var hash = self.CONSUME(Tag);
            var tag = self.CONSUME(Identifier);
            return makeNode("tag", { tag: tag.image, from: [hash, tag] });
        });
        //-----------------------------------------------------------
        // Function
        //-----------------------------------------------------------
        rule("functionRecord", function () {
            var name = self.OR([
                { ALT: function () { return self.CONSUME(FunctionIdentifier); } },
                { ALT: function () { return self.CONSUME(Lookup); } }
            ]);
            var record = self.SUBRULE(self.record, [true]);
            if (name.image === "lookup") {
                var info = {};
                for (var _i = 0, _a = record.attributes; _i < _a.length; _i++) {
                    var attribute = _a[_i];
                    info[attribute.attribute] = attribute.value;
                }
                var scan = makeNode("scan", { entity: info.record, attribute: info.attribute, value: info.value, node: info.node, scopes: self.activeScopes, from: [name, record] });
                self.block.scan(scan);
                return scan;
            }
            else {
                var variable = self.block.toVariable("return|" + name.startLine + "|" + name.startColumn, true);
                var functionRecord = makeNode("functionRecord", { op: name.image, record: record, variable: variable, from: [name, record] });
                self.block.addUsage(variable, functionRecord);
                self.block.expression(functionRecord);
                return functionRecord;
            }
        });
        //-----------------------------------------------------------
        // Comparison
        //-----------------------------------------------------------
        rule("comparison", function (nonFiltering) {
            var left = self.SUBRULE(self.expression);
            var from = [left];
            var rights = [];
            self.MANY(function () {
                var comparator = self.OR([
                    { ALT: function () { return self.CONSUME(Comparison); } },
                    { ALT: function () { return self.CONSUME(Equality); } }
                ]);
                var value = self.OR2([
                    { ALT: function () { return self.SUBRULE2(self.expression); } },
                    { ALT: function () { return self.SUBRULE(self.ifExpression); } }
                ]);
                from.push(comparator, value);
                rights.push({ comparator: comparator, value: value });
            });
            if (rights.length) {
                var expressions = [];
                var curLeft = left;
                for (var _i = 0, rights_1 = rights; _i < rights_1.length; _i++) {
                    var pair = rights_1[_i];
                    var comparator = pair.comparator, value = pair.value;
                    var expression = null;
                    // if this is a nonFiltering comparison, then we return an expression
                    // with a variable for its return value
                    if (nonFiltering) {
                        var variable = self.block.toVariable("comparison|" + comparator.startLine + "|" + comparator.startColumn, true);
                        expression = makeNode("expression", { variable: variable, op: comparator.image, args: [asValue(curLeft), asValue(value)], from: [curLeft, comparator, value] });
                        self.block.addUsage(variable, expression);
                        self.block.expression(expression);
                    }
                    else if (comparator instanceof Equality) {
                        if (value.type === "ifExpression") {
                            value.outputs = ifOutputs(left);
                            self.block.scan(value);
                        }
                        else if (value.type === "functionRecord" && curLeft.type === "parenthesis") {
                            value.returns = curLeft.items.map(asValue);
                            self.block.equality(asValue(value.returns[0]), asValue(value));
                        }
                        else if (curLeft.type === "parenthesis") {
                            throw new Error("Left hand parenthesis without an if or function on the right");
                        }
                        else {
                            self.block.equality(asValue(curLeft), asValue(value));
                        }
                    }
                    else {
                        expression = makeNode("expression", { op: comparator.image, args: [asValue(curLeft), asValue(value)], from: [curLeft, comparator, value] });
                        self.block.expression(expression);
                    }
                    curLeft = value;
                    if (expression) {
                        expressions.push(expression);
                    }
                }
                return makeNode("comparison", { expressions: expressions, from: from });
            }
            ;
            return left;
        });
        //-----------------------------------------------------------
        // Special Forms
        //-----------------------------------------------------------
        rule("notStatement", function () {
            var block = pushBlock();
            block.type = "not";
            var from = [
                self.CONSUME(Not),
                self.CONSUME(OpenParen),
            ];
            self.MANY(function () {
                from.push(self.SUBRULE(self.statement));
            });
            from.push(self.CONSUME(CloseParen));
            popBlock();
            block.from = from;
            block.startOffset = from[0].startOffset;
            block.endOffset = toEnd(from[from.length - 1]);
            self.block.scan(block);
            return;
        });
        rule("isExpression", function () {
            var op = self.CONSUME(Is);
            var from = [
                op,
                self.CONSUME(OpenParen)
            ];
            var expressions = [];
            self.MANY(function () {
                var comparison = self.SUBRULE(self.comparison, [true]);
                for (var _i = 0, _a = comparison.expressions; _i < _a.length; _i++) {
                    var expression = _a[_i];
                    from.push(expression);
                    expressions.push(asValue(expression));
                }
            });
            from.push(self.CONSUME(CloseParen));
            var variable = self.block.toVariable("is|" + op.startLine + "|" + op.startColumn, true);
            var is = makeNode("expression", { variable: variable, op: "and", args: expressions, from: from });
            self.block.addUsage(variable, is);
            self.block.expression(is);
            return is;
        });
        //-----------------------------------------------------------
        // If ... then
        //-----------------------------------------------------------
        rule("ifExpression", function () {
            var branches = [];
            var from = branches;
            branches.push(self.SUBRULE(self.ifBranch));
            self.MANY(function () {
                branches.push(self.OR([
                    { ALT: function () { return self.SUBRULE2(self.ifBranch); } },
                    { ALT: function () { return self.SUBRULE(self.elseIfBranch); } },
                ]));
            });
            self.OPTION(function () {
                branches.push(self.SUBRULE(self.elseBranch));
            });
            return makeNode("ifExpression", { branches: branches, from: from });
        });
        rule("ifBranch", function () {
            var block = pushBlock();
            var from = [
                self.CONSUME(If)
            ];
            self.AT_LEAST_ONE(function () {
                var statement = self.SUBRULE(self.statement);
                if (statement) {
                    from.push(statement);
                }
            });
            from.push(self.CONSUME(Then));
            var expression = self.SUBRULE(self.expression);
            from.push(expression);
            block.startOffset = from[0].startOffset;
            block.endOffset = toEnd(from[from.length - 1]);
            popBlock();
            return makeNode("ifBranch", { block: block, outputs: ifOutputs(expression), exclusive: false, from: from });
        });
        rule("elseIfBranch", function () {
            var block = pushBlock();
            var from = [
                self.CONSUME(Else),
                self.CONSUME(If),
            ];
            self.AT_LEAST_ONE(function () {
                var statement = self.SUBRULE(self.statement);
                if (statement) {
                    from.push(statement);
                }
            });
            from.push(self.CONSUME(Then));
            var expression = self.SUBRULE(self.expression);
            from.push(expression);
            block.startOffset = from[0].startOffset;
            block.endOffset = toEnd(from[from.length - 1]);
            popBlock();
            return makeNode("ifBranch", { block: block, outputs: ifOutputs(expression), exclusive: true, from: from });
        });
        rule("elseBranch", function () {
            var block = pushBlock();
            var from = [self.CONSUME(Else)];
            var expression = self.SUBRULE(self.expression);
            from.push(expression);
            block.startOffset = from[0].startOffset;
            block.endOffset = toEnd(from[from.length - 1]);
            popBlock();
            return makeNode("ifBranch", { block: block, outputs: ifOutputs(expression), exclusive: true, from: from });
        });
        //-----------------------------------------------------------
        // Infix and operator precedence
        //-----------------------------------------------------------
        rule("infix", function () {
            return self.SUBRULE(self.addition);
        });
        rule("addition", function () {
            var left = self.SUBRULE(self.multiplication);
            var from = [left];
            var ops = [];
            self.MANY(function () {
                var op = self.CONSUME(AddInfix);
                var right = self.SUBRULE2(self.multiplication);
                from.push(op, right);
                ops.push({ op: op, right: right });
            });
            if (!ops.length) {
                return left;
            }
            else {
                var expressions = [];
                var curVar = void 0;
                var curLeft = left;
                for (var _i = 0, ops_1 = ops; _i < ops_1.length; _i++) {
                    var pair = ops_1[_i];
                    var op = pair.op, right = pair.right;
                    curVar = self.block.toVariable("addition|" + op.startLine + "|" + op.startColumn, true);
                    var expression = makeNode("expression", { op: op.image, args: [asValue(curLeft), asValue(right)], variable: curVar, from: [curLeft, op, right] });
                    expressions.push(expression);
                    self.block.addUsage(curVar, expression);
                    self.block.expression(expression);
                    curLeft = expression;
                }
                return makeNode("addition", { expressions: expressions, variable: curVar, from: from });
            }
        });
        rule("multiplication", function () {
            var left = self.SUBRULE(self.infixValue);
            var from = [left];
            var ops = [];
            self.MANY(function () {
                var op = self.CONSUME(MultInfix);
                var right = self.SUBRULE2(self.infixValue);
                from.push(op, right);
                ops.push({ op: op, right: right });
            });
            if (!ops.length) {
                return left;
            }
            else {
                var expressions = [];
                var curVar = void 0;
                var curLeft = left;
                for (var _i = 0, ops_2 = ops; _i < ops_2.length; _i++) {
                    var pair = ops_2[_i];
                    var op = pair.op, right = pair.right;
                    curVar = self.block.toVariable("addition|" + op.startLine + "|" + op.startColumn, true);
                    var expression = makeNode("expression", { op: op.image, args: [asValue(curLeft), asValue(right)], variable: curVar, from: [curLeft, op, right] });
                    expressions.push(expression);
                    self.block.addUsage(curVar, expression);
                    self.block.expression(expression);
                    curLeft = expression;
                }
                return makeNode("multiplication", { expressions: expressions, variable: curVar, from: from });
            }
        });
        rule("parenthesis", function () {
            var items = [];
            var from = [];
            from.push(self.CONSUME(OpenParen));
            self.AT_LEAST_ONE(function () {
                var item = self.SUBRULE(self.expression);
                items.push(asValue(item));
                from.push(item);
            });
            from.push(self.CONSUME(CloseParen));
            if (items.length === 1) {
                return items[0];
            }
            return makeNode("parenthesis", { items: items, from: from });
        });
        rule("infixValue", function () {
            return self.OR([
                { ALT: function () { return self.SUBRULE(self.attributeAccess); } },
                { ALT: function () { return self.SUBRULE(self.functionRecord); } },
                { ALT: function () { return self.SUBRULE(self.isExpression); } },
                { ALT: function () { return self.SUBRULE(self.variable); } },
                { ALT: function () { return self.SUBRULE(self.value); } },
                { ALT: function () { return self.SUBRULE(self.parenthesis); } },
            ]);
        });
        //-----------------------------------------------------------
        // Expression
        //-----------------------------------------------------------
        rule("expression", function () {
            var blockKey, action;
            if (self.currentAction !== "match") {
                blockKey = self.currentAction;
                action = "+=";
            }
            return self.OR([
                { ALT: function () { return self.SUBRULE(self.infix); } },
                { ALT: function () { return self.SUBRULE(self.record, [false, blockKey, action]); } },
            ]);
        });
        //-----------------------------------------------------------
        // Variable
        //-----------------------------------------------------------
        rule("variable", function (forceGenerate) {
            if (forceGenerate === void 0) { forceGenerate = false; }
            var token = self.CONSUME(Identifier);
            var name = token.image;
            if (forceGenerate) {
                name = token.image + "-" + token.startLine + "-" + token.startColumn;
            }
            var variable = self.block.toVariable(name, forceGenerate);
            self.block.addUsage(variable, token);
            return variable;
        });
        //-----------------------------------------------------------
        // Values
        //-----------------------------------------------------------
        rule("stringInterpolation", function () {
            var args = [];
            var start = self.CONSUME(OpenString);
            var from = [start];
            self.MANY(function () {
                var arg = self.OR([
                    { ALT: function () {
                            var str = self.CONSUME(StringChars);
                            return makeNode("constant", { value: cleanString(str.image), from: [str] });
                        } },
                    { ALT: function () {
                            self.CONSUME(StringEmbedOpen);
                            var expression = self.SUBRULE(self.infix);
                            self.CONSUME(StringEmbedClose);
                            return expression;
                        } },
                ]);
                args.push(asValue(arg));
                from.push(arg);
            });
            from.push(self.CONSUME(CloseString));
            if (args.length === 1 && args[0].type === "constant") {
                return args[0];
            }
            var variable = self.block.toVariable("concat|" + start.startLine + "|" + start.startColumn, true);
            var expression = makeNode("expression", { op: "concat", args: args, variable: variable, from: from });
            self.block.addUsage(variable, expression);
            self.block.expression(expression);
            return expression;
        });
        rule("value", function () {
            return self.OR([
                { ALT: function () { return self.SUBRULE(self.stringInterpolation); } },
                { ALT: function () { return self.SUBRULE(self.num); } },
                { ALT: function () { return self.SUBRULE(self.bool); } },
            ]);
        });
        rule("bool", function () {
            var value = self.CONSUME(Bool);
            return makeNode("constant", { value: value.image === "true", from: [value] });
        });
        rule("num", function () {
            var num = self.CONSUME(Num);
            return makeNode("constant", { value: parseFloat(num.image), from: [num] });
        });
        //-----------------------------------------------------------
        // Chevrotain analysis
        //-----------------------------------------------------------
        Parser.performSelfAnalysis(this);
    }
    return Parser;
}(chev.Parser));
//-----------------------------------------------------------
// Public API
//-----------------------------------------------------------
function nodeToBoundaries(node, offset) {
    if (offset === void 0) { offset = 0; }
    return [node.startOffset, toEnd(node)];
}
exports.nodeToBoundaries = nodeToBoundaries;
var eveParser = new Parser([]);
function parseBlock(block, blockId, offset, spans, extraInfo) {
    if (offset === void 0) { offset = 0; }
    if (spans === void 0) { spans = []; }
    if (extraInfo === void 0) { extraInfo = {}; }
    var start = performance_1.time();
    var lex = EveBlockLexer.tokenize(block);
    var token;
    var tokenIx = 0;
    for (var _i = 0, _a = lex.tokens; _i < _a.length; _i++) {
        token = _a[_i];
        var tokenId = blockId + "|token|" + tokenIx++;
        token.id = tokenId;
        token.startOffset += offset;
        spans.push(token.startOffset, token.startOffset + token.image.length, token.label, tokenId);
    }
    for (var _b = 0, _c = lex.groups.comments; _b < _c.length; _b++) {
        token = _c[_b];
        var tokenId = blockId + "|token|" + tokenIx++;
        token.id = tokenId;
        token.startOffset += offset;
        spans.push(token.startOffset, token.startOffset + token.image.length, token.label, tokenId);
    }
    eveParser.input = lex.tokens;
    // The parameters here are a strange quirk of how Chevrotain works, I believe the
    // 1 tells chevrotain what level the rule is starting at, we then pass our params
    // to the codeBlock parser function as an array
    var results = eveParser.codeBlock(1, [blockId]);
    if (results) {
        results.start = offset;
        results.startOffset = offset;
        results.tokens = lex.tokens;
        for (var _d = 0, _e = results.scanLike; _d < _e.length; _d++) {
            var scan = _e[_d];
            var type = "scan-boundary";
            if (scan.type === "record") {
                type = "record-boundary";
            }
            spans.push(scan.startOffset, scan.endOffset, type, scan.id);
        }
        for (var _f = 0, _g = results.binds; _f < _g.length; _f++) {
            var action = _g[_f];
            var type = "action-boundary";
            if (action.type === "record") {
                type = "action-record-boundary";
            }
            spans.push(action.startOffset, action.endOffset, type, action.id);
            extraInfo[action.id] = { kind: "bind" };
        }
        for (var _h = 0, _j = results.commits; _h < _j.length; _h++) {
            var action = _j[_h];
            var type = "action-boundary";
            if (action.type === "record") {
                type = "action-record-boundary";
            }
            spans.push(action.startOffset, action.endOffset, type, action.id);
            extraInfo[action.id] = { kind: "commits" };
        }
    }
    var errors = errors_1.parserErrors(eveParser.errors, { blockId: blockId, blockStart: offset, spans: spans, extraInfo: extraInfo, tokens: lex.tokens });
    lex.groups.comments.length = 0;
    return {
        results: results,
        lex: lex,
        time: performance_1.time(start),
        errors: errors,
    };
}
exports.parseBlock = parseBlock;
var docIx = 0;
function parseDoc(doc, docId) {
    if (docId === void 0) { docId = "doc|" + docIx++; }
    var start = performance_1.time();
    var _a = parseMarkdown(doc, docId), text = _a.text, spans = _a.spans, blocks = _a.blocks, extraInfo = _a.extraInfo;
    var parsedBlocks = [];
    var allErrors = [];
    for (var _i = 0, blocks_1 = blocks; _i < blocks_1.length; _i++) {
        var block = blocks_1[_i];
        if (block.info !== "" && block.info.indexOf("eve") === -1)
            continue;
        var _b = parseBlock(block.literal, block.id, block.startOffset, spans, extraInfo), results = _b.results, lex = _b.lex, errors = _b.errors;
        extraInfo[block.id] = { info: block.info };
        // if this block is disabled, we want the parsed spans and such, but we don't want
        // the block to be in the set sent to the builder
        if (block.info.indexOf("disabled") > -1) {
            extraInfo[block.id].disabled = true;
        }
        else if (errors.length) {
            allErrors.push(errors);
        }
        else {
            results.endOffset = block.endOffset;
            parsedBlocks.push(results);
        }
    }
    return {
        results: { blocks: parsedBlocks, text: text, spans: spans, extraInfo: extraInfo },
        time: performance_1.time(start),
        errors: allErrors,
    };
}
exports.parseDoc = parseDoc;
//# sourceMappingURL=parser.js.map