;; todo - automate the generation of golden facts
(query
  (insert-fact! "test-1"
                :tag "test")

  (insert-fact! "t2-expected-1"
                :tag "expected"
                :test "test-1"
                :value 3)

  (insert-fact! "t2-data-1"
                :tag "data"
                :test "test-1"
                :a 1))

(define! add-2 [a return]
  (= return (+ a 2)))

(query
  (= test "test-1")
  (fact data :tag "data" :test :a)
  (= value (add-2 a))
  (= id (str test " a: " a " value: " value))
  (insert-fact! id :tag "result" :test :a :value))