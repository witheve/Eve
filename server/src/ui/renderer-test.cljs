(ns ui.renderer-test
  (:require [ui.client :as client]
            [ui.renderer :as renderer]))

(enable-console-print!)

(def container (.getElementById js/document "render-target"))
(defonce renderer (renderer/make-renderer container))

(defn foo []
  (let [positionalize (fn [fact] [(aget fact "e") (aget fact "a") (aget fact "v")])
        last-diff (client/get-last-diff "ui")
        inserts (map positionalize (aget last-diff "adds"))
        removes (map positionalize (aget last-diff "removes"))]
    (println "LAST DIFF ADDS:" inserts)
    (println "LAST DIFF REMOVES:" removes)
    ;; @TODO: get removes by  remembering previous facts.
    (renderer/render renderer {:inserts inserts
                               :removes removes})
    nil))

(client/add-renderer "test-renderer" foo)
(client/init)

(client/on-open
 (fn []
   ;; (client/send-query "people-tiles"
   ;;                    (client/query-string `(define-ui people-tiles
   ;;                                            (fact person :tag "person" :name :role)
   ;;                                            (ui [name role]
   ;;                                                (div :id container :class "people-tile")
   ;;                                                (h3 :parent container :text name)
   ;;                                                (div :parent container :text role)))))


   (client/send-query "ui"
                      (client/query-string `(query [e a v]
                                                   (ui :e :a :v))))))
