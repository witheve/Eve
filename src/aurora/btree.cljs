(ns aurora.btree
  (:require-macros [aurora.macros :refer [apush]]))

(deftype Tree [min-children max-children root])

(deftype Node [parent parent-ix keys vals children])

(deftype Iterator [^:mutable node ^:mutable ix]
  Object
  (next [this]
        (if (< ix (alength (.-keys node)))
          (let [result #js [(aget (.-keys node) ix) (aget (.-vals node) ix)]]
            ;; check for a child
            (if-let [child (and (.-children node) (aget (.-children node) ix))]
              ;; jump into child
              (do
                (set! node child)
                (set! ix 0))
              ;; move along
              (set! ix (+ ix 1)))
            result)
          (if-let [parent (.-parent node)]
            ;; jump into parent and start again
            (do
              (set! ix (+ (.-parent-ix node) 1))
              (set! node parent)
              (recur))
            ;; end of tree
            nil)))
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
            (if-let [parent (.-parent node)]
              ;; jump into parent and start again
              (do
                (set! ix (+ (.-parent-ix node) 1))
                (set! node parent)
                (recur))
              ;; end of tree
              nil)))
        ;; head downwards and across until we reach the least greater key
        (loop []
          (if (< ix (alength (.-keys node)))
            (if (<= key (aget (.-keys node) ix))
              ;; check for a child
              (if-let [child (and (.-children node) (> ix 0) (aget (.-children node) (- ix 1)))]
                ;; jump in child and start again (assumes child cannot be empty)
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
  (Iterator. (.-root tree) 0))

(defn tree [min-child max-children]
  (Tree. min-children max-children (Node. nil nil #js [] #js [] #js[])))

(comment
  (let [tree (Tree. min-children max-children (Node. nil nil #js [] #js [] #js[]))
        iterator (iterator tree)]
    (take-while identity (repeatedly #(.next iterator))))

  (let [tree (Tree. min-children max-children (Node. nil nil #js [:a :b :c] #js [0 1 2] #js[]))
        iterator (iterator tree)]
    (take-while identity (repeatedly #(.next iterator))))

  (let [branch (Node. nil nil #js [:a :d :e] #js [0 3 4] #js[])
        _ (apush (.-children branch) (Node. branch 0 #js [:b :c] #js [1 2]))
        tree (Tree. min-children max-children branch)
        iterator (iterator tree)]
    (take-while identity (repeatedly #(.next iterator))))

  (let [branch (Node. nil nil #js [:a :d :f] #js [0 3 4] #js[])
        _ (apush (.-children branch) (Node. branch 0 #js [:b :c] #js [1 2]))
        tree (Tree. min-children max-children branch)
        iterator (iterator tree)]
    [(.seek iterator :c) (.seek iterator :a) (.seek iterator :e) (.seek iterator :e) (.seek iterator :p)])

  )
