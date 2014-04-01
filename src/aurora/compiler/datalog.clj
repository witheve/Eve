(ns aurora.compiler.datalog
  (:require [aurora.compiler.match :as match :refer [match]]))

(defn op [clause]
  (if (seq? clause)
    (first clause)
    :pattern))

(defn check-clause [clause]
  (case (op clause)
    :pattern nil
    +ed (assert (= 2 (count clause)) (pr-str clause))
    -ed (assert (= 2 (count clause)) (pr-str clause))
    ? (assert (and (= 3 (count clause))
                   (vector? (nth clause 1)))
              (pr-str clause))
    = (assert (and (= 4 (count clause))
                   (symbol? (nth clause 1))
                   (vector? (nth clause 2)))
              (pr-str clause))
    set (assert (and (>= (count clause) 3)
                     (symbol? (nth clause 1))
                     (vector? (nth clause 2))
                     (mapv check-clause (nthnext clause 3)))
                (pr-str clause))
    + (assert (= 2 (count clause)) (pr-str clause))
    - (assert (= 2 (count clause)) (pr-str clause))
    > (assert (= 3 (count clause)) (pr-str clause))
    +s (assert (and (= 3 (count clause))
                    (vector? (nth clause 1)))
               (pr-str clause))
    -s (assert (and (= 3 (count clause))
                    (vector? (nth clause 1)))
               (pr-str clause))))

(defn quote-clause [clause]
  (case (op clause)
    +s `(list '~'+s '~(nth clause 1) (fn ~(nth clause 1) ~(nth clause 2)))
    -s `(list '~'-s '~(nth clause 1) (fn ~(nth clause 1) ~(nth clause 2)))
    ? `(list '~'? '~(nth clause 1) (fn ~(nth clause 1) ~(nth clause 2)))
    = `(list '~'= '~(nth clause 1)'~(nth clause 2) (fn ~(nth clause 2) ~(nth clause 3)))
    set `(list '~'set '~(nth clause 1) '~(nth clause 2) ~@(map quote-clause (nthnext clause 3)))
    `'~clause))

(defmacro rule [& clauses]
  (mapv check-clause clauses)
  `(clauses->rule ~(mapv quote-clause clauses)))
