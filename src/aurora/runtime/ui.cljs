(ns aurora.runtime.ui
  (:require [aurora.util.core :as util]
            [aurora.compiler.datalog :as datalog]
            [clojure.set :as set]
            [aurora.runtime.core :as runtime]
            [aurora.editor.ReactDommy :as dommy])
  (:require-macros [aurora.compiler.datalog :refer [query rule]]))

(def animation-frame
  (or (.-requestAnimationFrame js/self)
      (.-webkitRequestAnimationFrame js/self)
      (.-mozRequestAnimationFrame js/self)
      (.-oRequestAnimationFrame js/self)
      (.-msRequestAnimationFrame js/self)
      (fn [callback] (js/setTimeout callback 17))))

(defn frame [do]
  (animation-frame do))

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

(def find-elems (query {:name :ui/elem
                        :id id
                        :tag tag}
                       (+ [id tag])))

(def find-text (query {:name :ui/text
                       :id id
                       :text text}
                      (+ [id text])))

(def find-attr (query {:name :ui/attr
                       :id id
                       :attr attr
                       :value value}
                       (+ {:id id
                           :attr attr
                           :value value})))


(def find-listeners (query {:name :ui/event-listener
                            :id id
                            :event event}
                           (+ {:id id
                               :event event})))

(def find-style (query {:name :ui/style
                       :id id
                       :attr attr
                       :value value}
                       (+ {:id id
                           :attr attr
                           :value value})))

(def find-children (query {:name :ui/child
                           :id id
                           :child child-id
                           :pos pos}
                          (+ {:id id
                              :child-id child-id
                              :pos pos})))

(defn build-element [id tag attrs styles events queue]
  (let [extract (juxt :attr :value)
        el-attrs (into {} (map extract attrs))
        el-styles (into {} (map extract styles))
        el-attrs (into el-attrs (for [{:keys [event]} events]
                                  [event (fn [e]
                                           (queue {:name (keyword "ui" event)
                                                   :id id}))]))
        el-attrs (if (seq el-styles)
                   (assoc el-attrs :style el-styles)
                   el-attrs)]
    (array (keyword tag) el-attrs)))

(defn rebuild-tree [knowledge queue]
  (let [els (find-elems knowledge)
        attrs (group-by :id (find-attr knowledge))
        styles (group-by :id (find-style knowledge))
        listeners (group-by :id (find-listeners knowledge))
        built-els (into {}
                        (for [[id tag] els]
                          [id (build-element id tag (attrs id) (styles id) (listeners id) queue)]))
        built-els (into built-els (find-text knowledge))
        all-children (find-children knowledge)
        children (group-by :id all-children)
        roots (set/difference (set (map first els)) (set (map :child-id all-children)))]
    (doseq [[parent kids] children
            :let [sorted (sort-by :pos kids)
                  parent-el (built-els parent)]
            {:keys [child-id]} sorted
            :let [child-el (built-els child-id)]]
      (.push parent-el child-el))
    `[:div ~@(for [r roots]
               (built-els r))]))

(defn on-bloom-tick [knowledge queue]
  (frame (fn []
           (js/React.renderComponent (dommy/node (rebuild-tree knowledge queue)) js/document.body)
           )))

(swap! runtime/watchers conj on-bloom-tick)

(comment

(def test-kn (-> datalog/empty
                 (datalog/assert {:name :ui/elem :id 1 :tag "div"})
                 (datalog/assert {:name :ui/child :id 1 :child 2 :pos 0})
                 (datalog/assert {:name :ui/child :id 1 :child 3 :pos 1})
                 (datalog/assert {:name :ui/text :id 2 :text "dude what's up?"})
                 (datalog/assert {:name :ui/elem :id 3 :tag "b"})
                 (datalog/assert {:name :ui/event-listener :id 3 :event "onClick"})
                 (datalog/assert {:name :ui/style :id 3 :attr "background" :value "#222"})
                 (datalog/assert {:name :ui/style :id 3 :attr "padding" :value "5px"})
                 (datalog/assert {:name :ui/style :id 3 :attr "margin-left" :value "15px"})
                 (datalog/assert {:name :ui/child :id 3 :child 4 :pos 1})
                 (datalog/assert {:name :ui/text :id 4 :text "NO WAI"})

                 (datalog/and-now)))


(def q (array))
(rebuild-tree test-kn (fn [fact] (.push q fact)))
(on-bloom-tick test-kn (fn [fact] (.push q fact)))
q

  )
