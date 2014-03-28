(ns aurora.runtime.ui
  (:require [aurora.util.core :as util]
            [aurora.compiler.datalog :as datalog]
            [clojure.set :as set]
            [aurora.editor.dom :as dom]
            [aurora.runtime.core :as runtime]
            [aurora.editor.ReactDommy :as dommy])
  (:require-macros [aurora.compiler.datalog :refer [rule]]))

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

(def find-elems (rule {:ml :ui/elem
                        "id" id
                        "tag" tag}
                       (+ [id tag])))

(def find-text (rule {:ml :ui/text
                       "id" id
                       "text" text}
                      (+ [id text])))

(def find-attr (rule {:ml :ui/attr
                       "id" id
                       "attr" attr
                       "value" value}
                       (+ {:id id
                           :attr attr
                           :value value})))

(def find-listeners (rule {:ml :ui/event-listener
                            "id" id
                            "entity" entity
                            "event-key" key
                            "event" event}
                           (+ {:id id
                               :event-key key
                               :entity entity
                               :event event})))


(def find-style (rule {:ml :ui/style
                       "id" id
                       "attr" attr
                       "value" value}
                       (+ {:id id
                           :attr attr
                           :value value})))

(def find-children (rule {:ml :ui/child
                          "id" id
                          "child" child-id
                          "pos" pos}
                          (+ {:id id
                              :child-id child-id
                              :pos pos})))

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
                                           (queue (merge {:ml (keyword "ui" event)
                                                          "event" event-key
                                                          "id" id}
                                                         (when entity
                                                           {"entity" entity})
                                                         (event->params event e))))]))
        el-attrs (if (seq el-styles)
                   (assoc el-attrs :style el-styles)
                   el-attrs)]
    (array (keyword tag) el-attrs)))

(defn rebuild-tree [knowledge queue]
  (let [els (datalog/query-rule find-elems knowledge)
        attrs (group-by :id (datalog/query-rule find-attr knowledge))
        styles (group-by :id (datalog/query-rule find-style knowledge))
        listeners (group-by :id (datalog/query-rule find-listeners knowledge))
        built-els (into {}
                        (for [[id tag] els]
                          [id (build-element id tag (attrs id) (styles id) (listeners id) queue)]))
        built-els (into built-els (datalog/query-rule find-text knowledge))
        all-children (datalog/query-rule find-children knowledge)
        children (group-by :id all-children)
        roots (set/difference (set (map first els)) (set (map :child-id all-children)))]
    (doseq [[parent kids] children
            :let [sorted (sort-by :pos kids)
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
             (println "UI Tree: " (pr-str tree))
             (when container
               (js/React.renderComponent (dommy/node tree) container))
             ;
             )
           )))

(swap! runtime/watchers conj (fn [knowledge queue]
                               (on-bloom-tick knowledge queue)))


(defn fact-walk [hic facts [parent pos]]
  (let [[el args & children] hic
        args (js->clj args :keywordize-keys true)
        id (:id args)
        entity (:entity args)
        key (:event-key args)
        real-args (dissoc args :id :style :events :event-key :entity)]
    (when parent
      (.push facts {:ml :ui/child "id" parent "child" id "pos" pos}))
    (.push facts {:ml :ui/elem "id" id "tag" (name el)})
    (doseq [[k v] real-args]
      (.push facts {:ml :ui/attr "id" id "attr" (name k) "value" v}))
    (doseq [[k v] (:style args)]
      (.push facts {:ml :ui/style "id" id "attr" (name k) "value" v}))
    (doseq [ev (:events args)]
      (.push facts {:ml :ui/event-listener "id" id "event-key" key "event" (name ev) "entity" entity}))
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

(def test-kn (datalog/Knowledge. #{{:name :ui/elem, :id "counter-ui", :tag "p"}
                                   {:name :ui/text, :id "counter-ui-0", :text 4}
                                   {:name :ui/child, :id "counter-ui", :child "counter-ui-0", :pos 0}
                                   {:name :ui/elem, :id "incr-button", :tag "button"}
                                   {:name :ui/event-listener, :id "incr-button", :event "onClick"}
                                   {:name :ui/text, :id "incr-button-0", :text "increment"}
                                   {:name :ui/child, :id "incr-button", :child "incr-button-0", :pos 0}
                                   }
                                 #{} #{}))


  (datalog/query-rule find-elems test-kn)
  (datalog/query-rule find-text test-kn)

(def q (array))
(rebuild-tree test-kn (fn [fact] (.push q fact)))
(on-bloom-tick test-kn (fn [fact] (.push q fact)))
q

  )
