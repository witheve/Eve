(ns aurora.interpreter)

(declare run-node)

(defn run-value [node inputs actions]
  (:value node))

(defn run-cljs [node inputs actions]
  (apply (:fn node) inputs))

(defn run-pipe [node inputs actions]
  (let [vars #js {}]
    (doseq [[id value] (map vector (:inputs node) inputs)]
      (aset vars id value))
    (doseq [{:keys [id inputs node]} (:nodes node)]
      (aset vars id (run-node node (map #(aget vars %) inputs) actions)))
    (aget vars (-> node :nodes last first))))

(defn run-match [node inputs actions]
  (assert (= 1 (count inputs)))
  (run-match-branches (:branches node) (first inputs) actions))

(defrecord MatchFailure [])

(defn check [bool]
  (when-not bool (throw (MatchFailure.))))

(defn run-match-branches [branches input actions]
  (if-let [[{:keys [branch inputs node]} & branches] (seq branches)]
    (try
      (let [vars #js {}]
        (run-match-branch branch input actions vars)
        (run-node node (map #(aget vars %) inputs) actions))
      (catch MatchFailure _
        (recur branches input actions)))
    (throw (MatchFailure.))))

(defn run-match-branch [branch input actions vars]
  (when-let [var (-> branch meta :var)]
    (aset vars var input))
  (cond
   (:type branch) (check (run-node branch [input] actions))
   (or (number? branch) (string? branch)) (check (= branch input))
   (or (nil? branch) (sequential? branch)) (if-let [[first-branch & rest-branch] (seq branch)]
                                             (do (check (and (sequential? input) (seq input)))
                                               (let [[first-input & rest-input] input]
                                                 (run-match-branch first-branch first-input actions vars)
                                                 (run-match-branch rest-branch rest-input actions vars)))
                                             (check (empty? input)))
   (map? branch) (do (check (map? input))
                   (doseq [[key val] branch]
                     (check (contains? input key))
                     (run-match-branch val (get input key) actions vars)))
   :otherwise (assert false)))

(defn run-node [node inputs actions]
  (:type node)
  (case (:type node)
    :value (run-value node inputs actions)
    :cljs (run-cljs node inputs actions)
    :match (run-match node inputs actions)
    :pipe (run-pipe node inputs actions)))

(def example-a
  {:type :pipe
   :inputs ["a" "b" "c"]
   :nodes [{:id "b-squared" :inputs ["b" "b"] :node {:type :cljs :fn *}}
           {:id "four" :inputs [] :node {:type :value :value 4}}
           {:id "four-a-c" :inputs ["four" "a" "c"] :node {:type :cljs :fn *}}
           {:id "result" :inputs ["b-squared" "four-a-c"] :node {:type :cljs :fn -}}]})

(def example-b
  {:type :match
   :branches [{:branch {"a" ^{:var "a"} {:type :cljs :fn number?} "b" ^{:var "b"} {:type :cljs :fn number?}}
               :inputs ["a" "b"]
               :node {:type :cljs :fn -}}
              {:branch [^{:var "x"} {:type :value :value true} "foo"]
               :inputs ["x" "y"]
               :node {:type :cljs :fn identity}}]})

(defn run-example [example inputs]
  (try
    (run-node example inputs nil)
    (catch MatchFailure e e)))

(run-node example-a [1 4 2] nil)

(run-example example-b [{"a" 1 "b" 2}])
(run-example example-b [{"a" 1 "c" 2}])
(run-example example-b [{"a" 1 "b" "foo"}])
(run-example example-b [[1 "foo"]])
(run-example example-b [[1 2]])
