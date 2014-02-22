(ns aurora.editor.lines
  (:require [aurora.editor.dom :as dom]
            [aurora.editor.stack :refer [stack->cursor]]
            [aurora.compiler.graph :as graph]
            [aurora.editor.core :refer [aurora-state from-cache]]
            [aurora.util.core :refer [cycling-move]]))

(def all-canvases (list (js/document.createElement "canvas")
                        (js/document.createElement "canvas")
                        (js/document.createElement "canvas")
                        (js/document.createElement "canvas")
                        (js/document.createElement "canvas")
                        (js/document.createElement "canvas")
                        (js/document.createElement "canvas")
                        (js/document.createElement "canvas")
                        (js/document.createElement "canvas")
                        (js/document.createElement "canvas")
                        (js/document.createElement "canvas")
                        (js/document.createElement "canvas")
                        (js/document.createElement "canvas")
                        (js/document.createElement "canvas")
                        (js/document.createElement "canvas")
                        (js/document.createElement "canvas")
                        (js/document.createElement "canvas")
                        (js/document.createElement "canvas")
                        (js/document.createElement "canvas")
                        (js/document.createElement "canvas")
                        (js/document.createElement "canvas")
                        (js/document.createElement "canvas")
                        (js/document.createElement "canvas")
                        (js/document.createElement "canvas")
                        (js/document.createElement "canvas")
                        (js/document.createElement "canvas")))
(def canvas-pool (atom all-canvases))

(defn lease-canvas []
  (if-let [canvas (first @canvas-pool)]
    (do
      (swap! canvas-pool pop)
      canvas)
    (throw (ex-info "No canvases remaining in pool" {}))))

(defn release-canvases []
  (doseq [canvas all-canvases]
    (dom/remove canvas))
  (reset! canvas-pool all-canvases))

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

(defn line [[x y] [x2 y2] & [color]]
  (let [canvas (lease-canvas)
        width (+ 11 (js/Math.abs (- x x2)))
        height (- (js/Math.abs (- y y2)) 20)
        end-x (if (> x x2)
                10
                (- x2 x))
        pixel-ratio (or js/window.devicePixelRatio 1)]
    (dom/attr canvas {:width (* width pixel-ratio)
                      :height (* height pixel-ratio)})
    (dom/css canvas {:position "absolute"
                     :width width
                     :height height
                     :left (+ js/document.body.scrollLeft (- (min x x2) 10))
                     :top (+ js/document.body.scrollTop 10 (min y y2))})
    (let [ctx (.getContext canvas "2d")
          color (or color (line-color))]
      (.scale ctx pixel-ratio pixel-ratio)
      (set! (.-strokeStyle ctx) color)
      (set! (.-lineWidth ctx) 1)
      (.clearRect ctx 0 0 width height)
      (.beginPath ctx)
      (.moveTo ctx (if (> x x2)
                     (+ 10 (- x x2))
                     10)
               0)
      (.bezierCurveTo ctx
                      (if (> x x2)
                        (+ 10 (- x x2))
                        10)
                      (/ height 1)
                      (if (> x x2)
                        3
                        (- x2 x))
                      (* height 0)
                      end-x
                      height)
      (.stroke ctx)
      (.closePath ctx)
      (.beginPath ctx)
      (.moveTo ctx (identity end-x) (identity height))
      (.lineTo ctx (- end-x 6) (- height 6))
      (.moveTo ctx (identity end-x) (identity height))
      (.lineTo ctx (+ end-x 6) (- height 6))
      (.stroke ctx)
      canvas)))

(defn get-bounding-rects [container id]
  (when-let [container (first (js/document.getElementsByClassName container))]
    (when-let [elems (.getElementsByClassName container id)]
      (for [elem elems]
        [elem (.getBoundingClientRect elem)]))))


(defn find-result-ids [container]
  (when-let [container (first (js/document.getElementsByClassName container))]
    (when-let [elems (.getElementsByClassName container "result")]
      (for [elem elems]
        (-> (re-seq #"result_(.*)$" (.-className elem)) first second)))))

(defn graph-lines []
  (reset-colors)
  (let [page (stack->cursor (:stack @aurora-state) :page)
        graph (when page (graph/page-graph (:index @aurora-state) @page))
        [layers id->layer] (when graph (graph/graph->layers graph))
        fragment (dom/fragment [])]
    (when graph
      (doseq [[layer items] layers
              id items
              :let [color (when (-> graph :out (get id))
                            (line-color))]
              out (-> graph :out (get id))
              :let [refs (get-bounding-rects (str "step_" out) (str "ref_" id))
                    _ (when-not (seq refs)
                        (release-color))]
              [elem ref] refs
              :let [step (->> (get-bounding-rects (str "layer" (id->layer out)) (str "step_" out))
                                (first)
                                (second))
                    result (->> (get-bounding-rects (str "layer" layer) (str "result_" id))
                                (first)
                                (second))]
              :when (and ref result)]
        (dom/css elem {:background (str "#" color)})
        (dom/append fragment (line [(-> (+ (.-left result) (.-right result))
                                        (/ 2)
                                        (js/Math.floor))
                                    (js/Math.floor (+ (.-bottom result) 0))]
                                   [(-> (+ (.-left ref) (.-right ref))
                                        (/ 2)
                                        (js/Math.floor))
                                    (+ (js/Math.floor (.-top step)) 0)]
                                   color))

        )
      (when-let [dragging (from-cache [:dragging])]
        (let [id (second (:path dragging))
              drag-layer (id->layer id)
              result (->> (get-bounding-rects (str "layer" drag-layer) (str "result_" id))
                          (first)
                          (second))]
          (dom/append fragment (line [(-> (+ (.-left result) (.-right result))
                                        (/ 2)
                                        (js/Math.floor))
                                    (js/Math.floor (+ (.-top result) (.-height result) 0))]
                                   [(:x dragging) (:y dragging)]
                                   "red"))
          )
        )
      (dom/prepend js/document.body fragment))
    ))
