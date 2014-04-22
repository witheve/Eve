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
  (if (.-performance js/self)
    (.performance.now js/self)
    (.getTime (js/Date.))))

(defn cycling-move [cur count dir]
  (if (< (dir cur) 0)
    (dec count)
    (if (>= (dir cur) count)
      0
      (dir cur))))

(defn remove-index [v i]
  (vec (concat (subvec v 0 i) (subvec v (inc i)))))

(def key-codes {:up 38
                :down 40
                :left 37
                :right 39
                :esc 27
                :tab 9
                :backspace 8
                :enter 13})
