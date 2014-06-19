(ns aurora.runtime
  (:require [aurora.btree :as btree :refer [tree iterator least greatest key-lt key-lte key-gt key-gte key-compare key=]]
            [aurora.language :refer [knowledge compile]]
            [aurora.util.core :refer [now new-id]]
            [aurora.syntax :refer [know remember draw func change]]
            [aurora.editor.dom :as dom]
            [aurora.editor.ReactDommy :as dommy])
  (:require-macros [aurora.macros :refer [typeof ainto perf-time perf-time-named rules]]))

(defn init-std-lib [kn]
  (.get-or-create-index kn "know" "defaults" #js ["defaults"])
  (.get-or-create-index kn "know" "ui/key-modifier" #js ["key"])
  (.get-or-create-index kn "know" "ui/directCustom" #js ["event-key" "entity"])
  (.get-or-create-index kn "know" "ui/onDirectClick" #js ["elem-id"])
  (.get-or-create-index kn "know" "ui/onClick" #js ["elem-id"])
  (.get-or-create-index kn "know" "ui/focus" #js ["elem-id"])
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
  (let [name->lifetime (.-name->lifetime compiled)]
    (aset name->lifetime "defaults" "external")
    (aset name->lifetime "ui/directCustom" "external")
    (aset name->lifetime "ui/onDirectClick" "external")
    (aset name->lifetime "ui/key-modifier" "external")
    (aset name->lifetime "ui/focus" "external")
    (aset name->lifetime "ui/onClick" "external")
    (aset name->lifetime "ui/onKeyDown" "external")
    (aset name->lifetime "ui/onChange" "external")
    (aset name->lifetime "ui/onDoubleClick" "external")
    (aset name->lifetime "ui/custom" "external")
    (aset name->lifetime "ui/onBlur" "external")

    (aset name->lifetime "ui/elem" "transient")
    (aset name->lifetime "ui/child" "transient")
    (aset name->lifetime "ui/attr" "transient")
    (aset name->lifetime "ui/text" "transient")
    (aset name->lifetime "ui/style" "transient")
    (aset name->lifetime "ui/event-listener" "transient")

    (aset name->lifetime "time" "external")))

(defn env []
  (let [kn (knowledge)
        state (.-state kn)
        queue (array)]
    (.get-or-create-index kn "know" "clauses" #js ["rule-id" "when|know|remember|forget" "clause-id" "name"])
    (.get-or-create-index kn "know" "clause-fields" #js ["clause-id" "constant|variable" "key" "val"])
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

(def react-mappings {"onDirectClick" "onClick"})

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
            original-event (aget cur 1)
            event (or (react-mappings original-event) original-event)
            event-key (aget cur 2)
            entity (aget cur 3)]
        (aset el-attrs event (fn [e]
                               (js/console.log event (.-eventPhase e) (.-currentTarget e) (.-target e))
                               ;(queue (str "ui/" event) #js ["elem-id"] #js [id (js/aurora.runtime.ui.event->params2 event e)])
                               ;(queue (str "ui/custom") #js ["event-key" "entity"] #js [id event-key entity (js/aurora.runtime.ui.event->params2 event e)])
                               (let [[order vals] (event->params e event id)
                                     modified? (atom false)]
                                 (when (.-shiftKey e)
                                   (reset! modified? true)
                                   (queue "ui/key-modifier" #js ["key"] #js ["shift"]))
                                 (when (.-ctrlKey e)
                                   (reset! modified? true)
                                   (queue "ui/key-modifier" #js ["key"] #js ["ctrl"]))
                                 (when (.-altKey e)
                                   (reset! modified? true)
                                   (queue "ui/key-modifier" #js ["key"] #js ["alt"]))
                                 (when (.-metaKey e)
                                   (reset! modified? true)
                                   (queue "ui/key-modifier" #js ["key"] #js ["meta"]))
                                 (when-not @modified?
                                   (queue "ui/key-modifier" #js ["key"] #js ["none"]))
                                 (when (and (== "onDirectClick" original-event)
                                            (not (.isDefaultPrevented e)))
                                   (.preventDefault e)
                                   (queue "ui/onDirectClick" order vals)
                                   (queue "ui/directCustom" #js ["event-key" "entity"] #js [event-key entity]))
                                 (queue (str "ui/" event) order vals)
                                 (queue (str "ui/custom") #js ["event-key" "entity"] #js [event-key entity]))
                               true
                               )
              ))
      (.next events-itr))

    ((aget js/React.DOM (name tag)) el-attrs (array))))

(defn rebuild-tree [env queue]
  (let [els (.keys (.get-or-create-index env "know" "ui/elem" #js ["elem-id" "tag"]))
        attrs (array-iterator (.keys (.get-or-create-index env "know" "ui/attr" #js ["elem-id" "attr" "value"])))
        styles (array-iterator (.keys (.get-or-create-index env "know" "ui/style" #js ["elem-id" "attr" "value"])))
        events (array-iterator (.keys (.get-or-create-index env "know" "ui/event-listener" #js ["elem-id" "event" "event-key" "entity"])))
        text (.keys (.get-or-create-index env "know" "ui/text" #js ["elem-id" "text"]))
        all-children (.keys (.get-or-create-index env "know" "ui/child" #js ["parent-id" "pos" "child-id"]))
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

    #js {:tree final :elems built-els}))

(def mappings {"className" "class"
               "onClick" "click"
               "click" "onClick"
               "onKeyDown" "keydown"
               "keydown" "onKeyDown"
               "onBlur" "blur"
               "blur" "onBlur"
               "onChange" "change"
               "change" "onChange"})

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
        (dom/on elem (or (mappings event) event)
                (fn [e]
                  (let [[order vals] (event->params e event id)]
                    (queue (str "ui/" event) order vals)
                    (queue (str "ui/custom") #js ["event-key" "entity"] #js [event-key entity]))
                  )))
      (.next events-itr))

    elem))

(defn rebuild-tree-dom [env queue]
  (let [els (.keys (.get-or-create-index env "know" "ui/elem" #js ["elem-id" "tag"]))
        attrs (array-iterator (.keys (.get-or-create-index env "know" "ui/attr" #js ["elem-id" "attr" "value"])))
        styles (array-iterator (.keys (.get-or-create-index env "know" "ui/style" #js ["elem-id" "attr" "value"])))
        events (array-iterator (.keys (.get-or-create-index env "know" "ui/event-listener" #js ["elem-id" "event" "event-key" "entity"])))
        text (.keys (.get-or-create-index env "know" "ui/text" #js ["elem-id" "text"]))
        all-children (.keys (.get-or-create-index env "know" "ui/child" #js["parent-id" "pos" "child-id"]))
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

(defn pre-compile [program watchers]
  (let [compiled (compile program)]
    (prn :compiled compiled)
    (prep-compiled compiled)
    (.quiesce compiled program (fn [kn]
                                 (let [final-compiled (compile kn)]
                                   (prn :final-compiled final-compiled)
                                   (prep-compiled final-compiled)
                                   (aset (.-state program) "compiled" final-compiled))
                                 ))
    (aset (.-state program) "watchers" watchers)
    program))

(defn create-direct-renderer [root]
  (fn [kn queue]
    (let [tree (perf-time-named "rebuild tree" (rebuild-tree-dom kn queue))
          container (dom/$ root)
          ]
      (when container
        (perf-time-named "append tree" (do
                                         ;(dom/empty container)
                                         (dom/append container tree)))))))

(defn create-react-renderer [root]
  (fn [kn queue]
    (let [tree-and-els (perf-time-named "rebuild tree" (rebuild-tree kn queue))
          tree (aget tree-and-els "tree")
          els (aget tree-and-els "elems")
          focuses (.get-or-create-index kn "know" "ui/focus" #js ["elem-id"])
          to-focus (when focuses
                     (when-let [focus (last (.keys focuses))]
                       (aget els (aget focus 0))))
          container (dom/$ root)
          dommied (dommy/node tree)
          ]
      (when container
        (perf-time-named "append tree" (do
                                         (js/React.renderComponent dommied container)
                                         (when to-focus
                                           (try
                                             (when (.isMounted to-focus)
                                               (.. to-focus (getDOMNode) (focus)))
                                             (catch :default e
                                               (js/console.log (str "failed to focus: " e)))))
                                         ))))))

(defn re-run [program]
  (let [compiled (aget (.-state program) "compiled")
        watchers (aget (.-state program) "watchers")
        cur-time (now)]
    (know program "time" #js ["time"] #js [cur-time])
    (perf-time-named "quiesce"
     (do
       (.quiesce compiled program (fn [kn]
                                    (when watchers
                                      (doseq [w watchers]
                                        (w kn (aget (.-state program) "queue!"))))))
       (aset (.-state program) "queued" false)
       (.clear-facts program "know" "time")
       )))

  )
