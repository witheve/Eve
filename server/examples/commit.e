(query [c x]
       (insert-fact-btu! :entity "apple" :attribute "color" :value "red")
       (fact-btu :entity "apple" :attribute "color" :value c)
       (= x (* 2 (+ 1 3)))
       (> x 7)
       (< x 9))
       


