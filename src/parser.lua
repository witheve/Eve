local fs = require("fs")
local utf8 = require("utf8")
local color = require("color")
local errors = require("error")
local Set = require("set").Set

local MAGIC_ENTITY_FIELD = "ENTITY"

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
  update = "UPDATE",
  ["if"] = "IF",
  ["then"] = "THEN",
  ["else"] = "ELSE",
  ["end"] = "END",
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
  ["+="] = "ADD",
  ["-="] = "REMOVE",
  [":="] = "SET",
}

local whitespace = { [" "] = true, ["\n"] = true, ["\t"] = true }

local function isIdentifierChar(char)
  return not specials[char] and not whitespace[char]
end

local function inString(char, prev)
  return (char ~= "\"" and char ~= "{") or prev == "\\"
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
      end
      local string = scanner:eatWhile(inString)
      if #string > 0 then
        tokens[#tokens+1] = Token:new("STRING", string, line, offset)
      end
      -- skip the end quote
      if scanner:peek() == "\"" then
        scanner:read()
        tokens[#tokens+1] = Token:new("STRING_CLOSE", "\"", line, offset)
      end
      offset = offset + #string

    elseif char == "⦑" then
      -- FIXME: why are these extra reads necessary? it seems like
      -- the utf8 stuff isn't getting handled correctly for whatever
      -- readon
      scanner:read()
      scanner:read()
      local UUID = scanner:eatWhile(isUUID)
      -- skip the end bracket
      scanner:read()
      tokens[#tokens+1] = Token:new("UUID", UUID, line, offset)
      offset = offset + #UUID

    elseif char == "/" and scanner:peek() == "/" then
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
    if type(v) == "table" then
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
    elseif k == "type" then
      -- ignore
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

local infixTypes = {equality = true, infix = true, attribute = true, mutate = true, inequality = true}
local singletonTypes = {outputs = true}
local endableTypes = {choose = true, union = true, ["not"] = true, update = true}
local alphaFields = {"a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o"}

local function parse(tokens)
  local stack = Stack:new()
  local scanner = ArrayScanner:new(tokens)
  local token = scanner:read()
  local final = {}
  local info = {errors = {}, comments = {}}

  local function popToEndable()
    local stackTop = stack:peek()
    while stackTop do
      if not endableTypes[stackTop.type] then
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
    local stackTop = stack:peek()
    local type = token.type
    local next = scanner:peek()

    if type == "DOC" then
      -- if there's already a query on the stack and this line is directly following
      -- the last line of the start of the query, then this is just more doc for that
      -- query
      if stackTop and stackTop.type == "query" and stackTop.line + 1 == token.line then
        stackTop.doc = stackTop.doc .. "\n" .. token.value
        stackTop.line = token.line
      else
        -- clear everything currently on the stack as we're starting a totally new
        -- query
        stackTop = tryFinishExpression(true)
        stack:push({type = "query", doc = token.value, line = token.line, children = {}})
      end

    elseif type == "COMMA" then
      -- we treat commas as whitespace

    elseif type == "COMMENT" then
      info.comments[#info.comments + 1] = token

    elseif type == "STRING_OPEN" then
      stack:push({type = "function", operator = "concat", children = {right}, line = token.line, offset = token.offset})

    elseif type == "STRING_CLOSE" then
      if stackTop and stackTop.type == "function" and stackTop.operator == "concat" then
        -- if there's zero or one children, then this concat isn't needed
        if #stackTop.children == 0 or (#stackTop.children == 1 and stackTop.children[1].type == "STRING") then
          local string = stackTop.children[1] or {type = "STRING", value = "", line = token.line, offset = token.offset}
          stack:pop()
          stackTop = stack:peek()
          stackTop.children[#stackTop.children + 1] = string
        else
          stackTop.closed = true
        end
      else
        -- error
      end

    elseif type == "OPEN_CURLY" or type == "CLOSE_CURLY" then
      -- we can just ignore these

    elseif type == "OPEN_BRACKET" then
      stack:push({type = "object", children = {}, line = token.line, offset = token.offset})

    elseif type == "CLOSE_BRACKET" then
      if stackTop.type ~= "object" then
        -- TODO: this is an error, the only thing that makes sense
        -- is for a close bracket to be closing an object node
      else
        stackTop.closed = true
      end

    elseif type == "UPDATE" then
      local update = {type = "update", scope = "transient", children = {}}
      if next.value == "history" or next.value == "session" then
        update.scope = next.value
        -- eat that token
        scanner:read()
        -- @TODO: handle specifying a custom bag after history
      end
      stack:push(update)

    elseif type == "END" then
      -- clear everything in the stack up to an "endable" node
      stackTop = popToEndable()
      local stackType = stackTop and stackTop.type
      if not stackType then
        -- error
      elseif endableTypes[stackType] then
        stackTop.closed = true
      else
        -- error
      end

    elseif type == "IF" then
      if stackTop.type == "equality" then
        -- pop the equality off since it represents the outputs of
        -- this union/choose
        local prev = stack:pop()
        local outputs = prev.children[1]
        if outputs.type ~= "block" and outputs.type ~= "IDENTIFIER" then
          outputs = {}
          -- error
          -- attempting to assign an if to something that isn't
          -- either a group or an identifier
        end
        local node = {type = "union", outputs = outputs, children = {}}
        stack:push(node)
        local childQuery = {type = "query", children = {}, outputs = outputs, parent = stackTop, line = token.line, offset = token.offset}
        stack:push(childQuery)
      elseif stackTop.type == "union" or stackTop.type == "choose" then
        local childQuery = {type = "query", children = {}, outputs = stackTop.outputs, parent = stackTop, line = token.line, offset = token.offset}
        stack:push(childQuery)
      else
        -- error
      end

    elseif type == "ELSE" then
      if stackTop.type == "union" then
        stackTop.type = "choose"
      elseif stackTop.type ~= "choose" then
        -- error
      end

      if next and next.type ~= "IF" then
        local childQuery = {type = "query", children = {}, outputs = stackTop.outputs, parent = stackTop, closed = true, line = token.line, offset = token.offset}
        stack:push(childQuery)
        local childQuery = {type = "outputs", children = {}}
        stack:push(childQuery)
      end

    elseif type == "THEN" then
      if stackTop.type == "query" then
        stackTop.closed = true
        local childQuery = {type = "outputs", children = {}}
        stack:push(childQuery)
      else
        -- error
      end

    elseif type == "NOT" then
      local node = {type = "not", children = {}, closed = true}
      local childQuery = {type = "query", children = {}, parent = node, line = token.line, offset = token.offset}
      stack:push(node)
      stack:push(childQuery)
      if not next or next.type ~= "OPEN_PAREN" then
        -- error
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
      else
        -- error
      end

    elseif type == "TAG" or type == "NAME" then
      if next.type == "STRING" or next.type == "IDENTIFIER" then
        stackTop.children[#stackTop.children + 1] = {type = "equality", children = {token, next}}
        -- consume the next token since we've already handled it
        scanner:read()
      else
        -- error
      end

    elseif type == "DOT" then
      local prev = stackTop.children[#stackTop.children]
      if not prev then
        -- error
      else
        -- remove prev, as it's going to get replaced with this attribute
        stackTop.children[#stackTop.children] = nil
        stack:push({type = "attribute", children = {prev}})
      end

    elseif type == "INFIX" then
      -- get the previous child
      local prev = stackTop.children[#stackTop.children]
      if prev and (prev.type == "equality" or prev.type == "mutate" or type == "inequality") then
        stackTop.children[#stackTop.children] = nil
        local right = prev.children[2]
        -- remove the right hand side of the equality and put it back on the
        -- stack
        prev.children[2] = nil
        stack:push(prev)
        -- now push this expression on the stack as well
        stack:push({type = "infix", func = token.value, children = {right}, line = token.line, offset = token.offset})

      -- it needs to either be an expression, an identifier, or a constant
      elseif prev and (prev.type == "IDENTIFIER" or prev.type == "infix" or prev.type == "function" or
                   prev.type == "NUMBER" or prev.type == "STRING" or prev.type == "block") then
        stackTop.children[#stackTop.children] = nil
        stack:push({type = "infix", func = token.value, children = {prev}, line = token.line, offset = token.offset})
      else
        -- error
      end

    elseif type == "EQUALITY" or type == "ALIAS" or type == "INEQUALITY" then
      -- get the previous child
      local prev = stackTop.children[#stackTop.children]
      if not prev then
        -- error
      else
        local nodeType = type == "INEQUALITY" and "inequality" or "equality"
        stackTop.children[#stackTop.children] = nil
        stack:push({type = nodeType, op = token.value, children = {prev}, line = token.line, offset = token.offset})
      end

    elseif type == "OPEN_PAREN" then
      stack:push({type = "block", children = {}})

    elseif type == "CLOSE_PAREN" then
      local stackType = stackTop.type
      if stackTop and (stackType == "block" or stackType == "function" or stackType == "grouping"
                      or stackType == "projection" or (stackTop.parent and stackTop.parent.type == "not")) then
        stackTop.closed = true
        -- this also closes out the containing function in the case of aggregate
        -- modifiers
        if stackType == "projection" or stackType == "grouping" then
          stack[#stack - 1].closed = true
        end
      else
        -- error
      end

    elseif type == "ADD" or type == "REMOVE" or type == "SET" then
      -- get the previous child since these ops are infix
      local prev = stackTop.children[#stackTop.children]
      if not prev then
        -- error
      else
        stackTop.children[#stackTop.children] = nil
        stack:push({type = "mutate", operator = type:lower(), children = {prev}})
      end

    elseif type == "IDENTIFIER" and next and next.type == "OPEN_PAREN" then
      stack:push({type = "function", func = token.value, children = {}, line = token.line, offset = token.offset})
      -- consume the paren
      scanner:read()

    elseif type == "GIVEN" or type == "PER" then
      -- if we are currently working on one of the other modifiers, we're
      -- done with that one and should clean it out
      if stackTop.type == "grouping" or stackTop.type == "projection" then
        stackTop.closed = true
        tryFinishExpression()
      end
      local modifier = type == "GIVEN" and "projection" or "grouping"
      stack:push({type = modifier, children = {}})

    elseif type == "IDENTIFIER" or type == "NUMBER" or type == "STRING" or type == "UUID" then
      stackTop.children[#stackTop.children + 1] = token

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


local function resolveVariable(name, context, noCreate)
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
  if not variable and not noCreate then
    variable = {type = "variable", name = name}
  end
  -- if we haven't mapped this variable at this level then we
  -- need to do so and add it to the containing query
  if not mappings:peek()[name] and not noCreate then
    local query = context.queryStack:peek()
    query.variables[#query.variables + 1] = variable
    mappings:peek()[name] = variable
  end
  return variable
end

local generateObjectNode
local generateQueryNode
local generateNotNode

local function generateBindingNode(node, context, parent)
  node.type = "binding"
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
  if node.type == "NUMBER" or node.type == "STRING" or node.type == "UUID" then
    local left = context.equalityLeft
    if left and left.type == "variable" then
      left.constant = {type = "constant", constant = node.value, constantType = node.type:lower()}
      return left
    else
      return {type = "constant", constant = node.value, constantType = node.type:lower()}
    end

  elseif node.type == "IDENTIFIER" then
    if context.equalityLeft and context.equalityLeft.type == "variable" then
      -- transfer the bindings from this variable to the left variable
      -- and fix the bindings to reference that var
      -- FIXME: are we absolutely sure this is the right thing to do in all
      -- cases?
      local left = context.equalityLeft
      local variable = resolveVariable(node.value, context, true)
      if left == variable or not variable then
        return left
      else
        local bindings = context.variableToBindings[variable]
        if bindings then
          local leftBindings = context.variableToBindings[left] or {}
          for _, binding in ipairs(bindings) do
            binding.variable = left
            leftBindings[#leftBindings + 1] = binding
          end
          context.variableToBindings[left] = leftBindings
        end
        context.nameMappings:peek()[node.value] = left
        return left
      end
    else
      return resolveVariable(node.value, context)
    end

  elseif node.type == "equality" then
    local left = resolveExpression(node.children[1], context)
    -- set that when I try to resolve this expression,
    -- I'm looking to resolve it to this specific variable
    local prev = context.equalityLeft
    context.equalityLeft = left
    local right = resolveExpression(node.children[2], context)
    context.equalityLeft = prev
    return left

  elseif node.type == "inequality" then
    local left = resolveExpression(node.children[1], context)
    -- set that when I try to resolve this expression,
    -- I'm looking to resolve it to this specific variable
    local prev = context.equalityLeft
    context.equalityLeft = nil
    local right = resolveExpression(node.children[2], context)
    context.equalityLeft = prev
    local expression = {type = "expression", operator = node.op, projections = {}, groupings = {}, bindings = {}}
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
    local resultVar = context.equalityLeft
    if not context.equalityLeft then
      resultVar = resolveVariable(string.format("inequality-%s-%s", node.line, node.offset), context)
    end
    generateBindingNode(leftBinding, context, expression)
    generateBindingNode(rightBinding, context, expression)
    generateBindingNode({field = "return", variable = resultVar}, context, expression)
    local query = context.queryStack:peek()
    query.expressions[#query.expressions + 1] = expression
    return resultVar

  elseif node.type == "attribute" then
    -- TODO
    local left = resolveExpression(node.children[1], context)
    local right = node.children[2]
    if right and right.type == "IDENTIFIER" then
      -- generate a temporary variable to hold this attribute binding
      local attributeRef = resolveVariable(string.format("%s-%s-%s", right.value, right.line, right.offset), context)
      -- generate a temporary object that we can attach this attribute to by adding
      -- an equality from the attribute name to our temp variable
      local tempObject = {type = "object", children = {{type = "equality", children = {right, {type = "IDENTIFIER", value = attributeRef.name}}}}}
      -- create the object
      local objectNode = generateObjectNode(tempObject, context)
      -- bind that object's entity field to the left side varaible
      local binding = generateBindingNode({field = MAGIC_ENTITY_FIELD, variable = left}, context, objectNode)
      -- add it to the query
      local query = context.queryStack:peek()
      local queryKey = objectNode.type == "object" and "objects" or "mutates"
      query[queryKey][#query[queryKey] + 1] = objectNode
      return attributeRef

    else
      -- error
    end

  elseif node.type == "object" then
    local objectRef
    if context.equalityLeft then
      objectRef = context.equalityLeft
    else
      objectRef = resolveVariable(string.format("object-%s-%s", node.line, node.offset), context)
    end
    local query = context.queryStack:peek()
    local objectNode = generateObjectNode(node, context)
    local binding = generateBindingNode({field = MAGIC_ENTITY_FIELD, variable = objectRef}, context, objectNode)
    local queryKey = objectNode.type == "object" and "objects" or "mutates"
    query[queryKey][#query[queryKey] + 1] = objectNode
    return objectRef

  elseif node.type == "infix" or node.type == "function" then
    if context.equalityLeft then
      resultVar = context.equalityLeft
    else
      resultVar = resolveVariable(string.format("result-%s-%s", node.line, node.offset), context)
    end
    local expression = {type = "expression", operator = node.func, projections = {}, groupings = {}, bindings = {}}
    local prevLeft = context.equalityLeft
    -- create bindings
    for ix, child in ipairs(node.children) do
      field = alphaFields[ix]
      context.equalityLeft = nil
      local resolved = resolveExpression(child, context)
      if not resolved then
        -- error
      elseif resolved.type == "variable" then
        generateBindingNode({field = field, variable = resolved}, context, expression)

      elseif resolved.type == "constant" then
        generateBindingNode({field = field, constant = resolved}, context, expression)

      elseif resolved.type == "grouping" then
        for ix, grouping in ipairs(resolved.children) do
          local groupingVar = resolveExpression(grouping, context)
          if groupingVar.type == "variable" then
            expression.groupings[#expression.groupings + 1] = {type = "grouping", expression = expression, variable = groupingVar, ix = ix}
          else
            -- error
          end
        end

      elseif resolved.type == "projection" then
        for _, project in ipairs(resolved.children) do
          local projectVar = resolveExpression(project, context)
          if projectVar.type == "variable" then
            expression.projections[#expression.projections + 1] = {type = "projection", expression = expression, variable = projectVar}
          else
            -- error
          end
        end
      else
        -- error?
      end
    end
    context.equalityLeft = prevLeft;
    -- bind the return
    local binding = generateBindingNode({field = "return", variable = resultVar}, context, expression)
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
  local object = {type = "object",
                  bindings = {},
                  query = context.queryStack:peek()}

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

  -- last attribute handles the case where we have adjacent sub-objects
  -- which should be added as values to the last attribute we've seen
  -- e.g. [#div children: [#span] [#span]], both spans should be hooked
  -- to the children attribute
  local lastAttribute

  for _, child in ipairs(root.children) do
    local type = child.type
    if type == "IDENTIFIER" then
      -- generate a variable
      local variable = resolveVariable(child.value, context)
      local binding = generateBindingNode({field = child.value, variable = variable}, context, object)
      lastAttribute = nil
      dependencies:add(variable)

    elseif type == "object" then
      -- we have an object in here, if lastAttribute is set,
      -- this node should be added as another binding to that field
      -- if it's not, then this is an error
      if lastAttribute then
        local variable = resolveExpression(child, context)
        local binding = generateBindingNode({field = lastAttribute.value, variable = variable}, context, object)
        dependencies:add(variable)
      else
        -- error
      end

    elseif type == "inequality" then
      local left = child.children[1]
      if left.type == "IDENTIFIER" then
        local variable = resolveVariable(left.value, context)
        local binding = generateBindingNode({field = child.value, variable = variable}, context, object)
        resolveExpression(child, context)
        lastAttribute = nil
      else
        -- error
      end

    elseif type == "equality" then
      -- the left has to be either a NAME, TAG, or IDENTIFIER
      local left = child.children[1]
      local right = child.children[2]
      local binding = {}

      if left.type == "NAME" then
        binding.field = "name"
        binding.constant = {type = "constant", constant = right.value, constantType = "string"}

      elseif left.type == "TAG" then
        binding.field = "tag"
        binding.constant = {type = "constant", constant = right.value, constantType = "string"}

      elseif left.type == "IDENTIFIER" then
        binding.field = left.value
        lastAttribute = left
        local prev = context.equalityLeft;
        context.equalityLeft = nil
        local resolved = resolveExpression(right, context)
        context.equalityLeft = prev
        if not resolved then
          -- error
          binding = nil
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
        end
      else
        -- error
      end
      if binding then
        binding = generateBindingNode(binding, context, object)
      end

    elseif type == "not" then
      -- this needs to translate into a regular not that references this object
      -- via a constructed attribute call. So first we get the ref
      local ref = context.equalityLeft
      if not ref then
        ref = resolveVariable(string.format("object-%s-%s", root.line, root.offset), context)
        generateBindingNode({field = MAGIC_ENTITY_FIELD, variable = objectRef}, context, objectNode)
      end
      -- we'll need that ref as an identifier for our constructed attribute node
      local objectIdentifier = {type = "IDENTIFIER", line = child.line, offset = child.offset, value = ref.name}
      -- construct the not
      local constructedNot = {type = "not", children = {}, closed = true}
      local childQuery = {type = "query", children = {}, parent = node, line = child.line, offset = child.offset}
      constructedNot.children[1] = childQuery
      -- FIXME: for now we're only going to support not(attr) and not(#tag)
      -- but there's no technical reason we couldn't support more complex
      -- versions of inline not. They're just a lot harder to deal with.
      local attr = child.children[1].children[1]
      if attr.type == "IDENTIFIER" then
        -- not(parent.(attr.children[1]))
        local attributeIdentifier = {type = "IDENTIFIER", line = attr.line, offset = attr.offset, value = attr.value}
        local dotNode = {type = "attribute", children = {objectIdentifier, attributeIdentifier}}
        childQuery.children[#childQuery.children + 1] = dotNode

      elseif attr.type == "equality" and attr.children[1] and attr.children[1].type == "TAG" then
        local tag = attr.children[1]
        local tagValue = attr.children[2]
        -- not(parent.tag = attr.children[1])
        local attributeIdentifier = {type = "IDENTIFIER", line = tag.line, offset = tag.offset, value = "tag"}
        local dotNode = {type = "attribute", children = {objectIdentifier, attributeIdentifier}}
        local constantNode = {type = "STRING", value = tagValue.value}
        local equalityNode = {type = "equality", children = {dotNode, constantNode}}
        childQuery.children[#childQuery.children + 1] = equalityNode

      else
        -- error
      end

      -- finally generate the not node
      local notNode = generateNotNode(constructedNot, context)
      object.query.nots[#object.query.nots + 1] = notNode

    else
      -- error
    end
  end

  -- our dependencies are no longer relevant to anyone else,
  -- so let's clean them up
  context.projections:pop()

  return object
end


local function generateUnionNode(root, context, unionType)
  local union = {type = unionType,
                 query = context.queryStack:peek(),
                 queries = {}}

  -- generate vars for the outputs
  local outputs = {}
  if root.outputs.type == "IDENTIFIER" then
    outputs[#outputs + 1] = resolveVariable(root.outputs.value, context)
  elseif root.outputs.type == "block" then
    for _, child in ipairs(root.outputs.children) do
      outputs[#outputs + 1] = resolveVariable(child.value, context)
    end
  else
    -- error
  end
  union.outputs = outputs

  for _, child in ipairs(root.children) do
    local type = child.type
    if type == "query" then
      union.queries[#union.queries + 1] = generateQueryNode(child, context)
    else
      -- error
    end
  end

  return union
end

generateNotNode = function(root, context)
  local notNode = {type = "not",
                   query = context.queryStack:peek()}
  if #root.children == 1 and root.children[1].type == "query" then
    context.notNode = true
    notNode.body = generateQueryNode(root.children[1], context)
    context.notNode = false
  else
    -- error
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
    context.mutateOperator = "add"
    context.mutateScope = root.scope
    if type == "mutate" then
      -- the operator depends on the mutate's operator here
      context.mutateOperator = child.operator
      resolveExpression({type = "equality", children = child.children}, context)
    elseif type == "object" then
      -- generate the object
      local object = generateObjectNode(child, context)
      query.mutates[#query.mutates + 1] = object
    elseif type == "equality" then
      -- equalities are allowed if the left is an identifier
      -- and the right is an object, to allow for object references
      resolveExpression(child, context)
    else
      -- error
    end
    -- clean up
    context.mutateOperator = nil
    context.mutateScope = nil
  end

  context.mutating = false
end

generateQueryNode = function(root, context)
  local query = {type = "query",
                 name = root.doc,
                 variables = {},
                 objects = {},
                 mutates = {},
                 expressions = {},
                 nots = {},
                 unions = {},
                 chooses = {}}

  -- push this query on to the stack
  context.queryStack:push(query)
  context.nameMappings:push({})

  for _, child in ipairs(root.children) do
    local type = child.type
    if type == "object" then
      local node = generateObjectNode(child, context)
      query.objects[#query.objects + 1] = node
    elseif type == "update" then
      handleUpdateNode(child, query, context)

    elseif type == "equality" then
      local left = resolveExpression(child, context)

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
      if not root.outputs then
        -- error
      elseif outputs.type == "IDENTIFIER" and #child.children == 1 then
        local equality = {type = "equality", children = {outputs, child.children[1]}}
        resolveExpression(equality, context)
      elseif outputs.type == "block" and child.children[1].type == "block" then
        local block = child.children[1]
        if #block.children == #outputs.children then
          for ix, output in ipairs(outputs.children) do
            local equality = {type = "equality", children = {output, block.children[ix]}}
            resolveExpression(equality, context)
          end
        else
          -- error, output numbers don't match up
        end
      else
        -- error mismatched outputs
      end

    else
      -- errors
    end
  end

  -- take this query out of the stack before moving on
  context.queryStack:pop()
  context.nameMappings:pop()
  return query
end

local function generateNodes(root)
  local context = {queryStack = Stack:new(), nameMappings = Stack:new(), projections = Stack:new()}
  local nodes =  {}
  for _, child in ipairs(root.children) do
    if child.type == "query" then
      context.variableToBindings = {}
      nodes[#nodes + 1] = generateQueryNode(child, context)
    else
      -- error
    end
  end
  return {type = "code", children = nodes}
end

------------------------------------------------------------
-- ParseFile
------------------------------------------------------------

local function parseFile(path)
  local content = fs.read(path)
  local tokens = lex(content)
  local tree = {type="expression tree", children = parse(tokens)}
  local graph = generateNodes(tree)
  return graph
end

local function parseString(str)
  local tokens = lex(str)
  local tree = {type="expression tree", children = parse(tokens)}
  local graph = generateNodes(tree)
  return graph
end

local function printParse(content)
  local tokens = lex(content)
  local tree = {type="expression tree", children = parse(tokens)}
  local graph = generateNodes(tree)
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
  printParse = printParse,
  formatGraph = formatGraph,
  formatQueryGraph = formatQueryGraph,
  ENTITY_FIELD = MAGIC_ENTITY_FIELD
}
