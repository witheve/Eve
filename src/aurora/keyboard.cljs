(ns aurora.keyboard
  (:refer-clojure :exclude [keys])
  (:require [clojure.string :as string]))

(def capturing? true)
(def keys (atom {}))
(def key-map (atom {}))
(def chords (js-obj "current" nil "chords" #{}))
(def chord-timeout 1000)

(defn chord-variants [k]
  (let [splits (-> (string/split k " ")
                   (butlast))]
    (reduce (fn [res cur]
              (conj res (str (last res) " " cur)))
            [(first splits)]
            (rest splits))))

(defn extract-chords [ks]
  (reduce (fn [chords [k _]]
            (if-not (> (.indexOf k " ") -1)
              chords
              (apply conj chords (chord-variants k))))
          #{}
          ks))

(defn merge-keys [ctx]
  (let [ks @keys
        neue (apply merge {} (map ks ctx))]
    (set! chords (js-obj "current" nil "chords" (extract-chords neue)))
    (reset! key-map neue)))

(merge-keys [:app])

(defn ->keystr [ev]
  (str
   (when (.-ctrlKey ev) "ctrl-")
   (when (.-metaKey ev) "cmd-")
   (when (.-altKey ev) "alt-")
   (when (or (.-altGraphKey ev) altgr) "altgr-")
   (when (.-shiftKey ev) "shift-")
   (. (or (.-key ev) "") toLowerCase)))

(defn chord|mapping [ev]
  (let [current (aget chords "current")
        cur-chords (aget chords "chords")
        [ks ch] (if current
                  [(str current " " (->keystr ev)) (str current " " (aget ev "char"))]
                  [(->keystr ev) (aget ev "char")])]
    (if-let [chord (or (cur-chords ch) (cur-chords ks))]
      (do
        (aset chords "current" chord)
        (when chord-timeout
          (wait chord-timeout #(aset chords "current" nil)))
        [])
      (do
        (aset chords "current" nil)
        (or (@key-map ch) (@key-map ks) (when current []))))))

(def ^:dynamic *capture* true)

(defn passthrough []
  (set! *capture* false))

(defn disable []
  (set! capturing? false))

(defn enable []
  (set! capturing? true))

(defn all-mappings [key]
  (reduce (fn [res [ctx keys]]
            (if-not (keys key)
              res
              (conj res [ctx (keys key)])))
          []
          @keys))

(defn trigger [cmd]
  (if (coll? cmd)
    (apply (first cmd) (rest cmd))
    (cmd))
  *capture*)

(defn capture [ev]
  (binding [*capture* true]
    (when-let [cs (chord|mapping ev)]
      (doseq [c cs]
        (trigger c))
      *capture*)))

(defn capture-up [ev]
  (or (@key-map (aget ev "char")) (@key-map (->keystr ev))))

(js/document.addEventListener "keydown"
                              (fn [ev]
                                (when (and capturing?
                                           (capture ev))
                                  (.preventDefault ev)
                                  (.stopPropagation ev)))
                              true)

(js/document.addEventListener "keyup"
                              (fn [ev]
                                (when (and capturing?
                                           (capture-up ev))
                                  (.preventDefault ev)
                                  (.stopPropagation ev)))
                              true)
