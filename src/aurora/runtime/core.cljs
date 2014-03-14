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
                             (rule {:name :ui/text :id "time-value" :text text}
                                   (- {:name :ui/text :id "time-value" :text text}))]
                            ;;program rules
                            [(rule [:tick]
                                   (- [:tick])
                                   (+ {:name :wait :time 1000 :id "clock"}))
                             (rule {:name :tick :id "clock" :timestamp ts}
                                   (+ {:name :wait :time 1000 :id "clock"})
                                   (+ {:name :ui/elem :id "time" :tag "p"})
                                   (+ {:name :ui/child :id "time" :child "time-value" :pos 0})
                                   (+ {:name :ui/text :id "time-value" :text (str "time is: " (js/Date. ts))})
                                   )
                             ]])
                 (run)))

  (pause clock)
  (unpause clock)
  @clock


  (def incrementer (-> (make-env #{{:name "counter" :value 0}}
                                 [
                                  ;;clean up rules
                                  [(rule {:name :ui/text :id "counter-value" :text text}
                                         (- {:name :ui/text :id "counter-value" :text text}))
                                   ]
                                  ;;program rules
                                  [(rule {:name :ui/onClick :id "incr-button"}
                                         {:name "counter" :value v}
                                         (- {:name :ui/onClick :id "incr-button"})
                                         (- {:name "counter" :value v})
                                         (+ {:name "counter" :value (inc v)}))]
                                  [(rule {:name "counter" :value v}
                                         (+ {:name :ui/elem :id "counter-ui" :tag "p"})
                                         (+ {:name :ui/child :id "counter-ui" :child "counter-value" :pos 0})
                                         (+ {:name :ui/text :id "counter-value" :text (str v)})
                                         (+ {:name :ui/elem :id "incr-button" :tag "button"})
                                         (+ {:name :ui/event-listener :id "incr-button" :event "onClick"})
                                         (+ {:name :ui/child :id "incr-button" :child "incr-value" :pos 0})
                                         (+ {:name :ui/text :id "incr-value" :text "increment"})
                                         )
                                   ]])
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


  )
