(aset js/aurora.language "stratifier" nil)

(ns aurora.language.stratifier
  (:require aurora.language.macros
            [aurora.language.representation :as representation :refer [tick]]
            [aurora.language.operation :as operation :refer [run-rule query-rule]])
  (:require-macros [aurora.language.macros :refer [rule]]))

;; RULESETS

(defprotocol Ruleset
  (run-ruleset [this kn] "-> kn"))

(extend-protocol Ruleset
  operation/Rule
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
      (if (instance? operation/Rule stratum)
        stratum
        (Fixpoint. (Chain. (vec stratum))))))))

(defn strata->rules [strata]
  (apply concat
         (for [stratum strata]
           (if (instance? operation/Rule stratum)
             [stratum]
             stratum))))

;; STRATIFICATION

(defn ->facts [rules]
  (set (apply concat
              (for [[rule i] (map vector rules (range (count rules)))]
                (do (assert (instance? operation/Rule rule))
                  (concat [[:rule i]]
                          (for [pred (:preds-in rule)] [:pred-in i pred])
                          (for [pred (:preds-out rule)] [:pred-out i pred])
                          (for [pred (:negs-in rule)] [:neg-in i pred])
                          (for [pred (:negs-out rule)] [:neg-out i pred])))))))

(defn ->kn [rules]
  (tick {:now (->facts rules)}))

;; [:with i j] if rule i must be finished before rule j can be finished
;; [:before i j] if rule i must be finished before rule j can be started

(defn order [groups]
  (reverse (map second (sort-by #(count (first %)) groups))))

(def stratifier-strata
  [;; handle ::any
   (rule [:pred-in _ p]
         (+ [:pred p]))
   (rule [:pred-out _ p]
         (+ [:pred p]))
   (rule [:pred p]
         (+ [:matches p p])
         (+ [:matches :aurora.language.representation/any p])
         (+ [:matches p :aurora.language.representation/any]))
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
   ;; hack around broken aggregates
   (rule [:rule i]
         (+ [:before i ::end]))
   ;; transitive closure
   [(rule [:with i j]
          [:with j k]
          (+ [:with i k]))]
   [(rule [:with i j]
          [:before j k]
          (+ [:before i k]))]
   ;; cycles
   (rule [:before i j]
         (? (= i j)) ;; TODO get pattern matching to handle repeated vars
         (set cycle [k]
              [:before k i])
         (+ [:cycle i cycle]))
   ;; groups
   (rule (set descendants [j]
              [:before i j])
         (+ [:descendants i descendants]))
   (rule (set group [i]
              [:descendants i descendants])
         (+ [:group group descendants]))
   (rule (set groups [descendants group]
              [:group group descendants])
         (= ordering (aurora.language.stratifier.order groups))
         (+ [:ordering ordering]))])

(def stratifier-rules
  (strata->rules stratifier-strata))

(def stratifier-ruleset
  (strata->ruleset stratifier-strata))

(defn stratification [rules]
  (let [kn (->kn rules)
        solved-kn (run-ruleset stratifier-ruleset kn)
        grouped-kn (representation/by-pred-name solved-kn)]
    (if-let [cycles (:cycle grouped-kn)]
      (throw (ex-info "Non-monotonic edge in cycle" {:rules rules :cycles cycles}))
      (let [orderings (:ordering grouped-kn)]
        (assert (= 1 (count orderings)))
        (let [ordering (second (first orderings))
              indices (for [group ordering]
                        (into #{} (map first group)))]
          (assert (= (reduce + (map count indices)) (count rules)))
          indices)))))

(defn stratify [rules]
  (for [group (stratification rules)]
    (mapv #(nth rules %) group)))

;; TESTS

(defn cycles [kn]
  (:cycle (representation/by-pred-name kn)))

(defn ordering [kn]
  (:ordering (representation/by-pred-name kn)))

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

(def test-rules-f
  [(rule [:foo x]
         (- [:bar x]))
   (rule [:bar x]
         (+ [:quux x]))
   (rule [:foo x]
         (- [:quux x]))
   (rule [:quux x]
         (+ [:final x]))])

(representation/by-pred-name (run-ruleset stratifier-ruleset (->kn test-rules-a)))

(try (stratification test-rules-a) (catch :default e e))

(representation/by-pred-name (run-ruleset stratifier-ruleset (->kn test-rules-b)))

(try (stratification test-rules-b) (catch :default e e))

(representation/by-pred-name (run-ruleset stratifier-ruleset (->kn test-rules-c)))

(try (stratification test-rules-c) (catch :default e e))

(representation/by-pred-name (run-ruleset stratifier-ruleset (->kn test-rules-d)))

(stratification test-rules-d)

(representation/by-pred-name (run-ruleset stratifier-ruleset (->kn test-rules-e)))

(try (stratification test-rules-e) (catch :default e e))

(representation/by-pred-name (run-ruleset stratifier-ruleset (->kn test-rules-f)))

(stratification test-rules-f)

(stratification stratifier-rules)

(-> (strata->ruleset (stratify stratifier-rules))
    (run-ruleset (->kn stratifier-rules))
    representation/by-pred-name
    :ordering)
