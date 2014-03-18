(ns aurora.compiler.datalog
  (:require [aurora.compiler.match :as match]
            [aurora.macros :refer [check fnk]]))

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

(defn quote-clause [clause fnk-vars]
  (condp op? clause
    '+ `(list '~'+ (fnk ~fnk-vars ~(second clause)))
    '+s `(list '~'+s (fnk ~fnk-vars ~(second clause)))
    '- `(list '~'- (fnk ~fnk-vars ~(second clause)))
    '-s `(list '~'-s (fnk ~fnk-vars ~(second clause)))
    '> (let [update-vars (into [] (clojure.set/union (set fnk-vars) (vars (nth clause 1))))]
         `(list '~'> '~(nth clause 1) (fnk ~update-vars ~(nth clause 2))))
    '? `(list '~'? (fnk ~fnk-vars ~(second clause)))
    '= `(list '~'= '~(nth clause 1) (fnk ~fnk-vars ~(nth clause 2)))
    `'~clause))

(defn quote-clauses [clauses]
  (let [fnk-vars (into [] (apply clojure.set/union (map vars clauses)))]
    (mapv #(quote-clause % fnk-vars) clauses)))

(defmacro query [& clauses]
  `(query* ~(quote-clauses clauses)))

(defmacro rule [& clauses]
  `(rule* ~(quote-clauses clauses)))
