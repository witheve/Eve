(ns aurora.examples.todomvc2
  (:require [aurora.btree :refer [tree iterator least greatest key-lt key-lte key-gt key-gte key-compare key=]]
            [aurora.join :refer [magic-iterator join-iterator all-join-results transform constant-filter context pretend-tree fixpoint-tick infinirator]]
            [aurora.language :refer [knowledge compile]]
            [aurora.util.core :refer [now]]
            [aurora.editor.dom :as dom]
            [aurora.editor.ReactDommy :as dommy])
  (:require-macros [aurora.macros :refer [typeof ainto perf-time rules]]))


(let [next (atom 0)]
  (defn new-id []
    (if js/window.uuid
      (.replace (js/uuid) (js/RegExp. "-" "gi") "_")
      (swap! next inc))))

(defn init-std-lib [kn]
  (.get-or-create-index kn "know" "ui/onClick" #js ["elem-id"])
  (.get-or-create-index kn "know" "ui/onKeyDown" #js ["elem-id" "key"])
  (.get-or-create-index kn "know" "ui/onChange" #js ["elem-id" "value"])
  (.get-or-create-index kn "know" "ui/onBlur" #js ["elem-id"])
  (.get-or-create-index kn "know" "ui/onDoubleClick" #js ["elem-id"])
  (.get-or-create-index kn "know" "ui/custom" #js ["event-key" "entity"])
  (.get-or-create-index kn "know" "ui/elem" #js ["elem-id" "tag"])
  (.get-or-create-index kn "know" "ui/child" #js ["parent-id" "pos" "child-id"])
  (.get-or-create-index kn "know" "ui/attr" #js ["elem-id" "attr" "value"])
  (.get-or-create-index kn "know" "ui/text" #js ["elem-id" "text"])
  (.get-or-create-index kn "know" "ui/style" #js ["elem-id" "attr" "value"])
  (.get-or-create-index kn "know" "ui/event-listener" #js ["elem-id" "event" "event-key" "entity"])
  (.get-or-create-index kn "know" "time" #js ["time"]))

(defn prep-compiled [compiled]
  (let [trans? (.-name->transient? compiled)]
    (aset trans? "ui/onClick" true)
    (aset trans? "ui/onKeyDown" true)
    (aset trans? "ui/onChange" true)
    (aset trans? "ui/onDoubleClick" true)
    (aset trans? "ui/custom" true)
    (aset trans? "ui/elem" true)
    (aset trans? "ui/child" true)
    (aset trans? "ui/attr" true)
    (aset trans? "ui/text" true)
    (aset trans? "ui/style" true)
    (aset trans? "ui/event-listener" true)
    (aset trans? "time" true)))

(defn env []
  (let [kn (knowledge)
        state (.-state kn)
        queue (array)]
    (.get-or-create-index kn "know" "clauses" #js ["rule-id" "when|know|remember|forget" "clause-id" "name"])
    (.get-or-create-index kn "know" "clause-fields" #js ["clause-id" "constant|variable" "key" "val"])
    (init-std-lib kn)
    (aset state "queued" false)
    (aset state "current-queue" queue)
    (aset state "queue!" (fn [index order fact]
                           (println "QUEUING: " index order fact)
                           ;;TODO: this doesn't store any history
                           (when (false? (aget state "queued"))
                             (aset state "queued" (js/setTimeout (partial re-run kn) 0)))
                           (know kn index order fact)))
    kn
    ))

(defn add-rules [env rs]
  (let [results #js {:clauses (array)
                     :clause-fields (array)}]
    (doseq [r rs]
      (add-rule results r))
    (.add-facts env "know" "clauses" #js ["rule-id" "when|know|remember|forget" "clause-id" "name"] (aget results "clauses"))
    (.add-facts env "know" "clause-fields" #js ["clause-id" "constant|variable" "key" "val"] (aget results "clause-fields"))
    env))



(defn add-rule [results clauses]
  (let [rule (new-id)]
    (doseq [cs clauses
            [type name fact] cs]
      (let [clause (new-id)]
        (.push (aget results "clauses") #js [rule type clause name])
        (doseq [[k v] fact]
          (let [var? (symbol? v)
                v (if var?
                    (str v)
                    v)]
            (.push (aget results "clause-fields") #js [clause (if var? "variable" "constant") (cljs.core.name k) v])
            ))))))

(defn index [env ix]
  (get-in (.-kind->name->fields->index env) ["know" (name ix)]))

(def draw js/aurora.runtime.ui.hiccup->facts-eve)

(defn change [name old neue]
  [["when" name old]
   ["forget" name old]
   ["remember" name neue]
   ])

(defn func [var js]
  [["when" "=function" {:variable var :js js}]])



(defn init []
  (let [env #js {}
        input #js {}
        current-queue #js []
        indexes #js {:todo (tree 20)
                     :todo-editing (tree 20)
                     :todo-completed (tree 20)
                     :todo-added (pretend-tree 20)
                     :todo-removed (pretend-tree 20)
                     :todo-to-add (tree 20)
                     :todo-to-edit (tree 20)
                     :filter (tree 20)
                     :todo-displayed (pretend-tree 20)
                     :current-toggle (tree 20)

                     ;;StdLib
                     "ui/onClick" (pretend-tree 20)
                     "ui/onKeyDown" (pretend-tree 20)
                     "ui/onChange" (pretend-tree 20)
                     "ui/onBlur" (pretend-tree 20)
                     "ui/onDoubleClick" (pretend-tree 20)
                     "ui/custom" (pretend-tree 20)
                     :elem (pretend-tree 20)
                     :elem-child (pretend-tree 20)
                     :elem-attr (pretend-tree 20)
                     :elem-text (pretend-tree 20)
                     :elem-style (pretend-tree 20)
                     :elem-event (pretend-tree 20)
                     :time (pretend-tree 20)}
        ctx (context indexes)
        pretend! (aget ctx "pretend!")]

    (.get-or-create-index kn "know" "todo" #js ["todo-id" "text"])
    (.get-or-create-index kn "know" "todo-editing" #js ["todo-id" "editing?"])
    (.get-or-create-index kn "know" "todo-completed" #js ["todo-id" "completed?"])
    (.get-or-create-index kn "know" "todo-added" #js ["x"])
    (.get-or-create-index kn "know" "todo-removed" #js ["todo-id"])
    (.get-or-create-index kn "know" "todo-to-add" #js ["value"])
    (.get-or-create-index kn "know" "todo-to-edit" #js ["value"])
    (.get-or-create-index kn "know" "filter" #js ["filter"])
    (.get-or-create-index kn "know" "todo-displayed" #js ["todo-id"])
    (.get-or-create-index kn "know" "current-toggle" #js ["value"])



    (aset input "queued" false)
    (aset input "current-queue" current-queue)
    (aset input "queue!" (fn [index fact]
                           (println "QUEUING: " index fact)
                           ;;TODO: this doesn't store any history
                           (when (false? (aget input "queued"))
                             (aset input "queued" (js/setTimeout (partial re-run env) 0)))
                           (pretend! index fact)))
    (aset env "input" input)
    (aset env "ctx" ctx)
    (aset env "indexes" indexes)
    env))

(defn fill-todos [env num]
  (dotimes [x num]
    (know env "todo" #js ["todo-id" "text"] #js [x (str "foo" x)]))
  (dotimes [x num]
    (know env "todo-editing" #js ["todo-id" "editing?"] #js [x "saved"]))
  (dotimes [x num]
    (know env "todo-completed" #js ["todo-id" "completed?"] #js [x "active"])))

(defn click! [env elem]
  (.assoc! (index env "ui/onClick") #js[elem] 0))

(defn change! [env elem ]
  (.assoc! (index env "ui/onChange") #js[elem "foo bar"] 0))

(defn blur! [elem]
  (.assoc! (index env "ui/onBlur") #js[elem] 0))

(defn defaults [env]
  ;((aget (aget env "ctx") "remember!") "todo-to-add" #js ["hey"])
  (know env "todo-to-add" #js ["value"] #js ["hey"])
  (know env "current-toggle" #js ["value"] #js ["false"])
  (know env "todo-to-edit" #js ["value"] #js ["hi"])
  (know env "filter" #js ["filter"] #js ["all"])
  )

(def todomvc (env))

(rules todomvc

       (rule todo-input-changes
             (when "ui/onChange" {:elem-id "todo-input" :value neue})
             (change "todo-to-add" {:value v} {:value neue}))

       (rule add-todo-clicked
             (when "ui/onClick" {:elem-id "add-todo"})
             (pretend "todo-added" {:x 0}))

       (rule filter-active-clicked
             (when "ui/onClick" {:elem-id "filter-active"})
             (change "filter" {:filter 'v} {:filter "active"}))

       (rule filter-completed-clicked
             (when "ui/onClick" {:elem-id "filter-completed"})
             (change "filter" {:filter 'v} {:filter "completed"}))

       (rule filter-all-clicked
             (when "ui/onClick" {:elem-id "filter-all"})
             (change "filter" {:filter 'v} {:filter "all"}))

       (rule toggle-all-changed-track
             (when "ui/onChange" {:elem-id "toggle-all" :value 'value})
             (change "current-toggle" {:value 'v} {:value 'value}))

       (rule toggle-all-changed-update
             (when "ui/onChange" {:elem-id "toggle-all" :value 'value})
             (func 'final "value == \"true\" ? \"completed\" : \"active\" ")
             (change "todo-completed"
                     {:todo-id 'todo :completed? 'complete?}
                     {:todo-id 'todo :completed? 'final}))

       (rule clear-completed-clicked
             (when "ui/onClick" {:elem-id "clear-completed"})
             (when "todo-completed" {:todo-id 'todo :completed? "completed"})
             (pretend "todo-removed" {:todo-id 'todo}))

       (rule remove-todo
             (when "todo-removed" {:todo-id 'todo})
             (when "todo" {:todo-id 'todo :text 'text})
             (when "todo-editing" {:todo-id 'todo :editing? 'editing})
             (when "todo-completed" {:todo-id 'todo :completed? 'complete?})
             (forget "todo" {:todo-id 'todo :text 'text})
             (forget "todo-editing" {:todo-id 'todo :editing? 'editing})
             (forget "todo-completed" {:todo-id 'todo :completed? 'complete?}))

       (rule filter-all-display
             (when "todo" {:todo-id 'todo :text 'text})
             (when "filter" {:filter "all"})
             (pretend "todo-displayed" {:todo-id 'todo}))

       (rule filter-all-display
             (when "todo" {:todo-id 'todo :text 'text})
             (when "todo-completed" {:todo-id 'todo :completed? 'complete?})
             (when "filter" {:filter 'complete?})
             (pretend "todo-displayed" {:todo-id 'todo}))

       (rule draw-checkbox
             (when "todo-displayed" {:todo-id 'todo})
             (when "todo-completed" {:todo-id 'todo :completed? 'complete})
             (func 'active?  "complete == \"completed\" ? \"checked\" : \"\"")
             (func 'child-id "\"todo-checkbox\" + todo")
             (func 'parent-id "\"todo\" + todo")
             (pretend "ui/child" {:parent-id 'parent-id :pos -1 :child-id 'child-id})
             (draw [:input {:id 'child-id
                            :type "checkbox"
                            :checked active?
                            :event-key "todo-checkbox"
                            :entity 'todo
                            :events ["onChange"]}]))

       (rule draw-todo-item
             (when "todo-displayed" {:todo-id 'todo})
             (when "todo" {:todo-id 'todo :text 'text})
             (when "todo-editing" {:todo-id 'todo :editing? "saved"})
             (func 'removeId "\"todo-remove\" + todo")
             (func 'todoId "\"todo\" + todo")
             (pretend "ui/child" {:parent-id "todo-list" :pos 'todo :child-id 'child-id})
             (draw [:li {:id 'todoId
                         :event-key "edit-todo"
                         :entity 'todo
                         :events ["onDoubleClick"]}
                    'text
                    [:button {:id 'removeId
                              :event-key "remove-todo"
                              :entity 'todo
                              :events ["onClick"]}
                     "x"]]))

       (rule draw-todo-item
             (when "todo-displayed" {:todo-id 'todo})
             (when "todo" {:todo-id 'todo :text 'cur})
             (when "todo-editing" {:todo-id 'todo :editing? "editing"})
             (pretend "ui/child" {:parent-id "todo-list" :pos 'todo :child-id "todo-editor"})
             (draw [:input {:id "todo-editor"
                            :type "text"
                            :defaultValue 'cur
                            :event-key "todo-editor"
                            :entity 'todo
                            :events ["onBlur" "onChange" "onKeyDown"]}]))

       (rule draw-todo-item
             (when "todo-to-add" {:value 'cur})
             (pretend "ui/child" {:parent-id "app" :pos 1 :child-id "todo-input"})
             (draw [:input {:id "todo-input"
                            :type "text"
                            :defaultValue 'cur
                            :events ["onChange" "onKeyDown"]}]))

       (rule draw-interface
             (when "curren-toggle" {:value 'toggle})
             (draw [:div {:id "app"}
                    [:h1 {:id "todo-header"} "Todos"]
                    [:input {:id "toggle-all"
                             :event-key "toggle-all"
                             :checked 'toggle
                             :events ["onChange"]
                             :type "checkbox"}]
                    [:button {:id "add-todo" :event-key "add-todo" :events ["onClick"]} "add"]
                    [:ul {:id "todo-list"}]
                    [:button {:id "filter-all" :event-key "filter all" :events ["onClick"]} "all"]
                    [:button {:id "filter-active" :event-key "filter-active" :events ["onClick"]} "active"]
                    [:button {:id "filter-completed" :event-key "filter-completed" :events ["onClick"]} "completed"]]))

       (rule add-todo
             (when "todo-added" {:x '_})
             (when "time" {:time 'time})
             (when "todo-to-add" {:value 'to-add})
             (remember "todo" {:todo-id 'time :text 'to-add})
             (remember "todo-editing" {:todo-id 'time :editing? "saved"})
             (remember "todo-completed" {:todo-id 'time :completed? "acitve"})))




(defn handle-attr [v]
  (condp = v
    "true" true
    "false" false
    v))

(defn into-obj [obj vs]
  (dotimes [x (alength vs)]
    (let [cur (aget vs x)]
      (aset obj (aget cur 0) (aget cur 1)))))

(defn iter-take-while [itr cond]
  (let [results (array)]
    (while (cond (.key itr))
      (.push results (.key itr))
      (.next itr))
    (when (> (alength results) 0)
      results)))


(deftype ArrayIterator [ar len ^:mutable ix]
  Object
  (key [this]
       (when (< ix len)
         (aget ar ix)))

  (next [this]
        (set! ix (+ 1 ix))
        ))

(defn array-iterator [ar]
  (ArrayIterator. ar (alength ar) 0))

(defn build-element [id tag attrs-itr styles-itr events-itr queue]
  (let [el-attrs (js-obj "eve-id" id)
        el-styles (js-obj)]
    ;;attrs
    (while (and (.key attrs-itr)
                (== (aget (.key attrs-itr) 0) id))
      (let [cur (.key attrs-itr)]
        (aset el-attrs (aget cur 1) (handle-attr (aget cur 2)))
        (.next attrs-itr)))

    ;;styles
    (aset el-attrs "styles" el-styles)
    (while (and (.key styles-itr)
                (== (aget (.key styles-itr) 0) id))
      (let [cur (.key styles-itr)]
        (aset el-styles (aget cur 1) (aget cur 2))
        (.next styles-itr)))

    ;;events
    (while (and (.key events-itr)
                (== (aget (.key events-itr) 0) id))
      (let [cur (.key events-itr)
            event (aget cur 1)
            event-key (aget cur 2)
            entity (aget cur 3)]
        (aset el-attrs event (fn [e]
                               (println "attached handler now")
                               ;(queue (str "ui/" event) #js ["elem-id"] #js [id (js/aurora.runtime.ui.event->params2 event e)])
                               ;(queue (str "ui/custom") #js ["event-key" "entity"] #js [id event-key entity (js/aurora.runtime.ui.event->params2 event e)])
                               (queue (str "ui/" event) #js ["elem-id"] #js [id])
                               (queue (str "ui/custom") #js ["event-key" "entity"] #js [event-key entity])
                               )
              ))
      (.next events-itr))

    ((aget js/React.DOM (name tag)) el-attrs (array))))

(defn rebuild-tree [env queue]
  (let [els (.keys (get (index env "ui/elem") ["elem-id" "tag"]))
        attrs (array-iterator (.keys (get (index env "ui/attr") ["elem-id" "attr" "value"])))
        styles (array-iterator (.keys (get (index env "ui/style") ["elem-id" "attr" "value"])))
        events (array-iterator (.keys (get (index env "ui/event-listener") ["elem-id" "event" "event-key" "entity"])))
        text (.keys (get (index env "ui/text") ["elem-id" "text"]))
        all-children (.keys (get (index env "ui/child") ["parent-id" "pos" "child-id"]))
        built-els (js-obj)
        roots (js-obj)
        final (array :div)
        ]

    (dotimes [x (alength els)]
      (let [cur (aget els x)
            id (aget cur 0)
            tag (aget cur 1)]
        (aset roots id true)
        (aset built-els id (build-element id tag attrs styles events queue))))

    (into-obj built-els text)

    (dotimes [x (alength all-children)]
      (let [cur (aget all-children x)
            parent (aget cur 0)
            child (aget cur 2)
            pos (aget cur 1)
            parent-el (aget built-els parent)
            child-el (aget built-els child)]
        (.push (.-props.children parent-el) child-el)
        (js-delete roots child)))


    (let [root-els (js/Object.keys roots)]
      (dotimes [x (alength root-els)]
        (.push final (aget built-els (aget root-els x)))))

    final))


(defn build-element-dom [id tag attrs-itr styles-itr events-itr queue]
  (let [elem (js/document.createElement tag)
        el-attrs (js-obj "eve-id" id)
        el-styles (js-obj)]
    ;;attrs
    (while (and (.key attrs-itr)
                (== (aget (.key attrs-itr) 0) id))
      (let [cur (.key attrs-itr)]
        (dom/attr* elem (aget cur 1) (handle-attr (aget cur 2)))
        (.next attrs-itr)))

    ;;styles
    (aset el-attrs "styles" el-styles)
    (while (and (.key styles-itr)
                (== (aget (.key styles-itr) 0) id))
      (let [cur (.key styles-itr)]
        (aset el-styles (aget cur 1) (aget cur 2))
        (.next styles-itr)))

    ;;events
    (while (and (.key events-itr)
                (== (aget (.key events-itr) 0) id))
      (let [cur (.key events-itr)
            event (aget cur 1)
            event-key (aget cur 2)
            entity (aget cur 3)]
        (dom/on elem event (fn [e]
                             (comment
                               (queue (stdlib/map->fact (merge {:ml (keyword "ui" event)
                                                                "event" event-key
                                                                "id" id
                                                                "entity" entity}
                                                               (event->params event e))))
                               (queue (stdlib/map->fact (merge {:ml :ui/custom
                                                                "event" event-key
                                                                "entity" entity}))))
                             )))
      (.next events-itr))

    elem))

(defn rebuild-tree-dom [env queue]
  (let [els (iterator (index env :elem))
        attrs (iterator (index env :elem-attr))
        styles (iterator (index env :elem-style))
        events (iterator (index env :elem-event))
        text (iterator (index env :elem-text))
        all-children (iterator (index env :elem-child))
        built-els (js-obj)
        roots (js-obj)
        ]

    (while (.key els)
      (let [cur (.key els)
            id (aget cur 0)
            tag (aget cur 1)]
        (aset roots id true)
        (aset built-els id (build-element-dom id tag attrs styles events queue))
        (.next els)))


    (while (.key text)
      (let [cur (.key text)
            id (aget cur 0)
            content (aget cur 1)]
        (aset built-els id (js/document.createTextNode content))
        (.next text)))

    (while (.key all-children)
      (let [cur (.key all-children)
            parent (aget cur 0)
            child (aget cur 2)
            pos (aget cur 1)
            parent-el (aget built-els parent)
            child-el (aget built-els child)]
        ;(.push (.-props.children parent-el) child-el)
        (dom/append parent-el child-el)
        (js-delete roots child)
        (.next all-children)))


    (let [root-els (js/Object.keys roots)
          frag (dom/fragment)]
      (dotimes [x (alength root-els)]
        (dom/append frag (aget built-els (aget root-els x))))

      frag)))



(comment
  (perf-time (run))
  (perf-time (dotimes [x 30]
               (run)))

  (first (compile program))

(doseq [x (compile program)]
  (println "foo")
  (.run x program))

  )


(defn know [env key order fact]
  (.get-or-create-index env "know" key (to-array order))
  (.add-facts env "know" key (to-array order) (array (to-array fact)))
  )

(defn remember [env key order fact]
  (.get-or-create-index env "remember" key (to-array order))
  (.add-facts env "remember" key (to-array order) (array (to-array fact)))
  )




(defn re-run [program]
  (let [compiled (compile program)]
    (prep-compiled compiled)
    (perf-time
     (do
       (.quiesce compiled program (fn [kn]

                                    (let [tree (perf-time (rebuild-tree program (aget (.-state program) "queue!")))
                                          container (dom/$ "body")
                                          dommied (perf-time (dommy/node tree))
                                          ]
                                      (when container
                                        (js/React.renderComponent dommied container)
                                        ;(perf-time (do
                                        ;             (dom/empty container)
                                        ;             (dom/append container tree)))
                                        )
                                      ;
                                      )
                                    ))
       (aset (.-state program) "queued" false)
       )))

  )


(comment

  ;;Try to run todomvc and it blows up with "Can't split anything"
  (do (defaults todomvc)
    (fill-todos todomvc 5)
    (re-run todomvc))

  ;;Trying to get the thing to run CRAZINESS, queued events cause re-run to be called
  ;;if I .quiesce the ui disappears, just calling .run is fine though

(let [program (env)]
  (rules program

         (rule draw-incr
               (when "incr" {:value value})
               (draw [:button {:id "incr" :events ["onClick"]} "increment: " 'value]))

         (rule clicked
               (when "ui/onClick" {:elem-id "incr"})
               (func 'new-val "value + 1")
               (change "incr" {:value 'value} {:value 'new-val}))

;;                       (rule this-is-awesome
;;                             (func 'x "1 + 2")
;;                             (pretend "x-val" {:val x})
;;                             )

         )
  (let [compiled (compile program)]
    (prep-compiled compiled)
    ;; I seem to need both of these in order to get things to trigger as a default value
    (remember program "incr" ["value"] [0])
    (know program "incr" ["value"] [0])

    (perf-time
     (do
       (.quiesce compiled program (fn [kn]
                                    (let [tree (perf-time (rebuild-tree program (aget (.-state program) "queue!")))
                                          container (dom/$ "body")
                                          dommied (perf-time (dommy/node tree))
                                          ]
                                      (when container
                                        (js/React.renderComponent dommied container)
                                        ;(perf-time (do
                                        ;             (dom/empty container)
                                        ;             (dom/append container tree)))
                                        )
                                      ;
                                      )
                                    ))
       )))

  (get-in (.-kind->name->fields->index program) ["remember" "incr"])
  (index program "ui/elem")
  )




  )
