(ns aurora.runtime.timers
  (:require [aurora.util.core :as util]
            [aurora.compiler.datalog :as datalog])
  (:require-macros [aurora.compiler.datalog :refer [query rule]]))

(defn now []
  (.getTime (js/Date.)))

(defn wait [time do]
  (js/setTimeout do time))

;; generic fact: {:name "someidthing" :madlib "yay [a] and then [b]" :a 5 :b 9}
;; wait fact: {:name :wait :madlib "wait [time]ms with [id]" :time 500 :id 1}
;; tick fact {:name 12341234 :madlib "tick with [id]" :id 9}

(def find-waits (query (+ed {:name :wait
                             :time time
                             :id id})
                       (+ [time id])))

(defn on-bloom-tick [knowledge queue]
  (let [waits (find-waits knowledge)]
    (doseq [[time id] waits]
      (wait time (fn []
                   (.push queue {:name :tick :id id :timestamp (now)}))))))

(comment

  (def test-kn (-> datalog/empty
                   (datalog/assert {:name :wait :time 500 :id 1})
                   (datalog/assert {:name :wait :time 100 :id 2})))

  (def q (array))
  (on-bloom-tick test-kn q)

  q
  )
