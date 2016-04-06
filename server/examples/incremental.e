
(open fruit (query [f] (fact f :color k)))

(query []
       (insert-fact-btu! :entity "apple" :attribute "color" :value "red" :tick t0)
       (remove-by-t! t0))
