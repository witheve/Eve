(ns aurora.aggregates
  (:require-macros [aurora.macros :refer []]))

(defn count [ix inputs]
  (alength inputs))
