(ns aurora.interpreter)

(defn run-node [node inputs actions]
  (case (:type node)
    :value (run-value node inputs actions)
    :cljs (run-cljs node inputs actions)
    :match (run-match node inputs actions)
    :pipe (run-pipe node inputs actions)))

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
    (aget vars (-> node :nodes last :id))))

(defrecord MatchFailure [])

(defn check [bool]
  (when-not bool (throw (MatchFailure.))))

(defn run-match [node inputs actions]
  (assert (= 1 (count inputs)))
  (let [input (first inputs)]
    (loop [branches (:branches node)]
      (if-let [[{:keys [pattern inputs node]} & branches] (seq branches)]
        (try
          (let [vars #js {}]
            (run-match-pattern pattern input actions vars)
            (run-node node (map #(aget vars %) inputs) actions))
          (catch MatchFailure _
            (recur branches)))
        (throw (MatchFailure.))))))

(defn run-match-pattern [pattern input actions vars]
  (cond
   (= (:type pattern) :match/bind) (do (aset vars (:var pattern) input)
                                    (run-match-pattern (:pattern pattern) input actions vars))
   (:type pattern) (check (run-node pattern [input] actions))
   (or (number? pattern) (string? pattern)) (check (= pattern input))
   (or (nil? pattern) (sequential? pattern)) (if-let [[first-pattern & rest-pattern] (seq pattern)]
                                             (do (check (and (sequential? input) (seq input)))
                                               (let [[first-input & rest-input] input]
                                                 (run-match-pattern first-pattern first-input actions vars)
                                                 (run-match-pattern rest-pattern rest-input actions vars)))
                                             (check (empty? input)))
   (map? pattern) (do (check (map? input))
                   (doseq [[key val] pattern]
                     (check (contains? input key))
                     (run-match-pattern val (get input key) actions vars)))
   :otherwise (assert false)))

(def example-a
  {:type :pipe
   :inputs ["a" "b" "c"]
   :nodes [{:id "b-squared" :inputs ["b" "b"] :node {:type :cljs :fn *}}
           {:id "four" :inputs [] :node {:type :value :value 4}}
           {:id "four-a-c" :inputs ["four" "a" "c"] :node {:type :cljs :fn *}}
           {:id "result" :inputs ["b-squared" "four-a-c"] :node {:type :cljs :fn -}}]})

(defn bind [var pattern]
  {:type :match/bind
   :var var
   :pattern pattern})

(def example-b
  {:type :match
   :branches [{:pattern {"a" (bind "a" {:type :cljs :fn number?}) "b" (bind "b" {:type :cljs :fn number?})}
               :inputs ["a" "b"]
               :node {:type :cljs :fn -}}
              {:pattern [(bind "x" {:type :value :value true}) "foo"]
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
