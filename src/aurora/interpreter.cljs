(ns aurora.interpreter)

;; interpreter

(defn run-pipe [program node inputs actions]
  (prn node inputs)
  (let [vars #js {}]
    (doseq [[id value] (map vector (:inputs node) inputs)]
      (aset vars id value))
    (doseq [{:keys [id inputs node]} (:nodes node)]
      (assert (not= :pipe (:type node)) "No inline pipes")
      (aset vars id (run-node program node (map #(aget vars %) inputs) actions))
      (prn vars))
    (aget vars (-> node :nodes last :id))))

(defn run-node [program node inputs actions]
  (case (:type node)
    :value (run-value program node inputs actions)
    :match (run-match program node inputs actions)
    :ref (run-ref program node inputs actions)))

(defn run-value [program node inputs actions]
  (:value node))

(defn run-ref [program node inputs actions]
  (case (:kind node)
    :cljs (apply (:fn node) inputs)
    :pipe (run-pipe program (get program (:id node)) inputs actions)))

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

;; ast

(defn pipe [inputs & nodes]
  {:type :pipe
   :inputs inputs
   :nodes (for [[id inputs node] (partition 3 nodes)]
            {:id id :inputs inputs :node node})})

(defn value [x]
  {:type :value :value x})

(defn cljs-ref [fn]
  {:type :ref :kind :cljs :fn fn})

(defn pipe-ref [id]
  {:type :ref :kind :pipe :id id})

(defn match [& branches]
  {:type :match
   :branches (for [[pattern inputs node] (partition 3 branches)]
               {:pattern pattern :inputs inputs :node node})})

(defn bind [var pattern]
  {:type :match/bind
   :var var
   :pattern pattern})

;; examples

(def example-a
  {"root" (pipe ["a" "b" "c"]
                "b-squared" ["b" "b"] (cljs-ref *)
                "four" [] (value 4)
                "four-a-c" ["four" "a" "c"] (cljs-ref *)
                "result" ["b-squared" "four-a-c"] (cljs-ref -))})

(def example-b
  {"root" (pipe ["x"]
                "result" ["x"] (match {"a" (bind "a" (cljs-ref number?)) "b" (bind "b" (cljs-ref number?))} ["a" "b"] (cljs-ref -)
                                      [(bind "x" (value true)) "foo"] ["x"] (cljs-ref identity)))})

(def example-c
  {"root" (pipe-ref "even?")
   "even?" (pipe ["x"]
                 "result" ["x"] (match 0 [] (value true)
                                       (bind "x" (value true)) ["x"] (pipe-ref "even?not-0")))
   "even?not-0" (pipe ["x"]
                      "one" [] (value 1)
                      "x-1" ["x" "one"] (cljs-ref -)
                      "odd?" ["x-1"] (pipe-ref "odd?")
                      "result" ["odd?"] (cljs-ref not))
   "odd?" (pipe ["x"]
                "result" ["x"] (match 0 [] (value true)
                                      (bind "x" (value true)) ["x"] (pipe-ref "odd?not-0")))
   "odd?not-0" (pipe ["x"]
                     "one" [] (value 1)
                     "x-1" ["x" "one"] (cljs-ref -)
                     "even?" ["x-1"] (pipe-ref "even?")
                     "result" ["even?"] (cljs-ref not))})

(defn run-example [example inputs]
  (try
    (run-pipe example (get example "root") inputs nil)
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
