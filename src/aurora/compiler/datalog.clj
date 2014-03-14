(ns aurora.compiler.datalog
  (:require [aurora.compiler.match :as match]
            [aurora.macros :refer [check fnk]]))

(defn quote-clause [clause vars]
  (if (and (seq? clause) (#{'+ '- '?} (first clause)))
    `(list '~(first clause) (fnk ~vars ~(second clause))) ;; TODO capture vars correctly for graph dependencies
    `'~clause))

(defn vars [clause]
  (cond
   (and (seq? clause) (#{'+ed '-ed} (first clause))) (match/vars (second clause))
   (seq? clause) #{}
   :else (match/vars clause)))

(defn quote-clauses [clauses]
  (let [vars (apply clojure.set/union (map vars clauses))]
    (vec (map #(quote-clause % vars) clauses))))

(defmacro query [& clauses]
  `(query* ~(quote-clauses clauses)))

(defmacro rule [& clauses]
  `(rule* ~(quote-clauses clauses)))
