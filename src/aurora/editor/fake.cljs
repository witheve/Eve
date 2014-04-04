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
            [cljs.reader :as reader]
            [aurora.editor.dom :as dom]
            [clojure.set :as set]
            [clojure.walk :as walk]
            [clojure.string :as string]
            [aurora.util.core :refer [now]])
  (:require-macros [aurora.language.macros :refer [query rule]]))

(def key-codes {:up 38
                :down 40
                :esc 27
                :tab 9
                :enter 13})

(defn remove-index [v i]
  (vec (concat (subvec v 0 i) (subvec v (inc i)))))

(def cur-env (atom nil))

(def aurora-state (atom {:cur-page nil
                         :pages []}))

(def std-lib {:clauses {
                        "draw" {:madlib ["ui"]
                                :madlib-str "ui"
                                :is-phrase true
                                :placeholders {"ui" {:order 0 :type "ui" "type" "ui"}}}
                        }
              :madlibs {:aurora/time {:madlib ["the current time is ", "time"]
                                      :madlib-str "the current time is [time]"
                                      :placeholders {"time" {:order 0
                                                             :type "time"}}}
                        :aurora/refresh {:madlib ["refresh the time after ", "waiting time"]
                                         :madlib-str "refresh the time after [waiting time]"
                                         :placeholders {"waiting time" {:order 0
                                                                        :type "duration"}}}
                        :timers/tick {:madlib ["timer", " ticked at ", "time"]
                                      :madlib-str "[timer] ticked at [time]"
                                      :placeholders {"timer" {:order 0
                                                              :type "id"}
                                                     "time" {:order 1
                                                             :type "time"}}}
                        :timers/wait {:madlib ["tick ", "timer", " after waiting ", "time"]
                                      :madlib-str "tick [timer] after waiting [time]"
                                      :placeholders {"timer" {:order 0
                                                              :type "id"}
                                                     "time" {:order 1
                                                             :type "duration"}}}
                        :ui/elem {:madlib ["id", " is a ", "tag", " HTML element"]
                                  :madlib-str "[id] is a [tag] HTML element"
                                  :placeholders {"id" {:order 0
                                                       :type "id"}
                                                 "tag" {:order 1
                                                        :type "html tag"}}}
                        :ui/attr {:madlib ["id", " has a ", "attr", " of ", "value"]
                                  :madlib-str "[id] has a [attr] of [value]"
                                  :placeholders {"id" {:order 0
                                                       :type "id"}
                                                 "attr" {:order 1
                                                         :type "html attribute"}
                                                 "value" {:order 2}}}
                        :ui/style {:madlib ["id", " has a ", "attr", " style of ", "value"]
                                   :madlib-str "[id] has a [attr] style of [value]"
                                   :placeholders {"id" {:order 0
                                                        :type "id"}
                                                  "attr" {:order 1
                                                          :type "html style"}
                                                  "value" {:order 2}}}
                        :ui/text {:madlib ["id", " is the text ", "text"]
                                  :madlib-str "[id] is the text [text]"
                                  :placeholders {"id" {:order 0
                                                       :type "id"}
                                                 "text" {:order 1
                                                         :type "string"}}}
                        :ui/child {:madlib ["id", " is the parent of ", "child", " at position ", "pos"]
                                   :madlib-str "[id] is the parent of [child] at position [pos]"
                                   :placeholders {"id" {:order 0
                                                        :type "id"}
                                                  "child" {:order 1
                                                           :type "id"}
                                                  "pos" {:order 2
                                                         :type "number"}}}
                        :ui/event-listener {:madlib ["listen for ", "event", " events on ", "id"]
                                            :madlib-str "listen for [event] events on [id]"
                                            :placeholders {"event" {:order 0
                                                                    :type "html event"}
                                                           "id" {:order 1
                                                                 :type "id"}}}
                        :ui/onClick {:madlib ["id", " is clicked"]
                                     :madlib-str "[id] is clicked"
                                     :placeholders {"id" {:order 0
                                                          :type "id"}}}
                        :ui/onDoubleClick {:madlib ["id", " was double clicked raising ", "event", " on ", "entity"]
                                           :madlib-str "[id] was double clicked raising [event] on [entity]"
                                           :placeholders {"id" {:order 0
                                                                :type "id"}
                                                          "event" {:order 1
                                                                   :type "string"}
                                                          "entity" {:order 2
                                                                    :type "id"}}}
                        :ui/onKeyDown {:madlib ["the ", "keyCode", " key was pressed in " "id" " on " "entity"]
                                      :madlib-str "the [keyCode] key was pressed in [id]"
                                      :placeholders {"id" {:order 0
                                                           :type "id"}
                                                     "keyCode" {:order 1
                                                              :type "number"}
                                                     "entity" {:order 2
                                                               :type "string"}}}

                        :ui/onBlur {:madlib ["id", " is blurred with ", "entity"]
                                     :madlib-str "[id] is blurred"
                                     :placeholders {"id" {:order 0
                                                          :type "id"}
                                                    "entity" {:order 1
                                                              :type "string"}}}
                        :ui/onChange {:madlib ["id", " changed to ", "value", " raising ", "event", " on ", "entity"]
                                      :madlib-str "[id] changed to [value] raising [event] on [entity]"
                                      :placeholders {"id" {:order 0
                                                           :type "id"}
                                                     "value" {:order 1
                                                              :type "string"}
                                                     "event" {:order 2
                                                              :type "string"}
                                                     "entity" {:order 3
                                                               :type "id"}}}
                        :http/get {:madlib ["fetch " "url" " and call it ", "id"]
                                   :madlib-str "fetch [url] and call it [id]"
                                   :placeholders {"url" {:order 0
                                                         :type "url"}
                                                  "id" {:order 1
                                                        :type "string"}}}
                        :http/response {:madlib ["got url " "content" " named " "id" " at " "time"]
                                     :madlib-str "got url [content] named [id] at [time]"
                                     :placeholders {"content" {:order 0
                                                               :type "string"}
                                                    "id" {:order 1
                                                          :type "string"}
                                                    "time" {:order 2
                                                            :type "time"}}}
                        } })

(def state (atom {:name "Incrementer"
                  :editor {}
                  :matcher {}
                  :statements []}))

(set! js/cljs.core.hiccup js/aurora.runtime.ui.hiccup->facts)

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

(defmethod draw-statement "rule" [rule world path]
  (let [clauses (map-indexed vector (:clauses rule))
        when (first (filter #(= (:type (second %)) "when") clauses))]
    (statement-item path
     (if when (draw-clause (second when) world (conj path :clauses (first when))))
      [:ul.sub
       (for [[i c] (filter #(not= (:type (second %)) "when") clauses)
             :let [path (conj path :clauses i)]]
         (statement-item path
          (draw-clause c world path))
         )
       (if (= (get-in world [:matcher :path]) path)
         [:li (matches (:matcher @state))]
         )
       ])))

(defmethod draw-statement "add" [rule world path]
  (statement-item path
   (draw-clause rule world path)))

(defmethod draw-clause "add" [clause world path]
  (rule-ui clause world path))

(defmethod draw-clause "when" [clause world path]
  [:span [:span.keyword "when "] (rule-ui clause world path)])

(defmethod draw-clause "find" [clause world path]
  [:span [:span.keyword "find "] (rule-ui clause world path)])

(defmethod draw-clause "forget" [clause world path]
  [:span [:span.keyword "forget "] (rule-ui clause world path)])

(defmethod draw-clause "see" [clause world path]
  [:span [:span.keyword "see "] (rule-ui clause world path)])

(defmethod draw-clause "all" [clause world path]
  [:span [:span.keyword "all "] (rule-ui clause world path)])

(defmethod draw-clause "change" [clause world path]
  (let [rule (get-in @state [:madlibs (:ml clause)])
        placeholders (into {} (for [k (keys (:placeholders rule))]
                                [k (symbol k)]))]
    [:table
     [:tbody
      [:tr [:td.keyword "change "] [:td (rule-ui (merge clause placeholders (::new clause)) world (conj path ::new))]]
      [:tr [:td.keyword "to "] [:td (rule-ui clause world path)]]]]
    ))

(defmethod draw-clause "draw" [clause world path]
  [:span [:span.keyword "draw "] (rule-ui clause world path)])

(defmulti compile-clause (fn [clause world]
                           (:type clause)))

(defmethod compile-clause "when" [clause world]
  (compile-clause (assoc clause :type "find") world))

(defmethod compile-clause "find" [clause world]
  [(denotation/Filter. (dissoc clause :type))])

(defmethod compile-clause "add" [clause world]
  [(denotation/Assert. (dissoc clause :type))])


(defmethod compile-clause "all" [clause world]
  (let [things (get clause "things")]
    [(denotation/AssertMany. (if (string? things)
                               (reader/read-string things)
                               (or things [])))]))

(defmethod compile-clause "forget" [clause world]
  [(denotation/Retract. (dissoc clause :type))])

(defmethod compile-clause "see" [clause world]
  (let [exp (get clause "expression")
        exp (if (string? exp)
              (reader/read-string exp)
              exp)
        final (list '= (get clause "name") exp)]
    [(denotation/Let. (get clause "name" 'x) exp)]))

(defmethod compile-clause "change" [clause world]
  (let [rule (get-in @state [:madlibs (:ml clause)])
        placeholders (into {} (for [k (keys (:placeholders rule))]
                                [k (symbol k)]))
        new-bound-syms (::new clause)
        clause (dissoc clause :type ::new)
        syms (into {} (for [k (keys (dissoc clause :ml))]
                        [k (gensym k)]))
        sees (for [[k v] (dissoc clause :ml)]
               (denotation/Let. (syms k) (if (string? v)
                                           (reader/read-string v)
                                           v)))
        jsd (into clause (for [[k v] (dissoc clause :ml)]
                           [k (syms k)]))
        ]
    (conj sees
          (denotation/Filter. (merge clause placeholders))
          (denotation/Retract. (merge clause placeholders new-bound-syms))
          (denotation/Assert. (merge placeholders clause new-bound-syms jsd)))
    )
  )

(defmethod compile-clause "draw" [clause world]
  (let [ui (get clause "ui")
        ui-facts (try
                   (reader/read-string ui)
                   (catch :default e))]
    [(denotation/AssertMany. (if-not ui-facts
                               []
                               `(hiccup ~ui-facts)))]
    ))

(defn compile-rule* [r world]
  (mapcat compile-clause (:clauses r)))

(defn compile-rule [r world]
  (denotation/clauses->rule (vec (compile-rule* r world))))

(defn compile-fact [f world]
  (dissoc f :type))

(defn compile-statements [statements world no-rule]
  (let [rules (filter #(= (:type %) "rule") statements)
        facts (filter #(not= (:type %) "rule") statements)]
    {:rules (doall (for [r rules]
                     (if-not no-rule
                       (compile-rule r world)
                       (compile-rule* r world))))
     :facts (doall (for [f facts]
                     (compile-fact f world)))}))

(defn compile-state [& [no-rule]]
  (let [start (now)
        res (compile-statements (:statements @state) @state no-rule)]
    (when-let [rp (dom/$ "#compile-perf")]
      (dom/html rp (.toFixed (- (now) start) 3)))
    res))

(defn inject-compiled []
  (let [comped (compile-state)
        tick-rules (stratifier/strata->ruleset (stratifier/stratify (:rules comped)))
        paused? (:paused @cur-env)]
    (pause cur-env)
    (swap! cur-env assoc :tick-rules tick-rules)
    (replay-last cur-env (set (:facts comped)) 1)
    (when-not paused?
      (unpause cur-env))))

(compile-state :safe)

;(enable-console-print!)



;;*********************************************************
;; Type editors and representations
;;*********************************************************

(defmulti ->editor (fn [rule-info _ _ ph _]
                     (get-in rule-info [:placeholders ph :type])))

(defmulti ->rep (fn [rule-info _ _ ph _]
                  (get-in rule-info [:placeholders ph :type])))

(defmulti ->parser (fn [type v]
                     type))

(defn set-editing [path]
  (fn [e]
    (.preventDefault e)
    (.stopPropagation e)
    (when (= (first path) :statements)
      (swap! state assoc-in [:editor :paused?] (:paused @cur-env))
      (swap! state assoc-in [:editor :prev-kn] (-> @cur-env :kn :prev))
      (swap! state update-in [:editor] merge {:path path
                                              :value nil
                                              :remain-open false}))))

(defn default-parser [v]
  (cond
   (= "" v) nil
   (= "*" (first v)) (symbol (subs v 1))
   (not (re-seq #"[^\d.]" v)) (reader/read-string v)
   :else v))

(defn placeholder-rep [ph path]
  [:span {:onClick (set-editing path)
          :classes {:placeholder true}}
     ph])

(defn ref-rep [v ph path]
  [:span {:onClick (set-editing path)
          :classes {:value true}}
   (str v)])

(defmethod ->rep :default [rule-info rule v ph path]
  [:span {:onClick (set-editing path)
          :classes {:value true}}
     (cond
      (string? v) (if (> (.-length v) 100)
                    (str (subs v 0 100) "...")
                    v)
      (symbol? v) (str v)
      (vector? v) v
      (nil? v) v
      :else (str v))])

(defmethod ->editor :default []
  [:div.value-editor-container {:onClick (fn [e]
                                           (.preventDefault e)
                                           (.stopPropagation e))}])

(defmethod ->parser :default [_ v]
  (default-parser v))

(defmethod ->rep "duration" [rule-info rule v ph path]
  [:span {:onClick (set-editing path)}
   (cond
    (> v 60000) (str (/ v 60000) " minutes")
    (= v 60000) (str "1 minute")
    (> v 1000) (str (/ v 1000) " seconds")
    (= v 1000) (str "1 second")
    :else (str v " milliseconds"))])

(defmethod ->editor "duration" [rule-info rule v ph path]
  (let [[v selected] (cond
                      (>= v 60000) [(/ v 60000) "minutes"]
                      (>= v 1000) [(/ v 1000) "seconds"]
                      (or (nil? v) (= 0 v)) [1 "seconds"]
                      :else [v "milliseconds"])]
    (swap! state update-in [:editor] merge {:remain-open true
                                            :type "duration"
                                            :value v})
    [:span
     [:div.value-editor-container]
     [:select#duration-unit {:defaultValue selected}
      [:option {:value "minutes"} "minutes"]
      [:option {:value "seconds"} "seconds"]
      [:option {:value "milliseconds"} "milliseconds"]]
     ]))

(defmethod ->parser "duration" [_ v]
  (let [input (dom/$ "#duration-unit")
        unit (.-value (aget (.-options input) (.-selectedIndex input)))
        v (js/parseInt v)]
    (condp = unit
      "minutes" (* 60000 v)
      "seconds" (* 1000 v)
      "milliseconds" v)))


(defmethod ->rep "ui" [rule-info rule v ph path]
  (let [structure (try
                    (reader/read-string v)
                    (catch :default e))
        walked (walk/prewalk (fn [x]
                               (if-not (symbol? x)
                                 x
                                 [:span.ref (str x)])
                               )
                             structure)]
    [:span.ui-rep {:onClick (set-editing path)}
     walked
     ]))


;;*********************************************************
;; Display
;;*********************************************************




(defn editable [rule-info rule v ph path opts]
  (if (or (not= path (get-in @state [:editor :path]))
          (:no-edit opts))
    (cond
     (not v) (placeholder-rep ph path)
     (symbol? v) (ref-rep v ph path)
     :else (->rep rule-info rule v ph path))
    (->editor rule-info rule v ph path)))

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

(defn rule-ui [r world path & [opts]]
  (let [rule-info (if world
                    (or (get-in world [:madlibs (:ml r)])
                        (get-in world [:clauses (:type r)])
                        r)
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


(defn rules [rs world]
  [:ul#rules
   (for [[i r] (map-indexed vector rs)]
     (draw-statement r world [:statements i]))
   (when (get-in @state [:matcher :path])
     [:li.add-rule {:onClick (fn []
                               (swap! state assoc-in [:matcher :path] nil))}
      ])])

(defn results [env world]
  (let [kn (:kn env)]
    [:div#results
     [:ul
      (for [fact (sort-by (comp str :ml) (:prev kn))]
        [:li {:onContextMenu (fn []
                               (swap! cur-env update-in [:kn] #(-> %
                                                                   (representation/retract-facts #{fact})
                                                                   (representation/tick))))}
         [:div
          (rule-ui fact world nil)]])]
     [:div#ui-preview]
     ]
    ))

(declare change-match-selection handle-submit instance load-page force-save)

(defn matches [matcher]
  [:div#matcher
   [:div.matcher-editor-container]
   [:ul#matches
    (for [[i m] (map-indexed vector (:matches matcher))]
      [:li {:classes {:selected (= i (:selected matcher))}
            :onClick (fn []
                       (swap! state assoc-in [:matcher :selected] i)
                       (change-match-selection nil)
                       (handle-submit (.getValue instance)))} (rule-ui m nil nil)])]])

(defn controls [env]
  [:div#controls
   [:button {:onClick (fn []
                        (if (:paused env)
                          (unpause cur-env)
                          (pause cur-env)))}
    (if (:paused env)
      [:span.icon.play]
      [:span.icon.pause])]])

(defn header []
  [:div#header
   [:h1 {:onClick (fn []
                    (pause cur-env)
                    (force-save @state)
                    (swap! aurora-state assoc :cur-page nil))}
    (:name @state)]
   (controls @cur-env)])

(defn editor-ui []
  (println "editor")
  [:div#root
   (header)
   [:div#canvas
    [:div#canvas-editor
     (rules (:statements @state) @state)
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
                        (println p)
                        (swap! aurora-state assoc :cur-page p)
                        (load-page p)
                        )}
        p]
       )]]])

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
    (swap! state assoc-in (:path editor) (->parser (:type editor) v))
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

(def keywords #"^(when|find|forget|change|see|all|new|draw)")
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
                     (concat ["when" "find" "new" "see (name) as (expression)" "all (things)" "forget"] (vals (:madlibs @state)))
                     (vals (:madlibs @state)))]
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
    (swap! state assoc-in [:madlibs id]
           (merge (explode-madlib phrase)
                  {:madlib-str phrase}))
    id))

(defn handle-submit [v]
  (when (and v (not= "" (.trim v)))
    (let [{:keys [keyword phrase]} (parse-input v)
          lookup (into {} (for [[k v] (:madlibs @state)]
                            [(:madlib-str v) k]
                            ))
          id (when keyword
               (let [clause-info (get-in @state [:clauses keyword])]
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
        (swap! state update-in [:statements] conj node)
        (swap! state update-in (conj cur-path :clauses) conj node))
      (when (= (:type node) "rule")
        (swap! state assoc-in [:matcher :path] [:statements (-> (:statements @state)
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
  (println "Saving: " (:name cur) (count (pr-str cur)))
  (aset js/localStorage (:name cur) (pr-str cur)))

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
                 {:name name
                  :editor {}
                  :matcher {}
                  :statements []}))
        page (merge-with merge page std-lib)]
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
                            (when-not (identical? (:statements old) (:statements cur))
                              (inject-compiled))))

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
  (swap! aurora-state update-in [:pages] conj "foo"))
