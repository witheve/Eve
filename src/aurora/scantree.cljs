(ns aurora.scantree
  (:require-macros [aurora.macros :refer [apush perf-time]]))

;; NOTE iterators are not write-safe

(deftype Tree [max-keys ^:mutable root aggregateFunc]
  Object
  (toString [this]
            (pr-str (into {} (map vec (seq this)))))
  (assoc! [this key val]
          (.assoc! root key val max-keys))
  (insert! [this ix key val right-child max-keys]
           (let [left-child root]
             (set! root (Node. this 0 #js [key] #js [val] #js [left-child right-child] (.-lower left-child) (.-upper right-child) true aggregateFunc nil))
             (set! (.-parent left-child) root)
             (set! (.-parent-ix left-child) 0)
             (set! (.-parent right-child) root)
             (set! (.-parent-ix right-child) 1)))
  (into [this result]
        (.into root result))
  (valid! [this]
          (.valid! root))
  ISeqable
  (-seq [this]
        (let [result #js []]
          (.into this result)
          (seq result))))

(deftype Node [parent parent-ix keys vals children ^:mutable lower ^:mutable upper ^:mutable dirty? aggregateFunc ^:mutable aggregate]
  Object
  (into [this result]
        (dotimes [ix (alength keys)]
          (when-not (nil? children)
            (.into (aget children ix) result))
          (apush result #js [(aget keys ix) (aget vals ix)]))
        (when-not (nil? children)
          (.into (aget children (alength keys)) result)))
  (getAggregate [this]
                (when dirty?
                  (set! (.-aggregate this) nil)
                  (when keys
                    (loop [len (dec (.-length vals))]
                      (when (>= len 0)
                        (set! (.-aggregate this) (aggregateFunc (.-aggregate this) (aget vals len)))
                        (recur (dec len)))))
                  (when children
                    (loop [len (dec (.-length children))]
                      (when (>= len 0)
                        (set! (.-aggregate this) (aggregateFunc (.-aggregate this) (.getAggregate (aget children len))))
                        (recur (dec len)))))
                  (set! dirty? false))
                (.-aggregate this))

  (seek [this key ix]
        (loop [lo (if (> ix 0) ix 0)
               hi (- (alength keys) 1)]
          (if (< hi lo)
            lo
            (let [mid (+ lo (js/Math.floor (/ (- hi lo) 2)))
                  mid-key (aget keys mid)]
              (if (> mid-key key)
                (recur lo (- mid 1))
                (if (< mid-key key)
                  (recur (+ mid 1) hi)
                  mid))))))
  (assoc! [this key val max-keys]
          (set! lower (if (< lower key) lower key))
          (set! upper (if (< key upper) upper key))
          (set! dirty? true)
          (let [ix (.seek this key 0)]
            (if (nil? children)
              (if (== key (aget keys ix))
                (do
                  (aset vals ix val)
                  true)
                (do
                  (.insert! this ix key val nil max-keys)
                  false))
              (.assoc! (aget children ix) key val max-keys))))
  (insert! [this ix key val right-child max-keys]
           (.splice keys ix 0 key)
           (.splice vals ix 0 val)
           (set! dirty? true)
           (when-not (nil? children)
             (.splice children (+ ix 1) 0 right-child))
           (when (> (alength keys) max-keys)
             (.split! this max-keys)))
    (split! [this max-keys]
          ;; TODO try using push/pop instead of splice/slice
          (let [median (js/Math.floor (/ (alength keys) 2))
                median-key (aget keys median)
                median-val (aget vals median)
                right-node (Node. parent (+ parent-ix 1) nil nil nil nil upper true aggregateFunc nil)]
            (if (nil? children)
              (do
                (set! upper (aget keys (- median 1)))
                (set! (.-lower right-node) (aget keys (+ median 1))))
              (do
                (set! upper (.-upper (aget children median)))
                (set! (.-lower right-node) (.-lower (aget children (+ median 1))))))
            (set! (.-keys right-node) (.slice keys (+ median 1)))
            (set! (.-vals right-node) (.slice vals (+ median 1)))
            (.splice keys median (alength keys))
            (.splice vals median (alength vals))
            (when-not (nil? children)
              (let [right-children (.slice children (+ median 1))]
                (dotimes [ix (alength right-children)]
                  (let [child (aget right-children ix)]
                    (set! (.-parent child) right-node)
                    (set! (.-parent-ix child) ix)))
                (set! (.-children right-node) right-children)
                (.splice children (+ median 1) (alength children))))
            #_(.valid! this (js/Math.floor (/ max-keys 2)) max-keys)
            #_(.valid! right-node (js/Math.floor (/ max-keys 2)) max-keys)
            (.insert! parent parent-ix median-key median-val right-node max-keys)))
  (valid! [this min-keys max-keys]
          (when (instance? Node parent) ;; root is allowed to have less keys
            (assert (>= (count keys) min-keys) (pr-str keys min-keys)))
          (assert (<= (count keys) max-keys) (pr-str keys max-keys))
          (assert (= (count keys)) (inc (count children)))
          (assert (= (count keys) (count (set keys))))
          (assert (= (seq keys) (sort keys)))
          (assert (every? #(<= lower %) keys))
          (assert (every? #(>= upper %) keys))
          (if (nil? children)
            (do
              (assert (= lower (aget keys 0)) (pr-str lower keys))
              (assert (= upper (aget keys (- (alength keys) 1)))))
            (do
              (assert (= lower (.-lower (aget children 0))) (pr-str lower (.-lower (aget children 0))))
              (assert (= upper (.-upper (aget children (- (alength children) 1)))) (pr-str upper (.-upper (aget children (- (alength children) 1)))))
              (assert (every? #(> (aget keys %) (.-upper (aget children %))) (range (count keys))))
              (assert (every? #(< (aget keys %) (.-lower (aget children (inc %)))) (range (count keys))))
              (dotimes [i (count children)] (.valid! (aget children i) min-keys max-keys))))))

(deftype Iterator [max-keys ^:mutable node ^:mutable ix ^:mutable end?]
  Object
  (next [this]
        (when-not end?
          (if (nil? (.-children node))
            (do
              (set! ix (+ ix 1))
              (loop []
                (if (>= ix (alength (.-keys node)))
                  (if (instance? Node (.-parent node))
                    (do
                      (set! ix (.-parent-ix node))
                      (set! node (.-parent node))
                      (recur))
                    (do
                      (set! end? true)
                      nil))
                  #js [(aget (.-keys node) ix) (aget (.-vals node) ix)])))
            (do
              (set! node (aget (.-children node) (+ ix 1)))
              (set! ix 0)
              #js [(aget (.-keys node) ix) (aget (.-vals node) ix)]))))
  (seek [this key]
        (when-not end?
          (loop []
            (if (> key (.-upper node))
              (if (instance? Node (.-parent node))
                (do
                  (set! ix (.-parent-ix node))
                  (set! node (.-parent node))
                  (recur))
                (do
                  (set! end? true)
                  nil))
              (do
                (set! ix (.seek node key ix))
                (if (and (not (nil? (.-children node))) (< key (aget (.-keys node) ix)))
                  (do
                    (set! node (aget (.-children node) ix))
                    (set! ix 0)
                    (recur))
                  #js [(aget (.-keys node) ix) (aget (.-vals node) ix)])))))))

(defn iterator [tree]
  (loop [node (.-root tree)]
    (if (nil? (.-children node))
      (Iterator. (.-max-keys tree) node -1)
      (recur (aget (.-children node) 0)))))

(defn tree [min-keys aggregateFunc]
  (let [node (Node. nil nil #js [] #js [] nil js/Infinity (- js/Infinity) true aggregateFunc nil)
        tree (Tree. (* 2 min-keys) node aggregateFunc)]
    (set! (.-parent node) tree)
    (set! (.-parent-ix node) 0)
    tree))

(defn aggregate [tree|node]
  (.getAggregate (if (instance? Tree tree|node)
                   (.-root tree|node)
                   tree|node)))

(defn collect [tree from to]
  (let [itr (iterator tree)
        coll (array (-> (.seek itr from)
                        (aget 1)))]
    (loop [cur (.next itr)]
      (when (and cur (<= (aget cur 0) to))
        (.push coll (aget cur 1))
        (recur (.next itr))
        ))
    coll))

(defn contained? [from to container-from container-to]
  (and (not (or (nil? from)
                (nil? to)))
       (<= container-from from)
       (>= container-to to)))

(defn down-until-contained [node from to result]
  (let [keys (.-keys node)
        keys-len (.-length keys)
        vals (.-vals node)]
    (if-let [children (.-children node)]
      ;;internal node
      (loop [child-i 0]
        (when (<= child-i keys-len)
          (let [child (aget children child-i)
                lower (.-lower child)
                upper (.-upper child)]
            (when (or (== nil upper) (>= upper from))
              (if (contained? lower upper from to)
                (do
                  (.push result (.getAggregate child)))
                (when (<= lower to)
                  ;;check if this node's value needs to go in
                  (down-until-contained2 child from to result)))
              (when (>= to (aget keys child-i))
                (.push result (aget vals child-i))))
            (when (and (<= lower to)
                       (<= upper to))
              (recur (inc child-i)))

            )))
      ;;leaf node
      (loop [i 0]
        (when (< i keys-len)
          (let [k (aget keys i)]
            (when (and (>= k from)
                       (<= k to))
              (.push result (aget vals i)))
            (when (<= k to)
              (recur (inc i)))))))))

(defn aggregate-range [tree from to]
  (let [results (array)]
    (down-until-contained2 (.-root tree) from to results)
    (let [len (.-length results)
          func (.-aggregateFunc tree)]
      (loop [i 0
             cur nil]
        (if (< i len)
          (recur (inc i) (func cur (aget results i)))
          cur)))))

(comment

  (time
   (let [tree (tree 3 min)]
     (dotimes [i 10]
       (.assoc! tree i (* 2 i)))
     (println "agg: " (aggregate tree))
     (println "agg: " (aggregate tree))
     (println "agg: " (aggregate tree))
     (dotimes [i 2]
       (.assoc! tree (+ 10 i) (* 2 i)))
     (println tree)
     (println "agg: " (aggregate tree))
     ))

  (time
   (let [tree (tree 10 +)]
     (dotimes [i 10]
       (.assoc! tree i (* 2 i)))
     (.log js/console tree)
     (aggregate tree)
     ))

   (let [tree (tree 10 +)]
     (dotimes [i 10000]
       (.assoc! tree i (* 2 i)))
     (perf-time
      (dotimes [x 10000]
        (collect tree 5000 9020)))
     )

  (let [tree (tree 10 +)]
     (dotimes [i 10000]
       (.assoc! tree i (* 2 i)))
    (aggregate-range tree 5000 9020)
    )

   (let [tree (tree 10 +)]
     (dotimes [i 10000]
       (.assoc! tree i (* 2 i)))
      (aggregate-range tree 5000 9020)
      (perf-time
       (dotimes [x 10000]
         (aggregate-range tree 5000 9020)))
     )

  )
