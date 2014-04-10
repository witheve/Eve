(ns aurora.editor.fake
  (:require [aurora.editor.ReactDommy :refer [node]]
            [aurora.language.operation :as operation]
            [aurora.language.representation :as representation]
            [aurora.language.denotation :as denotation]
            [aurora.language.jsth :as jsth]
            [aurora.language.stratifier :as stratifier]
            [aurora.runtime.core :as runtime :refer [run-env pause unpause replay-last]]
            [aurora.runtime.timers]
            [aurora.runtime.ui]
            [aurora.runtime.io]
            [aurora.runtime.stdlib :as stdlib]
            [aurora.editor.types :as types]
            [aurora.editor.clauses :as clauses]
            [aurora.editor.core :refer [state cur-env aurora-state]]
            [aurora.editor.component]
            [cljs.reader :as reader]
            [aurora.editor.dom :as dom]
            [clojure.set :as set]
            [clojure.walk :as walk]
            [clojure.string :as string]
            [aurora.util.core :refer [now]])
  (:require-macros [aurora.language.macros :refer [query rule]]
                   [aurora.macros :refer [defcomponent defmethodcomponent]]))

(def key-codes {:up 38
                :down 40
                :esc 27
                :tab 9
                :enter 13})

(defn remove-index [v i]
  (vec (concat (subvec v 0 i) (subvec v (inc i)))))

(declare rule-ui matches)

(defmulti draw-statement (fn [x y path]
                           (:type x)))

(defmulti draw-clause (fn [x y path]
                        (:type x)))

(defn statement-item [path & content]
  [:li {:onContextMenu (fn [e]
                         (.stopPropagation e)
                         (swap! state update-in (butlast path) remove-index (last path))
                         )
        :onClick (fn []
                   (swap! state assoc-in [:matcher :path] path))
        }
   content])

(defmethodcomponent draw-statement "rule" [rule path matcher? edit-path?]
  (let [clauses (map-indexed vector (:clauses rule))
        when (first (filter #(= (:type (second %)) "when") clauses))
        edit-seg (get edit-path? 4)]
    (statement-item path
     (if when (draw-clause (second when) (conj path :clauses (first when)) (if (= edit-seg (first when))
                                                                                     edit-path?)))
      [:ul.sub
       (for [[i c] (filter #(not= (:type (second %)) "when") clauses)
             :let [path (conj path :clauses i)]]
         (statement-item path
          (draw-clause c path (if (= edit-seg i)
                                        edit-path?)))
         )
       (if matcher?
         [:li (matches (:matcher @state))]
         )
       ])))

(defmethodcomponent draw-statement "add" [rule path matcher? edit-path?]
  (statement-item path
   (draw-clause rule path edit-path?)))

(defmethodcomponent draw-clause "add" [clause path edit-path?]
  (rule-ui clause path))

(defmethodcomponent draw-clause "when" [clause path edit-path?]
  (do
    [:span [:span.keyword "when "] (rule-ui clause path)]))

(defmethodcomponent draw-clause "find" [clause path edit-path?]
  [:span [:span.keyword "find "] (rule-ui clause path)])

(defmethodcomponent draw-clause "forget" [clause path edit-path?]
  [:span [:span.keyword "forget "] (rule-ui clause path)])

(defmethodcomponent draw-clause "see" [clause path edit-path?]
  [:span [:span.keyword "see "] (rule-ui clause path)])

(defmethodcomponent draw-clause "all" [clause path edit-path?]
  [:span [:span.keyword "all "] (rule-ui clause path)])

(defmethodcomponent draw-clause "pretend" [clause path edit-path?]
  [:span [:span.keyword "pretend "] (rule-ui clause path)])

(defmethodcomponent draw-clause "change" [clause path edit-path?]
  (let [rule (get-in @state [:program :madlibs (:ml clause)])
        placeholders (into {} (for [k (keys (:placeholders rule))]
                                [k (symbol k)]))]
    [:table
     [:tbody
      [:tr [:td.keyword "change "] [:td (rule-ui (merge clause placeholders (::new clause)) (conj path ::new))]]
      [:tr [:td.keyword "to "] [:td (rule-ui clause path)]]]]
    ))

(defmethodcomponent draw-clause "draw" [clause path edit-path?]
  [:span [:span.keyword "draw "] (rule-ui clause path)])

;(compile-state :safe)
;(enable-console-print!)



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
        classes {:var true
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
             (seq (:madlib rule-info))
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
      (for [[i s] (map-indexed vector (:statements program))]
        (draw-statement s [:program :statements i]
                        (when (= last-seg i)
                          (:matcher world))
                        (when (= statement-seg i)
                          editor-path)))]
     (when matcher-path
       [:div.add-rule {:onClick (fn []
                                  (swap! state assoc-in [:matcher :path] nil))}
        ])]))

(defn results [env world]
  (let [kn (:kn env)]
    [:div#results
     [:ul
      (for [fact (sort-by (comp str :ml) (:now kn))]
        [:li {:onContextMenu (fn []
                               (swap! cur-env update-in [:kn] #(-> %
                                                                   (representation/retract-facts #{fact})
                                                                   (representation/tick))))}
         [:div
          (rule-ui fact nil nil)]])]
     [:div#ui-preview]
     ]
    ))

(declare change-match-selection handle-submit instance load-page force-save)

(defcomponent matches [matcher]
  [:div#matcher
   [:div.matcher-editor-container]
   [:ul#matches
    (for [[i m] (map-indexed vector (:matches matcher))]
      [:li {:classes {:selected (= i (:selected matcher))}
            :onClick (fn []
                       (swap! state assoc-in [:matcher :selected] i)
                       (change-match-selection nil)
                       (handle-submit (.getValue instance)))} (rule-ui m nil nil)])]])

(defcomponent controls [env]
  [:div#controls
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

(defn editor-ui []
  [:div#root
   (header (:program @state))
   [:div#canvas
    [:div#canvas-editor
     (rules (get-in @state [:program]) @state)
     (if (get-in @state [:matcher :path])
       [:div]
       (matches (:matcher @state)))
     ]
    (results @cur-env @state)
    ]
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
;; Value editor CodeMirror
;;*********************************************************

(def value-editor (js/CodeMirror. (fn [])))
(dom/add-class (.getWrapperElement value-editor) :value-editor)

(defn editor-state-value []
  (let [ed (:editor @state)]
    (or (:value ed)
        (get-in @state (:path ed)))))

(defn on-value-change []
  (let [cur-value (.getValue value-editor)]
    ))

(defn handle-value-submit [v]
  (let [editor (:editor @state)]
    (swap! state assoc-in (:path editor) (types/->parser (:type editor) v))
    (when-not (get-in @state [:editor :remain-open])
      (swap! state assoc :editor {})
      (.setValue value-editor ""))))

(defn undo-value-editor []
  (swap! state assoc :editor {}))

(defn on-value-editor-show []
  (if-let [v (editor-state-value)]
    (.setValue value-editor (cond
                             (symbol? v) (str "*" v)
                             (coll? v) (pr-str v)
                             :else (str v)))
    (.setValue value-editor "")))

(defn on-value-keydown [e]
  (when (= (.-keyCode e) (:tab key-codes))
    (println "ZOMG TAB KEY")
    (.preventDefault e))
  (when (= (.-keyCode e) (:esc key-codes))
    (undo-value-editor)
    (.preventDefault e))
  (when (= (.-keyCode e) (:enter key-codes))
    (swap! state assoc-in [:editor :remain-open] false)
    (handle-value-submit (.getValue value-editor))
    (.preventDefault e)))

(defn on-value-blur []
  (when (get-in @state [:editor :path])
    (handle-value-submit (.getValue value-editor)))
  )

(.on value-editor "change" (fn [] (on-value-change)))
(.on value-editor "blur" (fn [] (on-value-blur)))
(.on value-editor "keydown" (fn [_ e] (on-value-keydown e)))

;;*********************************************************
;; Matcher CodeMirror
;;*********************************************************

(def instance (js/CodeMirror. (fn [])))
(dom/add-class (.getWrapperElement instance) :matcher-editor)
(def fuzzy (.-fuzzaldrin js/window))

(def pairs {"[" #"[^\]]"
            "(" #"[^\)]"})

(def pair->mode {"[" "id"
                 "(" "attr"})

(def keywords #"^(when|find|forget|change|see|all|new|draw|pretend)")
(def key-madlibs #"^(see \[name\] as \[expression\]|all \[expression\])|new \[thing\]")

(defn tokenizer [stream]
  (let [ch (.peek stream)]
    (cond
     (pairs ch) (do
                  (.eatWhile stream (pairs ch))
                  (.next stream)
                  (pair->mode ch))
     (.match stream keywords) "keyword"
     :else (do
             (.next stream)
             ""))))

(defn aurora-mode []
  #js {:token tokenizer})

(defn parse-input [cur-value]
  (let [space-index (.indexOf cur-value " ")
        first-word (when (> space-index -1) (.substring cur-value 0 space-index))
        kw (and first-word (re-seq keywords first-word))
        to-match (if kw
                   (.substring cur-value space-index)
                   cur-value)]
    {:keyword (when kw first-word)
     :phrase (.trim to-match)}))

(defn on-cm-change []
  (let [cur-value (.getValue instance)
        {:keys [keyword phrase]} (parse-input cur-value)
        matcher (:matcher @state)
        same? (= cur-value (:last-selected matcher))
        search (if same?
                 (-> (:last-text matcher)
                     (parse-input)
                     (:phrase))
                 (.trim phrase))
        candidates (if-not true;keyword
                     (concat ["when" "find" "new" "see (name) as (expression)" "all (things)" "forget"] (vals (get-in @state [:program :madlibs])))
                     (vals (get-in @state [:program :madlibs])))]
    (when-not same?
      (swap! state assoc :matcher (dissoc matcher :last-text :last-selected :selected)))
    (if (= search "")
      (swap! state assoc-in [:matcher :matches] (array))
      (swap! state assoc-in [:matcher :matches]
             (fuzzy (to-array candidates) search #js {:maxResults 4
                                                      :keyfn #(:madlib-str %)})))))

(defn circular-move [cur dir total]
  (if-not cur
    0
    (let [moved (if (= :up dir)
                  (dec cur)
                  (inc cur))]
      (cond
       (< moved 0) (dec total)
       (>= moved total) 0
       :else moved))))

(defn change-match-selection [dir]
  (let [matcher (:matcher @state)
        moved (if dir
                (circular-move (:selected matcher) dir (count (:matches matcher)))
                (:selected matcher))
        cur-value (or (:last-text matcher) (.getValue instance))
        {:keys [keyword phrase]} (parse-input cur-value)
        selected-item (:madlib-str (aget (:matches matcher) moved))
        neue (assoc matcher :selected moved)
        final-text (when selected-item
                     (if keyword
                       (str keyword " " selected-item)
                       selected-item))
        neue (if selected-item
               (assoc neue :last-selected final-text :last-text cur-value)
               neue)]
    (when selected-item
      (.setValue instance final-text)
      (.setCursor instance #js {:line 0 :ch nil})
      )
    (swap! state assoc :matcher neue)
    )
  )

(defn explode-madlib [phrase]
  (let [split (->> (string/split phrase "]")
                  (mapcat #(let [[t ph] (string/split % "[")
                                 final [ph]]
                             (cond
                              (and ph
                                   (not= t "")
                                   (not= ph "")) [t final]
                              (not= t "") [t]
                              (and ph (not= ph "")) [final]
                              :else nil))))
        placeholders (into {}
                           (map #(conj % {:order %2})
                                (filter #(vector? %) split) (range)))]
    {:placeholders placeholders
     :madlib (vec (for [x split]
                    (if (vector? x)
                      (first x)
                      x)))}
    ))

(defn create-madlib [phrase]
  (let [id (operation/new-id)]
    (swap! state assoc-in [:program :madlibs id]
           (merge (explode-madlib phrase)
                  {:madlib-str phrase}))
    id))

(defn handle-submit [v]
  (when (and v (not= "" (.trim v)))
    (let [{:keys [keyword phrase]} (parse-input v)
          lookup (into {} (for [[k v] (get-in @state [:program :madlibs])]
                            [(:madlib-str v) k]
                            ))
          id (when keyword
               (let [clause-info (get-in @state [:program :clauses keyword])]
                        (if (:is-phrase clause-info)
                          keyword)))
          id (if id
               id
               (if-let [found (lookup phrase)]
                 found
                 (create-madlib phrase)))
          cur-path (get-in @state [:matcher :path])
          node {:type (if keyword
                        keyword
                        "add")
                :ml id}
          node (if (and keyword (not cur-path))
                 {:type "rule"
                  :clauses [node]}
                 node)]
      (if-not cur-path
        (swap! state update-in [:program :statements] conj node)
        (swap! state update-in (conj cur-path :clauses) conj node))
      (when (= (:type node) "rule")
        (swap! state assoc-in [:matcher :path] [:program :statements (-> (get-in @state [:program :statements])
                                                                (count)
                                                                (dec))])
        )
      (.setValue instance "")
      )))

(defn on-cm-keydown [e]
  (when (= (.-keyCode e) (:up key-codes))
    (change-match-selection :up)
    (.preventDefault e))
  (when (= (.-keyCode e) (:down key-codes))
    (change-match-selection :down)
    (.preventDefault e))
  (when (= (.-keyCode e) (:enter key-codes))
    (handle-submit (.getValue instance))
    (.preventDefault e)))

(js/CodeMirror.defineMode "aurora" aurora-mode)
(.setOption instance "mode" "aurora")
(.on instance "change" (fn [] (on-cm-change)))
(.on instance "keydown" (fn [_ e] (on-cm-keydown e)))

;;*********************************************************
;; Render
;;*********************************************************

(def frame (.-requestAnimationFrame js/window))
(def queued? false)

(defn render! []
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
    ))

(defn queue-render []
  (when-not queued?
    (set! queued? true)
    (frame render!)))

(defn force-save [cur]
  (println "Saving: " (get-in cur [:program :name]) (count (pr-str cur)))
  (aset js/localStorage (get-in cur [:program :name]) (pr-str cur)))

(defn clear-env []
  (let [new-env (runtime/->env {:cleanup-rules (vec (concat runtime/io-cleanup-rules
                                        runtime/timer-cleanup-rules
                                        runtime/ui-cleanup-rules))})]
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
