(ns aurora.transformers.chart
  (:require [cljs.core.match]
            [dommy.core :as dommy]
            [cljs.core.async.impl.protocols :as protos]
            [cljs.core.async :refer [put! chan sliding-buffer take! timeout]])
  (:require-macros [cljs.core.match.macros :refer [match]]
                   [dommy.macros :refer [node sel1 sel]]
                   [cljs.core.async.macros :refer [go]]
                   [aurora.macros :refer [filter-match]]))

(def colors ["#FFBF2D" "#F5861E" "#AC3C5A" "#892143" "#472B5D"])


(defn create-canvas []
  (let [canvas (node [:canvas {:width "600" :height "400"}])]
    [canvas (.getContext canvas "2d")]))

(defn inject [ui]
  (dommy/set-html! (sel1 :#running-wrapper) "")
  (dommy/append! (sel1 :#running-wrapper) (node ui)))

(defmulti !chart* #(get % "type"))

(defn ->labels [data]
  (or (data "x") (range 1 (inc (count (data "values"))))))

(defmethod !chart* "line" [data inject?]
  (let [[canvas ctx] (create-canvas)
        data (merge {"x" (->labels data)} data)
        elem (node [:div.chart canvas])]
    (when inject?
      (inject elem))
    (.. (js/Chart. ctx) (Line (clj->js {:labels (data "x") :datasets [{:data (data "values") :strokeColor (colors 1) :fillColor (colors 0)}]})
                              (clj->js data)))
    elem))

(defn ->value [k v]
  {:value v :color (colors k)})

(defn ->legend [labels]
  [:ul {:style "position:absolute; top:10; left:10;"}
   (for [[k v] (map-indexed vector labels)]
     [:li {:style (str "color: " (colors k))} v])
   ])

(defmethod !chart* "bar" [data inject?]
  (let [[canvas ctx] (create-canvas)
        data (merge {"x" (->labels data)} data)
        elem (node [:div.chart
                    canvas])]
    (when inject?
      (inject elem))
    (.. (js/Chart. ctx) (Bar (clj->js {:labels (data "x") :datasets [{:data (data "values") :strokeColor (colors 1) :fillColor (colors 0)}]})
                              (clj->js data)))
    elem))

(defmethod !chart* "donut" [data inject?]
  (let [[canvas ctx] (create-canvas)
        data (merge {"segmentShowStroke" false "animationEasing" "easeOutExpo" "animationSteps" 60} data)
        elem (node [:div.chart
                    canvas
                    (->legend (->labels data))])]
    (when inject?
      (inject elem))
    (.. (js/Chart. ctx) (Doughnut (clj->js (map-indexed ->value (data "values"))) (clj->js data)))
    elem))

(defmethod !chart* "pie" [data inject?]
  (let [[canvas ctx] (create-canvas)
        data (merge {"segmentShowStroke" false "animationEasing" "easeOutExpo" "animationSteps" 60} data)
        elem (node [:div.chart
                    canvas
                    (->legend (->labels data))])]
    (when inject?
      (inject elem))
    (.. (js/Chart. ctx) (Pie (clj->js (map-indexed ->value (data "values"))) (clj->js data)))
    elem))

(defmethod !chart* :default [_]
  nil)

(defn !chart-canvas [data]
  (!chart* data false))

(defn !chart [data]
  (!chart* data true))
