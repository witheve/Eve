(ns aurora.compiler
  (:require [clojure.string :refer [join]]
            [aurora.interpreter :as i]))

(defn id->value [id]
  (str "value_" id))

(defn id->cursor [id]
  (str "cursor_" id))

(defn id->pipe [id]
  (str "pipe_" id))

(let [next (atom 0)]
  (defn id []
    (str (swap! next inc))))

(let [next (atom 0)]
  (defn scratch-id []
    (str "scratch_" (swap! next inc))))

(defn program+scope [program])

(defn program->js [program]
  (str
   "(function () {\n"
   "var program = {}; var failure = \"MatchFailure!\";\n\n"
   (join "\n\n" (map pipe->js program)) "\n\n"
   "return program;\n"
   "}());"))

(defn pipe->js [pipe]
  (str (pipe->js* pipe) "\n"
       "program." (id->pipe (:id pipe)) " = " (id->pipe (:id pipe))))

(defn pipe->js* [pipe]
  (let [name (id->pipe (:id pipe))
        args (interleave
              (map id->value (:inputs pipe))
              (map id->cursor (:inputs pipe)))
        steps (for [node (:nodes pipe)]
                (step->js (:id node) (:inputs node) (:node node)))
        return (-> pipe :nodes last :id)]
    (str "function " name "(" (join ", " args) ") {\n"
         (join "\n\n" steps)
         "return [" (id->value return) ", " (id->cursor return) "];\n"
         "}")))

(defn step->js [id inputs node]
  (case (:type node)
    :data (data->js id inputs node)
    :ref (ref->js id inputs node)
    :replace (replace->js id inputs node)
    :output (output->js id inputs node)
    :match (match->js id inputs node)))

(defn data->js [id inputs node]
  (str "var " (id->value id) " = " (data->js* node) ";\n"
       "var " (id->cursor id) " = null;"))

(defn data->js* [node]
  (case (:kind node)
    :value (pr-str (:value node))
    :vector (str "cljs.core.PersistentVector.fromArray(["
                 (join ", " (map data->js* (:value node))) "])")
    :map (str "cljs.core.PersistentHashMap.fromArrays(["
              (join ", " (map data->js* (keys (:value node))))
              "], ["
              (join ", " (map data->js* (vals (:value node)))) "])")))

(defn ref->js [id inputs node]
  (case (:kind node)
    :cljs (str "var " (id->value id) " = " (-> node :fn meta :name) ".call(null, " (join ", " (map id->value inputs)) ");\n"
               "var " (id->cursor id) " = null;")
    :pipe (let [scratch (scratch-id)]
            (str "var " scratch " = " (id->pipe (:id node)) "(" (join ", " (interleave (map id->value inputs) (map id->cursor inputs))) ");\n"
                 "var " (id->value id) " = " scratch "[0];\n"
                 "var " (id->cursor id) " = " scratch "[1];"))))

(defn replace->js [id inputs node]
  ;; TODO check cursor is not nil
  (str "program.next_state = cljs.core.assoc_in.call(null, program.next_state, " (id->cursor (first inputs)) ", " (id->value (second inputs)) ");\n"
       "var " (id->value id) " = null;\n"
       "var " (id->cursor id) " = null;"))

(defn output->js [id inputs node]
  (str "program.next_state = cljs.core.update_in.call(null, program.next_state, " (data->js* (:path node)) ", cljs.core.conj, " (id->value (first inputs)) ");"))

(defn match->js [id inputs node]
  (let [input (first inputs)
        scratch (scratch-id)]
    (reduce
     (fn [tail branch]
       (str "try {\n"
            (pattern->js input (:pattern branch)) "\n"
            (case (:type (:node branch))
              :match/return (str "var " (id->value id) " = " (id->value (first (:inputs branch))) ";\n"
                                 "var " (id->cursor id) " = " (id->cursor (first (:inputs branch))) ";\n")
              (step->js id (:inputs branch) (:node branch))) "\n"
            "} catch (" scratch ") {\n"
            "if (" scratch " === failure) {\n"
            tail "\n"
            "} else {throw " scratch "}\n"
            "}"))
     "throw failure;"
     (reverse (:branches node)))))

(defn pattern->js [input pattern]
  (case (:type pattern)
    :match/any ""
    :match/bind (str "var " (id->value (:var pattern)) " = " (id->value input) ";\n"
                     "var " (id->cursor (:var pattern)) " = " (id->cursor input) ";\n"
                     (pattern->js input (:pattern pattern)))
    :data (case (:kind pattern)
            :value (check->js (str (id->value input) " == " (pr-str (:value pattern))))
            :vector (let [vector (:value pattern)]
                      (apply str
                             (check->js (str "cljs.core.vector_QMARK_.call(null, " (id->value input) ")")) "\n"
                             (check->js (str "cljs.core.count.call(null, " (id->value input) ") == " (count vector))) "\n"
                             (for [i (range (count vector))]
                               (let [elem-scratch (scratch-id)]
                                 (str "var " (id->value elem-scratch) " = cljs.core.nth.call(null, " (id->value input) ", " (str i) ");\n"
                                      "var " (id->cursor elem-scratch) " = cljs.core.conj.call(null, " (id->cursor input) ", " (str i) ");\n"
                                      (pattern->js elem-scratch (nth vector i)) "\n")))))
            :map (let [map (:value pattern)]
                   (apply str
                          (check->js (str "cljs.core.map_QMARK_.call(null, " (id->value input) ")")) "\n"
                          (for [key (keys map)]
                            (let [key-scratch (scratch-id)
                                  value-scratch (scratch-id)]
                              (str "var " key-scratch " = " (data->js* key) ";\n"
                                   (check->js (str "cljs.core.contains_QMARK_.call(null, " (id->value input) ", " key-scratch ")")) "\n"
                                   "var " (id->value value-scratch) " = cljs.core.get.call(null, " (id->value input) ", " key-scratch ");\n"
                                   "var " (id->cursor value-scratch) " = cljs.core.conj.call(null, " (id->cursor input) ", " key-scratch ");\n"
                                   (pattern->js value-scratch (get map key))))))))
    (let [return-scratch (scratch-id)]
      (str
       (step->js return-scratch [input] pattern) "\n"
       (check->js (id->value return-scratch)) "\n"))))

(defn check->js [pred]
  (str "if (!(" pred ")) {throw failure;};"))

(println (program->js i/example-a))
(js/eval (program->js i/example-a))

(defn run-example [example state]
  (let [source (program->js example)
        _ (println "###################")
        _ (println source)
        program (js/eval source)]
    (aset program "next_state" state)
    (try
      [(.pipe_root program state []) (.-next_state program)]
      (catch :default e e))))

(defn tick-example [example state]
  (second (run-example example state)))

(run-example i/example-b {"a" 1 "b" 2})
(run-example i/example-b {"a" 1 "c" 2})
(run-example i/example-b {"a" 1 "b" "foo"})
(run-example i/example-b [1 "foo"])
(run-example i/example-b [1 2])

(run-example i/example-c 0)
(run-example i/example-c 1)
(run-example i/example-c 7)
(run-example i/example-c 10)

(run-example i/example-d {"counter" 0})

(run-example i/example-e {"counter" 0 "started?" "false"})
