(ns aurora.compiler.worker
  (:require [aurora.util.core :as util]
            [aurora.compiler.compiler :as compiler]
            [aurora.compiler.jsth :as jsth]
            [cljs.reader :as reader]))

(defn now []
  (.getTime (js/Date.)))

(defn compile-index [{:keys [notebook index]}]
  (let [start (now)]
    (try
      (let [compl-str (->> (compiler/notebook->jsth index (get index notebook))
                           (jsth/expression->string))]

        (js/self.postMessage #js {:time (- (now) start)
                             :source compl-str}))
      (catch :default e
        (js/self.postMessage #js {:time (- (now) start)
                             :exception (str e)
                             :stack (.-stack e)})))))

(set! js/self.onmessage (fn [event]
                          (compile-index (reader/read-string (.-data event)))))

