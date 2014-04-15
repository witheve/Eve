(ns aurora.language.macros
  (:require [clojure.set :refer [union]]
            [aurora.language.operation :as operation]
            [aurora.language.denotation :as denotation]))

(comment ;; grammar
  pattern
  (+ed pattern)
  (-ed pattern)
  (? expr)
  (= var expr)
  (set var vars & clauses)
  ;; (in var var)
  (> pattern)
  (+ pattern)
  (- pattern)
  (>s expr)
  (+s expr)
  (-s expr)
  )

(defn op [clause]
  (if (seq? clause)
    (first clause)
    :pattern))

(defn expr->clause [expr]
  (case (op expr)
    :pattern (denotation/->Fact :now&pretended expr)
    >ed (denotation/->Fact :pretended (nth expr 1))
    +ed (denotation/->Fact :asserted (nth expr 1))
    -ed (denotation/->Fact :retracted (nth expr 1))
    ? (denotation/->Filter (nth expr 1))
    = (denotation/->Let (nth expr 1) (nth expr 2))
    set (denotation/->Set (nth expr 1) (nth expr 2) (mapv expr->clause (nthnext expr 3)))
    > (denotation/->Output :pretend (nth expr 1))
    + (denotation/->Output :assert (nth expr 1))
    - (denotation/->Output :retract (nth expr 1))
    >s (denotation/->OutputMany :pretend (nth expr 1))
    +s (denotation/->OutputMany :assert (nth expr 1))
    -s (denotation/->OutputMany :retract (nth expr 1))))

(defn macroless-rule [exprs]
  (operation/prepared (denotation/clauses->rule (mapv expr->clause exprs))))


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
