(ns aurora.util.core)

(enable-console-print!)

(defrecord FailedCheck [message line file trace])

(defn map! [f xs]
  (doall (map f xs)))
