(ns aurora.strangeloop
  (:require [aurora.engine :refer [exec-program]]))

(defn init []
  (let [prog (if-not (empty? js/window.location.search)
               (subs js/window.location.search 1)
               "blank")]
    (println prog)
    (exec-program (editor (aget js/aurora.strangeloop prog)) true)))


(def blank '{:data {} :pipes [{:name root :scope [] :pipe []}] :main root})
(def datascience '{:data {}  :pipes [{:name root :scope [] :pipe [(get-data)]}  {:name get-data :desc "get data" :pipe [[{"time" 59 "date" "8/26/2013"} {"time" 23 "date" "8/26/2013"} {"time" 224 "date" "8/27/2013"} {"time" 70 "date" "8/27/2013"} {"time" 59 "date" "8/26/2013"} {"time" 23 "date" "8/26/2013"} {"time" 224 "date" "8/27/2013"} {"time" 70 "date" "8/27/2013"} {"time" 59 "date" "8/28/2013"} {"time" 23 "date" "8/26/2013"} {"time" 224 "date" "8/27/2013"} {"time" 70 "date" "8/27/2013"} {"time" 114 "date" "8/29/2013"} {"time" 23 "date" "8/26/2013"} {"time" 224 "date" "8/27/2013"} {"time" 70 "date" "8/27/2013"} {"time" 90 "date" "8/30/2013"} {"time" 23 "date" "8/26/2013"} {"time" 224 "date" "8/27/2013"} {"time" 70 "date" "8/27/2013"} {"time" 59 "date" "8/26/2013"} {"time" 23 "date" "8/26/2013"} {"time" 224 "date" "8/27/2013"} {"time" 70 "date" "8/27/2013"} {"time" 59 "date" "8/26/2013"} {"time" 23 "date" "8/26/2013"} {"time" 224 "date" "8/27/2013"} {"time" 70 "date" "8/27/2013"} {"time" 59 "date" "8/26/2013"} {"time" 23 "date" "8/26/2013"} {"time" 224 "date" "8/27/2013"} {"time" 70 "date" "8/27/2013"} {"time" 59 "date" "8/26/2013"} {"time" 23 "date" "8/26/2013"} {"time" 224 "date" "8/27/2013"} {"time" 70 "date" "8/27/2013"} {"time" 59 "date" "8/26/2013"} {"time" 23 "date" "8/26/2013"} {"time" 224 "date" "8/27/2013"} {"time" 70 "date" "8/27/2013"} {"time" 19 "date" "8/28/2013"} {"time" 3 "date" "8/28/2013"} {"time" 224 "date" "8/27/2013"} {"time" 70 "date" "8/27/2013"} {"time" 59 "date" "8/26/2013"} {"time" 23 "date" "8/26/2013"} {"time" 224 "date" "8/27/2013"} {"time" 70 "date" "8/27/2013"} {"time" 159 "date" "8/30/2013"} {"time" 10 "date" "8/30/2013"} {"time" 66 "date" "8/30/2013"} {"time" 79 "date" "8/30/2013"} ] ]} ] :main root} )
(def todomvc '{:data {todos [{"todo" "Get milk" "done?" false}] state {"state" "all" "all-toggle" false}}  :pipes [  {:name ->todo :scope [todos current-todo] :desc "todo ui" :pipe [(match [current-todo] [{"editing?" true}] ["li.editing" ["input" {"submit" (partial ->edit current-todo) "value" (current-todo "todo") "focused" true}]] :else ["li" {"class" (->done-class current-todo)} ["input" {"checked" (current-todo "done?") "type" "checkbox" "click" (partial ->toggle-done current-todo)}] ["label" {"dblclick" (partial ->editing current-todo)} (current-todo "todo")] ["button" {"click" (partial ->rem todos current-todo)} ""]])]}  {:name ->active-todos :scope [todos state] :desc "filtered todos" :pipe [(match [(state "state")] ["all"] todos ["active"] (filter-match {"done?" false} todos) ["completed"] (filter-match {"done?" true} todos))]}  {:name root :scope [todos state] :pipe [["div#todoapp" ["header#header" ["h1" "Todos"] ["input#toggle-all" {"type" "checkbox" "click" (partial ->all-completed todos state) "checked" (state "all-toggle")}] ["input#new-todo" {"submit" (partial ->add todos) "placeholder" "What needs to be done?"}]] ["ul#todo-list" (each (->active-todos todos state) (partial ->todo todos))] ["div#footer" ["span#todo-count" (->left todos)] ["ul#filters" ["li" ["a" {"click" (partial ->state state "all") "class" (->state-class state "all")} "All"]] ["li" ["a" {"click" (partial ->state state "active") "class" (->state-class state "active")} "Active"]] ["li" ["a" {"click" (partial ->state state "completed") "class" (->state-class state "completed")} "Completed"]]] (->rem-completed-button todos)]] (core/inject _PREV_)]}  {:name ->done-class :scope [current-todo] :desc "done to class" :pipe [(match [(current-todo "done?")] [true] "completed" :else "")]}  {:name ->set-done :scope [to current-todo] :desc "set done? to" :pipe [(assoc current-todo "done?" to)]}  {:name ->all-completed :scope [todos state] :desc "toggle all todos" :pipe [(assoc state "all-toggle" (not (state "all-toggle"))) (commute _PREV_) (each todos (partial ->set-done (not (state "all-toggle")))) (commute _PREV_)]}  {:name ->add :scope [todos e] :desc "add a todo" :pipe [{"todo" (e "value") "done?" false} (conj todos _PREV_) (commute _PREV_)]}  {:name ->editing :scope [current-todo] :desc "edit this todo" :pipe [(assoc current-todo "editing?" true) (commute _PREV_) ]}  {:name ->edit :scope [current-todo e] :desc "save edits" :pipe [(assoc current-todo "todo" (e "value")) (assoc _PREV_ "editing?" false) (commute _PREV_)]}  {:name ->toggle-done :scope [current-todo] :desc "toggle done" :pipe [(match [current-todo] [{"done?" true}] false :else true) (assoc current-todo "done?" _PREV_) (commute _PREV_)]}  {:name ->rem :scope [todos current-todo] :desc "remove this todo" :pipe [(rem current-todo todos) (commute _PREV_)]}  {:name ->rem-completed :desc "remove all completed todos" :scope [todos] :pipe [(filter-match {"done?" false} todos) (commute _PREV_)]}  {:name ->rem-completed-button :scope [todos current-todo] :desc "show 'remove completed' button" :pipe [(filter-match {"done?" true} todos) (count _PREV_) (match [_PREV_] [0] "" :else [:button#clear-completed {"click" (partial ->rem-completed todos)} "Clear completed (" _PREV_ ")"])]}  {:name ->left :scope [todos] :desc "remaining todos text" :pipe [(filter-match {"done?" false} todos) (count _PREV_) (match [_PREV_] [1] "1 item left" :else (str _PREV_ " items left" ))]}  {:name ->state :scope [state val] :desc "set filter to" :pipe [(assoc state "state" val) (commute _PREV_)]}  {:name ->state-class :scope [state val] :desc "active filter? " :pipe [(match [(state "state")] [val] "active" :else "")]} ]  :main root}  )

(defn editor [prog]
  {:data {'program prog


        'state '{"pipe" root
               "step" 0
               "prev" []
               "dirty" "full"
               "contexts" #{:app}
               "context-menu" {}
               "data-editor" {}
               "charts" {}}}
 :pipes '[

         {:name find-pipe
          :scope [name]
          :pipe [(-> (filter-match [cur name]
                                   {:name cur}
                                   (get-in program [:pipes]))
                     first)]}

         {:name clear-menu
          :scope []
          :pipe [(when (get-in state ["context-menu" "active"])
                   (commute (assoc state "context-menu" {}))
                   )]}

         {:name show
          :pipe [(core/ctxs! (state "contexts"))
                 (if (state "dirty")
                   (do
                     (core/!runner program (= (state "dirty") "full")  (find-pipe (state "pipe"))))
                   (let [cur (or (find-pipe (state "pipe")) 'root)]
                     (core/root-inject
                      [:div#aurora {"click" clear-menu}
                       ;(->data)
                       (->pipeline cur)
                       (->workspace cur)
                       ;[:div.console [:p "program:"] (pr-str program) [:p "state:"] (pr-str state) ]
                       (when (get-in state ["context-menu" "active"])
                         ((get-in state ["context-menu" "ui"])))
                       ])))

                 ]}


         {:name ->data
          :pipe [[:ul.data
                  (each-meta (program :data) ->data-rep)]]}

         {:name ->data-rep
          :scope [[k v]]
          :pipe [[:li (pr-str v)]]}

         {:name ->match-pair
          :scope [pipe [match action]]
          :pipe [[:tr
                  [:td
                   (if (coll? match)
                     (each-meta match (partial step-rep pipe))
                     (if (= :else match)
                       [:div.func "Otherwise"]
                       (step-rep pipe match)))]
                  [:td
                   (step-rep pipe action)]]]}

         {:name ->match-root
          :scope [pipe thing]
          :pipe [(data-rep pipe thing)]}

         {:name ->match-ui
          :scope [pipe match]
          :pipe [[:div.match
                  "Find a match for: "
                  (each-meta (second match) (partial ->match-root pipe))
                  [:table
                   (each-meta (partition 2 (drop 2 match)) (partial ->match-pair pipe))]]]}

         {:name ->filter-match-ui
          :scope [pipe match]
          :pipe [[:div.match "Of these "
                  (data-rep pipe (nth match 2))
                  " match "
                  (data-rep pipe (second match))

                  ]]}

         {:name set-pipe
          :scope [func]
          :pipe [(update-in state ["prev"] conj (state "pipe"))
                 (assoc _PREV_ "pipe" func)
                 (assoc _PREV_ "step" 0)
                 (commute _PREV_)]}

         {:name filter-in-scope
          :scope [pipe args]
          :pipe [
                 (set (:scope pipe))
                 (remove _PREV_ args)]}

         {:name get-in-scope
          :scope [pipe var depth]
          :pipe [(if (= var (symbol "_PREV_"))
                   (-> (js/aurora.transformers.editor.->step (:name pipe) (dec (:cur-step pipe)))
                       (get-in depth)
                       )
                   (-> (js/aurora.transformers.editor.->scope (:name pipe))
                       (get var)
                       (get-in depth))

                   )
                 ]}

         {:name rename-func
          :scope [pipe call]
          :pipe [
                 (assoc state "modifying" (-> call meta :path))
                 (commute _PREV_)]}

         {:name set-pipe-desc
          :scope [pipe e]
          :pipe [(assoc pipe :desc (e "value"))
                 (commute _PREV_)
                 (assoc state "modifying" nil)
                 (commute _PREV_)]}

         {:name func-menu-ui
          :scope [pipe call]
          :pipe [
                 [:ul.context-menu {:style (str "top: " (- (get-in state ["context-menu" "y"]) 25)
                                                "px; left: " (- (get-in state ["context-menu" "x"]) 30) "px;")}
                  [:li {"click" (partial rename-func pipe call)} "rename"]
                  [:li {"click" (partial add-param-func pipe call)} "add param"]
                  ]
                 ]}

         {:name func-menu
          :scope [pipe call e]
          :pipe [(println "func menu: " pipe call (meta call))
                 (assoc state "context-menu" {"active" true
                                              "ui" (partial func-menu-ui pipe call)
                                              "x" (.-clientX e)
                                              "y" (.-clientY e)})
                 (commute _PREV_)
                 (.preventDefault e)
                 (.stopPropagation e)]}

         {:name ->invocation
          :scope [[func & args :as call] pipe]
          :pipe [(println (:scope pipe))
                 (let [pipe? (find-pipe func)
                       data? (get-in program [:data func])
                       in-scope? ((set (:scope pipe)) func)
                       attrs (if pipe?
                               {"click" (partial set-pipe func)
                                "class" "func pipeline"
                                "dragover" (fn [e] (.preventDefault e))
                                "dragenter" (fn [e]  (.preventDefault e))
                                "drop" (partial data-drop-func pipe? call)
                                "contextmenu" (partial func-menu pipe? call)}
                               {})
                       prev (symbol "_PREV_")]
                   (match [pipe? data? in-scope? func]
                          [(_ :guard boolean) _ _ _] (if (and (state "modifying") (= (-> call meta :path) (state "modifying")))
                                                       [:div.func attrs [:input.prim-editor {"enter" (partial set-pipe-desc pipe?)
                                                                                             :value (:desc pipe?)
                                                                                             :focused true
                                                                                             "click" (fn [e]
                                                                                                       (.stopPropagation e))
                                                                                             }]]
                                                       [:div.func attrs (:desc pipe?) (each-meta (filter-in-scope pipe args) (partial step-rep pipe))])
                          [_ _ (_ :guard boolean) _] [:div.data (data-rep pipe (ensure-meta (get-in-scope pipe func args) (-> call meta :path)))]
                          [_ _ _ 'get-in] [:div.data (println "args: " args) (data-rep pipe (get-in-scope pipe (first args) (second args)))]
                          [_ _ _ 'partial] (->invocation (with-meta args (meta call)) pipe)
                          [_ _ _ prev] [:div.prev.data (println "Data-rep: " (-> call meta :path)) (data-rep pipe (ensure-meta (get-in-scope pipe func args) (-> call meta :path)))]
                          :else (if-let [desc (op-lookup call func args pipe)]
                                  [:div.func attrs desc]
                                  [:div.func attrs "(" [:div (-> func str)] (rest (each-meta (with-meta (conj args nil) (meta call)) (partial step-rep pipe))) ")"]))

                   )]}

         {:name ensure-meta
          :scope [thing path]
          :pipe [(if (and (satisfies? IMeta thing)
                          thing
                          (not (symbol? thing)))
                   (with-meta thing {:path path})
                   (js/aurora.engine.as-meta thing path))]}

         {:name ->map-entry
          :scope [pipe path [k v] class]
          :pipe [[:li {"class" (str "entry " class)}
                  (step-rep pipe (ensure-meta k (cljs.core/conj path k :aurora.core/key)))
                  ": "
                  (step-rep pipe (ensure-meta v (cljs.core/conj path k)))]]
          }

         {:name ->assoc-entry
          :scope [pipe path [k v] old]
          :pipe [[:li {"class" (str "entry assoc")}
                  (data-rep pipe (ensure-meta k (cljs.core/conj path k :aurora.core/key)))
                  ": "
                  [:div.fromto (data-rep pipe old) (step-rep pipe (ensure-meta v path))]]]
          }

         {:name make-assoc
          :scope [pipe path k v]
          :pipe [
                 (assoc (:pipe pipe) (:cur-step pipe) (list 'assoc (get-in pipe [:pipe (:cur-step pipe)]) k v))
                 (commute _PREV_)
                 (assoc state "modifying" (-> v meta :path))
                 (commute _PREV_)
                 ]}

         {:name ->data-map-entry
          :scope [pipe path [k v] class]
          :pipe [[:li {"class" (str "entry " class)}
                  (data-rep pipe (ensure-meta k (cljs.core/conj path k :aurora.core/key)))
                  ": "
                  (data-rep pipe (ensure-meta v (cljs.core/conj path k)) {"click" (partial make-assoc pipe path k v)})]]
          }

         {:name op-lookup
          :scope [call op args pipe ]
          :pipe [
                 (match [op]
                        ['core/extract] (list "Extract the value of " (step-rep pipe (ensure-meta (second args) (cljs.core/conj (-> call meta :path) 2))) " from " (data-rep pipe (first args)))
                        ['group-by] (list "Group these " (step-rep pipe (ensure-meta (second args) (cljs.core/conj (-> call meta :path) 2))) " by the value of " (step-rep pipe (ensure-meta (first args) (cljs.core/conj (-> call meta :path) 1))))
                        ['vals] (list "Get the values of " (step-rep pipe (ensure-meta (first args) (cljs.core/conj (-> call meta :path) 1))))
                        ['str] (list "Append" (each args (partial data-rep pipe)))
                        ['count] (list "Count " (data-rep pipe (first args)))
                        ['assoc] (let [orig (first args)
                                       orig (if (symbol? orig)
                                              [orig]
                                              [(second orig) (first (drop 2 orig))])
                                       orig-value (apply get-in-scope pipe orig)]
                                   [:div {"class" (str "map data " (when (= (first orig) core/prev-symbol)
                                                                     "prev"))}
                                    "{" (for [[k v] orig-value]
                                          (if (= k (second args))
                                            (->assoc-entry pipe (cljs.core/conj (-> call meta :path) 3) [k (nth args 2)] v)
                                            (->map-entry pipe [] [k v] ))) "}"])
                        ;(list "In " (->invocation (first args) nil pipe) " set " (str (second args) " to " (nth args 2)))

                        ['commute] (list "Replace original with " (data-rep pipe (first args)))
                        ['core/inject] (str "To html")
                        ['each] (list "Tranform each " (data-rep pipe (first args)) " with " (data-rep pipe (ensure-meta (second args) (cljs.core/conj (-> call meta :path) 2))))
                        ['conj] (let [cur (get-in-scope pipe (first args))
                                      cnt (count cur)
                                      cur (if (> cnt 2)
                                            (apply vector "..." (subvec cur (- cnt 3) cnt))
                                            cur)]

                                  [:div.vector "[" (each cur pr-str) [:div.assoc (step-rep pipe (second args))] "]"]
                                  )
                        ;(list "Append " (pr-str (second args)) " to " (->invocation (first args) nil pipe))
                        :else nil)]}

         {:name math-context
          :scope [form cur e]
          :pipe [(assoc state "context-menu" {"active" true
                                              "ui" (partial (if (nil? cur)
                                                              math-add-menu-ui
                                                              math-op-menu-ui)
                                                            form)
                                              "x" (.-clientX e)
                                              "y" (.-clientY e)})
                 (commute _PREV_)
                 (.preventDefault e)
                 (.stopPropagation e)]}

         {:name handle-math-op
          :scope [form op]
          :pipe [(core/commute-path (-> form meta :path) [op form nil])
                 (commute (assoc state "dirty" true))
                 ]}

         {:name handle-math-add
          :scope [form thing]
          :pipe [(core/commute-path (-> form meta :path) thing)
                 (commute (assoc state "dirty" true))
                 ]}

         {:name math-op-menu-ui
          :scope [form]
          :pipe [
                 [:ul.context-menu {:style (str "top: " (- (get-in state ["context-menu" "y"]) 55)
                                                "px; left: " (- (get-in state ["context-menu" "x"]) 30) "px;")}
                  [:li {"click" (partial handle-math-op form "+")} "+"]
                  [:li {"click" (partial handle-math-op form "-")} "-"]
                  [:li {"click" (partial handle-math-op form "*")} "*"]
                  [:li {"click" (partial handle-math-op form "/")} "/"]
                  ]
                 ]}

         {:name math-add-menu-ui
          :scope [form]
          :pipe [
                 [:ul.context-menu {:style (str "top: " (- (get-in state ["context-menu" "y"]) 55)
                                                "px; left: " (- (get-in state ["context-menu" "x"]) 30) "px;")}
                  [:li {"click" (partial handle-math-add form ["sum" core/prev-symbol])} [:span.math-op [:span.math-sigma "Σ"] "x" [:sub "i"] ]]
                  [:li {"click" (partial handle-math-add form ["count" core/prev-symbol])} [:span.math-op.math-count "n"]]
                  ]
                 ]}

         {:name ->math-rep
          :scope [pipe form]
          :pipe [(let [cur (if (satisfies? IDeref form)
                             @form
                             form)]

                   (println "Math: " form (meta form) (type form))
                   (match [(core/type form) form]
                          [:vector (["count" & r] :seq)] [:span.math-op.math-count {"contextmenu" (partial math-context form cur)} "n"]
                          [:vector (["sum" & r] :seq)] [:span.math-op {"contextmenu" (partial math-context form cur)} [:span.math-sigma "Σ"] "x" [:sub "i"] ]
                          [:vector _] [:div.math-expression (interpose (->math-rep pipe (first form)) (rest (each-meta form (partial ->math-rep pipe))))]
                          [:list _] [:div.math-data {"contextmenu" (partial math-context form cur)} (->invocation form pipe)]
                          [:string "/"] [:div.math-divider]
                          [:string _] [:span.math-op form]
                          [_ 'core/!math] nil
                          :else (primitive-or-editor form (str cur) "number" {"contextmenu" (partial math-context form cur)})))]}

         {:name set-step
          :scope [i]
          :pipe [(assoc state "step" i)
                 (commute _PREV_)]}

         {:name ->steps-ui
          :scope [pipe]
          :pipe []}

         {:name ->math
          :scope [pipe math-call]
          :pipe [[:div.math (rest (each-meta math-call (partial ->math-rep pipe)))]
                 ]}

         {:name program-commute
          :scope [thing]
          :pipe [(commute thing)
                 (assoc state "dirty" true)
                 (commute _PREV_)]}

         {:name fill-scope
          :scope [pipe struct step-num]
          :pipe [(let [prev-sym (symbol "_PREV_")
                       prev-value (js/aurora.transformers.editor.->step (:name pipe) (dec step-num))
                       scope (js/aurora.transformers.editor.->scope (:name pipe))
                       scope (assoc scope prev-sym prev-value)]
                   (js/clojure.walk.postwalk-replace scope struct))]}

         {:name chart-options
          :scope [chart-ed]
          :pipe [
                 (assoc-in state ["charts" (-> chart-ed meta :path) "options"] true)
                 (commute _PREV_)
                 ]
          }

         {:name chart-add-data
          :scope [chart e]
          :pipe [
                 (last (js/cljs.reader.read-string (.dataTransfer.getData e "path")))
                 (assoc chart "values" _PREV_)
                 (program-commute _PREV_)
                 ]
          }

         {:name set-chart-option
          :scope [chart option value]
          :pipe [
                 (assoc chart option value)
                 (program-commute _PREV_)
                 ]
          }

         {:name set-chart-type
          :scope [chart v]
          :pipe [
                 (assoc chart "type" v)
                 (program-commute _PREV_)
                 ]
          }

         {:name ->chart-ed
          :scope [pipe chart-call]
          :pipe [
                 (let [chart-state ((state "charts")
                                    (-> chart-call meta :path))
                       chart-data (fill-scope pipe (second chart-call) (core/last-path chart-call))]
                   [:div.chart-ed
                    [:div {;"click" (partial chart-options chart-call)
                           "dragover" (fn [e] (.preventDefault e))
                           "dragenter" (fn [e]  (.preventDefault e))
                           "drop" (partial chart-add-data (second chart-call))}
                     (js/aurora.transformers.chart.!chart-canvas  chart-data)]
                    [:ul.chart-options
                     (for [t ["line" "pie" "bar" "donut"]]
                       [:li {"click" (partial set-chart-type (second chart-call) t) "selected" (= (chart-data "type") t)} t]
                       )
                     [:li {"selected" (chart-data "bezierCurve") "click" (partial set-chart-option (second chart-call) "bezierCurve" (not (chart-data "bezierCurve")))} "smooth"]

                     ]]
                   )

                 ]}

         {:name modify-primitive
          :scope [cur]
          :pipe [
                 (when-let [path (-> cur meta :path)]
                   (commute (assoc state "modifying" path)))]}

         {:name set-primitive
          :scope [cur e]
          :pipe [(e "value")
                 (cond
                  (core/string-float? _PREV_) (js/parseFloat (e "value"))
                  (core/string-int? _PREV_) (js/parseInt (e "value"))
                  :else (e "value"))
                 (core/commute-path (-> cur meta :path) _PREV_)
                 (assoc state "dirty" (if (= (take 2 (-> cur meta :path)) ['program :data])
                                        "full"
                                        true))
                 (commute (assoc _PREV_ "modifying" nil))]}

         {:name primitive-or-editor
          :scope [prim val class args path]
          :pipe [(let [path (or path (-> prim meta :path))]
                   (if (and path
                            (= path (state "modifying")))
                     [:input.prim-editor {"enter" (partial set-primitive prim) :value @prim :focused true
                                          "click" (fn [e]
                                                    (.stopPropagation e))
                                          }]
                     [:div (merge
                            {"class" class
                             "click" (partial modify-primitive prim)
                             "contextmenu" (partial new-data-menu "assoc" (-> prim meta :path))
                             "draggable" true "dragstart" (partial drag-data prim)
                             "dragover" (fn [e] (println "drag over") (.preventDefault e))
                             "dragenter" (fn [e]  (.preventDefault e))
                             "drop" (partial data-drop-primitive prim)}
                            (when (map? args) args))
                      val])
                   )]}

         {:name drag-data
          :scope [substep e]
          :pipe [(.dataTransfer.setData e "path" (vec (remove #{'program :data} (-> substep meta :path))))
                 (.stopPropagation e)]}

         {:name add-key
          :scope [map e]
          :pipe [
                 (assoc map "new-key" nil)
                 (commute _PREV_)
                 (assoc state "modifying" (-> map meta :path (cljs.core/conj "new-key" :aurora.core/key)))
                 (assoc _PREV_ "dirty" "full")
                 (commute _PREV_)
                 (.preventDefault e)
                 (.stopPropagation e)]}

         {:name step-rep
          :scope [pipe substep]
          :pipe [
                 (let [prev (symbol "_PREV_")
                       not-sym (complement symbol)
                       cur (if (satisfies? IDeref substep)
                             @substep
                             substep)]
                   (match [(core/type cur) substep]
                          [:vector _] [:div.vector {"draggable" true "dragstart" (partial drag-data substep)
                                                    "contextmenu" (partial new-data-menu "conj" (-> substep meta :path))}
                                       "["
                                       (if (> (count substep) 5)
                                         (let [rep (each-meta substep (partial step-rep pipe))]
                                           (list (take 4 rep)
                                                 "..."
                                                 ))
                                         (each-meta substep (partial step-rep pipe)))
                                       "]"]
                          [:list (['match & r] :seq)] (->match-ui pipe substep)
                          [:list (['filter-match & r] :seq)] (->filter-match-ui pipe substep)
                          [:list (['core/!math & r] :seq)] (->math pipe substep)
                          [:list (['core/!chart & r] :seq)] (->chart-ed pipe substep)
                          [:list ([func & r] :seq)] (if (symbol? func)
                                                      (->invocation substep pipe)
                                                      (step-rep pipe (with-meta (vec substep) (meta substep)))
                                                      )
                          [:map _] [:ul.map {"draggable" true "dragstart" (partial drag-data substep) "contextmenu" (partial add-key substep)} "{" (each substep (partial ->map-entry pipe (-> substep meta :path))) "}"]
                          [:number _] (primitive-or-editor substep (str cur) "number")
                          [:symbol _] (->invocation (with-meta [cur] (meta substep)) pipe)
                          [:string _]  (primitive-or-editor substep cur "string")
                          [:nil _] (do  (primitive-or-editor substep (pr-str cur) "string"))
                          [:keyword _] [:div.string (name cur)]
                          [:fn _] [:div.fn "fn"]
                          [:bool _] [:div.bool (pr-str cur)]
                          [:html _] [:div.html "html!"]
                          :else (pr-str cur)))]}

         {:name ->each
          :scope [pipe step]
          :pipe [(let [path (-> step meta :path)
                       form (list 'each (get-in program (rest path)) (create-return-pipe))]
                   (println "eaching")
                   (-> (with-meta form {:path path})
                       (program-commute)))]}

         {:name ->group
          :scope [pipe step]
          :pipe [(let [path (-> step meta :path)
                       form (list 'group-by "" (get-in program (rest path)))]
                   (-> (with-meta form {:path path})
                       (program-commute)))]}

         {:name ->vals
          :scope [pipe step]
          :pipe [(let [path (-> step meta :path)
                       form (list 'vals (get-in program (rest path)))]
                   (-> (with-meta form {:path path})
                       (program-commute)))]}

         {:name ->keys
          :scope [pipe step]
          :pipe [(let [path (-> step meta :path)
                       form (list 'keys (get-in program (rest path)))]
                   (-> (with-meta form {:path path})
                       (program-commute)))]}

         {:name ->extract
          :scope [pipe step]
          :pipe [(let [path (-> step meta :path)
                       form (list 'core/extract (get-in program (rest path)) "")]
                   (-> (with-meta form {:path path})
                       (program-commute)))]}

         {:name op-menu-ui
          :scope [pipe substep]
          :pipe [(match [(core/type substep)]
                        [:vector] (list
                                   [:li {"click" (partial ->each pipe substep)} "each"]
                                   [:li "filter"]
                                   [:li {"click" (partial ->extract pipe substep)} "extract"]
                                   [:li {"click" (partial ->group pipe substep)} "group" ]
                                   )
                        [:map] (list [:li {"click" (partial ->keys pipe substep)} "keys" ]
                                     [:li {"click" (partial ->vals pipe substep)} "vals" ]
                                     [:li "match"]))
                 [:ul.context-menu {:style (str "top: " (- (get-in state ["context-menu" "y"]) 55)
                                                "px; left: " (- (get-in state ["context-menu" "x"]) 30) "px;")}
                  _PREV_
                  ]]}

         {:name op-context
          :scope [pipe substep e]
          :pipe [(assoc state "context-menu" {"active" true
                                              "ui" (partial op-menu-ui pipe substep)
                                              "x" (.-clientX e)
                                              "y" (.-clientY e)})
                 (commute _PREV_)
                 (.preventDefault e)
                 (.stopPropagation e)]}

         {:name data-rep
          :scope [pipe substep attrs]
          :pipe [
                 (let [prev (symbol "_PREV_")
                       not-sym (complement symbol)
                       cur (if (satisfies? IDeref substep)
                             @substep
                             substep)]
                   (match [(core/type cur) substep]
                          [:vector _] [:div.vector {"draggable" true "dragstart" (partial drag-data substep)
                                                    "contextmenu" (partial op-context pipe substep)}
                                       "["
                                         (if (> (count substep) 5)
                                           (let [rep (each-meta substep (partial data-rep pipe))]
                                             (list (take 4 rep)
                                                   "..."
                                                   ))
                                           (each-meta substep (partial data-rep pipe)))

                                       "]"]
                          [:list (['match & r] :seq)] (->match-ui substep pipe)
                          [:list (['filter-match & r] :seq)] (->filter-match-ui substep)
                          [:list (['core/!math & r] :seq)] (->math pipe substep)
                          [:list (['core/!chart & r] :seq)] (->chart-ed pipe substep)
                          [:list ([func & r] :seq)] (if (symbol? func)
                                                      (->invocation substep pipe)
                                                      (data-rep pipe (with-meta (vec substep) (meta substep)))
                                                      )
                          [:map _] [:ul.map {"draggable" true "dragstart" (partial drag-data substep)
                                             "contextmenu" (partial op-context pipe substep)} "{" (each substep (partial ->data-map-entry pipe (-> substep meta :path))) "}"]
                          [:number _] [:div (merge {"class" "number" "draggable" true "dragstart" (partial drag-data prim)}
                                                   attrs)
                                       (str cur)]
                          [:symbol _] (->invocation (with-meta [cur] (meta substep)) pipe)
                          [:string _]  [:div (merge {"class" "string" "draggable" true "dragstart" (partial drag-data prim)}
                                                    attrs)
                                        cur]
                          :else (step-rep pipe substep)))]}

         {:name add-step-after
          :scope [pipe cur]
          :pipe [(core/vector-insert (:pipe pipe) (inc (core/last-path cur)) core/prev-symbol)
                 (program-commute _PREV_)]}

         {:name rem-step
          :scope [pipe step]
          :pipe [
                 (core/vector-remove (:pipe pipe) (core/last-path step))
                 (program-commute _PREV_)]}

         {:name ->pipe-step
          :scope [pipe substep]
          :pipe [
                 [:li {"tabindex" "1"
                       "focus" (fn [x] (println "focused step"))
                       "class" (let [i (core/last-path substep)]
                                 (match [(state "step")]
                                        [i] "active"
                                        :else ""))}
                  (step-rep (cljs.core/assoc pipe :cur-step (core/last-path substep)) substep)
                  (let [cap (js/aurora.transformers.editor.->step (:name pipe) (core/last-path substep))]
                    (when-not (nil? cap)
                      [:div.result (step-rep (assoc pipe :cur-step (core/last-path substep)) (ensure-meta cap [(symbol "_PREV_")]))])
                    )
                  [:button.add-step {"click" (partial add-step-after pipe substep)} "+"]
                  [:button.rem-step {"click" (partial rem-step pipe substep)} "x"]
                  ]]}

         {:name ->backup
          :scope [cur]
          :pipe [
                 (assoc state "prev" (vec (take (core/last-path cur) (state "prev"))))
                 (assoc _PREV_ "pipe" @cur)
                 (commute _PREV_)
                 ]}

         {:name ->prev-step
          :scope [p]
          :pipe [["li" {"click" (partial ->backup p)} (-> @p (find-pipe) (:desc "root"))]]}

         {:name ->pipeline
          :scope [pipe]
          :pipe [[:ul.breadcrumb
                  (each-meta (state "prev") ->prev-step)
                  ]]}

         {:name check-dirty-full
          :scope [state item]
          :pipe [(assoc state "dirty" (if (= (take 2 (-> item meta :path)) ['program :data])
                                        "full"
                                        true))
                 (commute _PREV_)]}

         {:name create-return-pipe
          :scope []
          :pipe [(let [id (core/gen-id program "pipe")
                       pipe {:name id
                             :desc "do stuff"
                             :scope ['e]
                             :pipe [nil]}]
                   (->
                    (conj (:pipes program) pipe)
                    (commute))
                   id)]}

         {:name handle-menu-add
          :scope [thing e]
          :pipe [
                 (let [path (get-in state ["context-menu" "path"])
                       item (get-in program (rest path))
                       id (core/gen-id program "data")]
                   (match [(state "context-menu")]
                          [{"context" "assoc"}] (let [thing (if (= 'pipe thing)
                                                              (create-return-pipe)
                                                              thing)]
                                                  (core/commute-path (get-in state ["context-menu" "path"]) (list 'partial thing))
                                                  (check-dirty-full state (get-in program (-> path rest butlast))))
                          [{"context" "conj"} ] (let [func (if (or (list? item) (seq? item))
                                                             (fn [a b] (with-meta (apply list (concat a [b])) (meta a)))
                                                             cljs.core/conj)]
                                                  (commute (func item thing))
                                                  (-> (if-not (coll? thing)
                                                        (assoc state "modifying" (-> item meta :path (cljs.core/conj (count item))))
                                                        state)
                                                      (check-dirty-full item))

                                                  )
                          [{"context" "scope"}] (when (= (:name item) 'root)
                                                  (commute (assoc (:data program) id (with-meta thing {:path ['program :data id]})))
                                                  (commute (assoc item :scope (conj (:scope item) id)))
                                                  (commute (assoc state "dirty" "full")))
                          :else nil))

                 ]}

         {:name menu-ui
          :scope []
          :pipe [
                 [:ul.context-menu {:style (str "top: " (- (get-in state ["context-menu" "y"]) 55)
                                                "px; left: " (- (get-in state ["context-menu" "x"]) 30) "px;")}
                  [:li {"click" (partial handle-menu-add {})} "Map"]
                  [:li {"click" (partial handle-menu-add [])} "Vec"]
                  [:li {"click" (partial handle-menu-add "")} "Prim"]
                  [:li {"click" (partial handle-menu-add 'pipe)} "Pipe"]
                  ]
                 ]}

         {:name new-data-menu
          :scope [ctx path e]
          :pipe [(assoc state "context-menu" {"active" true
                                              "context" ctx
                                              "path" path
                                              "ui" menu-ui
                                              "x" (.-clientX e)
                                              "y" (.-clientY e)})
                 (commute _PREV_)
                 (.preventDefault e)
                 (.stopPropagation e)]}

         {:name ->initial-form
          :scope [thing]
          :pipe [
                 (match thing
                        'commute (list 'commute core/prev-symbol)
                        'println '(println "hello world")
                        'core/!chart '(core/!chart {"type" "line"
                                                    "values" []
                                                    "bezierCurve" true})
                        'core/!math '(core/!math nil)
                        'core/inject (list 'core/inject core/prev-symbol)
                        :else thing)]}

         {:name handle-step-add
          :scope [pipe thing e]
          :pipe [(let [thing (->initial-form thing)]
                   (->
                    (conj (:pipe pipe) thing)
                    (program-commute)))]}

         {:name step-menu-ui
          :scope [pipe e]
          :pipe [[:ul.context-menu {:style (str "top: " (- (get-in state ["context-menu" "y"]) 55)
                                                "px; left: " (- (get-in state ["context-menu" "x"]) 30) "px;")}
                  [:li {"click" (partial handle-step-add pipe {})} "map"]
                  [:li {"click" (partial handle-step-add pipe [])} "vec"]
                  [:li {"click" (partial handle-step-add pipe 'println)} "print"]
                  [:li {"click" (partial handle-step-add pipe 'commute)} "replace"]
                  [:li {"click" (partial handle-step-add pipe 'core/!chart)} "chart"]
                  [:li {"click" (partial handle-step-add pipe 'core/!math)} "math"]
                  [:li {"click" (partial handle-step-add pipe 'core/inject)} "html"]
                  ]
                 ]}

         {:name new-step-menu
          :scope [pipe e]
          :pipe [(assoc state "context-menu" {"active" true
                                              "ui" (partial step-menu-ui pipe)
                                              "x" (.-clientX e)
                                              "y" (.-clientY e)})
                 (commute _PREV_)
                 (.preventDefault e)
                 (.stopPropagation e)]}

         {:name data-drop-primitive
          :scope [prim e]
          :pipe [(println "Dropped primitive: " prim (meta prim))
                 (let [path (js/cljs.reader.read-string (.dataTransfer.getData e "path"))
                       _ (println "Original path: " path)
                       step (list 'get-in (first path) (vec (rest path)))]
                   (core/commute-path (-> prim meta :path) step)
                   (commute (assoc state "dirty" true)))]}

         {:name data-drop-func
          :scope [pipe orig-call e]
          :pipe [
                 (let [path (js/cljs.reader.read-string (.dataTransfer.getData e "path"))
                       step (list 'get-in (first path) (vec (rest path)))
                       call (get-in program (rest (-> orig-call meta :path)))
                       neue? (and (not (list? call))
                                  (not (seq? call)))
                       neue-call (if neue?
                                   (list 'partial (if (vector? call) (first call) call) step)
                                   (concat call [step]))
                       neue-call (with-meta neue-call (meta orig-call))]
                   (commute (-> (concat (butlast (:scope pipe)) [(second step) (last (:scope pipe))])
                                (vec)
                                (with-meta (meta (:scope pipe)))))
                   (commute neue-call)
                   (commute (assoc state "dirty" true)))]}

         {:name data-drop-step
          :scope [pipe e]
          :pipe [
                 (let [path (js/cljs.reader.read-string (.dataTransfer.getData e "path"))
                       step (if (= 1 (count path))
                              (first path)
                              (list 'get-in (first path) (vec (rest path))))]
                   (handle-step-add pipe step nil))
                 ]}

         {:name ->workspace
          :scope [pipe]
          :pipe [[:ul.workspace {"tabindex" "0" "focus" (fn [x] (println "focused"))}
                  (if-let [cap (js/aurora.transformers.editor.->scope (:name pipe))]
                    [:li.scope {"contextmenu" (partial new-data-menu "scope" (-> pipe meta :path))}
                     (for [[k v] cap
                           :let [path (if (get-in program [:data k])
                                        ['program :data k]
                                        [k])
                                 v (if (satisfies? IMeta v)
                                     (with-meta v {:path path})
                                     (js/aurora.engine.as-meta v path))]]
                       (step-rep pipe (js/aurora.engine.meta-walk v path)))]
                    [:li.scope {"contextmenu" (partial new-data-menu "scope" (-> pipe meta :path))} ""])
                  (each-meta (:pipe pipe) (partial ->pipe-step pipe))
                  [:li.new-step {"contextmenu" (partial new-step-menu pipe)
                                 "dragover" (fn [e] (.preventDefault e))
                                 "dragenter" (fn [e]  (.preventDefault e))
                                 "drop" (partial data-drop-step pipe)
                                 }]]]}

         ]
 :main 'show}
  )


(init)
