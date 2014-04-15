(ns aurora.editor.components.matcher
  (:require [aurora.editor.types :as types]
            [aurora.language.operation :as operation]
            [aurora.editor.dom :as dom]
            [aurora.editor.core :refer [state]]
            [aurora.util.core :refer [key-codes]]
            [clojure.string :as string]))

(def instance (js/CodeMirror. (fn [])))
(dom/add-class (.getWrapperElement instance) :matcher-editor)
(def fuzzy (.-fuzzaldrin js/window))

(def pairs {"[" #"[^\]]"
            "(" #"[^\)]"})

(def pair->mode {"[" "id"
                 "(" "attr"})

(def keywords #"^(when|find|forget|change|see|all|new|draw|pretend)")
(def key-madlibs #"^(see \[name\] as \[expression\]|all \[expression\])|new \[thing\]")

(defn tokenizer [stream]
  (let [ch (.peek stream)]
    (cond
     (pairs ch) (do
                  (.eatWhile stream (pairs ch))
                  (.next stream)
                  (pair->mode ch))
     :else (do
             (.next stream)
             ""))))

(defn aurora-mode []
  #js {:token tokenizer})

(defn on-cm-change []
  (let [cur-value (.getValue instance)
        matcher (:matcher @state)
        same? (= cur-value (:last-selected matcher))
        search (if same?
                 (:last-text matcher)
                 (.trim cur-value))
        candidates (vals (get-in @state [:program :madlibs]))]
    (when-not same?
      (swap! state assoc :matcher (dissoc matcher :last-text :last-selected :selected)))
    (if (= search "")
      (swap! state assoc-in [:matcher :matches] (array))
      (swap! state assoc-in [:matcher :matches]
             (fuzzy (to-array candidates) search #js {:maxResults 4
                                                      :keyfn #(:madlib-str %)})))))

(defn circular-move [cur dir total]
  (if-not cur
    0
    (let [moved (if (= :up dir)
                  (dec cur)
                  (inc cur))]
      (cond
       (< moved 0) (dec total)
       (>= moved total) 0
       :else moved))))

(defn change-match-selection [dir]
  (let [matcher (:matcher @state)
        moved (if dir
                (circular-move (:selected matcher) dir (count (:matches matcher)))
                (:selected matcher))
        cur-value (or (:last-text matcher) (.getValue instance))
        selected-item (:madlib-str (aget (:matches matcher) moved))
        neue (assoc matcher :selected moved)
        final-text (when selected-item
                     selected-item)
        neue (if selected-item
               (assoc neue :last-selected final-text :last-text cur-value)
               neue)]
    (when selected-item
      (.setValue instance final-text)
      (.setCursor instance #js {:line 0 :ch nil})
      )
    (swap! state assoc :matcher neue)
    )
  )

(defn explode-madlib [phrase]
  (let [split (->> (string/split phrase "]")
                  (mapcat #(let [[t ph] (string/split % "[")
                                 final [ph]]
                             (cond
                              (and ph
                                   (not= t "")
                                   (not= ph "")) [t final]
                              (not= t "") [t]
                              (and ph (not= ph "")) [final]
                              :else nil))))
        placeholders (into {}
                           (map #(conj % {:order %2})
                                (filter #(vector? %) split) (range)))]
    {:placeholders placeholders
     :madlib (vec (for [x split]
                    (if (vector? x)
                      (first x)
                      x)))}
    ))

(defn create-madlib [phrase]
  (let [id (operation/new-id)]
    (swap! state assoc-in [:program :madlibs id]
           (merge (explode-madlib phrase)
                  {:madlib-str phrase}))
    id))

(defn handle-submit [v]
  (when (and v (not= "" (.trim v)))
    (let [lookup (into {} (for [[k v] (get-in @state [:program :madlibs])]
                            [(:madlib-str v) k]
                            ))
          matcher (:matcher @state)
          keyword (:type matcher)
          id (when keyword
               (let [clause-info (get-in @state [:program :clauses keyword])]
                        (if (:is-phrase clause-info)
                          keyword)))
          id (if id
               id
               (if-let [found (lookup v)]
                 found
                 (create-madlib v)))
          cur-path (:path matcher)
          node {:type (or keyword "add")
                :ml id}
          node (if (and (not cur-path)
                        (not= keyword "remember"))
                 {:type "rule"
                  :clauses [node]}
                 node)]
      (if-not cur-path
        (swap! state update-in [:program :statements] conj node)
        (swap! state update-in (conj cur-path :clauses) conj node))
      (when (= (:type node) "rule")
        (swap! state assoc-in [:matcher :path] [:program :statements (-> (get-in @state [:program :statements])
                                                                (count)
                                                                (dec))])
        )
      (swap! state update-in [:matcher] dissoc :type)
      (.setValue instance "")
      )))

(defn on-cm-keydown [e]
  (when (= (.-keyCode e) (:up key-codes))
    (change-match-selection :up)
    (.preventDefault e))
  (when (= (.-keyCode e) (:down key-codes))
    (change-match-selection :down)
    (.preventDefault e))
  (when (and (= (.-keyCode e) (:backspace key-codes))
             (= (.getValue instance) ""))
    (swap! state update-in [:matcher] dissoc :type)
    (.preventDefault e))
  (when (= (.-keyCode e) (:enter key-codes))
    (handle-submit (.getValue instance))
    (.preventDefault e)))

(js/CodeMirror.defineMode "aurora" aurora-mode)
(.setOption instance "mode" "aurora")
(.on instance "change" (fn [] (on-cm-change)))
(.on instance "keydown" (fn [_ e] (on-cm-keydown e)))
