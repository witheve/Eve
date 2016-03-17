(query [t]
       (insert-fact-btu! :entity "apple" :attribute "color" :value "red" :tick t)
       (remove-by-t! t))