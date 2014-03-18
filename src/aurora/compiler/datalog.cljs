(aset js/aurora.compiler "datalog" nil)

(ns aurora.compiler.datalog
  (:require [clojure.set :refer [union intersection difference subset?]]
            [aurora.compiler.match :as match])
  (:require-macros [aurora.macros :refer [fns check deftraced]]
                   [aurora.compiler.match :refer [match]]
                   [aurora.compiler.datalog :refer [query rule]]))

;; TODO
;; conj? not?
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

(defn assert-many [kn facts]
  (update-in kn [:asserted] union facts))

(defn retract-many [kn facts]
  (update-in kn [:retracted] union facts))

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

(defn preds-in [clause]
  ;; TODO check not nil
  (condp op? clause
    '+ed #{(:name (second clause))}
    '-ed #{(:name (second clause))}
    'set (apply clojure.set/union (map preds-in (nthnext clause 3)))
    (if (seq? clause)
      #{}
      #{(:name clause)})))

(defn preds-out [clause]
  ;; TODO check not nil
  (condp op? clause
    '+ #{(:name (second clause))}
    '- #{(:name (second clause))}
    '+s #{::any}
    '-s #{::any}
    '> (let [from-name (:name (nth clause 1))
             to-name (:name (nth clause 2))]
         (check from-name)
         (check (or (nil? to-name) (= from-name to-name)))
         #{(:name (nth clause 1))})
    #{}))

(defn negs-in [clause]
  ;; TODO check not nil
  (condp op? clause
    'set (apply clojure.set/union (map preds-in (nthnext clause 3)))
    #{}))

(defn negs-out [clause]
  ;; TODO check not nil
  (condp op? clause
    '- #{(:name (second clause))}
    '-s #{::any}
    '> (let [from-name (:name (nth clause 1))
             to-name (:name (nth clause 2))]
         (check from-name)
         (check (or (nil? to-name) (= from-name to-name)))
         #{(:name (nth clause 1))})
    #{}))

(def empty-q
  (with-meta
    (fn [kn]
      #{{}})
    {::shape #{}}))

(defn debug-q [query]
  (with-meta
    (fn [kn]
      (let [facts (query kn)]
        (prn facts)
        facts))
    (meta query)))

(defn project-q [pattern kn-f]
  (let [shape (match/vars pattern)
        return-syms (into [] shape)
        f (match/pattern pattern return-syms)]
    (with-meta
      (fn [kn]
        (into #{}
              (for [fact (kn-f kn)
                    :let [vals (f fact)]
                    :when vals]
                (zipmap return-syms vals))))
      {::shape shape})))

;; TODO hashjoin instead
(defn join [facts1 facts2 join-shape]
  (into #{}
        (for [vals1 facts1
              vals2 facts2
              :when (= (select-keys vals1 join-shape) (select-keys vals2 join-shape))]
          (merge vals1 vals2))))

(defn join-q [query1 query2]
  (let [shape (union (::shape (meta query1)) (::shape (meta query2)))
        join-shape (intersection (::shape (meta query1)) (::shape (meta query2)))]
    (with-meta
      (fn [kn]
        (join (query1 kn) (query2 kn) join-shape))
      {::shape shape})))

(defn filter-q [query fns]
  ;; (check (subset? (:aurora/selects (meta fns)) (::shape (meta query))))
  (with-meta
    (fn [kn]
      (into #{} (filter fns (query kn))))
    {::shape (::shape (meta query))}))

(defn let-q [query name-sym fns]
  ;; (check (subset? (:aurora/selects (meta fns)) (::shape (meta query))))
  (with-meta
    (fn [kn]
      (into #{} (for [result (query kn)]
                  (assoc result name-sym (fns result)))))
    {::shape (conj (::shape (meta query)) name-sym)}))

(defn fill-in [template result]
  (clojure.walk/postwalk-replace result template))

(defn fill-in-q [template]
  (fn [facts]
    (into #{} (map #(fill-in template %) facts))))

(defn mapcat-q [fns]
  (let [selects (:aurora/selects (meta fns))]
    (fn [facts]
      (into #{} (mapcat fns (into #{} (map #(select-keys % selects) facts)))))))

(declare gen*)

(defn set-q [name-sym select-syms clauses]
  (let [vars (apply clojure.set/union (map vars clauses))
        project-syms (into [] (difference vars select-syms))
        group-f (apply juxt project-syms)
        shape (conj (set project-syms) name-sym)
        gen (gen* clauses)]
    (with-meta
      (fn [kn]
        (into #{}
              (for [[projects selects] (group-by group-f (gen kn))]
                (assoc (zipmap project-syms projects) name-sym (set (map #(select-keys % select-syms) selects))))))
      {::shape shape})))

(defn in-q [query name-sym set-sym]
  (fn [kn]
    (for [fact (query kn)
          elem (get fact set-sym :inq-not-found)]
      (assoc fact name-sym elem))))

(defn gen* [clauses]
  (reduce
   (fn [query clause]
     (debug-q
      (condp op? clause
        '+ed (join-q query (project-q (second clause) :asserted))
        '-ed (join-q query (project-q (second clause) :retracted))
        '? (filter-q query (second clause))
        '= (let-q query (nth clause 1) (nth clause 2))
        'set (join-q query (set-q (nth clause 1) (nth clause 2) (nthnext clause 3)))
        'in (in-q query (nth clause 1) (nth clause 2))
        '+ query ;; handled later
        '+s query ;; handled later
        '- query ;; handled later
        '-s query ;; handled later
        '> query ;; handled later
        (join-q query (project-q clause to-be)))))
   empty-q
   clauses))

(defn asserts+retracts* [clauses]
  (let [assert-fs (into [] (concat (map #(fill-in-q (second %)) (filter #(op? '+ %) clauses))
                                   (map #(mapcat-q (second %)) (filter #(op? '+s %) clauses))))
        retract-fs (into [] (concat (map #(fill-in-q (second %)) (filter #(op? '- %) clauses))
                                    (map #(mapcat-q (second %)) (filter #(op? '-s %) clauses))))
        update-sym (gensym "fact")
        update-gens (into [] (map #(project-q (with-meta (nth % 1) {:tag update-sym}) to-be) (filter #(op? '> %) clauses)))
        update-templates (into [] (map #(nth % 2) (filter #(op? '> %) clauses)))
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
        (doseq [[update-gen update-template] (map vector update-gens update-templates)
                result (join (update-gen kn) facts (intersection (::shape (meta update-gen)) (::shape (meta gen))))]
          (.push retracts (update-sym result))
          (.push asserts (merge (update-sym result) (fill-in update-template result))))
        [asserts retracts]))))

(defn query* [clauses]
  (let [asserts+retracts (asserts+retracts* clauses)]
    (fn [kn]
      (let [[asserts retracts] (asserts+retracts kn)]
        (difference (set asserts) retracts)))))

(defn rule* [clauses]
  (let [asserts+retracts (asserts+retracts* clauses)]
    (with-meta
      (fn [kn]
        (let [[asserts retracts] (asserts+retracts kn)]
          (reduce retract (reduce assert kn asserts) retracts)))
      {::preds-in (apply union (map preds-in clauses))
       ::preds-out (apply union (map preds-out clauses))
       ::negs-in (apply union (map negs-in clauses))
       ::negs-out (apply union (map negs-out clauses))})))

(defn chain [rules]
  (fn [kn]
    (reduce #(%2 %1) kn rules)))

;; TODO this doesn't propagate deltas efficiently, needs some fast way to read changes before and after
(defn fixpoint [rule]
  (fn [kn]
    (let [new-kn (rule kn)]
      (if (= new-kn kn)
        new-kn
        (recur new-kn)))))

;; tests

(comment
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

  ((rule (> {:foo 1} {:bar 1}))
   (Knowledge. #{{:foo 1 :bar 0}} #{} #{}))

  ((rule {:quux x}
         (> {:foo x} {:bar x}))
   (Knowledge. #{{:foo 1 :bar 0} {:quux 1}} #{} #{}))

  ((rule [a b _]
         (+ed [_ a b])
         (? (integer? a))
         (= c (+ a b))
         (= d (- a b))
         (+ [c c c])
         (- [d d d]))
   (Knowledge. #{[2 3 4] [:a :b :c] [:b :c :d]} #{[1 2 3]} #{}))

  (rule {:name :quux :quux x}
        (> {:name :the :foo x} {:bar x}))
  )
