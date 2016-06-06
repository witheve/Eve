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
   return {alloc=0, freelist = {}, registers = {}, permanent = {}}
end

function variable(x)
   return type(x) == "table" and x.type == "variable"
end


function free_register(env, e)
   if env.permanent[e] == nil then
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
   return slot
end

function read_lookup(env, x)
   if variable(x) then
      local r = env.registers[x]
      if not r then
         r = allocate_register(env, x)
         env.registers[x] = r
       end
      return register(r)
   end
   -- demultiplex types on x.constantType
   if type(x) == "table" then
      return x["constant"]
   end
   return x
end

function write_lookup(env, x)
   -- can't be a constant or unbound
   r = env.registers[x]
   free_register(env, x)
   return register(r)
end


function bound_lookup(bindings, x)
   if variable(x) then
         return bindings[x]
   end
   return x
end


function translate_object(n, bound, down)
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
   c = scan(c, sig, ef(env, e), af(env, a), vf(env, v))
   return env, c
 end


function translate_mutate(n, bound, down)
   local e = n.entity
   local a = n.attribute
   local v = n.value

   local gen = (variable(e) and not bound[e])
   if (gen) then bound[e] = true end
   local env, c = down(bound)
   local c  = build_insert(c, n.scope, read_lookup(env, e), read_lookup(env, a), read_lookup(env, v));    
   if gen then
      c = generate_uuid(c, write_lookup(env, e))
   end
   return env, c
end

function translate_union(n, bound, down)
   local heads
   tail_bound = shallowcopy(bound)
   
   for _, v in pairs(n.outputs) do
      tail_bound[v] = true
   end

   local env, c = down(tail_bound)
         
   local orig_perm = shallowcopy(env.permanent)
   for n, _ in pairs(env.registers) do
      env.permanent[n] = true
   end
   
   for _, v in pairs(n.queries) do
      local c3
      local b2 = shallowcopy(bound)

      env, c3 = walk(v.unpacked, b2, c, env, nk)
      if c2 then
          c2 = build_fork(c2, c3)
      else
          c2 = c3
      end
   end
   env.permanent = orig_perm
   return e2, c2
end

function trace(n, bound, down)
    local entry = shallowcopy(bound)
    local env, c = down(bound)
    local map = {}
    for n, v in pairs(entry) do
       map[n] = env[n]
    end
    return env, build_trace(c, n.type, map)
end

function walk(graph, bound, tail, tail_env, key)
   nk = next(graph, key)
   if nk then
       local n = graph[nk]

       down = function (bound)
                    return walk(graph, bound, tail, tail_env, nk)
               end
       downtrace = function (bound)
                      return trace(n, bound, down)
                   end
 
       if (n.type == "union") then
          return translate_union(n, bound, down)
       end
       if (n.type == "mutate") then
          return translate_mutate(n, bound, down)
       end
       if (n.type == "object") then
          return translate_object(n, bound, down)

       end

       print ("ok, so we kind of suck right now and only handle some fixed patterns",
             "type", n.type,
             "entity", flat_print_table(e),
             "attribute", flat_print_table(a),
             "value", flat_print_table(v))
    else
        return tail_env,  tail
   end
end


function build(graph, tail)
   _, program =  walk(graph, {}, wrap_tail(tail),  empty_env(), nil)
   return program
end

------------------------------------------------------------
-- Parser interface
------------------------------------------------------------

return {
  build = build
}
