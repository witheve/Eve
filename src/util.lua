local Pkg = {}
local std = _G
local ipairs = ipairs
local pairs = pairs
local type = type
local setmetatable = setmetatable
local getmetatable = getmetatable
local tostring = tostring
local io = io
local string = string
local math = math

setfenv(1, Pkg)

local empty = {}

function printTable(obj, indent, maxDepth, seen)
   seen = seen or {}
   maxDepth = maxDepth or 10
   if seen[obj] then
      io.write("<<cycle detected>>")
      return
   end
   if maxDepth == 0 then
      io.write("<<maxDepth exceeded>>")
      return
   end
   seen[obj] = true
   local indent = indent or 0
   local padding = string.rep("  ", indent)
   io.write("{\n")
   for k, v in pairs(obj) do
      io.write(padding, "  ", tostring(k), ": ")
      if type(v) == "table" then
         printTable(v, indent + 1, maxDepth - 1, seen)
         io.write(",\n")
      else
         io.write(tostring(v), "\n")
      end
   end

   io.write(padding, "}")
   if indent == 0 then
      io.write("\n")
   end
end

function printList(obj)
   io.write("{ ")
   for k, v in ipairs(obj) do
      io.write(tostring(v), ", ")
   end
   io.write("}")
end

if ... == nil then
end

function shallowCopy(obj)
   if type(obj) ~= "table" then return obj end
   local meta = getmetatable(obj)
   local neue = {}
   for k, v in pairs(obj) do
      neue[k] = v
   end
   setmetatable(neue, meta)
   return neue
end

return Pkg

--[[
   print("Testing Set (empty)")
   printTable(Set:new())
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
 ]]--
