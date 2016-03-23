(query [] (insert-fact! ("apple" "color" "red")))

(define! colorino [e c]
  (fact e :color c))

;(show (query [f] (colorino :e "apple" :c f)))

(query [f] (colorino :e "apple" :c f))



