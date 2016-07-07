util = require("util")
math = require("math")
parser = require("parser")
db = require("db")

function recurse_print_table(t)
   if t == nil then return nil end
   local result = ""
   for k, v in pairs(t) do
      result = result .. " " .. tostring(k) .. ":"
     if (type(v) == "table") then
        result = result .. "{" .. recurse_print_table(v) .. "}"
     else
        result = result .. tostring(v)
     end
   end
   return result
end

function push(m, x, y)
   m[#m+1] = x
   m[#m+1] = y
end

function flat_print_table(t)
   if type(t) == "table" then
     local result = ""
     for k, v in pairs(t) do
        if not (k == nil) then result = result .. " " .. tostring(k) .. ":" end
        if not (v == nil) then result = result .. tostring(v) end
     end
     return result
   end
   return tostring(t)
end


function translate_value(x)
   if type(x) == "table" then
      local ct = x.constantType
      if ct == "string" then
         return sstring(x.constant)
      end
      if ct == "number" then
         return snumber(x.constant)
      end

      if ct == "boolean" then
         if (x.constant == "true") then
           return sboolean(true)
         end
         if (x.constant == "false") then
           return sboolean(false)
         end
      end

      if ct == "uuid" then
         return suuid(x.constant)
      end
      print ("i couldn't figure out this value", flat_print_table(x))
      return x
   end
   return x
end

function deepcopy(orig)
   local orig_type = type(orig)
   local copy
   if orig_type == 'table' then
       copy = {}
       for orig_key, orig_value in next, orig, nil do
              copy[deepcopy(orig_key)] = deepcopy(orig_value)
       end
    else -- number, string, boolean, etc
       copy = orig
    end
   return copy
end

function shallowcopy(orig)
    local copy = {}
    for k, v in pairs(orig) do
       copy[k] = v
    end
    return copy
end

-- end of util

function empty_env()
   return {alloc=0, freelist = {}, registers = {}, permanent = {}, maxregs = 0, ids = {}}
end

function variable(x)
   return type(x) == "table" and x.type == "variable"
end


function free_register(env, e)
   if env.permanent[e] == nil and env.registers[e] then
     env.freelist[env.registers[e]] = true
     env.registers[e] = nil
     while(env.freelist[env.alloc-1]) do
        env.alloc = env.alloc - 1
        env.freelist[env.alloc] = nil
     end
   end
end

function allocate_register(env, e)
   if not variable(e) or env.registers[e] then return end
   slot = env.alloc
   for index,value in ipairs(env.freelist) do
      slot = math.min(slot, index)
   end
   if slot == env.alloc then env.alloc = env.alloc + 1
   else env.freelist[slot] = nil end
   env.registers[e] = slot
   env.maxregs = math.max(env.maxregs, slot)
   return slot
end

head_to_tail_counter = 0

function allocate_temp()
   local n = "temp_" .. head_to_tail_counter
   head_to_tail_counter =  head_to_tail_counter + 1
   return {name = n, type = "variable"}
end

function read_lookup(env, x)
   if variable(x) then
      local r = env.registers[x]
      if not r then
         r = allocate_register(env, x)
         env.registers[x] = r
       end
      return sregister(r)
   end
   return translate_value(x)
end

function write_lookup(env, x)
   -- can't be a constant or unbound
   r = env.registers[x]
   free_register(env, x)
   return sregister(r)
end


function bound_lookup(bindings, x)
   if variable(x) then
         return bindings[x]
   end
   return x
end

function set_to_read_array(env, x)
   local out = {}
   for k, v in pairs(x) do
      out[#out+1] = read_lookup(env, k)
   end
   return out
end

function set_to_write_array(env, x)
   local out = {}
   for k, v in pairs(x) do
      out[#out+1] = write_lookup(env, k)
   end
   return out
end

function list_to_read_array(env, x)
   local out = {}
   for _, v in ipairs(x) do
      out[#out+1] = read_lookup(env, v)
   end
   return out
end

function list_to_write_array(env, x)
   local out = {}
   for _, v in ipairs(x) do
      out[#out+1] = write_lookup(env, v)
   end
   return out
end


function translate_subproject(n, bound, down, tracing, context)
   local p = n.projection
   local t = n.nodes
   local env, rest, fill, c
   local pass = allocate_temp()
   local db = shallowcopy(bound)
   bound[pass] = true

   for k, _ in pairs(n.provides) do
     db[k] = true
   end

   env, rest = down(db)

   local saveids = env.ids
   env.ids = {}
   function tail (bound)
     -- create an edge between the c node and the parse node
     local id = util.generateId()
     local id2 = util.generateId()
     context.downEdges[#context.downEdges + 1] = {n.id, id}
     context.downEdges[#context.downEdges + 1] = {n.id, id2}
      return env, build_node("subtail", {},
                             {set_to_read_array(env, n.provides),
                             {read_lookup(env, pass)}},
                             id)
   end

   local outregs =  set_to_read_array(env, n.provides)
   env, fill = walk(n.nodes, nil, bound, tail, tracing, context)

   -- create an edge between the c node and the parse node
   local id = util.generateId()
   context.downEdges[#context.downEdges + 1] = {n.id, id}
   local kind = "sub"
   if n.kind == "aggregate" then
     kind = "subagg"
   end
   c = build_node(kind, {rest, fill},
                          {set_to_read_array(env, n.projection),
                           outregs,
                           {write_lookup(env, pass)},
                           set_to_write_array(env, env.ids)},
                        id)

   if tracing then
      local map = {"proj", ""}
      for k, v in pairs(n.projection) do
         push(map, k.name,  read_lookup(env, k))
      end
      -- create an edge between the c node and the parse node
      local id = util.generateId()
      context.downEdges[#context.downEdges + 1] = {n.id, id}
      c = build_node("trace", {c}, {map}, id)
   end
   env.ids = saveids
   return env, c
end

function translate_object(n, bound, down, tracing, context)
   local e = n.entity
   local a = n.attribute
   local v = n.value
   local sig = "EAV"
   local ef = read_lookup
   local af = read_lookup
   local vf = read_lookup

   if not bound_lookup(bound, e) then
       sig = "eAV"
       bound[e] = true
       ef = write_lookup
   end
   if not bound_lookup(bound, a) then
       sig = string.sub(sig, 0, 1) .. "aV"
       bound[a] = true
       af = write_lookup
   end
   if not bound_lookup(bound, v) then
       sig = string.sub(sig, 0, 2) .. "v"
       bound[v] = true
       vf = write_lookup
   end

   local env, c = down(bound)
   if tracing then
     -- create an edge between the c node and the parse node
     local id = util.generateId()
     context.downEdges[#context.downEdges + 1] = {n.id, id}

      c = build_node("trace", {c},
                      {{"scan", "" ,
                       "sig", sig,
                       "entity", read_lookup(env,e),
                       "attribute", read_lookup(env, a),
                       "value", read_lookup(env, v)}},
                       id)
   end

   -- create an edge between the c node and the parse node
   local id = util.generateId()
   context.downEdges[#context.downEdges + 1] = {n.id, id}

   return env, build_node("scan", {c}, {{sig, ef(env, e), af(env, a), vf(env, v)}}, id)
 end


function translate_mutate(n, bound, down, tracing, context)
   local e = n.entity
   local a = n.attribute
   local v = n.value

   local gen = (variable(e) and not bound[e])
   if (gen) then bound[e] = true end

   local env, c = down(bound)
   local operator = n.operator
   if tracing then
     -- create an edge between the c node and the parse node
     local id = util.generateId()
     context.downEdges[#context.downEdges + 1] = {n.id, id}
      c = build_node("trace", {c},
                  {{operator, "" ,
                   "scope", n.scope,
                   "entity", read_lookup(env,e),
                   "attribute", read_lookup(env, a),
                   "value", read_lookup(env, v)}},
                   id)
   end

   -- create an edge between the c node and the parse node
   local id = util.generateId()
   context.downEdges[#context.downEdges + 1] = {n.id, id}

   local c = build_node(operator, {c},
                        {{n.scope,
                         read_lookup(env,e),
                         read_lookup(env,a),
                         read_lookup(env,v)}},
                         id)

   if gen then
     env.ids[e] = read_lookup(env, e)
   end
   return env, c
end

function translate_not(n, bound, down, tracing, context)
   local env
   local arms = {}
   local flag = allocate_temp()
   tail_bound = shallowcopy(bound)

   -- create an edge between the c node and the parse node
   local id = util.generateId()
   context.downEdges[#context.downEdges + 1] = {n.id, id}

   local tail_id = util.generateId()
   context.downEdges[#context.downEdges + 1] = {n.id, tail_id}

   local env, c = down(tail_bound)
   local orig_perm = shallowcopy(env.permanent)
   local bot = build_node("choosetail",
                          {},
                          {{read_lookup(env, flag)}}, tail_id)

   local arm_bottom = function (bound)
        return env, bot
   end

   for n, _ in pairs(env.registers) do
         env.permanent[n] = true
   end
   env, arm = walk(n.queries[1].unpacked, nil, shallowcopy(bound), arm_bottom, tracing, context)
   return env, build_node("not", {c, arm}, {{read_lookup(env, flag)}}, id)
end


-- looks alot like union
function translate_choose(n, bound, down, tracing, context)
   local env
   local arms = {}
   local flag = allocate_temp()

   local tail_bound = shallowcopy(bound)
   for _, v in pairs(n.outputs) do
      tail_bound[v] = true
   end

   local env, c = down(tail_bound)
   local orig_perm = shallowcopy(env.permanent)

   -- create an edge between the c node and the parse node
   local id = util.generateId()
   context.downEdges[#context.downEdges + 1] = {n.id, id}

   local bot = build_node("choosetail",
                          {c},
                          {{read_lookup(env, flag)}},
                          id)

   local arm_bottom = function (bound)
        return env, bot
   end

   for n, _ in pairs(env.registers) do
         env.permanent[n] = true
   end

   for _, v in pairs(n.queries) do
        env, c2 = walk(v.unpacked, nil, shallowcopy(bound), arm_bottom, tracing, context)
        arms[#arms+1] = c2
   end

   -- create an edge between the c node and the parse node
   local id = util.generateId()
   context.downEdges[#context.downEdges + 1] = {n.id, id}

   env.permanent = orig_perm
   -- currently leaking the perms
   return env, build_node("choose", arms, {{read_lookup(env, flag)}}, id)
end

function translate_concat(n, bound, down, tracing, context)
   local env, c = down(bound)
end


function translate_union(n, bound, down, tracing, context)
   local heads
   local c2
   local arms = {}
   tail_bound = shallowcopy(bound)

   for _, v in pairs(n.outputs) do
      tail_bound[v] = true
   end

   local env, c = down(tail_bound)

   local arm_bottom = function (bound)
                         return env, c
                      end

   local orig_perm = shallowcopy(env.permanent)
   for n, _ in pairs(env.registers) do
      env.permanent[n] = true
   end

   for _, v in pairs(n.queries) do
      local c2
      env, c2 = walk(v.unpacked, nil, shallowcopy(bound), arm_bottom, tracing, context)
      arms[#arms+1] = c2
   end
   env.permanent = orig_perm

   -- create an edge between the c node and the parse node
   local id = util.generateId()
   context.downEdges[#context.downEdges + 1] = {n.id, id}

   -- currently leaking the perms
   return env, build_node("fork", arms, {}, id)
end

function translate_expression(n, bound, down, tracing, context)
  local signature = db.getSignature(n.bindings, bound)
  local schema = db.getSchema(n.operator, signature)
  local args, fields = db.getArgs(schema, n.bindings)
  for _, term in ipairs(args) do
    bound[term] = true
  end
  local env, c = down(bound)

   -- Tack variadic arg vector onto the end
   local variadic
   if args["..."] then
     variadic = list_to_read_array(env, args["..."])
   end

   local groupings
   if n.groupings then
     groupings = set_to_read_array(env, n.groupings)
   end

   if tracing then
      local traceArgs = {schema.name or n.operator, ""}
      for ix, field in ipairs(fields) do
         traceArgs[#traceArgs + 1] = field
         traceArgs[#traceArgs + 1] = read_lookup(env, args[ix])
      end

      -- create an edge between the c node and the parse node
      local id = util.generateId()
      context.downEdges[#context.downEdges + 1] = {n.id, id}
      c = build_node("trace", {c}, {traceArgs, variadic or groupings or {}}, id)
   end

   local nodeArgs = {}
   for ix, field in ipairs(fields) do
     if schema.signature[field] == db.OUT then
       nodeArgs[#nodeArgs + 1] = write_lookup(env, args[ix])
     else
       nodeArgs[#nodeArgs + 1] = read_lookup(env, args[ix])
     end
   end

   -- create an edge between the c node and the parse node
   local id = util.generateId()
   context.downEdges[#context.downEdges + 1] = {n.id, id}
   return env, build_node(schema.name or n.operator, {c}, {nodeArgs, variadic or groupings or {}}, id)
end

-- this doesn't really need to be disjoint from read lookup, except for concerns about
-- environment mutation - be sure to use the same type multiplexing
function trace_lookup(env, x)
   if variable(x) then
      local r = env.registers[x]
      return sregister(r)
   end
   return translate_value(x)
end

function walk(graph, key, bound, tail, tracing, context)
   local d, down
   local nk = next(graph, key)
   if not nk then
      return tail(bound)
   end

   local n = graph[nk]
   d = function (bound)
                return walk(graph, nk, bound, tail, tracing, context)
           end

   if (n.type == "union") then
      return translate_union(n, bound, d, tracing, context)
   end
   if (n.type == "mutate") then
      return translate_mutate(n, bound, d, tracing, context)
   end
   if (n.type == "object") then
      return translate_object(n, bound, d, tracing, context)
   end
   if (n.type == "subproject") then
      return translate_subproject(n, bound, d, tracing, context)
   end
   if (n.type == "choose") then
      return translate_choose(n, bound, d, tracing, context)
   end
   if (n.type == "expression") then
      return translate_expression(n, bound, d, tracing, context)
   end
   if (n.type == "concat") then
      return translate_concat(n, bound, d, tracing, context)
   end
   if (n.type == "not") then
      return translate_not(n, bound, d, tracing, context)
   end

   print ("ok, so we kind of suck right now and only handle some fixed patterns",
         "type", n.type,
         "entity", flat_print_table(e),
         "attribute", flat_print_table(a),
         "value", flat_print_table(v))
end


function build(graphs, tracing, parseGraph)
   local head
   local heads ={}
   local regs = 0
   tailf = function(b)
               local id = util.generateId()
               return empty_env(), build_node("terminal", {}, {}, id)
           end
   for _, queryGraph in pairs(graphs) do
      local env, program = walk(queryGraph.unpacked, nil, {}, tailf, tracing, parseGraph.context)
      regs = math.max(regs, env.maxregs + 1)
      local id = util.generateId()
      parseGraph.context.downEdges[#parseGraph.context.downEdges + 1] = {queryGraph.id, id}
      heads[#heads+1] = build_node("regfile", {program}, {{regs}, {util.toJSON(parseGraph)}}, id)
   end

   return heads
end

------------------------------------------------------------
-- Parser interface
------------------------------------------------------------

return {
  build = build
}
