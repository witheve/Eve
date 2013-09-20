(ns aurora.engine
  (:require [aurora.core :as core]
            [aurora.util.xhr :as xhr]
            [aurora.util.async :as async]
            [clojure.walk :as walk]
            [cljs.reader :as reader]
            [cljs.core.match]
            [cljs.core.async.impl.protocols :as protos]
            [cljs.core.async :refer [put! chan sliding-buffer take! timeout]])
  (:require-macros [cljs.core.match.macros :refer [match]]
                   [dommy.macros :refer [node sel1 sel]]
                   [cljs.core.async.macros :refer [go]]
                   [aurora.macros :refer [filter-match]]))

(deftype MetaPrimitive [thing meta]
  IWithMeta
  (-with-meta [this meta] (set! (.-meta this) meta))

  IMeta
  (-meta [this] (.-meta this))

  IDeref
  (-deref [this] thing))

(meta (MetaPrimitive. 14234 {:path [:data 'foo 0]}))

(defn ->value [thing]
  (if (satisfies? IDeref thing)
    @thing
    thing))

;;[:data 'foo]
;;[:data 'foo 0]
;;[:data 'foo 2 0]
;;[:data 'foo :comments 0]

(def listener-loop (chan))
(def event-loop (chan))
(def commute-listener nil)

(defn conj [p c]
  (if (satisfies? IMeta c)
    (cljs.core/conj p (with-meta c {:path (-> p meta :path (cljs.core/conj (count p)))}))
    (cljs.core/conj p c)))

(def assoc (with-meta (fn assoc [p k v]
                        (with-meta
                        (if-not (satisfies? IMeta v)
                          (cljs.core/assoc p k v)
                          (cljs.core/assoc p k (with-meta v {:path (-> p meta :path (cljs.core/conj k))})))
                          (meta p)))
             {:desc "Add key/value"}))

(defn assoc-in [m [k & ks] v]
  (if ks
    (assoc m k (assoc-in (get m k) ks v))
    (assoc m k v)))

(defn commute [v]
  (let [path (-> v meta :path)
        v (if (seq? v)
            (with-meta v (meta v))
            v)
        v (walk/postwalk (fn [x]
                           (if (instance? MetaPrimitive x)
                             @x
                             x))
                         v)]
    (aset js/aurora.pipelines (first path) (if (next path)
                                             (assoc-in (aget js/aurora.pipelines (first path)) (rest path) v)
                                             v))
    (meta-walk v path)
    (println "commuted! " v (meta v))
    (put! event-loop :commute)))

(defn as-meta [thing path]
  (if (or (symbol? thing) (nil? thing) (not (satisfies? IMeta thing)))
    (MetaPrimitive. thing {:path path})
    thing))

(defn each [vs f]
  (if-let [path (-> vs meta :path (or []))]
    (doall (with-meta (map f vs) (meta vs)))
    (doall (map f vs))))

(defn each-meta [vs f]
  (if-let [path (-> vs meta :path)]
     (each
     (with-meta
       (for [[i v] (map-indexed vector vs)]
         (as-meta v (cljs.core/conj path i)))
       (meta vs))
     f)
    (each vs f)))

(defn mget [thing path]
  (when-let [cur (get-in thing path)]
    (as-meta cur (into (-> thing meta :path (or [])) path))))

(defn rem [thing parent]
  (let [final (core/vector-remove parent (-> thing meta :path last))]
    (meta-walk final (-> parent meta :path))
    final))


(defn merge [orig & vs]
  (with-meta
    (apply cljs.core/merge orig vs)
    (meta orig)))

(defn start-main-loop [main]
  (let [debounced (async/debounce event-loop 1)]
  (go
   (loop [run? true]
     (when run?
       (.time js/console "main")
       (main)
       (.timeEnd js/console "main")
       (put! listener-loop :done)
       (recur (<! debounced)))))))

(extend-protocol IAssociative
  List
  (-assoc [coll k v]
          (with-meta
            (apply list (assoc (with-meta (vec coll) (meta coll)) k v))
            (meta coll)))
  LazySeq
  (-assoc [coll k v]
          (with-meta
            (apply list (assoc (with-meta (vec coll) (meta coll)) k v))
            (meta coll))))


(extend-protocol ILookup
  List
  (-lookup [tcoll v o]
    (nth tcoll v))
  (-lookup [tcoll v]
    (nth tcoll v))

  LazySeq
  (-lookup [tcoll v o]
    (nth tcoll v))
  (-lookup [tcoll v]
    (nth tcoll v))

  IndexedSeq
  (-lookup [tcoll o]
    (nth tcoll v))
  (-lookup [tcoll v]
    (nth tcoll v))

  EmptyList
  (-lookup [coll v]
           (nth coll v))


  )

(defn meta-walk [cur path]
  (when (and (not= nil cur)
             (satisfies? IMeta cur))
    (alter-meta! cur cljs.core/assoc :path path)
    (cond
     (or (list? cur) (seq? cur)) (doseq [[k v] (map-indexed vector cur)]
                                   (meta-walk v (cljs.core/conj path k)))
     (map? cur) (doseq [[k v] cur]
                  (meta-walk v (cljs.core/conj path k)))
     (vector? cur) (doseq [[k v] (map-indexed vector cur)]
                     (meta-walk v (cljs.core/conj path k)))))
  cur)

(defn exec-program [prog clear?]
  (when (or clear? (not js/aurora.pipelines))
    (set! js/aurora.pipelines (js-obj)))
  (doseq [[k v] (:data prog)
          :when (not (aget js/aurora.pipelines (str k)))
          :let [v (reader/read-string (pr-str v))]]
    (meta-walk v [k])
    (aset js/aurora.pipelines (str k) v))
  (put! event-loop false)
  (set! js/aurora.engine.event-loop (chan))
  (put! listener-loop false)
  (set! js/aurora.engine.listener-loop (chan))
  (go
   (let [pipes (<! (xhr/xhr [:post "http://localhost:8082/code"] {:code (pr-str (:pipes prog))}))]
     (.eval js/window pipes)
     (println "evaled: " (subs pipes 0 10))
     (start-main-loop (fn []
                        (let [main-fn (aget js/aurora.pipelines (str (:main prog)))
                              main-pipe (first (filter #(= (:main prog) (:name %)) (:pipes prog)))
                              vals (map #(aget js/aurora.pipelines (str %)) (:scope main-pipe))]
                          (apply main-fn vals))))

     )))
