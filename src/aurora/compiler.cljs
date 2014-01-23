(ns aurora.compiler
  (:require [clojure.string :refer [join split-lines]]
            [aurora.interpreter :as i]))

;; js ast

(defn indent [lines]
  (join "\n" (for [line (split-lines lines)] (str "  " line))))

(defn maybe-name [x]
  (try (name x) (catch :default _)))

;; TODO this would benefit a lot from a proper parser - maybe strucjure?

(defn statement->string [js]
  #_(prn :statement js)
  (cond
   (seq? js) (case (maybe-name (first js))
               "do" (join "\n" (map statement->string (rest js)))
               "if" (str "if (" (expression->string (nth js 1)) ") {\n"
                         (indent (statement->string (nth js 2))) "\n"
                         "}" (when (= 4 (count js))
                               (str " else {\n"
                                    (indent (statement->string (nth js 3))) "\n"
                                    "}")))
               "let!" (str "var " (expression->string (nth js 1)) " = " (expression->string (nth js 2)) ";")
               "set!" (str (expression->string (nth js 1)) " = " (expression->string (nth js 2)) ";")
               "throw" (str "throw " (expression->string (nth js 1)) ";")
               "try" (str "try {\n"
                          (indent (statement->string (nth js 1))) "\n"
                          "} catch (" (expression->string (nth (nth js 2) 1)) ") {\n"
                          (indent (statement->string (nth (nth js 2) 2))) "\n"
                          "}")
               (str (expression->string js) ";"))
   :else (str (expression->string js) ";")))

(defn expression->string [js]
  #_(prn :expression js)
  (cond
   (seq? js) (case (maybe-name (first js))
               "=" (str "(" (expression->string (nth js 1)) " == " (expression->string (nth js 2)) ")")
               "==" (str "(" (expression->string (nth js 1)) " === " (expression->string (nth js 2)) ")")
               "not" (str "!(" (expression->string (nth js 1)) ")")
               "fn" (str "function " (expression->string (nth js 1)) " (" (join ", " (map expression->string (nth js 2))) ") {\n"
                         (indent (statement->string (nth js 3))) "\n"
                         "return " (expression->string (nth js 4)) ";\n"
                         "}")
               ".." (join "." (map expression->string (rest js)))
               "aget" (str (expression->string (nth js 1)) "[" (expression->string (nth js 2)) "]")
               "data" (let [data (nth js 1)]
                        (cond
                         ;; cljs data
                         (nil? data) "null"
                         (string? data) (pr-str data)
                         (number? data) (str data)
                         (vector? data) (expression->string `(cljs.core.PersistentVector.fromArray ~data))
                         (map? data) (expression->string `(cljs.core.PersistentHashMap.fromArrays ~(vec (keys data)) ~(vec (vals data))))))
               (let [f (first js)]
                 (if (and (string? f) (= "cljs" (.substring f 0 4)))
                   (str (expression->string f) ".call(null, " (join ", " (map expression->string (rest js))) ")")
                   (str (expression->string f) "(" (join ", " (map expression->string (rest js))) ")"))))
   ;; js data
   (nil? js) "null"
   (string? js) js
   (symbol? js) (-> (name js) (.replace "-" "_") (.replace "?" "_QMARK_")) ;; TODO copy clj.cljs.analyzer/make-fn-name
   (vector? js) (str "[" (join ", " (map expression->string js)) "]")
   (map? js) (str "{" "}") ;; TODO
   :else (assert false js)))

(statement->string `(if (= "foo" (data 1)) (do "foo" "bar") "baz"))
(statement->string `(let! "foo" (data 1)))
(statement->string `(set! "foo" (data 1)))
(statement->string `(try (set! "foo" (data 1)) (catch "e" (set! "foo" "e"))))
(statement->string `("cljs.core.assoc_in" "foo" "bar"))

;; compiler

(let [next (atom 0)]
  (defn new-id []
    ;; TODO remove "id"
    (str "id" (swap! next inc))))

(defn id->value [id]
  (str "value_" id))
(defn id->cursor [id]
  (str "cursor_" id))
(defn id->scratch [id]
  (str "scratch_" id))
(defn id->pipe [id]
  (str "pipe_" id))

(defn program->js [program]
  `(fn "" []
     (do
       (let! program {})
       (let! failure (data "MatchFailure!"))
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
     (let! ~(id->cursor id) (data nil))))

(defn data->js* [node]
  (case (:kind node)
    :value `(data ~(:value node))
    :vector `(data ~(into [] (map data->js* (:value node))))
    :map `(data ~(into {} (map vector (map data->js* (keys (:value node))) (map data->js* (vals (:value node))))))))

(defn ref->js [id inputs node]
  (case (:kind node)
    :cljs `(do
             (let! ~(id->value id) (~(-> node :fn meta :name) ~@(map id->value inputs)))
             (let! ~(id->cursor id) (data nil)))
    :pipe (let [result (new-id)]
            `(do
               (let! ~(id->scratch result) (~(id->pipe (:id node)) ~@(apply concat (for [input inputs] `[~(id->value input) ~(id->cursor input)]))))
               (let! ~(id->value id) (aget ~(id->scratch result) (data 0)))
               (let! ~(id->cursor id) (aget ~(id->scratch result) (data 1)))))))

(defn replace->js [id inputs node]
  ;; TODO check cursor is not nil
  `(do
     (set! program.next_state (cljs.core.assoc_in program.next_state ~(id->cursor (first inputs)) ~(id->value (second inputs))))
     (let! ~(id->value id) (data nil))
     (let! ~(id->cursor id) (data nil))))

(defn output->js [id inputs node]
  `(do
     (set! program.next_state (cljs.core.update_in program.next_state ~(data->js* (:path node)) cljs.core.conj ~(id->value (first inputs))))
     (let! ~(id->value id) (data nil))
     (let! ~(id->cursor id) (data nil))))

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
            :value (check->js `(= ~(id->value input) (data ~(:value pattern))))
            :vector (let [vector (:value pattern)]
                      `(do
                         ~(check->js `(cljs.core.vector? ~(id->value input)))
                         ~(check->js `(= (cljs.core.count ~(id->value input)) (data ~(count vector))))
                         ~@(for [i (range (count vector))]
                             (let [elem-scratch (new-id)]
                               `(do
                                  (let! ~(id->value elem-scratch) (cljs.core.nth ~(id->value input) (data ~i)))
                                  (let! ~(id->cursor elem-scratch) (cljs.core.conj ~(id->cursor input) (data ~i)))
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
  (let [source (expression->string (program->js example))
        _ (println "###################")
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

(println (program->js i/example-b))
