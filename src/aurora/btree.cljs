(ns aurora.btree
  (:require-macros [aurora.macros :refer [apush]]))

;; NOTE iterators are not write-safe

(deftype Tree [max-keys ^:mutable root]
  Object
  (toString [this]
            (pr-str (into {} (map vec (seq this)))))
  (assoc! [this key val]
          (.assoc! root key val max-keys))
  (insert! [this ix key val right-child max-keys]
           (let [left-child root]
             (set! root (Node. this 0 #js [key] #js [val] #js [left-child right-child] (.-lower left-child) (.-upper right-child)))
             (set! (.-parent left-child) root)
             (set! (.-parent-ix left-child) 0)
             (set! (.-parent right-child) root)
             (set! (.-parent-ix right-child) 1)))
  (into [this result]
        (.into root result))
  (valid! [this]
          (.valid! root (js/Math.floor (/ max-keys 2)) max-keys))
  ISeqable
  (-seq [this]
        (let [result #js []]
          (.into this result)
          (seq result))))

(deftype Node [parent parent-ix keys vals children ^:mutable lower ^:mutable upper]
  Object
  (into [this result]
        (dotimes [ix (alength keys)]
          (when-not (nil? children)
            (.into (aget children ix) result))
          (apush result #js [(aget keys ix) (aget vals ix)]))
        (when-not (nil? children)
          (.into (aget children (alength keys)) result)))
  (seek [this key ix]
        (loop [lo (max ix 0)
               hi (- (alength keys) 1)]
          (if (< hi lo)
            lo
            (let [mid (+ lo (js/Math.floor (/ (- hi lo) 2)))
                  mid-key (aget keys mid)]
              (cond
               (> mid-key key) (recur lo (- mid 1))
               (< mid-key key) (recur (+ mid 1) hi)
               :else mid)))))
  (assoc! [this key val max-keys]
          (set! lower (min lower key))
          (set! upper (max upper key))
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
           (when-not (nil? children)
             (.splice children (+ ix 1) 0 right-child))
           (when (> (alength keys) max-keys)
             (.split! this max-keys)))
  (split! [this max-keys]
          ;; TODO try using push/pop instead of splice/slice
          (let [median (js/Math.floor (/ max-keys 2))
                median-key (aget keys median)
                median-val (aget vals median)
                right-node (Node. parent (+ parent-ix 1) nil nil nil nil upper)]
            (if (nil? children)
              (do
                (set! upper (aget keys (- median 1)))
                (set! (.-lower right-node) (aget keys (+ median 1))))
              (do
                (set! upper (.-upper (aget children median)))
                (set! (.-lower right-node) (.-lower (aget children (+ median 1))))))
            (set! (.-keys right-node) (.slice keys (+ median 1)))
            (set! (.-vals right-node) (.slice vals (+ median 1)))
            (.splice keys median (+ median 1))
            (.splice vals median (+ median 1))
            (when-not (nil? children)
              (let [right-children (.slice children (+ median 1))]
                (dotimes [ix (alength right-children)]
                  (let [child (aget right-children ix)]
                    (set! (.-parent child) right-node)
                    (set! (.-parent-ix child) ix)))
                (set! (.-children right-node) right-children)
                (.splice children median (+ median 2))))
            (.valid! this (js/Math.floor (/ max-keys 2)) max-keys)
            (.valid! right-node (js/Math.floor (/ max-keys 2)) max-keys)
            (.insert! parent parent-ix median-key median-val right-node max-keys)))
  (valid! [this min-keys max-keys]
          (assert (>= (count keys) min-keys) (pr-str keys min-keys))
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
              (assert (= lower (.-lower (aget children 0))))
              (assert (= upper (.-upper (aget children (- (alength children) 1)))))
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

(defn tree [min-keys]
  (let [node (Node. nil nil #js [] #js [] nil js/Infinity (- js/Infinity))
        tree (Tree. (* 2 min-keys) node)]
    (set! (.-parent node) tree)
    (set! (.-parent-ix node) 0)
    tree))

(comment
  (let [node (Node. nil nil #js [])]
    (.seek node 0 0))

  (let [node (Node. nil nil #js [0])]
    (.seek node 0 0))

  (let [node (Node. nil nil #js [0 1 2 3 4 5 6 7 8 9])]
    (every? #(= % (.seek node % 0)) (range 10)))

  (let [node (Node. nil nil #js [0 1 2 3 4 5 6 7 8 9])]
    (every? #(= % (.seek node % %)) (range 10)))

  (let [node (Node. nil nil #js [0 1 2 3 4 5 6 7 8 9])]
    (every? #(= % (.seek node 0 %)) (range 10)))

  (let [tree (tree 1)]
    tree)

  (let [tree (tree 1)]
    (.assoc! tree :a 0)
    tree)

  (let [tree (tree 1)]
    (.assoc! tree :a 0)
    (.assoc! tree :b 1)
    (js/console.log tree)
    tree)

  (let [tree (tree 1)]
    (.assoc! tree :a 0)
    (.assoc! tree :b 1)
    (.assoc! tree :c 1)
    (js/console.log tree)
    tree)

  (let [tree (tree 1)]
    (.assoc! tree :a 0)
    (.assoc! tree :b 1)
    (.assoc! tree :c 1)
    (.assoc! tree :d 1)
    (.assoc! tree :e 1)
    (.assoc! tree :f 1)
    (.assoc! tree :g 1)
    (.assoc! tree :h 1)
    (.assoc! tree :i 1)
    (.assoc! tree :j 1)
    (js/console.log tree)
    (.valid! tree)
    tree)

  (let [tree (tree 3)]
    (dotimes [i 1000]
      (.assoc! tree i (* 2 i)))
    (.valid! tree)
    (= (map #(.apply vector nil %) tree) (for [i (range 1000)] [i (* 2 i)])))

  (time
   (let [tree (tree 1)]
     (dotimes [i 100000]
       (.assoc! tree i (* 2 i)))))

  (time
   (let [tree (tree 3)]
     (dotimes [i 100000]
       (.assoc! tree i (* 2 i)))))

  (time
   (let [tree (tree 10)]
     (dotimes [i 100000]
       (.assoc! tree i (* 2 i)))))

  (time
   (let [tree (tree 1000)]
     (dotimes [i 100000]
       (.assoc! tree i (* 2 i)))))

  (time
   (let [tree (tree 100)]
     (dotimes [i 500000]
       (.assoc! tree i (* 2 i)))))

  (let [tree (tree 3)
        iterator (iterator tree)]
    (.next iterator))

  (let [tree (tree 3)
        iterator (iterator tree)]
    (take 2000 (take-while identity (repeatedly #(.next iterator)))))

  (let [tree (tree 3)
        _ (.assoc! tree :a 0)
        iterator (iterator tree)]
    (take 2000 (take-while identity (repeatedly #(.next iterator)))))

  (let [tree (tree 3)
        _ (dotimes [i 1000]
            (.assoc! tree i (* 2 i)))
        iterator (iterator tree)]
    (= (for [i (range 1000)] [i (* 2 i)]) (map #(.apply vector nil %) (take 2000 (take-while identity (repeatedly #(.next iterator)))))))

  (let [tree (tree 3)
        iterator (iterator tree)]
    (.seek iterator -100))

  (let [tree (tree 3)
        _ (dotimes [i 1000]
            (.assoc! tree i (* 2 i)))
        iterator (iterator tree)]
    [(.seek iterator -100) (.seek iterator 9.34) (.seek iterator 0) (.seek iterator 500) (.seek iterator 2000) (.seek iterator 0)])

  (let [tree (tree 3)
        _ (dotimes [i 1000]
            (.assoc! tree i (* 2 i)))
        iterator (iterator tree)]
    (time
     (dotimes [i 10000000]
       [(.seek iterator -100) (.seek iterator 9.34) (.seek iterator 0) (.seek iterator 500) (.seek iterator 2000) (.seek iterator 2000)])))

  (time
   (let [tree (tree 3)]
     (dotimes [i 10]
       (.assoc! tree i (* 2 i)))
     ;(collect tree 3 7)
     (js/console.log tree)
     (for [i (range 10)] (.seek (iterator tree) i))
     ))
  )
