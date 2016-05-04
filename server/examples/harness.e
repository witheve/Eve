(define! run-test [test]
  (fact expected :tag "expected" :test)
  (fact run :tag "result" :test)
  (fact-btu expected attr val)
  (fact-btu run attr val)
  (= actual (sum 1))
  (query [test desired]
    (fact expected :tag "expected" :test)
    (fact-btu expected attr val)
    (= desired (sum 1)))


   (choose [actual desired result]
     (query
       (= actual desired)
       (= result true))
     (query
       (= result false)))
   (= z (str test "-run"))
   (insert-fact! z
                 :tag "test-run"
                 :test
                 :result))


(query
  (insert-fact! "test-1"
                :tag "test")

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

(query
  (= test "test-1")
  (fact data :tag "data" :test :a)
  (= value (add-2 a))
  (= id (str test " a: " a " value: " value))
  (insert-fact! id :tag "result" :test :a :value))

(query
  (run-test "test-1"))

; (trace (query [success]
;   (fact data :tag "data" :test "test-1" :a)
;   (= value (add-2 a))
;   (fact expected :tag "expected" :test "test-1" :value)

;   (= expected-count (sum 1))
;   (query [expected-count]
;     (fact expected :tag "expected" :test "test-1" :value)
;     (= expected-count (sum 1)))

;   (= success true)))
