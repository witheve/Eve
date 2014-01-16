(ns aurora.interpreter)

;; todo

;; efficient implementation of stack queries (maybe only compile the watched fn?)
;; efficient implementation of cursors (maybe via side-vars)

;; interpreter

(defrecord Cursor [path value])

(defn run-pipe [id->node node inputs output stack]
  (let [vars #js {}
        calls #js []
        frame #js {:id (:id node) :vars vars :calls calls}]
    (.push stack frame) ; call
    (assert (= :pipe (:type node)))
    (doseq [[id value] (map vector (:inputs node) inputs)]
      (aset vars id value))
    (doseq [{:keys [id inputs node]} (:nodes node)]
      (assert (not= :pipe (:type node)) "No inline pipes")
      (aset vars id (run-node id->node node (map #(aget vars %) inputs) output calls))) ; note calls, not stack
    (let [result (aget vars (-> node :nodes last :id))]
      (aset frame "result" result) ; return
      result)))

(defn run-node [id->node node inputs output stack]
  (case (:type node)
    :return (run-return id->node node inputs output stack)
    :data (run-data id->node node inputs output stack)
    :ref (run-ref id->node node inputs output stack)
    :match (run-match id->node node inputs output stack)
    :replace (run-replace id->node node inputs output stack)
    :output (run-output id->node node inputs output stack)))

(defn run-return [id->node node inputs output stack]
  (assert (= 1 (count inputs)))
  (first inputs))

(defn run-data [id->node node inputs output stack]
  (assert (empty? inputs))
  (Cursor. [] (run-data* id->node node inputs output stack)))

(defn run-data* [id->node node inputs output stack]
  (case (:kind node)
    :value (:value node)
    :vector (into []
                  (for [value (:value node)]
                    (run-data* id->node value inputs output stack)))
    :map (into {}
               (for [[key value] (:value node)]
                 [(run-data* id->node key inputs output stack) (run-data* id->node value inputs output stack)]))))

(defn run-ref [id->node node inputs output stack]
  (case (:kind node)
    :cljs (Cursor. [] (apply (:fn node) (map :value inputs)))
    :pipe (run-pipe id->node (get id->node (:id node)) inputs output stack)))

(defrecord MatchFailure [])

(defn check [bool]
  (when-not bool (throw (MatchFailure.))))

(defn run-match [id->node node inputs output stack]
  (assert (= 1 (count inputs)))
  (let [input (first inputs)]
    (loop [branches (:branches node)]
      (if-let [[{:keys [pattern inputs node]} & branches] (seq branches)]
        (try
          (let [vars #js {}]
            (run-match-pattern id->node pattern (:path input) (:value input) output stack vars)
            (run-node id->node node (map #(aget vars %) inputs) output stack))
          (catch MatchFailure _
            (recur branches)))
        (throw (MatchFailure.))))))

(defn run-match-pattern [id->node pattern input-path input-value output stack vars]
  (condp = (:type pattern)
    :match/any nil
    :match/bind (do (aset vars (:var pattern) (Cursor. input-path input-value))
                  (run-match-pattern id->node (:pattern pattern) input-path input-value output stack vars))
    :data (case (:kind pattern)
            :value (check (= input-value (:value pattern)))
            :vector (let [value (:value pattern)]
                      (check (vector? input-value))
                      (check (= (count input-value) (count value)))
                      (dotimes [i (count value)]
                        (run-match-pattern id->node (nth value i) (conj input-path i) (nth input-value i) output stack vars)))
            :map (let [value (:value pattern)]
                   (check (map? input-value))
                   (doseq [key-pattern (keys value)]
                     (let [key (:value key-pattern)]
                       (check (contains? input-value key))
                       (run-match-pattern id->node (get value key-pattern) (conj input-path key) (get input-value key) output stack vars)))))
    (check (:value (run-node id->node pattern [(Cursor. input-path input-value)] output stack)))))

(defn run-replace [id->node node inputs output stack]
  (swap! output assoc-in (:path (first inputs)) (:value (second inputs))))

(defn run-output [id->node node inputs output stack]
  (swap! output update-in (:path node) cons (:value (first inputs))))

(assoc-in {} [] :foo)

;; ast

(def return
  {:type :return})

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

(def replace
  {:type :replace})

(defn output [path]
  {:type :output
   :path path})

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
                                      (data-vector (bind "x" any) (data-value "foo")) ["x"] return))})

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

(def example-d
  #{(pipe "root" ["x"]
          "c" ["x"] (match (data-map (data-value "counter") (bind "c" any)) ["c"] return)
          "one" [] (data-value 1)
          "c+1" ["c" "one"] (cljs-ref +)
          "nil" ["c" "c+1"] replace)})

(defn run-example [example this-state]
  (let [stack #js []
        id->node (into {} (for [pipe example] [(:id pipe) pipe]))
        next-state (atom state)
        result (run-pipe id->node (get id->node "root") [(Cursor. [] this-state)] next-state stack)]
    (try
      [result @next-state (aget stack 0)]
      (catch :default exception
        [exception @next-state (aget stack 0)]))))

(defn step-example [example watchers input]
  (let [[_ output _] (run-example example input)]
    (doseq [watcher watchers]
      (watcher (:output output)))
    (dissoc output :output)))

(run-example example-b {"a" 1 "b" 2})
(run-example example-b {"a" 1 "c" 2})
(run-example example-b {"a" 1 "b" "foo"})
(run-example example-b [1 "foo"])
(run-example example-b [1 2])

(run-example example-c 0)
(run-example example-c 1)
(run-example example-c 7)
(run-example example-c 10)

(run-example example-d {"counter" 0})

(step-example example-d [] {"counter" 0})

(take 10 (iterate #(step-example example-d [] %) {"counter" 0}))

(defn print-stack
  ([frame]
   (print-stack 0 frame))
  ([indent frame]
   (println (.join (make-array indent) " ") "=>" (.-id frame) (.-vars frame))
   (doseq [call (.-calls frame)]
     (print-stack (+ indent 2) call))
   (when (js* "('result' in ~{frame})") ; seriously?
     (println (.join (make-array indent) " ") "<=" (.-id frame) (.-result frame)))))

(defn print-example [example input]
  (let [[result output stack] (run-example example input)]
    (print-stack stack)
    (println output)
    (println result)))

(print-example example-b [1 "foo"])
(print-example example-b 1)
(print-example example-c 10)

