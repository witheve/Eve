(ns aurora.examples.todomvc2
  (:require [aurora.btree :as btree :refer [tree iterator least greatest key-lt key-lte key-gt key-gte key-compare key=]]
            [aurora.language :refer [knowledge compile]]
            [aurora.util.core :refer [now]]
            [aurora.syntax :refer [know remember draw func change index]]
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
  (know env "todo-to-add" #js ["value"] #js ["hey"])
  (know env "current-toggle" #js ["value"] #js ["false"])
  (know env "todo-to-edit" #js ["value"] #js ["hi"])
  (know env "filter" #js ["filter"] #js ["all"])

  (remember env "todo-to-add" #js ["value"] #js ["hey"])
  (remember env "current-toggle" #js ["value"] #js ["false"])
  (remember env "todo-to-edit" #js ["value"] #js ["hi"])
  (remember env "filter" #js ["filter"] #js ["all"])
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
                            :checked active?
                            :event-key "todo-checkbox"
                            :entity 'todo
                            :events ["onChange"]}]))

       (rule draw-todo-item
             (when "todo-displayed" {:todo-id 'todo})
             (when "todo" {:todo-id 'todo :text 'text})
             (when "todo-editing" {:todo-id 'todo :editing? "saved"})
             (func 'removeId "\"todo-remove-\" + todo")
             (func 'todoId "\"todo-\" + todo")
             (pretend "ui/child" {:parent-id "todo-list" :pos 'todo :child-id 'todoId})
             (draw [:li {:id 'todoId
                         :event-key "edit-todo"
                         :entity 'todo
                         :events ["onDoubleClick"]}
                    'text
                    [:button {:id 'removeId
                              :event-key "remove-todo"
                              :entity 'todo
                              :events ["onClick"]}
                     "x"]])
             )

       (rule draw-todo-item-editor
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

       (rule draw-todo-input
             (when "todo-to-add" {:value 'cur})
             (pretend "ui/child" {:parent-id "app" :pos 1 :child-id "todo-input"})
             (draw [:input {:id "todo-input"
                            :type "text"
                            :defaultValue 'cur
                            :events ["onChange" "onKeyDown"]}]))

       (rule draw-interface
             (when "current-toggle" {:value 'toggle})
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



(comment

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
