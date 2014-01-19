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
   (compiler/is-node? x) (manual-step-item x)
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
                                    "number" (fn [x]
                                               (dom [:span {:className "value"}
                                                     (pr-str x)]))
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

(defn item-ui [x]
  (let [value (or (:value x) (-> x :node :value))
        name (datatype-name value)]
    (if-let [rep (get-in editor [:representation-cache name])]
      (rep value)
      (pr-str x))))

(defmulti step-ui #(-> % :node :type))

(defmethod step-ui :ref [step i]
  (let [path [(:page @editor-state) (:notebook @editor-state) i]
        cur (get @editor-state path)
        node (:node step)
        op (when (= (:kind node) :pipe)
             (get-in editor [:programs (:notebook @editor-state) :pages (-> node :id)]))
        click (fn []
                (swap! editor-state assoc path (not cur)))]
    (println node (-> node :fn meta))
    (dom
      [:div {:className "desc"
             :onClick click
             :onTouchStart click}
       (:desc op (or (:id node) (-> node :fn meta :desc)))
       (each [input (:inputs step)]
             [:span {:className "prev"} input])
       ])))

(defn datatype-name [x]
  (cond
   (number? x) "number"
   (string? x) "string"
   (map? x) "list"
   (vector? x) "table"
   :else (str (type x))))

(defmethod step-ui :data [step]
  (let [value (-> step :node :value)
        name (datatype-name value)]
    (dom
     [:div {:className "desc"}
      [:p "Create a " [:span {:className "value"} name]]
      (when-let [rep (get-in editor [:representation-cache name])]
        (rep value))
      ])))

(defn match-pattern [x]
  (if (= (namespace (:type x)) "match")
    (pr-str x)
    (item-ui x)))

(defn matchee [x]
  (cond
   (map? x) (table-ui (keys x) (vals x))
   (vector? x) (list-ui x)
   (= :otherwise x) "otherwise"
   :else (item-ui x)))

(defmethod step-ui :match [step]
  (dom
    [:div {:className "desc"}
     [:p "Find a match for " (each [input (:inputs step)]
                                   [:span {:className "prev"} input]) " in "]
     [:table {:className "match"}
      (each [branch (-> step :node :branches)]
            [:tr
             [:td (-> branch :pattern match-pattern)]
             [:td [:span {:className ""} (-> branch :node item-ui)]]])]
     ]))

(defmethod step-ui :transformer [step]
  (dom [:div {:className "desc"}
        (manual-step-item step)]))

(defmethod step-ui :default [step]
  (dom
   [:p "this is a step of type " (pr-str step)]))



(defn result-ui [x]
  (cond
   (js/aurora.core.isTable x) (table-ui (-> x first keys) (-> x first vals))
   (js/aurora.core.isList x) (list-ui x)
   :else (str x)))

(defn manual-step-item [step]
  (item-ui step))

(defdom manual-steps [man]
   [:table {:className "steps"}
    [:tbody
     (each [node (:nodes man)]
           [:tr {:className "step"}
            [:td
             (step-ui node index)
             ]
            [:td {:className "result"} "TODO: get result"]]
           (when (get @editor-state [(:page @editor-state) (:notebook @editor-state) index])
             (let [node (:node node)]
               [:tr {:className "substep step"}
                [:td {:colSpan 2}
                 (if (= (:kind node) :pipe)
                   (manual-steps (get-in editor [:programs (:notebook @editor-state) :pages (-> node :id)]))
                   [:span {:className "native"} "Native method"])]


                ])))]
    ])

(defdom steps-workspace [man]
  (let [click (fn []
                (swap! editor-state assoc :page nil))]
    [:div {:className (str "workspace" (when (:steps @editor-state)
                                         " active"))}

     [:div {:className "steps-container"}
     (manual-steps man)]
     ]))

(defdom nav []
  [:div {:id "nav"}
   [:ul
    [:li [:i {:className "icon ion-ios7-arrow-left"
              :onClick (fn []
                         (condp = (:screen @editor-state)
                           :editor (swap! editor-state assoc :screen :pages)
                           :pages (swap! editor-state assoc :screen :notebooks)
                           :else nil))}]
     [:span
      (condp = (:screen @editor-state)
        :editor "Pages"
        :pages "Notebooks"
        "Home")]]]
   [:ul
    [:li [:i {:className "icon ion-ios7-plus-empty"}] [:span "Add"]]]
   (when (= (:screen @editor-state) :editor)
     [:ul
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
      :editor (array (document)
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
