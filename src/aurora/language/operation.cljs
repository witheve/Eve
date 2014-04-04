(aset js/aurora.language "operation" nil)

(ns aurora.language.operation
  (:require [clojure.set :refer [union intersection difference subset?]]
            [aurora.language.jsth :as jsth]
            [aurora.language.match :as match]
            [aurora.language.representation :refer [->Knowledge]])
  (:require-macros [aurora.macros :refer [console-time set!! conj!! disj!! assoc!!]]))

(def profile? false)

(let [next (atom 0)]
  (defn new-id []
    (if js/window.uuid
      (.replace (js/uuid) (js/RegExp. "-" "gi") "_")
      (swap! next inc))))

;; EXPRS

(defn expr->vars [expr]
  (cond
   (seq? expr) (apply union (map expr->vars (rest expr))) ;; first elem is function
   (coll? expr) (apply union (map expr->vars expr))
   (symbol? expr) #{expr}
   :else #{}))

(defn expr->jsth [expr]
  (clojure.walk/postwalk
   (fn [form]
     (if (and (seq? form) (symbol? (first form)) (not (.test #"\." (name (first form)))))
       (cons (symbol (str "cljs.core." (first form))) (rest form))
       form))
   expr))

(defn expr->fun [expr]
  (apply js/Function (conj (vec (expr->vars expr)) (jsth/statement->string `(return ~(expr->jsth expr))))))

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

;; (run-node (->project '[a b]) [] (->Knowledge nil nil nil #{[0] [1 2] [3 4 5]}))

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

(defn ->filter [[i shape-i] filter-expr]
  (let [filter-shape (vec (expr->vars filter-expr))
        filter-fn (expr->fun filter-expr)]
    (assert (every? (set shape-i) filter-shape) (str "Scope " (pr-str filter-shape) " not contained in " (pr-str shape-i)))
    (let [filter-ixes (ixes-of shape-i filter-shape)
          shape shape-i]
      (->Filter i filter-fn filter-ixes shape))))

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

(defn ->let [[i shape-i] let-name let-expr]
  (let [let-shape (vec (expr->vars let-expr))
        let-fn (expr->fun let-expr)]
    (assert (not ((set shape-i) let-name)) (str "Name " (pr-str let-name) " is already in scope " (pr-str shape-i)))
    (assert (every? (set shape-i) let-shape) (str "Scope " (pr-str let-shape) " not contained in " (pr-str shape-i)))
    (let [let-ixes (ixes-of shape-i let-shape)
          shape (conj shape-i let-name)]
      (->Let i let-fn let-ixes shape))))

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
  (assert (every? (set shape-i) group-shape) (str "Scope " (pr-str group-shape) " not contained in " (pr-str shape-i)))
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
        _ (assert (every? (set shape-i) map-shape) (str "Scope " (pr-str map-shape) " not contained in " (pr-str shape-i)))
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

(defn ->mapcat [[i shape-i] map-expr]
  (let [map-shape (vec (expr->vars map-expr))
        map-fn (expr->fun map-expr)]
    (assert (every? (set shape-i) map-shape) (str "Scope " (pr-str map-shape) " not contained in " (pr-str shape-i)))
    (let [map-ixes (ixes-of shape-i map-shape)]
      (->MapCat i map-fn map-ixes))))

;; (run-node (->mapcat [0 '[a b c d]] '[b d] (fn [a b] [{:a a} {:b b}])) [#{[1 2 3 4] [5 6 7 8]}])

;; PLANS

(defn +node [plan node]
  (.push plan node)
  [(dec (alength plan)) (:shape node)])

(defn run-plan [plan cache kn]
  (console-time (str "plan") profile?
                (dotimes [i (count plan)]
                  (console-time (pr-str (type (nth plan i))) profile?
                                (aset cache i (run-node (nth plan i) cache kn))))))

(comment
  (let [kn (->Knowledge nil nil nil #{{:a 1 :b 2} {:a 2 :b 3} {:c 1 :b 2} {:c 2 :d 4}})
        plan #js []
        abs (+node plan (->project :now '{:a a :b b}))
        bcs (+node plan (->project :now '{:c c :b b}))
        abcs (+node plan (->join abs bcs))
        ret (+node plan (->map abcs (fn [a c] {:a a :c c}) '[a c]))]
    (last (run-plan plan kn))))

;; RULES

(defrecord Rule [plan assert-ixes retract-ixes preds-in preds-out negs-in negs-out])

(defn +assert [{:keys [plan assert-ixes]} node]
  (let [[ix shape] (+node plan node)]
    (.push assert-ixes ix)
    [ix shape]))

(defn +retract [{:keys [plan retract-ixes]} node]
  (let [[ix shape] (+node plan node)]
    (.push retract-ixes ix)
    [ix shape]))

(defn query-rule [{:keys [plan assert-ixes retract-ixes]} kn]
  (let [cache (make-array (count plan))
        result (transient #{})]
    (run-plan plan cache kn)
    (console-time "query asserts" profile?
                  (doseq [assert-ix assert-ixes
                          fact (aget cache assert-ix)]
                    (conj!! result fact)))
    (console-time "query retracts" profile?
                  (doseq [retract-ix retract-ixes
                          fact (aget cache retract-ix)]
                    (disj!! result fact)))
    (persistent! result)))

(comment
  (let [kn (->Knowledge nil nil nil #{{:a 1 :b 2} {:a 2 :b 3} {:c 1 :b 2} {:c 2 :d 4}})
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
    (console-time "rule asserts" profile?
                  (doseq [assert-ix assert-ixes
                          fact (aget cache assert-ix)]
                    (conj!! asserted-now fact)
                    (when (or (contains? prev fact) (not (contains? retracted-now fact)))
                      (conj!! now fact))))
    (console-time "rule retracts" profile?
                  (doseq [retract-ix retract-ixes
                          fact (aget cache retract-ix)]
                    (conj!! retracted-now fact)
                    (when (or (not (contains? prev fact)) (not (contains? asserted-now fact)))
                      (disj!! now fact))))
    (->Knowledge prev (persistent! asserted-now) (persistent! retracted-now) (persistent! now))))

(comment
  (let [kn (->Knowledge #{{:a 1 :b 2} {:a 2 :b 3} {:c 1 :b 2} {:c 2 :d 4}} #{} #{} #{{:a 1 :b 2} {:a 2 :b 3} {:c 1 :b 2} {:c 2 :d 4}})
        rule (clauses->rule '[{:a a :b b}
                              {:c c :b b}
                              (+ {:a a :c c})
                              (- {:a a :c c})])]
    (run-rule rule kn))

  (let [kn (->Knowledge #{{:a 1 :c 1} {:a 1 :b 2} {:a 2 :b 3} {:c 1 :b 2} {:c 2 :d 4}} #{} #{} #{{:a 1 :b 2} {:a 2 :b 3} {:c 1 :b 2} {:c 2 :d 4}})
        rule (clauses->rule '[{:a a :b b}
                              {:c c :b b}
                              (+ {:a a :c c})
                              (- {:a a :c c})])]
    (run-rule rule kn))

  (let [kn (->Knowledge #{{:a 1 :c 1} {:a 1 :b 2} {:a 2 :b 3} {:c 1 :b 2} {:c 2 :d 4}} #{} #{} #{{:a 1 :b 2} {:a 2 :b 3} {:c 1 :b 2} {:c 2 :d 4}})
        rule (clauses->rule '[{:a a :b b}
                              {:c c :b b}
                              (- {:a a :c c})])]
    (run-rule rule kn))
  )
