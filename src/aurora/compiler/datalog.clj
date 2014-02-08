(ns aurora.compiler.datalog
  (:require [aurora.compiler.match :as match]))

(defn guard? [pattern]
  (seq? pattern))

(defn bind-in [pattern bound]
  (cond
   (and (seq? pattern) (= 'quote (first pattern))) pattern
   (bound (match/->var pattern)) (match/->var pattern)
   (coll? pattern) (into (empty pattern) (map #(bind-in % bound) pattern))
   :else pattern))

(defn query->cljs [outputs clauses]
  (let [facts (gensym "facts")
        result (gensym "result")
        bound (atom #{})
        patterns (filter #(not (guard? %)) clauses)
        guards (filter guard? clauses)
        bound-patterns (for [pattern patterns]
                         (let [bound-pattern (bind-in pattern @bound)]
                           (swap! bound clojure.set/union (match/->vars pattern))
                           bound-pattern))]
    `(fn [~facts]
       (let [~@(interleave (match/->vars clauses) (repeat nil))
             ~result (transient #{})]
         ~(reduce
           (fn [tail bound-pattern]
             (let [fact (gensym "fact")]
               `(doseq [~fact ~facts]
                  (try
                    ~(match/pattern->cljs bound-pattern fact)
                    ~tail
                    (catch aurora.compiler.match.MatchFailure e#)))))
           `(do
              ~@(for [guard guards]
                  (match/test guard))
              ~@(for [output outputs]
                  `(~'js* ~(str result " = ~{}") (conj! ~result ~output))))
           (reverse bound-patterns))
         (persistent! ~result)))))

(defn parse-outputs&clauses [outputs&clauses]
  ;; syntax is [output+ :where pattern+]
  (loop [outputs []
         outputs&clauses outputs&clauses]
    (assert (not (empty? outputs&clauses)))
    (let [[output|where & outputs&clauses] outputs&clauses]
      (if (= :where output|where)
        (do
          (assert (not (empty? outputs)))
          (assert (not (empty? outputs&clauses)))
          [outputs outputs&clauses])
        (recur (conj outputs output|where) outputs&clauses)))))

(defmacro rule [& outputs&clauses]
  (let [[outputs clauses] (parse-outputs&clauses outputs&clauses)]
    (query->cljs outputs clauses)))

(defmacro defrule [name & outputs&clauses]
  `(def ~name (rule ~@outputs&clauses)))
