(ns aurora.compiler.match
  (:require cljs.compiler))

(defn test [pred]
  `(when-not ~pred (throw (aurora.compiler.match.MatchFailure.))))

(defn var? [form]
  (and (symbol? form) (= "?" (.substring (str form) 0 1))))

(defn ->var [form]
  (symbol (.substring (str form) 1)))

(defn ->vars [form]
  (cond
   (and (seq? form) (= 'quote (first form))) #{}
   (var? form) #{(->var form)}
   (coll? form) (apply clojure.set/union (map ->vars form))
   :else #{}))

(defn constant? [form]
  (cond
   (and (seq? form) (= 'quote (first form))) true
   (var? form) false
   (= '_ form) false
   (coll? form) (every? constant? form)
   :else true))

(defn pattern->cljs [pattern input]
  (cond
   (= '_ pattern)
   nil

   (var? pattern)
   `(~'js* ~(str (cljs.compiler/munge (->var pattern)) " = ~{}") ~input)

   (or (true? pattern)
       (false? pattern)
       (number? pattern)
       (string? pattern)
       (keyword? pattern)
       (symbol? pattern))
   (test `(= ~pattern ~input))

   (and (seq? pattern) (= 'quote (first pattern)))
   (test `(= '~(second pattern) ~input))

   (vector? pattern)
   `(do
      ~(test `(vector? ~input))
      ~(test `(= (count ~input) ~(count pattern)))
      ~@(for [i (range (count pattern))]
          (let [elem (gensym "elem")]
            `(let [~elem (nth ~input ~i)]
               ~(pattern->cljs (nth pattern i) elem)))))

   (map? pattern)
   `(do
      ~(test `(map? ~input))
      ~@(for [key (keys pattern)]
          (do (assert (not (var? key)) (pr-str key))
            (let [value (gensym "value")]
              `(let [~value (get ~input ~key ~::not-found)]
                 ~(test `(not= ~::not-found ~value))
                 ~(pattern->cljs (get pattern key) value))))))

   :else (assert false (pr-str pattern))))

(defn match->cljs [patterns guards actions input]
  (let [input-sym (gensym "input")
        result-sym (gensym "result")]
    `(let [~input-sym ~input
           ~@(interleave (->vars patterns) (repeat nil))
           ~result-sym ~(reduce
                         (fn [tail i]
                           `(try
                              ~(pattern->cljs (nth patterns i) input-sym)
                              ~(when (nth guards i) (test (nth guards i)))
                              ~i
                              (catch MatchFailure ~'_
                                ~tail)))
                         `(check false)
                         (reverse (range (count patterns))))]
       (case ~result-sym
         ~@(interleave (range (count patterns)) actions)))))

(defn parse-patterns&actions [patterns&actions]
  ;; this is awkwardly trying to parse (pattern action ...) vs (pattern :when guard action ...)
  (let [patterns (atom [])
        guards (atom [])
        actions (atom [])]
    (loop [patterns&actions patterns&actions]
      (when-let [[pattern action|when & patterns&actions] (seq patterns&actions)]
        (let [[guard action & patterns&actions] (if (= :when action|when)
                                                patterns&actions
                                                (concat [nil action|when] patterns&actions))]
          (assert (not (nil? pattern)))
          (assert (not (and (= :when action|when) (nil? guard))))
          (assert (not (nil? action)))
          (swap! patterns conj pattern)
          (swap! guards conj guard)
          (swap! actions conj action)
          (recur patterns&actions))))
    [@patterns @guards @actions]))

(defmacro match [input & patterns&actions]
  (let [[patterns guards actions] (parse-patterns&actions patterns&actions)]
    (match->cljs patterns guards actions input)))
