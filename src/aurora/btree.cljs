(ns aurora.btree
  (:require-macros [aurora.macros :refer [apush]]))

;; NOTE iterators are not write-safe

(deftype Tree [max-keys ^:mutable root]
  Object
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
  (seek [this key ix]
        (let [len (alength keys)]
          (loop [ix ix]
            (if (and (< ix len) (> key (aget keys ix)))
              (recur (+ ix 1))
              ix))))
  (assoc! [this key val max-keys]
          (let [ix (.seek this key 0)]
            (if (nil? children)
              (if (= key (aget keys ix))
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
            (assert (= (alength keys) (alength vals) (if children (dec (alength children)) (alength keys))))
            (assert (= (alength (.-keys right-node)) (alength (.-vals right-node)) (if (.-children right-node) (dec (alength (.-children right-node))) (alength (.-keys right-node))))))))

(deftype Iterator [max-keys ^:mutable node ^:mutable ix]
  Object
  (next [this]
        (if (< ix (alength (.-keys node)))
          (let [result #js [(aget (.-keys node) ix) (aget (.-vals node) ix)]]
            (if-let [child (and (.-children node) (aget (.-children node) ix))]
              (do
                (set! node child)
                (set! ix 0))
              (set! ix (+ ix 1)))
            result)
          (let [parent (.-parent node)]
            (if (instance? Node parent)
              ;; jump into parent and start again
              (do
                (set! ix (+ (.-parent-ix node) 1))
                (set! node parent)
                (recur))
              ;; end of tree
              nil))))
  (seek [this key] ;; move the iterator forwards until it reaches a key greater than this one
        ;; head across and upwards until we reach a greater key
        (loop []
          (if (< ix (alength (.-keys node)))
            (if (<= key (aget (.-keys node) ix))
              ;; done
              nil
              ;; move along
              (do
                (set! ix (+ ix 1))
                (recur)))
            (let [parent (.-parent node)]
              (if (instance? Node parent)
                ;; jump into parent and start again
                (do
                  (set! ix (+ (.-parent-ix node) 1))
                  (set! node parent)
                  (recur))
                ;; end of tree
                nil))))
        ;; head downwards and across until we reach the least greater key
        (loop []
          (if (< ix (alength (.-keys node)))
            (if (<= key (aget (.-keys node) ix))
              ;; check for a child
              (if-let [child (and (.-children node) (> ix 0) (aget (.-children node) (- ix 1)))]
                ;; jump into child and start again (child cannot be empty if tree is correctly balanced)
                (do
                  (set! node child)
                  (set! ix 0)
                  (recur))
                ;; done
                nil)
              ;; move along
              (do
                (set! ix (+ ix 1))
                (recur)))
            ;; end of tree
            nil))
        (if (< ix (alength (.-keys node)))
          #js [(aget (.-keys node) ix) (aget (.-vals node) ix)]
          nil)))

(defn iterator [tree]
  (Iterator. (.-max-keys tree) (.-root tree) 0))

(defn tree [min-keys]
  (let [node (Node. nil nil #js [] #js [] nil)
        tree (Tree. (* 2 min-keys) node)]
    (set! (.-parent node) tree)
    (set! (.-parent-ix node) 0)
    tree))

(comment
  (let [tree (tree 1)]
    (seq tree))

  (let [tree (tree 1)]
    (.assoc! tree :a 0)
    (seq tree))

  (let [tree (tree 1)]
    (.assoc! tree :a 0)
    (.assoc! tree :b 1)
    (js/console.log tree)
    (seq tree))

  (let [tree (tree 1)]
    (.assoc! tree :a 0)
    (.assoc! tree :b 1)
    (.assoc! tree :c 1)
    (js/console.log tree)
    (seq tree))

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
    (seq tree))

  (let [tree (Tree. max-keys (Node. nil nil #js [] #js [] #js[]))
        iterator (iterator tree)]
    (take-while identity (repeatedly #(.next iterator))))

  (let [tree (Tree. max-keys (Node. nil nil #js [:a :b :c] #js [0 1 2] #js[]))
        iterator (iterator tree)]
    (take-while identity (repeatedly #(.next iterator))))

  (let [branch (Node. nil nil #js [:a :d :e] #js [0 3 4] #js[])
        _ (apush (.-children branch) (Node. branch 0 #js [:b :c] #js [1 2]))
        tree (Tree. max-keys branch)
        iterator (iterator tree)]
    (take-while identity (repeatedly #(.next iterator))))

  (let [branch (Node. nil nil #js [:a :d :f] #js [0 3 4] #js[])
        _ (apush (.-children branch) (Node. branch 0 #js [:b :c] #js [1 2]))
        tree (Tree. max-keys branch)
        iterator (iterator tree)]
    [(.seek iterator :0) (.seek iterator :c) (.seek iterator :a) (.seek iterator :e) (.seek iterator :e) (.seek iterator :p)])

  )
