
(query []
       (insert-fact-btu! :entity "apple" :attribute "color" :value "red" :tick t))

(query []
       (fact-btu :entity "apple" :attribute "color" :value "red" :tick t)
       (remove-by-t! t))



