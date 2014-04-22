(ns aurora.runtime.io
  (:require [fetch.core :as fetch]
            [aurora.language :as language]
            [aurora.language.operation :as operation]
            [aurora.runtime.stdlib :as stdlib]
            [aurora.runtime.core :as runtime]
            [aurora.runtime.timers :refer [now]])
  (:require-macros [aurora.language.macros :refer [rule]]))

(defn collect [facts]
  (let [gets (array)]
    (doseq [fact facts
            :let [[coll thing] (condp = (.-shape fact)
                                 :http/get [gets [(get fact 1) (get fact 0)]]
                                 nil)]
            :when coll]
      (.push coll thing))
    {:gets gets}))

(defn on-bloom-tick [knowledge queue]
  (println "in io watcher")
  (let [{:keys [gets]} (collect (language/get-facts-compat knowledge :pretended))]
    (doseq [[id url] gets]
    (println "firing query: " id url)
      (fetch/xhr [:get url] {}
                 (fn [data]
                   (println "got http response for: " id)
                   (queue (stdlib/map->fact {:ml :http/response "id" id "content" data "time" (now)}))
                   )))))

(swap! runtime/watchers conj (fn [kn queue] (on-bloom-tick kn queue)))
