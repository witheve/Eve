(ns aurora.runtime.ui
  (:require [aurora.util.core :as util]
            [aurora.language :as language]
            [aurora.language.representation :as representation]
            [aurora.language.operation :as operation]
            [clojure.set :as set]
            [aurora.editor.dom :as dom]
            [aurora.runtime.stdlib :as stdlib]
            [aurora.runtime.core :as runtime]
            [aurora.editor.ReactDommy :as dommy])
  (:require-macros [aurora.language.macros :refer [rule]]))

(def animation-frame
  (or (.-requestAnimationFrame js/self)
      (.-webkitRequestAnimationFrame js/self)
      (.-mozRequestAnimationFrame js/self)
      (.-oRequestAnimationFrame js/self)
      (.-msRequestAnimationFrame js/self)
      (fn [callback] (js/setTimeout callback 17))))

(defn frame [do]
  (animation-frame do))

(defn event->params [ev e]
  (let [tag (.-target.tagName e)
        type (.-target.type e)]
    (condp = ev
      "onChange" {"value" (cond
                          (= type "checkbox") (if (.-target.checked e)
                                                "true"
                                                "false")
                          (= type "radio") (if (.-target.checked e)
                                             "true"
                                             "false")
                          (= tag "option") (.-target.selected e)
                          :else (.-target.value e))}
      "onKeyDown" {"keyCode" (.-keyCode e)}
      {})))

;; every bloom tick queue up all the UI changes we should do
;; each animation-frame resolve the queue of changes against the UI
;;     - are we tracking this id yet? resolve attr/style/child
;;     - we haven't seen this, add it

;;TODO: everything is on the UI thread right now.

;; ui facts
;; {:name :ui/elem :id id :tag "div"}
;; {:name :ui/text :id id :text "hey how are you?"}
;; {:name :ui/attr :id id :attr "class" :value "foo"}
;; {:name :ui/event-listener :id id :event "onClick"}
;; {:name :ui/style :id id :attr "background" :value "red"}
;; {:name :ui/child :id id :child id :pos i}

(defn collect [facts]
  (let [styles (array)
        listeners (array)
        text (array)
        elems (array)
        attrs (array)
        children (array)]
    (doseq [fact facts
            :let [[coll thing] (condp = (.-shape fact)
                                 :ui/style [styles {:id (get fact 0)
                                                    :attr (get fact 1)
                                                    :value (get fact 2)}]
                                 :ui/event-listener [listeners {:id (get fact 1)
                                                                :event (get fact 0)
                                                                }]
                                 :ui/text [text [(get fact 0) (get fact 1)]]
                                 :ui/elem [elems [(get fact 0) (get fact 1)]]
                                 :ui/attr [attrs {:id (get fact 0)
                                                  :attr (get fact 1)
                                                  :value (get fact 2)}]
                                 :ui/child [children {:id (get fact 0)
                                                      :child-id (get fact 1)
                                                      :pos (get fact 2)}]
                                 nil)]
            :when coll]
      (.push coll thing))
    {:styles styles
     :listeners listeners
     :text text
     :elems elems
     :attrs attrs
     :children children}))

(defn handle-attr [v]
  (condp = v
    "true" true
    "false" false
    v))

(defn build-element [id tag attrs styles events queue]
  (let [extract (juxt :attr (comp handle-attr :value))
        el-attrs (into {} (map extract attrs))
        el-styles (into {} (map extract styles))
        el-attrs (into el-attrs (for [{:keys [event entity event-key] :as foo} events]
                                  [event (fn [e]
                                           (queue (stdlib/map->fact (merge {:ml (keyword "ui" event)
                                                                            "event" event-key
                                                                            "id" id
                                                                            "entity" entity}
                                                                           (event->params event e)))))]))
        el-attrs (if (seq el-styles)
                   (assoc el-attrs :style el-styles)
                   el-attrs)]
    (array (keyword tag) el-attrs)))

(defn rebuild-tree [knowledge queue]
  (let [collected (collect (language/get-facts knowledge :pretended))
        els (:elems collected)
        attrs (group-by :id (:attrs collected))
        styles (group-by :id (:styles collected))
        listeners (group-by :id (:listeners collected))
        built-els (into {}
                        (for [[id tag] els]
                          [id (build-element id tag (attrs id) (styles id) (listeners id) queue)]))
        built-els (into built-els (:text collected))
        all-children (:children collected)
        children (group-by :id all-children)
        roots (set/difference (set (map first els)) (set (map :child-id all-children)))]
    (doseq [[parent kids] children
            :let [sorted (try (sort-by :pos kids)
                           (catch :default e
                             (println "failed sort: " kids)
                             kids))
                  parent-el (built-els parent)]
            :when parent-el
            {:keys [child-id]} sorted
            :let [child-el (built-els child-id)]]
      (.push parent-el child-el))
    `[:div ~@(for [r roots]
               (built-els r))]))

(defn on-bloom-tick [knowledge queue]
  (frame (fn []
           (let [tree (rebuild-tree knowledge queue)
                 container (dom/$ "#ui-preview")]
             ;(println "UI Tree: " (pr-str tree))
             (when container
               (js/React.renderComponent (dommy/node tree) container))
             ;
             )
           )))

(swap! runtime/watchers conj (fn [knowledge queue]
                               (on-bloom-tick knowledge queue)))

(defn name|sym [s]
  (if (symbol? s)
    s
    (name s)))

(defn fact-walk [hic facts [parent pos]]
  (let [[el args & children] hic
        args (if (map? args)
               args
               (js->clj args :keywordize-keys true))
        id (or (:id args) (get args "id"))
        entity (:entity args)
        key (:event_key args)
        real-args (dissoc args "id" :id :style :events :event_key :entity)
        ]
    (when parent
      (.push facts {:ml :ui/child "id" parent "child" id "pos" pos}))
    (.push facts {:ml :ui/elem "id" id "tag" (name|sym el)})
    (doseq [[k v] real-args]
      (.push facts {:ml :ui/attr "id" id "attr" (name|sym k) "value" v}))
    (doseq [[k v] (:style args)]
      (.push facts {:ml :ui/style "id" id "attr" (name|sym k) "value" v}))
    (doseq [ev (:events args)]
      (.push facts {:ml :ui/event-listener "id" id "event-key" (or key "") "event" (name|sym ev) "entity" (or entity "")}))
    (doseq [[i child] (map-indexed vector children)]
      (if (vector? child)
        (fact-walk child facts [id i])
        (do
          (.push facts {:ml :ui/text "id" (str id "-" i) "text" child})
          (.push facts {:ml :ui/child "id" id "child" (str id "-" i) "pos" i})
          )))))

(defn hiccup->facts [& hic]
  (let [facts (array)]
    (doseq [h hic]
      (fact-walk h facts []))
    (vec facts)))

(comment

(def test-kn (representation/->Knowledge #{{:name :ui/elem, :id "counter-ui", :tag "p"}
                                   {:name :ui/text, :id "counter-ui-0", :text 4}
                                   {:name :ui/child, :id "counter-ui", :child "counter-ui-0", :pos 0}
                                   {:name :ui/elem, :id "incr-button", :tag "button"}
                                   {:name :ui/event-listener, :id "incr-button", :event "onClick"}
                                   {:name :ui/text, :id "incr-button-0", :text "increment"}
                                   {:name :ui/child, :id "incr-button", :child "incr-button-0", :pos 0}
                                   }
                                 #{} #{}))


  (operation/query-rule find-elems test-kn)
  (operation/query-rule find-text test-kn)

(def q (array))
(rebuild-tree test-kn (fn [fact] (.push q fact)))
(on-bloom-tick test-kn (fn [fact] (.push q fact)))
q

  )
