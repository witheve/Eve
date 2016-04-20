(query [s]
       (insert-fact! "apple" :calories 200)
       (insert-fact! "pineapple" :calories 300)
       (insert-fact! "tapework" :calories -100)
       (fact x :calories c)
       (= s (sum c)))