(ns aurora.syntax
  (:require [aurora.util.core :refer [new-id]]))


(defn map->clause-fields [clause-fields clause map]
  (doseq [[k v] map]
          (let [var? (symbol? v)
                v (if var?
                    (str v)
                    v)]
            (.push clause-fields #js [clause (if var? "variable" "constant") (cljs.core.name k) v])
            )))


(defn add-rule* [results rule-map]
  (let [rule (or (:name rule-map) (new-id))
        rule (str rule)]
    (doseq [cs (:clauses rule-map)
            [type name fact] cs]
      (let [clause (new-id)]
        (.push (aget results "clauses") #js [rule type clause name])
        (map->clause-fields (aget results "clause-fields") clause fact)))))

(defn add-rules* [env rs]
  (let [results #js {:clauses (array)
                     :clause-fields (array)}]
    (doseq [r rs]
      (add-rule* results r))
    (.add-facts env "know" "clauses" #js ["rule-id" "when|know|remember|forget" "clause-id" "name"] (aget results "clauses"))
    (.add-facts env "know" "clause-fields" #js ["clause-id" "constant|variable" "key" "val"] (aget results "clause-fields"))
    env))


(defn add-rule [results rule-map]
  (let [rule (or (:name rule-map) (new-id))
        rule (str rule)]
    (.push (aget results "rules") #js [(:name rule-map)])
    (doseq [cs (:clauses rule-map)
            [type name fact] cs]
      (let [clause (new-id)]
        (.push (aget results "clauses") #js [rule type clause name])
        (map->clause-fields (aget results "clause-fields") clause fact)
        ))))

(defn add-rules [env rs]
  (let [results #js {:rules (array)
                     :clauses (array)
                     :clause-fields (array)}]
    (doseq [r rs]
      (add-rule results r))
    (.add-facts env "know" "editor rules" #js ["rule-id"] (aget results "rules"))
    (.add-facts env "know" "editor clauses" #js ["rule-id" "type" "clause-id" "madlib-id"] (aget results "clauses"))
    (.add-facts env "know" "editor clause fields" #js ["clause-id" "constant|variable|expression" "key" "val"] (aget results "clause-fields"))
    env))

(defn index [env ix]
  (get-in (.-kind->name->fields->index env) ["know" (name ix)]))


(defn change [env rule name old neue]
  [["when" name old]
   ["forget" name old]
   ["remember" name neue]
   ])

(defn func [env rule var js]
  [["when" "=function" {:variable var :js js}]])

(defn forget-when [env rule table attrs]
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

(defn fact-walk-eve* [env clause rule hic facts [parent pos]]
  (let [[el args & children] hic
        args (if (map? args)
               args
               (js->clj args :keywordize-keys true))
        id (or (:id args) (get args "id"))
        id (if (not id)
             (cond
              (symbol? parent) (let [cur-id (symbol (str parent "_" pos))]
                                 (.push (aget facts "computed-id") #js [cur-id parent pos])
                                 cur-id)
              parent (str parent "-" pos)
              :else (str (gensym "element")))
             id)
        entity (:entity args)
        key (:event-key args)
        real-args (dissoc args "id" :id :style :events :event-key :entity)
        elem-clause (new-id)
        ]
    (if parent
      (let [clause (new-id)]
        (.push (aget facts "child") #js [clause])
        (map->clause-fields (aget facts "fields") clause {:parent-id parent :pos pos :child-id id}))
      (.push (aget facts "root") #js [rule clause id]))
    (.push (aget facts "elem") #js [elem-clause])
    (map->clause-fields (aget facts "fields") elem-clause {:elem-id id :tag (name|sym el)})
    (doseq [[k v] real-args]
      (let [clause (new-id)]
        (.push (aget facts "attr") #js [clause])
        (map->clause-fields (aget facts "fields") clause {:elem-id id :attr (name|sym k) :value v})))
    (doseq [[k v] (:style args)]
      (let [clause (new-id)]
        (.push (aget facts "style") #js [clause])
        (map->clause-fields (aget facts "fields") clause {:elem-id id :attr (name|sym k) :value v})))
    (doseq [ev (:events args)]
      (let [clause (new-id)]
        (.push (aget facts "event") #js [clause])
        (map->clause-fields (aget facts "fields") clause {:elem-id id :event (name|sym ev) :event-key (or key "") :entity (or entity "")})))
    (doseq [[i child] (map-indexed vector children)]
      (if (vector? child)
        (fact-walk-eve* env clause rule child facts [id i])
        (do
          (let [child-id (if (symbol? id)
                           (gensym (str id))
                           (str id "-" i))]
            (when (symbol? id)
              (.push (aget facts "computed-id") #js [child-id id i]))
            (let [clause (new-id)]
              (.push (aget facts "text") #js [clause])
              (map->clause-fields (aget facts "fields") clause {:elem-id child-id :text child}))
            (let [clause (new-id)]
              (.push (aget facts "child") #js [clause])
              (map->clause-fields (aget facts "fields") clause {:parent-id id :pos i :child-id child-id}))
            )
          )))))

(defn draw* [env rule & hic]
  (let [clause (new-id)
        facts #js {:child (array)
                   :root (array)
                   :text (array)
                   :elem (array)
                   :style (array)
                   :attr (array)
                   :event (array)
                   :fields (array)
                   :computed-id (array)}]
    (doseq [h hic
            :when h]
      (fact-walk-eve* env clause rule h facts []))
    (.add-facts env "know" "ui/editor-root" #js ["rule-id" "clause-id" "root"] (aget facts "root"))
    (.add-facts env "know" "ui/editor-elem" #js ["clause-id"] (aget facts "elem"))
    (.add-facts env "know" "ui/editor-child" #js ["clause-id"] (aget facts "child"))
    (.add-facts env "know" "ui/editor-attr" #js ["clause-id"] (aget facts "attr"))
    (.add-facts env "know" "ui/editor-text" #js ["clause-id"] (aget facts "text"))
    (.add-facts env "know" "ui/editor-style" #js ["clause-id"] (aget facts "style"))
    (.add-facts env "know" "ui/editor-event-listener" #js ["clause-id"] (aget facts "event"))
    (.add-facts env "know" "ui/editor-computed-id" #js ["id" "parent" "pos"] (aget facts "computed-id"))
    (.add-facts env "know" "editor clause fields" #js ["clause-id" "constant|variable|expression" "key" "val"] (aget facts "fields"))
    []
    ))

(defn fact-walk-eve [hic facts [parent pos]]
  (let [[el args & children] hic
        args (if (map? args)
               args
               (js->clj args :keywordize-keys true))
        id (or (:id args) (get args "id"))
        id (if (not id)
             (cond
              (symbol? parent) (let [cur-id (symbol (str parent "_" pos))]
                                 (.push facts ["when" "=function" {:variable cur-id :js (str parent " + \"-\" + " pos)}])
                                 cur-id)
              parent (str parent "-" pos)
              :else (str (gensym "element")))
             id)
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

(defn draw [env rule & hic]
  (let [facts (array)]
    (doseq [h hic
            :when h]
      (fact-walk-eve h facts []))
    (vec facts)))

(defn know* [env key order fact]
  (.add-facts env "know" key order fact))

(defn know [env key order fact]
  (.get-or-create-index env "know" key order)
  (.add-facts env "know" key order #js [fact])
  )

(defn remember [env key order fact]
  (.get-or-create-index env "remember" key order)
  (.add-facts env "remember" key order #js [fact])
  )
