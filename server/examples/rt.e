
(query [a t]
              (insert-fact-btu! :entity "apple" :attribute "color" :value "red" :tick t)
              (remove-by-t! t)
              (fact a :color "red"))

(query []
       (insert-fact-btu! :entity "apple" :attribute "color" :value "red" :tick t)
       (insert-fact-btu! :entity "strawberry" :attribute "color" :value "red" :tick t))