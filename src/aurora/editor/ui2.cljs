(ns aurora.editor.ui2
  (:require [aurora.core :as core]
            [aurora.compiler :as compiler]
            [aurora.interpreter :as interpreter])
  (:require-macros [aurora.macros :refer [defdom dom]]))


;;*********************************************************
;; utils
;;*********************************************************

(js/React.initializeTouchEvents true)

(defn now []
  (.getTime (js/Date.)))

(defn update-path [path neue]
  (update-in path [(-> path count dec)] merge neue))

;;*********************************************************
;; Declares
;;*********************************************************

(declare aurora-state)
(declare aurora-state)

(defmulti step-list-item #(-> % :node :type))
(defmulti step-description #(-> % :node :type))

(defmethod step-list-item :default [step]
  (dom
   [:p "this is a step list item of " (pr-str step)]))

(defmethod step-description :default [step]
  (dom
   [:p "this is a step description of " (pr-str step)]))

;;*********************************************************
;; Step list
;;*********************************************************

(defdom sub-step [step path]
  (when (get-in @aurora-state [:open-paths path])
      (let [node (get-in @aurora-state [:notebooks (:notebook @aurora-state) :pages (get-in @aurora-state [:open-paths path])])]
        [:li {:className "substep step"}
         (if node
           (do
             (manual-steps (get-in @aurora-state [:notebooks (:notebook @aurora-state) :pages (:id node)])
                           (conj path {:notebook (:notebook @aurora-state)
                                       :page (:id node)})))
           [:span {:className "native"} "Native method"])])))


(defdom manual-steps [man path]
   [:ul {:className "steps"}
     (each [node (:nodes man)]
           (step-list-item node (update-path path {:step index}))
           )])

(defdom steps-workspace [man]
  [:div {:className (str "workspace" (when (:steps @aurora-state)
                                       " active"))}

   [:div {:className "steps-container"}
    (manual-steps man [{:notebook (:notebook @aurora-state)
                        :page (:page @aurora-state)}])]
     ])

(defn step-click [path]
  (fn [e]
    (swap! aurora-state assoc :step path)
    (.preventDefault e)
    (.stopPropagation e)))

(defn step-class [path]
  (str "step " (when (= path (:step @aurora-state))
                 "selected")))

;;*********************************************************
;; Function calls
;;*********************************************************

(defn ref->name [node]
  (let [op (when (= (:kind node) :pipe)
             (get-in @aurora-state [:notebooks (:notebook @aurora-state) :pages (-> node :id)]))]
    (:desc op (or (:id node) (-> node :fn meta :desc)))))

(defdom clickable-ref [step path]
  (let [node (:node step)
        name (ref->name node)
        dblclick (fn []
                (swap! aurora-state update-in [:open-paths path] #(if (not %)
                                                                    (:id node))))]
    (dom
      [:p {:className "desc"
           :onDoubleClick dblclick}
       name
       (each [input (:inputs step)]
             [:span {:className "prev"} input])])))

(defmethod step-list-item :ref [step path]
  (dom
   [:li {:className (step-class path)
         :onClick (step-click path)}
    (clickable-ref step path)]
   (sub-step step path)
   ))

(defmethod step-description :ref [step path]
  (dom
      [:p {:className "desc"}
       (ref->name (:node step))
       (each [input (:inputs step)]
             [:span {:className "prev"} input])]))

;;*********************************************************
;; Matches
;;*********************************************************

(defn match-pattern [x]
  (if (= (namespace (:type x)) "match")
    (condp = (:type x)
      :match/bind (dom [:span {:className "param"} (:var x)])
      (pr-str x))
    (item-ui x)))

(defn branch-result [branch path]
  (if (-> branch :node :type (= :ref))
    (clickable-ref branch path)
    (item-ui (:node branch))))

(defn matchee [x]
  (cond
   (map? x) (table-ui (keys x) (vals x))
   (vector? x) (list-ui x)
   (= :otherwise x) "otherwise"
   :else (item-ui x)))

(defn match-table [step path]
  [:table {:className "match"}
      (each [branch (-> step :node :branches)]
            [:tr
             [:td (-> branch :pattern match-pattern)]
             [:td [:span {:className ""} (branch-result branch path)]]])])

(defmethod step-list-item :match [step path]
  (dom

   [:li {:className (step-class path)
         :onClick (step-click path)}
    [:p {:className "desc"} "If " (each [input (:inputs step)]
                                        [:span {:className "prev"} input]) "matches"]
    [:ul {:className "match-list"}
     (each [branch (-> step :node :branches)]
           (let [path (update-path path {:sub-path [:branches index :node]})]
             [:li {:className "match-branch"}
              [:span (-> branch :pattern match-pattern)]
              [:span [:span {:className ""} (branch-result branch path)]]]
             (sub-step branch path)))]]
     ))

(defmethod step-description :match [step path]
  (dom
      [:p {:className "desc"}
       "Find a match for "
       (each [input (:inputs step)]
             [:span {:className "prev"} input])]))

;;*********************************************************
;; Data
;;*********************************************************

(defn datatype-name [x]
  (cond
   (or (true? x) (false? x)) "boolean"
   (number? x) "number"
   (string? x) "string"
   (map? x) "list"
   (vector? x) "table"
   :else (str (type x))))

(defn item-ui [x]
  (if (= (:type x) :ref)
    (ref->name x)
    (let [value (or (:value x) (-> x :node :value))
          name (datatype-name value)]
      (if-let [rep (get-in @aurora-state [:representation-cache name])]
        (rep value)
        (pr-str x)))))

(defmethod step-list-item :data [step path]
  (let [value (-> step :node :value)
        name (datatype-name value)]
    (dom
     [:li {:className (step-class path)
           :onClick (step-click path)}
      [:p {:className "desc"} "Add a " [:span {:className "value"} name]
       (when-let [rep (get-in @aurora-state [:representation-cache name])]
        (rep value))]

      ])))

(defmethod step-description :data [step path]
  (let [value (-> step :node :value)
        name (datatype-name value)]
    (dom
      [:p {:className "desc"} "Add a " [:span {:className "value"} name]])))

;;*********************************************************
;; editor
;;*********************************************************

(defdom editing-view []
  [:div
   (steps-workspace (current :page))
   (step-canvas (current :step) (:step @aurora-state))])

(defdom step-canvas [step path]
  [:div {:className (str "step-canvas")}
   (step-description step path)
   [:div {:className "result"}
    "Shit goes here"]
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
                            (swap! aurora-state assoc :screen :notebooks :notebook nil :page nil :step nil))}
          (:desc notebook)])
       (when-let [page (current :page)]
         [:span {:onClick (fn []
                            (swap! aurora-state assoc :screen :pages :page nil :step nil))}
          (:desc page)])
       (when-let [path (:step @aurora-state)]
         (println path)
         (when (> (count path) 1)
           (each [{:keys [notebook page]} (rest path)]
                 (println "trying: " notebook page)
                 (when-let [cur (get-in @aurora-state [:notebooks notebook :pages page])]
                   [:span (get cur :desc (:id cur))])))
         [:span (:step (last path))])
       ]]
   (when (= (:screen @aurora-state) :editor)
     [:ul {:className "toggles"}
      [:li {:className (when (:document @aurora-state)
                         "active")
            :onClick (fn []
                       (swap! aurora-state update-in [:document] not))}
       [:i {:className "icon ion-ios7-browsers-outline"}] [:span "Document"]]
      [:li {:className (when (:steps @aurora-state)
                         "active")
            :onClick (fn []
                       (swap! aurora-state update-in [:steps] not))}
       [:i {:className "icon ion-ios7-drag"}] [:span "Steps"]]])])

;;*********************************************************
;; Notebooks
;;*********************************************************

(defdom notebooks-list [editor]
  [:ul {:className "programs"}
   (each [[name program] (:notebooks editor)]
         (let [click (fn []
                       (swap! aurora-state assoc :notebook name :screen :pages)
                       (println "clicked!" name))]
           [:li {:className "program-item"
                 :onTouchStart click
                 :onClick click}
            (:desc program)]))])

;;*********************************************************
;; Pages
;;*********************************************************

(defdom pages-list [prog]
  [:ul {:className "pages"}
   (each [[name man] (filter #(get (-> % second :tags) :page) (:pages prog))]
         (let [click (fn []
                       (swap! aurora-state assoc :page name :screen :editor :step [{:notebook (:notebook @aurora-state)
                                                                                    :page name
                                                                                    :step 0}]))]
           [:li {:className "page"
                 :onClick click
                 :onTouchStart click}
            (:desc man)]))])

;;*********************************************************
;; Aurora ui
;;*********************************************************

(defdom aurora-ui []
  [:div
   (nav)
   [:div {:id "content"}
    (condp = (:screen @aurora-state)
      :notebooks (notebooks-list @aurora-state)
      :pages (pages-list (-> @aurora-state :notebooks (get (:notebook @aurora-state))))
      :editor (editing-view))
    ]])

;;*********************************************************
;; Representations
;;*********************************************************

(defdom table-ui [ks vs]
  [:table {:className "table"}
   [:thead
    [:tr
     (each [k ks]
           [:th (item-ui k)])]]
   [:tbody
    [:tr
     (each [v vs]
           [:td (item-ui v)])]]])


(defdom list-ui [vs]
  [:ul {:className "list"}
   (each [v vs]
         [:li (item-ui v)])])

(defdom math-ui [x]
  (cond
   (string? x) [:span {:className "math-op"} x]
   (vector? x) [:span {:className "math-expression"}
                (to-array (map math-ui (interpose (first x) (rest x))))]
   (number? x) [:span {:className "value"}
                (pr-str x)]
   :else [:span (pr-str x)]))

;;*********************************************************
;; Aurora state
;;*********************************************************

(def aurora-state (atom {:notebook nil
                         :page nil
                         :step []
                         :screen :notebooks
                         :steps true
                         :document true
                         :open-paths {}
                         :representation-cache {"math" math-ui
                                                "rect" (fn [x]
                                                         )
                                                "boolean" (fn [x]
                                                            (dom [:span {:className "value"}
                                                                  (str x)]))
                                                "number" (fn [x]
                                                           (dom [:span {:className "value"}
                                                                 (str x)]))
                                                "string" (fn [x]
                                                           (dom [:span {:className "value"}
                                                                 (str x)]))
                                                "list" (fn [x]
                                                         (list-ui x))
                                                "table" (fn [x]
                                                          (table-ui
                                                           (-> x :args first :data :value)
                                                           (-> x :args second :data :value)))}
                         :notebooks {"program1" {:desc "Demos"
                                                :pages interpreter/example-c-mappified}
                                    "aurora.math" {:desc "Math"
                                                   :pages {"even" {:desc "is even?"}}}
                                    "aurora.core" {:desc "Core"
                                                   :pages {"each" {:desc "For each of "}}}}}))


(defn path->step [path]
  (let [{:keys [notebook page step]} (last path)]
    (if (and notebook page step)
      (get-in @aurora-state [:notebooks notebook :pages page :nodes step])
      (get-in @aurora-state [:notebooks (:notebook @aurora-state) :pages (:page @aurora-state) :nodes 0]))))

(defn current [key]
  (when-let [v (@aurora-state key)]
    (condp = key
      :notebook (get-in @aurora-state [:notebooks v])
      :page (get-in @aurora-state [:notebooks (:notebook @aurora-state) :pages v])
      :step (path->step v))))


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
    (set! (.-innerHTML (js/document.getElementById "render-perf")) (- (now) start))
    (set! queued? false)))

(defn queue-render []
  (when-not queued?
    (set! queued? true)
    (RAF update)))

(add-watch aurora-state :foo (fn [_ _ _ cur]
                               (queue-render)))

(queue-render)
