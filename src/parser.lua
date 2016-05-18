local fs = require("fs")
local utf8 = require("utf8")
local color = require("color")

------------------------------------------------------------
-- Utils
------------------------------------------------------------

function makeWhitespace(size, char)
  local whitespace = {}
  local char = char or " "
  for i = 0, size do
    whitespace[#whitespace + 1] = char
  end
  return table.concat(whitespace)
end

function split(str, delim)
  local final = {}
  for token in string.gmatch(str, string.format("[^%s]+", delim)) do
    print("GOT TOKEN!", token)
    final[#final + 1] = token
  end
  return final
end

local function split(str, delim)
  local final = {}
  local index = 1
  local splitStart, splitEnd = string.find(str, delim, index)
  while splitStart do
    final[#final + 1] = string.sub(str, index, splitStart-1)
    index = splitEnd + 1
    splitStart, splitEnd = string.find(str, delim, index)
  end
  final[#final + 1] = string.sub(str, index)
  return final
end

function dedent(str)
    local lines = split(str,'\n')
    local _, indent = lines[1]:find("^%s*")
    local final = {}
    for _, line in ipairs(lines) do
      final[#final + 1] = line:sub(indent + 1)
      final[#final + 1] = "\n"
    end
    return table.concat(final)
end

function indent(str, by)
    local lines = split(str,'\n')
    local whitespace = makeWhitespace(by)
    local final = {}
    for _, line in ipairs(lines) do
      final[#final + 1] = whitespace
      final[#final + 1] = line
      final[#final + 1] = "\n"
    end
    return table.concat(final)
end

------------------------------------------------------------
-- UTF8 StringScanner
------------------------------------------------------------

local StringScanner = {}

function StringScanner:new(str)
  newObj = {pos = 0, str = str}
  self.__index = self
  return setmetatable(newObj, self)
end

function StringScanner:peek()
  _, char = utf8.next(self.str, self.pos)
  if char then
    return utf8.char(char)
  end
  return nil
end

function StringScanner:read()
  local char
  if self.pos == 0 then
    _, char = utf8.next(self.str)
  else
    _, char = utf8.next(self.str, self.pos)
  end
  if char then
    self.pos = self.pos + 1
    return utf8.char(char)
  end
  return nil
end

function StringScanner:unread()
  self.pos = self.pos - 1
end

function StringScanner:setPos(pos)
  self.pos = pos
end

function StringScanner:eatWhile(func)
  local char = self:read()
  local final = {}
  local prev = nil
  while char and func(char, prev) do
    prev = char
    final[#final+1] = char
    char = self:read()
  end
  self:unread()
  return table.concat(final)
end

------------------------------------------------------------
-- Lexer
------------------------------------------------------------

local Token = {}

function Token:new(type, value, line, offset)
  return {type = type, value = value, line = line, offset = offset}
end

function Token:format(token)
  return color.dim("[") .. string.format("%s %s", color.dim(token.type), color.bright(token.value), color.dim(token.line), color.dim(token.offset)) .. color.dim("]")
end

function Token:print(token)
  io.write(Token:format(token))
end

function Token:printLines(lines)
  for lineNum, line in pairs(lines) do
    io.write(lineNum, " ")
    for _, token in pairs(line) do
      Token:print(token)
      io.write(" ")
    end
    io.write("\n")
  end
end

function Token:tokensToLine(tokens)
  local final = {}
  local prevOffset = tokens[1].offset + 1
  for _, token in ipairs(tokens) do
    final[#final + 1] = makeWhitespace(token.offset - prevOffset)
    final[#final + 1] = token.value
    prevOffset = token.offset + #token.value + 1
  end
  return table.concat(final)
end

local specials = {
  ["@"] = "NAME",
  ["#"] = "TAG",
  ["."] = "DOT",
  [","] = "COMMA",
  ["="] = "EQUAL",
  [":"] = "ALIAS",
  ["*"] = "WILDCARD",
  ["("] = "OPEN_PAREN",
  [")"] = "CLOSE_PAREN"
}
local numeric = {["0"] = true, ["1"] = true, ["2"] = true, ["3"] = true,
                 ["4"] = true, ["5"] = true, ["6"] = true, ["7"] = true,
                 ["8"] = true, ["9"] = true}
local keywords = {
  choose = "CHOOSE",
  union = "UNION",
  ["and"] = "AND",
  ["or"] = "OR",
  add = "ADD",
  remove = "REMOVE"
}
local whitespace = { [" "] = true, ["\n"] = true, ["\t"] = true }
local function isIdentifierChar(char)
  return not specials[char] and not whitespace[char]
end
local function inString(char, prev)
  return char ~= "\"" or prev == "\\"
end
local function isNumber(char)
  return numeric[char] or char == "-" or char == "."
end
local function notNewline(char)
  return char ~= "\n"
end
local function lex(str)
  local scanner = StringScanner:new(str)
  local char = scanner:read()
  local line = 1
  local offset = 0
  local tokens = {}
  local lines = {tokens}
  while char do
    if whitespace[char] then
      if char == "\n" then
        line = line + 1
        offset = 0
        tokens = {}
        lines[#lines + 1] = tokens
      else
        offset = offset + 1
      end
    elseif char == "\"" then
      string = scanner:eatWhile(inString)
      -- skip the end quote
      scanner:read()
      tokens[#tokens+1] = Token:new("STRING", string, line, offset)
      offset = offset + #string
    elseif char == ";" then
      scanner:unread()
      local comment = scanner:eatWhile(notNewline)
      tokens[#tokens+1] = Token:new("COMMENT", comment, line, offset)
      offset = offset + #comment
    elseif numeric[char] then
      -- go back two positions to see if before this number started, there
      -- was a negative symbol
      scanner:setPos(scanner.pos - 2)
      local prev = scanner:peek()
      local tokenIx = #tokens + 1
      if prev == "-" then
        -- we'll let isNumber eat this guy and we need to shift
        -- the previous token out
        tokenIx = tokenIx - 1
      else
        -- ignore that char and get back to where we should be
        scanner:setPos(scanner.pos + 1)
      end
      local number = scanner:eatWhile(isNumber)
      tokens[tokenIx] = Token:new("NUMBER", number, line, offset)
      offset = offset + #number
    elseif specials[char] then
      tokens[#tokens+1] = Token:new(specials[char], char, line, offset)
      offset = offset + 1
    else
      scanner:unread()
      local identifier = scanner:eatWhile(isIdentifierChar)
      local keyword = keywords[identifier]
      local type = keyword or "IDENTIFIER"
      tokens[#tokens+1] = Token:new(type, identifier, line, offset)
      offset = offset + #identifier
    end
    char = scanner:read()
  end
  return lines
end

------------------------------------------------------------
-- TokenScanner
------------------------------------------------------------

local TokenScanner = {}
function TokenScanner:new(tokens)
  newObj = {pos = 1, tokens = tokens}
  self.__index = self
  return setmetatable(newObj, self)
end
function TokenScanner:peek()
  return self.tokens[self.pos]
end

function TokenScanner:read()
  token = self.tokens[self.pos]
  self.pos = self.pos + 1
  return token
end

function TokenScanner:unread()
  self.pos = self.pos - 1
end

function TokenScanner:setPos(pos)
  self.pos = pos
end

function TokenScanner:eatWhile(func)
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
-- Errors
------------------------------------------------------------

local function formatErrorLine(line, offset, length)
  local lineString = color.dim(line.line .. "|") .. makeWhitespace(line.offset) .. Token:tokensToLine(line.tokens)
  if offset and length then
    lineString = lineString .. "\n" .. makeWhitespace(offset + 2) .. color.error(makeWhitespace(length, "-"))
  end
  return lineString
end

-- Print error allows for the following bits of information
-- type = error type
-- line = offending line object (this is used to get the context, line text, etc)
-- offset = offset in the line where the error starts
-- length = length to highlight
-- content = array
--    the content array can contain a placeholder sting of "%LINE%" to embed the offending line
local function printError(errorInfo)
  local type, line, offset, length, content = errorInfo.type, errorInfo.line, errorInfo.offset, errorInfo.length, errorInfo.content
  -- walk up the line tree until you get to the parent node
  local file, context
  local parentNode = line.parent
  while parentNode do
    if parentNode.type == "context" then
      context = parentNode
      file = parentNode.file
    end
    parentNode = parentNode.parent
  end

  local lineString = formatErrorLine(line, offset, length)

  local finalContent = indent(dedent(content):gsub("%%LINE%%", lineString), 0)
  finalContent = finalContent:gsub("(//[^\n]+)", function(match)
    return color.dim(match)
  end)

  print(color.bright("---------------------------------------------------------"))
  print(color.bright(string.format(" %s", type or "parse error")))
  print(color.dim(string.format(" %s", file)))
  print("")
  print(finalContent)
end

------------------------------------------------------------
-- Parse
------------------------------------------------------------

local function buildLineTree(lines, context)
  local parent = context
  parent.offset = -1
  parent.line = -1
  parent.children = {}
  parent.lines = {}
  parent.type = "context"
  for _, line in ipairs(lines) do
    local child = {tokens = line, children = {}, type = "line"}
    local first = line[1]
    if first then
      child.offset = first.offset
      child.line = first.line
      -- if we're at a lower indent level than our parent,
      -- walk up the tree until we're not
      while parent and child.offset <= parent.offset do
        parent = parent.parent
      end
      parent.children[#parent.children + 1] = child
      child.parent = parent
      parent = child
      context.lines[#context.lines + 1] = child
    end
  end
  return context
end

local function makeNode(type, parent, line, offset)
  local node = {type = type, parent = parent, line = line, offset = offset, children = {}}
  parent.children[#parent.children + 1] = node
  return node
end

local parseLine

local function getLineNode(line)
  local node = line.node
  if node then return node end
  line.node = parseLine(line)
  return line.node
end

local function getPreviousSiblingNode(line)
  local children = line.parent.children
  for index, value in ipairs(children) do
    if line == value then
      local prev = children[index - 1]
      return prev and getLineNode(prev) or nil
    end
  end
  return nil
end

local function resolveVariable(parentNode, token, name)
  -- to resolve variables, we walk up the chain to find
  -- all the containing queries. The top-most query contains
  -- all variables in scope, we'll do the resolution there and if
  -- we create a new variable, trickle it back down to the other
  -- queries
  local queries = {}
  while parentNode do
    if parentNode.type == "query" then
      queries[#queries + 1] = parentNode
    end
    parentNode = parentNode.parent
  end
  local top = queries[#queries]
  local var = top.variables[name] or makeNode("variable", top, token.line, token.offset)
  var.name = name
  for _, query in ipairs(queries) do
    query.variables[name] = var
  end
  return var
end

local function parseObjectLine(line)
  local parent = getLineNode(line.parent)
  local scanner = TokenScanner:new(line.tokens)
  local first = scanner:read()
  local node = makeNode("object", parent, line.line, line.offset)
  local resolved
  if first.type == "TAG" then
    local name = scanner:read()
    if not name then
      printError({type="Invalid tag", line = line, offset = first.offset + 1, length = 0, content = [[
      Expected a name or string after the # symbol.

      %LINE%

      The # symbol denotes that you're looking for or adding a tag.

      Examples:

        // objects in the system tagged "person"
        #person

        // object in the system tagged "cool person"
        #"cool person"
      ]]})
    elseif name.type == "IDENTIFIER" then
      resolved = resolveVariable(parent, name, name.value)
    elseif name.type == "STRING" then
      -- @TODO we need to generate some random var
    else
      printError({type="Invalid tag", line = line, offset = first.offset + 1, length = 1})
      -- print(string.format(color.error("Expected a tag name or string after the # symbol on line %s"), line.line))
    end
    -- create the tag binding
  elseif first.type == "NAME" then
    local name = scanner:read()
    if name.type == "IDENTIFIER" then
      resolved = resolveVariable(parent, name, name.value)
    elseif name.type == "STRING" then
      -- @TODO we need to generate some random var
    else
      print(string.format(color.error("Expected a name or string after the @ symbol on line %s"), line.line))
    end
    -- create the name binding
  end
  if resolved then
    node.variable = resolved
  end
  return node
end

local function parseAttributeLine(line)
  local parent = getLineNode(line.parent)
  local scanner = TokenScanner:new(line.tokens)
  local first = scanner:read()
  local node = makeNode("binding", parent, line.line, line.offset)
  local attributeName
  if first.type == "IDENTIFIER" then
    attributeName = first.value
  else
    print(string.format(color.error("Expected the name of an attribute on line %s"), line.line))
  end

  local second = scanner:read()
  if second and (second.type == "EQUAL" or second.type == "ALIAS") then
    -- @TODO: this should be turned into a thing to generically take a scanner
    -- and parse an expression, returning either a constant or a variable to
    -- bind to
    local third = scanner:read()
    if not third then
      -- it's possible that this continues on the next line. Maybe check for
      -- children and if there aren't any, throw an error?
    elseif third.type == "NUMBER" or third.type == "STRING" then
      node.constant = third.value
      node.constantType = third.type
    elseif third.type == "IDENTIFIER" then
      node.variable = resolveVariable(parent, third, third.name)
    end
  else
    node.variable = resolveVariable(parent, first, attributeName)
  end
  node.source = parent
  node.field = attributeName
  return node
end

local function parseMutation(line)
  local parent = getLineNode(line.parent)
  local first = line.tokens[1]
  local type = "add"
  if first.type == "REMOVE" then
    type = "remove"
  end
  return makeNode(type, parent, line.line, line.offset)
end

parseLine = function(line)
  if line.type == "context" then
    return {type="context", children={}, file = line.file}
  end

  local node
  local parent = getLineNode(line.parent)
  local scanner = TokenScanner:new(line.tokens)
  local first = scanner:peek()
  -- if the line is at root indentation, then there are two possibilities
  -- the line is either the start of a query, or it's another line of documentation
  -- for the preceeding query
  if line.offset == 0 then
    local sibling = getPreviousSiblingNode(line)
    -- if the sibling is exactly next to this one and it's a query,
    -- then we're just adding to the name
    if sibling and sibling.line == line.line - 1 then
      sibling.name = sibling.name .. "\n" .. Token:tokensToLine(line.tokens)
      node = sibling
    else
      -- otherwise, this is a brand new query node
      node = makeNode("query", parent, line.line, line.offset)
      node.name = Token:tokensToLine(line.tokens)
      node.variables = {}
    end
  elseif first then
    if parent.type == "object" then
      node = parseAttributeLine(line)
    end
    if first.type == "TAG" or first.type == "NAME" then
      node = parseObjectLine(line)
    end
    if first.type == "ADD" or first.type == "REMOVE" then
      node = parseMutation(line)
    end
  end
  if not node then
    node = makeNode("unknown", parent, line.line, line.offset)
  end
  return node
end

local function parseLineTree(root)
  local function walkNode(node)
    getLineNode(node)
    for _, child in ipairs(node.children) do
      walkNode(child)
    end
  end
  return walkNode(root)
end

local function formatNode(node, depth)
  local indent = makeWhitespace(depth * 4)
  local string = color.dim(string.format("%s%s| ", indent , depth)) .. color.warning(node.type) .. "\n"
  local childIndent = color.dim(indent .. " |      ")
  for k, v in pairs(node) do
    if k == "children" or k == "parent" or k == "type" then
      -- do nothing
    elseif k == "variable" then
      string = string .. childIndent .. color.dim("variable: ") .. v.name .. "\n"
    elseif k == "variables" then
      string = string .. childIndent .. color.dim("variables: ")
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
  if not root or seen[root] then return "" end
  string = formatNode(root, depth)
  seen[root] = true
  if root.children then
    for _, child in pairs(root.children) do
      string = string .. formatGraph(child, seen, depth + 1)
    end
  end
  return string
end

------------------------------------------------------------
-- ParseFile
------------------------------------------------------------

local function parseFile(args)
  if not args[2] then
    print(color.error("Parse requires a file to parse"))
    return
  elseif not fs.exists(args[2]) then
    print(string.format(color.error("Couldn't open file %s for parsing"), args[2]))
    return
  end
  print()
  print(color.dim("---------------------------------------------------------"))
  print(color.dim("-- Line tree"))
  print(color.dim("---------------------------------------------------------"))
  print()
  local path = args[2]
  local content = fs.read(path)
  local lines = lex(content)
  -- Token:printLines(lines)
  local lineTree = buildLineTree(lines, {file=path, type="file"})
  print(formatGraph(lineTree))
  parseLineTree(lineTree)
  print()
  print(color.dim("---------------------------------------------------------"))
  print(color.dim("-- Parse tree"))
  print(color.dim("---------------------------------------------------------"))
  print()
  print(formatGraph(lineTree.node))
  print()
  print(color.dim("---------------------------------------------------------"))
end

------------------------------------------------------------
-- Parser interface
------------------------------------------------------------

return {parseFile = parseFile}

