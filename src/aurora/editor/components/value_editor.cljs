(ns aurora.editor.components.value-editor
  (:require [aurora.editor.types :as types]
            [aurora.editor.dom :as dom]
            [aurora.editor.core :refer [state]]
            [aurora.util.core :refer [key-codes]]))

;;*********************************************************
;; Value editor CodeMirror
;;*********************************************************

(def value-editor (js/CodeMirror. (fn [])))
(dom/add-class (.getWrapperElement value-editor) :value-editor)

(defn editor-state-value []
  (let [ed (:editor @state)]
    (or (:value ed)
        (get-in @state (:path ed)))))

(defn on-value-change []
  (let [cur-value (.getValue value-editor)]
    ))

(defn handle-value-submit [v]
  (let [editor (:editor @state)]
    (swap! state assoc-in (:path editor) (types/->parser (:type editor) v))
    (when-not (get-in @state [:editor :remain-open])
      (swap! state assoc :editor {})
      (.setValue value-editor ""))))

(defn undo-value-editor []
  (swap! state assoc :editor {}))

(defn on-value-editor-show []
  (if-let [v (editor-state-value)]
    (.setValue value-editor (cond
                             (symbol? v) (str "*" v)
                             (coll? v) (pr-str v)
                             :else (str v)))
    (.setValue value-editor "")))

(defn on-value-keydown [e]
  (when (= (.-keyCode e) (:tab key-codes))
    (println "ZOMG TAB KEY")
    (.preventDefault e))
  (when (= (.-keyCode e) (:esc key-codes))
    (undo-value-editor)
    (.preventDefault e))
  (when (= (.-keyCode e) (:enter key-codes))
    (swap! state assoc-in [:editor :remain-open] false)
    (handle-value-submit (.getValue value-editor))
    (.preventDefault e)))

(defn on-value-blur []
  (when (get-in @state [:editor :path])
    (handle-value-submit (.getValue value-editor)))
  )

(.on value-editor "change" (fn [] (on-value-change)))
(.on value-editor "blur" (fn [] (on-value-blur)))
(.on value-editor "keydown" (fn [_ e] (on-value-keydown e)))

;;*********************************************************
;; Matcher CodeMirror
;;*********************************************************
