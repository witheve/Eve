(query []
       (insert-fact! "joeoy" :name "joeoy" :age 11 :tag "person" :width 10)
       (insert-fact! "zack" :name "zack" :age 30 :tag "person" :width 15)
       (insert-fact! "bobby" :name "bobby" :age 30 :tag "person")
       (insert-fact! "alicia" :name "alicia" :age 22 :tag "person"))

(query [person name age]
              (fact-btu person "tag" "person")
              (fact-btu person "name" name)
              (fact-btu person "age" age)
              (not (fact-btu person "width" width)))
