(ns aurora.runtime.timers
  (:require [aurora.util.core :as util]
            [aurora.runtime.core :as runtime]
            [aurora.runtime.stdlib :as stdlib]
            [aurora.language :as language]
            [aurora.language.representation :as representation]
            [aurora.language.operation :as operation]
            [aurora.language.denotation :as denotation])
  (:require-macros [aurora.language.macros :refer [rule]]
                   [aurora.macros :refer [for!]]))

(defn now []
  (.getTime (js/Date.)))

(defn wait [time do]
  (js/setTimeout do time))

(def aurora-refresh nil)

;; generic fact: {:name "someidthing" :madlib "yay [a] and then [b]" :a 5 :b 9}
;; wait fact: {:name :wait :madlib "wait [time]ms with [id]" :time 500 :id 1}
;; tick fact {:name 12341234 :madlib "tick with [id]" :id 9}

(defn collect [knowledge]
  {:refresh (for! [fact (language/get-facts knowledge :known|pretended :aurora/refresh)]
              (get fact 0))
   :waits (for! [fact (language/get-facts knowledge :known|pretended :timers/wait)]
              {"time" (get fact 0)
               "timer" (get fact 1)})})

(defn on-bloom-tick [knowledge queue]
  (let [{:keys [waits refresh]} (collect knowledge)]
    (doseq [[time id] waits]
      (println "setting up wait for: " time id)
      (wait time (fn []
                   (queue (stdlib/map->fact {:ml :timers/tick "timer" id "time" (now)}))
                   )))
    (if-let [refresh (first refresh)]
      (do
        (println "Got refresh: " refresh)
        (when-not (= (:wait aurora-refresh) refresh)
          (when (:timer aurora-refresh)
            (js/clearTimeout (:timer aurora-refresh)))
          (set! aurora-refresh {:wait refresh
                                :timer (js/setInterval (fn []
                                                         (queue (stdlib/map->fact {:ml :aurora/tick})))
                                                       refresh)})))
      (do
        (js/clearTimeout (:timer aurora-refresh))
        (set! aurora-refresh {})))))

(swap! runtime/watchers conj (fn [kn queue] (on-bloom-tick kn queue)))

(comment

  (def test-kn (-> representation/empty
                   (representation/assert {:name :wait :time 500 :id 1})
                   (representation/assert {:name :wait :time 100 :id 2})))

  (def q (array))
  (on-bloom-tick test-kn (fn [fact] (.push q fact)))

  q
  )
