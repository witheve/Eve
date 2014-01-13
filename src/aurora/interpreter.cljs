(ns aurora.interpreter)

;; interpreter

(defn run-pipe [program node inputs actions]
  (prn node inputs)
  (assert (= :pipe (:type node)))
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
  (condp = (:type pattern)
    :match/bind (do (aset vars (:var pattern) input)
                  (run-match-pattern program (:pattern pattern) input actions vars))
    :match/any nil
    :match/value (check (= input (:value pattern)))
    :match/vec (let [value (:value pattern)]
                 (check (vector? input))
                 (check (= (count input) (count value)))
                 (dotimes [i (count value)]
                   (run-match-pattern program (nth value i) (nth input i) actions vars)))
    :match/map (let [value (:value pattern)]
                 (check (map? input))
                 (doseq [key (keys value)]
                   (check (contains? input key))
                   (run-match-pattern program (get value key) (get input key) actions vars)))
    (check (run-node program pattern [input] actions))))

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

(def match-any
  {:type :match/any})

(defn match-value [value]
  {:type :match/value
   :value value})

(defn match-vector [& values]
  {:type :match/vec
   :value (into [] values)})

(defn match-map [& keys&values]
  {:type :match/map
   :value (into {} (map vec (partition 2 keys&values)))})

;; examples

(def example-a
  {"root" (pipe ["a" "b" "c"]
                "b-squared" ["b" "b"] (cljs-ref *)
                "four" [] (value 4)
                "four-a-c" ["four" "a" "c"] (cljs-ref *)
                "result" ["b-squared" "four-a-c"] (cljs-ref -))})

(def example-b
  {"root" (pipe ["x"]
                "result" ["x"] (match (match-map "a" (bind "a" (cljs-ref number?)) "b" (bind "b" (cljs-ref number?))) ["a" "b"] (cljs-ref -)
                                      (match-vector (bind "x" match-any) (match-value "foo")) ["x"] (cljs-ref identity)))})

(def example-c
  {"root" (pipe ["x"]
                "result" ["x"] (pipe-ref "even?"))
   "even?" (pipe ["x"]
                 "result" ["x"] (match (match-value 0) [] (value true)
                                       (bind "x" match-any) ["x"] (pipe-ref "even?not-0")))
   "even?not-0" (pipe ["x"]
                      "one" [] (value 1)
                      "x-1" ["x" "one"] (cljs-ref -)
                      "odd?" ["x-1"] (pipe-ref "odd?")
                      "result" ["odd?"] (cljs-ref not))
   "odd?" (pipe ["x"]
                "result" ["x"] (match (match-value 0) [] (value true)
                                      (bind "x" match-any) ["x"] (pipe-ref "odd?not-0")))
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
