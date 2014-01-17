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

(defn err-print [x]
  (binding [*out* *err*]
    (println x)))

(defn emit-each [[_ [x xs :as binding-form] & body]]
  `(.map (to-array ~xs) (fn [~x ~'index]
                          (dom
                           ~@body))))

(defn emit-let [[_ binding-form & body]]
  `(let ~binding-form
     (dom ~@body)))

(defn emit-when [[when-sym cond & body]]
  `(~when-sym ~cond
     (dom ~@body)))

(defn emit-if [[if-sym cond t f]]
  `(~if-sym ~cond
     (dom ~t)
     (dom ~f)))

(defn emit-cond [[_ & pairs :as form]]
  (let [pairs (partition 2 pairs)
        pairs (for [[cond do] pairs]
                [cond `(dom ~do)])
        pairs (apply concat pairs)]
    `(cond ~@pairs)))

(defn parse [x]
  (cond
   (vector? x) (emit-react-dom-call x)
   (and (list? x) (= (first x) 'each)) (emit-each x)
   (and (list? x) (= (first x) 'let)) (emit-let x)
   (and (list? x) (= (first x) 'when)) (emit-when x)
   (and (list? x) (= (first x) 'when-not)) (emit-when x)
   (and (list? x) (= (first x) 'if)) (emit-if x)
   (and (list? x) (= (first x) 'if-not)) (emit-if x)
   (and (list? x) (= (first x) 'cond)) (emit-cond x)
   :else x))

(defmacro dom [html]
  (parse html))

(defmacro defdom [name binding-form & body]
  `(defn ~name ~binding-form
     (dom ~@body)))
