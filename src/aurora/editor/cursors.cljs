(ns aurora.editor.cursors
  (:require [aurora.editor.core :refer [aurora-state]]))

;;*********************************************************
;; Cursors
;;
;; Cursors are sub-atoms relative to some ID that allows
;; us to easily manipulate a node in the index
;;*********************************************************

(defprotocol ICursor
  (-conj-path! [this x] "conj to the sub-path")
  (-index-path [this] "get the full path relative to root"))

(defn map-key-path? [path]
  (-> path
      (last)
      (:aurora.editor.ui/key)))

(defn mutable? [cursor]
  (not (aget cursor "locked")))

(deftype IndexCursor [atm id sub-path]
  ICursor
  (-conj-path! [this neue]
               (let [neue (if (coll? neue)
                            neue
                            [neue])]
                 (IndexCursor. atm id (into sub-path neue))))
  (-index-path [this] (concat [:index id] sub-path))

  ICollection
  (-conj [this x]
         (-conj-path! this x))

  IEquiv
  (-equiv [o other] (identical? o other))

  IDeref
  (-deref [this]  (let [path (-index-path this)]
                    (or (map-key-path? path)
                        (get-in @atm path))))

  IPrintWithWriter
  (-pr-writer [this writer opts]
    (-write writer (str "#<Cursor: " (pr-str (-index-path this)) ">")))

  IHash
  (-hash [this] (goog.getUid this)))

(defn cursor [id]
  (when (get-in @aurora-state [:index id])
    (IndexCursor. aurora-state id [])))

(defn cursors [ids]
  (map cursor ids))

(defn cursor->path [c]
  (-index-path c))

(defn cursor->id [c]
  (.-id c))

(defn cursor-swap! [cursor args]
  (when (mutable? cursor)
    (let [path (-index-path cursor)
          map-key? (map-key-path? path)
          root-value @(.-atm cursor)
          neue-value (apply (first args) @cursor (rest args))]
      (if map-key?
        (swap! (.-atm cursor) assoc-in (butlast path) (-> (get-in root-value (butlast path))
                                                       (dissoc map-key?)
                                                       (assoc neue-value (get-in root-value (concat (butlast path) [map-key?])))))
        (swap! (.-atm cursor) assoc-in path neue-value)))))

(defn swap! [atm & args]
  (if-not (satisfies? ICursor atm)
    (apply cljs.core/swap! atm args)
    (cursor-swap! atm args)))


;;*********************************************************
;; Overlay Cursor
;;
;; A cursor that maps a concrete value back to a an index
;; path. You can use this to show a concrete value while
;; being able to modify the underlying representation
;;*********************************************************

(deftype OverlayCursor [atm id value sub-path]
  ICursor
  (-conj-path! [this neue]
               (let [neue (if (coll? neue)
                            neue
                            [neue])]
                 (OverlayCursor. atm value (into sub-path neue))))
  (-index-path [this] (concat [:index id] sub-path))

  ICollection
  (-conj [this x]
         (-conj-path! this x))

  IEquiv
  (-equiv [o other] (identical? o other))

  IDeref
  (-deref [this]  (let [path (-index-path this)]
                    (or (map-key-path? path)
                        (get-in value (drop 2 path)))))

  IPrintWithWriter
  (-pr-writer [this writer opts]
    (-write writer (str "#<OverlayCursor: " (pr-str (-index-path this)) ">")))

  IHash
  (-hash [this] (goog.getUid this)))

(defn overlay-cursor [cursor value]
  (OverlayCursor. (.-atm cursor) (.-id cursor) value (.-sub-path cursor)))


;;*********************************************************
;; Lock Cursor
;;
;; A cursor that won't swap!
;;*********************************************************

(deftype LockedCursor [cursor locked]
  ICursor
  (-conj-path! [this neue] (LockedCursor. (conj cursor neue)))
  (-index-path [this] (-index-path cursor))

  ICollection
  (-conj [this x] (-conj-path! this x))

  IEquiv
  (-equiv [o other] (identical? o other))

  IDeref
  (-deref [this] @cursor)

  IPrintWithWriter
  (-pr-writer [this writer opts]
    (-write writer (str "#<LockedCursor: " (pr-str (-index-path this)) ">")))

  IHash
  (-hash [this] (goog.getUid this)))

(defn ->locked [cursor]
  (LockedCursor. cursor true))

;;*********************************************************
;; Value Cursor
;;
;; Cursor for a value that has no atom backing, for
;; e.g. results
;;*********************************************************

(deftype ValueCursor [value sub-path locked]
  ICursor
  (-conj-path! [this neue]
               (let [neue (if (coll? neue)
                            neue
                            [neue])]
                 (ValueCursor. value (into sub-path neue))))
  (-index-path [this] sub-path)

  ICollection
  (-conj [this x]
         (-conj-path! this x))

  IEquiv
  (-equiv [o other] (identical? o other))

  IDeref
  (-deref [this]  (let [path (-index-path this)]
                    (or (map-key-path? path)
                        (get-in value path))))

  IPrintWithWriter
  (-pr-writer [this writer opts]
    (-write writer (str "#<ValueCursor: " (pr-str (-index-path this)) ">")))

  IHash
  (-hash [this] (goog.getUid this)))

(defn value-cursor [value]
  (ValueCursor. value [] true))
