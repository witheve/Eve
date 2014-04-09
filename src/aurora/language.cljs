(ns aurora.language
  (:require [clojure.set :refer [union intersection difference subset?]]
            [aurora.language.jsth :as jsth]
            [aurora.language.match :as match])
  (:require-macros [aurora.macros :refer [console-time set!! conj!! disj!! assoc!! apush apush*]]
                   [aurora.language.macros :refer [rule]]))

;; FLOW STATE

(defrecord FlowState [node->state in-edge->out-edges edge->values edge->update!])

(defn fixpoint [{:keys [node->state in-edge->out-edges edge->values edge->update!] :as flow-state}]
  (loop [edge 0]
    (when (< edge (alength edge->values))
      (let [in-values (aget edge->values edge)]
        (if (== 0 (alength in-values))
          (recur (+ edge 1))
          (let [out-values #js []]
            (.call (aget edge->update! edge) nil node->state in-values out-values)
            (aset edge->values edge #js [])
            (when (> (alength out-values) 0)
              (let [out-edges (aget in-edge->out-edges edge)
                    min-out-edge (areduce out-edges i min-out-edge (+ edge 1)
                                          (let [out-edge (aget out-edges i)]
                                            (apush* (aget edge->values out-edge) out-values)
                                            (min out-edge min-out-edge)))]
                (recur min-out-edge))))))))
  flow-state)

(defn filter-flow [fun]
  (fn [node->state in-values out-values]
    (dotimes [i (alength in-values)]
      (let [value (aget in-values i)]
        (when (.call fun nil value)
          (apush out-values value))))))

(defn set-flow [node]
  (fn [node->state in-values out-values]
    (let [set (aget node->state node)]
      (dotimes [i (alength in-values)]
        (let [value (aget in-values i)]
          (when (not (contains? set value))
            (conj!! set value)
            (apush out-values value))))
      (aset node->state node set))))

(comment
  (->
   (->FlowState #js [(transient #{})]
                #js [#js [1] #js [0]]
                #js [#js [:a :b "c" :d] #js []]
                #js [(filter-flow keyword?) (keep-flow 0)])
   fixpoint)

  (->
   (->FlowState #js [(transient #{})]
                #js [#js [1] #js [0]]
                #js [#js [:a :b "c" :d] #js []]
                #js [(filter-flow keyword?) (keep-flow 0)])
   fixpoint
   :node->state
   (aget 0)
   persistent!)
  )
