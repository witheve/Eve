(ns aurora.core
  (:require [clojure.walk :as walk]
            [aurora.keyboard :as kb]
            [aurora.transformers.chart :as chart]
            [aurora.transformers.editor :as editor]
            [aurora.transformers.math :as math]
            [dommy.core :as dommy]
            [dommy.utils :as utils]
            [cljs.reader :as reader]
            [clojure.string :as string]
            [cljs.core.async.impl.protocols :as protos]
            [cljs.core.async :refer [put! chan sliding-buffer take! timeout]])
  (:require-macros [dommy.macros :refer [node sel1 sel]]
                   [aurora.macros :refer [with-path]]
                   [cljs.core.async.macros :refer [go]]))

(set! js/cljs.core.*print-fn* #(when-not (empty? (.trim %))
                                 (.log js/console (.trim %))))

(defprotocol IChannel
  (-history [this])
  (-enqueue [this v]))

(deftype Channel [stuff watches async-channel]
  protos/ReadPort
  (take! [port fn-handler] (protos/take! async-channel fn-handler))
  protos/WritePort
  (put! [port val fn-handler]
        (protos/put! async-channel val fn-handler)
        (-enqueue port val))
  protos/Channel
  (close! [this] (protos/close! async-channel))
  IChannel
  (-history [this] (seq (.-stuff this)))
  (-enqueue [this v] (when-not (= (first (.-stuff this)) v)
                       (set! (.-stuff this) (conj stuff v))))
  IDeref
  (-deref [this] (first (-history this))))

(defn channel []
  (let [c (Channel. '() (array) (chan))]
    c))

(defn enqueue [c v]
  (put! c v)
  c)

(defn history [c]
  (-history c))

(defn html? [e]
  (instance? js/HTMLElement e))

(defn primitive? [e]
  (or (string? e) (number? e) (keyword? e)))

(defn str-contains? [s needle]
  (> (.indexOf s needle) -1))

(def ^:dynamic *path* [])
(def contexts (atom #{}))

(defn ctx! [c]
  (swap! contexts conj c)
  (kb/merge-keys @contexts))

(defn ctxs! [c]
  (reset! contexts c)
  (kb/merge-keys @contexts))

(defn rem-ctx! [c]
  (swap! contexts disj c)
  (kb/merge-keys @contexts))

(defn focus-walk [elem]
  (doseq [thing (sel elem "[focused]")]
    (.focus thing)
    ))

(defn root-inject [ui]
  (let [wrapper (sel1 :#wrapper)
        ws (sel1 "#aurora .workspace")
        scroll-top (when ws (.-scrollTop ws))]
    (dommy/set-html! wrapper "")
    (dommy/append! wrapper (node ui))
    (focus-walk wrapper)
    (when-let [ws (sel1 "#aurora .workspace")]
      (set! (.-scrollTop ws) scroll-top))))

(defn inject [ui]
  (dommy/set-html! (sel1 :#running-wrapper) "")
  (dommy/append! (sel1 :#running-wrapper) (node ui))
  (focus-walk (sel1 :#running-wrapper)))

(defn e->elem [e]
  (.-selectedTarget e))

(defn e->path [e]
  (reader/read-string (dommy/attr (e->elem e) :path)))

(defn vector-insert [v i thing]
  (with-meta
    (vec (concat (take i v) [thing] (drop i v)))
    (meta v)))

(defn vector-remove [v i]
  (with-meta
    (vec (concat (take i v) (drop (inc i) v)))
    (meta v)))

(defn slide-to [n]
  (dommy/set-style! (sel1 :#wrapper) :margin-left n))


(reset! kb/keys {:app {"alt-left" [#(slide-to 0)]
                       "alt-right" [#(slide-to -1024)]}})

(defn type [thing]
  (cond
   (instance? js/aurora.engine.MetaPrimitive thing) (type @thing)
   (instance? js/HTMLElement thing) :html
   (nil? thing) :nil
   (list? thing) :list
   (map? thing) :map
   (vector? thing) :vector
   (set? thing) :set
   (number? thing) :number
   (keyword? thing) :keyword
   (symbol? thing) :symbol
   (string? thing) :string
   (fn? thing) :fn
   (seq? thing) :list
   :else nil))

(def walk walk/postwalk)
(def prewalk walk/prewalk)

(defn !to-data [name thing]
  (if (aget js/aurora.pipelines name)
    (throw (js/Error. "Cannot replace data only supply new data"))
    (aset js/aurora.pipelines name thing)))

(defn extract [things k]
  (map #(get % k) things))

(def !chart chart/!chart)
(def !math math/!math)

(defn map-key-change [path v]
  (let [parent-path (rest (butlast path))
        root (aget js/aurora.pipelines (first path))
        parent (get-in root parent-path)
        cur-key (last path)
        ]
    (aset js/aurora.pipelines (first path)
          (assoc-in root parent-path (-> parent
                                         (dissoc cur-key)
                                         (assoc v (parent cur-key)))))))

(defn commute-path [path v]
  (if (= (last path) ::key)
    (map-key-change (butlast path) v)
    (aset js/aurora.pipelines (first path) (if (next path)
                                             (assoc-in (aget js/aurora.pipelines (first path)) (rest path) v)
                                             v)))
  (js/aurora.engine.meta-walk v path)
  (put! js/aurora.engine.event-loop :commute))

(defn last-path [thing]
  (-> thing meta :path last))


(defn munge* [thing]
  (-> (str thing)
      (string/replace "-" "_")
      (string/replace ">" "_GT_")
      (string/replace "<" "_LT_")
      (string/replace "!" "_BANG_")
      (string/replace "*" "_STAR_")
      ))

(def !runner editor/!runner)
(def !in-running editor/!in-running)

(defn is-float? [n]
  (not (identical? (mod n 1) 0)))

(defn string-float? [s]
  (re-seq #"^[\d\.]+$" s))

(defn string-int? [s]
  (re-seq #"^[\d]+$" s))

(defn in-program? [program sym]
  (or (get-in program [:data sym])
      (first (filter #(= sym (:name %)) (:pipes program)))))

(defn gen-id [program prefix]
  (loop [i 1]
    (let [id (symbol (str prefix i))]
      (if-not (in-program? program id)
        id
        (recur (inc i))))))

(def prev-symbol '_PREV_)
