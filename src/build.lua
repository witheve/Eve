util = require("util")
parser = require("parser")

function term(name, x)
   if type(x) == "table" then
     print (name, "variable", x.name)
   else         
     print (name, x)
   end
end

function variable(x) 
   return type(x) == "table"
end


function lookup(bindings, name) 
   if type(x) == "table" then
     return bindings[x]     
   end
   return x
end


-- consider binding these in a build scope with local functions
function free_register(freeset, registers, alloc, e)
  freeset[e] = true
  table.remove(registers, e)
  while(freeset[alloc-1]) do 
     table.remove(freeset, alloc-1)
     alloc = alloc - 1 
  end
  return alloc
end

function allocate_register(freeset, registers, alloc, e)
  if not variable(x) then return alloc end
  slot = alloc
  for index,value in ipairs(freeset) do 
     slot = min(slot, index)
  end
  if slot == alloc then alloc = alloc + 1
  else freeset[slot] = nil end 
  registers[e] = slot
  return alloc
end

function walk(graph, bound, tail, key)
   nk = next(graph, key)    
   if nk then
       local defined = {}
       local n = graph[nk]
       local e = n[parser.ENTITY_FIELD]
       local a = n.attribute
       local v = n.value

       -- looking at these two cases for object it seems pretty clear this can be generalized
       if n.type == "object" and not bound[e] and lookup(bound, a) and lookup(bound, v) then
          bound[e] = true;
          local registers, freeset, alocat, c = walk(graph, bound, tail, nk)   
          alocat = allocate_register(freeset, registers, alocat, a)
          alocat = allocate_register(freeset, registers, alocat, v)

          c = scan(c, "eAV", lookup(registers, e), lookup(registers, a), lookup(registers, v))
          alocat = free_register(freeset, registers, alocat, e)      
          return registers, freeset, alocat, c
       end

       if n.type == "object" and not bound[v] and lookup(bound, e) and lookup(bound, a) then
          bound[v] = true;
          local registers, freeset, alocat, c = walk(graph, bound, tail, nk)   
          alocat = allocate_register(freeset, registers, alloc, e)
          alocat = allocate_register(freeset, registers, alloc, a)
          c = scan(c, "EAv", lookup(registers, e), lookup(registers, a), lookup(registers, v))
          alocat = free_register(freeset, registers, alocat, v)          
          return registers, freeset, alocat, c
       end

       if (n.type == "mutate") then 
          local gen = (variable(e) and not bound[e])
          if (gen) then bound[e] = true end
          local registers, freeset, alocat, c = walk(graph, bound, tail, nk)   
          local c = build_insert(c, lookup(registers, e), lookup(registers, a), lookup(registers, v))
          if gen then  
             c = generate_uuid(c, registers[e])
             alocat = free_register(freeset, registers, alloc, e)
          else 
             alocat = allocate_register(freeset, registers, alloc, e)
          end
          alocat = allocate_register(freeset, registers, alloc, a)
          alocat = allocate_register(freeset, registers, alloc, v)
          return registers, freeset, alocat, c
       end

       print ("ok, so we kind of suck right now and only handle some fixed patterns",
             "type", n.type,   
             "entity", term(e),
             "value", term(n.value),
             "atribute", term(n.attribute))
    else 
        return {}, {}, 0, tail
   end
end


function build(graph, tail) 
   walk(graph, {}, tail, nil)
end
      
------------------------------------------------------------
-- Parser interface
------------------------------------------------------------

return {
  build = build
}
