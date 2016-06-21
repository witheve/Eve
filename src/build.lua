util = require("util")
math = require("math")
parser = require("parser")

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
        result = result .. " " .. tostring(k) .. ":"
        result = result .. tostring(v)
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
   return {alloc=0, freelist = {}, registers = {}, permanent = {}, maxregs = 0}
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


function translate_subproject(n, bound, down, tracing)
   local p = n.projection
   local t = n.nodes
   local prod = n.produces
   local env, rest, fill
   local pass = allocate_temp()
   local db = shallowcopy(bound)
   bound[pass] = true

   for k, _ in pairs(n.produces) do      
     db[k] = true
   end

   env, rest = down(db)

   function tail (bound)
      return env, build_node("subtail", {build_node("terminal", {}, {})}, 
                             {set_to_read_array(env, n.produces),   
                             {read_lookup(env, pass)}})                  
   end                        

   local outregs =  set_to_read_array(env, n.produces)
   env, fill = walk(n.nodes, nil, bound, tail, tracing)

   c = build_node("sub", {rest, fill},
                          {set_to_read_array(env, n.projection),
                          outregs,
--                           set_to_read_array(env, n.produces),
                          -- leak
                          {read_lookup(env, pass)}})

   if tracing then
      local map = {"proj", ""}
      for k, v in pairs(n.projection) do
         push(map, k.name,  read_lookup(env, k))
      end
      c = build_node("trace", {c}, {map})
   end
   
   return env, c
end

function translate_object(n, bound, down, tracing)
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
      c = build_node("trace", {c},
                      {{"scan", "" ,
                       "sig", sig,
                       "entity", read_lookup(env,e),
                       "attribute", read_lookup(env, a),
                       "value", read_lookup(env, v)}})
   end

   return env, build_node("scan", {c}, {{sig, ef(env, e), af(env, a), vf(env, v)}})
 end


function translate_mutate(n, bound, down, tracing)
   local e = n.entity
   local a = n.attribute
   local v = n.value

   local gen = (variable(e) and not bound[e])
   if (gen) then bound[e] = true end

   local env, c = down(bound)
   local operator = n.operator
   if tracing then
      c = build_node("trace", {c},
                  {{operator, "" ,
                   "scope", n.scope,
                   "entity", read_lookup(env,e),
                   "attribute", read_lookup(env, a),
                   "value", read_lookup(env, v)}})
   end

   local c = build_node(operator, {c},
                        {{n.scope,
                         read_lookup(env,e),
                         read_lookup(env,a),
                         read_lookup(env,v)}})

   if gen then
      c = build_node("generate", {c}, {{write_lookup(env, e)}})
   end
   return env, c
end

function translate_choose(n, bound, down, tracing)
      local arm_bottom = function (bound)
            return env, c
       end

      for n, _ in pairs(env.registers) do
         env.permanent[n] = true
      end
      
     for _, v in pairs(n.queries) do
         env, c2 = walk(v.unpacked, nil, shallowcopy(bound), arm_bottom, tracing)
     end
end

function translate_concat(n, bound, down, tracing)
   local env, c = down(bound)     
end

function translate_union(n, bound, down, tracing)
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
      env, c2 = walk(v.unpacked, nil, shallowcopy(bound), arm_bottom, tracing)
      arms[#arms+1] = c2
   end
   env.permanent = orig_perm
   -- currently leaking the perms
   return env, build_node("fork", arms, {})
end

local unaryArgs = {"return", "a"}
local binaryArgs = {"return", "a", "b"}
local binaryFilterArgs = {"a", "b", filter = true, alternateSchema = binaryArgs}
local mathFunctionArgs = {"return", "a"}
local expressionMap = {
   is = {"is", unaryArgs},
   ["+"] = {"plus", binaryArgs},
   ["-"] = {"minus", binaryArgs},
   ["*"] = {"multiply", binaryArgs},
   ["/"] = {"divide", binaryArgs},
   ["<"] = {"less_than", binaryFilterArgs},
   ["<="] = {"less_than_or_equal", binaryFilterArgs},
   [">"] = {"greater_than", binaryFilterArgs},
   [">="] = {"greater_than_or_equal", binaryFilterArgs},
   ["="] = {"equal", binaryFilterArgs},
   ["!="] = {"not_equal", binaryFilterArgs},
}
function translate_expression(n, bound, down, tracing)
   local m = expressionMap[n.operator]
   if not m then error("Unknown expression: " .. n.operator) end
   local operator = m[1]
   local schema = m[2]

   local produces = false
   for term in pairs(n.produces) do
      bound[term] = true
      produces = true
   end

   if produces and schema.filter then
      operator = "is_" .. operator
      schema = schema.alternateSchema
   end

   local args = {}
   for _, binding in pairs(n.bindings) do
      args[binding.field] = binding.variable or binding.constant
   end

   local env, c = down(bound)

   if tracing then
      local traceArgs = {operator, ""}
      for _, field in ipairs(schema) do
         if args[field] == nil then
            error("must bind field " .. field .. " for operator " .. n.operator)
         end
         traceArgs[#traceArgs + 1] = field
         traceArgs[#traceArgs + 1] = read_lookup(env, args[field])
      end
      c = build_node("trace", {c}, traceArgs, {})
   end

   local nodeArgs = {}
   for _, field in ipairs(schema) do
      if args[field] == nil then
         error("must bind field " .. field .. " for operator " .. n.operator)
      end
      if field == "return" then
         nodeArgs[#nodeArgs + 1] = write_lookup(env, args[field])
      else
         nodeArgs[#nodeArgs + 1] = read_lookup(env, args[field])
      end
   end
   return env, build_node(operator, {c}, {nodeArgs})
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

function walk(graph, key, bound, tail, tracing)
   local d, down
   local nk = next(graph, key)
   if not nk then
      return tail(bound)
   end
   
   local n = graph[nk]

   d = function (bound)
                return walk(graph, nk, bound, tail, tracing)
           end

   if (n.type == "union") then
      return translate_union(n, bound, d, tracing)
   end
   if (n.type == "mutate") then
      return translate_mutate(n, bound, d, tracing)
   end
   if (n.type == "object") then
      return translate_object(n, bound, d, tracing)
   end
   if (n.type == "subproject") then
      return translate_subproject(n, bound, d, tracing)
   end
   if (n.type == "choose") then
      return translate_choose(n, bound, d, tracing)
   end
   if (n.type == "expression") then
      return translate_expression(n, bound, d, tracing)
   end
   if (n.type == "concat") then
      return translate_concat(n, bound, d, tracing)
   end

   print ("ok, so we kind of suck right now and only handle some fixed patterns",
         "type", n.type,
         "entity", flat_print_table(e),
         "attribute", flat_print_table(a),
         "value", flat_print_table(v))
end


function build(graphs, tracing)
   local head
   local heads ={}
   local regs = 0
   tailf = function(b)
               return empty_env(), build_node("terminal", {}, {})
           end
   for _, g in pairs(graphs) do
      local env, program = walk(g, nil, {}, tailf, tracing)
      regs = math.max(regs, env.maxregs + 1)
      heads[#heads+1] = program
   end
   return build_node("fork", heads, {})
end

------------------------------------------------------------
-- Parser interface
------------------------------------------------------------

return {
  build = build
}
