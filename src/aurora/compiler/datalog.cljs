(aset js/aurora.compiler "datalog" nil)

(ns aurora.compiler.datalog
  (:require [clojure.set :refer [union intersection difference subset?]]
            [aurora.compiler.jsth :as jsth]
            [aurora.compiler.match :as match])
  (:require-macros [aurora.macros :refer [fns check deftraced console-time]]
                   [aurora.compiler.match :refer [match]]
                   [aurora.compiler.datalog :refer [query rule]]))

;; TODO
;; aggregates (conj? sorting?)
;; abstract result sets
;; seminaive evaluation
;; incremental assert
;; incremental retract
;; stratification
;; schemas
;; hashjoins / incremental joins
;; index by predicate?
;; profiler
;; debugger

;; We assume that if we rely on attr then stratification ensures no more retractions are forthcoming

;; runtime

(def time-clauses false)
(def time-parts false)
(def time-rules false)
(def time-queries false)

(defn with-info [f x]
  (aset f "our_info" x)
  f)

(defn info [f]
  (aget f "our_info"))

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

(defn name? [x]
  (or (string? x) (keyword? x)))

(defn pred-name [clause]
  (cond
   (and (map? clause) (name? (:name clause))) (:name clause)
   (and (vector? clause) (name? (first clause))) (first clause)
   :else ::any))

(defn preds-in [clause]
  ;; TODO check not nil
  (condp op? clause
    '+ed #{(pred-name (second clause))}
    '-ed #{(pred-name (second clause))}
    'set (apply clojure.set/union (map preds-in (nthnext clause 3)))
    (if (seq? clause)
      #{}
      #{(pred-name clause)})))

(defn preds-out [clause]
  ;; TODO check not nil
  (condp op? clause
    '+ #{(pred-name (second clause))}
    '- #{(pred-name (second clause))}
    '+s #{::any}
    '-s #{::any}
    '> (let [from-name (pred-name (nth clause 1))
             to-name (pred-name (nth clause 2))]
         (check from-name)
         (check (or (= ::any to-name) (= from-name to-name)))
         #{(pred-name (nth clause 1))})
    #{}))

(defn negs-in [clause]
  ;; TODO check not nil
  (condp op? clause
    'set (apply clojure.set/union (map preds-in (nthnext clause 3)))
    #{}))

(defn negs-out [clause]
  ;; TODO check not nil
  (condp op? clause
    '- #{(pred-name (second clause))}
    '-s #{::any}
    '> (let [from-name (pred-name (nth clause 1))
             to-name (pred-name (nth clause 2))]
         (check from-name)
         (check (or (= ::any to-name) (= from-name to-name)))
         #{(pred-name (nth clause 1))})
    #{}))

(def empty-q
  (with-info
    (fn empty-q-fn [kn]
      #{{}})
    {::shape #{}}))

(defn debug-q [query]
  (with-info
    (fn debug-q-fn [kn]
      (let [facts (query kn)]
        (prn facts)
        facts))
    (info query)))

(defn project-q [pattern kn-f]
  (let [shape (match/vars pattern)
        return-syms (into [] shape)
        f (match/pattern pattern return-syms)]
    (with-info
      (fn project-q-fn [kn]
        (console-time "project" time-clauses
                      (into #{}
                            (for [fact (kn-f kn)
                                  :let [vals (f fact)]
                                  :when vals]
                              (zipmap return-syms vals)))))
      {::shape shape})))

;; TODO hashjoin instead
(defn join [facts1 facts2 join-shape]
  (console-time "join" time-clauses
                (into #{}
                      (for [vals1 facts1
                            vals2 facts2
                            :when (= (select-keys vals1 join-shape) (select-keys vals2 join-shape))]
                        (merge vals1 vals2)))))

(defn join-q [query1 query2]
  (let [shape (union (::shape (info query1)) (::shape (info query2)))
        join-shape (intersection (::shape (info query1)) (::shape (info query2)))]
    (with-info
      (fn join-q-fn [kn]
        (join (query1 kn) (query2 kn) join-shape))
      {::shape shape})))

(defn filter-q [query fns]
  ;; (check (subset? (:aurora/selects (meta fns)) (::shape (info query))))
  (with-info
    (fn filter-q-fn [kn]
      (let [facts (query kn)]
        (console-time "filter" time-clauses
                      (into #{} (filter fns facts)))))
    {::shape (::shape (info query))}))

(defn let-q [query name-sym fns]
  ;; (check (subset? (:aurora/selects (meta fns)) (::shape (info query))))
  (with-info
    (fn let-q-fn [kn]
      (let [facts (query kn)]
        (console-time "let-q" time-clauses
                      (into #{} (for [result facts]
                                  (assoc result name-sym (fns result)))))))
    {::shape (conj (::shape (info query)) name-sym)}))

(defn fill-in [template result]
  (clojure.walk/postwalk-replace result template))

(defn fill-in-q [template]
  (fn fill-in-q-fn [facts]
    (console-time "fill-in" time-clauses
                  (into #{} (map #(fill-in template %) facts)))))

(defn mapcat-q [fns]
  (let [selects (:aurora/selects (meta fns))]
    (fn mapcat-q-fn [facts]
      (console-time "mapcat" time-clauses
                    (into #{} (mapcat fns (into #{} (map #(select-keys % selects) facts))))))))

(declare gen*)

(defn set-q [name-sym select-syms clauses]
  (let [vars (apply clojure.set/union (map vars clauses))
        project-syms (into [] (difference vars select-syms))
        group-f #(select-keys % project-syms)
        shape (conj (set project-syms) name-sym)
        gen (gen* clauses)]
    (with-info
      (fn set-q-fn [kn]
        (let [facts (gen kn)]
          (console-time "set" time-clauses
                        (into #{}
                              (for [[projects selects] (group-by group-f facts)]
                                (assoc (zipmap project-syms projects) name-sym (set (map #(select-keys % select-syms) selects))))))))
      {::shape shape})))

(defn in-q [query name-sym set-sym]
  (fn in-q-fn [kn]
    (let [facts (query kn)]
      (console-time "in-q" time-clauses
                    (for [fact facts
                          elem (get fact set-sym :inq-not-found)]
                      (assoc fact name-sym elem))))))

(defn gen* [clauses]
  (reduce
   (fn [query clause]
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
       (join-q query (project-q clause to-be))))
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
    (fn asserts+retracts*-fn [kn]
      (let [facts (console-time "gen" time-parts (gen kn))
            asserts #js []
            retracts #js []]
        (console-time "asserts+retracts+updates" time-parts
                      (console-time "asserts" time-parts
                                    (doseq [assert-f assert-fs
                                            result (assert-f facts)]
                                      (.push asserts result)))
                      (console-time "retracts" time-parts
                                    (doseq [retract-f retract-fs
                                            result (retract-f facts)]
                                      (.push retracts result)))
                      (console-time "updates" time-parts
                                    (doseq [[update-gen update-template] (map vector update-gens update-templates)
                                            result (join (update-gen kn) facts (intersection (::shape (info update-gen)) (::shape (info gen))))]
                                      (.push retracts (update-sym result))
                                      (.push asserts (merge (update-sym result) (fill-in update-template result))))))
        [asserts retracts]))))

(defn query* [clauses]
  (let [asserts+retracts (asserts+retracts* clauses)
        name (str "query:" clauses)]
    (fn query*-fn [kn]
      (console-time name time-queries
                    (let [[asserts retracts] (asserts+retracts kn)]
                      (console-time "query" time-parts
                                    (difference (set asserts) retracts)))))))

(defn rule* [clauses]
  (let [asserts+retracts (asserts+retracts* clauses)
        name (str "rule:" clauses)]
    (with-info
      (fn rule*-fn [kn]
        (console-time name time-rules
                      (let [[asserts retracts] (asserts+retracts kn)]
                        (console-time "rule" time-parts
                                      (reduce retract (reduce assert kn asserts) retracts)))))
      {::preds-in (apply union (map preds-in clauses))
       ::preds-out (apply union (map preds-out clauses))
       ::negs-in (apply union (map negs-in clauses))
       ::negs-out (apply union (map negs-out clauses))})))

(defn chain [rules]
  (fn chain-fn [kn]
    (reduce #(%2 %1) kn rules)))

;; TODO this doesn't propagate deltas efficiently, needs some fast way to read changes before and after
(defn fixpoint [rule]
  (fn fixpoint-fn [kn]
    (let [new-kn (rule kn)]
      (if (= new-kn kn)
        new-kn
        (fixpoint-fn new-kn)))))


;;*********************************************************
;; Macroless-ness
;;*********************************************************

(defn fns* [syms body & [allowed-fns]]
  (let [body (for [b body]
               (if (list? b)
                 (conj (rest b) (or (allowed-fns (first b))
                                    (->> (first b)
                                         (jsth/munge)
                                         (str "cljs.core.")
                                         (symbol))))
                 b))
        arg (gensym "x")]
    (with-meta ((js/Function "gened" (str "return " (jsth/statement->string `(fn foo [~arg]
                                                                              (do
                                                                                ~@(for [s syms]
                                                                                    `(let! ~(symbol s) (cljs.core.get ~arg (cljs.core.symbol ~(str s)))))
                                                                                ~@(butlast body)
                                                                                (return ~(last body))))))))
      {:aurora/selects syms})))


(defn vars* [form]
  (cond
   (contains? (meta form) :tag) (conj (vars (with-meta form {})) (:tag (meta form)))
   (= '_ form) #{}
   (symbol? form) #{form}
   (coll? form) (apply clojure.set/union (map vars form))
   :else #{}))

(defn op? [op clause]
  (and (seq? clause) (= op (first clause))))

(defn vars [clause]
  (condp op? clause
    '+ed (vars* (second clause))
    '-ed (vars* (second clause))
    'set (conj (clojure.set/difference (apply clojure.set/union (map vars (nthnext clause 3))) (nth clause 2)) (nth clause 1))
    'in #{(second clause)}
    '= #{(second clause)}
    (if (seq? clause)
      #{}
      (vars* clause))))

(defn quote-clause [clause fns-vars allowed-fns]
  (condp op? clause
    '+s (list '+s (fns* fns-vars [(second clause)] allowed-fns))
    '-s (list '-s (fns* fns-vars [(second clause)] allowed-fns))
    '? (list '? (fns* fns-vars [(second clause)] allowed-fns))
    '= (list '= (nth clause 1) (fns* fns-vars [(nth clause 2)] allowed-fns))
    clause))

(defn quote-clauses
  ([clauses] (quote-clauses clauses {}))
  ([clauses allowed-fns]
   (let [fns-vars (into [] (apply clojure.set/union (map vars clauses)))]
     (mapv #(quote-clause % fns-vars allowed-fns) clauses))))

(defn macroless-rule [clauses]
  (rule* (quote-clauses clauses)))

(defn macroless-query [clauses]
  (query* (quote-clauses clauses)))

;; tests

(comment
  (enable-console-print!)

  (quote-clauses '[[a b c]
                   (= foo (+ b 4))
                   (+ [a foo])])

  ((query* (quote-clauses '[[a b c]
                                    (= foo (+ b 4))
                            (+s [[a] [b] [c]])
                            (+ [a foo])]))
   (Knowledge. #{[1 2 3] [3 4 5]} #{} #{}))

  ((query [a b c]
                                    (= foo (+ b 4))
                            (+s [[a] [b] [c]])
                            (+ [a foo]))
   (Knowledge. #{[1 2 3] [3 4 5]} #{} #{}))

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

  ((query (set x [id]
               {:name "foo" :id id})
          (+ 1))
   (Knowledge. #{{:name "zomg" :id 4} {:name "foo" :id 3}} #{} #{}))
  )
