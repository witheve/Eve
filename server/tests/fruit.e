(define! friend [fruit friend]
  (fact fruit :tag "fruit")
  (fact fruit :color color)
  (fact friend :color color)
  (fact friend :tag "fruit")
  (not= fruit friend))

(query [f]
       (insert-fact! "apple" :color "red" :tag "fruit")
       (insert-fact! "banana" :color "yellow" :tag "fruit")
       (insert-fact! "pineapple" :color "yellow" :tag "fruit")
       (insert-fact! "persimmon" :color "fruit" :tag "fruit")
       (insert-fact! "orange" :color "orange" :tag "fruit")
       (insert-fact! "lemon" :color "yellow" :tag "fruit")
       (insert-fact! "mango" :color "yellow" :tag "fruit")
       (insert-fact! "pomegranate" :color "red" :tag "fruit")
       (insert-fact! "kiwi" :color "green" :tag "fruit")
       (insert-fact! "starfruit" :color "green" :tag "fruit")
       (insert-fact! "blueberry" :color "blue" :tag "fruit")
       (insert-fact! "strawberry" :color "red" :tag "fruit"))


(query
  (insert-fact! "fruit"
                :tag "test")

  (insert-fact! "fruit-expected-1"
                :tag "expected"
                :test "fruit"
                :value "mango")

  (insert-fact! "fruit-expected-2"
                :tag "expected"
                :test "fruit"
                :value "banana")

  (insert-fact! "t2-expected-3"
                :tag "expected"
                :test "fruit"
                :value "pineapple")

  (insert-fact! "t2-data-1"
                :tag "data"
                :test "fruit"
                :a "lemon"))



(query
  (= test "fruit")
  (friend :fruit "lemon" :friend value))
  (= id (str test " a: " a " value: " value))
  (insert-fact! id :tag "result" :test :a :value))