(ns aurora.editor.ui2
  (:require [aurora.core :as core]
            [aurora.compiler :as compiler])
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

(def editor-state (atom {:active nil
                         :manual nil
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
                                             (list-ui (-> x :args first :data :value)))
                                    "table" (fn [x]
                                              (table-ui
                                               (-> x :args first :data :value)
                                               (-> x :args second :data :value)))}
             :programs {"program1" compiler/example
                        "aurora.math" {:desc "Math"
                                       :manuals {"even" {:desc "is even?"}}}
                        "aurora.core" {:desc "Core"
                                       :manuals {"each" {:desc "For each of "}}}}})

(defdom notebooks-list [editor]
  [:ul {:className "programs"}
   (each [[name program] (:programs editor)]
         (let [click (fn []
                       (swap! editor-state assoc :active name :screen :pages)
                       (println "clicked!" name))]
           [:li {:className "program-item"
                 :onTouchStart click
                 :onClick click}
            (:desc program)]))])

(defdom pages-list [prog]
  [:div
   [:ul {:className "manuals"}
    (each [[name man] (:manuals prog)]
          (let [click (fn []
                        (swap! editor-state assoc :manual name :screen :editor))]
            [:li {:className "manual-item"
                  :onClick click
                  :onTouchStart click}
             (:desc man)]))
    ]])

(defmulti item-ui :type)

(defmethod item-ui :ref [step]
  (if (= (:to step) :prev)
    (dom [:span {:className "prev"} "that"])
    (dom [:span {:className "ref"} (or (:desc (compiler/find-ref step (get-in editor [:programs (:active @editor-state)]) editor))
                                       (str (:to step)))]))
  )

(defmethod item-ui :value [step]
  (let [tag (-> step :data :tags first)
        rep (get-in editor [:representation-cache tag])]
    (if rep
      (rep (-> step :data :value))
      (dom [:span {:className "value"} (pr-str (-> step :data :value))]))
    ))

(defmethod item-ui :transformer [step]
  (let [tag (-> step :tags first)
        rep (get-in editor [:representation-cache tag])]
    (if rep
      (rep (:data step))
      (dom [:span {:className "value"} "transformer"]))
    ))

(defmethod item-ui :operation [step]
  (let [op (compiler/find-ref (:op step) (get-in editor [:programs (:active @editor-state)]) editor)]
    (dom
     [:div
      (:desc op (str "exec " (get-in step [:op :to])))
      (arrmap manual-step-item (:args step))])
  ))

(defmethod item-ui :default [step]
  (str step))

(defmulti step-ui :type)


(defmethod step-ui :operation [step i]
  (let [path [(:manual @editor-state) (:active @editor-state) i]
        cur (get @editor-state path)
        op (compiler/find-ref (:op step) (get-in editor [:programs (:active @editor-state)]) editor)
        click (fn []
                (swap! editor-state assoc path (not cur)))]
    (dom
      [:div {:className "desc"
             :onClick click
             :onTouchStart click}
       (:desc op (str "exec " (get-in step [:op :to])))
       (arrmap manual-step-item (:args step))
       (when cur
         (dom [:p "open"]))])))

(defmethod step-ui :value [step]
  (dom
    [:div {:className "desc"}
     [:p "Create a " (-> step :data :tags first)]
     (item-ui step)]))

(defn matchee [x]
  (cond
   (map? x) (table-ui (keys x) (vals x))
   (vector? x) (list-ui x)
   (= :otherwise x) "otherwise"
   :else (item-ui x)))

(defmethod step-ui :match [step]
  (dom
    [:div {:className "desc"}
     [:p "Find a match for " (arrmap manual-step-item (:root step)) " in "]
     [:table {:className "match"}
      (to-array (for [x (:branches step)]
                  (dom
                   [:tr
                    [:td (-> x first matchee)]
                    [:td [:span {:className ""} (-> x second item-ui)]]])
                  ))]
     ]))

(defmethod step-ui :transformer [step]
  (dom [:div {:className "desc"}
        (manual-step-item step)]))

(defmethod step-ui :default [step]
  (dom
   [:p "this is a step of type " (name (:type step))]))



(defn result-ui [x]
  (cond
   (js/aurora.core.isTable x) (table-ui (-> x first keys) (-> x first vals))
   (js/aurora.core.isList x) (list-ui x)
   :else (str x)))

(defn manual-step-item [step]
  (item-ui step))

(defdom manual-steps [man]
  [:div {:className "steps-container"}
   [:table {:className "steps"}
    (each [step (:steps man)]
          [:tr {:className "step"}
           [:td
            (step-ui step i)]
           [:td {:className "result"} "TODO: get result"]])
    ]])

(defdom steps-workspace [man]
  (let [click (fn []
                (swap! editor-state assoc :manual nil))]
    [:div {:className (str "workspace" (when (:steps @editor-state)
                                         " active"))}
     (manual-steps man)
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

(defn now []
  (.getTime (js/Date.)))

(defdom aurora-ui []
  [:div
   (nav)
   [:div {:id "content"}
    (condp = (:screen @editor-state)
      :notebooks (notebooks-list editor)
      :pages (pages-list (-> editor :programs (get (:active @editor-state))))
      :editor (array (document)
                     (steps-workspace (-> editor :programs (get-in [(:active @editor-state) :manuals (:manual @editor-state)])))))
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
