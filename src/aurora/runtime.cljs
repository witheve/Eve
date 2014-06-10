(ns aurora.runtime
  (:require [aurora.btree :as btree :refer [tree iterator least greatest key-lt key-lte key-gt key-gte key-compare key=]]
            [aurora.language :refer [knowledge compile]]
            [aurora.util.core :refer [now new-id]]
            [aurora.syntax :refer [know remember draw func change index]]
            [aurora.editor.dom :as dom]
            [aurora.editor.ReactDommy :as dommy])
  (:require-macros [aurora.macros :refer [typeof ainto perf-time perf-time-named rules]]))

(defn init-std-lib [kn]
  (.get-or-create-index kn "know" "ui/onClick" #js ["elem-id"])
  (.get-or-create-index kn "know" "ui/onKeyDown" #js ["elem-id" "key"])
  (.get-or-create-index kn "know" "ui/onChange" #js ["elem-id" "value"])
  (.get-or-create-index kn "know" "ui/onChecked" #js ["elem-id" "value"])
  (.get-or-create-index kn "know" "ui/onBlur" #js ["elem-id"])
  (.get-or-create-index kn "know" "ui/onDoubleClick" #js ["elem-id"])
  (.get-or-create-index kn "know" "ui/custom" #js ["event-key" "entity"])
  (.get-or-create-index kn "know" "ui/elem" #js ["elem-id" "tag"])
  (.get-or-create-index kn "know" "ui/child" #js ["parent-id" "pos" "child-id"])
  (.get-or-create-index kn "know" "ui/attr" #js ["elem-id" "attr" "value"])
  (.get-or-create-index kn "know" "ui/text" #js ["elem-id" "text"])
  (.get-or-create-index kn "know" "ui/style" #js ["elem-id" "attr" "value"])
  (.get-or-create-index kn "know" "ui/event-listener" #js ["elem-id" "event" "event-key" "entity"])
  (.get-or-create-index kn "know" "time" #js ["time"]))

(defn prep-compiled [compiled]
  (let [trans? (.-name->transient? compiled)]
    (aset trans? "ui/onClick" true)
    (aset trans? "ui/onKeyDown" true)
    (aset trans? "ui/onChange" true)
    (aset trans? "ui/onDoubleClick" true)
    (aset trans? "ui/custom" true)
    (aset trans? "ui/elem" true)
    (aset trans? "ui/child" true)
    (aset trans? "ui/attr" true)
    (aset trans? "ui/text" true)
    (aset trans? "ui/style" true)
    (aset trans? "ui/event-listener" true)
    (aset trans? "time" true)))

(defn env []
  (let [kn (knowledge)
        state (.-state kn)
        queue (array)]
    (.get-or-create-index kn "know" "clauses" #js ["rule-id" "when|know|remember|forget" "clause-id" "name"])
    (.get-or-create-index kn "know" "clause-fields" #js ["clause-id" "constant|variable" "key" "val"])
    (.get-or-create-index kn "know" "editor rules" #js ["rule-id"])
    (.get-or-create-index kn "know" "editor clauses" #js ["rule-id" "type" "clause-id" "madlib-id"])
    (.get-or-create-index kn "know" "editor clause fields" #js ["clause-id" "constant|variable|expression" "key" "val"])
    (.get-or-create-index kn "know" "change clauses" #js ["rule-id" "clause-id" "from|to" "table" "sub-clause-id"])
    (.get-or-create-index kn "know" "ui/editor-root" #js ["rule-id" "clause-id" "root"])
    (.get-or-create-index kn "know" "ui/editor-elem" #js ["rule-id" "clause-id"])
    (.get-or-create-index kn "know" "ui/editor-child" #js ["rule-id" "clause-id"])
    (.get-or-create-index kn "know" "ui/editor-attr" #js ["rule-id" "clause-id"])
    (.get-or-create-index kn "know" "ui/editor-text" #js ["rule-id" "clause-id"])
    (.get-or-create-index kn "know" "ui/editor-style" #js ["rule-id" "clause-id"])
    (.get-or-create-index kn "know" "ui/editor-event-listener" #js ["rule-id" "clause-id"])
    (.get-or-create-index kn "know" "ui/editor-computed-id" #js ["rule-id" "id" "parent" "pos"])
    (init-std-lib kn)
    (aset state "queued" false)
    (aset state "current-queue" queue)
    (aset state "queue!" (fn [index order fact]
                           (println "QUEUING: " index order fact)
                           ;;TODO: this doesn't store any history
                           (when (false? (aget state "queued"))
                             (aset state "queued" (js/setTimeout (partial re-run kn) 0)))
                           (know kn index order fact)))
    kn
    ))

(defn handle-attr [v]
  (condp = v
    "true" true
    "false" false
    v))

(defn into-obj [obj vs]
  (dotimes [x (alength vs)]
    (let [cur (aget vs x)]
      (aset obj (aget cur 0) (aget cur 1)))))

(deftype ArrayIterator [ar len ^:mutable ix]
  Object
  (key [this]
       (when (< ix len)
         (aget ar ix)))

  (next [this]
        (set! ix (+ 1 ix))
        ))

(defn array-iterator [ar]
  (ArrayIterator. ar (alength ar) 0))

(defn event->params [ev event id]
  (condp = event
   "onChange" [#js ["elem-id" "value"] #js [id (.-target.value ev)]]
   "onKeyDown" [#js ["elem-id" "key"] #js [id (.-keyCode ev)]]
   [#js ["elem-id"] #js [id]]))


(defn build-element [id tag attrs-itr styles-itr events-itr queue]
  (let [el-attrs (js-obj "eve-id" id)
        el-styles (js-obj)]
    ;;attrs
    (while (and (.key attrs-itr)
                (== (aget (.key attrs-itr) 0) id))
      (let [cur (.key attrs-itr)]
        (aset el-attrs (aget cur 1) (handle-attr (aget cur 2)))
        (.next attrs-itr)))

    ;;styles
    (aset el-attrs "style" el-styles)
    (while (and (.key styles-itr)
                (== (aget (.key styles-itr) 0) id))
      (let [cur (.key styles-itr)]
        (aset el-styles (aget cur 1) (aget cur 2))
        (.next styles-itr)))

    ;;events
    (while (and (.key events-itr)
                (== (aget (.key events-itr) 0) id))
      (let [cur (.key events-itr)
            event (aget cur 1)
            event-key (aget cur 2)
            entity (aget cur 3)]
        (aset el-attrs event (fn [e]
                               (println "attached handler now")
                               ;(queue (str "ui/" event) #js ["elem-id"] #js [id (js/aurora.runtime.ui.event->params2 event e)])
                               ;(queue (str "ui/custom") #js ["event-key" "entity"] #js [id event-key entity (js/aurora.runtime.ui.event->params2 event e)])
                               (let [[order vals] (event->params e event id)]
                                 (queue (str "ui/" event) order vals)
                                 (queue (str "ui/custom") #js ["event-key" "entity"] #js [event-key entity]))
                               )
              ))
      (.next events-itr))

    ((aget js/React.DOM (name tag)) el-attrs (array))))

(defn rebuild-tree [env queue]
  (let [els (.keys (get (index env "ui/elem") ["elem-id" "tag"]))
        attrs (array-iterator (.keys (get (index env "ui/attr") ["elem-id" "attr" "value"])))
        styles (array-iterator (.keys (get (index env "ui/style") ["elem-id" "attr" "value"])))
        events (array-iterator (.keys (get (index env "ui/event-listener") ["elem-id" "event" "event-key" "entity"])))
        text (.keys (get (index env "ui/text") ["elem-id" "text"]))
        all-children (.keys (get (index env "ui/child") ["parent-id" "pos" "child-id"]))
        built-els (js-obj)
        roots (js-obj)
        final (array :div)
        ]

    (dotimes [x (alength els)]
      (let [cur (aget els x)
            id (aget cur 0)
            tag (aget cur 1)]
        (aset roots id true)
        (aset built-els id (build-element id tag attrs styles events queue))))

    (into-obj built-els text)

    (dotimes [x (alength all-children)]
      (let [cur (aget all-children x)
            parent (aget cur 0)
            child (aget cur 2)
            pos (aget cur 1)
            parent-el (aget built-els parent)
            child-el (aget built-els child)]
        (if (and parent-el (.-props parent-el))
          (.push (.-props.children parent-el) child-el)
          ;(println "UI FAIL: " x parent child pos)
          )
        (js-delete roots child)))


    (let [root-els (js/Object.keys roots)]
      (dotimes [x (alength root-els)]
        (.push final (aget built-els (aget root-els x)))))

    final))

(def mappings {"className" "class"})

(defn build-element-dom [id tag attrs-itr styles-itr events-itr queue]
  (let [elem (js/document.createElement tag)
        el-attrs (js-obj "eve-id" id)
        el-styles (js-obj)]
    ;;attrs
    (while (and (.key attrs-itr)
                (== (aget (.key attrs-itr) 0) id))
      (let [cur (.key attrs-itr)
            key (aget cur 1)]
        (dom/attr* elem (or (mappings key) key) (handle-attr (aget cur 2)))
        (.next attrs-itr)))

    ;;styles
    (aset el-attrs "style" el-styles)
    (while (and (.key styles-itr)
                (== (aget (.key styles-itr) 0) id))
      (let [cur (.key styles-itr)]
        (aset el-styles (aget cur 1) (aget cur 2))
        (.next styles-itr)))

    ;;events
    (while (and (.key events-itr)
                (== (aget (.key events-itr) 0) id))
      (let [cur (.key events-itr)
            event (aget cur 1)
            event-key (aget cur 2)
            entity (aget cur 3)]
        (dom/on elem event (fn [e]
                             (comment
                               (queue (stdlib/map->fact (merge {:ml (keyword "ui" event)
                                                                "event" event-key
                                                                "id" id
                                                                "entity" entity}
                                                               (event->params event e))))
                               (queue (stdlib/map->fact (merge {:ml :ui/custom
                                                                "event" event-key
                                                                "entity" entity}))))
                             )))
      (.next events-itr))

    elem))

(defn rebuild-tree-dom [env queue]
  (let [els (.keys (get (index env "ui/elem") ["elem-id" "tag"]))
        attrs (array-iterator (.keys (get (index env "ui/attr") ["elem-id" "attr" "value"])))
        styles (array-iterator (.keys (get (index env "ui/style") ["elem-id" "attr" "value"])))
        events (array-iterator (.keys (get (index env "ui/event-listener") ["elem-id" "event" "event-key" "entity"])))
        text (.keys (get (index env "ui/text") ["elem-id" "text"]))
        all-children (.keys (get (index env "ui/child") ["parent-id" "pos" "child-id"]))
        built-els (js-obj)
        roots (js-obj)
        ]

    (dotimes [x (alength els)]
      (let [cur (aget els x)
            id (aget cur 0)
            tag (aget cur 1)]
        (aset roots id true)
        (aset built-els id (build-element-dom id tag attrs styles events queue))))


    (dotimes [x (alength text)]
      (let [cur (aget text x)
            id (aget cur 0)
            content (aget cur 1)]
        (aset built-els id (js/document.createTextNode content))))

    (dotimes [x (alength all-children)]
      (let [cur (aget all-children x)
            parent (aget cur 0)
            child (aget cur 2)
            pos (aget cur 1)
            parent-el (aget built-els parent)
            child-el (aget built-els child)]
        ;(.push (.-props.children parent-el) child-el)
        (when parent-el
          (dom/append parent-el child-el))
        (js-delete roots child)))


    (let [root-els (js/Object.keys roots)
          frag (dom/fragment)]
      (dotimes [x (alength root-els)]
        (dom/append frag (aget built-els (aget root-els x))))

      frag)))

(defn pre-compile [program]
  (let [compiled (compile program)]
    (prep-compiled compiled)
    (.quiesce compiled program (fn [kn]
                                 (let [final-compiled (compile kn)]
                                   (prep-compiled final-compiled)
                                   (aset (.-state program) "compiled" final-compiled))
                                 ))
    program))


(defn re-run [program]
  (let [compiled (aget (.-state program) "compiled")]
    (know program "time" #js ["time"] #js [(now)])
    (perf-time-named "quiesce"
     (do
       (.quiesce compiled program (fn [kn]
                                    (let [tree (perf-time-named "rebuild tree" (rebuild-tree program (aget (.-state program) "queue!")))
                                          container (dom/$ "body")
                                          dommied (dommy/node tree)
                                          ]
                                      (when container
                                        (perf-time-named "append tree" (js/React.renderComponent dommied container))
;;                                         (perf-time-named "append tree" (do
;;                                                      ;(dom/empty container)
;;                                                      (dom/append container tree)))
                                        )
                                      ;
                                      )
                                    ))
       (aset (.-state program) "queued" false)
       )))

  )
