(ns aurora.compiler.datalog
  (:require [clojure.set :refer [union intersection difference subset?]]
            [aurora.compiler.match :as match])
  (:require-macros [aurora.macros :refer [fnk check deftraced]]
                   [aurora.compiler.match :refer [match]]
                   [aurora.compiler.datalog :refer [query rule]]))

;; TODO
;; conj?
;; pattern matching on sets? sorting? vectors? (sort-by, sort-arbitrary)
;; graph representation?
;; dependency ordering
;; seminaive
;; incremental assert
;; incremental retract
;; stratification
;; schemas
;; nested rows (find out the correct name for this)

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

(defn vars [clause]
  (condp op? clause
    '+ed (match/vars (second clause))
    '-ed (match/vars (second clause))
    'set (conj (clojure.set/difference (apply clojure.set/union (map vars (nthnext clause 3))) (nth clause 2)) (nth clause 1))
    'in #{(second clause)}
    (if (seq? clause)
      #{}
      (match/vars clause))))

(defn empty-q [kn]
  (with-meta
    #{{}}
    {::shape #{}}))

(defn debug-q [query]
  (with-meta
    (fn [kn]
      (let [facts (query kn)]
        (prn facts)
        facts))
    (meta query)))

(defn project [pattern kn-f]
  (let [return-syms (into [] (match/vars pattern))
        return-keys (map keyword return-syms)
        shape (into #{} return-keys)
        f (match/pattern pattern return-syms)]
    (with-meta
      (fn [kn]
        (into #{}
              (for [fact (kn-f kn)
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

(defn map-q [fnk]
  (let [selects (:aurora/selects (meta fnk))]
    (fn [facts]
      (into #{} (map fnk (into #{} (map #(select-keys % selects) facts)))))))

(declare gen*)

(defn set-q [name-sym select-syms clauses]
  (let [vars (apply clojure.set/union (map vars clauses))
        select-keys (into [] (map keyword select-syms))
        project-syms (into [] (difference vars select-syms))
        project-keys (into [] (map keyword project-syms))
        group-f (apply juxt project-keys)
        name-key (keyword name-sym)
        shape (conj (set project-keys) name-key)
        gen (gen* clauses)]
    (with-meta
      (fn [kn]
        (into #{}
              (for [[projects selects] (group-by group-f (gen kn))]
                (assoc (zipmap project-keys projects) name-key (set (map #(clojure.core/select-keys % select-keys) selects))))))
      {::shape shape})))

(defn in-q [query name-sym set-sym]
  (let [name-key (keyword name-sym)
        set-key (keyword set-sym)]
    (fn [kn]
      (for [fact (query kn)
            elem (get fact set-key :inq-not-found)]
        (assoc fact name-key elem)))))

(defn op? [op clause]
  (and (seq? clause) (= op (first clause))))

(defn assert? [clause]
  (op? '+ clause))

(defn retract? [clause]
  (op? '- clause))

(defn gen* [clauses]
  (reduce
   (fn [query clause]
     (debug-q
      (condp op? clause
        '+ed (join query (project (second clause) :asserted))
        '-ed (join query (project (second clause) :retracted))
        '? (filter-q query (second clause))
        'set (join query (set-q (nth clause 1) (nth clause 2) (nthnext clause 3)))
        'in (in-q query (nth clause 1) (nth clause 2))
        '+ query ;; handled later
        '- query ;; handled later
        (join query (project clause to-be)))))
   empty-q
   clauses))

(defn asserts+retracts* [clauses]
  (let [assert-fs (map #(map-q (second %)) (filter assert? clauses))
        retract-fs (map #(map-q (second %)) (filter retract? clauses))
        gen (gen* clauses)]
    (fn [kn]
      (let [facts (gen kn)
            asserts #js []
            retracts #js []]
        (doseq [assert-f assert-fs
                result (assert-f facts)]
          (.push asserts result))
        (doseq [retract-f retract-fs
                result (retract-f facts)]
          (.push retracts result))
        [asserts retracts]))))

(defn query* [clauses]
  (let [asserts+retracts (asserts+retracts* clauses)]
    (fn [kn]
      (let [[asserts retracts] (asserts+retracts kn)]
        (difference (set asserts) retracts)))))

(defn rule* [clauses]
  (let [asserts+retracts (asserts+retracts* clauses)]
    (fn [kn]
      (let [[asserts retracts] (asserts+retracts kn)]
        (reduce retract (reduce assert kn asserts) retracts)))))

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

  ((filter-q (project '[a b] to-be) (fnk [a b] (= a b))) (Knowledge. #{[1 2] [3 4] [6 6]} #{} #{}))

  (query* ['[a b _] '[_ a b] (list '? (fnk [a] (integer? a))) (list '+ (fnk [a b] (+ a b)))])

  ((query* ['[a b _] '[_ a b] (list '? (fnk [a] (integer? a))) (list '+ (fnk [a b] (+ a b)))]) (Knowledge. #{[1 2 3] [2 3 4] [:a :b :c] [:b :c :d]} #{} #{}))

  ((rule* ['[a b _] '[_ a b] (list '? (fnk [a] (integer? a))) (list '+ (fnk [a b] (+ a b))) (list '- (fnk [a b] (- a b)))]) (Knowledge. #{[1 2 3] [2 3 4] [:a :b :c] [:b :c :d]} #{} #{}))

  ((query [a b _]
          [_ a b]
          (? (integer? a))
          (+ (+ a b)))
   (Knowledge. #{[1 2 3] [2 3 4] [:a :b :c] [:b :c :d]} #{} #{}))

  ((rule [a b _]
         [_ a b]
         (? (integer? a))
         (+ [a a a])
         (- [b b b]))
   (Knowledge. #{[1 2 3] [2 3 4] [:a :b :c] [:b :c :d]} #{} #{}))

  ((rule [a b _]
         (+ed [_ a b])
         (? (integer? a))
         (+ [a a a])
         (- [b b b]))
   (Knowledge. #{[2 3 4] [:a :b :c] [:b :c :d]} #{[1 2 3]} #{}))

  ((rule [a b _]
         [_ a b]
         (? (integer? a))
         (+ [a a a])
         (- [b b b]))
   (Knowledge. #{[2 3 4] [:a :b :c] [:b :c :d]} #{[1 2 3]} #{[1 2 3]}))

  ((query (+ed [a b])
          (+ [a b]))
   (Knowledge. #{} #{[1 2]} #{}))

  ((set-q 'x '[b c] '[[a b c] [b c d]]) (Knowledge. #{[1 2 3] [2 3 4] [3 4 5] [2 8 9] [8 9 5]} #{} #{}))

  ((query (set x [b c]
               [a b c]
               [b c d])
          (+ [a d x]))
   (Knowledge. #{[1 2 3] [2 3 4] [3 4 5] [2 8 9] [8 9 5]} #{} #{}))

  ((query [a b c]
          [b c d]
          (set x [b c]
               [a b c]
               [b c d])
          (+ [a b c d x]))
   (Knowledge. #{[1 2 3] [2 3 4] [3 4 5] [2 8 9] [8 9 5]} #{} #{}))

  ((query [a b c]
          [b c d]
          (set x [b c]
               [a b c]
               [b c d])
          (in y x)
          (+ [a b c d y]))
   (Knowledge. #{[1 2 3] [2 3 4] [3 4 5] [2 8 9] [8 9 5]} #{} #{}))
  )
