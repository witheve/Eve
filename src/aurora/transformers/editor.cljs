(ns aurora.transformers.editor
  (:require [dommy.core :as dommy]
            [aurora.util.xhr :as xhr]
            [aurora.util.async :as async]
            [cljs.core.async.impl.protocols :as protos]
            [cljs.core.async :refer [put! chan sliding-buffer take! timeout]])
  (:require-macros [dommy.macros :refer [node sel sel1]]
                   [cljs.core.async.macros :refer [go]]))

(defn instrument-pipes [prog]
  (assoc prog :pipes
    (into []
          (for [pipe (:pipes prog)]
            (assoc pipe :pipe
              (reduce (fn [cur v]
                        (conj cur v (list 'js/aurora.transformers.editor.step (list 'quote (:name pipe)) '_PREV_))
                        )
                      [(list 'js/aurora.transformers.editor.scope (list 'quote (:name pipe)) (list 'zipmap (list 'quote (:scope pipe)) (:scope pipe)))]
                      (:pipe pipe)))))))

(def captures (js-obj))

(defn scope [name scope]
  (when-not (aget captures (str name))
    (aset captures (str name) (array)))
  (.push (aget captures (str name)) (js-obj "scope" scope "steps" (array))))

(defn step [name v]
  (.push (-> (aget captures (str name)) last (aget "steps")) v)
  v)

(defn !runner [prog]
  (go
   (while (<! listener-loop)
     (js/aurora.engine.commute (assoc js/aurora.pipelines.state "dirty" false))
     ;(put! js/aurora.engine.event-loop :sub-commute)
     ))

  (exec-program (instrument-pipes prog) false))


(defn !in-running [thing]
  (when js/running.pipelines
    (aget js/running.pipelines thing)))


(defn ->step [name step iter]
  (let [get-i (if iter
                #(nth % iter)
                last)]
    (when-let [cap (-> js/aurora.transformers.editor.captures
									 (aget (str name))
									 (get-i))]
      (when (aget cap "steps")
        (-> cap (aget "steps") (aget step))))))

(defn ->scope [name iter]
  (let [get-i (if iter
                #(nth % iter)
                last)]
    (when-let [cap (-> js/aurora.transformers.editor.captures
									 (aget (str name))
									 (get-i))]
      (when (seq (aget cap "scope"))
        (zipmap (map (fn [x]
                       (-> x str symbol))
                     (keys (aget cap "scope")))
                (vals (aget cap "scope")))))))

(defn commute [v]
  (let [path (-> v meta :path)
        v (if (seq? v)
            (with-meta (vec v) (meta v))
            v)]
    (aset js/running.pipelines (first path) (if (next path)
                                             (assoc-in (aget js/running.pipelines (first path)) (rest path) v)
                                             v))
    (when-not (second path)
      (js/aurora.engine.meta-walk v path))

    (put! event-loop :commute)))

(set! js/running (js-obj))

(def listener-loop (chan))
(def event-loop (chan))

(defn start-main-loop [main]
  (let [debounced (async/debounce event-loop 100)]
  (go
   (loop [run? true]
     (when run?
       (println "[child] running at: " (.getTime (js/Date.)))
       (main)
       (put! listener-loop :done)
       (recur (<! debounced)))))))

(defn exec-program [prog clear?]
  (when (or clear? (not js/running.pipelines))
    (set! js/running.pipelines (js-obj)))
  (doseq [[k v] (:data prog)
          :when (not (aget js/running.pipelines (str k)))]
    (js/aurora.engine.meta-walk v [(str k)])
    (aset js/running.pipelines (str k) v))
  (put! event-loop false)
  (set! js/aurora.transformers.editor.event-loop (chan))
  (put! listener-loop false)
  (set! js/aurora.transformers.editor.listener-loop (chan))
  (go
   (let [pipes (<! (xhr/xhr [:post "http://localhost:8082/code"] {:code (pr-str (:pipes prog))
                                                                  :ns-prefix "running"}))]
     (.eval js/window pipes)
     (println "evaled: " (subs pipes 0 10))
     (start-main-loop (fn []
                        (let [main-fn (aget js/running.pipelines (str (:main prog)))
                              main-pipe (first (filter #(= (:main prog) (:name %)) (:pipes prog)))
                              vals (map #(aget js/running.pipelines (str %)) (:scope main-pipe))]
                          (apply main-fn vals))))

     )))
