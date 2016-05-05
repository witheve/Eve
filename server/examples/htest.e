(query
  (insert-fact! "basic"
                :tag "test")


  (insert-fact! "basic-expected-1"
                :tag "expected"
                :test "basic"
                :value 1)

  (insert-fact! "basic-data-1"
                :tag "data"
                :test "basic"
                :a 1))

(query
  (= test "basic")
  (fact data :tag "data" :test :a)
  (= value a)
  (= id (str test " a: " a " value: " value))
  (insert-fact! id :tag "result" :test :a :value))

(query [result]
                   (choose [result]
                           (query 
                            (fact expected :tag "expected" :test "basic" :value val)
                            (fact run :tag "result" :test "basic" :value val)
                            (= actual (sum 1))
                            (query [desired]
                                   (fact expected :tag "expected" :test "basic" :value)
                                   (= desired (sum 1)))
                            (= actual desired)
                            (= result true))
                           (query (= result false))))
