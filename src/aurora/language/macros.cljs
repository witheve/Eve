(aset js/aurora.language "macros" nil)

(ns aurora.language.macros
  (:require [clojure.set :refer [union]]
            [aurora.language.denotation :as denotation]))

(comment ;; grammar
  pattern
  (+ed pattern)
  (-ed pattern)
  (? expr)
  (= var expr)
  (set var vars & clauses)
  ;; (in var var)
  (+ pattern)
  (- pattern)
  (+s expr)
  (-s expr)
  )

(defn op [clause]
  (if (seq? clause)
    (first clause)
    :pattern))

(defn expr->clause [expr]
  (case (op expr)
    :pattern (denotation/->Fact :now expr)
    +ed (denotation/->Fact :asserted-now (nth expr 1))
    -ed (denotation/->Fact :retracted-now (nth expr 1))
    ? (denotation/->Filter (nth expr 1))
    = (denotation/->Let (nth expr 1) (nth expr 2))
    set (denotation/->Set (nth expr 1) (nth expr 2) (mapv expr->clause (nthnext expr 3)))
    + (denotation/->Assert (nth expr 1))
    - (denotation/->Retract (nth expr 1))
    +s (denotation/->AssertMany (nth expr 1))
    -s (denotation/->RetractMany (nth expr 1))))

(defn macroless-rule [exprs]
  (denotation/clauses->rule (mapv expr->clause exprs)))

(comment
  (mapv expr->clause '[[:foo a b]
                       (+ed [:bar b a])
                       (? (= a (inc b)))
                       (+s [a b])])

  (macroless-rule '[[:foo a b]
                    (+ed [:bar b a])
                    (? (= a (inc b)))
                    (+s [a b])])
  )
