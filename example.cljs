todos: [{"todo" "get milk" "done?" false}]
state: {"state" "all"}

;;->todo current-todo
(match current-todo
       {"editing?" true} ["li"
                          ["input" {"enter" ->edit "value" (current-todo "todo")}]]
       :else ["li" {"class" ->done-class}
              ["input" {"checked" (current-todo "done?") "click" ->toggle-done}]
              ["label" {"double-click" ->editing} (current-todo "todo")]
              ["button" {"click" ->rem}]])

;;->active-todos
(match (state "state")
       "all" todos
       "active" (filter-match {"done?" false} todos)
       "completed" (filter-match {"done?" true} todos))

;;->todos
["div"
 [:button {"click" ->all-completed}]
 ["input" {"enter" ->add "placeholder" "What needs to be done?"}]
 ["ul"
  (each (->active-todos) ->todo)]
 ["div"
  ["span" (->left)]
  ["ul"
   ["li" {"click" (partial ->state "all") "class" (partial ->state-class "all")} "all"]
   ["li" {"click" (partial ->state "active") "class" (partial ->state-class "active")} "active"]
   ["li" {"click" (partial ->state "completed") "class" (partial ->state-class "completed")} "completed"]]
  (->rem-completed-button)]]

;;->done-class
(str (match (current-todo "done?")
            true "completed"))

;;->all-completed
(commute (each todos (assoc cur "done?" true)))

;;->add e
(commute (conj todos {"todo" (e "value")
                            "done?" false}))

;;->editing
(commute (assoc current-todo "editing?" true))

;;->edit
(commute (assoc current-todo "todo" (e "value") "editing?" false))

;;->toggle-done
(commute (assoc current-todo "done?" (match current-todo
                                            {"done?" true} {"done?" false}
                                            :else {"done?" true})))

;;->rem
(commute (rem todos current-todo))

;;->rem-completed
(commute (filter-match {"done?" false} todos))

;;->rem-completed-button
(match (count (filter-match {"done?" true} todos))
       0 nil
       :else [:button {"click" ->rem-completed} "Clear completed (" cur ")"])

;;->left
(match [(count (filter-match {"done?" false} todos))]
       [1] (str "1 item left")
       [cur] (str cur " items left" ))

;;->state val
(commute (assoc state "state" val))

;;->state-class select
(str (match (state "state")
            select "active"))