(ns aurora.compiler.worker
  (:require [aurora.util.core :as util]
            [aurora.compiler.compiler :as compiler]
            [cljs.reader :as reader]))

(defn now []
  (.getTime (js/Date.)))

(defn compile-index [data]
  (let [start (now)
        {:keys [notebook index]} (reader/read-string data)]
    (try
      (let [compl-str (compiler/knowledge->js index)]
        (js/self.postMessage #js {:time (- (now) start)
                             :source compl-str}))
      (catch :default e
        (js/self.postMessage #js {:time (- (now) start)
                             :exception (str e)
                             :stack (.-stack e)})))))

(set! js/self.onmessage (fn [event]
                          (compile-index (.-data event))))

