(ns ui.renderer-test
  (:require [ui.client :as client]
            [ui.renderer :as renderer]))

(enable-console-print!)

(def container (.getElementById js/document "render-target"))
(defonce renderer (renderer/make-renderer container))

(defn foo []
  (renderer/render renderer {:inserts ['("foo" "tag" "div")
                                       '("foo" "class" "header")
                                       '("foo" "text" "RATS")
                                       '("foo" "parent" "root")
                                       '("bar" "ix" 1)
                                       '("bar" "parent" "quux")
                                       '("baz" "parent" "bar")
                                       '("baz" "text" "NOT THE BEES")
                                       '("quux" "tag" "div")
                                       '("quux" "ix" 1)
                                       '("quux" "parent" "root")]
                             :removes []})
  nil)

(client/add-renderer "test-renderer" foo)
(client/init)
