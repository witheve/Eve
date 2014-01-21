(ns aurora.editor.ui2
  (:require [aurora.core :as core]
            [aurora.compiler :as compiler]
            [aurora.interpreter :as interpreter])
  (:require-macros [aurora.macros :refer [defdom dom]]))

(js/React.initializeTouchEvents true)

(defn arrmap [func xs]
  (.map (to-array xs) func))

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

(def editor-state (atom {:notebook nil
                         :page nil
                         :screen :notebooks
                         :steps true
                         :document true}))

(def editor {:representation-cache {"math" math-ui
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
                                       :pages {"each" {:desc "For each of "}}}}})


(defn ref->name [node]
  (let [op (when (= (:kind node) :pipe)
             (get-in editor [:programs (:notebook @editor-state) :pages (-> node :id)]))]
    (:desc op (or (:id node) (-> node :fn meta :desc)))))

(defn item-ui [x]
  (if (= (:type x) :ref)
    (ref->name x)
    (let [value (or (:value x) (-> x :node :value))
          name (datatype-name value)]
      (if-let [rep (get-in editor [:representation-cache name])]
        (rep value)
        (pr-str x)))))

(defmulti step-ui #(-> % :node :type))

(defdom clickable-ref [step path]
  (let [node (:node step)
        name (ref->name node)
        click (fn []
                (println "setting path: " path (:id node))
                (swap! editor-state update-in [path] #(if (not %)
                                                        (:id node))))]
    (dom
      [:p {:className "desc"
             :onClick click
             :onTouchStart click}
       name
       (each [input (:inputs step)]
             [:span {:className "prev"} input])])))

(defdom sub-step [step path]
  (when (get @editor-state path)
      (let [node (get-in editor [:programs (:notebook @editor-state) :pages (get @editor-state path)])]
        [:li {:className "substep step"}
         (if node
           (do
             (manual-steps (get-in editor [:programs (:notebook @editor-state) :pages (:id node)])
                           (conj path (:id node))))
           [:span {:className "native"} "Native method"])])))

(defmethod step-ui :ref [step path]
  (dom
   [:li {:className "step"}
    (clickable-ref step path)]
   (sub-step step path)
   ))

(defn datatype-name [x]
  (cond
   (or (true? x) (false? x)) "boolean"
   (number? x) "number"
   (string? x) "string"
   (map? x) "list"
   (vector? x) "table"
   :else (str (type x))))

(defmethod step-ui :data [step]
  (let [value (-> step :node :value)
        name (datatype-name value)]
    (dom
     [:li {:className "step"}
      [:p {:className "desc"} "Add a " [:span {:className "value"} name]
       (when-let [rep (get-in editor [:representation-cache name])]
        (rep value))]

      ])))

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

(defmethod step-ui :match [step path]
  (dom

   [:li {:className "step"}
    [:p {:className "desc"} "If " (each [input (:inputs step)]
                                        [:span {:className "prev"} input]) "matches"]]
   (each [branch (-> step :node :branches)]
         (let [path (conj path (str "match" index))]
           [:li {:className "match-branch step"}
            [:span (-> branch :pattern match-pattern)]
            [:span [:span {:className ""} (branch-result branch path)]]]
           (sub-step branch path)))
     ))


(defmethod step-ui :default [step]
  (dom
   [:p "this is a step of type " (pr-str step)]))



(defn result-ui [x]
  (cond
   (js/aurora.core.isTable x) (table-ui (-> x first keys) (-> x first vals))
   (js/aurora.core.isList x) (list-ui x)
   :else (str x)))


(defdom manual-steps [man path]
   [:ul {:className "steps"}
     (each [node (:nodes man)]
           (step-ui node (conj path index))
           )])

(defdom steps-workspace [man]
  [:div {:className (str "workspace" (when (:steps @editor-state)
                                       " active"))}

   [:div {:className "steps-container"}
    (manual-steps man [(:notebook @editor-state) (:page @editor-state)])]
     ])

(defdom nav []
  [:div {:id "nav"}
   [:ul {:className "breadcrumb"}
    [:li
     [:span {:onClick (fn []
                         (condp = (:screen @editor-state)
                           :editor (swap! editor-state assoc :screen :pages)
                           :pages (swap! editor-state assoc :screen :notebooks)
                           :else nil))}
      "Demos"]
     [:span "Example c"]
     [:span "Subtract"]
     ]]
   (when (= (:screen @editor-state) :editor)
     [:ul {:className "toggles"}
      [:li {:className (when (:document @editor-state)
                         "active")
            :onClick (fn []
                       (swap! editor-state update-in [:document] not))}
       [:i {:className "icon ion-ios7-browsers-outline"}] [:span "Document"]]
      [:li {:className (when (:steps @editor-state)
                         "active")
            :onClick (fn []
                       (swap! editor-state update-in [:steps] not))}
       [:i {:className "icon ion-ios7-drag"}] [:span "Steps"]]])])

(defdom document []
  [:div {:className (str "document " (when (:document @editor-state)
                                       "active"))}
        ])

(defdom notebooks-list [editor]
  [:ul {:className "programs"}
   (each [[name program] (:programs editor)]
         (let [click (fn []
                       (swap! editor-state assoc :notebook name :screen :pages)
                       (println "clicked!" name))]
           [:li {:className "program-item"
                 :onTouchStart click
                 :onClick click}
            (:desc program)]))])

(defdom pages-list [prog]
  [:ul {:className "pages"}
   (each [[name man] (filter #(get (-> % second :tags) :page) (:pages prog))]
         (let [click (fn []
                       (swap! editor-state assoc :page name :screen :editor))]
           [:li {:className "page"
                 :onClick click
                 :onTouchStart click}
            (:desc man)]))])

(defn now []
  (.getTime (js/Date.)))

(defdom aurora-ui []
  [:div
   (nav)
   [:div {:id "content"}
    (condp = (:screen @editor-state)
      :notebooks (notebooks-list editor)
      :pages (pages-list (-> editor :programs (get (:notebook @editor-state))))
      :editor (array
                     (steps-workspace (-> editor :programs (get-in [(:notebook @editor-state) :pages (:page @editor-state)])))))
    ]])

(defn update []
  (let [start (now)]
    (time(js/React.renderComponent
          (aurora-ui)
          (js/document.querySelector "#wrapper")))
    (set! (.-innerHTML (js/document.querySelector "#perf")) (- (now) start))))

(add-watch editor-state :foo (fn [_ _ _ cur]
                               (update)))
(update)
