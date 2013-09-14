(ns aurora.transformers.editor
  (:require [dommy.core :as dommy]
            [cljs.core.async.impl.protocols :as protos]
            [cljs.core.async :refer [put! chan sliding-buffer take! timeout]])
  (:require-macros [dommy.macros :refer [node sel sel1]]
                   [cljs.core.async.macros :refer [go]]))

(defn ->exec [s clear?]
  (str "aurora.engine.exec_program(cljs.reader.read_string(" (pr-str (pr-str s)) "), " (pr-str clear?) ");"))

(defn instrument-pipes [prog]
  (assoc prog :pipes
    (into []
          (for [pipe (:pipes prog)]
            (assoc pipe :pipe
              (reduce (fn [cur v]
                        (conj cur v (list 'js/aurora.engine.step (list 'quote (:name pipe)) '_PREV_))
                        )
                      [(list 'js/aurora.engine.scope (list 'quote (:name pipe)) (list 'zipmap (list 'quote (:scope pipe)) (:scope pipe)))]
                      (:pipe pipe)))))))

(def captures (js-obj))

(defn scope [name scope]
  (when-not (aget captures (str name))
    (aset captures (str name) (array)))
  (.push (aget captures (str name)) (js-obj "scope" scope "steps" (array))))

(defn step [name v]
  (.push (-> (aget captures (str name)) last (aget "steps")) v))

(defn !runner [prog]
    (when-let [frame (aget (.-frames js/window) "runner")]

      (set! (.-aurora.engine.scope frame) (fn [name s]
                                            (scope name s)))

      (set! (.-aurora.engine.step frame) (fn [name v]
                                           (step name v)
                                           v))

      (go
       (while (<! (.-aurora.engine.listener-loop frame))
         (put! js/aurora.engine.event-loop :sub-commute)
         ))

      (.aurora.engine.exec_program frame (instrument-pipes prog) false)
      (comment
      (dommy/listen! (sel1 "#runner") :load (fn []
                                   (println "evaling runner")
                                              (println code)
                                   )))


      ))


(defn !in-running [thing]
  (let [frame (aget (.-frames js/window) "runner")]
    (when (.-aurora.pipelines frame)
      (aget (.-aurora.pipelines frame) thing))))

(def frame (aget (.-frames js/window) "runner"))


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
