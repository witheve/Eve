
;; todo - automate the generation of golden facts
(query
  (insert-fact! "test-2"
                :tag "test")

  (insert-fact! "t2-expected-1"
                :tag "expected"
                :test "test-2"
                :value 3)

  (insert-fact! "t2-data-1"
                :tag "data"
                :test "test-2"
                :a 1))

(define! add-2 [a return]
  (= return (+ a 2)))

(query
  (= test "test-2")
  (fact data :tag "data" :test :a)
  (= out (add-2 a))
  (= id (str test " a: " a " value: " value))
  (insert-fact! id :tag "result" :test :a :value))