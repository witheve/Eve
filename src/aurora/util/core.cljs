(ns aurora.util.core)

(set! js/self (js* "this"))

(defn nw? []
  (boolean (aget js/self "require")))

(defrecord FailedCheck [message line file trace])

(defn map! [f xs]
  (doall (map f xs)))
