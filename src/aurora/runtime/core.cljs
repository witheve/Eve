(ns aurora.runtime.core
  (:require [aurora.util.core :as util]
            [aurora.language :as language]
            [aurora.language.representation :as representation]
            [aurora.language.denotation :as denotation]
            [aurora.language.stratifier :as stratifier]
            [aurora.util.core :refer [now]]
            [aurora.editor.dom :as dom]
            [clojure.set :as set]
            [aurora.editor.ReactDommy :as dommy])
  (:require-macros [aurora.language.macros :refer [query rule]]))

(def watchers (atom []))

(declare handle-feed tick)

(defn feeder [env fact]
  (when-not (:queued? @env)
    (swap! env assoc :queued? (js/setTimeout (partial handle-feed env nil) 0)))
  (.push (:feed @env) fact))

(defn tick-inductive [kn tick-rules]
  (stratifier/run-ruleset tick-rules kn))

(defn tick-deductive [kn rules]
  (stratifier/run-ruleset rules kn))

(defn tick-watchers [kn watchers feeder-fn]
  (doseq [watch watchers]
    (watch kn feeder-fn))
  kn)

(defn tick [kn tick-rules rules watchers feeder-fn]
  (-> kn
      (tick-inductive tick-rules)
      (tick-deductive rules)
      (tick-watchers watchers feeder-fn)
      (representation/tick)))

(defn add-history [history point limit]
  (when (>= (.-length history) limit)
    (.shift history))
  (.push history point))

(enable-console-print!)

(defn quiescience [prev env init-facts]
  (js/console.time "quiescience")
  (let [aurora-facts [(language/fact :aurora/time #js [(.getTime (js/Date.))])]]
    (let [cur (language/tick (:rules env) prev)]
      (language/add-facts-compat cur :known|pretended init-facts)
      (language/add-facts-compat cur :known|pretended aurora-facts)
      (language/fixpoint! cur)
      (tick-watchers cur (:watchers env) (:feeder-fn env))
      (loop [cur cur
             prev prev
             i 0]
        (cond
         (>= i 10) (do
                     (js/console.timeEnd "quiescience")
                     (js/alert "Aborting!")
                     (aurora.runtime.ui/on-bloom-tick cur (:feeder-fn env))
                     cur)
         (language/unchanged? prev cur) (do
                                          (js/console.timeEnd "quiescience")
                                          (aurora.runtime.ui/on-bloom-tick cur (:feeder-fn env))
                                          cur)
         :else (let [next (language/tick (:rules env) cur)]
                 (language/add-facts-compat next :known|pretended aurora-facts)
                 (language/fixpoint! next)
                 (tick-watchers next (:watchers env) (:feeder-fn env))
                 (recur next cur (inc i))))))))

(defn handle-feed [env init-facts opts]
  (when (or (:force opts)
            (not (:paused @env)))
    (let [start (now)
          feed-set (or (:feed-set opts) (vec (:feed @env)))
          feed-func (or (:feeder-fn opts) (:feeder-fn @env))
          cur-env @env
          plan (:rules cur-env)]
      (aset (:feed @env) "length" 0)
      (when (and (not (:feed-set opts))
                 (seq feed-set))
        (add-history (:history @env) [(:kn @env) feed-set] (:history-size @env)))
      (swap! env update-in [:kn] #(quiescience % cur-env (concat init-facts feed-set)))
      (when-let [rp (dom/$ "#run-perf")]
        (dom/html rp (.toFixed (- (now) start) 3)))
      ;(println "final: " (- (.getTime (js/Date.)) start) (:kn @env))
      (swap! env assoc :queued? false))))

;; (defn replay-last [env to-merge num]
;;   (let [hist (:history @env)
;;         len (dec (.-length hist))
;;         num (if (< len num)
;;               len
;;               num)
;;         starting (-> (aget hist (- len num))
;;                      (first)
;;                      (representation/assert-facts to-merge)
;;                      (representation/tick))]
;;     (swap! env assoc :kn starting)
;;     (doseq [x (reverse (range 0 num))
;;             :let [feed-set (-> (aget hist (- len x))
;;                                (last))]]
;;       (handle-feed env {:force true
;;                         :feed-set feed-set
;;                         ;:feeder-fn (fn [x y])
;;                         }))))


(defn run [env]
  (let [feeder-fn (partial feeder env)]
    (swap! env assoc :feeder-fn feeder-fn)
    (handle-feed env nil)
    env))

(defn ->env [opts]
  (let [kn (-> (language/rules->plan [] [])
               (language/flow-plan->flow-state)
               (language/add-facts-compat :known|pretended (:kn opts #{})))
        env (merge {:rules (language/rules->plan [] [])
                    :watchers @watchers
                    :history-size 20
                    :history (array [kn #{}])
                    :feed (array)
                    :queued? false}
                   opts
                   {:kn kn})]
    (atom env)))

(defn run-env [opts]
  (-> opts
      (->env)
      (run)))

(defn pause [env]
  (swap! env assoc :paused true))

(defn unpause [env]
  (swap! env assoc :paused false)
  (handle-feed env nil))

(comment
(defn go-to-do []

(def hiccup js/aurora.runtime.ui.hiccup->facts)

  (def todo-env {:kn #{{:name "counter" :value 2}
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

                 :rules [(rule {:name "todo" :id id}
                               {:name :todo/filter :value "all"}
                               (+ {:name :todo/displayed :id id}))
                         (rule {:name "todo" :id id}
                               {:name :todo/filter :value v}
                               {:name "todo-done" :id id :done? v}
                               (+ {:name :todo/displayed :id id}))

                         (rule {:name :todo/displayed :id id}
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
                               (+ {:name :ui/child :id parent-id :child child-id :pos -1}))
                         (rule {:name :todo/displayed :id id}
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
                               (+ {:name :ui/child :id "todo-list" :child "todo-editor" :pos order}))

                         (rule {:name :todo/current-text :value v}
                               (+s []
                                   (hiccup
                                    [:input {:id "todo-input" :value v :event-key "todo-input" :events ["onChange" "onKeyDown"] :placeholder "What do you need to do?"}]))
                               (+ {:name :ui/child :id "app" :child "todo-input" :pos 1}))

                         (rule (set remaining [id]
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
                               (+ {:name :ui/child :id "app" :child "completed-count" :pos 7}))

                         (rule {:name :todo/toggle-all :value toggle}
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
                               )
                         ]})

  (def todo (run-env todo-env)))

;; (go-to-do)
;; (js/setTimeout go-to-do 5000)
  )

(comment

(def hiccup js/aurora.runtime.ui.hiccup->facts)


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

  )
