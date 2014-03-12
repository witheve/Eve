(ns aurora.compiler.datalog
  (:require [clojure.set :refer [union intersection difference subset?]]
            [aurora.compiler.match :as match])
  (:require-macros [aurora.macros :refer [fnk check deftraced]]
                   [aurora.compiler.match :refer [match]]
                   [aurora.compiler.datalog :refer [query rule]]))

;; TODO
;; aggregation - requires thinking about query args
;; graph representation
;; dependency ordering in graph
;; incremental assert
;; incremental retract
;; stratification
;; schemas
;; let bindings - requires dependency ordering in graph

;; We assume that if we rely on attr then stratification ensures no more retractions are forthcoming

;; runtime

(defrecord Knowledge [old asserted retracted])

(def empty
  (Knowledge. #{} #{} #{}))

(defn assert [kn {:keys [name] :as fact}]
  (update-in kn [:asserted] conj fact))

(defn retract [kn {:keys [name] :as fact}]
  (update-in kn [:retracted] conj fact))

;; TODO can probably just do this on assert/retract by looking at counts
(defn to-be [{:keys [old asserted retracted] :as kn}]
  ;; (old & ¬(retracted & ¬asserted)) | (asserted & ¬retracted)
  (let [actually-asserted (difference asserted retracted)
        actually-retracted (difference retracted asserted)
        to-be (difference (union old actually-asserted) actually-retracted)]
    to-be))

(defn and-now [kn]
  (Knowledge. (to-be kn) #{} #{}))

;; creating queries

(defn project [pattern]
  (let [return-syms (into [] (match/vars pattern))
        return-keys (map keyword return-syms)
        shape (into #{} return-keys)
        f (match/pattern pattern return-syms)]
    (with-meta
      (fn [kn]
        (into #{}
              (for [fact (to-be kn)
                    :let [vals (f fact)]
                    :when vals]
                (zipmap return-keys vals))))
      {::shape shape})))

;; TODO hashjoin instead
(defn join [query1 query2]
  (let [shape (union (::shape (meta query1)) (::shape (meta query2)))
        join-shape (intersection (::shape (meta query1)) (::shape (meta query2)))]
    (with-meta
      (fn [kn]
        (into #{}
              (for [vals1 (query1 kn)
                    vals2 (query2 kn)
                    :when (= (select-keys vals1 join-shape) (select-keys vals2 join-shape))]
                (merge vals1 vals2))))
      {::shape shape})))

(defn filter-q [query fnk]
  (check (subset? (:aurora/selects (meta fnk)) (::shape (meta query))))
  (with-meta
    (fn [kn]
      (into #{} (filter fnk (query kn))))
    {::shape (::shape (meta query))}))

(defn map-q [query fnk]
  (let [selects (:aurora/selects (meta fnk))]
    (check (subset? selects (::shape (meta query))))
    (with-meta
      (fn [kn]
        (into #{} (map fnk (into #{} (map #(select-keys % selects) (query kn))))))
      {::shape nil}))) ;; TODO...

(defn query* [projects filter-fnks map-fnk]
  (map-q (reduce filter-q (reduce join (map project projects)) filter-fnks) map-fnk))

;; creating rules

(defn rule* [projects filter-fnks assert-fnks retract-fnks]
  (let [query (reduce filter-q (reduce join (map project projects)) filter-fnks)]
    (fn [kn]
      (let [facts (query kn)
            kn (reduce
                (fn [kn assert-fnk]
                  (reduce assert kn (map assert-fnk facts)))
                kn
                assert-fnks)
            kn (reduce
                (fn [kn retract-fnk]
                  (reduce retract kn (map retract-fnk facts)))
                kn
                retract-fnks)]
        kn))))

(defn chain [rules]
  (fn [kn]
    (reduce #(%2 %1) kn rules)))

;; TODO this doesn't propagate deltas efficiently, needs some fast way to read changes before and after
(defn fixpoint [rule]
  (fn [kn]
    (let [new-kn (rule kn)]
      (if (= new-kn kn)
        new-kn
        (recur kn)))))

;; tests

(comment

  ((project '[a b]) (Knowledge. #{[1 2] [3 4 5] [6 7]} #{} #{}))

  ((join (project '[a b _]) (project '[_ a b])) (Knowledge. #{[1 2 3] [2 3 4] [2 4 6] [4 6 8]} #{} #{}))

  ((filter-q (project '[a b]) (fnk [a b] (= a b))) (Knowledge. #{[1 2] [3 4] [6 6]} #{} #{}))

  ((map-q (project '[a b]) (fnk [a b] (- a b))) (Knowledge. #{[1 2] [3 4] [6 6]} #{} #{}))

  ((query* '[[a b _] [_ a b]] [(fnk [a] (integer? a))] (fnk [a b] (+ a b))) (Knowledge. #{[1 2 3] [2 3 4] [:a :b :c] [:b :c :d]} #{} #{}))

  ((rule* '[[a b _] [_ a b]] [(fnk [a] (integer? a))] [(fnk [a b] (+ a b))] [(fnk [a b] (- a b))]) (Knowledge. #{[1 2 3] [2 3 4] [:a :b :c] [:b :c :d]} #{} #{}))

  ((query [[a b _] kn
           [_ a b] kn
           :when (integer? a)]
          (+ a b))
   (Knowledge. #{[1 2 3] [2 3 4] [:a :b :c] [:b :c :d]} #{} #{}))

  ((rule [[a b _] kn
          [_ a b] kn
          :when (integer? a)]
         + [a a a]
         - [b b b])
   (Knowledge. #{[1 2 3] [2 3 4] [:a :b :c] [:b :c :d]} #{} #{}))

  )
