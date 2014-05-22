(ns aurora.examples.todomvc
  (:require [aurora.btree :refer [tree iterator least greatest key-lt key-lte key-gt key-gte key-compare key=]]
            [aurora.join :refer [magic-iterator join-iterator all-join-results transform constant-filter context pretend-tree fixpoint-tick infinirator]]
            [aurora.language :refer [knowledge]]
            [aurora.util.core :refer [now]]
            [aurora.editor.dom :as dom]
            [aurora.editor.ReactDommy :as dommy])
  (:require-macros [aurora.macros :refer [typeof ainto perf-time rules]]))


(let [next (atom 0)]
  (defn new-id []
    (if js/window.uuid
      (.replace (js/uuid) (js/RegExp. "-" "gi") "_")
      (swap! next inc))))

(defn env []
  (let [kn (knowledge)]
    (.get-or-create-index kn "know" "clauses" ["rule-id" "clause-id" "name" "type"])
    (.get-or-create-index kn "know" "clause-vars" ["clause-id" "key" "var"])
    (.get-or-create-index kn "know" "clause-constants" ["clause-id" "key" "constant"])
    kn
    ))

(defn add-rules [env rs]
  (let [results #js {:clauses (array)
                     :clause-vars (array)
                     :clause-constants (array)}]
    (doseq [r rs]
      (add-rule results r))
    (.add-facts env "know" "clauses" #js ["rule-id" "clause-id" "name" "type"] (aget results "clauses"))
    (.add-facts env "know" "clause-vars" #js ["clause-id" "key" "var"] (aget results "clause-vars"))
    (.add-facts env "know" "clause-constants" #js ["clause-id" "key" "constant"] (aget results "clause-constants"))
    env))



(defn add-rule [results clauses]
  (let [rule (new-id)]
    (doseq [cs clauses
            [type name fact] cs]
      (let [clause (new-id)]
        (.push (aget results "clauses") #js [rule clause name type])
        (dotimes [x (alength fact)]
          (let [cur (aget fact x)]
            (if (symbol? cur)
              (.push (aget results "clause-vars") #js [clause x (str cur)])
              (.push (aget results "clause-constants") #js [clause x cur]))))))))

(def draw js/aurora.runtime.ui.hiccup->facts-eve)

(defn change [old neue]
  [["when" (first old) (to-array (rest old))]
   ["forget" (first old) (to-array (rest old))]
   ["remember" (first neue) (to-array (rest neue))]
   ])

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
    (.assoc! (index env "todo") #js [x (str "foo" x)] x))
  (dotimes [x num]
    (.assoc! (index env "todo-editing") #js [x "saved"] x))
  (dotimes [x num]
    (.assoc! (index env "todo-completed") #js [x "asdf"] x)))

(defn click! [env elem]
  (.assoc! (index env "ui/onClick") #js[elem] 0))

(defn change! [env elem ]
  (.assoc! (index env "ui/onChange") #js[elem "foo bar"] 0))

(defn blur! [elem]
  (.assoc! (index env "ui/onBlur") #js[elem] 0))

(defn defaults [env]
  ;((aget (aget env "ctx") "remember!") "todo-to-add" #js ["hey"])
  (.assoc! (index env :todo-to-add) #js ["hey"] nil)
  (.assoc! (index env :current-toggle) #js ["false"] nil)
  (.assoc! (index env :todo-to-edit) #js ["hi"] nil)
  (.assoc! (index env :filter) #js ["all"] nil))

(def program (env))

(rules program

       (rule todo-input-changes
             (when "ui/onChange" "todo-input" 'neue)
             (change ["todo-to-add" 'v]
                     ["todo-to-add" 'neue]))

       (rule add-todo-clicked
             (when "ui/onClick" "add-todo")
             (pretend "todo-added" 0))

       (rule filter-active-clicked
             (when "ui/onClick" "filter-active")
             (change ["filter" 'v]
                     ["filter" "active"]))

       (rule filter-completed-clicked
             (when "ui/onClick" "filter-completed")
             (change ["filter" 'v]
                     ["filter" "completed"]))

       (rule filter-all-clicked
             (when "ui/onClick" "filter-all")
             (change ["filter" 'v]
                     ["filter" "all"]))

       (rule toggle-all-changed-track
             (when "ui/onChange" "toggle-all" 'value)
             (change ["current-toggle" 'v]
                     ["current-toggle" 'value]))

       (rule toggle-all-changed-update
             (when "ui/onChange" "toggle-all" 'value)
             (when "eve/compute" 'final "value == \"true\" ? \"completed\" : \"active\" ")
             (change ["todo-completed" 'todo 'complete?]
                     ["current-toggle" 'todo 'final]))

       (rule clear-completed-clicked
             (when "ui/onClick" "clear-completed")
             (when "todo-completed" 'todo "completed")
             (pretend "todo-removed" 'todo)
             )

       (rule remove-todo
             (when "todo-removed" 'todo)
             (when "todo" 'todo 'text)
             (when "todo-editing" 'todo 'editing)
             (when "todo-completed" 'todo 'complete?)
             (forget "todo" 'todo 'text)
             (forget "todo-editing" 'todo 'editing)
             (forget "todo-completed" 'todo 'complete?))

       (rule filter-all-display
             (when "todo" 'todo 'text)
             (when "filter" "all")
             (pretend "todo-displayed" 'todo))

       (rule filter-all-display
             (when "todo" 'todo 'text)
             (when "todo-completed" 'todo 'complete?)
             (when "filter" 'complete?)
             (pretend "todo-displayed" 'todo))

       (rule draw-checkbox
             (when "todo-displayed" 'todo)
             (when "todo-completed" 'todo 'complete)
             (when "compute" 'active? "complete == \"completed\" ? \"checked\" : \"\"")
             (when "compute" 'child-id "\"todo-checkbox\" + todo")
             (when "compute" 'parent-id "\"todo\" + todo")
             (pretend "elem-child" 'parent-id -1 'child-id)
             (draw [:input {:id 'child-id
                            :type "checkbox"
                            :checked active?
                            :event-key "todo-checkbox"
                            :entity 'todo
                            :events ["onChange"]}]))

       (rule draw-todo-item
             (when "todo-displayed" 'todo)
             (when "todo" 'todo 'text)
             (when "todo-editing" 'todo "saved")
             (when "compute" 'remove-id "\"todo-remove\" + todo")
             (when "compute" 'todo-id "\"todo\" + todo")
             (pretend "elem-child" "todo-list" 'todo 'child-id)
             (draw [:li {:id 'todo-id
                         :event-key "edit-todo"
                         :entity 'todo
                         :events ["onDoubleClick"]}
                    'text
                    [:button {:id 'remove-id
                              :event-key "remove-todo"
                              :entity 'todo
                              :events ["onClick"]}
                     "x"]]))

       (rule draw-todo-item
             (when "todo-displayed" 'todo)
             (when "todo" 'todo 'cur)
             (when "todo-editing" 'todo "editing")
             (pretend "elem-child" "todo-list" 'todo "todo-editor")
             (draw [:input {:id "todo-editor"
                            :type "text"
                            :defaultValue 'cur
                            :event-key "todo-editor"
                            :entity 'todo
                            :events ["onBlur" "onChange" "onKeyDown"]}]))

       (rule draw-todo-item
             (when "todo-to-add" 'cur)
             (pretend "elem-child" "app" 1 "todo-input")
             (draw [:input {:id "todo-input"
                            :type "text"
                            :defaultValue 'cur
                            :events ["onChange" "onKeyDown"]}]))

       (rule draw-interface
             (when "curren-toggle" 'toggle)
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
             (when "todo-added" '_)
             (when "time" 'time)
             (when "todo-to-add" 'to-add)
             (remember "todo" 'time 'to-add)
             (remember "todo-editing" 'time "saved")
             (remember "todo-completed" 'time "acitve")))

(defn run []
  (let [env (init)]
    (perf-time (do
                 (defaults env)
                 (fill-todos env 200)
                 (fixpoint-tick env
                                (fn [env]
                                  (todo-input-changes env)
                                  (add-todo-clicked env)
                                  (filter-active-clicked env)
                                  (filter-completed-clicked env)
                                  (filter-all-clicked env)
                                  (toggle-all-changed-track env)
                                  (toggle-all-changed-update env)
                                  (clear-completed-clicked env)
                                  (remove-todo env)
                                  (filter-all-display env)
                                  (filter-not-all-display env)
                                  (draw-checkbox env)
                                  (draw-todo-item env)
                                  (draw-todo-item-editing env)
                                  (draw-todo-to-add env)
                                  (draw-interface env)
                                  (add-todo env)
                                  ))))
    (let [tree (perf-time (rebuild-tree env (aget (aget env "input") "queue!")))
          container (dom/$ "#ui-preview")
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
    )
  )


(defn re-run [env]
  (perf-time (do
               (.assoc! (index env :time) #js [(now)])
               (fixpoint-tick env
                              (fn [env]
                                (todo-input-changes env)
                                (add-todo-clicked env)
                                (filter-active-clicked env)
                                (filter-completed-clicked env)
                                (filter-all-clicked env)
                                (toggle-all-changed-track env)
                                (toggle-all-changed-update env)
                                (clear-completed-clicked env)
                                (remove-todo env)
                                (filter-all-display env)
                                (filter-not-all-display env)
                                (draw-checkbox env)
                                (draw-todo-item env)
                                (draw-todo-item-editing env)
                                (draw-todo-to-add env)
                                (draw-interface env)
                                (add-todo env)
                                ))))
  (let [tree (perf-time (rebuild-tree env (aget (aget env "input") "queue!")))
        container (dom/$ "#ui-preview")
        dommied (perf-time (dommy/node tree))]
    (when container
      (js/React.renderComponent dommied container)
      (aset (aget env "input") "queued" false))))


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
                               (println "attached handler")
                               (queue (str "ui/" event) #js [id (js/aurora.runtime.ui.event->params2 event e)])
                               (queue (str "ui/custom") #js [id event-key entity (js/aurora.runtime.ui.event->params2 event e)]))
              ))
      (.next events-itr))

    ((aget js/React.DOM (name tag)) el-attrs (array))))

(defn rebuild-tree [env queue]
  (let [els (iterator (index env :elem))
        attrs (iterator (index env :elem-attr))
        styles (iterator (index env :elem-style))
        events (iterator (index env :elem-event))
        text (iterator (index env :elem-text))
        all-children (iterator (index env :elem-child))
        built-els (js-obj)
        roots (js-obj)
        final (array :div)
        ]

    (while (.key els)
      (let [cur (.key els)
            id (aget cur 0)
            tag (aget cur 1)]
        (aset roots id true)
        (aset built-els id (build-element id tag attrs styles events queue))
        (.next els)))

    (into-obj built-els (all-join-results text))


    (while (.key all-children)
      (let [cur (.key all-children)
            parent (aget cur 0)
            child (aget cur 2)
            pos (aget cur 1)
            parent-el (aget built-els parent)
            child-el (aget built-els child)]
        (.push (.-props.children parent-el) child-el)
        (js-delete roots child)
        (.next all-children)))


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



  )


(comment

  (-> (rules (env)

             (rule this-is-awesome
                   (when "counter" 'counter)
                   (draw [:div {:id "root"}
                          [:span {:id "foo"} 'counter]])
                   )

             )

      (.-kind->name->fields->index))

  )
