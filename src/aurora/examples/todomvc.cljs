(ns aurora.examples.todomvc
  (:require [aurora.btree :refer [tree iterator least greatest key-lt key-lte key-gt key-gte key-compare key=]]
            [aurora.join :refer [magic-iterator join-iterator all-join-results transform constant-filter context pretend-tree fixpoint-tick infinirator]]
            [aurora.language :refer [knowledge]]
            [aurora.util.core :refer [now]]
            [aurora.editor.dom :as dom]
            [aurora.editor.ReactDommy :as dommy])
  (:require-macros [aurora.macros :refer [typeof ainto perf-time rules]]))

(defn index [env n]
  (aget (aget env "indexes") (name n)))

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

(defn todo-input-changes [env]
  (let [itr1 (magic-iterator (index env "ui/onChange") #js [0 1 nil])
        itr2 (magic-iterator (index env :todo-to-add) #js [nil nil 0])
        filter (constant-filter 3 0 "todo-input")
        join-itr (join-iterator #js [itr1 filter itr2])]
    (transform (aget env "ctx") join-itr (fn [cur remember! forget! pretend!]
                                           (forget! "todo-to-add" #js [ (aget cur 2)])
                                           (remember! "todo-to-add" #js [ (aget cur 1)])
                                           )))
  )

(defn add-todo-clicked [env]
  (let [itr1 (magic-iterator (index env "ui/onClick") #js [0])
        filter (constant-filter 1 0 "add-todo")
        join-itr (join-iterator #js [itr1 filter])]
    (transform (aget env "ctx") join-itr (fn [cur remember! forget! pretend!]
                                           (pretend! "todo-added" #js [0])
                                           )))
  )

(defn filter-active-clicked [env]
  (let [itr1 (magic-iterator (index env "ui/onClick") #js [0 nil])
        itr2 (magic-iterator (index env :filter) #js [nil 0])
        filter (constant-filter 2 0 "filter-active")
        join-itr (join-iterator #js [itr1 filter itr2])]
    (transform (aget env "ctx") join-itr (fn [cur remember! forget! pretend!]
                                           (forget! "filter" #js [(aget cur 1)])
                                           (remember! "filter" #js ["active"])
                                           )))
  )


(defn filter-completed-clicked [env]
  (let [itr1 (magic-iterator (index env "ui/onClick") #js [0 nil])
        itr2 (magic-iterator (index env :filter) #js [nil 0])
        filter (constant-filter 2 0 "filter-completed")
        join-itr (join-iterator #js [itr1 filter itr2])]
    (transform (aget env "ctx") join-itr (fn [cur remember! forget! pretend!]
                                           (forget! "filter" #js [(aget cur 1)])
                                           (remember! "filter" #js ["completed"])
                                           )))
  )


(defn filter-all-clicked [env]
  (let [itr1 (magic-iterator (index env "ui/onClick") #js [0 nil])
        itr2 (magic-iterator (index env :filter) #js [nil 0])
        filter (constant-filter 2 0 "filter-all")
        join-itr (join-iterator #js [itr1 filter itr2])]
    (transform (aget env "ctx") join-itr (fn [cur remember! forget! pretend!]
                                           (forget! "filter" #js [(aget cur 1)])
                                           (remember! "filter" #js ["all"])
                                           )))
  )


(defn toggle-all-changed-track [env]
  (let [itr1 (magic-iterator (index env "ui/onChange") #js [0 1 nil])
        itr2 (magic-iterator (index env :current-toggle) #js [nil nil 0])
        filter (constant-filter 3 0 "toggle-all")
        join-itr (join-iterator #js [itr1 filter itr2])]
    (transform (aget env "ctx") join-itr (fn [cur remember! forget! pretend!]
                                           (forget! "current-toggle" #js [(aget cur 2)])
                                           (remember! "current-toggle" #js [ (aget cur 1)])
                                           ))))

(defn toggle-all-changed-update [env]
  (let [itr1 (magic-iterator (index env "ui/onChange") #js [0 1 nil nil nil])
        itr2 (magic-iterator (index env :todo-completed) #js [nil nil nil 0 1])
        filter (constant-filter 5 0 "toggle-all")
        if-value (infinirator 5
                              (fn [cur key]
                                (aset cur 2
                                      (if (identical? "true" (aget key 1))
                                        "completed"
                                        "active")))
                              (fn [cur]
                                (aset cur 2 false))
                              (fn [cur]
                                (aset cur 2 nil))
                              )
        join-itr (join-iterator #js [itr1 filter if-value itr2])]
    (transform (aget env "ctx") join-itr (fn [cur remember! forget! pretend!]
                                           (forget! "todo-completed" #js [(aget cur 3) (aget cur 4)])
                                           (remember! "todo-completed" #js [(aget cur 3) (aget cur 2)])
                                           ))))

(defn clear-completed-clicked [env]
  (let [itr1 (magic-iterator (index env "ui/onClick") #js [0 nil nil])
        itr2 (magic-iterator (index env :todo-completed) #js [nil 0 1])
        filter (constant-filter 3 2 "completed")
        join-itr (join-iterator #js [itr1 filter itr2])]
    (transform (aget env "ctx") join-itr (fn [cur remember! forget! pretend!]
                                           (pretend! "todo-removed" #js [ (aget cur 1)])
                                           ))))

(defn remove-todo [env]
  (let [itr1 (magic-iterator (index env :todo-removed) #js [0 nil nil nil nil])
        itr2 (magic-iterator (index env :todo) #js [nil 0 1 nil nil])
        itr3 (magic-iterator (index env :todo-editing) #js [nil 0 nil 1 nil])
        itr4 (magic-iterator (index env :todo-completed) #js [nil 0 nil nil 1])
        join-itr (join-iterator #js [itr1 itr2 itr3 itr4])]
    (transform (aget env "ctx") join-itr (fn [cur remember! forget! pretend!]
                                           (forget! "todo" #js [(aget cur 1) (aget cur 2)])
                                           (forget! "todo-editing" #js [(aget cur 1) (aget cur 3)])
                                           (forget! "todo-completed" #js [(aget cur 1) (aget cur 4)])
                                           ))))

(defn filter-all-display [env]
  (let [itr1 (magic-iterator (index env :todo) #js [0 1 nil])
        itr2 (magic-iterator (index env :filter) #js [nil nil 0])
        filter (constant-filter 3 2 "all")
        join-itr (join-iterator #js [itr1 itr2 filter])]
    (transform (aget env "ctx") join-itr (fn [cur remember! forget! pretend!]
                                           (pretend! "todo-displayed" #js [(aget cur 0)])
                                           ))))


(defn filter-not-all-display [env]
  (let [itr1 (magic-iterator (index env :todo) #js [0 1 nil])
        itr2 (magic-iterator (index env :filter) #js [nil nil 0])
        itr3 (magic-iterator (index env :todo-completed) #js [0 nil 1])
        join-itr (join-iterator #js [itr1 itr2 itr3])]
    (transform (aget env "ctx") join-itr (fn [cur remember! forget! pretend!]
                                           (pretend! "todo-displayed" #js [(aget cur 0)])
                                           ))))

(defn draw-checkbox [env]
  (let [itr1 (magic-iterator (index env :todo-displayed) #js [0 nil nil nil nil nil])
        itr2 (magic-iterator (index env :todo) #js [0 1 nil nil nil nil])
        itr3 (magic-iterator (index env :todo-completed) #js [0 nil 1 nil nil nil])
        active?-itr (infinirator 6
                                 (fn [cur key]
                                   (aset cur 3
                                         (if (identical? "completed" (aget key 2))
                                           "checked"
                                           "")))
                                 (fn [cur]
                                   (aset cur 3 false))
                                 (fn [cur]
                                   (aset cur 3 nil)))
        child-id-itr (infinirator 6
                                  (fn [cur key]
                                    (aset cur 4 (str "todo-checkbox" (aget key 0))))
                                  (fn [cur]
                                    (aset cur 4 false))
                                  (fn [cur]
                                    (aset cur 4 nil)))
        parent-id-itr (infinirator 6
                                   (fn [cur key]
                                     (aset cur 5 (str "todo" (aget key 0))))
                                   (fn [cur]
                                     (aset cur 5 false))
                                   (fn [cur]
                                     (aset cur 5 nil)))
        join-itr (join-iterator #js [itr1 itr2 itr3 active?-itr child-id-itr parent-id-itr])]
    (transform (aget env "ctx") join-itr (fn [cur remember! forget! pretend!]
                                           (pretend! "elem-child" #js [(aget cur 5) -1 (aget cur 4)])
                                           (pretend! "elem" #js [(aget cur 4) "input"])
                                           (pretend! "elem-attr" #js [(aget cur 4) "type" "checkbox"])
                                           (pretend! "elem-attr" #js [(aget cur 4) "checked" (aget cur 3)])
                                           (pretend! "elem-event" #js [(aget cur 4) "onChange" "todo-checkbox" (aget cur 0)])
                                           ))))

(defn draw-todo-item [env]
  (let [itr1 (magic-iterator (index env :todo-displayed) #js [0 nil nil nil nil])
        itr2 (magic-iterator (index env :todo) #js [0 1 nil nil nil])
        itr3 (magic-iterator (index env :todo-editing) #js [0 nil 1 nil nil])
        filter (constant-filter 5 2 "saved")
        child-id-itr (infinirator 5
                                  (fn [cur key]
                                    (aset cur 3 (str "todo" (aget key 0))))
                                  (fn [cur]
                                    (aset cur 3 false))
                                  (fn [cur]
                                    (aset cur 3 nil)))
        remove-id-itr (infinirator 5
                                   (fn [cur key]
                                     (aset cur 4 (str "todo-remove" (aget key 0))))
                                   (fn [cur]
                                     (aset cur 4 false))
                                   (fn [cur]
                                     (aset cur 4 nil)))
        join-itr (join-iterator #js [itr1 itr2 itr3 filter child-id-itr remove-id-itr])]
    (transform (aget env "ctx") join-itr (fn [cur remember! forget! pretend!]
                                           (pretend! "elem-child" #js ["todo-list" (aget cur 0) (aget cur 3)])
                                           (pretend! "elem" #js [(aget cur 3) "li"])
                                           (pretend! "elem-event" #js [(aget cur 3) "onDoubleClick" (aget cur 3) nil])
                                           (pretend! "elem-child" #js [(aget cur 3) 0 (str (aget cur 3) "-0")])
                                           (pretend! "elem-text" #js [(str (aget cur 3) "-0") (aget cur 1)])
                                           (pretend! "elem-child" #js [(aget cur 3) 1 (aget cur 4)])
                                           (pretend! "elem" #js [(aget cur 4) "button"])
                                           (pretend! "elem-child" #js [(aget cur 4) 0 (str (aget cur 4) "-0")])
                                           (pretend! "elem-text" #js [(str (aget cur 4) "-0") "x"])
                                           (pretend! "elem-event" #js [(aget cur 4) "onClick" nil nil])
                                           ))))

(defn draw-todo-item-editing [env]
  (let [itr1 (magic-iterator (index env :todo-displayed) #js [0 nil nil nil nil])
        itr2 (magic-iterator (index env :todo) #js [0 1 nil nil nil])
        itr3 (magic-iterator (index env :todo-editing) #js [0 nil 1 nil nil])
        filter (constant-filter 5 2 "editing")
        join-itr (join-iterator #js [itr1 itr2 itr3 filter])]
    (transform (aget env "ctx") join-itr (fn [cur remember! forget! pretend!]
                                           (pretend! "elem-child" #js ["todo-list" (aget cur 0) "todo-editor"])
                                           (pretend! "elem" #js ["todo-editor" "input"])
                                           (pretend! "elem-attr" #js ["todo-editor" "defaultValue" (aget cur 1)])
                                           (pretend! "elem-event" #js ["todo-editor" "onChange" "todo-editor" (aget cur 0)])
                                           (pretend! "elem-event" #js ["todo-editor" "onBlur" "todo-editor" (aget cur 0)])
                                           (pretend! "elem-event" #js ["todo-editor" "onKeyDown" "todo-editor" (aget cur 0)])
                                           ))))


(defn draw-todo-to-add [env]
  (let [itr1 (magic-iterator (index env :todo-to-add) #js [0])
        join-itr (join-iterator #js [itr1])]
    (transform (aget env "ctx") join-itr (fn [cur remember! forget! pretend!]
                                           (pretend! "elem-child" #js ["app" 1 "todo-input"])
                                           (pretend! "elem" #js ["todo-input" "input"])
                                           (pretend! "elem-attr" #js ["todo-input" "defaultValue" (aget cur 0)])
                                           (pretend! "elem-event" #js ["todo-input" "onChange" nil nil])
                                           (pretend! "elem-event" #js ["todo-input" "onKeyDown" nil nil])
                                           ))))

(defn draw-interface [env]
  (let [itr1 (magic-iterator (index env :current-toggle) #js [0])
        join-itr (join-iterator #js [itr1])]
    (transform (aget env "ctx") join-itr (fn [cur remember! forget! pretend!]
                                           (pretend! "elem" #js ["app" "div"])

                                           (pretend! "elem-child" #js ["app" 0 "todo-header"])
                                           (pretend! "elem" #js ["todo-header" "h1"])
                                           (pretend! "elem-child" #js ["todo-header" 0 "todo-header-0"])
                                           (pretend! "elem-text" #js ["todo-header-0" "Todos"])

                                           (pretend! "elem-child" #js ["app" 1 "toggle-all"])
                                           (pretend! "elem" #js ["toggle-all" "input"])
                                           (pretend! "elem-attr" #js ["toggle-all" "type" "checkbox"])
                                           (pretend! "elem-attr" #js ["toggle-all" "checked" (aget cur 0)])
                                           (pretend! "elem-event" #js ["toggle-all" "onChange" nil nil])
                                           (pretend! "elem-event" #js ["toggle-all" "onKeyDown" nil nil])

                                           (pretend! "elem-child" #js ["app" 2 "add-todo"])
                                           (pretend! "elem" #js ["add-todo" "button"])
                                           (pretend! "elem-event" #js ["add-todo" "onClick" "add-todo" nil])
                                           (pretend! "elem-child" #js ["add-todo" 0 "add-todo-0"])
                                           (pretend! "elem-text" #js ["add-todo-0" "add"])

                                           (pretend! "elem-child" #js ["app" 3 "todo-list"])
                                           (pretend! "elem" #js ["todo-list" "ul"])


                                           (pretend! "elem-child" #js ["app" 4 "filter-all"])
                                           (pretend! "elem" #js ["filter-all" "button"])
                                           (pretend! "elem-event" #js ["filter-all" "onClick" "filter-all" nil])
                                           (pretend! "elem-child" #js ["filter-all" 0 "filter-all-0"])
                                           (pretend! "elem-text" #js ["filter-all-0" "all"])

                                           (pretend! "elem-child" #js ["app" 4 "filter-active"])
                                           (pretend! "elem" #js ["filter-active" "button"])
                                           (pretend! "elem-event" #js ["filter-active" "onClick" "filter-active" nil])
                                           (pretend! "elem-child" #js ["filter-active" 0 "filter-active-0"])
                                           (pretend! "elem-text" #js ["filter-active-0" "active"])

                                           (pretend! "elem-child" #js ["app" 4 "filter-completed"])
                                           (pretend! "elem" #js ["filter-completed" "button"])
                                           (pretend! "elem-event" #js ["filter-completed" "onClick" "filter-completed" nil])
                                           (pretend! "elem-child" #js ["filter-completed" 0 "filter-completed-0"])
                                           (pretend! "elem-text" #js ["filter-completed-0" "completed"])

                                           ))))

(defn add-todo [env]
  (let [itr1 (magic-iterator (index env :todo-added) #js [0 nil nil])
        itr2 (magic-iterator (index env :time) #js [nil 0 nil])
        itr3 (magic-iterator (index env :todo-to-add) #js [nil nil 0])
        join-itr (join-iterator #js [itr1 itr2 itr3])]
    (transform (aget env "ctx") join-itr (fn [cur remember! forget! pretend!]
                                           (remember! "todo" #js [(aget cur 1) (aget cur 2)])
                                           (remember! "todo-editing" #js [(aget cur 1) "saved"])
                                           (remember! "todo-completed" #js [(aget cur 1) "active"])
                                           ))))




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
