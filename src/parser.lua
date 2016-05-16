local fs = require("fs")
local utf8 = require("utf8")

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
  _, char = utf8.next(self.str, self.pos)
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
function Token:print(token)
  print(string.format("[%s %q %s %s]", token.type, token.value, token.line, token.offset))
end
function Token:printAll(tokens)
  for k, v in pairs(tokens) do
    io.write(k, ": ")
    Token:print(v)
  end
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
  while char do
    if whitespace[char] then
      if char == "\n" then
        line = line + 1
        offset = 0
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
  return tokens
end

------------------------------------------------------------
-- ParseFile
------------------------------------------------------------

local function parseFile(args)
  local path = args[2]
  print("Parsing: ", path)
  local content = fs.read(path)
  local tokens = lex(content)
  Token:printAll(tokens)
end

------------------------------------------------------------
-- Parser interface
------------------------------------------------------------

return {parseFile = parseFile}
