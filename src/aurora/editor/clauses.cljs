(ns aurora.editor.clauses
  (:require [aurora.util.core :refer [now]]
            [aurora.language.operation :as operation]
            [aurora.language.representation :as representation]
            [aurora.language.denotation :as denotation]
            [aurora.language.jsth :as jsth]
            [aurora.language.stratifier :as stratifier]
            [aurora.language :as language]
            [aurora.runtime.core :as runtime :refer [run-env pause unpause replay-last]]
            [aurora.editor.core :refer [state cur-env]]
            [cljs.reader :as reader]
            [aurora.editor.dom :as dom]))

(defn map->fact [m]
  (let [info (get-in @state [:program :madlibs (:ml m)])
        ks (filterv identity (map m (:madlib info)))]
    (language/fact (:ml m) (to-array ks))))

(defn extract-vars [s vars]
  (when s
    (let [extracted (array)]
      (doseq [var vars]
        (when (> (.indexOf (str s) (str var)) -1)
          (.push extracted var)))
      (vec extracted))))

(defmulti compile-clause (fn [clause vars]
                           (:type clause)))

(defmethod compile-clause "when" [clause vars]
  (compile-clause (assoc clause :type "find") vars))

(defmethod compile-clause "find" [clause vars]
  (condp = (:ml clause)
    :aurora/let [(language/Compute. (language/->Let (symbol (get clause "x")) (extract-vars (get clause "y") vars) (get clause "y")))]
    [(language/Recall. :known|pretended (map->fact clause))]))

(defmethod compile-clause "add" [clause vars]
  [(language/Output. :remembered (map->fact clause))])

(defmethod compile-clause "remember" [clause vars]
  (compile-clause (assoc clause :type "add")))

(defmethod compile-clause "forget" [clause vars]
  [(language/Output. :forgotten (map->fact clause))])

(defmethod compile-clause "pretend" [clause vars]
  [(language/Output. :pretended (map->fact clause))])

(defmethod compile-clause "see" [clause vars]
  (let [exp (get clause "expression")]
    [(language/Compute. (language/->Let (get clause "name" 'x) (extract-vars exp vars) exp))]))

(defmethod compile-clause "change" [clause vars]
  (let [rule (get-in @state [:program :madlibs (:ml clause)])
        new-bound-syms (get clause :aurora.editor.ui/new {})
        placeholders (into {} (for [k (keys (:placeholders rule))]
                                [k (or (new-bound-syms k) (symbol k))]))
        clause (dissoc clause :type :aurora.editor.ui/new :aurora.editor.fake/new)
        syms (into {} (for [k (keys (dissoc clause :ml))]
                        [k (gensym k)]))
        sees (for [[k v] (dissoc clause :ml)]
               (language/Compute. (language/->Let (syms k) (extract-vars v (into vars (vals placeholders))) v)))
        jsd (into clause (for [[k v] (dissoc clause :ml)]
                           [k (syms k)]))
        ]
    (conj sees
          (language/Recall. :known|pretended (map->fact (merge clause placeholders)))
          (language/Output. :forgotten (map->fact (merge clause placeholders)))
          (language/Output. :remembered (map->fact (merge placeholders clause jsd))))
    )
  )

(defmethod compile-clause "draw" [clause vars]
  (let [ui (get clause "ui")
        ui-facts (try
                   (reader/read-string ui)
                   (catch :default e))]
    (mapv #(if (:ml %)
             (language/Output. :pretended (map->fact %))
             %)
          (js/aurora.runtime.ui.hiccup->facts ui-facts))
    ))

(defn clauses->vars [clauses]
  (let [vars (array)]
    (doseq [clause clauses]
      (let [vs (condp = (:type clause)
                 "change" (concat (vals (:aurora.editor.ui/new clause)) (vals clause))
                 (vals clause))
            vs (filter symbol? vs)]
        (doseq [v vs]
          (.push vars v))))
    (set vars)))

(defn compile-rule* [r world]
  (let [vars (clauses->vars (:clauses r))]
    (mapcat #(compile-clause % vars) (:clauses r))))

(defn compile-rule [r world]
  (try
    (language/clauses->rule (vec (compile-rule* r world)))
    (catch :default e
      (.error js/console e)
      (throw e)
      nil)))

;(def compile-rule (memoize compile-rule))

(defn compile-fact [f world]
  (map->fact f))

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
        rules (language/rules->plan (:rules comped) (:facts comped))
        paused? (:pause @cur-env)]
    (pause cur-env)
    (swap! cur-env assoc
           :rules rules)
    (runtime/handle-feed cur-env (:facts comped) {:force true})
    (when-not paused?
      (unpause cur-env))))

(comment
(let [rules [(language/Rule. [
                             (aurora.language.Recall. :known|pretended, (js/aurora.language.fact :http/response #js ['content "google" 'tim]))
                             (aurora.language.Output. :remembered (js/aurora.language.fact "1df7454c_069e_40ab_b117_b8d43212b473" #js ['value74]))
                             (aurora.language.Output. :forgotten (js/aurora.language.fact "1df7454c_069e_40ab_b117_b8d43212b473" #js ['value]))
                             (aurora.language.Recall. :known|pretended, (js/aurora.language.fact "1df7454c_069e_40ab_b117_b8d43212b473" #js ['value]))
                             (aurora.language.Compute. (language/->Let 'value74  #{'value 'content} "value + \"hey\" + content"))])]
      plan (language/rules->plan rules)
      state (language/flow-plan->flow-state plan)]
  (language/add-facts-compat state :known|pretended [(language/fact. "1df7454c_069e_40ab_b117_b8d43212b473" #js ["Click me"])])
  (language/add-facts-compat state :known|pretended [(language/fact. :http/response #js ["yo" "google" 1234])])
  (language/fixpoint! state)
  (-> (language/tick&fixpoint plan state)
      (language/get-facts-compat :known|pretended))
  )
    )
