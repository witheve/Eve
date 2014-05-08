(ns aurora.join
  (:require [aurora.btree :refer [tree iterator key-lt key-lte key-gt key-gte]])
  (:require-macros [aurora.macros :refer [typeof]]))

(defn lt [a b]
  (if (== a nil)
    false
    (or (and (identical? (typeof a) (typeof b))
             (< a b))
        (< (typeof a) (typeof b)))))

(defn filled-key-compare [as bs fill]
  (let [as-len (alength as)
        bs-len (alength bs)]
    (assert (== as-len bs-len) (pr-str as bs))
    (loop [i 0]
      (if (< i as-len)
        (let [a (or (aget as i) (aget fill i))
              b (or (aget bs i) (aget fill i))]
          (if (identical? a b)
            (recur (+ i 1))
            (if (or (and (identical? (typeof a) (typeof b))
                         (< a b))
                    (< (typeof a) (typeof b)))
              bs
              as)))
        as))))

(defn fill! [as fill]
  (dotimes [ix (alength as)]
    (aset as ix (or (aget as ix) (aget fill ix))))
  as)

(deftype MagicIterator [iterator map map-len ^:mutable cur-key ^:mutable cur-seek ^:mutable marked]
  Object
  (mark [this]
        (set! marked node))
  (rewind [this]
          (set! (.-node iterator) marked)
          (set! (.-ix iterator) 0)
          (set! (.-end? iterator) false))
  (key [this]
       (.-cur-key this))
  (val [this]
       (.val iterator))
  (next [this]
        (.next iterator)
        (.set-key this))
  (set-key [this ]
           (when-let [found (.key iterator)]
             (loop [ix 0]
               (when (< ix map-len)
                 (let [map-ix (aget map ix)]
                   (if-not (nil? map-ix)
                     (aset cur-key ix (aget found map-ix))
                     (aset cur-key ix nil)))
                 (recur (inc ix))))))
  (seek [this key]
        (loop [ix 0]
          (when (< ix map-len)
            (let [map-ix (aget map ix)]
              (when-not (== map-ix nil)
                (aset cur-seek map-ix (aget key ix))))
            (recur (inc ix))))
        (.seek iterator cur-seek)
        (.set-key this)
        ))

(deftype MagicIteratorWrapper [iterator map ^:mutable marked]
  Object
  (mark [this]
        (set! marked node))
  (rewind [this]
          (set! (.-node iterator) marked)
          (set! (.-ix iterator) 0)
          (set! (.-end? iterator) false))
  (key [this]
       (.key iterator))
  (val [this]
       (.val iterator))
  (next [this]
        (.next iterator))
  (seek [this key]
        (.seek iterator key)))

(defn ->keys [iterators keys len]
  (dotimes [x len]
    (aset keys x (.key (aget iterators x)))))

(defn find-least [keys len tuple-len min-fill]
  (loop [ix 1
         col 0
         least (-> (aget keys 0)
                   (aget 0))]
    (if (>= ix len)
      (do
        (aset min-fill col least)
        (let [next (inc col)]
          (if (< next tuple-len)
            (recur 0 next nil))))
      (let [cur (-> (aget keys ix)
                    (aget col))]
        (recur (inc ix) col (if (lt cur least)
                              cur
                              least))))))

(let [fill (array)]
  (find-least #js [#js [0 1 2] #js [nil 1 4] #js [nil 0 3]] 3 3 fill)
  (find-least #js [#js [0 1 2] #js [8 nil 10] #js [nil 9 10]] 3 3 fill)
  fill)

(defn find-greatest [iterators keys len results min-fill]
  (loop [ix 1
         greatest (aget keys 0)
         found? true]
    (if (>= ix len)
      (if found?
        (let [root (aget iterators 0)]
          (.push results (.slice (fill! greatest min-fill) 0))
          (.next root)
          (.key root))
        (fill! greatest min-fill))
      (let [comped (filled-key-compare greatest (aget keys ix) min-fill)]
        (println "greatest: " comped (identical? comped greatest))
        (recur (inc ix) comped (and found? (identical? comped greatest)))))))

(defn magic-iterator
  ([tree] (let [itr (iterator tree)]
            (MagicIteratorWrapper. itr (.key itr) (.-root tree))))
  ([tree map]
   (let [itr (MagicIterator. (iterator tree) map (alength map) (array) (array) (.-root tree))]
     (.set-key itr)
     itr)))

(defn seek-all [iterators len key]
  (loop [ix 0]
    (if (< ix len)
      (let [cur (aget iterators ix)
            cur-key (.key cur)]
        (when (key-lt cur-key key)
          (.seek cur key))
        (when-not (.-end? cur)
          (recur (inc ix))))
      true)))

(defn join [iterators]
  ;;TODO: iterators have to be in order
  ;;TODO: not resetting yet
  (let [len (alength iterators)
        results (array)
        keys (array)
        min-fill (array)
        tuple-len (alength (.-map (aget iterators 0)))
        start (let [arr (array)]
                (dotimes [x tuple-len]
                  (.push arr false))
                arr)]
    (loop [key start]
      (when key
        (println "key: " key)
        (when (seek-all iterators len key)
          (->keys iterators keys len)
          (println keys)
          (find-least keys len tuple-len min-fill)
          (println "Min: " min-fill)
          (recur (find-greatest iterators keys len results min-fill)))))
    results
    ))

(comment

  (let [tree1 (tree 10)
        _ (dotimes [i 10]
            (let [i (+ i 0)]
              (.assoc! tree1 #js [i (+ i 1) (+ i 2)] (* 2 i))))
        tree2 (tree 10)
        _ (dotimes [i 10]
            (let [i (+ i 7)]
              (.assoc! tree2 #js [i (+ i 2)] (* 2 i))))
        tree3 (tree 10)
        _ (dotimes [i 10]
            (let [i (+ i 8)]
              (.assoc! tree3 #js [(+ i 1) (+ i 2)] (* 2 i))))
        itr1 (magic-iterator tree1)
        itr2 (magic-iterator tree2 #js [0 nil 1])
        itr3 (magic-iterator tree3 #js [nil 0 1])
        ]
    ;(.seek itr2 #js [0 0 0])
    ;(.key itr2)
    (println tree1)
    (println tree2)
    (println tree3)
    (join #js [itr1 itr2 itr3])
    ))

