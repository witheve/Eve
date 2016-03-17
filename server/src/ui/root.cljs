(ns ui.root
  (:refer-clojure :exclude [find remove])
  (:require-macros [ui.macros :refer [elem afor log box text button input dispatch extract for-fact]]))

(enable-console-print!)

(declare render)

;;---------------------------------------------------------
;; Runtime wrapper
;;---------------------------------------------------------

(defonce eve (.indexer js/Runtime))

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
;; Global dom stuff
;;---------------------------------------------------------

(defonce global-dom-state (atom {}))

(defn global-mouse-down []
  (@global-dom-state :mouse-down))

(defn prevent-default [event]
  (.preventDefault event))

(defn global-dom-init []
  (.addEventListener js/window "mousedown"
                     (fn [event]
                       (swap! global-dom-state assoc :mouse-down true)))

  (.addEventListener js/window "mouseup"
                     (fn [event]
                       (log "GLOBAL MOUSE UP!")
                       (swap! global-dom-state assoc :mouse-down false))))

;;---------------------------------------------------------
;; Root
;;---------------------------------------------------------

(defonce example-state (atom {}))

(defn get-selections [grid-id]
  (@example-state (str grid-id "-selections")))

(defn get-cells [grid-id]
  (array {:x 4 :y 6 :width 6 :height 3}
         {:x 1 :y 1 :width 1 :height 1}
         {:x 4 :y 1 :width 5 :height 5}))

(defn get-offset [grid-id]
  (or (@example-state (str grid-id "-offset"))
      {:x 0 :y 0}))

(defn get-extending-selection [grid-id]
  (@example-state (str grid-id "-extending-selection")))

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

(defn cell-intersects? [pos pos2]
  (let [{:keys [x y width height]} pos
        {x2 :x y2 :y width2 :width height2 :height} pos2]
    (and (> (+ x width) x2)
         (> (+ x2 width2) x)
         (> (+ y height) y2)
         (> (+ y2 height2) y))))

(defn cell-contains? [pos pos2]
  (let [{:keys [x y width height]} pos
        {x2 :x y2 :y width2 :width height2 :height} pos2]
    (and (>= x2 x)
         (>= (+ x width) (+ x2 width2))
         (>= y2 y)
         (>= (+ y height) (+ y2 height2)))))

(defn get-intersecting-cell [pos cells]
  (let [len (count cells)]
    (loop [cell-ix 0]
      (if (> cell-ix len)
        nil
        (let [cell (aget cells cell-ix)]
          (if (cell-intersects? pos cell)
            cell
            (recur (inc cell-ix))))))))

(defn get-all-interesecting-cells [pos cells]
  (let [result (array)]
    (dotimes [cell-ix (count cells)]
      (let [cell (aget cells cell-ix)]
        (when (cell-intersects? pos cell)
          (.push result cell))))
    (if (not= 0 (count result))
      result)))

(defn update-selection! [grid-id selection]
  (swap! example-state assoc (str grid-id "-selections") selection))

(defn update-extending-selection! [grid-id value]
  (swap! example-state assoc (str grid-id "-extending-selection") value))

(defn update-offset! [grid-id offset]
  (swap! example-state assoc (str grid-id "-offset") offset))

(defn set-selection [event elem]
  (let [{:keys [x y]} (target-relative-coords event)
        {:keys [cell-size id cells]} (.-info elem)
        range? (.-shiftKey event)
        extend? (or (.-ctrlKey event) (.-metaKey event))
        selected-x (.floor js/Math (/ x cell-size))
        selected-y (.floor js/Math (/ y cell-size))
        pos {:x selected-x :y selected-y :width 1 :height 1}
        maybe-selected-cell (get-intersecting-cell pos cells)
        addition (or maybe-selected-cell pos)
        updated (cond
                  range? (let [start (first (get-selections id))]
                           (array {:x (:x start) :y (:y start)
                                   ;; height and width are calculated by determining the distance
                                   ;; between the start and end points, but we also need to factor
                                   ;; in the size of the end cell.
                                   :width (+ (- (:x addition) (:x start)) (:width addition))
                                   :height (+ (- (:y addition) (:y start)) (:height addition))
                                   }))
                  extend? (.concat (get-selections id) (array addition))
                  :else (array addition))]
    (dispatch
      (update-selection! id updated)
      (update-extending-selection! id true))))

(declare stop-selecting)

(defn extend-selection [event elem]
  (let [{:keys [id cell-size]} (.-info elem)]
    (when (get-extending-selection id)
      (let [{:keys [x y]} (target-relative-coords event)
            selected-x (.floor js/Math (/ x cell-size))
            selected-y (.floor js/Math (/ y cell-size))
            start (first (get-selections id))
            ;; height and width are calculated by determining the distance
            ;; between the start and end points, but we also need to factor
            ;; in the size of the end cell.
            x-diff (- selected-x (:x start))
            y-diff (- selected-y (:y start))
            width (+ x-diff (if (> x-diff 0)
                              1
                              0))
            height (+ y-diff (if (> y-diff 0)
                               1
                               0))
            maybe (array {:x (:x start)
                          :y (:y start)
                          :width (if (not= 0 width) width 1)
                          :height (if (not= 0 height) height 1)})]
        (dispatch
          (update-selection! id maybe)
          (when-not (global-mouse-down)
            (update-extending-selection! id false)
            (stop-selecting event elem)))))))

(defn normalize-cell-size [{:keys [x y width height] :as cell}]
  (if-not (or (< width 0)
              (< height 0))
    cell
    (let [[final-x final-width] (if (< width 0)
                                  [(+ x width) (inc (.abs js/Math width))]
                                  [x width])
          [final-y final-height] (if (< height 0)
                                   [(+ y height) (inc (.abs js/Math height))]
                                   [y height])]
      {:x final-x
       :y final-y
       :width final-width
       :height final-height})))

(defn stop-selecting [event elem]
  (let [{:keys [id cells]} (.-info elem)
        current (first (get-selections id))
        normalized (normalize-cell-size current)
        intersecting (get-all-interesecting-cells normalized cells)
        final (or intersecting (array normalized))]
    (println final)
    (dispatch
      (update-selection! id final)
      (update-extending-selection! id false))))

(defn grid-keys [event elem]
  (let [{:keys [id cells]} (.-info elem)
        current-selection (last (get-selections id))
        {x-offset :x y-offset :y} (get-offset id)
        updated-pos (condp = (.-keyCode event)
                      37 (-> (update-in current-selection [:x] dec)
                             (update-in [:y] + y-offset))
                      38 (-> (update-in current-selection [:y] dec)
                             (update-in [:x] + x-offset))
                      39 (-> (update-in current-selection [:x] + (:width current-selection))
                             (update-in [:y] + y-offset))
                      40 (-> (update-in current-selection [:y] + (:height current-selection))
                             (update-in [:x] + x-offset))
                      nil)
        handled (condp = (.-keyCode event)
                      13 (println "ENTER")
                      nil)
        handled (or updated-pos handled)]
    (when updated-pos
      (let [resized-pos {:x (:x updated-pos)
                         :y (:y updated-pos)
                         :width 1
                         :height 1}
            maybe-selected-cell (get-intersecting-cell resized-pos cells)
            offset (if maybe-selected-cell
                     {:x (- (:x resized-pos) (:x maybe-selected-cell))
                      :y (- (:y resized-pos) (:y maybe-selected-cell))}
                     {:x 0 :y 0})
            final (or maybe-selected-cell resized-pos)]
        (dispatch
          (when offset (update-offset! id offset))
          (update-selection! id (array final)))))
    (when handled
      (.preventDefault event))))

(defn grid [info]
  (let [canvas (elem :t "canvas"
                     :info info
                     :dragstart prevent-default
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
      (let [selection (aget selections selection-ix)
            color "blue"
            ;; we have to normalize selections since while they're being expanded
            ;; they can have negative widths and heights
            {:keys [x y width height]} (normalize-cell-size selection)]
        (.push children (box :style (style :width (- (* cell-size width) 2)
                                           :height (- (* cell-size height) 2)
                                           :position "absolute"
                                           :top (* y cell-size)
                                           :left (* x cell-size)
                                           :border (str "1px solid " (or color "blue")))))))
    (elem :children children
          :info info
          :tabindex -1
          :mousedown set-selection
          :mousemove extend-selection
          :mouseup stop-selecting
          :keydown grid-keys
          :style (style :position "relative"))))


(defn root []
  (box :style (style :background "rgba(0,0,50,0.08)")
       :children (array (grid {:grid-width 500
                               :grid-height 500
                               :selections (get-selections "main")
                               :cells (get-cells "main")
                               :cell-size 40
                               :id "main"})
                        ; (grid {:grid-width 500
                        ;        :grid-height 500
                        ;        :selections (get-selections "main")
                        ;        :cells (get-cells "main")
                        ;        :cell-size 10
                        ;        :id "main"})
                        ; (grid {:grid-width 500
                        ;        :grid-height 500
                        ;        :selections (get-selections "main")
                        ;        :cells (get-cells "main")
                        ;        :cell-size 100
                        ;        :id "main"})
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
    (.appendChild (.-body js/document) (.-content @renderer))
    (global-dom-init))
  (dispatch diff
            (add diff :woot {:foo 1 :bar 2}))
  (render))

(init)
