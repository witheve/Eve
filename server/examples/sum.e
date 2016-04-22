(query [s]
  ;; Expected 400
  (insert-fact! "apple" :calories 200)
  (insert-fact! "pineapple" :calories 300)
  (insert-fact! "tapework" :calories -100)
  (fact x :calories c)
  (= s (sum c)))

(query
  (insert-fact! "josh" :tag "employee" :salary 10 :department "engineering")
  (insert-fact! "josh" :tag "employee" :salary 10 :department "engineering")
  (insert-fact! "josh" :tag "employee" :salary 10 :department "engineering")
  (insert-fact! "eric" :tag "employee" :salary 11 :department "magic")
  (insert-fact! "corey" :tag "employee" :salary 10 :department "engineering")
  (insert-fact! "chris" :tag "employee" :salary 7 :department "engineering")
  (insert-fact! "rob" :tag "employee" :salary 7 :department "operations"))

(query [people-count]
  ;; Expected 5
  (fact employee :tag "employee")
  (= people-count (sum 1)))

(query [total-salary]
  ;; Expected 45
  (fact employee :tag "employee" :salary)
  (= total-salary (sum salary)))

(query [department salary-per-department]
  ;; Expected engineering 27
  ;;          magic 11
  ;;          operations 7
  (fact _ :department)
  (query [department salary-per-department]
    (fact employee :tag "employee" :department :salary)
    (= salary-per-department (sum salary))))
