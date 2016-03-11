(query [] (insert-fact-btu! :entity "apple" :attribute "color" :value "red"))

(define! colorino [e c]
  (fact e :color c))

(query [f] (colorino :e "apple" :c f))




