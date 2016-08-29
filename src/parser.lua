local fs = require("fs")
local utf8 = require("utf8")
local color = require("color")
local errors = require("error")
local Set = require("set").Set
local util = require("util")

------------------------------------------------------------
-- Constants
------------------------------------------------------------

local MAGIC_ENTITY_FIELD = "ENTITY"
local SPECIAL_TAGS = {
  time = true,
  split = true
}

------------------------------------------------------------
-- Utils
------------------------------------------------------------
local DefaultNodeMeta = util.DefaultNodeMeta
local makeWhitespace = util.makeWhitespace;
local split = util.split;
local dedent = util.dedent;
local indent = util.indent;

------------------------------------------------------------
-- Generic stack
------------------------------------------------------------

local Stack = {}

function Stack:new()
  newObj = {}
  self.__index = self
  return setmetatable(newObj, self)
end

function Stack:push(thing)
  self[#self + 1] = thing
end

function Stack:pop()
  local thing = self[#self]
  self[#self] = nil
  return thing
end

function Stack:peek()
  return self[#self]
end

------------------------------------------------------------
-- UTF8 StringScanner
------------------------------------------------------------

local StringScanner = {}

function StringScanner:new(str)
  newObj = {pos = 0, bytes = 0, bytePos = 0, str = str}
  self.__index = self
  return setmetatable(newObj, self)
end

function StringScanner:peek()
  local _, char = utf8.charpos(self.str, self.bytes, self.pos - self.bytePos)
  if char then
    return utf8.char(char)
  end
  return nil
end

function StringScanner:read()
  local char, bytes
  if self.pos == 0 then
    bytes, char = utf8.charpos(self.str, 0)
  else
    bytes, char = utf8.charpos(self.str, self.bytes, self.pos - self.bytePos)
  end
  if char then
    self.bytePos = self.pos
    self.pos = self.pos + 1
    self.bytes = bytes
    return utf8.char(char)
  end
  return nil
end

function StringScanner:unread()
  self.pos = self.pos - 1
end

function StringScanner:setPos(pos)
  self.pos = pos
  self.bytePos = 0
  self.bytes = 0
end

function StringScanner:eatWhile(func)
  local char = self:peek()
  local final = {}
  local prev = nil
  local prev2 = nil
  while char and func(char, prev, prev2) do
    char = self:read()
    prev2 = prev
    prev = char
    final[#final+1] = char
    char = self:peek()
  end
  return table.concat(final)
end

------------------------------------------------------------
-- Lexer
------------------------------------------------------------

local surrogateSize = {1, 1, 1, 2}
local function surrogateLength(string)
  local length = 0
  local scanner = StringScanner:new(string)
  local char = scanner:read()
  while char do
    length = length + surrogateSize[#char]
    char = scanner:read()
  end
  return length
end

local Token = {}

function Token:new(type, value, line, offset, byteOffset, surrogateOffset)
  return {id = util.generateId(), type = type, value = value, line = line, offset = offset, byteOffset = byteOffset, length = utf8.len(value), byteLength = #value, surrogateOffset = surrogateOffset, surrogateLength = surrogateLength(value)}
end

function Token:format(token)
  return color.dim("[") .. string.format("%s %s", color.dim(token.type), color.bright(token.value), color.dim(token.line), color.dim(token.offset)) .. color.dim("]")
end

function Token:print(token)
  io.write(Token:format(token))
end

local specials = {
  ["@"] = "NAME",
  ["#"] = "TAG",
  ["."] = "DOT",
  [","] = "COMMA",
  ["("] = "OPEN_PAREN",
  [")"] = "CLOSE_PAREN",
  ["["] = "OPEN_BRACKET",
  ["]"] = "CLOSE_BRACKET",
  ["{"] = "OPEN_CURLY",
  ["}"] = "CLOSE_CURLY",
  ["⦑"] = "OPEN_UUID",
  ["⦒"] = "CLOSE_UUID",
  [":"] = "ALIAS",
}

local numeric = {["0"] = true, ["1"] = true, ["2"] = true, ["3"] = true,
                 ["4"] = true, ["5"] = true, ["6"] = true, ["7"] = true,
                 ["8"] = true, ["9"] = true}

local keywords = {
  commit = "COMMIT",
  bind = "BIND",
  match = "MATCH",
  ["```"] = "BLOCK",
  ["if"] = "IF",
  ["then"] = "THEN",
  ["else"] = "ELSE",
  ["or"] = "OR",
  ["not"] = "NOT",
  is = "IS",
  none = "NONE",
  ["true"] = "BOOLEAN",
  ["false"] = "BOOLEAN",
  ["="] = "EQUALITY",
  [">"] = "INEQUALITY",
  ["<"] = "INEQUALITY",
  [">="] = "INEQUALITY",
  ["<="] = "INEQUALITY",
  ["!="] = "INEQUALITY",
  ["+"] = "INFIX",
  ["-"] = "INFIX",
  ["*"] = "INFIX",
  ["/"] = "INFIX",
  ["+="] = "INSERT",
  ["-="] = "REMOVE",
  [":="] = "SET",
  ["<-"] = "MERGE",
}

local utf8nbsp = utf8.char(160)
local whitespace = { [" "] = true, ["\n"] = true, ["\t"] = true, ["\r"] = true, [utf8nbsp] = true }

local function isIdentifierChar(char, prev)
  return not specials[char] and not whitespace[char] and not (prev == "/" and char == "/")
end

local function inString(char, prev, prev2)
  return (char ~= "\"" and (char ~= "{" or prev ~= "{")) or (prev == "\\" and prev2 ~= "\\")
end

local function isNumber(char)
  return numeric[char] or char == "-" or char == "."
end

local function isUUID(char)
  return char ~= "⦒"
end

local function notNewline(char)
  return char ~= "\n"
end

local function lex(str)
  local scanner = StringScanner:new(str)
  local char = scanner:read()
  local line = 1
  local offset = 0
  local byteOffset = 0
  local surrogateOffset = 0
  local inBlock = nil
  local tokens = {}

  local function adjustOffset(num)
      offset = offset + num
      byteOffset = byteOffset + num
      surrogateOffset = surrogateOffset + num
  end

  local function adjustOffsetByString(string)
      offset = offset + utf8.len(string)
      byteOffset = byteOffset + #string
      surrogateOffset = surrogateOffset + surrogateLength(string)
  end

  while char do

    if whitespace[char] then
      if char == "\n" then
        line = line + 1
        offset = 0
        byteOffset = 0
        surrogateOffset = 0
      else
        adjustOffset(1)
      end

    elseif not inBlock then
      scanner:unread()
      local firstToken = scanner:eatWhile(isIdentifierChar)
      -- check if this is a keyword that continues a query
      if firstToken == "```" then
        inBlock = true
        tokens[#tokens+1] = Token:new("BLOCK_OPEN", firstToken, line, offset, byteOffset, surrogateOffset)
        adjustOffsetByString(firstToken)
      else
        local doc = scanner:eatWhile(notNewline)
        tokens[#tokens+1] = Token:new("DOC", firstToken .. doc, line, offset, byteOffset, surrogateOffset)
        adjustOffsetByString(doc)
      end

    elseif char == "\"" or (char == "}" and scanner:peek() == "}") then
      if char == "\"" then
        tokens[#tokens+1] = Token:new("STRING_OPEN", "\"", line, offset, byteOffset, surrogateOffset)
        adjustOffset(1)
      else
        -- otherwise, go ahead and eat the }}
        scanner:read()
        adjustOffset(2)
      end
      local string = scanner:eatWhile(inString)
      -- if we are stopping because of string interpolation, we have to remove
      -- the previous { character that snuck in
      local ateCurly = false
      if string:sub(#string, #string) == "{" and scanner:peek() == "{" then
        string = string:sub(0, #string - 1)
        ateCurly = true
      end
      if #string > 0 then
        -- single slashes are only escape codes and shouldn't make it to the
        -- actual string
        for ix, part in ipairs(split(string, "\n")) do
          if ix ~= 1 then
            line = line + 1
            offset = 0
            byteOffset = 0
            surrogateOffset = 0
            part = "\n" .. part
          end
          original = part
          part = part:gsub("\\n", "\n"):gsub("\\([^\\])", "%1")
          tokens[#tokens+1] = Token:new("STRING", part, line, offset, byteOffset, surrogateOffset)
          adjustOffsetByString(original)
        end
      end

      if ateCurly then
        -- we ate the { off the end of the string, so adjust the offset up one
        adjustOffset(1)
      end
      -- skip the end quote
      if scanner:peek() == "\"" then
        scanner:read()
        tokens[#tokens+1] = Token:new("STRING_CLOSE", "\"", line, offset, byteOffset, surrogateOffset)
        adjustOffset(1)
      end

    elseif char == "⦑" then
      -- FIXME: why are these extra reads necessary? it seems like
      -- the utf8 stuff isn't getting handled correctly for whatever
      -- reason
      local UUID = scanner:eatWhile(isUUID)
      -- skip the end bracket
      scanner:read()
      tokens[#tokens+1] = Token:new("UUID", UUID, line, offset, byteOffset, surrogateOffset)
      adjustOffsetByString(UUID)
      adjustOffsetByString("⦒")

    elseif char == "/" and scanner:peek() == "/" then
      scanner:unread()
      local comment = scanner:eatWhile(notNewline)
      tokens[#tokens+1] = Token:new("COMMENT", comment, line, offset, byteOffset, surrogateOffset)
      adjustOffset(2)
      adjustOffsetByString(comment)

    elseif (char == "-" and numeric[scanner:peek()]) or numeric[char] then
      scanner:unread()
      local number = scanner:eatWhile(isNumber)
      tokens[#tokens+1] = Token:new("NUMBER", number, line, offset, byteOffset, surrogateOffset)
      adjustOffsetByString(number)

    elseif specials[char] then
      local next = scanner:peek()
      -- FIXME: there's gotta be a better way to deal with this than special casing it
      if char == ":" and next == "=" then
        tokens[#tokens+1] = Token:new(keywords[":="], ":=", line, offset, byteOffset, surrogateOffset)
        -- skip the =
        scanner:read()
        adjustOffset(2)
      else
        tokens[#tokens+1] = Token:new(specials[char], char, line, offset, byteOffset, surrogateOffset)
        adjustOffset(1)
      end

    else
      scanner:unread()
      local identifier = scanner:eatWhile(isIdentifierChar)
      -- handle the special case of identifier//some comment, given how isIdentifierChar is
      -- written the only way we the next char can be a / is if the previous char was also
      -- a slash. We need to unread one char, and adjust the identifier.
      if scanner:peek() == "/" then
        scanner:unread()
        identifier = identifier:sub(1, -2)
      end

      local keyword = keywords[identifier]
      local type = keyword or "IDENTIFIER"
      if identifier == "```" then
        inBlock = false
        type = "BLOCK_CLOSE"
      end
      tokens[#tokens+1] = Token:new(type, identifier, line, offset, byteOffset, surrogateOffset)
      adjustOffsetByString(identifier)
    end
    char = scanner:read()
  end
  return tokens
end

------------------------------------------------------------
-- ArrayScanner
------------------------------------------------------------

local ArrayScanner = {}
function ArrayScanner:new(tokens)
  newObj = {pos = 1, tokens = tokens}
  self.__index = self
  return setmetatable(newObj, self)
end
function ArrayScanner:peek()
  return self.tokens[self.pos]
end

function ArrayScanner:read()
  token = self.tokens[self.pos]
  self.pos = self.pos + 1
  return token
end

function ArrayScanner:unread()
  self.pos = self.pos - 1
end

function ArrayScanner:setPos(pos)
  self.pos = pos
end

function ArrayScanner:eatWhile(func)
  local token = self:read()
  local final = {}
  local prev = nil
  while token and func(token, prev) do
    prev = token
    final[#final+1] = char
    token = self:read()
  end
  self:unread()
  return final
end

------------------------------------------------------------
-- Parse graph printing
------------------------------------------------------------

local function formatNode(node, depth)
  local depth = depth or 0
  local indent = makeWhitespace(depth * 4)
  local string = color.dim(string.format("%s%s| ", indent , depth)) .. color.warning(node.type or "none") .. "\n"
  local childIndent = color.dim(indent .. " |      ")
  for k, v in pairs(node) do
    if k == "children" or k == "parent" or k == "type" then
      -- do nothing
    elseif k == "op" and type(v) == "table" then
      string = string .. childIndent .. color.dim("op: ") .. v.value .. "\n"
    elseif k == "projection" then
      string = string .. childIndent .. color.dim("projection: ")
      for _, proj in pairs(v) do
        for var in pairs(proj) do
          string = string .. (var.name or "unnamed") .. ", "
        end
      end
       string = string .. "\n"
    elseif k == "variable" then
      string = string .. childIndent .. color.dim("variable: ") .. v.name .. "\n"
    elseif k == "variableMap" then
      string = string .. childIndent .. color.dim("variableMap: ")
      for variableName, _ in pairs(v) do
        string = string .. variableName .. ", "
      end
      string = string .. "\n"
    elseif k == "tokens" then
      string = string .. childIndent .. color.dim("tokens: ")
      for _, token in pairs(v) do
        string = string .. Token:format(token) .. " "
      end
      string = string .. "\n"
    else
      local toPrint = v
      if type(v) == "string" then
        local extraWhitespace = makeWhitespace(#k + 1)
        toPrint = toPrint:gsub("\n", color.dim("\n" .. childIndent .. extraWhitespace))
      end
      string = string .. childIndent .. string.format("%s: %s\n", color.dim(k), toPrint)
    end
  end
  return string
end

local function formatGraph(root, seen, depth)
  local seen = seen or {}
  local depth = depth or 0
  if not root or seen[root] then return root and string.format("%s %s", depth, root.type) or "" end
  string = formatNode(root, depth)
  seen[root] = true
  if root.children then
    for _, child in pairs(root.children) do
      string = string .. formatGraph(child, seen, depth + 1)
    end
  end
  return string
end

local function formatQueryGraph(root, seen, depth)
  local seen = seen or {}
  local depth = depth or 0
  if not root or seen[root] then return "" end
  seen[root] = true
  local indent = makeWhitespace(depth * 4)
  local nextDepth = depth
  local string = "\n"
  if root.type then
    string = color.dim(string.format("%s%s| ", indent , depth)) .. color.warning(root.type or "none") .. "\n"
    nextDepth = depth + 1
  end
  local childIndent = color.dim(indent .. " |  ")
  for k, v in pairs(root) do
    if k == "type" or k == "context" or k == "ast" then
      -- ignore
    elseif k == "projection" then
      string = string .. childIndent .. color.dim("projection: ")
      for _, proj in pairs(v) do
        for var in pairs(proj) do
          string = string .. (var.name or "unnamed") .. ", "
        end
      end
      string = string .. "\n"
    elseif type(v) == "table" then
      if type(k) == "string" and k ~= "children" then
        string = string .. indent .. color.dim(" |  ") .. color.dim(k) .. ": "
        if v.type and not seen[v] then
          string = string .. "\n"
        end
      end
      if not seen[v] then
        string = string .. formatQueryGraph(v, seen, nextDepth)
      elseif v.type == "variable" then
        string = string .. string.format(color.warning("variable<%s>\n"), v.name)
      else
        string = string .. color.error("seen\n")
      end
    elseif type(k) == "string" then
      local toPrint = v
      if type(v) == "string" then
        local extraWhitespace = makeWhitespace(#k + 1)
        toPrint = toPrint:gsub("\n", color.dim("\n" .. childIndent .. extraWhitespace))
      end
      string = string .. childIndent .. string.format("%s: %s\n", color.dim(k), toPrint)
    end
  end
  return string
end

------------------------------------------------------------
-- Parse
------------------------------------------------------------

local function makeNode(context, type, token, rest)
  local node = setmetatable({type = type, line = token.line, offset = token.offset, id = util.generateId()}, DefaultNodeMeta)
  if token.id then
    context.downEdges[#context.downEdges + 1] = {token.id, node.id}
  end
  for k, v in pairs(rest) do
    node[k] = v
  end
  return node
end

local valueTypes = {IDENTIFIER = true, infix = true, ["function"] = true, NUMBER = true, STRING = true, block = true, attribute = true, BOOLEAN = true}
local infixTypes = {equality = true, infix = true, attribute = true, mutate = true, inequality = true, DOT = true, SET = true, REMOVE = true, INSERT = true, MERGE = true, INFIX = true, EQUALITY = true, ALIAS = true, INEQUALITY = true}
local infixPrecedents = {equality = 0, inequality = 0, mutate = 0, attribute = 4, block = 4, ["function"] = 4, ["^"] = 3, ["*"] = 2, ["/"] = 2, ["+"] = 1, ["-"] = 1 }
local singletonTypes = {outputs = true}
local positionalFunctions = { [">"] = true, ["<"] = true, [">="] = true, ["<="] = true, ["!="] = true, ["+"] = true, ["-"] = true, ["*"] = true, ["/"] = true, concat = true, is = true}
local alphaFields = {"a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"}

local function nextNonComment(scanner, context)
  local next = scanner:peek()
  while next and next.type == "COMMENT" do
    -- store the comment and move on
    context.comments[#context.comments + 1] = next
    scanner:read()
    next = scanner:peek()
  end
  return next
end

local function parse(tokens, context)
  local stack = Stack:new()
  local scanner = ArrayScanner:new(tokens)
  local token = scanner:read()
  local final = {}

  local function tryFinishExpression(force)
    local stackTop = stack:peek()
    while stackTop do
      local count = #stackTop.children
      if force or stackTop.closed or (infixTypes[stackTop.type] and count == 2)
         or (singletonTypes[stackTop.type] and count == 1) then
        -- pop this guy and add him as a child of the next guy
        local prev = stack:pop()
        stackTop = stack:peek()
        if stackTop then
          stackTop.children[#stackTop.children + 1] = prev
        else
          final[#final + 1] = prev
        end
      else
        break
      end
    end
    return stackTop
  end

  while token do
    local stackTop = stack:peek() or {}
    local type = token.type
    local next = nextNonComment(scanner, context)

    -- we have to handle close parens/brackets before we do anything else, to make sure
    -- that the top of the stack is properly closed *before* we might add new
    -- infixes onto it.
    if type == "CLOSE_PAREN" or type == "CLOSE_BRACKET" then
      local stackType = stackTop.type
      if type == "CLOSE_PAREN" and (stackType == "block" or stackTop.func == "is" or (stackTop.parent and stackTop.parent.type == "not")) then
        stackTop.closed = true
      elseif type == "CLOSE_BRACKET" and (stackType == "function" or stackType == "object") then
        stackTop.closed = true
      elseif type == "CLOSE_BRACKET" then
        -- error
        errors.invalidCloseBracket(context, token, stack)
      elseif type == "CLOSE_PAREN" then
        -- error
        errors.invalidCloseParen(context, token, stack)
      end
    end

    -- if next is an infix, we potentially have some stack surgery to do
    -- based on precedence, but at the very least we want the current token
    -- to end up as a child of the infix node
    if next and infixTypes[next.type] then
      -- create the upcoming infix node
      local nextInfix
      if next.type == "DOT" then
        nextInfix = makeNode(context, "attribute", next, {children = {}})
      elseif next.type == "INFIX" then
        nextInfix = makeNode(context, "infix", next, {func = next.value, children = {}})
      elseif next.type == "EQUALITY" or next.type == "ALIAS" or next.type == "INEQUALITY" then
        local nodeType = next.type == "INEQUALITY" and "inequality" or "equality"
        nextInfix = makeNode(context, nodeType, next, {operator = next.value, children = {}})
      elseif next.type == "INSERT" or next.type == "REMOVE" or next.type == "SET" or next.type == "MERGE" then
        nextInfix = makeNode(context, "mutate", next, {operator = next.type:lower(), children = {}})
      else
        -- error? how could we get here?
        error(string.format("Got an infix type that we don't know how to deal with: %s", next.type))
      end
      -- if the current stacktop is also an infix, we need to figure out what order
      -- we want to do the ops in, we use precedence numbers to implement operator
      -- precedence
      local topPrecedent = infixPrecedents[stackTop.func] or infixPrecedents[stackTop.type]
      local nextPrecedent = infixPrecedents[nextInfix.func] or infixPrecedents[nextInfix.type]
      if topPrecedent and nextPrecedent < topPrecedent then
        -- we walk up the stack until we either find a non-infix
        -- or we find someone with a precedent <= to us
        local nextStackTop = stack:peek()
        local popped = Stack:new()
        while topPrecedent and nextPrecedent < topPrecedent do
          -- we can't break out of parens that aren't finished yet
          if (nextStackTop.type == "block" or nextStackTop.type == "function") and not nextStackTop.closed then
            topPrecedent = false
          else
            popped:push(stack:pop())
            nextStackTop = stack:peek()
            topPrecedent = nextStackTop and (infixPrecedents[nextStackTop.func] or infixPrecedents[nextStackTop.type])
          end
        end
        -- push ourselves on
        stack:push(nextInfix)
        stackTop = nextInfix
        -- now put everyone back on top of us
        while popped:peek() do
          local cur = popped:pop()
          stack:push(cur)
          stackTop = cur
        end
      else
        -- if we're the right precedence already, we push ourselves onto the stack
        stack:push(nextInfix)
        stackTop = stack:peek()
      end
      -- eat next since we're taking care of it here
      scanner:read()
    end

    if type == "DOC" then
      -- if there's already a query on the stack and this line is directly following
      -- the last line of the start of the query, then this is just more doc for that
      -- query
      if stackTop.type == "query" and stackTop.line + 1 == token.line then
        stackTop.doc = stackTop.doc .. "\n" .. token.value
        stackTop.line = token.line
      elseif stackTop.type == "query" and #stackTop.children == 0 then
        stack:pop()
        stack:push(makeNode(context, "query", token, {doc = token.value, children = {}}))
      else
        stackTop = tryFinishExpression(true)
        stack:push(makeNode(context, "query", token, {doc = token.value, children = {}}))
      end

    elseif type == "BLOCK_OPEN" then
      -- we may already be adding to a query because of doc blocks, but if we aren't
      -- then this starts one
      if stackTop.type ~= "query" then
        stack:push(makeNode(context, "query", token, {doc = "Unnamed block", children = {}}))
      else
        stackTop.line = token.line
      end

    elseif type == "BLOCK_CLOSE" then
      -- clear everything currently on the stack as we're starting a totally new
      -- query
      stackTop = tryFinishExpression(true)

    elseif type == "MATCH" then
      if stackTop.type == "match" then
        stackTop.closed = true
        stackTop = tryFinishExpression()
      end

      if stackTop.type == "query" then
        stack:push(makeNode(context, "match", token, {scopes = Set:new(), children = {}}))
      else
        -- error - match is only valid as the opening to a query
        errors.misplacedMatch(context, token, stackTop)
      end

    elseif type == "COMMA" then
      -- we treat commas as whitespace

    elseif type == "COMMENT" then
      context.comments[#context.comments + 1] = token

    elseif type == "STRING_OPEN" then
      stack:push(makeNode(context, "function", token, {func = "concat", children = {}, concatBlock = true}))

    elseif type == "STRING_CLOSE" then
      if stackTop.concatBlock then
        -- if there's zero or one children, then this concat isn't needed
        if #stackTop.children == 0 or (#stackTop.children == 1 and stackTop.children[1].type == "STRING") then
          local str = stackTop.children[1] or makeNode(context, "STRING", token, {value = ""})
          stack:pop()
          stackTop = stack:peek()
          stackTop.children[#stackTop.children + 1] = str
        else
          stackTop.closed = true
        end
      else
        for ix, top in ipairs(stack) do
          print(ix, formatNode(top))
        end
        -- error
        errors.string_close(context, token, stackTop and stackTop.type)
      end

    elseif type == "OPEN_CURLY" or type == "CLOSE_CURLY" then
      -- we can just ignore these as long as we're in a concat
      -- if we're not, it's an error
      if not stackTop.concatBlock then
        -- error
        errors.curlyOutsideOfString(context, token, stackTop)
      end

    elseif type == "OPEN_BRACKET" then
      stack:push(makeNode(context, "object", token, {children = {}}))

    elseif type == "CLOSE_BRACKET" then
      -- handled above

    elseif type == "COMMIT" or type == "BIND" then
      local update = makeNode(context, "update", token, {scopes = Set:new(), children = {}, mutateType = type:lower()})
      -- if we are already in an update node, then this update closes the old
      -- one and puts us into a new one
      if stackTop.type == "update" or stackTop.type == "match" then
        stackTop.closed = true
        stackTop = tryFinishExpression()
      end
      stack:push(update)

    elseif type == "IF" then
      if stackTop.type == "equality" then
        -- pop the equality off since it represents the outputs of
        -- this union/choose
        local prev = stack:pop()
        local outputs = prev.children[1]
        if not outputs or (outputs.type ~= "block" and outputs.type ~= "IDENTIFIER") then
          -- error
          -- attempting to assign an if to something that isn't
          -- either a group or an identifier
          errors.invalidIfAssignment(context, token, outputs)
          outputs = {}
        end
        local node = makeNode(context, "union", token, {outputs = outputs, children = {}})
        stack:push(node)
        local childQuery = makeNode(context, "query", token, {outputs = outputs, parent = stackTop, children = {}})
        stack:push(childQuery)
      elseif stackTop.type == "union" or stackTop.type == "choose" then
        local childQuery = makeNode(context, "query", token, {children = {}, outputs = stackTop.outputs, parent = stackTop})
        stack:push(childQuery)
      else
        -- error
        errors.unassignedIf(context, token)
      end

    elseif type == "ELSE" then
      local continue = true
      if stackTop.type == "union" then
        stackTop.type = "choose"
      elseif stackTop.type ~= "choose" then
        -- error
        errors.misplacedElse(context, token, stack)
        continue = false
      end

      if continue then
        if next and next.type ~= "IF" then
          local childQuery = makeNode(context, "query", token, {outputs = stackTop.outputs, parent = stackTop, closed = true, children = {}})
          stack:push(childQuery)
          local childOutputs = makeNode(context, "outputs", token, {children = {}})
          stack:push(childOutputs)
        end
      end

    elseif type == "THEN" then
      -- TODO: this needs to check further up the stack to make
      -- sure that query is part of a choose or union...
      if stackTop.type == "query" and stackTop.parent then
        stackTop.closed = true
        local childQuery = makeNode(context, "outputs", token, {children = {}})
        stack:push(childQuery)
      else
        -- error
        errors.misplacedThen(context, token, stack)
      end

    elseif type == "NOT" then
      local node = makeNode(context, "not", token, {closed = true, children = {}})
      local childQuery = makeNode(context, "query", token, {children = {}, parent = node})
      stack:push(node)
      stack:push(childQuery)
      if not next or next.type ~= "OPEN_PAREN" then
        -- error
        errors.notWithoutParen(context, token, next)
      else
        -- eat the open paren
        scanner:read()
      end

    elseif type == "OR" then
      -- check if this is an inline or, by looking to see if the previous
      -- child is an identifier
      local prev = stackTop.children[#stackTop.children]
      if prev and prev.type == "IDENTIFIER" then
        -- TODO
        errors.notImplemented(context, token, "inline or")
      else
        -- error
        errors.orOnlyAfterIdentifier(context, token, prev)
      end

    elseif type == "TAG" or type == "NAME" then
      if next and (next.type == "STRING_OPEN" or next.type == "IDENTIFIER") then
        stack:push(makeNode(context, "equality", token, {operator = "=", children = {token}}))
      else
        -- error
        errors.invalidTag(context, token, next)
      end

    elseif type == "OPEN_PAREN" then
      stack:push(makeNode(context, "block", token, {children = {}}))

    elseif type == "CLOSE_PAREN" then
      -- handled above

    elseif type == "IS" and next and next.type == "OPEN_PAREN" and next.offset == token.offset + token.length then
      stack:push(makeNode(context, "function", token, {func = token.value, children = {}}))
      -- consume the paren
      scanner:read()

    elseif type == "IDENTIFIER" and next and next.type == "OPEN_BRACKET" and next.offset == token.offset + token.length then
      stack:push(makeNode(context, "function", token, {func = token.value, children = {}}))
      -- consume the paren
      scanner:read()

    elseif type == "IDENTIFIER" or type == "NUMBER" or type == "STRING" or type == "UUID" or type == "BOOLEAN" or type == "NONE" then
      stackTop.children[#stackTop.children + 1] = token

    else
      -- error
      errors.crazySyntax(context, token)
    end

    stackTop = tryFinishExpression()
    token = scanner:read()

    -- choose and union get closed when they are the top of the stack
    -- and the next token is not either an if or an else
    if stackTop and (stackTop.type == "choose" or stackTop.type == "union") then
      if not token or (token.type ~= "IF" and token.type ~= "ELSE") then
        stackTop.closed = true
        stackTop = tryFinishExpression()
      end
    end
  end
  tryFinishExpression(true)
  return final
end


local function resolveVariable(context, name, related, generated)
  local mappings = context.nameMappings
  local variable
  for _, mapping in ipairs(mappings) do
    if mapping[name] then
      variable = mapping[name]
      break
    end
  end
  -- if we didn't find it, then we have to create a new variable
  -- and add it to the closest name mapping
  if not variable then
    variable = makeNode(context, "variable", related, {name = name, generated = generated})
  end
  -- if we haven't mapped this variable at this level then we
  -- need to do so and add it to the containing query
  if not mappings:peek()[name] then
    local query = context.queryStack:peek()
    query.variables[#query.variables + 1] = variable
    mappings:peek()[name] = variable
  end
  return variable
end

local generateObjectNode
local generateQueryNode
local generateNotNode
local resolveExpression

local function generateBindingNode(context, node, related, parent)
  node = makeNode(context, "binding", related, node);
  node.source = parent
  if node.variable then
    local bindings = context.variableToBindings[node.variable] or {}
    bindings[#bindings + 1] = node
    context.variableToBindings[node.variable] = bindings
  end
  parent.bindings[#parent.bindings + 1] = node
  return node
end

local function resolveMutateMerge(context, left, rightNode)
  -- Merges generally just set all the attributes in the rightNode
  -- on the entity represented by the left, but that leads to weird
  -- behavior for tags and names, where you don't think that merging
  -- in #foo would remove #bar. To fix this, we go through the rightNode
  -- find all TAG and NAME children and remove them. We then add those
  -- to an "insert" mutate that does the right thing.
  local adds = {}
  local safe = {}
  for _, value in ipairs(rightNode.children) do
    if value.type == "equality" and (value.children[1].type == "TAG" or value.children[1].type == "NAME") then
      adds[#adds + 1] = value
    else
      safe[#safe + 1] = value
    end
  end
  if #adds > 0 then
    context.mutateOperator = "insert"
    local rightAddMutate = makeNode(context, "object", rightNode, {children = adds})
    resolveExpression(makeNode(context, "equality", rightNode, {operator = "=", children = {left, rightAddMutate}}), context);
    context.mutateOperator = "merge"
  end
  rightNode.children = safe
  right = resolveExpression(rightNode, context)
  return right
end

local function resolveMutate(context, node)
  local leftNode = node.children[1]
  local rightNode = node.children[2]
  local right, left

  if leftNode.type == "attribute" then
    -- valid constructions:
    -- foo.zomg (+|-|:)= expression
    -- foo.zomg <- [ ... ]
    if node.operator == "merge" then
      -- in the case of a merge with the left being an attribute
      -- lookup, we need to find all the values of that attribute
      -- and then attempt to merge the right object into them. As
      -- such, we're not actually mutating the left side, we're just
      -- doing a normal lookup
      local prevMutating = context.mutating;
      context.mutating = nil
      left = resolveExpression(leftNode, context)
      context.mutating = prevMutating
      if rightNode.type == "object" then
        context.projections:push(Set:new({left}))
        right = resolveMutateMerge(context, left, rightNode)
        context.projections:pop()
      else
        -- error merge must be followed by an object
        errors.mergeWithoutObject(context, node, rightNode)
      end

    else
      left = resolveExpression(leftNode, context)
      -- we have to distinguish between objects and any other kind
      -- of expression on the right here. Objects should still be
      -- mutating, but other expressions should not. If we don't do
      -- this then attribute lookups with . syntax will incorrectly
      -- end up being mutates
      if rightNode.type == "object" then
        -- if our left is an attribute call then we need to add the
        -- attribute's parent to our projection to make sure that
        -- the generated object is per each parent not just potentially
        -- one global one
        context.projections:push(Set:new({left.attributeLeft}))
        right = resolveExpression(rightNode, context)
        -- cleanup our projection
        context.projections:pop()
      else
        local prevMutating = context.mutating;
        context.mutating = nil
        right = resolveExpression(rightNode, context)
        context.mutating = prevMutating
      end

    end

  elseif leftNode.type == "IDENTIFIER" then
    left = resolveExpression(leftNode, context)
    -- valid constructions:
    -- foo (+|-)= (#|@)bar
    -- foo := none
    -- foo <- [ ... ]
    if node.operator == "set" then
      if rightNode.type == "NONE" then
        context.mutateOperator = "erase"
        right = resolveExpression(makeNode(context, "object", node, {children = {}}), context)
        context.mutateOperator = "set"
        -- TODO
      else
        -- error the only valid thing to set a reference to directly
        -- is none
        errors.setWithoutNone(context, node, rightNode)
      end
    elseif node.operator == "merge" then
      if rightNode.type == "object" then
        context.projections:push(Set:new({left}))
        right = resolveMutateMerge(context, left, rightNode)
        context.projections:pop()
      else
        -- error merge must be followed by an object
        errors.mergeWithoutObject(context, node, rightNode)
      end

    elseif rightNode.type == "equality" and (rightNode.children[1].type == "NAME" or rightNode.children[1].type == "TAG") then
      local object = makeNode(context, "object", node, {children = {rightNode}})
      right = resolveExpression(object, context)
    else
      -- error, the only valid thing after +=/-= for a reference is tags or names
      errors.referenceMutateWithoutTagOrName(context, node, rightNode)
    end

  else
    -- error, the only things we can have on the left of
    -- a mutate are identifiers and attribute calls
    errors.invalidMutateLeft(context, node, leftNode)
  end
  -- we need to create an equality between whatever the left resolved to
  -- and whatever the right resolved to
  if right then
    resolveExpression(makeNode(context, "equality", node, {operator = "=", children = {left, right}}), context);
  end
  return left
end

local function resolveEqualityLike(context, node)
  local left = resolveExpression(node.children[1], context)
  if not left then
    -- error
    errors.invalidEqualityLeft(context, node, left)
    return
  end
  -- set that when I try to resolve this expression,
  -- I'm looking to resolve it to this specific variable
  local right = resolveExpression(node.children[2], context)
  if not right then
    -- error
    errors.invalidEqualityRight(context, node)
    return
  end
  local expression = makeNode(context, "expression", node, {operator = node.operator, bindings = {}})
  local leftBinding = {field = "a"}
  if left.type == "variable" then
    leftBinding.variable = left
  elseif left.type == "constant" then
    leftBinding.constant = left
  else
    error("Inequality with invalid left")
  end
  local rightBinding = {field = "b"}
  if right.type == "variable" then
    rightBinding.variable = right
  elseif right.type == "constant" then
    rightBinding.constant = right
  else
    error("Inequality with invalid right")
  end
  if context.nonFilteringInequality then
    resultVar = resolveVariable(context, string.format("%s-%s-%s", node.type, node.line, node.offset), node, true)
    generateBindingNode(context, {field = "return", variable = resultVar}, node, expression)
  end
  generateBindingNode(context, leftBinding, left, expression)
  generateBindingNode(context, rightBinding, right, expression)
  local query = context.queryStack:peek()
  query.expressions[#query.expressions + 1] = expression
  return resultVar
end

local function resolveAttribute(context, node)
  local left = resolveExpression(node.children[1], context)
  local right = node.children[2]
  local rightVar
  if not right then
    -- error
    errors.invalidAttributeRight(context, node)
  elseif right.type == "attribute" then
    -- if the right is another attribute call, then we need to
    -- resolve that chain and capture the right-most var, as it's
    -- what we'll ultimately need to return
    rightVar, nextRight = resolveAttribute(context, right)
    -- we also need to grab the left side of the next attribute call
    -- and use that as our immediate right
    local leftVar = nextRight.attributeLeft
    right = makeNode(context, "IDENTIFIER", leftVar, {value = leftVar.name})
  end

  if right and right.type == "IDENTIFIER" then
    -- generate a temporary variable to hold this attribute binding
    local attributeRef = resolveVariable(context, string.format("%s-%s-%s", right.value, right.line, right.offset), right, true)
    -- store the left on the attribute as we may need it for adding
    -- to the projection in the case of a mutate
    attributeRef.attributeLeft = left;
    -- generate a temporary object that we can attach this attribute to by adding
    -- an equality from the attribute name to our temp variable
    local tempObject = makeNode(context, "object", right, {children = {makeNode(context, "equality", right, {operator = "=", children = {right, makeNode(context, "IDENTIFIER", node.children[1], {value = attributeRef.name})}})}})
    -- create the object
    local objectNode = generateObjectNode(tempObject, context)
    -- create an equality between the entity fields
    resolveExpression(makeNode(context, "equality", right, {operator = "=", children = {left, objectNode.entityVariable}}), context);
    -- add it to the query
    local query = context.queryStack:peek()
    local queryKey = objectNode.type == "object" and "objects" or "mutates"
    query[queryKey][#query[queryKey] + 1] = objectNode
    return rightVar or attributeRef, attributeRef
  else
    -- error
    errors.invalidAttributeRight(context, right)
  end
end

local function resolveFunctionLike(context, node)
  local resultVar = resolveVariable(context, string.format("result-%s-%s", node.line, node.offset), node, true)
  local prevNonfiltering = context.nonFilteringInequality
  if node.func == "is" then
    context.nonFilteringInequality = true
  end
  local expression = makeNode(context, "expression", node, {operator = node.func, bindings = {}})
  -- bind the return
  if not context.noReturn then
    generateBindingNode(context, {field = "return", variable = resultVar}, resultVar, expression)
  end
  -- create bindings
  for ix, child in ipairs(node.children) do
    local prevMutating = context.mutating;
    context.mutating = nil
    local field, right
    if positionalFunctions[node.func] then
      local len = #alphaFields
      field = ""
      char = ix % len
      if char == 0 then
        char = len
      end
      for i = 1, math.ceil(ix / len) do
        field = field .. alphaFields[char]
      end
      right = child
    elseif child.type == "equality" and child.children[1].type == "IDENTIFIER" then
      field = child.children[1].value
      right = child.children[2]
    elseif child.type == "IDENTIFIER" then
      field = child.value
      right = child
    else
      -- error
      errors.invalidFunctionArgument(context, child, node.type)
    end
    if field then
      local resolved = resolveExpression(right, context)
      if not resolved then
        -- error
        errors.invalidFunctionArgument(context, child, node.type)

      elseif field == "per" then
        local groupings = resolved.children or {resolved}
        expression.groupings = expression.groupings or {}
        for ix, grouping in ipairs(groupings) do
          local groupingVar = resolveExpression(grouping, context)
          if groupingVar.type == "variable" then
            expression.groupings[#expression.groupings + 1] = makeNode(context, "grouping", grouping, {expression = expression, variable = groupingVar, ix = ix})
          else
            -- error
            errors.invalidGrouping(context, grouping)
          end
        end

      elseif field == "given" then
        local projections = resolved.children or {resolved}
        expression.projection = expression.projection or {}
        for _, project in ipairs(projections) do
          local projectVar = resolveExpression(project, context)
          if projectVar.type == "variable" then
            local foo = makeNode(context, "projection", project, {expression = expression, variable = projectVar})
            expression.projection[#expression.projection + 1] = foo
          else
            -- error
            errors.invalidProjection(context, project)
          end
        end

      elseif resolved.type == "variable" then
        generateBindingNode(context, {field = field, variable = resolved}, resolved, expression)

      elseif resolved.type == "constant" then
        generateBindingNode(context, {field = field, constant = resolved}, resolved, expression)

      elseif resolved.type == "block" then
        for _, rawValue in ipairs(resolved.children) do
          local value = resolveExpression(rawValue, context)
          if value.type == "variable" then
            generateBindingNode(context, {field = field, variable = value}, value, expression)
          elseif value.type == "constant" then
            generateBindingNode(context, {field = field, constant = value}, value, expression)
          else
            errors.invalidFunctionArgument(context, value, node.type)
          end
        end

      else
        -- error?
        errors.invalidFunctionArgument(context, child, node.type)
      end
    else
      -- error - only identifiers are allowed as the left hand side of function
      -- argument equalities
      errors.invalidFunctionArgument(context, child, node.type)
    end
    -- set back to whatever prevMutating was
    context.mutating = prevMutating
  end
  if node.func == "is" then
    context.nonFilteringInequality = prevNonfiltering
  end
  local query = context.queryStack:peek()
  query.expressions[#query.expressions + 1] = expression
  return resultVar
end

local function resolveObject(context, node)
  local query = context.queryStack:peek()
  local objectNode = generateObjectNode(node, context)
  if objectNode.type == "object" or objectNode.type == "mutate" then
    local queryKey = objectNode.type == "object" and "objects" or "mutates"
    query[queryKey][#query[queryKey] + 1] = objectNode
  elseif objectNode.type == "expression" then
    query.expressions[#query.expressions + 1] = objectNode
  end
  return objectNode.entityVariable
end

resolveExpression = function(node, context)
  if not node then return end

  if node.type == "NUMBER" or node.type == "STRING" or node.type == "UUID" or node.type == "BOOLEAN" then
    return makeNode(context, "constant", node, {constant = node.value, constantType = node.type:lower()})

  elseif node.type == "NONE" then
    if context.mutateOperator == "erase" or context.mutateOperator == "set" then
      return makeNode(context, "constant", node, {constant = node.value, constantType = node.type:lower()})
    else
      -- error
      errors.invalidNone(context, node)
    end

  elseif node.type == "variable" or node.type == "constant" then
    return node

  elseif node.type == "IDENTIFIER" then
    return resolveVariable(context, node.value, node)

  elseif node.type == "mutate" then
    return resolveMutate(context, node)

  elseif node.type == "inequality" or node.type == "equality" then
    return resolveEqualityLike(context, node)

  elseif node.type == "attribute" then
    local final, _ = resolveAttribute(context, node)
    return final

  elseif node.type == "object" then
    return resolveObject(context, node)

  elseif node.type == "infix" or node.type == "function" then
    return resolveFunctionLike(context, node)

  elseif node.type == "block" then
    if #node.children == 1 then
      return resolveExpression(node.children[1], context)
    else
      return node
    end

  else
    -- TODO
  end
end

generateObjectNode = function(root, context)
  local object = makeNode(context, "object", root, {
                  bindings = {},
                  scopes = context.mutateScopes or context.matchScopes,
                  query = context.queryStack:peek()
                })

  -- to ensure the right cardinality for mutates, we have to track
  -- what variables we depend on so that we can project the mutate
  -- over them
  local dependencies = Set:new()
  -- in case a sub-object is looking for projections, we should
  -- push our dependencies on the stack
  context.projections:push(dependencies)

  -- check if we're mutating and set the scope, operator, and
  -- projections if we are
  local mutating = context.mutating
  if mutating then
    object.type = "mutate"
    object.mutateType = context.mutateType
    object.operator = context.mutateOperator
    -- store all our parents' projections to reconcile later
    object.projection = {}
    for _, projection in ipairs(context.projections) do
      object.projection[#object.projection + 1] = projection
    end
    object.idProvider = context.idProvider
  end

  -- create a binding to this node's entity field
  local entityVariable = resolveVariable(context, string.format("object-%s-%s", root.line, root.offset), root, true)
  generateBindingNode(context, {field = MAGIC_ENTITY_FIELD, variable = entityVariable}, entityVariable, object)
  -- store it on the object for ease of use
  object.entityVariable = entityVariable

  -- last attribute handles the case where we have adjacent sub-objects
  -- which should be added as values to the last attribute we've seen
  -- e.g. [#div children: [#span] [#span]], both spans should be hooked
  -- to the children attribute
  local lastAttribute
  local lastAttributeIndex = 0

  for childIx, child in ipairs(root.children) do
    local type = child.type
    local next = root.children[childIx + 1]
    if type == "IDENTIFIER" then
      -- generate a variable
      local variable = resolveVariable(context, child.value, child)
      local binding = generateBindingNode(context, {field = child.value, variable = variable}, child, object)
      lastAttribute = nil
      dependencies:add(variable)

    elseif type == "object" then
      -- we have an object in here, if lastAttribute is set,
      -- this node should be added as another binding to that field
      -- if it's not, then this is an error
      if lastAttribute then
        lastAttributeIndex = lastAttributeIndex + 1
        if mutating then
          local indexIdentifier = makeNode(context, "IDENTIFIER", child, {value = "eve-auto-index"})
          local indexConstant = makeNode(context, "NUMBER", child, {value = tostring(lastAttributeIndex)})
          local equalityNode = makeNode(context, "equality", child, {operator = "=", children = {indexIdentifier, indexConstant}})
          child.children[#child.children + 1] = equalityNode
        end
        local variable = resolveExpression(child, context)
        local binding = generateBindingNode(context, {field = lastAttribute.value, variable = variable}, lastAttribute, object)
        -- if we're mutating we also need to bind eve-auto-index here
      else
        -- error
        errors.bareSubObject(context, child)
      end

    elseif type == "inequality" then
      local left = child.children[1]
      if left.type == "IDENTIFIER" then
        local variable = resolveVariable(context, left.value, left)
        local binding = generateBindingNode(context, {field = left.value, variable = variable}, child, object)

        local prevMutating = context.mutating
        context.mutating = nil
        resolveExpression(child, context)
        context.mutating = prevMutating
        lastAttribute = nil
        lastAttributeIndex = 0
      else
        -- error
        errors.unboundAttributeInequality(context, child)
      end

    elseif type == "equality" then
      -- the left has to be either a NAME, TAG, or IDENTIFIER
      local left = child.children[1]
      local right = child.children[2]
      local binding = {}
      local related

      if left.type == "NAME" then
        binding.field = "name"
        binding.constant = makeNode(context, "constant", right, {constant = right.value, constantType = "string"})
        related = right

      elseif left.type == "TAG" then
        binding.field = "tag"
        binding.constant = makeNode(context, "constant", right, {constant = right.value, constantType = "string"})
        related = right
        if not mutating and SPECIAL_TAGS[right.value] then
          object.type = "expression"
          object.operator = right.value
          binding = nil;
        end

      elseif right and left.type == "IDENTIFIER" then
        related = left
        binding.field = left.value
        lastAttribute = left
        lastAttributeIndex = 0
        -- if this is an object and we're mutating then we need to
        -- assign an eve-auto-index if there are several objects in
        -- a row
        if right.type == "object" and mutating and next and next.type == "object" then
          local indexIdentifier = makeNode(context, "IDENTIFIER", right, {value = "eve-auto-index"})
          local indexConstant = makeNode(context, "NUMBER", right, {value = tostring(lastAttributeIndex)})
          local equalityNode = makeNode(context, "equality", right, {operator = "=", children = {indexIdentifier, indexConstant}})
          right.children[#right.children + 1] = equalityNode
        end
        if right.type == "equality" and (right.children[1].type == "NAME" or right.children[2].type == "TAG") then
          -- error, two possible cases here, you either forgot [] or you meant for this to not be an equality
          -- for now we'll just assume it's the former
          errors.bareTagOrName(context, right)
        elseif right.type == "attribute" then
          local prevMutating = context.mutating
          context.mutating = nil
          local resolved = resolveExpression(right, context)
          context.mutating = prevMutating
          dependencies:add(resolved)
          lastAttribute = nil
          binding.variable = resolved
          binding = generateBindingNode(context, binding, related, object)
        else
          local resolved = resolveExpression(right, context)
          if not resolved then
            -- error
            binding = nil
            errors.invalidObjectAttributeBinding(context, right or child)
          elseif resolved.type == "constant" then
            binding.constant = resolved
            lastAttribute = nil
          elseif resolved.type == "variable" then
            binding.variable = resolved
            -- we only add non-objects to dependencies since sub
            -- objects have their own cardinalities to deal with
            if right.type ~= "object" then
              dependencies:add(resolved)
              lastAttribute = nil
            end
          else
            binding = nil
            -- error
            errors.invalidObjectAttributeBinding(context, right)
          end
        end

      else
        binding = nil
        -- error
        errors.invalidObjectAttributeBinding(context, child)
      end
      if binding then
        -- FIXME: is this the right related node for the binding?
        binding = generateBindingNode(context, binding, related, object)
      end

    elseif type == "not" and object.type == "object" then
      -- this needs to translate into a regular not that references this object
      -- via a constructed attribute call. we'll need the entityVariable as an identifier
      -- for that node
      local objectIdentifier = makeNode(context, "IDENTIFIER", child, {value = entityVariable.name})
      -- construct the not
      local constructedNot = makeNode(context, "not", child, {children = {}, closed = true})
      local childQuery = makeNode(context, "query", child, {parent = object, children = {}})
      constructedNot.children[1] = childQuery
      -- FIXME: for now we're only going to support not(attr) and not(#tag)
      -- but there's no technical reason we couldn't support more complex
      -- versions of inline not. They're just a lot harder to deal with.
      local attr = child.children[1].children[1]
      if attr.type == "IDENTIFIER" then
        -- not(parent.(attr.children[1]))
        local attributeIdentifier = makeNode(context, "IDENTIFIER", attr, {value = attr.value})
        local dotNode = makeNode(context, "attribute", attr, {children = {objectIdentifier, attributeIdentifier}})
        childQuery.children[#childQuery.children + 1] = dotNode

      elseif attr.type == "equality" and attr.children[1] and attr.children[1].type == "TAG" then
        local tag = attr.children[1]
        local tagValue = attr.children[2]
        -- not(parent.tag = attr.children[1])
        local attributeIdentifier = makeNode(context, "IDENTIFIER", tag, {value = "tag"})
        local dotNode = makeNode(context, "attribute", tag, {children = {objectIdentifier, attributeIdentifier}})
        local constantNode = makeNode(context, "STRING", tagValue, {value = tagValue.value})
        local equalityNode = makeNode(context, "equality", tag, {operator = "=", children = {dotNode, constantNode}})
        childQuery.children[#childQuery.children + 1] = equalityNode

      else
        -- error
        errors.invalidInlineNotChild(context, child, attr)
      end

      -- finally generate the not node
      local notNode = generateNotNode(constructedNot, context)
      object.query.nots[#object.query.nots + 1] = notNode

    else
      -- error
      errors.invalidObjectChild(context, child)
    end
  end

  -- a few objects ultimately end up parsed as expressions, we need to fix
  -- up the bindings and such in here if that ends up being the case.
  -- TODO: should we check the schema here? what should we do if something
  -- doesn't match?
  if object.type == "expression" then
    local finalBindings = {}
    for _, binding in ipairs(object.bindings) do
      if binding.field == MAGIC_ENTITY_FIELD then
        binding = generateBindingNode(context, {field = "return", variable = entityVariable}, entityVariable, object)
      -- FIXME: this is a hacky.. way to ignore the binding we just added so we don't
      -- end up with it twice
      elseif binding.field == "return" then
        binding = nil
      end
      if binding then
        finalBindings[#finalBindings + 1] = binding
      end
    end
    object.bindings = finalBindings
  end

  -- our dependencies are no longer relevant to anyone else,
  -- so let's clean them up
  context.projections:pop()

  if object.operator == "merge" then
    object.operator = "set"
  end

  return object
end


local function generateUnionNode(root, context, unionType)
  local union = makeNode(context, unionType, root, {
                 query = context.queryStack:peek(),
                 queries = {}
               })

  -- generate vars for the outputs
  local outputs = {}
  if root.outputs.type == "IDENTIFIER" then
    outputs[#outputs + 1] = resolveVariable(context, root.outputs.value, root.outputs)
  elseif root.outputs.type == "block" then
    for _, child in ipairs(root.outputs.children) do
      outputs[#outputs + 1] = resolveVariable(context, child.value, child)
    end
  else
    -- error
    errors.invalidUnionOutputsType(context, roout.outputs)
  end
  union.outputs = outputs

  for _, child in ipairs(root.children) do
    local type = child.type
    if type == "query" then
      context.unionNode = true
      union.queries[#union.queries + 1] = generateQueryNode(child, context)
      context.unionNode = false
    else
      -- error
      errors.invalidUnionChild(context, child)
    end
  end

  return union
end

generateNotNode = function(root, context)
  local notNode = makeNode(context, "not", root, {query = context.queryStack:peek()})
  if #root.children == 1 and root.children[1].type == "query" then
    context.notNode = true
    notNode.queries = {generateQueryNode(root.children[1], context)}
    context.notNode = false
  else
    -- error
    errors.invalidNotChild(context, root)
  end

  return notNode
end

local function findAndSetScope(root, context)
  local child = root.children[1]
  if not child then return end

  local scopes = {}
  if child.type == "block" then
    scopes = child.children
  elseif (child.type == "equality" and child.children[1].type == "NAME") or child.type == "string" then
    scopes[1] = child
  end

  -- if we found a scope declaration, remove the child from
  -- the list so we don't consider it when filling out the section
  if #scopes > 0 then
    table.remove(root.children, 1)
  end

  for _, scope in ipairs(scopes) do
    if scope.type == "equality" and scope.children[1].type == "NAME" then
      root.scopes:add(scope.children[2].value)
    elseif scope.type == "STRING" then
      root.scopes:add(scope.value)
    else
      -- error
      errors.invalidScopeDeclaration(context, scope)
    end
  end
end

local function handleUpdateNode(query, root, context)
  context.mutating = true

  findAndSetScope(root, context)

  for _, child in ipairs(root.children) do
    local type = child.type
    -- set some context information to handle nested objects
    -- most of the time we're just adding, so we'll default
    -- the operator to add
    context.mutateOperator = "insert"
    context.mutateScopes = root.scopes
    context.mutateType = root.mutateType
    if type == "mutate" then
      -- the operator depends on the mutate's operator here
      context.mutateOperator = child.operator
      resolveExpression(makeNode(context, "mutate", child, {operator = child.operator, children = child.children}), context)
    elseif type == "object" then
      -- generate the object
      local object = generateObjectNode(child, context)
      if object.type == "mutate" then
        query.mutates[#query.mutates + 1] = object
      else
        -- error
        errors.updatingNonMutate(context, object)
      end
    elseif type == "equality" then
      -- equalities are allowed if the left is an identifier
      -- and the right is an object, to allow for object references
      local left = child.children[1]
      local right = child.children[2]
      if left.type == "IDENTIFIER" and right.type == "object" then
        context.idProvider = true
        resolveExpression(child, context)
        context.idProvider = false
      else
        -- error
        errors.invalidUpdateEquality(context, child, left, right)
      end
    else
      -- error
      errors.invalidUpdateChild(context, child)
    end
    -- clean up
    context.mutateOperator = nil
    context.mutateScopes = nil
    context.mutateType = nil
  end

  context.mutating = false
end

local function handleMatchNode(query, root, context)

  if not context.unionNode and not context.notNode then
    findAndSetScope(root, context)
    context.matchScopes = root.scopes
  end

  for _, child in ipairs(root.children) do
    local type = child.type
    if type == "object" then
      local node = generateObjectNode(child, context)
      if node.type == "object" then
        query.objects[#query.objects + 1] = node
      elseif node.type == "expression" then
        query.expressions[#query.expressions + 1] = node
      else
        -- error
        errors.invalidQueryChild(context, token)
      end

    elseif type == "equality" then
      if #child.children > 0 and (child.children[1].type == "TAG" or child.children[1].type == "NAME") then
        errors.bareTagOrName(context, child)
      else
        local left = resolveExpression(child, context)
      end

    elseif type == "inequality"then
      resolveExpression(child, context)

    elseif type == "function" then
      context.noReturn = true
      resolveExpression(child, context)
      context.noReturn = false

    elseif type == "choose" then
      local node = generateUnionNode(child, context, "choose")
      query.chooses[#query.chooses + 1] = node

    elseif type == "union" then
      local node = generateUnionNode(child, context, "union")
      query.unions[#query.unions + 1] = node

    elseif type == "not" then
      local node = generateNotNode(child, context)
      query.nots[#query.nots + 1] = node

    elseif type == "attribute" then
      -- attribute expressions are allowed at the top level as well
      -- since they are basically looking up an attribute which would filter
      -- out those objects without it. This is primarily used in nots
      local attribute = resolveExpression(child, context)

    elseif type == "outputs" then
      local outputs = root.outputs
      if not outputs then
        -- error
        errors.invalidUnionOutputsType(context, outputs)
      elseif outputs.type == "IDENTIFIER" and #child.children == 1 then
        local output = child.children[1]
        if not valueTypes[output.type] and output.type ~= "object" then
          -- error, invalid output type
          errors.invalidOutputType(context, output)
        else
          local equality = makeNode(context, "equality", output, {operator = "=", children = {outputs, output}})
          resolveExpression(equality, context)
        end
      elseif outputs.type == "block" and child.children[1].type == "block" then
        local block = child.children[1]
        if #block.children == #outputs.children then
          for ix, output in ipairs(outputs.children) do
            if not valueTypes[output.type] and output.type ~= "object" then
              -- error, invalid output type
              errors.invalidOutputType(context, output)
            else
              local equality = makeNode(context, "equality", block.children[ix], {operator = "=", children = {output, block.children[ix]}})
              resolveExpression(equality, context)
            end
          end
        else
          -- error, output numbers don't match up
          errors.outputNumberMismatch(context, block, outputs)
        end
      else
        -- error mismatched outputs
        errors.outputTypeMismatch(context, child.children[1], outputs)
      end

    elseif type == "variable" and context.unionNode then
      -- in union/choose, it's ok to have a bare variable, e.g.
      -- guest = if friend then friend
      --         if friend.spouse then friend.spouse
      -- there's nothing we actually need to do here, but it's not an error

    else
      -- error
      errors.invalidQueryChild(context, child)
    end
  end

  if not context.unionNode and not context.notNode then
    context.matchScopes = nil
  end
end

generateQueryNode = function(root, context)
  local query = makeNode(context, "query", root, {
                 name = root.doc,
                 variables = {},
                 objects = {},
                 mutates = {},
                 expressions = {},
                 nots = {},
                 unions = {},
                 chooses = {}
               })

  -- push this query on to the stack
  context.queryStack:push(query)
  context.nameMappings:push({})

  for _, child in ipairs(root.children) do
    local type = child.type
    if type == "match" then
      handleMatchNode(query, child, context)
    elseif context.notNode or context.unionNode then
      handleMatchNode(query, root, context)
    elseif type == "update" then
      handleUpdateNode(query, child, context)
    else
      -- error
      errors.invalidQueryChild(context, child)
    end
  end

  -- take this query out of the stack before moving on
  context.queryStack:pop()
  context.nameMappings:pop()
  return query
end

local function generateNodes(root, extraContext)
  local context = {queryStack = Stack:new(), nameMappings = Stack:new(), projections = Stack:new()}
  for key, value in pairs(extraContext) do
    context[key] = value
  end
  local nodes =  {}
  for _, child in ipairs(root.children) do
    if child.type == "query" then
      context.variableToBindings = {}
      nodes[#nodes + 1] = generateQueryNode(child, context)
      -- TODO: check the query for updates. If there aren't any and we're not in
      -- some weird context then this should warn that it will do nothing.
    else
      -- error
      errors.invalidTopLevel(context, child)
    end
  end
  return {id = "root", type = "code", children = nodes, ast = root, context = extraContext}
end

------------------------------------------------------------
-- ParseFile
------------------------------------------------------------

local function makeContext(code, file)
  return {code = code, downEdges = {}, file = file, errors = {}, comments = {}}
end

local function parseFile(path)
  local content = fs.read(path)
  content = content:gsub("\t", " ")
  content = content:gsub("\r", "")
  local context = makeContext(content, path)
  local tokens = lex(content)
  context.tokens = tokens
  local tree = {type="expression tree", children = parse(tokens, context)}
  local graph = generateNodes(tree, context)
  return graph
end

local function parseString(str)
  str = str:gsub("\t", " ")
  str = str:gsub("\r", "")
  local context = makeContext(str)
  local tokens = lex(str)
  context.tokens = tokens
  local tree = {type="expression tree", children = parse(tokens, context)}
  local graph = generateNodes(tree, context)
  return graph
end

function traceError(err)
  local stack = tostring(debug.traceback())
  local lines = {}
  for line in string.gmatch(stack, "([^\n]+)") do
    lines[#lines + 1] = line
  end

  return {message = err, stack = table.concat(lines, "\n", 3, #lines - 2)}
end

local function parseJSON(str)
  local ok, parseOrError = xpcall(function() return parseString(str) end, traceError)
  if not ok then
    return util.toJSON({type = "error", stage = "parse", message = parseOrError.message, stack = parseOrError.stack})
  else
    return string.format("{\"type\": \"parse\", \"parse\": %s}", util.toFlatJSON(parseOrError))
  end

end

local function printParse(content)
  content = content:gsub("\t", " ")
  content = content:gsub("\r", "")
  local context = makeContext(content)
  local tokens = lex(content)
  context.tokens = tokens
  local tree = {type="expression tree", children = parse(tokens, context)}
  print()
  print(color.dim("---------------------------------------------------------"))
  print(color.dim("-- Parse tree"))
  print(color.dim("---------------------------------------------------------"))
  print()
  print(formatGraph(tree))
  print()
  print(color.dim("---------------------------------------------------------"))
  print(color.dim("-- Query graph"))
  print(color.dim("---------------------------------------------------------"))
  print()
  local graph = generateNodes(tree, context)
  print(formatQueryGraph(graph))
  print()
  print(color.dim("---------------------------------------------------------"))
end

------------------------------------------------------------
-- Parser interface
------------------------------------------------------------

return {
  parseFile = parseFile,
  parseString = parseString,
  parseJSON = parseJSON,
  printParse = printParse,
  formatGraph = formatGraph,
  formatQueryGraph = formatQueryGraph,
  makeNode = makeNode,
  ENTITY_FIELD = MAGIC_ENTITY_FIELD
}
