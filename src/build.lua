util = require("util")
math = require("math")
parser = require("parser")

function simple_print_table(t)
   local result = ""
   for k, v in pairs(t) do
      result = result .. " " .. tostring(k) .. ":"
     if (type(v) == "table") then
        result = result .. "{" .. simple_print_table(v) .. "}"
     else
        result = result .. tostring(v)
     end
   end
   return result
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
                                                                            
function term(name, x)
   if type(x) == "table" then
     print (name, "variable", x.name)
   else         
     print (name, x)
   end
end


-- end of util

function variable(x)
   return type(x) == "table" and x.type == "variable" 
end


function free_register(env, e)
   env.freelist[env.registers[e]] = true
   env.registers[e] = nil
   while(env.freelist[env.alloc-1]) do 
      env.alloc = env.alloc - 1 
      env.freelist[env.alloc] = nil
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
      return r
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
   return r
end


function bound_lookup(bindings, x)
   if variable(x) then
         return bindings[x]
   end
   return x
end   


function walk(graph, bound, tail, key)
   nk = next(graph, key)    
   if nk then
       local defined = {}
       local n = graph[nk]
       local e = n[parser.ENTITY_FIELD]
       local a = n.attribute
       local v = n.value

       print("walk", n.type, e, a, v, tail)
       -- looking at these two cases for object it seems pretty clear this can be generalized
       if n.type == "object" and not bound[e] and bound_lookup(bound, a) and bound_lookup(bound, v) then
          bound[e] = true;
          local env, c = walk(graph, bound, tail, nk)   
          c = scan(c, "eAV", write_lookup(env, e), read_lookup(env, a), read_lookup(env, v))
          return env, c
       end

       if n.type == "object" and not bound[v] and bound_lookup(bound, e) and bound_lookup(bound, a) then
          bound[v] = true;
          local env, c = walk(graph, bound, tail, nk)   
          c = scan(c, "EAv", read_lookup(env, e), read_lookup(env, a), write_lookup(env, v))
          return env, c
       end

       if (n.type == "mutate") then 
          local gen = (variable(e) and not bound[e])
          if (gen) then bound[e] = true end
          local env, c = walk(graph, bound, tail, nk)
          local c  = build_insert(c, read_lookup(env, e), read_lookup(env, a), read_lookup(env, v));    
          if gen then
             c = generate_uuid(c, write_lookup(env, e))
          end
          return env, c
       end

       if (n.type == "union") then
          print("union")
       end
       
       print ("ok, so we kind of suck right now and only handle some fixed patterns",
             "type", n.type,   
             "entity", term(e),
             "value", term(n.value),
             "atribute", term(n.attribute))
    else
        local env = {alloc=0, freelist = {}, registers = {}}
        return env,  tail
   end
end


function build(graph, tail) 
   local _, _, _, program =  walk(graph, {}, wrap_tail(tail), nil)
   return program
end
      
------------------------------------------------------------
-- Parser interface
------------------------------------------------------------

return {
  build = build
}
