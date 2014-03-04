(ns aurora.editor.lines
  (:require [aurora.editor.dom :as dom]
            [aurora.editor.stack :refer [stack->cursor]]
            [aurora.editor.cursors :refer [cursor]]
            [aurora.editor.core :refer [aurora-state from-cache]]
            [aurora.util.core :refer [cycling-move]]))

(def canvas (js/document.createElement "canvas"))

(def color-counter (atom -1))

(defn reset-colors []
  (reset! color-counter -1))

(defn release-color []
  (swap! color-counter dec))

(let [colors ["90F0AB" ;;green
              "90C9F0" ;;blue
              "DD90F0" ;;purple
              "F09098" ;;red
              "F0C290" ;;orange
              ]]
  (defn line-color []
    (get colors (swap! color-counter cycling-move (count colors) inc))
    ))

(defn draw-arrow [ctx dir [tip-x tip-y]]
  (let [len 6
        [x y x2 y2] (condp = dir
                      :down [(- tip-x len)
                             (- tip-y len)
                             (+ tip-x len)
                             (- tip-y len)]
                      :right [(- tip-x len)
                              (- tip-y len)
                              (- tip-x len)
                              (+ tip-y len)])]
    (.beginPath ctx)
    (.moveTo ctx tip-x tip-y)
    (.lineTo ctx x y)
    (.moveTo ctx tip-x tip-y)
    (.lineTo ctx x2 y2)
    (.stroke ctx)
    (.closePath ctx))
  )

(defn line [ctx top left from to & [color]]
  (let [padding 5
        above? (< (.-top from) (.-top to))
        [x y] (if above?
                [(+ left (.-center-x from)) (+ top padding (.-bottom from))]
                [(+ left (.-center-x from)) (+ top (- (.-top from) padding))])
        [x2 y2] (if above?
                  [(+ left (.-center-x to)) (+ top (- (.-top to) padding))]
                  [(+ left (- (.-left to) padding)) (+ top (.-center-y to))])
        diff-x (- x2 x)
        diff-y (- y2 y)
        color (or color (line-color))]
    (set! (.-strokeStyle ctx) color)
    (set! (.-lineWidth ctx) 1)
    (.beginPath ctx)
    (.moveTo ctx x y)
    (if above?
      (.bezierCurveTo ctx (- x2 diff-x) y2 (+ x diff-x) y x2 y2)
      (.bezierCurveTo ctx (- x2 diff-x) y2 (+ x diff-x) (+ y diff-y) x2 y2))
    (.stroke ctx)
    (.closePath ctx)
    (draw-arrow ctx
                (if above?
                  :down
                  :right)
                [x2 y2])
    ))

(defn with-center [rect]
  (aset rect "center_x" (+ (.-left rect)
                         (/ (.-width rect) 2)))
  (aset rect "center_y" (+ (.-top rect)
                         (/ (.-height rect) 2)))
  rect)

(defn graph-lines [stack graph]
  (reset-colors)
  (let [width (.-scrollWidth js/document.body)
        height (.-scrollHeight js/document.body)
        scroll-top (dom/scroll-top js/document.body)
        scroll-left (dom/scroll-left js/document.body)
        ctx (.getContext canvas "2d")
        pixel-ratio (or (.-devicePixelRatio js/window) 0)]
    (dom/attr canvas {:width (*  width pixel-ratio)
                      :height (* height pixel-ratio)})
    (dom/css canvas {:position "absolute"
                     :width width
                     :height height
                     :left 0
                     :top 0})
    (.save ctx)
    (.scale ctx pixel-ratio pixel-ratio)
    (.clearRect ctx 0 0 width height)
    (doseq [[from tos] (:out graph)
            :let [from-elem (first (js/document.getElementsByClassName (str "node" from)))]
            :when from-elem
            :let [from-rect (-> (.getBoundingClientRect from-elem)
                                (with-center))
                  from-color (line-color)]
            to tos
            :let [to-rect (-> (first (js/document.getElementsByClassName (str "node" to)))
                              (.getBoundingClientRect)
                              (with-center))]]
      (line ctx scroll-top scroll-left from-rect to-rect from-color)

      )
    (.restore ctx)
    ))
