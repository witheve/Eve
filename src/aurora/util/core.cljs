(ns aurora.util.core)

(set! js/self (js* "this"))

(defrecord FailedCheck [message line file trace])

(defn map! [f xs]
  (doall (map f xs)))
