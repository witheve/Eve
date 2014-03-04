(ns aurora.editor.ui
  (:require [aurora.compiler.compiler :as compiler]
            [aurora.util.core :as util :refer [cycling-move now]]
            [aurora.compiler.jsth :as jsth]
            [aurora.runtime.table :as table]
            [aurora.editor.dom :as dom]
            [aurora.editor.core :as core :refer [from-cache assoc-cache! remove-input! input?
                                                 add-page! add-notebook! remove-page! remove-notebook!
                                                 add-input! add-step! remove-step!]]
            [aurora.editor.running :as run]
            [aurora.editor.lines :as lines]
            [aurora.editor.nodes :as nodes]
            [clojure.string :as string]
            [clojure.walk :as walk]
            [clojure.set :as set]
            [cljs.reader :as reader]
            [aurora.editor.stack :refer [push stack->cursor set-stack! current-stack?]]
            [aurora.editor.cursors :as cursors :refer [mutable? cursor cursors overlay-cursor value-cursor
                                           cursor->id cursor->path swap!]]
            [aurora.editor.core :refer [aurora-state default-state]])
  (:require-macros [aurora.macros :refer [defdom dom mapv-indexed]]))

;;*********************************************************
;; utils
;;*********************************************************

;(js/React.initializeTouchEvents true)

(defn datatype-name [x]
  (cond
   (nil? x) "string"
   (#{:ref/id :ref/js} (:type x)) "ref"
   (:type x) (name (:type x))
   (or (true? x) (false? x)) "boolean"
   (keyword? x) "keyword"
   (number? x) "number"
   (string? x) "string"
   (map? x) "map"
   (vector? x) "list"
   :else (str (type x))))

(extend-type function
  Fn
  IMeta
  (-meta [this] (.-meta this)))

(alter-meta! number? assoc :desc "Is |1| a number? " :name "cljs.core.number_QMARK_")
(alter-meta! mapv assoc
             :desc-template "With each of |2| |1|"
             :desc "With each of this do.."
             :name "cljs.core.mapv")

;;*********************************************************
;; graph
;;*********************************************************

(defdom steps-ui [stack]
  [:div {:className "steps"}
   "Hey"
   ])

;;*********************************************************
;; nav
;;*********************************************************

(defn all-groups [xs]
  (for [i (range (count xs))]
    (take (inc i) xs)))

(defdom nav []
  [:div {:id "nav"}
   [:ul {:className "breadcrumb"}
    (each [stack (all-groups (reverse (:stack @aurora-state)))]
          (let [[type id] (last stack)
                cur (cursor id)]
            (when (and cur (not= type :step))
              [:li {:onClick (fn []
                               (set-stack! (drop-while #(= (first %) :step)
                                                       (reverse (butlast stack)))))}
               (or (:desc @cur) (:id @cur))])))]
   ])

;;*********************************************************
;; Notebooks
;;*********************************************************

(defn click-add-notebook [e]
  (add-notebook! "untitled notebook"))

(defdom notebooks-list [aurora]
  [:ul {:className "notebooks"}
   (each [notebook (cursors (:notebooks aurora))]
         (let [click (fn []
                       (swap! aurora-state assoc :notebook (:id @notebook) :screen :pages
                              :stack (list [:notebook (:id @notebook)])))]
           (if (input? (:id @notebook))
             [:li {:className "notebook"}
              [:input {:type "text" :defaultValue (:desc @notebook)
                       :onKeyPress (fn [e]
                                     (when (= 13 (.-charCode e))
                                       (remove-input! (:id @notebook))
                                       (swap! notebook assoc :desc (.-target.value e))
                                       ))}]]
             [:li {:className "notebook"
                   :onContextMenu #(show-menu! % [{:label "Rename"
                                                   :action (fn []
                                                             (add-input! (:id @notebook) :desc)
                                                             )}
                                                  {:label "Remove"
                                                   :action (fn []
                                                             (remove-notebook! notebook))}])
                   :onClick click}
              (:desc @notebook)])))
   [:li {:className "add-notebook"
         :onClick click-add-notebook} "+"]])

;;*********************************************************
;; Pages
;;*********************************************************

(defn click-add-page [e notebook]
  (add-page! notebook "untitled page" {:args ["root"]}))

(defdom pages-list [notebook]
  [:ul {:className "notebooks"}
   (each [page (filter #(get (:tags @%) :page) (cursors (:pages @notebook)))]
         (let [click (fn []
                       (swap! aurora-state assoc
                              :page (:id @page)
                              :editor-zoom :graph
                              :stack (-> ()
                                         (push notebook)
                                         (push page)
                                         )))]
           (if (input? (:id @page))
             [:li {:className "notebook"}
              [:input {:type "text" :defaultValue (:desc @page)
                       :onKeyPress (fn [e]
                                     (when (= 13 (.-charCode e))
                                       (remove-input! (:id @page))
                                       (swap! page assoc :desc (.-target.value e))))}]]
             [:li {:className "notebook"
                   :onContextMenu (fn [e]
                                    (show-menu! e [{:label "Rename"
                                                                    :action (fn []
                                                                              (add-input! (:id @page) :desc)
                                                                              )}
                                                                   {:label "Remove"
                                                                    :action (fn []
                                                                              (remove-page! notebook page))}]))
                   :onClick click}
              (:desc @page)])))
   [:li {:className "add-notebook"
         :onClick #(click-add-page % notebook)} "+"]])

;;*********************************************************
;; Aurora ui
;;*********************************************************

(defdom aurora-ui [stack]
  [:div
   (when (util/nw?)
     [:div {:className "debug"}
      [:button {:onClick (fn []
                           (.reload js/window.location 0))}  "R"]
      [:button {:onClick (fn []
                           (.. (js/require "nw.gui") (Window.get) (showDevTools)))}  "D"]])
   (nav)
   [:div {:id "content"}
    (cond
     (zero? (count stack)) (notebooks-list @aurora-state)
     (stack->cursor stack :page) (steps-ui stack)
     (stack->cursor stack :notebook) (pages-list (stack->cursor stack :notebook))
     :else (notebooks-list @aurora-state))
    ]])


;;*********************************************************
;; Re-rendering
;;*********************************************************

(defn focus! []
  (when-let [cur (last (dom/$$ :.focused))]
    (.focus cur)))

(def queued? false)
(def RAF js/requestAnimationFrame)

(defn update []
  (let [start (now)
        stack (:stack @aurora-state)
        page (stack->cursor stack :page)]
    (js/React.renderComponent
     (aurora-ui stack)
     (js/document.getElementById "wrapper"))
    (focus!)
    (set! (.-innerHTML (js/document.getElementById "render-perf")) (- (now) start))
    (set! queued? false)))

(defn queue-render []
  (when-not queued?
    (set! queued? true)
    (RAF update)))

(add-watch aurora-state :foo (fn [_ _ _ cur]
                               (queue-render)))

;;*********************************************************
;; Go!
;;*********************************************************

(core/repopulate)
