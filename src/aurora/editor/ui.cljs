(ns aurora.editor.ui
  (:require [aurora.compiler.compiler :as compiler]
            [aurora.util.core :as util :refer [cycling-move now]]
            [aurora.compiler.ast :as ast]
            [aurora.compiler.jsth :as jsth]
            [aurora.runtime.table :as table]
            [aurora.editor.dom :as dom]
            [aurora.editor.core :as core :refer [from-cache assoc-cache! remove-input! input?
                                                 add-page! add-notebook! remove-page! remove-notebook!
                                                 add-input! add-step! remove-step!]]
            [aurora.editor.running :as run]
            [aurora.compiler.graph :as graph]
            [aurora.editor.lines :as lines]
            [aurora.editor.nodes :as nodes]
            [clojure.string :as string]
            [clojure.walk :as walk]
            [clojure.set :as set]
            [cljs.reader :as reader]
            [aurora.editor.stack :refer [push stack->cursor set-stack! current-stack?]]
            [aurora.editor.cursors :refer [mutable? cursor cursors overlay-cursor value-cursor
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
;; Declares
;;*********************************************************

(declare aurora-state)
(declare aurora-state)

(defmulti step-list-item #(-> % deref :type))
(defmulti step-description #(-> % deref :type))
(defmulti item-ui #(-> % deref :type))

(defmethod item-ui :default [node stack]
  (if-let [rep (->rep @node)]
    (rep node stack)
    (dom [:span (pr-str x)])))

(defmethod step-list-item :default [step stack]
  (if-let [rep (->rep @step)]
    (rep step stack)
    (dom
     [:p "this is a step list item of " (pr-str @step)])))

(defmethod step-description :default [step]
  (dom
   [:p "this is a step description of " (pr-str @step)]))


;;*********************************************************
;; Step list
;;*********************************************************

(defn step-click [stack]
  (fn [e]
    ;(set-stack! stack)
    ;(swap! aurora-state assoc :editor-zoom :stack)
    ;(.preventDefault e)
    ;(.stopPropagation e)
    ))

(defn step-class [stack]
  (str "step " (when (current-stack? stack)
                 "selected")))

;;*********************************************************
;; Graph view
;;*********************************************************

(defdom iteration-control [stack]
  (let [iter-count (run/path->iter-count stack)
             cur-iteration (from-cache [:path-iterations stack])]
         (when (> iter-count 1)
           [:div {:className "iteration"}
            [:button {:className "dec-iteration"
                      :onClick (fn []
                                 (->>
                                  (cycling-move cur-iteration iter-count dec)
                                  (assoc-cache! [:path-iterations stack])))}]
            [:span {:className "current-iteration"} (inc cur-iteration)]
            [:span {:className "total-iterations"} iter-count]
            [:button {:className "inc-iteration"
                      :onClick (fn []
                                 (->>
                                  (cycling-move cur-iteration iter-count inc)
                                  (assoc-cache! [:path-iterations stack])))}]]
           )))

(defdom graph-item-error [stack]
  (when-let [error? (from-cache [:errors stack])]
    [:div {:className "step-error"}
     (if (= "MatchFailure!" error?)
       "No branch matches the given input"
       (pr-str error?))]))

(defdom graph-ui [stack]
  (when stack
    (let [page (stack->cursor stack :page)
          graph (graph/page-graph (:index @aurora-state) @page)
          [layers _] (graph/graph->layers graph)]
      [:div {:className "graph-ui"}
       (iteration-control stack)
       (each [[i items] layers]
             [:div {:className (str "layer layer" i)}
              (each [item items]
                    (when-let [cur (or (cursor item) (value-cursor {:type :ref/id
                                                                    :id item}))]
                      (when-not (= (:type @cur) :page)
                        [:div {:className (str "layer-step step_" item)}
                         (step-list-item cur (push stack cur))
                         (graph-item-error (push stack cur))
                         ])))])
       [:div {:className "layer"}
            [:div {:className "layer-step"}
             (new-step-helper page stack)]]
       ]
      )))

;;*********************************************************
;; Function calls
;;*********************************************************

(defn call->name [ref & [template?]]
  (let [key (if template?
              :desc-template
              :desc)
        op (when (= (:type ref) :ref/id)
             (cursor (:id ref)))]
    (if op
      (key @op (:id ref))
      (-> (js/eval (:js ref)) meta key))))

(defdom clickable-ref [step stack]
  (let [ref (:ref @step)
        name (call->name ref :template)
        name-parts (string/split name #"\|")
        dblclick (fn []
                   (set-stack! (push stack (cursor (:id ref)))))]
    (dom
      [:div {:className "desc"
           :onDoubleClick dblclick}
       (each [part name-parts]
             (if (re-seq #"^[\d]$" part)
               (item-ui (conj step [:args (dec (js/parseInt part))]) stack)
               part)

             )])))

(defmethod step-list-item :call [step stack]
  (dom
   [:div {:className (step-class stack)
         :onClick (step-click stack)
         :onContextMenu  #(show-menu! % [{:label "remove step"
                                          :action (fn []
                                                    (remove-step! (stack->cursor stack :page) step))}])}
    (clickable-ref step stack)
    [:div {:className (str "result " (str "result_" (:id @step)))}
    (item-ui (value-cursor (run/path->result stack)))]]))

(defmethod item-ui :call [step]
  (dom [:p {:className "desc"}
       (call->name (:ref @step))
       (each [input (:args @step)]
             (item-ui (conj step [:args index])))]))

;;*********************************************************
;; Matches
;;*********************************************************

(defmethod step-list-item :match [step stack]
  (let [matched-branch (run/path->match-branch stack)]
    (dom
     [:div {:className (step-class stack)
            :onClick (step-click stack)
            :onContextMenu  #(show-menu! % [{:label "remove step"
                                             :action (fn []
                                                       (remove-step! (stack->cursor stack :page) step))}])}
      [:div {:className "desc"} "Match" (item-ui (conj step :arg) stack {:name-only? true}) "against"]
      [:ul {:className "match-list"}
       (each [branch (:branches @step)]
             [:li {:className (str "match-branch" (when (= matched-branch index)
                                                    " active"))}
              [:span (item-ui (conj step [:branches index :pattern]) stack)]
              [:span {:className "match-action"} (item-ui (conj step [:branches index :action]) stack)]]
             )]
      [:button {:className "add-match-branch"
                :onClick (fn []
                           (swap! step update-in [:branches] conj (nodes/match-branch)))}
       ""]
      [:div {:className (str "result result_" (:id @step))}]
      ])))

(defmethod item-ui :match/bind [x stack]
  (dom [:span {:className "ref"} (:id @x)]))

;;*********************************************************
;; Data
;;*********************************************************

(defn ->rep [value]
  (let [name (datatype-name value)]
      (get-in @aurora-state [:cache :representations name])))

(defn find-index [needle haystack]
  (first (keep-indexed #(when (= %2 needle) %1) haystack)))

(defn ref-name [stack cur-step id]
  (when cur-step
    (when-let [page (stack->cursor stack :page)]
      (let [idx (find-index id (:steps @page))
            cur-idx (find-index (:id @cur-step) (:steps @page))]
        (if (= (dec cur-idx) idx)
          "that"
          (when idx
            (str "step " (inc idx))))))))

(defmethod item-ui :constant [node stack]
  (if-let [rep (->rep (or (:data @node) @node))]
    (rep (conj node :data) stack)
    (str (pr-str x))))

(defmethod step-list-item :constant [node stack]
  (let [value (:data @node)
        name (datatype-name value)]
    (dom
     [:div {:className "constant"
           :onClick (step-click stack)
           :onContextMenu #(show-menu! % [{:label "remove step"
                                           :action (fn []
                                                     (remove-step! (stack->cursor stack :page) node))}])}
      (if (not= "ref" name)
        (dom
         ;[:p {:className "desc"} (str "Create a " name)]
         [:div {:className (str "result " (str "result_" (:id @node)))}
          (when-let [rep (->rep value)]
            (rep (conj node :data) stack))])
        [:div {:className (str "result result_" (-> @node :data :id))}
         (item-ui (conj node :data) stack)])
      ])))

;;*********************************************************
;; refs
;;*********************************************************

(defn refs-in-scope [page step]
  (if step
    (concat (:args @page) (take-while #(not= % (cursor->id step)) (:steps @page)))
    (concat (:args @page) (:steps @page))))

(defn ref-menu [step stack & [cb]]
  (fn [e]
    (when (mutable? step)
      (show-menu! e (concat [{:label "map!"
                              :action (fn []
                                        (swap! step (constantly {"name" "chris"}))
                                        (when cb
                                           (cb)))}
                             {:label "list!"
                              :action (fn []
                                        (swap! step (constantly [1 2 3]))
                                        (when cb
                                           (cb)))}
                             ]
                            (mapv-indexed (fn [ref index]
                                            {:label (str (inc index))
                                             :action (fn []
                                                       (swap! step (constantly (nodes/ref-id ref)))
                                                       (when cb
                                                         (cb)))})
                                          (->> (refs-in-scope (stack->cursor stack :page) nil)
                                               ;(take-while #(not= (:id @step) %))
                                               (vec))))))))
(defmethod item-ui :ref/js [step stack opts]
  (item-ui (conj step :js) stack))

(defn open-sub-step [stack id]
  (set-stack! (push stack (cursor id)))
  )

(defmethod step-list-item :ref/id [step stack]
  (dom
   [:div {:className (str "constant result result_" (-> @step :id))}
    (item-ui step stack)]))

(defmethod item-ui :ref/id [step stack opts]
  (dom
   (let [page (cursor (:id @step))
         page? (when page
                 (= (:type @page) :page))
         res (when (and (not page?)
                        (not (:name-only? opts)))
               (run/path->result (-> (drop 1 stack)
                                 (conj [:step (:id @step)]))))
         id (str "ref_" (:id @step))]
     (cond
      res [:span {:className (str "ref " id)
                  :id id
                  :onContextMenu (ref-menu step stack)}
           (item-ui (value-cursor res))]
      page? [:span {:className (str "ref " id)
                    :id id
                    :onClick (fn []
                               (open-sub-step stack (:id @step)))
               :onContextMenu (ref-menu step stack)}
             [:span {:className "value"}
              (or (:desc @page) (:id @page))]]
     :else [:span {:className (str "ref " id)
                   :onContextMenu (ref-menu step stack)}
            [:div {:className "value"}
             (or (ref-name stack (stack->cursor stack :step) (:id @step))
                 (:id @step)
                 (:js @step))]])) ))


;;*********************************************************
;; editor
;;*********************************************************

(defdom contextmenu []
  (let [menu (from-cache :menu)]
    (when menu
      [:div {:id "menu-shade"
             :onContextMenu (fn []
                              (assoc-cache! [:menu] nil))
             :onClick (fn []
                        (assoc-cache! [:menu] nil))}
       [:ul {:id "menu"
             :style #js {:top (:top menu)
                         :left (:left menu)}}
        (each [item (:items menu)]
              [:li {:onClick (fn []
                               (when-let [action (:action item)]
                                 (action))
                               (assoc-cache! [:menu] nil))} (:label item)]
              )]])))

(defn show-menu! [e items]
  (.nativeEvent.preventDefault e)
  (.preventDefault e)
  (.stopPropagation e)
  (assoc-cache! [:menu] {:top (.-clientY e)
                         :left (.-clientX e)
                         :items items}))

(defdom editing-view [stack]
  [:div
   (graph-ui stack)
   ])

(defn add-step|swap!
  ([cursor v] (add-step|swap! cursor v (nodes/constant v)))
  ([cursor v step]
   (if (= (:type @cursor) :page)
     (add-step! cursor step)
     (swap! cursor (constantly v)))))

(defdom constant-inserter [cursor]
  [:div
   [:button {:onClick (fn []
                        (add-step|swap! cursor [1 2 3]))}
    "list"]
   [:button {:onClick (fn []
                        (add-step|swap! cursor {"name" "chris"
                                                "height" "short"}))}
    "map"]
   [:button {:onClick (fn []
                        (add-step|swap! cursor nil (nodes/math)))}
    "math"]
   [:button {:onClick (fn []
                        (add-step|swap! cursor nil (nodes/match)))}
    "match"]])

(defdom ref-inserter [page cursor]
  [:ul
   (each [refs (:args @page)]
         [:li [:button {:onClick (fn []
                                   (add-step|swap! cursor (nodes/ref-id refs)))}
               (:id @page)]])
   (let [count (count (:steps @page))]
     (each [refs (reverse (:steps @page))]
           [:li [:button {:onClick (fn []
                                     (add-step|swap! cursor (nodes/ref-id refs)))}
                 (- count index)]]))
   ])

(defdom call-inserter [page stack]
  [:ul
   (each [[ref result] [[(nodes/ref-js "cljs.core.mapv") (fn [ref]
                                                     (let [func (add-page! (stack->cursor stack :notebook) "do" {:anonymous true
                                                                                                        :args ["current"]})
                                                         func (cursor (:id func))
                                                         new-step (add-step! page (nodes/call ref [(nodes/ref-id (:id @func)) [1 2 3]]))]
                                                     (add-step! func (nodes/constant (nodes/ref-id "current")))
                                                     (open-sub-step (push stack (cursor (:id new-step))) (:id @func))
                                                     )

                                                   )]]]
         [:li [:button {:onClick (fn []
                                   (result ref)
                                   )}
               (call->name ref)]])
   ])

(defdom new-step-helper [page stack]
  [:div {:className "step"}
   (if (zero? (count (:steps @page)))
     (dom
      [:p "Let's create some data to get started!"]
      (constant-inserter page)
      (ref-inserter page page))
     (dom
      [:p "here we go"]
      (constant-inserter page)
      (ref-inserter page page)
      (call-inserter page stack)))
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

(defdom aurora-ui []
  [:div
   (input-handler)
   (when (util/nw?)
     [:div {:className "debug"}
      [:button {:onClick (fn []
                           (.reload js/window.location 0))}  "R"]
      [:button {:onClick (fn []
                           (.. (js/require "nw.gui") (Window.get) (showDevTools)))}  "D"]])
   (contextmenu)
   (nav)
   [:div {:id "content"}
    (let [stack (:stack @aurora-state)]

      (cond
       (zero? (count stack)) (notebooks-list @aurora-state)
       (stack->cursor stack :page) (editing-view stack)
       (stack->cursor stack :notebook) (pages-list (stack->cursor stack :notebook))
       :else (notebooks-list @aurora-state)))
    ]])

;;*********************************************************
;; Representations
;;*********************************************************

(defdom math-expression-ui [x stack]
  (cond
   (vector? @x) [:span {:className "math-expression"}
                (each [item (interpose :op (rest @x))]
                      (let [real-index (inc (/ (inc index) 2))]
                        (if (= item :op)
                          (math-expression-ui (conj x 0) stack)
                          (math-expression-ui (conj x real-index) stack)))
                      )
                ]
   (= (:type @x) :ref/js) [:span {:className "mathop"} (item-ui x stack)]
   :else [:span {:className "mathval"} (item-ui x stack)]))

(defdom math-ui [x stack]
  [:div {:className "step"
         :onClick (step-click stack)
         :onContextMenu #(show-menu! % [{:label "remove step"
                                             :action (fn []
                                                       (remove-step! (stack->cursor stack :page) (stack->cursor stack :step)))}])}
   (math-expression-ui (conj x :expression) stack)
    " = "
   [:span {:className (str "math-result result result_" (.-id (stack->cursor stack :step)))}
    (item-ui (value-cursor (run/path->result stack)) stack)]
    ]
  )

(defdom input-handler []
  [:input {:id "input-handler"
           :type "text"
           :tabIndex -1
           :onChange (fn [e]
                       (core/change-input! (constantly (cell-parser (.-target.value e)))))}])

(defn cell [x parser stack]
  (let [path (cursor->path x)
        commit (fn [e]
                 (swap! x (constantly (parser (.-target.value e))))
                 (remove-input! path))]
    (dom
       [:span {:className (str "value" (if (input? path)
                                         " active"))
               :onContextMenu (ref-menu x stack)
               :onClick (fn [e]
                          (core/clear-input)
                          (dom/val (dom/$ "#input-handler") "")
                          (when (mutable? x)
                            (add-input! path true)
                            (.focus (dom/$ "#input-handler"))))}
        (str @x)])))

(defn vec-remove [x index]
  (vec (concat (subvec x 0 index) (subvec x (inc index) (count x)))))

(defdom list-ui [list stack]
  ;;TODO: if the items are maps, table them
  [:ul {:className "list"}
   (each [x @list]
         [:li {:className "list-item"}
          (item-ui (conj list index) stack)
          (when (mutable? list)
            [:span {:className "remove-list-item"
                    :onClick (fn []
                               (swap! list vec-remove index))}])]
         )
   [:li {:className "add-list-item"}
    (item-ui (conj list (count @list)) stack)]
   ]
  )

(defdom map-ui [x stack]
  [:div {:className "map-editor"}
   [:table {:className "map"}
    [:tbody
     (each [[k v] (seq @x)]
           [:tr {:className "map-item"}
            [:td {:className "map-key"} (item-ui (conj x [{::key k}]) stack)]
            [:td {:className "map-value"} (item-ui (conj x k) stack)
             (when (mutable? x)
               [:span {:className "remove-map-item"
                       :onClick (fn []
                                  (swap! x dissoc k))}])
             ]]
           )]]
   [:div {:className "add-map-key"}
    (item-ui (conj x [{::key "add key"}]))]]
  )

(defn cell-parser [v]
  (cond
   (= "" v) ""
   (re-seq #"[^\d\.]" v) v
   :else (reader/read-string v)))

(swap! core/representations-cache merge
       {"math" (fn [x stack]
                 (math-ui x stack))
        "rect" (fn [x stack]
                 )
        "ref" (fn [x stack]
                (item-ui x stack))
        "map" (fn [x stack]
                (map-ui x stack))
        "list" (fn [x stack]
                 (list-ui x stack))
        "number" (fn [x stack]
                   (cell x cell-parser stack))
        "string" (fn [x stack]
                   (cell x cell-parser stack))})

;;*********************************************************
;; auto-resizing
;;*********************************************************

(defn focus! []
  (when-let [cur (last (dom/$$ :.focused))]
    (.focus cur)))

;;*********************************************************
;; Re-rendering
;;*********************************************************

(def queued? false)
(def RAF js/requestAnimationFrame)

(defn update []
  (let [start (now)]
    (js/React.renderComponent
     (aurora-ui)
     (js/document.getElementById "wrapper"))
    (focus!)
    (.time js/console "lines")
    (lines/release-canvases)
    (lines/graph-lines)
    (.timeEnd js/console "lines")
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
