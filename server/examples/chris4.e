(query []
       (insert-fact! "joeoy" :tag "person" :age 11)
       (insert-fact! "xanthippe" :tag "person" :age 67)
       (insert-fact! "lou" :tag "person" :age 42))
     
(query [person age result]
        (fact-btu person "tag" "person")
        (fact-btu person "age" age)
        (= result (sum age)))
