(ns ui.renderer-test
  (:require [ui.client :as client]
            [ui.renderer :as renderer]))

(enable-console-print!)

(def container (.getElementById js/document "render-target"))
(println "CONT" container)
(def renderer (renderer/make-renderer container))

(defn foo []
  (renderer/render renderer {:inserts ['("foo" "tag" "div")
                                       '("foo" "textContent" "CATS")
                                       '("bar" "ix" 1)
                                       '("baz" "parent" "bar")
                                       '("baz" "textContent" "NOT THE BEES")]
                             :removes []})
  nil)

(client/add-renderer "test-renderer" foo)
(client/init)
