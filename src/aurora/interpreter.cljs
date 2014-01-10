(ns aurora.interprer)

(declare run-node)

(defn run-value [node inputs actions]
  (:value node))

(defn run-cljs [node inputs actions]
  (apply (:fn node) inputs))

(defn run-pipe [node inputs actions]
  (let [vars #js {}]
    (doseq [[id value] (map vector (:inputs node) inputs)]
      (aset vars id value))
    (doseq [[id node-inputs node] (:nodes node)]
      (aset vars id (run-node node (map #(aget vars %) node-inputs) actions))

      (prn vars))
    (aget vars (-> node :nodes last first))))

(defn run-node [node inputs actions]
  (:type node)
  (let [output(case (:type node)
                :value (run-value node inputs actions)
                :cljs (run-cljs node inputs actions)
                :pipe (run-pipe node inputs actions))]
    (prn output)
    output))

(def example
  {:type :pipe
   :inputs ["a" "b" "c"]
   :nodes [["b-squared" ["b" "b"] {:type :cljs :fn *}]
           ["four" [] {:type :value :value 4}]
           ["four-a-c" ["four" "a" "c"] {:type :cljs :fn *}]
           ["result" ["b-squared" "four-a-c"] {:type :cljs :fn -}]]})

(run-node example [1 4 2] nil)
