(ns aurora.editor.ui
  (:require [aurora.compiler.compiler :as compiler]
            [aurora.util.core :as util]
            [aurora.compiler.ast :as ast]
            [aurora.compiler.jsth :as jsth]
            [aurora.runtime.table :as table]
            [aurora.editor.dom :as dom]
            [clojure.string :as string]
            [cljs.reader :as reader]
            [aurora.editor.cursors :refer [mutable? cursor cursors overlay-cursor value-cursor
                                           cursor->id cursor->path swap!]]
            [aurora.editor.core :refer [aurora-state default-state]])
  (:require-macros [aurora.macros :refer [defdom dom mapv-indexed]]))

;;*********************************************************
;; utils
;;*********************************************************

;(js/React.initializeTouchEvents true)

(defn now []
  (.getTime (js/Date.)))

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
;; Stack
;;
;; The stack is used to keep track of where we are in the
;; call tree
;;*********************************************************

(defn stack->cursor [stack type]
  (when stack
    (->> stack
         (filter #(= (first %) type))
         (first)
         (second)
         (cursor))))

(defn push [stack thing]
  (when stack
    (conj stack [(condp = (:type @thing)
                   :page :page
                   :notebook :notebook
                   :step)
                 (cursor->id thing)])))

(defn set-stack! [stack]
  (when stack
    (swap! aurora-state assoc :stack stack)))

(defn current-stack? [stack]
  (when stack
    (= (:stack @aurora-state) stack)))

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

(defdom sub-step [step stack]
  (when-let [id (from-cache [:open-paths stack])]
    [:div {:className "substep"}
     (let [page (cursor id)]
       (if page
         (steps-list page (push stack page))
         [:span {:className "native"} "Native method"]))]))

(def recursed false)

(defdom page-steps [page stack]
   [:ul {:className "steps"}
     (each [step (cursors (:steps @page))]
           (let [error? (from-cache [:errors (push stack step)])]
             [:li {:className (str "step-container" (when error?
                                                      " error"))}
              [:div {:className "step-row"}
               [:div {:className "step-id-container"} [:span {:className "step-id"} (inc index)]]
               (step-list-item step (push stack step))]
              (when error?
               [:div {:className "step-error"}
                (if (= "MatchFailure!" (from-cache [:errors (push stack step)]))
                  "No branch matches the given input"
                  (pr-str (from-cache [:errors (push stack step)])))])
              (sub-step step (push stack step))]))
    [:li {:className "step-container"}
            [:div {:className "step-row"}
             [:div {:className "step-id-container"} [:span {:className "step-id"} "N"]]
             (new-step-helper page stack)]]

    ])

(defn cycling-move [cur count dir]
  (if (< (dir cur) 0)
    (dec count)
    (if (>= (dir cur) count)
      0
      (dir cur))))

(defdom knowledge-container [page stack]
  (println "knowledge stack: " stack)
  [:div {:className "knowledge step-row"}
   [:div {:className "step-id-container"} [:span {:className "step-id"} "K"]]
   [:div {:className "step"}
    (each [arg (:args @page)]
          [:div {:className "arg"}
           (item-ui (value-cursor {:type :ref/id
                                   :id arg})
                    (push stack page))])
    (let [iter-count (path->iter-count stack)
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
        ))]
   ])

(defdom steps-list [page stack]
  [:div {:className "workspace"}
   [:div {:className "steps-container"}
    (knowledge-container page stack)
    (page-steps page stack)]])

(defn step-click [stack]
  (fn [e]
    ;(set-stack! stack)
    (.preventDefault e)
    (.stopPropagation e)))

(defn step-class [stack]
  (str "step " (when (current-stack? stack)
                 "selected")))

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
                   (swap! aurora-state update-in [:open-paths stack] #(if (not %)
                                                                       (:id ref))))]
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
    [:div {:className "result"}
    (item-ui (value-cursor (path->result stack)))]]))

(defmethod item-ui :call [step]
  (dom [:p {:className "desc"}
       (call->name (:ref @step))
       (each [input (:args @step)]
             (item-ui (conj step [:args index])))]))

;;*********************************************************
;; Matches
;;*********************************************************

(defn branch-result [branch stack]
  (if (-> branch :node :type (= :ref))
    (clickable-ref branch stack)
    (item-ui (:node branch))))

(defmethod step-list-item :match [step stack]
  (let [matched-branch (path->match-branch stack)]
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
                           (swap! step update-in [:branches] conj (match-branch)))}
       ""]
      ])))

(defmethod step-description :match [step stack]
  (dom
      [:p {:className "desc"}
       "Find a match for " (item-ui (conj step :arg))
       ]))

(defmethod item-ui :match/bind [x stack]
  (dom [:span {:className "ref"} (:id @x)]))

;;*********************************************************
;; Data
;;*********************************************************

(defn datatype-name [x]
  (cond
   (nil? x) "string"
   (#{:ref/id :ref/js} (:type x)) "ref"
   (= :math (:type x)) "math"
   (or (true? x) (false? x)) "boolean"
   (keyword? x) "keyword"
   (number? x) "number"
   (string? x) "string"
   (map? x) "map"
   (vector? x) "list"
   :else (str (type x))))

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
     [:div {:className (step-class stack)
           :onClick (step-click stack)
           :onContextMenu #(show-menu! % [{:label "remove step"
                                           :action (fn []
                                                     (remove-step! (stack->cursor stack :page) node))}])}
      (if (not= "ref" name)
        (dom
         [:p {:className "desc"} (str "Create a " name)]
         [:div {:className "result"}
          (when-let [rep (->rep value)]
            (rep (conj node :data) stack))])
        (item-ui (conj node :data) stack))
      ])))

(defmethod step-description :constant [step stack]
  (let [value (:data @step)
        name (datatype-name value)]
    (dom
     [:p {:className "desc"} "Add a " [:span {:className "value"} name]]
     [:div {:className "result"}
      (item-ui (conj step :data) stack)
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
                                                       (swap! step (constantly (ref-id ref)))
                                                       (when cb
                                                         (cb)))})
                                          (->> (refs-in-scope (stack->cursor stack :page) nil)
                                               ;(take-while #(not= (:id @step) %))
                                               (vec))))))))
(defmethod item-ui :ref/js [step stack opts]
  (item-ui (conj step :js) stack))

(defn open-sub-step [stack id]
  (let [opened (from-cache [:open-paths])
        stack-count (count stack)]
    (if (get opened stack)
      (assoc-cache! [:open-paths stack] nil)
      ;;TODO: this will close things from other notebooks/pages - that's probably wrong.
      (assoc-cache! [:open-paths] (reduce (fn [final [path v]]
                                            (if (< (count path) stack-count)
                                              (assoc final path v)
                                              final))
                                          {stack id}
                                          opened)))))

(defmethod item-ui :ref/id [step stack opts]
  (dom
   (let [page (cursor (:id @step))
         page? (when page
                 (= (:type @page) :page))
         res (when (and (not page?)
                        (not (:name-only? opts)))
               (path->result (-> (drop 1 stack)
                                 (conj [:step (:id @step)]))))]
     (cond
      res [:span {:className "ref"
                  :onContextMenu (ref-menu step stack)}
           (item-ui (value-cursor res))]
      page? [:span {:className "ref"
                    :onClick (fn []
                               (open-sub-step stack (:id @step)))
               :onContextMenu (ref-menu step stack)}
             [:span {:className "value"}
              (or (:desc @page) (:id @page))]]
     :else [:span {:className "ref"
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

   (steps-list (current :page) stack)
   ;(step-canvas (stack->cursor stack :step) stack)
   ])

(defn add-step|swap!
  ([cursor v] (add-step|swap! cursor v (constant v)))
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
                        (add-step|swap! cursor nil (math)))}
    "math"]
   [:button {:onClick (fn []
                        (add-step|swap! cursor nil (match)))}
    "match"]])

(defdom ref-inserter [page cursor]
  [:ul
   (each [refs (:args @page)]
         [:li [:button {:onClick (fn []
                                   (add-step|swap! cursor (ref-id refs)))}
               (:id @page)]])
   (let [count (count (:steps @page))]
     (each [refs (reverse (:steps @page))]
           [:li [:button {:onClick (fn []
                                     (add-step|swap! cursor (ref-id refs)))}
                 (- count index)]]))
   ])

(defdom call-inserter [page stack]
  [:ul
   (each [[ref result] [[(ref-js "cljs.core.mapv") (fn [ref]
                                                   (let [func (add-page! (current :notebook) "do" {:anonymous true
                                                                                                   :args ["current"]})
                                                         func (cursor (:id func))
                                                         new-step (add-step! page (call ref [(ref-id (:id @func)) [1 2 3]]))]
                                                     (add-step! func (constant (ref-id "current")))
                                                     (open-sub-step (push stack (cursor (:id new-step))) (:id @func))
                                                     )

                                                   )]]]
         [:li [:button {:onClick (fn []
                                   (result ref)
                                   )}
               (call->name ref)]])
   ])

(defdom inserter [page cursor]
  [:div
   (constant-inserter cursor)
   (ref-inserter (current :page) cursor)
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

(defdom nav []
  [:div {:id "nav"}
   [:ul {:className "breadcrumb"}
      [:li
       (when-let [notebook (current :notebook)]
         [:span {:onClick (fn []
                            (swap! aurora-state assoc :screen :notebooks :notebook nil :page nil :stack nil))}
          (:desc @notebook)])
       (when-let [page (current :page)]
         [:span {:onClick (fn []
                            (swap! aurora-state assoc :screen :pages :page nil :stack nil))}
          (:desc @page)])
       (when-let [path (:step @aurora-state)]
         (when (> (count path) 1)
           (each [{:keys [notebook page]} (rest path)]
                 (when-let [cur (get-in @aurora-state [:notebooks notebook :pages page])]
                   [:span (get cur :desc (:id cur))])))
         [:span (:step (last path))])
       ]]
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
                       (swap! aurora-state assoc :notebook (:id @notebook) :screen :pages))]
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
                              :screen :editor
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
   (when (util/nw?)
     [:div {:className "debug"}
      [:button {:onClick (fn []
                           (.reload js/window.location 0))}  "R"]
      [:button {:onClick (fn []
                           (.. (js/require "nw.gui") (Window.get) (showDevTools)))}  "D"]])
   (contextmenu)
   (nav)
   [:div {:id "content"}

    (condp = (:screen @aurora-state)
      :notebooks (notebooks-list @aurora-state)
      :pages (pages-list  (cursor (:notebook @aurora-state)))
      :editor (editing-view (:stack @aurora-state)))
    ]])

;;*********************************************************
;; Representations
;;*********************************************************

(defdom table-map-ui [table stack]
  [:div {:className "table-editor"}

  [:table {:className "table"
           :onContextMenu (ref-menu table stack)}
   [:thead
    [:tr
     (each [k (@table "headers")]
           [:th (item-ui (conj table ["headers" index]))])]
    [:tbody
     (each [row (@table "rows")]
           [:tr
            (let [path ["rows" index]]
              (each [v row]
                    [:td (item-ui (conj table (conj path index)))]))])]]]
   [:span {:className "add-col"
           :onClick (fn []
                      (swap! table #(-> (update-in % ["headers"] conj "foo")
                                        (update-in ["columns"] conj (ref-js "aurora.runtime.table.identity_column"))
                                        (update-in ["rows"] (fn [x]
                                                              (mapv (fn [c] (conj c 0)) x))))))} "+"]
   [:div {:className "add-row-wrapper"}
    [:span {:className "add-row"
            :onClick (fn []
                       (swap! table #(update-in % ["rows"] conj (mapv (constantly 0) (@table "headers")))))} "+"]]])

(defdom table-ui [table stack]
  [:div {:className "table-editor"}
   [:table {:className "table"
            :onContextMenu (ref-menu table stack)}
    [:thead
     [:tr
      (each [k (table/headers @table)]
            [:th [:span {:className "value"} k]])]
     [:tbody
      (each [row (table/-rows @table)]
            [:tr
             (let [path ["rows" index]]
               (each [v row]
                     [:td [:span {:className "value"} (row index)]]))])]]]
   [:span {:className "add-col"} "+"]
   [:div {:className "add-row-wrapper"}
    [:span {:className "add-row"} "+"]]])


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
         :onContextMenu #(show-menu! % [{:label "remove step"
                                             :action (fn []
                                                       (remove-step! (stack->cursor stack :page) (stack->cursor stack :step)))}])}
   (math-expression-ui (conj x :expression) stack)
    " = "
   [:span {:className "math-result"}
    (item-ui (value-cursor (path->result stack)) stack)]
    ]
  )

(defn cell [x parser stack]
  (let [path (cursor->path x)
        commit (fn [e]
                 (swap! x (constantly (parser (.-target.value e))))
                 (remove-input! path))]
    (dom
     (if (input? path)
       [:input {:type "text"
                :className "focused"
                :tabIndex -1
                :style #js {"width" (* 10 (count (str @x)))}
                :defaultValue @x
                :onKeyPress (fn [e]
                              (when (= 13 (.-charCode e))
                                (commit e)))
                :onBlur commit}]
       [:span {:className "value"
               :onContextMenu (ref-menu x stack)
               :onClick (fn [e]
                          (when (mutable? x)
                            (add-input! path true)))}
        (str @x)]))))

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
  (if (re-seq #"[^\d\.]" v)
    v
    (reader/read-string v)))

(defn build-rep-cache [state]
  (assoc-in state [:cache :representations]
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
                        (cell x cell-parser stack))
             "table" (fn [x stack]
                       (if (map? @x)
                         (table-map-ui x stack)
                         (table-ui x stack)))}))

;;*********************************************************
;; Aurora state
;;*********************************************************

(defn path->step [path]
  (let [[type id] (first path)
        step (if (= :step type)
               id)]
    (when step
      (cursor step))))

(defn current [key]
  (when-let [v (@aurora-state key)]
    (condp = key
      :notebook (cursor v)
      :page (cursor v)
      :step (path->step (:stack @aurora-state)))))

(defn from-cache [path]
  (if (coll? path)
    (get-in @aurora-state (concat [:cache] path))
    (get-in @aurora-state [:cache path])))

(defn input? [id]
  (get-in @aurora-state [:cache :inputs id]))



;;*********************************************************
;; Aurora state (nodes)
;;*********************************************************

(defn constant
  ([data] (constant data {}))
  ([data opts] (merge {:type :constant
                       :data data}
                      opts)))

(defn call
  ([ref args] (call ref args {}))
  ([ref args opts] (merge {:type :call
                           :ref ref
                           :args args}
                      opts)))

(defn math []
  {:type :math
   :expression [{:type :ref/js
                 :js "+"}
                3 4]})

(defn match-branch []
  {:type :match/branch
   :pattern "foo"
   :guards []
   :action {:type :constant
            :data "wheeee"}})

(defn match []
  {:type :match
   :arg "foo"
   :branches [(match-branch)]})

(defn table []
  {"headers" ["a" "b"]
   "columns" [{:type :ref/js
               :js "aurora.runtime.table.identity_column"}
              {:type :ref/js
               :js "aurora.runtime.table.identity_column"}]
   "rows" [[1 2] [3 4]]})

(defn ref-id [id]
  {:type :ref/id
   :id id})

(defn ref-js [js]
  {:type :ref/js
   :js js})

;;*********************************************************
;; Aurora state (mutation!)
;;*********************************************************

(defn assoc-cache! [path v]
  (swap! aurora-state assoc-in (concat [:cache] path) v))

(defn add-input! [id path]
  (swap! aurora-state assoc-in [:cache :inputs id] path))

(defn remove-input! [id]
  (swap! aurora-state update-in [:cache :inputs] dissoc id))

(defn add-index! [thing]
  (swap! aurora-state assoc-in [:index (:id thing)] thing))

(defn add-notebook! [desc]
  (let [notebook {:type :notebook
                  :id (compiler/new-id)
                  :desc desc
                  :pages []}]
    (when (ast/notebook! (:index @aurora-state) notebook)
      (add-index! notebook)
      (swap! aurora-state update-in [:notebooks] conj (:id notebook))
      (add-input! (:id notebook) :desc)
      notebook)))

(defn remove-notebook! [notebook]
  (swap! aurora-state update-in [:notebooks] #(vec (remove #{(:id notebook)} %))))

(defn add-page! [notebook desc & [opts]]
  (let [page (merge {:type :page
                     :id (compiler/new-id)
                     :tags (if-not (:anonymous opts)
                             #{:page}
                             #{})
                     :args []
                     :desc desc
                     :steps []}
                    opts)]
    (when (ast/page! (:index @aurora-state) page)
      (add-index! page)
      (swap! notebook update-in [:pages] conj (:id page))
      page)))

(defn remove-page! [notebook page]
  (swap! page assoc :pages (vec (remove #{(:id @page)} (:pages @notebook)))))

(defn add-step! [page info]
  (try
    (let [step (merge {:id (compiler/new-id)} info)]
      (when (ast/step! (:index @aurora-state) step)
        (add-index! step)
        (swap! page update-in [:steps] conj (:id step))
        step))
    (catch :default e
      (.error js/console (pr-str e)))))

(defn remove-step! [page step]
  (swap! page assoc :steps (vec (remove #{(:id @step)} (:steps @page)))))

;;*********************************************************
;; Aurora state (storage!)
;;*********************************************************

(defn freeze [state]
  (-> state
      (dissoc :cache)
      (pr-str)))

(defn store! [state]
  (aset js/localStorage "aurora-state" (freeze state)))

(defn thaw [state]
  (let [state (if (string? state)
                (reader/read-string state)
                state)]
    (-> state
        (build-rep-cache)
        (update-in [:index] merge ast/core))))

(defn repopulate []
  (let [stored (aget js/localStorage "aurora-state")]
    (if (and stored
             (not= "{}" stored)
             (not= "null" stored)
             (not= stored ""))
      (reset! aurora-state (thaw stored))
      (reset! aurora-state (thaw default-state)))))

(defn clear-storage! []
  (aset js/localStorage "aurora-state" nil))

(add-watch aurora-state :storage (fn [_ _ _ cur]
                                   (store! cur)))

;;*********************************************************
;; running (this shouldn't be part of the UI eventually)
;;*********************************************************

(def run-stack (atom nil))
(def cur-state (atom {"counter" 0}))
(def prev nil)

(defn find-error-frames [stack]
  (loop [frame stack
         error-frames []
         page-stack [[:page (aget stack "id")]]]
    (let [page-stack (conj page-stack [:step (first (aget frame "exception"))])
          error-frames (if (.-exception frame)
                         (conj error-frames {:stack page-stack
                                             :frame frame})
                         error-frames)]
      (if-let [next-frame (last (aget frame "calls"))]
        (recur next-frame error-frames (conj page-stack [:page (aget next-frame "id")]))
        error-frames))))

(defn error-frames->errors [frames notebook-id e]
  (into {}
        (for [{:keys [stack frame]} frames]
            [(reverse (concat [[:notebook notebook-id]] stack))
             e])))

(def compile-worker (js/Worker. "compiler.js"))
(.addEventListener compile-worker "message" (fn [e]
                                              (handle-compile (.-data e))))

(defn send-off-compile [index notebook-id]
  (.postMessage compile-worker (pr-str {:index index
                                        :notebook notebook-id})))

(defn handle-compile [data]
  (set! (.-innerHTML (js/document.getElementById "compile-perf")) (.-time data))
  (let [run (run-source (.-source data) (current :notebook) (current :page) @cur-state)]
    (reset! cur-state (second run))
    (reset! run-stack #js {:calls #js [(nth run 2)]})
    (queue-render)))

(defn run-source [source notebook page state]
  (let [start (now)
        notebook-js (when source (js/eval (str "(" source "());")))
        stack #js []
        func (when notebook-js (aget notebook-js (str "value_" (:id @page))))]
    (when notebook-js
      (aset notebook-js "next_state" state)
      (aset notebook-js "stack" stack)
      (try
        (let [v [(func state []) (.-next_state notebook-js) (aget stack 0)]]
          (assoc-cache! [:errors] nil)
          (set! (.-innerHTML (js/document.getElementById "run-perf")) (- (now) start))
          v)
        (catch :default e
          (let [v [e (.-next_state notebook-js) (aget stack 0)]
                frames (find-error-frames (aget stack 0))
                errors (error-frames->errors frames (:id @notebook) e)]
            (println "ERROR STACK: " errors)
            (assoc-cache! [:errors] errors)
            (set! (.-innerHTML (js/document.getElementById "run-perf")) (- (now) start))
            v))))))

(defn find-id [thing id]
  (.filter (aget thing "calls") #(= (aget % "id") id)))

(defn traverse-path [stack path iters]
  (loop [stack stack
         path path
         cur-path '()]
    ;(println "path: " path)
    ;(println "iter" (or (get iters cur-path) 0))
    (when stack
      (let [[type id :as segment] (first path)]
        (cond
         (not path) stack
         (not= type :page) (recur stack (next path) (conj cur-path segment))
         :else (let [cur-path (conj cur-path segment)
                     cur-iter (or (get iters cur-path) 0)]
                 (recur (aget (find-id stack id) cur-iter) (next path) cur-path)))))))

(defn path->frame [path]
  (println "asking for frame: " path)
  (traverse-path @run-stack (reverse path)
                 (from-cache [:path-iterations])))

(defn path->iter-count [path]
  (when-let [frame (traverse-path @run-stack (reverse (drop 2 path))
                                  (from-cache [:path-iterations]))]
    (when-let [calls (aget frame "calls")]
      (.-length (find-id frame (-> (stack->cursor path :page)
                                   (deref)
                                   (:id)))))))

(defn path->match-branch [path]
  (when-let [frame (path->frame path)]
    (-> frame
        (aget "matches")
        (aget (str "value_" (-> path
                                (first)
                                (second))))
        )))

(defn path->result [path]
  (when-let [frame (path->frame path)]
    (when (.-vars frame)
      (-> frame
          (aget "vars")
          (aget (str "value_" (-> path
                                  (first)
                                  (second))))
          ))))

(add-watch aurora-state :running (fn [_ _ _ cur]
                                   (if-not (identical? prev (:index cur))
                                     (do
                                       (set! prev (:index cur))
                                       ;;TODO: args
                                       (when (and (current :notebook) (current :page))
                                         (send-off-compile (:index cur) (-> (current :notebook)
                                                                            (deref)
                                                                            (:id)))))
                                     (comment
                                       (set! (.-innerHTML (js/document.getElementById "compile-perf")) "n/a")
                                       (set! (.-innerHTML (js/document.getElementById "run-perf")) "n/a")
                                       )
                                     )))


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
    (set! (.-innerHTML (js/document.getElementById "render-perf")) (- (now) start))
    (set! queued? false)))

(defn queue-render []
  (when-not queued?
    (set! queued? true)
    (RAF update)))

(add-watch aurora-state :foo (fn [_ _ _ cur]
                               (queue-render)))

;;*********************************************************
;; auto-resizing
;;*********************************************************

(dom/on js/document :keydown (fn [e]
                               (when (= "INPUT" (.-target.tagName e))
                                 (dom/css (.-target e) {:width (* 10 (count (.-target.value e)))})
                                 )))

(dom/on js/document :input (fn [e]
                               (when (= "INPUT" (.-target.tagName e))
                                 (dom/css (.-target e) {:width (* 10 (count (.-target.value e)))})
                                 )))

(dom/on js/document :change (fn [e]
                               (when (= "INPUT" (.-target.tagName e))
                                 (dom/css (.-target e) {:width (* 10 (count (.-target.value e)))})
                                 )))

(dom/on js/document :keyup (fn [e]
                               (when (= "INPUT" (.-target.tagName e))
                                 (dom/css (.-target e) {:width (* 10 (count (.-target.value e)))})
                                 )))

(defn focus! []
  (when-let [cur (last (dom/$$ :.focused))]
    (.focus cur)))

;;*********************************************************
;; Go!
;;*********************************************************

(repopulate)
