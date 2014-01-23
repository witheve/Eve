(ns aurora.interpreter)

;; todo

;; efficient implementation of stack queries (maybe only compile the watched fn?)
;; efficient implementation of cursors (maybe via side-vars)
;; passing a copy of vars into run-match is a messy hack

;; interpreter

(defrecord Cursor [path value])

(defn run-pipe [id->node node inputs output stack]
  (let [vars #js {}
        calls #js []
        frame #js {:id (:id node) :vars vars :calls calls :inputs inputs :output @output}]
    (.push stack frame) ; call
    (assert (= :pipe (:type node)))
    (doseq [[id value] (map vector (:inputs node) inputs)]
      (aset vars id value))
    (doseq [{:keys [id inputs node]} (:nodes node)]
      (assert (not= :pipe (:type node)) "No inline pipes")
      (aset vars id (run-node id->node node (map #(aget vars %) inputs) output calls vars))) ; note calls, not stack ; not passing vars is a hack
    (let [result (aget vars (-> node :nodes last :id))]
      (aset frame "result" result) ; return
      result)))

(defn run-node [id->node node inputs output stack vars]
  (case (:type node)
    :data (run-data id->node node inputs output stack)
    :ref (run-ref id->node node inputs output stack)
    :match (run-match id->node node inputs output stack vars)
    :replace (run-replace id->node node inputs output stack)
    :output (run-output id->node node inputs output stack)))

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

(defn run-match [id->node node inputs output stack vars]
  (assert (= 1 (count inputs)))
  (let [input (first inputs)]
    (loop [branches (:branches node)]
      (if-let [[{:keys [pattern inputs node]} & branches] (seq branches)]
        (try
          (run-match-pattern id->node pattern (:path input) (:value input) output stack vars)
          (case (:type node)
            :match/return (do (assert (= 1 (count inputs)))
                            (aget vars (first inputs)))
            (run-node id->node node (map #(aget vars %) inputs) output stack vars))
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
    (check (:value (run-node id->node pattern [(Cursor. input-path input-value)] output stack #js {})))))

(defn run-replace [id->node node inputs output stack]
  (swap! output assoc-in (:path (first inputs)) (:value (second inputs))))

(defn run-output [id->node node inputs output stack]
  (swap! output update-in (:path node) conj (:value (first inputs))))

;; ast

(defn pipe [id inputs & nodes]
  {:type :pipe
   :id id
   :inputs inputs
   :nodes (vec (for [[id inputs node] (partition 3 nodes)]
                 {:id id :inputs inputs :node node}))})

(defn data-value [x]
  {:type :data
   :kind :value
   :value x})

(defn data-vector [& values]
  {:type :data
   :tags #{:vector}
   :kind :vector
   :value (into [] values)})

(defn data-map [& keys&values]
  {:type :data
   :tags #{:map}
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

(def return
  {:type :match/return})

(def replace
  {:type :replace})

(defn output [path]
  {:type :output
   :path path})

;; examples

(def example-a
  #{(pipe "root" ["a" "b" "c"]
          "b_squared" ["b" "b"] (cljs-ref *)
          "four" [] (data-value 4)
          "four_a_c" ["four" "a" "c"] (cljs-ref *)
          "result" ["b_squared" "four_a_c"] (cljs-ref -))})

(def example-b
  #{(pipe "root" ["x"]
          "result" ["x"] (match (data-map (data-value "a") (bind "a" (cljs-ref number?)) (data-value "b") (bind "b" (cljs-ref number?))) ["a" "b"] (cljs-ref -)
                                (data-vector (bind "y" any) (data-value "foo")) ["y"] return))})

(def example-c
  #{(pipe "root" ["x"]
          "result" ["x"] (pipe-ref "even_"))
    (pipe "even_" ["x"]
          "result" ["x"] (match (data-value 0) [] (data-value "true")
                                (bind "x1" any) ["x1"] (pipe-ref "even_not_0")))
    (pipe "even_not_0" ["x"]
          "one" [] (data-value 1)
          "x_1" ["x" "one"] (cljs-ref -)
          "odd_" ["x_1"] (pipe-ref "odd_")
          "result" ["odd_"] (pipe-ref "not"))
    (pipe "odd_" ["x"]
          "result" ["x"] (match (data-value 0) [] (data-value "true")
                                (bind "x1" any) ["x1"] (pipe-ref "odd_not_0")))
    (pipe "odd_not_0" ["x"]
          "one" [] (data-value 1)
          "x_1" ["x" "one"] (cljs-ref -)
          "even_" ["x_1"] (pipe-ref "even_")
          "result" ["even_"] (pipe-ref "not"))
    (pipe "not" ["x"]
          "result" ["x"] (match (data-value "true") [] (data-value "false")
                                (data-value "false") [] (data-value "true")))})

(def example-c-mappified
  {"root" (assoc (pipe "root" ["x"]
                       "result" ["x"] (pipe-ref "even?"))
            :desc "interpreter example c"
            :tags #{:page})
   "even?" (pipe "even?" ["x"]
                  "result" ["x"] (match (data-value 0) [] (data-value true)
                                        (bind "x" any) ["x"] (pipe-ref "even?not-0")))
   "even?not-0" (assoc (pipe "even?not-0" ["x"]
                            "one" [] (data-value 1)
                            "x-1" ["x" "one"] (cljs-ref -)
                            "odd?" ["x-1"] (pipe-ref "odd?")
                            "result" ["odd?"] (cljs-ref not))
                  :desc "example c even? not 0"
                  :tags #{:page})
   "odd?" (pipe "odd?" ["x"]
                "result" ["x"] (match (data-value 0) [] (data-value true)
                                      (bind "x" any) ["x"] (pipe-ref "odd?not-0")))
   "odd?not-0" (pipe "odd?not-0" ["x"]
                     "one" [] (data-value 1)
                     "x-1" ["x" "one"] (cljs-ref -)
                     "even?" ["x-1"] (pipe-ref "even?")
                     "result" ["even?"] (cljs-ref not))})

(def example-d
  #{(pipe "root" ["x"]
          "c" ["x"] (match (data-map (data-value "counter") (bind "c" any)) ["c"] return)
          "one" [] (data-value 1)
          "c_1" ["c" "one"] (cljs-ref +)
          "nil" ["c" "c_1"] replace)})

(def example-e
  #{(pipe "root" ["root"]
          "result" ["root"] (match (data-map (data-value "started_") (bind "started_" (data-value "false"))) ["started_"] (pipe-ref "start")
                                   any ["root"] (pipe-ref "wait")))
    (pipe "start" ["started_"]
          "timer" [] (data-map (data-value "cursor") (data-vector (data-value "ready")) (data-value "timeout") (data-value 1000))
          "result" ["timer"] (output (data-vector (data-value "output") (data-value "timeout")))
          "true" [] (data-value "true")
          "foo" ["started_" "true"] replace)
    (pipe "wait" ["root"]
          "result" ["root"] (match (data-map (data-value "ready") (bind "ready" (data-value "timeout"))) ["root" "ready"] (pipe-ref "go")
                                   any [] (data-value "ok")))
    (pipe "go" ["root" "ready"]
          "false" [] (data-value "false")
          "foo" ["ready" "false"] replace
          "c" ["root"] (match (data-map (data-value "counter") (bind "cc" any)) ["cc"] return)
          "one" [] (data-value 1)
          "c_1" ["c" "one"] (cljs-ref +)
          "nil" ["c" "c_1"] replace)})

(defn run-example [example this-state]
  (let [stack #js []
        id->node (into {} (for [pipe example] [(:id pipe) pipe]))
        next-state (atom this-state)]
    (try
      (let [result (run-pipe id->node (get id->node "root") [(Cursor. [] this-state)] next-state stack)]
        [result @next-state (aget stack 0)])
      (catch MatchFailure exception
        [exception @next-state (aget stack 0)]))))

(defn step-example [example watchers this-state]
  (let [stack #js []
        id->node (into {} (for [pipe example] [(:id pipe) pipe]))
        next-state (atom this-state)
        result (run-pipe id->node (get id->node "root") [(Cursor. [] this-state)] next-state stack)]
    (dissoc
     (reduce
      (fn [state watcher] (watcher state))
      @next-state
      watchers)
     "output")))

(defn watch-timeout* [buffer state]
  (doseq [{:strs [cursor timeout]} (get-in state ["output" "timeout"])]
    (js/setTimeout (fn [] (swap! buffer conj cursor)) timeout))
  (let [cursors @buffer] ;; this is only valid because js is single-threaded
    (reset! buffer nil)
    (reduce #(assoc-in %1 %2 "timeout") state cursors)))

(defn watch-timeout []
  (let [buffer (atom [])]
    #(watch-timeout* buffer %)))

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

(let [wt (watch-timeout)]
  (take 10 (iterate #(step-example example-d [wt] %) {"counter" 0})))

(run-example example-e {"counter" 0})

(run-example example-e {"counter" 0 "started?" "false"})

(let [wt (watch-timeout)]
  (nth (iterate #(step-example example-e [wt] %) {"counter" 0 "started?" "false"}) 2000))

(def buffer (atom []))
(def wt #(watch-timeout* buffer %))
(def s0 {"counter" 0 "started?" "false"})
(def s1 (step-example example-e [wt] s0))
(def s2 (step-example example-e [wt] s1))
(def s3 (step-example example-e [wt] s2))

(defn print-stack
  ([frame]
   (print-stack 0 frame))
  ([indent frame]
   (println (.join (make-array indent) " ") "=>" (.-id frame) (.-vars frame) (.-inputs frame) (.-output frame))
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
(print-example example-d {"counter" 0})
(print-example example-e {"counter" 0})
(print-example example-e s2)


;;Set some metadata on the cljs functions we use so we can display them
;;this should be removed later since these should really be wrapped in languages or turned into
;;aurora ops of some kind

(extend-type function
  Fn
  IMeta
  (-meta [this] (.-meta this)))

(alter-meta! + assoc :desc "Add " :name "cljs.core._PLUS_")
(alter-meta! - assoc :desc "Subtract " :name "cljs.core._")
(alter-meta! * assoc :desc "Multiply " :name "cljs.core._STAR_")
(alter-meta! / assoc :desc "Divide " :name "cljs.core._SLASH_")

(alter-meta! number? assoc :desc "Is a number? " :name "cljs.core.number_QMARK_")
