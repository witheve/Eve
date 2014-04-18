(ns aurora.language
  (:require [clojure.set :refer [union intersection difference subset?]])
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
            (apply str (interleave madlib (map (fn [k] (str "[" (name k) "]")) keys))))
  IEquiv
  (-equiv [this other]
          (and (instance? FactShape other)
               (= id (.-id other)))))

;; if given a shape behaves like a record, otherwise behaves like a vector
(deftype Fact [shape values ^:mutable __hash]
  Object
  (toString [this]
            (if shape
              (apply str (interleave (.-madlib shape) (map (fn [k v] (str "[" (name k) " = " (pr-str v) "]")) (.-keys shape) values)))
              (apply str (map (fn [v] (str "[_ = " (pr-str v) "]")) values))))

  IEquiv
  (-equiv [this other]
          (and (instance? Fact other)
               (= shape (.-shape other))
               (== (alength values) (alength (.-values other)))
               (loop [i 0]
                 (if (>= i (alength values))
                   true
                   (if (= (aget values i) (aget (.-values other) i))
                     (recur (+ i 1))
                     false)))))

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
   (assert (array? values) (pr-str values))
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


  (= eg (fact-shape ::eg "[a] has a [b] with a [c]"))

  (fact (fact-shape ::eg "[a] has a [b] with a [c]") #js ["a" "b" "c"])

  (= x x)
  (= x (fact (fact-shape ::eg "[a] has a [b] with a [c]") #js ["a" "b" "c"]))
  (= x (fact (id->fact-shape ::eg) #js ["a" "b" "c"]))
  (= x (fact eg #js ["a" "b" "c"]))
  (= x (->eg "a" "b" "c"))
  (= (Fact. nil #js ["a" "b" "c"]) (Fact. nil #js ["a" "b" "c"]))

  (= x (Fact. nil #js ["a" "b" "c"]))
  (= x (Fact. eg #js ["a" "b" 0]))
  (= x (fact (fact-shape ::foo "[a] has a [b] with a [c]") #js ["a" "b" "c"]))

  (fact-ixes x #js [2 1])
  )

;; FLOW STATE

(defrecord FlowState [node->state node->out-nodes node->facts node->update!])

(defn fixpoint! [{:keys [node->state node->out-nodes node->facts node->update!] :as flow-state}]
  (loop [node 0]
    (when (< node (alength node->facts))
      (let [in-facts (aget node->facts node)]
        (if (== 0 (alength in-facts))
          (recur (+ node 1))
          (let [out-facts #js []]
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
          ;; TODO this double lookup is a bottleneck
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
  ;; + [x] is connected to [y]

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
    fixpoint!)
   :node->state
   (aget 0)
   persistent!)

  )

;; FLOWS

(defrecord Union [nodes])
(defrecord FilterMap [nodes fun])
(defrecord Index [nodes key-ixes])
(defrecord Lookup [nodes index-node key-ixes val-ixes])

(defn flow->nodes [flow]
  (:nodes flow))

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

(defn memory->nodes [memory]
  (case memory
    :known [0]
    :pretended [1]
    :remembered [2]
    :forgotten [3]
    :known&pretended [0 1]))

(def empty-flow-plan
  (FlowPlan. [(Union. #{}) (Union. #{}) (Union. #{}) (Union. #{})] {}))

(defn add-output [flow-plan node memory]
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

  (def known&pretended [0 1])

  (let [plan empty-flow-plan
        [plan edges] (add-flow plan (FilterMap. known&pretended (fn [x] (when (= edge (.-shape x)) x))))
        [plan connecteds] (add-flow plan (FilterMap. known&pretended (fn [x] (when (= connected (.-shape x)) x))))
        [plan edges-index] (add-flow plan (Index. [edges] #js [1]))
        [plan connecteds-index] (add-flow plan (Index. [connecteds] #js [0]))
        [plan edges-lookup] (add-flow plan (Lookup. [edges-index] connecteds-index #js [1] #js [0 3]))
        [plan connecteds-lookup] (add-flow plan (Lookup. [connecteds-index] edges-index #js [0] #js [2 1]))
        [plan new-connecteds] (add-flow plan (FilterMap. [edges edges-lookup connecteds-lookup] (fn [x] (->connected (fact-ix x 0) (fact-ix x 1)))))
        plan (add-output plan new-connecteds :pretended)
        state (flow-plan->flow-state plan)]
    (apush* (aget (:node->facts state) 0) #js [(->edge 0 1) (->edge 1 2) (->edge 2 3) (->edge 3 1)])
    (-> (fixpoint! state) :node->state (aget 1) persistent!))
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

(defn pattern->vars [pattern]
  (vec (distinct (filter symbol? (.-values pattern)))))

(defn pattern->constructor [pattern source-vars]
  (let [shape (.-shape pattern)
        values (.-values pattern)
        source-ixes #js []
        sink-ixes #js []]
    (doseq [[value ix] (map vector (.-values pattern) (range))]
      (when (symbol? value)
        (do
          (apush source-ixes (ix-of source-vars value))
          (apush sink-ixes ix))))
    (fn [fact]
      (let [source (.-values fact)
            sink (aclone values)]
        (dotimes [i (alength source-ixes)]
          (aset sink (aget sink-ixes i) (aget source (aget source-ixes i))))
        (Fact. shape sink nil)))))

(defn pattern->deconstructor [pattern]
  (let [shape (.-shape pattern)
        seen? (atom {})
        constant-values #js []
        constant-ixes #js []
        var-ixes #js []
        dup-value-ixes #js []
        dup-var-ixes #js []]
    (doseq [[value ix] (map vector (.-values pattern) (range))]
      (if (symbol? value)
        (if-let [dup-value-ix (@seen? value)]
          (do
            (apush dup-value-ixes dup-value-ix)
            (apush dup-var-ixes ix))
          (do
            (apush var-ixes ix)
            (swap! seen? assoc value ix)))
        (do
          (apush constant-values value)
          (apush constant-ixes ix))))
    (fn [fact]
      (when (= shape (.-shape fact))
        (let [source (.-values fact)]
          (loop [i 0]
            (if (< i (alength constant-values))
              (when (= (aget constant-values i) (aget source (aget constant-ixes i)))
                (recur (+ i 1)))
              (loop [i 0]
                (if (< i (alength dup-value-ixes))
                  (when (= (aget source (aget dup-value-ixes i)) (aget source (aget dup-var-ixes i)))
                    (recur (+ i 1)))
                  (let [sink (make-array (alength var-ixes))]
                    (dotimes [i (alength var-ixes)]
                      (aset sink i (aget source (aget var-ixes i))))
                    (Fact. nil sink nil)))))))))))

(comment
  (deffact eg "[a] has a [b] with a [c]")

  (pattern->vars (->eg 'a "b" 'c))

  ((pattern->constructor (->eg "a" "b" "c") '[a b c]) (->eg 0 1 2))
  ((pattern->constructor (->eg 'a "b" "c") '[a b c]) (->eg 0 1 2))
  ((pattern->constructor (->eg 'c "b" "a") '[a b c]) (->eg 0 1 2))
  ((pattern->constructor (->eg 'c 'c 'c) '[a b c]) (->eg 0 1 2))

  ((pattern->deconstructor (->eg 'a "b" 'c)) (->eg "a" "b" "c"))
  ((pattern->deconstructor (->eg 'a "b" 'c)) (->eg "a" "B" "c"))
  ((pattern->deconstructor (->eg 'a "b" "c")) (->eg "a" "b" "c"))
  ((pattern->deconstructor (->eg "a" "b" "c")) (->eg "a" "b" "c"))
  ((pattern->deconstructor (->eg 'a 'b 'c)) (->eg "a" "b" "c"))
  ((pattern->deconstructor (->eg 'a 'b 'a)) (->eg "a" "b" "c"))
  ((pattern->deconstructor (->eg 'a 'b 'a)) (->eg "a" "b" "a"))
  ((pattern->deconstructor (->eg 'a 'a 'a)) (->eg "a" "b" "a"))
  ((pattern->deconstructor (->eg 'a 'a 'a)) (->eg "a" "a" "a"))
  )

;; EXPRS

(defn expr->fun [vars expr]
  (apply js/Function (conj (vec vars) (str "return " expr ";"))))

;; CLAUSES

(defrecord Recall [memory pattern]) ;; memory is one of :known :pretended :remembered :forgotten :known&pretended
(defrecord Compute [pattern])
(defrecord Output [memory pattern]) ;; memory is one of :pretended :remembered :forgotten

;; horrible non-relational things
(deffact Let "Let [name] be the result of [vars] [expr]")
(deffact When "When [vars] [expr]")

;; if clause can be calculated somehow then return a new [plan node vars] pair that calculates it
;; otherwise return nil
(defn add-clause [plan nodes vars clause]
  (condp = (type clause)
    Recall (let [{:keys [memory pattern]} clause
                 [plan node] (add-flow plan (FilterMap. (memory->nodes memory) (pattern->deconstructor pattern)))]
             [plan [node] (pattern->vars pattern)])
    Compute (let [{:keys [pattern]} clause]
              (condp = (.-shape pattern)
                Let (when (every? (set vars) (:vars pattern))
                      (let [let-fun (expr->fun vars (:expr pattern))
                            filter-map-fun (if (contains? (set vars) (:name pattern))
                                             ;; filter
                                             (let [name-ix (ix-of vars (:name pattern))]
                                               (fn [fact]
                                                 (let [new-value (.apply let-fun nil (.-values fact))]
                                                   (when (= new-value (aget (.-values fact) name-ix))
                                                     fact))))
                                             ;; define
                                             (fn [fact]
                                               (let [new-value (.apply let-fun nil (.-values fact))
                                                     new-values (aclone (.-values fact))]
                                                 (apush new-values new-value)
                                                 (Fact. nil new-values nil))))
                            [plan node] (add-flow plan (->FilterMap nodes filter-map-fun))]
                        [plan [node] (conj vars (:name pattern))]))
                When (when (every? (set vars) (:vars pattern))
                       (let [when-fun (expr->fun vars (:expr pattern))
                             filter-map-fun (fn [fact]
                                              (when (.apply when-fun nil (.-values fact))
                                                fact))
                             [plan node] (add-flow plan (->FilterMap nodes filter-map-fun))]
                         [plan [node] vars]))))
    Output (let [{:keys [memory pattern]} clause
                 _ (assert (every? (set vars) (pattern->vars pattern)))
                 [plan output-node] (add-flow plan (FilterMap. nodes (pattern->constructor pattern vars)))
                 plan (add-output plan output-node memory)]
             [plan nodes vars])))

(comment
  (let [plan empty-flow-plan
        [plan nodes-a vars-a] (add-clause plan nil nil (Recall. :known&pretended (->edge 'x 'y)))
        [plan nodes-b vars-b] (add-clause plan nil nil (Recall. :known (->connected 'x 0)))]
    [plan nodes-a nodes-b vars-a vars-b])

  (let [plan empty-flow-plan
        [plan nodes-a vars-a] (add-clause plan nil nil (Recall. :known&pretended (->edge 'x 'y)))
        [plan nodes-b vars-b] (add-clause plan nodes-a vars-a (Compute. (->Let 'z '[x y] "x + y")))]
    [plan nodes-a nodes-b vars-a vars-b])

  (let [plan empty-flow-plan
        [plan nodes-a vars-a] (add-clause plan nil nil (Recall. :known&pretended (->edge 'x 'y)))
        res (add-clause plan nodes-a vars-a (Compute. (->Let 'z '[w x y] "w + x + y")))]
    res)

  (let [plan empty-flow-plan
        [plan nodes-a vars-a] (add-clause plan nil nil (Recall. :known&pretended (->edge 'x 'y)))
        [plan nodes-b vars-b] (add-clause plan nodes-a vars-a (Compute. (->When '[x y] "x > y")))]
    [plan nodes-a nodes-b vars-a vars-b])
  )

;; RULES

(defrecord Rule [clauses])

;; Correctness: Each clause must appear at least once in the plan
;; Heuristic: Each Recall clause is used at most once in the plan
;; Heuristic: Each Filter/Let clause is used at most once per path in the plan

(defn add-computes [plan&nodes&vars computes]
  (let [plan&nodes&vars (atom plan&nodes&vars)
        computes-skipped #js []]
    (doseq [compute computes]
      (if-let [new-plan&nodes&vars (apply add-clause (conj @plan&nodes&vars compute))]
        (reset! plan&nodes&vars new-plan&nodes&vars)
        (apush computes-skipped compute)))
    (if (= (count computes) (count computes-skipped))
      @plan&nodes&vars
      (recur @plan&nodes&vars computes-skipped))))

(defn join-clauses [plan nodes-a vars-a nodes-b vars-b]
  (let [key-vars (intersection (set vars-a) (set vars-b))
        val-vars (union (set vars-a) (set vars-b))
        key-ixes-a (ixes-of vars-a key-vars)
        key-ixes-b (ixes-of vars-b key-vars)
        val-ixes-a (ixes-of (concat vars-a vars-b) val-vars)
        val-ixes-b (ixes-of (concat vars-b vars-a) val-vars)
        [plan index-a] (add-flow plan (->Index nodes-a key-ixes-a))
        [plan index-b] (add-flow plan (->Index nodes-b key-ixes-b))
        [plan lookup-a] (add-flow plan (->Lookup [index-a] index-b key-ixes-a val-ixes-a))
        [plan lookup-b] (add-flow plan (->Lookup [index-b] index-a key-ixes-b val-ixes-b))]
    [plan [lookup-a lookup-b] (vec (distinct (concat vars-a vars-b)))]))

(comment

  (let [plan empty-flow-plan
        [plan nodes-a vars-a] (add-clause plan nil nil (Recall. :known&pretended (->edge 'x 'y)))
        [plan nodes-b vars-b] (add-clause plan nil nil (Recall. :known (->connected 'y 'z)))
        [plan nodes-c vars-c] (join-clauses plan nodes-a vars-a #{} nodes-b vars-b #{})]
    [plan nodes-c vars-c])
  )

(defn add-rule [plan rule]
  (let [recalls (filter #(= Recall (type %)) (:clauses rule))
        computes (set (filter #(= Compute (type %)) (:clauses rule)))
        outputs (filter #(= Output (type %)) (:clauses rule))
        main-plan (atom plan)
        nodes&vars (for [recall recalls]
                     (let [[plan node vars] (add-computes (add-clause @main-plan nil nil recall) computes)]
                       (reset! main-plan plan)
                       [node vars]))
        [nodes vars] (reduce (fn [[nodes-a vars-a] [nodes-b vars-b]]
                               (let [computes-unapplied (difference computes
                                                                    (filter #(add-clause @main-plan nodes-a vars-a %) computes)
                                                                    (filter #(add-clause @main-plan nodes-b vars-b %) computes))
                                     [plan nodes vars] (add-computes
                                                        (join-clauses @main-plan nodes-a vars-a nodes-b vars-b)
                                                        computes-unapplied)]
                                 (reset! main-plan plan)
                                 [nodes vars]))
                             nodes&vars)
        computes-unapplied (filter #(not (add-clause @main-plan nodes vars %)) computes)]
    (assert (empty? computes-unapplied) (str "Could not apply " (pr-str computes-unapplied) " to " (pr-str vars)))
    (doseq [output outputs]
      (let [[plan node vars] (add-clause @main-plan nodes vars output)]
        (reset! main-plan plan)))
    @main-plan))

(defn add-rules [plan rules]
  ;; TODO stratify
  (reduce add-rule plan rules))

(comment
  (deffact edge "[x] has an edge to [y]")
  (deffact connected "[x] is connected to [y]")

  (let [plan (add-rules empty-flow-plan
                        [(Rule. [(Recall. :known&pretended (->edge 'x 'y))
                                 (Output. :pretended (->connected 'x 'y))])
                         (Rule. [(Recall. :known&pretended (->edge 'x 'y))
                                 (Recall. :known&pretended (->connected 'y 'z))
                                 (Output. :pretended (->connected 'x 'z))])])
        state (flow-plan->flow-state plan)]
    (apush* (aget (:node->facts state) 0) #js [(->edge 0 1) (->edge 1 2) (->edge 2 3) (->edge 3 1)])
    (time (fixpoint! state))
    (persistent! (aget (:node->state state) 1)))

  (let [plan (add-rules empty-flow-plan
                        [(Rule. [(Recall. :known&pretended (->edge 'x 'y))
                                 (Output. :pretended (->connected 'x 'y))])
                         (Rule. [(Recall. :known&pretended (->edge 'x 'y))
                                 (Recall. :known&pretended (->connected 'y 'z))
                                 (Output. :pretended (->connected 'x 'z))])])
        state (flow-plan->flow-state plan)]
    (apush* (aget (:node->facts state) 0) (into-array (for [i (range 100)]
                                                        (->edge i (inc i)))))
    (js/console.time "new")
    (fixpoint! state)
    (js/console.timeEnd "new")
    (persistent! (aget (:node->state state) 1)))
  ;; 5 => 1 ms
  ;; 10 => 8 ms
  ;; 50 => 1093 ms
  ;; 100 => 11492 ms

  (let [plan (add-rules empty-flow-plan
                        [(Rule. [(Recall. :known&pretended (->edge 'x 'y))
                                 (Compute. (->Let 'z '[x y] "x + y"))
                                 (Output. :pretended (->connected 'z 'z))])])
        state (flow-plan->flow-state plan)]
    (apush* (aget (:node->facts state) 0) (into-array (for [i (range 100)]
                                                        (->edge i (inc i)))))
    (fixpoint! state)
    (persistent! (aget (:node->state state) 1)))
  )

;; TIME AND CHANGE

(defn add-facts [state memory facts]
  (let [arr (aget (:node->facts state) (memory->node memory))]
    (doseq [fact facts]
      (apush arr fact))))

(defn get-facts [state memory]
  (let [facts (persistent! (aget (:node->state state) (memory->node memory)))]
    (aset (:node->state state) (memory->node memory) (transient facts))
    facts))

;; TODO make this incremental
(defn tick [plan state]
  (let [known (transient (get-facts state :known))
        remembered (get-facts state :remembered)
        forgotten (get-facts state :forgotten)
        new-state (flow-plan->flow-state plan)]
    (doseq [fact remembered]
      (when (not (contains? forgotten fact))
        (conj!! known fact)))
    (doseq [fact forgotten]
      (when (not (contains? remembered fact))
        (disj!! known fact)))
    (add-facts new-state :known (persistent! known))
    new-state))

(defn tick&fixpoint [plan state]
  (fixpoint! (tick plan state)))

(comment
  (deffact edge "[x] has an edge to [y]")
  (deffact connected "[x] is connected to [y]")

  (let [plan (add-rules empty-flow-plan
                        [(Rule. [(Recall. :known&pretended (->edge 'x 'y))
                                 (Output. :remembered (->connected 'x 'y))])
                         (Rule. [(Recall. :known&pretended (->edge 'x 'y))
                                 (Recall. :known&pretended (->connected 'y 'z))
                                 (Output. :remembered (->connected 'x 'z))])])
        state-0 (flow-plan->flow-state plan)]
    (add-facts state-0 :known #js [(->edge 0 1) (->edge 1 2) (->edge 2 3) (->edge 3 1)])
  (fixpoint! state-0)
  (for [state (take 5 (iterate #(tick&fixpoint plan %) state-0))]
    (count (get-facts state :known))))

  (let [rules [(Rule. [
                       (aurora.language.Recall. :known&pretended, (js/aurora.language.fact :http/response #js ['content "google" 'some]))
                       (aurora.language.Output. :remembered (js/aurora.language.fact "1df7454c_069e_40ab_b117_b8d43212b473" #js ['value74]))
                       (aurora.language.Output. :forgotten (js/aurora.language.fact "1df7454c_069e_40ab_b117_b8d43212b473" #js ['value]))
                       (aurora.language.Recall. :known&pretended, (js/aurora.language.fact "1df7454c_069e_40ab_b117_b8d43212b473" #js ['value]))
                       (aurora.language.Compute. (->Let 'value74  #{'value} "value + \"hey\""))])]
        plan (add-rules empty-flow-plan rules)
        state (flow-plan->flow-state plan)]
    (add-facts state :known [(fact. "1df7454c_069e_40ab_b117_b8d43212b473" #js ["Click me"])])
    (add-facts state :pretended [(fact. :http/response #js ["yo" "google" 1234])])
    (fixpoint! state)
    (-> state
        (get-facts :known)
        first
        (.-values))
  )
  )
