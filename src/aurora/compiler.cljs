(ns aurora.compiler
  (:require [aurora.jsth :as jsth]
            [aurora.interpreter :as i]))

;; compiler

(let [next (atom 0)]
  (defn new-id []
    (if js/window.uuid
      (js/uuid)
      (swap! next inc))))

(defn id->value [id]
  (symbol (str "value_" id)))
(defn id->cursor [id]
  (symbol (str "cursor_" id)))
(defn id->scratch [id]
  (symbol (str "scratch_" id)))
(defn id->pipe [id]
  (symbol (str "pipe_" id)))

(defn program->js [program]
  `(fn nil []
     (do
       (let! program {})
       (let! failure "MatchFailure!")
       ~@(map pipe->js program))
     program))

(defn pipe->js [pipe]
  `(do
     ~(pipe->js* pipe)
     (set! (.. program ~(id->pipe (:id pipe))) ~(id->pipe (:id pipe)))))

(defn pipe->js* [pipe]
  (let [args (apply concat
                    (for [input (:inputs pipe)]
                      `[~(id->value input) ~(id->cursor input)]))
        steps (for [node (:nodes pipe)]
                (step->js (:id node) (:inputs node) (:node node)))
        return (-> pipe :nodes last :id)]
    `(fn ~(id->pipe (:id pipe)) [~@args]
       (do ~@steps)
       [~(id->value return) ~(id->cursor return)])))

(defn step->js [id inputs node]
  (case (:type node)
    :data (data->js id inputs node)
    :ref (ref->js id inputs node)
    :replace (replace->js id inputs node)
    :output (output->js id inputs node)
    :match (match->js id inputs node)))

(defn data->js [id inputs node]
  `(do
     (let! ~(id->value id) ~(data->js* node))
     (let! ~(id->cursor id) nil)))

(defn data->js* [node]
  (case (:kind node)
    :value `(edn ~(:value node))
    :vector `(edn ~(into [] (map data->js* (:value node))))
    :map `(edn ~(into {} (map vector (map data->js* (keys (:value node))) (map data->js* (vals (:value node))))))))

(defn ref->js [id inputs node]
  (case (:kind node)
    :cljs `(do
             (let! ~(id->value id) (~(-> node :fn meta :name symbol) ~@(map id->value inputs)))
             (let! ~(id->cursor id) nil))
    :pipe (let [result (new-id)]
            `(do
               (let! ~(id->scratch result) (~(id->pipe (:id node)) ~@(apply concat (for [input inputs] `[~(id->value input) ~(id->cursor input)]))))
               (let! ~(id->value id) (get! ~(id->scratch result) 0))
               (let! ~(id->cursor id) (get! ~(id->scratch result) 1))))))

(defn replace->js [id inputs node]
  ;; TODO check cursor is not nil
  `(do
     (set! program.next_state (cljs.core.assoc_in program.next_state ~(id->cursor (first inputs)) ~(id->value (second inputs))))
     (let! ~(id->value id) nil)
     (let! ~(id->cursor id) nil)))

(defn output->js [id inputs node]
  `(do
     (set! program.next_state (cljs.core.update_in program.next_state ~(data->js* (:path node)) cljs.core.conj ~(id->value (first inputs))))
     (let! ~(id->value id) nil)
     (let! ~(id->cursor id) nil)))

(defn match->js [id inputs node]
  (let [input (first inputs)
        exception (new-id)]
    (reduce
     (fn [tail branch]
       `(try
          (do
            ~(pattern->js input (:pattern branch))
            ~(case (:type (:node branch))
               :match/return `(do
                                (let! ~(id->value id) ~(id->value (first (:inputs branch))))
                                (let! ~(id->cursor id) ~(id->cursor (first (:inputs branch)))))
               (step->js id (:inputs branch) (:node branch))))
          (catch ~(id->scratch exception)
            (if (== ~(id->scratch exception) failure)
              ~tail
              (throw ~(id->scratch exception))))))
     `(throw failure)
     (reverse (:branches node)))))

(defn pattern->js [input pattern]
  (case (:type pattern)
    :match/any `(do)
    :match/bind `(do
                   (let! ~(id->value (:var pattern)) ~(id->value input))
                   (let! ~(id->cursor (:var pattern)) ~(id->cursor input))
                   ~(pattern->js input (:pattern pattern)))
    :data (case (:kind pattern)
            :value (check->js `(= ~(id->value input) (edn ~(:value pattern))))
            :vector (let [vector (:value pattern)]
                      `(do
                         ~(check->js `(cljs.core.vector? ~(id->value input)))
                         ~(check->js `(= (cljs.core.count ~(id->value input)) ~(count vector)))
                         ~@(for [i (range (count vector))]
                             (let [elem-scratch (new-id)]
                               `(do
                                  (let! ~(id->value elem-scratch) (cljs.core.nth ~(id->value input) (edn ~i)))
                                  (let! ~(id->cursor elem-scratch) (cljs.core.conj ~(id->cursor input) (edn ~i)))
                                  ~(pattern->js elem-scratch (nth vector i)))))))
            :map (let [map (:value pattern)]
                   `(do
                      ~(check->js `(cljs.core.map? ~(id->value input)))
                      ~@(for [key (keys map)]
                          (let [key-scratch (new-id)
                                value-scratch (new-id)]
                            `(do
                               (let! ~(id->scratch key-scratch) ~(data->js* key))
                               ~(check->js `(cljs.core.contains? ~(id->value input) ~(id->scratch key-scratch)))
                               (let! ~(id->value value-scratch) (cljs.core.get ~(id->value input) ~(id->scratch key-scratch)))
                               (let! ~(id->cursor value-scratch) (cljs.core.conj ~(id->cursor input) ~(id->scratch key-scratch)))
                               ~(pattern->js value-scratch (get map key))))))))
    (let [return-scratch (new-id)]
      `(do
         ~(step->js return-scratch [input] pattern)
         ~(check->js (id->value return-scratch))))))

(defn check->js [pred]
  `(if (not ~pred) (throw failure)))

(defn run-example [example state]
  (let [jsth (program->js example)
        source (jsth/expression->string jsth)
        _ (println "###################")
        _ (println jsth)
        _ (println source)
        program (js/eval (str "(" source "());"))]
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

(run-example i/example-e {"counter" 0 "started_" "false"})
