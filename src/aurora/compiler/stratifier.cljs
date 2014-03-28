(aset js/aurora.compiler "stratifier" nil)

(ns aurora.compiler.stratifier
  (:require [aurora.compiler.datalog :as datalog :refer [tick run-rule]])
  (:require-macros [aurora.macros :refer [check deftraced]]
                   [aurora.compiler.match :refer [match]]
                   [aurora.compiler.datalog :refer [rule]]))

;; RULESETS

(defprotocol Ruleset
  (run-ruleset [this kn] "-> kn"))

(extend-protocol Ruleset
  datalog/Rule
  (run-ruleset [this kn]
               (run-rule this kn)))

(defrecord Chain [rulesets]
  Ruleset
  (run-ruleset [this kn]
               (reduce #(run-ruleset %2 %1) kn rulesets)))

(defrecord Fixpoint [ruleset]
  Ruleset
  (run-ruleset [this kn]
               (let [new-kn (run-ruleset ruleset kn)]
                 (if (= kn new-kn) ;; TODO this is a very slow test
                   new-kn
                   (recur this new-kn)))))

(defn strata->ruleset [strata]
  (Chain.
   (vec
    (for [stratum strata]
      (if (instance? datalog/Rule stratum)
        stratum
        (Fixpoint. (Chain. (vec stratum))))))))

;; STRATIFICATION

;; Care about non-monotonic and monotonic cycles separately

(defn ->facts [rules]
  (apply clojure.set/union
         (for [[rule i] (map vector rules (range (count rules)))]
           #{[:rule i rule]
             [:negs-in i (:negs-in rule)]
             [:negs-out i (:negs-out rule)]
             [:preds-in i (:preds-in rule)]
             [:preds-out i (:preds-out rule)]})))

(defn ->kn [rules]
  (tick {:now (->facts rules)}))

;; [:before x y] if pred x must be finished before pred y can be finished
(comment
  (def ordering-rules
    [;; preds
     (rule [:preds-in _ preds-in]
           (in x preds-in)
           (? (not= :aurora.compiler.datalog/any x))
           (+ [:pred x]))
     (rule [:preds-out _ preds-out]
           (in x preds-out)
           (? (not= :aurora.compiler.datalog/any x))
           (+ [:pred x]))
     ;; handle ::any
     (rule [:pred x]
           (+ [:matches x x]))
     (rule [:pred x]
           (+ [:matches :aurora.compiler.datalog/any x]))
     ;; if a rule waits for x before producing y...
     (rule [:negs-in i negs-in]
           [:preds-out i preds-out]
           (in x negs-in)
           (in y preds-out)
           [:matches x x']
           [:matches y y']
           (+ [:before x' y']))
     ;; if a rule reads from x and removes from y...
     (rule [:preds-in i preds-in]
           [:negs-out i negs-out]
           (in x preds-in)
           (in y negs-out)
           [:matches x x']
           [:matches y y']
           (+ [:before x' y']))
     ;; transitive closure
     [(rule [:before x y]
            [:before y z]
            (+ [:before x z]))]
     ;; cycles
     (rule [:before x y]
           [:before y x]
           (+ [:cyclic x y]))]))

(comment

  ((nth ordering-rules 0) todo-rules)

  ((strata->rule ordering-rules) (->kn ordering-rules))

  ((strata->rule ordering-rules) (->kn todo-rules))

  (def todo-rules (concat (:tick-rules todo) (apply concat (:rules todo))))

  (def todo {:kn #{{:name "counter" :value 2}
                            {:name "todo" :id 0 :text "get milk" :order 0}
                            {:name "todo" :id 1 :text "take books back" :order 1}
                            {:name "todo" :id 2 :text "cook" :order 2}
                            {:name "todo-done" :id 0 :done? "false"}
                            {:name "todo-done" :id 1 :done? "false"}
                            {:name "todo-done" :id 2 :done? "false"}
                            {:name "todo-editing" :id 0 :editing? "false"}
                            {:name "todo-editing" :id 1 :editing? "false"}
                            {:name "todo-editing" :id 2 :editing? "false"}
                            {:name :todo/current-text :value ""}
                            }
                      :cleanup-rules []
                      :tick-rules [;;on change
                                   (rule {:name :ui/onChange :id "todo-input" :value v}
                                         (> {:name :todo/current-text} {:value v}))

                                   ;;submit
                                   (rule {:name :ui/onClick :id "add-todo"}
                                         (+ {:name :todo/new!}))
                                   (rule {:name :ui/onKeyDown :id "todo-input" :keyCode 13}
                                         (+ {:name :todo/new!}))

                                   ;;add a new todo
                                   (rule {:name :todo/new!}
                                         {:name "counter" :value v}
                                         {:name :todo/current-text :value text}
                                         (= new-count (inc v))
                                         (- {:name :todo/new!})
                                         (> {:name "counter"} {:value new-count})
                                         (> {:name :todo/current-text} {:value ""})
                                         (+ {:name "todo" :id new-count :text text :order new-count})
                                         (+ {:name "todo-editing" :id new-count :editing? "false"})
                                         (+ {:name "todo-done" :id new-count :done? "false"}))

                                   ;;todo editing
                                   (rule {:name :ui/onDoubleClick :entity ent}
                                         {:name "todo-editing" :id ent :editing? "false"}
                                         (> {:name "todo-editing" :id ent} {:editing? "true"}))

                                   (rule {:name :ui/onBlur :entity ent}
                                         {:name "todo-editing" :id ent :editing? "true"}
                                         (> {:name "todo-editing" :id ent} {:editing? "false"}))

                                   (rule {:name :ui/onChange :id "todo-editor" :value v}
                                         (> {:name :todo/edit-text} {:value v})
                                         (+ {:name :todo/edit-text :value v}))

                                   (rule {:name :ui/onKeyDown :id "todo-editor" :keyCode 13 :entity ent}
                                         {:name :todo/edit-text :value new-value}
                                         (> {:name "todo" :id ent} {:text new-value})
                                         (> {:name "todo-editing" :id ent} {:editing? "false"}))

                                   (rule {:name :ui/onChange :event-key "todo-checkbox" :entity ent :value v}
                                         (> {:name "todo-done" :id ent} {:done? v}))
                                   ]
                      :rules [
                              [(rule {:name "todo" :id id :text text :order order}
                                     (= parent-id (str "todo" id))
                                     (= child-id (str "todo-checkbox" id))
                                     (+s (hiccup
                                           [:input {:id child-id
                                                    :event-key "todo-checkbox"
                                                    :entity id
                                                    :events ["onChange"]
                                                    :type "checkbox"}]))
                                     (+ {:name :ui/child :id parent-id :child child-id :pos -1}))
                               (rule {:name "todo" :id id :text text :order order}
                                     {:name "todo-done" :id id :done? "true"}
                                     (+ {:name :ui/attr :id id :attr "checked" :value "checked"})) ]
                              [(rule {:name "todo" :id id :text text :order order}
                                     {:name "todo-editing" :id id :editing? "false"}
                                     (+s (hiccup
                                          [:li {:id (str "todo" id) :entity id :event-key "todo" :events ["onDoubleClick"]}
                                           text]))
                                     (= child-id (str "todo" id))
                                     (+ {:name :ui/child :id "todo-list" :child child-id :pos order}))
                               (rule {:name "todo" :id id :text text :order order}
                                     {:name "todo-editing" :id id :editing? "true"}
                                     (+s (hiccup
                                          [:input {:id (str "todo-editor") :entity id :event-key "todo-editor" :defaultValue text :events ["onChange" "onKeyDown" "onBlur"]}]))
                                     (+ {:name :ui/child :id "todo-list" :child "todo-editor" :pos order}))
                               ]
                              [(rule {:name :todo/current-text :value v}
                                     (+s (hiccup
                                          [:input {:id "todo-input" :value v :event-key "todo-input" :events ["onChange" "onKeyDown"] :placeholder "What do you need to do?"}]))
                                     (+ {:name :ui/child :id "app" :child "todo-input" :pos 1}))]
                              [(rule (+s (hiccup
                                          [:div {:id "app"}
                                           [:h1 {:id "todo-header"} "Todos"]
                                           [:button {:id "add-todo" :event-key "add-todo" :events ["onClick"]} "add"]
                                           [:ul {:id "todo-list"}]
                                           ]))
                                     )]
                              ]})

  )
