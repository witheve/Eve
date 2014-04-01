(aset js/aurora.compiler "stratifier" nil)

(ns aurora.compiler.stratifier
  (:require [aurora.compiler.datalog :as datalog :refer [tick run-rule query-rule]])
  (:require-macros [aurora.macros :refer [check deftraced]]
                   [aurora.compiler.match :refer [match]]
                   [aurora.compiler.datalog :refer [rule]]))

;; RULESETS

(defprotocol Ruleset
  (run-ruleset [this kn] "-> kn"))

(extend-protocol Ruleset
  datalog/Rule
  (run-ruleset [this kn]
               (run-rule this kn)))

(defrecord Chain [rulesets]
  Ruleset
  (run-ruleset [this kn]
               (reduce #(run-ruleset %2 %1) kn rulesets)))

(defrecord Fixpoint [ruleset]
  Ruleset
  (run-ruleset [this kn]
               (let [new-kn (run-ruleset ruleset kn)]
                 (if (= kn new-kn) ;; TODO this is a very slow test
                   new-kn
                   (recur this new-kn)))))

(defn strata->ruleset [strata]
  (Chain.
   (vec
    (for [stratum strata]
      (if (instance? datalog/Rule stratum)
        stratum
        (Fixpoint. (Chain. (vec stratum))))))))

;; STRATIFICATION

;; Care about non-monotonic and monotonic cycles separately

(defn ->facts [rules]
  (set (apply concat
              (for [[rule i] (map vector rules (range (count rules)))]
                (concat [[:rule i]]
                        (for [pred (:preds-in rule)] [:pred-in i pred])
                        (for [pred (:preds-out rule)] [:pred-out i pred])
                        (for [pred (:negs-in rule)] [:neg-in i pred])
                        (for [pred (:negs-out rule)] [:neg-out i pred]))))))

(defn ->kn [rules]
  (tick {:now (->facts rules)}))

;; [:with i j] if rule i must be finished before rule j can be finished
;; [:before i j] if rule i must be finished before rule j can be started

;; need to order rules, not predicates...

(def ordering-rules
  [;; handle ::any
   (rule [:pred-in _ p]
         (+ [:pred p]))
   (rule [:pred-out _ p]
         (+ [:pred p]))
   (rule [:pred p]
         (+ [:matches p p])
         (+ [:matches :aurora.compiler.datalog/any p])
         (+ [:matches p :aurora.compiler.datalog/any]))
   ;; find edges
   (rule [:pred-out i p]
         [:pred-in j q]
         [:matches p q]
         (+ [:with i j]))
   (rule [:pred-out i p]
         [:neg-in j q]
         [:matches p q]
         (+ [:before i j]))
   (rule [:neg-out i p]
         [:pred-in j q]
         [:matches p q]
         (+ [:before i j]))
   ;; transitive closure
   [(rule [:with i j]
          [:with j k]
          (+ [:with i k]))]
   [(rule [:with i j]
          [:before j k]
          (+ [:before i k]))]
   ;; cycles
   (rule [:before i j]
         (? [i j] (= i j)) ;; TODO get pattern matching to handle repeated vars
         (set cycle [k]
              [:before k i])
         (+ [:cycle i cycle]))])

;; TESTS

(defn cycles [kn]
  (:cycle (datalog/by-pred-name kn)))

(def test-rules-a
  [(rule [:foo x]
         (- [:bar x]))
   (rule [:bar x]
         (- [:foo x]))])

(def test-rules-b
  [(rule [:foo x]
         (- [:bar x]))
   (rule [:bar x]
         (+ [:foo x]))])

(def test-rules-c
  [(rule [:foo x]
         (- [:bar x]))
   (rule any
         (+ [:foo any]))])

(def test-rules-d
  [(rule [:foo x]
         (- [:bar x]))
   (rule any
         (+ [:quux any]))])

(def test-rules-e
  [(rule [:foo x]
         (- [:bar x]))
   (rule [:bar x]
         (+ [:quux x]))
   (rule [:quux x]
         (+ [:foo x]))])

(run-ruleset (strata->ruleset ordering-rules) (->kn test-rules-a))

(cycles (run-ruleset (strata->ruleset ordering-rules) (->kn test-rules-a)))

(datalog/by-pred-name (run-ruleset (strata->ruleset ordering-rules) (->kn test-rules-b)))

(cycles (run-ruleset (strata->ruleset ordering-rules) (->kn test-rules-b)))

(datalog/by-pred-name (run-ruleset (strata->ruleset ordering-rules) (->kn test-rules-c)))

(cycles (run-ruleset (strata->ruleset ordering-rules) (->kn test-rules-c)))

(datalog/by-pred-name (run-ruleset (strata->ruleset ordering-rules) (->kn test-rules-d)))

(cycles (run-ruleset (strata->ruleset ordering-rules) (->kn test-rules-d)))

(datalog/by-pred-name (run-ruleset (strata->ruleset ordering-rules) (->kn test-rules-e)))

(cycles (run-ruleset (strata->ruleset ordering-rules) (->kn test-rules-e)))
