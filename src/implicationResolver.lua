
-- This file provides functions to take a parse and figure out how the implications
-- depend on each other.

local Pkg = {}
local std = _G
local error = error
local print = print
local string = string
local ipairs = ipairs
local pairs = pairs
local util = require("util")
local Set = require("set").Set
local parser = require("parser")
local color = require("color")
setfenv(1, Pkg)

function resolveObjectInfo(object, context)
  local memoized = context.objectInfo[object]
  if memoized then
    return memoized
  end
  -- based on the bindings of this object, look for any tags
  -- or names, catalog the other attributes, get the variable
  -- for this object if there is one
  local info = {object = object, kinds = {}, attributes = {}, type = "producer"}
  if object.type == "object" then
    info.type = "consumer"
  end
  for _, binding in ipairs(object.bindings) do
    local field = binding.field
    -- if this is an entity binding, we found the variable for
    -- this object
    if field == parser.MAGIC_ENTITY_FIELD then
      info.variable = field.variable
      -- also store it globally so that we can look this guy up
      -- during equivalence resolution
      variableIndex = context.variableToObjectInfo[info.variable]
      if not variableIndex then
        variableIndex = {consumer = {}, producer = {}}
        context.variableToObjectInfo[info.variable] = variableIndex
      end
      variableIndex[info.type][#variableIndex[info.type] + 1] = info
    elseif field == "tag" and binding.constant then
      info.kinds[#info.kinds + 1] = "#" .. binding.constant.constant
    elseif field == "name" and binding.constant then
      info.kinds[#info.kinds + 1] = "@" .. binding.constant.constant
    elseif binding.variable then
      info.attributes[#info.attributes + 1] = {attribute = binding.field, binding = binding}
    elseif binding.constant then
      info.attributes[#info.attributes + 1] = {attribute = binding.field, value = binding.constant.constant, binding = binding}
    else
      -- ?
    end
  end

  if info.type == "producer" or #info.kinds == 0 then
    info.kinds[#info.kinds + 1] = "any"
  end

  context.objectInfo[object] = info
  return info
end

function indexConsumers(program, context)
  -- For each query, look at all the objects and index
  -- for tag/name/any the attributes on that object you're
  -- looking for. The index is [tag/name][attribute] = objectInfo
  local consumers = context.consumers
  local objectInfo = context.objectInfo
  for _, query in ipairs(program.children) do
    context.toResolve:add(query)
    if query.type == "query" then
      for _, object in ipairs(query.objects) do
        local info = resolveObjectInfo(object, context)
        -- for each kind that this object represents (name/tag)
        for _, kind in ipairs(info.kinds) do
          -- create this index if it doesn't exist
          local kindIndex = consumers[kind]
          if not kindIndex then
            kindIndex = {}
            consumers[kind] = kindIndex
          end
          -- store each attribute that it consumes
          for _, attribute in ipairs(info.attributes) do
            -- create this index if it doesn't exist
            local attrIndex = kindIndex[attribute.attribute]
            if not attrIndex then
              attrIndex = {}
              consumers[kind][attribute.attribute] = attrIndex
            end
            attrIndex[#attrIndex + 1] = info
          end
        end
      end
    end
  end
end

function indexProducers(program, context)
  -- For each query, look at all the mutates and index
  -- for tag/name/any the attributes on that mutate that you're
  -- providing. The index is [tag/name][attribute] = objectInfo
  local producers = context.producers
  local consumers = context.consumers
  local toResolve = context.toResolve
  local objectInfo = context.objectInfo
  for _, query in ipairs(program.children) do
    if query.type == "query" then
      for _, object in ipairs(query.mutates) do
        local info = resolveObjectInfo(object, context)
        -- for each kind that this object represents (name/tag)
        for _, kind in ipairs(info.kinds) do
          -- create this index if it doesn't exist
          local kindIndex = producers[kind]
          if not kindIndex then
            kindIndex = {}
            producers[kind] = kindIndex
          end
          -- store each attribute that it consumes
          for _, attribute in ipairs(info.attributes) do
            -- create this index if it doesn't exist
            local attrIndex = kindIndex[attribute.attribute]
            if not attrIndex then
              attrIndex = {}
              producers[kind][attribute.attribute] = attrIndex
            end
            attrIndex[#attrIndex + 1] = info
            -- we need to check if anybody was looking for what's
            -- being produced here and if so, add them to the
            -- list of objects to resolve
            if consumers[kind] and consumers[kind][attribute.attribute] then
              for _, consumer in ipairs(consumers[kind][attribute.attribute]) do
                toResolve:add(consumer.object.query)
              end
            end
          end
        end
      end
    end
  end
end

function buildTypeEquivalences(context)
  -- go through all the variables we've captured and build
  -- equivalences based on the kinds consumed and the kinds
  -- provided
  local equivs = context.equivalences
  for _, infos in pairs(context.variableToObjectInfo) do
    -- if there are both producers and consumers for this variable,
    -- then we need to add equivalences for any kinds
    if #infos.consumer > 0 and #infos.producer > 0 then
      local all = Set:new()
      -- union all the kinds
      for _, consumer in ipairs(infos.consumer) do
        for _, kind in ipairs(consumer.kinds) do
          all:add(kind)
        end
      end
      for _, producer in ipairs(infos.producer) do
        for _, kind in ipairs(consumer.kinds) do
          all:add(kind)
        end
      end
      -- for each kind we found, add it to the equivalences
      -- if there's already an equivalence for that type,
      -- union these into it
      for kind in pairs(all) do
        local existing = equivs[kind]
        if existing then
          existing = existing:union(all)
        else
          existing = all
        end
        equivs[kind] = existing
      end
    end
  end
end

function resolveDependencies(program, context)
  -- for each query to resolve, find the set of implications
  -- that are needed
  local objectInfo = context.objectInfo
  local producers = context.producers
  local equivalences = context.equivalences
  local resolutions = context.resolutions
  for query in pairs(context.toResolve) do
    local mappings = {}
    local implications = Set:new()
    print("Time to resolve: ", query.name)
    for _, object in ipairs(query.objects) do
      local info = objectInfo[object]
      if not info then error("Somehow resolving an object that wasn't indexed") end
      local allKinds = Set:new()
      for _, kind in ipairs(info.kinds) do
        allKinds:add(kind)
        local equivs = equivalences[kind]
        if equivs then
          allKinds = allKinds:union(equivs)
        end
      end
      for kind in pairs(allKinds) do
        for _, attribute in ipairs(info.attributes) do
          local current = mappings[attribute]
          if not current then
            current = Set:new()
            mappings[attribute] = current
          end
          local attrName = attribute.attribute
          if producers[kind] and producers[kind][attrName] then
            for _, producer in ipairs(producers[kind][attrName]) do
              current:add(producer)
              if implications:add(producer.object.query) then
                print("I rely on ", producer.object.query.name)
              end
              print("Mapping!", attrName, producer.object.query.name)
            end
          end
        end
      end
    end
    resolutions[query] = {implications = implications, mappings = mappings}
  end
  context.resolutions = resolutions
  return resolutions
end

function collectImplications(parse)
  -- TODO: we can make this incremental if we pass in the previous
  -- context here
  local context = {consumers = {}, producers = {}, equivalences = {}, resolutions = {}
                   objectInfo = {}, variableToObjectInfo = {}, toResolve = Set:new()}
  -- build all the indexes we need to resolve
  indexConsumers(parse, context)
  indexProducers(parse, context)
  buildTypeEquivalences(context)
  -- match consumers and producers
  resolveDependencies(parse, context)
  util.printTable(context.resolutions)
  return parse, context
end

function testCollect(text)
  local parse = parser.parseString(text)
  collectImplications(parse)
end

return Pkg
