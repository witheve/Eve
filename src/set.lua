local Pkg = {}
local std = _G
local ipairs = ipairs
local pairs = pairs
local setmetatable = setmetatable
local tostring = tostring
setfenv(1, Pkg)

local weakKeys = {__mode = "k"}
-- lengths is used to track the size of each set for constant time lookup without polluting the set itself
-- It uses mode k to allow the GC to sweep sets without any explicit cleanup
local lengths = setmetatable({}, weakKeys)

Set = {}
function Set:new(args)
   args = args or {}
   local count = #args
   for ix = count, 1, -1 do
      args[args[ix]] = true
      args[ix] = nil
   end

   setmetatable(args, self)
   self.__index = self
   lengths[args] = count
   return args
end

function Set:clone()
   local result = Set:new()
   for k in pairs(self) do result[k] = true end
   lengths[result] = #self
   return result
 end

function Set:add(val)
   if self[val] then return false end
   self[val] = true
   lengths[self] = lengths[self] + 1
   return true
end

function Set:remove(val)
   if not self[val] then return false end
   self[val] = nil
   lengths[self] = lengths[self] - 1
   return true
end

function Set.union(lhs, rhs, mutate)
   local result = lhs
   local count = #lhs
   if not mutate then
      result = Set:new()
      for k in pairs(lhs) do result[k] = true end
   end
   for k in pairs(rhs) do
      if not result[k] then
         result[k] = true
         count = count + 1
      end
   end
   lengths[result] = count
   return result
end

function Set.intersection(lhs, rhs, mutate)
   local result = lhs
   local count = #lhs
   if not mutate then
      result = Set:new()
      count = 0
      for k in pairs(lhs) do
         if rhs[k] then
            result[k] = true
            count = count + 1
         end
      end
   else
      for k in pairs(result) do
         if not rhs[k] then
            result[k] = nil
            count = count - 1
         end
      end
   end
   lengths[result] = count
   return result
end

function Set.difference(lhs, rhs, mutate)
   if not mutate then
      local result = Set:new()
      local count = 0
      for k in pairs(lhs) do
         if not rhs[k] then
            result[k] = true
            count = count + 1
         end
      end
      lengths[result] = count
      return result
   else
      for k in pairs(rhs) do
         lhs:remove(k)
      end
      return lhs
   end
end

function Set.__tostring(obj)
   local result = "#{ "
   for k in pairs(obj) do
      result = result .. tostring(k) .. ", "
   end
   return result .. "}"
end

function Set.__len (obj)
   return lengths[obj]
end

function Set.__add(lhs, rhs)
   return Set.union(lhs, rhs)
end

function Set.__mul(lhs, rhs)
   return Set.intersection(lhs, rhs)
end

function Set.__div(lhs, rhs)
   return Set.difference(lhs, rhs)
end

if ... == nil then
   local os = std.os
   local math = std.math
   local string = std.string
   local print = std.print
   local table = std.table
   local util = require("src/util")

   -- Super simple human smoke tests

   print("Testing Set (empty)")
   util.printTable(Set:new())
   print("Testing Set (content)")
   local testSet = Set:new{"foo", "bar", "baz", "quux"}
   print(testSet)
   print("Testing Set (cardinality)")
   print(#testSet)

   local otherSet = Set:new{"arg", "foo", 6, "baz", true}
   print("Set union with", otherSet)
   print(testSet + otherSet)

   print("Set intersection with", otherSet)
   print(testSet * otherSet)

   print("mutating union")
   local unionedSet = testSet:clone():union(otherSet, true)
   print(unionedSet)

   print("mutating intersect")
   local intersectedSet = testSet:clone():intersection(otherSet, true)
   print(intersectedSet)

   print("add 27 to ", testSet)
   testSet:add(27)
   print(testSet, #testSet)
   print("add 27 again")
   testSet:add(27)
   print(testSet, #testSet)

   print("remove foo")
   testSet:remove("foo")
   print(testSet, #testSet)
   print("remove foo again")
   testSet:remove("foo")
   print(testSet, #testSet)

   -- Super simple perf-testing shim

   local dupRate = 0.4 -- Statistically (dupRate * 100)% of values are duplicates
   local removeRate = 0.4 -- Exactly (removeRate * 100)% of actions are removals from the set
   math.randomseed(os.time())
   for exp = 2, 5 do -- 10^2 - 10^N (larger values make array set take an eternity
      local sampleCount = 10^exp
      local sampleMax = sampleCount * (1 - dupRate)
      local removeMod = math.floor(1 / removeRate)
      local values = {}
      for i = 1, sampleCount * 2 do
         values[i] = math.random(sampleMax)
      end

      print("Quickie set with 10^" .. std.tostring(exp) .. "elems...")
      local startTime = os.clock()
      local set = Set:new()
      local adds = 0
      local removes = 0
      for i = 1, sampleCount do
         local value = values[i]
         if i % removeMod == 0 then
            if set:remove(value) then
               removes = removes + 1
            end
         else
            if set:add(value) then
               adds = adds + 1
            end
         end
      end

      local contained = 0
      for i = sampleCount, sampleCount * 2 do
         if set[values[i]] then
            contained = contained + 1
         end
      end
      print("  - +:", adds)
      print("  - -:", removes)
      print("  - ?:", contained)
      print("- Elapsed:", string.format("%.3fms\n", (os.clock() - startTime) * 1000))

      print("Array set with 10^" .. std.tostring(exp) .. "elems...")
      local startTime = os.clock()
      local set = {}
      local adds = 0
      local removes = 0
      for i = 1, sampleCount do
         local value = values[i]
         local contained = false
         for ix, v in std.ipairs(set) do
            if v == value then
               contained = ix
               break
            end
         end

         local isRemove = i % removeMod == 0
         if isRemove and contained then
            table.remove(set, contained)
            removes = removes + 1
         elseif not isRemove and not contained then
            set[#set + 1] = value
            adds = adds + 1
         end
      end

      local contained = 0
      for i = sampleCount, sampleCount * 2 do
         local value = values[i]
         for ix, v in std.ipairs(set) do
            if v == value then
               contained = contained + 1
               break
            end
         end
      end
      print("  - +:", adds)
      print("  - -:", removes)
      print("  - ?:", contained)
      print("- Elapsed:", string.format("%.3fms\n", (os.clock() - startTime) * 1000))
   end
end

return Pkg

--[[

 ]]--
