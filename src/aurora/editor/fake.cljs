(ns aurora.editor.fake
  (:require [aurora.editor.ReactDommy :refer [node]]
            [aurora.compiler.compiler :as compiler]
            [aurora.compiler.datalog :as datalog]
            [aurora.runtime.core :as runtime :refer [run-env pause unpause]]
            [aurora.runtime.timers]
            [aurora.runtime.ui]
            [aurora.runtime.io]
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


(defmulti draw-statement (fn [x y path]
                           (:type x)))

(defn statement-item [path & content]
  [:li {:onDoubleClick (fn [e]
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

(defmulti compile-clause (fn [clause world]
                           (:type clause)))

(defmethod compile-clause :when [clause world]
  (compile-clause (assoc clause :type :find) world))

(defmethod compile-clause :find [clause world]
  (dissoc clause :type))

(defmethod compile-clause :add [clause world]
  (list '+ (dissoc clause :type)))

(defmethod compile-clause :remove [clause world]
  (list '- (dissoc clause :type)))

(defmethod compile-clause :update [])

(defn compile-rule [r world]
  (datalog/macroless-rule (mapv compile-clause (:clauses r))))

(defn compile-fact [f world]
  (dissoc f :type))

(defn compile-statements [statements world]
  (let [rules (filter #(= (:type %) :rule) statements)
        facts (filter #(not= (:type %) :rule) statements)]
    {:rules (for [r rules]
              (compile-rule r world))
     :facts (for [f facts]
              (compile-fact f world))}))

(defn compile-state []
  (compile-statements (:statements @state) @state))

(defn inject-compiled []
  (let [comped (compile-state)
        tick-rules (datalog/chain (:rules comped))
        paused? (:paused @cur-env)]
    (pause cur-env)
    (swap! cur-env assoc
           :tick-rules tick-rules
           :kn (datalog/Knowledge. (set/union (set (:facts comped)) (or (get-in @state [:editor :prev-kn])
                                                                        (-> @cur-env :kn :old)))
                                   (-> @cur-env :kn :asserted)
                                   (-> @cur-env :kn :retracted)))
    (when-not paused?
      (unpause cur-env))))

;(enable-console-print!)
(inject-compiled)

(defn set-editing [path]
  (fn []
    (when (= (first path) :statements)
      (swap! state assoc-in [:editor :paused?] (:paused @cur-env))
      (swap! state assoc-in [:editor :prev-kn] (-> @cur-env :kn :old))
      (pause cur-env)
      (swap! state assoc-in [:editor :path] path))))

(defn editable [v path]
  (if-not (= path (get-in @state [:editor :path]))
    [:span.value {:onClick (set-editing path)}
     v]
    [:input {:onChange (fn [e]
                         (swap! state assoc-in path (.-target.value e)))
             :onKeyDown (fn [e]
                          (when (= (:enter key-codes) (.-keyCode e))
                            (.target.blur e)))
             :value v
             :onBlur (fn []
                       (when (= v "")
                         )
                       (when-not (get-in @state [:editor :pasued?])
                         (unpause cur-env))
                       (swap! state assoc :editor {}))}]))

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
                                       var (symbol (last drag-path))]
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
                 (symbol? v) [:span.var.ref (str v)]
                 (vector? v) v
                 :else (str v)))
        classes {:var true
                 :attr attr?}]
    (cond
     (or (not v-rep)
         (= v name)) (if-not (= path (get-in @state [:editor :path]))
                       (holder path
                               {:classes classes
                                :onClick (set-editing path)}
                               [:span.placeholder
                                name])
                       [:span {:classes (assoc classes :add true)}
                        (editable v path)])
     (and id? v
          (string? v)) (holder path
                               {:classes (assoc classes :add true)}
                               (editable v path))
     (symbol? v) (holder path {:classes classes} v-rep)
     :else (holder path {:classes (assoc classes :add true)}
                   (editable v path)))
    ))

(defn rule-ui [r world path]
  (let [ml (if world
             (get-in world [:madlibs (:ml r)])
             r)
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

(def keywords #"when|find|new")

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
                     (concat ["when" "find" "new"] (vals (:madlibs @state)))
                     (vals (:madlibs @state)))]
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

