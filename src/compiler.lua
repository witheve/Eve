-- Imports / module wrapper
local Pkg = {}
local std = _G
local error = error
local print = print
local tostring = tostring
local getmetatable = getmetatable
local setmetatable = setmetatable
local util = require("util")
local Set = require("set").Set
local parser = require("parser")
setfenv(1, Pkg)

local ENTITY_FIELD = parser.ENTITY_FIELD

-- Utilities
local nothing = {}

function formatQueryNode(node)
   if node.type == "query" or
      node.type == "variable" then
         return node.type .. "<" .. node.name .. ">"
   elseif node.type == "binding" then
      local result = node.type .. "{" .. tostring(node.field) .. " -> "
      if node.constant then
         result = result .. tostring(node.constant)
      elseif node.variable then
         result = result .. formatQueryNode(node.variable)
      end
      return result .. "}"
   elseif node.type == "object" then
      local result = node.type .. "{"
      for _, binding in std.ipairs(node.bindings) do
         result = result .. formatQueryNode(binding) .. ", "
      end
      return result .. "}"
   elseif node.type == "mutate" then
      local result = node.type .. "<" .. node.operator .. ">{"
      for _, binding in std.ipairs(node.bindings) do
         result = result .. formatQueryNode(binding) .. ", "
      end
      return result .. "}"
   end
   return "unknown " .. node.type
end

local DefaultNodeMeta = {}
DefaultNodeMeta.__tostring = formatQueryNode

-- Dependency Graph

DependencyGraph = {}

function DependencyGraph:new(obj)
   obj = obj or {}
   -- Essential state
   obj.unsorted = obj.unsorted or Set:new() -- set of nodes that need to be ordered
   obj.sorted = obj.sorted or {} -- append-only set of ordered nodes


   obj.unsatisfied = obj.unsatisfied or {} -- Number of terms required but not bound per node
   obj.dependents = obj.dependents or {} -- Set of terms required per node
   obj.bound = obj.bound or Set:new() -- Set of terms bound by the currently ordered set of nodes
   obj.terms = obj.terms or Set:new() -- Set of all terms provided by any node in the graph

   setmetatable(obj, self)
   self.__index = self
   return obj
end

-- Get the variables this dgraph depends on for reification
function DependencyGraph:depends()
   local depends = Set:new()
   for term in std.pairs(self.dependents) do
      depends:add(term)
   end
   return depends / self.bound
end

function DependencyGraph:provided()
   return self.bound
end

function DependencyGraph:addObjectNode(node)
   local produces = Set:new()
   local depends = Set:new()
   for _, binding in std.ipairs(node.bindings or nothing) do
      if binding.variable then
         produces:add(binding.variable)
         depends:add(binding.variable)
      end
   end
   return self:add(node, depends, produces)
end

function DependencyGraph:addMutateNode(node, isBound)
   local produces = Set:new()
   local depends = Set:new()
   for _, binding in std.ipairs(node.bindings or nothing) do
      if binding.field == ENTITY_FIELD and not isBound then
         produces:add(binding.variable)
      end

      if binding.variable then
         depends:add(binding.variable)
      end
   end
   return self:add(node, depends, produces)
end

function DependencyGraph:addExpressionNode(node)
   error("@FIXME: Cannot determine expression production/dependencies without schema support")
   -- also need to consider projections and groupings as dependencies
end

function DependencyGraph:addSubqueryNode(node)
   local provides = Set:new()
   local depends = Set:new()
   for _, body in std.ipairs(node.queries) do
      local subgraph = DependencyGraph:fromQueryGraph(body)
      provides.union(subgraph:provides(), true)
      depends.union(subgraph:depends(), true)
   end
   return self:add(node, depends, provides)
end

function DependencyGraph:fromQueryGraph(query)
   local uniqueCounter = 0
   local dgraph = self
   if getmetatable(dgraph) ~= DependencyGraph then
      dgraph = self:new()
   end
   dgraph.query = query
   query.dependencyGraph = dgraph

   for _, node in std.ipairs(query.expressions or nothing) do
      dgraph:addExpressionNode(node)
   end

   for _, node in std.ipairs(query.nots or nothing) do
      dgraph:addSubqueryNode(node)
   end

   for _, node in std.ipairs(query.unions or nothing) do
      dgraph.addSubqueryNode(node)
   end

   for _, node in std.ipairs(query.chooses or nothing) do
      dgraph:addSubqueryNode(node)
   end

   for _, node in std.ipairs(query.objects or nothing) do
      dgraph:addObjectNode(node)
   end

   -- If the ENTITY variable of this mutate isn't already bound and it's a child of another mutate,
   -- then we need to uniquify it to prevent unification with other mutates.
   for _, node in std.ipairs(query.mutates or nothing) do
      if not dgraph.terms[node.variable] then
         if node.parent and node.parent.type == "mutate" then
            local old = node.variable
            node.variable = util.shallowCopy(node.variable)
            node.variable.name = "$$tmp" .. uniqueCounter .. "-" .. node.variable.name
            uniqueCounter = uniqueCounter + 1
            for _, binding in std.pairs(node.bindings) do
               if binding.type == "binding" and binding.variable == old then
                  binding.variable = node.variable
               end
            end
            local parent = node.parent
            for _, binding in std.pairs(parent.bindings) do
               if binding.type == "binding" and binding.variable == old then
                  binding.variable = node.variable
               end
            end
         end
      end
   end

   for _, node in std.ipairs(query.mutates or nothing) do
      dgraph:addMutateNode(node, node.variable and dgraph.terms[node.variable])
   end

   return dgraph
end

function DependencyGraph:add(node, depends, produces)
   depends = depends or node.depends or Set:new()
   produces = produces or node.produces or Set:new()
   self.terms:union(produces, true)

   if getmetatable(node) == nil then
      setmetatable(node, DefaultNodeMeta)
   end
   for term in std.pairs(depends) do
      if getmetatable(term) == nil then
         setmetatable(term, DefaultNodeMeta)
      end
   end
   for term in std.pairs(produces) do
      if getmetatable(term) == nil then
         setmetatable(term, DefaultNodeMeta)
      end
   end

   self.unsorted:add(node)
   self.unsatisfied[node] = 0
   node.produces = produces
   if depends then
      local requires = depends
      if produces then
         requires = depends / produces
      end
      node.requires = requires
      -- Register this node as a dependent on all the terms it requires but cannot produce
      for term in std.pairs(requires) do
         if not self.bound[term] then
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

function DependencyGraph:order(allowPartial)
   --[[
     The is naive ordering rules out a subset of valid subgraph embeddings that depend upon parent term production.
      The easy solution to fix this is to iteratively fix point the parent and child graphs until ordering is finished or
      or no new productions are possible.
      E.g.:
      1. a -> a
      2. f -> b
      3. subquery
        i.   a -> b
        ii.  b -> a
        iii. a, b -> f
   ]]--

   while #self.unsorted > 0 do
      local scheduled = false
      for node in std.pairs(self.unsorted) do
         if self.unsatisfied[node] == 0 then
            if node.queries then
               for _, body in std.ipairs(node.queries) do
                  body.dependencyGraph.order()
               end
            end
            self.sorted[#self.sorted + 1] = node
            self.unsorted:remove(node)

            -- Decrement the unsatisfied term count for nodes depending on terms this node provides that haven't been provided
            if node.produces then
               for term in std.pairs(node.produces) do
                  if self.dependents[term] and not self.bound[term] then
                     self.bound:add(term)
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
      if not scheduled and not allowPartial then
         error("Unable to find a valid dependency ordering for the given graph, aborting")
      elseif not scheduled then
         break
      end
   end
   return self.sorted, #self.unsorted > 0
end

function DependencyGraph.__tostring(obj)
   local result = "DependencyGraph{\n"
   for ix, node in std.ipairs(obj.sorted) do
      result = result .. "  " .. ix .. ": " .. tostring(node.requires) .. " -> " .. tostring(node.produces) .. "\n"
      result = result .. "    " .. tostring(node) .. "\n"
   end
   for node in std.pairs(obj.unsorted) do
      result = result .. "  ?: " .. tostring(node.requires) .. " -> " .. tostring(node.produces) .. "\n"
      result = result .. "    " .. tostring(node) .. "\n"
   end
   return result .. "}"
end

function analyze(args)
   local file = args[2]
   local parseGraph = parser.parseFile(file)
   print("--- Parse Graph ---")
   print(parser.formatGraph(parseGraph))

   for ix, queryGraph in std.ipairs(parseGraph.children) do
      print("--- Query Graph (" .. ix .. ") " .. queryGraph.name .. " ---")

      print(" -- Unsorted DGraph --")
      local dependencyGraph = DependencyGraph:fromQueryGraph(queryGraph)
      print(dependencyGraph)

      print(" -- Sorted DGraph --")
      dependencyGraph:order()
      print(dependencyGraph)
   end
end


if ... == nil then
   local testTable = {a = 5, b = "z", c = {d = {}}}
   print("Testing printTable")
   util.printTable(testTable)

   local Node = {}
   function Node:new(obj)
      setmetatable(obj, self)
      self.__index = self
      return obj
   end
   function Node.__tostring(obj)
      return "Table<" .. obj.name .. ">{}"
   end

   print("Testing DG")
   local dg = DependencyGraph:new()
   dg:add(Node:new{name = "foo"}, Set:new{"b", "c"}, Set:new{"a", "b"})
   dg:add(Node:new{name = "bar"}, Set:new{"c", "d"}, Set:new{"a", "c"})
   dg:add(Node:new{name = "baz"}, Set:new{"d"}, Set:new{"d", "e", "f"})
   dg:add(Node:new{name = "quux"}, nil, Set:new{"d", "c"})
   dg:add(Node:new{name = "buzz"}, Set:new{"e", "b"}, nil)
   print("Unsorted 1")
   print(dg)
   local sorted = dg:order()
   print("Sorted 1")
   print(dg)
   util.printList(sorted)

   print("\nPartial sort")
   dg = DependencyGraph:new()
   dg:add(Node:new{name = "foo"}, Set:new{"b", "z"}, Set:new{"a", "b"})
   dg:add(Node:new{name = "bar"}, Set:new{"c", "d"}, Set:new{"a", "c"})
   dg:add(Node:new{name = "baz"}, Set:new{"d"}, Set:new{"d", "e", "f"})
   dg:add(Node:new{name = "quux"}, nil, Set:new{"d", "c"})
   dg:add(Node:new{name = "buzz"}, Set:new{"e", "b"}, nil)
   dg:order(true)
   print(dg)
end

return Pkg
