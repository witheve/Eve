(open foo (query [people age]
                    (fact people :age)
                    (> age 20)))

(query []
 (insert-fact! "chris" :age 19))

(query []
 (insert-fact! "chris" :age 29)
  (query []
     (fact-btu "chris" "age" 19 :tick t)
        (remove-by-t! t)))

