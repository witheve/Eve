(ns ui.root
  (:refer-clojure :exclude [find remove])
  (:require [clojure.string :as string])
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

(defonce state-store (atom {}))

(defn args-to-key [args]
  (string/join "-" (for [arg args]
                     (if (keyword? arg)
                       (name arg)
                       arg))))

(defmulti state identity)

(defmethod state :cells [& args]
  (or (@state-store (args-to-key args))
      (array)))

(defmethod state :selections [& args]
  (or (@state-store (args-to-key args))
      (array)))

(defmethod state :default [& args]
  (@state-store (args-to-key args)))

(defmulti set-state! identity)
(defmethod set-state! :default [& args]
  (swap! state-store assoc (args-to-key (butlast args)) (last args)))

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

(defonce example-state (atom {"main-cells" (array)}))

(defn draw-grid [node elem]
  (let [ctx (.getContext node "2d")
        ratio (.-devicePixelRatio js/window)
        info (.-info elem)
        width (:grid-width info)
        height (:grid-height info)
        size-x (:cell-size-x info)
        size-y (:cell-size-y info)
        adjusted-size-y (* ratio size-y)
        adjusted-size-x (* ratio size-x)]
    (set! (.-width node) (* ratio width))
    (set! (.-height node) (* ratio height))
    (set! (.-lineWidth ctx) 1)
    (set! (.-strokeStyle ctx) "#333")
    (dotimes [vertical (/ height size-y)]
      (.beginPath ctx)
      (.moveTo ctx 0 (* adjusted-size-y vertical))
      (.lineTo ctx (* ratio width) (* adjusted-size-y vertical))
      (.stroke ctx)
      (.closePath ctx))
    (dotimes [horizontal (/ width size-x)]
      (.beginPath ctx)
      (.moveTo ctx (* adjusted-size-x horizontal) 0)
      (.lineTo ctx (* adjusted-size-x horizontal) (* ratio height))
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

(defn add-cell! [grid-id cell]
  (let [with-id (assoc cell :id (js/uuid))
        updated (.concat (state :cells grid-id) (array with-id))]
    (set-state! :cells grid-id updated)
    updated))

(defn set-selection [event elem]
  (.preventDefault event)
  (let [{:keys [x y]} (target-relative-coords event)
        {:keys [cell-size-x cell-size-y id cells]} (.-info elem)
        range? (.-shiftKey event)
        extend? (or (.-ctrlKey event) (.-metaKey event))
        selected-x (.floor js/Math (/ x cell-size-x))
        selected-y (.floor js/Math (/ y cell-size-y))
        pos {:x selected-x :y selected-y :width 1 :height 1}
        maybe-selected-cell (get-intersecting-cell pos cells)
        addition (or maybe-selected-cell pos)
        updated (cond
                  range? (let [start (first (state :selections id))]
                           (array {:x (:x start) :y (:y start)
                                   ;; height and width are calculated by determining the distance
                                   ;; between the start and end points, but we also need to factor
                                   ;; in the size of the end cell.
                                   :width (+ (- (:x addition) (:x start)) (:width addition))
                                   :height (+ (- (:y addition) (:y start)) (:height addition))
                                   }))
                  extend? (.concat (state :selections id) (array addition))
                  :else (array addition))]
    (dispatch
      (set-state! :selections id updated)
      (set-state! :extending-selection id true))))

(declare stop-selecting)

(defn extend-selection [event elem]
  (let [{:keys [id cell-size-y cell-size-x]} (.-info elem)
        point-selecting? (or (.-metaKey event) (.-ctrlKey event))]
    (when (and (state :extending-selection id)
               (not point-selecting?))
      (let [{:keys [x y]} (target-relative-coords event)
            selected-x (.floor js/Math (/ x cell-size-x))
            selected-y (.floor js/Math (/ y cell-size-y))
            start (first (state :selections id))
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
          (set-state! :selections id maybe)
          (when-not (global-mouse-down)
            (set-state! :extending-selection id false)
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
        selections (state :selections id)]
    (if (and (state :extending-selection id)
             (= 1 (count selections)))
      (let [current (first (state :selections id))
            normalized (normalize-cell-size current)
            intersecting (get-all-interesecting-cells normalized cells)
            final (or intersecting (array normalized))]
        (dispatch
          (set-state! :selections id final)
          (set-state! :extending-selection id false))))
      (dispatch
        (set-state! :extending-selection id false))))

(defn remove-overlap [cells updated-cells axis-and-direction-map]
  (let [changed (.slice updated-cells)
        final (.slice cells)
        width-direction (or (:width axis-and-direction-map) 0)
        height-direction (or (:height axis-and-direction-map) 0)]
    (while (not= 0 (.-length changed))
      (let [current-changed (.shift changed)]
        (loop [ix 0]
          (if (< ix (count final))
            (let [cell-to-check (aget final ix)]
              (if (or (= cell-to-check current-changed)
                      (not (cell-intersects? current-changed cell-to-check)))
                (recur (inc ix))
                (do
                  ;; determining the overlap is a matter of subtracting the left coordinate
                  ;; of one from the right coordinate of the other (and the equivalent for
                  ;; up and down), however because the change can be negative which is the
                  ;; left and which is the right might change.
                  (let [left (if (> width-direction 0)
                               (:x cell-to-check)
                               (:x current-changed))
                        right (if (> width-direction 0)
                                (+ (:x current-changed) (:width current-changed))
                                (+ (:x cell-to-check) (:width cell-to-check)))
                        width-overlap (* width-direction (- right left))
                        top (if (> height-direction 0)
                              (:y cell-to-check)
                              (:y current-changed))
                        bottom (if (> height-direction 0)
                                (+ (:y current-changed) (:height current-changed))
                                (+ (:y cell-to-check) (:height cell-to-check)))
                        height-overlap (* height-direction (- bottom top))
                        ;; modify it to remove the overlap by moving it over based on the
                        ;; overlap size
                        modified (-> cell-to-check
                                     (update-in [:x] + width-overlap)
                                     (update-in [:y] + height-overlap))]
                    ;; store the modified version and it to the list of things we
                    ;; need to check for overlap
                    (.push changed modified)
                    (.push final modified)
                    ;; remove the original item from final
                    (.splice final ix 1)
                    ;; look at the same ix since we just removed this cell
                    (recur ix)))))))))
    final))

(defn non-zero-inc [number]
  (if (= number -1)
    1
    (inc number)))

(defn non-zero-dec [number]
  (if (= number 1)
    -1
    (dec number)))

(defn grid-keys [event elem]
  (let [{:keys [id cells]} (.-info elem)
        selections (state :selections id)
        current-selection (last selections)
        {x-offset :x y-offset :y} (or (state :offset id) {:x 0 :y 0})
        key-code (.-keyCode event)
        shift? (.-shiftKey event)
        ;; if shift isn't pressed then this is moving the selection
        updated-pos (if-not shift?
                      (condp = key-code
                        37 (-> (update-in current-selection [:x] dec)
                               (update-in [:y] + y-offset))
                        38 (-> (update-in current-selection [:y] dec)
                               (update-in [:x] + x-offset))
                        39 (-> (update-in current-selection [:x] + (:width current-selection))
                               (update-in [:y] + y-offset))
                        40 (-> (update-in current-selection [:y] + (:height current-selection))
                               (update-in [:x] + x-offset))
                        nil))
        ;; if shift is pressed then it's extending the selection rect
        extended (if shift?
                   (condp = key-code
                     ;; we use non-zero-inc/dec here because the size of the selection
                     ;; should always include the intially selected cell. So instead
                     ;; of a width of zero it will always be 1 or -1
                     37 (update-in current-selection [:width] non-zero-dec)
                     38 (update-in current-selection [:height] non-zero-dec)
                     39 (update-in current-selection [:width] non-zero-inc)
                     40 (update-in current-selection [:height] non-zero-inc)
                     nil))
        handled (or updated-pos extended)]
    ;; Handle enter
    (when (= key-code 13)
      (if-not (:id current-selection)
        (dispatch
          (let [cells (add-cell! id current-selection)]
            (set-state! :selections id (array (last cells)))))
        (println "enter the cell!"))
      (.preventDefault event))
    ;; handle backspace
    (when (= key-code 8)
      (let [selected-ids (into #{} (for [selection (state :selections id)]
                                     (:id selection)))]
        (dispatch
          (set-state! :cells id (.filter (state :cells id) (fn [cell]
                                                   (not (selected-ids (:id cell))))))
          (set-state! :selections id (to-array (for [selection selections]
                                            (dissoc selection :id)))))
        (.preventDefault event)))
    (when extended
      (dispatch
        ;; there's no offset if we're extending
        (set-state! :offset id {:x 0 :y 0})
        (set-state! :extending-selection id true)
        (set-state! :selections id (array extended))))
    (when updated-pos
      ;; when we move the selection it becomes a unit-size selection
      ;; we then have to check if that unit is currently occupied by
      ;; a cell. If it is, we select the cell and store the offset to
      ;; make sure that if we're just passing through we end up in the
      ;; same row or column as we started.
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
          (when offset (set-state! :offset id offset))
          (set-state! :extending-selection id false)
          (set-state! :selections id (array final)))))
    (when handled
      (.preventDefault event))))

(defn grid-keys-up [event elem]
  ;; check for shift key if we were expanding
  (let [{:keys [id]} (.-info elem)]
    (when (and (= 16 (.-keyCode event))
               (state :extending-selection id))
      (dispatch
        (stop-selecting event elem)
        (set-state! :extending-selection id false)))))

(defn start-resize [event elem]
  (.stopPropagation event))

(defn grid [info]
  (let [canvas (elem :t "canvas"
                     :info info
                     :dragstart prevent-default
                     :postRender draw-grid
                     :style (style :width (:grid-width info)
                                   :height (:grid-height info)))
        children (array canvas)
        {:keys [cells cell-size-x cell-size-y selections]} info]
    (dotimes [cell-ix (count cells)]
      (let [{:keys [x y width height color]} (aget cells cell-ix)]
        (.push children (box :style (style :width (- (* cell-size-x (or width 1)) 2)
                                           :height (- (* cell-size-y (or height 1)) 2)
                                           :position "absolute"
                                           :top (+ 0 (* y cell-size-y))
                                           :left (+ 0 (* x cell-size-x))
                                           :border "1px solid #66f"
                                           :background (or color "#000"))
                             :children (array (text :style (style :color "#777"
                                                                  :font-size "10pt"
                                                                  :margin "6px 0 0 8px")
                                                    :text "property")
                                              (text :style (style :font-size "12pt"
                                                                  :margin "5px 0 0 8px")
                                                    :text "value"))))))
    (dotimes [selection-ix (count selections)]
      (let [selection (aget selections selection-ix)
            color "#f7c"
            ;; we have to normalize selections since while they're being expanded
            ;; they can have negative widths and heights
            {:keys [x y width height]} (normalize-cell-size selection)]
        (.push children (box :style (style :width (- (* cell-size-x width) 2)
                                           :height (- (* cell-size-y height) 2)
                                           :position "absolute"
                                           :top (* y cell-size-y)
                                           :left (* x cell-size-x)
                                           :border (str "1px solid " (or color "#aaffaa")))
                             ;; add a resize handle to the selection
                             :children (array (elem :mousedown start-resize
                                                    ;; mouseup and mousemove can't be handled here since it's
                                                    ;; fairly unlikely that your mouse will be exactly over the
                                                    ;; resize handle as you're resizing. These are handled globally
                                                    ;; on the window
                                                    :style (style :width 10
                                                                  :height 10
                                                                  :position "absolute"
                                                                  :bottom -5
                                                                  :right -5
                                                                  :background "#f7c")))))))
    (elem :children children
          :info info
          :tabindex -1
          :mousedown set-selection
          :mousemove extend-selection
          :mouseup stop-selecting
          :keydown grid-keys
          :keyup grid-keys-up
          :style (style :position "relative"))))


(defn root []
  (box :style (style :width "100vw"
                     :height "100vh"
                     :align-items "center"
                     :justify-content "center"
                     :color "#ccc"
                     :font-family "Lato")
       :children (array (grid {:grid-width (.-innerWidth js/window)
                               :grid-height (.-innerHeight js/window)
                               :selections (state :selections "main")
                               :cells (state :cells "main")
                               :cell-size-y 50
                               :cell-size-x 120
                               :id "main"}))))

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
