(ns aurora.language
  (:require [clojure.set :refer [union intersection difference subset?]]
            [aurora.language.jsth :as jsth]
            [aurora.language.match :as match])
  (:require-macros [aurora.macros :refer [console-time set!! conj!! disj!! assoc!! apush apush* avec]]
                   [aurora.language.macros :refer [deffact rule]]))

;; FACTS
;; TODO facts need to be serialisable, can't depend on identity

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

(deftype FactShape [madlib keys]
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
               (identical? shape (.-shape other)) ;; TODO check id is equal instead
               (== (alength values) (alength (.-values other)))
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

(defn fact-shape [madlib&keys]
  (let [split-madlib&keys (clojure.string/split madlib&keys #"\[|\]")
        [madlib keys] [(take-nth 2 split-madlib&keys) (map keyword (take-nth 2 (rest split-madlib&keys)))]]
    (FactShape. (into-array madlib) (into-array keys))))

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
  (fact-shape "[a] has a [b] with a [c]")
  (fact-shape "The [a] has a [b] with a [c]")

  (fact #js [0 1 2])
  (fact (fact-shape "The [a] has a [b] with a [c]") #js [0 1 2])

  (deffact eg "[a] has a [b] with a [c]")
  eg


  (def x (->eg "a" "b" "c"))
  (nth x 1)
  (get x 1)
  (get x :b)

  (= x x)
  (= x (fact (fact-shape "[a] has a [b] with a [c]") #js ["a" "b" "c"]))
  (= x (fact eg #js ["a" "b" "c"]))
  (= x (->eg "a" "b" "c"))

  (fact-ixes x #js [2 1])
  )

;; FLOW STATE

(defrecord FlowState [node->state in-edge->out-edges edge->facts edge->update!])

(defn fixpoint [{:keys [node->state in-edge->out-edges edge->facts edge->update!] :as flow-state}]
  (loop [edge 0]
    (when (< edge (alength edge->facts))
      (let [in-facts (aget edge->facts edge)]
        (if (== 0 (alength in-facts))
          (recur (+ edge 1))
          (let [out-facts #js []]
            (prn edge in-facts)
            (.call (aget edge->update! edge) nil node->state in-facts out-facts)
            (aset edge->facts edge #js [])
            (if (> (alength out-facts) 0)
              (let [out-edges (aget in-edge->out-edges edge)
                    min-out-edge (areduce out-edges i min-out-edge (+ edge 1)
                                          (let [out-edge (aget out-edges i)]
                                            (apush* (aget edge->facts out-edge) out-facts)
                                            (min out-edge min-out-edge)))]
                (recur min-out-edge))
              (recur (+ edge 1))))))))
  flow-state)

(defn filter-map-update! [fun]
  (fn [node->state in-facts out-facts]
    (dotimes [i (alength in-facts)]
      (let [fact (aget in-facts i)]
        (when-let [new-fact (.call fun nil fact)]
          (apush out-facts new-fact))))))

(defn union-update! [node]
  (fn [node->state in-facts out-facts]
    (let [set (aget node->state node)]
      (dotimes [i (alength in-facts)]
        (let [fact (aget in-facts i)]
          (when (not (contains? set fact))
            (conj!! set fact)
            (apush out-facts fact))))
      (aset node->state node set))))

(defn index-update! [node key-ixes]
  (fn [node->state in-facts out-facts]
    (let [index (aget node->state node)]
      (dotimes [i (alength in-facts)]
        (let [fact (aget in-facts i)
              key (fact-ixes fact key-ixes)
              facts (or (get index key) #{})] ;; TODO transients are not seqable :(
          (when-not (contains? facts fact)
            (assoc!! index key (conj facts fact))
            (apush out-facts fact))))
      (aset node->state node index))))

(defn lookup-update! [node key-ixes val-ixes]
  (fn [node->state in-facts out-facts]
    (let [index (aget node->state node)]
      (dotimes [i (alength in-facts)]
        (let [left-fact (aget in-facts i)
              key (fact-ixes left-fact key-ixes)]
          (doseq [right-fact (get index key)]
              (apush out-facts (fact-join-ixes left-fact right-fact val-ixes))))))))

(comment
  (->
   (->FlowState #js [(transient #{})]
                #js [#js [1] #js [0]]
                #js [#js [:a :b "c" :d] #js []]
                #js [(filter-map-update! (fn [x] (when (keyword? x) x))) (union-update! 0)])
   fixpoint)

  (->
   (->FlowState #js [(transient #{})]
                #js [#js [1] #js [0]]
                #js [#js [:a :b "c" :d] #js []]
                #js [(filter-map-update! (fn [x] (when (keyword? x) x))) (union-update! 0)])
   fixpoint
   :node->state
   (aget 0)
   persistent!)

  (deffact edge "[x] has an edge to [y]")
  (deffact connected "[x] is connected to [y]")

  ;; [x] has an edge to [y]
  ;; [y] is connected to [z]
  ;; + [x] is connected to [z]

  ;; TODO use filter-map in here to get the right shape
  (->
   (->
    (->FlowState #js [(transient #{}) (transient #{}) (transient {}) (transient {}) nil]
                 #js [#js [2 7] #js [3] #js [4] #js [5] #js [6] #js [6] #js [3] #js [3]]
                   #js [#js [(->edge 0 1) (->edge 1 2) (->edge 2 3) (->edge 3 1)] #js [] #js [] #js [] #js [] #js [] #js [] #js []]
                   #js [(union-update! 0)
                        (union-update! 1)
                        (index-update! 2 #js [1])
                        (index-update! 3 #js [0])
                        (lookup-update! 3 #js [1] #js [0 3])
                        (lookup-update! 2 #js [0] #js [2 1])
                        (union-update! 1)
                        (union-update! 1)])
    fixpoint)
   :node->state
   (aget 1)
   persistent!)

  )
