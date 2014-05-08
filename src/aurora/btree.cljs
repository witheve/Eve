(ns aurora.btree
  (:require [cemerick.double-check :as dc]
            [cemerick.double-check.generators :as gen]
            [cemerick.double-check.properties :as prop :include-macros true]
            [cemerick.pprng :as pprng]
            clojure.set)
  (:require-macros [aurora.macros :refer [apush apush* typeof set!! dofrom]]))

;; COMPARISONS

;; 'bool' < 'number' < 'string' < 'undefined'
(def least false)
(def greatest js/undefined)

(defn least-key [key-len]
  (let [result #js []]
    (dotimes [_ key-len]
      (.push result least))
    result))

(defn greatest-key [key-len]
  (let [result #js []]
    (dotimes [_ key-len]
      (.push result greatest))
    result))

(defn key-compare [as bs]
  (let [as-len (alength as)
        bs-len (alength bs)]
    (assert (== as-len bs-len) (pr-str as bs))
    (loop [i 0]
      (if (< i as-len)
        (let [a (aget as i)
              b (aget bs i)]
          (if (identical? a b)
            (recur (+ i 1))
            (if (or (and (identical? (typeof a) (typeof b))
                         (< a b))
                    (< (typeof a) (typeof b)))
              -1
              1)))
        0))))

(defn key= [as bs]
  (== 0 (key-compare as bs)))

(defn key-not= [as bs]
  (not (== 0 (key-compare as bs))))

(defn key-lt [as bs]
  (== -1 (key-compare as bs)))

(defn key-gt [as bs]
  (== 1 (key-compare as bs)))

(defn key-lte [as bs]
  (not (== 1 (key-compare as bs))))

(defn key-gte [as bs]
  (not (== -1 (key-compare as bs))))

;; TREES

(def left-child 0)
(def right-child 1)

(deftype Tree [max-keys key-len ^:mutable root]
  Object
  (toString [this]
            (pr-str (into {} (map vec (seq this)))))
  (assoc! [this key val]
          (.assoc! root key val max-keys))
  (dissoc! [this key]
           (.dissoc! root key max-keys))
  (push! [this ix key&val&child which-child]
           (let [left-child (if (== which-child left-child) (aget key&val&child 2) root)
                 right-child (if (== which-child right-child) (aget key&val&child 2) root)]
             (set! root (Node. this 0 #js [(aget key&val&child 0)] #js [(aget key&val&child 1)] #js [left-child right-child] (.-lower left-child) (.-upper right-child)))
             (set! (.-parent left-child) root)
             (set! (.-parent-ix left-child) 0)
             (set! (.-parent right-child) root)
             (set! (.-parent-ix right-child) 1)))
  (maintain! [this])
  (into [this result]
        (.into root result))
  (valid! [this]
          (when (> (alength (.-keys root)) 0) ;; the empty tree does not obey most invariants
            (.valid! root max-keys))
          true)
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
              (if (key-lt mid-key key)
                (recur (+ mid 1) hi)
                (if (key= mid-key key)
                  mid
                  (recur lo (- mid 1))))))))
  (assoc! [this key val max-keys]
          (let [ix (.seek this key 0)]
            (if (and (< ix (alength keys)) (key= key (aget keys ix)))
              (do
                (aset vals ix val)
                true)
              (if (nil? children)
                (do
                  (.push! this ix #js [key val])
                  (.maintain! this max-keys)
                  false)
                (.assoc! (aget children ix) key val max-keys)))))
  (dissoc! [this key max-keys]
           (let [ix (.seek this key 0)]
             (if (and (< ix (alength keys)) (key= key (aget keys ix)))
               (if (nil? children)
                 (do
                   (.pop! this ix)
                   (.maintain! this max-keys)
                   true)
                 (loop [node (aget children (+ ix 1))]
                   (if (.-children node)
                     (recur (aget (.-children node) 0))
                     (do
                       (aset keys ix (aget (.-keys node) 0))
                       (aset vals ix (aget (.-vals node) 0))
                       (.pop! node 0)
                       (.maintain! node max-keys)
                       (.maintain! this max-keys)
                       true))))
               (if (nil? children)
                 false ;; done
                 (.dissoc! (aget children ix) key max-keys)))))
  (push! [this ix key&val&child which-child]
         (.splice keys ix 0 (aget key&val&child 0))
         (.splice vals ix 0 (aget key&val&child 1))
         (when-not (nil? children)
           (let [child-ix (+ ix which-child)]
             (.splice children child-ix 0 (aget key&val&child 2)))))
  (pop! [this ix which-child]
        (let [key (aget keys ix)
              val (aget vals ix)
              child nil]
          (.splice keys ix 1)
          (.splice vals ix 1)
          (if-not (nil? children)
            (let [child-ix (+ ix which-child)
                  child (aget children child-ix)]
              (.splice children child-ix 1)
              (set! (.-parent child) nil)
              #js [key val child])
            #js [key val])))
  (maintain! [this max-keys]
             (assert max-keys)
             (when-not (nil? parent)
               (let [min-keys (js/Math.floor (/ max-keys 2))]
                 (when-not (nil? children)
                   (dotimes [ix (alength children)]
                     (let [child (aget children ix)]
                       (set! (.-parent-ix child) ix)
                       (set! (.-parent child) this))))
                 (if (> (alength keys) max-keys)
                   (.split! this max-keys)
                   (if (and (< (alength keys) min-keys) (instance? Node parent))
                     (.rotate-left! this max-keys)
                     (if (== (alength keys) 0)
                       (if (nil? children)
                         (do
                           (set! lower nil)
                           (set! upper nil))
                         (do
                           #_(assert (== 1 (alength children)))
                           #_(assert (instance? Tree parent))
                           (set! (.-parent (aget children 0)) parent)
                           (set! (.-root parent) (aget children 0))))
                       (do
                         (.update-lower! this (if (nil? children) (aget keys 0) (.-lower (aget children 0))))
                         (.update-upper! this (if (nil? children) (aget keys (- (alength keys) 1)) (.-upper (aget children (- (alength children) 1))))))))))))
  (update-lower! [this new-lower]
                 (when (or (nil? lower) (key-not= lower new-lower))
                   (set! lower new-lower)
                   (when (and (instance? Node parent) (== parent-ix 0))
                     (.update-lower! parent new-lower))))
  (update-upper! [this new-upper]
                 (when (or (nil? upper) (key-not= upper new-upper))
                   (set! upper new-upper)
                   (when (and (instance? Node parent) (== parent-ix (- (alength (.-children parent)) 1)))
                     (.update-upper! parent new-upper))))
  (split! [this max-keys]
          (let [median (js/Math.floor (/ (alength keys) 2))
                right-node (Node. parent (+ parent-ix 1) #js [] #js [] (when-not (nil? children) #js []) nil nil)]
            (while (> (alength keys) (+ median 1))
              (.push! right-node 0 (.pop! this (- (alength keys) 1) right-child) left-child))
            (when-not (nil? children)
              (.unshift (.-children right-node) (.pop children)))
            (.push! parent parent-ix #js [(.pop keys) (.pop vals) right-node] right-child)
            (.maintain! this max-keys)
            (.maintain! right-node max-keys)
            (.maintain! parent max-keys)
            #_(.valid! this max-keys)
            #_(.valid! right-node max-keys)))
  (rotate-left! [this max-keys]
                (if (> parent-ix 0)
                  (let [left-node (aget (.-children parent) (- parent-ix 1))
                        min-keys (js/Math.floor (/ max-keys 2))]
                    (if (> (alength (.-keys left-node)) min-keys)
                      (let [key&val&child (.pop! left-node (- (alength (.-keys left-node)) 1) right-child)
                            separator-ix (- parent-ix 1)]
                        (.push! this 0 #js [(aget (.-keys parent) separator-ix) (aget (.-vals parent) separator-ix) (aget key&val&child 2)] left-child)
                        (aset (.-keys parent) separator-ix (aget key&val&child 0))
                        (aset (.-vals parent) separator-ix (aget key&val&child 1))
                        (.maintain! this max-keys)
                        (.maintain! left-node max-keys)
                        (.maintain! parent max-keys))
                      (.rotate-right! this max-keys)))
                  (.rotate-right! this max-keys)))
  (rotate-right! [this max-keys]
                 (if (< parent-ix (- (alength (.-children parent)) 2))
                   (let [right-node (aget (.-children parent) (+ parent-ix 1))
                         min-keys (js/Math.floor (/ max-keys 2))]
                     (if (> (alength (.-keys right-node)) min-keys)
                       (let [key&val&child (.pop! right-node 0 left-child)
                             separator-ix parent-ix]
                         (.push! this (alength keys) #js [(aget (.-keys parent) separator-ix) (aget (.-vals parent) separator-ix) (aget key&val&child 2)] right-child)
                         (aset (.-keys parent) separator-ix (aget key&val&child 0))
                         (aset (.-vals parent) separator-ix (aget key&val&child 1))
                         (.maintain! this max-keys)
                         (.maintain! right-node max-keys)
                         (.maintain! parent max-keys))
                       (.merge! this max-keys)))
                   (.merge! this max-keys)))
  (merge! [this max-keys]
          (let [parent parent ;; in case it gets nulled out by .pop!
                separator-ix (if (> parent-ix 0) (- parent-ix 1) parent-ix)
                key&val&child (.pop! parent separator-ix right-child)
                left-node (aget (.-children parent) separator-ix)
                right-node (aget key&val&child 2)]
            (.push! left-node (alength (.-keys left-node))
                    #js [(aget key&val&child 0)
                         (aget key&val&child 1)
                         (when-not (nil? (.-children right-node)) (.shift (.-children right-node)))]
                    right-child)
            (while (> (alength (.-keys right-node)) 0)
              (.push! left-node (alength (.-keys left-node)) (.pop! right-node 0 left-child) right-child))
            (.maintain! left-node max-keys)
            (.maintain! right-node max-keys)
            (.maintain! parent max-keys)))
  (valid! [this max-keys]
          (let [min-keys (js/Math.floor (/ max-keys 2))]
            (when (instance? Node parent) ;; root is allowed to have less keys
              (assert (>= (count keys) min-keys) (pr-str keys min-keys)))
            (assert (<= (count keys) max-keys) (pr-str keys max-keys))
            (assert (= (count keys) (count (set keys))))
            (assert (= (seq keys) (seq (sort-by identity key-compare keys))))
            (assert (every? #(key-lte lower %) keys) (pr-str lower keys))
            (assert (every? #(key-gte upper %) keys) (pr-str upper keys))
            (if (= 0 (count children))
              (do
                (assert (= (count keys) (count vals)) (pr-str keys vals))
                (assert (= lower (aget keys 0)) (pr-str lower keys))
                (assert (= upper (aget keys (- (alength keys) 1))) (pr-str upper keys)))
              (do
                (assert (> (count keys) 0))
                (dotimes [ix (count children)]
                  (assert (= ix (.-parent-ix (aget children ix)))))
                (assert (= (count keys) (count vals) (dec (count children))) (pr-str keys vals children))
                (assert (= lower (.-lower (aget children 0))) (pr-str lower (.-lower (aget children 0))))
                (assert (= upper (.-upper (aget children (- (alength children) 1)))) (pr-str upper (.-upper (aget children (- (alength children) 1)))))
                (assert (every? #(key-gt (aget keys %) (.-upper (aget children %))) (range (count keys))))
                (assert (every? #(key-lt (aget keys %) (.-lower (aget children (inc %)))) (range (count keys))))
                (dotimes [i (count children)] (.valid! (aget children i) max-keys))))))
  (pretty-print [this]
                (str "(" parent-ix ")" "|" (pr-str lower) " " (pr-str (vec keys)) " " (pr-str upper) "|")))

(defn tree [min-keys key-len]
  (let [node (Node. nil nil #js [] #js [] nil nil nil)
        tree (Tree. (* 2 min-keys) key-len node)]
    (set! (.-parent node) tree)
    (set! (.-parent-ix node) 0)
    tree))

;; NOTE iterators are not write-safe

(deftype Iterator [max-keys ^:mutable node ^:mutable ix marked-nodes marked-ixes ^:mutable end? key-len]
  Object
  (key [this]
       (when (false? end?)
         (aget (.-keys node) ix)))
  (val [this]
       (when (false? end?)
         (aget (.-vals node) ix)))
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
                    (set! end? true))
                  nil)))
            (do
              (set! node (aget (.-children node) (+ ix 1)))
              (set! ix 0)
              (loop []
                (when-not (nil? (.-children node))
                  (set! node (aget (.-children node) 0))
                  (recur)))))))
  (seek [this key]
        (.next this)
        (let [start-node node
              start-ix ix]
          (when (false? end?)
            (loop []
              (let [upper (.-upper node)]
                (if (key-lt upper key)
                  (if (instance? Node (.-parent node))
                    (do
                      (set! ix (.-parent-ix node))
                      (set! node (.-parent node))
                      (recur))
                    (set! end? true))
                  (loop []
                    (set! ix (.seek node key ix))
                    (if (>= ix (alength (.-keys node)))
                      (do
                        (set! node (aget (.-children node) ix))
                        (set! ix 0)
                        (recur))
                      (if (or (and (identical? node start-node) (== ix start-ix))
                              (key= key (aget (.-keys node) ix))
                              (nil? (.-children node))
                              (let [lower (.-upper (aget (.-children node) ix))]
                                (key-lt lower key)))
                        nil
                        (do
                          (set! node (aget (.-children node) ix))
                          (set! ix 0)
                          (recur)))))))))))
  (mark [this]
        (apush marked-nodes node)
        (apush marked-ixes ix))
  (reset [this]
         (assert (> (alength marked-nodes) 0))
         (assert (> (alength marked-ixes) 0))
         (set! node (.pop marked-nodes))
         (set! ix (.pop marked-ixes))))

(defn iterator [tree]
  (loop [node (.-root tree)]
    (if (nil? (.-children node))
      (if (> (alength (.-keys node)) 0)
        (Iterator. (.-max-keys tree) node 0 #js [] #js [] false (.-key-len tree))
        (Iterator. (.-max-keys tree) node 0 #js [] #js [] true (.-key-len tree)))
      (recur (aget (.-children node) 0)))))

;; trie view of a tree
(deftype Trieterator [iterator seek-key ^:mutable pinned-key ^:mutable pinned-key-ix ^:mutable moving-key-ix ^:mutable end? key-len]
  Object
  (key [this]
       (aget (.key iterator) moving-key-ix))
  (val [this]
       (.val iterator))
  (maintain [this]
             (if (or (.-end? iterator)
                     (not (or (< pinned-key-ix 0) ;; nothing to pin
                              (identical? pinned-key (aget (.key iterator) pinned-key-ix)))))
               (set! end? true)
               (set! end? false)))
  (next [this]
        (when (false? end?)
          (.next iterator)
          (.maintain this)))
  (seek [this key]
        (when (false? end?)
          (aset seek-key moving-key-ix key)
          (.seek iterator seek-key)
          (.maintain this)))
  (down [this]
        (assert (false? end?))
        (assert (< moving-key-ix (- (alength seek-key) 1)))
        (let [moving-key (.key this)]
          (aset seek-key moving-key-ix moving-key)
          (set! pinned-key moving-key)
          (set! pinned-key-ix moving-key-ix)
          (set! moving-key-ix (+ moving-key-ix 1))))
  (up [this]
      (assert (> moving-key-ix 0))
      (set! moving-key-ix pinned-key-ix)
      (set! pinned-key-ix (- pinned-key-ix 1))
      (set! pinned-key (aget seek-key pinned-key-ix))
      (aset seek-key moving-key-ix least))
  (mark [this]
        (.mark iterator))
  (reset [this]
         (.reset iterator)))

(defn trieterator [iterator]
  (Trieterator. iterator (least-key (.-key-len iterator)) nil -1 0 (.-end? iterator) (.-key-len iterator)))

;; works on trees
(deftype Intersection [iterators ^:mutable end? key-len]
  Object
  (key [this]
       (when (false? end?)
         (.key (aget iterators 0))))
  (search [this current]
          (when (false? end?)
            (loop [current current]
              (let [max-key (.key (aget iterators (mod (- current 1) (alength iterators))))
                    min-key (.key (aget iterators current))]
                (when-not (key= min-key max-key)
                  (.seek (aget iterators current) max-key)
                  (if (.-end? (aget iterators current))
                    (set! end? true)
                    (recur (mod (+ current 1) (alength iterators)))))))))
  (next [this]
        (when (false? end?)
          (.next (aget iterators 0))
          (if (.-end? (aget iterators 0))
            (set! end? true)
            (.search this 1))))
  (seek [this key]
        (when (false? end?)
          (.seek (aget iterators 0) key)
          (if (.-end? (aget iterators 0))
            (set! end? true)
            (.search this 1)))))

(defn intersection [iterators]
  (assert (> (alength iterators) 0))
  (assert (every? #(= (.-key-len (aget iterators 0)) (.-key-len %)) iterators))
  (if (> (alength iterators) 1)
    (if (some #(.-end? %) iterators)
      (Intersection. iterators true (.-key-len (aget iterators 0)))
      (let [intersection (Intersection. (into-array (sort-by #(.key %) key-compare iterators)) false (.-key-len (aget iterators 0)))]
        (.search intersection 0)
        intersection))
    (aget iterators 0)))

;; works on tries
(deftype Join [^:mutable key-ix iterators key-ix->intersection key-ix->iterator->present? ^:mutable end? key-len]
  Object
  (key [this]
       (when (false? end?)
         (.key (aget key-ix->intersection key-ix))))
  (val [this]
       (when (false? end?)
         (.val (aget key-ix->intersection key-ix))))
  (maintain [this]
            (set! end? (.-end? (aget key-ix->intersection key-ix))))
  (next [this]
        (when (false? end?)
          (.next (aget key-ix->intersection key-ix))
          (.maintain this)))
  (seek [this key]
        (when (false? end?)
          (.seek (aget key-ix->intersection key-ix) key)
          (.maintain this)))
  (down [this]
        (assert (false? end?)) ;; have to be at a key to descend
        (assert (< key-ix (- (alength key-ix->intersection) 1)))
        (set! key-ix (+ key-ix 1))
        (let [iterator->present? (aget key-ix->iterator->present? key-ix)]
          (dotimes [i (alength iterator->present?)]
            (if (aget iterator->present? i)
              (.down (aget iterators i))
              (.mark (aget iterators i))))
          (.maintain this)))
  (up [this]
      (assert (> key-ix 0))
      (set! key-ix (- key-ix 1))
      (let [iterator->present? (aget key-ix->iterator->present? key-ix)]
        (dotimes [i (alength iterator->present?)]
          (if (aget iterator->present? i)
            (.up (aget iterators i))
            (.reset (aget iterators i))))
        (.maintain this))))

(defn join [iterators num-vars iterator->vars]
  (assert (> num-vars 0))
  (dotimes [i (alength iterators)]
    (let [iterator-vars (aget iterator->vars i)]
      (assert (== (alength iterator-vars) (.key-len (aget iterators i))))
      (dotimes [j (alength iterator-vars)]
        (assert (< (aget iterator-vars j) num-vars)))))
  (let [var->iterators #js []
        var->iterator->present? #js []
        var->intersection #js []]
    (dotimes [i num-vars]
      (.push var->iterators #js [])
      (let [iterator->present? #js []]
        (.push var->iterator->present? iterator->present?)
        (dotimes [j (alength iterators)]
          (.push iterator->present? false))))
    (dotimes [iterator (alength iterators)]
      (let [iterator-vars (aget iterators iterator)]
        (dotimes [j (alength iterator-vars)]
          (let [var (aget iterator-vars j)]
            (.push (aget var->iterators var) iterator)
            (aset var->iterator->present? var iterator true)))))
    (dotimes [i num-vars]
      (assert (> (alength (aget var->iterators i)) 0))
      (.push var->intersection i (intersection (aget var->iterators i))))
    (let [join (Join. 0 iterators var->intersection var->iterator->present? false num-vars)]
      (.maintain join)
      join)))

;; tree view of a trie
(deftype Treeterator [iterator key ^:mutable key-ix ^:mutable end? key-len]
  Object
  (key [this]
       (when (false? end?)
         (aclone key)))
  (val [this]
       (when (false? end?)
         (.val iterator)))
  (walk-up [this]
           (loop []
             (when (false? end?)
               (if (.-end? iterator)
                 (if (<= key-ix 0)
                   (set! end? true)
                   (do
                     (set! key-ix (- key-ix 1))
                     (.up iterator)
                     (recur)))))))
  (walk-down [this]
             (loop []
               (when (and (false? end?) (< key-ix (- (alength key) 1)))
                 (do
                   (set! key-ix (+ key-ix 1))
                   (.down iterator)
                   (aset key key-ix (.key iterator))))))
  (next [this]
        (.walk-up this)
        (when (false? end?)
          (.next iterator)
          (if (false? (.-end? iterator))
            (aset key key-ix (.key iterator))
            (set! end? true)))
        (.walk-down this))
  (seek [this key]
        (assert false "TODO")))

(defn treeterator [iterator]
  (let [treeterator (Treeterator. iterator (least-key (.-key-len iterator)) 0 (.-end? iterator) (.-key-len iterator))]
    (.walk-down treeterator)
    treeterator))

(defn iter-seq [iterator]
  (let [results #js []]
    (while (false? (.-end? iterator))
      (.push results (.key iterator))
      (.next iterator))
    results))

;; TESTS

(defn gen-key [key-len]
  (gen/fmap into-array (gen/vector (gen/one-of [gen/int gen/string-ascii]) key-len)))

(defn least-prop [key-len]
  (prop/for-all [key (gen-key key-len)]
                (and (key-lt (least-key key-len) key)
                     (key-lte (least-key key-len) key)
                     (key-gt key (least-key key-len))
                     (key-gte key (least-key key-len)))))

(defn greatest-prop [key-len]
  (prop/for-all [key (gen-key key-len)]
                (and (key-gt (greatest-key key-len) key)
                     (key-gte (greatest-key key-len) key)
                     (key-lt key (greatest-key key-len))
                     (key-lte key (greatest-key key-len)))))

(defn equality-prop [key-len]
  (prop/for-all [key-a (gen-key key-len)
                 key-b (gen-key key-len)]
                (= (key= key-a key-b)
                   (and (key-lte key-a key-b) (not (key-lt key-a key-b)))
                   (and (key-gte key-a key-b) (not (key-gt key-a key-b))))))

(defn reflexive-prop [key-len]
  (prop/for-all [key (gen-key key-len)]
                (and (key-lte key key) (key-gte key key) (not (key-lt key key)) (not (key-gt key key)))))

(defn transitive-prop [key-len]
  (prop/for-all [key-a (gen-key key-len)
                 key-b (gen-key key-len)
                 key-c (gen-key key-len)]
                (and (if (and (key-lt key-a key-b) (key-lt key-b key-c)) (key-lt key-a key-c) true)
                     (if (and (key-lte key-a key-b) (key-lte key-b key-c)) (key-lte key-a key-c) true)
                     (if (and (key-gt key-a key-b) (key-gt key-b key-c)) (key-gt key-a key-c) true)
                     (if (and (key-gte key-a key-b) (key-gte key-b key-c)) (key-gte key-a key-c) true))))

(defn anti-symmetric-prop [key-len]
  (prop/for-all [key-a (gen-key key-len)
                 key-b (gen-key key-len)]
                (and (not (and (key-lt key-a key-b) (key-lt key-b key-a)))
                     (not (and (key-gt key-a key-b) (key-gt key-b key-a))))))

(defn total-prop [key-len]
  (prop/for-all [key-a (gen-key key-len)
                 key-b (gen-key key-len)]
                (and (or (key-lt key-a key-b) (key-gte key-a key-b))
                     (or (key-gt key-a key-b) (key-lte key-a key-b)))))

;; fast gens with no shrinking and no long strings. good enough for government work

(defn make-simple-key-elem [rnd size]
  (let [value (gen/rand-range rnd (- size) size)]
    (if (pprng/boolean rnd)
      value
      (str value))))

(defn make-simple-key [rnd size key-len]
  (let [result #js []]
    (dotimes [_ key-len]
      (.push result (make-simple-key-elem rnd size)))
    result))

(defn gen-assoc [key-len]
  (gen/make-gen
   (fn [rnd size]
     (let [key (make-simple-key rnd size key-len)
           val (make-simple-key rnd size key-len)]
       [[:assoc! key key] nil]))))

(defn gen-dissoc [key-len]
  (gen/make-gen
   (fn [rnd size]
     (let [key (make-simple-key rnd size key-len)]
       [[:dissoc! key] nil]))))

(defn gen-action [key-len]
  (gen/make-gen
   (fn [rnd size]
     (let [key (make-simple-key rnd size key-len)
           val (make-simple-key rnd size key-len)]
       (if (pprng/boolean rnd)
         [[:assoc! key val] nil]
         [[:dissoc! key] nil])))))

(defn apply-to-tree [tree actions]
  (doseq [action actions]
    (case (nth action 0)
      :assoc! (.assoc! tree (nth action 1) (nth action 2))
      :dissoc! (.dissoc! tree (nth action 1)))
    #_(do
      (prn action)
      (.pretty-print tree)
      (prn tree)
      (.valid! tree)))
  tree)

(defn apply-to-sorted-map [map actions]
  (reduce
   (fn [map action]
     (case (nth action 0)
       :assoc! (assoc map (nth action 1) (nth action 2))
       :dissoc! (dissoc map (nth action 1))))
   map actions))

(defn run-building-prop [min-keys key-len actions]
  (let [tree (apply-to-tree (tree min-keys key-len) actions)
        sorted-map (apply-to-sorted-map (sorted-map-by key-compare) actions)]
    (and (= (seq (map vec tree)) (seq sorted-map))
         (.valid! tree))))

(defn building-prop [gen key-len]
  (prop/for-all [min-keys gen/s-pos-int
                 actions (gen/vector (gen key-len))]
                (run-building-prop min-keys key-len actions)))

(defn run-lookup-prop [min-keys key-len actions action]
  (let [tree (apply-to-tree (tree min-keys key-len) actions)
        sorted-map (apply-to-sorted-map (sorted-map-by key-compare) actions)
        tree-result (case (nth action 0)
                      :assoc! (.assoc! tree (nth action 1) (nth action 2))
                      :dissoc! (.dissoc! tree (nth action 1)))
        sorted-map-result (contains? sorted-map (nth action 1))]
    (= tree-result sorted-map-result)))

(defn lookup-prop [gen key-len]
  (prop/for-all [min-keys gen/s-pos-int
                 actions (gen/vector (gen key-len))
                 action (gen key-len)]
                (run-lookup-prop min-keys key-len actions action)))

(defn gen-next [key-len]
  (gen/make-gen
   (fn [rnd size]
     [[:next] nil])))

(defn gen-seek [key-len]
  (gen/make-gen
   (fn [rnd size]
     (let [key (make-simple-key rnd size key-len)]
       [[:seek key] nil]))))

(defn gen-movement [key-len]
  (gen/make-gen
   (fn [rnd size]
     (let [key (make-simple-key rnd size key-len)]
       (if (pprng/boolean rnd)
         [[:next] nil]
         [[:seek key] nil])))))

(defn apply-to-iterator [iterator movements]
  (for [movement movements]
    (case (nth movement 0)
      :next (do
              (.next iterator)
              (.key iterator))
      :seek (do
              (.seek iterator (nth movement 1))
              (.key iterator)))))

(defn apply-to-elems [elems movements]
  (let [elems (atom elems)]
    (for [movement movements]
      (case (nth movement 0)
        :next (do
                (swap! elems rest)
                (first (first @elems)))
        :seek (do
                (swap! elems rest)
                (swap! elems (fn [elems] (drop-while #(key-lt (nth % 0) (nth movement 1)) elems)))
                (first (first @elems)))))))

(defn run-iterator-prop [min-keys key-len actions movements]
  (let [tree (apply-to-tree (tree min-keys key-len) actions)
        sorted-map (apply-to-sorted-map (sorted-map-by key-compare) actions)
        iterator-results (apply-to-iterator (iterator tree) movements)
        elems-results (apply-to-elems (seq sorted-map) movements)]
    #_(.pretty-print tree)
    (= iterator-results elems-results)))

(defn iterator-prop [key-len]
  (prop/for-all [min-keys gen/s-pos-int
                 actions (gen/vector (gen-action key-len))
                 movements (gen/vector (gen-movement key-len))]
                (run-iterator-prop min-keys key-len actions movements)))

(defn run-intersection-prop [min-keys key-len actionss movements]
  (let [trees (map #(apply-to-tree (tree min-keys key-len) %) actionss)
        keys (apply clojure.set/intersection (map #(set (map (fn [[k v]] (vec k)) %)) trees))
        sorted-map (into (sorted-map-by key-compare)
                         (for [tree trees
                               [k v :as elem] tree
                               :when (contains? keys (vec k))]
                           (vec elem)))
        iterator-results (apply-to-iterator (intersection (into-array (map iterator trees))) movements)
        elems-results (apply-to-elems (seq sorted-map) movements)]
    (= (map vec iterator-results) (map vec elems-results))))

(defn intersection-prop [key-len]
  (prop/for-all [min-keys gen/s-pos-int
                 actionss (gen/vector (gen/vector (gen-action key-len)) 1 4)
                 movements (gen/vector (gen-movement key-len))]
                (run-intersection-prop min-keys key-len actionss movements)))

(comment
  (dc/quick-check 1000 (least-prop 1))
  (dc/quick-check 1000 (least-prop 2))
  (dc/quick-check 1000 (greatest-prop 1))
  (dc/quick-check 1000 (greatest-prop 2))
  (dc/quick-check 1000 (equality-prop 1))
  (dc/quick-check 1000 (equality-prop 2))
  (dc/quick-check 1000 (reflexive-prop 1))
  (dc/quick-check 1000 (reflexive-prop 2))
  (dc/quick-check 1000 (transitive-prop 1))
  (dc/quick-check 1000 (transitive-prop 2))
  (dc/quick-check 1000 (anti-symmetric-prop 1))
  (dc/quick-check 1000 (anti-symmetric-prop 2))
  (dc/quick-check 1000 (total-prop 1))
  (dc/quick-check 1000 (total-prop 2))
  (dc/quick-check 10000 (building-prop gen-assoc 1))
  (dc/quick-check 10000 (building-prop gen-action 1))
  ;; cljs.core.pr_str(cemerick.double_check.quick_check(1000, aurora.btree.building_prop(aurora.btree.gen_action)))
  (dc/quick-check 10000 (lookup-prop gen-action 1))
  (dc/quick-check 10000 (iterator-prop 1))
  ;; cljs.core.pr_str(cemerick.double_check.quick_check(1000, aurora.btree.iterator_prop)
  (dc/quick-check 5000 (intersection-prop 1))
  ;; cljs.core.pr_str(cemerick.double_check.quick_check(1000, aurora.btree.intersection_prop))


  (defn f []
    (time
     (let [tree (tree 100)]
       (dotimes [i 500000]
         (.assoc! tree i (* 2 i))))))

  (f)

  (defn g []
    (time
     (let [tree (tree 100)]
       (dotimes [i 500000]
         (.assoc! tree (if (even? i) i (str i)) (* 2 i))))))

  (g)

  (defn h []
    (time
     (let [tree (tree 100)]
       (dotimes [i 500000]
         (.assoc! tree (js/Math.sin i) (* 2 i))))))

  (h)

  (do
    (def samples (gen/sample (gen/tuple gen/s-pos-int (gen/vector gen-action) (gen/vector gen-movement)) 100))
    (def trees (for [[min-keys actions _] samples]
                 (apply-to-tree (tree min-keys) actions)))
    (def benches (mapv vector trees (map #(nth % 2) samples)))
    (time
     (doseq [[tree movements] benches]
       (apply-to-iterator (iterator tree) movements))))
 )

