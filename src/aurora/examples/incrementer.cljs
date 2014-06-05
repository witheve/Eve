(ns aurora.examples.incrementer
  (:require [aurora.syntax :refer [know remember draw func change index]]
            [aurora.runtime :refer [pre-compile re-run env]]
            )
  (:require-macros [aurora.macros :refer [typeof ainto perf-time rules]]))


(defn run []
  (let [program (env)]
    (rules program
           (rule draw-incr
                 (when "incr" {:value value})
                 (draw [:button {:id "incr" :events ["onClick"]} "increment: " 'value]))

           (rule clicked
                 (when "ui/onClick" {:elem-id "incr"})
                 (func 'new-val "value + 1")
                 (change "incr" {:value 'value} {:value 'new-val}))
           )
    (pre-compile program)
    (remember program "incr" ["value"] [0])
    (know program "incr" ["value"] [0])
    (re-run program)
    ))


(comment

  (run)

 )
