
(define! colorino [e c]
  (fact e :color c))

(trace (query [f]
  (insert-fact-btu! :entity "apple" :attribute "color" :value "red")
  (colorino :e "apple" :c f)))