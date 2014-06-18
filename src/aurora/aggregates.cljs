(ns aurora.aggregates
  (:require-macros [aurora.macros :refer []]))

(defn count [ix inputs]
  (alength inputs))

(defn str [ix inputs]
  (.apply cljs.core/str nil (amap inputs i _ (aget inputs i ix))))
