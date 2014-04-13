(ns aurora.language
  (:require [clojure.set :refer [union intersection difference subset?]]
            [aurora.language.jsth :as jsth]
            [aurora.language.match :as match])
  (:require-macros [aurora.macros :refer [console-time set!! conj!! disj!! assoc!! apush apush* avec]]
                   [aurora.language :refer [deffact]]))

;; TODO facts and plans need to be serializable

;; FACTS

(defn- hash-array [array]
  (if (> (alength array) 0)
    (loop [result (hash (aget array 0))
           i 1]
      (if (< i (alength array))
        (recur (hash-combine result (hash (aget array i))) (+ i 1))
        result))
    0))

(comment
  (= (hash-array #js [1 2 :c]) (hash [1 2 :c]))
  )

(deftype FactShape [id madlib keys]
  Object
  (toString [this]
            (apply str (interleave madlib (map (fn [k] (str "[" (name k) "]")) keys)))))

(deftype Fact [shape values ^:mutable __hash]
  Object
  (toString [this]
            (if shape
              (apply str (interleave (.-madlib shape) (map (fn [k v] (str "[" (name k) " = " (pr-str v) "]")) (.-keys shape) values)))
              (apply str (map (fn [v] (str "[_ = " (pr-str v) "]")) values))))

  IEquiv
  (-equiv [this other]
          (and (instance? Fact other)
               (= (.-id shape) (.-id (.-shape other)))
               (loop [i 0]
                 (if (>= i (alength values))
                   true
                   (when (= (aget values i) (aget (.-values other) i))
                     (recur (+ i 1)))))))

  IHash
  (-hash [this] (caching-hash this hash-array __hash))

  IIndexed
  (-nth [this n]
        (-nth this n nil))
  (-nth [this n not-found]
        (if (and (<= 0 n) (< n (alength values)))
          (aget values n)
          not-found))

  ILookup
  (-lookup [this k]
           (-lookup this k nil))
  (-lookup [this k not-found]
           (if (number? k)
             (-nth this k not-found)
             (when shape
               (loop [i 0]
                 (when (< i (alength (.-keys shape)))
                   (if (= k (aget (.-keys shape) i))
                     (aget values i)
                     (recur (+ i 1)))))))))

(defn id->fact-shape [id]
  (js/eval (str (namespace id) "." (name id)))) ;; TODO assumes facts are created by deffact

(defn fact-shape [id madlib&keys]
  (let [split-madlib&keys (clojure.string/split madlib&keys #"\[|\]")
        [madlib keys] [(take-nth 2 split-madlib&keys) (map keyword (take-nth 2 (rest split-madlib&keys)))]]
    (FactShape. id (into-array madlib) (into-array keys))))

(defn fact
  ([values]
   (assert (array? values) (pr-str values))
   (Fact. nil values nil))
  ([shape values]
   (assert (instance? FactShape shape) (pr-str shape))
   (assert (array? values) (pr-str values))
   (assert (= (alength values) (alength (.-keys shape))) (pr-str values shape))
   (Fact. shape values nil)))

(defn fact-ix [fact ix]
  (aget (.-values fact) ix))

(defn fact-ixes [fact ixes]
  (let [result #js []
        values (.-values fact)]
    (dotimes [i (count ixes)]
      (apush result (aget values (aget ixes i))))
    (Fact. nil result nil)))

(defn fact-join-ixes [left-fact right-fact ixes]
  (let [result #js []
        left-values (.-values left-fact)
        right-values (.-values right-fact)]
    (dotimes [i (count ixes)]
      (let [ix (aget ixes i)]
        (if (< ix (alength left-values))
          (apush result (aget left-values ix))
          (apush result (aget right-values (- ix (alength left-values)))))))
    (Fact. nil result nil)))

(comment
  (fact-shape ::eg "[a] has a [b] with a [c]")
  (fact-shape ::eg "The [a] has a [b] with a [c]")

  (fact #js [0 1 2])
  (fact (fact-shape ::eg "The [a] has a [b] with a [c]") #js [0 1 2])

  (deffact eg "[a] has a [b] with a [c]")
  (.-id eg)

  eg

  (.-id (.-shape (fact (fact-shape ::eg "[a] has a [b] with a [c]") #js ["a" "b" "c"])))

  (def x (->eg "a" "b" "c"))
  (nth x 1)
  (get x 1)
  (get x :b)


  (fact (fact-shape ::eg "[a] has a [b] with a [c]") #js ["a" "b" "c"])

  (= x x)
  (= x (fact (fact-shape ::eg "[a] has a [b] with a [c]") #js ["a" "b" "c"]))
  (= x (fact (id->fact-shape ::eg) #js ["a" "b" "c"]))
  (= x (fact eg #js ["a" "b" "c"]))
  (= x (->eg "a" "b" "c"))

  (fact-ixes x #js [2 1])
  )

;; FLOW STATE

(defrecord FlowState [node->state node->out-nodes node->facts node->update!])

(defn fixpoint [{:keys [node->state node->out-nodes node->facts node->update!] :as flow-state}]
  (loop [node 0]
    (when (< node (alength node->facts))
      (let [in-facts (aget node->facts node)]
        (if (== 0 (alength in-facts))
          (recur (+ node 1))
          (let [out-facts #js []]
            (prn node in-facts)
            (.call (aget node->update! node) nil node node->state in-facts out-facts)
            (aset node->facts node #js [])
            (if (> (alength out-facts) 0)
              (let [out-nodes (aget node->out-nodes node)
                    min-out-node (areduce out-nodes i min-out-node (+ node 1)
                                          (let [out-node (aget out-nodes i)]
                                            (apush* (aget node->facts out-node) out-facts)
                                            (min out-node min-out-node)))]
                (recur min-out-node))
              (recur (+ node 1))))))))
  flow-state)

(defn filter-map-update! [fun]
  (fn [node node->state in-facts out-facts]
    (dotimes [i (alength in-facts)]
      (let [fact (aget in-facts i)]
        (when-let [new-fact (.call fun nil fact)]
          (apush out-facts new-fact))))))

(defn union-update! []
  (fn [node node->state in-facts out-facts]
    (let [set (aget node->state node)]
      (dotimes [i (alength in-facts)]
        (let [fact (aget in-facts i)]
          (when (not (contains? set fact))
            (conj!! set fact)
            (apush out-facts fact))))
      (aset node->state node set))))

(defn index-update! [key-ixes]
  (fn [node node->state in-facts out-facts]
    (let [index (aget node->state node)]
      (dotimes [i (alength in-facts)]
        (let [fact (aget in-facts i)
              key (fact-ixes fact key-ixes)
              facts (or (get index key) #{})] ;; TODO transients are not seqable :(
          (when-not (contains? facts fact)
            (assoc!! index key (conj facts fact))
            (apush out-facts fact))))
      (aset node->state node index))))

(defn lookup-update! [index-node key-ixes val-ixes]
  (fn [node node->state in-facts out-facts]
    (let [index (aget node->state index-node)]
      (dotimes [i (alength in-facts)]
        (let [left-fact (aget in-facts i)
              key (fact-ixes left-fact key-ixes)]
          (doseq [right-fact (get index key)]
              (apush out-facts (fact-join-ixes left-fact right-fact val-ixes))))))))

(comment

  (deffact edge "[x] has an edge to [y]")
  (deffact connected "[x] is connected to [y]")

  ;; [x] has an edge to [y]
  ;; [y] is connected to [z]
  ;; + [x] is connected to [z]

  (->
   (->
    (->FlowState #js [(transient #{}) nil nil (transient {}) (transient {}) nil nil]
                 #js [#js [1 2] #js [3 7] #js [4] #js [5] #js [6] #js [7] #js [7] #js [0]]
                   #js [#js [(->edge 0 1) (->edge 1 2) (->edge 2 3) (->edge 3 1)] #js [] #js [] #js [] #js [] #js [] #js [] #js []]
                   #js [(union-update!)
                        (filter-map-update! (fn [x] (when (= edge (.-shape x)) x)))
                        (filter-map-update! (fn [x] (when (= connected (.-shape x)) x)))
                        (index-update! #js [1])
                        (index-update! #js [0])
                        (lookup-update! 4 #js [1] #js [0 3])
                        (lookup-update! 3 #js [0] #js [2 1])
                        (filter-map-update! (fn [x] (->connected (fact-ix x 0) (fact-ix x 1))))])
    fixpoint)
   :node->state
   (aget 0)
   persistent!)

  )

;; FLOWS

(defrecord Union [nodes])
(defrecord FilterMap [nodes fun])
(defrecord Index [nodes key-ixes])
(defrecord Lookup [nodes index-node key-ixes val-ixes])

;; FLOW PLAN

(defrecord FlowPlan [node->flow flow->node])

(defn flow-plan->flow-state [{:keys [node->flow]}]
  (let [node->state (into-array (for [_ node->flow] nil))
        node->out-nodes (into-array (for [_ node->flow] #js []))
        node->facts (into-array (for [_ node->flow] #js []))
        node->update! (into-array (for [_ node->flow] nil))]
    (dotimes [node (count node->flow)]
      (let [flow (nth node->flow node)]
        (aset node->state node
              (condp = (type flow)
                Union (transient #{})
                FilterMap nil
                Index (transient {})
                Lookup nil))
        (doseq [in-node (:nodes flow)]
          (apush (aget node->out-nodes in-node) node))
        (aset node->update! node
              (condp = (type flow)
                Union (union-update!)
                FilterMap (filter-map-update! (:fun flow))
                Index (index-update! (:key-ixes flow))
                Lookup (lookup-update! (:index-node flow) (:key-ixes flow) (:val-ixes flow))))))
    (FlowState. node->state node->out-nodes node->facts node->update!)))

(defn memory->node [memory]
  (case memory
    :known 0
    :pretended 1
    :remembered 2
    :forgotten 3))

(def known&pretended [0 1])

(def empty-flow-plan
  (FlowPlan. [(Union. #{}) (Union. #{}) (Union. #{}) (Union. #{})] {}))

(defn output-flow [flow-plan node memory]
  (update-in flow-plan [:node->flow (memory->node memory) :nodes] conj node))

(defn add-flow [{:keys [node->flow flow->node] :as flow-plan} flow]
  (if-let [node (flow->node flow)]
    [flow-plan node]
    (let [node (count node->flow)
          node->flow (conj node->flow flow)
          flow->node (assoc flow->node flow node)]
      [(FlowPlan. node->flow flow->node) node])))

(comment
  (deffact edge "[x] has an edge to [y]")
  (deffact connected "[x] is connected to [y]")

  (let [plan empty-flow-plan
        [plan edges] (add-flow plan (FilterMap. known&pretended (fn [x] (when (= edge (.-shape x)) x))))
        [plan connecteds] (add-flow plan (FilterMap. known&pretended (fn [x] (when (= connected (.-shape x)) x))))
        [plan edges-index] (add-flow plan (Index. [edges] #js [1]))
        [plan connecteds-index] (add-flow plan (Index. [connecteds] #js [0]))
        [plan edges-lookup] (add-flow plan (Lookup. [edges-index] connecteds-index #js [1] #js [0 3]))
        [plan connecteds-lookup] (add-flow plan (Lookup. [connecteds-index] edges-index #js [0] #js [2 1]))
        [plan new-connecteds] (add-flow plan (FilterMap. [edges edges-lookup connecteds-lookup] (fn [x] (->connected (fact-ix x 0) (fact-ix x 1)))))
        plan (output-flow plan new-connecteds :pretended)
        state (flow-plan->flow-state plan)]
    (apush* (aget (:node->facts state) 0) #js [(->edge 0 1) (->edge 1 2) (->edge 2 3) (->edge 3 1)])
    (-> (fixpoint state) :node->state (aget 1) persistent!))
  )

;; IXES

(defn ix-of [vector value]
  (let [count (count vector)]
    (loop [ix 0]
      (if (< ix count)
        (if (= value (nth vector ix))
          ix
          (recur (+ ix 1)))
        (assert false (str (pr-str value) " is not contained in " (pr-str vector)))))))

(defn ixes-of [vector values]
  (into-array (map #(ix-of vector %) values)))

;; PATTERNS

(defn pattern->shape [pattern]
  (filterv symbol? (rest pattern)))

(defn pattern->constructor [pattern source-shape]
  (let [id (first pattern)
        fact-shape (id->fact-shape id)
        constants (into-array
                   (for [value (rest pattern)]
                     (when-not (symbol? value)
                       value)))
        pattern-shape (pattern->shape pattern)
        source-ixes (ixes-of source-shape pattern-shape)
        sink-ixes (ixes-of (rest pattern) pattern-shape)]
    (fn [fact]
      (let [source (.-values fact)
            sink (aclone constants)]
        (dotimes [i (alength source-ixes)]
          (aset sink (aget sink-ixes i) (aget source (aget source-ixes i))))
        (Fact. fact-shape sink)))))

(defn pattern->deconstructor [pattern]
  (let [id (first pattern)
        constant-values (into-array
                        (for [[value i] (map vector (rest pattern) (range))
                              :when (not (symbol? value))]
                          value))
        constant-ixes (into-array
                       (for [[value i] (map vector (rest pattern) (range))
                             :when (not (symbol? value))]
                         i))
        pattern-shape (pattern->shape pattern)
        var-ixes (ixes-of (rest pattern) pattern-shape)]
    (fn [fact]
      (when (= id (.-id (.-shape fact)))
        (let [source (.-values fact)]
          (loop [i 0]
            (if (< i (alength constant-values))
              (when (= (aget constant-values i) (aget source (aget constant-ixes i)))
                (recur (+ i 1)))
              (let [sink (make-array (alength var-ixes))]
                (dotimes [i (alength var-ixes)]
                  (aset sink i (aget source (aget var-ixes i))))
                (Fact. nil sink)))))))))

(comment
  (deffact eg "[a] has a [b] with a [c]")

  (pattern->shape '[::eg a "b" c])

  ((pattern->constructor '[::eg "a" "b" "c"] []) (->eg 0 1 2))
  ((pattern->constructor '[::eg c "b" a] '[a b c]) (->eg 0 1 2))

  ((pattern->deconstructor '[::eg a "b" c]) (->eg "a" "b" "c"))
  ((pattern->deconstructor '[::eg a "b" c]) (->eg "a" "B" "c"))
  ((pattern->deconstructor '[::eg a "b" "c"]) (->eg "a" "b" "c"))
  ((pattern->deconstructor '[::eg "a" "b" "c"]) (->eg "a" "b" "c"))
  ((pattern->deconstructor '[::eg a b c]) (->eg "a" "b" "c"))
  )

;; EXPRS

(defn expr->fun [vars expr]
  (apply js/Function (conj (vec vars) (str "return " expr ";"))))

;; CLAUSES

(defrecord Recall [memory pattern]) ;; memory is one of :known :pretended :remembered :forgotten :known&pretended
(defrecord Filter [expr])
(defrecord Let [name expr])
(defrecord Set [name vars clauses])
(defrecord Output [memory pattern]) ;; memory is one of :pretended :remembered :forgotten
(defrecord OutputMany [memory expr]) ;; memory is one of :pretended :remembered :forgotten

(defn clause->flow-plan [flow-plan shape clause]
  (condp = (type clause)
    ;; TODO !!! keep going here
    ))

;; RULES

(defrecord Rule [clauses])

(defn rule->flow-plan [flow-plan rule]
  (loop [flow-plan flow-plan
         shape []
         clauses (:clauses rule)]
    (if-let [[new-flow-plan new-shape clause] (first (map #(clause->flow-plan flow-plan shape %) clauses))]
      (recur new-flow-plan new-shape (filter #(not= clause %) clauses))
      (do (assert (empty? clauses) (str "Cannot join " (pr-str shape) " with " (pr-str clauses)))
        flow-plan))))

;; TODO !!! test
