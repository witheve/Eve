(def todos (with-meta (vec (take 100 (repeat {"todo" "milk"}))) {:path ["todos"]}))
(def state (with-meta {"state" "all"} {:path ["state"]}))

(defn ->todo [current-todo]
  (match [current-todo]
         [{"editing?" true}] ["li"
                              ["input" {"enter" (partial ->edit current-todo) "value" (current-todo "todo")}]]
         :else ["li" {"class" (->done-class current-todo)}
                ["input" {"checked" (current-todo "done?") "type" "checkbox" "click" (partial ->toggle-done current-todo)}]
                ["label" {"dblclick" (partial ->editing current-todo)} (current-todo "todo")]
                ["button" {"click" (partial ->rem current-todo)} "x"]]))

(defn ->active-todos []
  (match [(state "state")]
         ["all"] todos
         ["active"] (filter-match {"done?" false} todos)
         ["completed"] (filter-match {"done?" true} todos)))

(defn ->todos []
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
    (->rem-completed-button)]])

(defn ->done-class [current-todo]
  (str (match [(current-todo "done?")]
              [true] "completed"
              :else "")))

(defn ->all-completed []
  (commute (assoc state "all-toggle" (not (state "all-toggle"))))
  (commute (each todos #(assoc % "done?" (state "all-toggle")))))

(defn ->add [e]
  (commute (conj todos {"todo" (e "value")
                        "done?" false})))

(defn ->editing [current-todo]
  (commute (assoc current-todo "editing?" true)))

(defn ->edit [current-todo e]
  (commute (assoc current-todo "todo" (e "value") "editing?" false)))

(defn ->toggle-done [current-todo]
  (commute (assoc current-todo "done?" (match [current-todo]
                                              [{"done?" true}] false
                                              :else true))))

(defn ->rem [current-todo]
  (commute (rem current-todo todos)))

(defn ->rem-completed [current-todo]
  (commute (filter-match {"done?" false} todos)))

(defn ->rem-completed-button [current-todo]
  (match [(count (filter-match {"done?" true} todos))]
         [0] nil
         [cur] [:button {"click" ->rem-completed} "Clear completed (" cur ")"]))

(defn ->left []
  (match [(count (filter-match {"done?" false} todos))]
         [1] (str "1 item left")
         [cur] (str cur " items left" )))

(defn ->state [val]
  (commute (assoc state "state" val)))

(defn ->state-class [select]
  (str (match [(state "state")]
              [select] "active"
              :else "")))

(defn main []
  (-> (->todos)
      (core/inject)))

(go
 (while true
   (<! event-loop)
   (time
   (main))))