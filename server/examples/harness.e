(query
  (insert-fact! "t1-expected-1"
                :tag "expected"
                :test "test-1"
                :value 3)

  (insert-fact! "t1-data-1"
                :tag "data"
                :test "test-1"
                :a 1))

(define! add-2 [a return]
  (= return (+ a 2)))

(trace (query [success]
  (fact data :tag "data" :test "test-1" :a)
  (= value (add-2 a))
  (fact expected :tag "expected" :test "test-1" :value)

  (= expected-count (sum 1))
  (query [expected-count]
    (fact expected :tag "expected" :test "test-1" :value)
    (= expected-count (sum 1)))

  (= success true)))
