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
             (set! root (Node. this 0 #js [key] #js [val] #js [left-child right-child]))
             (set! (.-parent left-child) root)
             (set! (.-parent-ix left-child) 0)
             (set! (.-parent right-child) root)
             (set! (.-parent-ix right-child) 1)))
  (into [this result]
        (.into root result))
  ISeqable
  (-seq [this]
        (let [result #js []]
          (.into this result)
          (seq result))))

(deftype Node [parent parent-ix keys vals children]
  Object
  (into [this result]
        (dotimes [ix (alength keys)]
          (when-not (nil? children)
            (.into (aget children ix) result))
          (apush result #js [(aget keys ix) (aget vals ix)]))
        (when-not (nil? children)
          (.into (aget children (alength keys)) result)))
  ;; TODO worth doing binary search here when nodes are large
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
                right-node (Node. parent (+ parent-ix 1) nil nil nil)]
            (.insert! parent parent-ix (aget keys median) (aget vals median) right-node)
            (set! (.-keys right-node) (.slice keys (+ median 1)))
            (set! (.-vals right-node) (.slice vals (+ median 1)))
            (.splice keys median (+ median 1))
            (.splice vals median (+ median 1))
            (when-not (nil? children)
              (let [right-children (.slice children (+ median 1))]
                (set! (.-children right-node) right-children)
                (.splice children median (+ median 2))
                (dotimes [ix (alength right-children)]
                  (let [child (aget right-children ix)]
                    (set (.-parent child) right-node)
                    (set (.-parent-ix child) ix)))))
            #_(assert (= (alength keys) (alength vals) (if children (dec (alength children)) (alength keys))))
            #_(assert (= (alength (.-keys right-node)) (alength (.-vals right-node)) (if (.-children right-node) (dec (alength (.-children right-node))) (alength (.-keys right-node))))))))

(deftype Iterator [max-keys ^:mutable node ^:mutable ix]
  ;; always points to before a valid key or to the tree wrapper
  Object
  (next [this]
        (when (instance? Node node)
          (if (nil? (.-children node))
            (do
              (set! ix (+ ix 1))
              (loop []
                (when (and (instance? Node node) (>= ix (alength (.-keys node))))
                  (set! ix (.-parent-ix node))
                  (set! node (.-parent node))
                  (recur))))
            (do
              (set! node (aget (.-children node) (+ ix 1)))
              (set! ix 0)))
          (when (instance? Node node)
            #js [(aget (.-keys node) ix) (aget (.-vals node) ix)])))
  (seek [this key] ;; move the iterator forwards until it reaches a key greater than this one
        ;; head across and upwards until we reach a greater key
        (loop []
          (when (instance? Node node)
            (set! ix (.seek node key ix))
            (when (>= ix (alength (.-keys node)))
              (set! ix (+ (.-parent-ix node) 1))
              (set! node (.-parent node))
              (recur))))
        ;; head downwards and across until we reach the least greater key
        (loop []
          (when (instance? Node node)
            (when-not (nil? (.-children node))
              (set! node (aget (.-children node) ix))
              (set! ix (.seek node key 0))
              (recur))))
        ;; if we aren't now at the tree wrapper we can return a result
        (when (instance? Node node)
          #js [(aget (.-keys node) ix) (aget (.-vals node) ix)])))

(defn iterator [tree]
  (loop [node (.-root tree)]
    (if (nil? (.-children node))
      (Iterator. (.-max-keys tree) node -1)
      (recur (aget (.-children node) 0)))))

(defn tree [min-keys]
  (let [node (Node. nil nil #js [] #js [] nil)
        tree (Tree. (* 2 min-keys) node)]
    (set! (.-parent node) tree)
    (set! (.-parent-ix node) 0)
    tree))

(comment
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
    tree)

  (let [tree (tree 3)]
    (dotimes [i 1000]
      (.assoc! tree i (* 2 i)))
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
    (take 2000 (take-while identity (repeatedly #(.next iterator)))))

  (let [tree (tree 3)
        _ (.assoc! tree :a 0)
        iterator (iterator tree)]
    (take 2000 (take-while identity (repeatedly #(.next iterator)))))

  (let [tree (tree 3)
        _ (dotimes [i 1000]
            (.assoc! tree i (* 2 i)))
        iterator (iterator tree)]
    (take 2000 (take-while identity (repeatedly #(.next iterator)))))

  (let [tree (tree 3)
        _ (dotimes [i 1000]
            (.assoc! tree i (* 2 i)))
        iterator (iterator tree)]
    [(.seek iterator -100) (.seek iterator 9.34) (.seek iterator 0) (.seek iterator 500) (.seek iterator 2000) (.seek iterator 2000)])

  (let [tree (tree 3)
        _ (dotimes [i 1000]
            (.assoc! tree i (* 2 i)))
        iterator (iterator tree)]
    (time
     (dotimes [i 10000000]
       [(.seek iterator -100) (.seek iterator 9.34) (.seek iterator 0) (.seek iterator 500) (.seek iterator 2000) (.seek iterator 2000)])))
  )
