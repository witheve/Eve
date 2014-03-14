(ns aurora.compiler.datalog
  (:require [aurora.compiler.match :as match]
            [aurora.macros :refer [check fnk]]))

(defn quote-clause [clause vars]
  (if (and (seq? clause) (#{'+ '- '?} (first clause)))
    `(list '~(first clause) (fnk ~vars ~(second clause))) ;; TODO capture vars correctly for graph dependencies
    `'~clause))

(defn quote-clauses [clauses]
  (let [vars (match/vars (filter #(not (seq? %)) clauses))]
    (vec (map #(quote-clause % vars) clauses))))

(defmacro query [& clauses]
  `(query* ~(quote-clauses clauses)))

(defmacro rule [& clauses]
  `(rule* ~(quote-clauses clauses)))

(aurora.compiler.datalog/rule*
  ['[a b _]
   '(+ed [_ a b])
   (clojure.core/list '? (aurora.macros/fnk #{a b} (integer? a)))
   (clojure.core/list '+ (aurora.macros/fnk #{a b} [a a a]))
   (clojure.core/list '- (aurora.macros/fnk #{a b} [b b b]))])
