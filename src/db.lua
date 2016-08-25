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
local utf8 = require("utf8")
local generate_uuid = generate_uuid
local value_to_string = value_to_string
local sstring = sstring
local snumber = snumber
local sboolean = sboolean
local create_edb = create_edb
local insert_edb = insert_edb
local dump_edb = dump_edb
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

-- EDB bridge wrapper --

function asValue(v)
  if type(v) == "table" then
    if getmetatable(v) == UUID then
      return v.value
    else
      error("Unable to coerce table to Eve value")
    end
  elseif type(v) == "string" then
    return sstring(v)
  elseif type(v) == "number" then
    return snumber(v)
  elseif type(v) == "boolean" then
    return sboolean(v)
  end
  error("Unknown value type: " .. type(v))
end

UUID = {}
UUID.__index = UUID
function UUID:new()
  local uuid = setmetatable({}, self)
  uuid.value = generate_uuid()
  return uuid
end

function UUID.__tostring(uuid)
  return value_to_string(uuid.value)
end

function UUID.toJSON(uuid)
  return "{\"type\": \"uuid\", \"value\": \"" .. value_to_string(uuid.value) .. "\"}"
end


EAV = {}
EAV.__index = EAV

function EAV:new(args)
  local eav = setmetatable(args or {}, self)
  return eav
end

function EAV.__tostring(eav)
  return string.format("[%s, %s, %s]", eav[1], eav[2], eav[3])
end

function EAV.hash(eav)
  local hash = string.format("%s ⦷ %s ⦷ %s", eav[1], eav[2], eav[3]);
  return hash
end

function EAV.signature(eav)
  local sig = ""
  if eav[1] ~= nil then sig[1] = "E" else sig[1] = "e" end
  if eav[2] ~= nil then sig[2] = "A" else sig[2] = "a" end
  if eav[3] ~= nil then sig[3] = "V" else sig[3] = "v" end
  return sig
end

function EAV.asValues(eav)
  return {asValue(eav[1]), asValue(eav[2]), asValue(eav[3])}
end

Bag = {}
Bag.__index = Bag
function Bag:new(args)
  local bag = setmetatable({eavs = {}, hashes = Set:new(), indexEAV = {}, indexAVE = {}}, self)
  bag.name = args and args.name or "Unnamed"
  bag.id = args and args.id or UUID:new()
  if args then
    bag:addMany(args)
  end
  return bag
end

-- @FIXME: no way to remove atm because we don't cache dirty removed EAVs
function Bag:_sync(eav)
  if not self.cbag then
    self.cbag = create_edb(self.id.value)
  end

  local hash = EAV.hash(eav)
  local m
  if self.hashes:has(hash) then
    m = 1
  else
    m = -1
  end
  local values = EAV.asValues(eav)
  insert_edb(self.cbag, values[1], values[2], values[3], m)
end

function Bag:size()
  return self.hashes:length()
end

function Bag:add(eav)
  setmetatable(eav, EAV)
  local hash = EAV.hash(eav)
  if self.hashes:add(hash) then
    self.eavs[hash] = eav
    self:_index(eav)
    self:_sync(eav)
    return true
  end
  return false
end

function Bag:remove(eav)
  local hash = EAV.hash(eav)
  if self.hashes:remove(hash) then
    self.eavs[hash] = nil
    self:_deindex(eav)
    self:_sync(eav)
  end
  return false
end

function Bag:addMany(eavs)
  local changed = false
  for _, eav in ipairs(eavs) do
    changed = self:add(eav) or changed
  end
  return changed
end

function Bag:removeMany(eavs)
  local changed = false
  for _, eav in ipairs(eavs) do
    changed = self:remove(eav) or changed
  end
  return changed
end

function Bag:has(eav)
  local hash = EAV.hash(eav)
  return self.hashes:has(hash)
end

function Bag:hasAny(eavs)
  for _, eav in ipairs(eavs) do
    if self:has(eav) then
      return true
    end
  end
  return false
end

function Bag:hasAll(eavs)
  for _, eav in ipairs(eavs) do
    if not self:has(eav) then
      return false
    end
  end
  return true
end

function Bag:union(other)
  local changed = false
  for hash, eav in pairs(other.eavs) do
    if not self.hashes:has(hash) then
      changed = true
      self.hashes:add(hash)
      self.eavs[hash] = eav
      self.dirty:add(hash)
    end
  end
  return changed
end

function Bag:difference(bag)
  local changed = false
  for hash, eav in pairs(other.eavs) do
    if self.hashes:has(hash) then
      changed = true
      self.hashes:remove(hash)
      self.eavs[hash] = nil
      self.dirty:add(hash)
    end
  end
  return changed
end

function Bag:_index(eav)
  local hash = EAV.hash(eav)
  local e, a, v = eav[1], eav[2], eav[3]

  if not self.indexEAV[e] then self.indexEAV[e] = {} end
  if not self.indexEAV[e][a] then self.indexEAV[e][a] = {} end
  self.indexEAV[e][a][v] = eav

  if not self.indexAVE[a] then self.indexAVE[a] = {} end
  if not self.indexAVE[a][v] then self.indexAVE[a][v] = {} end
  self.indexAVE[a][v][e] = eav

  return true
end

function Bag:_deindex(eav)
  local hash = EAV.hash(eav)
  local e, a, v = eav[1], eav[2], eav[3]

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
      for v, eav in pairs(idx[a]) do
        result:add(eav)
      end
    end
  elseif sig == "eAV" then
    local idx = self.indexAVE[a]
    if idx and idx[v] then
      for v, eav in pairs(idx[v]) do
        result:add(eav)
      end
    end
  elseif sig == "Eav" then
    local idx = self.indexEAV[e]
    if idx then
      for a, vtable in pairs(idx) do
        for v, eav in pairs(vtable) do
          result:add(eav)
        end
      end
    end
  elseif sig == "eAv" then
    local idx = self.indexAVE[a]
    if idx then
      for v, etable in pairs(idx) do
        for e, eav in pairs(etable) do
          result:add(eav)
        end
      end
    end
  else
    for hash, eav in pairs(self.eavs) do
      if v == nil or eav[2] == v then
        result:add(eav)
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
  for eav in pairs(self:find(eavs[#eavs])) do
    entities:add(eav[1])
  end
  eavs[#eavs] = nil

  for eav in ipairs(eavs) do
    local matchedEntities = Set:new()
    for eav in pairs(self:find(eav)) do
      matchedEntities:add(eav[1])
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

function Bag:appendEAVs(eavs, e, a, v, mapping, parentIsASet)
  if mapping[v] then -- if v is a record we've already added, use its id instead of creating a new one
    v = mapping[v]
  end
  if type(v) ~= "table" or getmetatable(v) == UUID then -- single value
    eavs[#eavs + 1] = {e, a, v}
  elseif getmetatable(v) == Set then -- set of values for an attribute
    if parentIsASet then
      error("Error: Adding sets of sets via addRecord(). This is basically never what you want, and will lose the distinction of which subset the elements belong to. Try wrapping the subsets as their own records. Offender: " .. tostring(parentIsASet))
    end
    for subv in pairs(v) do
      self:appendEAVs(eavs, e, a, subv, mapping, v)
    end
  else -- sub-record(s) or array of values
    util.into(eavs, self:recordToEAVs(v, nil, mapping))
    eavs[#eavs + 1] = {e, a, mapping[v]}
  end
end

function Bag:recordToEAVs(record, id, mapping)
  if not id then
    id = UUID:new()
  end
  if not mapping then
    mapping = {}
  end
  if not mapping[record] then
    mapping[record] = id
  else
    id = mapping[record]
  end

  local eavs = {}
  for k, v in pairs(record) do
    self:appendEAVs(eavs, id, k, v, mapping)
  end

  if #record > 0 then
    eavs[#eavs + 1] = {id, "tag", "array"}
  end

  return eavs, id
end

function Bag:addRecord(record, id, mapping)
  local eavs, id = self:recordToEAVs(record, id, mapping)
  self:addMany(eavs)
  return id
end

function Bag.__tostring(bag)
  local entities = ""
  for e, idxA in pairs(bag.indexEAV) do
    local ePadding = string.rep(" ", utf8.len(tostring(e)) + 1)
    entities = entities .. tostring(e)
    if idxA.name then
      local names = {}
      for v, eavs in pairs(idxA.name) do
        names[#names + 1] = v
      end
      entities = entities .. " (" .. table.concat(names, ", ") .. ")"
    end
    entities = entities .. "\n"

    for a, idxV in pairs(idxA) do
      local aHeader = string.format("%s%s: ", ePadding, a)
      entities = entities .. aHeader
      aPadding = string.rep(" ", utf8.len(aHeader))

      local multi = false
      for v, eav in pairs(idxV) do
        entities = string.format("%s%s%s\n", entities, multi and aPadding or "", v)
        multi = true
      end
    end

    entities = entities .. "\n"
  end
  local header = string.format("%s (%s)", bag.id, bag.name)
  return string.format("%s\n%s\n%s",  header, string.rep("-", #header), entities)
end

return Pkg
