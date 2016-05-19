-- Imports / module wrapper
local Pkg = {}
local std = _G
local print = print
local util = require("src/util")
local Set = require("src/set").Set
setfenv(1, Pkg)

-- Utilities

-- Dependency Graph

DependencyGraph = {}

function DependencyGraph:new(obj)
   obj = obj or {}
   obj.nodes = obj.nodes or Set:new()
   obj.dependents = obj.dependents or {}
   obj.providers = obj.providers or {}
   obj.unsatisfied = obj.unsatisfied or {}

   std.setmetatable(obj, self)
   self.__index = self
   return obj
end

function DependencyGraph:fromQueryGraph(query)
   local dgraph = self:new{query = query}
   return dgraph
end

function DependencyGraph:add(node, produces, depends)
   self.nodes:add(node)
   local requires = depends / produces
   print("requires:")
   util.printTable(requires)

   if depends then
      for required in std.pairs(depends) do
         -- Register this node as a dependent on all the terms it uses but cannot produce
         if self.dependents[required] then
            self.dependents[required]:add(node)
         else
            self.dependents[required] = Set:new{node}
         end
      end
      self.unsatisfied[node] = #depends
   end

   if produces then
      for produced in std.pairs(produces) do
         -- Register this node as a possible producer for the given term. The length of this set represents the terms degrees of freedom
         if self.providers[produced] then
            self.providers[produced]:add(node)
         else
            self.providers[produced] = Set:new{node}
         end
      end
   end
end

function DependencyGraph:order()

end

if ... == nil then
   local testTable = {a = 5, b = "z", c = {d = {}}}
   print("Testing printTable")
   util.printTable(testTable)

   local dg = DependencyGraph:new()
   dg:add({name = "foo"}, Set:new{"a", "b"}, Set:new{"b", "c"})
   util.printTable(dg)
end

return Pkg
