(ns aurora.runtime
  (:require [aurora.btree :as btree :refer [tree iterator least greatest key-lt key-lte key-gt key-gte key-compare key=]]
            [aurora.language :refer [knowledge compile]]
            [aurora.util.core :refer [now new-id]]
            [aurora.syntax :refer [know remember draw func change index]]
            [aurora.editor.dom :as dom]
            [aurora.editor.ReactDommy :as dommy])
  (:require-macros [aurora.macros :refer [typeof ainto perf-time perf-time-named rules]]))

(defn init-std-lib [kn]
  (.get-or-create-index kn "know" "defaults" #js ["defaults"])
  (.get-or-create-index kn "know" "ui/key-modifier" #js ["key"])
  (.get-or-create-index kn "know" "ui/directCustom" #js ["event-key" "entity"])
  (.get-or-create-index kn "know" "ui/onDirectClick" #js ["elem-id"])
  (.get-or-create-index kn "know" "ui/onDirectKeyDown" #js ["elem-id" "key"])
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
  (let [trans? (.-name->transient? compiled)]
    (aset trans? "defaults" true)
    (aset trans? "ui/directCustom" true)
    (aset trans? "ui/onDirectClick" true)
    (aset trans? "ui/onDirectKeyDown" true)
    (aset trans? "ui/key-modifier" true)
    (aset trans? "ui/focus" true)
    (aset trans? "ui/onBlur" true)
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
    (aset trans? "time" false)))

(defn env []
  (let [kn (knowledge)
        state (.-state kn)
        queue (array)]
    (.get-or-create-index kn "know" "clauses" #js ["rule-id" "when|know|remember|forget" "clause-id" "name"])
    (.get-or-create-index kn "know" "clause-fields" #js ["clause-id" "constant|variable" "key" "val"])
    (.get-or-create-index kn "know" "has-agg" #js ["rule-id" "limit-variable|constant" "limit" "ordinal" "ascending|descending"])
    (.get-or-create-index kn "know" "group-by" #js ["rule-id" "var"])
    (.get-or-create-index kn "know" "sort-by" #js ["rule-id" "ix" "var"])
    (.get-or-create-index kn "know" "agg-over" #js ["rule-id" "in-var" "agg-fun" "out-var"])
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

(def react-mappings {"onDirectClick" "onClick"
                     "onDirectKeyDown" "onKeyDown"})

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
                               (js/console.log event original-event (react-mappings original-event))
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
                                 (when (and (react-mappings original-event)
                                            (not (.isDefaultPrevented e)))
                                   (when-not (#{"PASSWORD" "INPUT" "TEXTAREA"} (.-target.nodeName e))
                                     (.preventDefault e)
                                     (queue (str "ui/" original-event) order vals)
                                     (queue "ui/directCustom" #js ["event-key" "entity"] #js [event-key entity])))
                                 (queue (str "ui/" event) order vals)
                                 (queue (str "ui/custom") #js ["event-key" "entity"] #js [event-key entity]))
                               true
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

(defn pre-compile [program watchers]
  (let [compiled (compile program)]
    (prep-compiled compiled)
    (.quiesce compiled program (fn [kn]
                                 (let [final-compiled (compile kn)]
                                   (prep-compiled final-compiled)
                                   (aset (.-state program) "compiled" final-compiled))
                                 ))
    (aset (.-state program) "watchers" watchers)
    program))

(def render-queue #js {:queued false})

(def animation-frame
  (or (.-requestAnimationFrame js/self)
      (.-webkitRequestAnimationFrame js/self)
      (.-mozRequestAnimationFrame js/self)
      (.-oRequestAnimationFrame js/self)
      (.-msRequestAnimationFrame js/self)
      (fn [callback] (js/setTimeout callback 17))))

(defn queue-render! [kn func]
  (let [render-queue (or (.-state.render-queue kn)
                         (let [queue #js {:queued false}]
                           (set! (.-state.render-queue kn) queue)
                           queue))]
    (set! (.-func render-queue) func)
    (when-not (.-queued render-queue)
      (set! (.-queued render-queue) true)
      (animation-frame #(do
                          ((.-func render-queue))
                          (set! (.-queued render-queue) false))))))

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
    (try
      (let [tree-and-els (perf-time-named "rebuild tree" (rebuild-tree kn queue))
            tree (aget tree-and-els "tree")
            els (aget tree-and-els "elems")
            focuses (get (index kn "ui/focus") ["elem-id"])
            to-focus (when focuses
                       (last (.keys focuses)))
            container (dom/$ root)
            dommied (dommy/node tree)
            ]
        (when container
          (queue-render! kn
                         (fn []
                           (perf-time-named "append tree" (do
                                                            (js/React.renderComponent dommied container)
                                                            (when to-focus
                                                              (try
                                                                (println "trying to focus")
                                                                (let [elem (js/document.querySelector (str "." (aget to-focus 0)))]
                                                                  (js/console.log elem js/document.activeElement (= elem js/document.activeElement))
                                                                  (when (and elem
                                                                             (not (= elem js/document.activeElement)))
                                                                    (println "FOCUSING: " elem)
                                                                    (.focus elem)
                                                                    ))
                                                                (catch :default e
                                                                  (js/console.log (str "failed to focus: " e)))))
                                                            ))))))
      (catch :default e
        (js/console.log (str "FAILED UI: " e))))))



(defn re-run [program]
  (let [compiled (aget (.-state program) "compiled")
        watchers (aget (.-state program) "watchers")
        cur-time (.getTime (js/Date.))]
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
