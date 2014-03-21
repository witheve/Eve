(ns aurora.editor.fake
  (:require [aurora.editor.ReactDommy :refer [node]]
            [aurora.compiler.compiler :as compiler]
            [aurora.compiler.datalog :as datalog]
            [aurora.runtime.core :as runtime :refer [run-env pause unpause]]
            [aurora.runtime.timers]
            [aurora.runtime.ui]
            [aurora.runtime.io]
            [aurora.editor.dom :as dom]
            [clojure.set :as set]
            [clojure.string :as string]))

;; {:type :rule
;;  :clauses [{:type :when }
;;            {:type :find}
;;            {:type :let}
;;            {:type :guard}
;;            {:type :add}
;;            {:type :replace}
;;            {:type :remove}
;;            ]}

(def cur-env (run-env {:cleanup-rules (concat runtime/io-cleanup-rules runtime/timer-cleanup-rules runtime/ui-cleanup-rules)}))

(def state (atom {:madlibs {:timers/tick "[timer] ticks with [time?]"
                            :timers/wait "tick [timer] after [waiting?]"
                            :ui/draw "Draw [thing] as [ui?]"}
                  :statements [{:type :add
                                :ml :timers/tick
                                "timer" "timer"
                                "time" 0}
                               {:type :rule
                                :clauses [{:type :when
                                           :ml :timers/tick
                                           "timer" "timer"}
                                          {:type :add
                                           :ml :timers/wait
                                           "timer" "timer"
                                           "waiting" 1000}]}
                               {:type :rule
                                :clauses [{:type :when
                                           :ml :timers/tick
                                           "timer" "timer"
                                           "time" 'time}
                                          {:type :add
                                           :ml :ui/draw
                                           "ui" 'time}]}]}))

(defmulti draw-clause (fn [x y]
                        (:type x)))


(defmethod draw-clause :rule [clause world]
  (let [clauses (:clauses clause)
        when (first (filter #(= (:type %) :when) clauses))]
    [:li (if when (draw-clause when world))
     [:ul.sub
      (for [c (filter #(not= (:type %) :when) clauses)]
        (draw-clause c world)
        )]]))

(defmethod draw-clause :add [clause world]
  (rule-ui clause world))

(defmethod draw-clause :when [clause world]
  [:span [:span.keyword "when "] (rule-ui clause world)])

(defmulti compile-clause (fn [clause world]
                           (:type clause)))

(defmethod compile-clause :when [clause world]
  (compile-clause (assoc clause :type :find) world))

(defmethod compile-clause :find [clause world]
  (dissoc clause :type))

(defmethod compile-clause :add [clause world]
  (list '+ (dissoc clause :type)))

(defmethod compile-clause :remove [clause world]
  (list '- (dissoc clause :type)))

(defmethod compile-clause :update [])

(defn compile-rule [r world]
  (datalog/macroless-rule (mapv compile-clause (:clauses r))))

(defn compile-fact [f world]
  (dissoc f :type))

(defn compile-statements [statements world]
  (let [rules (filter #(= (:type %) :rule) statements)
        facts (filter #(not= (:type %) :rule) statements)]
    {:rules (for [r rules]
              (compile-rule r world))
     :facts (for [f facts]
              (compile-fact f world))}))

(defn compile-state []
  (compile-statements (:statements @state) @state))

(defn inject-compiled []
  (let [comped (compile-state)
        tick-rules (datalog/chain (:rules comped))]
    (pause cur-env)
    (swap! cur-env assoc
           :tick-rules tick-rules
           :kn (datalog/Knowledge. (set/union (set (:facts comped)) (-> @cur-env :kn :old))
                                   (-> @cur-env :kn :asserted)
                                   (-> @cur-env :kn :retracted)))
    (unpause cur-env)))

;(enable-console-print!)
;(inject-compiled)


(comment
  (def state (atom {:rules [
                            {:ml "[when*] [timer] ticks"
                             :sub [{:ml "tick [timer] after [waiting?]"
                                    :type :add
                                    "waiting" "1s"}]}
                            {:ml "[when*] [timer] ticks with [time!]"
                             :sub [{:ml "Draw [clock ui] as [ui?]"
                                    :type :add
                                    "ui" [:span "Time is: " [:span.var.attr "time"]]}]}
                            ]}))

  (def state (atom {:rules [{:ml "a [todo] has [text?]" :type :add}
                            {:ml "a [todo] has [order?]" :type :add}
                            {:ml "a [todo] is [being edited?] or [saved?]" :type :add}
                            {:ml "a [todo] is [completed?] or [active?]" :type :add}
                            {:ml "a [todo] is stored" :type :add}
                            {:ml "[when*] [todo input] is changed to [value!]"
                             :sub [{:ml "[current text] has [value?]"
                                    :type :update
                                    "value" 'value}]}
                            {:ml "[when*] [add todo] is clicked"
                             :sub [{:ml "[we need to add a todo]" :type :add}]}
                            {:ml "[when*] [todo input] receives the [enter?] key"
                             :sub [{:ml "[we need to add a todo]" :type :add}]}
                            {:ml "[when*] [we need to add a todo]"
                             :sub [{:ml "[find*] [current text] has [value!]"}
                                   {:ml "[find*] [app] has [counter!]"}
                                   {:ml "[new*] [todo]"}
                                   {:ml "[todo] has [text?]"
                                    :type :add
                                    "text" 'value}
                                   {:ml "[todo] has [order?]"
                                    :type :add
                                    "order" [:span [:span.var.attr "counter"] " + 1"]}
                                   {:ml "[todo] is [active?]"
                                    "type" :add}
                                   {:ml "[todo] is [saved?]"
                                    "type" :add}
                                   {:ml "[current text] has [value?]"
                                    :type :update
                                    "value" ""}]}
                            ]})))


(defn placeholder-ui [rule ph]
  (let [name (if (#{"!" "?" "*"} (last ph))
               (subs ph 0 (- (count ph) 1))
               ph)
        v (get rule name)
        v-rep (when-let [v (get rule name)]
                (cond
                 (symbol? v) [:span.var.attr (str v)]
                 (vector? v) v
                 :else (str v)))
        classes {:var true
                 :keyword (= "*" (last ph))
                 :attr (= "!" (last ph))
                 :bool (= "?" (last ph))}]
    (cond
     (or (not v-rep)
         (= v name)) [:span {:classes classes} name]
     (symbol? v) [:span {:classes classes} v-rep]
     :else [:span {:classes (assoc classes :add true)}
              name
              [:span.value v]])
    ))

(defn rule-ui [r world]
  (let [ml (get-in world [:madlibs (:ml r)])
        placeholders (mapv second (re-seq #"\[(.+?)\]" ml))
        split (string/split ml #"\[.+?\]")
        split (if-not (seq split)
                [""]
                split)]
     `[:span ~@(mapcat (fn [i cur]
                         (let [ph (get placeholders i)]
                           (if-not ph
                             [cur]
                             [cur (placeholder-ui r ph)]))) (range) split)]
    ))

(defn rules [rs world]
  [:ul#rules
   (for [r rs]
     (draw-clause r world))])

(defn results [env world]
  (let [kn (:kn env)]
    [:div#results
     [:h2 "facts:"]
     [:ul
      (for [fact (sort-by :ml (:old kn))]
        [:li (rule-ui fact world)])]
     ]
    ))

(defn root-ui []
  [:div#root
   (rules (:statements @state) @state)
   (results @cur-env @state)
   ])

(root-ui)

;;*********************************************************
;; Render
;;*********************************************************

(def frame (.-requestAnimationFrame js/window))
(def queued? false)

(defn render! []
  (let [tree (root-ui)]
    (js/React.renderComponent (node tree) (dom/$ "#wrapper"))
    (set! queued? false)
    ))

(defn queue-render []
  (when-not queued?
    (set! queued? true)
    (frame render!)))

;(queue-render)

(add-watch cur-env :render (fn [_ _ _ cur]
                             (queue-render)))

(add-watch state :render (fn [_ _ _ cur]
                           (queue-render)))
