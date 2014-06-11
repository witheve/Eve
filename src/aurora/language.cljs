(ns aurora.language
  (:require [aurora.btree :as btree])
  (:require-macros [aurora.macros :refer [apush set!!]]))

;; KNOWLEDGE

(defn keymap [from-fields to-fields]
  (let [keymap (make-array (alength to-fields))]
    (dotimes [i (alength from-fields)]
      (dotimes [j (alength to-fields)]
        (when (identical? (aget from-fields i) (aget to-fields j))
          (aset keymap j i))))
    (dotimes [j (alength keymap)]
      (assert (not (nil? (aget keymap j))) (str "Fields mismatch: " from-fields " :: " to-fields))) ;; ie every to-field is in from-fields somewhere
    keymap))

(defn with-keymap [keymap key]
  (let [new-key (make-array (alength keymap))]
    (dotimes [i (alength keymap)]
      (aset new-key i (aget key (aget keymap i))))
    new-key))

(defn -update-facts [from-facts&vals from-fields to-index to-fields]
  (let [changed? false
        keymap (keymap from-fields to-fields)]
    (dotimes [i (alength from-facts&vals)]
      (when (== 0 (mod i 2))
        (when (not (== 0 (.update to-index (with-keymap keymap (aget from-facts&vals i)) (aget from-facts&vals (+ i 1)))))
          (set!! changed? true))))
    changed?))

(deftype Knowledge [^:mutable kind->name->fields->index ^:mutable state]
  Object
  (get-or-create-index [this kind name fields]
                       (assert (or (identical? kind "know") (identical? kind "remember") (identical? kind "forget")) (pr-str kind))
                       (or (get-in kind->name->fields->index [kind name (vec fields)])
                           (let [index (btree/tree 10 (alength fields))]
                             (when-let [[other-fields other-index] (first (get-in kind->name->fields->index [kind name]))]
                               (-update-facts (.elems other-index) (into-array other-fields) index fields))
                             (set! kind->name->fields->index (assoc-in kind->name->fields->index [kind name (vec fields)] index))
                             index)))
  (ensure-index [this kind name default-fields]
                (assert (or (identical? kind "know") (identical? kind "remember") (identical? kind "forget")) (pr-str kind))
                (if-let [fields->index (get-in kind->name->fields->index [kind name])]
                  (assert (= (set default-fields) (set (first (keys fields->index)))))
                  (.get-or-create-index this kind name default-fields)))
  (update-facts [this kind name fields facts&vals]
                (assert (or (identical? kind "know") (identical? kind "remember") (identical? kind "forget")) (pr-str kind))
                (let [changed? false
                      indexes (get-in kind->name->fields->index [kind name])]
                  (assert (seq indexes) (pr-str kind name))
                  (doseq [[other-fields other-index] indexes]
                    (when (true? (-update-facts facts&vals fields other-index (into-array other-fields)))
                      (set!! changed? true)))
                  changed?))
  (add-facts [this kind name fields facts]
             (let [facts&vals #js []]
               (dotimes [i (alength facts)]
                 (apush facts&vals (aget facts i))
                 (apush facts&vals 1))
               (.update-facts this kind name fields facts&vals)))
  (del-facts [this kind name fields facts]
             (let [facts&vals #js []]
               (dotimes [i (alength facts)]
                 (apush facts&vals (aget facts i))
                 (apush facts&vals -1))
               (.update-facts this kind name fields facts&vals)))
  (clear-facts [this kind name]
               (doseq [[_ index] (concat (get-in kind->name->fields->index [kind name]))]
                 (.reset index)))
  (tick-facts [this name]
              (let [[fields know-index] (first (get-in kind->name->fields->index ["know" name]))]
                (assert (not (nil? fields)) name)
                (let [fields (into-array fields)
                      remember-index (.get-or-create-index this "remember" name fields)
                      forget-index (.get-or-create-index this "forget" name fields)
                      know-iter (btree/iterator know-index)
                      remember-iter (btree/iterator remember-index)
                      forget-iter (btree/iterator forget-index)
                      facts&vals #js []]
                  (.foreach remember-index
                            (fn [key val]
                              (when (and (not (.contains? know-iter key)) (not (.contains? forget-iter key)))
                                (.push facts&vals key 1))))
                  (.foreach forget-index
                            (fn [key val]
                              (when (and (.contains? know-iter key) (not (.contains? remember-iter key)))
                                (.push facts&vals key -1))))
                  (.clear-facts this "remember" name)
                  (.clear-facts this "forget" name)
                  (.update-facts this "know" name fields facts&vals))))
  (tick [this name->transient?]
        (let [names (js/Object.keys name->transient?)
              changed? false]
          (dotimes [i (alength names)]
            (let [name (aget names i)]
              (if (true? (aget name->transient? name))
                (.clear-facts this "know" name)
                (when (true? (.tick-facts this name))
                  (set!! changed? true)))))
          changed?)))

(defn knowledge []
  (Knowledge. {} (js-obj)))

;; FLOWS

(deftype Flow [solver output-kinds output-names output-fields]
  Object
  (run [this kn rule->dirty? kind->name->rules]
       (.reset solver)
       (let [facts&vals (.elems solver)]
         (dotimes [i (alength output-kinds)]
           (let [kind (aget output-kinds i)
                 name (aget output-names i)
                 fields (aget output-fields i)]
             (when (true? (.update-facts kn kind name fields facts&vals))
               (let [dirtied-rules (aget kind->name->rules kind name)]
                 (dotimes [j (alength dirtied-rules)]
                   (aset rule->dirty? (aget dirtied-rules j) true)))))))))

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
  (tick [this kn watch]
        (.run this kn)
        (when watch
          (watch kn))
        (.tick kn name->transient?))
  (quiesce [this kn watch]
           (while (true? (.tick this kn watch)))))

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
              :when (not (#{"=constant" "=variable" "=function" "filter"} name))]
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
      (let [var->when-count (atom {})]

        ;; collect vars
        (doseq [[_ clause-type clause-id _] clauses]
          (let [fields (get @clause-id->fields clause-id)]
            (doseq [[_ field-type key val] fields]
              (when (= field-type "variable")
                (swap! var->when-count update-in [val] #(+ (or % 0) (if (= clause-type "when") 1 0)))))))

        (let [vars (map first (reverse (sort-by val @var->when-count)))
              var->ix (zipmap vars (range))
              num-vars (count vars)

              clause->min-var (atom {})

              _ (doseq [[_ clause-type clause-id name] clauses
                        [_ field-type key val] (get @clause-id->fields clause-id)
                        :when (= field-type "variable")]
                  (swap! clause->min-var update-in [clause-id] #(min (or % js/Infinity) (var->ix val))))

              sorted-clauses (sort-by (fn [[_ clause-type clause-id name]] (or (@clause->min-var clause-id) js/Infinity)) clauses)

              ;; make inputs
              constraints (for [[_ clause-type clause-id name] sorted-clauses
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
                                                   (btree/constant constant ix))
                                     "=variable" (let [variable-a (first (for [[_ field-type key val] fields
                                                                               :when (= key "variable-a")]
                                                                           val))
                                                       variable-b (first (for [[_ field-type key val] fields
                                                                               :when (= key "variable-b")]
                                                                           val))
                                                       ix-a (get var->ix variable-a)
                                                       ix-b (get var->ix variable-b)]
                                                   (btree/equal #js [ix-a ix-b]))
                                     "=function" (let [variable (first (for [[_ field-type key val] fields
                                                                             :when (= key "variable")]
                                                                         val))
                                                       js (first (for [[_ field-type key val] fields
                                                                       :when (= key "js")]
                                                                   val))
                                                       result-ix (get var->ix variable)
                                                       args (for [var vars
                                                                  :when (>= (.indexOf js var) 0)]
                                                              var)
                                                       arg-ixes (map var->ix args)
                                                       fun (apply js/Function (conj (vec args) (str "return (" js ");")))]
                                                   (btree/function fun result-ix (into-array arg-ixes)))
                                     "filter" (let [js (first (for [[_ field-type key val] fields
                                                                    :when (= key "js")]
                                                                val))
                                                    args (for [var vars
                                                               :when (>= (.indexOf js var) 0)]
                                                           var)
                                                    arg-ixes (map var->ix args)
                                                    fun (apply js/Function (conj (vec args) (str "return (" js ");")))]
                                                (btree/filter fun (into-array arg-ixes)))
                                     (let [clause-vars&keys (sort-by (fn [[val key]] (var->ix val))
                                                                     (for [[_ field-type key val] fields]
                                                                       [val key]))
                                           clause-vars (map first clause-vars&keys)
                                           clause-vars-ixes (map var->ix clause-vars)
                                           clause-keys (map second clause-vars&keys)
                                           index (.get-or-create-index kn "know" name (into-array clause-keys))]
                                       (swap! kind->name->rules update-in ["know" name] #(conj (or % #{}) rule-id))
                                       (btree/contains (btree/iterator index) (into-array clause-vars-ixes))))))

              ;; make solver
              solver (btree/solver num-vars (into-array constraints))

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
                  filtered-fields (into-array (filter #(not (nil? %)) fields))
                  transient? (identical? kind "know")]
              ;; TODO get transient? from schema instead
              (assert (not= (not transient?) (get @name->transient? name)) name)
              (swap! name->transient? assoc name transient?)
              (swap! kind->name->rules update-in [kind name] #(or % #{}))
              (.ensure-index kn "know" name filtered-fields)
              (when (false? transient?)
                (.ensure-index kn "forget" name filtered-fields)
                (.ensure-index kn "remember" name filtered-fields))))

          (swap! rule->flow assoc rule-id (Flow. solver output-kinds output-names output-fields)))))

    ;; TODO stratify
    (Flows. (clj->js (map first @rule->flow)) (clj->js @rule->flow) #js {} (clj->js @kind->name->rules) (clj->js @name->transient?))))

;; TESTS

(comment

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
                                                                                                    #js ["function-edge" "when" "filter-edge" "filter"]
                                                                                                    #js ["function-edge" "when" "make-str" "=function"]
                                                                                                    #js ["function-edge" "remember" "know-str" "str-edge"]])

(.add-facts kn "know" "clause-fields" #js ["clause-id" "constant|variable" "key" "val"] #js [#js ["get-function-edge" "variable" "x" "xx"]
                                                                                             #js ["get-function-edge" "variable" "y" "yy"]
                                                                                             #js ["filter-edge" "constant" "js" "xx == \"a\""]
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

(.get-or-create-index kn "know" "connected" #js ["x" "y"])

(.get-or-create-index kn "remember" "str-edge" #js ["name"])

(.get-or-create-index kn "forget" "str-edge" #js ["name"])

(prn :running)
(.quiesce flows kn (fn [kn] (prn :ticked kn)))

(.get-or-create-index kn "know" "edge" #js ["x" "y"])

(.get-or-create-index kn "know" "connected" #js ["x" "y"])

(.get-or-create-index kn "know" "str-edge" #js ["name"])
)
