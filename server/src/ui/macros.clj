(ns ui.macros)

(defmacro elem [& things]
  `(cljs.core/js-obj ~@(for [t things]
                         (if (keyword? t)
                           (name t)
                           t))))

(defn check-allowed [type allowed things]
  (doseq [t things]
    (when (and (keyword? t)
               (not (allowed t)))
      (throw (Exception. (str t " is not allowed on " type ". Only the following are accepted: " allowed))))))

(defmacro box [& things]
  (check-allowed "box" #{:style :hover :info :children :id :c :postRender} things)
  `(elem :t "div" ~@things))

(defmacro text [& things]
  (check-allowed "text" #{:style :text} things)
  `(elem :t "span" ~@things))

(defmacro button [& things]
  (check-allowed "button" #{:style :hover :click :info :children :c} things)
  `(elem :t "button" ~@things))

(defmacro input [& things]
  (check-allowed "input" #{:style :hover :click :input :value :info :children :placeholder :c :postRender :keydown :keyup :key :focus} things)
  `(elem :t "input" ~@things))

(defmacro log [& things]
  `(js/console.log ~@things))

(defmacro afor [[item coll] & body]
  `(let [coll# ~coll
         len# (.-length coll#)
         neue# (cljs.core/array)]
     (loop [x# 0]
       (when (< x# len#)
         (aset neue# x# (let [~item (aget coll# x#)]
                          ~@body))
         (recur (+ x# 1))))
     neue#))

(defmacro transaction [diff & body]
  (if (symbol? diff)
    `(let [~diff (cljs.core/js-obj)]
       ~@body
       (ui.root/commit-transaction ~diff)
       (ui.root/render))
    `(do
       ~@(concat [diff] body)
       (ui.root/render))))

(defmacro extract [fact bindings & body]
  (let [factSymbol (gensym "fact")
        params (reduce concat
                 (for [[sym key] (partition 2 bindings)]
                   [sym (list 'aget factSymbol (name key))]))]
    `(let ~(vec (concat [factSymbol fact] params))
             ~@body)))

(defmacro for-fact [bindings & body]
  (let [[fact-sym fact-expr extract extract-bindings] bindings]
    (if (= extract :extract)
      `(afor [~fact-sym ~fact-expr]
             (extract ~fact-sym ~extract-bindings
                      ~@body))
      `(afor [~fact-sym ~fact-expr]
             ~@body)
      )))

(defmacro when [condition & body]
  `(if ~condition
     (do ~@body)
     js/undefined))
