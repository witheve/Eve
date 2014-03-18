(ns aurora.compiler.datalog
  (:require [aurora.compiler.match :as match]
            [aurora.macros :refer [check fns]]))

(defn op? [op clause]
  (and (seq? clause) (= op (first clause))))

(defn vars [clause]
  (condp op? clause
    '+ed (match/vars (second clause))
    '-ed (match/vars (second clause))
    'set (conj (clojure.set/difference (apply clojure.set/union (map vars (nthnext clause 3))) (nth clause 2)) (nth clause 1))
    'in #{(second clause)}
    '= #{(second clause)}
    (if (seq? clause)
      #{}
      (match/vars clause))))

(defn quote-clause [clause fns-vars]
  (condp op? clause
    '+s `(list '~'+s (fns ~fns-vars ~(second clause)))
    '-s `(list '~'-s (fns ~fns-vars ~(second clause)))
    '? `(list '~'? (fns ~fns-vars ~(second clause)))
    '= `(list '~'= '~(nth clause 1) (fns ~fns-vars ~(nth clause 2)))
    `'~clause))

(defn quote-clauses [clauses]
  (let [fns-vars (into [] (apply clojure.set/union (map vars clauses)))]
    (mapv #(quote-clause % fns-vars) clauses)))

(defmacro query [& clauses]
  `(query* ~(quote-clauses clauses)))

(defmacro rule [& clauses]
  `(rule* ~(quote-clauses clauses)))
