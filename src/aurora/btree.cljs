(ns aurora.btree
  (:require-macros [aurora.macros :refer [apush lt lte gt gte]]))

;; NOTE iterators are not write-safe

(deftype Tree [max-keys ^:mutable root]
  Object
  (toString [this]
            (pr-str (into {} (map vec (seq this)))))
  (assoc! [this key val]
          (assert (or (number? key) (string? key)))
          (.assoc! root key val max-keys))
  (dissoc! [this key]
           (assert (or (number? key) (string? key)))
           (.dissoc! root key (js/Math.floor (/ max-keys 2))))
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
          (.valid! root max-keys))
  (pretty-print [this]
                (prn :root)
                (loop [nodes [root]]
                  (when (seq nodes)
                    (apply println (map #(.pretty-print %) nodes))
                    (recur (mapcat #(.-children %) nodes)))))
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
        (loop [lo (if (> ix 0) ix 0)
               hi (- (alength keys) 1)]
          (if (< hi lo)
            lo
            (let [mid (+ lo (js/Math.floor (/ (- hi lo) 2)))
                  mid-key (aget keys mid)]
              (if (lt mid-key key)
                (recur (+ mid 1) hi)
                (if (== mid-key key)
                  mid
                  (recur lo (- mid 1))))))))
  (assoc! [this key val max-keys]
          (set! lower (if (lt lower key) lower key))
          (set! upper (if (lt key upper) upper key))
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
             (.splice children (+ ix 1) 0 right-child)
             (loop [jx (+ ix 2)]
               (when (< jx (alength children))
                 (let [child (aget children jx)]
                   (set! (.-parent-ix child) (+ (.-parent-ix child) 1)))
                 (recur (+ jx 1)))))
           (if (> (alength keys) max-keys)
             (.split! this max-keys)
             #_(.valid! this max-keys)))
  (split! [this max-keys]
          ;; TODO try using push/pop instead of splice/slice
          (let [median (js/Math.floor (/ (alength keys) 2))
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
            #_(.valid! this max-keys)
            #_(.valid! right-node max-keys)
            (.insert! parent parent-ix median-key median-val right-node max-keys)))
  (dissoc! [this key min-keys]
           ;; TODO update ranges
           (let [ix (.seek this key 0)
                 result (== key (aget keys ix))]
             (if result
               (if (nil? children)
                 (.remove! this ix min-keys)
                 (loop [node (aget children (+ ix 1))]
                   (if (.-children node)
                     (recur (aget (.-children node) 0))
                     (do
                       (aset keys ix (aget (.-keys node) 0))
                       (aset vals ix (aget (.-vals node) 0))
                       (.remove! node 0 min-keys)))))
               (if (nil? children)
                 nil
                 (.dissoc! (aget children ix) key min-keys)))
             result))
  (remove! [this ix min-keys]
           (assert (nil? children))
           (.splice keys ix 1)
           (.splice vals ix 1)
           (when (< (alength keys) min-keys)
             (.rotate-left! this min-keys)))
  (rotate-left! [this min-keys]
                (if (> parent-ix 0)
                  (let [left-node (aget (.-children parent) (- parent-ix 1))
                        left-keys (.-keys left-node)
                        left-vals (.-vals left-node)]
                    (if (> (alength left-keys) min-keys)
                      (do
                        (.unshift keys (.pop left-keys))
                        (.unshift vals (.pop left-vals))
                        (set! lower (aget keys 0))
                        (set! (.-upper left-node) (aget left-keys (- (alength left-keys) 1))))
                      (.rotate-right! this min-keys)))
                  (.rotate-right! this min-keys)))
  (rotate-right! [this min-keys]
                 (if (< parent-ix (- (alength (.-children parent)) 1))
                   (let [right-node (aget (.-children parent) (+ parent-ix 1))
                         right-keys (.-keys right-node)
                         right-vals (.-vals right-node)]
                     (if (> (alength right-keys) min-keys)
                       (do
                         (.push keys (.shift right-keys))
                         (.push vals (.shift right-vals))
                         (set! upper (aget keys (- (alength keys) 1)))
                         (set! (.-lower right-node) (aget right-keys 0)))
                       (.merge! this)))
                   (.merge! this)))
  (valid! [this max-keys]
          (let [min-keys (js/Math.floor (/ max-keys 2))]
            (when (instance? Node parent) ;; root is allowed to have less keys
              (assert (>= (count keys) min-keys) (pr-str keys min-keys)))
            (assert (<= (count keys) max-keys) (pr-str keys max-keys))
            (assert (= (count keys)) (inc (count children)))
            (assert (= (count keys) (count (set keys))))
            (assert (= (seq keys) (seq (sort-by identity #(cond (== %1 %2) 0 (lt %1 %2) -1 (gt %1 %2) 1) keys))))
            (assert (every? #(lte lower %) keys) (pr-str lower keys))
            (assert (every? #(gte upper %) keys) (pr-str upper keys))
            (if (nil? children)
              (do
                (assert (= lower (aget keys 0)) (pr-str lower keys))
                (assert (= upper (aget keys (- (alength keys) 1))) (pr-str upper keys)))
              (do
                (assert (= lower (.-lower (aget children 0))) (pr-str lower (.-lower (aget children 0))))
                (assert (= upper (.-upper (aget children (- (alength children) 1)))) (pr-str upper (.-upper (aget children (- (alength children) 1)))))
                (assert (every? #((fn [a b] (gt a b)) (aget keys %) (.-upper (aget children %))) (range (count keys))))
                (assert (every? #((fn [a b] (lt a b)) (aget keys %) (.-lower (aget children (inc %)))) (range (count keys))))
                (dotimes [i (count children)] (.valid! (aget children i) max-keys))))))
  (pretty-print [this]
                (str "(" parent-ix ")" "|" (pr-str lower) " " (pr-str (vec keys)) " " (pr-str upper) "|")))

(deftype Iterator [max-keys ^:mutable node ^:mutable ix ^:mutable end?]
  Object
  (next [this]
        (when (false? end?)
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
        (when-not (false? end?)
          (loop []
            (let [upper (.-upper node)]
              (if (gt key upper)
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
                  (let [ix-key (aget (.-keys node) ix)]
                    (if (and (not (nil? (.-children node))) (lt key ix-key))
                      (do
                        (set! node (aget (.-children node) ix))
                        (set! ix 0)
                        (recur))
                      #js [(aget (.-keys node) ix) (aget (.-vals node) ix)])))))))))

(defn iterator [tree]
  (loop [node (.-root tree)]
    (if (nil? (.-children node))
      (Iterator. (.-max-keys tree) node -1)
      (recur (aget (.-children node) 0)))))

;; these types bound 'number' and 'string'
(def least false)
(def greatest js/undefined)

(defn tree [min-keys]
  (let [node (Node. nil nil #js [] #js [] nil greatest least)
        tree (Tree. (* 2 min-keys) node)]
    (set! (.-parent node) tree)
    (set! (.-parent-ix node) 0)
    tree))

(comment
  (let [types [(type "foo") (type 1) (type :foo) (type js/Infinity)]]
    [(every? true? (for [type-a types]
                     (and (<= type-a type-a)
                          (not (< type-a type-a)))))
     (every? true? (for [type-a types
                         type-b types]
                     (or(< type-a type-b) (< type-b type-a) (== type-a type-b))))
     (every? true? (for [type-a types
                         type-b types]
                     (not (and (< type-a type-b) (< type-b type-a)))))
     (every? true? (for [type-a types
                         type-b types
                         type-c types]
                     (if (and (< type-a type-b) (< type-b type-c))
                       (< type-a type-c)
                       true)))])

  (let [things [(- js/Infinity) (- 0) 0 1 4.5 js/Infinity "1" "-1" "a"]]
    [(every? true? (for [thing-a things]
                     (lt least thing-a)))
     (every? true? (for [thing-a things]
                     (gt greatest thing-a)))
     (every? true? (for [thing-a things]
                     (and (lte thing-a thing-a)
                          (not (lt thing-a thing-a)))))
     (every? true? (for [thing-a things
                         thing-b things]
                     (or (lt thing-a thing-b) (lt thing-b thing-a) (== thing-a thing-b))))
     (every? true? (for [thing-a things
                         thing-b things]
                     (not (and (lt thing-a thing-b) (lt thing-b thing-a)))))
     (every? true? (for [thing-a things
                         thing-b things
                         thing-c things]
                     (if (and (lt thing-a thing-b) (lt thing-b thing-c))
                       (lt thing-a thing-c)
                       true)))
     (every? true? (for [thing-a things
                         thing-b things
                         thing-c things]
                     (if (and (lte thing-a thing-b) (lte thing-b thing-c))
                       (lte thing-a thing-c)
                       true)))])

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
    (.valid! tree)
    tree)

  (let [tree (tree 1)]
    (.assoc! tree "a" 0)
    (.valid! tree)
    tree)

  (let [tree (tree 1)]
    (.assoc! tree "a" 0)
    (.assoc! tree "b" 1)
    (js/console.log tree)
    tree)

  (let [tree (tree 1)]
    (.assoc! tree "a" 0)
    (.assoc! tree "b" 1)
    (.assoc! tree "c" 1)
    (js/console.log tree)
    tree)

  (let [tree (tree 1)]
    (.assoc! tree "a" 0)
    (.pretty-print tree)
    (.assoc! tree "b" 1)
    (.pretty-print tree)
    (.assoc! tree "c" 1)
    (.pretty-print tree)
    (.assoc! tree "d" 1)
    (.pretty-print tree)
    (.assoc! tree "e" 1)
    (.pretty-print tree)
    (.assoc! tree "f" 1)
    (.pretty-print tree)
    (.assoc! tree "g" 1)
    (.pretty-print tree)
    (js/console.log tree)
    (.valid! tree)
    tree)

  (let [tree (tree 1)]
    (.assoc! tree "a" 0)
    (.pretty-print tree)
    (.assoc! tree 1 "b")
    (.pretty-print tree)
    (.assoc! tree "c" 2)
    (.pretty-print tree)
    (.assoc! tree 3 "d")
    (.pretty-print tree)
    (.assoc! tree "e" 4)
    (.pretty-print tree)
    (.assoc! tree 5 "f")
    (.pretty-print tree)
    (.assoc! tree "g" 6)
    (.pretty-print tree)
    (js/console.log tree)
    (.valid! tree)
    tree)

  (let [tree (tree 1)]
    (dotimes [i 1000]
      (.assoc! tree i (* 2 i)))
    (.valid! tree)
    (= (map #(.apply vector nil %) tree) (for [i (range 1000)] [i (* 2 i)])))

  (let [tree (tree 1)]
    (dotimes [i 1000]
      (.assoc! tree (js/Math.sin i) (* 2 i)))
    (.valid! tree)
    (= (map #(.apply vector nil %) tree) (sort (for [i (range 1000)] [(js/Math.sin i) (* 2 i)]))))

  (let [tree (tree 2)]
    (dotimes [i 1000]
      (.assoc! tree i (* 2 i)))
    (.valid! tree)
    (= (map #(.apply vector nil %) tree) (for [i (range 1000)] [i (* 2 i)])))

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

  (defn f []
    (time
     (let [tree (tree 100)]
       (dotimes [i 500000]
         (.assoc! tree i (* 2 i))))))

  (f)

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
