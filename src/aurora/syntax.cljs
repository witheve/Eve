(ns aurora.syntax
  (:require [aurora.util.core :refer [new-id]]))

(defn add-rules [env rs]
  (let [results #js {:clauses (array)
                     :clause-fields (array)}]
    (doseq [r rs]
      (add-rule results r))
    (.add-facts env "know" "clauses" #js ["rule-id" "when|know|remember|forget" "clause-id" "name"] (aget results "clauses"))
    (.add-facts env "know" "clause-fields" #js ["clause-id" "constant|variable" "key" "val"] (aget results "clause-fields"))
    env))

(defn add-rule [results clauses]
  (let [rule (new-id)]
    (doseq [cs clauses
            [type name fact] cs]
      (let [clause (new-id)]
        (.push (aget results "clauses") #js [rule type clause name])
        (doseq [[k v] fact]
          (let [var? (symbol? v)
                v (if var?
                    (str v)
                    v)]
            (.push (aget results "clause-fields") #js [clause (if var? "variable" "constant") (cljs.core.name k) v])
            ))))))

(defn index [env ix]
  (get-in (.-kind->name->fields->index env) ["know" (name ix)]))


(defn change [name old neue]
  [["when" name old]
   ["forget" name old]
   ["remember" name neue]
   ])

(defn func [var js]
  [["when" "=function" {:variable var :js js}]])

(defn forget-when [table attrs]
  (let [params (into {} (for [[k v] attrs]
                          (if (symbol? v)
                            [k v]
                            [k (symbol (name k))])))]
    [["when" table params]
     ["forget" table params]]))

(defn name|sym [s]
  (if (symbol? s)
    s
    (name s)))

(defn fact-walk-eve [hic facts [parent pos]]
  (let [[el args & children] hic
        args (if (map? args)
               args
               (js->clj args :keywordize-keys true))
        id (or (:id args) (get args "id"))
        entity (:entity args)
        key (:event-key args)
        real-args (dissoc args "id" :id :style :events :event-key :entity)
        ]
    (when parent
      (.push facts ["know" "ui/child" {:parent-id parent :pos pos :child-id id}]))
    (.push facts ["know" "ui/elem" {:elem-id id :tag (name|sym el)}])
    (doseq [[k v] real-args]
      (.push facts ["know" "ui/attr" {:elem-id id :attr (name|sym k) :value v}]))
    (doseq [[k v] (:style args)]
      (.push facts ["know" "ui/style" {:elem-id id :attr (name|sym k) :value v}]))
    (doseq [ev (:events args)]
      (.push facts ["know" "ui/event-listener" {:elem-id id :event (name|sym ev) :event-key (or key "") :entity (or entity "")}]))
    (doseq [[i child] (map-indexed vector children)]
      (if (vector? child)
        (fact-walk-eve child facts [id i])
        (do
          (let [child-id (if (symbol? id)
                           (gensym (str id))
                           (str id "-" i))]
            (when (symbol? id)
              (.push facts ["when" "=function" {:variable child-id :js (str id " + \"-\" + " i)}]))
            (.push facts ["know" "ui/text" {:elem-id child-id :text child}])
            (.push facts ["know" "ui/child" {:parent-id id :pos i :child-id child-id}]))
          )))))

(defn draw [& hic]
  (let [facts (array)]
    (doseq [h hic
            :when h]
      (fact-walk-eve h facts []))
    (vec facts)))

(defn know [env key order fact]
  (.get-or-create-index env "know" key (to-array order))
  (.add-facts env "know" key (to-array order) (array (to-array fact)))
  )

(defn remember [env key order fact]
  (.get-or-create-index env "remember" key (to-array order))
  (.add-facts env "remember" key (to-array order) (array (to-array fact)))
  )
