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
  (when (get @aurora-state path)
      (let [node (get-in @aurora-state [:programs (:notebook @aurora-state) :pages (get @aurora-state path)])]
        [:li {:className "substep step"}
         (if node
           (do
             (manual-steps (get-in @aurora-state [:programs (:notebook @aurora-state) :pages (:id node)])
                           (conj path (:id node))))
           [:span {:className "native"} "Native method"])])))


(defdom manual-steps [man path]
   [:ul {:className "steps"}
     (each [node (:nodes man)]
           (step-list-item node (conj path index))
           )])

(defdom steps-workspace [man]
  [:div {:className (str "workspace" (when (:steps @aurora-state)
                                       " active"))}

   [:div {:className "steps-container"}
    (manual-steps man [(:notebook @aurora-state) (:page @aurora-state)])]
     ])

;;*********************************************************
;; Function calls
;;*********************************************************

(defn ref->name [node]
  (let [op (when (= (:kind node) :pipe)
             (get-in @aurora-state [:programs (:notebook @aurora-state) :pages (-> node :id)]))]
    (:desc op (or (:id node) (-> node :fn meta :desc)))))

(defdom clickable-ref [step path]
  (let [node (:node step)
        name (ref->name node)
        click (fn []
                (println "setting path: " path (:id node))
                (swap! aurora-state update-in [path] #(if (not %)
                                                        (:id node))))]
    (dom
      [:p {:className "desc"
             :onClick click
             :onTouchStart click}
       name
       (each [input (:inputs step)]
             [:span {:className "prev"} input])])))

(defmethod step-list-item :ref [step path]
  (dom
   [:li {:className "step"}
    (clickable-ref step path)]
   (sub-step step path)
   ))

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

   [:li {:className "step"}
    [:p {:className "desc"} "If " (each [input (:inputs step)]
                                        [:span {:className "prev"} input]) "matches"]
    [:ul {:className "match-list"}
     (each [branch (-> step :node :branches)]
           (let [path (conj path (str "match" index))]
             [:li {:className "match-branch"}
              [:span (-> branch :pattern match-pattern)]
              [:span [:span {:className ""} (branch-result branch path)]]]
             (sub-step branch path)))]]
     ))

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

(defmethod step-list-item :data [step]
  (let [value (-> step :node :value)
        name (datatype-name value)]
    (dom
     [:li {:className "step"}
      [:p {:className "desc"} "Add a " [:span {:className "value"} name]
       (when-let [rep (get-in @aurora-state [:representation-cache name])]
        (rep value))]

      ])))

(defn item-ui [x]
  (if (= (:type x) :ref)
    (ref->name x)
    (let [value (or (:value x) (-> x :node :value))
          name (datatype-name value)]
      (if-let [rep (get-in @aurora-state [:representation-cache name])]
        (rep value)
        (pr-str x)))))

;;*********************************************************
;; editor
;;*********************************************************

(defdom editing-view []
  [:div
   (steps-workspace (-> @aurora-state :programs (get-in [(:notebook @aurora-state) :pages (:page @aurora-state)])))
   (step-canvas)])

(defdom step-canvas []
  [:div {:className (str "step-canvas ")}
   [:p {:className "desc"} "Step's long description"]
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
     [:span {:onClick (fn []
                         (condp = (:screen @aurora-state)
                           :editor (swap! aurora-state assoc :screen :pages)
                           :pages (swap! aurora-state assoc :screen :notebooks)
                           :else nil))}
      "Demos"]
     [:span "Example c"]
     [:span "Subtract"]
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
   (each [[name program] (:programs editor)]
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
                       (swap! aurora-state assoc :page name :screen :editor))]
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
      :pages (pages-list (-> @aurora-state :programs (get (:notebook @aurora-state))))
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
                         :screen :notebooks
                         :steps true
                         :document true
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
                         :programs {"program1" {:desc "Demos"
                                                :pages interpreter/example-c-mappified}
                                    "aurora.math" {:desc "Math"
                                                   :pages {"even" {:desc "is even?"}}}
                                    "aurora.core" {:desc "Core"
                                                   :pages {"each" {:desc "For each of "}}}}}))


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
