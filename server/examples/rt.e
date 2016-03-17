(query [e]
       (insert-fact! "apple" "color" "red")
       (fact-btu :entity e :tick t)  
       (remove-by-t! t))