-- Imports / module wrapper
local Pkg = {}
local std = _G
local error = error
local print = print
local type = type
local tostring = tostring
local getmetatable = getmetatable
local setmetatable = setmetatable
local pairs = pairs
local ipairs = ipairs
local string = string
local table = table
local util = require("util")
local Set = require("set").Set
setfenv(1, Pkg)

OUT = "$$OUT"
IN = "$$IN"
STRONG_IN = "$$STRONG_IN"
FILTER_IN = "$$FILTER_IN"
OPT = "$$OPT"
local sigSymbols = {[OUT] = "f", [IN] = "b", [STRONG_IN] = "B", [FILTER_IN] = "v", [OPT] = "?"}
function fmtSignature(args, signature)
  local result = ""
  local multi = false
  for _, arg in ipairs(args) do
    if multi then result = result .. ", " end
    result = result .. arg .. ": " .. sigSymbols[signature[arg]]
    multi = true
  end
  return result
end

local Signature = {}
function Signature.__tostring(signature)
  local args = {}
  for arg in pairs(signature) do
    args[#args + 1] = arg
  end
  return fmtSignature(args, signature)
end

function getSignature(bindings, bound)
  local signature = setmetatable({}, Signature)
  for _, binding in ipairs(bindings) do
    if binding.constant or bound and bound[binding.variable] then
      signature[binding.field] = IN
    elseif not bound then
      signature[binding.field] = OPT
    else
      signature[binding.field] = OUT
    end
  end
  return signature
end
local Schema = {}
function Schema.__tostring(schema)
  local signature = fmtSignature(schema.args, schema.signature)
  local rest = schema.rest and (", ...: " .. sigSymbols[schema.rest]) or ""
  return string.format("Schema<%s, (%s%s)>", schema.name or "UNNAMED", signature, rest)
end

local function schema(args, name, kind)
  local schema = {args = {}, signature = setmetatable({}, Signature), name = name, kind = kind}
  setmetatable(schema, Schema)
  local mode = OUT
  for ix, arg in ipairs(args) do
    if arg == OUT or arg == IN or arg == STRONG_IN or arg == FILTER_IN or arg == OPT then
      mode = arg
      if ix == #args then -- a mode token in the final slot signifies a variadic expression that takes any number of vars matching the given mode
        schema.rest = arg
      end
    else
      schema.args[#schema.args + 1] = arg
      schema.signature[arg] = mode
    end
  end
  return schema
end

local function rename(name, schema)
  local neue = util.shallowCopy(schema)
  neue.name = name
  return neue
end
local schemas = {
  unary = schema{"return", IN, "a"},
  unaryValue = schema{"return", IN, "value"},
  unaryBound = schema{IN, "return", "a"},
  unaryFilter = schema{FILTER_IN, "a"},
  binary = schema{"return", IN, "a", "b"},
  binaryBound = schema{IN, "return", "a", "b"},
  binaryFilter = schema{FILTER_IN, "a", "b"},
  trig = schema{"return", IN, "angle"},
  moveIn = schema{"a", IN, "b"},
  moveOut = schema{"b", IN, "a"}
}

local expressions = {
  ["+"] = {rename("plus", schemas.binary)},
  ["-"] = {rename("minus", schemas.binary)},
  ["*"] = {rename("multiply", schemas.binary)},
  ["/"] = {rename("divide", schemas.binary)},

  ["<"] = {rename("less_than", schemas.binaryFilter), rename("is_less_than", schemas.binary)},
  ["<="] = {rename("less_than_or_equal", schemas.binaryFilter), rename("is_less_than_or_equal", schemas.binary)},
  [">"] = {rename("greater_than", schemas.binaryFilter), rename("is_greater_than", schemas.binary)},
  [">="] = {rename("greater_than_or_equal", schemas.binaryFilter), rename("is_greater_than_or_equal", schemas.binary)},
  ["="] = {rename("equal", schemas.binaryFilter), rename("is_equal", schemas.binary), rename("move", schemas.moveIn), rename("move", schemas.moveOut)},
  ["!="] = {rename("not_equal", schemas.binaryFilter), rename("is_not_equal", schemas.binary)},

  concat = {schema({"return", IN}, "concat")},
  length = {schema({"return", IN, "string"}, "length")},
  is = {rename("is", schemas.unary)},

  abs = {rename("abs", schemas.unary)},
  sin = {rename("sin", schemas.trig)},
  cos = {rename("cos", schemas.trig)},
  tan = {rename("tan", schemas.trig)},
  abs = {rename("abs", schemas.unaryValue)},
  ceil = {rename("ceil", schemas.unaryValue)},
  floor = {rename("floor", schemas.unaryValue)},
  round = {rename("round", schemas.unaryValue)},
  mod = {schema({"return", IN, "value", "by"}, "mod")},
  range = {schema({"return", IN, "from", "to"}, "range")},
  toggle = {rename("toggle", schemas.unaryValue)},
  random = {schema({"return", IN, "seed"}, "random")},
  time = {schema({"return", OPT, "frames", "seconds", "minutes", "hours"}, "time")},
  split = {schema({"token", IN, "index", "text", "by"}, "split-bound"),
           schema({"token", "index", IN, "text", "by"}, "split")},

  -- Aggregates
  count = {schema({"return"}, "sum", "aggregate")},
  sum = {schema({"return", STRONG_IN, "value"}, "sum", "aggregate")},
  join = {schema({"return", STRONG_IN, "token", "index", "with"}, "join", "aggregate")}}


function getExpressions()
  local exprs = Set:new()
  for expr in pairs(expressions) do
    exprs:add(expr)
  end
  return exprs
end

function getSchemas(name)
  return expressions[name]
end

-- Get the possible schemas for an unbound signature
function getPossibleSchemas(name, signature)
  if not expressions[name] then error("Unknown expression '" .. name .. "'") end
  if not signature and #expressions[name] > 1 then error("Must specify signature to disambiguate expression alternatives") end
  local results = Set:new()

  for _, schema in ipairs(expressions[name]) do
    local match = true
    local required = Set:new()
    for arg, mode in pairs(schema.signature) do
      if mode == OUT or mode == IN or mode == STRONG_IN or mode == FILTER_IN then
        required:add(arg)
      end
    end
    for arg, mode in pairs(signature) do
      required:remove(arg)
      local schemaMode = schema.signature[arg] or schema.rest
      if schemaMode == STRONG_IN or schemaMode == FILTER_IN then
        schemaMode = IN
      end
      if schemaMode ~= mode and schemaMode ~= OPT and mode ~= OPT then
        match = false
        break
      end
    end
    if match and required:length() == 0 then
      results:add(schema)
    end
  end
  return results
end

function getSchema(name, signature)
  if not expressions[name] then return end
  if not signature then error("Must specify signature to disambiguate expression alternatives") end
  local result

  for _, schema in ipairs(expressions[name]) do
    local match = true
    local required = Set:new()
    for arg, mode in pairs(schema.signature) do
      if mode == OUT or mode == IN or mode == STRONG_IN or mode == FILTER_IN then
        required:add(arg)
      end
    end
    for arg, mode in pairs(signature) do
      required:remove(arg)
      local schemaMode = schema.signature[arg] or schema.rest
      if schemaMode == STRONG_IN or schemaMode == FILTER_IN then
        schemaMode = IN
      end
      if schemaMode ~= mode and schemaMode ~= OPT then
        match = false
        break
      end
    end
    if match and required:length() == 0 then
      result = schema
      break
    end
  end
  -- if not result then
  --   local available = {}
  --   for _, schema in ipairs(expressions[name]) do
  --     available[#available + 1] = string.format("%s(%s)", name, fmtSignature(schema.args, schema.signature))
  --   end
  --   error(string.format("No matching signature for expression  %s(%s); Available signatures:\n  %s", name, signature, table.concat(available, "\n  ")))
  -- end

  return result
end

function getArgs(schema, bindings)
  local map = {}
  local positions = {}
  for _, binding in ipairs(bindings) do
    map[binding.field] = binding.variable or binding.constant
    positions[#positions + 1] = binding.field
  end

  local args = {}
  local fields = {}
  for _, arg in ipairs(schema.args) do
    if map[arg] then
      args[#args + 1] = map[arg]
      fields[#fields + 1] = arg
    end
  end
  if schema.rest then
    fields[#fields + 1] = "..."
    args["..."] = {}
    for _, field in ipairs(positions) do
      if not schema.signature[field] then
        args["..."][#args["..."] + 1] = map[field]
      end
    end
  end

  return args, fields
end

function hashFact(fact)
  local hash = string.format("%s ⦷ %s ⦷ %s", fact[1], fact[2], fact[3]);
  return hash
end

local function patternSignature(pattern)
  local sig = ""
  if pattern[1] ~= nil then sig[1] = "E" else sig[1] = "e" end
  if pattern[2] ~= nil then sig[2] = "A" else sig[2] = "a" end
  if pattern[3] ~= nil then sig[3] = "V" else sig[3] = "v" end
  return sig
end

local Bag = {}
Bag.__index = Bag
function Bag:new(args)
  local instance = setmetatable({facts = {}, hashes = Set:new(), indexEAV = {}, indexAVE = {}}, self)

  return instance
end

function Bag:size()
  return self.hashes:length()
end

function Bag:add(fact)
  local hash = hashFact(fact)
  if self.hashes:add(hash) then
    self.facts[hash] = fact
    self:_indexFact(fact)
    return true
  end
  return false
end

function Bag:remove(fact)
  local hash = hashFact(fact)
  if self.hashes:remove(hash) then
    self.facts[hash] = nil
    self:_deindexFact(fact)
  end
  return false
end

function Bag:addMany(facts)
  local changed = false
  for _, fact in ipairs(facts) do
    changed = changed or self:add(fact)
  end
  return changed
end

function Bag:removeMany(facts)
  local changed = false
  for _, fact in ipairs(facts) do
    changed = changed or self:remove(fact)
  end
  return changed
end

function Bag:has(fact)
  local hash = hashFact(fact)
  return self.hashes:has(hash)
end

function Bag:hasAny(facts)
  for _, fact in ipairs(facts) do
    if self:has(fact) then
      return true
    end
  end
  return false
end

function Bag:hasAll(facts)
  for _, fact in ipairs(facts) do
    if not self:has(fact) then
      return false
    end
  end
  return true
end

function Bag:union(other)
  local changed = false
  for hash, fact in pairs(other.facts) do
    if not self.hashes:has(hash) then
      changed = true
      self.hashes:add(hash)
      self.facts[hash] = fact
    end
  end
  return changed
end

function Bag:difference(bag)
  local changed = false
  for hash, fact in pairs(other.facts) do
    if self.hashes:has(hash) then
      changed = true
      self.hashes:remove(hash)
      self.facts[hash] = nil
    end
  end
  return changed
end

function Bag:_indexFact(fact)
  local hash = hashFact(fact)
  local e, a, v = fact[1], fact[2], fact[3]

  if not self.indexEAV[e] then self.indexEAV[e] = {} end
  if not self.indexEAV[e][a] then self.indexEAV[e][a] = {} end
  self.indexEAV[e][a][v] = fact

  if not self.indexAVE[a] then self.indexAVE[a] = {} end
  if not self.indexAVE[a][v] then self.indexAVE[a][v] = {} end
  self.indexAVE[a][v][e] = fact

  return true
end

function Bag:_deindexFact(fact)
  local hash = hashFact(fact)
  local e, a, v = fact[1], fact[2], fact[3]

  if self.indexEAV[e] and self.indexEAV[e][a] then
    self.indexEAV[e][a][v] = nil
  end

  if self.indexAVE[a]and self.indexAVE[a][v] then
    self.indexAVE[a][v][e] = nil
  end
  return true
end

function Bag:getRecord(entity)
  local record = {}
  local eavs = self:find({entity, nil, nil})
  for eav in pairs(eavs) do
    record[eav[2]] = eav[3]
  end

  return record
end

function Bag:find(pattern)
  local e, a, v = pattern[1], pattern[2], pattern[3]
  local sig = patternSignature(pattern)
  local result = Set:new(0)
  if sig == "EAV" then
    local idx = self.indexEAV[e]
    if idx and idx[a] and idx[a][v] then
      result:add(idx[a][v])
    end
  elseif sig == "EAv" then
    local idx = self.indexEAV[e]
    if idx and a and idx[a] then
      for v, fact in pairs(idx[a]) do
        result:add(fact)
      end
    end
  elseif sig == "eAV" then
    local idx = self.indexAVE[a]
    if idx and idx[v] then
      for v, fact in pairs(idx[v]) do
        result:add(fact)
      end
    end
  elseif sig == "Eav" then
    local idx = self.indexEAV[e]
    if idx then
      for a, vtable in pairs(idx) do
        for v, fact in pairs(vtable) do
          result:add(fact)
        end
      end
    end
  elseif sig == "eAv" then
    local idx = self.indexAVE[a]
    if idx then
      for v, etable in pairs(idx) do
        for e, fact in pairs(etable) do
          result:add(fact)
        end
      end
    end
  else
    for hash, fact in pairs(self.facts) do
      if v ~= nil or fact[2] == v then
        result:add(fact)
      end
    end
  end

  return result
end

function Bag:findRecords(record)
  local eavs = {}
  for k, v in pairs(record) do
    eavs[#eavs + 1] = {nil, k, v}
  end

  if #eavs < 1 then return Set:new() end

  local entities = Set:new()
  for fact in pairs(self:find(eavs[#eavs])) do
    entities:add(fact[1])
  end
  eavs[#eavs] = nil

  for eav in ipairs(eavs) do
    local matchedEntities = Set:new()
    for fact in pairs(self:find(eav)) do
      matchedEntities:add(fact[1])
    end
    entities:intersection(matchedEntities, true)

    if entities:length() == 0 then
      return entities
    end
  end

  local result = Set:new()
  for entity in pairs(entities) do
    result:add(self:getRecord(entity))
  end

  return result
end

function Bag:addRecord(record, id)
  if not id then
    id = util.generateId() -- @FIXME: This really needs to be a C uuid...
  end
  local eavs = {}
  for k, v in pairs(record) do
    eavs[#eavs + 1] = {id, k, v}
  end

  self:addMany(eavs)
end

return Pkg
