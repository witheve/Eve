(ns aurora.language
  (:require [aurora.btree :as btree])
  (:require-macros [aurora.macros :refer [apush set!!]]))

;; FLOWS

(deftype Flow [solver output-kinds output-names output-fields]
  Object
  (run [this kn]
       (.reset solver)
       (let [facts (.keys solver)]
         (dotimes [i (alength output-kinds)]
           (.add-facts kn (aget output-kinds i) (aget output-names i) (aget output-fields i) facts)))))

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
                               (-add-facts (.keys other-index) (into-array other-fields) index fields))
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
  ;; TODO Knowledge.tick using array of flows, needs dirty tracking per flow (requires map from index to flow)
  (tock [this]))

(defn knowledge []
  (Knowledge. {} 0))

;; COMPILER

(let [next (atom 0)]
  (defn new-id []
    (if js/window.uuid
      (.replace (js/uuid) (js/RegExp. "-" "gi") "_")
      (str "id-" (swap! next inc)))))

;; NOTE can't handle missing keys yet - requires a schema
(defn compile [kn]
  (let [clauses (.keys (.get-or-create-index kn "know" "clauses" #js ["rule-id" "when|know|remember|forget" "clause-id" "name"]))
        fields (.keys (.get-or-create-index kn "know" "clause-fields" #js ["clause-id" "constant|variable" "key" "val"]))
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
        (doseq [[_ _ clause-id _] clauses]
          (let [fields (get @clause-id->fields clause-id)]
            (doseq [[_ field-type key val] fields]
              (when (= field-type "variable")
                (swap! vars conj val)))))

        (let [var->ix (zipmap @vars (range))
              num-vars (count @vars)

              ;; order clause vars


              ;; make inputs
              constraints&ixes (for [[_ clause-type clause-id name] clauses
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
                                                   [(btree/constant constant) #js [ix]])
                                     "=variable" (let [variable-a (first (for [[_ field-type key val] fields
                                                                               :when (= key "variable-a")]
                                                                           val))
                                                       variable-b (first (for [[_ field-type key val] fields
                                                                               :when (= key "variable-b")]
                                                                           val))
                                                       ix-a (get var->ix variable-a)
                                                       ix-b (get var->ix variable-b)]
                                                   [(btree/equal) #js [ix-a ix-b]])
                                     (let [clause-vars&keys (sort-by (fn [[val key]] (var->ix val))
                                                                     (for [[_ field-type key val] fields]
                                                                       [val key]))
                                           clause-vars (map first clause-vars&keys)
                                           clause-vars-ixes (map var->ix clause-vars)
                                           clause-keys (map second clause-vars&keys)
                                           index (.get-or-create-index kn "know" name (into-array clause-keys))]
                                       [(btree/contains (btree/iterator index)) (into-array clause-vars-ixes)]))))

              ;; make solver
              solver (btree/solver num-vars (into-array (map first constraints&ixes)) (into-array (map second constraints&ixes)))

              ;; make output specs
              output-kinds (into-array
                            (for [[_ clause-type clause-id name] clauses
                                  :when (not= clause-type "when")]
                              clause-type))
              output-names (into-array
                            (for [[_ clause-type clause-id name] clauses
                                  :when (not= clause-type "when")]
                              name))
              output-fields (into-array
                             (for [[_ clause-type clause-id name] clauses
                                   :when (not= clause-type "when")]
                               (let [clause-fields (get @clause-id->fields clause-id)
                                     output-fields (make-array num-vars)]
                                 (doseq [[_ field-type key val] clause-fields]
                                   (assert (= field-type "variable"))
                                   (aset output-fields (var->ix val) key))
                                 output-fields)))]

          ;; ensure at least one index per output
          (dotimes [i (alength output-kinds)]
            (.get-or-create-index kn (aget output-kinds i) (aget output-names i) (filter #(not (nil? %)) (aget output-fields i))))

          (Flow. solver output-kinds output-names output-fields))))

;; TESTS

(def kn (knowledge))

(.get-or-create-index kn "know" "edge" #js ["x" "y"])

(.get-or-create-index kn "know" "connected" #js ["x" "y"])

(.add-facts kn "know" "edge" #js ["x" "y"] #js [#js ["a" "b"] #js ["b" "c"] #js ["c" "d"] #js ["d" "b"]])

(.get-or-create-index kn "know" "clauses" #js ["rule-id" "when|know|remember|forget" "clause-id" "name"])

(.get-or-create-index kn "know" "clause-fields" #js ["clause-id" "constant|variable" "key" "val"])

(.add-facts kn "know" "clauses" #js ["rule-id" "when|know|remember|forget" "clause-id" "name"] #js [#js ["single-edge" "when" "get-edges" "edge"]
                                                                                                    #js ["single-edge" "know" "output-connected" "connected"]])

(.add-facts kn "know" "clause-fields" #js ["clause-id" "constant|variable" "key" "val"] #js [#js ["get-edges" "variable" "x" "xx"]
                                                                                             #js ["get-edges" "variable" "y" "yy"]
                                                                                             #js ["output-connected" "variable" "x" "xx"]
                                                                                             #js ["output-connected" "variable" "y" "yy"]])

(.add-facts kn "know" "clauses" #js ["rule-id" "when|know|remember|forget" "clause-id" "name"] #js [#js ["transitive-edge" "when" "get-left-edge" "edge"]
                                                                                                    #js ["transitive-edge" "when" "get-right-connected" "connected"]
                                                                                                    #js ["transitive-edge" "know" "output-transitive-connected" "connected"]])

(.add-facts kn "know" "clause-fields" #js ["clause-id" "constant|variable" "key" "val"] #js [#js ["get-left-edge" "variable" "x" "xx"]
                                                                                             #js ["get-left-edge" "variable" "y" "yy"]
                                                                                             #js ["get-right-connected" "variable" "x" "yy"]
                                                                                             #js ["get-right-connected" "variable" "y" "zz"]
                                                                                             #js ["output-transitive-connected" "variable" "x" "xx"]
                                                                                             #js ["output-transitive-connected" "variable" "y" "zz"]])

(compile kn)

(.run (first (compile kn)) kn)

(.get-or-create-index kn "know" "connected" #js ["x" "y"])

(def f2 (second (compile kn)))

(.run f2 kn)

(.get-or-create-index kn "know" "connected" #js ["x" "y"])

(.run f2 kn)

(.get-or-create-index kn "know" "connected" #js ["x" "y"])

(.run f2 kn)

(.get-or-create-index kn "know" "connected" #js ["x" "y"])

