(ns aurora.macros
  (require [cljs.core.match.macros :refer [match]]))

(defmacro with-path [path & body]
  `(binding [aurora.core/*path* (if (coll? ~path)
                                  (apply conj aurora.core/*path* ~path)
                                  (conj aurora.core/*path* ~path))]
     ~@body))

(defmacro dovec [bindings & body]
  `(let [xs# ~(second bindings)
        len# (count xs#)]
  (loop [~'index 0]
    (when (< ~'index len#)
      (let [~(first bindings) (xs# ~'index)]
        ~@body)
      (recur (inc ~'index))))))

(defmacro filter-match
  ([pattern things]
   `(let [cur# ~things]
      (with-meta
        (filterv #(match [%]
                         [~pattern] true
                         :else false)
                 cur#)
        (meta cur#))))
  ([with pattern things]
   `(let [cur# ~things]
      (let ~with
        (with-meta
          (filterv #(match [%]
                           [~pattern] true
                           :else false)
                   cur#)
          (meta cur#))))))
