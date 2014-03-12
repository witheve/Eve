(ns aurora.compiler.match)

(defn vars [form]
  (cond
   (= '_ form) #{}
   (symbol? form) #{form}
   (or (sequential? form) (map? form)) (apply clojure.set/union (map vars form))
   :else #{}))

(defn match->cljs [patterns guards actions input]
  (let [input-sym (gensym "input")
        pattern-syms (for [pattern patterns] (gensym "pattern"))
        pattern-varss (for [pattern patterns] (vec (vars pattern)))]
    `(let [~input-sym ~input]
       ~@(for [[pattern-sym pattern-vars pattern] (map vector pattern-syms pattern-varss patterns)]
           `(defonce ~pattern-sym (aurora.compiler.match/pattern '~pattern '~pattern-vars)))
       ~(reduce
         (fn [tail [pattern-sym pattern-vars pattern guard action]]
           `(let [results# (~pattern-sym ~input-sym)
                  ~pattern-vars results#]
              (if (and results# ~@(when guard [guard]))
                ~action
                ~tail)))
         `(throw (aurora.compiler.match/MatchFailure. ~input-sym))
         (map vector pattern-syms pattern-varss patterns guards actions)))))

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
