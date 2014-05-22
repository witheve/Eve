(ns aurora.language
  (:require [aurora.btree :as btree])
  (:require-macros [aurora.macros :refer [apush set!!]]))

(defn keymap [from-fields to-fields]
  (let [keymap (make-array (alength to-fields))]
    (dotimes [i (alength from-fields)]
      (dotimes [j (alength to-fields)]
        (when (= (aget from-fields i) (aget to-fields j))
          (aset keymap j i))))
    (dotimes [j (alength keymap)]
      (assert (not (nil? (aget keymap j))))) ;; ie every to-field is in from-fields somewhere
    keymap))

(defn with-keymap [keymap key]
  (assert (== (alength keymap) (alength key)))
  (let [new-key (make-array (alength key))]
    (dotimes [i (alength keymap)]
      (aset new-key i (aget key (aget keymap i))))
    new-key))

(defn -add-facts [from-array from-fields to-index to-fields]
  (let [changed? false
        keymap (keymap from-fields to-fields)]
    (dotimes [i (alength from-array)]
      (when-not (.assoc! to-index (with-keymap keymap (aget from-array i)) nil)
        (set!! changed? true)))
    changed?))

(deftype Knowledge [^:mutable kind->name->fields->index ^:mutable version]
  Object
  (get-or-create-index [this kind name fields]
                       (assert (or (= kind "know") (= kind "remember") (= kind "forget")) (pr-str kind))
                       (or (get-in kind->name->fields->index [kind name (vec fields)])
                           (let [index (btree/tree 10 (alength fields))]
                             (when-let [[other-fields other-index] (first (get-in kind->name->fields->index [kind name]))]
                               (-add-facts (btree/iterator->keys (btree/iterator other-index)) (into-array other-fields) index fields))
                             (set! kind->name->fields->index (assoc-in kind->name->fields->index [kind name (vec fields)] index))
                             index)))
  (add-facts [this kind name fields facts]
             (assert (or (= kind "know") (= kind "remember") (= kind "forget")) (pr-str kind))
             (let [changed? false
                   indexes (get-in kind->name->fields->index [kind name])]
               (assert (seq indexes))
               (doseq [[other-fields other-index] indexes]
                 (when (-add-facts facts fields other-index (into-array other-fields))
                   (set!! changed? true)))
               (when changed?
                 (set! version (+ version 1)))))
  (tick [this])
  (tock [this]))

(defn knowledge []
  (Knowledge. {} 0))


(comment

  (def kn (knowledge))

  (.get-or-create-index kn "know" "heights" #js ["name" "height"])

  (.add-facts kn "know" "heights" #js ["name" "height"] #js [#js ["chris" "short"] #js ["rob" "spade hands"]])

  (.get-or-create-index kn "know" "heights" #js ["name" "height"])

  (.get-or-create-index kn "know" "heights" #js ["height" "name"])

  (.-kind->name->fields->index kn)

  (.add-facts kn "know" "heights" #js ["name" "height"] #js [#js ["jamie" "just right"]])

  (.get-or-create-index kn "know" "heights" #js ["name" "height"])

  (.get-or-create-index kn "know" "heights" #js ["height" "name"])

  )
