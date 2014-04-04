(aset js/aurora.language "denotation" nil)

(ns aurora.language.denotation
  (:require [clojure.set :refer [union intersection difference subset?]]
            [aurora.language.jsth :as jsth]
            [aurora.language.match :as match]
            [aurora.language.representation :refer [pred-name tick ->Knowledge ->Schema with-schemas]]
            [aurora.language.operation :refer [expr->vars +node +pretend +assert +retract ->project ->join ->filter ->let ->group ->map ->mapcat ->Rule query-rule run-rule]])
  (:require-macros [aurora.macros :refer [check console-time set!! conj!! disj!! assoc!!]]
                   [aurora.language.macros :refer [query rule]]))

;; CLAUSES

(defrecord Fact [time pattern]) ;; time is one of :now&pretended :pretended :asserted :retracted :now
(defrecord Filter [expr])
(defrecord Let [name expr])
(defrecord Set [name vars clauses])
(defrecord Output [action pattern]) ;; action is one of :pretend :assert :retract
(defrecord OutputMany [action expr]) ;; action is one of :pretend :assert :retract

;; DEPENDENCIES

(defn preds-in [clause]
  (condp = (type clause)
    Fact #{(pred-name (:pattern clause))}
    Set (apply clojure.set/union (map preds-in (:clauses clause)))
    #{}))

(defn preds-out [clause]
  (condp = (type clause)
    Output #{(pred-name (:pattern clause))}
    OutputMany #{:aurora.language.representation/any}
    #{}))

(defn negs-in [clause]
  (condp = (type clause)
    Set (apply clojure.set/union (map preds-in (:clauses clause)))
    #{}))

(defn negs-out [clause]
  (condp = (type clause)
    #{}))

;; SAFETY

(defn check-clause [{:keys [name->schema] :as kn} clause]
  (condp = (type clause)
    Output (let [schema (name->schema (pred-name (:pattern clause)))]
             (case (:authority schema)
               :essential (assert (#{:assert :retract} (:action clause)) (pr-str clause (:authority schema)))
               :derived (assert (#{:pretend} (:action clause)) (pr-str clause (:authority schema)))))
    nil))

(defn check-clauses [kn clauses]
  (doseq [clause clauses]
    (check-clause kn clause)))

;; PLANS

(defn clauses->body [plan clauses]
  ;; projects/sets, joins, lets, filters, (asserts, retracts, updates)
  (let [projects (for [clause clauses
                       :when (#{Fact Set} (type clause))]
                   (condp = (type clause)
                     Fact (+node plan (->project (:time clause) (:pattern clause)))
                     Set (+node plan (->group (clauses->body plan (:clauses clause)) (:name clause) (:vars clause)))))
        _ (assert (seq projects) "Rules without any project clauses are illegal")
        joined (reduce #(+node plan (->join %1 %2)) projects)
        letted (loop [[_ shape :as node] joined
                      lets (filter #(= Let (type %)) clauses)]
                 (if (seq lets)
                   (let [set-shape (set shape)
                         applicable (filter #(every? set-shape (expr->vars (:expr %))) lets)
                         unapplicable (filter #(not (every? set-shape (expr->vars (:expr %)))) lets)
                         _ (assert (seq applicable) (str "Can't resolve loop in " (pr-str unapplicable)))
                         new-node (reduce #(+node plan (->let %1 (:name %2) (:expr %2))) node applicable)]
                     (recur new-node unapplicable))
                   node))
        filtered (reduce #(+node plan (->filter %1 (:expr %2))) letted (filter #(= Filter (type %)) clauses))]
    filtered))

(defn clauses->rule [clauses]
  (let [plan #js []
        rule (->Rule plan #js [] #js [] #js []
                     (apply union (map preds-in clauses))
                     (apply union (map preds-out clauses))
                     (apply union (map negs-in clauses))
                     (apply union (map negs-out clauses)))
        body (clauses->body plan clauses)]
    (doseq [clause clauses]
      (condp = (type clause)
        Output (case (:action clause)
                 :pretend (+pretend rule (->map body (:pattern clause)))
                 :assert (+assert rule (->map body (:pattern clause)))
                 :retract (+retract rule (->map body (:pattern clause))))
        OutputMany (case (:action clause)
                     :pretend (+pretend rule (->mapcat body (:expr clause)))
                     :assert (+assert rule (->mapcat body (:expr clause)))
                     :retract (+retract rule (->mapcat body (:expr clause))))
        nil))
    rule))

(def clauses->rule (memoize clauses->rule))

;; TESTS

(comment
  (enable-console-print!)

  (query-rule
   (rule [a b _]
         [_ a b]
         (? (integer? a))
         (> [a b]))
   (tick {:now #{[1 2 3] [2 3 4] [:a :b :c] [:b :c :d]}}))

  (query-rule
   (rule [a b c]
         (= foo (+ b 4))
         (>s [[a] [b] [c]])
         (> [a foo]))
   (tick {:now #{[1 2 3] [3 4 5]}}))

  (run-rule
   (rule [a b _]
         [_ a b]
         (? (integer? a))
         (+ [a a a])
         (- [b b b]))
   (tick {:now #{[1 2 3] [2 3 4] [:a :b :c] [:b :c :d]}}))

  (run-rule
   (rule [a b _]
         (+ed [_ a b])
         (? (integer? a))
         (+ [a a a])
         (- [b b b]))
   (->Knowledge #{} #{[1 2 3]} #{} #{[2 3 4] [:a :b :c] [:b :c :d] [1 2 3]}))

  (run-rule
   (rule [a b _]
         [_ a b]
         (? (integer? a))
         (+ [a a a])
         (- [b b b]))
   (->Knowledge #{} #{[1 2 3]} #{[1 2 3]} #{[2 3 4] [:a :b :c] [:b :c :d]}))

  (query-rule
   (rule (+ed [a b])
         (> [a b]))
   (->Knowledge #{} #{[1 2]} #{} #{}))

  (query-rule
   (rule (set x [b c]
              [a b c]
              [b c d])
         (> [a d x]))
   (tick {:now #{[1 2 3] [2 3 4] [3 4 5] [2 8 9] [8 9 5]}}))

  (query-rule
   (rule [a b c]
         [b c d]
         (set x [b c]
              [a b c]
              [b c d])
         (> [a b c d x]))
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

  (run-rule
   (rule [a b _]
         (+ed [_ a b])
         (? (integer? a))
         (= c (+ a b))
         (= d (- a b))
         (+ [c c c])
         (- [d d d]))
   (->Knowledge #{} #{[1 2 3]} #{} #{[1 2 3] [2 3 4] [:a :b :c] [:b :c :d]}))

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

  (check-clause (with-schemas (->Knowledge) [(->Schema :foo :essential {})])
                (->Output :assert [:foo]))

  (check-clause (with-schemas (->Knowledge) [(->Schema :foo :essential {})])
                (->Output :pretend [:foo]))

  (check-clause (with-schemas (->Knowledge) [(->Schema :foo :derived {})])
                (->Output :assert [:foo]))

  )
