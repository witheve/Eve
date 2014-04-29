(ns aurora.btree
  (:require-macros [aurora.macros :refer [apush]]))

(deftype Tree [min-child-nodes max-child-nodes child-node])

(deftype Branch [parent-node parent-ix keys vals child-nodes])

(deftype Leaf [parent-node parent-ix keys vals])

(deftype Iterator [^:mutable child-node ^:mutable ix]
  Object
  (next [this]
        (if (< ix (alength (.-keys child-node)))
          (let [result #js [(aget (.-keys child-node) ix) (aget (.-vals child-node) ix)]]
            (if-let [new-child-node (and (.-child-nodes child-node) (aget (.-child-nodes child-node) ix))]
              ;; jump into child
              (do
                (set! child-node new-child-node)
                (set! ix 0))
              ;; move along
              (set! ix (+ ix 1)))
            result)
          (if-let [parent-node (.-parent-node child-node)]
            ;; jump into parent and start again
            (do
              (set! ix (+ (.-parent-ix child-node) 1))
              (set! child-node parent-node)
              (recur))
            ;; end of tree
            nil))))

(defn iterator [tree]
  (Iterator. (.-child-node tree) 0))

(defn tree [min-child-node max-child-nodes]
  (Tree. min-child-nodes max-child-nodes (Branch. nil nil #js [] #js [] #js[])))

(comment
  (let [tree (Tree. min-child-nodes max-child-nodes (Branch. nil nil #js [] #js [] #js[]))
        iterator (iterator tree)]
    (take-while identity (repeatedly #(.next iterator))))

  (let [tree (Tree. min-child-nodes max-child-nodes (Branch. nil nil #js [:a :b :c] #js [0 1 2] #js[]))
        iterator (iterator tree)]
    (take-while identity (repeatedly #(.next iterator))))

  (let [branch (Branch. nil nil #js [:a :d :e] #js [0 3 4] #js[])
        _ (apush (.-child-nodes branch) (Leaf. branch 0 #js [:b :c] #js [1 2]))
        tree (Tree. min-child-nodes max-child-nodes branch)
        iterator (iterator tree)]
    (take-while identity (repeatedly #(.next iterator))))

  )
