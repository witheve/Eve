(trace (query [a t]
              (insert-fact-btu! :entity "apple" :attribute "color" :value "red" :tick t)
              (remove-by-t! t)
              (fact a :color "red")))
