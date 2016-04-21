
(open foo (query [a z]
       (insert-fact-btu! :entity "apple" :attribute "color" :value "red" :tick t)
       (remove-by-t! t)
       (fact-btu :entity a :attribute "color" :value "red" :tick z)))

(query []
       (insert-fact-btu! :entity "apple" :attribute "color" :value "red" :tick t)
       (insert-fact-btu! :entity "apple" :attribute "color" :value "red" :tick t)        
       (insert-fact-btu! :entity "strawberry" :attribute "color" :value "red" :tick t))
