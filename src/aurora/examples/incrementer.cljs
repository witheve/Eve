(ns aurora.examples.incrementer
  (:require [aurora.syntax :refer [know remember draw* change* func change index]]
            [aurora.runtime :refer [pre-compile re-run env]]
            )
  (:require-macros [aurora.macros :refer [typeof ainto perf-time rules rules*]]))


(defn run []
  (let [program (env)]

    (rules* program
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


    (rules program

           (rule "draw-incr"
                 (when "incr" {:value value})
                 (draw* [:button {:id "incr" :events ["onClick"]} "increment: " 'value]))

           (rule "clicked"
                 (when "ui/onClick" {:elem-id "incr"})
                 (func 'new-val "value + 1")
                 (change* "incr" {:value 'value} {:value 'new-val}))
           )
    (pre-compile program)
    (remember program "incr" #js ["value"] #js [0])
    (know program "incr" #js ["value"] #js [0])
    (re-run program)
    program
    ))

(comment

  (run)

 )
