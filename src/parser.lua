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

local Token = {}

function Token:new(type, value, line, offset)
  return {id = util.generateId(), type = type, value = value, line = line, offset = offset}
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
  save = "SAVE",
  maintain = "MAINTAIN",
  ["if"] = "IF",
  ["then"] = "THEN",
  ["else"] = "ELSE",
  ["or"] = "OR",
  ["not"] = "NOT",
  none = "NONE",
  given = "GIVEN",
  per = "PER",
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
}

local whitespace = { [" "] = true, ["\n"] = true, ["\t"] = true, ["\r"] = true }

local function isIdentifierChar(char)
  return not specials[char] and not whitespace[char]
end

local function inString(char, prev, prev2)
  return (char ~= "\"" and char ~= "{") or (prev == "\\" and prev2 ~= "\\")
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
  local tokens = {}
  while char do
    if whitespace[char] then
      if char == "\n" then
        line = line + 1
        offset = 0
      else
        offset = offset + 1
      end

    -- anything at root level is just documentation
    elseif offset == 0 then
      scanner:unread()
      local doc = scanner:eatWhile(notNewline)
      tokens[#tokens+1] = Token:new("DOC", doc, line, offset)
      offset = offset + #doc

    elseif char == "\"" or char == "}" then
      if char == "\"" then
        tokens[#tokens+1] = Token:new("STRING_OPEN", "\"", line, offset)
        offset = offset + 1
      end
      local string = scanner:eatWhile(inString)
      if #string > 0 then
        tokens[#tokens+1] = Token:new("STRING", string, line, offset)
      end
      -- skip the end quote
      if scanner:peek() == "\"" then
        scanner:read()
        tokens[#tokens+1] = Token:new("STRING_CLOSE", "\"", line, offset + #string)
        offset = offset + 1
      end
      offset = offset + #string

    elseif char == "⦑" then
      -- FIXME: why are these extra reads necessary? it seems like
      -- the utf8 stuff isn't getting handled correctly for whatever
      -- reason
      scanner:read()
      scanner:read()
      local UUID = scanner:eatWhile(isUUID)
      -- skip the end bracket
      scanner:read()
      scanner:read()
      scanner:read()
      tokens[#tokens+1] = Token:new("UUID", UUID, line, offset)
      offset = offset + #UUID + 3

    elseif char == "/" and scanner:peek() == "/" then
      scanner:unread()
      local comment = scanner:eatWhile(notNewline)
      tokens[#tokens+1] = Token:new("COMMENT", comment, line, offset)
      offset = offset + #comment

    elseif (char == "-" and numeric[scanner:peek()]) or numeric[char] then
      scanner:unread()
      local number = scanner:eatWhile(isNumber)
      tokens[#tokens+1] = Token:new("NUMBER", number, line, offset)
      offset = offset + #number

    elseif specials[char] then
      local next = scanner:peek()
      -- FIXME: there's gotta be a better way to deal with this than special casing it
      if char == ":" and next == "=" then
        tokens[#tokens+1] = Token:new(keywords[":="], ":=", line, offset)
        -- skip the =
        scanner:read()
        offset = offset + 2
      else
        tokens[#tokens+1] = Token:new(specials[char], char, line, offset)
        offset = offset + 1
      end

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
  local node = {type = type, line = token.line, offset = token.offset, id = util.generateId()}
  if token.id then
    context.downEdges[#context.downEdges + 1] = {token.id, node.id}
  end
  for k, v in pairs(rest) do
    node[k] = v
  end
  return node
end

local valueTypes = {IDENTIFIER = true, infix = true, ["function"] = true, NUMBER = true, STRING = true, block = true, attribute = true}
local infixTypes = {equality = true, infix = true, attribute = true, mutate = true, inequality = true}
local singletonTypes = {outputs = true}
local alphaFields = {"a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o"}

local function parse(tokens, context)
  local stack = Stack:new()
  local scanner = ArrayScanner:new(tokens)
  local token = scanner:read()
  local final = {}
  local info = {errors = {}, comments = {}}

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
    local next = scanner:peek()

    if type == "DOC" then
      -- if there's already a query on the stack and this line is directly following
      -- the last line of the start of the query, then this is just more doc for that
      -- query
      if stackTop.type == "query" and stackTop.line + 1 == token.line then
        stackTop.doc = stackTop.doc .. "\n" .. token.value
        stackTop.line = token.line
      else
        -- clear everything currently on the stack as we're starting a totally new
        -- query
        stackTop = tryFinishExpression(true)
        stack:push(makeNode(context, "query", token, {doc = token.value, children = {}}))
      end

    elseif type == "COMMA" then
      -- we treat commas as whitespace

    elseif type == "COMMENT" then
      info.comments[#info.comments + 1] = token

    elseif type == "STRING_OPEN" then
      stack:push(makeNode(context, "function", token, {func = "concat", children = {right}}))

    elseif type == "STRING_CLOSE" then
      if stackTop.type == "function" and stackTop.func == "concat" then
        -- if there's zero or one children, then this concat isn't needed
        if #stackTop.children == 0 or (#stackTop.children == 1 and stackTop.children[1].type == "STRING") then
          local string = stackTop.children[1] or makeNode(context, "STRING", token, {value = ""})
          stack:pop()
          stackTop = stack:peek()
          stackTop.children[#stackTop.children + 1] = string
        else
          stackTop.closed = true
        end
      else
        -- error
        errors.string_close(context, token, stackTop and stackTop.type)
      end

    elseif type == "OPEN_CURLY" or type == "CLOSE_CURLY" then
      -- we can just ignore these

    elseif type == "OPEN_BRACKET" then
      stack:push(makeNode(context, "object", token, {children = {}}))

    elseif type == "CLOSE_BRACKET" then
      if stackTop.type ~= "object" then
        -- error
        errors.invalidCloseBracket(context, token, stack)
      else
        stackTop.closed = true
      end

    elseif type == "SAVE" or type == "MAINTAIN" then
      local update = makeNode(context, "update", token, {scope = "session", children = {}})
      if type == "MAINTAIN" then
        update.scope = "event"
      elseif next.value == "all" or next.value == "event" then
        update.scope = next.value
        -- eat that token
        scanner:read()
        -- @TODO: handle specifying a custom bag
      end
      -- if we are already in an update node, then this update closes the old
      -- one and puts us into a new one
      if stackTop.type == "update" then
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
        if outputs.type ~= "block" and outputs.type ~= "IDENTIFIER" then
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
          local childQuery = makeNode(context, "outputs", token, {children = {}}) 
          stack:push(childQuery)
        end
      end

    elseif type == "THEN" then
      -- TODO: this needs to check further up the stack to make
      -- sure that query is part of a choose or union...
      if stackTop.type == "query" then
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
      if next.type == "STRING_OPEN" or next.type == "IDENTIFIER" then
        stack:push(makeNode(context, "equality", token, {operator = "=", children = {token}}))
      else
        -- error
        errors.invalidTag(context, token, next)
      end

    elseif type == "DOT" then
      local prev = stackTop.children[#stackTop.children]
      if prev and (prev.type == "equality" or prev.type == "mutate" or prev.type == "inequality" or prev.type == "function" or prev.type == "infix") then
        local right = prev.children[2]
        if right and right.type == "IDENTIFIER" then
          stackTop.children[#stackTop.children] = nil
          -- remove the right hand side of the equality and put it back on the
          -- stack
          prev.children[2] = nil
          stack:push(prev)
          -- now push this expression on the stack as well
          stack:push(makeNode(context, "attribute", token, {children = {right}}))
        else
          -- error
          errors.invalidAttributeLeft(context, token, right)
        end

      -- it needs to either be an expression, an identifier, or a constant
      elseif prev and prev.type == "IDENTIFIER" then
        stackTop.children[#stackTop.children] = nil
        stack:push(makeNode(context, "attribute", token, {children = {prev}}))
      else
        -- error
        errors.invalidAttributeLeft(context, token, prev)
      end

    elseif type == "INFIX" then
      -- get the previous child
      local prev = stackTop.children[#stackTop.children]
      if prev and (prev.type == "equality" or prev.type == "mutate" or prev.type == "inequality") then
        local right = prev.children[2]
        if right and valueTypes[right.type] then
          stackTop.children[#stackTop.children] = nil
          -- remove the right hand side of the equality and put it back on the
          -- stack
          prev.children[2] = nil
          stack:push(prev)
          -- now push this expression on the stack as well
          stack:push(makeNode(context, "infix", token, {func = token.value, children = {right}}))
        else
          -- error
          errors.invalidInfixLeft(context, token, prev)
        end
      -- it needs to either be an expression, an identifier, or a constant
      elseif prev and valueTypes[prev.type] then 
        stackTop.children[#stackTop.children] = nil
        stack:push(makeNode(context, "infix", token, {func = token.value, children = {prev}}))
      else
        -- error
        errors.invalidInfixLeft(context, token, prev)
      end

    elseif type == "EQUALITY" or type == "ALIAS" or type == "INEQUALITY" then
      -- get the previous child
      local prev = stackTop.children[#stackTop.children]
      if not prev or prev.type == "equality" or prev.type == "inequality" or 
         stackTop.type == "equality" or stackTop.type == "inequality" then
        -- error
        errors.invalidEqualityLeft(context, token, prev)
      else
        local nodeType = type == "INEQUALITY" and "inequality" or "equality"
        stackTop.children[#stackTop.children] = nil
        stack:push(makeNode(context, nodeType, token, {operator = token.value, children = {prev}}))
      end

    elseif type == "OPEN_PAREN" then
      stack:push(makeNode(context, "block", token, {children = {}}))

    elseif type == "CLOSE_PAREN" then
      local stackType = stackTop.type
      if (stackType == "block" or stackType == "function" or stackType == "grouping"
                      or stackType == "projection" or (stackTop.parent and stackTop.parent.type == "not")) then
        stackTop.closed = true
        -- this also closes out the containing function in the case of aggregate
        -- modifiers
        if stackType == "projection" or stackType == "grouping" then
          stack[#stack - 1].closed = true
        end
      else
        -- error
        errors.invalidCloseParen(context, token, stack)
      end

    elseif type == "INSERT" or type == "REMOVE" or type == "SET" then
      -- get the previous child since these ops are infix
      local prev = stackTop.children[#stackTop.children]
      if not prev or (prev.type ~= "IDENTIFIER" and prev.type ~= "attribute") then
        -- error
        errors.invalidInfixLeft(context, token, prev)
      else
        stackTop.children[#stackTop.children] = nil
        stack:push(makeNode(context, "mutate", token, {operator = type:lower(), children = {prev}}))
      end

    elseif type == "IDENTIFIER" and next and next.type == "OPEN_PAREN" then
      stack:push(makeNode(context, "function", token, {func = token.value, children = {}}))
      -- consume the paren
      scanner:read()

    elseif type == "GIVEN" or type == "PER" then
      if stackTop.type == "function" or stackTop.type == "grouping" or stackTop.type == "projection" then
        -- if we are currently working on one of the other modifiers, we're
        -- done with that one and should clean it out
        if stackTop.type == "grouping" or stackTop.type == "projection" then
          stackTop.closed = true
          tryFinishExpression()
        end
        local modifier = type == "GIVEN" and "projection" or "grouping"
        stack:push(makeNode(context, modifier, token, {children = {}}))
      else
        -- error
        errors.invalidAggregateModifier(context, token, stackTop)
      end

    elseif type == "IDENTIFIER" or type == "NUMBER" or type == "STRING" or type == "UUID" then
      stackTop.children[#stackTop.children + 1] = token

    else
      -- error
      errors.crazySyntax(context, token)
    end

    stackTop = tryFinishExpression()
    token = scanner:read()

    -- choose and union get closed when they are the top of the stack
    -- and the next token is not either an if or an else
    if (stackTop.type == "choose" or stackTop.type == "union") then
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

local function resolveExpression(node, context)
  if not node then return end

  if node.type == "NUMBER" or node.type == "STRING" or node.type == "UUID" then
    return makeNode(context, "constant", node, {constant = node.value, constantType = node.type:lower()})

  elseif node.type == "variable" then
    return node

  elseif node.type == "IDENTIFIER" then
    return resolveVariable(context, node.value, node)

  elseif node.type == "mutate" then
    local left = resolveExpression(node.children[1], context)
    local rightNode = node.children[2]
    -- we have to distinguish between objects and any other kind
    -- of expression on the right here. Objects should still be
    -- mutating, but other expressions should not. If we don't do
    -- this then attribute lookups with . syntax will incorrectly
    -- end up being mutates
    local right
    if rightNode.type == "object" then
      -- if our left is an attribute call then we need to add the
      -- attribute's parent to our projection to make sure that
      -- the generated object is per each parent not just potentially
      -- one global one
      if left.attributeLeft then
        context.projections:push(Set:new({left.attributeLeft}))
      end
      right = resolveExpression(rightNode, context)
      -- cleanup our projection
      if left.attributeLeft then
        context.projections:pop()
      end
    else
      local prevMutating = context.mutating;
      context.mutating = nil
      right = resolveExpression(rightNode, context)
      context.mutating = prevMutating
    end
    -- we need to create an equality between whatever the left resolved to
    -- and whatever the right resolved to
    resolveExpression(makeNode(context, "equality", node, {operator = "=", children = {left, right}}), context);
    return left

  elseif node.type == "inequality" or node.type == "equality" then
    local left = resolveExpression(node.children[1], context)
    if not left then
      -- error
      errors.invalidEqualityLeft(context, node, left)
      return
    end
    -- set that when I try to resolve this expression,
    -- I'm looking to resolve it to this specific variable
    local right = resolveExpression(node.children[2], context)
    local expression = makeNode(context, "expression", node, {operator = node.operator, projection = {}, groupings = {}, bindings = {}})
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

  elseif node.type == "attribute" then
    local left = resolveExpression(node.children[1], context)
    local right = node.children[2]
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
      return attributeRef

    else
      -- error
      errors.invalidAttributeRight(context, right)
    end

  elseif node.type == "object" then
    local query = context.queryStack:peek()
    local objectNode = generateObjectNode(node, context)
    if objectNode.type == "object" or objectNode.type == "mutate" then
      local queryKey = objectNode.type == "object" and "objects" or "mutates"
      query[queryKey][#query[queryKey] + 1] = objectNode
    elseif objectNode.type == "expression" then
      query.expressions[#query.expressions + 1] = objectNode
    end
    return objectNode.entityVariable

  elseif node.type == "infix" or node.type == "function" then
    local resultVar = resolveVariable(context, string.format("result-%s-%s", node.line, node.offset), node, true)
    local prevNonfiltering = context.nonFilteringInequality
    if node.func == "is" then
      context.nonFilteringInequality = true
    end
    local expression = makeNode(context, "expression", node, {operator = node.func, projection = {}, groupings = {}, bindings = {}})
    generateBindingNode(context, {field = "return", variable = resultVar}, resultVar, expression)
    -- create bindings
    for ix, child in ipairs(node.children) do
      field = alphaFields[ix]
      local resolved = resolveExpression(child, context)
      if not resolved then
        -- error
        errors.invalidFunctionArgument(context, child, node.type)

      elseif resolved.type == "variable" then
        generateBindingNode(context, {field = field, variable = resolved}, resolved, expression)

      elseif resolved.type == "constant" then
        generateBindingNode(context, {field = field, constant = resolved}, resolved, expression)

      elseif resolved.type == "grouping" then
        for ix, grouping in ipairs(resolved.children) do
          local groupingVar = resolveExpression(grouping, context)
          if groupingVar.type == "variable" then
            expression.groupings[#expression.groupings + 1] = makeNode(context, "grouping", grouping, {expression = expression, variable = groupingVar, ix = ix})
          else
            -- error
            errors.invalidGrouping(context, grouping)
          end
        end

      elseif resolved.type == "projection" then
        for _, project in ipairs(resolved.children) do
          local projectVar = resolveExpression(project, context)
          if projectVar.type == "variable" then
            expression.projection[#expression.projection + 1] = makeNode(context, "projection", project, {expression = expression, variable = projectVar})
          else
            -- error
            errors.invalidProjection(context, grouping)
          end
        end
      else
        -- error?
        errors.invalidFunctionArgument(context, child, node.type)
      end
    end
    if node.func == "is" then
      context.nonFilteringInequality = prevNonfiltering
    end
    -- bind the return
    local query = context.queryStack:peek()
    query.expressions[#query.expressions + 1] = expression
    return resultVar

  elseif node.type == "grouping" or node.type == "projection" then
    return node

  else
    -- TODO
  end
end

generateObjectNode = function(root, context)
  local object = makeNode(context, "object", root, {
                  bindings = {},
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
    object.operator = context.mutateOperator
    object.scope = context.mutateScope
    -- store all our parents' projections to reconcile later
    object.projection = {dependencies}
    for _, projection in ipairs(context.projections) do
      object.projection[#object.projection + 1] = projection
    end
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

  for _, child in ipairs(root.children) do
    local type = child.type
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
        local variable = resolveExpression(child, context)
        local binding = generateBindingNode(context, {field = lastAttribute.value, variable = variable}, lastAttribute, object)
        -- we don't want to depend on our children since they would multiply
        -- the number of parent elements by the number of children when we really
        -- mean for their to be one parent per child.
      else
        -- error
        errors.bareSubObject(context, child)
      end

    elseif type == "inequality" then
      local left = child.children[1]
      if left.type == "IDENTIFIER" then
        local variable = resolveVariable(context, left.value, left)
        local binding = generateBindingNode(context, {field = left.value, variable = variable}, child, object)
        resolveExpression(child, context)
        lastAttribute = nil
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

      elseif left.type == "IDENTIFIER" then
        related = left
        binding.field = left.value
        lastAttribute = left
        local resolved = resolveExpression(right, context)
        if not resolved then
          -- error
          binding = nil
          errors.invalidObjectAttributeBinding(context, right or child)
        elseif resolved.type == "constant" then
          binding.constant = resolved
        elseif resolved.type == "variable" then
          binding.variable = resolved
          -- we only add non-objects to dependencies since sub
          -- objects have their own cardinalities to deal with
          if right.type ~= "object" then
            dependencies:add(resolved)
          end
        else
          binding = nil
          -- error
          errors.invalidObjectAttributeBinding(context, right)
        end
      else
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
      union.queries[#union.queries + 1] = generateQueryNode(child, context)
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

local function handleUpdateNode(root, query, context)
  context.mutating = true

  for _, child in ipairs(root.children) do
    local type = child.type
    -- set some context information to handle nested objects
    -- most of the time we're just adding, so we'll default
    -- the operator to add
    context.mutateOperator = "insert"
    context.mutateScope = root.scope
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
        resolveExpression(child, context)
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
    context.mutateScope = nil
  end

  context.mutating = false
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
    elseif type == "update" then
      handleUpdateNode(child, query, context)

    elseif type == "equality" then
      if #child.children > 0 and (child.children[1].type == "TAG" or child.children[1].type == "NAME") then
        errors.bareTagOrName(context, child)
      else
        local left = resolveExpression(child, context)
      end
        

    elseif type == "inequality" then
      resolveExpression(child, context)

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
        local equality = makeNode(context, "equality", child.children[1], {operator = "=", children = {outputs, child.children[1]}})
        resolveExpression(equality, context)
      elseif outputs.type == "block" and child.children[1].type == "block" then
        local block = child.children[1]
        if #block.children == #outputs.children then
          for ix, output in ipairs(outputs.children) do
            local equality = makeNode(context, "equality", block.children[ix], {operator = "=", children = {output, block.children[ix]}})
            resolveExpression(equality, context)
          end
        else
          -- error, output numbers don't match up
          errors.outputNumberMismatch(context, block, outputs)
        end
      else
        -- error mismatched outputs
        errors.outputTypeMismatch(context, child.children[1], outputs)
      end

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
  return {type = "code", children = nodes, ast = root, context = extraContext}
end

------------------------------------------------------------
-- ParseFile
------------------------------------------------------------

local function parseFile(path)
  local content = fs.read(path)
  content = content:gsub("\t", "  ")
  content = content:gsub("\r", "")
  local context = {code = content, downEdges = {}, file = path, errors = {}}
  local tokens = lex(content)
  context.tokens = tokens
  local tree = {type="expression tree", children = parse(tokens, context)}
  local graph = generateNodes(tree, context)
  return graph
end

local function parseString(str)
  str = str:gsub("\t", "  ")
  str = str:gsub("\r", "")
  local context = {code = str, downEdges = {}, errors = {}}
  local tokens = lex(str)
  context.tokens = tokens
  local tree = {type="expression tree", children = parse(tokens, context)}
  local graph = generateNodes(tree, context)
  return graph
end

local function parseJSON(str)
  local parse = parseString(str)
  local message = {type = "parse", parse = parse}
  return util.toJSON(message)
end

local function printParse(content)
  content = content:gsub("\t", "  ")
  content = content:gsub("\r", "")
  local context = {code = content, downEdges = {}, errors = {}}
  local tokens = lex(content)
  context.tokens = tokens
  local tree = {type="expression tree", children = parse(tokens, context)}
  local graph = generateNodes(tree, context)
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
  ENTITY_FIELD = MAGIC_ENTITY_FIELD
}
