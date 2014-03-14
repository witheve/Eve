(ns aurora.util.core)

(set! js/self (js* "this"))
(set! *print-fn* (fn []))

(defn nw? []
  (boolean (aget js/self "require")))

(defn error [e]
  (.error js/console e))

(when (and (nw?)
           (not (.-added js/self)))
  (set! (.-added js/self) true)
  (set! (.-onerror js/window) #())
  (.on js/process "uncaughtException" #()))

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
