(ns aurora.language
  (:require [aurora.btree :as btree]
            [aurora.join :as join])
  (:require-macros [aurora.macros :refer [apush set!!]]))

;; KNOWLEDGE

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
  (let [new-key (make-array (alength keymap))]
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

;; FLOWS

(deftype MagicIterator [kind name fields index vars]
  Object
  (iter [this]
        (join/magic-iterator index vars)))

(defn magic-iterator [kn kind name fields vars]
  (let [index (.get-or-create-index kn kind name fields)]
    (MagicIterator. kind name fields index vars)))

(deftype Join [input-iterables output-kinds output-names output-fields]
  Object
  (run [this kn]
       (let [input-iters (amap input-iterables i _ (.iter (aget input-iterables i)))
             join-iter (join/join-iterator input-iters)
             facts (btree/iterator->keys join-iter)]
         (dotimes [i (alength output-kinds)]
           (.add-facts kn (aget output-kinds i) (aget output-names i) (aget output-fields i) facts)))))

(deftype Chain [flows]
  Object
  (run [this kn]
       (dotimes [i (alength flows)]
         (.run (aget flows i) kn))))

(deftype Fixpoint [flow]
  Object
  (run [this kn]
       (loop [old-version (.-version kn)]
         (.run flow kn)
         (let [new-version (.-version kn)]
           (when (not (== old-version new-version))
             (recur new-version))))))

;; COMPILER

(let [next (atom 0)]
   (defn new-id []
     (if js/window.uuid
       (.replace (js/uuid) (js/RegExp. "-" "gi") "_")
       (str "id-" (swap! next inc)))))


;; NOTE can't handle missing keys yet - requires a schema
(defn compile [kn]
  (let [clauses (btree/iterator->keys (btree/iterator (.get-or-create-index kn "know" "clauses" ["rule-id" "when|pretend|remember|forget" "clause-id" "name"])))
        fields (btree/iterator->keys (btree/iterator (.get-or-create-index kn "know" "clause-fields" ["clause-id" "constant|variable" "key" "val"])))
        rule-id->clauses (atom (into {} (for [[k vs] (group-by #(nth % 0) clauses)] [k (set (map vec vs))])))
        clause-id->fields (atom (into {} (for [[k vs] (group-by #(nth % 0) fields)] [k (set (map vec vs))])))]

    ;; rewrite clauses
    (doseq [[rule-id clauses] @rule-id->clauses]
      (doseq [[_ clause-type clause-id name] clauses]
        (let [fields (get @clause-id->fields clause-id)
              var->key (atom {})]
          (doseq [[_ field-type key val] fields]
            (if (= field-type "constant")
              ;; rewrite (foo 1) to (foo x) (constant= x 1)
              (let [new-var (new-id)
                    new-clause-id (new-id)]
                (swap! clause-id->fields update-in [clause-id] disj [clause-id "constant" key val])
                (swap! clause-id->fields update-in [clause-id] conj [clause-id "variable" key new-var])
                (swap! clause-id->fields assoc new-clause-id #{[new-clause-id "variable" "variable" new-var]
                                                               [new-clause-id "constant" "constant" val]})
                (swap! rule-id->clauses update-in [rule-id] conj [rule-id "when" new-clause-id "=constant"]))
              (if (get @var->key val)
                ;; rewrite (foo x x) to (foo x y) (variable= x y)
                (let [new-var (new-id)
                      new-clause-id (new-id)]
                  (swap! clause-id->fields update-in [clause-id] disj [clause-id "variable" key val])
                  (swap! clause-id->fields update-in [clause-id] conj [clause-id "variable" key new-var])
                  (swap! clause-id->fields assoc new-clause-id #{[new-clause-id "variable-a" "variable" new-var]
                                                                 [new-clause-id "variable-b" "variable" val]})
                  (swap! rule-id->clauses update-in [rule-id] conj [rule-id "when" new-clause-id "=variable"]))
                (swap! var->key assoc val key)))))))

    (for [[rule-id clauses] @rule-id->clauses]
      (let [vars (atom #{})]

        ;; collect vars
        (doseq [[_ _ clause-id _] clauses
                (get @clause-id->fields clause-id)]
          (let [fields (get @clause-id->fields clause-id)]
            (doseq [[_ field-type key val] fields]
              (when (= field-type "variable")
                (swap! vars conj val)))))

        ;; make ruleset
        (let [var->ix (zipmap @vars (range))
              num-vars (count @vars)
              iters (for [[_ clause-type clause-id name] clauses
                          :when (= clause-type "when")]
                      (let [fields (get @clause-id->fields clause-id)]
                        (case name
                          "=constant" (let [variable (first (for [[_ field-type key val] fields
                                                                  :when (= key "variable")]
                                                              val))
                                            constant (first (for [[_ field-type key val] fields
                                                                  :when (= key "constant")]
                                                              val))
                                            ix (get var->ix variable)]
                                        (join/constant-filter num-vars ix constant))
                          "=variable" (let [variable-a (first (for [[_ field-type key val] fields
                                                                    :when (= key "variable-a")]
                                                                val))
                                            variable-b (first (for [[_ field-type key val] fields
                                                                    :when (= key "variable-b")]
                                                                val))
                                            ix-a (get var->ix variable-a)
                                            ix-b (get var->ix variable-b)]
                                        (join/variable-filter num-vars ix-a ix-b))
                          (let [clause-vars (for [[_ field-type key val] fields]
                                              val)
                                clause-vars (sort-by var->ix clause-vars)
                                clause-vars->ix (zipmap clause-vars (range))
                                var-map (map clause-vars->ix @vars)
                                clause-keys (for [[_ field-type key val] fields]
                                              key)
                                index (.get-or-create-index kn "know" name clause-keys)]
                            (join/magic-iterator index (into-array var-map))))))
              join-iter (join/join-iterator (into-array iterators))]

          ;; TODO outputs, ruleset
          )
    ))

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

  (.get-or-create-index kn "know" "edge" #js ["x" "y"])

  (.get-or-create-index kn "know" "connected" #js ["x" "y"])

  (.add-facts kn "know" "edge" #js ["x" "y"] #js [#js ["a" "b"] #js ["b" "c"] #js ["c" "d"] #js ["d" "b"]])

  (def edge-flow
    (Join. #js [(magic-iterator kn "know" "edge" #js ["x" "y"] #js [0 1])]
           #js ["know"] #js ["connected"] #js [#js ["x" "y"]]))

  (def connected-flow
    (Join. #js [(magic-iterator kn "know" "edge" #js ["x" "y"] #js [0 1 nil])
                (magic-iterator kn "know" "connected" #js ["x" "y"] #js [nil 0 1])]
           #js ["know"] #js ["connected"] #js [#js ["x" nil "y"]]))

  (def transitive-flow
    (Chain. #js [edge-flow (Fixpoint. connected-flow)]))

  (.run transitive-flow kn)

  (.get-or-create-index kn "know" "connected" #js ["x" "y"])
  )
