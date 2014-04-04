(aset js/aurora.language "macros" nil)

(ns aurora.language.macros
  (:require [clojure.set :refer [union]]
            [aurora.language.jsth :as jsth]
            [aurora.language.denotation :as denotation]))

(comment ;; grammar
  pattern
  (+ed pattern)
  (-ed pattern)
  (? fn)
  (= var fn)
  (set var vars & clauses)
  ;; (in var var)
  (+ pattern)
  (- pattern)
  (+s fn)
  (-s fn)
  )

(defn expr->vars [expr]
  (cond
   (seq? expr) (apply union (map expr->vars (rest expr))) ;; first elem is function
   (coll? expr) (apply union (map expr->vars expr))
   (symbol? expr) #{expr}
   :else #{}))

(defn expr->jsth [expr]
  (clojure.walk/postwalk
   (fn [form]
     (if (and (seq? form) (symbol? (first form)) (not (.test #"\." (name (first form)))))
       (cons (symbol (str "cljs.core." (first form))) (rest form))
       form))
   expr))

(defn expr->fun [expr]
  (apply js/Function (conj (vec (expr->vars expr)) (jsth/statement->string `(return ~(expr->jsth expr))))))

(defn op [clause]
  (if (seq? clause)
    (first clause)
    :pattern))

(defn expr->clause [expr]
  (case (op expr)
    :pattern (denotation/->Fact :now expr)
    +ed (denotation/->Fact :asserted-now (nth expr 1))
    -ed (denotation/->Fact :retracted-now (nth expr 1))
    ? (denotation/->Filter (vec (expr->vars (nth expr 1))) (expr->fun (nth expr 1)))
    = (denotation/->Let (nth expr 1) (vec (expr->vars (nth expr 2))) (expr->fun (nth expr 2)))
    set (denotation/->Set (nth expr 1) (nth expr 2) (mapv expr->clause (nthnext expr 3)))
    + (denotation/->Assert (nth expr 1))
    - (denotation/->Retract (nth expr 1))
    +s (denotation/->AssertMany (vec (expr->vars (nth expr 1))) (expr->fun (nth expr 1)))
    -s (denotation/->RetractMany (vec (expr->vars (nth expr 1))) (expr->fun (nth expr 1)))))

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
