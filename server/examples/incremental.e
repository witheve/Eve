
(open fruit (query [f]
      (not (fact f :color k))
      (= f "no fruits man")))
      

(query []
       (insert-fact-btu! :entity "apple" :attribute "color" :value "red" :tick t0))
