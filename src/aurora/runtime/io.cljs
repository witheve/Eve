(ns aurora.runtime.io
  (:require [fetch.core :as fetch]
            [aurora.language.operation :as operation]
            [aurora.runtime.core :as runtime]
            [aurora.runtime.timers :refer [now]])
  (:require-macros [aurora.language.macros :refer [rule]]))

(def find-http-gets (rule (+ed {:ml :http/get
                                "url" url
                                "id" id})
                          (+ [id url])))

(defn on-bloom-tick [knowledge queue]
  (println "in io watcher")
  (let [gets (operation/query-rule find-http-gets knowledge)]
    (doseq [[id url] gets]
    (println "firing query: " id url)
      (fetch/xhr [:get url] {}
                 (fn [data]
                   (println "got http response for: " id)
                   (queue {:ml :http/response "id" id "content" data "time" (now)})
                   )))))

(swap! runtime/watchers conj (fn [kn queue] (on-bloom-tick kn queue)))
