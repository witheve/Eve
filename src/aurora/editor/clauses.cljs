(ns aurora.editor.clauses
  (:require [aurora.util.core :refer [now]]
            [aurora.language.operation :as operation]
            [aurora.language.representation :as representation]
            [aurora.language.denotation :as denotation]
            [aurora.language.jsth :as jsth]
            [aurora.language.stratifier :as stratifier]
            [aurora.runtime.core :as runtime :refer [run-env pause unpause replay-last]]
            [aurora.editor.core :refer [state cur-env]]
            [cljs.reader :as reader]
            [aurora.editor.dom :as dom]))

(defmulti compile-clause (fn [clause world]
                           (:type clause)))

(defmethod compile-clause "when" [clause world]
  (compile-clause (assoc clause :type "find") world))

(defmethod compile-clause "find" [clause world]
  [(denotation/Fact. :now&pretended (dissoc clause :type))])

(defmethod compile-clause "add" [clause world]
  [(denotation/Output. :assert (dissoc clause :type))])

(defmethod compile-clause "remember" [clause world]
  (compile-clause (assoc clause :type "add")))


(defmethod compile-clause "all" [clause world]
  (let [things (get clause "things")]
    [(denotation/OutputMany. :assert (if (string? things)
                                       (reader/read-string things)
                                       (or things [])))]))

(defmethod compile-clause "forget" [clause world]
  [(denotation/Output. :retract (dissoc clause :type))])

(defmethod compile-clause "pretend" [clause world]
  [(denotation/Output. :pretend (dissoc clause :type))])

(defmethod compile-clause "see" [clause world]
  (let [exp (get clause "expression")
        exp (if (string? exp)
              (reader/read-string exp)
              exp)
        final (list '= (get clause "name") exp)]
    [(denotation/Let. (get clause "name" 'x) exp)]))

(defmethod compile-clause "change" [clause world]
  (let [rule (get-in @state [:program :madlibs (:ml clause)])
        placeholders (into {} (for [k (keys (:placeholders rule))]
                                [k (symbol k)]))
        new-bound-syms (:aurora.editor.ui/new clause)
        clause (dissoc clause :type :aurora.editor.ui/new :aurora.editor.fake/new)
        syms (into {} (for [k (keys (dissoc clause :ml))]
                        [k (gensym k)]))
        sees (for [[k v] (dissoc clause :ml)]
               (denotation/Let. (syms k) (if (string? v)
                                           (reader/read-string v)
                                           v)))
        jsd (into clause (for [[k v] (dissoc clause :ml)]
                           [k (syms k)]))
        ]
    (conj sees
          (denotation/Fact. :now&pretended (merge clause placeholders))
          (denotation/Output. :retract (merge clause placeholders new-bound-syms))
          (denotation/Output. :assert (merge placeholders clause new-bound-syms jsd)))
    )
  )

(defmethod compile-clause "draw" [clause world]
  (let [ui (get clause "ui")
        ui-facts (try
                   (reader/read-string ui)
                   (catch :default e))]
    [(denotation/OutputMany. :pretend (if-not ui-facts
                                        []
                                        `(cljs.core.hiccup ~ui-facts)))]
    ))

(defn compile-rule* [r world]
  (mapcat compile-clause (:clauses r)))

(defn compile-rule [r world]
  (try
    (denotation/clauses->rule (vec (compile-rule* r world)))
    (catch :default e
      (.error js/console e)
      nil)))

(def compile-rule (memoize compile-rule))

(defn compile-fact [f world]
  (dissoc f :type))

(defn compile-statements [statements world no-rule]
  (let [rules (filter #(= (:type %) "rule") statements)
        facts (filter #(not= (:type %) "rule") statements)]
    {:rules (filter identity (doall (for [r rules]
                                      (if-not no-rule
                                        (compile-rule r nil)
                                        (compile-rule* r nil)))))
     :facts (doall (for [f facts]
                     (compile-fact f nil)))}))

(defn compile-state [& [no-rule]]
  (let [start (now)
        res (compile-statements (get-in @state [:program :statements]) @state no-rule)]
    (when-let [rp (dom/$ "#compile-perf")]
      (dom/html rp (.toFixed (- (now) start) 3)))
    res))

(defn prepare [thing]
  (try
    (operation/prepared thing)
    (catch :default e
      (.error js/console e)
      nil)))

(defn inject-compiled []
  (let [comped (compile-state)
        rules (filter identity (map prepare (:rules comped)))
        tick-rules (stratifier/strata->ruleset (identity rules))
        paused? (:pause @cur-env)]
    (pause cur-env)
    (swap! cur-env assoc :tick-rules tick-rules)
    (replay-last cur-env (set (:facts comped)) 1)
    (when-not paused?
      (unpause cur-env))))
