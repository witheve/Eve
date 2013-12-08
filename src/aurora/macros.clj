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


(declare parse)

(defn emit-react-dom-fn-name [element-name]
  (symbol (str "React/DOM." (name element-name))))

(defn emit-attributes [m]
  (cons 'js-obj (interleave (map name (keys m)) (vals m))))

(defn emit-react-dom-call [v]
  (let [[element-name & content] v
        attrs (when (map? (first content))
                (emit-attributes (first content)))
        content (if attrs
                  (rest content)
                  content)]
    (concat
     (list (emit-react-dom-fn-name element-name) attrs)
     (list (cons 'array (map parse content))))))

(defn parse [x]
  (if (vector? x)
    (emit-react-dom-call x)
    x))

(defmacro dom [html]
  (emit-react-dom-call html))