(query []
       (insert-fact! "joeoy" :loves "salley" :tag "people")
       (insert-fact! "bobby" :loves "toady" :tag "people")
       (insert-fact! "bobby" :loves "georgette" :tag "people")
       (insert-fact! "bobby" :loves "xanthippe" :tag "people")
       (insert-fact! "clovis" :tag "people"))

(query [x]
       (fact x :tag "people")
       (= f 1)      
       (query [x c]
              (fact x :loves)
              (= c (sum 1)))
       (not
        (= z f)
        (= c z)))

       
              
       
