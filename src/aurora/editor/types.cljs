(ns aurora.editor.types
  (:require [aurora.editor.core :refer [state cur-env]]
            [cljs.reader :as reader]
            [clojure.walk :as walk]
            [aurora.editor.dom :as dom]
            ))


;;*********************************************************
;; Type editors and representations
;;*********************************************************

(defmulti ->editor (fn [rule-info _ _ ph _]
                     (get-in rule-info [:placeholders ph :type])))

(defmulti ->rep (fn [rule-info _ _ ph _]
                  (get-in rule-info [:placeholders ph :type])))

(defmulti ->parser (fn [type v]
                     type))

(defn set-editing [path]
  (fn [e]
    (.preventDefault e)
    (.stopPropagation e)
    (when (= (second path) :statements)
      (swap! state assoc-in [:editor :paused?] (:paused @cur-env))
      (swap! state assoc-in [:editor :prev-kn] (-> @cur-env :kn :prev))
      (swap! state update-in [:editor] merge {:path path
                                              :value nil
                                              :remain-open false}))))

(defn default-parser [v]
  (cond
   (= "" v) nil
   (= "*" (first v)) (symbol (subs v 1))
   (not (re-seq #"[^\d.-]" v)) (reader/read-string v)
   :else v))

(defn placeholder-rep [ph path]
  [:span {:onClick (set-editing path)
          :classes {:placeholder true}}
     ph])

(defn ref-rep [v ph path]
  [:span {:onClick (set-editing path)
          :classes {:value true}}
   (str v)])

(defmethod ->rep :default [rule-info rule v ph path]
  [:span {:onClick (set-editing path)
          :classes {:value true}}
     (cond
      (string? v) (if (> (.-length v) 100)
                    (str (subs v 0 100) "...")
                    v)
      (symbol? v) (str v)
      (vector? v) v
      (nil? v) v
      :else (str v))])

(defmethod ->editor :default []
  [:div.value-editor-container {:onClick (fn [e]
                                           (.preventDefault e)
                                           (.stopPropagation e))}])

(defmethod ->parser :default [_ v]
  (default-parser v))

(defmethod ->rep "duration" [rule-info rule v ph path]
  [:span {:onClick (set-editing path)}
   (cond
    (> v 60000) (str (/ v 60000) " minutes")
    (= v 60000) (str "1 minute")
    (> v 1000) (str (/ v 1000) " seconds")
    (= v 1000) (str "1 second")
    :else (str v " milliseconds"))])

(defmethod ->editor "duration" [rule-info rule v ph path]
  (let [[v selected] (cond
                      (>= v 60000) [(/ v 60000) "minutes"]
                      (>= v 1000) [(/ v 1000) "seconds"]
                      (or (nil? v) (= 0 v)) [1 "seconds"]
                      :else [v "milliseconds"])]
    (swap! state update-in [:editor] merge {:remain-open true
                                            :type "duration"
                                            :value v})
    [:span
     [:div.value-editor-container]
     [:select#duration-unit {:defaultValue selected}
      [:option {:value "minutes"} "minutes"]
      [:option {:value "seconds"} "seconds"]
      [:option {:value "milliseconds"} "milliseconds"]]
     ]))

(defmethod ->parser "duration" [_ v]
  (let [input (dom/$ "#duration-unit")
        unit (.-value (aget (.-options input) (.-selectedIndex input)))
        v (js/parseInt v)]
    (condp = unit
      "minutes" (* 60000 v)
      "seconds" (* 1000 v)
      "milliseconds" v)))


(defmethod ->rep "ui" [rule-info rule v ph path]
  (let [structure (try
                    (reader/read-string v)
                    (catch :default e))
        walked (walk/prewalk (fn [x]
                               (if-not (symbol? x)
                                 x
                                 [:span.ref (str x)])
                               )
                             structure)]
    [:span.ui-rep {:onClick (set-editing path)}
     walked
     ;"UI preview"
     ]))

(defmethod ->rep "key" [rule-info rule v ph path]
  (let []
    [:span.keyboard-key {:onClick (set-editing path)}
     ({13 "enter"} v)
     ]))
