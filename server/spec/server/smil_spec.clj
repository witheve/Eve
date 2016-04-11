(ns server.smil-spec
  (:refer-clojure :exclude [read])
  (:require [speclj.core :refer :all]
            [server.smil :refer :all]))

(defmacro should-include [expected-form actual-form]
  `(let [expected# ~expected-form
         actual# ~actual-form]
     (when-not (= expected# (select-keys actual# (keys expected#)))
       (-fail (str "Missing keys: " (filter #(not (contains? (keys actual#))) (keys expected#)) speclj.platform/endl
                   "     Expected: " (-to-s expected#) speclj.platform/endl
                   "     got: " (-to-s actual#) " (using ~=)")))))

;;(should~= 4 (+ 1 3))


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
     (should-contain {:entity 'foo :facts [['foo]]}
              (parse-fact '(fact foo)))
     (should-contain {:entity "foo" :facts [["foo"]]}
              (parse-fact '(fact "foo"))))
 (it "should parse an entity with kv pairs")
 (it "should accept implicit keys")
 (it "should not parse a variable in place of an attribute"))

(describe
 "validate-args")

(describe
 "expand")

(describe
 "unpack-inline")

(describe
 "unpack")

 (run-specs)
