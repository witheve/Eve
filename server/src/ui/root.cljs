(ns ui.root
  (:refer-clojure :exclude [find remove])
  (:require-macros [ui.macros :refer [elem afor log box text button input dispatch extract for-fact]]))

(enable-console-print!)

(declare render)

;;---------------------------------------------------------
;; Runtime wrapper
;;---------------------------------------------------------

(defonce eve (js/Runtime.indexer))

(defn find-one [table & [info]]
  (.findOne eve (name table) (clj->js info)))

(defn find [table & [info]]
  (.find eve (name table) (clj->js info)))

(defn add [diff table fact]
  (.add diff (name table) (clj->js fact))
  diff)

(defn remove [diff table fact]
  (.remove diff (name table) (clj->js fact))
  diff)

;;---------------------------------------------------------
;; local state
;;---------------------------------------------------------

(defn state []
  )

(defn set-state! [key ])

;;---------------------------------------------------------
;; Styles
;;---------------------------------------------------------

(defn style [& things]
  (let [mixins (take-while #(not (keyword? %)) things)
        non-mixins (drop-while #(not (keyword? %)) things)
        pairs (partition 2 non-mixins)
        start (reduce str "" mixins)]
    (reduce (fn [prev [a b]]
              (str prev (name a) ":" b "; "))
            start
            pairs)))

(def shared-style (style :color "white"))

(def colors {:background-border "#ddd"})

(def background-border (style :border (str "1px solid " (:background-border colors))))

;;---------------------------------------------------------
;; Root
;;---------------------------------------------------------

(defonce example-state (atom {}))

(defn draw-grid [node elem]
  (let [ctx (.getContext node "2d")
        ratio (.-devicePixelRatio js/window)
        info (.-info elem)
        width (:grid-width info)
        height (:grid-height info)
        size (:cell-size info)
        adjusted-size (* ratio size)]
    (set! (.-width node) (* ratio width))
    (set! (.-height node) (* ratio height))
    (set! (.-lineWidth ctx) 1)
    (set! (.-strokeStyle ctx) "#aaa")
    (dotimes [vertical (/ height size)]
      (.beginPath ctx)
      (.moveTo ctx 0 (* adjusted-size vertical))
      (.lineTo ctx (* ratio width) (* adjusted-size vertical))
      (.stroke ctx)
      (.closePath ctx))
    (dotimes [horizontal (/ width size)]
      (.beginPath ctx)
      (.moveTo ctx (* adjusted-size horizontal) 0)
      (.lineTo ctx (* adjusted-size horizontal) (* ratio height))
      (.stroke ctx)
      (.closePath ctx))
  ))

(defn target-relative-coords [event]
  (let [bounding-box (.getBoundingClientRect (.-currentTarget event))
        x (.-clientX event)
        y (.-clientY event)]
    {:x (- x (.-left bounding-box))
     :y (- y (.-top bounding-box))}))

(defn intersects? [pos pos2]
  (let [{:keys [x y width height]} pos
        {x2 :x y2 :y width2 :width height2 :height} pos2]
    (and (> (+ x width) x2)
         (> (+ x2 width2) x)
         (> (+ y height) y2)
         (> (+ y2 height2) y))))

(defn position-intersects-cells? [pos cells]
  (let [len (count cells)]
    (loop [cell-ix 0]
      (if (> cell-ix len)
        nil
        (let [cell (aget cells cell-ix)]
          (if (intersects? pos cell)
            cell
            (recur (inc cell-ix))))))))

(defn set-selection [event elem]
  (let [{:keys [x y]} (target-relative-coords event)
        {:keys [cell-size id cells]} (.-info elem)
        selected-x (js/Math.floor (/ x cell-size))
        selected-y (js/Math.floor (/ y cell-size))
        pos {:x selected-x :y selected-y :width 1 :height 1}
        maybe-selected-cell (position-intersects-cells? pos cells)]
    (dispatch
      (swap! example-state assoc (str id "-selections") (array (or maybe-selected-cell pos))))))

(defn grid [info]
  (let [canvas (elem :t "canvas"
                     :info info
                     :postRender draw-grid
                     :style (style :width (:grid-width info)
                                   :height (:grid-height info)))
        children (array canvas)
        {:keys [cells cell-size selections]} info]
    (dotimes [cell-ix (count cells)]
      (let [{:keys [x y width height color]} (aget cells cell-ix)]
        (.push children (box :style (style :width (- (* cell-size (or width 1)) 2)
                                           :height (- (* cell-size (or height 1)) 2)
                                           :position "absolute"
                                           :top (+ 1 (* y cell-size))
                                           :left (+ 1 (* x cell-size))
                                           :background (or color "white"))))))
    (dotimes [selection-ix (count selections)]
      (let [{:keys [x y width height color]} (aget selections selection-ix)]
        (.push children (box :style (style :width (- (* cell-size (or width 1)) 2)
                                           :height (- (* cell-size (or height 1)) 2)
                                           :position "absolute"
                                           :top (+ 0 (* y cell-size))
                                           :left (+ 0 (* x cell-size))
                                           :border (str "1px solid " (or color "blue")))))))
    (elem :children children
          :info info
          :click set-selection
          :style (style :position "relative"))))

(defn root []
  (box :style (style :background "rgba(0,0,50,0.08)")
       :children (array (grid {:grid-width 500
                               :grid-height 500
                               :selections (@example-state "main-selections")
                               :cells (array {:x 4 :y 9 :width 6 :height 3}
                                             {:x 1 :y 1}
                                             {:x 4 :y 1 :width 5 :height 5})
                               :cell-size 40
                               :id "main"})
                        (grid {:grid-width 500
                               :grid-height 500
                               :selections (@example-state "main-selections")
                               :cells (array {:x 4 :y 9 :width 6 :height 3}
                                             {:x 1 :y 1}
                                             {:x 4 :y 1 :width 5 :height 5})
                               :cell-size 10
                               :id "main"})
                        (grid {:grid-width 500
                               :grid-height 500
                               :selections (@example-state "main-selections")
                               :cells (array {:x 4 :y 9 :width 6 :height 3}
                                             {:x 1 :y 1}
                                             {:x 4 :y 1 :width 5 :height 5})
                               :cell-size 100
                               :id "main"})
                        )))

;;---------------------------------------------------------
;; Rendering
;;---------------------------------------------------------

(defonce renderer (atom false))

(defn render []
  (when (not (.-queued @renderer))
    (set! (.-queued @renderer) true)
    (js/requestAnimationFrame
      (fn []
        (let [ui (root)]
          (.render @renderer #js [ui])
          (set! (.-queued @renderer) false))))))

;;---------------------------------------------------------
;; Init
;;---------------------------------------------------------

(defn init []
  (when (not @renderer)
    (reset! renderer (new js/Renderer))
    (.appendChild js/document.body (.-content @renderer)))
  (dispatch diff
            (add diff :woot {:foo 1 :bar 2}))
  (render))

(init)
