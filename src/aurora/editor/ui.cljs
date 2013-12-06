(ns aurora.editor.ui
  (:require [aurora.core :as core])
  (:require-macros [aurora.macros :refer [dom]]))

js/React

(defn coll->array [thing]
  (if-not (coll? thing)
    thing
    (to-array thing)))

(defn react-wrapper [node attr children]
  (let [children (to-array (map coll->array children))]
    ((aget js/React.DOM node) attr children)))

(dom [:div "hey"])