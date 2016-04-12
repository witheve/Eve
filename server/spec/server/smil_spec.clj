(ns server.smil-spec
  (:refer-clojure :exclude [read])
  (:require [speclj.core :refer :all]
            [server.spec-util :refer :all]
            [server.smil :refer :all]))

(describe
 "congeal-body"
 (it "shallowly flattens single child vec"
     (should= [1 2 3] (congeal-body [[1 2 3]])))
 (it "shallowly flattens child vecs"
     (should= ['a 1 :b 2 3] (congeal-body ['a [1] :b [2 3]])))
 (it "leaves seqs alone"
     (should= ['(a) 1 2 3] (congeal-body ['(a) 1 [2 3]])))
 (it "leaves deeper vecs alone"
     (should= [[1] 2 3] (congeal-body [[[1]] [2] 3])))
 (it "returns an empty vec from []"
     (should= [] (congeal-body [])))
 (it "returns an empty vec from nil"
     (should= [] (congeal-body nil))))

(describe
 "get-schema"
 (it "returns nil for special forms"
     (doseq [op ['insert-fact! 'fact 'define! 'query]]
       (should= nil (get-schema op))))
 (it "returns nil for unknown forms"
     (doseq [op ['flappy-bird! 7 "catbug"]]
       (should= nil (get-schema op))))
 (it "should return the schema for normal forms and primitives"
     (doseq [op ['if 'union '+ '> 'sum]]
       (should (get-schema op))))
 (it "should look up implications from the edb"))

(describe
 "parse-schema"
 (it "should parse simple kwargs"
     (should= {:a 1 :b 2}
              (parse-schema {:kwargs [:a :b]} (list 'foo :a 1 :b 2))))
 (it "should parse implied kwargs"
     (should= {:a 'a}
              (parse-schema {:kwargs [:a]} (list 'foo :a)))
     (should= {:a 'a :b 2}
              (parse-schema {:kwargs [:a :b]} (list 'foo :a :b 2)))
     (should= {:a 1 :b 'b}
              (parse-schema {:kwargs [:a :b]} (list 'foo :a 1 :b))))
 (it "should parse rest args"
     (should= {:a 1 :others [2 3]}
              (parse-schema {:kwargs [:a] :rest :others} (list 'foo :a 1 2 3)))
     (should= {:others ["hi" "world"]}
              (parse-schema {:kwargs [:a] :rest :others} (list 'foo "hi" "world")))
     (should= {:a 1 :others ["hi" "world"]}
              (parse-schema {:kwargs [:a] :rest :others} (list 'foo :a 1 "hi" "world"))))
 (it "should parse positional args"
     (should= {:a 1 :b 2 :c 3}
              (parse-schema {:args [:a :b :c]} (list 'foo 1 2 3)))
     (should= {:a 3 :b 1 :c 2}
              (parse-schema {:args [:b :c :a]} (list 'foo 1 2 3)))
     (should= {:a 1 :b 2 :kw 3 :rest [4]}
              (parse-schema {:args [:a :b] :kwargs [:kw] :rest :rest} (list 'foo 1 2 :kw 3 4)))))

(describe
 "parse-define"
 (it "should parse a simple implication"
     (should= {:header ['foo ['a]] :body []}
              (parse-define '(define! foo [a])))
     (should= {:header ['foo ['a 'b]] :body ['(+ 2 2)]}
              (parse-define '(define! foo [a b] (+ 2 2))))
     (should= {:header ['foo ['a 'b]] :body ['(= a (+ 2 2)) '(= b (* 4 7))]}
              (parse-define '(define! foo [a b]
                               (= a (+ 2 2))
                               (= b (* 4 7))))))
 (it "should parse an implication with multiple aliases"
     (should= {:header ['foo ['a] 'bar ['a]] :body ['(= a 5)]}
              (parse-define '(define! foo [a]
                                      bar [a]
                               (= a 5)))))
 (it "should not parse an implication with no aliases"
     (should-throw (parse-define '(define!)))
     (should-throw (parse-define '(define! [a])))
     (should-throw (parse-define '(define! foo)))
     (should-throw (parse-define '(define! (+ 2 2))))))

(describe
 "parse-query"
 (it "should parse an empty query"
     (should= {:params nil :body []}
              (parse-query '(query))))
 (it "should parse a query without parameters"
     (should= {:params nil :body ['(+ 1 2)]}
              (parse-query '(query (+ 1 2))))
     (should= {:params nil :body ['(+ 1 2) '(= a 1)]}
              (parse-query '(query
                             (+ 1 2)
                             (= a 1)))))
 (it "should parse a query with parameters"
     (should= {:params ['a] :body ['(+ a 2)]}
              (parse-query '(query [a] (+ a 2))))
     (should= {:params ['a 'b] :body ['(+ b a) '(= a 1)]}
              (parse-query '(query [a b]
                              (+ b a)
                              (= a 1))))))

(describe
 "parse-fact"
 (it "should parse a single entity"
     (should-include {:entity 'foo :facts [['foo]]}
              (parse-fact '(fact foo)))
     (should-include {:entity "foo" :facts [["foo"]]}
              (parse-fact '(fact "foo"))))
 (it "should parse an entity with kv pairs"
     (should-include {:entity 'foo :facts [['foo "bar" 1]]}
                     (parse-fact '(fact foo :bar 1)))
     (should-include {:entity 'foo :facts [['foo "bar" 'color] ['foo "baz" "hi"]]}
                     (parse-fact '(fact foo :bar color :baz "hi"))))
 (it "should accept implicit keys"
     (should-include {:entity 'foo :facts [['foo "bar" 'bar]]}
                     (parse-fact '(fact foo :bar)))
     (should-include {:entity 'foo :facts [['foo "bar" 'bar] ['foo "baz" "hi"]]}
                     (parse-fact '(fact foo :bar :baz "hi")))
     (should-include {:entity 'foo :facts [['foo "bar" 'color] ['foo "baz" 'baz]]}
                     (parse-fact '(fact foo :bar color :baz))))
 (it "should not parse a variable in place of an attribute"
     (should-throw (parse-fact '(fact foo bar)))
     (should-throw (parse-fact '(fact foo bar 7)))))

(describe
 "assert-valid")

(describe
 "expand"
 (it "should expand primitives"
     (should= '(query nil (* :a 2 :b 2))
              (expand nil '(query (* 2 2))))
     (should= '(query [x] (+ :a 1 :b x))
              (expand nil '(query [x] (+ 1 x))))
     (should= '(query [x] (= :a x :b (- :a 1 :b 3)))
              (expand nil '(query [x] (= x (- 1 3))))))

(it "should expand define!"
     (should= '(define! foo [a]
                 (+ :a a :b 1))
              (expand nil '(define! foo [a]
                             (+ a 1)))))

(it "should expand union"
     (should= '(union [a]
                      (query nil (= :a a :b 1))
                      (query nil (= :a a :b 2)))
              (expand nil '(union [a]
                                  (query (= a 1))
                                  (query (= a 2))))))

(it "should expand choose"
     (should= '(choose [a]
                      (query nil (= :a a :b 1))
                      (query nil (= :a a :b 2)))
              (expand nil '(choose [a]
                                  (query (= a 1))
                                  (query (= a 2))))))

 (it "should expand insert-fact!"
     (should= '(query nil
                      (insert-fact-btu! :entity e :attribute "a" :value "v"))
              (expand nil '(query (insert-fact! e :a "v"))))
     (should= '(query nil
                      (insert-fact-btu! :entity e :attribute "a" :value "v")
                      (insert-fact-btu! :entity e :attribute "b" :value v2))
              (expand nil '(query (insert-fact! e :a "v" :b v2))))
     (should= '(query nil
                      (insert-fact-btu! :entity e :attribute "a" :value a)
                      (insert-fact-btu! :entity e :attribute "b" :value b))
              (expand nil '(query (insert-fact! e :a :b)))))

 (it "should not expand insert-fact! with a variable in place of an attribute"
     (should-throw (expand nil '(query (insert-fact! e a v)))))

 (it "should not expand insert-fact! with incomplete bindings"
     (should-throw (expand nil '(query (insert-fact! e))))
     (should-throw (expand nil '(query (insert-fact! e "a")))))

 (it "should expand fact"
     (should= '(query nil
                      (fact-btu :entity e))
              (expand nil '(query (fact e))))
     (should= '(query nil
                      (fact-btu :entity e :attribute "a" :value v))
              (expand nil '(query (fact e :a v))))
     (should= '(query nil
                      (fact-btu :entity e :attribute "a" :value v)
                      (fact-btu :entity e :attribute "b" :value "v2"))
              (expand nil '(query (fact e :a v :b "v2"))))
     (should= '(query nil
                      (fact-btu :entity e :attribute "a" :value a)
                      (fact-btu :entity e :attribute "b" :value b))
              (expand nil '(query (fact e :a :b)))))

 (it "should not expand fact with a variable in place of an attribute"
     (should-throw (expand nil '(query (fact e a v)))))

 (it "should expand remove-by-t!"
     (should= (list 'insert-fact-btu! :entity REMOVE_FACT :attribute 5 :value nil)
              (expand nil '(remove-by-t! 5))))

 (it "should expand if"
     (should= '(choose [return]
                      (query nil
                             (fact-btu :entity _ :attribute "tag" :value "person")
                             (= :a return :b "person"))
                      (query nil (= :a return :b "animal")))
              (expand nil '(if (fact _ :tag "person")
                             "person"
                             "animal"))))

 (it "should expand not"
     (should= '(not (= :a 4 :b (+ :a 1 :b 3)))
              (expand nil '(not (= 4 (+ 1 3))))))

 (it "should expand context"))

(describe
 "unpack"
 (it "should unpack scopes")
 (it "should unpack sexprs")
 (it "should unpack returnables into parent scope")
 (it "should bind a variable to a returnable")
 (it "should bind two returnables with a tmp variable")
 (it "should not unpack two variables"))

 (run-specs)
