(ns aurora.editor.core
  (:require [aurora.btree :as btree :refer [tree iterator least greatest key-lt key-lte key-gt key-gte key-compare key=]]
            [aurora.language :refer [knowledge compile]]
            [aurora.util.core :refer [now new-id]]
            [aurora.syntax :as syntax :refer [know remember draw draw* change* func change index forget-when]]
            [aurora.runtime :refer [pre-compile re-run env] :as runtime]
            [aurora.editor.kn-manager :as manager]
            [aurora.editor.dom :as dom]
            [aurora.editor.ReactDommy :as dommy])
  (:require-macros [aurora.macros :refer [typeof ainto perf-time perf-time-named rules rules*]]))

(defn madlibs->facts [env mls]
  (let [strs (array)
        vars (array)
        counts (array)]
    (doseq [[k vs] mls
            :let [k (name k)
                  _ (.push counts #js [k (count (filter keyword? vs))])
                  placeholder-pos (array 0)]
            [i v] (map-indexed vector vs)]
      (if (string? v)
        (.push strs #js [k i v])
        (do
          (.push vars #js [k i (name v) (aget placeholder-pos 0)])
          (aset placeholder-pos 0 (+ 1 (aget placeholder-pos 0)))
          )))
    (.get-or-create-index env "know" "madlib strings" #js ["madlib-id" "pos" "value"])
    (.get-or-create-index env "know" "madlib placeholders" #js ["madlib-id" "pos" "field" "placeholder-pos"])
    (.get-or-create-index env "know" "madlib placeholder counts" #js ["madlib-id" "count"])

    (.add-facts env "know" "madlib strings" #js ["madlib-id" "pos" "value"] strs)
    (.add-facts env "know" "madlib placeholders" #js ["madlib-id" "pos" "field" "placeholder-pos"] vars)
    (.add-facts env "know" "madlib placeholder counts" #js ["madlib-id" "count"] counts)
    env))

(defn defaults [env]
  (madlibs->facts env
                  {
                   :clauses ["Rule" :rule-id "has a" :when|know|remember|forget "clause for" :name "with ID" :clause-id]
                   :clause-fields ["Clause" :clause-id "has a" :constant|variable "placeholder for" :key "with value" :val]
                   "editor rules" ["Project" :project-id "has rule with ID" :rule-id ]
                   "editor clauses" ["Editor Rule" :rule-id "has a" :type "clause for" :madlib-id "with ID" :clause-id]
                   "editor clause fields" ["Editor Clause" :clause-id "has a" :constant|variable|expression "placeholder for" :key "with value" :val]
                   :=function [:variable " = " :js]
                   "change clauses" ["Change" :from|to "for" :rule-id ":" :clause-id "on table " :table "with sub-id" :sub-clause-id]
                   "draw madlib" ["Draw madlib" :madlib-id "in" :container "for clause" :clause-id]
                   "madlib strings" ["The madlib for" :madlib-id "has" :value "at position" :pos]
                   "madlib placeholders" ["The madlib for" :madlib-id "has a placeholder with value" :field "at position" :pos]
                   "ui/child" [:child-id "is a child of" :parent-id "with position" :pos]
                   "ui/elem" [:elem-id "is a" :tag "element"]
                   "ui/attr" [:elem-id "has a" :attr "attribute with value" :value]
                   "ui/style" [:elem-id "has a" :attr "style of" :value]
                   "ui/event-listener" [:elem-id "is listening for" :event "events with key" :event-key "and entity" :entity]
                   "ui/text" [:elem-id "is a text node containing" :text]

                   :defaults ["setting defaults"]
                   "time" ["the current time is" :time]

                   "interval" [:in "is a number between" :lo "and" :hi]

                   "ui/onClick" [:elem-id "is clicked"]
                   "ui/onChange" [:elem-id "is changed to" :value]
                   "ui/onBlur" [:elem-id "is blurred"]
                   "ui/onKeyDown" [:key "is pressed in" :elem-id]

                   "ui/custom" [:event-key "happens on" :entity]

                   ;;todomvc
                   "todo-to-add" ["the todo to add is" :value]
                   "todo-to-edit" ["the todo being edited is" :value]
                   "todo-filter" ["Filter the todos by" :filter]
                   "todo" [:todo-id "has text" :text]
                   "todo-completed" [:todo-id "is" :completed?]
                   "todo-editing" [:todo-id "is being" :editing?]
                   "current-toggle" ["the master toggle is" :value]
                   "todo-added" ["add a new todo"]
                   "todo-removed" ["forget todo" :todo-id]
                   "todo-displayed" [:todo-id "is displayed"]
                   "commit-todo" ["save changes to the todo"]

                   ;;incrementer
                   "incr" ["The counter is " :value]

                   "foo" ["foo" :foo]
                   "bar" ["bar" :bar]

                   })


    (.get-or-create-index env "know" "compiled clauses" #js ["rule-id" "when|know|remember|forget" "clause-id" "name"])
    (.get-or-create-index env "know" "compiled clause-fields" #js ["clause-id" "constant|variable" "key" "val"])
    (.get-or-create-index env "know" "editor rules" #js ["rule-id" "project-id" "timestamp"])
    (.get-or-create-index env "know" "editor clauses" #js ["rule-id" "type" "clause-id" "madlib-id" "timestamp"])
    (.get-or-create-index env "know" "editor clause fields" #js ["clause-id" "constant|variable|expression" "key" "val"])
    (.get-or-create-index env "know" "change clauses" #js ["rule-id" "clause-id" "from|to" "table" "sub-clause-id" "timestamp"])
    (.get-or-create-index env "know" "ui/editor-root" #js ["rule-id" "clause-id" "root" "timestamp"])
    (.get-or-create-index env "know" "ui/editor-elem" #js ["rule-id" "root-clause-id" "clause-id"])
    (.get-or-create-index env "know" "ui/editor-child" #js ["rule-id" "root-clause-id" "clause-id"])
    (.get-or-create-index env "know" "ui/editor-attr" #js ["rule-id" "root-clause-id" "clause-id"])
    (.get-or-create-index env "know" "ui/editor-text" #js ["rule-id" "root-clause-id" "clause-id"])
    (.get-or-create-index env "know" "ui/editor-style" #js ["rule-id" "root-clause-id" "clause-id"])
    (.get-or-create-index env "know" "ui/editor-event-listener" #js ["rule-id" "root-clause-id" "clause-id"])
    (.get-or-create-index env "know" "ui/editor-computed-id" #js ["rule-id" "root-clause-id" "id" "parent" "pos"])

    (.get-or-create-index env "know" "compile project" #js ["project-id"])
    (.get-or-create-index env "know" "control external" #js ["action" "id"])

    (.get-or-create-index env "know" "editing" #js ["id"])
    (.add-facts env "know" "editing" #js ["id"] (array (array "")))


    (.get-or-create-index env "know" "cursor" #js ["clause-id"])
    (.add-facts env "know" "cursor" #js ["clause-id"] (array (array "")))

    (.get-or-create-index env "know" "cursor placeholder pos" #js ["placeholder-pos"])
    (.add-facts env "know" "cursor placeholder pos" #js ["placeholder-pos"] (array (array "")))


    (.get-or-create-index env "know" "rule editor active" #js ["rule-id"])
    (.add-facts env "know" "rule editor active" #js ["rule-id"] (array (array "")))

    (.get-or-create-index env "know" "active project" #js ["project-id"])
    (.add-facts env "know" "active project" #js ["project-id"] (array (array "")))

    (.get-or-create-index env "know" "projects" #js ["project-id" "name"])
    (.add-facts env "know" "projects" #js ["project-id" "name"] (array (array "editor ui" "editor ui")
                                                       (array "example" "example")
                                                       (array "incrementer" "incrementer")
                                                       (array "todomvc" "TodoMVC")
                                                       ))
  env)

(def editor (-> (env)
                (defaults)))

;;editor rules {:rule-id rule}
;;editor clauses {:rule-id rule :clause-id clause :type type :madlib-id madlib}
;;editor clause fields {:clause-id clause :constant|variable|expression 'cv :val 'val :key field}

(rules* editor

        (rule "should compile?"
              (when "compile project" {:project-id 'project})
              (when "editor rules" {:project-id 'project :rule-id 'rule :timestamp '_})
              (pretend "compile rule" {:rule-id 'rule}))

        (rule "when editor clauses"
              (when "compile rule" {:rule-id 'rule})
             (when "editor clauses" {:rule-id rule :clause-id clause :type "when" :madlib-id madlib :timestamp '_})
             (pretend "compiled clauses" {:rule-id rule :when|know|remember|forget "when" :clause-id clause :name madlib}))

       (rule "pretend editor clauses"
              (when "compile rule" {:rule-id 'rule})
             (when "editor clauses" {:rule-id rule :clause-id clause :type "pretend" :madlib-id madlib :timestamp '_})
             (pretend "compiled clauses" {:rule-id rule :when|know|remember|forget "know" :clause-id clause :name madlib}))

        (rule "know editor clauses"
              (when "compile rule" {:rule-id 'rule})
             (when "editor clauses" {:rule-id rule :clause-id clause :type "know" :madlib-id madlib :timestamp '_})
             (pretend "compiled clauses" {:rule-id rule :when|know|remember|forget "know" :clause-id clause :name madlib}))

       (rule "remember editor clauses"
              (when "compile rule" {:rule-id 'rule})
             (when "editor clauses" {:rule-id rule :clause-id clause :type "remember" :madlib-id madlib :timestamp '_})
             (pretend "compiled clauses" {:rule-id rule :when|know|remember|forget "remember" :clause-id clause :name madlib}))

       (rule "forget editor clauses"
              (when "compile rule" {:rule-id 'rule})
             (when "editor clauses" {:rule-id rule :clause-id clause :type "forget" :madlib-id madlib :timestamp '_})
             (pretend "compiled clauses" {:rule-id rule :when|know|remember|forget "forget" :clause-id clause :name madlib}))

       (rule "variable editor clause fields"
             ;;TODO/FIXME: ui clauses don't have a way to get back to the rule, so we just let all clause-fields through
;;              (when "compile rule" {:rule-id 'rule})
;;              (when "editor clauses" {:rule-id rule :clause-id clause :type type :madlib-id madlib})
             (when "editor clause fields" {:clause-id clause :constant|variable|expression "variable" :val 'val :key field})
             (pretend "compiled clause-fields" {:clause-id clause :constant|variable "variable" :val 'val :key field}))

       (rule "constant editor clause fields"
             ;;TODO/FIXME: ui clauses don't have a way to get back to the rule, so we just let all clause-fields through
;;              (when "compile rule" {:rule-id 'rule})
;;              (when "editor clauses" {:rule-id rule :clause-id clause :type 'type :madlib-id madlib})
             (when "editor clause fields" {:clause-id clause :constant|variable|expression "constant" :val 'val :key field})
             (pretend "compiled clause-fields" {:clause-id clause :constant|variable "constant" :val 'val :key field}))

        (rule "change clause"
              (when "compile rule" {:rule-id 'rule})
              (when "change clauses" {:rule-id 'rule :clause-id 'clause :from|to "from" :table 'table :sub-clause-id 'from-id  :timestamp '_})
              (when "change clauses" {:rule-id 'rule :clause-id 'clause :from|to "to" :table 'table :sub-clause-id 'to-id  :timestamp '_})
              (pretend "compiled clauses" {:rule-id 'rule :when|know|remember|forget "when" :clause-id 'from-id :name 'table})
              (pretend "compiled clauses" {:rule-id 'rule :when|know|remember|forget "forget" :clause-id 'from-id :name 'table})
              (pretend "compiled clauses" {:rule-id 'rule :when|know|remember|forget "remember" :clause-id 'to-id :name 'table})
              )

        (rule "translate ui/editor-elem"
              (when "compile rule" {:rule-id 'rule})
             (when "ui/editor-elem" {:rule-id 'rule :clause-id 'clause :root-clause-id '_})
             (pretend "compiled clauses" {:rule-id rule :when|know|remember|forget "know" :clause-id clause :name "ui/elem"}))

        (rule "translate ui/editor-child"
              (when "compile rule" {:rule-id 'rule})
             (when "ui/editor-child" {:rule-id 'rule :clause-id 'clause :root-clause-id '_})
             (pretend "compiled clauses" {:rule-id 'rule :when|know|remember|forget "know" :clause-id 'clause :name "ui/child"}))

        (rule "translate ui/editor-text"
              (when "compile rule" {:rule-id 'rule})
             (when "ui/editor-text" {:rule-id 'rule :clause-id 'clause :root-clause-id '_})
             (pretend "compiled clauses" {:rule-id rule :when|know|remember|forget "know" :clause-id clause :name "ui/text"}))

        (rule "translate ui/editor-attr"
              (when "compile rule" {:rule-id 'rule})
             (when "ui/editor-attr" {:rule-id 'rule :clause-id 'clause :root-clause-id '_})
             (pretend "compiled clauses" {:rule-id rule :when|know|remember|forget "know" :clause-id clause :name "ui/attr"}))

        (rule "translate ui/editor-style"
              (when "compile rule" {:rule-id 'rule})
             (when "ui/editor-style" {:rule-id 'rule :clause-id 'clause :root-clause-id '_})
             (pretend "compiled clauses" {:rule-id rule :when|know|remember|forget "know" :clause-id clause :name "ui/style"}))

        (rule "translate ui/editor-event-listener"
              (when "compile rule" {:rule-id 'rule})
             (when "ui/editor-event-listener" {:rule-id 'rule :clause-id 'clause :root-clause-id '_})
             (pretend "compiled clauses" {:rule-id rule :when|know|remember|forget "know" :clause-id clause :name "ui/event-listener"}))

        (rule "translate ui/editor-computed-id"
              (when "compile rule" {:rule-id 'rule})
              (when "ui/editor-computed-id" {:rule-id 'rule :id 'id :parent 'parent :pos 'pos :root-clause-id '_})
              (func 'neue "parent + \" + \\\"-\\\" + \" + pos")
              (func 'clause "aurora.util.core.new_id()")
              (pretend "compiled clauses" {:rule-id 'rule :when|know|remember|forget "when" :clause-id 'clause :name "=function"})
              (pretend "compiled clause-fields" {:clause-id 'clause :constant|variable "variable" :val 'id :key "variable"})
              (pretend "compiled clause-fields" {:clause-id 'clause :constant|variable "constant" :val 'neue :key "js"})
              )

        )


(rules editor "editor ui"

       (rule "ui root"
             (when "active project" {:project-id 'project})
             (func 'class "project == '' ? 'root root-list' : 'root root-editor'")
             (draw* [:div {:id "ui-root" :className 'class}]))

       (rule "back button click"
             (when "ui/onClick" {:elem-id "back-button"})
             (pretend "control external" {:action "pause" :id 'project})
             (change* "active project" {:project-id 'project} {:project-id ""}))


       (rule "project list"
             (when "active project" {:project-id ""})
             (pretend "ui/child" {:parent-id "ui-root" :pos 0 :child-id "project-selection"})
             (draw* [:div {:id "project-selection" :className "project-selection"}
                     [:ul {:id "project-list"}]
                     [:input {:id "create-project" :className "create-project" :events ["onKeyDown"] :placeholder "new project"}]]))

       (rule "project list item"
             (when "active project" {:project-id ""})
             (when "projects" {:project-id 'project :name 'name})
             (func 'project-copy "project")
             (pretend "ui/child" {:parent-id "project-list" :pos 'name :child-id 'project})
             ;;TODO/FIXME: there is some sort of bug that if 'project is used for both :id and :entity it breaks
             (draw* [:li {:id 'project :events ["onClick"] :event-key "project item" :entity 'project-copy} 'name])
             )

       (rule "project item click"
             (when "ui/custom" {:event-key "project item" :entity 'project})
             (change* "active project" {:project-id '_} {:project-id 'project})
             (pretend "compile project" {:project-id 'project})
             (pretend "control external" {:action "compile" :id 'project})
             )

       (rule "submit project item"
             (when "ui/onKeyDown" {:elem-id "create-project" :key 13})
             (func 'newName "document.querySelector('.create-project').value")
             (when "filter" {:js "newName != ''"})
             (func 'newId "aurora.util.core.new_id()")
             (remember "projects" {:project-id 'newId :name 'newName})
             )


       (rule "active rules"
             (when "active project" {:project-id 'project})
             (when "editor rules" {:rule-id 'rule :project-id 'project :timestamp ts})
             (pretend "editor rule active" {:rule-id 'rule}))


       (rule "editor area"
             (when "active project" {:project-id 'project})
             (when "filter" {:js "project != ''"})
             (pretend "ui/child" {:parent-id "ui-root" :pos 0 :child-id "editor"})
             (draw* [:div {:id "editor" :className "editor"}
                     [:div {:id "controls" :className "controls"}
                      [:button {:id "back-button" :events ["onClick"] :className "ion-ios7-arrow-thin-left"}]]
                     [:div {:id "program-preview" :className "program-preview"}]
                     [:div {:id "rule-list" :className "rules-list" :tabIndex 0 :events ["onKeyDown"]}
                      [:div {:id "rules" :className "rules"}]
                      [:div {:className "rule-controls"}
                       [:button {:id "addrule" :events ["onClick"] :className "ion-ios7-plus-empty"}]]
                      ]
                     ])

             )



       (rule "add rule"
             (when "ui/onClick" {:elem-id "addrule"})
             (when "active project" {:project-id 'project})
             (when "time" {:time 'time})
             (func 'ruleId "aurora.util.core.new_id()")
             (remember "editor rules" {:rule-id 'ruleId :project-id 'project :timestamp time})
             (change "rule editor active" {:rule-id 'prev} {:rule-id 'ruleId}))

       (rule "remove rule"
             (when "ui/onClick" {:elem-id "remove-rule"})
             (when "editor rules" {:rule-id 'prev :project-id 'project :timestamp ts})
             (forget "editor rules" {:rule-id 'prev :project-id 'project :timestamp ts})
             (change "rule editor active" {:rule-id 'prev} {:rule-id ""}))

       (rule "submit rule"
             (when "ui/onClick" {:elem-id "submit-rule"})
             (change "rule editor active" {:rule-id 'prev} {:rule-id ""})
             (change "cursor" {:clause-id 'prev-clause} {:clause-id ""})
             (change "cursor placeholder pos" {:placeholder-pos 'prev-pos} {:placeholder-pos 10000})
             )

       (rule "draw rule editor"
             (when "rule editor active" {:rule-id rule})
             (when "editor rule active" {:rule-id rule})
             (when "editor rules" {:rule-id 'rule :project-id 'project :timestamp 'ts})
             (func 'rid "\"rule-\" + rule")
             (func 'rwid "\"rule-when-\" + rule")
             (func 'rdid "\"rule-do-\" + rule")
             (pretend "ui/child" {:parent-id "rules" :pos ts :child-id 'rid})
             (draw* [:table {:id 'rid :className "rule"}
                     [:tbody {}
                      [:tr {}
                       [:td {:id 'rwid :className "whens"}
                        [:button {:id "add-clause-button" :events ["onClick"]} "+"]
                        [:button {:id "remove-clause-button" :events ["onClick"]} "-"]
                        ]
                       [:td {:className "between"}]
                       [:td {:id 'rdid :className "dos"}]
                       [:td {:className "rule-editor-actions"}
                        [:button {:id "submit-rule" :events ["onClick"] :className "ion-ios7-checkmark-empty"} ]
                        [:button {:id "remove-rule" :events ["onClick"] :className "ion-ios7-trash-outline"} ]
                        ]
                       ]
                      ]])
             )

       (rule "remove clause click"
             (when "ui/onClick" {:elem-id "remove-clause-button"})
             (when "cursor" {:clause-id 'clause})
             (func 'foo "console.log('remove: ' + clause)")
             (pretend "remove clause" {:clause-id 'clause}))

       (rule "set rule editor"
             (when "ui/custom" {:event-key "edit rule" :entity 'rule})
             (when "active project" {:project-id 'project})
             (change "rule editor active" {:rule-id 'prev} {:rule-id 'rule})
             ;;compile the program
             (pretend "compile project" {:project-id 'project})
             (pretend "control external" {:action "compile" :id 'project})
             )

       (rule "draw rule"
             (when "rule editor active" {:rule-id editingRule})
             (when "editor rule active" {:rule-id rule})
             (when "filter" {:js "rule != editingRule"})
             (when "editor rules" {:rule-id rule :project-id 'project-id :timestamp ts})
             (func 'rid "\"rule-\" + rule")
             (func 'rwid "\"rule-when-\" + rule")
             (func 'rdid "\"rule-do-\" + rule")
             (pretend "ui/child" {:parent-id "rules" :pos ts :child-id 'rid})
             (draw* [:table {:id 'rid :className "rule" :events ["onClick"] :event-key "edit rule" :entity 'rule}
                     [:tbody {}
                      [:tr {}
                       [:td {:id 'rwid :className "whens"}]
                       [:td {:className "between"}]
                       [:td {:id 'rdid :className "dos"}]]]])
             )

       (rule "draw clause"
             (when "editor rule active" {:rule-id rule})
             (when "editor clauses" {:rule-id rule :type type :clause-id clause :madlib-id name  :timestamp 'timestamp})
             (func 'cid "\"clause-\" + clause")
             (func 'rid "(type == \"when\" ? \"rule-when-\" : \"rule-do-\") + rule")
             (pretend "ui/child" {:parent-id rid :pos 'timestamp :child-id cid})
             (draw* [:div {:id 'cid :className "clause" :events ["onClick"] :event-key "activate clause" :entity 'clause}
                    [:span {:className "keyword"} 'type " "]
                    ]))


       ;;******************************************************************************
       ;; Clause ops
       ;;******************************************************************************

       (rule "remove clause"
             (when "remove clause" {:clause-id 'clause})
             (when "editor clauses" {:rule-id rule :type type :clause-id clause :madlib-id name  :timestamp 'timestamp})
             (forget "editor clauses" {:rule-id rule :type type :clause-id clause :madlib-id name  :timestamp 'timestamp}))

       (rule "remove clause fields"
             (when "remove clause" {:clause-id 'clause})
             (when "editor clause fields" {:clause-id clause :constant|variable|expression 'cv :val 'val :key field})
             (forget "editor clause fields" {:clause-id clause :constant|variable|expression 'cv :val 'val :key field}))


       (rule "remove change clause"
             (when "remove clause" {:clause-id 'clause})
             (when "change clauses" {:rule-id 'rule :clause-id 'clause :from|to "from" :table 'table :sub-clause-id 'fromId :timestamp 'ts1})
             (when "change clauses" {:rule-id 'rule :clause-id 'clause :from|to "to" :table 'table :sub-clause-id 'toId :timestamp 'ts2})
             (forget "change clauses" {:rule-id 'rule :clause-id 'clause :from|to "from" :table 'table :sub-clause-id 'fromId :timestamp 'ts1})
             (forget "change clauses" {:rule-id 'rule :clause-id 'clause :from|to "to" :table 'table :sub-clause-id 'toId :timestamp 'ts2}))

       (rule "remove draw clause"
             ;;TODO: this should be a recursive rule that removes all sub draw stuff as well
             (when "remove clause" {:clause-id 'clause})
             (when "ui/editor-root" {:rule-id 'rule :clause-id 'clause :root 'root  :timestamp '_})
             ;(when "ui/editor-elem" {:rule-id 'rule :clause-id 'clause})
             ;(forget "ui/editor-elem" {:rule-id 'rule :clause-id 'clause})
             (forget "ui/editor-root" {:rule-id 'rule :clause-id 'clause :root 'root  :timestamp '_}))

       (rule "remove editor-elem clause"
             ;;TODO: this should be a recursive rule that removes all sub draw stuff as well
             (when "remove clause" {:clause-id 'clause})
             (when "ui/editor-elem" {:rule-id 'rule :clause-id 'sub :root-clause-id 'clause})
             (when "editor clause fields" {:clause-id sub :constant|variable|expression 'cv :val 'val :key field})
             (forget "ui/editor-elem" {:rule-id 'rule :clause-id 'sub :root-clause-id 'clause})
             (forget "editor clause fields" {:clause-id sub :constant|variable|expression 'cv :val 'val :key field}))

       (rule "remove editor-child clause"
             ;;TODO: this should be a recursive rule that removes all sub draw stuff as well
             (when "remove clause" {:clause-id 'clause})
             (when "ui/editor-child" {:rule-id 'rule :clause-id 'sub :root-clause-id 'clause})
             (when "editor clause fields" {:clause-id sub :constant|variable|expression 'cv :val 'val :key field})
             (forget "ui/editor-child" {:rule-id 'rule :clause-id 'sub :root-clause-id 'clause})
             (forget "editor clause fields" {:clause-id sub :constant|variable|expression 'cv :val 'val :key field}))

       (rule "remove editor-attr clause"
             ;;TODO: this should be a recursive rule that removes all sub draw stuff as well
             (when "remove clause" {:clause-id 'clause})
             (when "ui/editor-attr" {:rule-id 'rule :clause-id 'sub :root-clause-id 'clause})
             (forget "ui/editor-attr" {:rule-id 'rule :clause-id 'sub :root-clause-id 'clause})
             (when "editor clause fields" {:clause-id sub :constant|variable|expression 'cv :val 'val :key field})
             (forget "editor clause fields" {:clause-id sub :constant|variable|expression 'cv :val 'val :key field}))

       (rule "remove editor-text clause"
             ;;TODO: this should be a recursive rule that removes all sub draw stuff as well
             (when "remove clause" {:clause-id 'clause})
             (when "ui/editor-text" {:rule-id 'rule :clause-id 'sub :root-clause-id 'clause})
             (when "editor clause fields" {:clause-id sub :constant|variable|expression 'cv :val 'val :key field})
             (forget "ui/editor-text" {:rule-id 'rule :clause-id 'sub :root-clause-id 'clause})
             (forget "editor clause fields" {:clause-id sub :constant|variable|expression 'cv :val 'val :key field}))

       (rule "remove editor-style clause"
             ;;TODO: this should be a recursive rule that removes all sub draw stuff as well
             (when "remove clause" {:clause-id 'clause})
             (when "ui/editor-style" {:rule-id 'rule :clause-id 'sub :root-clause-id 'clause})
             (forget "ui/editor-style" {:rule-id 'rule :clause-id 'sub :root-clause-id 'clause})
             (when "editor clause fields" {:clause-id sub :constant|variable|expression 'cv :val 'val :key field})
             (forget "editor clause fields" {:clause-id sub :constant|variable|expression 'cv :val 'val :key field}))

       (rule "remove editor-event-listener clause"
             ;;TODO: this should be a recursive rule that removes all sub draw stuff as well
             (when "remove clause" {:clause-id 'clause})
             (when "ui/editor-event-listener" {:rule-id 'rule :clause-id 'sub :root-clause-id 'clause})
             (forget "ui/editor-event-listener" {:rule-id 'rule :clause-id 'sub :root-clause-id 'clause})
             (when "editor clause fields" {:clause-id sub :constant|variable|expression 'cv :val 'val :key field})
             (forget "editor clause fields" {:clause-id sub :constant|variable|expression 'cv :val 'val :key field}))

       (rule "remove editor-computed-id clause"
             ;;TODO: this should be a recursive rule that removes all sub draw stuff as well
             (when "remove clause" {:clause-id 'clause})
             (when "ui/editor-computed-id" {:rule-id 'rule :id 'sub :root-clause-id 'clause :parent 'parent :pos 'pos})
             (forget "ui/editor-computed-id" {:rule-id 'rule :id 'sub :root-clause-id 'clause  :parent 'parent :pos 'pos})
             (when "editor clause fields" {:clause-id sub :constant|variable|expression 'cv :val 'val :key field})
             (forget "editor clause fields" {:clause-id sub :constant|variable|expression 'cv :val 'val :key field}))

       ;;******************************************************************************
       ;; Cursor
       ;;******************************************************************************

       (rule "draw cursor"
             (when "cursor" {:clause-id 'clause})
             (func 'cid "\"clause-\" + clause")
             (pretend "ui/child" {:parent-id 'cid :pos 1000000000000 :child-id "cursor"})
             (draw [:span {:id "cursor" :className "cursor"} "yo"]))

       (rule "report key"
             (when "ui/onKeyDown" {:elem-id "rule-list" :key 'key})
             (func 'woo "console.log('GOT KEY: ' + key)")
             (pretend "foo" {:foo 0}))

       (rule "move cursor left"
             (when "ui/onKeyDown" {:elem-id "rule-list" :key '37})
             (func 'woo "console.log('move left')")
             )

       (rule "move cursor right"
             (when "ui/onKeyDown" {:elem-id "rule-list" :key '39})
             (func 'woo "console.log('move left')")
             )

       (rule "move cursor up"
             (when "ui/onKeyDown" {:elem-id "rule-list" :key '38})
             (func 'woo "console.log('move left')")
             )

       (rule "move cursor down"
             (when "ui/onKeyDown" {:elem-id "rule-list" :key '40})
             (func 'woo "console.log('move left')")
             )

       (rule "new clause below cursor"
             (when "ui/onKeyDown" {:elem-id "rule-list" :key '13})
             (func 'woo "console.log('move left')")
             )

       (rule "remove clause at cursor"
             (when "ui/onKeyDown" {:elem-id "rule-list" :key '13})
             (func 'woo "console.log('move left')")
             )

       (rule "activate clause"
             (when "ui/custom" {:event-key "activate clause" :entity 'clause})
             (change "cursor" {:clause-id 'prev} {:clause-id 'clause})
             )

       ;;******************************************************************************
       ;; Madlibs
       ;;******************************************************************************

       (rule "draw clause madlibs"
             (when "editor rule active" {:rule-id rule})
             (when "editor clauses" {:rule-id rule :type type :clause-id clause :madlib-id name :timestamp '_})
             (func 'cid "\"clause-\" + clause")
             (pretend "draw madlib" {:container 'cid :madlib-id 'name :clause-id 'clause}))

        (rule "draw clause madlib strings"
              (when "draw madlib" {:container 'container :madlib-id 'name :clause-id 'clause})
              (when "madlib strings" {:madlib-id name :pos pos :value value})
              (func 'childId "container + \"-pc-\" + pos")
              (pretend "ui/child" {:parent-id 'container :pos pos :child-id childId})
              (draw* [:span {:id 'childId} 'value]))

       (rule "draw clause madlib placholders"
             (when "draw madlib" {:container 'container :madlib-id 'name :clause-id 'clause})
             (when "madlib placeholders" {:madlib-id name :pos pos :field field :placeholder-pos 'ppos})
             (when "editor clause fields" {:clause-id clause :constant|variable|expression 'cv :val 'val :key field})
             (when "editing" {:id 'editing})
             (func 'context "clause + \"|\" + field")
             (when "filter" {:js "context != editing"})
             (func 'childId "container + \"-pc-\" + pos")
             (pretend "ui/child" {:parent-id 'container :pos pos :child-id childId})
             (draw* [:span {:id 'childId :className 'cv :events ["onClick"] :event-key "madlib placeholder click" :entity 'context} 'val]))

       (rule "draw clause madlib editing placeholder"
             (when "draw madlib" {:container 'container :madlib-id 'name :clause-id 'clause})
             (when "madlib placeholders" {:madlib-id name :pos pos :field field})
             (when "editor clause fields" {:clause-id clause :constant|variable|expression 'cv :val 'val :key field})
             (func 'context "clause + \"|\" + field")
             (when "editing" {:id 'context})
             (func 'childId "container + \"-pc-\" + pos")
             (pretend "ui/child" {:parent-id 'container :pos pos :child-id childId})
             (draw* [:input {:id 'childId :className 'cv :events ["onKeyDown" "onChange"] :event-key "madlib placeholder editor" :entity 'context :defaultValue 'val}]))

       (rule "madlib placeholder editor change"
             (when "ui/onChange" {:elem-id 'a :value 'v})
             (when "ui/custom" {:event-key "madlib placeholder editor" :entity 'ctx})
             (func 'clause "ctx.split('|')[0]")
             (func 'field "ctx.split('|')[1]")
             (change "editor clause fields"
                     {:clause-id 'clause :constant|variable|expression 'cv :val 'val :key 'field}
                     {:clause-id 'clause :constant|variable|expression 'cv :val 'v :key 'field})
             )

       (rule "madlib placeholder editor submit"
             (when "ui/onKeyDown" {:elem-id 'a :key 13})
             (when "ui/custom" {:event-key "madlib placeholder editor" :entity 'ctx})
             (when "active project" {:project-id 'project})
             (change "editing" {:id 'editing} {:id ""})
             ;;compile the program
             (pretend "compile project" {:project-id 'project})
             (pretend "control external" {:action "compile" :id 'project})
             )

       (rule "madlib placeholder clicked"
             (when "ui/custom" {:event-key "madlib placeholder click" :entity 'ctx})
             (change "editing" {:id 'old} {:id 'ctx})
             )

       (rule "draw change clauses"
             (when "editor rule active" {:rule-id rule})
             (when "change clauses" {:rule-id 'rule :clause-id 'clause :from|to "from" :table 'table :sub-clause-id 'fromId :timestamp '_})
             (when "change clauses" {:rule-id 'rule :clause-id 'clause :from|to "to" :table 'table :sub-clause-id 'toId :timestamp '_})
             (func 'cid "\"clause-\" + clause")
             (func 'fromCid "\"clause-\" + fromId")
             (func 'toCid "\"clause-\" + toId")
             (func 'rid "\"rule-do-\" + rule")
             (pretend "ui/child" {:parent-id 'rid :pos 'table :child-id 'cid})
             (draw* [:div {:id 'cid :className "clause" :events ["onClick"] :event-key "activate clause" :entity 'clause}
                    [:p {:id 'fromCid } [:span {:className "keyword"} "change " ]]
                    [:p {:id 'toCid} [:span {:className "keyword to"} "to "]]
                    ])
             (pretend "draw madlib" {:container 'fromCid :madlib-id 'table :clause-id 'fromId})
             (pretend "draw madlib" {:container 'toCid :madlib-id 'table :clause-id 'toId})
              )

       (rule "draw draw clauses"
             (when "editor rule active" {:rule-id rule})
             (when "ui/editor-root" {:rule-id 'rule :clause-id 'clause :root 'root  :timestamp '_})
             (func 'rid "\"rule-do-\" + rule")
             (func 'cid "\"clause-\" + clause")
             (func 'did "\"draw-preview-\" + clause")
             (func 'elemId "\"preview-\" + rule + root")
             (pretend "ui/child" {:parent-id 'rid :pos "draw" :child-id 'cid})
             (pretend "ui/child" {:parent-id 'did :pos 0 :child-id 'elemId})
             (draw* [:div {:id 'cid :className "clause" :events ["onClick"] :event-key "activate clause" :entity 'clause}
                    [:span {:className "keyword"} "draw"]
                    [:div {:className "draw-preview" :id 'did}]
                    ])
              )

       (rule "draw draw preview elem"
             (when "editor rule active" {:rule-id rule})
             (when "ui/editor-root" {:rule-id 'rule :clause-id '__ :root 'root  :timestamp '_})
             (when "ui/editor-elem" {:rule-id 'rule :clause-id 'clause  :root-clause-id 'root-clause})
             (when "editor clause fields" {:clause-id clause :constant|variable|expression 'cv :val 'tag :key "tag"})
             (when "editor clause fields" {:clause-id clause :constant|variable|expression 'cv2 :val 'id :key "elem-id"})
             (func 'elemId "\"preview-\" + rule + id")
             (func 'pid "\"tag\" + elemId")
             (draw* [:div {:id 'elemId :className "preview-elem"}
                    [:span {:id 'pid :className "preview-elem-tag"} 'tag]
                    ])
              )



       (rule "draw draw preview text"
             (when "editor rule active" {:rule-id rule})
             (when "ui/editor-text" {:rule-id 'rule :clause-id 'clause  :root-clause-id 'root-clause})
             (when "editor clause fields" {:clause-id clause :constant|variable|expression 'cv :val 'text :key "text"})
             (when "editor clause fields" {:clause-id clause :constant|variable|expression 'cv2 :val 'id :key "elem-id"})
             (func 'elemId "\"preview-\" + rule + id")
             (draw* [:span {:id 'elemId :className 'cv} 'text])

              )

         (rule "translate draw preview child"
             (when "editor rule active" {:rule-id rule})
             (when "ui/editor-child" {:rule-id 'rule :clause-id 'clause  :root-clause-id 'root-clause})
             (when "editor clause fields" {:clause-id clause :constant|variable|expression 'cv :val 'pos :key "pos"})
             (when "editor clause fields" {:clause-id clause :constant|variable|expression 'cv2 :val 'pid :key "parent-id"})
             (when "editor clause fields" {:clause-id clause :constant|variable|expression 'cv3 :val 'cid :key "child-id"})
             (func 'childElemId "\"preview-\" + rule + cid")
             (func 'parentElemId "\"preview-\" + rule + pid")
             (pretend "ui/child" {:parent-id 'parentElemId :pos 'pos :child-id 'childElemId})

              )

       )

(rules editor "example"

       (rule "change example"
             (when "foo" {:foo 'foo})
             (change* "bar" {:bar 'b} {:bar 3})
             (draw* [:p {:id "foo"} 'foo [:span {} "no wai"]])
             )
       )

(rules editor "incrementer"

       (rule "incr defaults"
             (when "defaults" {:defaults '_})
             (remember "incr" {:value 0}))

       (rule "draw-incr"
             (when "incr" {:value value})
             (draw* [:button {:id "incr" :events ["onClick"]} "increment: " 'value]))

       (rule "clicked"
             (when "ui/onClick" {:elem-id "incr"})
             (func 'new-val "value + 1")
             (change* "incr" {:value 'value} {:value 'new-val}))
           )


(rules editor "todomvc"

       (rule "defaults"
             (when "defaults" {:defaults '_})
             (remember "todo-to-add" {:value ""})
             (remember "todo-to-edit" {:value ""})
             (remember "current-toggle" {:value "false"})
             (remember "todo-filter" {:filter "all"})
             )

       (rule "todo-input-changes"
             (when "ui/onChange" {:elem-id "todo-input" :value 'neue})
             (change* "todo-to-add" {:value 'v} {:value 'neue}))

       (rule "filter-active-clicked"
             (when "ui/onClick" {:elem-id "filter-active"})
             (change* "todo-filter" {:filter 'v} {:filter "active"}))

       (rule "filter-completed-clicked"
             (when "ui/onClick" {:elem-id "filter-completed"})
             (change* "todo-filter" {:filter 'v} {:filter "completed"}))

       (rule "filter-all-clicked"
             (when "ui/onClick" {:elem-id "filter-all"})
             (change* "todo-filter" {:filter 'v} {:filter "all"}))

       (rule "toggle-all-changed-track"
             (when "ui/onChange" {:elem-id "toggle-all" :value 'value})
             (func 'final "v == \"false\" ? \"true\" : \"false\" ")
             (change* "current-toggle" {:value 'v} {:value 'final}))

       (rule "toggle-all-changed-update"
             (when "ui/onChange" {:elem-id "toggle-all" :value 'value})
             (when "current-toggle" {:value 'v})
             (func 'final "v == \"false\" ? \"completed\" : \"active\" ")
             (change* "todo-completed"
                     {:todo-id 'todo :completed? 'complete?}
                     {:todo-id 'todo :completed? 'final}))

       (rule "clear-completed-clicked"
             (when "ui/onClick" {:elem-id "clear-completed"})
             (when "todo-completed" {:todo-id 'todo :completed? "completed"})
             (pretend "todo-removed" {:todo-id 'todo}))

       (rule "remove-todo"
             (when "todo-removed" {:todo-id 'todo})
             (when "todo" {:todo-id 'todo :text 'text})
             (when "todo-editing" {:todo-id 'todo :editing? 'editing})
             (when "todo-completed" {:todo-id 'todo :completed? 'complete?})
             (forget "todo" {:todo-id 'todo :text 'text})
             (forget "todo-editing" {:todo-id 'todo :editing? 'editing})
             (forget "todo-completed" {:todo-id 'todo :completed? 'complete?}))

       (rule "filter-all-display"
             (when "todo" {:todo-id 'todo :text 'text})
             (when "todo-filter" {:filter "all"})
             (pretend "todo-displayed" {:todo-id 'todo}))

       (rule "filter-display"
             (when "todo" {:todo-id 'todo :text 'text})
             (when "todo-completed" {:todo-id 'todo :completed? 'complete?})
             (when "todo-filter" {:filter 'complete?})
             (pretend "todo-displayed" {:todo-id 'todo}))

       (rule "draw-checkbox"
             (when "todo-displayed" {:todo-id 'todo})
             (when "todo-completed" {:todo-id 'todo :completed? 'complete})
             (func 'active?  "complete == \"completed\" ? \"checked\" : \"\"")
             (func 'childId "\"todo-checkbox-\" + todo")
             (func 'parentId "\"todo-\" + todo")
             (pretend "ui/child" {:parent-id 'parentId :pos -1 :child-id 'childId})
             (draw* [:input {:id 'childId
                            :type "checkbox"
                            :checked 'active?
                            :event-key "todo-checkbox"
                            :entity 'todo
                            :events ["onChange"]}]))

       (rule "draw-todo-item"
             (when "todo-displayed" {:todo-id 'todo})
             (when "todo" {:todo-id 'todo :text 'text})
             (when "todo-editing" {:todo-id 'todo :editing? "saved"})
             (when "todo-completed" {:todo-id 'todo :completed? 'complete})
             (func 'removeId "\"todo-remove-\" + todo")
             (func 'todoId "\"todo-\" + todo")
             (func 'todoLabelId "\"todolabel-\" + todo")
             (pretend "ui/child" {:parent-id "todo-list" :pos 'todo :child-id 'todoId})
             (draw* [:li {:id 'todoId
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

       (rule "remove-todo-on-click"
             (when "ui/custom" {:event-key "remove-todo" :entity 'todo})
             (forget-when "todo" {:todo-id 'todo :text :any})
             (forget-when "todo-editing" {:todo-id 'todo :editing? :any})
             (forget-when "todo-completed" {:todo-id 'todo :completed? :any}))

       (rule "todo-item-checkbox-change"
             (when "ui/custom" {:event-key "todo-checkbox" :entity 'todo})
             (func 'neueComplete  "complete == \"completed\" ? \"active\" : \"completed\"")
             (change* "todo-completed" {:todo-id 'todo :completed? 'complete}
                     {:todo-id 'todo :completed? 'neueComplete}))

       (rule "draw-todo-item-editor"
             (when "todo-displayed" {:todo-id 'todo})
             (when "todo" {:todo-id 'todo :text 'cur})
             (when "todo-editing" {:todo-id 'todo :editing? "editing"})
             (when "todo-to-edit" {:value 'value})
             (pretend "ui/child" {:parent-id "todo-list" :pos 'todo :child-id "todo-editor-wrapper"})
             (draw* [:li {:id "todo-editor-wrapper"}
                    [:input {:id "todo-editor"
                             :className "todo-editor"
                             :type "text"
                             :value 'value
                             :placeholder "What needs to be done?"
                             :event-key "todo-editor"
                             :entity 'todo
                             :events ["onBlur" "onChange" "onKeyDown"]}]]))

       (rule "draw-todo-input"
             (when "todo-to-add" {:value 'cur})
             (pretend "ui/child" {:parent-id "input-header" :pos 1 :child-id "todo-input"})
             (draw* [:input {:id "todo-input"
                            :className "new-todo"
                            :placeholder "What needs to be done?"
                            :type "text"
                            :value 'cur
                            :events ["onChange" "onKeyDown"]}]))

       (rule "filter-active"
             (when "todo-filter" {:filter 'filter})
             (func 'elem "\"filter-\" + filter")
             (pretend "ui/attr" {:elem-id 'elem :attr "className" :value "active"})
             )

       (rule "draw-interface"
             (when "current-toggle" {:value 'toggle})
             (draw* [:div {:id "running-wrapper" :className "running-wrapper"}
                    [:div {:id "app" :className "todoapp"}
                     [:div {:id "buttons" :className "performance"}
                      [:button {:id "add200" :events ["onClick"]} "add 200 todos"]]
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

       (rule "enter-todo-input"
             (when "ui/onKeyDown" {:elem-id "todo-input" :key 13})
             (pretend "todo-added" {:x 0}))

       (rule "double-click-to-edit"
             (when "ui/custom" {:event-key "edit-todo" :entity 'todo})
             (when "todo" {:todo-id 'todo :text 'text})
             (change* "todo-to-edit" {:value '_} {:value 'text})
             (change* "todo-editing" {:todo-id 'todo :editing? 'v} {:todo-id 'todo :editing? "editing"}))

       (rule "todo-editing"
             (when "ui/onChange" {:elem-id "todo-editor" :value 'text})
             (change* "todo-to-edit" {:value '_} {:value 'text}))

       (rule "enter-todo-editor"
             (when "ui/onKeyDown" {:elem-id "todo-editor" :key 13})
             (pretend "commit-todo" {:x 0}))

       (rule "blur-todo-editor"
             (when "ui/onBlur" {:elem-id "todo-editor"})
             (pretend "commit-todo" {:x 0}))

       (rule "commit-todo"
             (when "commit-todo" {:x 0})
             (when "todo-to-edit" {:value 'value})
             (change* "todo-editing"
                     {:todo-id 'todo :editing? "editing"}
                     {:todo-id 'todo :editing? "saved"})
             (change* "todo"
                     {:todo-id 'todo :text 'text}
                     {:todo-id 'todo :text 'value}))

       (rule "add-todo"
             (when "todo-added" {:x '_})
             (when "time" {:time 'time})
             (when "todo-to-add" {:value 'to-add})
             (change* "todo-to-add" {:value 'to-add} {:value ""})
             (remember "todo" {:todo-id 'time :text 'to-add})
             (remember "todo-editing" {:todo-id 'time :editing? "saved"})
             (remember "todo-completed" {:todo-id 'time :completed? "active"}))

       (rule "add 200 items"
             (when "ui/onClick" {:elem-id "add200"})
             (when "interval" {:in 'x :lo 1 :hi 200})
             (func 'to-add "'foo' + x")
             (remember "todo" {:todo-id 'x :text 'to-add})
             (remember "todo-editing" {:todo-id 'x :editing? "saved"})
             (remember "todo-completed" {:todo-id 'x :completed? "active"}))
       )

(defn compile-editor [program watchers]
  (let [compiled (compile program)]
    (runtime/prep-compiled compiled)
    (syntax/know program "compile project" #js ["project-id"] #js ["editor ui"])
    (.quiesce compiled program (fn [kn]
                                 (.add-facts kn "know" "clauses" #js ["rule-id" "when|know|remember|forget" "clause-id" "name"] (.keys (get (syntax/index kn "compiled clauses") ["rule-id" "when|know|remember|forget" "clause-id" "name"])))
                                 (.add-facts kn "know" "clause-fields" #js ["clause-id" "constant|variable" "key" "val"] (.keys (get (syntax/index kn "compiled clause-fields") ["clause-id" "constant|variable" "key" "val"])))
                                 (let [final-compiled (compile kn)]
                                   (runtime/prep-compiled final-compiled)
                                   (aset (.-state program) "compiled" final-compiled))
                                 ))
    ;(.clear-facts program "know" "compile project")
    (aset (.-name->transient? compiled) "compile project" true)
    (aset (.-state program) "watchers" watchers)
    program))

(defn run []
  (let [editor (compile-editor editor [(runtime/create-react-renderer "body")
                                       manager/watcher])]
    (perf-time-named "full run"
     (do
       (re-run editor)))))

(run)

(enable-console-print!)

(comment

(run)
(re-run editor)

(enable-console-print!)
(run)
(.-kind->name->fields->index editor)
(index editor "editing")

  (for [[_ x] (.-kind->name->fields->index editor)
        [name indexes] x]
    [name (count indexes)])

(run)


  )
