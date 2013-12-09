(ns aurora.editor.ui
  (:require [aurora.core :as core]
            [aurora.compiler :as compiler])
  (:require-macros [aurora.macros :refer [dom]]))

(defn coll->array [thing]
  (if-not (coll? thing)
    thing
    (to-array thing)))

(defn react-wrapper [node attr children]
  (let [children (to-array (map coll->array children))]
    (apply (aget js/React.DOM node) attr children)))

(defn arrmap [func xs]
  (.map (to-array xs) func))

(defn table-ui [ks vs]
  (dom [:table {:className "table"}
        [:thead
         [:tr
          (arrmap #(dom [:th %])
                  ks)]]
        [:tbody
         [:tr
          (arrmap #(dom [:td (item-ui %)
                         ])
                  vs)]]]))

(defn list-ui [vs]
  (dom [:ul {:className "list"}
        (arrmap #(dom [:li (item-ui %)])
                vs)]))

(def editor-state (atom {:active nil
                         :manual nil}))
(def editor {:representation-cache {"number" (fn [x]
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
             :programs {"program1" js/aurora.compiler.example
                        "aurora.math" {:manuals {"even" {:desc "is even?"}}}
                        "aurora.core" {:manuals {"each" {:desc "For each"}}}}})

(defn program-item [[name program]]
  (dom
   [:li {:onClick (fn []
                    (swap! editor-state assoc :active name)
                    (println "clicked!" name))} name]))

(defn program-list [editor]
  (when-not (:active @editor-state)
    (dom
     [:ul
      (arrmap program-item (:programs editor))])))

(defn manual-item [[name man]]
  (dom [:li {:onClick (fn []
                        (swap! editor-state assoc :manual name))} name]))

(defn program [prog]
  (when (and prog (not (:manual @editor-state)))
    (dom

     [:div
      [:button {:onClick (fn []
                          (swap! editor-state assoc :active nil))} "all programs"]
      [:ul
       (arrmap manual-item (:manuals prog))]
      "We have the manual" (:name prog)])))

(defmulti item-ui :type)

(defmethod item-ui :ref [step]
  (if (= (:to step) :prev)
    (dom [:span {:className "prev"} "that"])
    (dom [:span {:className "ref"} (str (:to step))]))
  )

(defmethod item-ui :value [step]
  (let [tag (-> step :data :tags first)
        rep (get-in editor [:representation-cache tag])]
    (if rep
      (rep (-> step :data :value))
      (dom [:span {:className "value"} (pr-str (-> step :data :value))]))
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


(defmethod step-ui :operation [step]
  (let [op (compiler/find-ref (:op step) (get-in editor [:programs (:active @editor-state)]) editor)]
    (dom
      [:div {:className "desc"}
       (:desc op (str "exec " (get-in step [:op :to])))
       (arrmap manual-step-item (:args step))])))

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
     [:p "Find a match for " (arrmap manual-step-item (:root step))]
     [:table {:className "match"}
      (to-array (for [x (:branches step)]
                  (dom
                   [:tr
                    [:td (-> x first matchee)]
                    [:td (-> x second item-ui)]])
                  ))]
     ]))

(defmethod step-ui :default [step]
  (dom
   [:p "this is a step of type " (name (:type step))]))



(defn result-ui [x]
  (cond
   (js/aurora.core.isTable x) (table-ui (-> x first keys) (-> x first vals))
   (js/aurora.core.isList x) (list-ui x)
   :else (str x)))

(defn manual-step [step i]
  (dom
   [:tr {:className "step"}
    [:td
     (step-ui step)]
    [:td {:className "result"} (result-ui (js/aurora.core.->capture (:active @editor-state) (:manual @editor-state) i))]])
  )

(defn manual-step-item [step]
  (item-ui step)
  )

(defn manual-steps [man]
  (dom
   [:table {:className "steps"}
    (arrmap manual-step (:steps man))]))

(defn manual [man]
  (when man
    (dom

     [:div
      [:button {:onClick (fn []
                          (swap! editor-state assoc :manual nil))} "all manuals"]
      (manual-steps man)
      ]))
  )

(swap! editor-state assoc :active nil)


(defn update []
  (time(js/React.renderComponent
        (dom [:div
              (program-list editor)
              (program (-> editor :programs (get (:active @editor-state))))
              (manual (-> editor :programs (get-in [(:active @editor-state) :manuals (:manual @editor-state)])))
              ]

             )
        js/document.body)))
(add-watch editor-state :foo (fn [_ _ _ cur]
                               (update)))
(update)