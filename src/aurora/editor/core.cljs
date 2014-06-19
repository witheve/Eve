(ns aurora.editor.core
  (:require [aurora.btree :as btree :refer [tree iterator least greatest key-lt key-lte key-gt key-gte key-compare key=]]
            [aurora.language :refer [knowledge compile]]
            [aurora.util.core :refer [now new-id]]
            [aurora.syntax :as syntax :refer [know remember draw draw* change* func change index forget-when limit* aggregate* group* sort*]]
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
                  _ (.push counts #js [k (reduce #(str %1 " " %2) "" (map name vs)) (count (filter keyword? vs))])
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
    (.get-or-create-index env "know" "madlib placeholder counts" #js ["madlib-id" "full-string" "count"])

    (.add-facts env "know" "madlib strings" #js ["madlib-id" "pos" "value"] strs)
    (.add-facts env "know" "madlib placeholders" #js ["madlib-id" "pos" "field" "placeholder-pos"] vars)
    (.add-facts env "know" "madlib placeholder counts" #js ["madlib-id" "full-string" "count"] counts)
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

                   :defaults ["setting" :defaults]
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
                   "incr" ["The counter is" :value]

                   "foo" ["foo" :foo]
                   "bar" ["bar" :bar]

                   })


    (.get-or-create-index env "know" "compiled clauses" #js ["rule-id" "when|know|remember|forget" "clause-id" "name"])
    (.get-or-create-index env "know" "compiled clause-fields" #js ["clause-id" "constant|variable" "key" "val"])
    (.get-or-create-index env "know" "editor rules" #js ["rule-id" "project-id" "timestamp"])
    (.get-or-create-index env "know" "editor clauses" #js ["rule-id" "type" "clause-id" "madlib-id" "timestamp"])
    (.get-or-create-index env "know" "editor clause fields" #js ["rule-id" "clause-id" "constant|variable|expression" "key" "val"])
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
;;editor clause fields {:rule-id rule :clause-id clause :constant|variable|expression 'cv :val 'val :key field}

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
             (when "compile rule" {:rule-id 'rule})
             (when "editor clause fields" {:rule-id rule :clause-id clause :constant|variable|expression "variable" :val 'val :key field})
             (pretend "compiled clause-fields" {:clause-id clause :constant|variable "variable" :val 'val :key field}))

       (rule "constant editor clause fields"
             (when "compile rule" {:rule-id 'rule})
             (when "editor clause fields" {:rule-id rule :clause-id clause :constant|variable|expression "constant" :val 'val :key field})
             (pretend "compiled clause-fields" {:clause-id clause :constant|variable "constant" :val 'val :key field}))

        (rule "expression editor clause fields"
              (when "compile rule" {:rule-id 'rule})
              (when "editor clause fields" {:rule-id rule :clause-id clause :constant|variable|expression "expression" :val 'val :key field})
              (func 'newId "clause + '_' + field")
              (func 'fieldId "'calculated_' + field")
              (pretend "compiled clauses" {:rule-id rule :clause-id newId :when|know|remember|forget "when" :name "=function"})
              (pretend "compiled clause-fields" {:clause-id newId :constant|variable "constant" :val 'val :key "js"})
              (pretend "compiled clause-fields" {:clause-id newId :constant|variable "constant" :val 'fieldId :key "variable"})
              (pretend "compiled clause-fields" {:clause-id clause :constant|variable "variable" :val 'fieldId :key field})
              )

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
             (pretend "rule is visible" {:rule-id 'rule}))


       (rule "editor area"
             (when "active project" {:project-id 'project})
             (when "filter" {:js "project != ''"})
             (pretend "ui/child" {:parent-id "ui-root" :pos 0 :child-id "editor"})
             (draw* [:div {:id "editor" :className "editor"}
                     [:div {:id "controls" :className "controls"}
                      [:button {:id "back-button" :events ["onClick"] :className "ion-ios7-arrow-thin-left"}]]
                     [:div {:id "program-preview" :className "program-preview"}]
                     [:div {:id "rules-list" :className "rules-list" :tabIndex 0 :events ["onDirectKeyDown" "onFocus"]}
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
             (change "matcher state" {:active 'active :state 'state} {:active "true" :state 'state})
             (change "rule editor active" {:rule-id 'prev} {:rule-id 'ruleId}))

       (rule "remove rule"
             (when "ui/onClick" {:elem-id "remove-rule"})
             (when "editor rules" {:rule-id 'prev :project-id 'project :timestamp ts})
             (forget "editor rules" {:rule-id 'prev :project-id 'project :timestamp ts})
             (change "rule editor active" {:rule-id 'prev} {:rule-id ""}))

       (rule "on click submit rule"
             (when "ui/onClick" {:elem-id "submit-rule"})
             (when "rule editor active" {:rule-id 'rule})
             (pretend "submit rule" {:rule-id 'rule})
             )

       (rule "submit rule"
             (when "submit rule" {:rule-id 'rule})
             (when "active project" {:project-id 'project})
             (change "rule editor active" {:rule-id 'prev} {:rule-id ""})
             (change "cursor" {:clause-id 'prev-clause} {:clause-id ""})
             (change "cursor placeholder pos" {:placeholder-pos 'prev-pos} {:placeholder-pos 10000})
             (change "editing" {:id 'r} {:id ""})
             ;;compile the program
             (pretend "compile project" {:project-id 'project})
             (pretend "control external" {:action "compile" :id 'project})
             )

       (rule "draw rule editor"
             (when "rule editor active" {:rule-id rule})
             (when "rule is visible" {:rule-id rule})
             (when "editor rules" {:rule-id 'rule :project-id 'project :timestamp 'ts})
             (func 'rid "\"rule-\" + rule")
             (func 'rwid "\"rule-when-\" + rule")
             (func 'rdid "\"rule-do-\" + rule")
             (pretend "ui/child" {:parent-id "rules" :pos ts :child-id 'rid})
             (draw* [:table {:id 'rid :className "rule"}
                     [:tbody {}
                      [:tr {}
                       [:td {:id 'rwid :className "whens"}
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

       (rule "add clause click"
             (when "ui/onClick" {:elem-id "add-clause-button"})
             (when "cursor" {:clause-id 'clause})
             (change "matcher state" {:active 'active :state 'state} {:active "true" :state 'state})
             )

       (rule "remove clause click"
             (when "ui/onClick" {:elem-id "remove-clause-button"})
             (when "cursor" {:clause-id 'clause})
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
             (when "rule is visible" {:rule-id rule})
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
             (when "rule is visible" {:rule-id rule})
             (when "editor clauses" {:rule-id rule :type type :clause-id clause :madlib-id name  :timestamp 'timestamp})
             (func 'cid "\"clause-\" + clause")
             (func 'rid "(type == \"when\" ? \"rule-when-\" : \"rule-do-\") + rule")
             (pretend "ui/child" {:parent-id rid :pos 'timestamp :child-id cid})
             (draw* [:div {:id 'cid :className "clause" :events ["onClick"] :event-key "activate clause" :entity 'clause}
                    [:span {:className "keyword"} 'type]
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
             (when "editor clause fields" {:rule-id rule :clause-id clause :constant|variable|expression 'cv :val 'val :key field})
             (forget "editor clause fields" {:rule-id rule :clause-id clause :constant|variable|expression 'cv :val 'val :key field}))


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
             (when "editor clause fields" {:rule-id rule :clause-id sub :constant|variable|expression 'cv :val 'val :key field})
             (forget "ui/editor-elem" {:rule-id 'rule :clause-id 'sub :root-clause-id 'clause})
             (forget "editor clause fields" {:rule-id rule :clause-id sub :constant|variable|expression 'cv :val 'val :key field}))

       (rule "remove editor-child clause"
             ;;TODO: this should be a recursive rule that removes all sub draw stuff as well
             (when "remove clause" {:clause-id 'clause})
             (when "ui/editor-child" {:rule-id 'rule :clause-id 'sub :root-clause-id 'clause})
             (when "editor clause fields" {:rule-id rule :clause-id sub :constant|variable|expression 'cv :val 'val :key field})
             (forget "ui/editor-child" {:rule-id 'rule :clause-id 'sub :root-clause-id 'clause})
             (forget "editor clause fields" {:rule-id rule :clause-id sub :constant|variable|expression 'cv :val 'val :key field}))

       (rule "remove editor-attr clause"
             ;;TODO: this should be a recursive rule that removes all sub draw stuff as well
             (when "remove clause" {:clause-id 'clause})
             (when "ui/editor-attr" {:rule-id 'rule :clause-id 'sub :root-clause-id 'clause})
             (forget "ui/editor-attr" {:rule-id 'rule :clause-id 'sub :root-clause-id 'clause})
             (when "editor clause fields" {:rule-id rule :clause-id sub :constant|variable|expression 'cv :val 'val :key field})
             (forget "editor clause fields" {:rule-id rule :clause-id sub :constant|variable|expression 'cv :val 'val :key field}))

       (rule "remove editor-text clause"
             ;;TODO: this should be a recursive rule that removes all sub draw stuff as well
             (when "remove clause" {:clause-id 'clause})
             (when "ui/editor-text" {:rule-id 'rule :clause-id 'sub :root-clause-id 'clause})
             (when "editor clause fields" {:rule-id rule :clause-id sub :constant|variable|expression 'cv :val 'val :key field})
             (forget "ui/editor-text" {:rule-id 'rule :clause-id 'sub :root-clause-id 'clause})
             (forget "editor clause fields" {:rule-id rule :clause-id sub :constant|variable|expression 'cv :val 'val :key field}))

       (rule "remove editor-style clause"
             ;;TODO: this should be a recursive rule that removes all sub draw stuff as well
             (when "remove clause" {:clause-id 'clause})
             (when "ui/editor-style" {:rule-id 'rule :clause-id 'sub :root-clause-id 'clause})
             (forget "ui/editor-style" {:rule-id 'rule :clause-id 'sub :root-clause-id 'clause})
             (when "editor clause fields" {:rule-id rule :clause-id sub :constant|variable|expression 'cv :val 'val :key field})
             (forget "editor clause fields" {:rule-id rule :clause-id sub :constant|variable|expression 'cv :val 'val :key field}))

       (rule "remove editor-event-listener clause"
             ;;TODO: this should be a recursive rule that removes all sub draw stuff as well
             (when "remove clause" {:clause-id 'clause})
             (when "ui/editor-event-listener" {:rule-id 'rule :clause-id 'sub :root-clause-id 'clause})
             (forget "ui/editor-event-listener" {:rule-id 'rule :clause-id 'sub :root-clause-id 'clause})
             (when "editor clause fields" {:rule-id rule :clause-id sub :constant|variable|expression 'cv :val 'val :key field})
             (forget "editor clause fields" {:rule-id rule :clause-id sub :constant|variable|expression 'cv :val 'val :key field}))

       (rule "remove editor-computed-id clause"
             ;;TODO: this should be a recursive rule that removes all sub draw stuff as well
             (when "remove clause" {:clause-id 'clause})
             (when "ui/editor-computed-id" {:rule-id 'rule :id 'sub :root-clause-id 'clause :parent 'parent :pos 'pos})
             (forget "ui/editor-computed-id" {:rule-id 'rule :id 'sub :root-clause-id 'clause  :parent 'parent :pos 'pos})
             (when "editor clause fields" {:rule-id rule :clause-id sub :constant|variable|expression 'cv :val 'val :key field})
             (forget "editor clause fields" {:rule-id rule :clause-id sub :constant|variable|expression 'cv :val 'val :key field}))

       (rule "add base clause"
             (when "add clause" {:rule-id 'rule :madlib-id 'madlib :type 'type})
             (when "editor base clause types" {:clause-type 'type})
             (when "time" {:time 'timestamp})
             (func 'clause "aurora.util.core.new_id()")
             (remember "editor clauses" {:rule-id rule :type 'type :clause-id clause :madlib-id 'madlib :timestamp 'timestamp})
             (pretend "add clause placeholders" {:rule-id 'rule :madlib-id 'madlib :clause-id clause})
             (change "cursor" {:clause-id 'old} {:clause-id 'clause})
             )

       (rule "add change clause"
             (when "add clause" {:rule-id 'rule :madlib-id 'madlib :type "change"})
             (when "time" {:time 'timestamp})
             (func 'rootClause "aurora.util.core.new_id()")
             (func 'toClause "aurora.util.core.new_id()")
             (func 'fromClause "aurora.util.core.new_id()")
             (remember "change clauses" {:rule-id 'rule :clause-id 'rootClause :from|to "from" :table 'madlib :sub-clause-id 'fromClause :timestamp 'timestamp})
             (remember "change clauses" {:rule-id 'rule :clause-id 'rootClause :from|to "to" :table 'madlib :sub-clause-id 'toClause :timestamp 'timestamp})
             (pretend "add clause placeholders" {:rule-id 'rule :madlib-id 'madlib :clause-id rootClause})
             (pretend "add clause placeholders" {:rule-id 'rule :madlib-id 'madlib :clause-id fromClause})
             (pretend "add clause placeholders" {:rule-id 'rule :madlib-id 'madlib :clause-id toClause})
             (change "cursor" {:clause-id 'old} {:clause-id 'rootClause})
             )

       (rule "add draw clause"
             (when "add clause" {:rule-id 'rule :madlib-id 'madlib :type "draw"})
             (when "time" {:time 'timestamp})
             (func 'rootClause "aurora.util.core.new_id()")
             (func 'elemClause "aurora.util.core.new_id()")
             (func 'elemClause2 "elemClause")
             (remember "ui/editor-root" {:rule-id 'rule :clause-id rootClause :root elemClause :timestamp 'timestamp})
             (remember "ui/editor-elem" {:rule-id 'rule :root-clause-id rootClause :clause-id 'elemClause})
             (remember "editor clause fields" {:rule-id 'rule :clause-id 'elemClause :constant|variable|expression "constant" :val 'elemClause2 :key "elem-id"})
             (remember "editor clause fields" {:rule-id 'rule :clause-id 'elemClause :constant|variable|expression "constant" :val "div" :key "tag"})
             (change "cursor" {:clause-id 'old} {:clause-id 'rootClause})
             )

       (rule "add clause fields"
             (when "add clause placeholders" {:rule-id 'rule :madlib-id 'madlib :clause-id 'clause})
             (when "madlib placeholders" {:madlib-id 'madlib :pos 'pos :field 'field :placeholder-pos 'ppos})
             (func 'field2 "field")
             (remember "editor clause fields" {:rule-id rule :clause-id 'clause :constant|variable|expression "variable" :val 'field :key 'field2})
             )

       (rule "add new madlib placeholders"
             (when "add madlib" {:rule-id 'rule :neue-id 'neue :text 'text :clause-type 'type})
             (func 'cur "text.match(/(\\[.+?\\]|[^\\[\\]]+)/g).length - 1")
             (when "interval" {:in 'index :lo 0 :hi 'cur})
             (func 'found "text.match(/(\\[.+?\\]|[^\\[\\]]+)/g)[index]")
             (when "filter" {:js "found[0] == '['"})
             (func 'final "found.substring(1, found.length - 1)")
             (remember "madlib placeholders" {:madlib-id 'neue :pos 'index :field 'final :placeholder-pos 0})
             )

       (rule "add new madlib strings"
             (when "add madlib" {:rule-id 'rule :neue-id 'neue :text 'text :clause-type 'type})
             (func 'cur "text.match(/(\\[.+?\\]|[^\\[\\]]+)/g).length - 1")
             (when "interval" {:in 'index :lo 0 :hi 'cur})
             (func 'found "text.match(/(\\[.+?\\]|[^\\[\\]]+)/g)[index].trim()")
             (when "filter" {:js "found[0] != '['"})
             (remember "madlib strings" {:madlib-id 'neue :pos 'index :value 'found}))

       (rule "add new madlib full string"
             (when "add madlib" {:rule-id 'rule :neue-id 'neue :text 'text :clause-type 'type})
             (func 'count "text.match(/(\\[.+?\\])/g).length")
             (remember "madlib placeholder counts" {:madlib-id 'neue :full-string 'text :count 'count}))

       (rule "add new madlib clause"
             (when "add new clause for madlib" {:rule-id 'rule :madlib-id 'neue :clause-type 'type})
             (forget "add new clause for madlib" {:rule-id 'rule :madlib-id 'neue :clause-type 'type})
             (pretend "add clause" {:rule-id 'rule :madlib-id 'neue :type 'type})
             )

       ;;******************************************************************************
       ;; Cursor
       ;;******************************************************************************

       (rule "draw cursor"
             (when "cursor" {:clause-id 'clause})
             (func 'cid "\"clause-\" + clause")
             (pretend "ui/child" {:parent-id 'cid :pos 1000000000000 :child-id "cursor"})
             (draw* [:span {:id "cursor" :className "cursor"} ""]))

       (rule "report key"
             (when "ui/onKeyDown" {:elem-id "rules-list" :key 'key})
             (func 'woo "console.log('GOT KEY: ' + key)")
             (pretend "foo" {:foo 0}))

       (rule "move cursor left"
             (when "ui/onKeyDown" {:elem-id "rules-list" :key '37})
             (func 'woo "console.log('move left')")
             )

       (rule "move cursor right"
             (when "ui/onKeyDown" {:elem-id "rules-list" :key '39})
             (func 'woo "console.log('move left')")
             )

       (rule "move cursor up"
             (when "ui/onKeyDown" {:elem-id "rules-list" :key '38})
             (func 'woo "console.log('move left')")
             )

       (rule "move cursor down"
             (when "ui/onKeyDown" {:elem-id "rules-list" :key '40})
             (func 'woo "console.log('move left')")
             )

       (rule "new clause below cursor"
             (when "ui/onDirectKeyDown" {:elem-id "rules-list" :key '13})
             (when "ui/key-modifier" {:key "none"})
             (change "matcher state" {:active 'active :state 'state} {:active "true" :state 'state})
             )

       (rule "remove clause at cursor"
             (when "ui/onDirectKeyDown" {:elem-id "rules-list" :key '8})
             (when "cursor" {:clause-id 'clause})
             (pretend "remove clause" {:clause-id 'clause})
             )

       (rule "submit cursor rule"
             (when "ui/onKeyDown" {:elem-id "rules-list" :key '13})
             (when "ui/key-modifier" {:key "meta"})
             (when "rule editor active" {:rule-id 'rule})
             (pretend "submit rule" {:rule-id 'rule})
             )

       (rule "activate clause"
             (when "ui/custom" {:event-key "activate clause" :entity 'clause})
             (change "cursor" {:clause-id 'prev} {:clause-id 'clause})
             )


       ;;******************************************************************************
       ;; Matcher
       ;;******************************************************************************

       (rule "matcher defaults"
             (when "defaults" {:defaults 'default})
             (remember "editor focus" {:elem-id "rules-list"})
             (remember "matcher filter" {:filter ""})
             (remember "matcher state" {:active "false" :state "clause"})
             (remember "editor base clause types" {:clause-type "when"})
             (remember "editor base clause types" {:clause-type "pretend"})
             (remember "editor base clause types" {:clause-type "remember"})
             (remember "editor base clause types" {:clause-type "forget"})
             (remember "editor clause types" {:clause-type "when"})
             (remember "editor clause types" {:clause-type "draw"})
             (remember "editor clause types" {:clause-type "change"})
             (remember "editor clause types" {:clause-type "remember"})
             (remember "editor clause types" {:clause-type "forget"})
             (remember "editor clause types" {:clause-type "pretend"})
             )

       (rule "draw matcher"
             (when "matcher state" {:active "true" :state 'state})
             (when "rule editor active" {:rule-id 'rule})
             (when "matcher filter" {:filter 'filter})
             (when "filter" {:js "rule != ''"})
             (func 'rwid "\"rule-when-\" + rule")
             (pretend "ui/child" {:parent-id 'rwid :pos "foo" :child-id "matcher"})
             (change "editor focus" {:elem-id 'old} {:elem-id "matcher-input"})
             (draw* [:div {:id "matcher" :className "matcher clause"}
                     [:input {:id "matcher-input" :className "matcher-input" :type "text" :value 'filter :events ["onKeyDown" "onChange" "onBlur"]}]
                     [:ul {:id "matcher-list" :className "matcher-list"}]]))

       (rule "draw matcher clause type"
             (when "matcher clause" {:clause-type 'type})
             (pretend "ui/child" {:parent-id "matcher" :pos -1 :child-id "matcher-clause-type"})
             (draw* [:span {:id "matcher-clause-type" :className "keyword"} 'type]))

       ;;Clauses

       (rule "filter matcher items by clause type"
             (when "matcher state" {:active "true" :state "clause"})
             (when "editor clause types" {:clause-type 'type})
             (when "matcher filter" {:filter 'filter})
             (when "filter" {:js "filter == '' || window.stringMatch(type, filter) > 0"})
             (pretend "found matcher clause type" {:clause-type 'type}))


       (rule "draw matcher clause items"
             (when "found matcher clause type" {:clause-type 'name})
             (func 'childId "'matcher-item-' + name")
             (pretend "ui/child" {:parent-id "matcher-list" :pos name :child-id childId})
             (draw* [:li {:id 'childId} 'name])
             )

       ;;Madlibs

       (rule "filter matcher items by madlib strings"
             (when "matcher state" {:active "true" :state "madlib"})
             (when "madlib placeholder counts" {:madlib-id 'name :full-string 'full :count 'count})
             (when "matcher filter" {:filter 'filter})
             (when "filter" {:js "filter == '' || window.stringMatch(full, filter) > 0.07"})
             (pretend "found matcher madlib" {:madlib-id name}))

       (rule "draw matcher items"
             (when "found matcher madlib" {:madlib-id 'name})
             (func 'childId "'matcher-item-' + name")
             (pretend "ui/child" {:parent-id "matcher-list" :pos 0 :child-id childId})
             (draw* [:li {:id 'childId}])
             )

       (rule "draw matcher clause madlib strings"
             (when "found matcher madlib" {:madlib-id 'name})
             (when "madlib strings" {:madlib-id name :pos pos :value value})
             (func 'parentId "'matcher-item-' + name")
             (func 'childId "parentId + \"-pc-\" + pos")
             (pretend "ui/child" {:parent-id 'parentId :pos pos :child-id childId})
             (draw* [:span {:id 'childId} 'value]))

       (rule "draw matcher clause madlib placholders"
             (when "found matcher madlib" {:madlib-id 'name})
             (when "madlib placeholders" {:madlib-id name :pos pos :field field :placeholder-pos 'ppos})
             (func 'parentId "'matcher-item-' + name")
             (func 'childId "parentId + \"-pc-\" + pos")
             (pretend "ui/child" {:parent-id 'parentId :pos pos :child-id childId})
             (draw* [:span {:id 'childId :className "constant" } 'field]))

       ;;Change + submit

       (rule "on change update filter"
             (when "ui/onChange" {:elem-id "matcher-input" :value 'val})
             (change "matcher filter" {:filter 'old} {:filter 'val}))

       (rule "on backspace set clause matcher"
             (when "ui/onKeyDown" {:elem-id "matcher-input" :key 8})
             (when "matcher state" {:active 'active :state "madlib"})
             (when "matcher clause" {:clause-type 'type})
             (when "matcher filter" {:filter ""})
             (forget "matcher clause" {:clause-type 'type})
             (change "matcher state" {:active 'active :state 'state} {:active 'active :state "clause"})
             )

       (rule "on clause backspace hide matcher"
             (when "ui/onKeyDown" {:elem-id "matcher-input" :key 8})
             (when "matcher state" {:active 'active :state "clause"})
             (when "matcher filter" {:filter ""})
             (change "matcher state" {:active 'active :state 'state} {:active "false" :state 'state})
             (change "editor focus" {:elem-id 'old} {:elem-id "rules-list"})
             )

       (rule "on escape hide matcher"
             (when "ui/onKeyDown" {:elem-id "matcher-input" :key 27})
             (change "matcher state" {:active 'active :state 'state} {:active "false" :state 'state})
             (change "editor focus" {:elem-id 'old} {:elem-id "rules-list"})
             )

       (rule "on blur hide matcher"
             (when "ui/onBlur" {:elem-id "matcher-input"})
             (change "matcher state" {:active 'active :state 'state} {:active "false" :state 'state})
             (change "editor focus" {:elem-id 'old} {:elem-id "rules-list"})
             )

       (rule "on submit madlib matcher"
             (when "ui/onKeyDown" {:elem-id "matcher-input" :key 13})
             (when "ui/key-modifier" {:key "none"})
             (when "rule editor active" {:rule-id 'rule})
             (when "found matcher madlib" {:madlib-id 'name})
             (when "matcher clause" {:clause-type type})
             (when "filter" {:js "text.indexOf('[') == -1"})
             (forget "matcher clause" {:clause-type 'type})
             (change "matcher filter" {:filter 'text} {:filter ""})
             (change "matcher state" {:active 'active :state 'state} {:active "false" :state "clause"})
             (change "editor focus" {:elem-id 'old} {:elem-id "rules-list"})
             (pretend "add clause" {:rule-id 'rule :madlib-id 'name :type type})
             )

       (rule "on submit clause matcher"
             (when "ui/onKeyDown" {:elem-id "matcher-input" :key 13})
             (when "ui/key-modifier" {:key "none"})
             (when "rule editor active" {:rule-id 'rule})
             (when "found matcher clause type" {:clause-type 'type})
             (remember "matcher clause" {:clause-type 'type})
             (change "matcher filter" {:filter 'f} {:filter ""})
             (change "matcher state" {:active 'active :state "clause"} {:active 'active :state "madlib"})
             )

       (rule "on submit draw clause matcher"
             (when "ui/onKeyDown" {:elem-id "matcher-input" :key 13})
             (when "ui/key-modifier" {:key "none"})
             (when "rule editor active" {:rule-id 'rule})
             (when "found matcher clause type" {:clause-type "draw"})
             (func 'foo "console.log('here!')")
             (forget "matcher clause" {:clause-type "draw"})
             (forget "matcher state" {:active "true" :state "madlib"})
             (remember "matcher state" {:active "false" :state "clause"})
             (pretend "add clause" {:rule-id 'rule :madlib-id "" :type "draw"})
             (change "editor focus" {:elem-id 'old} {:elem-id "rules-list"})
             )

       (rule "on submit new madlib"
             (when "ui/onKeyDown" {:elem-id "matcher-input" :key 13})
             (when "ui/key-modifier" {:key "none"})
             (when "rule editor active" {:rule-id 'rule})
             (when "matcher filter" {:filter 'text})
             (when "filter" {:js "text.indexOf('[') > -1"})
             (when "matcher clause" {:clause-type type})
             (func 'neue "aurora.util.core.new_id()")
             (forget "matcher clause" {:clause-type 'type})
             (change "matcher filter" {:filter 'text} {:filter ""})
             (change "matcher state" {:active 'active :state 'state} {:active "false" :state "clause"})
             (change "editor focus" {:elem-id 'old} {:elem-id "rules-list"})
             (pretend "add madlib" {:rule-id 'rule :neue-id 'neue :text 'text :clause-type 'type})
             (remember "add new clause for madlib" {:rule-id 'rule :madlib-id 'neue :clause-type 'type})
             )



       ;;******************************************************************************
       ;; Madlibs
       ;;******************************************************************************

       (rule "draw clause madlibs"
             (when "rule is visible" {:rule-id rule})
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
             (when "editor clause fields" {:rule-id rule :clause-id clause :constant|variable|expression 'cv :val 'val :key field})
             (when "editing" {:id 'editing})
             (func 'context "clause + \"|\" + field")
             (when "filter" {:js "context != editing"})
             (func 'childId "container + \"-pc-\" + pos")
             (pretend "ui/child" {:parent-id 'container :pos pos :child-id childId})
             (draw* [:span {:id 'childId :className 'cv :events ["onClick"] :event-key "madlib placeholder click" :entity 'context} 'val]))

       (rule "draw clause madlib editing placeholder"
             (when "draw madlib" {:container 'container :madlib-id 'name :clause-id 'clause})
             (when "madlib placeholders" {:madlib-id name :pos pos :field field :placeholder-pos 'ppos})
             (when "editor clause fields" {:rule-id rule :clause-id clause :constant|variable|expression 'cv :val 'val :key field})
             (func 'cur "cv == 'variable' ? '*' + val : cv == 'expression' ? '=' + val : val")
             (func 'context "clause + \"|\" + field")
             (when "editing" {:id 'context})
             (func 'childId "container + \"-pc-\" + pos")
             (func 'curClass "'placeholder-editor ' + cv")
             (pretend "ui/child" {:parent-id 'container :pos pos :child-id "placeholder-editor"})
             (draw* [:input {:id "placeholder-editor" :className 'curClass :events ["onKeyDown" "onChange"] :event-key "madlib placeholder editor" :entity 'context :defaultValue 'cur}]))

       (rule "madlib placeholder editor change"
             (when "ui/onChange" {:elem-id "placeholder-editor" :value 'curValue})
             (when "ui/custom" {:event-key "madlib placeholder editor" :entity 'ctx})
             (when "active project" {:project-id 'project})
             (func 'clause "ctx.split('|')[0]")
             (func 'field "ctx.split('|')[1]")
             (func 'type "curValue == '' ? 'constant' : (curValue[0] == '*' ? 'variable' : curValue[0] == '=' ? 'expression' : 'constant')")
             (func 'final "curValue == '' ? '' : (curValue.match(/[^0-9\\.]/) ? (type == 'variable' || type == 'expression' ? curValue.substring(1) : curValue) : (curValue.match(/[\\.]/) ? parseFloat(curValue) : parseInt(curValue)))")
             (change "editor clause fields"
                     {:rule-id 'rule :clause-id 'clause :constant|variable|expression 'cv :val 'val :key 'field}
                     {:rule-id 'rule :clause-id 'clause :constant|variable|expression 'type :val 'final :key 'field})
             )

       (rule "madlib placeholder editor submit"
             (when "ui/onKeyDown" {:elem-id "placeholder-editor" :key 13})
             (change "editing" {:id 'editing} {:id ""})
             (change "editor focus" {:elem-id '_} {:elem-id "rules-list"})
             )

       (rule "madlib placeholder clicked"
             (when "ui/custom" {:event-key "madlib placeholder click" :entity 'ctx})
             (change "editing" {:id 'old} {:id 'ctx})
             (change "editor focus" {:elem-id '_} {:elem-id "placeholder-editor"})
             )

       (rule "draw defaults"
             (when "defaults" {:defaults '_})
             (remember "draw editor active elem" {:elem-id ""})
             (remember "possible ui events" {:event-name "Click" :event "onClick"})
             (remember "possible ui events" {:event-name "Blur" :event "onBlur"})
             (remember "possible ui events" {:event-name "Focus" :event "onFocus"})
             (remember "possible ui events" {:event-name "Key down" :event "onKeyDown"})
             (remember "possible ui events" {:event-name "Key up" :event "onKeyUp"})
             (remember "possible ui events" {:event-name "Change" :event "onChange"})
             (remember "possible ui events" {:event-name "Double click" :event "onDoubleClick"})
             (remember "possible ui events" {:event-name "Checked" :event "onChecked"})
             )

       (rule "draw change clauses"
             (when "rule is visible" {:rule-id rule})
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
             (when "rule is visible" {:rule-id rule})
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
             (when "rule is visible" {:rule-id rule})
             (when "rule editor active" {:rule-id 'editingRule})
             (when "ui/editor-root" {:rule-id 'rule :clause-id '__ :root 'root  :timestamp '_})
             (when "ui/editor-elem" {:rule-id 'rule :clause-id 'clause  :root-clause-id 'root-clause})
             (when "editor clause fields" {:rule-id rule :clause-id clause :constant|variable|expression 'cv :val 'tag :key "tag"})
             (when "editor clause fields" {:rule-id rule :clause-id clause :constant|variable|expression 'cv2 :val 'id :key "elem-id"})
             (when "draw editor active elem" {:elem-id 'active})
             (func 'className "(active == id && rule == editingRule ? 'active' : '') + ' preview-elem'")
             (func 'elemId "\"preview-\" + rule + id")
             (func 'pid "\"tag\" + elemId")
             (draw* [:div {:id 'elemId :className 'className :events ["onDirectClick"] :event-key "select draw elem" :entity 'id}
                    [:span {:id 'pid :className "preview-elem-tag"} 'tag]
                    ])
              )

       (rule "draw draw editor"
             (when "rule is visible" {:rule-id rule})
             (when "ui/editor-root" {:rule-id 'rule :clause-id 'rid :root 'root  :timestamp '_})
             (when "cursor" {:clause-id 'rid})
             (func 'cid "'clause-' + rid")
             (pretend "ui/child" {:parent-id 'cid :pos 10000 :child-id "preview-elem-editor"})
             (draw* [:table {:id "preview-elem-editor" :className "preview-elem-editor"}
                     [:tbody {:id "preview-elem-editor-body"}
                      ]])
              )

       (rule "draw id editor"
             (when "rule is visible" {:rule-id rule})
             (when "cursor" {:clause-id 'rid})
             (when "ui/editor-root" {:rule-id 'rule :clause-id 'rid :root 'root  :timestamp '_})
             (when "editor clause fields" {:rule-id rule :clause-id clause :constant|variable|expression 'cv2 :val 'elem :key "elem-id"})
             (when "draw editor active elem" {:elem-id 'elem})
             (func 'final "elem.length > 30 && elem[8] == '_' ? '' : elem")
             (pretend "ui/child" {:parent-id "preview-elem-editor-body" :pos 0 :child-id "draw-id-editor-row"})
             (draw* [:tr {:id "draw-id-editor-row"} [:td {} "name"] [:td {} [:input {:id "draw-id-editor" :className "draw-id-editor" :events ["onChange" "onClick"] :value 'final}]]])
             )

       (rule "id editor focus"
             (when "ui/onClick" {:elem-id "draw-id-editor"})
             (change "editor focus" {:elem-id 'old} {:elem-id ""}))

       (rule "draw tag editor"
             (when "rule editor active" {:rule-id rule})
             (when "cursor" {:clause-id 'rid})
             (when "ui/editor-root" {:rule-id 'rule :clause-id 'rid :root 'root  :timestamp '_})
             (when "editor clause fields" {:rule-id rule :clause-id clause :constant|variable|expression 'cv :val 'tag :key "tag"})
             (when "editor clause fields" {:rule-id rule :clause-id clause :constant|variable|expression 'cv2 :val 'elem :key "elem-id"})
             (when "draw editor active elem" {:elem-id 'elem})
             (pretend "ui/child" {:parent-id "preview-elem-editor-body" :pos 1 :child-id "draw-tag-editor-row"})
             (draw* [:tr {:id "draw-tag-editor-row"} [:td {} [:label {} "tag"]] [:td {}[:input {:id "draw-tag-editor" :className "draw-tag-editor" :events ["onChange" "onClick"] :value 'tag} ""]]])
             )

       (rule "tag editor focus"
             (when "ui/onClick" {:elem-id "draw-tag-editor"})
             (change "editor focus" {:elem-id 'old} {:elem-id ""}))

       (rule "draw events editor"
             (when "rule editor active" {:rule-id rule})
             (when "cursor" {:clause-id 'rid})
             (when "ui/editor-root" {:rule-id 'rule :clause-id 'rid :root 'root  :timestamp '_})
             (when "draw editor active elem" {:elem-id 'elem})
             (when "filter" {:js "elem != ''"})
             (pretend "ui/child" {:parent-id "preview-elem-editor-body" :pos 2 :child-id "draw-events-editor-row"})
             (draw* [:tr {:id "draw-events-editor-row" :className "top"} [:td {} "events"] [:td {} [:ul {:id "draw-events-editor" :className "events-editor"}]]])
             )

       (rule "draw events editor items"
             (when "rule editor active" {:rule-id rule})
             (when "cursor" {:clause-id 'rid})
             (when "ui/editor-root" {:rule-id 'rule :clause-id 'rid :root 'root  :timestamp '_})
             (when "draw editor active elem" {:elem-id 'elem})
             (when "filter" {:js "elem != ''"})
             (when "editor clause fields" {:rule-id rule :clause-id clause :constant|variable|expression 'cv :val 'event :key "event"})
             (when "editor clause fields" {:rule-id rule :clause-id clause :constant|variable|expression 'cv2 :val 'elem :key "elem-id"})
             (func 'cid "event + 'event-item'")
             (pretend "ui/attr" {:elem-id 'cid :attr "className" :value "pill active"})
             )

       (rule "draw events editor items all"
             (when "rule editor active" {:rule-id rule})
             (when "cursor" {:clause-id 'rid})
             (when "ui/editor-root" {:rule-id 'rule :clause-id 'rid :root 'root  :timestamp '_})
             (when "draw editor active elem" {:elem-id 'elem})
             (when "possible ui events" {:event-name 'name :event 'event})
             (func 'cid "event + 'event-item'")
             (pretend "ui/child" {:parent-id "draw-events-editor" :pos 'event  :child-id 'cid})
             (draw* [:li {:id 'cid :className "pill" :events ["onClick"] :event-key "add event" :entity 'event} 'name])
             )

       (rule "add event item"
             (when "ui/custom" {:event-key "add event" :entity 'event})
             (when "rule editor active" {:rule-id rule})
             (when "cursor" {:clause-id 'rid})
             (when "draw editor active elem" {:elem-id 'elem})
             (func 'clause "aurora.util.core.new_id()")
             (remember "ui/editor-event-listener" {:rule-id 'rule :clause-id 'clause :root-clause-id 'rid})
             (remember "editor clause fields" {:rule-id rule :clause-id clause :constant|variable|expression "constant" :val "" :key "entity"})
             (remember "editor clause fields" {:rule-id rule :clause-id clause :constant|variable|expression "constant" :val "" :key "event-key"})
             (remember "editor clause fields" {:rule-id rule :clause-id clause :constant|variable|expression "constant" :val 'event :key "event"})
             (remember "editor clause fields" {:rule-id rule :clause-id clause :constant|variable|expression "constant" :val 'elem :key "elem-id"})
             )

       (rule "draw add child button"
             (when "cursor" {:clause-id 'rid})
             (when "ui/editor-root" {:rule-id 'rule :clause-id 'rid :root 'root  :timestamp '_})
             (when "editor clause fields" {:rule-id rule :clause-id clause :constant|variable|expression 'cv2 :val 'elem :key "elem-id"})
             (when "draw editor active elem" {:elem-id 'elem})
             (func 'elemId "\"preview-\" + rule + elem")
             (pretend "ui/child" {:parent-id "preview-elem-editor" :pos 10000000000000 :child-id "child-buttons"})
             (draw* [:tr {:id "child-buttons" :className "preview-elem-editor-child-buttons"}
                     [:td {}]
                     [:td {}
                      [:button {:id "add-text-button" :events ["onClick"] :className "add-text-button ion-ios7-compose-outline"}]
                      [:button {:id "add-child-button" :events ["onClick"] :className "add-child-button ion-ios7-plus-empty"}]
                      [:button {:id "remove-child-button" :events ["onClick"] :className "add-child-button ion-ios7-trash-outline"}]]])
             )

       (rule "add child button click"
             (when "ui/onClick" {:elem-id "add-child-button"})
             (when "rule editor active" {:rule-id rule})
             (when "ui/editor-root" {:rule-id 'rule :clause-id 'rid :root 'root  :timestamp '_})
             (when "cursor" {:clause-id 'rid})
             (when "draw editor active elem" {:elem-id 'elem})
             (func 'elemClause "aurora.util.core.new_id()")
             (func 'elemClause2 "elemClause")
             (func 'childClause "aurora.util.core.new_id()")
             (change "draw editor active elem" {:elem-id 'elem} {:elem-id 'elemClause})
             (remember "ui/editor-elem" {:rule-id 'rule :root-clause-id 'rid :clause-id 'elemClause})
             (remember "editor clause fields" {:rule-id 'rule :clause-id 'elemClause :constant|variable|expression "constant" :val 'elemClause2 :key "elem-id"})
             (remember "editor clause fields" {:rule-id 'rule :clause-id 'elemClause :constant|variable|expression "constant" :val "div" :key "tag"})
             (remember "ui/editor-child" {:rule-id 'rule :root-clause-id 'rid :clause-id 'childClause})
             (remember "editor clause fields" {:rule-id 'rule :clause-id 'childClause :constant|variable|expression "constant" :val 'elemClause :key "child-id"})
             (remember "editor clause fields" {:rule-id 'rule :clause-id 'childClause :constant|variable|expression "constant" :val 'elem :key "parent-id"})
             (remember "editor clause fields" {:rule-id 'rule :clause-id 'childClause :constant|variable|expression "constant" :val 0 :key "pos"})
             )

       (rule "add text button click"
             (when "ui/onClick" {:elem-id "add-text-button"})
             (when "rule editor active" {:rule-id rule})
             (when "ui/editor-root" {:rule-id 'rule :clause-id 'rid :root 'root  :timestamp '_})
             (when "cursor" {:clause-id 'rid})
             (when "draw editor active elem" {:elem-id 'elem})
             (when "time" {:time 'time})
             (func 'elemClause "aurora.util.core.new_id()")
             (func 'elemClause2 "elemClause")
             (func 'childClause "aurora.util.core.new_id()")
             (func 'ctx "elemClause + '|text'")
             (remember "ui/editor-text" {:rule-id 'rule :root-clause-id 'rid :clause-id 'elemClause})
             (remember "editor clause fields" {:rule-id 'rule :clause-id 'elemClause :constant|variable|expression "constant" :val 'elemClause2 :key "elem-id"})
             (remember "editor clause fields" {:rule-id 'rule :clause-id 'elemClause :constant|variable|expression "constant" :val "fill me in" :key "text"})
             (remember "ui/editor-child" {:rule-id 'rule :root-clause-id 'rid :clause-id 'childClause})
             (remember "editor clause fields" {:rule-id 'rule :clause-id 'childClause :constant|variable|expression "constant" :val 'elemClause :key "child-id"})
             (remember "editor clause fields" {:rule-id 'rule :clause-id 'childClause :constant|variable|expression "constant" :val 'elem :key "parent-id"})
             (remember "editor clause fields" {:rule-id 'rule :clause-id 'childClause :constant|variable|expression "constant" :val 'time :key "pos"})
             ;;focus the element
             (change "editing" {:id 'old} {:id 'ctx})
             (change "editor focus" {:elem-id 'focused} {:elem-id "placeholder-editor"})
             )

       (rule "direct click preview elem set active"
             (when "ui/directCustom" {:event-key "select draw elem" :entity 'elem})
             (func 'asdf "console.log('changing active to: ' + elem)")
             (change "draw editor active elem" {:elem-id 'prev} {:elem-id 'elem}))


       (rule "draw editor id updated"
             (when "ui/onChange" {:elem-id "draw-id-editor" :value 'value})
             (when "rule is visible" {:rule-id 'rule})
             (change "draw editor active elem" {:elem-id 'elem} {:elem-id 'value})
             (change "editor clause fields"
                     {:rule-id 'rule :clause-id 'clause :constant|variable|expression 'cv :val 'elem :key "elem-id"}
                     {:rule-id 'rule :clause-id 'clause :constant|variable|expression 'cv :val 'value :key "elem-id"})
              )
       (rule "draw editor id updated, modify root"
             (when "ui/onChange" {:elem-id "draw-id-editor" :value 'value})
             (when "rule is visible" {:rule-id 'rule})
             (when "draw editor active elem" {:elem-id 'elem})
             (change "ui/editor-root"
                     {:rule-id 'rule :clause-id 'rid :root 'elem  :timestamp '_}
                     {:rule-id 'rule :clause-id 'rid :root 'value  :timestamp '_}))

       (rule "draw editor id updated, modify parents"
             (when "ui/onChange" {:elem-id "draw-id-editor" :value 'value})
             (when "rule is visible" {:rule-id 'rule})
             (when "draw editor active elem" {:elem-id 'elem})
             (change "editor clause fields"
                     {:rule-id 'rule :clause-id 'clause :constant|variable|expression 'cv :val 'elem :key "parent-id"}
                     {:rule-id 'rule :clause-id 'clause :constant|variable|expression 'cv :val 'value :key "parent-id"}))

       (rule "draw editor id updated, modify children"
             (when "ui/onChange" {:elem-id "draw-id-editor" :value 'value})
             (when "rule is visible" {:rule-id 'rule})
             (when "draw editor active elem" {:elem-id 'elem})
             (change "editor clause fields"
                     {:rule-id 'rule :clause-id 'clause :constant|variable|expression 'cv :val 'elem :key "child-id"}
                     {:rule-id 'rule :clause-id 'clause :constant|variable|expression 'cv :val 'value :key "child-id"}))

       (rule "draw editor tag updated"
             (when "ui/onChange" {:elem-id "draw-tag-editor" :value 'value})
             (when "rule is visible" {:rule-id 'rule})
             (when "editor clause fields" {:rule-id rule :clause-id clause :constant|variable|expression 'cv2 :val 'elem :key "elem-id"})
             (when "draw editor active elem" {:elem-id 'elem})
             (change "editor clause fields"
                     {:rule-id 'rule :clause-id 'clause :constant|variable|expression 'cv :val 'tag :key "tag"}
                     {:rule-id 'rule :clause-id 'clause :constant|variable|expression 'cv :val 'value :key "tag"})
              )


       (rule "draw draw preview text"
             (when "rule is visible" {:rule-id rule})
             (when "ui/editor-text" {:rule-id 'rule :clause-id 'clause  :root-clause-id 'root-clause})
             (when "editor clause fields" {:rule-id rule :clause-id clause :constant|variable|expression 'cv :val 'text :key "text"})
             (when "editor clause fields" {:rule-id rule :clause-id clause :constant|variable|expression 'cv2 :val 'id :key "elem-id"})
             (when "editing" {:id 'editing})
             (when "filter" {:js "context != editing"})
             (func 'context "clause + '|text'")
             (func 'elemId "\"preview-\" + rule + id")
             (draw* [:span {:id 'elemId :className 'cv :events ["onClick"] :event-key "madlib placeholder click" :entity 'context} 'text])

              )

       (rule "draw editable preview text"
             (when "rule is visible" {:rule-id rule})
             (when "editor clause fields" {:rule-id rule :clause-id clause :constant|variable|expression 'cv :val 'val :key "text"})
             (when "editor clause fields" {:rule-id rule :clause-id clause :constant|variable|expression 'cv2 :val 'elem :key "elem-id"})
             (when "editor clause fields" {:rule-id rule :clause-id childClause :constant|variable|expression 'cv3 :val 'elem :key "child-id"})
             (when "editor clause fields" {:rule-id rule :clause-id childClause :constant|variable|expression 'cv4 :val 'pos :key "pos"})
             (when "draw editor active elem" {:elem-id 'active})
             (when "editing" {:id 'context})
             (func 'clause "context.split('|')[0]")
             (func 'cur "cv == 'variable' ? '*' + val : cv == 'expression' ? '=' + val : val")
             (func 'context "clause + '|text'")
             (func 'elemId "\"preview-\" + rule + active")
             (func 'curClass "'placeholder-editor ' + cv")
             (pretend "ui/child" {:parent-id 'elemId :pos 'pos :child-id "placeholder-editor"})
             (draw* [:input {:id "placeholder-editor" :className 'curClass :events ["onKeyDown" "onChange"] :event-key "madlib placeholder editor" :entity 'context :defaultValue 'cur}]))

         (rule "translate draw preview child"
             (when "rule is visible" {:rule-id rule})
             (when "ui/editor-child" {:rule-id 'rule :clause-id 'clause  :root-clause-id 'root-clause})
             (when "editor clause fields" {:rule-id rule :clause-id clause :constant|variable|expression 'cv :val 'pos :key "pos"})
             (when "editor clause fields" {:rule-id rule :clause-id clause :constant|variable|expression 'cv2 :val 'pid :key "parent-id"})
             (when "editor clause fields" {:rule-id rule :clause-id clause :constant|variable|expression 'cv3 :val 'cid :key "child-id"})
             (func 'childElemId "\"preview-\" + rule + cid")
             (func 'parentElemId "\"preview-\" + rule + pid")
             (pretend "ui/child" {:parent-id 'parentElemId :pos 'pos :child-id 'childElemId})
              )


       (rule "handle focus"
             (when "editor focus" {:elem-id 'el})
             (when "filter" {:js "el != ''"})
             (pretend "ui/focus" {:elem-id 'el}))

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
             (change* "incr" {:value 'value} {:value ["value + 1"]}))
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
                      [:button {:id "add100" :events ["onClick"]} "add 100 todos"]
                      [:button {:id "add200" :events ["onClick"]} "add 200 todos"]
                      [:button {:id "allCompleted" :events ["onClick"]} "mark all completed"]
                      [:button {:id "removeAll" :events ["onClick"]} "remove all"]
                      ]
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

       (rule "add 100 items"
             (when "ui/onClick" {:elem-id "add100"})
             (when "interval" {:in 'x :lo 1 :hi 100})
             (func 'to-add "'foo' + x")
             (remember "todo" {:todo-id 'x :text 'to-add})
             (remember "todo-editing" {:todo-id 'x :editing? "saved"})
             (remember "todo-completed" {:todo-id 'x :completed? "active"}))

       (rule "add 200 items"
             (when "ui/onClick" {:elem-id "add200"})
             (when "interval" {:in 'x :lo 1 :hi 200})
             (func 'to-add "'foo' + x")
             (remember "todo" {:todo-id 'x :text 'to-add})
             (remember "todo-editing" {:todo-id 'x :editing? "saved"})
             (remember "todo-completed" {:todo-id 'x :completed? "active"}))

       (rule "remove all button"
             (when "ui/onClick" {:elem-id "removeAll"})
             (when "todo" {:todo-id 'x :text 'to-add})
             (when "todo-editing" {:todo-id 'x :editing? 'edit})
             (when "todo-completed" {:todo-id 'x :completed? 'complete})
             (forget "todo" {:todo-id 'x :text 'to-add})
             (forget "todo-editing" {:todo-id 'x :editing? 'edit})
             (forget "todo-completed" {:todo-id 'x :completed? 'complete}))

       (rule "mark all completed"
             (when "ui/onClick" {:elem-id "allCompleted"})
             (change "todo-completed" {:todo-id 'x :completed? "active"} {:todo-id 'x :completed? "completed"}))
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
       (know editor "defaults" #js ["defaults"] #js [""])
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
