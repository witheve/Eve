(ns aurora.editor.core
  (:require [aurora.btree :as btree :refer [tree iterator least greatest key-lt key-lte key-gt key-gte key-compare key=]]
            [aurora.language :refer [knowledge compile]]
            [aurora.util.core :refer [now new-id]]
            [aurora.syntax :as syntax :refer [know remember draw draw* change* func change index forget-when]]
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


    (.get-or-create-index env "know" "editing" #js ["id"])
    (.add-facts env "know" "editing" #js ["id"] (array (array "")))
  )



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

        (rule "translate ui/editor-elem"
             (when "ui/editor-elem" {:rule-id 'rule :clause-id 'clause})
             (pretend "clauses" {:rule-id rule :when|know|remember|forget "know" :clause-id clause :name "ui/elem"}))

        (rule "translate ui/editor-child"
             (when "ui/editor-child" {:rule-id 'rule :clause-id 'clause})
             (pretend "clauses" {:rule-id 'rule :when|know|remember|forget "know" :clause-id 'clause :name "ui/child"}))

        (rule "translate ui/editor-text"
             (when "ui/editor-text" {:rule-id 'rule :clause-id 'clause})
             (pretend "clauses" {:rule-id rule :when|know|remember|forget "know" :clause-id clause :name "ui/text"}))

        (rule "translate ui/editor-attr"
             (when "ui/editor-attr" {:rule-id 'rule :clause-id 'clause})
             (pretend "clauses" {:rule-id rule :when|know|remember|forget "know" :clause-id clause :name "ui/attr"}))

        (rule "translate ui/editor-style"
             (when "ui/editor-style" {:rule-id 'rule :clause-id 'clause})
             (pretend "clauses" {:rule-id rule :when|know|remember|forget "know" :clause-id clause :name "ui/style"}))

        (rule "translate ui/editor-event-listener"
             (when "ui/editor-event-listener" {:rule-id 'rule :clause-id 'clause})
             (pretend "clauses" {:rule-id rule :when|know|remember|forget "know" :clause-id clause :name "ui/event-listener"}))


        (rule "translate ui/editor-computed-id"
              (when "ui/editor-computed-id" {:rule-id 'rule :id 'id :parent 'parent :pos 'pos})
              (func 'neue "parent + \" + \\\"-\\\" + \" + pos")
              (func 'clause "aurora.util.core.new_id()")
              (pretend "clauses" {:rule-id 'rule :when|know|remember|forget "when" :clause-id 'clause :name "=function"})
              (pretend "clause-fields" {:clause-id 'clause :constant|variable "variable" :val 'id :key "variable"})
              (pretend "clause-fields" {:clause-id 'clause :constant|variable "constant" :val 'neue :key "js"})
              )

        )


(rules editor

       (rule "draw rule"
             (when "editor rules" {:rule-id rule})
             (func 'rid "\"rule-\" + rule")
             (func 'rwid "\"rule-when-\" + rule")
             (func 'rdid "\"rule-do-\" + rule")
             (draw*[:table {:id 'rid :className "rule"}
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
             (draw* [:div {:id 'cid :className "clause"}
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
              (draw* [:span {:id 'childId :style {:color "#444"}} 'value]))

       (rule "draw clause madlib placholders"
             (when "draw madlib" {:container 'container :madlib-id 'name :clause-id 'clause})
             (when "madlib placeholders" {:madlib-id name :pos pos :field field})
             (when "editor clause fields" {:clause-id clause :constant|variable|expression 'cv :val 'val :key field})
             (when "editing" {:id 'editing})
             (func 'context "clause + \"_\" + field")
             (when "filter" {:js "context != editing"})
             (func 'childId "container + \"-pc-\" + pos")
             (pretend "ui/child" {:parent-id 'container :pos pos :child-id childId})
             (draw* [:span {:id 'childId :className 'cv :events ["onClick"] :event-key "madlib placeholder click" :entity 'context} 'val]))

       (rule "draw clause madlib editing placeholder"
             (when "draw madlib" {:container 'container :madlib-id 'name :clause-id 'clause})
             (when "madlib placeholders" {:madlib-id name :pos pos :field field})
             (when "editor clause fields" {:clause-id clause :constant|variable|expression 'cv :val 'val :key field})
             (func 'context "clause + \"_\" + field")
             (when "editing" {:id 'context})
             (func 'childId "container + \"-pc-\" + pos")
             (pretend "ui/child" {:parent-id 'container :pos pos :child-id childId})
             (draw* [:input {:id 'childId :className 'cv :events ["onKeyDown"] :event-key "madlib placeholder editor" :entity 'context :defaultValue 'val}]))

       (rule "madlib placeholder clicked"
             (when "ui/custom" {:event-key "madlib placeholder click" :entity 'ctx})
             (change "editing" {:id 'old} {:id 'ctx})
             )

       (rule "draw change clauses"
             (when "change clauses" {:rule-id 'rule :clause-id 'clause :from|to "from" :table 'table :sub-clause-id 'fromId})
             (when "change clauses" {:rule-id 'rule :clause-id 'clause :from|to "to" :table 'table :sub-clause-id 'toId})
             (func 'cid "\"clause-\" + clause")
             (func 'fromCid "\"clause-\" + fromId")
             (func 'toCid "\"clause-\" + toId")
             (func 'rid "\"rule-do-\" + rule")
             (pretend "ui/child" {:parent-id 'rid :pos 'table :child-id 'cid})
             (draw* [:div {:id 'cid :className "clause"}
                    [:p {:id 'fromCid } [:span {:className "keyword"} "change " ]]
                    [:p {:id 'toCid} [:span {:className "keyword to"} "to "]]
                    ])
             (pretend "draw madlib" {:container 'fromCid :madlib-id 'table :clause-id 'fromId})
             (pretend "draw madlib" {:container 'toCid :madlib-id 'table :clause-id 'toId})
              )

       (rule "draw draw clauses"
             (when "ui/editor-root" {:rule-id 'rule :clause-id 'clause :root 'root})
             (func 'rid "\"rule-do-\" + rule")
             (func 'cid "\"clause-\" + clause")
             (func 'did "\"draw-preview-\" + clause")
             (func 'elemId "\"preview-\" + rule + root")
             (pretend "ui/child" {:parent-id 'rid :pos "draw" :child-id 'cid})
             (pretend "ui/child" {:parent-id 'did :pos 0 :child-id 'elemId})
             (draw* [:div {:id 'cid :className "clause"}
                    [:span {:className "keyword"} "draw"]
                    [:div {:className "draw-preview" :id 'did}]
                    ])
              )

       (rule "draw draw preview elem"
             (when "ui/editor-elem" {:rule-id 'rule :clause-id 'clause})
             (when "editor clause fields" {:clause-id clause :constant|variable|expression 'cv :val 'tag :key "tag"})
             (when "editor clause fields" {:clause-id clause :constant|variable|expression 'cv2 :val 'id :key "elem-id"})
             (func 'elemId "\"preview-\" + rule + id")
             (func 'pid "\"tag\" + elemId")
             (draw* [:div {:id 'elemId :className "preview-elem"}
                    [:span {:id 'pid :className "preview-elem-tag"} 'tag]
                    ])
              )



       (rule "draw draw preview text"
             (when "ui/editor-text" {:rule-id 'rule :clause-id 'clause})
             (when "editor clause fields" {:clause-id clause :constant|variable|expression 'cv :val 'text :key "text"})
             (when "editor clause fields" {:clause-id clause :constant|variable|expression 'cv2 :val 'id :key "elem-id"})
             (func 'elemId "\"preview-\" + rule + id")
             (draw* [:span {:id 'elemId :className 'cv} 'text])

              )

         (rule "translate draw preview child"
             (when "ui/editor-child" {:rule-id 'rule :clause-id 'clause})
             (when "editor clause fields" {:clause-id clause :constant|variable|expression 'cv :val 'pos :key "pos"})
             (when "editor clause fields" {:clause-id clause :constant|variable|expression 'cv2 :val 'pid :key "parent-id"})
             (when "editor clause fields" {:clause-id clause :constant|variable|expression 'cv3 :val 'cid :key "child-id"})
             (func 'childElemId "\"preview-\" + rule + cid")
             (func 'parentElemId "\"preview-\" + rule + pid")
             (pretend "ui/child" {:parent-id 'parentElemId :pos 'pos :child-id 'childElemId})

              )

       (rule "change example"
             (when "foo" {:foo 'foo})
             (change* "bar" {:bar 'b} {:bar 3})
             (draw* [:p {:id "foo"} 'foo [:span {} "no wai"]])
             )

       )

(defn run []
  (let [editor (pre-compile editor)]
    (perf-time-named "full run"
     (do (defaults editor)
       (re-run editor)))))

(run)

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
