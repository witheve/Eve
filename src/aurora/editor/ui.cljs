(ns aurora.editor.ui
  (:require [aurora.editor.ReactDommy :refer [node]]
            [aurora.language :as language]
            [aurora.language.representation :as representation]
            [aurora.runtime.core :as runtime :refer [run-env pause unpause replay-last]]
            [aurora.runtime.timers]
            [aurora.runtime.ui]
            [aurora.runtime.io]
            [aurora.runtime.stdlib :as stdlib]
            [aurora.editor.types :as types]
            [aurora.editor.clauses :as clauses]
            [aurora.editor.core :refer [state cur-env aurora-state]]
            [aurora.editor.component]
            [aurora.editor.components.value-editor :refer [value-editor on-value-editor-show]]
            [aurora.editor.components.matcher :refer [instance] :as matcher]
            [cljs.reader :as reader]
            [aurora.editor.dom :as dom]
            [clojure.set :as set]
            [clojure.walk :as walk]
            [clojure.string :as string]
            [aurora.util.core :refer [now remove-index key-codes cycling-move]])
  (:require-macros [aurora.language.macros :refer [query rule]]
                   [aurora.macros :refer [defcomponent defmethodcomponent]]))

(declare rule-ui matches)

(defmulti draw-statement (fn [x y path]
                           (:type x)))

(defmulti draw-clause (fn [x y path]
                        (:type x)))

(defn statement-item [path & content]
  [:li {:onContextMenu (fn [e]
                         (.stopPropagation e)
                         (swap! state assoc :menu {:top (.-clientY e)
                                                   :left (.-clientX e)
                                                   :items [{:label "remove reaction"
                                                            :action (fn []
                                                                      (swap! state update-in (butlast path) remove-index (last path))
                                                                      )}]})
                         )
        :onClick (fn []
                   (swap! state assoc-in [:matcher :path] path))
        :classes {"statement" true}
        }
   content])

(defn clause-item [path & content]
  [:span.statement-item {:onContextMenu (fn [e]
                           (.stopPropagation e)
                           (swap! state assoc :menu {:top (.-clientY e)
                                                     :left (.-clientX e)
                                                     :items [{:label "remove"
                                                              :action (fn []
                                                                        (swap! state update-in (butlast path) remove-index (last path))
                                                                        )}]}))
           }
   content])

(defmethodcomponent draw-statement "rule" [rule path matcher? edit-path?]
  (let [clauses (map-indexed vector (:clauses rule))
        edit-seg (get edit-path? 4)
        whens (filter #(#{"when" "find"  "see" "compute"} (-> (last %) :type)) clauses)
        dos (filter #(not (#{"when" "find" "see" "compute"} (-> (last %) :type))) clauses)
        ]
    (statement-item path
                    [:table
                     [:tbody
                      [:tr
                       [:td.whens
                        [:ul.sub
                         (for [[i c] whens
                               :let [path (conj path :clauses i)]]
                           (statement-item path
                                           (draw-clause c path (if (= edit-seg i)
                                                                 edit-path?)))
                           )
                         (if matcher?
                           [:li.statement (matches (:matcher @state))]
                           )
                         ]]
                       [:td.dos
                        [:ul.sub
                         (for [[i c] dos
                               :let [path (conj path :clauses i)]]
                           (statement-item path
                                           (draw-clause c path (if (= edit-seg i)
                                                                 edit-path?)))
                           )
                         ]
                        ]]]])))

(defmethodcomponent draw-statement "add" [rule path matcher? edit-path?]
  (statement-item path
   (draw-clause rule path edit-path?)))

(defmethodcomponent draw-statement "remember" [rule path matcher? edit-path?]
  (statement-item path
   (draw-clause rule path edit-path?)))

(defmethodcomponent draw-clause "add" [clause path edit-path?]
  (draw-clause (assoc clause :type "remember"))
  )


(defmethodcomponent draw-clause "remember" [clause path edit-path?]
  (clause-item path
               [:span.keyword "remember"] (rule-ui clause path))
  )

(defmethodcomponent draw-clause "when" [clause path edit-path?]
  (clause-item path
    [:span.keyword.condition "when"] (rule-ui clause path)))

(defmethodcomponent draw-clause "find" [clause path edit-path?]
  (clause-item path
              [:span.keyword.condition "when"] (rule-ui clause path)))

(defmethodcomponent draw-clause "forget" [clause path edit-path?]
  (clause-item path
               [:span.keyword "forget"] (rule-ui clause path)))

(defmethodcomponent draw-clause "see" [clause path edit-path?]
  (clause-item path
               [:span.keyword "see"] (rule-ui clause path)))

(defmethodcomponent draw-clause "all" [clause path edit-path?]
  (clause-item path
               [:span.keyword "all"] (rule-ui clause path)))

(defmethodcomponent draw-clause "pretend" [clause path edit-path?]
  (clause-item path
               [:span.keyword "pretend"] (rule-ui clause path)))

(defmethodcomponent draw-clause "change" [clause path edit-path?]
  (let [rule (get-in @state [:program :madlibs (:ml clause)])
        placeholders (into {} (for [k (keys (:placeholders rule))]
                                [k (symbol k)]))]
    (clause-item path
     [:table
      [:tbody
       [:tr [:td.keyword "change"] [:td (rule-ui (merge clause placeholders (::new clause)) (conj path ::new))]]
       [:tr [:td.keyword "to"] [:td (rule-ui clause path)]]]])
    ))

(defmethodcomponent draw-clause "draw" [clause path edit-path?]
  (clause-item path
               [:span.keyword "draw"] (rule-ui clause path)))
(get-in @state [:program :statements])
;;*********************************************************
;; Display
;;*********************************************************


(defn editable [rule-info rule v ph path opts]
  (if (or (not= path (get-in @state [:editor :path]))
          (:no-edit opts))
    (cond
     (not v) (types/placeholder-rep ph path)
     (symbol? v) (types/ref-rep v ph path)
     :else (types/->rep rule-info rule v ph path))
    (types/->editor rule-info rule v ph path)))

(defn holder [path attrs content]
  [:span (merge attrs {:draggable "true"
                       :onDragStart (fn [e]
                                      (.dataTransfer.setData e "text" "foo")
                                      (swap! state assoc-in [:editor :drag-path] path)
                                      )
                       :onDragOver (fn [e]
                                     (.preventDefault e))
                       :onDrop (fn [e]
                                 (let [drag-path (get-in @state [:editor :drag-path])
                                       drag-value (get-in @state drag-path)
                                       var (or (when (symbol? drag-value)
                                                 drag-value)
                                               (symbol (last drag-path)))]
                                   (swap! state assoc-in drag-path (symbol var))
                                   (swap! state assoc-in path (symbol var))))
                       })
   content]
  )

(defn placeholder-ui [rule-info rule ph path opts]
  (let [path (conj path ph)
        v (get rule ph)
        id? (= "id" (get-in rule-info [:placeholders ph :type]))
        classes {:var id?
                 :ref (symbol? v)
                 :add true
                 :attr (not id?)}]
    (holder path {:classes classes}
            (editable rule-info rule v ph path opts))
    ))

(defn rule-ui [r path & [opts]]
  (let [rule-info (or (get-in @state [:program :madlibs (:ml r)])
                      (get-in @state [:program :clauses (:type r)])
                      r)
        placeholders (:placeholders rule-info)
         ]
    [:span (if-not placeholders
             (if (= :unknown (:ml r))
               [:span "Unknown: " (pr-str (:fact r))]
               (seq (:madlib rule-info)))
             (for [part (:madlib rule-info)]
               (if-let [ph (placeholders part)]
                 (placeholder-ui rule-info r part path opts)
                 part)))]
    ))

(defcomponent rules [program world]
  (let [matcher-path (get-in world [:matcher :path])
        last-seg (last matcher-path)
        editor-path (get-in world [:editor :path])
        statement-seg (get editor-path 2)]
    [:div
     [:ul#rules
      (concat
       (for [[i s] (map-indexed vector (:statements program))]
         (draw-statement s [:program :statements i]
                         (when (= last-seg i)
                           (:matcher world))
                         (when (= statement-seg i)
                           editor-path)))
       [[:li.statement {:onClick (fn []
                                   (swap! state assoc-in [:matcher :path] nil))}
         (if-not matcher-path
           (matches (:matcher @state))
           [:div.center "Add reaction"])
         ]])]
     ]))

(defn fact->map [fact]
  (if-let [ml (get-in @state [:program :madlibs (.-shape fact)])]
    (into {:ml (.-shape fact)}
          (for [[k v] (:placeholders ml)]
            [k (get fact (:order v))]))
    (into {:ml :unknown} {:fact (.-values fact)})))

(defn results [env world]
  (let [kn (:kn env)]
    [:div#results
     [:div#ui-preview]
       [:ul
        (for [fact (sort-by (comp str #(.-shape %)) (language/get-facts-compat kn :known|pretended))]
          [:li {:onContextMenu (fn []
                                 (language/add-facts (:kn @cur-env) :forgotten (.-shape fact) [fact])
                                 (language/fixpoint! (:kn @cur-env))
                                 (runtime/handle-feed cur-env [] {})
                                 )}
           [:div
            (rule-ui (fact->map fact) nil nil)]])]
     ]
    ))

(declare change-match-selection handle-submit load-page force-save)

(defcomponent matches [matcher]
  [:div#matcher
   (if-not (:type matcher)
     [:div.keyword-selector
      [:span.keyword " "]
      [:ul#clause-types
       (for [[i m] (map-indexed vector ["when" "remember" "forget" "pretend" "draw" "change"])]
         [:li {:classes {:selected (= i (:selected matcher))}
               :onClick (fn []
                          (condp = m
                            "draw" (matcher/add-node (get-in @state [:matcher :path]) {:type "draw"
                                                                                       "ui" nil})
                           (swap! state assoc-in [:matcher :type] m))
                          )}
          m]
         )]]
     [:div
      [:span.keyword (:type matcher)]
      [:div#madlib-selector
       [:div.matcher-editor-container]
       [:ul#matches
        (for [[i m] (map-indexed vector (:matches matcher))]
          [:li {:classes {:selected (= i (:selected matcher))}
                :onClick (fn []
                           (swap! state assoc-in [:matcher :selected] i)
                           (change-match-selection nil)
                           (handle-submit (.getValue instance)))} (rule-ui m nil nil)])]]])])

(defcomponent controls [env]
  [:div#controls
   [:button {:onClick (fn []
                        (let [cur (get-in @state [:editor :mode])]
                          (swap! state assoc-in [:editor :mode] (if (= :debugger cur)
                                                                  nil
                                                                  :debugger)))
                        )}
    "debugger"]
   [:button {:onClick (fn []
                        (if (:paused env)
                          (unpause cur-env)
                          (pause cur-env)))}
    (if (:paused env)
      [:span.icon.play]
      [:span.icon.pause])]])

(defn header [program]
  [:div#header
   [:h1 {:onClick (fn []
                    (pause cur-env)
                    (force-save @state)
                    (swap! aurora-state assoc :cur-page nil))}
    (:name program)]
   (controls @cur-env)])

(defn menu [menu]
  [:div#menu-shade {:onClick (fn []
                               (swap! state dissoc :menu))}
   [:ul#menu {:style {:top (:top menu)
                      :left (:left menu)}}
    (for [item (:items menu)]
      [:li {:onClick (fn []
                       (when-let [action (:action item)]
                         (action))
                       (swap! state dissoc :menu))}
       (:label item)]
      )]]
  )

(defcomponent debugger-item [flow stats i active? current?]
  (let [stats (js->clj stats)]
    [:li [:div
          {:classes {:active (= :in active?)
                     :active-out (= :out active?)
                     :current current?}}
          [:div
           [:p (condp = (type flow)
                 language/Union "U"
                 language/Index "I"
                 language/Lookup "L"
                 language/FilterMap "F") i]
           `[:table
             [:tbody
              ~@(for [[k v] flow]
                  [:tr [:td (str k)] [:td (pr-str v)]])]]
            (when (seq stats)
              `[:table
                [:tbody
                 ~@(for [[k v] stats]
                     [:tr [:td (str k)] [:td (pr-str v)]])]])
           ]]])
  )

(defcomponent debugger-path [iy cx cy y active?]
  [:path {:d (str "M 100 " iy " Q " cx " " cy " 100 " y)
                :stroke (condp = active?
                          :in "#00aaaa"
                          :out "#aa00aa"
                          true "#00aaaa"
                          "none")
                :fill "none"}]
  )

(defn debugger-middle [cur-state env node]
  (let [flows (vec (-> env :rules :node->flow))
        out-nodes (-> env :kn :node->out-nodes)
        cur-active (or node (get-in cur-state [:editor :active-flow]))
        active-ins (when-let [cur (get flows cur-active false)]
                     (set (-> cur
                              (language/flow->nodes))))
        active-outs (when-let [cur (aget out-nodes cur-active)]
                      (set cur))
        all (sort (concat active-outs active-ins [cur-active]))
        n->i (into {} (map vector all (range)))
        active-flows (for [node all]
                       [node (get flows node)])
        iy (+ 40 (* (n->i cur-active) 90))]
    [:div#debugger-middle
     [:svg {:width 100 :height (* 90 (dec (count all)))}
      (concat
       (for [in active-ins
             :let [in (n->i in)
                   y (+ 40 (* in 90))
                   diff (js/Math.abs (- iy y))
                   cx (- 100 (max 30 (min 100 (* 10 (js/Math.abs (- (n->i cur-active) in))))))
                   cy (if (> iy y)
                        (+ y (/ diff 2))
                        (+ iy (/ diff 2)))]]
         (debugger-path iy cx cy y :in)
         )
       (for [in active-outs
             :let [in (n->i in)
                   y (+ 40 (* in 90))
                   diff (js/Math.abs (- iy y))
                   cx (- 100 (max 30 (min 100 (* 10 (js/Math.abs (- (n->i cur-active) in))))))
                   cy (if (> iy y)
                        (+ y (/ diff 2))
                        (+ iy (/ diff 2)))]]
         (debugger-path iy cx cy y :out)
         )
       )]
     [:ul
      (doall
       (for [[i flow] active-flows
             :let [stats [];(aget (get-in env [:kn :node->stats]) i)
                   ]
             :let [active? (cond
                            (get active-ins i false) :in
                            (get active-outs i false) :out
                            :else nil)]]
         (debugger-item flow stats i active? (= i cur-active))
         ))]
     ]))

(defcomponent debugger-in [in node]
  [:div#debugger-facts
   [:ul
    (for [i in]
      [:li
       (rule-ui (fact->map i) nil nil)]
      )]])

(defn debugger [cur-state env]
  (let [step (get-in cur-state [:editor :debugger-step] 0)
        trace (get-in env [:kn :trace])
        [node in out] (aget trace step)]
    [:div#canvas.debugger {:tabIndex -1
                           :onKeyDown (fn [e]
                                        (println "key down")
                                        (when (= (.-keyCode e) (:right key-codes))
                                          (swap! state update-in [:editor :debugger-step] cycling-move (alength trace) inc)
                                          )
                                        (when (= (.-keyCode e) (:left key-codes))
                                          (swap! state update-in [:editor :debugger-step] cycling-move (alength trace) dec)
                                          )
                                        )}
     [:div#debugger-controls
      [:p "step: " (inc step) " of " (count trace)]
      [:button {:onClick (fn []
                           (swap! state update-in [:editor :debugger-step] cycling-move (alength trace) dec)
                           )}
       "<"]
      [:button {:onClick (fn []
                           (swap! state update-in [:editor :debugger-step] cycling-move (alength trace) inc)
                           )}
       ">"]
      ]
     (debugger-in in node)
     (debugger-middle cur-state env node)
     (debugger-in out node)
     ]))

(defn editor-ui []
  [:div#root
   (when-let [cur-menu (:menu @state)]
     (menu cur-menu))
   (header (:program @state))
   (condp = (get-in @state [:editor :mode])
     :debugger (debugger @state @cur-env)
     nil [:div#canvas
          (results @cur-env @state)
          [:div#canvas-editor
           (rules (get-in @state [:program]) @state)
           ]]
     )
   ])

(defn page-list []
  [:div#pages
   [:div#page-selector
    [:h1 "Select a page"]
    [:ul#pages-list
     (for [p (:pages @aurora-state)]
       [:li {:onClick (fn []
                        (swap! aurora-state assoc :cur-page p)
                        (load-page p)
                        )}
        p]
       )]
    [:button {:onClick (fn []
                         (let [page-count (count (:pages @aurora-state))]
                           (swap! aurora-state update-in [:pages] conj (if (> page-count 0)
                                                                         (str "New page " page-count)
                                                                         "New page")))
                         )} "Add a page"]]])

(defn root-ui []
  (if (:cur-page @aurora-state)
    (editor-ui)
    (page-list)))


;;*********************************************************
;; Render
;;*********************************************************

(def frame (.-requestAnimationFrame js/window))
(def queued? false)

(defn render! []
  (js/console.time "render!")
  (let [start (now)
        tree (root-ui)]
    (js/React.renderComponent (node tree) (dom/$ "#wrapper"))
    (when-not (dom/$ ".value-editor")
      (when-let [container (dom/$ ".value-editor-container")]
        (dom/append container (.getWrapperElement value-editor))
        (on-value-editor-show)
        (.refresh value-editor)
        (.focus value-editor)
        (.setCursor value-editor #js {:line 0})))
    (when-not (dom/$ ".matcher-editor")
      (when-let [container (dom/$ ".matcher-editor-container")]
        (dom/append container (.getWrapperElement instance))
        (.refresh instance)
        (.focus instance)))
    (when-let [rp (dom/$ "#render-perf")]
      (dom/html rp (.toFixed (- (now) start) 3)))
    (set! queued? false)
    (js/console.timeEnd "render!")
    ))

(defn queue-render []
  (when-not queued?
    (set! queued? true)
    (frame render!)))

(defn force-save [cur]
  (println "Saving: " (get-in cur [:program :name]) (count (pr-str cur)))
  (aset js/localStorage (get-in cur [:program :name]) (pr-str cur)))

(defn clear-env []
  (let [new-env (runtime/->env {})]
    (reset! cur-env @new-env)
    (runtime/run cur-env)))

(defn load-page [name]
  (let [page (aget js/localStorage name)
        page (try
               (reader/read-string page)
               (catch :default e
                 (println "got some error")
                 {:program {:name name
                            :statements []}
                  :editor {}
                  :matcher {}}))
        program (merge-with merge (:program page) {:clauses stdlib/clauses
                                                   :madlibs stdlib/madlibs})
        page (assoc page :program program)
        page (if (:statements page)
               (-> (assoc-in page [:program :name] (:name page))
                   (assoc-in [:program :statements] (:statements page))
                   (update-in [:program :madlibs] merge (:madlibs page))
                   (dissoc :name :statements :madlibs :clauses))
               page)]
    (clear-env)
    (reset! state page)))

(defn init []
  (when-let [stored (aget js/localStorage "aurora-state")]
    (reset! aurora-state (reader/read-string stored)))
  (when-let [page-to-load (:cur-page @aurora-state)]
    (load-page page-to-load))
  (queue-render)
  )


(add-watch cur-env :render (fn [_ _ _ cur]
                             (queue-render)))

(add-watch state :render (fn [_ _ _ cur]
                           (queue-render)))

(add-watch aurora-state :render (fn [_ _ _ cur]
                                  (queue-render)))


(add-watch state :compile (fn [_ _ old cur]
                            (when-not (identical? (get-in old [:program :statements]) (get-in cur [:program :statements]))
                              (println "compiling!")
                              (clauses/inject-compiled))))

(add-watch state :store (js/Cowboy.debounce 1000
                                            (fn [_ _ old cur]
                                              (force-save cur)
                                              )))

(add-watch aurora-state :store (js/Cowboy.debounce 10
                                                   (fn [_ _ old cur]
                                                     (aset js/localStorage "aurora-state" (pr-str cur))
                                                     )))


(init)

(comment
  (swap! aurora-state update-in [:pages] conj "foo")
  )
