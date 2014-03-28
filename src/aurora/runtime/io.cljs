(ns aurora.runtime.io
  (:require [fetch.core :as fetch]
            [aurora.compiler.datalog :as datalog]
            [aurora.runtime.core :as runtime]
            [aurora.runtime.timers :refer [now]])
  (:require-macros [aurora.compiler.datalog :refer [rule]]))

(def find-http-gets (rule (+ed {:name :http-get
                                :url url
                                :id id})
                          (+ [id url])))

(defn on-bloom-tick [knowledge queue]
  (let [gets (datalog/query-rule find-http-gets knowledge)]
    (doseq [[id url] gets]
      (fetch/xhr [:get url] {}
                 (fn [data]
                   (println "got http response for: " id)
                   (queue {:name :http-response :id id :data data :timestamp (now)})
                   )))))

(swap! runtime/watchers conj (fn [kn queue] (on-bloom-tick kn queue)))
