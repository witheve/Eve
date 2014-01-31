(ns aurora.editor.ui
  (:require [aurora.core :as core]
            [aurora.compiler :as compiler]
            [aurora.ast :as ast]
            [aurora.jsth :as jsth]
            [cljs.reader :as reader])
  (:require-macros [aurora.macros :refer [defdom dom]]))


;;*********************************************************
;; utils
;;*********************************************************

;(js/React.initializeTouchEvents true)

(defn now []
  (.getTime (js/Date.)))

(defn update-path [path neue]
  (update-in path [(-> path count dec)] merge neue))

;;*********************************************************
;; Declares
;;*********************************************************

(declare aurora-state)
(declare aurora-state)

(defmulti step-list-item :type)
(defmulti step-description :type)
(defmulti item-ui :type)

(defmethod item-ui :default [step path]
  (dom
   (if-not (:type step)
     (item-ui {:type :non-node-constant
               :data step}
              path)
     [:span (pr-str step)])))

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


(defdom page-steps [page path]
   [:ul {:className "steps"}
     (each [step (from-index (:steps page))]
           (step-list-item step (update-path path {:step index
                                                   :step-var (:id step)}))
           )
    [:li {:className "step"
          :onClick (fn []
                     (let [page (current :page)]
                       (swap! aurora-state assoc :step [{:notebook (:id (current :notebook))
                                                         :page (:id page)
                                                         :step (count (:steps page))}])))}
     [:p {:className "desc"}
      "add step"]]])

(defdom steps-list [page]
  [:div {:className (str "workspace" (when (:steps @aurora-state)
                                       " active"))}

   [:div {:className "steps-container"}
    (page-steps page [{:notebook (:notebook @aurora-state)
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

(defn ref->name [ref]
  (let [op (when (= (:type ref) :ref/id)
             (from-index (:id ref)))]
    (if op
      (:desc op (:id ref))
      (-> (js/eval (:js ref)) meta :desc)
      )))

(defdom clickable-ref [step path]
  (let [ref (:ref step)
        name (ref->name ref)
        dblclick (fn []
                (swap! aurora-state update-in [:open-paths path] #(if (not %)
                                                                    (:id ref))))]
    (dom
      [:p {:className "desc"
           :onDoubleClick dblclick}
       name
       (each [input (:args step)]
             (item-ui input))])))

(defmethod step-list-item :call [step path]
  (dom
   [:li {:className (step-class path)
         :onClick (step-click path)
         :onContextMenu (fn [e]
                          (.nativeEvent.preventDefault e)
                          (.preventDefault e)
                          (.stopPropagation e)
                          (assoc-cache! [:menu] {:top (.-clientY e)
                                                 :left (.-clientX e)
                                                 :items [{:label "remove"
                                                          :action (fn []
                                                                    (println "remove!"))}]}))}
    (clickable-ref step path)]
   (sub-step step path)
   ))

(defmethod step-description :call [step path]
  (dom
      [:p {:className "desc"}
       (ref->name (:ref step))
       (each [input (:args step)]
             (item-ui input))]))

(defmethod item-ui :ref/id [step]
  (dom [:span {:className "ref"}
        (:id step)]))

(defmethod item-ui :call [step]
  (dom [:p {:className "desc"}
       (ref->name (:ref step))
       (each [input (:args step)]
             (item-ui input))]))

;;*********************************************************
;; Matches
;;*********************************************************

(defn match-pattern [x]
  (if-not (:type x)
    (item-ui {:type :constant
              :data x})
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
    [:p {:className "desc"} "If " (item-ui (:arg step)) "matches"]
    [:ul {:className "match-list"}
     (each [branch (step :branches)]
           (let [path (update-path path {:sub-path [:branches index :node]})]
             [:li {:className "match-branch"}
              [:span (-> branch :pattern match-pattern)]
              [:span [:span {:className ""} (item-ui (:action branch))]]]
             (sub-step branch path)))]]
     ))

(defmethod step-description :match [step path]
  (dom
      [:p {:className "desc"}
       "Find a match for " (item-ui (:arg step))
       ]))

(defmethod item-ui :match/bind [x]
  (dom [:span {:className "ref"} (:id x)]))

;;*********************************************************
;; Data
;;*********************************************************

(defn datatype-name [x]
  (cond
   (#{:ref/id :ref/js} (:type x)) "ref"
   (or (true? x) (false? x)) "boolean"
   (keyword? x) "keyword"
   (number? x) "number"
   (string? x) "string"
   (map? x) "table"
   (vector? x) "list"
   :else (str (type x))))

(defmethod item-ui :constant [x path]
  (let [value (:data x)
        name (datatype-name value)]
      (if-let [rep (get-in @aurora-state [:cache :representations name])]
        (rep value (assoc path :sub-path [:data]))
        (pr-str x))))

(defmethod item-ui :non-node-constant [x path]
  (let [value (:data x)
        name (datatype-name value)]
      (if-let [rep (get-in @aurora-state [:cache :representations name])]
        (rep value path)
        (pr-str x))))

(defmethod step-list-item :constant [step path]
  (let [value (:data step)
        name (datatype-name value)]
    (dom
     [:li {:className (step-class path)
           :onClick (step-click path)
           :onContextMenu (fn [e]
                            (assoc-cache! [:menu] {:top (.-clientY e)
                                                   :left (.-clientX e)
                                                   :items [{:label "remove"
                                                            :action (fn []
                                                                      (remove-step! (current :page) step)
                                                                      )}]})
                            (.preventDefault e)
                            (.stopPropagation e))}
      [:p {:className "desc"} "Add a " [:span {:className "value"} name]
       (when-let [rep (get-in @aurora-state [:cache :representations name])]
         (rep value (assoc (last path) :sub-path [:data])))]

      ])))

(defmethod step-description :constant [step path]
  (let [value (:data step)
        name (datatype-name value)]
    (dom
     [:p {:className "desc"} "Add a " [:span {:className "value"} name]]
     [:div {:className "result"}
      (item-ui {:type :constant
                :data (path->result path)} (last path))
      ])))

;;*********************************************************
;; editor
;;*********************************************************

(defdom contextmenu []
  (let [menu (from-cache :menu)]
    (when menu
      [:div {:id "menu-shade"
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

(defdom editing-view []
  [:div
   (steps-list (current :page))
   (step-canvas (current :step) (:step @aurora-state))])

(defdom constant-inserter []
  [:div
   [:p "insert a"]
   [:button {:onClick (fn []
                      (add-step! (current :page) (constant 4)))}
    "number"]
   [:button {:onClick (fn []
                      (add-step! (current :page) (constant "foo")))}
    "string"]
   [:button {:onClick (fn []
                      (add-step! (current :page) (constant [1 2 3])))}
    "list"]
   [:button {:onClick (fn []
                      (add-step! (current :page) (constant {"name" "aurora"
                                                            "awesomeness" 100000000})))}
    "table"]])

(defdom ref-inserter [page]
  [:ul
   (each [refs (concat (:args page) (map :id (from-index (:steps page))))]
         [:li [:button {:onClick (fn []
                                   (add-step! (current :page) (constant (ref-id refs))))}
               (subs refs 0 5)]])
   ])

(defdom new-step-helper []
  [:div
   [:p "Let's create some data to get started!"]
   (constant-inserter)
   (ref-inserter (current :page))
   ])

(defdom step-canvas [step path]
    [:div {:className (str "step-canvas")}
     (when-not step
       (new-step-helper))
     (when step
       (step-description step path)
       )
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
         (when (> (count path) 1)
           (each [{:keys [notebook page]} (rest path)]
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

(defn click-add-notebook [e]
  (add-notebook! "untitled notebook"))

(defdom notebooks-list [aurora]
  [:ul {:className "programs"}
   (each [notebook (from-index (:notebooks aurora))]
         (let [click (fn []
                       (swap! aurora-state assoc :notebook (:id notebook) :screen :pages))]
           (if (input? (:id notebook))
             [:li {:className "program-item"}
              [:input {:type "text" :defaultValue (:desc notebook)
                       :onKeyPress (fn [e]
                                     (when (= 13 (.-charCode e))
                                       (remove-input! (:id notebook))
                                       (update-index! notebook [] assoc :desc (.-target.value e))
                                       ))}]]
             [:li {:className "program-item"
                   :onContextMenu (fn [e]
                                    (assoc-cache! [:menu] {:top (.-clientY e)
                                                           :left (.-clientX e)
                                                           :items [{:label "Rename"
                                                                    :action (fn []
                                                                              (add-input! (:id notebook) :desc)
                                                                              )}
                                                                   {:label "Remove"
                                                                    :action (fn []
                                                                              (remove-notebook! notebook))}]})
                                    (.stopPropagation e)
                                    (.preventDefault e))
                   :onTouchStart click
                   :onClick click}
              (:desc notebook)])))
   [:li {:className "program-item"
         :onClick click-add-notebook} "Add notebook"]])

;;*********************************************************
;; Pages
;;*********************************************************


(defn click-add-page [e notebook]
  (add-page! notebook "untitled page"))

(defdom pages-list [notebook]
  [:ul {:className "pages"}
   (each [page (filter #(get (:tags %) :page) (from-index (:pages notebook)))]
         (let [click (fn []
                       (swap! aurora-state assoc :page (:id page) :screen :editor :step [{:notebook (:notebook @aurora-state)
                                                                                    :page (:id page)
                                                                                    :step 0}]))]

           (if (input? (:id page))
             [:li {:className "page"}
              [:input {:type "text" :defaultValue (:desc page)
                       :onKeyPress (fn [e]
                                     (when (= 13 (.-charCode e))
                                       (remove-input! (:id page))
                                       (update-index! page [] assoc :desc (.-target.value e))
                                       ))}]]
             [:li {:className "page"
                   :onContextMenu (fn [e]
                                    (assoc-cache! [:menu] {:top (.-clientY e)
                                                           :left (.-clientX e)
                                                           :items [{:label "Rename"
                                                                    :action (fn []
                                                                              (add-input! (:id page) :desc)
                                                                              )}
                                                                   {:label "Remove"
                                                                    :action (fn []
                                                                              (remove-page! notebook page))}]})

                                    (.stopPropagation e)
                                    (.preventDefault e))
                   :onClick click
                   :onTouchStart click}
              (:desc page)])))
   [:li {:className "page"
         :onClick #(click-add-page % notebook)} "Add page"]])

;;*********************************************************
;; Aurora ui
;;*********************************************************

(defdom aurora-ui []
  [:div
   (contextmenu)
   (nav)
   [:div {:id "content"}

    (condp = (:screen @aurora-state)
      :notebooks (notebooks-list @aurora-state)
      :pages (pages-list (from-index (:notebook @aurora-state)))
      :editor (editing-view))
    ]])

;;*********************************************************
;; Representations
;;*********************************************************

(defdom table-ui [ks vs path]
  [:table {:className "table"}
   [:thead
    [:tr
     (each [k ks]
           [:th (item-ui k (assoc path :sub-path (conj (:sub-path path []) ::key k)))])]]
   [:tbody
    [:tr
     (each [v vs]
           [:td (item-ui v (assoc path :sub-path (conj (:sub-path path []) (nth ks index))))])]]])


(defdom list-ui [vs path]
  [:ul {:className "list"}
   (each [v vs]
         [:li (item-ui v (assoc path :sub-path (conj (:sub-path path []) index)))])])

(defdom math-ui [x]
  (cond
   (string? x) [:span {:className "math-op"} x]
   (vector? x) [:span {:className "math-expression"}
                (to-array (map math-ui (interpose (first x) (rest x))))]
   (number? x) [:span {:className "value"}
                (pr-str x)]
   :else [:span (pr-str x)]))

(defn build-rep-cache [state]
  (assoc-in state [:cache :representations]
            {"math" math-ui
             "rect" (fn [x]
                      )
             "ref" (fn [x]
                     (dom [:span {:className "ref"}
                              (str (:id x))])
                     )
             "boolean" (fn [x]
                         (dom [:span {:className "value"}
                               (str x)]))
             "number" (fn [x path]
                        (dom
                         (if (input? path)
                           [:input {:type "text" :defaultValue x
                                    :onKeyPress (fn [e]
                                                  (when (= 13 (.-charCode e))
                                                    (assoc-index! (:step-var path) (:sub-path path) (reader/read-string (.-target.value e)))
                                                    (remove-input! path)
                                                    ))}]
                           [:span {:className "value"
                                   :onClick (fn []
                                              (add-input! path true)
                                              )}
                            (str x)])))
             "keyword" (fn [x]
                        (dom [:span {:className "value"}
                              (str x)]))
             "string" (fn [x path]
                        (dom
                         (if (input? path)
                           [:input {:type "text" :defaultValue x
                                    :onKeyPress (fn [e]
                                                  (when (= 13 (.-charCode e))
                                                    (assoc-index! (:step-var path) (:sub-path path) (.-target.value e))
                                                    (remove-input! path)
                                                    ))}]
                           [:span {:className "value"
                                   :onClick (fn []
                                              (add-input! path true)
                                              )}
                            (str x)])
                          ))
             "list" (fn [x path]
                      (list-ui x path))
             "table" (fn [x path]
                       (table-ui
                        (-> x keys)
                        (-> x vals)
                        path))}))

;;*********************************************************
;; Aurora state
;;*********************************************************

(def aurora-state (atom nil))
(def default-state {:notebook nil
                    :page nil
                    :step []
                    :screen :notebooks
                    :steps true
                    :document true
                    :open-paths {}
                    :cache {}
                    :index {}
                    :notebooks []})

(defn path->step [path]
  (let [{:keys [page step]} (last path)
        step (or step 0)]
    (when (and page step)
      (from-index (get-in (from-index page) [:steps step])))))

(defn current [key]
  (when-let [v (@aurora-state key)]
    (condp = key
      :notebook (from-index v)
      :page (from-index v)
      :step (path->step v))))

(defn from-index [id]
  (if (coll? id)
    (map from-index id)
    (get-in @aurora-state [:index id])))

(defn from-cache [path]
  (if (coll? path)
    (get-in @aurora-state (concat [:cache] path))
    (get-in @aurora-state [:cache path])))

(defn input? [id]
  (get-in @aurora-state [:cache :inputs id]))

(defn ->id [thing]
  (if (map? thing)
    (:id thing)
    thing))

;;*********************************************************
;; Aurora state (nodes)
;;*********************************************************

(defn constant
  ([data] (constant data {}))
  ([data opts] (merge {:type :constant
                       :data data}
                      opts)))

(defn ref-id [id]
  {:type :ref/id
   :id id})

;;*********************************************************
;; Aurora state (mutation!)
;;*********************************************************

(defn assoc-cache! [path v]
  (swap! aurora-state assoc-in (concat [:cache] path) v))

(defn add-input! [id path]
  (swap! aurora-state assoc-in [:cache :inputs id] path))

(defn remove-input! [id]
  (swap! aurora-state update-in [:cache :inputs] dissoc id))

(defn update-index! [thing path & args]
  (if-not thing
    (throw (js/Error. "Trying to update index with nil"))
    (apply swap! aurora-state update-in
           (concat [:index (if (map? thing)
                             (:id thing)
                             thing)]
                   path)
           args)))

(defn add-index! [thing]
  (swap! aurora-state assoc-in [:index (:id thing)] thing))

(defn assoc-index-key! [thing path old-key neue-key]
  (let [final-path (concat [:index (->id thing)] path)
        cur (get-in @aurora-state (concat [:index (->id thing)] path))
        cur-value (get cur old-key)]
    (swap! aurora-state assoc-in final-path (-> cur
                                                (dissoc old-key)
                                                (assoc neue-key cur-value)))))

(defn assoc-index! [thing path v]
  (let [rev-path (reverse path)]
    (if (= ::key (second rev-path))
      (assoc-index-key! thing
                        (->> rev-path
                             (drop 2)
                             (reverse))
                        (first rev-path)
                        v)
      (swap! aurora-state assoc-in (concat [:index (->id thing)] path) v))))

(defn remove-index! [thing]
  (swap! aurora-state update-in [:index] dissoc (:id thing)))

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

(defn add-page! [notebook desc]
  (let [page {:type :page
              :id (compiler/new-id)
              :tags #{:page}
              :args []
              :desc desc
              :steps []}]
    (when (ast/page! (:index @aurora-state) page)
      (add-index! page)
      (update-index! notebook [:pages] conj (:id page))
      page)))

(defn remove-page! [notebook page]
  (update-index! notebook [] #(assoc % :pages (vec (remove #{(:id page)} (:pages %))))))

(defn add-step! [page info]
  (let [step (merge {:id (compiler/new-id)} info)]
    (when (ast/step! (:index @aurora-state) step)
      (add-index! step)
      (update-index! page [:steps] conj (:id step))
      step)))

(defn remove-step! [page step]
  (update-index! page [] #(assoc % :steps (vec (remove #{(:id step)} (:steps %))))))

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
        (build-rep-cache))))

(defn repopulate []
  (let [stored (aget js/localStorage "aurora-state")]
    (if (and stored
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
(def prev nil)

(defn run-index [index notebook page state]
  (let [start (now)
        jsth (compiler/notebook->jsth index (get index (->id notebook)))
        source (jsth/expression->string jsth)
        _ (set! (.-innerHTML (js/document.getElementById "compile-perf")) (- (now) start))
        start (now)
        notebook (js/eval (str "(" source "());"))
        stack #js []
        func (aget notebook (str "value_" (->id page)))]
    (aset notebook "next_state" state)
    (aset notebook "stack" stack)
    (try
      (let [v [(func state []) (.-next_state notebook) (aget stack 0)]]
        (set! (.-innerHTML (js/document.getElementById "run-perf")) (- (now) start))
        v)
      (catch :default e
        (let [v [e (.-next_state notebook) (aget stack 0)]]
          (set! (.-innerHTML (js/document.getElementById "run-perf")) (- (now) start))
          v)))))

(defn re-run [notebook page args]
  (when (and notebook page)
    (reset! run-stack #js {:calls #js [(nth (run-index (:index @aurora-state) notebook page args) 2)]})
    (queue-render)))

(defn find-id [thing id]
  (first (filter #(= (aget % "id") id) (aget thing "calls"))))

(defn traverse-path [stack path]
  (loop [stack stack
         path path]
    (when stack
      (if-not path
        stack
        (recur (find-id stack (-> path first :page)) (next path))))))

(defn path->result [path]
  (when-let [frame (traverse-path @run-stack path)]
    (-> frame
        (aget "vars")
        (aget (str "value_" (-> path last :step-var)))
        )))

(add-watch aurora-state :running (fn [_ _ _ cur]
                                   (if-not (identical? prev (:index cur))
                                     (do
                                       (set! prev (:index cur))
                                       ;;TODO: args
                                       (re-run (current :notebook) (current :page) nil))
                                     (do
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

(repopulate)


