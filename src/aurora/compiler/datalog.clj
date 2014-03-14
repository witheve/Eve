(ns aurora.compiler.datalog
  (:require [aurora.compiler.match :as match]
            [aurora.macros :refer [check fnk]]))

(defn op? [op clause]
  (and (seq? clause) (= op (first clause))))

(defn quote-clause [clause vars]
  (condp op? clause
    '+ `(list '~(first clause) (fnk ~vars ~(second clause)))
    '- `(list '~(first clause) (fnk ~vars ~(second clause)))
    '? `(list '~(first clause) (fnk ~vars ~(second clause)))
    `'~clause))

(defn vars [clause]
  (condp op? clause
    '+ed (match/vars (second clause))
    '-ed (match/vars (second clause))
    (if (seq? clause)
      #{}
      (match/vars clause))))

(defn quote-clauses [clauses]
  (let [vars (apply clojure.set/union (map vars clauses))]
    (vec (map #(quote-clause % vars) clauses))))

(defmacro query [& clauses]
  `(query* ~(quote-clauses clauses)))

(defmacro rule [& clauses]
  `(rule* ~(quote-clauses clauses)))
