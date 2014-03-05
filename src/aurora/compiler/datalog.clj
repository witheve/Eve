(ns aurora.compiler.datalog
  (:require [aurora.compiler.match :as match]
            [aurora.macros :refer [check]]))

;; TODO naming of clauses sucks

(declare parse-args query->cljs)

(defn subquery? [pattern]
  (and (seq? pattern) (= :in (first pattern))))

(defn collect? [pattern]
  (and (seq? pattern) (= :collect (first pattern))))

(defn guard? [pattern]
  (and (seq? pattern) (not (#{:in :collect} (first pattern)))))

(defn bind-in [pattern bound]
  (cond
   (and (seq? pattern) (= 'quote (first pattern))) pattern
   (bound (match/->var pattern)) (match/->var pattern)
   (seq? pattern) (into nil (reverse (map #(bind-in % bound) pattern)))
   (coll? pattern) (into (empty pattern) (map #(bind-in % bound) pattern))
   :else pattern))

(defn subquery->cljs [[_ pattern collection] tail]
  (assert (empty? (match/->vars collection)) (str "Not ground: " (pr-str collection)))
  (let [elem (gensym "elem")]
    `(doseq [~elem ~collection]
       (try
         ~(match/pattern->cljs pattern elem)
         ~tail
         (catch aurora.compiler.match.MatchFailure e#)))))

(defn collect->cljs [[_ binding collected] knowledge tail]
  `(let [~(match/->var binding) (into #{} ~(query->cljs collected knowledge))]
     ~tail))

(defn guard->cljs [guard tail]
  `(do ~(match/test guard)
     ~tail))

(defn clause->cljs [[e a v :as eav] cache-eavs e->a->vs a->e->vs tail]
  (let [eav-sym (gensym "eav")
        e-sym (gensym "e")
        a-sym (gensym "a")
        v-sym (gensym "v")
        vs-sym (gensym "vs")]
    (cond
     (and (match/constant? a) (match/constant? e))
     `(doseq [~v-sym (get-in ~e->a->vs [~e ~a])]
        (try
          ~(match/pattern->cljs v v-sym)
          ~tail
          (catch aurora.compiler.match.MatchFailure e#)))

     (match/constant? a)
     `(doseq [[~e-sym ~vs-sym] (get ~a->e->vs ~a)]
        (try
          ~(match/pattern->cljs e e-sym)
          (doseq [~v-sym ~vs-sym]
            (try
              ~(match/pattern->cljs v v-sym)
              ~tail
              (catch aurora.compiler.match.MatchFailure e#)))
          (catch aurora.compiler.match.MatchFailure e#)))

     (match/constant? e)
     `(doseq [[~a-sym ~vs-sym] (get ~e->a->vs ~e)]
        (try
          ~(match/pattern->cljs a a-sym)
          (doseq [~v-sym ~vs-sym]
            (try
              ~(match/pattern->cljs v v-sym)
              ~tail
              (catch aurora.compiler.match.MatchFailure e#)))
          (catch aurora.compiler.match.MatchFailure e#)))

     :else
     `(doseq [[~e-sym ~a-sym ~v-sym] ~cache-eavs]
        (try
          ~(match/pattern->cljs e e-sym)
          ~(match/pattern->cljs a a-sym)
          ~(match/pattern->cljs v v-sym)
          ~tail
          (catch aurora.compiler.match.MatchFailure e#)))
     )))

(defn bind-pattern [pattern bound]
  (let [bound-pattern (bind-in pattern @bound)]
    (swap! bound clojure.set/union (match/->vars pattern))
    bound-pattern))

(defn bind-clause [clause bound]
  (cond
   (subquery? clause)
   (let [bound-collection (bind-pattern (nth clause 2) bound)
         bound-pattern (bind-pattern (nth clause 1) bound)]
     (list :in bound-pattern bound-collection))

   (guard? clause)
   clause

   (collect? clause)
   ;; gross...
   (let [parsed (parse-args (nth clause 2))
         bound-parsed (update-in parsed [:where] (fn [where] (map #(bind-clause % (atom @bound)) where)))]
     (swap! bound conj (match/->var (nth clause 1)))
     (list :collect (nth clause 1) bound-parsed))

   :else
   (bind-pattern clause bound)))

(defn query->cljs [{:keys [where ignore return]} knowledge]
  (let [result (gensym "result")
        cache-eavs (gensym "cache->eavs")
        e->a->vs (gensym "e->a->vs")
        a->e->vs (gensym "a->e->vs")
        bound (atom #{})
        bound-clauses (doall (map #(bind-clause % bound) where))]
    `(let [{~cache-eavs :cache-eavs ~e->a->vs :e->a->vs ~a->e->vs :a->e->vs} ~knowledge
           ~@(interleave @bound (repeat nil))
           ~result (transient [])]
       ~(reduce
         (fn [tail bound-clause]
           (cond
            (subquery? bound-clause)
            (subquery->cljs bound-clause tail)

            (collect? bound-clause)
            (collect->cljs bound-clause knowledge tail)

            (guard? bound-clause)
            (guard->cljs bound-clause tail)

            :else
            (clause->cljs bound-clause cache-eavs e->a->vs a->e->vs tail)))
         `(do
            ~@(for [action ignore]
                action)
            ~@(for [output return]
                `(~'js* ~(str result " = ~{}") (conj! ~result ~output))))
         (reverse bound-clauses))
       (persistent! ~result))))

(defn split-on [k elems]
  (let [[left right] (split-with #(not= k %) elems)]
    [left (rest right)]))

(defn parse-args [args]
  ;; syntax is [clause+ (:ignore|:return form+)*]
  (loop [parts {}
         part :where
         args args]
    (let [[left right] (split-with #(not (#{:ignore :return} %)) args)]
      (let [parts (update-in parts [part] concat left)]
        (if (empty? right)
          parts
          (recur parts (first right) (rest right)))))))

(defmacro rule [& args]
  (let [knowledge (gensym "knowledge")]
    `(fn [~knowledge]
       (into #{}
             ~(query->cljs (parse-args args) knowledge)))))

(defmacro defrule [name & args]
  `(def ~name (rule ~@args)))

(defmacro q* [knowledge & args]
  (let [knowledge-sym (gensym "knowledge")]
    `(let [~knowledge-sym ~knowledge]
       (into #{}
             ~(query->cljs (parse-args args) knowledge-sym)))))

(defmacro q1 [knowledge & args]
  `(let [result# (q* ~knowledge ~@args)]
     (assert (= (count result#) 1) (pr-str result#))
     (first result#)))

(defmacro q+ [knowledge & args]
  `(let [result# (q* ~knowledge ~@args)]
     (assert (>= (count result#) 1) (pr-str result#))
     result#))

(defmacro q? [knowledge & args]
  `(let [any# (atom false)]
     (q* ~knowledge ~@args :ignore (reset! any# true))
     @any#))

(defmacro q! [knowledge & args]
  (let [knowledge-sym (gensym "knowledge")]
    `(let [~knowledge-sym ~knowledge
           values# ~(query->cljs (parse-args args) knowledge-sym)
           result# (into #{} values#)]
       (assert (= (count values#) (count result#)) (pr-str values#))
       result#)))
