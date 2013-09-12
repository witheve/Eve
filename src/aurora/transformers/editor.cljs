(ns aurora.transformers.editor
  (:require [dommy.core :as dommy]
            [cljs.core.async.impl.protocols :as protos]
            [cljs.core.async :refer [put! chan sliding-buffer take! timeout]])
  (:require-macros [dommy.macros :refer [node sel sel1]]))

(defn ->exec [s clear?]
  (str "aurora.engine.exec_program(cljs.reader.read_string(" (pr-str (pr-str s)) "), " (pr-str clear?) ");"))

(defn !runner [prog]
  (.log js/console "in runner")
  (let [code (->exec prog false)]
    (.log js/console "trying to start runner")
    (when-let [frame (aget (.-frames js/window) "runner")]
      (set! (.-aurora.engine.commute_listener frame) (fn []
                                                       (put! js/aurora.engine.event-loop :sub-commute)))
      (.aurora.engine.exec_program frame prog false)
      (comment
      (dommy/listen! (sel1 "#runner") :load (fn []
                                   (println "evaling runner")
                                              (println code)
                                   )))


      )))


(defn !in-running [thing]
  (let [frame (aget (.-frames js/window) "runner")]
    (when (.-aurora.pipelines frame)
      (aget (.-aurora.pipelines frame) thing))))

(def frame (aget (.-frames js/window) "runner"))

(.-aurora frame)
