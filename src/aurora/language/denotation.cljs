(aset js/aurora.language "denotation" nil)

(ns aurora.language.denotation
  (:require [clojure.set :refer [union intersection difference subset?]]
            [aurora.language.jsth :as jsth]
            [aurora.language.match :as match]
            [aurora.language.representation :refer [pred-name tick ->Knowledge]]
            [aurora.language.operation :refer [+node +assert +retract ->project ->join ->filter ->let ->group ->map ->mapcat ->merge ->Rule query-rule run-rule]])
  (:require-macros [aurora.macros :refer [check console-time set!! conj!! disj!! assoc!!]]
                   [aurora.language.macros :refer [query rule]]))

;; RULE ANALYSIS

(defn op [clause]
  (if (seq? clause)
    (first clause)
    :pattern))

(defn preds-in [clause]
  ;; TODO check not nil
  (case (op clause)
    :pattern #{(pred-name clause)}
    +ed #{(pred-name (second clause))}
    -ed #{(pred-name (second clause))}
    set (apply clojure.set/union (map preds-in (nthnext clause 3)))
    > (let [from-name (pred-name (nth clause 1))
            to-name (pred-name (nth clause 2))]
        (check from-name)
        (check (or (= :aurora.language.representation/any to-name) (= from-name to-name)))
        #{from-name})
    #{}))

(defn preds-out [clause]
  ;; TODO check not nil
  (case (op clause)
    + #{(pred-name (nth clause 1))}
    - #{(pred-name (nth clause 1))}
    +s #{:aurora.language.representation/any}
    -s #{:aurora.language.representation/any}
    > (let [from-name (pred-name (nth clause 1))
            to-name (pred-name (nth clause 2))]
        (check from-name)
        (check (or (= :aurora.language.representation/any to-name) (= from-name to-name)))
        #{from-name})
    #{}))

(defn negs-in [clause]
  ;; TODO check not nil
  (case (op clause)
    set (apply clojure.set/union (map preds-in (nthnext clause 3)))
    #{}))

(defn negs-out [clause]
  ;; TODO check not nil
  (case (op clause)
    - #{(pred-name (nth clause 1))}
    -s #{:aurora.language.representation/any}
    > (let [from-name (pred-name (nth clause 1))
            to-name (pred-name (nth clause 2))]
        (check from-name)
        (check (or (= :aurora.language.representation/any to-name) (= from-name to-name)))
        #{from-name})
    #{}))

;; PLANS

(defn clauses->body [plan clauses]
  ;; projects/sets, joins, lets, filters, (asserts, retracts, updates)
  (let [projects (for [clause clauses
                       :when (#{:pattern '+ed '-ed 'set} (op clause))]
                   (case (op clause)
                     :pattern (+node plan (->project :now clause))
                     +ed (+node plan (->project :asserted-now (second clause)))
                     -ed (+node plan (->project :retracted-now (second clause)))
                     set (+node plan (->group (clauses->body plan (nthnext clause 3)) (nth clause 1) (nth clause 2)))))
        _ (assert (seq projects) "Rules without any project clauses are illegal")
        joined (reduce #(+node plan (->join %1 %2)) projects)
        letted (loop [[_ shape :as node] joined
                      lets (filter #(= '= (op %)) clauses)]
                 (if (seq lets)
                   (let [set-shape (set shape)
                         applicable (filter #(every? set-shape (nth % 2)) lets)
                         unapplicable (filter #(not (every? set-shape (nth % 2))) lets)
                         _ (assert (seq applicable) (str "Can't resolve loop in " (pr-str unapplicable)))
                         new-node (reduce #(+node plan (->let %1 (nth %2 1) (nth %2 2) (nth %2 3))) node applicable)]
                     (recur new-node unapplicable))
                   node))
        filtered (reduce #(+node plan (->filter %1 (nth %2 1) (nth %2 2))) letted (filter #(= '? (op %)) clauses))]
    filtered))

(defn clauses->rule [clauses]
  (let [plan #js []
        rule (->Rule plan #js [] #js []
                     (apply union (map preds-in clauses))
                     (apply union (map preds-out clauses))
                     (apply union (map negs-in clauses))
                     (apply union (map negs-out clauses)))
        body (clauses->body plan clauses)]
    (doseq [clause clauses]
      (case (op clause)
        + (+assert rule (->map body (nth clause 1)))
        - (+retract rule (->map body (nth clause 1)))
        +s (+assert rule (->mapcat body (nth clause 1) (nth clause 2)))
        -s (+retract rule (->mapcat body (nth clause 1) (nth clause 2)))
        ;; (> p q) -> p (- p) (+ q)
        ;; NOTE the tagging / merging is a hack that is useful for hand-written rules
        > (let [[_ retract-pattern assert-pattern] clause
                retract-sym (gensym "retract")
                tagged-retract-pattern (with-meta retract-pattern {:tag retract-sym})
                retractees (+node plan (->join body (+node plan (->project :now tagged-retract-pattern))))]
            (+retract rule (->map retractees retract-sym))
            (+assert rule (->merge retractees assert-pattern retract-sym)))
        nil))
    rule))

;;*********************************************************
;; Macroless-ness
;;*********************************************************

(defn fns* [syms body & [allowed-fns]]
  (let [body (for [b body]
               (if (list? b)
                 (conj (rest b) (or (when (= (first b) 'js*)
                                      (first b))
                                    (allowed-fns (first b))
                                    (->> (first b)
                                         (jsth/munge)
                                         (str "cljs.core.")
                                         (symbol))))
                 b))]
    ((js/Function "gened" (str "return "(jsth/statement->string `(fn foo [~@syms]
                                                                   (do
                                                                     ~@(butlast body)
                                                                     (return ~(last body))))))))))


(defn expr->vars [expr]
  (cond
   (seq? expr) (apply union (map expr->vars (rest expr))) ;; first elem is function
   (coll? expr) (apply union (map expr->vars expr))
   (symbol? expr) #{expr}
   :else #{}))

(defn quote-clause [clause allowed-fns]
  (case (op clause)
    +s (list '+s (vec (expr->vars (second clause))) (fns* (vec (expr->vars (second clause))) [(second clause)] allowed-fns))
    -s (list '-s (vec (expr->vars (second clause))) (fns* (vec (expr->vars (second clause))) [(second clause)] allowed-fns))
    ? (list '? (vec (expr->vars (second clause))) (fns* (vec (expr->vars (second clause))) [(second clause)] allowed-fns))
    = (let [args (if (= (count clause) 4)
                   (nth clause 3)
                   (vec (expr->vars (nth clause 2))))]
        (list '= (nth clause 1) args (fns* args [(nth clause 2)] allowed-fns)))
    clause))

(defn quote-clauses
  ([clauses] (quote-clauses clauses {}))
  ([clauses allowed-fns]
   (mapv #(quote-clause % allowed-fns) clauses)))

(defn macroless-rule [clauses]
  (clauses->rule (quote-clauses clauses)))

;; TESTS

(comment
  (enable-console-print!)

  (query-rule
   (rule [a b _]
         [_ a b]
         (? [a] (integer? a))
         (+ [a b]))
   (tick {:now #{[1 2 3] [2 3 4] [:a :b :c] [:b :c :d]}}))

  (quote-clauses '[[a b c]
                   (= foo (+ b 4))
                   (+ [a foo])])

  (quote-clause '(+s [[a] [b] [c]]) {})

  (query-rule
   (clauses->rule (quote-clauses '[[a b c]
                                   (= foo (+ b 4))
                                   (+s [[a] [b] [c]])
                                   (+ [a foo])]))
   (tick {:now #{[1 2 3] [3 4 5]}}))

  (query-rule
   (rule [a b c]
         (= foo [b] (+ b 4))
         (+s [a b c] [[a] [b] [c]])
         (+ [a foo]))
   (tick {:now #{[1 2 3] [3 4 5]}}))

  (run-rule
   (rule [a b _]
         [_ a b]
         (? [a] (integer? a))
         (+ [a a a])
         (- [b b b]))
   (tick {:now #{[1 2 3] [2 3 4] [:a :b :c] [:b :c :d]}}))

  (run-rule
   (rule [a b _]
         (+ed [_ a b])
         (? [a] (integer? a))
         (+ [a a a])
         (- [b b b]))
   (->Knowledge #{[2 3 4] [:a :b :c] [:b :c :d]} #{[1 2 3]} #{} #{[2 3 4] [:a :b :c] [:b :c :d] [1 2 3]}))

  (run-rule
   (rule [a b _]
         [_ a b]
         (? [a] (integer? a))
         (+ [a a a])
         (- [b b b]))
   (->Knowledge #{[2 3 4] [:a :b :c] [:b :c :d]} #{[1 2 3]} #{[1 2 3]} #{[2 3 4] [:a :b :c] [:b :c :d]}))

  (query-rule
   (rule (+ed [a b])
         (+ [a b]))
   (->Knowledge #{} #{[1 2]} #{} #{[1 2]}))

  (query-rule
   (rule (set x [b c]
              [a b c]
              [b c d])
         (+ [a d x]))
   (tick {:now #{[1 2 3] [2 3 4] [3 4 5] [2 8 9] [8 9 5]}}))

  (query-rule
   (rule [a b c]
         [b c d]
         (set x [b c]
              [a b c]
              [b c d])
         (+ [a b c d x]))
   (tick {:now #{[1 2 3] [2 3 4] [3 4 5] [2 8 9] [8 9 5]}}))

;; (in ...) is not currently supported
;;   (query-rule
;;    (rule [a b c]
;;          [b c d]
;;          (set x [b c]
;;               [a b c]
;;               [b c d])
;;          (in y x)
;;          (+ [a b c d y]))
;;    (tick {:now #{[1 2 3] [2 3 4] [3 4 5] [2 8 9] [8 9 5]}}))

;; can't figure out how to make this work without an Empty plan node
;;   (run-rule
;;    (rule (> {:foo 1} {:bar 1}))
;;    (tick {:now #{{:foo 1 :bar 0}}}))

  (run-rule
   (rule {:quux x}
         (> {:foo x} {:bar x}))
   (tick {:now #{{:foo 1 :bar 0} {:quux 1}}}))

  (run-rule
   (rule [a b _]
         (+ed [_ a b])
         (? [a] (integer? a))
         (= c [a b] (+ a b))
         (= d [a b] (- a b))
         (+ [c c c])
         (- [d d d]))
   (->Knowledge #{[2 3 4] [:a :b :c] [:b :c :d]} #{[1 2 3]} #{} #{[1 2 3] [2 3 4] [:a :b :c] [:b :c :d]}))

  (rule {:name :quux :quux x}
        (> {:name :the :foo x} {:bar x}))

  (run-rule
   (rule (set x [id]
              {:name "foo" :id id})
         (+ x))
   (tick {:now #{{:name "zomg" :id 4} {:name "foo" :id 3}}}))

  (run-rule
   (rule (set x [id]
              {:name "foo" :id id})
         (+s [x] x))
   (tick {:now #{{:name "zomg" :id 4} {:name "foo" :id 3}}}))

  (macroless-rule '[[a b]
                    (= foo (+ a b))
                    (+ [a b foo])])
  )
