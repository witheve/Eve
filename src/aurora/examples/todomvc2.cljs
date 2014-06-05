(ns aurora.examples.todomvc2
  (:require [aurora.btree :as btree :refer [tree iterator least greatest key-lt key-lte key-gt key-gte key-compare key=]]
            [aurora.language :refer [knowledge compile]]
            [aurora.util.core :refer [now]]
            [aurora.syntax :refer [know remember draw func change index forget-when]]
            [aurora.runtime :refer [pre-compile re-run env] :as runtime]
            [aurora.editor.dom :as dom]
            [aurora.editor.ReactDommy :as dommy])
  (:require-macros [aurora.macros :refer [typeof ainto perf-time rules]]))

(defn fill-todos [env num]
  (dotimes [x num]
    (know env "todo" #js ["todo-id" "text"] #js [x (str "foo" x)])
    (know env "todo-editing" #js ["todo-id" "editing?"] #js [x "saved"])
    (know env "todo-completed" #js ["todo-id" "completed?"] #js [x "active"]))
  )

(defn click! [env elem]
  (.assoc! (index env "ui/onClick") #js[elem] 0))

(defn change! [env elem ]
  (.assoc! (index env "ui/onChange") #js[elem "foo bar"] 0))

(defn blur! [elem]
  (.assoc! (index env "ui/onBlur") #js[elem] 0))

(defn defaults [env]
  ;((aget (aget env "ctx") "remember!") "todo-to-add" #js ["hey"])
  (know env "todo-to-add" #js ["value"] #js [""])
  (know env "current-toggle" #js ["value"] #js ["false"])
  (know env "todo-to-edit" #js ["value"] #js [""])
  (know env "filter" #js ["filter"] #js ["all"])

  (remember env "todo-to-add" #js ["value"] #js [""])
  (remember env "current-toggle" #js ["value"] #js ["false"])
  (remember env "todo-to-edit" #js ["value"] #js [""])
  (remember env "filter" #js ["filter"] #js ["all"])
  )

(def todomvc (env))

(rules todomvc

       (rule todo-input-changes
             (when "ui/onChange" {:elem-id "todo-input" :value 'neue})
             (change "todo-to-add" {:value 'v} {:value 'neue}))

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
             (func 'final "v == \"false\" ? \"true\" : \"false\" ")
             (change "current-toggle" {:value 'v} {:value 'final}))

       (rule toggle-all-changed-update
             (when "ui/onChange" {:elem-id "toggle-all" :value 'value})
             (when "current-toggle" {:value 'v})
             (func 'final "v == \"false\" ? \"completed\" : \"active\" ")
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

       (rule filter-display
             (when "todo" {:todo-id 'todo :text 'text})
             (when "todo-completed" {:todo-id 'todo :completed? 'complete?})
             (when "filter" {:filter 'complete?})
             (pretend "todo-displayed" {:todo-id 'todo}))

       (rule draw-checkbox
             (when "todo-displayed" {:todo-id 'todo})
             (when "todo-completed" {:todo-id 'todo :completed? 'complete})
             (func 'active?  "complete == \"completed\" ? \"checked\" : \"\"")
             (func 'child-id "\"todo-checkbox-\" + todo")
             (func 'parent-id "\"todo-\" + todo")
             (pretend "ui/child" {:parent-id 'parent-id :pos -1 :child-id 'child-id})
             (draw [:input {:id 'child-id
                            :type "checkbox"
                            :checked 'active?
                            :event-key "todo-checkbox"
                            :entity 'todo
                            :events ["onChange"]}]))

       (rule draw-todo-item
             (when "todo-displayed" {:todo-id 'todo})
             (when "todo" {:todo-id 'todo :text 'text})
             (when "todo-editing" {:todo-id 'todo :editing? "saved"})
             (when "todo-completed" {:todo-id 'todo :completed? 'complete})
             (func 'removeId "\"todo-remove-\" + todo")
             (func 'todoId "\"todo-\" + todo")
             (func 'todoLabelId "\"todolabel-\" + todo")
             (pretend "ui/child" {:parent-id "todo-list" :pos 'todo :child-id 'todoId})
             (draw [:li {:id 'todoId
                         :className 'complete
                         :event-key "edit-todo"
                         :entity 'todo
                         :events ["onDoubleClick"]}
                    [:label {:id 'todoLabelId} 'text]
                    [:button {:id 'removeId
                              :event-key "remove-todo"
                              :entity 'todo
                              :events ["onClick"]}
                     ]])
             )

       (rule remove-todo-on-click
             (when "ui/custom" {:event-key "remove-todo" :entity 'todo})
             (forget-when "todo" {:todo-id 'todo :text :any})
             (forget-when "todo-editing" {:todo-id 'todo :editing? :any})
             (forget-when "todo-completed" {:todo-id 'todo :completed? :any}))

       (rule todo-item-checkbox-change
             (when "ui/custom" {:event-key "todo-checkbox" :entity 'todo})
             (func 'neueComplete  "complete == \"completed\" ? \"active\" : \"completed\"")
             (change "todo-completed" {:todo-id 'todo :completed? 'complete}
                     {:todo-id 'todo :completed? 'neueComplete}))

       (rule draw-todo-item-editor
             (when "todo-displayed" {:todo-id 'todo})
             (when "todo" {:todo-id 'todo :text 'cur})
             (when "todo-editing" {:todo-id 'todo :editing? "editing"})
             (when "todo-to-edit" {:value 'value})
             (pretend "ui/child" {:parent-id "todo-list" :pos 'todo :child-id "todo-editor-wrapper"})
             (draw [:li {:id "todo-editor-wrapper"}
                    [:input {:id "todo-editor"
                             :className "todo-editor"
                             :type "text"
                             :value 'value
                             :placeholder "What needs to be done?"
                             :event-key "todo-editor"
                             :entity 'todo
                             :events ["onBlur" "onChange" "onKeyDown"]}]]))

       (rule draw-todo-input
             (when "todo-to-add" {:value 'cur})
             (pretend "ui/child" {:parent-id "input-header" :pos 1 :child-id "todo-input"})
             (draw [:input {:id "todo-input"
                            :className "new-todo"
                            :placeholder "What needs to be done?"
                            :type "text"
                            :value 'cur
                            :events ["onChange" "onKeyDown"]}]))

       (rule filter-active
             (when "filter" {:filter 'filter})
             (func 'elem "\"filter-\" + filter")
             (pretend "ui/attr" {:elem-id 'elem :attr "className" :value "active"})
             )

       (rule draw-interface
             (when "current-toggle" {:value 'toggle})
             (draw [:div {:id "running-wrapper" :className "running-wrapper"}
                    [:div {:id "app" :className "todoapp"}
                     [:h1 {:id "todo-header"} "Todos"]
                     [:header {:id "input-header"}
                      [:input {:id "toggle-all"
                               :className "toggle-all"
                               :event-key "toggle-all"
                               :checked 'toggle
                               :events ["onChange"]
                               :type "checkbox"}]]
                     [:ul {:id "todo-list" :className "todo-list"}]
                     [:div {:id "footer" :className "footer"}
                      [:ul {:id "filters" :className "filters"}
                       [:li {:id "filter1"} [:button {:id "filter-all" :event-key "filter-all" :events ["onClick"]} "all"]]
                       [:li {:id "filter2"} [:button {:id "filter-active" :event-key "filter-active" :events ["onClick"]} "active"]]
                       [:li {:id "filter3"} [:button {:id "filter-completed" :event-key "filter-completed" :events ["onClick"]} "completed"]]]]]]))

       (rule enter-todo-input
             (when "ui/onKeyDown" {:elem-id "todo-input" :key 13})
             (pretend "todo-added" {:x 0}))

       (rule double-click-to-edit
             (when "ui/custom" {:event-key "edit-todo" :entity 'todo})
             (when "todo" {:todo-id 'todo :text 'text})
             (change "todo-to-edit" {:value '_} {:value 'text})
             (change "todo-editing" {:todo-id 'todo :editing? 'v} {:todo-id 'todo :editing? "editing"}))

       (rule todo-editing
             (when "ui/onChange" {:elem-id "todo-editor" :value 'text})
             (change "todo-to-edit" {:value '_} {:value 'text}))

       (rule enter-todo-editor
             (when "ui/onKeyDown" {:elem-id "todo-editor" :key 13})
             (pretend "commit-todo" {:x 0}))

       (rule blur-todo-editor
             (when "ui/onBlur" {:elem-id "todo-editor"})
             (pretend "commit-todo" {:x 0}))

       (rule commit-todo
             (when "commit-todo" {:x 0})
             (when "todo-to-edit" {:value 'value})
             (change "todo-editing"
                     {:todo-id 'todo :editing? "editing"}
                     {:todo-id 'todo :editing? "saved"})
             (change "todo"
                     {:todo-id 'todo :text 'text}
                     {:todo-id 'todo :text 'value}))

       (rule add-todo
             (when "todo-added" {:x '_})
             (when "time" {:time 'time})
             (when "todo-to-add" {:value 'to-add})
             (change "todo-to-add" {:value 'to-add} {:value ""})
             (remember "todo" {:todo-id 'time :text 'to-add})
             (remember "todo-editing" {:todo-id 'time :editing? "saved"})
             (remember "todo-completed" {:todo-id 'time :completed? "acitve"})))


(defn run []
  (let [todomvc (pre-compile todomvc)]
    (perf-time
     (do (defaults todomvc)
       (fill-todos todomvc 10)
       (re-run todomvc)))))

(comment

  (run)

  (.-kind->name->fields->index todomvc)
  (index todomvc "todo-displayed")

  (let [todomvc (pre-compile todomvc)]
    (perf-time
     (do (defaults todomvc)
       (init-std-lib todomvc)
       (fill-todos todomvc 200)
       (re-run todomvc))))

  (perf-time (re-run todomvc))

  (do
    (defaults todomvc)
    (runtime/init-std-lib todomvc)
    (fill-todos todomvc 200)
    (def compiled (perf-time (compile todomvc)))
    (prep-compiled compiled)
    (perf-time
     (js/console.profile)
     (dotimes [i 1]
       (do
         (perf-time
          (.quiesce compiled todomvc (fn [kn]
                                       (let [tree (perf-time (runtime/rebuild-tree todomvc (aget (.-state todomvc) "queue!")))
                                             container (dom/$ "body")
                                             dommied (perf-time (dommy/node tree))
                                             ]
                                         (when container
                                           (perf-time (js/React.renderComponent dommied container))
                                           ;(perf-time (do
                                           ;             (dom/empty container)
                                           ;             (dom/append container tree)))
                                           )
                                         ;
                                         )
                                       )))
         (aset (.-state todomvc) "queued" false)
         ))
     (js/console.profileEnd)))

  (for [[_ x] (.-kind->name->fields->index todomvc)
        [name indexes] x]
    [name (count indexes)])

  (get-in (.-kind->name->fields->index todomvc) ["know" ""])

(let [program (env)]
  (rules program

;;          (rule draw-incr
;;                (when "incr" {:value value})
;;                (draw [:button {:id "incr" :events ["onClick"]} "increment: " 'value]))

;;          (rule clicked
;;                (when "ui/onClick" {:elem-id "incr"})
;;                (func 'new-val "value + 1")
;;                (change "incr" {:value 'value} {:value 'new-val}))

                      (rule this-is-awesome
                            (func 'cur "cur > -1 ? (cur < 10 ? cur + 1 : 10) : 0")
                            (remember "x-val" {:val 'x})
                            )

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
  (index program "x-val")
  (.-kind->name->fields->index program)
  )




  )
