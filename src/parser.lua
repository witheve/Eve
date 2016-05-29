local fs = require("fs")
local utf8 = require("utf8")
local color = require("color")
local errors = require("error")

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
  [":"] = "ALIAS",
}

local numeric = {["0"] = true, ["1"] = true, ["2"] = true, ["3"] = true,
                 ["4"] = true, ["5"] = true, ["6"] = true, ["7"] = true,
                 ["8"] = true, ["9"] = true}

local keywords = {
  update = "UPDATE",
  ["end"] = "END",
  choose = "CHOOSE",
  union = "UNION",
  ["and"] = "AND",
  ["or"] = "OR",
  none = "NONE",
  given = "GIVEN",
  per = "PER",
  ["="] = "EQUALITY",
  [">"] = "EQUALITY",
  ["<"] = "EQUALITY",
  [">="] = "EQUALITY",
  [">="] = "EQUALITY",
  ["!="] = "EQUALITY",
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
      doc = scanner:eatWhile(notNewline)
      tokens[#tokens+1] = Token:new("DOC", doc, line, offset)
      offset = offset + #doc

    elseif char == "\"" then
      string = scanner:eatWhile(inString)
      -- skip the end quote
      scanner:read()
      tokens[#tokens+1] = Token:new("STRING", string, line, offset)
      offset = offset + #string

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

------------------------------------------------------------
-- Parse
------------------------------------------------------------

local infixTypes = {equality = true, infix = true, attribute = true, mutate = true}
local endableTypes = {union = true, choose = true, ["not"] = true, update = true}

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
      if force or stackTop.closed or (infixTypes[stackTop.type] and count == 2) then
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
        stackTop.doc = stackTop.doc + "\n" + token.value
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

    elseif type == "UNION" or type == "CHOOSE" or type == "NOT" then
      local childQuery = {type = "query", children = {}}
      local node = {type = type:lower(), children = {}}
      stack:push(node)
      stack:push(childQuery)

    elseif type == "OR" then
      -- check if this is an inline or, by looking to see if the previous
      -- child is an identifier
      local prev = stackTop.children[#stackTop.children]
      if prev and prev.type == "IDENTIFIER" then
      else
        -- otherwise we must be continuing a choose here, pop everything
        -- up to that choose
        stackTop = popToEndable()
        if stackTop.type == "choose" then
          stack:push({type = "query", children = {}})
        else
          -- error
        end

      end

    elseif type == "AND" then
      -- we must be continuing a union here, pop everything up to it
      stackTop = popToEndable()
      if stackTop.type == "union" then
        stack:push({type = "query", children = {}})
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
      -- it needs to either be an expression, an identifier, or a constant
      if prev and (prev.type == "IDENTIFIER" or prev.type == "infix" or prev.type == "function" or
                   prev.type == "NUMBER" or prev.type == "STRING" or prev.type == "grouping") then
        stackTop.children[#stackTop.children] = nil
        stack:push({type = "infix", func = token.value, children = {prev}})
      else
        -- error
      end

    elseif type == "EQUALITY" or type == "ALIAS" then
      -- get the previous child
      local prev = stackTop.children[#stackTop.children]
      if not prev then
        -- error
      else
        stackTop.children[#stackTop.children] = nil
        stack:push({type = "equality", children = {prev}})
      end

    elseif type == "OPEN_PAREN" then
      stack:push({type = "grouping", children = {}})

    elseif type == "CLOSE_PAREN" then
      if stackTop and (stackTop.type == "grouping" or stackTop.type == "function") then
        stackTop.closed = true
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
      stack:push({type = "function", func = token.value, children = {}})
      -- consume the paren
      scanner:read()

    elseif type == "IDENTIFIER" or type == "NUMBER" or type == "STRING" or type == "GIVEN" or type == "PER" then
      stackTop.children[#stackTop.children + 1] = token

    end

    tryFinishExpression()
    token = scanner:read()
  end
  tryFinishExpression(true)
  return final
end


local function resolveVariable(name, context)
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
    variable = {type = "variable", name = name}
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

local function generateBindingNode(node, context, parent)
  node.type = "binding"
  node.source = parent
  if node.variable then
    -- local bindings = context.variableToBindings[node.variable] or {}
    -- bindings[#bindings + 1] = node
    -- context.variableToBindings[node.variable] = bindings
  end
  parent.bindings[#parent.bindings + 1] = node
  return node
end

local function resolveExpression(node, context)
  if node.type == "NUMBER" or node.type == "STRING" then
    return {type = "constant", constant = node.value, constantType = node.type:lower()}

  elseif node.type == "IDENTIFIER" then
    return resolveVariable(node.value, context)

  elseif node.type == "attribute" then
    -- TODO

  elseif node.type == "object" then
    local objectRef
    if context.equalityLeft then
      objectRef = context.equalityLeft
    else
      objectRef = resolveVariable(string.format("object%s%s", node.line, node.offset), context)
    end
    local query = context.queryStack:peek()
    local objectNode = generateObjectNode(node, context)
    local binding = generateBindingNode({field = MAGIC_ENTITY_FIELD, variable = objectRef}, context, objectNode)
    local queryKey = objectNode.type == "object" and "objects" or "mutates"
    query[queryKey][#query[queryKey] + 1] = objectNode
    return objectRef

  else
    -- TODO
  end
end

generateObjectNode = function(root, context)
  local object = {type = "object",
                  bindings = {},
                  query = context.queryStack:peek()}
  local lastAttribute

  for _, child in ipairs(root.children) do
    local type = child.type
    if type == "IDENTIFIER" then
      -- generate a variable
      local variable = resolveVariable(child.value, context)
      local binding = generateBindingNode({field = child.value, variable = variable}, context, object)
      lastAttribute = nil

    elseif type == "object" then
      -- we have an object in here, if lastAttribute is set,
      -- this node should be added as another binding to that field
      -- if it's not, then this is an error
      if lastAttribute then
        local variable = resolveExpression(child, context)
        local binding = generateBindingNode({field = lastAttribute.value, variable = variable}, context, object)
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
        binding.constant = right.value

      elseif left.type == "TAG" then
        binding.field = "tag"
        binding.constant = right.value

      elseif left.type == "IDENTIFIER" then
        binding.field = left.value
        lastAttribute = left
        local resolved = resolveExpression(right, context)
        if not resolved then
          -- error
          binding = nil
        elseif resolved.type == "constant" then
          binding.constant = resolved.constant
          binding.constantType = resolved.constantType
        elseif resolved.type == "variable" then
          binding.variable = resolved
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
    end
  end
  if context.mutating then
    object.type = "mutate"
    object.operator = context.mutateOperator
    object.scope = context.mutateScope
  end
  return object
end


local function handleUpdateNode(root, query, context)
  context.mutating = true

  for _, child in ipairs(root.children) do
    local type = child.type
    if type == "mutate" then
      -- TODO
    elseif type == "object" then
      -- set some context information to handle nested
      -- objects
      context.mutateOperator = "add"
      context.mutateScope = root.scope
      -- generate the object
      local object = generateObjectNode(child, context)
      query.mutates[#query.mutates + 1] = object
      -- clean up
      context.mutateOperator = nil
      context.mutateScope = nil
    elseif type == "equality" then
      -- equalities are allowed if the left is an identifier
      -- and the right is an object, to allow for object references
      -- TODO
    end
  end

  context.mutating = false
  return object
end

local function generateQueryNode(root, context)
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
      query.objects[#query.objects + 1] = generateObjectNode(child, context)
    elseif type == "update" then
      handleUpdateNode(child, query, context)

    elseif type == "equality" then
      local left = resolveExpression(child.children[1], context)
      -- set that when I try to resolve this expression,
      -- I'm looking to resolve it to this specific variable
      context.equalityLeft = left
      local right = resolveExpression(child.children[2], context)
      context.equalityLeft = nil

    elseif type == "choose" then

    elseif type == "union" then

    elseif type == "not" then

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
  local context = {queryStack = Stack:new(), nameMappings = Stack:new()}
  local nodes =  {}
  for _, child in ipairs(root.children) do
    if child.type == "query" then
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

local function printFileParse(args)
  if not args[2] then
    print(color.error("Parse requires a file to parse"))
    return
  elseif not fs.exists(args[2]) then
    print(string.format(color.error("Couldn't open file %s for parsing"), args[2]))
    return
  end
  local path = args[2]
  local content = fs.read(path)
  local tokens = lex(content)
  local tree = {type="expression tree", children = parse(tokens)}
  local graph = generateNodes(tree)
  -- print()
  -- print(color.dim("---------------------------------------------------------"))
  -- print(color.dim("-- Parse tree"))
  -- print(color.dim("---------------------------------------------------------"))
  -- print()
  -- print(formatGraph(tree))
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
  printFileParse = printFileParse,
  formatGraph = formatGraph,
  formatQueryGraph = formatQueryGraph,
  ENTITY_FIELD = MAGIC_ENTITY_FIELD
}
