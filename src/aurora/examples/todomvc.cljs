(ns aurora.examples.todomvc
  (:require [aurora.btree :refer [tree iterator least greatest key-lt key-lte key-gt key-gte key-compare key=]]
            [aurora.join :refer [magic-iterator join-iterator all-join-results transform constant-filter context pretend-tree fixpoint-tick infinirator]])
  (:require-macros [aurora.macros :refer [typeof ainto perf-time]]))

(defn index [env n]
  (aget (aget env "indexes") (name n)))

(defn init []
  (let [env #js {}
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
                     :clicked (pretend-tree 20)
                     :changed (pretend-tree 20)
                     :blurred (pretend-tree 20)
                     :elem (pretend-tree 20)
                     :elem-child (pretend-tree 20)
                     :elem-attr (pretend-tree 20)
                     :elem-text (pretend-tree 20)
                     :elem-style (pretend-tree 20)
                     :elem-event (pretend-tree 20)
                     :time (pretend-tree 20)}]
    (aset env "ctx" (context indexes))
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
  (.assoc! (index env :clicked) #js[elem] 0))

(defn change! [env elem ]
  (.assoc! (index env :changed) #js[elem "foo bar"] 0))

(defn blur! [elem]
  (.assoc! (index env :blurred) #js[elem] 0))

(defn defaults [env]
  ((aget (aget env "ctx") "remember!") "todo-to-add" #js ["hey"])
  (.assoc! (index env :current-toggle) #js ["false"] nil)
  (.assoc! (index env :todo-to-edit) #js ["hi"] nil)
  (.assoc! (index env :filter) #js ["all"] nil))

(defn todo-input-changes [env]
  (let [itr1 (magic-iterator (index env :changed) #js [0 1 nil])
        itr2 (magic-iterator (index env :todo-to-add) #js [nil nil 0])
        filter (constant-filter 3 0 "todo-input")
        join-itr (join-iterator #js [itr1 filter itr2])]
    (transform (aget env "ctx") join-itr (fn [cur remember! forget! pretend!]
                                           (forget! "todo-to-add" #js [ (aget cur 2)])
                                           (remember! "todo-to-add" #js [ (aget cur 1)])
                                           )))
  )

(defn add-todo-clicked [env]
  (let [itr1 (magic-iterator (index env :clicked) #js [0])
        filter (constant-filter 1 0 "add-todo")
        join-itr (join-iterator #js [itr1 filter])]
    (transform (aget env "ctx") join-itr (fn [cur remember! forget! pretend!]
                                           (pretend! "todo-added" #js [0])
                                           )))
  )

(defn filter-active-clicked [env]
  (let [itr1 (magic-iterator (index env :clicked) #js [0 nil])
        itr2 (magic-iterator (index env :filter) #js [nil 0])
        filter (constant-filter 2 0 "filter-active")
        join-itr (join-iterator #js [itr1 filter itr2])]
    (transform (aget env "ctx") join-itr (fn [cur remember! forget! pretend!]
                                           (forget! "filter" #js [(aget cur 1)])
                                           (remember! "filter" #js ["active"])
                                           )))
  )


(defn filter-completed-clicked [env]
  (let [itr1 (magic-iterator (index env :clicked) #js [0 nil])
        itr2 (magic-iterator (index env :filter) #js [nil 0])
        filter (constant-filter 2 0 "filter-completed")
        join-itr (join-iterator #js [itr1 filter itr2])]
    (transform (aget env "ctx") join-itr (fn [cur remember! forget! pretend!]
                                           (forget! "filter" #js [(aget cur 1)])
                                           (remember! "filter" #js ["completed"])
                                           )))
  )


(defn filter-all-clicked [env]
  (let [itr1 (magic-iterator (index env :clicked) #js [0 nil])
        itr2 (magic-iterator (index env :filter) #js [nil 0])
        filter (constant-filter 2 0 "filter-all")
        join-itr (join-iterator #js [itr1 filter itr2])]
    (transform (aget env "ctx") join-itr (fn [cur remember! forget! pretend!]
                                           (forget! "filter" #js [(aget cur 1)])
                                           (remember! "filter" #js ["all"])
                                           )))
  )


(defn toggle-all-changed-track [env]
  (let [itr1 (magic-iterator (index env :changed) #js [0 1 nil])
        itr2 (magic-iterator (index env :current-toggle) #js [nil nil 0])
        filter (constant-filter 3 0 "toggle-all")
        join-itr (join-iterator #js [itr1 filter itr2])]
    (transform (aget env "ctx") join-itr (fn [cur remember! forget! pretend!]
                                           (forget! "current-toggle" #js [(aget cur 2)])
                                           (remember! "current-toggle" #js [ (aget cur 1)])
                                           ))))

(defn toggle-all-changed-update [env]
  (let [itr1 (magic-iterator (index env "changed") #js [0 1 nil nil nil])
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
  (let [itr1 (magic-iterator (index env :clicked) #js [0 nil nil])
        itr2 (magic-iterator (index env :todo-completed) #js [nil 0 1])
        filter (constant-filter 3 2 "completed")
        join-itr (join-iterator #js [itr1 filter itr2])]
    (transform (aget env "ctx") join-itr (fn [cur remember! forget! pretend!]
                                           (pretend! "todo-removed" #js [ (aget cur 1)])
                                           ))))

(defn remove-todo [env]
  (let [itr1 (magic-iterator (index env :todo-removed) #js [0 nil nil nil nil])
        itr2 (magic-iterator (index env :todo) #js [nil 0 1 nil nil])
        itr3 (magic-iterator (index env :todo-editing) #js [nil 0 nil 1])
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
                                           (pretend! "elem-child" #js [(aget cur 5) (aget cur 4) -1])
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
                                           (pretend! "elem-child" #js ["todo-list" (aget cur 3) -1])
                                           (pretend! "elem" #js [(aget cur 4) "li"])
                                           (pretend! "elem-event" #js [(aget cur 4) "onDoubleClick" (aget cur 3) nil])
                                           (pretend! "elem-child" #js [(aget cur 3) (str (aget cur 3) "-0") 0])
                                           (pretend! "elem-text" #js [(str (aget cur 3) "-0") (aget cur 1)])
                                           (pretend! "elem-child" #js [(aget cur 3) (str (aget cur 3) "-1") 1])
                                           (pretend! "elem" #js [(str (aget cur 3) "-1") "button"])
                                           (pretend! "elem-child" #js [(str (aget cur 3) "-1") (str (aget cur 3) "-1-0") 0])
                                           (pretend! "elem-text" #js [(str (aget cur 3) "-1-0") "x"])
                                           (pretend! "elem-event" #js [(str (aget cur 3) "-1") "onClick" nil nil])
                                           ))))

(defn run []
  (let [env (init)]
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
                     ))
    (aget env "indexes"))
  )

(comment
  (perf-time (run))
  (perf-time (dotimes [x 30]
               (run)))



  )
