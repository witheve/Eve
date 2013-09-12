(ns aurora.macros
  (require [cljs.core.match.macros :refer [match]]))

(defmacro with-path [path & body]
  `(binding [aurora.core/*path* (if (coll? ~path)
                                  (apply conj aurora.core/*path* ~path)
                                  (conj aurora.core/*path* ~path))]
     ~@body))

(defmacro filter-match
  ([pattern things]
   `(with-meta
     (filter #(match [%]
                     [~pattern] true
                     :else false)
             ~things)
     (meta ~things)))
  ([with pattern things]
   `(let ~with
      (with-meta
        (filter #(match [%]
                        [~pattern] true
                        :else false)
                ~things)
        (meta ~things)))))
