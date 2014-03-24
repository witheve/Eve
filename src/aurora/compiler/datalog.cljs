(aset js/aurora.compiler "datalog" nil)

(ns aurora.compiler.datalog
  (:require [clojure.set :refer [union intersection difference subset?]]
            [aurora.compiler.jsth :as jsth]
            [aurora.compiler.match :as match])
  (:require-macros [aurora.macros :refer [fns check deftraced console-time set!! conj!! disj!! assoc!!]]
                   [aurora.compiler.match :refer [match]]
                   [aurora.compiler.datalog :refer [query rule]]))

(comment ;; grammar
  pattern
  (+ed pattern)
  (-ed pattern)
  (? vars fn)
  (= var vars fn)
  (set var vars & clauses)
  ;; (in var var)
  (+ pattern)
  (- pattern)
  (> pattern pattern)
  (+s vars fn)
  (-s vars fn)
  )

;; TODO
;; query optimisation (starting with clause sorting)
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

(defrecord Knowledge [prev asserted-now retracted-now now])

(defn tick [{:keys [now]}]
  (->Knowledge. now #{} #{} now))

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
        (assert false (str (pr-str value) " is not contained in " (pr-str vector)))))))

(defn ixes-of [vector values]
  (vec (map #(ix-of vector %) values)))

;; PLAN NODES

;; TODO
;; can maybe create funs that do the selection rather than selecting each time
;; funs as js?
;; maybe pass a transient set into the run? will that mess up abstract sets later?

(defprotocol PlanNode
  (run-node [this cache kn] "-> value"))

(defrecord Project [key pattern pattern-fn shape]
  PlanNode
  (run-node [this cache kn]
       (let [result (transient #{})]
         (doseq [fact (key kn)]
           (when-let [row (pattern-fn fact)]
             (conj!! result (js/cljs.core.PersistentVector.fromArray row true))))
         (persistent! result))))

(defn ->project [key pattern]
  (let [vars (match/vars pattern)
        shape (vec vars)
        pattern-fn (match/pattern pattern shape)]
    (->Project key pattern pattern-fn shape)))

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
           (conj!! result (js/cljs.core.PersistentVector.fromArray (.concat (select-ixes row-i select-ixes-i) (select-ixes row-j select-ixes-j)) true)))
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
           (conj!! result row))
         (persistent! result))))

(defn ->filter [[i shape-i] filter-shape filter-fn]
  (assert #(every? (set shape-i) filter-shape) (str "Scope " (pr-str filter-shape) " not contained in " (pr-str shape-i)))
  (let [filter-ixes (ixes-of shape-i filter-shape)
        shape shape-i]
    (->Filter i filter-fn filter-ixes shape)))

;; (run-node (->filter [0 '[a b c]] '[a b] (fn [a b] (> a b))) [#{[1 2 3] [3 2 1] [4 5 6] [6 5 4]}])

(defrecord Let [i let-fn let-ixes shape]
  PlanNode
  (run-node [this cache kn]
       (let [result (transient #{})]
         (doseq [row (nth cache i)]
           (let [selection (select-ixes row let-ixes)
                 elem (.apply let-fn nil selection)]
             (conj!! result (conj row elem))))
         (persistent! result))))

(defn ->let [[i shape-i] let-name let-shape let-fn]
  (assert (not ((set shape-i) let-name)) (str "Name " (pr-str let-name) " is already in scope " (pr-str shape-i)))
  (assert #(every? (set shape-i) let-shape) (str "Scope " (pr-str let-shape) " not contained in " (pr-str shape-i)))
  (let [let-ixes (ixes-of shape-i let-shape)
        shape (conj shape-i let-name)]
    (->Let i let-fn let-ixes shape)))

;; (run-node (->let [0 '[w x y]] 'z '[x y] (fn [x y] (+ x y))) [#{[1 2 3] [3 4 5]}])

(comment
  (defrecord In [i from-ix shape]
    PlanNode
    (run-node [this cache kn]
              (let [result (transient #{})]
                (doseq [row (nth cache i)
                        elem (nth row from-ix)]
                  (conj!! result (conj row elem)))
                (persistent! result))))

  (defn ->in [[i shape-i] from-name]
    (let [shape (conj shape-i from-name)
          from-ix (ix-of shape-i from-name)]
      (->In i from-ix shape))))

;; (run-node (->in [0 '[a b c]] 'a) [#{[[1 2 3] 4 5] [[6 7 8] 9 10]}])

(defrecord Group [i group-ixes project-ixes shape]
  PlanNode
  (run-node [this cache kn]
       (let [groups (transient {})]
         (doseq [row (nth cache i)]
           (let [key (js/cljs.core.PersistentVector.fromArray (select-ixes row project-ixes) true)
                 val (js/cljs.core.PersistentVector.fromArray (select-ixes row group-ixes) true)]
             (assoc!! groups key (conj (or (get groups key) #{}) val))))
         (let [result (transient #{})]
           (doseq [[key vals] (persistent! groups)]
             (conj!! result (conj key vals)))
           (persistent! result)))))

(defn ->group [[i shape-i] group-name group-shape]
  (assert #(every? (set shape-i) group-shape) (str "Scope " (pr-str group-shape) " not contained in " (pr-str shape-i)))
  (let [group-ixes (ixes-of shape-i group-shape)
        set-group-shape (set group-shape)
        project-shape (vec (filter #(not (set-group-shape %)) shape-i))
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
             (conj!! result fact)))
         (persistent! result))))

(defn ->map [[i shape-i] map-pattern]
  (let [map-shape (into [] (match/vars map-pattern))
        _ (assert #(every? (set shape-i) map-shape) (str "Scope " (pr-str map-shape) " not contained in " (pr-str shape-i)))
        map-fn (match/constructor map-pattern map-shape)
        map-ixes (ixes-of shape-i map-shape)]
    (->Map i map-fn map-ixes)))

;; (run-node (->map [0 '[a b c d]] '{:b b :d d}) [#{[1 2 3 4] [5 6 7 8]}])

(defrecord MapCat [i map-fn map-ixes]
  PlanNode
  (run-node [this cache kn]
       (let [result (transient #{})]
         (doseq [row (nth cache i)]
           (let [selection (select-ixes row map-ixes)
                 facts (.apply map-fn nil selection)]
             (doseq [fact facts]
               (conj!! result fact))))
         (persistent! result))))

(defn ->mapcat [[i shape-i] map-shape map-fn]
  (assert #(every? (set shape-i) map-shape) (str "Scope " (pr-str map-shape) " not contained in " (pr-str shape-i)))
  (let [map-ixes (ixes-of shape-i map-shape)]
    (->MapCat i map-fn map-ixes)))

;; (run-node (->mapcat [0 '[a b c d]] '[b d] (fn [a b] [{:a a} {:b b}])) [#{[1 2 3 4] [5 6 7 8]}])

;; PLANS

(defn +node [plan node]
  (.push plan node)
  [(dec (alength plan)) (:shape node)])

(defn run-plan [plan cache kn]
  (dotimes [i (count plan)]
    (aset cache i (run-node (nth plan i) cache kn))))

(comment
  (let [kn (->Knowledge. nil nil nil #{{:a 1 :b 2} {:a 2 :b 3} {:c 1 :b 2} {:c 2 :d 4}})
        plan #js []
        abs (+node plan (->project :now '{:a a :b b}))
        bcs (+node plan (->project :now '{:c c :b b}))
        abcs (+node plan (->join abs bcs))
        ret (+node plan (->map abcs (fn [a c] {:a a :c c}) '[a c]))]
    (last (run-plan plan kn))))

;; RULE ANALYSIS

(defn op [clause]
  (if (seq? clause)
    (first clause)
    :pattern))

(defn name? [x]
  (or (string? x) (keyword? x)))

(defn pred-name [pattern]
  (cond
   (and (map? pattern) (name? (:name pattern))) (:name pattern)
   (and (vector? pattern) (name? (first pattern))) (first pattern)
   :else ::any))

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
        (check (or (= ::any to-name) (= from-name to-name)))
        #{from-name})
    #{}))

(defn preds-out [clause]
  ;; TODO check not nil
  (case (op clause)
    + #{(pred-name (nth clause 1))}
    - #{(pred-name (nth clause 1))}
    +s #{::any}
    -s #{::any}
    > (let [from-name (pred-name (nth clause 1))
            to-name (pred-name (nth clause 2))]
        (check from-name)
        (check (or (= ::any to-name) (= from-name to-name)))
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
    -s #{::any}
    > (let [from-name (pred-name (nth clause 1))
            to-name (pred-name (nth clause 2))]
        (check from-name)
        (check (or (= ::any to-name) (= from-name to-name)))
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

;; RULES

(defrecord Rule [plan assert-ixes retract-ixes preds-in preds-out negs-in negs-out])

(defn +assert [{:keys [plan assert-ixes]} node]
  (let [[ix _] (+node plan node)]
    (.push assert-ixes ix)))

(defn +retract [{:keys [plan retract-ixes]} node]
  (let [[ix _] (+node plan node)]
    (.push retract-ixes ix)))

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
        > (let [[_ retract-pattern assert-pattern] clause
                retractees (+node plan (->join body (+node plan (->project :now retract-pattern))))]
             (+retract rule (->map retractees retract-pattern))
             (+assert rule (->map retractees assert-pattern)))
        nil))
    rule))

(defn query-rule [{:keys [plan assert-ixes retract-ixes]} kn]
  (let [cache (make-array (count plan))
        result (transient #{})]
    (run-plan plan cache kn)
    (doseq [assert-ix assert-ixes
            fact (aget cache assert-ix)]
      (conj!! result fact))
    (doseq [retract-ix retract-ixes
            fact (aget cache retract-ix)]
      (disj!! result fact))
    (persistent! result)))

(comment
  (let [kn (->Knowledge. nil nil nil #{{:a 1 :b 2} {:a 2 :b 3} {:c 1 :b 2} {:c 2 :d 4}})
        rule (clauses->rule ['{:a a :b b}
                             '{:c c :b b}
                             (list '+ '[a c] (fn [a c] {:a a :c c}))])]
    (query-rule rule kn))
  )

(defn run-rule [{:keys [plan assert-ixes retract-ixes]} kn]
  (let [cache (make-array (count plan))
        prev (:prev kn)
        now (transient (:now kn))
        asserted-now (transient (:asserted-now kn))
        retracted-now (transient (:retracted-now kn))]
    (run-plan plan cache kn)
    (doseq [assert-ix assert-ixes
            fact (aget cache assert-ix)]
      (conj!! asserted-now fact)
      (when (or (contains? prev fact) (not (contains? retracted-now fact)))
        (conj!! now fact)))
    (doseq [retract-ix retract-ixes
            fact (aget cache retract-ix)]
      (conj!! retracted-now fact)
      (when (or (not (contains? prev fact)) (not (contains? asserted-now fact)))
        (disj!! now fact)))
    (->Knowledge. prev (persistent! asserted-now) (persistent! retracted-now) (persistent! now))))

(comment
  (let [kn (->Knowledge. #{{:a 1 :b 2} {:a 2 :b 3} {:c 1 :b 2} {:c 2 :d 4}} #{} #{} #{{:a 1 :b 2} {:a 2 :b 3} {:c 1 :b 2} {:c 2 :d 4}})
        rule (clauses->rule '[{:a a :b b}
                              {:c c :b b}
                              (+ {:a a :c c})
                              (- {:a a :c c})])]
    (run-rule rule kn))

  (let [kn (->Knowledge. #{{:a 1 :c 1} {:a 1 :b 2} {:a 2 :b 3} {:c 1 :b 2} {:c 2 :d 4}} #{} #{} #{{:a 1 :b 2} {:a 2 :b 3} {:c 1 :b 2} {:c 2 :d 4}})
        rule (clauses->rule '[{:a a :b b}
                              {:c c :b b}
                              (+ {:a a :c c})
                              (- {:a a :c c})])]
    (run-rule rule kn))

  (let [kn (->Knowledge. #{{:a 1 :c 1} {:a 1 :b 2} {:a 2 :b 3} {:c 1 :b 2} {:c 2 :d 4}} #{} #{} #{{:a 1 :b 2} {:a 2 :b 3} {:c 1 :b 2} {:c 2 :d 4}})
        rule (clauses->rule '[{:a a :b b}
                              {:c c :b b}
                              (- {:a a :c c})])]
    (run-rule rule kn))
  )

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

;; TESTS

(comment
  (enable-console-print!)

  (query-rule
   (rule [a b _]
         [_ a b]
         (? [a] (integer? a))
         (+ [a b]))
   (tick {:now #{[1 2 3] [2 3 4] [:a :b :c] [:b :c :d]}}))

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
   (Knowledge. #{[2 3 4] [:a :b :c] [:b :c :d]} #{[1 2 3]} #{} #{[2 3 4] [:a :b :c] [:b :c :d] [1 2 3]}))

  (run-rule
   (rule [a b _]
         [_ a b]
         (? [a] (integer? a))
         (+ [a a a])
         (- [b b b]))
   (Knowledge. #{[2 3 4] [:a :b :c] [:b :c :d]} #{[1 2 3]} #{[1 2 3]} #{[2 3 4] [:a :b :c] [:b :c :d]}))

  (query-rule
   (rule (+ed [a b])
         (+ [a b]))
   (Knowledge. #{} #{[1 2]} #{} #{[1 2]}))

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

;; 'in is not currently supported
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
   (Knowledge. #{[2 3 4] [:a :b :c] [:b :c :d]} #{[1 2 3]} #{} #{[1 2 3] [2 3 4] [:a :b :c] [:b :c :d]}))

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
  )
