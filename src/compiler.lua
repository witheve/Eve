-- Imports / module wrapper
local Pkg = {}
local std = _G
local error = error
local print = print
local tostring = tostring
local getmetatable = getmetatable
local setmetatable = setmetatable
local string = string
local util = require("util")
local Set = require("set").Set
local parser = require("parser")
local color = require("color")
local build = require("build")
setfenv(1, Pkg)

local ENTITY_FIELD = parser.ENTITY_FIELD
local TAG_FIELD = "tag"
local EAV_TAG = "eav"

-- Utilities
local nothing = {}

function formatQueryNode(node, indent)
   indent = indent or 0
   local padding = string.rep("  ", indent)
   local result = padding .. node.type
   if node.type == "query" then
      result = result .. "<" .. (node.name or "unnamed") .. ">"
      if node.unpacked then
         result = result .. "{\n"
         for ix, guy in std.ipairs(node.unpacked) do
            result = result .. padding .. "  " .. ix .. ". " .. tostring(guy) .. ",\n"
         end
         result = result .. padding .. "}"
      elseif node.dependencyGraph then
         result = result .. tostring(node.dependencyGraph)
      end
   elseif node.type == "constant" then
     result = result .. node.constant
   elseif node.type == "variable" then
      result = result .. "<" .. (node.name or "unnamed") .. ">"
   elseif node.type == "binding" then
      result = result .. "{" .. tostring(node.field) .. " -> "
      if node.constant then
         result = result .. tostring(node.constant.constant)
      elseif node.variable then
         result = result .. formatQueryNode(node.variable)
      end
      return result .. "}"
   elseif node.type == "object" then
      result = result .. "{"
      for _, binding in std.ipairs(node.bindings) do
         result = result .. formatQueryNode(binding) .. ", "
      end
      return result .. "}"
   elseif node.type == "mutate" then
      result = result .. "<" .. node.operator .. ">{"
      for _, binding in std.ipairs(node.bindings) do
         result = result .. formatQueryNode(binding) .. ", "
      end
      return result .. "}"
   elseif node.type == "union" or node.type == "choose" then
      result = result .. "{\n"
      for _, query in std.ipairs(node.queries) do
         result = result .. formatQueryNode(query, 1) .. ",\n"
      end
      return result .. "}"
   end
   return result
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
   obj.dependents = obj.dependents or {} -- Sets of nodes depending on a term
   obj.strongDependents = obj.strongDependents or {} -- Sets of nodes strongly depending on (requiring stabilization of) a term
   obj.bound = obj.bound or Set:new() -- Set of terms bound by the currently ordered set of nodes
   obj.terms = obj.terms or Set:new() -- Set of all terms provided by any node in the graph
   obj.termGroups = obj.termGroups or Set:new() -- Set of sets of terms that are in some way joined

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

function DependencyGraph:isSorted()
   return self.unsorted:length() == 0
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

function DependencyGraph:addMutateNode(node)
   local produces = Set:new()
   local depends = Set:new()
   local weakDepends = Set:new()
   for _, binding in std.ipairs(node.bindings or nothing) do
      -- If the entity term isn't bound, the mutation produces it
      -- @FIXME: This is (incorrectly) insertion-order dependent, since any intended dependents of this entity
      -- that were inserted first will see that the term does not exist and not add a dependency on it.
      if binding.field == ENTITY_FIELD and not self.terms[binding.variable] then
         produces:add(binding.variable)
      end

      -- If the binding is bound on a variable that is produced in the query, it becomes a dependency of the query.
      if binding.variable then
         weakDepends:add(binding.variable)
      end
   end

   return self:add(node, depends, produces, weakDepends)
end

function DependencyGraph:addExpressionNode(node)
   -- TODO also need to consider projections and groupings as dependencies
   -- TODO handle productions other than just "return", this will require schemas
   local produces = Set:new()
   local depends = Set:new()
   for _, binding in std.ipairs(node.bindings) do
     if binding.field == "return" and binding.variable then
       produces:add(binding.variable)
     elseif binding.variable then
       depends:add(binding.variable)
     end
   end
   return self:add(node, depends, produces)
end

function DependencyGraph:addSubqueryNode(node)
   local provides = Set:new()
   local depends = Set:new()

   for _, var in std.pairs(node.outputs) do
     provides:add(var)
   end

   for _, body in std.ipairs(node.queries) do
      local subgraph = DependencyGraph:fromQueryGraph(body, self.terms:clone(), self.terms:clone())
      provides:union(subgraph:provided(), true)
      depends:union(subgraph:depends(), true)
   end
   return self:add(node, depends, provides)
end

function DependencyGraph:fromQueryGraph(query, terms, bound)
   local uniqueCounter = 0
   local dgraph = self
   if getmetatable(dgraph) ~= DependencyGraph then
      -- @FIXME: this naive injection strategy lets objects be scheduled willy-nilly after mutates...
      -- Not tracking this information is currently incidentally correct, but cannot be relied upon to order subqueries properly within their parents
      -- dgraph = self:new{terms = terms, bound = bound}
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

   for _, node in std.ipairs(query.objects or nothing) do
      dgraph:addObjectNode(node)
   end

   for _, node in std.ipairs(query.unions or nothing) do
      dgraph:addSubqueryNode(node)
   end

   for _, node in std.ipairs(query.chooses or nothing) do
      dgraph:addSubqueryNode(node)
   end

   -- If the ENTITY variable of this mutate isn't already bound and it's a child of another mutate,
   -- then we need to uniquify it to prevent unification with other mutates.
   for _, node in std.ipairs(query.mutates or nothing) do
      if not dgraph.terms[node.variable] then
         if node.parent and node.parent.type == "mutate" then
            local old = node.variable
            node.variable = util.shallowCopy(node.variable)
            node.variable.name = "$$tmp" .. "-" .. node.variable.name .. "-" .. uniqueCounter
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
      dgraph:addMutateNode(node)
   end

   return dgraph
end
-- depends are the set of terms that must be produced prior to scheduling this node
-- produces are the set of terms produced after this node has been scheduled
-- maybeDepends are the set of terms that, IFF produced in this query, become dependencies of this node
-- strongDepends are the set of terms that must be completely settled (cardinality-stable) prior to scheduling this node
-- @NOTE: that, in order to permit stable scheduling, weak and strong depends will not be treated as joining term groups
function DependencyGraph:add(node, depends, produces, maybeDepends, strongDepends)
   produces = produces or Set:new()
   depends = depends and depends:difference(produces, true) or Set:new()
   maybeDepends = maybeDepends and maybeDepends:difference(produces, true)or Set:new()
   strongDepends = strongDepends and strongDepends:difference(produces, true)or Set:new()

   node.depends = depends
   node.produces = produces
   node.maybeDepends = maybeDepends
   node.strongDepends = strongDepends

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
   for term in std.pairs(maybeDepends) do
      if getmetatable(term) == nil then
         setmetatable(term, DefaultNodeMeta)
      end
   end
   for term in std.pairs(strongDepends) do
      if getmetatable(term) == nil then
         setmetatable(term, DefaultNodeMeta)
      end
   end

   -- group new/updated terms, consolidating any newly joined groups
   local terms = Set:new()
   if produces then terms:union(produces, true) end
   if depends then terms:union(depends, true) end
   local groups = Set:new()
   local neueGroup = Set:new()
   for term in std.pairs(terms) do
      local grouped = false
      for group in std.pairs(self.termGroups) do
         if group[term] then
            groups:add(group)
            grouped = true
         end
      end
      if not grouped then
         neueGroup:add(term)
         groups:add(neueGroup)
      end
   end
   if groups:length() == 1 then
      for group in std.pairs(groups) do
         self.termGroups:add(group)
      end
   elseif groups:length() > 1 then
      for group in std.pairs(groups) do
         for term in std.pairs(group) do
            neueGroup:add(term)
         end
         self.termGroups:remove(group)
      end
      self.termGroups:add(neueGroup)
   end

   -- Link new maybe dependencies to existing terms
   if maybeDepends then
      for term in std.pairs(maybeDepends) do
         if self.terms[term] then
            strongDepends:add(term)
         end
      end
   end

   -- Link existing maybe dependencies to new terms
   for term in std.pairs(produces) do
      if self.strongDependents[term] == nil then
         self.strongDependents[term] = Set:new()
         for other in std.pairs(self.unsorted) do
            if other.maybeDepends[term] then
               other.strongDepends:add(term)
               self.strongDependents[term]:add(other)
               self.unsatisfied[other] = self.unsatisfied[other] + 1
            end
         end
      end
   end

   self.unsorted:add(node)
   self.unsatisfied[node] = 0
   if depends then
      if produces then
         depends:difference(produces, true)
      end

      -- Register this node as a dependent on all the terms it requires but cannot produce
      for term in std.pairs(depends) do
         if not self.bound[term] then
            if self.dependents[term] then
               self.dependents[term]:add(node)
            else
               self.dependents[term] = Set:new{node}
            end
            self.unsatisfied[node] = self.unsatisfied[node] + 1
         end
      end

      for term in std.pairs(strongDepends) do
         if not self.bound[term] then
            if self.strongDependents[term] then
               self.strongDependents[term]:add(node)
            else
               self.strongDependents[term] = Set:new{node}
            end
            self.unsatisfied[node] = self.unsatisfied[node] + 1
         end
      end
   end
end

function DependencyGraph:group(term) -- get the termGroup of the given term
   for group in std.pairs(self.termGroups) do
      if group[term] then
         return group
      end
   end
end

function DependencyGraph:groupUnsatisfied(group) -- get the number of  outstanding nodes that must be ordered before the group stabilizes
   local unsatisfied = 0
   for term in std.pairs(group) do
      if self.dependents[term] then
         unsatisfied = unsatisfied + self.dependents[term]:length()
      end
      for node in std.pairs(self.unsorted) do
         if node.produces[term] then
            unsatisfied = unsatisfied + 1
         end
      end
   end
   return unsatisfied
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

   while self.unsorted:length() > 0 do
      local scheduled = false
      for node in std.pairs(self.unsorted) do
         if self.unsatisfied[node] == 0 then
            if node.queries then
               for _, body in std.ipairs(node.queries) do
                  body.dependencyGraph:order()
               end
            end
            self.sorted[#self.sorted + 1] = node
            self.unsorted:remove(node)
            for term in std.pairs(node.depends) do
               self.dependents[term]:remove(node)
            end

            -- Decrement the unsatisfied term count for nodes depending on terms this node provides that haven't been provided
            if node.produces:length() > 0 then
               local someTerm
               for term in std.pairs(node.produces) do
                  someTerm = term
                  if self.dependents[term] and not self.bound[term] then
                     self.bound:add(term)
                     for dependent in std.pairs(self.dependents[term]) do
                        self.unsatisfied[dependent] = self.unsatisfied[dependent] - 1
                     end
                  end
               end

               -- Determine if the group containing the produced terms is stabilized by ordering this node
               -- If so, satisfy the strong dependencies of every term in the group
               local group = self:group(someTerm)
               if self:groupUnsatisfied(group) == 0 then
                  for term in std.pairs(group) do
                     if self.strongDependents[term] then
                        for dependent in std.pairs(self.strongDependents[term]) do
                           self.unsatisfied[dependent] = self.unsatisfied[dependent] - 1
                        end
                     end
                  end
               end
            end
            scheduled = true
            break
         end
      end
      if not scheduled and not allowPartial then
         print("-----ERROR----")
         print(tostring(self))
         print("--------------")
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
      local depends = tostring(node.depends)
      if node.strongDepends:length() > 0 then
         depends = depends .. "|" .. tostring(node.strongDepends)
      end
      result = result .. "  " .. ix .. ": " .. depends .. " -> " .. tostring(node.produces) .. "\n"
      result = result .. "    " .. util.indentString(1, tostring(node)) .. "\n"
   end
   for node in std.pairs(obj.unsorted) do
      local depends = tostring(node.depends)
      if node.strongDepends:length() > 0 then
         depends = depends .. "|" .. tostring(node.strongDepends)
      end
      result = result .. "  ?: " .. depends .. " -> " .. tostring(node.produces) .. "\n"
      result = result .. "   ? " .. util.indentString(1, tostring(node)) .. "\n"
   end
   result = result .. tostring(obj.termGroups) .. "\n"
   return result .. "}"
end


ScanNode = {}
function ScanNode:new(obj)
   obj = obj or {}
   setmetatable(obj, self)
   self.__index = self
   return obj
end

function ScanNode:fromObject(source)
   local obj = self
   if getmetatable(obj) ~= ScanNode then
      obj = self:new()
   end
   obj.source = source
   obj.type = source.type
   obj.scope = source.scope
   obj.operator = source.operator
   for _, binding in std.ipairs(source.bindings) do
      obj[binding.field] = binding.variable or binding.constant
   end
   return obj
end

function ScanNode:fromBinding(source, binding, entity)
   local obj = self
   if getmetatable(obj) ~= ScanNode then
      obj = self:new()
   end
   obj.source = source
   obj.type = source.type
   obj.operator = source.operator
   obj.scope = source.scope
   obj.entity = entity
   obj.attribute = binding.field
   obj.value = binding.variable or binding.constant
   return obj
end

function ScanNode.__tostring(obj)
   local operator = ""
   if obj.operator then
      operator = "operator: " .. tostring(obj.operator) .. ", "
   end
   if obj.scope then
      operator = operator .. "scope: " .. tostring(obj.scope) .. ", "
   end
   -- FIXME: I couldn't figure out how to get constants to print correctly
   -- through whatever magical printing mechanism is going on here
   local value = obj.value
   if value.type == "constant" then
     value = value.constant
   end
   return "ScanNode{type: " .. tostring(obj.type) .. ", " .. operator ..
      "entity: " .. tostring(obj.entity) ..
      ", attribute: " .. tostring(obj.attribute) ..
      ", value: " .. tostring(value) .. "}"
end

SubprojectNode = {}
function SubprojectNode:new(obj)
   obj = obj or {}
   obj.type = obj.type or "subproject"
   obj.projection = obj.projection or Set:new()
   obj.nodes = obj.nodes or {}
   setmetatable(obj, self)
   self.__index = self
   return obj
end

function SubprojectNode.__tostring(obj)
   local result = "SubprojectNode " .. tostring(obj.projection) .. " -> " .. tostring(obj.produces) .. " {\n"

   for _, node in std.pairs(obj.nodes) do
      result = result .. "  " .. tostring(node.depends) .. " -> " .. tostring(node.produces) .. "\n"
      result = result .. "    " .. tostring(node) .. "\n"
   end

   return result .. "}"
end


function isEAVNode(node)
   for _, binding in std.ipairs(node.bindings) do
      if binding.field == TAG_FIELD and binding.constant and binding.constant.constant == EAV_TAG then
         return true
      end
   end
   return false
end

function unpackObjects(nodes)
   local unpacked = {}
   local unpackedSubprojects = {}
   local ix = 1
   local tmpCounter = 0
   for _, node in std.ipairs(nodes) do
      if node.type == "object" or node.type == "mutate" then
         local unpackList = unpacked
         if node.type ~= "object" then
            local projection = Set:new()
            for ix, proj in std.pairs(node.projection) do
               projection:union(proj, true)
            end

            local subproject = SubprojectNode:new{projection = projection, produces = node.produces}
            unpackList = subproject.nodes
            unpackedSubprojects[#unpackedSubprojects + 1] = subproject
         end

         if isEAVNode(node) then
            unpackList[#unpackList + 1] = ScanNode:fromObject(node)
         else
            local entity
            for _, binding in std.ipairs(node.bindings) do
               if binding.field == ENTITY_FIELD then
                  entity = binding.variable or binding.constant
               end
            end
            -- Even if the entity isn't used by the user, we still need to create it to unify the exploded scans
            if not entity then
               local tmpName = "$$tmp-entity-" .. tmpCounter
               tmpCounter = tmpCounter + 1
               entity = {type = "variable", query = node.query, parent = node.query, children = {}, line = node.line, offset = node.offset, name = tmpName}
               setmetatable(entity, DefaultNodeMeta)
               node.query.variables[#node.query.variables] = entity
            end

            for _, binding in std.ipairs(node.bindings) do
               if binding.field ~= ENTITY_FIELD then
                  unpackList[#unpackList + 1] = ScanNode:fromBinding(node, binding, entity)
               end
            end
         end
      else
         if node.type == "union" or node.type == "choose" then
            for _, query in std.ipairs(node.queries) do
               query.unpacked = unpackObjects(query.dependencyGraph:order())
            end
         end
         unpacked[ix] = node
         ix = ix + 1
      end
   end

   for _, node in std.ipairs(unpackedSubprojects) do
     unpacked[#unpacked + 1] = node
   end

   return unpacked
end

function compileExec(contents, tracing)
   local parseGraph = parser.parseString(contents)
   local set = {}

   for ix, queryGraph in std.ipairs(parseGraph.children) do
      local dependencyGraph = DependencyGraph:fromQueryGraph(queryGraph)
      local sorted = dependencyGraph:order()
      local unpacked = unpackObjects(sorted)
      -- this handler function is just for debugging, we no longer have
      -- an 'execution return'
      set[#set+1] = unpacked
   end
   return build.build(set, tracing)
end

function analyze(content)
   local parseGraph = parser.parseString(content)
   print("--- Parse Graph ---")
   print(parser.formatQueryGraph(parseGraph))

   for ix, queryGraph in std.ipairs(parseGraph.children) do
      print("--- Query Graph (" .. ix .. ") " .. queryGraph.name .. " ---")

      print(" -- Unsorted DGraph --")
      local dependencyGraph = DependencyGraph:fromQueryGraph(queryGraph)
      print(dependencyGraph)

      print(" -- Sorted DGraph --")
      local sorted = dependencyGraph:order()
      print(dependencyGraph)

      print(" -- Unpacked Objects / Mutates --")
      local unpacked = unpackObjects(sorted)
      print("{")
      for ix, node in std.ipairs(unpacked) do
         print("  " .. ix .. ". " .. util.indentString(1, tostring(node)))
      end
      print("}")
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
