(ns aurora.editor.fake
  (:require [aurora.editor.ReactDommy :refer [node]]
            [aurora.compiler.compiler :as compiler]
            [aurora.compiler.datalog :as datalog]
            [aurora.runtime.core :as runtime :refer [run-env pause unpause replay-last]]
            [aurora.runtime.timers]
            [aurora.runtime.ui]
            [aurora.runtime.io]
            [cljs.reader :as reader]
            [aurora.editor.dom :as dom]
            [clojure.set :as set]
            [clojure.string :as string])
  (:require-macros [aurora.compiler.datalog :refer [query rule]]))

(defn remove-index [v i]
  (vec (concat (subvec v 0 i) (subvec v (inc i)))))

;; {:type :rule
;;  :clauses [{:type :when }
;;            {:type :find}
;;            {:type :let}
;;            {:type :guard}
;;            {:type :add}
;;            {:type :replace}
;;            {:type :remove}
;;            ]}

(def cur-env (run-env {:cleanup-rules (concat runtime/io-cleanup-rules runtime/timer-cleanup-rules runtime/ui-cleanup-rules)}))

(def state (atom {:madlibs {:timers/tick "[timer] ticked at (time)"
                            :timers/wait "Tick [timer] after waiting (time)"
                            :ui/elem "[id] is a (tag) HTML element"
                            :ui/attr "[id] has a (attr) of (value)"
                            :ui/style "[id] has a (attr) style of (value)"
                            :ui/text "[id] is the text (text)"
                            :ui/child "[id] is the parent of (child) at position (pos)"
                            :ui/event-listener "Listen for (event) events on [id]"
                            :ui/onClick "[id] was clicked raising (event) on (entity)"
                            :ui/onDoubleClick "[id] was double clicked raising (event) on (entity)"
                            :ui/onChange "[id] changed to (value) raising (event) on (entity)"
                            "see" "(name) as (expression)"
                            "all" "(things)"
                            :ui/draw "Draw [thing] as (ui)"}
                  :editor {}
                  :matcher {}
                  :statements (or [] [{:type :add
                                      :ml :timers/tick
                                      "timer" "timer"
                                      "time" 0}
                                     {:type :rule
                                      :clauses [{:type :when
                                                 :ml :timers/tick
                                                 "timer" "timer"}
                                                {:type :add
                                                 :ml :timers/wait
                                                 "timer" "timer"
                                                 "time" 1000}]}
                                     {:type :rule
                                      :clauses [{:type :when
                                                 :ml :timers/tick
                                                 "timer" "timer"
                                                 "time" 'time}
                                                {:type :add
                                                 :ml :ui/draw
                                                 "thing" "clock"
                                                 "ui" 'time}]}])
                  }))

(set! js/cljs.core.hiccup js/aurora.runtime.ui.hiccup->facts)

(defmulti draw-statement (fn [x y path]
                           (:type x)))

(defn statement-item [path & content]
  [:li {:onContextMenu (fn [e]
                         (.stopPropagation e)
                         (swap! state update-in (butlast path) remove-index (last path))
                         )}
   content])

(defmethod draw-statement :rule [rule world path]
  (let [clauses (map-indexed vector (:clauses rule))
        when (first (filter #(= (:type (second %)) :when) clauses))]
    (statement-item path
     (if when (draw-clause (second when) world (conj path :clauses (first when))))
      [:ul.sub
       (for [[i c] (filter #(not= (:type (second %)) :when) clauses)
             :let [path (conj path :clauses i)]]
         (statement-item path
          (draw-clause c world path))
         )
       (if (= (get-in world [:matcher :path]) path)
         [:li (matches (:matcher @state))]
         [:li {:onClick (fn []
                          (swap! state assoc-in [:matcher :path] path))}
          "+"])
       ])))

(defmethod draw-statement :add [rule world path]
  (statement-item path
   (draw-clause rule world path)))

(defmulti draw-clause (fn [x y path]
                        (:type x)))

(defmethod draw-clause :add [clause world path]
  (rule-ui clause world path))

(defmethod draw-clause :when [clause world path]
  [:span [:span.keyword "when "] (rule-ui clause world path)])

(defmethod draw-clause :find [clause world path]
  [:span [:span.keyword "find "] (rule-ui clause world path)])

(defmethod draw-clause :forget [clause world path]
  [:span [:span.keyword "forget "] (rule-ui clause world path)])

(defmethod draw-clause :see [clause world path]
  [:span [:span.keyword "see "] (rule-ui clause world path)])

(defmethod draw-clause :all [clause world path]
  [:span [:span.keyword "all "] (rule-ui clause world path)])

(defmulti compile-clause (fn [clause world]
                           (:type clause)))

(defmethod compile-clause :when [clause world]
  (compile-clause (assoc clause :type :find) world))

(defmethod compile-clause :find [clause world]
  (dissoc clause :type))

(defmethod compile-clause :add [clause world]
  (list '+ (dissoc clause :type)))

(defmethod compile-clause :all [clause world]
  (let [things (get clause "things")]
    (list '+s (if (string? things)
                (reader/read-string things)
                (or things [])))))

(defmethod compile-clause :forget [clause world]
  (list '- (dissoc clause :type)))

(defmethod compile-clause :see [clause world]
  (let [exp (get clause "expression")
        exp (if (string? exp)
              (reader/read-string exp)
              exp)
        final (list '= (get clause "name") exp)]
    (println final)
    (list '= (get clause "name" 'x) exp)))

(defmethod compile-clause :update [])

(defn compile-rule* [r world]
  (mapv compile-clause (:clauses r)))

(defn compile-rule [r world]
  (datalog/macroless-rule (compile-rule* r world)))

(defn compile-fact [f world]
  (dissoc f :type))

(defn compile-statements [statements world no-rule]
  (let [rules (filter #(= (:type %) :rule) statements)
        facts (filter #(not= (:type %) :rule) statements)]
    {:rules (for [r rules]
              (if-not no-rule
                (compile-rule r world)
                (compile-rule* r world)))
     :facts (for [f facts]
              (compile-fact f world))}))

(defn compile-state [& [no-rule]]
  (compile-statements (:statements @state) @state no-rule))

(defn inject-compiled []
  (let [comped (compile-state)
        tick-rules (datalog/chain (:rules comped))
        paused? (:paused @cur-env)]
    (pause cur-env)
    (swap! cur-env assoc :tick-rules tick-rules)
    (replay-last cur-env (set (:facts comped)) 1)
    (when-not paused?
      (unpause cur-env))))

;(enable-console-print!)
(inject-compiled)

(defn default-parser [v]
  (cond
   (= "*" (first v)) (symbol (subs v 1))
   (not (re-seq #"[^\d.]" v)) (reader/read-string v)
   :else v))

(defn set-editing [path]
  (fn []
    (when (= (first path) :statements)
      (swap! state assoc-in [:editor :paused?] (:paused @cur-env))
      (swap! state assoc-in [:editor :prev-kn] (-> @cur-env :kn :old))
      (pause cur-env)
      (swap! state assoc-in [:editor :path] path))))

(defn editable [rule v path]
  (if-not (= path (get-in @state [:editor :path]))
    [:span.value {:onClick (set-editing path)}
     (cond
      (symbol? v) (str v)
      (vector? v) v
      (nil? v) v
      :else (str v))]
    (let [rule-info (get-in @state [:madlibs (:ml rule)])]
      [:input {:onChange (fn [e]
                           (let [v (.-target.value e)
                                 parser (or (get-in rule-info [(last path) :parser]) default-parser)]
                             (swap! state assoc-in path (parser v))))
               :onKeyDown (fn [e]
                            (when (= (:enter key-codes) (.-keyCode e))
                              (.target.blur e)))
               :value (cond
                       (symbol? v) (str "*" v)
                       (coll? v) (pr-str v)
                       :else (str v))
               :onBlur (fn []
                         (when (= v "")
                           )
                         (when-not (get-in @state [:editor :pasued?])
                           (unpause cur-env))
                         (swap! state assoc :editor {}))}])))

(defn holder [path attrs content]
  [:span (merge attrs {:draggable "true"
                       :onDragStart (fn [e]
                                      (.dataTransfer.setData e "text" "foo")
                                      (println "dragging: " path)
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
                                 (println "dropped!" drag-path path)
                                   (swap! state assoc-in drag-path (symbol var))
                                   (swap! state assoc-in path (symbol var))))
                       })
   content]
  )

(defn placeholder-ui [rule ph path]
  (let [[full-ph ph ph2] ph
        ph (or ph ph2)
        id? (= (first full-ph) "[")
        attr? (= (first full-ph) "(")
        path (conj path ph)
        name ph
        v (get rule name)
        v-rep (when-let [v (get rule name)]
                (cond
                 (symbol? v) (str v)
                 (vector? v) v
                 :else (str v)))
        classes {:var true
                 :ref (symbol? v)
                 :attr attr?}]
    (cond
     (or (not v-rep)
         (= v name)) (if-not (= path (get-in @state [:editor :path]))
                       (holder path
                               {:classes (assoc classes :add true)
                                :onClick (set-editing path)}
                               [:span.placeholder
                                name])
                       [:span {:classes (assoc classes :add true)}
                        (editable rule v path)])
     (and id? v
          (string? v)) (holder path
                               {:classes (assoc classes :add true)}
                               (editable rule v path))
     (symbol? v) (holder path {:classes (assoc classes :add true)}
                         (editable rule v path))
     :else (holder path {:classes (assoc classes :add true)}
                   (editable rule v path)))
    ))

(defn rule-ui [r world path]
  (let [ml (if world
             (get-in world [:madlibs (:ml r)])
             r)
        ml (or ml "unknown: " (pr-str r))
        placeholders (vec (re-seq #"\[(.+?)\]|\((.+?)\)" ml))
        split (string/split ml #"\[.+?\]|\(.+?\)")
        split (if-not (seq split)
                [""]
                split)]
     `[:span ~@(mapcat (fn [i cur]
                         (let [ph (get placeholders i)]
                           (if-not ph
                             [cur]
                             [cur (placeholder-ui r ph path)]))) (range) split)]
    ))


(defn rules [rs world]
  [:ul#rules
   (for [[i r] (map-indexed vector rs)]
     (draw-statement r world [:statements i]))
   (when (get-in @state [:matcher :path])
     [:li {:onClick (fn []
                      (swap! state assoc-in [:matcher :path] nil))}
      "+"])])

(defn results [env world]
  (let [kn (:kn env)]
    [:div#results
     [:button {:onClick (fn []
                          (if (:paused env)
                            (unpause cur-env)
                            (pause cur-env)))}
      (if (:paused env)
        "unpause"
        "pause")]
     [:h2 "ui:"]
     [:div#ui-preview]
     [:h2 "facts:"]
     [:ul
      (for [fact (sort-by (comp str :ml) (:old kn))]
        [:li (rule-ui fact world)])]
     ]
    ))

(defn matches [matcher]
  [:div#matcher
   [:div.matcher-editor-container]
   [:ul#matches
    (for [[i m] (map-indexed vector (:matches matcher))]
      [:li {:classes {:selected (= i (:selected matcher))}
            :onClick (fn []
                       (swap! state assoc-in [:matcher :selected] i)
                       (change-match-selection nil)
                       (handle-submit (.getValue instance)))} (rule-ui m)])]])

(defn root-ui []
  [:div#root
   (rules (:statements @state) @state)
   (when-not (get-in @state [:matcher :path])
     (matches (:matcher @state)))
   (results @cur-env @state)
   ])

;;*********************************************************
;; CodeMirror
;;*********************************************************

(def instance (js/CodeMirror. (fn [])))
(dom/add-class (.getWrapperElement instance) :matcher-editor)
(def fuzzy (.-fuzzaldrin js/window))

(def pairs {"[" #"[^\]]"
            "(" #"[^\)]"})

(def pair->mode {"[" "id"
                 "(" "attr"})

(def keywords #"when|find|new|see|all|forget")

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
        candidates (if-not keyword
                     (concat ["when" "find" "new" "see (name) as (expression)" "all (things)" "forget"] (sort (vals (:madlibs @state))))
                     (sort (vals (:madlibs @state))))]
    (when-not same?
      (swap! state assoc :matcher (dissoc matcher :last-text :last-selected :selected)))
    (swap! state assoc-in [:matcher :matches]
           (fuzzy (to-array candidates) search))))

(def key-codes {:up 38
                :down 40
                :enter 13})


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
        selected-item (aget (:matches matcher) moved)
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

(defn handle-submit [v]
  (when (and v (not= "" (.trim v)))
    (let [{:keys [keyword phrase]} (parse-input v)
          lookup (set/map-invert (:madlibs @state))
          id (if-let [found (lookup phrase)]
               found
               (let [id (compiler/new-id)]
                 (swap! state assoc-in [:madlibs id] phrase)
                 id))
          cur-path (get-in @state [:matcher :path])
          node {:type (if keyword
                        (cljs.core/keyword keyword)
                        :add)
                :ml id}
          node (if (and keyword (not cur-path))
                 {:type :rule
                  :clauses [node]}
                 node)]
      (if-not cur-path
        (swap! state update-in [:statements] conj node)
        (swap! state update-in (conj cur-path :clauses) conj node))
      (when (= (:type node) :rule)
        (swap! state assoc-in [:matcher :path] [:statements (-> (:statements @state)
                                                                (count)
                                                                (dec))])
        )
      (.setValue instance "")
      )))

(swap! state assoc-in [:matcher :path] nil)

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
  (let [tree (root-ui)]
    (js/React.renderComponent (node tree) (dom/$ "#wrapper"))
    (when-not (dom/$ ".matcher-editor")
      (when-let [container (dom/$ ".matcher-editor-container")]
        (dom/append container (.getWrapperElement instance))
        (.refresh instance)
        (.focus instance)))
    (set! queued? false)
    ))

(defn queue-render []
  (when-not queued?
    (set! queued? true)
    (frame render!)))

(queue-render)

(add-watch cur-env :render (fn [_ _ _ cur]
                             (queue-render)))

(add-watch state :render (fn [_ _ _ cur]
                           (queue-render)))

(add-watch state :compile (fn [_ _ old cur]
                            (when-not (identical? (:statements old) (:statements cur))
                              (inject-compiled))))

(:statements @state)

