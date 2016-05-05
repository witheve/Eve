(query
  (insert-fact! "fruit"
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