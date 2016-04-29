Eve is a variant of [Datalog](https://en.wikipedia.org/wiki/Datalog), based heavily on [Dedalus](http://www.eecs.berkeley.edu/Pubs/TechRpts/2009/EECS-2009-173.html) and [Functional-Relational Programming](http://shaffner.us/cs/papers/tarpit.pdf). It is a general-purpose, data-centric, interactive language. Picture a relational spreadsheet with I/O.

```clojure
(define! foo [name return]
        bar [age]
  (fact person :tag "person"
               :age
               :name)
  (= return 3)
  (= x (+ 20 age))

(define! eav [entity attribute value]
  (fact department :tag "department")
  (query
    (fact employee :tag "employee"
                   :department department
                   :salary)
    (= value (sum salary)))
  (= entity department)
  (= attribute "total cost"))

(define! hops [from to hops]
  (choose [from to hops]
      (query
        (fact link :tag "link"
                   :from
                   :to)
        (= hops 1))
      (query
        (fact link :tag "link"
                   :from
                   :to to2)
        (fact link :tag "link"
                   :from to2
                   :to)
        (= hops 2))))

(define! awesomeness [value return]
  (= return (if (> value 5)
              (* value 10)
              (/ value 10))))

(define! count-of-employees-and-spouses [return]
 (union [person]
  (query
   (fact person :tag "employee"))
  (query
   (fact employee :tag "employee"
                  :spouse person)))
 (= return (count)))

(query
  (fact people :tag "person")
  (not (fact people :tag "employee")))

(query
  (click :element :time)
  (= ent (concat "click|" element "|" time))
  (insert-fact! (ent "tag" "click")
                (ent "element" element))))

(query
 (fact :attribute "tag" :value "invalid" :time t)
 (remove-by-t! t))
```
