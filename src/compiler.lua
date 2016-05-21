-- Imports / module wrapper
local Pkg = {}
local std = _G
local print = print
local util = require("src/util")
local Set = require("src/set").Set
setfenv(1, Pkg)

-- Utilities

function GetNode(subqueries)
   local provides = Set:new()
   local depends = Set:new()
   for body in std.ipairs(node.members) do
      local subgraph = DependencyGraph:fromQueryGraph(body)
      provides.union(subgraph.provides(), true)
      depends.union(subgraph.depends(), true)
   end
end


-- Dependency Graph

DependencyGraph = {}

function DependencyGraph:new(obj)
   obj = obj or {}
   obj.unsorted = obj.unsorted or Set:new()
   obj.provides = obj.provides or {}
   obj.unsatisfied = obj.unsatisfied or {}
   obj.dependents = obj.dependents or {}

   obj.sorted = obj.sorted or {}
   obj.provided = obj.provided or Set:new{}

   std.setmetatable(obj, self)
   self.__index = self
   return obj
end

-- Get the variables this dgraph depends on for reification
function DependencyGraph:depends()
   local depends = Set:new()
   for term in std.pairs(self.dependents) do
      depends:add(term)
   end
   return depends / self.provided
end

function DependencyGraph:provides()
   return self.provided
end

function DependencyGraph:fromQueryGraph(query)
   local dgraph = self:new{query = query}
   if #query.objects > 0 then
      for object in std.ipairs(query.objects) do
         local produces = Set:new()
         local depends = Set:new()
         for  binding in std.ipairs(object.bindings) do
            produces:add(binding.variable)
            depends:add(binding.variable)
         end
         dgraph:add(node, produces, depends)
      end
   end

   if #query.expressions > 0 then
      error("@FIXME: Cannot determine expression production/dependencies without schema support")
   end



   if #query.nots > 0 then
      for node in std.ipairs(query.nots) do
         local subgraph = DependencyGraph:fromQueryGraph(node.body)
         dgraph:add(node, subgraph.provides(), subgraph.depends())
      end
   end

   if #query.unions > 0 then
      for node in std.ipairs(query.unions) do
         local provides = Set:new()
         local depends = Set:new()
         for body in std.ipairs(node.members) do
            local subgraph = DependencyGraph:fromQueryGraph(body)
            provides.union(subgraph.provides(), true)
            depends.union(subgraph.depends(), true)
         end
         dgraph:add(node, provides, depends)
      end
   end

   draph.order()
   -- @FIXME Also order subgraphs once they're completed
   return dgraph
end

function DependencyGraph:add(node, produces, depends)
   self.unsorted:add(node)
   self.provides[node] = produces
   self.unsatisfied[node] = 0

   if depends then
      local requires = depends
      if produces then
         requires = depends / produces
      end
      -- Register this node as a dependent on all the terms it requires but cannot produce
      for term in std.pairs(requires) do
         if not self.provided[term] then
            if self.dependents[term] then
               self.dependents[term]:add(node)
            else
               self.dependents[term] = Set:new{node}
            end
            self.unsatisfied[node] = self.unsatisfied[node] + 1
         end
      end
   end
end

function DependencyGraph:order()
   -- @FIXME: We need to recursively construct DGraphs for ordering subgraphs (subqueries)
   while #self.unsorted > 0 do
      local scheduled = false
      for node in std.pairs(self.unsorted) do
         if self.unsatisfied[node] == 0 then
            self.sorted[#self.sorted + 1] = node
            self.unsorted:remove(node)

            -- Decrement the unsatisfied term count for nodes depending on terms this node provides that haven't been provided elsewhere
            if self.provides[node] then
               for term in std.pairs(self.provides[node]) do
                  if self.dependents[term] and not self.provided[term] then
                     self.provided:add(term)
                     for dependent in std.pairs(self.dependents[term]) do
                        self.unsatisfied[dependent] = self.unsatisfied[dependent] - 1
                     end
                  end
               end
            end
            scheduled = true
            break
         end
      end
      if not scheduled then
         error("Unable to find a valid dependency ordering for the given graph, aborting")
      end
   end
   return self.sorted
end


if ... == nil then
   local testTable = {a = 5, b = "z", c = {d = {}}}
   print("Testing printTable")
   util.printTable(testTable)

   print("Testing DG")
   local dg = DependencyGraph:new()
   dg:add({name = "foo"}, Set:new{"a", "b"}, Set:new{"b", "c"})
   dg:add({name = "bar"}, Set:new{"a", "c"}, Set:new{"c", "d"})
   dg:add({name = "baz"}, Set:new{"d", "e", "f"}, Set:new{"d"})
   dg:add({name = "quux"}, Set:new{"d", "c"}, nil)
   dg:add({name = "buzz"}, nil, Set:new{"e", "b"})
   util.printTable(dg)
   local sorted = dg:order()
   local names = {}
   for _, node in std.ipairs(sorted) do
      names[#names + 1] = node.name
   end
   util.printList(names)
end

return Pkg
