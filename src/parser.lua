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
  [":"] = "ALIAS",
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
  remove = "REMOVE",
  given = "GIVEN",
  per = "PER",
  [">="] = "EQUALITY",
  [">="] = "EQUALITY",
  ["!="] = "EQUALITY",
  ["="] = "EQUALITY",
  [">"] = "EQUALITY",
  ["<"] = "EQUALITY",
  ["+"] = "INFIX",
  ["-"] = "INFIX",
  ["*"] = "INFIX",
  ["/"] = "INFIX"
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

local function isSubQueryNode(node)
  return node.type == "choose" or node.type == "union" or node.type == "not"
end

local function closestQuery(node)
  if node.type == "query" then
    return node
  end
  local parentNode = node.parent
  while parentNode do
    if parentNode.type == "query" then
      return parentNode
    end
    parentNode = parentNode.parent
  end
end

local storeOnQuery = {
  variable = "variables",
  ["not"] = "nots",
  choose = "chooses",
  union = "unions",
  object = "objects",
  expression = "expressions",
}

local storeOnParent = {
  binding = "bindings",
  projection = "projections",
  grouping = "groupings",

}

local function makeNode(type, parent, line, offset)
  -- parents that are a choose, union, or not behave slightly differently
  -- in that unless this is a query node, this node should be appended to the
  -- most recent query child of the parent
  if type ~= "query" and isSubQueryNode(parent) then
    parent = parent.children[#parent.children]
  end
  local node = {type = type, parent = parent, line = line, offset = offset, children = {}}

  if type == "choose" or type == "union" or type == "not" then
    node.children[#node.children + 1] = makeNode(query, node, line, offset)
  end

  if type ~= "variable" then
    parent.children[#parent.children + 1] = node
  end
  if storeOnQuery[type] then
    local query = closestQuery(parent)
    local array = query[storeOnQuery[type]]
    array[#array + 1] = node
    node.query = query
  elseif type == "query" then
    node.variables = {}
    node.variableMap = {}
    node.nots = {}
    node.chooses = {}
    node.unions = {}
    node.objects = {}
    node.mutates = {}
    node.expressions = {}
    -- if this is being parented to a not/choose/union then we want to
    -- store this in queries on the parent
    if isSubQueryNode(parent) then
      local array = parent.queries or {}
      array[#array + 1] = node
      parent.queries = array
    end
  elseif storeOnParent[type] then
    local field = storeOnParent[type]
    local array = parent[field] or {}
    array[#array + 1] = node
    parent[field] = array
  end
  return node
end

local parseLine

local function getLineNode(line)
  local node = line.node
  if node then return node end
  line.node = parseLine(line)
  return line.node
end

local function getParentNode(line)
  local parent = getLineNode(line.parent)
  if isSubQueryNode(parent) then
    return parent.children[#parent.children]
  end
  return parent
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
  local var = top.variableMap[name] or makeNode("variable", top, token.line, token.offset)
  var.name = name
  for _, query in ipairs(queries) do
    query.variableMap[name] = var
  end
  return var
end

local function isMutating(parent)
  return parent.type == "add" or parent.type == "remove" or parent.type == "mutate"
end

local function extractInlineExpressions(scanner)
  local stack = Stack:new()
  local expressions = {}
  local current = {type = "expr", op = nil, children = {}}

  local token = scanner:read()
  while token do
    local type = token.type
    local next = scanner:peek()
    if type == "COMMA" then
      -- we treat commas as whitespace
    elseif type == "GIVEN" or type == "PER" then
      current.children[#current.children + 1] = token
    elseif type == "TAG" or type == "NAME" then
      if not current.op and next and (next.type == "IDENTIFIER" or next.type == "STRING") then
        current.op = token
        current.children[#current.children + 1] = next
        -- skip the next token since we've taken care of it here
        expressions[#expressions + 1] = current
        current = {type = "expr", op = nil, children = {}}
        scanner:read()
      else
        expressions[#expressions + 1] = token
        print(color.error("invalid tag or name"))
      end
    elseif type == "INFIX" or type == "DOT" then
      if not current.op then
        current.op = token
      else
        print(color.error("operator followed by an operator"))
      end
    elseif type == "EQUALITY" or type == "ALIAS" then
      -- the stack should be empty as equalities can't be nested
      if #stack == 0 then
        if current.op then
          stack:push({type = "expr", op = token, children = {current}})
        else
          stack:push({type = "expr", op = token, children = {current.children[1]}})
        end
        current = {type = "expr", op = nil, children = {}}
      else
        print(color.error("nested equalities aren't allowed"))
      end
    elseif type == "OPEN_PAREN" then
      -- put the current thing on the stack if there's an op, start a new guy
      -- if there isn't an op, but there's children, this is an error
      if not current.op and #current.children > 0 then
        print(color.error("Open paren following some token"))
      elseif current.op then
        stack:push(current)
        current = {type = "expr", op = nil, children = {}}
      end
    elseif type == "CLOSE_PAREN" then
      -- we need to pop the stack
      local topOfStack = stack:peek()
      if not topOfStack then
        expressions[#expressions + 1] = current.children[1]
        current = {type = "expr", op = nil, children = {}}
      else
        -- start popping the stack upward as this could finish several
        -- infix ops in a cascade
        topOfStack = stack:pop()
        while topOfStack do
          local stackType = topOfStack.op.type
          if current.op then
            topOfStack.children[#topOfStack.children + 1] = current
          else
            topOfStack.children[#topOfStack.children + 1] = current.args[1]
          end
          if stackType ~= "EQUALITY" and stackType ~= "ALIAS" and stackType ~= "INFIX" then
            -- if we're not looking at infix, then we're done popping upward
            break
          else
            current = topOfStack
            topOfStack = stack:pop()
            if not topOfStack then
              expressions[#expressions + 1] = current
            end
          end
        end
      end
    elseif type == "IDENTIFIER" and next and next.type == "OPEN_PAREN" then
      -- this is a function call, we need to push current onto the stack if there
      -- is an op
      if current.op then
        stack:push(current)
      end
      current = {type = "expr", op = token, children = {}}
      -- consume the paren, it's been taken care of
      scanner:read()
    elseif current.op and (current.op.type == "INFIX" or current.op.type == "TAG" or current.op.type == "NAME" or current.op.type == "DOT") then
      -- we are done with this op, store it as the first arg to the next one
      current.children[#current.children + 1] = token
      current = {type = "expr", op = nil, children = {current}}
    elseif not current.op and #current.children > 0 then
      -- we need to check the stack, if the op on the stack is an equality or
      -- alias then we're done here. If it's an infix then this should be an error
      -- as it means we've done something like 1 + (4 5). If it's an arbitrary
      -- function, then we consume this as an arg and keep going until we get
      -- to a close paren. if the stack is empty then we just add this guy to the
      -- expression list.
      local topOfStack = stack:peek()
      if not topOfStack then
        expressions[#expressions + 1] = current.children[1]
        current = {type = "expr", op = nil, children = {token}}
      else
        local stackType = topOfStack.op.type
        topOfStack.children[#topOfStack.children + 1] = current.children[1]
        current = {type = "expr", op = nil, children = {token}}
        if stackType == "EQUALITY" or stackType == "ALIAS" then
          -- we're done with this equality, put it in the expression list
          expressions[#expressions + 1] = stack:pop()
        elseif stackType == "INFIX" then
          -- error
          print(color.error("two children without an op"))
        end
      end
    else
      current.children[#current.children + 1] = token
    end
    token = scanner:read()
  end
  -- clean up anything that might still be hanging out on the stack
  local topOfStack = stack:pop()
  if not topOfStack and not current.op then
    expressions[#expressions + 1] = current.children[1]
  end
  while topOfStack do
    local stackType = topOfStack.op.type
    if current.op then
      topOfStack.children[#topOfStack.children + 1] = current
    else
      topOfStack.children[#topOfStack.children + 1] = current.children[1]
    end
    if stackType ~= "EQUALITY" and stackType ~= "ALIAS" and stackType ~= "INFIX" then
      -- if we're not looking at infix, then we're done popping upward
      break
    else
      current = topOfStack
      topOfStack = stack:pop()
      if not topOfStack then
        expressions[#expressions + 1] = current
      end
    end
  end
  if #stack ~= 0 then
    -- there shouldn't still be stuff on the stack...
    print(color.error("Finished parsing expressions, but the stack isn't empty"))
    for _, v in ipairs(stack) do
      print("STACK:", v)
    end
  end
  return expressions
end

local function parseObjectLine(line, expression)
  local parent = getParentNode(line)
  local scanner = ArrayScanner:new(line.tokens)
  local first = scanner:read()
  local type = "object"
  local operator
  -- @TODO what do we do about nested objects whose parent is an attribute
  -- as opposed to an object-like node?
  if parent.type == "binding" and isMutating(parent.parent) then
    -- if this is a nested object to be added, we need to alias this object, add it to the query
    -- create a binding from that alias to the parent binding
  elseif isMutating(parent) then
    type = "mutate"
    operator = parent.operator or parent.type
  end
  local node = makeNode(type, parent, line.line, line.offset)
  if type == "mutate" then
    node.operator = operator
  end
  local resolved
  -- @TODO: check for an error here
  if expression.type == "IDENTIFIER" then
    resolved = resolveVariable(parent, expression, expression.value)
  elseif expression.op and (expression.op.type == "NAME" or expression.op.type == "TAG") then
    local objectName = expression.children[1]
    resolved = resolveVariable(parent, objectName, objectName.value)
  end
  if resolved then
    node.variable = resolved
  else
    -- generate a random var
  end
  local binding = makeNode("binding", node, line.line, line.offset)
  binding.field = MAGIC_ENTITY_FIELD
  binding.source = node
  binding.variable = node.variable
  return node
end

local function parseAttributeLine(line, expression)
  local parent = getParentNode(line)
  local node = makeNode("binding", parent, line.line, line.offset)
  local attributeName
  if expression.type == "IDENTIFIER" then
    node.field = expression.value
    node.variable = resolveVariable(parent, expression, expression.value)
  elseif expression.op and expression.op.type == "NAME" then
    node.field = "name"
    if expression.children[1] then
      node.constant = expression.children[1].value
      node.constantType = "string"
    else
      print(color.error("Expect a name after the @"))
    end
    return node
  elseif expression.op and expression.op.type == "TAG" then
    node.field = "tag"
    if expression.children[1] then
      node.constant = expression.children[1].value
      node.constantType = "string"
    else
      print(color.error("Expect a name after the #"))
    end
    return node
  elseif expression.type == "expr" and (expression.op.type == "ALIAS" or expression.op.type == "EQUALITY") then
    local field = expression.children[1]
    local value = expression.children[2]
    node.field = field.value
    if not value then return node end
    if value.type == "IDENTIFIER" then
      node.variable = resolveVariable(parent, value, value.value)
    elseif value.type == "STRING" then
      node.constant = value.value
      node.constantType = "string"
    elseif value.type == "NUMBER" then
      node.constant = value.value
      node.constantType = "number"
    end

  else
    print(string.format(color.error("Expected the name of an attribute on line %s"), line.line))
  end
  return node
end

local function parseMutation(line, expression)
  -- @TODO: forever modifier
  local parent = getParentNode(line)
  -- local first = line.tokens[1]
  local type = "add"
  if expression.type == "REMOVE" then
    type = "remove"
  end
  return makeNode(type, parent, line.line, line.offset)
end

local function parseMutatedObjectLine(line)
  local parent = getParentNode(line)
  local scanner = ArrayScanner:new(line.tokens)
  local first = scanner:read()
  -- the only valid thing that can appear under an add or remove
  -- that isn't already handled by # or @, is an identifier
  if first.type ~= "IDENTIFIER"then
    -- @TODO: based on what kind of tokens we see here, we can probably guess a bit at
    -- what they were trying to express and hint them in the right direction
    -- print(string.format(color.error("After an %s, I need to know what object to %s. You can express that as either a tag, a name, or an existing variable."), parent.type))
  end
  -- we need to create a mutate node here
  local node = makeNode("mutate", parent, line.line, line.offset)
  node.operator = parent.type
  node.variable = resolveVariable(parent, first, first.value)
  -- and then add a binding for the magical ENTITY field to the variable represented
  local binding = makeNode("binding", node, line.line, line.offset)
  binding.field = MAGIC_ENTITY_FIELD
  binding.source = node
  binding.variable = node.variable
  local second = scanner:peek()
  if second then
    -- since the first token is specifying the object, the only thing that's valid from here on out
    -- is a set of attribute expressions. If the next thing isn't an identifier, tag, or @, we've got
    -- a problem
    -- @FIXME this should probably just be generically part of attribute set parsing
    if second.type ~= "IDENTIFIER" or second.type ~= "TAG" or second.type ~= "NAME" then
      local verb = parent.type == "add" and "adding attributes to" or "removing attributes from"
      print(string.format(color.error("You're %s %s here, so I was expecting a set of attributes, but I got a %s token instead"), verb, first.value, second.type))
    else
      -- parse the attribute string
    end
  end
  return node
end

local function parseOrAnd(parentType, line)
  if not line.parent then
    print(color.error("TOP LEVEL AND/OR?"))
  end
  -- this turns into a query node attached to the nearest sibling union
  -- first we have to find that union
  local sibling
  local foundMe = false
  local parentChildren = line.parent.children
  for i = #parentChildren, 1, -1 do
    local siblingLine = parentChildren[i]
    if foundMe then
      sibling = getLineNode(siblingLine)
      if sibling.type == parentType then
        break
      end
    end
    if siblingLine == line then
      foundMe = true
    end
  end
  -- now that we have that union, make a new query node for it
  local childQuery = makeNode("query", sibling, line.line, line.offset)
  childQuery.variableMap = {}
  return childQuery
end

local function parseQueryLine(line)
  local node
  local parent = getParentNode(line)
  -- if the line is at root indentation, then there are two possibilities
  -- the line is either the start of a query, or it's another line of documentation
  -- for the current query
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
  end
  return node
end

parseLine = function(line)
  if line.type == "context" then
    return {type="context", children={}, file = line.file}
  end

  local node
  local parent = getParentNode(line)
  local scanner = ArrayScanner:new(line.tokens)
  local expressions = ArrayScanner:new(extractInlineExpressions(ArrayScanner:new(line.tokens)))
  local first = scanner:peek()
  -- we only have queries at the root level
  if line.offset == 0 then
    node = parseQueryLine(line)
  elseif first then
    local firstExpression = expressions:read()
    local final
    -- print(formatGraph({type="expression tree", children = extractInlineExpressions(ArrayScanner:new(line.tokens))}))
    while firstExpression do
      -- inside of an object or mutate, we expect to see either
      -- identifiers or expressions
      if parent.type == "object" or parent.type == "mutate" then
          -- print(formatGraph(firstExpression))
        node = parseAttributeLine(line, firstExpression)

        -- check for the keyword-based lines types
      elseif firstExpression.type == "ADD" or firstExpression.type == "REMOVE" then
        node = parseMutation(line, firstExpression)
      elseif firstExpression.type == "CHOOSE" then
        node = makeNode("choose", parent, line.line, line.offset)
      elseif firstExpression.type == "UNION" then
        node = makeNode("union", parent, line.line, line.offset)
      elseif firstExpression.type == "OR" then
        node = parseOrAnd("choose", line)
      elseif firstExpression.type == "AND" then
        node = parseOrAnd("union", line)
      elseif firstExpression.type == "NOT" then
        node = makeNode("not", parent, line.line, line.offset)
      elseif firstExpression.type == "COMMENT" then
        node = makeNode("comment", parent, line.line, line.offset)
        node.comment = first.value
      elseif firstExpression.type == "expr" then
        -- otherwise, we have to look more closely at what kind of expression
        -- we're dealing with. At this level, the only valid expressions are
        -- tag/name expressions, or equalities.
        if firstExpression.op.type == "TAG" or firstExpression.op.type == "NAME" then
          node = parseObjectLine(line, firstExpression)
          parent = node
        elseif firstExpression.op.type == "EQUALITY" or firstExpression.op.type == "ALIAS" then
          node = makeNode("expression", parent, line.line, line.offset)
        end
      elseif firstExpression.type == "IDENTIFIER"
        and (parent.type == "query" or parent.type == "add" or parent.type == "remove") then
        -- a naked identifier is also valid as the beginning of an object query
        -- which is valid at a query boundary or an add/remove
        node = parseObjectLine(line, firstExpression)
      else
        -- @TODO: try and figure out what you were trying to type so we can offer
        -- a decent error message
      end
      if not final and node then
        final = node
      end
      firstExpression = expressions:read()
      node = final
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

