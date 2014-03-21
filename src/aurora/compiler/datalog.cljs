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
;; abstract result sets (many of the results can just use arrays)
;; seminaive evaluation
;; incremental assert
;; incremental retract
;; stratification
;; schemas
;; hashjoins / incremental joins
;; index by predicate?
;; profiler
;; debugger

;; KNOWLEDGE

(defrecord Knowledge [prev asserted-now retracted-now now asserted-next retracted-next])

;; TODO
(defn assert-now [kn facts])
(defn retract-now [kn facts])
(defn assert-later [kn facts])
(defn retract-later [kn facts])

;; TODO can probably just do this on assert/retract by looking at counts
(defn to-be [{:keys [old asserted retracted] :as kn}]
  ;; (old & ¬(retracted & ¬asserted)) | (asserted & ¬retracted)
  (let [actually-asserted (difference asserted retracted)
        actually-retracted (difference retracted asserted)
        to-be (difference (union old actually-asserted) actually-retracted)]
    to-be))

(defn and-now [kn]
  (Knowledge. (to-be kn) #{} #{}))

;; MAPS -> ROWS

(defn select-ixes [vector ixes]
  (let [result #js []
        count (count ixes)]
    (loop [ix 0]
      (when (< ix count)
        (.push result (nth vector (nth ixes ix)))
        (recur (+ ix 1))))
    result))

(defn ix-of [vector value]
  (let [count (count vector)]
    (loop [ix 0]
      (if (< ix count)
        (if (= value (nth vector ix))
          ix
          (recur (+ ix 1)))
        (assert false)))))

(defn ixes-of [vector values]
  (vec (map #(ix-of vector %) values)))

;; PLAN NODES

;; TODO
;; can maybe create funs that do the selection rather than selecting each time
;; funs as js?
;; maybe pass a transient set into the run? will that mess up abstract sets later?

(defprotocol PlanNode
  (run-node [this cache kn] "-> value"))

(defrecord Project [pattern pattern-fn shape]
  PlanNode
  (run-node [this cache kn]
       (let [result (transient #{})]
         (doseq [fact (:now kn)]
           (when-let [row (pattern-fn fact)]
             (conj! result (js/cljs.core.PersistentVector.fromArray row true))))
         (persistent! result))))

(defn ->project [pattern]
  (let [vars (match/vars pattern)
        shape (vec vars)
        pattern-fn (match/pattern pattern shape)]
    (->Project pattern pattern-fn shape)))

;; (run-node (->project '[a b]) [] (->Knowledge. nil nil nil #{[0] [1 2] [3 4 5]}))

(defrecord Join [i j key-ixes-i key-ixes-j select-ixes-i select-ixes-j shape]
  PlanNode
  (run-node [this cache kn]
       (let [result (transient #{})]
         (doseq [row-i (nth cache i)
                 :let [key-i (js/cljs.core.PersistentVector.fromArray (select-ixes row-i key-ixes-i) true)]
                 :let [_ (prn 'i key-i)]
                 row-j (nth cache j)
                 :let [key-j (js/cljs.core.PersistentVector.fromArray (select-ixes row-j key-ixes-j) true)]
                 :let [_ (prn 'j key-j)]
                 :when (= key-i key-j)]
           (conj! result (js/cljs.core.PersistentVector.fromArray (.concat (select-ixes row-i select-ixes-i) (select-ixes row-j select-ixes-j)) true)))
         (persistent! result))))

(defn ->join [[i shape-i] [j shape-j]]
  (let [join-shape (vec (intersection (set shape-i) (set shape-j)))
        key-ixes-i (ixes-of shape-i join-shape)
        key-ixes-j (ixes-of shape-j join-shape)
        unjoined-shape-j (vec (difference (set shape-j) (set shape-i)))
        shape (vec (concat shape-i unjoined-shape-j))
        select-ixes-i (ixes-of shape-i shape-i)
        select-ixes-j (ixes-of shape-j unjoined-shape-j)]
    (->Join i j key-ixes-i key-ixes-j select-ixes-i select-ixes-j shape)))

;; (run-node (->join [0 '[w x y]] [1 '[x y z]]) [#{[:w0 :x0 :y0] [:w1 :x1 :y1]} #{[:x0 :y0 :z0] [:x1 :y1 :z1]}])

(defrecord Filter [i filter-fn filter-ixes shape]
  PlanNode
  (run-node [this cache kn]
       (let [result (transient #{})]
         (doseq [row (nth cache i)
                 :let [selection (select-ixes row filter-ixes)]
                 :when (.apply filter-fn nil selection)]
           (conj! result row))
         (persistent! result))))

(defn ->filter [[i shape-i] filter-fn filter-shape]
  (let [filter-ixes (ixes-of shape-i filter-shape)
        shape shape-i]
    (->Filter i filter-fn filter-ixes shape)))

;; (run-node (->filter [0 '[a b c]] (fn [a b] (> a b)) '[a b]) [#{[1 2 3] [3 2 1] [4 5 6] [6 5 4]}])

(defrecord Let [i let-fn let-ixes shape]
  PlanNode
  (run-node [this cache kn]
       (let [result (transient #{})]
         (doseq [row (nth cache i)]
           (let [selection (select-ixes row let-ixes)
                 elem (.apply let-fn nil selection)]
             (conj! result (conj row elem))))
         (persistent! result))))

(defn ->let [[i shape-i] let-name let-fn let-shape]
  (let [let-ixes (ixes-of shape-i let-shape)
        shape (conj shape-i let-name)]
    (->Let i let-fn let-ixes shape)))

;; (run-node (->let [0 '[w x y]] 'z (fn [x y] (+ x y)) '[x y]) [#{[1 2 3] [3 4 5]}])

(defrecord In [i from-ix shape]
  PlanNode
  (run-node [this cache kn]
       (let [result (transient #{})]
         (doseq [row (nth cache i)
                 elem (nth row from-ix)]
           (conj! result (conj row elem)))
         (persistent! result))))

(defn ->in [[i shape-i] from-name]
  (let [shape (conj shape-i from-name)
        from-ix (ix-of shape-i from-name)]
    (->In i from-ix shape)))

;; (run-node (->in [0 '[a b c]] 'a) [#{[[1 2 3] 4 5] [[6 7 8] 9 10]}])

(defrecord Group [i group-ixes project-ixes shape]
  PlanNode
  (run-node [this cache kn]
       (let [groups (transient {})]
         (doseq [row (nth cache i)]
           (let [key (js/cljs.core.PersistentVector.fromArray (select-ixes row project-ixes) true)
                 val (js/cljs.core.PersistentVector.fromArray (select-ixes row group-ixes) true)]
             (assoc! groups key (conj (or (get groups key) #{}) val))))
         (let [result (transient #{})]
           (doseq [[key vals] (persistent! groups)]
             (conj! result (conj key vals)))
           (persistent! result)))))

(defn ->group [[i shape-i] group-name group-shape]
  (let [group-ixes (ixes-of shape-i group-shape)
        set-group-shape (set group-shape)
        project-shape (filter #(not (set-group-shape %)) shape-i)
        project-ixes (ixes-of shape-i project-shape)
        shape (conj project-shape group-name)]
    (->Group i group-ixes project-ixes shape)))

;; (run-node (->group [0 '[a b c d]] 'x '[b d]) [#{[1 2 3 4] [1 :a 3 :b] [5 6 7 8]}])

(defrecord Map [i map-fn map-ixes]
  PlanNode
  (run-node [this cache kn]
       (let [result (transient #{})]
         (doseq [row (nth cache i)]
           (let [selection (select-ixes row map-ixes)
                 fact (.apply map-fn nil selection)]
             (conj! result fact)))
         (persistent! result))))

(defn ->map [[i shape-i] map-fn map-shape]
  (let [map-ixes (ixes-of shape-i map-shape)]
    (->Map i map-fn map-ixes)))

;; (run-node (->map [0 '[a b c d]] (fn [a b] {:a a :b b}) '[b d]) [#{[1 2 3 4] [5 6 7 8]}])

(defrecord MapCat [i map-fn map-ixes]
  PlanNode
  (run-node [this cache kn]
       (let [result (transient #{})]
         (doseq [row (nth cache i)]
           (let [selection (select-ixes row map-ixes)
                 facts (.apply map-fn nil selection)]
             (doseq [fact facts]
               (conj! result fact))))
         (persistent! result))))

(defn ->mapcat [[i shape-i] map-fn map-shape]
  (let [map-ixes (ixes-of shape-i map-shape)]
    (->MapCat i map-fn map-ixes)))

;; (run-node (->mapcat [0 '[a b c d]] (fn [a b] [{:a a} {:b b}]) '[b d]) [#{[1 2 3 4] [5 6 7 8]}])

;; PLANS

(defn +node [plan node]
  (.push plan node)
  [(dec (alength plan)) (:shape node)])

(defn run-plan [plan kn]
  (let [cache (make-array (count plan))]
    (dotimes [i (count plan)]
      (aset cache i (run-node (nth plan i) cache kn)))
    cache))

(comment
  (let [kn (->Knowledge. nil nil nil #{{:a 1 :b 2} {:a 2 :b 3} {:c 1 :b 2} {:c 2 :d 4}})
        plan #js []
        abs (+node plan (->project '{:a a :b b}))
        bcs (+node plan (->project '{:c c :b b}))
        abcs (+node plan (->join abs bcs))
        ret (+node plan (->map abcs (fn [a c] {:a a :c c}) '[a c]))]
    (last (run-plan plan kn))))

;; QUERY ANALYSIS

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

;; RULE/QUERY -> PLAN

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
                 b))]
    ((js/Function "gened" (str "return "(jsth/statement->string `(fn foo [x]
                                                                   (do
                                                                     ~@(for [s syms]
                                                                         `(let! ~(symbol s) (cljs.core.get x (cljs.core.symbol ~(str s)))))
                                                                     ~@(butlast body)
                                                                     (return ~(last body))))))))))


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

  ((datalog/query* (quote-clauses '[[a b c]
                                    (= foo (+ b 4))
                                    (+ [a foo])]))
   (datalog/Knowledge. #{[1 2 3] [3 4 5]} #{} #{}))

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
