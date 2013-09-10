(ns aurora.engine
  (:require [aurora.core :as core]
            [aurora.util.xhr :as xhr]
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

(def event-loop (chan))

(defn commute [v]
  (let [path (-> v meta :path)
        v (if (seq? v)
            (with-meta (vec v) (meta v))
            v)]
    (println "going to set: " path " to " (pr-str v))
    (aset js/aurora.pipelines (first path) (if (next path)
                                             (assoc-in (aget js/aurora.pipelines (first path)) (rest path) v)
                                             v))
    (put! event-loop :commute)))

(defn as-meta [thing path]
  (if-not (satisfies? IMeta thing)
    (MetaPrimitive. thing {:path path})
    (do
      (alter-meta! thing cljs.core/assoc :path path)
      thing)))

(defn each [vs f]
  (let [path (-> vs meta :path (or []))]
    (with-meta (map f vs) (meta vs))))

(defn mget [thing path]
  (when-let [cur (get-in thing path)]
    (as-meta cur (into (-> thing meta :path (or [])) path))))

(defn rem [thing parent]
  (let [final (core/vector-remove parent (-> thing meta :path last))]
    (meta-walk final (-> parent meta :path))
    final))

(defn conj [p c]
  (cljs.core/conj p (with-meta c {:path (-> p meta :path (cljs.core/conj (count p)))})))

(defn assoc [p k v]
  (if-not (satisfies? IMeta v)
    (cljs.core/assoc p k v)
    (cljs.core/assoc p k (with-meta v {:path (-> p meta :path (cljs.core/conj k))}))))

(defn start-main-loop [main]
  (go
   (while true
     (main)
     (<! event-loop))))

(defn meta-walk [cur path]
  (when (satisfies? IMeta cur)
    (alter-meta! cur cljs.core/assoc :path path)
    (cond
     (map? cur) (doseq [[k v] cur]
                  (meta-walk v (cljs.core/conj path k)))
     (vector? cur) (doseq [[k v] (map-indexed vector cur)]
                     (meta-walk v (cljs.core/conj path k))))))

(defn exec-program [prog]
  (set! js/aurora.pipelines (js-obj))
  (doseq [[k v] (:data prog)]
    (meta-walk v [(str k)])
    (aset js/aurora.pipelines (str k) v))
  (go
   (let [pipes (<! (xhr/xhr [:post "http://localhost:8082/code"] {:code (pr-str (:pipes prog))}))]
     (.eval js/window pipes)
     (start-main-loop (aget js/aurora.pipelines (str (:main prog))))
     )))
