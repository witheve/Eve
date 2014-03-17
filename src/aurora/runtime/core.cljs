(ns aurora.runtime.core
  (:require [aurora.util.core :as util]
            [aurora.compiler.datalog :as datalog]
            [clojure.set :as set]
            [aurora.editor.ReactDommy :as dommy])
  (:require-macros [aurora.compiler.datalog :refer [query rule]]))

(def watchers (atom []))

(declare handle-feed tick)

(defn feeder [env fact]
  (when-not (:queued? @env)
    (swap! env assoc :queued? (js/setTimeout (partial handle-feed env) 0)))
  (.push (:feed @env) fact))

(defn chain-rules [strata]
  (datalog/chain (for [stratum strata]
                   (datalog/fixpoint (datalog/chain stratum)))))

(defn tick [kn tick-rules rules watchers feeder-fn]
  (let [chained-tick-rules (datalog/chain tick-rules)
        kn (chained-tick-rules kn)
        chained (chain-rules rules)
        kn (chained kn)]
    (doseq [watch watchers]
      (watch kn feeder-fn))
    (datalog/and-now kn)))

(defn handle-feed [env]
  (when-not (:paused @env)
    (.time js/console "run")
    (let [feed-set (set (:feed @env))]
      (aset (:feed @env) "length" 0)
      (println "Feed set: " feed-set)
      (swap! env update-in [:kn]
             (fn [cur]
               (-> cur
                   (datalog/assert-many feed-set)
                   (datalog/and-now)
                   (tick (:tick-rules @env) (:rules @env) (:watchers @env) (:feeder-fn @env))
                   (datalog/retract-many feed-set)
                   (datalog/and-now))))
      (.timeEnd js/console "run")
      (println "final: " (- (.getTime (js/Date.)) start) (:kn @env))
      (swap! env assoc :queued? false))))

(defn run [env]
  (let [feeder-fn (partial feeder env)]
    (swap! env assoc :feeder-fn feeder-fn)
    (handle-feed env)
    env))

(defn ->env [opts]
  (atom (merge {:tick-rules []
                :rules []
                :watchers @watchers
                :feed (array)
                :queued? false}
               opts
               {:kn (datalog/Knowledge. (:kn opts #{}) #{} #{})})))

(defn run-env [opts]
  (-> opts
      (->env)
      (run)))

(defn pause [env]
  (swap! env assoc :paused true))

(defn unpause [env]
  (swap! env assoc :paused false)
  (handle-feed env))

(comment

(def hiccup js/aurora.runtime.ui.hiccup->facts)

  (def tick (run-env {:kn #{[3 5] [9 8 7] [:tick]}
                      :tick-rules [(rule {:name :wait :time t :id i}
                                         (- {:name :wait :time t :id i}))]
                      :rules [(rule [:tick]
                                  (- [:tick])
                                  (+ {:name :wait :time 1000 :id 1}))
                              (rule {:name :tick :id 1 :timestamp ts}
                                  (+ [:tick])
                                  (+ ["hi!" ts]))]}))

  (pause tick)
  (unpause tick)
  @tick

  (def clock (run-env {:kn #{{:name :tick :id "clock" :timestamp ""}}
                       :tick-rules [(rule {:name :wait :time t :id i}
                                          (- {:name :wait :time t :id i}))
                                    (rule {:name :ui/text :id "time-0" :text text}
                                          (- {:name :ui/text :id "time-0" :text text}))
                                    (rule {:name :tick :id "clock" :timestamp ts}
                                          (+ {:name :wait :time 1000 :id "clock"}))
                                    ]
                       :rules [[(rule {:name :tick :id "clock" :timestamp ts}
                                      (+s (hiccup [:p {:id "time"} (str "time is: " (js/Date. ts))])))
                                ]]
                       }))

  (pause clock)
  (unpause clock)
  @clock

  (def incrementer (run-env {:kn #{{:name "counter" :value 0}}
                             :tick-rules [(rule {:name :ui/text :id "counter-ui-0" :text text}
                                                (- {:name :ui/text :id "counter-ui-0" :text text}))
                                          (rule {:name :ui/onClick :id "incr-button"}
                                                {:name "counter" :value v}
                                                (- {:name "counter" :value v})
                                                (+ {:name "counter" :value (inc v)}))]
                             :rules [[(rule {:name "counter" :value v}
                                            (+s (hiccup
                                                 [:p {:id "counter-ui"} v]
                                                 [:button {:id "incr-button" :events ["onClick"]} "increment"])))]]}))

  (pause incrementer)
  (unpause incrementer)
  (:kn @incrementer)

  (def fetcher (run-env {:kn #{{:name "content" :value "Click button to fetch google"}}
                         :tick-rules [(rule {:name :ui/text :id "content-ui-0" :text text}
                                             (- {:name :ui/text :id "content-ui-0" :text text}))
                                       (rule {:name :http-get :url "https://google.com" :id "google"}
                                             (- {:name :http-get :url "https://google.com" :id "google"}))
                                       (rule {:name :ui/onClick :id "fetch-button"}
                                             (+ {:name :http-get :url "https://google.com" :id "google"}))
                                       (rule {:name :http-response :id "google" :data data}
                                             {:name "content" :value v}
                                             (- {:name "content" :value v})
                                             (+ {:name "content" :value data}))
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
                            {:name :todo/current-text :value ""}
                            }
                      :tick-rules [;;ui cleanup
                                   (rule {:name :ui/text :id "cur-value-1" :text text}
                                         (- {:name :ui/text :id "cur-value-1" :text text}))
                                   (rule {:name :ui/attr :id "todo-input" :attr "value" :value v}
                                         (- {:name :ui/attr :id "todo-input" :attr "value" :value v}))

                                   ;;on change
                                   (rule {:name :ui/onChange :id "todo-input"}
                                         {:name :todo/current-text :value v}
                                         (- {:name :todo/current-text :value v}))
                                   (rule {:name :ui/onChange :id "todo-input" :value v}
                                         (+ {:name :todo/current-text :value v}))

                                   ;;submit
                                   (rule {:name :ui/onClick :id "add-todo"}
                                         (+ {:name :todo/new!}))
                                   (rule {:name :ui/onKeyDown :id "todo-input" :keyCode 13}
                                         (+ {:name :todo/new!}))

                                   ;;add a new todo
                                   (rule {:name :todo/new!}
                                         {:name "counter" :value v}
                                         {:name :todo/current-text :value text}
                                         (- {:name :todo/new!})
                                         (- {:name "counter" :value v})
                                         (- {:name :todo/current-text :value text})
                                         (+ {:name :todo/current-text :value ""})
                                         (+ {:name "counter" :value (inc v)})
                                         (+ {:name "todo" :id (inc v) :text text :order (inc v)}))

                                   ]
                      :rules [[(rule {:name "todo" :id id :text text :order order}
                                     (+s (hiccup
                                          [:li {:id (str "todo" id)} text]))
                                     (+ {:name :ui/child :id "todo-list" :child (str "todo" id) :pos order}))]
                              [(rule {:name :todo/current-text :value v}
                                     (+s (hiccup
                                          [:input {:id "todo-input" :value v :events ["onChange" "onKeyDown"] :placeholder "What do you need to do?"}]))
                                     (+ {:name :ui/child :id "app" :child "todo-input" :pos 1}))]
                              [(rule (+s (hiccup
                                          [:div {:id "app"}
                                           [:h1 {:id "todo-header"} "Todos"]
                                           [:button {:id "add-todo" :events ["onClick"]} "add"]
                                           [:ul {:id "todo-list"}]
                                           ]))
                                     )]
                              ]}))


  )
