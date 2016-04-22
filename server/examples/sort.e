(query
  (insert-fact! "josh" :tag "employee" :salary 10 :age 22 :department "engineering")
  (insert-fact! "josh" :tag "employee" :salary 10 :age 22 :department "engineering")
  (insert-fact! "josh" :tag "employee" :salary 10 :age 22 :department "engineering")
  (insert-fact! "eric" :tag "employee" :salary 10 :age 3.1415 :department "magic")
  (insert-fact! "corey" :tag "employee" :salary 10 :age 29 :department "engineering")
  (insert-fact! "chris" :tag "employee" :salary 7 :age 212 :department "engineering")
  (insert-fact! "rob" :tag "employee" :salary 7 :age 212 :department "operations"))

(query [person order]
  ;; Expected eric 3.1415
  ;;          josh 22
  ;;          corey 29
  ;;          chris 212
  ;;          rob 212
  (fact person :age)
  (= order (sort age "ascending")))

(query [person order]
  ;; Expected chris 212
  ;;          rob 212
  ;;          corey 29
  ;;          josh 22
  ;;          eric 3.1415
  (fact person :age)
  (= order (sort age "descending")))

(query [person order]
  ;; Expected chris 212
  ;;          rob 212
  ;;          eric 3.1415
  ;;          josh 22
  ;;          corey 29
  (fact person :age :salary)
  (= order (sort salary "ascending" age "ascending")))
