(ns aurora.btree
  (:require [cemerick.double-check :as dc]
            [cemerick.double-check.generators :as gen]
            [cemerick.double-check.properties :as prop :include-macros true])
  (:require-macros [aurora.macros :refer [apush apush* lt lte gt gte set!! dofrom]]))

;; NOTE iterators are not write-safe

(def left-child 0)
(def right-child 1)

(defn compare-keys [x y]
  (cond (== x y) 0 (lt x y) -1 (gt x y) 1))

(defn lt-fun [a b]
  (lt a b))

(defn gt-fun [a b]
  (gt a b))

(deftype Tree [max-keys ^:mutable root]
  Object
  (toString [this]
            (pr-str (into {} (map vec (seq this)))))
  (assoc! [this key val]
          (assert (or (number? key) (string? key)))
          (.assoc! root key val max-keys))
  (dissoc! [this key]
           (assert (or (number? key) (string? key)))
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
              (if (lt mid-key key)
                (recur (+ mid 1) hi)
                (if (== mid-key key)
                  mid
                  (recur lo (- mid 1))))))))
  (assoc! [this key val max-keys]
          (let [ix (.seek this key 0)]
            (if (== key (aget keys ix))
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
             (if (== key (aget keys ix))
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
               ;; TODO update ranges (.update-lower this)
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
                     (do
                       (.update-lower! this (if (nil? children) (aget keys 0) (.-lower (aget children 0))))
                       (.update-upper! this (if (nil? children) (aget keys (- (alength keys) 1)) (.-upper (aget children (- (alength children) 1)))))))))))
  (update-lower! [this new-lower]
                 (when-not (== lower new-lower)
                   (set! lower new-lower)
                   (when (and (instance? Node parent) (== parent-ix 0))
                     (.update-lower! parent new-lower))))
  (update-upper! [this new-upper]
                 (when-not (== upper new-upper)
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
            (assert (= (seq keys) (seq (sort-by identity compare-keys keys))))
            (assert (every? #(lte lower %) keys) (pr-str lower keys))
            (assert (every? #(gte upper %) keys) (pr-str upper keys))
            (if (nil? children)
              (do
                (assert (= (count keys) (count vals)) (pr-str keys vals))
                (assert (= lower (aget keys 0)) (pr-str lower keys))
                (assert (= upper (aget keys (- (alength keys) 1))) (pr-str upper keys)))
              (do
                (dotimes [ix (count children)]
                  (assert (= ix (.-parent-ix (aget children ix)))))
                (assert (= (count keys) (count vals) (dec (count children))) (pr-str keys vals children))
                (assert (= lower (.-lower (aget children 0))) (pr-str lower (.-lower (aget children 0))))
                (assert (= upper (.-upper (aget children (- (alength children) 1)))) (pr-str upper (.-upper (aget children (- (alength children) 1)))))
                (assert (every? #(gt-fun (aget keys %) (.-upper (aget children %))) (range (count keys))))
                (assert (every? #(lt-fun (aget keys %) (.-lower (aget children (inc %)))) (range (count keys))))
                (dotimes [i (count children)] (.valid! (aget children i) max-keys))))))
  (pretty-print [this]
                (str "(" parent-ix ")" "|" (pr-str lower) " " (pr-str (vec keys)) " " (pr-str upper) "|")))

;; 'bool' < 'number' < 'string' < 'undefined'
(def least false)
(def greatest js/undefined)

(defn tree [min-keys]
  (let [node (Node. nil nil #js [] #js [] nil greatest least)
        tree (Tree. (* 2 min-keys) node)]
    (set! (.-parent node) tree)
    (set! (.-parent-ix node) 0)
    tree))

(deftype Iterator [max-keys ^:mutable node ^:mutable ix ^:mutable end?]
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
              (set! ix 0)))))
  (seek [this key]
        (loop [moved? false]
          (when (false? end?)
            (let [upper (.-upper node)]
              (if (lt upper key)
                (if (instance? Node (.-parent node))
                  (do
                    (set! ix (.-parent-ix node))
                    (set! node (.-parent node))
                    (recur true))
                  (do
                    (set! end? true)
                    nil))
                (loop [moved? moved?]
                  (set! ix (.seek node key ix))
                  (if (>= ix (alength (.-keys node)))
                    (do
                      (set! node (aget (.-children node) ix))
                      (set! ix 0)
                      (recur true))
                    (if (or (not moved?)
                            (== key (aget (.-keys node) ix))
                            (nil? (.-children node))
                            (let [lower (.-upper (aget (.-children node) ix))]
                              (lt lower key)))
                      nil
                      (do
                        (set! node (aget (.-children node) ix))
                        (set! ix 0)
                        (recur true)))))))))))

(defn iterator [tree]
  (loop [node (.-root tree)]
    (if (nil? (.-children node))
      (if (> (alength (.-keys node)) 0)
        (Iterator. (.-max-keys tree) node -1 false)
        (Iterator. (.-max-keys tree) node -1 true))
      (recur (aget (.-children node) 0)))))

(deftype Intersection [iterators ^:mutable end?]
  Object
  (key [this]
       (when (false? end?)
         (.key (aget iterators 0))))
  (search [this current]
          (when (false? end?)
            (loop [current current]
              (let [max-key (.key (aget iterators (mod (- current 1) (alength iterators))))
                    min-key (.key (aget iterators current))]
                (when-not (== min-key max-key)
                  (.seek (aget iterators current))
                  (if (.-end? (aget iterators current))
                    (set! end? true)
                    (recur (mod (+ current 1) (alength iterators)))))))))
  (next [this]
        (when (false? end?)
          (.next (aget iterators 0))
          (if (.-end? (aget iterators 0))
            (set! end? true)
            (.search (+ current 1)))))
  (seek [this key]
        (when (false? end?)
          (.seek (aget iterators 0) key)
          (if (.-end? (aget iterators 0))
            (set! end? true)
            (.search (+ current 1))))))

(defn intersection [iterators]
  (if (> (alength iterators) 1)
    (if (some #(.-end? %) iterators)
      (Intersection. iterators true)
      (Intersection. (into-array (sort-by #(.key %) compare-keys iterators)) false))
    (aget iterators 0)))

;; TESTS

(def gen-key
  (gen/one-of [gen/int gen/string-ascii]))

(def least-prop
  (prop/for-all [key gen-key]
                (and (lt least key) (lte least key) (gt key least) (gte key least))))

(def greatest-prop
  (prop/for-all [key gen-key]
                (and (gt greatest key) (gte greatest key) (lt key greatest) (lte key greatest))))

(def equality-prop
  (prop/for-all [key-a gen-key
                 key-b gen-key]
                (== (== key-a key-b)
                    (and (lte key-a key-b) (not (lt key-a key-b)))
                    (and (gte key-a key-b) (not (gt key-a key-b))))))

(def reflexive-prop
  (prop/for-all [key gen-key]
                (and (lte key key) (gte key key) (not (lt key key)) (not (gt key key)))))

(def transitive-prop
  (prop/for-all [key-a gen-key
                 key-b gen-key
                 key-c gen-key]
                (and (if (and (lt key-a key-b) (lt key-b key-c)) (lt key-a key-c) true)
                     (if (and (lte key-a key-b) (lte key-b key-c)) (lte key-a key-c) true)
                     (if (and (gt key-a key-b) (gt key-b key-c)) (gt key-a key-c) true)
                     (if (and (gte key-a key-b) (gte key-b key-c)) (gte key-a key-c) true))))

(def anti-symmetric-prop
  (prop/for-all [key-a gen-key
                 key-b gen-key]
                (and (not (and (lt key-a key-b) (lt key-b key-a)))
                     (not (and (gt key-a key-b) (gt key-b key-a))))))

(def total-prop
  (prop/for-all [key-a gen-key
                 key-b gen-key]
                (and (or (lt key-a key-b) (gte key-a key-b))
                     (or (gt key-a key-b) (lte key-a key-b)))))

(def gen-assoc
  (gen/tuple (gen/return :assoc!) gen-key gen-key))

(def gen-dissoc
  (gen/tuple (gen/return :dissoc!) gen-key))

(def gen-action
  (gen/one-of [gen-assoc gen-dissoc]))

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

(defn run-building-prop [min-keys actions]
  (let [tree (apply-to-tree (tree min-keys) actions)
        sorted-map (apply-to-sorted-map (sorted-map-by compare-keys) actions)]
    (and (= (seq (map vec tree)) (seq sorted-map))
         (.valid! tree))))

(defn building-prop [gen]
  (prop/for-all [min-keys gen/s-pos-int
                 actions (gen/vector gen)]
                (run-building-prop min-keys actions)))

(defn run-lookup-prop [min-keys actions action]
  (let [tree (apply-to-tree (tree min-keys) actions)
        sorted-map (apply-to-sorted-map (sorted-map-by compare-keys) actions)
        tree-result (case (nth action 0)
                      :assoc! (.assoc! tree (nth action 1) (nth action 2))
                      :dissoc! (.dissoc! tree (nth action 1)))
        sorted-map-result (contains? sorted-map (nth action 1))]
    (= tree-result sorted-map-result)))

(defn lookup-prop [gen]
  (prop/for-all [min-keys gen/s-pos-int
                 actions (gen/vector gen)
                 action gen]
                (run-lookup-prop min-keys actions action)))

(def gen-next
  (gen/tuple (gen/return :next)))

(def gen-seek
  (gen/tuple (gen/return :seek) gen-key))

(def gen-movement
  (gen/one-of [gen-next gen-seek]))

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
  (let [elems (atom (cons [least nil] elems))]
    (for [movement movements]
      (case (nth movement 0)
        :next (do
                (swap! elems rest)
                (first (first @elems)))
        :seek (do
                (swap! elems (fn [elems] (drop-while #(lt-fun (nth % 0) (nth movement 1)) elems)))
                (first (first @elems)))))))

(defn run-iterator-prop [min-keys actions movements]
  (let [tree (apply-to-tree (tree min-keys) actions)
        sorted-map (apply-to-sorted-map (sorted-map-by compare-keys) actions)
        iterator-results (apply-to-iterator (iterator tree) movements)
        elems-results (apply-to-elems (seq sorted-map) movements)]
    (= iterator-results elems-results)))

(def iterator-prop
  (prop/for-all [min-keys gen/s-pos-int
                 actions (gen/vector gen-action)
                 movements (gen/vector gen-movement)]
                (run-iterator-prop min-keys actions movements)))

(comment
  (dc/quick-check 1000 least-prop)
  (dc/quick-check 1000 greatest-prop)
  (dc/quick-check 1000 equality-prop)
  (dc/quick-check 1000 reflexive-prop)
  (dc/quick-check 1000 transitive-prop)
  (dc/quick-check 1000 anti-symmetric-prop)
  (dc/quick-check 1000 total-prop)
  (dc/quick-check 500 (building-prop gen-assoc))
  (dc/quick-check 500 (building-prop gen-action))
  ;; cljs.core.pr_str(cemerick.double_check.quick_check(1000, aurora.btree.building_prop(aurora.btree.gen_action)))
  (dc/quick-check 500 (lookup-prop gen-action))
  (dc/quick-check 500 iterator-prop)
  ;; cljs.core.pr_str(cemerick.double_check.quick_check(1000, aurora.btree.iterator_prop)


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
