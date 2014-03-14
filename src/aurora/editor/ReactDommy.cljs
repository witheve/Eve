(ns aurora.editor.ReactDommy
  (:require
   [clojure.string :as str]))

(def react js/React.DOM)
(def class-set js/React.addons.classSet)

(defprotocol PElement
  (-elem [this] "return the element representation of this"))

(defn next-css-index
  "index of css character (#,.) in base-element. bottleneck"
  [s start-idx]
  (let [id-idx (.indexOf s "#" start-idx)
        class-idx (.indexOf s "." start-idx)
        idx (.min js/Math id-idx class-idx)]
    (if (< idx 0)
      (.max js/Math id-idx class-idx)
      idx)))

(defn base-element
  "dom element from css-style keyword like :a.class1 or :span#my-span.class"
  [node-key]
  (let [node-str (subs (str node-key) 1)
        base-idx (next-css-index node-str 0)
        tag (cond
             (> base-idx 0) (.substring node-str 0 base-idx)
             (zero? base-idx) "div"
             :else node-str)
        attrs (js-obj "classes" (js-obj))]
    (when (>= base-idx 0)
      (loop [str (.substring node-str base-idx)]
        (let [next-idx (next-css-index str 1)
              frag (if (>= next-idx 0)
                     (.substring str 0 next-idx)
                     str)]
          (case (.charAt frag 0)
            \. (aset (.-classes attrs) (.substring frag 1) true)
            \# (aset attrs "id" (.substring frag 1)))
          (when (>= next-idx 0)
            (recur (.substring str next-idx))))))
    [tag attrs]))

(defn ->node-like
  "take data and return DOM node if it satisfies PElement and tries to
   make a document fragment otherwise"
  [data]
  (if (satisfies? PElement data)
    (-elem data)
    (when (seq? data)
      (to-array (map ->node-like data)))))

(defn merge-id [tag-attrs attrs]
  (when-let [id (aget tag-attrs "id")]
    (aset attrs "id" id))
  attrs)

(defn merge-classes [tag-attrs attrs]
  (let [className (aget attrs "className")
        final (js-obj)]
    (when className
      (aset final className true))
    (doseq [k (js/Object.keys (aget tag-attrs "classes"))]
      (aset final k true))
    (when-let [classes (get attrs "classes")]
      (doseq [k (js/Object.keys classes)]
        (aset final k true)))
    (aset attrs "classes" nil)
    (aset attrs "className" (class-set final))
    attrs))

(defn compound-element
  "element with either attrs or nested children [:div [:span \"Hello\"]]"
  [[tag-name maybe-attrs & children]]
  (let [[tag tag-attrs] (base-element tag-name)
        is-attrs? (and (map? maybe-attrs)
                       (not (satisfies? PElement maybe-attrs)))
        attrs (if is-attrs?
                (clj->js maybe-attrs)
                (js-obj))
        children  (if is-attrs? children (cons maybe-attrs children))]
    (->> attrs
         (merge-id tag-attrs)
         (merge-classes tag-attrs))
    (apply (aget react tag) attrs (map ->node-like children))))

(extend-protocol PElement
  js/React.__internals.DOMComponent
  (-elem [this] this)

  js/Element
  (-elem [this] this)

  js/Comment
  (-elem [this] this)

  js/Text
  (-elem [this] this)

  PersistentVector
  (-elem [this] (compound-element this))

  number
  (-elem [this] (str this))

  string
  (-elem [this]
      this))

(defn node [data]
  (if (satisfies? PElement data)
    (-elem data)))
