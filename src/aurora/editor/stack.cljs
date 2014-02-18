(ns aurora.editor.stack
  (:require [aurora.editor.cursors :refer [cursor cursor->id]]
            [aurora.editor.core :refer [aurora-state]]))

;;*********************************************************
;; Stack
;;
;; The stack is used to keep track of where we are in the
;; call tree
;;*********************************************************

(defn stack->cursor [stack type]
  (when stack
    (->> stack
         (filter #(= (first %) type))
         (first)
         (second)
         (cursor))))

(defn rev-stack->cursor [stack type]
  (when stack
    (->> stack
         (reverse)
         (filter #(= (first %) type))
         (first)
         (second)
         (cursor))))

(defn push [stack thing]
  (when stack
    (conj stack [(condp = (:type @thing)
                   :page :page
                   :notebook :notebook
                   :step)
                 (cursor->id thing)])))

(defn set-stack! [stack]
  (when stack
    (swap! aurora-state assoc :stack stack)))

(defn current-stack? [stack]
  (when stack
    (= (:stack @aurora-state) stack)))
