(ns aurora.util.core)

(set! js/self (js* "this"))

(defn nw? []
  (boolean (aget js/self "require")))

(when (nw?)
  (.on js/process "uncaughtException" #(.error js/console %)))

(defrecord FailedCheck [message line file trace])

(defn map! [f xs]
  (doall (map f xs)))

(defn now []
  (.getTime (js/Date.)))

(defn cycling-move [cur count dir]
  (if (< (dir cur) 0)
    (dec count)
    (if (>= (dir cur) count)
      0
      (dir cur))))
