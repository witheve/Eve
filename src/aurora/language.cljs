(ns aurora.language
  (:require [aurora.btree :as btree])
  (:require-macros [aurora.macros :refer [apush aclear amake set!!]]))

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
                       (assert (array? fields))
                       (assert (or (identical? kind "know") (identical? kind "remember") (identical? kind "forget")) (pr-str kind))
                       (or (get-in kind->name->fields->index [kind name (vec fields)])
                           (let [index (btree/tree 10 (alength fields))]
                             (when-let [[other-fields other-index] (first (get-in kind->name->fields->index [kind name]))]
                               (assert (= (set fields) (set other-fields)) [kind name fields other-fields])
                               (-update-facts (.elems other-index) (into-array other-fields) index fields))
                             (set! kind->name->fields->index (assoc-in kind->name->fields->index [kind name (vec fields)] index))
                             index)))
  (update-facts [this kind name fields facts&vals]
                (if (> (alength facts&vals) 0)
                  (do
                    #_(prn :updating kind name fields (alength facts&vals))
                    (assert (array? fields))
                    (assert (or (identical? kind "know") (identical? kind "remember") (identical? kind "forget")) (pr-str kind))
                    (let [changed? false
                          indexes (or (get-in kind->name->fields->index [kind name])
                                      (let [filtered-fields (into-array (filter #(not (nil? %)) fields))]
                                        [[(vec filtered-fields) (.get-or-create-index this kind name filtered-fields)]]))]
                      (assert (seq indexes) (pr-str kind name))
                      (doseq [[other-fields other-index] indexes]
                        (when (true? (-update-facts facts&vals fields other-index (into-array other-fields)))
                          (set!! changed? true)))
                      changed?))
                  false))
  (add-facts [this kind name fields facts]
             (let [facts&vals #js []]
               (dotimes [i (alength facts)]
                 (apush facts&vals (aget facts i))
                 (apush facts&vals 1))
               (.update-facts this kind (str "delta-" name) fields facts&vals)))
  (del-facts [this kind name fields facts]
             (let [facts&vals #js []]
               (dotimes [i (alength facts)]
                 (apush facts&vals (aget facts i))
                 (apush facts&vals -1))
               (.update-facts this kind (str "delta-" name) fields facts&vals)))
  (directly-insert-facts! [this kind name fields facts]
                          (let [facts&vals #js []]
                            (dotimes [i (alength facts)]
                              (apush facts&vals (aget facts i))
                              (apush facts&vals 1))
                            (.update-facts this kind name fields facts&vals)))
  (clear-facts [this kind name]
               (doseq [[_ index] (concat (get-in kind->name->fields->index [kind name]))]
                 (.reset index)))
  (unknow-facts [this kind name]
                (let [[fields know-index] (first (get-in kind->name->fields->index ["know" name]))]
                  (when (not (nil? know-index))
                    (let [facts&vals (.elems know-index)]
                      (dotimes [i (alength facts&vals)]
                        (when (== 1 (mod i 2))
                          (aset facts&vals i (- (aget facts&vals i)))))
                      (.update-facts this kind name (into-array fields) facts&vals)))))
  (merge-facts [this name]
               (let [[fields delta-know-index] (first (get-in kind->name->fields->index ["know" (str "delta-" name)]))]
                 #_(prn :merging name (when delta-know-index (alength (.elems delta-know-index))))
                 (when (not (nil? delta-know-index))
                   (.update-facts this "know" name (into-array fields) (.elems delta-know-index))
                   (.clear-facts this "know" (str "delta-" name)))))
  (tick-facts [this name]
              (let [fields (or (first (first (get-in kind->name->fields->index ["know" name])))
                               (first (first (get-in kind->name->fields->index ["remember" name])))
                               (first (first (get-in kind->name->fields->index ["forget" name]))))]
                (when-not (nil? fields)
                  (let [fields (into-array fields)
                        know-index (.get-or-create-index this "know" name fields)
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
                    (.update-facts this "know" (str "delta-" name) fields facts&vals)))))
  (merge [this]
         (doseq [[name _] (kind->name->fields->index "know")]
           (.merge-facts this name)))
  (tick [this name->lifetime]
        (let [names (js/Object.keys name->lifetime)
              changed? false]
          (dotimes [i (alength names)]
            (let [name (aget names i)
                  lifetime (aget name->lifetime name)]
              (when (= "persistent" lifetime)
                (when (true? (.tick-facts this name))
                  (set!! changed? true)))
              (when (= "external" lifetime)
                (.unknow-facts this "know" name))))
          changed?)))
(defn knowledge []
  (Knowledge. {} (js-obj)))

;; FLOWS

(deftype Sink [kind name fields]
  Object
  (run [this kn rule->dirty? kind->name->rules facts&vals]
       (when (true? (.update-facts kn kind name fields facts&vals))
         (let [dirtied-rules (aget kind->name->rules kind name)]
           (dotimes [j (alength dirtied-rules)]
             (aset rule->dirty? (aget dirtied-rules j) true))))))

(deftype SolverFlow [solvers sinks]
  Object
  (run [this kn rule->dirty? kind->name->rules]
       (let [facts&vals #js []]
         (dotimes [i (alength solvers)]
           (let [solver (aget solvers i)]
             (.reset solver)
             (js/Array.prototype.push.apply facts&vals (.elems solver))))
         (dotimes [i (alength sinks)]
           (.run (aget sinks i) kn rule->dirty? kind->name->rules facts&vals)))))

(deftype AggregateFlow [index group-len limit-ix ascending? agg-ixes agg-funs sinks]
  Object
  (run [this kn rule->dirty? kind->name->rules]
       (let [current-key nil
             current-limit nil
             current-index 1
             inputs #js []
             aggs (make-array (alength agg-ixes))
             facts&vals #js []
             push-input (fn [key]
                          (when (nil? current-key)
                            (set!! current-key key)
                            (set!! current-limit (aget key limit-ix)))
                          (when (btree/prefix-not= key current-key group-len)
                            (dotimes [i (alength aggs)]
                              (aset aggs i ((aget agg-funs i) (aget agg-ixes i) inputs)))
                            (dotimes [i (alength inputs)]
                              (let [output (aget inputs i)]
                                (dotimes [j (alength aggs)]
                                  (apush output (aget aggs j)))
                                (apush facts&vals output)
                                (apush facts&vals 1)))
                            (aclear inputs)
                            (set!! current-key key)
                            (set!! current-limit (aget key limit-ix))
                            (set!! current-index 1))
                          (when (<= current-index current-limit)
                            (let [input (aclone key)]
                              (apush input current-index)
                              (set!! current-index (+ current-index 1))
                              (apush inputs input))))]
         (if (true? ascending?)
           (.foreach index push-input)
           (.foreach-reverse index push-input))
         (push-input (btree/greatest-key group-len))
         (dotimes [i (alength sinks)]
           (.run (aget sinks i) kn rule->dirty? kind->name->rules facts&vals)))))

(deftype Flows [rules rule->flow rule->dirty? kind->name->rules name->lifetime]
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
                 #_(prn :running rule)
                 (aset rule->dirty? rule false)
                 (.run (aget rule->flow rule) kn rule->dirty? kind->name->rules)
                 (recur 0))
               (recur (+ i 1)))))))
  (tick [this kn watch]
        (.run this kn)
        (.merge kn)
        (when watch
          (watch kn))
        (.tick kn name->lifetime))
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
        name->lifetime (atom {})
        clauses (.keys (.get-or-create-index kn "know" "clauses" #js ["rule-id" "when|know|remember|forget" "clause-id" "name"]))
        fields (.keys (.get-or-create-index kn "know" "clause-fields" #js ["clause-id" "constant|variable" "key" "val"]))
        has-aggs (.keys (.get-or-create-index kn "know" "has-agg" #js ["rule-id" "limit-variable|constant" "limit" "ordinal" "ascending|descending"]))
        group-bys (.keys (.get-or-create-index kn "know" "group-by" #js ["rule-id" "var"]))
        sort-bys (.keys (.get-or-create-index kn "know" "sort-by" #js ["rule-id" "ix" "var"]))
        agg-overs (.keys (.get-or-create-index kn "know" "agg-over" #js ["rule-id" "in-var" "agg-fun" "out-var"]))
        rule-id->clauses (atom (into {} (for [[k vs] (group-by #(nth % 0) clauses)] [k (set (map vec vs))])))
        clause-id->fields (atom (into {} (for [[k vs] (group-by #(nth % 0) fields)] [k (set (map vec vs))])))
        rule-id->has-agg (atom (into {} (for [[k vs] (group-by #(nth % 0) has-aggs)] [k (set (map vec vs))])))
        rule-id->group-by (atom (into {} (for [[k vs] (group-by #(nth % 0) group-bys)] [k (set (map vec vs))])))
        rule-id->sort-by (atom (into {} (for [[k vs] (group-by #(nth % 0) sort-bys)] [k (set (map vec vs))])))
        rule-id->agg-over (atom (into {} (for [[k vs] (group-by #(nth % 0) agg-overs)] [k (set (map vec vs))])))
        sink-of (fn [rule-id clause-type clause-id name var->ix]
                  (let [fields (make-array (count var->ix))]
                    (doseq [[_ field-type key val] (@clause-id->fields clause-id)]
                      (assert (= field-type "variable") [rule-id clause-id key val])
                      (aset fields (var->ix val) key))
                    (Sink. clause-type name fields)))]

    ;; rewrite clauses
    (doseq [[rule-id clauses] @rule-id->clauses]
      (doseq [[_ clause-type clause-id name] clauses
              :when (not (#{"=constant" "=variable" "=function" "filter"} name))]
        (let [fields (get @clause-id->fields clause-id)
              var->key (atom {})]
          (doseq [[_ field-type key val] fields]
            (if (= field-type "constant")
              ;; rewrite (foo 1) to (foo x) (=constant x 1)
              (let [new-var (new-id)
                    new-clause-id (new-id)]
                (swap! clause-id->fields update-in [clause-id] disj [clause-id "constant" key val])
                (swap! clause-id->fields update-in [clause-id] conj [clause-id "variable" key new-var])
                (swap! clause-id->fields assoc new-clause-id #{[new-clause-id "variable" "variable" new-var]
                                                               [new-clause-id "constant" "constant" val]})
                (swap! rule-id->clauses update-in [rule-id] conj [rule-id "when" new-clause-id "=constant"]))
              (if (get @var->key val)
                ;; rewrite (foo x x) to (foo x y) (=variable x y)
                (let [new-var (new-id)
                      new-clause-id (new-id)]
                  (swap! clause-id->fields update-in [clause-id] disj [clause-id "variable" key val])
                  (swap! clause-id->fields update-in [clause-id] conj [clause-id "variable" key new-var])
                  (swap! clause-id->fields assoc new-clause-id #{[new-clause-id "variable-a" "variable" new-var]
                                                                 [new-clause-id "variable-b" "variable" val]})
                  (swap! rule-id->clauses update-in [rule-id] conj [rule-id "when" new-clause-id "=variable"]))
                (swap! var->key assoc val key)))))))

    ;; rewrite (limit 1) to (limit x) (=constant x 1)
    (doseq [[rule-id clauses] @rule-id->clauses]
      (when (seq (@rule-id->has-agg rule-id))
        (let [has-aggs (@rule-id->has-agg rule-id)
              _ (assert (= (count has-aggs) 1))
              [_ limit-variable|constant limit ordinal ascending|descending] (first has-aggs)]
          (when (= "constant" limit-variable|constant)
            (let [new-var (new-id)
                  new-clause-id (new-id)]
              (swap! rule-id->has-agg update-in [rule-id] disj [rule-id "constant" limit ordinal ascending|descending])
              (swap! rule-id->has-agg update-in [rule-id] conj [rule-id "variable" new-var ordinal ascending|descending])
              (swap! clause-id->fields assoc new-clause-id #{[new-clause-id "variable-a" "variable" new-var]
                                                             [new-clause-id "variable-b" "constant" limit]})
              (swap! rule-id->clauses update-in [rule-id] conj [rule-id "when" new-clause-id "=constant"]))))))

    ;; rewrite aggregates
    (doseq [[rule-id clauses] @rule-id->clauses]
      (when (seq (@rule-id->has-agg rule-id))
        (let [agg-rule-id (str rule-id "-agg-rule")
              agg-clause-id (str rule-id "-agg-clause")
              agg-index-id (str rule-id "-agg-index")
              has-aggs (@rule-id->has-agg rule-id)
              _ (assert (= (count has-aggs) 1))
              [_ _ limit ordinal ascending|descending] (first has-aggs)]

          ;; remove output clauses
          (doseq [[_ clause-type clause-id name] clauses
                  :when (not= clause-type "when")]
            (swap! rule-id->clauses update-in [rule-id] disj [rule-id clause-type clause-id name]))

          ;; add a clause to output used vars to agg-index-ix
          (swap! rule-id->clauses update-in [rule-id] conj [rule-id "know" agg-clause-id agg-index-id])
          (swap! clause-id->fields update-in [agg-clause-id] conj [agg-clause-id "variable" limit limit])
          (doseq [[_ var] (@rule-id->group-by rule-id)]
            (swap! clause-id->fields update-in [agg-clause-id] conj [agg-clause-id "variable" var var]))
          (doseq [[_ ix var] (@rule-id->sort-by rule-id)]
            (swap! clause-id->fields update-in [agg-clause-id] conj [agg-clause-id "variable" var var]))
          (doseq [[_ in-var agg-fun out-var] (@rule-id->agg-over rule-id)]
            (swap! clause-id->fields update-in [agg-clause-id] conj [agg-clause-id "variable" in-var in-var]))

          ;; create an aggregate flow to read from agg-index-id
          (let [group-by-vars (for [[_ var] (@rule-id->group-by rule-id)]
                                var)
                sort-by-vars (into (sorted-map)
                                   (for [[_ ix var] (@rule-id->sort-by rule-id)]
                                     [ix var]))
                agg-in-vars (for [[_ in-var agg-fun out-var] (@rule-id->agg-over rule-id)]
                              in-var)
                agg-out-vars (for [[_ in-var agg-fun out-var] (@rule-id->agg-over rule-id)]
                               out-var)
                in-vars (into-array (distinct (concat group-by-vars [limit] (vals sort-by-vars) agg-in-vars)))
                out-vars (into-array (distinct (concat group-by-vars [limit] (vals sort-by-vars) agg-in-vars [ordinal] agg-out-vars)))
                var->ix (into {}
                              (for [i (range (alength out-vars))]
                                [(aget out-vars i) i]))
                index (.get-or-create-index kn "know" agg-index-id in-vars)
                group-len (count (conj (set group-by-vars) limit))
                limit-ix (var->ix limit)
                ascending? (= ascending|descending "ascending")
                agg-ixes (into-array
                          (for [[_ in-var agg-fun out-var] (@rule-id->agg-over rule-id)]
                            (var->ix in-var)))
                agg-funs (into-array
                          (for [[_ in-var agg-fun out-var] (@rule-id->agg-over rule-id)]
                            (aget js/aurora.aggregates agg-fun)))
                sinks (into-array
                       (for [[_ clause-type clause-id name] clauses
                             :when (not= clause-type "when")]
                         (sink-of rule-id clause-type clause-id name var->ix)))]
            (swap! rule->flow assoc agg-rule-id (AggregateFlow. index group-len limit-ix ascending? agg-ixes agg-funs sinks))
            (swap! kind->name->rules update-in ["know" (str "delta-" agg-index-id)] conj agg-rule-id)))))

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
              stateless-constraints (for [[_ clause-type clause-id name] sorted-clauses
                                          :when (= clause-type "when")
                                          :when (#{"=constant" "=variable" "=function" "filter" "interval"} name)]
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
                                          "interval" (let [in (first (for [[_ field-type key val] fields
                                                                           :when (= key "in")]
                                                                       val))
                                                           in-ix (get var->ix in)
                                                           lo (first (for [[_ field-type key val] fields
                                                                           :when (= key "lo")]
                                                                       val))
                                                           lo-ix (get var->ix lo)
                                                           hi (first (for [[_ field-type key val] fields
                                                                           :when (= key "hi")]
                                                                       val))
                                                           hi-ix (get var->ix hi)]
                                                       (btree/interval in-ix lo-ix hi-ix)))))

              stateful-clauses (map conj
                                    (for [[_ clause-type clause-id name] sorted-clauses
                                          :when (= clause-type "when")
                                          :when (not (#{"=constant" "=variable" "=function" "filter" "interval"} name))]
                                      [_ clause-type clause-id name])
                                    (range))

              _ (doseq [[_ clause-type clause-id name] stateful-clauses]
                  (swap! kind->name->rules update-in ["know" name] #(conj (or % #{}) rule-id))
                  (swap! kind->name->rules update-in ["know" (str "delta-" name)] #(conj (or % #{}) rule-id)))

              ->stateful-constraint (fn [clause-id name]
                                      (let [fields (get @clause-id->fields clause-id)
                                            clause-vars&keys (sort-by (fn [[val key]] (var->ix val))
                                                                      (for [[_ field-type key val] fields]
                                                                        [val key]))
                                            clause-vars (map first clause-vars&keys)
                                            clause-vars-ixes (map var->ix clause-vars)
                                            clause-keys (map second clause-vars&keys)
                                            index (.get-or-create-index kn "know" name (into-array clause-keys))]
                                        (btree/contains (btree/iterator index) (into-array clause-vars-ixes))))

              solvers (amake [deriv (- (js/Math.pow 2 (count stateful-clauses)) 1)] ;; all bit permutations except all 1s
                             (btree/solver num-vars (into-array
                                                     (concat
                                                      (for [[_ clause-type clause-id name pos] stateful-clauses
                                                            :when (== 0 (mod (bit-shift-right deriv pos) 2))]
                                                        (->stateful-constraint clause-id (str "delta-" name)))
                                                      (for [[_ clause-type clause-id name pos] stateful-clauses
                                                            :when (== 1 (mod (bit-shift-right deriv pos) 2))]
                                                        (->stateful-constraint clause-id name))
                                                      stateless-constraints))))

              ;; make sinks
              sinks (into-array
                     (for [[_ clause-type clause-id name] clauses
                           :when (not= clause-type "when")]
                       (sink-of rule-id clause-type clause-id (if (= clause-type "know") (str "delta-" name) name) var->ix)))]

          (swap! rule->flow assoc rule-id (SolverFlow. solvers sinks)))))

    ;; set up state for outputs
    (doseq [[rule flow] @rule->flow
            sink (.-sinks flow)]
      (let [kind (.-kind sink)
            name (.-name sink)
            fields (.-fields sink)
            filtered-fields (into-array (filter #(not (nil? %)) fields))
            old-lifetime (@name->lifetime name)
            new-lifetime (if (= kind "know") "transient" "persistent")]
        ;; TODO get lifetime from schema instead
        (if old-lifetime
          (assert (= old-lifetime new-lifetime) [name old-lifetime new-lifetime])
          (swap! name->lifetime assoc name new-lifetime))
        (swap! kind->name->rules update-in [kind name] #(or % #{}))))

    ;; TODO stratify
    (Flows. (clj->js (map first @rule->flow)) (clj->js @rule->flow) #js {} (clj->js @kind->name->rules) (clj->js @name->lifetime))))

;; TESTS

(comment
(enable-console-print!)

(def kn (knowledge))

(.get-or-create-index kn "know" "clauses" #js ["rule-id" "when|know|remember|forget" "clause-id" "name"])
(.get-or-create-index kn "know" "clause-fields" #js ["clause-id" "constant|variable" "key" "val"])
(.get-or-create-index kn "know" "has-agg" #js ["rule-id" "limit-variable|constant" "limit" "ordinal" "ascending|descending"])
(.get-or-create-index kn "know" "group-by" #js ["rule-id" "var"])
(.get-or-create-index kn "know" "sort-by" #js ["rule-id" "ix" "var"])
(.get-or-create-index kn "know" "agg-over" #js ["rule-id" "in-var" "agg-fun" "out-var"])

(.get-or-create-index kn "know" "delta-edge" #js ["x" "y"])
(.get-or-create-index kn "know" "delta-connected" #js ["x" "y"])
(.add-facts kn "know" "edge" #js ["x" "y"] #js [#js ["a" "b"] #js ["b" "c"] #js ["c" "d"] #js ["d" "b"]])

(.directly-insert-facts! kn "know" "clauses" #js ["rule-id" "when|know|remember|forget" "clause-id" "name"] #js [#js ["single-edge" "when" "get-edges" "edge"]
                                                                                                    #js ["single-edge" "know" "output-connected" "connected"]])

(.directly-insert-facts! kn "know" "clause-fields" #js ["clause-id" "constant|variable" "key" "val"] #js [#js ["get-edges" "variable" "x" "xx"]
                                                                                             #js ["get-edges" "variable" "y" "yy"]
                                                                                             #js ["output-connected" "variable" "x" "xx"]
                                                                                             #js ["output-connected" "variable" "y" "yy"]])

(.directly-insert-facts! kn "know" "clauses" #js ["rule-id" "when|know|remember|forget" "clause-id" "name"] #js [#js ["transitive-edge" "when" "get-left-edge" "edge"]
                                                                                                    #js ["transitive-edge" "when" "get-right-connected" "connected"]
                                                                                                    #js ["transitive-edge" "know" "output-transitive-connected" "connected"]])

(.directly-insert-facts! kn "know" "clause-fields" #js ["clause-id" "constant|variable" "key" "val"] #js [#js ["get-left-edge" "variable" "x" "xx"]
                                                                                             #js ["get-left-edge" "variable" "y" "yy"]
                                                                                             #js ["get-right-connected" "variable" "x" "yy"]
                                                                                             #js ["get-right-connected" "variable" "y" "zz"]
                                                                                             #js ["output-transitive-connected" "variable" "x" "xx"]
                                                                                             #js ["output-transitive-connected" "variable" "y" "zz"]])

(.directly-insert-facts! kn "know" "clauses" #js ["rule-id" "when|know|remember|forget" "clause-id" "name"] #js [#js ["function-edge" "when" "get-function-edge" "connected"]
                                                                                                    #js ["function-edge" "when" "filter-edge" "filter"]
                                                                                                    #js ["function-edge" "when" "make-str" "=function"]
                                                                                                    #js ["function-edge" "remember" "know-str" "str-edge"]])

(.directly-insert-facts! kn "know" "clause-fields" #js ["clause-id" "constant|variable" "key" "val"] #js [#js ["get-function-edge" "variable" "x" "xx"]
                                                                                             #js ["get-function-edge" "variable" "y" "yy"]
                                                                                             #js ["filter-edge" "constant" "js" "xx == \"a\""]
                                                                                             #js ["make-str" "variable" "variable" "zz"]
                                                                                             #js ["make-str" "constant" "js" "\"edge \" + xx + \" \" + yy"]
                                                                                             #js ["know-str" "variable" "name" "zz"]])

(.directly-insert-facts! kn "know" "clauses" #js ["rule-id" "when|know|remember|forget" "clause-id" "name"] #js [#js ["-function-edge" "when" "-get-function-edge" "edge"]
                                                                                                    #js ["-function-edge" "when" "-make-str" "=function"]
                                                                                                    #js ["-function-edge" "forget" "-know-str" "str-edge"]])

(.directly-insert-facts! kn "know" "clause-fields" #js ["clause-id" "constant|variable" "key" "val"] #js [#js ["-get-function-edge" "variable" "x" "xx"]
                                                                                             #js ["-get-function-edge" "variable" "y" "yy"]
                                                                                             #js ["-make-str" "variable" "variable" "zz"]
                                                                                             #js ["-make-str" "constant" "js" "\"edge \" + xx + \" \" + yy"]
                                                                                             #js ["-know-str" "variable" "name" "zz"]])

(.get-or-create-index kn "know" "delta-foo" #js ["x" "y"])
(.get-or-create-index kn "know" "delta-bar" #js ["z"])
(.add-facts kn "know" "foo" #js ["x" "y"] #js [#js [1 5] #js [10 10] #js [20 15]])

(.directly-insert-facts! kn "know" "clauses" #js ["rule-id" "when|know|remember|forget" "clause-id" "name"] #js [#js ["overlap" "when" "get-foos" "foo"]
                                                                                                    #js ["overlap" "when" "some-interval" "interval"]
                                                                                                    #js ["overlap" "remember" "rem-bar" "bar"]])

(.directly-insert-facts! kn "know" "clause-fields" #js ["clause-id" "constant|variable" "key" "val"] #js [#js ["get-foos" "variable" "x" "xx"]
                                                                                             #js ["get-foos" "variable" "y" "yy"]
                                                                                             #js ["some-interval" "variable" "lo" "xx"]
                                                                                             #js ["some-interval" "variable" "hi" "yy"]
                                                                                             #js ["some-interval" "variable" "in" "zz"]
                                                                                             #js ["rem-bar" "variable" "z" "zz"]])

(.directly-insert-facts! kn "know" "clauses" #js ["rule-id" "when|know|remember|forget" "clause-id" "name"] #js [#js ["count-overlap" "when" "count-get-foos" "foo"]
                                                                                                    #js ["count-overlap" "when" "count-some-interval" "interval"]
                                                                                                    #js ["count-overlap" "remember" "count-rem-frip" "frip"]])

(.directly-insert-facts! kn "know" "clause-fields" #js ["clause-id" "constant|variable" "key" "val"] #js [#js ["count-get-foos" "variable" "x" "xx"]
                                                                                             #js ["count-get-foos" "variable" "y" "yy"]
                                                                                             #js ["count-some-interval" "variable" "lo" "xx"]
                                                                                             #js ["count-some-interval" "variable" "hi" "yy"]
                                                                                             #js ["count-some-interval" "variable" "in" "zz"]
                                                                                             #js ["count-rem-frip" "variable" "x" "xx"]
                                                                                             #js ["count-rem-frip" "variable" "w" "ww"]])

(.directly-insert-facts! kn "know" "has-agg" #js ["rule-id" "limit-variable|constant" "limit" "ordinal" "ascending|descending"] #js [#js ["count-overlap" "constant" js/Infinity "ord" "ascending"]])

(.directly-insert-facts! kn "know" "group-by" #js ["rule-id" "var"] #js [#js ["count-overlap" "xx"]])

(.directly-insert-facts! kn "know" "agg-over" #js ["rule-id" "in-var" "agg-fun" "out-var"] #js [#js ["count-overlap" "zz" "count" "ww"]])


(.directly-insert-facts! kn "know" "clauses" #js ["rule-id" "when|know|remember|forget" "clause-id" "name"] #js [#js ["concat-overlap" "when" "concat-get-foos" "foo"]
                                                                                                    #js ["concat-overlap" "when" "concat-some-interval" "interval"]
                                                                                                    #js ["concat-overlap" "remember" "concat-rem-frop" "frop"]])

(.directly-insert-facts! kn "know" "clause-fields" #js ["clause-id" "constant|variable" "key" "val"] #js [#js ["concat-get-foos" "variable" "x" "xx"]
                                                                                             #js ["concat-get-foos" "variable" "y" "yy"]
                                                                                             #js ["concat-some-interval" "variable" "lo" "xx"]
                                                                                             #js ["concat-some-interval" "variable" "hi" "yy"]
                                                                                             #js ["concat-some-interval" "variable" "in" "zz"]
                                                                                             #js ["concat-rem-frop" "variable" "x" "xx"]
                                                                                             #js ["concat-rem-frop" "variable" "o" "ord"]
                                                                                             #js ["concat-rem-frop" "variable" "z" "zz"]
                                                                                             #js ["concat-rem-frop" "variable" "w" "ww"]])


(.directly-insert-facts! kn "know" "has-agg" #js ["rule-id" "limit-variable|constant" "limit" "ordinal" "ascending|descending"] #js [#js ["concat-overlap" "constant" 3 "ord" "descending"]])

(.directly-insert-facts! kn "know" "group-by" #js ["rule-id" "var"] #js [#js ["concat-overlap" "xx"]])

(.directly-insert-facts! kn "know" "sort-by" #js ["rule-id" "ix" "var"] #js [#js ["concat-overlap" 0 "zz"]])

(.directly-insert-facts! kn "know" "agg-over" #js ["rule-id" "in-var" "agg-fun" "out-var"] #js [#js ["concat-overlap" "zz" "str" "ww"]])


(def flows (compile kn))

(enable-console-print!)
(prn :running)
(.quiesce flows kn (fn [kn] (prn :ticked kn)))

(.get-or-create-index kn "know" "edge" #js ["x" "y"])

(.get-or-create-index kn "know" "connected" #js ["x" "y"])

(.get-or-create-index kn "know" "delta-connected" #js ["x" "y"])

(.get-or-create-index kn "know" "str-edge" #js ["name"])

(.get-or-create-index kn "know" "delta-foo" #js ["x" "y"])

(.get-or-create-index kn "know" "delta-bar" #js ["z"])

(.get-or-create-index kn "know" "delta-frip" #js ["x" "w"])

(.get-or-create-index kn "know" "delta-frop" #js ["x" "o" "z" "w"])
)
