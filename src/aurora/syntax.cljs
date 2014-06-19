(ns aurora.syntax
  (:require [aurora.util.core :refer [new-id now]]))


(defn map->clause-fields [clause-fields clause map rule?]
  (doseq [[k v] map]
          (let [[type value] (cond
                              (symbol? v) ["variable" (str v)]
                              (coll? v) ["expression" (first v)]
                              :else ["constant" v]
                              )]
            (if-not rule?
              (.push clause-fields #js [clause type (cljs.core.name k) value])
              (.push clause-fields #js [rule? clause type (cljs.core.name k) value]))
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


(defn add-rule [results project rule-map]
  (let [ts (now)
        rule (or (:name rule-map) (new-id))
        rule (str rule)]
    (.push (aget results "rules") #js [(:name rule-map) project ts])
    (doseq [cs (:clauses rule-map)
            [type name fact] cs]
      (let [clause (new-id)]
        (.push (aget results "clauses") #js [rule type clause name ts])
        (map->clause-fields (aget results "clause-fields") clause fact rule)
        ))))

(defn add-rules [env project rs]
  (let [results #js {:rules (array)
                     :clauses (array)
                     :clause-fields (array)}]
    (doseq [r rs]
      (add-rule results project r))
    (.add-facts env "know" "editor rules" #js ["rule-id" "project-id" "timestamp"] (aget results "rules"))
    (.add-facts env "know" "editor clauses" #js ["rule-id" "type" "clause-id" "madlib-id" "timestamp"] (aget results "clauses"))
    (.add-facts env "know" "editor clause fields" #js ["rule-id" "clause-id" "constant|variable|expression" "key" "val"] (aget results "clause-fields"))
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

(defn fact-walk-eve* [env root-clause rule hic facts [parent pos]]
  (let [[el args & children] hic
        args (if (map? args)
               args
               (js->clj args :keywordize-keys true))
        id (or (:id args) (get args "id"))
        id (if (not id)
             (cond
              (symbol? parent) (let [cur-id (symbol (str parent "_" pos))]
                                 (.push (aget facts "computed-id") #js [rule root-clause (str cur-id) (str parent) pos])
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
        (.push (aget facts "child") #js [rule root-clause clause])
        (map->clause-fields (aget facts "fields") clause {:parent-id parent :pos pos :child-id id} rule))
      (.push (aget facts "root") #js [rule root-clause id (now)]))
    (.push (aget facts "elem") #js [rule root-clause elem-clause])
    (map->clause-fields (aget facts "fields") elem-clause {:elem-id id :tag (name|sym el)} rule)
    (doseq [[k v] real-args]
      (let [clause (new-id)]
        (.push (aget facts "attr") #js [rule root-clause clause])
        (map->clause-fields (aget facts "fields") clause {:elem-id id :attr (name|sym k) :value v} rule)))
    (doseq [[k v] (:style args)]
      (let [clause (new-id)]
        (.push (aget facts "style") #js [rule root-clause clause])
        (map->clause-fields (aget facts "fields") clause {:elem-id id :attr (name|sym k) :value v} rule)))
    (doseq [ev (:events args)]
      (let [clause (new-id)]
        (.push (aget facts "event") #js [rule root-clause clause])
        (map->clause-fields (aget facts "fields") clause {:elem-id id :event (name|sym ev) :event-key (or key "") :entity (or entity "")} rule)))
    (doseq [[i child] (map-indexed vector children)]
      (if (vector? child)
        (fact-walk-eve* env root-clause rule child facts [id i])
        (do
          (let [child-id (if (symbol? id)
                           (gensym (str id))
                           (str id "-" i))]
            (when (symbol? id)
              (.push (aget facts "computed-id") #js [rule root-clause (str child-id) (str id) i]))
            (let [clause (new-id)]
              (.push (aget facts "text") #js [rule root-clause clause])
              (map->clause-fields (aget facts "fields") clause {:elem-id child-id :text child} rule))
            (let [clause (new-id)]
              (.push (aget facts "child") #js [rule root-clause clause])
              (map->clause-fields (aget facts "fields") clause {:parent-id id :pos i :child-id child-id} rule))
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
    (.add-facts env "know" "ui/editor-root" #js ["rule-id" "clause-id" "root" "timestamp"] (aget facts "root"))
    (.add-facts env "know" "ui/editor-elem" #js ["rule-id" "root-clause-id" "clause-id"] (aget facts "elem"))
    (.add-facts env "know" "ui/editor-child" #js ["rule-id" "root-clause-id" "clause-id"] (aget facts "child"))
    (.add-facts env "know" "ui/editor-attr" #js ["rule-id" "root-clause-id" "clause-id"] (aget facts "attr"))
    (.add-facts env "know" "ui/editor-text" #js ["rule-id" "root-clause-id" "clause-id"] (aget facts "text"))
    (.add-facts env "know" "ui/editor-style" #js ["rule-id" "root-clause-id" "clause-id"] (aget facts "style"))
    (.add-facts env "know" "ui/editor-event-listener" #js ["rule-id" "root-clause-id" "clause-id"] (aget facts "event"))
    (.add-facts env "know" "ui/editor-computed-id" #js [ "rule-id" "root-clause-id" "id" "parent" "pos"] (aget facts "computed-id"))
    (.add-facts env "know" "editor clause fields" #js ["rule-id" "clause-id" "constant|variable|expression" "key" "val"] (aget facts "fields"))
    []
    ))

(defn change* [env rule table old neue]
  (let [fields (array)
        clause (new-id)
        from-id (new-id)
        to-id (new-id)
        ts (now)
        ]
    (map->clause-fields fields clause old rule)
    (map->clause-fields fields from-id old rule)
    (map->clause-fields fields to-id neue rule)
    (.add-facts env "know" "change clauses" #js ["rule-id" "clause-id" "from|to" "table" "sub-clause-id" "timestamp"] #js [#js [rule clause "from" table from-id ts]
                                                                                                       #js [rule clause "to" table to-id ts]])
    (.add-facts env "know" "editor clause fields" #js ["rule-id" "clause-id" "constant|variable|expression" "key" "val"] fields)
    []))

(defn limit* [env rule limit ord dir]
  (let [[type limit] (if (symbol? limit)
                       ["variable" (str limit)]
                       ["constant" limit])
        ord (str ord)]
    (.add-facts env "know" "has-agg" #js ["rule-id" "limit-variable|constant" "limit" "ordinal" "ascending|descending"] #js [#js [rule type limit ord dir]]))
  [])

(defn aggregate* [env rule in agg out]
  (.add-facts env "know" "agg-over" #js ["rule-id" "in-var" "agg-fun" "out-var"] #js [#js [rule (str in) (str agg) (str out)]])
  [])

(defn group* [env rule by]
  (.add-facts env "know" "group-by" #js ["rule-id" "var"] #js [#js [rule (str by)]])
  [])

(defn sort* [env rule by]
  (let [by (if (coll? by)
             by
             [by])]
    (doseq [[i by] (map-indexed vector by)]
      (.add-facts env "know" "sort-by" #js ["rule-id" "ix" "var"] #js [#js [rule i by]])))
  [])

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
