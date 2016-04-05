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
       (insert-fact! "strawberry" :color "red" :tag "fruit")
       (friend :fruit "lemon" :friend f))

