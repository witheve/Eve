(ns aurora.btree
  (:require [cemerick.double-check :as dc]
            [cemerick.double-check.generators :as gen]
            [cemerick.double-check.properties :as prop :include-macros true])
  (:require-macros [aurora.macros :refer [apush apush* lt lte gt gte set!!]]))

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
          (.valid! root max-keys)
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
          (when (lt key lower) (set! lower key))
          (when (gt key upper) (set! upper key))
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
           (prn "remove")
           (.splice keys ix 1)
           (.splice vals ix 1)
           (when-not (nil? children)
             (.splice children (+ ix 1) 1) ;; remove right child
             (loop [jx (+ ix 1)]
               (when (< jx (alength children))
                 (let [child (aget children jx)]
                   (set! (.-parent-ix child) (- (.-parent-ix child) 1)))
                 (recur (+ jx 1)))))
           (when (< (alength keys) min-keys)
             (cond
              (instance? Node parent) (.rotate-left! this min-keys)
              (== (alength keys) 0) (set! (.-root parent) (aget children 0)))))
  (rotate-left! [this min-keys]
                (if (> parent-ix 0)
                  (let [left-node (aget (.-children parent) (- parent-ix 1))
                        left-keys (.-keys left-node)
                        left-vals (.-vals left-node)]
                    (if (> (alength left-keys) min-keys)
                      (do
                        (prn "rotate-left")
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
                         (prn "rotate-right")
                         (.push keys (.shift right-keys))
                         (.push vals (.shift right-vals))
                         (set! upper (aget keys (- (alength keys) 1)))
                         (set! (.-lower right-node) (aget right-keys 0)))
                       (.merge! this min-keys)))
                   (.merge! this min-keys)))
  (merge! [this min-keys]
          (prn "merge")
          (let [separator-ix (if (> parent-ix 0) (- parent-ix 1) parent-ix)
                left-node (aget (.-children parent) separator-ix)
                right-node (aget (.-children parent) (+ separator-ix 1))
                median-key (aget (.-keys parent) separator-ix)
                median-val (aget (.-vals parent) separator-ix)]
            (apush (.-keys left-node) median-key)
            (apush (.-vals left-node) median-val)
            (apush* (.-keys left-node) (.-keys right-node))
            (apush* (.-vals left-node) (.-vals right-node))
            (when-not (nil? children)
              (apush* (.-children left-node) (.-children right-node)))
            (set! (.-upper left-node) (.-upper right-node))
            (.remove! parent separator-ix min-keys)))
  (update-ranges! [this new-lower new-upper]
                  ;; TODO this is wrong
                  (when (lt new-lower lower) (set! lower new-lower))
                  (when (gt new-upper upper) (set! upper new-upper))
                  (if (and parent
                           (or (== lower new-lower) (== upper new-upper)))
                    (update-ranges! parent new-lower new-upper)))
  (valid! [this max-keys]
          (let [min-keys (js/Math.floor (/ max-keys 2))]
            (when (instance? Node parent) ;; root is allowed to have less keys
              (assert (>= (count keys) min-keys) (pr-str keys min-keys)))
            (assert (<= (count keys) max-keys) (pr-str keys max-keys))
            (assert (= (count keys) (count (set keys))))
            (assert (= (seq keys) (seq (sort-by identity #(cond (== %1 %2) 0 (lt %1 %2) -1 (gt %1 %2) 1) keys))))
            #_(assert (every? #(lte lower %) keys) (pr-str lower keys))
            #_(assert (every? #(gte upper %) keys) (pr-str upper keys))
            (if (nil? children)
              (do
                (assert (= (count keys) (count vals)) (pr-str keys vals))
                #_(assert (= lower (aget keys 0)) (pr-str lower keys))
                #_(assert (= upper (aget keys (- (alength keys) 1))) (pr-str upper keys)))
              (do
                (assert (= (count keys) (count vals) (dec (count children))) (pr-str keys vals children))
                #_(assert (= lower (.-lower (aget children 0))) (pr-str lower (.-lower (aget children 0))))
                #_(assert (= upper (.-upper (aget children (- (alength children) 1)))) (pr-str upper (.-upper (aget children (- (alength children) 1)))))
                #_(assert (every? #((fn [a b] (gt a b)) (aget keys %) (.-upper (aget children %))) (range (count keys))))
                #_(assert (every? #((fn [a b] (lt a b)) (aget keys %) (.-lower (aget children (inc %)))) (range (count keys))))
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

;; TESTS

(def gen-key
  (gen/one-of [gen/int gen/string-ascii]))

(def gen-assoc
  (gen/tuple (gen/return :assoc!) gen-key gen/any-printable))

(def gen-dissoc
  (gen/tuple (gen/return :dissoc!) gen-key))

(def gen-action
  (gen/one-of [gen-assoc gen-dissoc]))

(defn apply-to-tree [tree actions]
  (doseq [action actions]
    (case (nth action 0)
      :assoc! (.assoc! tree (nth action 1) (nth action 2))
      :dissoc! (.dissoc! tree (nth action 1))))
  tree)

(defn apply-to-sorted-map [map actions]
  (reduce
   (fn [map action]
     (case (nth action 0)
       :assoc! (assoc map (nth action 1) (nth action 2))
       :dissoc! (dissoc map (nth action 1))))
   map actions))

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

(defn run-the-prop [min-keys actions]
  (let [tree (apply-to-tree (tree min-keys) actions)
        sorted-map (apply-to-sorted-map (sorted-map-by #(cond (== %1 %2) 0 (lt %1 %2) -1 (gt %1 %2) 1)) actions)]
    (and (= (seq (map vec tree)) (seq sorted-map))
         (or (empty? tree) (.valid! tree)))))

(defn the-prop [gen]
  (prop/for-all [min-keys gen/s-pos-int
                 actions (gen/vector gen)]
                (run-the-prop min-keys actions)))

(apply run-the-prop [1 [[:assoc! 19 0] [:assoc! "" 0] [:assoc! 0 0] [:assoc! 19 0]]])

;; TODO iterator tests

(comment
  (do
    (dc/quick-check 1000 least-prop)
    (dc/quick-check 1000 greatest-prop)
    (dc/quick-check 1000 equality-prop)
    (dc/quick-check 1000 reflexive-prop)
    (dc/quick-check 1000 transitive-prop)
    (dc/quick-check 1000 anti-symmetric-prop)
    (dc/quick-check 1000 total-prop)
    (dc/quick-check 100 (the-prop gen-assoc))
    (dc/quick-check 100 (the-prop gen-action)))
 )

