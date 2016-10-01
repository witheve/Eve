//-----------------------------------------------------------
// Parser
//-----------------------------------------------------------

import * as commonmark from "commonmark";
import * as chev from "chevrotain";
import * as join from "./join";
import {buildDoc} from "./builder";
import {inspect} from "util"
import {time} from "./performance";
var {Lexer} = chev;
var Token = chev.Token;

//-----------------------------------------------------------
// Utils
//-----------------------------------------------------------

function cleanString(str) {
  let cleaned = str
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r")
    .replace(/\\"/g, "\"")
    .replace(/\\{/g, "{")
    .replace(/\\}/g, "}");
  return cleaned;
}

//-----------------------------------------------------------
// Markdown
//-----------------------------------------------------------

let markdownParser = new commonmark.Parser();

function parseMarkdown(markdown: string, docId: string) {
  let parsed = markdownParser.parse(markdown);
  let walker = parsed.walker();
  var cur;
  let tokenId = 0;
  var text = [];
  var extraInfo = {};
  var pos = 0;
  var lastLine = 1;
  var spans = [];
  var context = [];
  var blocks = [];
  while(cur = walker.next()) {
    let node = cur.node;
    if(cur.entering) {
      while(node.sourcepos && node.sourcepos[0][0] > lastLine) {
        lastLine++;
        pos++;
        text.push("\n");
      }
      if(node.type !== "text") {
        context.push({node, start: pos});
      }
      if(node.type == "text" || node.type === "code_block" || node.type == "code") {
        text.push(node.literal);
        pos += node.literal.length;
      }
      if(node.type == "softbreak") {
        text.push("\n");
        pos += 1;
        lastLine++;
      }
      if(node.type == "code_block") {
        let spanId = `${docId}|${tokenId++}|block`;
        let start = context[context.length - 1].start;
        node.id = spanId;
        node.startOffset = start;
        spans.push(start, pos, node.type, spanId);
        blocks.push(node);
        lastLine = node.sourcepos[1][0] + 1;
      }
      if(node.type == "code") {
        let spanId = `${docId}|${tokenId++}`;
        let start = context[context.length - 1].start;
        spans.push(start, pos, node.type, spanId);
      }
    } else {
      let info = context.pop();
      if(node.type == "emph" || node.type == "strong" || node.type == "link") {
        let spanId = `${docId}|${tokenId++}`;
        spans.push(info.start, pos, node.type, spanId);
        if(node.type === "link") {
          extraInfo[spanId] = {destination: node._destination};
        }
      } else if(node.type == "heading" || node.type == "item") {
        let spanId = `${docId}|${tokenId++}`;
        spans.push(info.start, info.start, node.type, spanId);
        extraInfo[spanId] = {level: node._level, listData: node._listData};
      }
    }
  }
  return {text: text.join(""), spans, blocks, extraInfo};
}

//-----------------------------------------------------------
// Tokens
//-----------------------------------------------------------

const breakChars = "@#\\.,\\(\\)\\[\\]{}⦑⦒:\\\"";

// Markdown
class DocContent extends Token { static PATTERN = /[^\n]+/; }
class Fence extends Token {
  static PATTERN = /```|~~~/;
  static PUSH_MODE = "code";
}
class CloseFence extends Token {
  static PATTERN = /```|~~~/;
  static POP_MODE = true;
}

// Comments
class CommentLine extends Token { static PATTERN = /\/\/.*\n/; label = "comment"; }

// Operators
class Equality extends Token { static PATTERN = /:|=/; label = "equality"; }
class Comparison extends Token { static PATTERN = />=|<=|!=|>|</; label = "comparison"; }
class AddInfix extends Token { static PATTERN = /\+|-/; label = "addInfix"; }
class MultInfix extends Token { static PATTERN = /\*|\//; label = "multiInfix"; }
class Merge extends Token { static PATTERN = /<-/; label = "merge"; }
class Set extends Token { static PATTERN = /:=/; label = "set"; }
class Mutate extends Token { static PATTERN = /\+=|-=/; label = "mutate"; }
class Dot extends Token { static PATTERN = /\./; label = "dot"; }
class Pipe extends Token { static PATTERN = /\|/; label = "pipe"; }

// Identifier
class Identifier extends Token { static PATTERN = new RegExp(`[\\+-/\\*][^\\s${breakChars}]+|[^\\d${breakChars}\\+-/\\*][^\\s${breakChars}]*`); label = "identifier"; }

// Keywords
class Keyword extends Token {
    static PATTERN = Lexer.NA;
    static LONGER_ALT = Identifier;
}
class Action extends Keyword { static PATTERN = /bind|commit/; label = "action"; }
class Match extends Keyword { static PATTERN = /match/; label = "match"; }
class Is extends Keyword { static PATTERN = /is/; label = "is"; }
class If extends Keyword { static PATTERN = /if/; label = "if"; }
class Else extends Keyword { static PATTERN = /else/; label = "else"; }
class Then extends Keyword { static PATTERN = /then/; label = "then"; }
class Not extends Keyword { static PATTERN = /not/; label = "not"; }

// Values
class Bool extends Keyword { static PATTERN = /true|false/; label = "bool"; }
class Num extends Token { static PATTERN = /-?\d+(\.\d+)?/; label = "num"; }
class None extends Keyword { static PATTERN = /none/; label = "none"; }
class Name extends Token { static PATTERN = /@/; label = "name"; }
class Tag extends Token { static PATTERN = /#/; label = "tag"; }
class Uuid extends Token { static PATTERN = /⦑.*⦒/; label = "uuid"; }

// Delimiters
class OpenBracket extends Token { static PATTERN = /\[/; label = "open-bracket"; }
class CloseBracket extends Token { static PATTERN = /\]/; label = "close-bracket"; }
class OpenParen extends Token { static PATTERN = /\(/; label = "open-paren"; }
class CloseParen extends Token { static PATTERN = /\)/; label = "close-paren"; }

// Strings
class StringChars extends Token { static PATTERN = /(\\.|{(?=[^{])|[^"\\{])+/; label = "string"; }
class StringOpen extends Token {
  static PATTERN = /"/;
  static PUSH_MODE = "string";
  label = "quote";
}
class StringClose extends Token {
  static PATTERN = /"/;
  static POP_MODE = true;
  label = "quote";
}

// String Embeds
class StringEmbedOpen extends Token {
  static PATTERN = /{{/;
  static PUSH_MODE = "code";
  label = "string-embed-open";
}
class StringEmbedClose extends Token {
  static PATTERN = /}}/;
  static POP_MODE = true;
  label = "string-embed-close";
}

// Whitespace
class WhiteSpace extends Token {
  static PATTERN = /\s+|,/;
  static GROUP = Lexer.SKIPPED;
}

//-----------------------------------------------------------
// Lexers
//-----------------------------------------------------------

let codeTokens: any[] = [
  CloseFence, WhiteSpace, CommentLine, OpenBracket, CloseBracket, OpenParen,
  CloseParen, StringEmbedClose, StringOpen, Bool, Action, Set, Equality, Dot, Pipe, Merge,
  Mutate, Comparison, Num,  Match, Is, If, Else, Then,
  Not, None, Name, Tag, Uuid, Identifier, AddInfix, MultInfix
];

let stringEmbedTokens: any[] = [StringEmbedClose].concat(codeTokens);

let LexerModes:any = {
  "doc": [WhiteSpace, Fence, DocContent],
  "code": codeTokens,
  "string": [StringClose, StringEmbedOpen, StringChars],
  // "stringEmbed": stringEmbedTokens,
};

let allTokens: any[] = codeTokens.concat([Fence, DocContent, StringClose, StringEmbedOpen, StringEmbedClose, StringChars]);

let EveDocLexer = new Lexer({modes: LexerModes, defaultMode: "doc"}, true);
let EveBlockLexer = new Lexer({modes: LexerModes, defaultMode: "code"}, true);

//-----------------------------------------------------------
// Parser
//-----------------------------------------------------------

class Parser extends chev.Parser {
  rootBlock: any;
  activeBlock: any;
  allVariables: any;
  activeScopes: string[];

  // Parser patterns
  doc: any;
  block: any;
  fencedBlock: any;
  section: any;
  matchSection: any;
  actionSection: any;
  value: any;
  bool: any;
  num: any;
  stringLiteral: any;
  scopeDeclaration: any;
  name: any;
  statement: any;
  expression: any;
  attribute: any;
  attributeEquality: any;
  attributeComparison: any;
  attributeNot: any;
  attributeOperation: any;
  record: any;
  tag: any;
  functionRecord: any;
  notStatement: any;
  comparison: any;
  infix: any;
  attributeAccess: any;
  actionStatement: any;
  actionEqualityRecord: any;
  actionAttributeExpression: any;
  actionOperation: any;
  variable: any;
  recordOperation: any;
  ifExpression: any;
  ifBranch: any;
  elseIfBranch: any;
  elseBranch: any;
  multiplication: any;
  addition: any;
  infixValue: any;
  parenthesis: any;
  attributeMutator: any;
  singularAttribute: any;
  stringInterpolation: any;
  isExpression: any;


  constructor(input) {
    super(input, allTokens, {recoveryEnabled: false});
    let $ = this;
    let rule = (name, func) => {
      $[name] = $.RULE(name, func);
    }
    let getOrSetVariable = (name, generated = false) => {
      let variable = $.allVariables[name];
      if(!variable) {
        $.allVariables[name] = {type: "variable", name, usages: [], generated};
      }
      variable = $.activeBlock.variables[name] = $.allVariables[name];
      return variable;
    }
    let asValue = (node) => {
      if(node.type === "constant" || node.type === "variable" || node.type === "parenthesis") {
        return node;
      } else if(node.variable) {
        return node.variable;
      }
      throw new Error("Tried to get value of a node that is neither a constant nor a variable.\n\n" + inspect(node));
    }
    let ifOutputs = (expression) => {
      let outputs = [];
      if(expression.type === "parenthesis") {
        for(let item of expression.items) {
          outputs.push(asValue(item));
        }
      } else {
        outputs.push(asValue(expression));
      }
      return outputs;
    }
    let blockStack = [];
    let pushBlock = () => {
      let block = {
        type: "block",
        variables: {},
        equalities: [],
        scanLike: [],
        expressions: [],
        binds: [],
        commits: [],
        parse: undefined,
        allVariables: undefined,
      };
      blockStack.push(block);
      $.activeBlock = block;
      return block;
    }

    let popBlock = () => {
      let popped = blockStack.pop();
      $.activeBlock = blockStack[blockStack.length - 1];
      return popped;
    }

    //-----------------------------------------------------------
    // Doc rules
    //-----------------------------------------------------------

    rule("doc", () => {
      let doc = {
        full: [],
        content: [],
        blocks: [],
      }
      $.MANY(() => {
        $.OR([
          {ALT: () => {
            let content = $.CONSUME(DocContent);
            doc.full.push(content);
            doc.content.push(content);
          }},
          {ALT: () => {
            let block : any = $.SUBRULE($.fencedBlock);
            if(doc.content.length) {
              block.name = doc.content[doc.content.length - 1].image;
            } else {
              block.name = "Unnamed block";
            }
            doc.full.push(block);
            doc.blocks.push(block);
          }},
        ])
      });
      return doc;
    });

    rule("fencedBlock", () => {
      $.CONSUME(Fence);
      let block = $.SUBRULE($.block);
      let fence = $.CONSUME(CloseFence);
      return block;
    });

    //-----------------------------------------------------------
    // Blocks
    //-----------------------------------------------------------

    rule("block", () => {
      let block = pushBlock();
      $.rootBlock = block;
      let sections = [];
      $.allVariables = {};
      $.MANY(() => { sections.push($.SUBRULE($.section)) })
      // console.log("--block------------------------------------------\n");
      // console.log(inspect($.activeBlock, {colors: true, depth: 20}));
      // console.log("\n-------------------------------------------------\n");
      block.parse = {type: "parse", sections}
      block.allVariables = $.allVariables;
      return popBlock();
    })

    rule("section", () => {
      return $.OR([
        {ALT: () => { return $.SUBRULE($.matchSection) }},
        {ALT: () => { return $.SUBRULE($.actionSection) }},
        {ALT: () => { return $.CONSUME(CommentLine); }},
      ]);
    });


    //-----------------------------------------------------------
    // Scope declaration
    //-----------------------------------------------------------

    rule("scopeDeclaration", () => {
      let scopes = [];
      $.OR([
        {ALT: () => {
          $.CONSUME(OpenParen);
          $.AT_LEAST_ONE(() => {
            let name: any = $.SUBRULE($.name);
            scopes.push(name.name);
          })
          $.CONSUME(CloseParen);
        }},
        {ALT: () => {
          let name: any = $.SUBRULE2($.name);
          scopes.push(name.name);
        }},
      ]);
      return scopes;
    });


    //-----------------------------------------------------------
    // Match section
    //-----------------------------------------------------------

    rule("matchSection", () => {
      $.CONSUME(Match);
      let scopes:any = ["session"];
      $.OPTION(() => { scopes = $.SUBRULE($.scopeDeclaration) })
      $.activeScopes = scopes;
      let statements = [];
      $.MANY(() => {
        let statement: any = $.SUBRULE($.statement);
        if(statement) {
          statements.push(statement);
          statement.scopes = scopes;
        }
      });
      return {type: "match", statements, scopes};
    });

    rule("statement", () => {
      return $.OR([
        {ALT: () => { return $.SUBRULE($.comparison); }},
        {ALT: () => { return $.SUBRULE($.notStatement); }},
        {ALT: () => { return $.CONSUME(CommentLine); }},
      ])
    });

    //-----------------------------------------------------------
    // Action section
    //-----------------------------------------------------------

    rule("actionSection", () => {
      let action = $.CONSUME(Action).image;
      let actionKey = action + "s";
      let scopes:any = ["session"];
      $.OPTION(() => { scopes = $.SUBRULE($.scopeDeclaration) })
      $.activeScopes = scopes;
      let statements = [];
      $.MANY(() => {
        let statement = $.SUBRULE($.actionStatement, [actionKey]) as any;
        if(statement) {
          statements.push(statement);
          statement.scopes = scopes;
        }
      });
      return {type: "action", statements, scopes};
    });


    rule("actionStatement", (actionKey) => {
      return $.OR([
        {ALT: () => {
          let record = $.SUBRULE($.record, [false, actionKey, "+="]);
          return record;
        }},
        {ALT: () => { return $.SUBRULE($.actionEqualityRecord, [actionKey]); }},
        {ALT: () => {
          let record = $.SUBRULE($.actionOperation, [actionKey]);
          $.activeBlock[actionKey].push(record);
          return record;
        }},
        {ALT: () => { return $.CONSUME(CommentLine); }},
      ])
    });

    //-----------------------------------------------------------
    // Action operations
    //-----------------------------------------------------------

    rule("actionOperation", (actionKey) => {
      return $.OR([
        {ALT: () => { return $.SUBRULE($.recordOperation, [actionKey]) }},
        {ALT: () => { return $.SUBRULE($.attributeOperation, [actionKey]) }},
      ]);
    });

    rule("attributeOperation", (actionKey) => {
      let {attribute, parent} = $.SUBRULE($.attributeMutator) as any;
      return $.OR([
        {ALT: () => {
          let variable = getOrSetVariable(`${attribute.image}|${attribute.startLine}|${attribute.startColumn}`, true);
          $.activeBlock.scanLike({type: "scan", entity: parent, attribute: {type: "constant", value: attribute.name}, value: variable, scopes: $.activeScopes});
          $.CONSUME(Merge);
          let record = $.SUBRULE($.record, [true]) as any;
          record.variable = variable;
          record.action = "<-";
          return record;
        }},
        {ALT: () => {
          let op = $.CONSUME(Set);
          $.CONSUME(None);
          return {type: "action", action: "erase", entity: asValue(parent), attribute: attribute.image};
        }},
        {ALT: () => {
          let op = $.CONSUME2(Set);
          let value = $.SUBRULE($.infix);
          return {type: "action", action: op.image, entity: asValue(parent), attribute: attribute.image, value: asValue(value)};
        }},
        {ALT: () => {
          let op = $.CONSUME3(Set);
          let value = $.SUBRULE2($.record, [false, actionKey, "+="]);
          return {type: "action", action: op.image, entity: asValue(parent), attribute: attribute.image, value: asValue(value)};
        }},
        {ALT: () => {
          let op = $.CONSUME(Mutate);
          let value = $.SUBRULE2($.actionAttributeExpression, [actionKey, op.image]);
          return {type: "action", action: op.image, entity: asValue(parent), attribute: attribute.image, value: asValue(value)};
        }},
      ])
    });

    rule("recordOperation", () => {
      let variable = $.SUBRULE($.variable) as any;
      return $.OR([
        {ALT: () => {
          $.CONSUME(Set);
          $.CONSUME(None);
          return {type: "action", action: "erase", entity: asValue(variable)};
        }},
        {ALT: () => {
          $.CONSUME(Merge);
          let record = $.SUBRULE($.record, [true]) as any;
          record.needsEntity = true;
          record.variable = variable;
          variable.nonProjecting = true;
          record.action = "<-";
          return record;
        }},
        {ALT: () => {
          let op = $.CONSUME(Mutate);
          let tag : any = $.SUBRULE($.tag);
          return {type: "action", action: op.image, entity: asValue(variable), attribute: "tag", value: {type: "constant", value: tag.tag}};
        }},
        {ALT: () => {
          let op = $.CONSUME2(Mutate);
          let name : any = $.SUBRULE($.name);
          return {type: "action", action: op.image, entity: asValue(variable), attribute: "name", value: {type: "constant", value: name.name}};
        }},
      ])
    });

    rule("actionAttributeExpression", (actionKey, action) => {
      return $.OR([
        {ALT: () => { return $.CONSUME(None); }},
        {ALT: () => { return $.SUBRULE($.tag); }},
        {ALT: () => { return $.SUBRULE($.name); }},
        {ALT: () => { return $.SUBRULE($.record, [false, actionKey, action]); }},
        {ALT: () => { return $.SUBRULE($.infix); }},
      ])
    })

    rule("actionEqualityRecord", (actionKey) => {
      let variable = $.SUBRULE($.variable);
      $.CONSUME(Equality);
      let record : any = $.SUBRULE($.record, [true, actionKey, "+="]);
      record.variable = variable;
      $.activeBlock[actionKey].push(record);
      return record;
    });

    //-----------------------------------------------------------
    // Record + attribute
    //-----------------------------------------------------------

    rule("record", (noVar = false, blockKey = "scanLike", action = false, parent?) => {
      let attributes = [];
      let start = $.CONSUME(OpenBracket);
      let record : any = {type: "record", attributes, start, action, scopes: $.activeScopes }
      if(parent) {
        record.extraProjection = [parent];
      }
      if(!noVar) {
        record.variable = getOrSetVariable(`record|${start.startLine}|${start.startColumn}`, true);
        record.variable.nonProjecting = true;
      }
      let nonProjecting = false;
      $.MANY(() => {
        $.OR([
          {ALT: () => {
            let attribute: any = $.SUBRULE($.attribute, [false, blockKey, action, record.variable]);
            // Inline handles attributes itself and so won't return any attribute for us to add
            // to this object
            if(!attribute) return;

            if(attribute.constructor === Array) {
              for(let attr of attribute as any[]) {
                attr.nonProjecting = nonProjecting;
                attributes.push(attr);
              }
            } else {
              attribute.nonProjecting = nonProjecting;
              attributes.push(attribute);
            }
          }},
          {ALT: () => {
            nonProjecting = true;
            return $.CONSUME(Pipe);
          }},
        ]);
      })
      let end = $.CONSUME(CloseBracket);
      record.end = end;
      if(!noVar) {
        $.activeBlock[blockKey].push(record);
      }
      return record;
    });

    rule("attribute", (noVar, blockKey, action, recordVariable) => {
      return $.OR([
        {ALT: () => { return $.SUBRULE($.attributeEquality, [noVar, blockKey, action, recordVariable]); }},
        {ALT: () => { return $.SUBRULE($.attributeComparison); }},
        {ALT: () => { return $.SUBRULE($.attributeNot, [recordVariable]); }},
        {ALT: () => { return $.SUBRULE($.singularAttribute); }},
      ]);
    });

    rule("singularAttribute", () => {
      return $.OR([
        {ALT: () => {
          let name : any = $.SUBRULE($.name);
          return {type: "attribute", attribute: "name", value: {type: "constant", value: name.name}};
        }},
        {ALT: () => {
          let tag : any = $.SUBRULE($.tag);
          return {type: "attribute", attribute: "tag", value: {type: "constant", value: tag.tag}};
        }},
        {ALT: () => {
          let variable : any = $.SUBRULE($.variable);
          return {type: "attribute", attribute: variable.name, value: variable};
        }},
      ]);
    });

    rule("attributeMutator", () => {
      let scans = [];
      let entity, attribute, value;
      let needsEntity = true;
      entity = $.SUBRULE($.variable);
      $.CONSUME(Dot);
      $.MANY(() => {
        attribute = $.CONSUME(Identifier);
        $.CONSUME2(Dot);
        value = getOrSetVariable(`${attribute.image}|${attribute.startLine}|${attribute.startColumn}`, true);
        value.usages.push(attribute);
        $.activeBlock.scanLike({type: "scan", entity, attribute: {type: "constant", value: value.name}, value, needsEntity, scopes: $.activeScopes});
        needsEntity = false;
        entity = value;
      });
      attribute = $.CONSUME2(Identifier);
      return {type: "attributeMutator", attribute: attribute, parent: entity};
    });

    rule("attributeAccess", () => {
      let scans = [];
      let entity, attribute, value;
      let needsEntity = true;
      entity = $.SUBRULE($.variable);
      $.AT_LEAST_ONE(() => {
        $.CONSUME(Dot);
        attribute = $.CONSUME(Identifier);
        value = getOrSetVariable(`${attribute.image}|${attribute.startLine}|${attribute.startColumn}`, true);
        value.usages.push(attribute);
        $.activeBlock.scanLike.push({type: "scan", entity, attribute: {type: "constant", value: attribute.image}, value, needsEntity, scopes: $.activeScopes});
        needsEntity = false;
        entity = value;
      });
      return value;
    });

    rule("attributeEquality", (noVar, blockKey, action, parent) => {
      let attributes = [];
      let autoIndex = 1;
      let attribute: any = $.OR([
        {ALT: () => {
          return $.CONSUME(Identifier).image;
        }},
        {ALT: () => {
          let numString: string = $.CONSUME(Num).image;
          return parseFloat(numString) as any;
        }}
      ]);
      $.CONSUME(Equality);
      let result : any;
      $.OR2([
        {ALT: () => {
          result = $.SUBRULE($.infix);
        }},
        {ALT: () => {
          result = $.SUBRULE($.record, [noVar, blockKey, action, parent]);
          $.MANY(() => {
            autoIndex++;
            let record : any = $.SUBRULE2($.record, [noVar, blockKey, action, parent]);
            record.attributes.push({type: "attribute", attribute: "eve-auto-index", value: {type: "constant", value: autoIndex}})
            attributes.push({type: "attribute", attribute, value: asValue(record)});
          })
          if(autoIndex > 1) {
            result.attributes.push({type: "attribute", attribute: "eve-auto-index", value: {type: "constant", value: 1}})
          }
        }},
      ]);
      attributes.push({type: "attribute", attribute, value: asValue(result)})
      return attributes;
    });

    rule("attributeComparison", () => {
      let attribute = $.CONSUME(Identifier);
      let comparator = $.CONSUME(Comparison);
      let result = $.SUBRULE($.expression);
      let variable = getOrSetVariable(`attribute|${attribute.startLine}|${attribute.startColumn}`, true);
      $.activeBlock.expressions.push({type: "expression", op: comparator.image, args: [asValue(variable), asValue(result)]});
      return {type: "attribute", attribute: attribute.image, value: variable};
    });

    rule("attributeNot", (recordVariable) => {
      let block = pushBlock();
      block.type = "not";
      $.CONSUME(Not);
      let start = $.CONSUME(OpenParen);
      let attribute: any = $.OR([
        {ALT: () => { return $.SUBRULE($.attributeComparison); }},
        {ALT: () => { return $.SUBRULE($.singularAttribute); }},
      ]);
      let end = $.CONSUME(CloseParen);
      // we have to add a record for this guy
      let scan : any = {type: "scan", entity: recordVariable, attribute: {type: "constant", value: attribute.attribute}, value: attribute.value, start, end, needsEntity: true, scopes: $.activeScopes};
      block.variables[recordVariable.name] = recordVariable;
      block.scanLike.push(scan);
      popBlock();
      $.activeBlock.scanLike.push(block);
      return;
    });

    //-----------------------------------------------------------
    // Name and tag
    //-----------------------------------------------------------

    rule("name", () => {
      let name;
      $.CONSUME(Name);
      $.OR([
        {ALT: () => { name = $.CONSUME(Identifier).image; }},
        {ALT: () => { name = $.SUBRULE($.stringLiteral); }},
      ]);
      return {type: "name", name};
    });

    rule("tag", () => {
      let tag;
      $.CONSUME(Tag);
      $.OR([
        {ALT: () => { tag = $.CONSUME(Identifier).image; }},
        {ALT: () => { tag = $.SUBRULE($.stringLiteral); }},
      ]);
      return {type: "tag", tag};
    });

    //-----------------------------------------------------------
    // Function
    //-----------------------------------------------------------

    rule("functionRecord", (): any => {
      let name = $.CONSUME(Identifier);
      let record: any = $.SUBRULE($.record, [true]);
      if(name.image === "lookup") {
        let info: any = {};
        for(let attribute of record.attributes) {
          info[attribute.attribute] = attribute.value;
        }
        let scan = {type: "scan", entity: info.record, attribute: info.attribute, value: info.value, node: info.node, scopes: $.activeScopes};
        $.activeBlock.scanLike.push(scan);
        return scan;
      } else {
        let variable = getOrSetVariable(`return|${name.startLine}|${name.startColumn}`, true);
        let functionRecord = {type: "functionRecord", op: name.image, record, variable};
        $.activeBlock.expressions.push(functionRecord);
        return functionRecord;
      }
    });

    //-----------------------------------------------------------
    // Comparison
    //-----------------------------------------------------------

    rule("comparison", (nonFiltering) : any => {
      let left = $.SUBRULE($.expression);
      let rights = [];
      $.MANY(() => {
        let comparator = $.OR([
          {ALT: () => { return $.CONSUME(Comparison); }},
          {ALT: () => { return $.CONSUME(Equality); }}
        ]);
        let value = $.OR2([
          {ALT: () => { return $.SUBRULE2($.expression); }},
          {ALT: () => { return $.SUBRULE($.ifExpression); }}
        ]);
        rights.push({comparator, value});
      })
      if(rights.length) {
        let expressions = [];
        let curLeft: any = left;
        for(let pair of rights) {
          let {comparator, value} = pair;
          let expression = null;
          // if this is a nonFiltering comparison, then we return an expression
          // with a variable for its return value
          if(nonFiltering) {
            let variable = getOrSetVariable(`comparison|${comparator.startLine}|${comparator.startColumn}`, true);
            expression = {type: "expression", variable, op: comparator.image, args: [asValue(curLeft), asValue(value)]};
            $.activeBlock.expressions.push(expression);
          } else if(comparator instanceof Equality) {
            if(value.type === "ifExpression") {
              value.outputs = ifOutputs(left);
              $.activeBlock.scanLike.push(value);
            } else if(value.type === "functionRecord" && curLeft.type === "parenthesis") {
              value.returns = curLeft.items.map(asValue);
              $.activeBlock.equalities.push([asValue(value.returns[0]), asValue(value)]);
            } else if(curLeft.type === "parenthesis") {
              throw new Error("Left hand parenthesis without an if or function on the right");
            } else {
              $.activeBlock.equalities.push([asValue(curLeft), asValue(value)]);
            }
          } else {
            expression = {type: "expression", op: comparator.image, args: [asValue(curLeft), asValue(value)]};
            $.activeBlock.expressions.push(expression);
          }
          curLeft = value;
          if(expression) {
            expressions.push(expression);
          }
        }
        return {type: "comparison", expressions};
      };
      return left;
    });

    //-----------------------------------------------------------
    // Special Forms
    //-----------------------------------------------------------

    rule("notStatement", () => {
      let block = pushBlock();
      block.type = "not";
      $.CONSUME(Not);
      $.CONSUME(OpenParen);
      $.MANY(() => {
        $.SUBRULE($.statement);
      });
      $.CONSUME(CloseParen);
      popBlock();
      $.activeBlock.scanLike.push(block);
      return;
    });

    rule("isExpression", () => {
      let op = $.CONSUME(Is);
      $.CONSUME(OpenParen);
      let expressions = [];
      $.MANY(() => {
        let comparison: any = $.SUBRULE($.comparison, [true]);
        for(let expression of comparison.expressions) {
          expressions.push(asValue(expression));
        }
      });
      $.CONSUME(CloseParen);
      let variable = getOrSetVariable(`is|${op.startLine}|${op.startColumn}`, true);
      let is = {type: "expression", variable, op: "and", args: expressions};
      $.activeBlock.expressions.push(is);
      return is;
    });

    //-----------------------------------------------------------
    // If ... then
    //-----------------------------------------------------------

    rule("ifExpression", () => {
      let branches = [];
      branches.push($.SUBRULE($.ifBranch));
      $.MANY(() => {
        branches.push($.OR([
          {ALT: () => { return $.SUBRULE2($.ifBranch); }},
          {ALT: () => { return $.SUBRULE($.elseIfBranch); }},
        ]));
      });
      $.OPTION(() => {
        branches.push($.SUBRULE($.elseBranch));
      });
      return {type: "ifExpression", branches};
    });

    rule("ifBranch", () => {
      let block = pushBlock();
      $.CONSUME(If);
      $.AT_LEAST_ONE(() => {
        $.SUBRULE($.statement);
      })
      $.CONSUME(Then);
      let outputs = ifOutputs($.SUBRULE($.expression));
      popBlock();
      return {type: "ifBranch", block, outputs, exclusive: false};
    });

    rule("elseIfBranch", () => {
      let block = pushBlock();
      $.CONSUME(Else);
      $.CONSUME(If);
      $.AT_LEAST_ONE(() => {
        $.SUBRULE($.statement);
      })
      $.CONSUME(Then);
      let outputs = ifOutputs($.SUBRULE($.expression));
      popBlock();
      return {type: "ifBranch", block, outputs, exclusive: true};
    });

    rule("elseBranch", () => {
      let block = pushBlock();
      $.CONSUME(Else);
      let outputs = ifOutputs($.SUBRULE($.expression));
      popBlock();
      return {type: "ifBranch", block, outputs, exclusive: true};
    });

    //-----------------------------------------------------------
    // Infix and operator precedence
    //-----------------------------------------------------------

    rule("infix", () => {
      return $.SUBRULE($.addition);
    });

    rule("addition", () : any => {
      let left = $.SUBRULE($.multiplication);
      let ops = [];
      $.MANY(function() {
        let op = $.CONSUME(AddInfix);
        let right = $.SUBRULE2($.multiplication);
        ops.push({op, right})
      });
      if(!ops.length) {
        return left;
      } else {
        let expressions = [];
        let curVar;
        let curLeft = left;
        for(let pair of ops) {
          let {op, right} = pair;
          curVar = getOrSetVariable(`addition|${op.startLine}|${op.startColumn}`, true);
          let expression = {type: "expression", op: op.image, args: [asValue(curLeft), asValue(right)], variable: curVar};
          expressions.push(expression);
          $.activeBlock.expressions.push(expression)
          curLeft = expression;
        }
        return {type: "addition", expressions, variable: curVar};
      }
    });

    rule("multiplication", () : any => {
      let left = $.SUBRULE($.infixValue);
      let ops = [];
      $.MANY(function() {
        let op = $.CONSUME(MultInfix);
        let right = $.SUBRULE2($.infixValue);
        ops.push({op, right})
      });
      if(!ops.length) {
        return left;
      } else {
        let expressions = [];
        let curVar;
        let curLeft = left;
        for(let pair of ops) {
          let {op, right} = pair;
          curVar = getOrSetVariable(`addition|${op.startLine}|${op.startColumn}`, true);
          let expression = {type: "expression", op: op.image, args: [asValue(curLeft), asValue(right)], variable: curVar};
          expressions.push(expression);
          $.activeBlock.expressions.push(expression)
          curLeft = expression;
        }
        return {type: "multiplication", expressions, variable: curVar};
      }
    });

    rule("parenthesis", () => {
      let items = [];
      $.CONSUME(OpenParen);
      $.AT_LEAST_ONE(() => {
        let item = $.SUBRULE($.expression);
        items.push(asValue(item));
      })
      $.CONSUME(CloseParen);
      if(items.length === 1) {
        return items[0];
      }
      return {type: "parenthesis", items};
    });

    rule("infixValue", () => {
      return $.OR([
        {ALT: () => { return $.SUBRULE($.attributeAccess); }},
        {ALT: () => { return $.SUBRULE($.functionRecord); }},
        {ALT: () => { return $.SUBRULE($.isExpression); }},
        {ALT: () => { return $.SUBRULE($.variable); }},
        {ALT: () => { return $.SUBRULE($.value); }},
        {ALT: () => { return $.SUBRULE($.parenthesis); }},
      ]);
    })

    //-----------------------------------------------------------
    // Expression
    //-----------------------------------------------------------

    rule("expression", () => {
      return $.OR([
        {ALT: () => { return $.SUBRULE($.infix); }},
        {ALT: () => { return $.SUBRULE($.record); }},
      ]);
    });

    //-----------------------------------------------------------
    // Variable
    //-----------------------------------------------------------

    rule("variable", () => {
      let token = $.CONSUME(Identifier);
      let variable = getOrSetVariable(token.image);
      variable.usages.push(token);
      return variable;
    });

    //-----------------------------------------------------------
    // Values
    //-----------------------------------------------------------

    rule("stringLiteral", () => {
      $.CONSUME(StringOpen);
      let value = $.CONSUME(StringChars);
      $.CONSUME(StringClose);
      return {type: "constant", value: cleanString(value.image)};
    });

    rule("stringInterpolation", () : any => {
      let args = [];
      let start = $.CONSUME(StringOpen);
      $.MANY(() => {
        let arg = $.OR([
          {ALT: () => { return {type: "constant", value: cleanString($.CONSUME(StringChars).image)}; }},
          {ALT: () => {
            $.CONSUME(StringEmbedOpen);
            let expression = $.SUBRULE($.infix);
            $.CONSUME(StringEmbedClose);
            return expression;
          }},
        ]);
        args.push(asValue(arg));
      });
      $.CONSUME(StringClose);
      if(args.length === 1 && args[0].type === "constant") {
        return {type: "constant", value: args[0].value.toString()};
      }
      let variable = getOrSetVariable(`concat|${start.startLine}|${start.startColumn}`, true);
      let expression = {type: "expression", op: "concat", args, variable}
      $.activeBlock.expressions.push(expression);
      return expression;
    });

    rule("value", () => {
      return $.OR([
        {ALT: () => { return $.SUBRULE($.stringInterpolation) }},
        {ALT: () => { return $.SUBRULE($.num) }},
        {ALT: () => { return $.SUBRULE($.bool) }},
      ])
    })

    rule("bool", () => {
      let value = $.CONSUME(Bool);
      return {type: "constant", value: value.image === "true"};
    })

    rule("num", () => {
      let num = $.CONSUME(Num);
      return {type: "constant", value: parseFloat(num.image)};
    });

    //-----------------------------------------------------------
    // Chevrotain analysis
    //-----------------------------------------------------------

    Parser.performSelfAnalysis(this);
  }
}

//-----------------------------------------------------------
// Public API
//-----------------------------------------------------------

let eveParser = new Parser([]);

export function parseBlock(block, blockId, offset = 0, spans = []) {
  let start = time();
  let lex = EveBlockLexer.tokenize(block);
  let token: any;
  let tokenIx = 0;
  for(token of lex.tokens) {
    let tokenId = `${blockId}|${tokenIx++}`;
    spans.push(offset + token.startOffset, offset + token.startOffset + token.image.length, token.label, tokenId);
  }
  eveParser.input = lex.tokens;
  let results = eveParser.block();
  return {
    results,
    lex,
    time: time(start),
    errors: eveParser.errors,
  }
}

let docIx = 0;
export function parseDoc(doc, docId = `doc|${docIx++}`) {
  let start = time();
  let {text, spans, blocks, extraInfo} = parseMarkdown(doc, docId);
  let parsedBlocks = [];
  for(let block of blocks) {
    let {results, lex, errors} = parseBlock(block.literal, block.id, block.startOffset, spans);
    parsedBlocks.push(results);
  }
  return {
    results: {blocks: parsedBlocks, text, spans, extraInfo},
    time: time(start),
    errors: eveParser.errors,
  }
}
