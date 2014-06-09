(ns aurora.editor.core
  (:require [aurora.btree :as btree :refer [tree iterator least greatest key-lt key-lte key-gt key-gte key-compare key=]]
            [aurora.language :refer [knowledge compile]]
            [aurora.util.core :refer [now new-id]]
            [aurora.syntax :as syntax :refer [know remember draw func change index forget-when]]
            [aurora.runtime :refer [pre-compile re-run env] :as runtime]
            [aurora.editor.dom :as dom]
            [aurora.editor.ReactDommy :as dommy])
  (:require-macros [aurora.macros :refer [typeof ainto perf-time perf-time-named rules rules*]]))

(defn madlibs->facts [env mls]
  (let [strs (array)
        vars (array)]
    (doseq [[k vs] mls
            :let [k (name k)]
            [i v] (map-indexed vector vs)]
      (if (string? v)
        (.push strs #js [k i v])
        (.push vars #js [k i (name v)])))
    (.get-or-create-index env "know" "madlib strings" #js ["madlib-id" "pos" "value"])
    (.get-or-create-index env "know" "madlib placeholders" #js ["madlib-id" "pos" "field"])

    (.add-facts env "know" "madlib strings" #js ["madlib-id" "pos" "value"] strs)
    (.add-facts env "know" "madlib placeholders" #js ["madlib-id" "pos" "field"] vars)
    env))

(defn defaults [env]
  (madlibs->facts env
                  {
                   :clauses ["Rule" :rule-id "has a" :when|know|remember|forget "clause for" :name "with ID" :clause-id]
                   :clause-fields ["Clause" :clause-id "has a" :constant|variable "placeholder for" :key "with value" :val]
                   "editor rules" ["Rule with ID" :rule-id]
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

                   "foo" ["foo" :foo]
                   "bar" ["bar" :bar]

                   })
  )

(defn change* [env rule table old neue]
  (println env rule table)
  (let [fields (array)
        clause (new-id)
        from-id (new-id)
        to-id (new-id)
        ]
    (syntax/map->clause-fields fields id old)
    (syntax/map->clause-fields fields from-id old)
    (syntax/map->clause-fields fields to-id neue)
    (.add-facts env "know" "change clauses" #js ["rule-id" "clause-id" "from|to" "table" "sub-clause-id"] #js [#js [rule clause "from" table from-id]
                                                                                                       #js [rule clause "to" table to-id]])
    (.add-facts env "know" "editor clause fields" #js ["clause-id" "constant|variable|expression" "key" "val"] fields)
    []))

(def editor (env))

;;editor rules {:rule-id rule}
;;editor clauses {:rule-id rule :clause-id clause :type type :madlib-id madlib}
;;editor clause fields {:clause-id clause :constant|variable|expression 'cv :val 'val :key field}

(rules* editor
        (rule "when editor clauses"
             (when "editor clauses" {:rule-id rule :clause-id clause :type "when" :madlib-id madlib})
             (pretend "clauses" {:rule-id rule :when|know|remember|forget "when" :clause-id clause :name madlib}))

       (rule "pretend editor clauses"
             (when "editor clauses" {:rule-id rule :clause-id clause :type "pretend" :madlib-id madlib})
             (pretend "clauses" {:rule-id rule :when|know|remember|forget "know" :clause-id clause :name madlib}))

        (rule "know editor clauses"
             (when "editor clauses" {:rule-id rule :clause-id clause :type "know" :madlib-id madlib})
             (pretend "clauses" {:rule-id rule :when|know|remember|forget "know" :clause-id clause :name madlib}))

       (rule "remember editor clauses"
             (when "editor clauses" {:rule-id rule :clause-id clause :type "remember" :madlib-id madlib})
             (pretend "clauses" {:rule-id rule :when|know|remember|forget "remember" :clause-id clause :name madlib}))

       (rule "forget editor clauses"
             (when "editor clauses" {:rule-id rule :clause-id clause :type "forget" :madlib-id madlib})
             (pretend "clauses" {:rule-id rule :when|know|remember|forget "forget" :clause-id clause :name madlib}))

       (rule "variable editor clause fields"
             (when "editor clause fields" {:clause-id clause :constant|variable|expression "variable" :val 'val :key field})
             (pretend "clause-fields" {:clause-id clause :constant|variable "variable" :val 'val :key field}))

       (rule "constant editor clause fields"
             (when "editor clause fields" {:clause-id clause :constant|variable|expression "constant" :val 'val :key field})
             (pretend "clause-fields" {:clause-id clause :constant|variable "constant" :val 'val :key field}))

        (rule "change clause"
              (when "change clauses" {:rule-id 'rule :clause-id 'clause :from|to "from" :table 'table :sub-clause-id 'from-id})
              (when "change clauses" {:rule-id 'rule :clause-id 'clause :from|to "to" :table 'table :sub-clause-id 'to-id})
              (pretend "clauses" {:rule-id 'rule :when|know|remember|forget "when" :clause-id 'from-id :name 'table})
              (pretend "clauses" {:rule-id 'rule :when|know|remember|forget "forget" :clause-id 'from-id :name 'table})
              (pretend "clauses" {:rule-id 'rule :when|know|remember|forget "remember" :clause-id 'to-id :name 'table})
              )

        )


(rules editor

       (rule "draw rule"
             (when "editor rules" {:rule-id rule})
             (func 'rid "\"rule-\" + rule")
             (func 'rwid "\"rule-when-\" + rule")
             (func 'rdid "\"rule-do-\" + rule")
             (draw [:table {:id 'rid :className "rule"}
                    [:tbody {}
                     [:tr {}
                      [:td {:id 'rwid :className "whens"}]
                      [:td {:className "between"}]
                      [:td {:id 'rdid :className "dos"}]]]])
             )

       (rule "draw clause"
             (when "editor clauses" {:rule-id rule :type type :clause-id clause :madlib-id name})
             (func 'cid "\"clause-\" + clause")
             (func 'rid "(type == \"when\" ? \"rule-when-\" : \"rule-do-\") + rule")
             (pretend "ui/child" {:parent-id rid :pos 'name :child-id cid})
             (draw [:div {:id 'cid :className "clause"}
                    [:span {:className "keyword"} 'type " "]
                    ]))

       (rule "draw clause madlibs"
             (when "editor clauses" {:rule-id rule :type type :clause-id clause :madlib-id name})
             (func 'cid "\"clause-\" + clause")
             (pretend "draw madlib" {:container 'cid :madlib-id 'name :clause-id 'clause}))

        (rule "draw clause madlib strings"
              (when "draw madlib" {:container 'container :madlib-id 'name :clause-id 'clause})
              (when "madlib strings" {:madlib-id name :pos pos :value value})
              (func 'childId "container + \"-pc-\" + pos")
              (pretend "ui/child" {:parent-id 'container :pos pos :child-id childId})
              (draw [:span {:id 'childId :style {:color "#444" :margin "3px"}} 'value]))

       (rule "draw clause madlib placholders"
             (when "draw madlib" {:container 'container :madlib-id 'name :clause-id 'clause})
             (when "madlib placeholders" {:madlib-id name :pos pos :field field})
             (when "editor clause fields" {:clause-id clause :constant|variable|expression 'cv :val 'val :key field})
             (func 'childId "container + \"-pc-\" + pos")
             (pretend "ui/child" {:parent-id 'container :pos pos :child-id childId})
             (draw [:span {:id 'childId :className 'cv :style {:margin "3px"}} 'val]))

       (rule "draw change clauses"
             (when "change clauses" {:rule-id 'rule :clause-id 'clause :from|to "from" :table 'table :sub-clause-id 'fromId})
             (when "change clauses" {:rule-id 'rule :clause-id 'clause :from|to "to" :table 'table :sub-clause-id 'toId})
             (func 'cid "\"clause-\" + clause")
             (func 'fromCid "\"clause-\" + fromId")
             (func 'toCid "\"clause-\" + toId")
             (func 'rid "\"rule-do-\" + rule")
             (pretend "ui/child" {:parent-id 'rid :pos 'table :child-id 'cid})
             (draw [:div {:id 'cid :className "clause"}
                    [:p {:id 'fromCid } [:span {:className "keyword"} "change " ]]
                    [:p {:id 'toCid} [:span {:className "keyword to"} "to "]]
                    ])
             (pretend "draw madlib" {:container 'fromCid :madlib-id 'table :clause-id 'fromId})
             (pretend "draw madlib" {:container 'toCid :madlib-id 'table :clause-id 'toId})
              )


       (rule "change example"
             (when "foo" {:foo 0})
             (change* "bar" {:bar 'b} {:bar 3})
             (pretend "foo" {:foo "yep"}))

       )

(defn run []
  (let [editor (pre-compile editor)]
    (perf-time-named "full run"
     (do (defaults editor)
       (re-run editor)))))

(run)

(comment


(enable-console-print!)
(run)
(.-kind->name->fields->index editor)
(index editor "editor clauses")

(run)


  )
