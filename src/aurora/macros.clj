(ns aurora.macros)

(defmacro for! [& args]
  `(doall (for ~@args)))

(defmacro check [& preds]
  `(do
     ~@(for [pred preds]
         `(when-not ~pred
            (throw (aurora.util.core.FailedCheck. '~pred ~(:line (meta &form)) ~*file* []))))
     true))

(defmacro deftraced [name args traced-args & body]
  `(defn ~name ~args
     (try
       ~@body
       (catch aurora.util.core.FailedCheck e#
         (throw (update-in e# [:trace] conj (list '~name ~@traced-args)))))))

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

(defmacro mapv-indexed [func xs]
  `(let [xs# ~xs
         func# ~func
         len# (count xs#)]
     (loop [index# 0
            final# (transient [])]
       (if-not (< index# len#)
         (persistent! final#)
         (recur (inc index#)
                (conj! final# (func# (xs# index#) index#)))))))

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
  (let [res-sym (gensym "res")]
    `(let [~'res-sym (clojure.core/array)
           xs# (to-array ~xs)
           xs-count# (.-length xs#)]
       (loop [~'index 0
              ~x (aget xs# 0)]
         (when (< ~'index xs-count#)
           ~@(for [elem body]
               `(when-let [e# (dom ~elem)]
                  (.push ~'res-sym e#)))
           (recur (inc ~'index) (aget xs# (inc ~'index)))))
       ~'res-sym)))


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
   (and (list? x) (= (first x) 'when-let)) (emit-when x)
   (and (list? x) (= (first x) 'if)) (emit-if x)
   (and (list? x) (= (first x) 'if-not)) (emit-if x)
   (and (list? x) (= (first x) 'if-let)) (emit-if x)
   (and (list? x) (= (first x) 'cond)) (emit-cond x)
   :else x))

(defmacro dom [& html]
  (if (= (count html) 1)
    (parse (first html))
    `(clojure.core/array
      ~@(map parse html))))



(defmacro defdom [name binding-form & body]
  `(defn ~name ~binding-form
     (dom ~@body)))
