(ns aurora.scantree
  (:require-macros [aurora.macros :refer [apush]]))

;; NOTE iterators are not write-safe

(deftype Tree [max-keys ^:mutable root aggregateFunc]
  Object
  (toString [this]
            (pr-str (into {} (map vec (seq this)))))
  (assoc! [this key val]
          (.assoc! root key val max-keys))
  (insert! [this ix key val right-child max-keys]
           (let [left-child root]
             (set! root (Node. this 0 #js [key] #js [val] #js [left-child right-child] true aggregateFunc nil))
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

(deftype Node [parent parent-ix keys vals children ^:mutable dirty? aggregateFunc aggregate]
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
                  (set! (.-dirty? this) false))
                (.-aggregate this))
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
          (set! (.-dirty? this) true)
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
           (set! (.-dirty? this) true)
           (.splice keys ix 0 key)
           (.splice vals ix 0 val)
           (when-not (nil? children)
             (.splice children (+ ix 1) 0 right-child))
           (when (> (alength keys) max-keys)
             (.split! this max-keys)))
  (split! [this max-keys]
          ;; TODO try using push/pop instead of splice/slice
          (let [median (js/Math.floor (/ max-keys 2))
                right-node (Node. parent (+ parent-ix 1) nil nil nil true aggregateFunc nil)]
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

(defn tree [min-keys aggregateFunc]
  (let [node (Node. nil nil #js [] #js [] nil true aggregateFunc nil)
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
                        second))]
    (loop [cur (.next itr)]
      (when (and cur (<= (first cur) to))
        (.push coll (second cur))
        (recur (.next itr))
        ))
    coll))

(defn contained? [nfrom nto from to]
  (and (not (or (nil? nfrom)
                (nil? nto)))
       (<= nfrom from)
       (>= nto to)))

(defn down-until-contained [node nfrom nto from to result]
  (let [keys (.-keys node)
        keys-len (.-length keys)
        vals (.-vals node)]
    (println "checking node: " nfrom nto)
    (if-let [children (.-children node)]
      ;;internal node
      (let [len (.-length children)]
        (doseq [child-i (range len)
                :let [child (aget children child-i)
                      lower (if (== 0 child-i)
                              nfrom
                              (aget keys (dec child-i)))
                      upper (if (> child-i keys-len)
                              nto
                              (aget keys child-i))]]
          (println "looking at child: " lower upper)
          (if (contained? lower upper from to)
            (.push result (.getAggregate child))
            (when (<= lower to)
              ;;check if this node's value needs to go in
              (when (and (>= upper from)
                         (<= upper to))
                (.push result (aget vals child-i)))
              (down-until-contained child lower upper from to result))
            )
          ))
      ;;leaf node
      (loop [i 0]
        (when (< i keys-len)
          (println "checking key: " i (aget keys i))
          (let [k (aget keys i)]
            (when (and (>= k from)
                       (<= k to))
              (.push result (aget vals i)))
            (when (<= k to)
              (recur (inc i)))))))))

(defn aggregate-range [tree from to]
  (let [results (array)]
    (down-until-contained (.-root tree) nil nil from to results)
    (println results)
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
   (let [tree (tree 3 +)]
     (dotimes [i 10]
       (.assoc! tree i (* 2 i)))
     ;(collect tree 3 7)
     ;(.seek (iterator tree) 4)
     (.log js/console tree)
     (aggregate-range tree 2 5)
     ))

  4 + 6 + 8 +10

  )
