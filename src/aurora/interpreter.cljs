(ns aurora.interpreter)

(defn run-node [program node inputs actions]
  (prn node inputs)
  (case (:type node)
    :match (run-match program node inputs actions)
    :ref (run-ref program node inputs actions)
    :pipe (run-pipe program node inputs actions)))

(defn run-ref [program node inputs actions]
  (case (:kind node)
    :value (:value node)
    :cljs (apply (:fn node) inputs)
    :aurora (run-node program (get program (:id node)) inputs actions)))

(defn run-pipe [program node inputs actions]
  (let [vars #js {}]
    (doseq [[id value] (map vector (:inputs node) inputs)]
      (aset vars id value))
    (doseq [{:keys [id inputs node]} (:nodes node)]
      (assert (not= :pipe (:type node)) "No inline pipes")
      (aset vars id (run-node program node (map #(aget vars %) inputs) actions))
      (prn vars))
    (aget vars (-> node :nodes last :id))))

(defrecord MatchFailure [])

(defn check [bool]
  (when-not bool (throw (MatchFailure.))))

(defn run-match [program node inputs actions]
  (assert (= 1 (count inputs)))
  (let [input (first inputs)]
    (loop [branches (:branches node)]
      (if-let [[{:keys [pattern inputs node]} & branches] (seq branches)]
        (try
          (let [vars #js {}]
            (run-match-pattern program pattern input actions vars)
            (run-node program node (map #(aget vars %) inputs) actions))
          (catch MatchFailure _
            (recur branches)))
        (throw (MatchFailure.))))))

(defn run-match-pattern [program pattern input actions vars]
  (cond
   (= (:type pattern) :match/bind) (do (aset vars (:var pattern) input)
                                    (run-match-pattern program (:pattern pattern) input actions vars))
   (:type pattern) (check (run-node program pattern [input] actions))
   (or (number? pattern) (string? pattern)) (check (= pattern input))
   (or (nil? pattern) (sequential? pattern)) (if-let [[first-pattern & rest-pattern] (seq pattern)]
                                             (do (check (and (sequential? input) (seq input)))
                                               (let [[first-input & rest-input] input]
                                                 (run-match-pattern program first-pattern first-input actions vars)
                                                 (run-match-pattern program rest-pattern rest-input actions vars)))
                                             (check (empty? input)))
   (map? pattern) (do (check (map? input))
                   (doseq [[key val] pattern]
                     (check (contains? input key))
                     (run-match-pattern program val (get input key) actions vars)))
   :otherwise (assert false)))

(defn bind [var pattern]
  {:type :match/bind
   :var var
   :pattern pattern})

(def example-a
  {"root" {:type :pipe
           :inputs ["a" "b" "c"]
           :nodes [{:id "b-squared" :inputs ["b" "b"] :node {:type :ref :kind :cljs :name *}}
                   {:id "four" :inputs [] :node {:type :ref :kind :value :value 4}}
                   {:id "four-a-c" :inputs ["four" "a" "c"] :node {:type :ref :kind :cljs :fn *}}
                   {:id "result" :inputs ["b-squared" "four-a-c"] :node {:type :ref :kind :cljs :fn -}}]}})

(def example-b
  {"root" {:type :match
           :branches [{:pattern {"a" (bind "a" {:type :ref :kind :cljs :fn number?}) "b" (bind "b" {:type :ref :kind :cljs :fn number?})}
                       :inputs ["a" "b"]
                       :node {:type :ref :kind :cljs :fn -}}
                      {:pattern [(bind "x" {:type :ref :kind :value :value true}) "foo"]
                       :inputs ["x" "y"]
                       :node {:type :ref :kind :cljs :fn identity}}]}})

(def example-c
  {"root" {:type :ref :kind :aurora :id "even?"}
   "even?" {:type :match
            :branches [{:pattern 0
                        :inputs []
                        :node {:type :ref :kind :value :value true}}
                       {:pattern (bind "x" {:type :ref :kind :value :value true})
                        :inputs ["x"]
                        :node {:type :ref :kind :aurora :id "even?not-0"}}]}
   "even?not-0" {:type :pipe
                 :inputs ["x"]
                 :nodes [{:id "one" :inputs [] :node {:type :ref :kind :value :value 1}}
                         {:id "x-1" :inputs ["x" "one"] :node {:type :ref :kind :cljs :fn -}}
                         {:id "result" :inputs ["x-1"] :node {:type :ref :kind :aurora :id "odd?"}}]}
   "odd?" {:type :match
           :branches [{:pattern 0
                       :inputs []
                       :node {:type :ref :kind :value :value false}}
                      {:pattern (bind "x" {:type :ref :kind :value :value true})
                       :inputs ["x"]
                       :node {:type :ref :kind :aurora :id "odd?not-0"}}]}
   "odd?not-0" {:type :pipe
                :inputs ["x"]
                :nodes [{:id "one" :inputs [] :node {:type :ref :kind :value :value 1}}
                        {:id "x-1" :inputs ["x" "one"] :node {:type :ref :kind :cljs :fn -}}
                        {:id "result" :inputs ["x-1"] :node {:type :ref :kind :aurora :id "even?"}}]}})

(defn run-example [example inputs]
  (try
    (run-node example (get example "root") inputs nil)
    (catch MatchFailure e e)))

(run-example example-a [1 4 2])

(run-example example-b [{"a" 1 "b" 2}])
(run-example example-b [{"a" 1 "c" 2}])
(run-example example-b [{"a" 1 "b" "foo"}])
(run-example example-b [[1 "foo"]])
(run-example example-b [[1 2]])

(run-example example-c [0])
(run-example example-c [1])
(run-example example-c [7])
(run-example example-c [10])
