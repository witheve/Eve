(query [s]
  (insert-fact! e :a 1
                  :b 2)
  (union [a]      
    (query
        (fact e :a a))
    (query
     (fact e :b a)))
  
  (= s (sum a)))
        
    
