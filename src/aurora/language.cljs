(ns aurora.language
  (:require [aurora.btree :as btree])
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
      (when (false? (.assoc! to-index (with-keymap keymap (aget from-array i)) nil))
        (set!! changed? true)))
    changed?))

(defn -del-facts [from-array from-fields to-index to-fields]
  (let [changed? false
        keymap (keymap from-fields to-fields)]
    (dotimes [i (alength from-array)]
      (when (true? (.dissoc! to-index (with-keymap keymap (aget from-array i))))
        (set!! changed? true)))
    changed?))

(deftype Knowledge [^:mutable kind->name->fields->index]
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
               (assert (seq indexes) (pr-str kind name))
               (doseq [[other-fields other-index] indexes]
                 (when (-add-facts facts fields other-index (into-array other-fields))
                   (set!! changed? true)))
               changed?))
  (del-facts [this kind name fields facts]
             (assert (or (= kind "know") (= kind "remember") (= kind "forget")) (pr-str kind))
             (let [changed? false
                   indexes (get-in kind->name->fields->index [kind name])]
               (assert (seq indexes) (pr-str kind name))
               (doseq [[other-fields other-index] indexes]
                 (when (-del-facts facts fields other-index (into-array other-fields))
                   (set!! changed? true)))
               changed?))
  (clear-facts [this name]
               (doseq [[_ index] (get-in kind->name->fields->index ["know" name])]
                 (.reset index)))
  (update-facts [this name]
                (let [[fields remember-index] (first (get-in kind->name->fields->index ["remember" name]))]
                  (assert (not (nil? fields)) name)
                  (let [fields (into-array fields)
                        forget-index (.get-or-create-index this "forget" name fields)
                        remember-iter (btree/iterator remember-index)
                        forget-iter (btree/iterator forget-index)
                        remembers #js []
                        forgets #js []]
                    (.foreach remember-index
                              (fn [key]
                                (let [forget (.seek-gte forget-iter key)]
                                  (when (or (nil? forget) (btree/key-not= key forget))
                                    (.push remembers key)))))
                    (.foreach forget-index
                              (fn [key]
                                (let [remember (.seek-gte remember-iter key)]
                                  (when (or (nil? remember) (btree/key-not= key remember))
                                    (.push forgets key)))))
                    (.add-facts this "know" name fields remembers)
                    (.del-facts this "know" name fields forgets))))
  (tick [this name->transient?]
        (let [names (js/Object.keys name->transient?)]
          (dotimes [i (alength names)]
            (let [name (aget names i)]
              (if (true? (aget name->transient? name))
                (.clear-facts kn name)
                (.update-facts kn name)))))))

(defn knowledge []
  (Knowledge. {}))

;; FLOWS

(deftype Flow [solver output-kinds output-names output-fields]
  Object
  (run [this kn rule->dirty? kind->name->rules]
       (.reset solver)
       (let [facts (.keys solver)]
         (dotimes [i (alength output-kinds)]
           (let [kind (aget output-kinds i)
                 name (aget output-names i)
                 fields (aget output-fields i)]
             (when (true? (.add-facts kn kind name fields facts))
               (let [dirtied-rules (aget kind->name->rules kind name)]
                 (dotimes [j (alength dirtied-rules)]
                   (aset rule->dirty? (aget dirtied-rules i) true)))))))))

(deftype Flows [rules rule->flow rule->dirty? kind->name->rules name->transient?]
  Object
  (run [this kn]
       ;; assume everything is dirty at the start
       (dotimes [i (alength rules)]
         (aset rule->dirty? (aget rules i) true))

       (loop [i 0]
         (when (< i (alength rules))
           (let [rule (aget rules i)]
             (if (true? (aget rule->dirty? rule))
               (do
                 (aset rule->dirty? rule false)
                 (.run (aget rule->flow rule) kn rule->dirty? kind->name->rules)
                 (recur 0))
               (recur (+ i 1)))))))
  (tick [this kn]
        (.tick kn name->transient?)))

;; COMPILER

(let [next (atom 0)]
  (defn new-id []
    (if js/window.uuid
      (.replace (js/uuid) (js/RegExp. "-" "gi") "_")
      (str "id-" (swap! next inc)))))

;; NOTE can't handle missing keys yet - requires a schema
(defn compile [kn]
  (let [rule->flow (atom {})
        kind->name->rules (atom {})
        name->transient? (atom {})
        clauses (.keys (.get-or-create-index kn "know" "clauses" #js ["rule-id" "when|know|remember|forget" "clause-id" "name"]))
        fields (.keys (.get-or-create-index kn "know" "clause-fields" #js ["clause-id" "constant|variable" "key" "val"]))
        rule-id->clauses (atom (into {} (for [[k vs] (group-by #(nth % 0) clauses)] [k (set (map vec vs))])))
        clause-id->fields (atom (into {} (for [[k vs] (group-by #(nth % 0) fields)] [k (set (map vec vs))])))]

    ;; rewrite clauses
    (doseq [[rule-id clauses] @rule-id->clauses]
      (doseq [[_ clause-type clause-id name] clauses
              :when (not (#{"=constant" "=variable" "=function"} name))]
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

    (doseq [[rule-id clauses] @rule-id->clauses]
      (let [vars (atom #{})]

        ;; collect vars
        (doseq [[_ _ clause-id _] clauses]
          (let [fields (get @clause-id->fields clause-id)]
            (doseq [[_ field-type key val] fields]
              (when (= field-type "variable")
                (swap! vars conj val)))))

        (let [var->ix (zipmap @vars (range))
              num-vars (count @vars)

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
                                     "=function" (let [variable (first (for [[_ field-type key val] fields
                                                                             :when (= key "variable")]
                                                                         val))
                                                       js (first (for [[_ field-type key val] fields
                                                                       :when (= key "js")]
                                                                   val))
                                                       ix (get var->ix variable)
                                                       args (for [var @vars
                                                                  :when (>= (.indexOf js var) 0)]
                                                              var)
                                                       arg-ixes (map var->ix args)
                                                       fun (apply js/Function (conj (vec args) (str "return (" js ");")))]
                                                   [(btree/function fun) (into-array (conj (vec arg-ixes) ix))])
                                     (let [clause-vars&keys (sort-by (fn [[val key]] (var->ix val))
                                                                     (for [[_ field-type key val] fields]
                                                                       [val key]))
                                           clause-vars (map first clause-vars&keys)
                                           clause-vars-ixes (map var->ix clause-vars)
                                           clause-keys (map second clause-vars&keys)
                                           index (.get-or-create-index kn "know" name (into-array clause-keys))]
                                       (swap! kind->name->rules update-in ["know" name] #(conj (or % #{}) rule-id))
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
                                   (assert (= field-type "variable") [rule-id clause-id clause-fields])
                                   (aset output-fields (var->ix val) key))
                                 output-fields)))]

          ;; set up state for outputs
          (dotimes [i (alength output-kinds)]
            (let [kind (aget output-kinds i)
                  name (aget output-names i)
                  fields (aget output-fields i)
                  transient? (identical? kind "know")]
              ;; TODO get transient? from schema instead
              (assert (not= (not transient?) (get @name->transient? name)) name)
              (swap! name->transient? assoc name transient?)
              (swap! kind->name->rules update-in [kind name] #(or % #{}))
              (.get-or-create-index kn "know" name (into-array (filter #(not (nil? %)) (aget output-fields i))))
              (when (false? transient?)
                (.get-or-create-index kn "forget" name (into-array (filter #(not (nil? %)) (aget output-fields i))))
                (.get-or-create-index kn "remember" name (into-array (filter #(not (nil? %)) (aget output-fields i)))))))

          (swap! rule->flow assoc rule-id (Flow. solver output-kinds output-names output-fields)))))

    ;; TODO stratify
    (Flows. (clj->js (map first @rule->flow)) (clj->js @rule->flow) #js {} (clj->js @kind->name->rules) (clj->js @name->transient?))))

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

(.add-facts kn "know" "clauses" #js ["rule-id" "when|know|remember|forget" "clause-id" "name"] #js [#js ["function-edge" "when" "get-function-edge" "connected"]
                                                                                                    #js ["function-edge" "when" "make-str" "=function"]
                                                                                                    #js ["function-edge" "remember" "know-str" "str-edge"]])

(.add-facts kn "know" "clause-fields" #js ["clause-id" "constant|variable" "key" "val"] #js [#js ["get-function-edge" "variable" "x" "xx"]
                                                                                             #js ["get-function-edge" "variable" "y" "yy"]
                                                                                             #js ["make-str" "variable" "variable" "zz"]
                                                                                             #js ["make-str" "constant" "js" "\"edge \" + xx + \" \" + yy"]
                                                                                             #js ["know-str" "variable" "name" "zz"]])

(.add-facts kn "know" "clauses" #js ["rule-id" "when|know|remember|forget" "clause-id" "name"] #js [#js ["-function-edge" "when" "-get-function-edge" "edge"]
                                                                                                    #js ["-function-edge" "when" "-make-str" "=function"]
                                                                                                    #js ["-function-edge" "forget" "-know-str" "str-edge"]])

(.add-facts kn "know" "clause-fields" #js ["clause-id" "constant|variable" "key" "val"] #js [#js ["-get-function-edge" "variable" "x" "xx"]
                                                                                             #js ["-get-function-edge" "variable" "y" "yy"]
                                                                                             #js ["-make-str" "variable" "variable" "zz"]
                                                                                             #js ["-make-str" "constant" "js" "\"edge \" + xx + \" \" + yy"]
                                                                                             #js ["-know-str" "variable" "name" "zz"]])

(def flows (compile kn))

(set! (.-rules flows) #js ["single-edge" "transitive-edge" "function-edge" "-function-edge"])

(enable-console-print!)

(.run flows kn)

(.get-or-create-index kn "know" "connected" #js ["x" "y"])

(.get-or-create-index kn "remember" "str-edge" #js ["name"])

(.get-or-create-index kn "forget" "str-edge" #js ["name"])

(.tick flows kn)

(.get-or-create-index kn "know" "edge" #js ["x" "y"])

(.get-or-create-index kn "know" "connected" #js ["x" "y"])

(.get-or-create-index kn "know" "str-edge" #js ["name"])
