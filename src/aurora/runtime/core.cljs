(ns aurora.runtime.core
  (:require [aurora.util.core :as util]
            [aurora.compiler.datalog :as datalog]
            [aurora.compiler.stratifier :as stratifier]
            [clojure.set :as set]
            [aurora.editor.ReactDommy :as dommy])
  (:require-macros [aurora.compiler.datalog :refer [query rule]]))

(def watchers (atom []))

(declare handle-feed tick)

(defn feeder [env fact]
  (when-not (:queued? @env)
    (swap! env assoc :queued? (js/setTimeout (partial handle-feed env) 0)))
  (.push (:feed @env) fact))

(defn tick [kn tick-rules rules watchers feeder-fn]
  (let [kn (->> kn (stratifier/run-ruleset tick-rules) (stratifier/run-ruleset rules))]
    (doseq [watch watchers]
      (watch kn feeder-fn))
    (datalog/tick kn)))

(defn handle-feed [env]
  (when-not (:paused @env)
    (.time js/console "run")
    (let [feed-set (set (:feed @env))]
      (aset (:feed @env) "length" 0)
      (println "Feed set: " feed-set)
      (swap! env update-in [:kn]
             (fn [cur]
               (-> (stratifier/run-ruleset (:cleanup-rules @env) cur)
                   (datalog/tick)
                   (datalog/assert-facts feed-set)
                   (datalog/tick)
                   (tick (:tick-rules @env) (:rules @env) (:watchers @env) (:feeder-fn @env))
                   (datalog/retract-facts feed-set)
                   (datalog/tick))))
      (.timeEnd js/console "run")
      ;(println "final: " (- (.getTime (js/Date.)) start) (:kn @env))
      (swap! env assoc :queued? false))))

(defn run [env]
  (let [feeder-fn (partial feeder env)]
    (swap! env assoc :feeder-fn feeder-fn)
    (handle-feed env)
    env))

(defn ->env [opts]
  (let [env (merge {:tick-rules []
                    :cleanup-rules []
                    :rules []
                    :watchers @watchers
                    :feed (array)
                    :queued? false}
                   opts
                   {:kn (datalog/Knowledge. (:kn opts #{}) #{} #{} (:kn opts #{}))})
        env (-> env
                (update-in [:cleanup-rules] stratifier/->Chain)
                (update-in [:rules] stratifier/strata->ruleset)
                (update-in [:tick-rules] stratifier/->Chain))]
    (atom env)))

(defn run-env [opts]
  (-> opts
      (->env)
      (run)))

(defn pause [env]
  (swap! env assoc :paused true))

(defn unpause [env]
  (swap! env assoc :paused false)
  (handle-feed env))

(defn go-to-do []

(def hiccup js/aurora.runtime.ui.hiccup->facts)
(def ui-cleanup-rules [(rule {:name :ui/text :id id :text text}
                             (- {:name :ui/text :id id :text text}))
                       (rule {:name :ui/elem :id id :tag tag}
                             (- {:name :ui/elem :id id :tag tag}))
                       (rule {:name :ui/attr :id id :attr attr :value value}
                             (- {:name :ui/attr :id id :attr attr :value value}))
                       (rule {:name :ui/style :id id :style attr :value value}
                             (- {:name :ui/style :id id :style attr :value value}))
                       (rule {:name :ui/child :id id :child child :pos pos}
                             (- {:name :ui/child :id id :child child :pos pos}))
                       (rule {:name :ui/event-listener :id id :entity entity :event event}
                             (- {:name :ui/event-listener :id id :entity entity :event event}))
                       ])

  (def timer-cleanup-rules [(rule {:name :wait :time t :id i}
                                  (- {:name :wait :time t :id i}))])

  (def io-cleanup-rules [(rule ^get {:name :http-get}
                               (- get))])


  (def todo (run-env {:kn #{{:name "counter" :value 2}
                            {:name "todo" :id 0 :text "get milk" :order 0}
                            {:name "todo" :id 1 :text "take books back" :order 1}
                            {:name "todo" :id 2 :text "cook" :order 2}
                            {:name "todo-done" :id 0 :done? "false"}
                            {:name "todo-done" :id 1 :done? "false"}
                            {:name "todo-done" :id 2 :done? "false"}
                            {:name "todo-editing" :id 0 :editing? "false"}
                            {:name "todo-editing" :id 1 :editing? "false"}
                            {:name "todo-editing" :id 2 :editing? "false"}
                            {:name :todo/current-text :value ""}
                            {:name :todo/filter :value "all"}
                            {:name :todo/toggle-all :value "false"}
                            }
                      :cleanup-rules (concat ui-cleanup-rules
                                             [(rule ^disp {:name :todo/displayed}
                                                    (- disp))])
                      :tick-rules [;;on change
                                   (rule {:name :ui/onChange :id "todo-input" :value v}
                                         (> {:name :todo/current-text} {:value v}))

                                   ;;submit
                                   (rule {:name :ui/onClick :id "add-todo"}
                                         (+ {:name :todo/new!}))
                                   (rule {:name :ui/onKeyDown :id "todo-input" :keyCode 13}
                                         (+ {:name :todo/new!}))

                                   ;;add a new todo
                                   (rule {:name :todo/new!}
                                         {:name "counter" :value v}
                                         {:name :todo/current-text :value text}
                                         (= new-count [v] (inc v))
                                         (- {:name :todo/new!})
                                         (> {:name "counter"} {:value new-count})
                                         (> {:name :todo/current-text} {:value ""})
                                         (+ {:name "todo" :id new-count :text text :order new-count})
                                         (+ {:name "todo-editing" :id new-count :editing? "false"})
                                         (+ {:name "todo-done" :id new-count :done? "false"}))

                                   ;;todo editing
                                   (rule {:name :ui/onDoubleClick :entity ent}
                                         {:name "todo-editing" :id ent :editing? "false"}
                                         (> {:name "todo-editing" :id ent} {:editing? "true"}))

                                   (rule {:name :ui/onBlur :entity ent}
                                         {:name :todo/edit-text :value v}
                                         (> {:name "todo" :id ent} {:text v})
                                         (> {:name "todo-editing" :id ent} {:editing? "false"}))

                                   (rule {:name :ui/onChange :id "todo-editor" :value v}
                                         (> {:name :todo/edit-text} {:value v})
                                         (+ {:name :todo/edit-text :value v}))

                                   (rule {:name :ui/onKeyDown :id "todo-editor" :keyCode 13 :entity ent}
                                         {:name :todo/edit-text :value new-value}
                                         (> {:name "todo" :id ent} {:text new-value})
                                         (> {:name "todo-editing" :id ent} {:editing? "false"}))

                                   (rule {:name :ui/onChange :event-key "todo-checkbox" :entity ent :value v}
                                         (> {:name "todo-done" :id ent} {:done? v}))

                                   (rule {:name :ui/onClick :event-key "filter-all"}
                                         (> {:name :todo/filter} {:value "all"}))
                                   (rule {:name :ui/onClick :event-key "filter-active"}
                                         (> {:name :todo/filter} {:value "false"}))
                                   (rule {:name :ui/onClick :event-key "filter-completed"}
                                         (> {:name :todo/filter} {:value "true"}))

                                   (rule {:name :ui/onChange :event-key "toggle-all" :value v}
                                         (> {:name :todo/toggle-all} {:value v}))

                                   (rule {:name "todo-done" :id id}
                                         {:name :ui/onChange :event-key "toggle-all" :value v}
                                         (> {:name "todo-done" :id id} {:done? v}))

                                   (rule {:name :ui/onClick :event-key "clear completed"}
                                         {:name "todo-done" :id ent :done? "true"}
                                         (+ {:name :todo/remove! :id ent}))

                                   (rule {:name :ui/onClick :event-key "todo-remove" :entity ent}
                                         (+ {:name :todo/remove! :id ent}))

                                   (rule {:name :todo/remove! :id id}
                                         ^todo {:name "todo" :id id}
                                         ^done {:name "todo-done" :id id}
                                         ^editing {:name "todo-editing" :id id}
                                         (- todo)
                                         (- done)
                                         (- editing))]

                      :rules [[(rule {:name "todo" :id id}
                                     {:name :todo/filter :value "all"}
                                     (+ {:name :todo/displayed :id id}))
                               (rule {:name "todo" :id id}
                                     {:name :todo/filter :value v}
                                     {:name "todo-done" :id id :done? v}
                                     (+ {:name :todo/displayed :id id}))]

                              [(rule {:name :todo/displayed :id id}
                                     {:name "todo" :id id :text text :order order}
                                     {:name "todo-done" :id id :done? done}
                                     (= parent-id [id] (str "todo" id))
                                     (= child-id [id] (str "todo-checkbox" id))
                                     (+s [child-id id done]
                                         (hiccup
                                          [:input {:id child-id
                                                   :event-key "todo-checkbox"
                                                   :entity id
                                                   :checked done
                                                   :events ["onChange"]
                                                   :type "checkbox"}]))
                                     (+ {:name :ui/child :id parent-id :child child-id :pos -1}))]
                              [(rule {:name :todo/displayed :id id}
                                     {:name "todo" :id id :text text :order order}
                                     {:name "todo-editing" :id id :editing? "false"}
                                     (+s [id text]
                                         (hiccup
                                          [:li {:id (str "todo" id) :entity id :event-key "todo" :events ["onDoubleClick"]}
                                           text
                                           [:button {:id (str "todo-remove" id) :style {:margin-left "10px"} :entity id :event-key "todo-remove" :events ["onClick"]} "x"]]))
                                     (= child-id [id] (str "todo" id))
                                     (+ {:name :ui/child :id "todo-list" :child child-id :pos order}))
                               (rule {:name :todo/displayed :id id}
                                     {:name "todo" :id id :text text :order order}
                                     {:name "todo-editing" :id id :editing? "true"}
                                     (+s [id text]
                                         (hiccup
                                          [:input {:id (str "todo-editor") :entity id :event-key "todo-editor" :defaultValue text :events ["onChange" "onKeyDown" "onBlur"]}]))
                                     (+ {:name :ui/child :id "todo-list" :child "todo-editor" :pos order}))]

                              [(rule {:name :todo/current-text :value v}
                                     (+s []
                                         (hiccup
                                          [:input {:id "todo-input" :value v :event-key "todo-input" :events ["onChange" "onKeyDown"] :placeholder "What do you need to do?"}]))
                                     (+ {:name :ui/child :id "app" :child "todo-input" :pos 1}))]

                              [(rule (set remaining [id]
                                          {:name "todo-done" :id id :done? "false"})
                                     (= left [remaining] (count remaining))
                                     (= text [left] (if (= left 1)
                                                      " todo "
                                                      " todos "))
                                     (+s [left text]
                                         (hiccup [:span {:id "remaining-count"} left text "left"]))
                                     (+ {:name :ui/child :id "app" :child "remaining-count" :pos 3.5}))

                               (rule (set completed [id]
                                          {:name "todo-done" :id id :done? "true"})
                                     (= left [completed] (count completed))
                                     (? [left] (> left 0))
                                     (+s [left]
                                         (hiccup [:span {:id "completed-count" :event-key "clear completed" :events ["onClick"]} "clear completed (" left ")"]))
                                     (+ {:name :ui/child :id "app" :child "completed-count" :pos 7}))]

                              [(rule {:name :todo/toggle-all :value toggle}
                                     (+s [toggle]
                                         (hiccup
                                          [:div {:id "app"}
                                           [:h1 {:id "todo-header"} "Todos"]
                                           [:input {:id "toggle-all"
                                                    :event-key "toggle-all"
                                                    :checked toggle
                                                    :events ["onChange"]
                                                    :type "checkbox"}]
                                           [:button {:id "add-todo" :event-key "add-todo" :events ["onClick"]} "add"]
                                           [:ul {:id "todo-list"}]
                                           [:button {:id "filter-all" :event-key "filter-all" :events ["onClick"]} "all"]
                                           [:button {:id "filter-active" :event-key "filter-active" :events ["onClick"]} "active"]
                                           [:button {:id "filter-completed" :event-key "filter-completed" :events ["onClick"]} "completed"]
                                           ]))
                                     )]
                              ]})))

;; (go-to-do)
;; (js/setTimeout go-to-do 5000)

(comment

((datalog/macroless-rule '[[a b]
                            (= foo (+ a b))
                            (+ [a b foo])])
 (datalog/Knowledge. #{[3 4] [1 2] [4 5]} #{} #{}))

(def hiccup js/aurora.runtime.ui.hiccup->facts)
(def ui-cleanup-rules [(rule {:name :ui/text :id id :text text}
                             (- {:name :ui/text :id id :text text}))
                       (rule {:name :ui/elem :id id :tag tag}
                             (- {:name :ui/elem :id id :tag tag}))
                       (rule {:name :ui/attr :id id :attr attr :value value}
                             (- {:name :ui/attr :id id :attr attr :value value}))
                       (rule {:name :ui/style :id id :style attr :value value}
                             (- {:name :ui/style :id id :style attr :value value}))
                       (rule {:name :ui/child :id id :child child :pos pos}
                             (- {:name :ui/child :id id :child child :pos pos}))
                       (rule {:name :ui/event-listener :id id :entity entity :event event}
                             (- {:name :ui/event-listener :id id :entity entity :event event}))
                       ])

  (def timer-cleanup-rules [(rule {:name :wait :time t :id i}
                                  (- {:name :wait :time t :id i}))])

  (def io-cleanup-rules [(rule ^get {:name :http-get}
                               (- get))])


  (def tick (run-env {:kn #{[3 5] [9 8 7] [:tick]}
                      :cleanup-rules (concat ui-cleanup-rules timer-cleanup-rules
                                             [])
                      :tick-rules [(rule [:tick]
                                         (- [:tick])
                                         (+ {:name :wait :time 1000 :id 1}))]
                      :rules [(rule {:name :tick :id 1 :timestamp ts}
                                    (+ [:tick])
                                    (+ ["hi!" ts]))]}))

  (pause tick)
  (unpause tick)
  @tick

  (def clock (run-env {:kn #{{:name :tick :id "clock"}}
                       :cleanup-rules (concat ui-cleanup-rules timer-cleanup-rules
                                              [])
                       :tick-rules [(rule {:name :tick :id "clock"}
                                          (+ {:name :wait :time 1000 :id "clock"}))]
                       :rules [[(rule {:name :tick :id "clock" :timestamp ts}
                                      (+s (hiccup [:p {:id "time"} (str "time is: " (js/Date. ts))])))]]
                       }))

  (pause clock)
  (unpause clock)
  (-> @clock :kn :old)

  (def incrementer (run-env {:kn #{{:name "counter" :value 0}}
                             :cleanup-rules (concat ui-cleanup-rules timer-cleanup-rules
                                                    [])
                             :tick-rules [(rule {:name :ui/onClick :id "incr-button"}
                                                {:name "counter" :value v}
                                                (= z (inc v))
                                                (> {:name "counter"} {:value z}))]
                             :rules [[(rule {:name "counter" :value v}
                                            (+s (hiccup
                                                 [:p {:id "counter-ui"} v]
                                                 [:button {:id "incr-button" :events ["onClick"]} "increment"])))]]}))

  (pause incrementer)
  (unpause incrementer)
  (-> @incrementer :kn :old)

  (def fetcher (run-env {:kn #{{:name "content" :value "Click button to fetch google"}}
                         :cleanup-rules (concat ui-cleanup-rules timer-cleanup-rules io-cleanup-rules
                                                [])
                         :tick-rules [(rule {:name :ui/onClick :id "fetch-button"}
                                            (+ {:name :http-get :url "https://google.com" :id "google"}))
                                      (rule {:name :http-response :id "google" :data data}
                                            (> {:name "content"} {:value data}))
                                      ]
                         :rules [[(rule {:name "content" :value v}
                                        (+s (hiccup
                                             [:p {:id "content-ui"} v]
                                             [:button {:id "fetch-button" :events ["onClick"]} "fetch"])))]]}))

  (-> @fetcher :kn :old)



  (def todo (run-env {:kn #{{:name "counter" :value 2}
                            {:name "todo" :id 0 :text "get milk" :order 0}
                            {:name "todo" :id 1 :text "take books back" :order 1}
                            {:name "todo" :id 2 :text "cook" :order 2}
                            {:name "todo-done" :id 0 :done? "false"}
                            {:name "todo-done" :id 1 :done? "false"}
                            {:name "todo-done" :id 2 :done? "false"}
                            {:name "todo-editing" :id 0 :editing? "false"}
                            {:name "todo-editing" :id 1 :editing? "false"}
                            {:name "todo-editing" :id 2 :editing? "false"}
                            {:name :todo/current-text :value ""}
                            {:name :todo/filter :value "all"}
                            {:name :todo/toggle-all :value "false"}
                            }
                      :cleanup-rules (concat ui-cleanup-rules
                                             [(rule ^disp {:name :todo/displayed}
                                                    (- disp))])
                      :tick-rules [;;on change
                                   (rule {:name :ui/onChange :id "todo-input" :value v}
                                         (> {:name :todo/current-text} {:value v}))

                                   ;;submit
                                   (rule {:name :ui/onClick :id "add-todo"}
                                         (+ {:name :todo/new!}))
                                   (rule {:name :ui/onKeyDown :id "todo-input" :keyCode 13}
                                         (+ {:name :todo/new!}))

                                   ;;add a new todo
                                   (rule {:name :todo/new!}
                                         {:name "counter" :value v}
                                         {:name :todo/current-text :value text}
                                         (= new-count (inc v))
                                         (- {:name :todo/new!})
                                         (> {:name "counter"} {:value new-count})
                                         (> {:name :todo/current-text} {:value ""})
                                         (+ {:name "todo" :id new-count :text text :order new-count})
                                         (+ {:name "todo-editing" :id new-count :editing? "false"})
                                         (+ {:name "todo-done" :id new-count :done? "false"}))

                                   ;;todo editing
                                   (rule {:name :ui/onDoubleClick :entity ent}
                                         {:name "todo-editing" :id ent :editing? "false"}
                                         (> {:name "todo-editing" :id ent} {:editing? "true"}))

                                   (rule {:name :ui/onBlur :entity ent}
                                         {:name :todo/edit-text :value v}
                                         (> {:name "todo" :id ent} {:text v})
                                         (> {:name "todo-editing" :id ent} {:editing? "false"}))

                                   (rule {:name :ui/onChange :id "todo-editor" :value v}
                                         (> {:name :todo/edit-text} {:value v})
                                         (+ {:name :todo/edit-text :value v}))

                                   (rule {:name :ui/onKeyDown :id "todo-editor" :keyCode 13 :entity ent}
                                         {:name :todo/edit-text :value new-value}
                                         (> {:name "todo" :id ent} {:text new-value})
                                         (> {:name "todo-editing" :id ent} {:editing? "false"}))

                                   (rule {:name :ui/onChange :event-key "todo-checkbox" :entity ent :value v}
                                         (> {:name "todo-done" :id ent} {:done? v}))

                                   (rule {:name :ui/onClick :event-key "filter-all"}
                                         (> {:name :todo/filter} {:value "all"}))
                                   (rule {:name :ui/onClick :event-key "filter-active"}
                                         (> {:name :todo/filter} {:value "false"}))
                                   (rule {:name :ui/onClick :event-key "filter-completed"}
                                         (> {:name :todo/filter} {:value "true"}))

                                   (rule {:name :ui/onChange :event-key "toggle-all" :value v}
                                         (> {:name :todo/toggle-all} {:value v}))

                                   (rule {:name "todo-done" :id id}
                                         {:name :ui/onChange :event-key "toggle-all" :value v}
                                         (> {:name "todo-done" :id id} {:done? v}))

                                   (rule {:name :ui/onClick :event-key "clear completed"}
                                         {:name "todo-done" :id ent :done? "true"}
                                         (+ {:name :todo/remove! :id ent}))

                                   (rule {:name :ui/onClick :event-key "todo-remove" :entity ent}
                                         (+ {:name :todo/remove! :id ent}))

                                   (rule {:name :todo/remove! :id id}
                                         ^todo {:name "todo" :id id}
                                         ^done {:name "todo-done" :id id}
                                         ^editing {:name "todo-editing" :id id}
                                         (- todo)
                                         (- done)
                                         (- editing))]

                      :rules [[(rule {:name "todo" :id id}
                                     {:name :todo/filter :value "all"}
                                     (+ {:name :todo/displayed :id id}))
                               (rule {:name "todo" :id id}
                                     {:name :todo/filter :value v}
                                     {:name "todo-done" :id id :done? v}
                                     (+ {:name :todo/displayed :id id}))]

                              [(rule {:name :todo/displayed :id id}
                                     {:name "todo" :id id :text text :order order}
                                     {:name "todo-done" :id id :done? done}
                                     (= parent-id (str "todo" id))
                                     (= child-id (str "todo-checkbox" id))
                                     (+s (hiccup
                                          [:input {:id child-id
                                                   :event-key "todo-checkbox"
                                                   :entity id
                                                   :checked done
                                                   :events ["onChange"]
                                                   :type "checkbox"}]))
                                     (+ {:name :ui/child :id parent-id :child child-id :pos -1}))]
                              [(rule {:name :todo/displayed :id id}
                                     {:name "todo" :id id :text text :order order}
                                     {:name "todo-editing" :id id :editing? "false"}
                                     (+s (hiccup
                                          [:li {:id (str "todo" id) :entity id :event-key "todo" :events ["onDoubleClick"]}
                                           text
                                           [:button {:id (str "todo-remove" id) :style {:margin-left "10px"} :entity id :event-key "todo-remove" :events ["onClick"]} "x"]]))
                                     (= child-id (str "todo" id))
                                     (+ {:name :ui/child :id "todo-list" :child child-id :pos order}))
                               (rule {:name :todo/displayed :id id}
                                     {:name "todo" :id id :text text :order order}
                                     {:name "todo-editing" :id id :editing? "true"}
                                     (+s (hiccup
                                          [:input {:id (str "todo-editor") :entity id :event-key "todo-editor" :defaultValue text :events ["onChange" "onKeyDown" "onBlur"]}]))
                                     (+ {:name :ui/child :id "todo-list" :child "todo-editor" :pos order}))]

                              [(rule {:name :todo/current-text :value v}
                                     (+s (hiccup
                                          [:input {:id "todo-input" :value v :event-key "todo-input" :events ["onChange" "onKeyDown"] :placeholder "What do you need to do?"}]))
                                     (+ {:name :ui/child :id "app" :child "todo-input" :pos 1}))]

                              [(rule (set remaining [id]
                                          {:name "todo-done" :id id :done? "false"})
                                     (= left (count remaining))
                                     (= text (if (= left 1)
                                               " todo "
                                               " todos "))
                                     (+s (hiccup [:span {:id "remaining-count"} left text "left"]))
                                     (+ {:name :ui/child :id "app" :child "remaining-count" :pos 3.5}))

                               (rule (set completed [id]
                                          {:name "todo-done" :id id :done? "true"})
                                     (= left (count completed))
                                     (? (> left 0))
                                     (+s (hiccup [:span {:id "completed-count" :event-key "clear completed" :events ["onClick"]} "clear completed (" left ")"]))
                                     (+ {:name :ui/child :id "app" :child "completed-count" :pos 7}))]

                              [(rule {:name :todo/toggle-all :value toggle}
                                     (+s (hiccup
                                          [:div {:id "app"}
                                           [:h1 {:id "todo-header"} "Todos"]
                                           [:input {:id "toggle-all"
                                                    :event-key "toggle-all"
                                                    :checked toggle
                                                    :events ["onChange"]
                                                    :type "checkbox"}]
                                           [:button {:id "add-todo" :event-key "add-todo" :events ["onClick"]} "add"]
                                           [:ul {:id "todo-list"}]
                                           [:button {:id "filter-all" :event-key "filter-all" :events ["onClick"]} "all"]
                                           [:button {:id "filter-active" :event-key "filter-active" :events ["onClick"]} "active"]
                                           [:button {:id "filter-completed" :event-key "filter-completed" :events ["onClick"]} "completed"]
                                           ]))
                                     )]
                              ]}))

  ((query ^todo {:name :ui/elem :id "remaining-count"}
          (+ todo)) (-> @todo :kn))

  ( (query {:name :ui/attr
                       :id id
                       :attr attr
                       :value value}
                       (+ {:id id
                           :attr attr
                           :value value}))(-> @todo :kn))


(set! *print-fn* (fn []))
  (enable-console-print!)
  )
