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

(defn tick [kn rules watchers feeder-fn]
  (println "ticking: " watchers)
  (let [chained (chain-rules rules)
        kn (chained kn)]
    (doseq [watch watchers]
      (println "going through watchers")
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
                   (tick (:rules @env) (:watchers @env) (:feeder-fn @env))
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

(defn make-env
  ([kn rules]
   (make-env kn rules @watchers))
  ([kn rules watchers]
   (atom {:kn (datalog/Knowledge. kn #{} #{})
          :rules rules
          :watchers watchers
          :feed (array)
          :queued? false})))

(defn pause [env]
  (swap! env assoc :paused true))

(defn unpause [env]
  (swap! env assoc :paused false)
  (handle-feed env))


(comment

(def hiccup js/aurora.runtime.ui.hiccup->facts)

  (def tick (-> (make-env #{[3 5] [9 8 7] [:tick]}
                          [
                           ;;clean up rules
                           [(rule {:name :wait :time t :id i}
                                  (- {:name :wait :time t :id i}))]
                           ;;program rules
                           [(rule [:tick]
                                  (- [:tick])
                                  (+ {:name :wait :time 1000 :id 1}))
                            (rule {:name :tick :id 1 :timestamp ts}
                                  (+ [:tick])
                                  (+ ["hi!" ts]))
                            ]])
                (run)))

  (pause tick)
  (unpause tick)
  @tick

  (def clock (-> (make-env #{[:tick]}
                           [
                            ;;clean up rules
                            [(rule {:name :wait :time t :id i}
                                   (- {:name :wait :time t :id i}))
                             (rule {:name :ui/text :id "time-0" :text text}
                                   (- {:name :ui/text :id "time-0" :text text}))]
                            ;;program rules
                            [(rule [:tick]
                                   (- [:tick])
                                   (+ {:name :wait :time 1000 :id "clock"}))
                             (rule {:name :tick :id "clock" :timestamp ts}
                                   (+ {:name :wait :time 1000 :id "clock"})
                                   (+s (hiccup [:p {:id "time"} (str "time is: " (js/Date. ts))]))
                                   )
                             ]])
                 (run)))

  (pause clock)
  (unpause clock)
  @clock

  (def incrementer (-> (make-env #{{:name "counter" :value 0}}
                                 [;;clean up rules
                                  [(rule {:name :ui/text :id "counter-ui-0" :text text}
                                         (- {:name :ui/text :id "counter-ui-0" :text text}))]
                                  ;;program rules
                                  [(rule {:name :ui/onClick :id "incr-button"}
                                         {:name "counter" :value v}
                                         (- {:name :ui/onClick :id "incr-button"})
                                         (- {:name "counter" :value v})
                                         (+ {:name "counter" :value (inc v)}))]
                                  [(rule {:name "counter" :value v}
                                         (+s (hiccup
                                              [:p {:id "counter-ui"} v]
                                              [:button {:id "incr-button" :events ["onClick"]} "increment"])))]])
                       (run)))

  (pause incrementer)
  (unpause incrementer)
  (:kn @incrementer)


  (def +s-test (-> (make-env #{[:tick] [:whee] [:zomg]}
                             [
                              ;;clean up rules
                              [(rule {:name :ui/text :id "counter-value" :text text}
                                     (- {:name :ui/text :id "counter-value" :text text}))
                               ]
                              ;;program rules
                              [(rule [:tick]
                                     (-s (map vector [:tick :zomg]))
                                     (+s [{:name "foo"} {:name "zomg"}])
                                     )
                               ]])
                   (run)))

  (def fetcher (-> (make-env #{{:name "content" :value "Click button to fetch google"}}
                             [;;clean up rules
                              [
                               (rule {:name :ui/text :id "content-ui-0" :text text}
                                     (- {:name :ui/text :id "content-ui-0" :text text}))
                               (rule {:name :http-get :url "http://tycho.usno.navy.mil/cgi-bin/timer.pl" :id "google"}
                                     (- {:name :http-get :url "http://tycho.usno.navy.mil/cgi-bin/timer.pl" :id "google"}))]
                              ;;program rules
                              [(rule {:name :ui/onClick :id "fetch-button"}
                                     (+ {:name :http-get :url "http://tycho.usno.navy.mil/cgi-bin/timer.pl" :id "google"}))
                               (rule {:name :http-response :id "google" :data data}
                                     {:name "content" :value v}
                                     (- {:name "content" :value v})
                                     )
                               ]
                              [(rule {:name :http-response :id "google" :data data}
                                     (+ {:name "content" :value data})
                                     )]
                              [(rule {:name "content" :value v}
                                     (+s (hiccup
                                          [:p {:id "content-ui"} v]
                                          [:button {:id "fetch-button" :events ["onClick"]} "fetch"])))]])
                   (run)))

  (-> @fetcher :kn :old)



  (def todo (-> (make-env #{{:name "counter" :value 2}
                            {:name "todo" :id 0 :text "get milk" :order 0}
                            {:name "todo" :id 1 :text "take books back" :order 1}
                            {:name "todo" :id 2 :text "cook" :order 2}
                            }
                          [;;clean up rules
                           []
                           ;;program rules
                           [(rule {:name :ui/onClick :id "add-todo"}
                                  {:name "counter" :value v}
                                  (- {:name :ui/onClick :id "add-todo"})
                                  (- {:name "counter" :value v})
                                  (+ {:name "counter" :value (inc v)})
                                  (+ {:name "todo" :id (inc v) :text (str "new todo " (+ 2 v)) :order (inc v)})
                                  )]
                           [(rule {:name "todo" :id id :text text :order order}
                                  (+s (hiccup
                                       [:li {:id (str "todo" id)} text]))
                                  (+ {:name :ui/child :id "todo-list" :child (str "todo" id) :pos order}))]
                           [(rule (+s (hiccup
                                       [:div {:id "app"}
                                        [:h1 {:id "todo-header"} "Todos"]
                                        [:input {:id "todo-input" :placeholder "What do you need to do?"}]
                                        [:button {:id "add-todo" :events ["onClick"]} "add"]
                                        [:ul {:id "todo-list"}]
                                        ]))
                                  )]
                           ])
                (run)))


  )
