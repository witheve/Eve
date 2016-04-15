(query [c x s]
       (insert-fact-btu! :entity "apple" :attribute "color" :value "red")
       (fact-btu :entity "apple" :attribute "color" :value c)
       (= x (* 2 (+ 1 3)))
       (> x 7)
       (< x 9)
       (union [b]
              (query (= b 10))
              (query (= b 11))
              (query (= b 3)))
       (= s (sum b)))
       


