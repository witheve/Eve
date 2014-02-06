(ns aurora.match
  (:require-macros [aurora.macros :refer [check deftraced]]
                   [aurora.match :refer [match]]))

(defrecord MatchFailure [])

(comment
  (match 1
         2 :no
         1 :ok)

  (match [1 2 3]
         [_ ?x ?y] :when (= x y) [:eq x y]
         [_ ?x ?y] [:neq x y])

  (match {:a 0 :b [1 2]}
         {:c _} :bad
         {:b [?x ?y]} [x y]))
