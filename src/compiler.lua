-- Imports / module wrapper
local Pkg = {}
local std = _G
local error = error
local print = print
local next = next
local pairs = pairs
local ipairs = ipairs
local type = type
local tostring = tostring
local getmetatable = getmetatable
local setmetatable = setmetatable
local string = string
local table = table
local util = require("util")
local Set = require("set").Set
local parser = require("parser")
local color = require("color")
local db = require("db")
local build = require("build")
local errors = require("error")
setfenv(1, Pkg)

local makeNode = parser.makeNode
local ENTITY_FIELD = parser.ENTITY_FIELD
local TAG_FIELD = "tag"
local EAV_TAG = "eav"

-- Utilities
local nothing = {}
local DefaultNodeMeta = util.DefaultNodeMeta
local formatQueryNode = util.formatQueryNode

function flattenProjection(projection)
  local neue = Set:new()
  for ix, layerOrVar in ipairs(projection) do
    if layerOrVar.type == "variable" then
      neue:add(layerOrVar)
    elseif layerOrVar.type == "projection" then
      neue:add(layerOrVar.variable)
    elseif getmetatable(layerOrVar) == Set then
      neue:union(layerOrVar, true)
    else
      error("I am sad because I do not know what this is: " .. tostring(layerOrVar))
    end
  end
  return neue
end

local function prepareQueryGraph(_, node)
  if type(node) == "table" and node.type and not node._sanitized then
    setmetatable(node, DefaultNodeMeta)
    if node.projection then
      node.projection = flattenProjection(node.projection)
    end
    if node.groupings then
      node.groupings = flattenProjection(node.groupings)
    end
    node._sanitized = true
  end
end

-- The unifier fixes a few edge-cases by pre-collapsing a subset of variables that can be statically proven to be equivalent
function unify(query, mapping, projection)
  mapping = mapping or {}
  query.mapping = {}
  local variableBindings = {}

  function flattify(nodes)
    for _, node in ipairs(nodes or nothing) do
      for _, binding in ipairs(node.bindings or nothing) do
        local variable = binding.variable
        if variable then
          query.mapping[variable] = variable
          if not variableBindings[variable] then
            variableBindings[variable] = Set:new{binding}
          else
            variableBindings[variable]:add(binding)
          end
        end
      end
    end
  end

  flattify(query.expressions)
  flattify(query.objects)
  flattify(query.mutates)
  flattify(query.unions)
  flattify(query.chooses)
  flattify(query.nots)

  local assignments = Set:new()
  local equalities = Set:new()
  for _, node in ipairs(query.expressions) do
    if node.operator == "=" and #node.bindings == 2 then
      assignments:add(node)
      for _, binding in ipairs(node.bindings) do
        local a = node.bindings[1].variable
        local b = node.bindings[2].variable
        if a and b then
          local groups = Set:new()
          for equality in pairs(equalities) do
            if equality[a] or equality[b] then
              groups:add(equality)
            end
          end

          if groups:length() == 0 then
            equalities:add(Set:new{a, b})
          elseif groups:length() == 1 then
            for group in pairs(groups) do
              group:add(a)
              group:add(b)
            end
          else
            local neue = Set:new{a, b}
            for group in pairs(groups) do
              neue:union(group, true)
              equalities:remove(group)
            end
            equalities:add(neue)
          end
        end
      end
    end
  end

  if projection and getmetatable(projection) ~= Set then
    projection = Set:from(projection)
  end

  for equality in pairs(equalities) do
    local projected
    if projection then
      projected = equality * projection
    else
      projected = Set:new()
    end

    if projected:length() > 1 then
      error("Unable to unify multiple projected variables in group: " .. tostring(equality) .. " for query " .. tostring(query))
    else
      local variable

      for var in pairs(equality) do
        if mapping[var] then
          variable = mapping[var]
        end
      end

      if variable then
        -- intentionally blank
      elseif projected:length() == 1 then
        for var in pairs(projected) do
          variable = var
        end
      else
        for var in pairs(equality) do
          if not var.generated then
            variable = var
            break
          elseif not variable then
            variable = var
          end
        end
      end

      variable.unifies = equality
      for var in pairs(equality) do
        query.mapping[var] = variable
      end

      for var in pairs(equality) do
        if var ~= variable then
          var.unifiedBy = variable

          for binding in pairs(variableBindings[var] or nothing) do
            if not mapping[var] then
              binding.variable = variable
            else
              binding.variable = mapping[var]
            end
          end
        end
      end
    end
  end

  -- Scrub all of the assignments that have been made useless by unifying (a === b ?)
  for assignment in pairs(assignments) do
    local a = assignment.bindings[1]
    local b = assignment.bindings[2]
    if a.variable and a.variable == b.variable then
      assignment.ignore = true
    end
  end

  -- Strip empty objects (illegal to only bind E ever)
  for _, object in ipairs(query.objects) do
    if #object.bindings == 1 and object.bindings[1].field == ENTITY_FIELD then
      object.ignore = true
    end
  end

  -- Recursively unify children nodes
  function recur(children)
    for _, node in ipairs(children) do
      for ix, output in ipairs(node.outputs or nothing) do
        node.outputs[ix] = query.mapping[output] or output
      end
      for _, body in ipairs(node.queries) do
        unify(body, query.mapping, node.outputs)
      end
    end
  end
  recur(query.chooses)
  recur(query.unions)
  recur(query.nots)

  function remapNodes(nodes)
    for _, node in ipairs(nodes) do
      if node.projection then
        local nodeProj = node.projection or Set:new()
        local mappedProj = Set:new()
        node.projection = mappedProj
        for var in pairs(nodeProj) do
          mappedProj:add(query.mapping[var] or var)
        end
      end

      for ix, var in ipairs(node.groupings or nothing) do
        node.groupings[ix] = query.mapping[var] or var
      end
    end
  end

  remapNodes(query.expressions)
  remapNodes(query.objects)
  remapNodes(query.mutates)

  return query
end

function idSort(unsorted)
  local nodes = {}
  for node in pairs(unsorted) do
    nodes[#nodes + 1] = node
  end

  table.sort(nodes, function(a, b)
               return a.id < b.id
  end)
  return nodes
end

-- Pre-sort the unsorted list in rough order of cost
-- this makes ordering more deterministic and potentially improves performance
function presort(nodes, typeCost)
  local idSorted = idSort(nodes)
  local presorted = {}

  typeCost = typeCost or {mutate = 1000, expression = 100, ["not"] = 200, choose = 300, union = 400, object = 500}
  while #idSorted > 0 do
    local cheapest
    local cheapestCost = 2^52
    local cheapestIx
    for ix, node in ipairs(idSorted) do
      local cost = (typeCost[node.type] or 600) + node.deps.provides:length() * 10 - node.deps.depends:length()
      if cost < cheapestCost then
        cheapest = node
        cheapestCost = cost
        cheapestIx = ix
      end
    end
    presorted[#presorted + 1] = cheapest
    table.remove(idSorted, cheapestIx)
  end

  return presorted
end

-- Dependency Graph
DependencyGraph = {}

function DependencyGraph:new(obj)
  obj = obj or {}
  -- Essential state
  obj.unprepared = obj.unprepared or Set:new() -- set of nodes that must still be prepared prior to ordering
  obj.unsorted = obj.unsorted or Set:new() -- set of nodes that need to be ordered
  obj.sorted = obj.sorted or {} -- append-only set of ordered nodes

  obj.dependents = obj.dependents or {} -- Sets of nodes depending on a term
  obj.bound = obj.bound or Set:new() -- Set of terms bound by the currently ordered set of nodes
  obj.terms = obj.terms or Set:new() -- Set of all terms provided by any node in the graph
  obj.cardinalTerms = obj.cardinalTerms or {}

  obj.termGroups = obj.termGroups or Set:new() -- Set of sets of terms that are in some way joined
  obj.groupDepends = obj.groupDepends or Set:new() -- Set of nodes that must be ordered for a group to be satisfiable.

  setmetatable(obj, self)
  self.__index = self
  return obj
end

-- Get the variables this dgraph depends on for reification
function DependencyGraph:depends()
  self:order(true)
  local depends = Set:new()
  for node in pairs(self.unprepared + self.unsorted) do
    depends:union(node.deps.depends + node.deps.anyDepends + node.deps.maybeDepends, true)
  end
  for _, node in ipairs(self.sorted) do
    depends:union(node.deps.depends, true)
  end
  return depends
end

function DependencyGraph:provides()
  self:order(true)
  return self.bound
end

function DependencyGraph:requires()
  return self:depends() / self.terms
end

function DependencyGraph:isOrdered()
  return self.unsorted:length() == 0 and self.unprepared:length() == 0
end

function DependencyGraph:cardinal(term)
  if self.cardinalTerms[term] then
    return self.cardinalTerms[term]
  end
  local neue = util.shallowCopy(term)
  self.cardinalTerms[term] = neue
  neue.name = "|" .. term.name .. "|"
  neue.id = util.generateId()
  neue.cardinal = term
  neue.generated = true

  return self.cardinalTerms[term]
end

function DependencyGraph:group(termOrNode) -- Retrieve the group (if any) associated with the given term or node
  for group, depends in pairs(self.groupDepends) do
    if group[termOrNode] or depends[termOrNode] then
      return group
    end
  end
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
        deps.maybeDepends:add(self:cardinal(binding.variable))
      else
        deps.depends:add(self:cardinal(binding.variable))
      end

    end
  end
  for term in pairs(node.projection or nothing) do
    deps.depends:add(self:cardinal(term))
  end
  return self:add(node)
end

function DependencyGraph:addExpressionNode(node)
  -- TODO also need to consider projections and groupings as dependencies
  -- TODO handle productions other than just "return", this will require schemas
  local deps = {
    provides = Set:new(),
    maybeProvides = Set:new(),
    contributes = Set:new(),
    depends = Set:new(),
    maybeDepends = Set:new(),
    anyDepends = Set:new(),
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
      deps.provides:add(args.b)
    elseif args.b.type == "constant" then
      deps.provides:add(args.a)
    else
      deps.provides:add(args.a)
      deps.anyDepends:add(args.a)
      deps.provides:add(args.b)
      deps.anyDepends:add(args.b)
    end
  else
    local signature = db.getSignature(node.bindings)
    local schemas = db.getPossibleSchemas(node.operator, signature)
    if schemas:length() < 1 then
      self.ignore = true
      errors.unknownExpression(self.context, node, db.getExpressions())
      return
    end

    local pattern = util.shallowCopy(next(schemas, nil).signature)
    local rest
    for schema in pairs(schemas) do
      rest = schema.rest
    end
    for field in pairs(args) do
      if not pattern[field] then
        pattern[field] = rest
      end
    end

    for schema in pairs(schemas) do
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
        elseif pattern[field] == db.STRONG_IN then
          deps.depends:add(self:cardinal(args[field]))
        elseif pattern[field] == db.FILTER_IN then
          print(node, field, args[field])
          deps.depends:add(args[field])
          deps.contributes:add(self:cardinal(args[field]))
        elseif pattern[field] == db.OUT then
          deps.provides:add(args[field])
        else
          deps.maybeProvides:add(args[field])
          deps.maybeDepends:add(args[field])
        end
      end
    end

    if node.projection then
      for term in pairs(node.projection) do
        deps.depends:add(self:cardinal(term))
      end
    end
    if node.groupings then
      for term in pairs(node.groupings) do
        deps.depends:add(self:cardinal(term))
      end
    end
  end
  return self:add(node)
end

function DependencyGraph:addSubqueryNode(node, context)
  local deps = {
    maybeProvides = Set:new(),
    maybeDepends = Set:new(),
    contributes = Set:new()
  }
  node.deps = deps

  if node.outputs then
    for _, var in ipairs(node.outputs) do
      deps.maybeDepends:add(var)
      deps.maybeProvides:add(var)
      deps.contributes:add(self:cardinal(var))
    end
  end

  for _, body in ipairs(node.queries) do
    local subgraph = DependencyGraph:fromQueryGraph(body, context, true)
    deps.maybeDepends:union(subgraph:depends() + subgraph:provides(), true)
  end
  return self:add(node)
end

function DependencyGraph:fromQueryGraph(query, context, isSubquery)
  local uniqueCounter = 0
  local dgraph = self
  if getmetatable(dgraph) ~= DependencyGraph then
    dgraph = self:new()
  end
  dgraph.query = query;
  dgraph.context = context
  if not isSubquery then
    util.walk(query, prepareQueryGraph)
    unify(query)
  end
  query.deps = {graph = dgraph}

  for _, node in ipairs(query.expressions or nothing) do
    if not node.ignore then
      dgraph:addExpressionNode(node)
    end
  end
  for _, node in ipairs(query.objects or nothing) do
    if not node.ignore then
      dgraph:addObjectNode(node)
    end
  end
  for _, node in ipairs(query.nots or nothing) do
    if not node.ignore then
      dgraph:addSubqueryNode(node, context)
    end
  end
  for _, node in ipairs(query.unions or nothing) do
    if not node.ignore then
      dgraph:addSubqueryNode(node, context)
    end
  end
  for _, node in ipairs(query.chooses or nothing) do
    if not node.ignore then
      dgraph:addSubqueryNode(node, context)
    end
  end
  for _, node in ipairs(query.mutates or nothing) do
    if not node.ignore then
      dgraph:addMutateNode(node)
    end
  end

  return dgraph
end

function DependencyGraph:unsatisfied(node)
  local depends = node.deps.depends / self.bound
  local anyDepends = node.deps.anyDepends
  if anyDepends:length() > 0 then
    depends:add(anyDepends)
  end
  return depends
end

-- provides are the set of terms provided after this node has been scheduled
-- maybeProvides are the set of terms that, IFF not provided in this query, will be provided by this node
-- contributes are the set of terms will be provided when all nodes contributing to them and their group have been scheduled
-- depends are the set of terms that must be provided prior to scheduling this node
-- maybeDepends are the set of terms that, IFF provided in this query, become dependencies of this node
-- anyDepends are the set of terms that, if any single term is satisfied, are all satisfied as a set
function DependencyGraph:add(node)
  node.deps = node.deps or {}
  local deps = node.deps
  deps.provides = deps.provides or Set:new()
  deps.maybeProvides = deps.maybeProvides or Set:new()
  deps.contributes = deps.contributes or Set:new()
  deps.depends = deps.depends or Set:new()
  deps.maybeDepends = deps.maybeDepends or Set:new()
  deps.anyDepends = deps.anyDepends or Set:new()

  self.unprepared:add(node)
end

function DependencyGraph:prepare(isSubquery) -- prepares a completed graph for ordering
  if self.unprepared:length() == 0 then
    return
  end
  local presorted = presort(self.unprepared, {mutate = 500, expression = 400, ["not"] = 300, choose = 200, union = 100, object = 0})

  -- Ensure that all nodes which provide a term contribute to that terms cardinality
  for _, node in ipairs(presorted) do
    for term in pairs(node.deps.provides) do
      node.deps.contributes:add(self:cardinal(term))
    end
  end

  -- Add newly provided terms to the DG's terms
  local neueTerms = Set:new()
  for _, node in ipairs(presorted) do
    neueTerms:union(node.deps.provides + node.deps.contributes, true)
  end
  self.terms:union(neueTerms, true)

  -- Link new maybe provides if no other nodes provide them
  for _, node in ipairs(presorted) do
    for term in pairs(node.deps.maybeProvides) do
      if not self.terms[term] then
        node.deps.provides:add(term)
        node.deps.contributes:add(self:cardinal(term))
        neueTerms:add(term)
        neueTerms:add(self:cardinal(term))
        self.terms:add(term)
        self.terms:add(self:cardinal(term))
      end
    end
  end

  -- Link new maybe dependencies to existing terms
  for _, node in ipairs(presorted) do
    for term in pairs(node.deps.maybeDepends) do
      if self.terms[term] and not (node.deps.provides[term] or node.deps.contributes[term]) then
        node.deps.depends:add(term)
      end
    end
  end

  -- Link existing maybe dependencies to new terms
  for term in std.pairs(neueTerms) do
    if self.dependents[term] == nil then
      self.dependents[term] = Set:new()
      for node in pairs(self.unsorted) do
        if node.deps.maybeDepends[term] then
          self.dependents[term]:add(node)
          node.deps.depends:add(term)
          node.deps.unsatisfied = node.deps.unsatisfied + 1
        end
      end
    end
  end

  -- Trim dependencies on terms the node expects to provide and unused maybes
  for _, node in ipairs(presorted) do
    local deps = node.deps
    deps.depends:difference(deps.provides, true)
    deps.maybeDepends = Set:new()
    deps.maybeProvides = Set:new()
  end

  -- Recursively prepare any child graphs
  for _, node in ipairs(presorted) do
    local deps = node.deps
    if node.deps.graph then
      node.deps.graph:prepare()
      local required = node.deps.graph:requires()
      for term in pairs(required) do
        node.deps.graph:satisfy(term)
        node.deps.depends:add(term)
      end
    elseif node.queries then
      for _, query in ipairs(node.queries) do
        query.deps.graph:prepare()
        local required = query.deps.graph:requires()
        for term in pairs(required) do
          query.deps.graph:satisfy(term)
          node.deps.depends:add(term)
        end
      end
    end
  end

  -- Group contributed terms and consolidate with existing term groups
  -- These are grouped into "cardinality islands", in which cardinality can be guaranteed to be stable
  -- once all terms in the group have been maximally joined/filtered
  -- @NOTE: groups are unique in that they depend on nodes rather than terms
  for _, node in ipairs(presorted) do
    local terms = node.deps.contributes
    local groups = Set:new()
    local neueGroup = Set:new()
    local depends = Set:new{node}
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
        depends:union(self.groupDepends[group] or nothing, true)
        neueGroup = group
      end
    elseif groups:length() > 1 then
      for group in pairs(groups) do
        depends:union(self.groupDepends[group] or nothing, true)
        for term in pairs(group) do
          neueGroup:add(term)
        end
        self.termGroups:remove(group)
        self.groupDepends[group] = nil
      end
      self.termGroups:add(neueGroup)
    end
    self.groupDepends[neueGroup] = depends
  end

  -- Register new nodes as a dependent on all the terms they require but cannot provide
  -- Move new nodes into unsorted
  for _, node in ipairs(presorted) do
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

function DependencyGraph:satisfy(term)
  -- Decrement the unsatisfied term count for nodes depending on this term if it hasn't been provided already
  if self.dependents[term] and not self.bound[term] then
    self.bound:add(term)
    for dependent in pairs(self.dependents[term]) do
      local deps = dependent.deps
      if deps.unsatisfied > 0 then
        deps.unsatisfied = deps.unsatisfied - 1
      end

      if dependent.deps.anyDepends[term] then
        dependent.deps.depends:add(term)
        dependent.deps.provides:remove(term)
        for anyTerm in pairs(dependent.deps.anyDepends) do
          self.dependents[anyTerm]:remove(dependent)
        end
        dependent.deps.anyDepends:intersection(nothing, {})
      end
    end
  end
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
  if self.unsorted:length() == 0 then
    return
  end

  -- Pre-sort the unsorted list in rough order of cost
  -- this makes ordering more deterministic and potentially improves performance
  local presorted = presort(self.unsorted)
  while self.unsorted:length() > 0 do
    local scheduled = false
    for ix, node in ipairs(presorted) do
      local deps = node.deps
      if deps.unsatisfied == 0 then
        self.sorted[#self.sorted + 1] = node
        self.unsorted:remove(node)
        table.remove(presorted, ix)

        -- order child graphs, if any
        if node.queries then
          for _, body in ipairs(node.queries) do
            body.deps.graph:order()
          end
        elseif deps.graph then
          deps.graph:order()
        end

        -- Strip terms that have already been provided
        for term in pairs(deps.provides) do
          if self.bound[term] then
            deps.provides:remove(term)
          end
        end

        -- clean dependency hooks
        for term in pairs(deps.depends + deps.anyDepends) do
          self.dependents[term]:remove(node)
        end

        -- Decrement the unsatisfied term count for nodes depending on terms this node provides that haven't been provided
        for term in pairs(deps.provides) do
          self:satisfy(term)
        end

        -- Determine if the group containing this node is stabilized by its satisfaction
        -- If so, provide every term in the group
        local group = self:group(node)
        if group then
          local depends = self.groupDepends[group]
          depends:remove(node)
          if depends:length() == 0 then
            for term in pairs(group) do
              deps.provides:add(term)
              self:satisfy(term)
            end
          end
        end
        scheduled = true
        break
      end
    end
    if not scheduled then
      if not allowPartial then
        local requires = self:requires()
        if requires:length() > 0 then
          for term in pairs(requires) do
            errors.unknownVariable(self.context, term, self.terms)
          end
        else
          errors.unorderableGraph(self.context, self.query)
        end
        self.ignore = true

        -- for group in pairs(self.termGroups) do
        --   local depends = self.groupDepends[group]
        --   print(group, depends:length(), depends)
        -- end
      end

      break
    end
  end
  return self.sorted, #self.unsorted > 0
end

function fmtDepNode(node)
  if not node.deps then error(std.debug.traceback()) end
  local deps = node.deps
  local result = tostring(deps.depends)
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
  if deps.contributes:length() > 0 and (deps.provides * deps.contributes):length() == 0 then
    result = result .. "|CONTRIBUTES:" .. tostring(deps.contributes)
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
  context.downEdges[#context.downEdges + 1] = {obj.value.id, obj.id}
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
  local value = obj.value
  return "ScanNode{type: " .. tostring(obj.type) .. ", " .. operator ..
    "entity: " .. tostring(obj.entity) ..
    ", attribute: " .. tostring(obj.attribute) ..
    ", value: " .. tostring(value) .. "}"
end

SubprojectNode = {}
function SubprojectNode:new(obj, source, context, scope)
  obj = obj or {}
  obj.id = util.generateId()
  if source.id then
    context.downEdges[#context.downEdges + 1] = {source.id, obj.id}
  end
  obj.type = obj.type or "subproject"
  obj.projection = obj.projection or Set:new()
  obj.provides = obj.provides or Set:new()
  obj.nodes = obj.nodes or {}
  obj.scope = scope
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
      if node.type == "mutate" then
        -- local projection = Set:new()
        -- for term in pairs(node.deps.depends) do
        --   local variable = term
        --   for var, cardinal in pairs(dg.cardinalTerms) do
        --     if term == cardinal then
        --       variable = var
        --       break
        --     end
        --   end
        --   projection:add(variable)
        -- end
        -- node.projection = projection

        -- @FIXME: current projection is poisoned in the case of parent-child relations
        local projection = node.projection
        for _, binding in ipairs(node.bindings or nothing) do
          if binding.field == ENTITY_FIELD and not node.deps.provides[binding.variable] then
            projection:add(binding.variable)
            break
          end
        end
        projection:union(node.projection or nothing, true)

        subproject = SubprojectNode:new({query = dg.query, projection = projection, provides = node.deps.provides}, node, context, node.scope)
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
              unpacked[#unpacked + 1] = SubprojectNode:new({query = dg.query, projection = subproject.projection + Set:new{entity, binding.variable}, nodes = {ScanNode:fromBinding(node, binding, entity, context)}}, binding, context, node.scope)
            else
              unpackList[#unpackList + 1] = ScanNode:fromBinding(node, binding, entity, context)
            end
          elseif #node.bindings == 1 then
            error("Eliding only binding on object: " .. tostring(node))
          end
        end
      end
    elseif node.type == "expression" and node.projection then
      local subproject = SubprojectNode:new({query = dg.query, kind = "aggregate", projection = node.projection, groupings = node.groupings, provides = node.deps.provides, nodes = {node}}, node, context)
      if node.operator == "count" then
        local constant = makeNode(context, "constant", node, {generated = true, constant = 1, constantType = "number"})
        node.bindings[#node.bindings + 1] = makeNode(context, "binding", node, {generated = true, field = "a", constant = constant})
        node.operator = "sum"
      end
      unpacked[#unpacked + 1] = subproject
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
  local context = parseGraph.context

  if context.errors and #context.errors ~= 0 then
    return {}, util.toFlatJSON(parseGraph), {}
  end

  local set = {}
  local nameset = {}

  for ix, queryGraph in ipairs(parseGraph.children) do
    local dependencyGraph = DependencyGraph:fromQueryGraph(queryGraph, context)
    local unpacked = unpackObjects(dependencyGraph, context)
    -- @NOTE: We cannot allow dead DGs to still try and run, they may be missing filtering hunks and fire all sorts of missiles
    if not dependencyGraph.ignore then
      set[#set+1] = queryGraph
      nameset[#nameset+1] = queryGraph.name
    end
  end
  if context.errors and #context.errors ~= 0 then
    return {}, util.toFlatJSON(parseGraph), {}
  end
  return build.build(set, tracing, parseGraph), util.toFlatJSON(parseGraph), nameset
end

function analyze(content, quiet)
  local parseGraph = parser.parseString(content)
  local context = parseGraph.context
  if context.errors and #context.errors ~= 0 then
    print("Bailing due to errors.")
    return 0
  end

  for ix, queryGraph in std.ipairs(parseGraph.children) do
    print("----- Query Graph (" .. ix .. ") " .. queryGraph.name .. " -----")
    local dependencyGraph = DependencyGraph:fromQueryGraph(queryGraph, context)
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

    local unpacked = unpackObjects(dependencyGraph, context)
    print("--- Unpacked Objects / Mutates ---")
    print("  {")
    for ix, node in ipairs(unpacked) do
      print(string.format("    %2d: %s", ix, util.indentString(4, tostring(node))))
    end
    print("  }")
  end

  if context.errors and #context.errors ~= 0 then
    print("Bailing due to errors.")
    return 0
  end

  return 0
end

function analyzeQuiet(content)
  return analyze(content, true)
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
