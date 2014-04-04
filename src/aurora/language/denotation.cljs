(aset js/aurora.language "denotation" nil)

(ns aurora.language.denotation
  (:require [clojure.set :refer [union intersection difference subset?]]
            [aurora.language.jsth :as jsth]
            [aurora.language.match :as match]
            [aurora.language.representation :refer [pred-name tick ->Knowledge]]
            [aurora.language.operation :refer [expr->vars +node +assert +retract ->project ->join ->filter ->let ->group ->map ->mapcat ->Rule query-rule run-rule]])
  (:require-macros [aurora.macros :refer [check console-time set!! conj!! disj!! assoc!!]]
                   [aurora.language.macros :refer [query rule]]))

;; CLAUSES

(defrecord Fact [time pattern])
(defrecord Filter [expr])
(defrecord Let [name expr])
(defrecord Set [name vars clauses])
(defrecord Assert [pattern])
(defrecord Retract [pattern])
(defrecord AssertMany [expr])
(defrecord RetractMany [expr])

;; RULE ANALYSIS

(defn preds-in [clause]
  ;; TODO check not nil
  (condp = (type clause)
    Fact #{(pred-name (:pattern clause))}
    Set (apply clojure.set/union (map preds-in (:clauses clause)))
    #{}))

(defn preds-out [clause]
  ;; TODO check not nil
  (condp = (type clause)
    Assert #{(pred-name (:pattern clause))}
    Retract #{(pred-name (:pattern clause))}
    AssertMany #{:aurora.language.representation/any}
    RetractMany #{:aurora.language.representation/any}
    #{}))

(defn negs-in [clause]
  ;; TODO check not nil
  (condp = (type clause)
    Set (apply clojure.set/union (map preds-in (:clauses clause)))
    #{}))

(defn negs-out [clause]
  ;; TODO check not nil
  (condp = (type clause)
    Retract #{(pred-name (:pattern clause))}
    RetractMany #{:aurora.language.representation/any}
    #{}))

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
        rule (->Rule plan #js [] #js []
                     (apply union (map preds-in clauses))
                     (apply union (map preds-out clauses))
                     (apply union (map negs-in clauses))
                     (apply union (map negs-out clauses)))
        body (clauses->body plan clauses)]
    (doseq [clause clauses]
      (condp = (type clause)
        Assert (+assert rule (->map body (:pattern clause)))
        Retract (+retract rule (->map body (:pattern clause)))
        AssertMany (+assert rule (->mapcat body (:expr clause)))
        RetractMany (+retract rule (->mapcat body (:expr clause)))
        nil))
    rule))

;; TESTS

(comment
  (enable-console-print!)

  (query-rule
   (rule [a b _]
         [_ a b]
         (? (integer? a))
         (+ [a b]))
   (tick {:now #{[1 2 3] [2 3 4] [:a :b :c] [:b :c :d]}}))

  (query-rule
   (rule [a b c]
         (= foo (+ b 4))
         (+s [[a] [b] [c]])
         (+ [a foo]))
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

  (run-rule
   (rule [a b _]
         (+ed [_ a b])
         (? (integer? a))
         (= c (+ a b))
         (= d (- a b))
         (+ [c c c])
         (- [d d d]))
   (->Knowledge #{[2 3 4] [:a :b :c] [:b :c :d]} #{[1 2 3]} #{} #{[1 2 3] [2 3 4] [:a :b :c] [:b :c :d]}))

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

  )
