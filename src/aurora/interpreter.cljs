(ns aurora.interpreter)

;; interpreter

(defrecord Cursor [path value])

(defn run-pipe [program node inputs stack]
  (let [vars #js {}
        calls #js []
        frame #js {:id (:id node) :vars vars :calls calls}]
    (.push stack frame) ; call
    (assert (= :pipe (:type node)))
    (doseq [[id value] (map vector (:inputs node) inputs)]
      (aset vars id value))
    (doseq [{:keys [id inputs node]} (:nodes node)]
      (assert (not= :pipe (:type node)) "No inline pipes")
      (aset vars id (run-node program node (map #(aget vars %) inputs) calls))) ; note calls, not stack
    (let [result (aget vars (-> node :nodes last :id))]
      (aset frame "result" result) ; return
      result)))

(defn run-node [program node inputs stack]
  (case (:type node)
    :data (run-data program node inputs stack)
    :match (run-match program node inputs stack)
    :ref (run-ref program node inputs stack)))

(defn run-data [program node inputs stack]
  (assert (empty? inputs))
  (Cursor. [] (run-data* program node inputs stack)))

(defn run-data* [program node inputs stack]
  (case (:kind node)
    :value (:value node)
    :vector (into []
                  (for [value (:value node)]
                    (run-data* program value inputs stack)))
    :map (into {}
               (for [[key value] (:value node)]
                 [(run-data* program key inputs stack) (run-data* program value inputs stack)]))))

(defn run-ref [program node inputs stack]
  (case (:kind node)
    :cljs (Cursor. [] (apply (:fn node) (map :value inputs)))
    :pipe (run-pipe program (get program (:id node)) inputs stack)))

(defrecord MatchFailure [])

(defn check [bool]
  (when-not bool (throw (MatchFailure.))))

(defn run-match [program node inputs stack]
  (assert (= 1 (count inputs)))
  (let [input (first inputs)]
    (loop [branches (:branches node)]
      (if-let [[{:keys [pattern inputs node]} & branches] (seq branches)]
        (try
          (let [vars #js {}]
            (run-match-pattern program pattern (:path input) (:value input) stack vars)
            (run-node program node (map #(aget vars %) inputs) stack))
          (catch MatchFailure _
            (recur branches)))
        (throw (MatchFailure.))))))

(defn run-match-pattern [program pattern input-path input-value stack vars]
  (condp = (:type pattern)
    :match/any nil
    :match/bind (do (aset vars (:var pattern) (Cursor. input-path input-value))
                  (run-match-pattern program (:pattern pattern) input-path input-value stack vars))
    :data (case (:kind pattern)
            :value (check (= input-value (:value pattern)))
            :vector (let [value (:value pattern)]
                      (check (vector? input-value))
                      (check (= (count input-value) (count value)))
                      (dotimes [i (count value)]
                        (run-match-pattern program (nth value i) (conj input-path i) (nth input-value i) stack vars)))
            :map (let [value (:value pattern)]
                   (check (map? input-value))
                   (doseq [key-pattern (keys value)]
                     (let [key (:value key-pattern)]
                       (check (contains? input-value key))
                       (run-match-pattern program (get value key-pattern) (conj input-path key) (get input-value key) stack vars)))))
    (check (:value (run-node program pattern [(Cursor. input-path input-value)] stack)))))

;; ast

(defn pipe [id inputs & nodes]
  {:type :pipe
   :id id
   :inputs inputs
   :nodes (for [[id inputs node] (partition 3 nodes)]
            {:id id :inputs inputs :node node})})

(defn data-value [x]
  {:type :data
   :kind :value
   :value x})

(defn data-vector [& values]
  {:type :data
   :kind :vector
   :value (into [] values)})

(defn data-map [& keys&values]
  {:type :data
   :kind :map
   :value (into {} (map vec (partition 2 keys&values)))})

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

(def any
  {:type :match/any})

;; examples

(def example-a
  #{(pipe "root" ["a" "b" "c"]
          "b-squared" ["b" "b"] (cljs-ref *)
          "four" [] (data-value 4)
          "four-a-c" ["four" "a" "c"] (cljs-ref *)
          "result" ["b-squared" "four-a-c"] (cljs-ref -))})

(def example-b
  #{(pipe "root" ["x"]
          "result" ["x"] (match (data-map (data-value "a") (bind "a" (cljs-ref number?)) (data-value "b") (bind "b" (cljs-ref number?))) ["a" "b"] (cljs-ref -)
                                      (data-vector (bind "x" any) (data-value "foo")) ["x"] (cljs-ref identity)))})

(def example-c
  #{(pipe "root" ["x"]
          "result" ["x"] (pipe-ref "even?"))
    (pipe "even?" ["x"]
          "result" ["x"] (match (data-value 0) [] (data-value true)
                                (bind "x" any) ["x"] (pipe-ref "even?not-0")))
    (pipe "even?not-0" ["x"]
          "one" [] (data-value 1)
          "x-1" ["x" "one"] (cljs-ref -)
          "odd?" ["x-1"] (pipe-ref "odd?")
          "result" ["odd?"] (cljs-ref not))
    (pipe "odd?" ["x"]
          "result" ["x"] (match (data-value 0) [] (data-value true)
                                (bind "x" any) ["x"] (pipe-ref "odd?not-0")))
    (pipe "odd?not-0" ["x"]
          "one" [] (data-value 1)
          "x-1" ["x" "one"] (cljs-ref -)
          "even?" ["x-1"] (pipe-ref "even?")
          "result" ["even?"] (cljs-ref not))})

(defn run-example [example inputs]
  (let [stack #js []
        program (into {} (for [pipe example] [(:id pipe) pipe]))]
    (try
      [(run-pipe program (get program "root") (map #(Cursor. [] %) inputs) stack) (aget stack 0)]
      (catch :default e [e (aget stack 0)]))))

(set! *print-meta* true)

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

(defn print-stack
  ([frame]
   (print-stack 0 frame))
  ([indent frame]
   (println (.join (make-array indent) " ") "=>" (.-id frame) (.-vars frame))
   (doseq [call (.-calls frame)]
     (print-stack (+ indent 2) call))
   (when (js* "('result' in ~{frame})") ; seriously?
     (println (.join (make-array indent) " ") "<=" (.-id frame) (.-result frame)))))

(defn print-example [example inputs]
  (let [[result stack] (run-example example inputs)]
    (print-stack stack)
    (println result)))

(print-example example-b [[1 "foo"]])
(print-example example-b [1 "foo"])
(print-example example-c [10])

