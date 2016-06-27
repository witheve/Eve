-- Imports / module wrapper
local Pkg = {}
local std = _G
local error = error
local print = print
local pairs = pairs
local ipairs = ipairs
local type = type
local tostring = tostring
local getmetatable = getmetatable
local setmetatable = setmetatable
local string = string
local util = require("util")
local Set = require("set").Set
local parser = require("parser")
local color = require("color")
local db = require("db")
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
    elseif node.deps and node.deps.graph then
      result = result .. tostring(node.deps.graph)
    end
  elseif node.type == "constant" then
    result = result .. "<" .. node.constant .. ">"
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
  elseif node.type == "union" or node.type == "choose" or node.type == "not" then
    result = result .. "{\n"
    for _, query in std.ipairs(node.queries) do
      result = result .. formatQueryNode(query, 1) .. ",\n"
    end
    return result .. "}"
  elseif node.type == "expression" then
    result = result .. " " .. node.operator .. "("
    for _, binding in std.ipairs(node.bindings) do
      result = result .. binding.field .. " = " .. formatQueryNode(binding.variable or binding.constant) .. ", "
    end
    result = string.sub(result, 1, -3) .. ")"
  end
  return result
end

local DefaultNodeMeta = {}
DefaultNodeMeta.__tostring = formatQueryNode

local function applyDefaultMeta(_, node)
  if type(node) == "table" and node.type and getmetatable(node) == nil then
    setmetatable(node, DefaultNodeMeta)
  end
end

-- Dependency Graph
DependencyGraph = {}

function DependencyGraph:new(obj)
  obj = obj or {}
  -- Essential state
  obj.unprepared = obj.unprepared or Set:new() -- set of nodes that must still be prepared prior to ordering
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
  self:order(true)
  local depends = Set:new()
  for node in pairs(self.unprepared + self.unsorted) do
    depends:add(node.deps.depends + node.deps.anyDepends + node.deps.maybeDepends + node.deps.strongDepends)
  end
  for _, node in ipairs(self.sorted) do
    depends:union(node.deps.depends + node.deps.anyDepends + node.deps.maybeDepends + node.deps.strongDepends, true)
  end
  return depends
end

function DependencyGraph:provides()
  self:order(true)
  return self.bound
end

function DependencyGraph:isOrdered()
  return self.unsorted:length() == 0
end

function DependencyGraph:addObjectNode(node)
  local deps = {provides = Set:new()}
  node.deps = deps
  for _, binding in ipairs(node.bindings or nothing) do
    if binding.variable then
      deps.provides:add(binding.variable)
    end
  end
  return self:add(node)
end

function DependencyGraph:addMutateNode(node)
  local deps = {
    maybeProvides = Set:new(),
    depends = Set:new(),
    maybeDepends = Set:new()
  }
  node.deps = deps
  for _, binding in ipairs(node.bindings or nothing) do
    -- If the entity term isn't bound, the mutation provides it
    -- If the binding is bound on a variable that is provided in the query, it becomes a dependency of the variable.
    if binding.variable then
      if binding.field == ENTITY_FIELD then
        deps.maybeProvides:add(binding.variable)
      end
      deps.maybeDepends:add(binding.variable)
    end
  end
  return self:add(node)
end

function DependencyGraph:addExpressionNode(node)
  -- TODO also need to consider projections and groupings as dependencies
  -- TODO handle productions other than just "return", this will require schemas
  local deps = {
    provides = Set:new(),
    maybeProvides = Set:new(),
    depends = Set:new(),
    anyDepends = Set:new(),
    weakDepends = Set:new()
  }
  node.deps = deps

  local args = {}
  for _, binding in ipairs(node.bindings) do
    args[binding.field] = binding.variable or binding.constant
  end

  if node.operator == "=" and not args["return"] then
    if args.a.type == "constant" and args.b.type == "constant" then
      -- no deps, no provides
    elseif args.a.type == "constant" then
      deps.provides:add(b)
    elseif args.b.type == "constant" then
      deps.provides:add(a)
    else
      deps.provides:add(args.a)
      deps.anyDepends:add(args.a)
      deps.provides:add(args.b)
      deps.anyDepends:add(args.b)
    end
  else
    local schemas = db.getSchemas(node.operator)
    local pattern = util.shallowCopy(schemas[1].signature)
    for _, schema in ipairs(schemas) do
      for field in pairs(schema.signature) do
        if pattern[field] ~= schema.signature[field] then
          pattern[field] = db.OPT
        end
      end
    end

    for field in pairs(pattern) do
      if args[field] and args[field].type ~= "constant" then
        if pattern[field] == db.IN then
          deps.depends:add(args[field])
        elseif pattern[field] == db.OUT then
          deps.provides:add(args[field])
        else
          deps.maybeProvides:add(args[field])
          deps.weakDepends:add(args[field])
        end
      end
    end
  end

  return self:add(node)
end

function DependencyGraph:addSubqueryNode(node)
  local deps = {
    provides = Set:new(),
    maybeDepends = Set:new()
  }
  node.deps = deps

  if node.outputs then
    for _, var in std.pairs(node.outputs) do
      deps.provides:add(var)
    end
  end

  for _, body in std.ipairs(node.queries) do
    local subgraph = DependencyGraph:fromQueryGraph(body)
    deps.maybeDepends:union(subgraph:depends(), true)
  end
  return self:add(node)
end

function DependencyGraph:fromQueryGraph(query, terms, bound)
  local uniqueCounter = 0
  local dgraph = self
  if getmetatable(dgraph) ~= DependencyGraph then
    dgraph = self:new()
  end
  dgraph.query = query
  query.deps = {graph = dgraph}

  util.walk(query, applyDefaultMeta)

  for _, node in std.ipairs(query.expressions or nothing) do
    dgraph:addExpressionNode(node)
  end
  for _, node in std.ipairs(query.objects or nothing) do
    dgraph:addObjectNode(node)
  end
  for _, node in std.ipairs(query.nots or nothing) do
    dgraph:addSubqueryNode(node)
  end
  for _, node in std.ipairs(query.unions or nothing) do
    dgraph:addSubqueryNode(node)
  end
  for _, node in std.ipairs(query.chooses or nothing) do
    dgraph:addSubqueryNode(node)
  end
  for _, node in std.ipairs(query.mutates or nothing) do
    dgraph:addMutateNode(node)
  end

  return dgraph
end
-- provides are the set of terms provided after this node has been scheduled
-- maybeProvides are the set of terms that, IFF provided in this query, become dependencies of this node
-- depends are the set of terms that must be provided prior to scheduling this node
-- maybeDepends are the set of terms that, IFF provided in this query, become dependencies of this node
-- strongDepends are the set of terms that must be completely settled (cardinality-stable) prior to scheduling this node
-- anyDepends are the set of terms that, if any single term is satisfied, are all satisfied as a set
-- @NOTE: that, in order to permit stable scheduling, maybe and strong depends will not be treated as joining term groups
function DependencyGraph:add(node)
  node.deps = node.deps or {}
  local deps = node.deps
  deps.provides = deps.provides or Set:new()
  deps.maybeProvides = deps.maybeProvides or Set:new()
  deps.depends = deps.depends or Set:new()
  deps.weakDepends = deps.weakDepends or Set:new()
  deps.maybeDepends = deps.maybeDepends or Set:new()
  deps.strongDepends = deps.strongDepends or Set:new()
  deps.anyDepends = deps.anyDepends or Set:new()

  self.unprepared:add(node)
end

function DependencyGraph:prepare() -- prepares a completed graph for ordering
  -- Link new maybe provides if no other nodes provide them
  for node in pairs(self.unprepared) do
    for term in pairs(node.deps.maybeProvides) do
      if not self.terms[term] then
        node.deps.provides:add(term)
      end
    end
  end

  -- Add newly provided terms to the DG's terms
  local neueTerms = Set:new()
  for node in pairs(self.unprepared) do
    neueTerms:union(node.deps.provides + node.deps.maybeProvides, true)
  end
  self.terms:union(neueTerms, true)

  -- Link new maybe dependencies to existing terms
  for node in pairs(self.unprepared) do
    for term in pairs(node.deps.maybeDepends) do
      if self.terms[term] and not node.deps.provides[term] then
        node.deps.strongDepends:add(term)
      end
    end

    for term in pairs(node.deps.weakDepends) do
      if self.terms[term] and not node.deps.provides[term] then
        node.deps.depends:add(term)
      end
    end
  end

  -- Link existing maybe dependencies to new terms
  for term in std.pairs(neueTerms) do
    if self.strongDependents[term] == nil then
      self.strongDependents[term] = Set:new()
      for node in pairs(self.unsorted) do
        if node.deps.maybeDepends[term] then
          self.strongDependents[term]:add(node)
          node.deps.strongDepends:add(term)
          node.deps.unsatisfied = node.deps.unsatisfied + 1
        end
      end
    end

    if self.dependents[term] == nil then
      self.dependents[term] = Set:new()
      for node in pairs(self.unsorted) do
        if node.deps.weakDepends[term] then
          self.dependents[term]:add(node)
          node.deps.depends:add(term)
          node.deps.unsatisfied = node.deps.unsatisfied + 1
        end
      end
    end
  end

  -- Trim dependencies on terms the node expects to provide and unused maybes
  for node in pairs(self.unprepared) do
    local deps = node.deps
    deps.depends:difference(deps.provides, true)
    deps.strongDepends:difference(deps.provides, true)
    deps.maybeDepends = Set:new()
    deps.maybeProvides = Set:new()
  end

  -- Group terms and consolidate with existing term groups
  -- These are grouped into "cardinality islands", in which cardinality can be guaranteed to be stable
  -- once all terms in the group have been maximally joined/filtered
  for node in pairs(self.unprepared) do
    local deps = node.deps
    local terms = deps.provides + deps.depends + deps.anyDepends
    local groups = Set:new()
    local neueGroup = Set:new()
    for term in pairs(terms) do
      local grouped = false
      for group in pairs(self.termGroups) do
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
      for group in pairs(groups) do
        self.termGroups:add(group)
      end
    elseif groups:length() > 1 then
      for group in pairs(groups) do
        for term in pairs(group) do
          neueGroup:add(term)
        end
        self.termGroups:remove(group)
      end
      self.termGroups:add(neueGroup)
    end
  end

  -- Register new nodes as a dependent on all the terms they require but cannot provide
  -- Move new nodes into unsorted
  for node in pairs(self.unprepared) do
    node.deps.unsatisfied = 0
    self.unprepared:remove(node)
    self.unsorted:add(node)

    local deps = node.deps
    for term in pairs(deps.depends) do
      if not self.bound[term] then
        if self.dependents[term] then
          self.dependents[term]:add(node)
        else
          self.dependents[term] = Set:new{node}
        end
        deps.unsatisfied = deps.unsatisfied + 1
      end
    end

    for term in pairs(deps.strongDepends) do
      if not self.bound[term] then
        if self.strongDependents[term] then
          self.strongDependents[term]:add(node)
        else
          self.strongDependents[term] = Set:new{node}
        end
        deps.unsatisfied = deps.unsatisfied + 1
      end
    end

    local anyBound = false
    for term in std.pairs(deps.anyDepends) do
      if self.bound[term] then
        anyBound = true
        break
      end
    end
    if not anyBound then
      if deps.anyDepends:length() > 0 then
        deps.unsatisfied = deps.unsatisfied + 1
      end

      for term in pairs(deps.anyDepends) do
        if self.dependents[term] then
          self.dependents[term]:add(node)
        else
          self.dependents[term] = Set:new{node}
        end
      end
    end
  end
end

function DependencyGraph:group(term) -- get the termGroup of the given term
  for group in pairs(self.termGroups) do
    if group[term] then
      return group
    end
  end
end

function DependencyGraph:groupUnsatisfied(group) -- get the number of  outstanding nodes that must be ordered before the group stabilizes
  local unsatisfied = 0
  for term in pairs(group) do
    if self.dependents[term] then
      unsatisfied = unsatisfied + self.dependents[term]:length()
    end
    for node in pairs(self.unsorted) do
      if node.deps.provides[term] then
        unsatisfied = unsatisfied + 1
      end
    end
  end
  return unsatisfied
end

function DependencyGraph:order(allowPartial)
  -- The is naive ordering rules out a subset of valid subgraph embeddings that depend upon parent term production.
  -- The easy solution to fix this is to iteratively fix point the parent and child graphs until ordering is finished or
  -- or no new productions are possible.
  -- E.g.:
  -- 1. a -> a
  -- 2. f -> b
  -- 3. subquery
  --   i.   a -> b
  --   ii.  b -> a
  --   iii. a, b -> f
  self:prepare()
  while self.unsorted:length() > 0 do
    local scheduled = false
    for node in pairs(self.unsorted) do
      local deps = node.deps
      if deps.unsatisfied == 0 then
        self.sorted[#self.sorted + 1] = node
        self.unsorted:remove(node)

        -- order child graphs, if any
        if node.queries then
          for _, body in ipairs(node.queries) do
            body.deps.graph:order()
          end
        elseif deps.graph then
          deps.graph:order()
        end

        -- clean dependency hooks
        for term in pairs(deps.depends + deps.anyDepends) do
          self.dependents[term]:remove(node)
        end

        -- Decrement the unsatisfied term count for nodes depending on terms this node provides that haven't been provided
        if deps.provides:length() > 0 then
          local someTerm
          for term in pairs(deps.provides) do
            someTerm = term
            if self.dependents[term] and not self.bound[term] then
              self.bound:add(term)
              for dependent in pairs(self.dependents[term]) do
                local deps = dependent.deps
                if deps.unsatisfied > 0 then
                  deps.unsatisfied = deps.unsatisfied - 1
                end
              end
            end
          end

          -- Determine if the group containing the provided terms is stabilized by ordering this node
          -- If so, satisfy the strong dependencies of every term in the group
          local group = self:group(someTerm)
          if self:groupUnsatisfied(group) == 0 then
            for term in pairs(group) do
              if self.strongDependents[term] then
                for dependent in pairs(self.strongDependents[term]) do
                  local deps = dependent.deps
                  deps.unsatisfied = deps.unsatisfied - 1
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

function fmtDepNode(node)
  if not node.deps then error(std.debug.traceback()) end
  local deps = node.deps
  local result = tostring(deps.depends)
  if deps.strongDepends:length() > 0 then
    result = result .. "|STRONG:" .. tostring(deps.strongDepends)
  end
  if deps.maybeDepends:length() > 0 then
    result = result .. "|MAYBE:" .. tostring(deps.maybeDepends)
  end
  if deps.anyDepends:length() > 0 then
    result = result .. "|ANY:" .. tostring(deps.anyDepends)
  end
  result = result .. " -> "
  result = result .. tostring(node.deps.provides)
  if deps.maybeProvides:length() > 0 then
    result = result .. "|MAYBE:" .. tostring(deps.maybeProvides)
  end
  result = result .. "\n  " .. util.indentString(1, tostring(node))
  return result
end

function DependencyGraph.__tostring(dg)
  local result = "DependencyGraph{"
  if dg.unprepared:length() > 0 then
    for node in pairs(dg.unprepared) do
      result = string.format("%s\n   X: %s", result, util.indentString(2, fmtDepNode(node)))
    end
  end
  if #dg.sorted > 0 then
    for ix, node in ipairs(dg.sorted) do
      result = string.format("%s\n  %2d: %s", result, ix, util.indentString(2, fmtDepNode(node)))
    end
  end
  if dg.unsorted:length() > 0 then
    for node in pairs(dg.unsorted) do
      result = string.format("%s\n   ?: %s", result, util.indentString(2, fmtDepNode(node)))
    end
  end
  if dg.termGroups:length() > 0 then
    result = result .. "\n  -- term groups -- "
    for group in pairs(dg.termGroups) do
      result = result .. "\n  " .. tostring(group) .. ": " .. dg:groupUnsatisfied(group)
    end
  end
  return result .. "\n}"
end


ScanNode = {}
function ScanNode:new(obj)
  obj = obj or {}
  setmetatable(obj, self)
  self.__index = self
  return obj
end

function ScanNode:fromObject(source, context)
  local obj = self
  if getmetatable(obj) ~= ScanNode then
    obj = self:new()
  end
  obj.id = util.generateId()
  if source.id then
    context.downEdges[#context.downEdges + 1] = {source.id, obj.id}
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

function ScanNode:fromBinding(source, binding, entity, context)
  local obj = self
  if getmetatable(obj) ~= ScanNode then
    obj = self:new()
  end
  obj.id = util.generateId()
  if binding.id then
    context.downEdges[#context.downEdges + 1] = {binding.id, obj.id}
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
function SubprojectNode:new(obj, source, context)
  obj = obj or {}
  obj.id = util.generateId()
  if source.id then
    context.downEdges[#context.downEdges + 1] = {source.id, obj.id}
  end
  obj.type = obj.type or "subproject"
  obj.projection = obj.projection or Set:new()
  obj.provides = obj.provides or Set:new()
  obj.nodes = obj.nodes or {}
  setmetatable(obj, self)
  self.__index = self
  return obj
end

function SubprojectNode.__tostring(obj)
  local result = "SubprojectNode " .. tostring(obj.projection) .. " -> " .. tostring(obj.provides) .. " {"
  for _, node in ipairs(obj.nodes) do
    result = result .. "\n  " .. util.indentString(2, tostring(node))
  end
  if #obj.nodes > 0 then
    result = result .. "\n"
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

function unpackObjects(dg, context)
  local unpacked = {}
  local tmpCounter = 0
  dg:order()
  for _, node in ipairs(dg.sorted) do
    if node.type == "object" or node.type == "mutate" then
      local unpackList = unpacked
      local subproject
      if node.type ~= "object" then
        local projection = Set:new()
        for _, binding in ipairs(node.bindings or nothing) do
          if binding.field == ENTITY_FIELD and not node.deps.provides[binding.variable] then
            projection:add(binding.variable)
            break
          end
        end
        for ix, proj in pairs(node.projection) do
          projection:union(proj, true)
        end

        subproject = SubprojectNode:new({projection = projection, provides = node.deps.provides}, node, context)
        unpackList = subproject.nodes
        unpacked[#unpacked + 1] = subproject
      end

      if isEAVNode(node) then
        unpackList[#unpackList + 1] = ScanNode:fromObject(node, context)
      else
        local entity
        for _, binding in ipairs(node.bindings) do
          if binding.field == ENTITY_FIELD then
            entity = binding.variable or binding.constant
          end
        end

        for _, binding in ipairs(node.bindings) do
          if binding.field ~= ENTITY_FIELD then
            if subproject and binding.variable and not subproject.projection[binding.variable] then
              subproject.provides:add(entity)
              unpacked[#unpacked + 1] = SubprojectNode:new({projection = subproject.projection + Set:new{entity, binding.variable}, nodes = {ScanNode:fromBinding(node, binding, entity, context)}}, binding, context)
            else
              unpackList[#unpackList + 1] = ScanNode:fromBinding(node, binding, entity, context)
            end

          end
        end
      end
    else
      if node.type == "union" or node.type == "choose" or node.type == "not" then
        for _, query in ipairs(node.queries) do
          unpackObjects(query.deps.graph, context)
        end
      end
      unpacked[#unpacked + 1] = node
    end
  end

  dg.query.unpacked = unpacked
  return unpacked
end

function compileExec(contents, tracing)
  local parseGraph = parser.parseString(contents)
  local set = {}

  for ix, queryGraph in ipairs(parseGraph.children) do
    local dependencyGraph = DependencyGraph:fromQueryGraph(queryGraph)
    local unpacked = unpackObjects(dependencyGraph, parseGraph.context)
    -- this handler function is just for debugging, we no longer have
    -- an 'execution return'
    set[#set+1] = unpacked
  end
  return build.build(set, tracing, parseGraph)
end

function analyze(content, quiet)
  local parseGraph = parser.parseString(content)
  for ix, queryGraph in std.ipairs(parseGraph.children) do
    print("----- Query Graph (" .. ix .. ") " .. queryGraph.name .. " -----")
    local dependencyGraph = DependencyGraph:fromQueryGraph(queryGraph)
    if not quiet then
      print("--- Unprepared DGraph ---")
      print("  " .. util.indentString(1, tostring(dependencyGraph)))
    end

    dependencyGraph:prepare()
    if not quiet then
      print("--- Unsorted DGraph ---")
      print("  " .. util.indentString(1, tostring(dependencyGraph)))
    end

    local sorted = dependencyGraph:order()
    print("--- Sorted DGraph ---")
    print("  " .. util.indentString(1, tostring(dependencyGraph)))

    local unpacked = unpackObjects(dependencyGraph, parseGraph.context)
    print("--- Unpacked Objects / Mutates ---")
    print("  {")
    for ix, node in ipairs(unpacked) do
      print(string.format("    %2d: %s", ix, util.indentString(4, tostring(node))))
    end
    print("  }")
  end
end

function analyzeQuiet(content)
  analyze(content, true)
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
