(ns aurora.join
  (:require [aurora.btree :refer [tree iterator key-lt key-lte key-gt key-gte]])
  (:require-macros [aurora.macros :refer [typeof]]))

(defn nilless-lt [a b]
  (if (== a nil)
    false
    (or (and (identical? (typeof a) (typeof b))
             (< a b))
        (< (typeof a) (typeof b)))))

(defn gt [a b]
  (and (not (identical? a b))
       (or (and (identical? (typeof a) (typeof b))
                (> a b))
           (> (typeof a) (typeof b)))))

(defn lt [a b]
  (and (not (identical? a b))
       (or (and (identical? (typeof a) (typeof b))
                (< a b))
           (< (typeof a) (typeof b)))))

(defn nilless-key-compare [as bs]
  (let [as-len (alength as)
        bs-len (alength bs)]
    (assert (== as-len bs-len) (pr-str as bs))
    (loop [i 0]
      (if (< i as-len)
        (let [a (aget as i)
              b (aget bs i)]
          (if (or (identical? a nil)
                  (identical? b nil))
            (recur (+ i 1))
            (if (identical? a b)
              (recur (+ i 1))
              (if (lt a b)
                -1
                1))))
        0))))

(defn rewind-or-store
  "Returns #js[ix, store?, rewind?]"
  [as bs nil-ixs]
  (let [len (alength nil-ixs)]
    (loop [ix 0]
      (if (< ix len)
        (let [cur (aget nil-ixs ix)
              rewind? (gt (aget as cur) (aget bs cur))]
          (cond
           (and (identical? cur 0) rewind?) #js [0 false rewind?]
           (> cur 0) (let [store? (gt (aget as (- cur 1)) (aget bs (- cur 1)))]
                       (if store?
                         #js [cur store? false]
                         (if rewind?
                           #js [cur false rewind?]
                           (recur (+ 1 ix)))))
           :else (recur (+ 1 ix))))
        #js [0 false false]))))

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
        nil))))

(defn fill! [as fill]
  (dotimes [ix (alength as)]
    (aset as ix (or (aget as ix) (aget fill ix))))
  as)

(defn reverse-fill! [as fill]
  (dotimes [ix (alength as)]
    (aset fill ix (or (aget as ix) (aget fill ix))))
  fill)

;; (rewind-or-store #js [2 0 1] #js [1 0 1] #js[1])
;; (rewind-or-store #js [2 2 1] #js [1 0 1] #js[1])
;; (rewind-or-store #js [1 2 1] #js [1 0 1] #js[1])
;; (rewind-or-store #js [0 0 1] #js [1 0 1] #js[1])
;; if the number preceding a nil increased, store
;; if the nil increased reset
;; [1 0 1] [1 2 3] [1 3 1] [1 4 4]
;; [1 nil 1] [1 nil 3] [1 nil 4]
;; [nil 2 3] [nil 4 4]
;; [1 2 1 3] [1 2 2 5] [1 2 3 3]
;; [nil 2 nil 3] [nil 2 nil 5] [nil 4 nil 4]
;; store index preceding a nil, iff not last, if first root
;; if the value of the new seek is > previous, restore, find first greatest index reset to that index's last node

(deftype MagicIterator [iterator map nil-ixs map-len ^:mutable cur-key ^:mutable cur-seek ^:mutable prev-seek ^:mutable marked-nodes ^:mutable marked-ixs]
  Object
  (mark [this i]
        (aset marked-nodes i (.-node iterator))
        (aset marked-ixs i (.-ix iterator))
        )
  (rewind [this i]
          (set! (.-node iterator) (aget marked-nodes i))
          (set! (.-ix iterator) (aget marked-ixs i))
          (set! (.-end? iterator) false)
          (.set-key this))
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
                 (recur (+ 1 ix))))))
  (seek [this key]
        (let [ros (rewind-or-store key prev-seek nil-ixs)
              ros-ix (aget ros 0)]
          ;(println "        ros:" ros key prev-seek)
          (when (identical? (aget ros 2) true)
            ;(println "        REWINDING")
            (.rewind this (aget ros 0)))
          (when (identical? (aget ros 1) true)
            (dotimes [x (alength cur-seek)]
              (aset cur-seek x false))
            (aset cur-seek (aget map ros-ix) (aget key ros-ix))
            ;(println "        storing seek: " cur-seek)
            (.seek iterator cur-seek)
            ;(println "        STORING: " (.key iterator))
            (.mark this ros-ix)
            (.set-key this))
          (when (identical? -1 (nilless-key-compare (.-cur-key this) key))
            (loop [ix 0]
              (when (< ix map-len)
                (let [map-ix (aget map ix)]
                  (when-not (== map-ix nil)
                    (aset cur-seek map-ix (aget key ix))))
                (recur (+ 1 ix))))
            (.seek iterator cur-seek)
            (.set-key this))
          (set! prev-seek (.slice key)) ;; TODO: this might need to be (.slice key 0)
          )
        ))

(deftype MagicIteratorWrapper [iterator map]
  Object
  (key [this]
       (.key iterator))
  (val [this]
       (.val iterator))
  (next [this]
        (.next iterator))
  (seek [this key]
        (when (key-lt (.key iterator) key)
          (.seek iterator key))))

(defn magic-iterator
  ([tree] (let [itr (iterator tree)]
            (MagicIteratorWrapper. itr (.key itr))))
  ([tree map]
   (let [nil-ixs (array)
         itr (iterator tree)
         marked-nodes (js-obj 0 (.-node itr))
         marked-ixs (js-obj 0 0)
         magic (MagicIterator. itr map nil-ixs (alength map) (array) (.slice (or (.key itr) (array)) 0) nil marked-nodes marked-ixs)]
     (dotimes [ix (alength map)]
       (when (identical? nil (aget map ix))
         (.push nil-ixs ix)
         (aset marked-nodes ix (.-node itr))
         (aset marked-ixs ix (.-ix itr))))
     (.set-key magic)
     (set! (.-prev-seek magic) (.key magic))
     magic)))

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
        (let [next (+ 1 col)]
          (if (< next tuple-len)
            (recur 0 next nil))))
      (let [cur (-> (aget keys ix)
                    (aget col))]
        (recur (+ 1 ix) col (if (nilless-lt cur least)
                              cur
                              least))))))

(defn find-greatest [iterators keys len min-fill]
  (loop [ix 1
         greatest (aget keys 0)
         found? true]
    (if (>= ix len)
      (if found?
        (let [root (aget iterators 0)]
          (.next root)
          #js [(fill! (.slice greatest 0) min-fill) (.key root)])
        #js [nil (reverse-fill! greatest min-fill)])
      (let [comped (filled-key-compare greatest (aget keys ix) min-fill)
            comped-v (or comped greatest)]
        (recur (+ 1 ix) comped-v (and found? (not comped)))))))



(defn seek-all [iterators len okey]
  (loop [ix 0
         key okey]

    ;(println "searching for: " key)
    (if (< ix len)
      (let [cur (aget iterators ix)
            cur-key (.key cur)]
        ;(println "    iterator " ix ": " cur-key)
        (.seek cur key)
        ;(println "    post iterator " ix ": " (.key cur))
        (when-not (.-iterator.end? cur)
          (recur (+ 1 ix) (fill! (.slice (.key cur) 0) okey))))
      true)))

(defn join-with-start [iterators start-key len tuple-len keys min-fill]
  (loop [key start-key]
    (if (or (identical? (aget key 1) nil)
            (not (identical? (aget key 0) nil)))
      key
      (if-not (seek-all iterators len (aget key 1))
        #js [nil nil]
        (do
          (->keys iterators keys len)
          (find-least keys len tuple-len min-fill)
          (recur (find-greatest iterators keys len min-fill)))))))

(defn join [iterators len tuple-len keys min-fill]
  (->keys iterators keys len)
  (find-least keys len tuple-len min-fill)
  (join-with-start iterators (find-greatest iterators keys len min-fill) len tuple-len keys min-fill))

(deftype JoinIterator [iterators ^:mutable cur-key ^:mutable next-key ^:mutable end? len tuple-len keys min-fill]
  Object
  (key [this]
       cur-key)
  (next [this]
        (when-not end?
          ;(println "starting at: " next-key)
          (let [val (join-with-start iterators next-key len tuple-len keys min-fill)]
            ;(println val)
            (when (identical? (aget val 1) nil)
              (set! end? true))
            (set! cur-key (aget val 0))
            (aset val 0 nil)
            (set! next-key val))))
  (seek [this key]
        (when (key-lt cur-key key)
          (aset next-key 1 key)
          (.next this))))

(defn join-iterator [iterators]
  (let [len (alength iterators)
        results (array)
        keys (array)
        min-fill (array)
        tuple-len (alength (.-map (aget iterators 0)))
        key-and-next (join iterators len tuple-len keys min-fill)]
    (JoinIterator. iterators (aget key-and-next 0) #js [nil (aget key-and-next 1)] (identical? (aget key-and-next 1) nil)  len tuple-len keys min-fill)))

(defn all-join-results [join-itr]
  (let [results (array)]
    (while (not (.-end? join-itr))
      (.push results (.key join-itr))
      (.next join-itr))
    (.push results (.key join-itr))
    results))



(comment

(let [arr (array)]
  (dotimes [x 300000]
    (.push arr #js [i (+ i 1) (+ i 2)])))

(let [tree1 (tree 10)
      _ (dotimes [i 10000]
          (let [i (+ i 0)]
            (.assoc! tree1 #js [i (+ i 1) (+ i 2)] (* 2 i))))
      tree2 (tree 10)
      _ (dotimes [i 1000]
          (let [i (+ i 1)]
            (.assoc! tree2 #js [i (+ i 2)] (* 2 i))))
      tree3 (tree 10)
      _ (dotimes [i 100000]
          (let [i (+ i 2)]
            (.assoc! tree3 #js [(+ i 1) (+ i 2)] (* 2 i))))
      itr1 (magic-iterator tree1)
      itr2 (magic-iterator tree2 #js [0 nil 1])
      itr3 (magic-iterator tree3 #js [nil 0 1])
           join-itr (join-iterator #js [itr1 itr2 itr3])
      ]
  ;(.seek itr2 #js [0 0 0])
  ;(.key itr2)
  ;(println tree1)
  ;(println tree2)
  ;(println tree3)

  (alength (time(all-join-results join-itr)))
  )

  (let [tree1 (tree 10)
        _ (doseq [x [#js [0 1 4]
                     #js [0 1 6]
                     #js [1 1 7]
                     #js [1 2 7]
                     #js [1 3 3]
                     ]]
            (.assoc! tree1 x 0))
        tree2 (tree 10)
        _ (doseq [x [#js [0 3]
                     #js [0 6]
                     #js [1 3]
                     #js [1 7]]]
            (.assoc! tree2 x 0))
        itr1 (magic-iterator tree1)
        itr2 (magic-iterator tree2 #js [0 nil 1])
        join-itr (join-iterator #js [itr1 itr2])
        ]
    (all-join-results join-itr)
    )



;; [1 0 1] [1 2 3] [1 3 1] [1 4 4]
;; [1 nil 1] [1 nil 3] [1 nil 4]
;; [nil 2 3] [nil 4 4]
;; [1 2 1 3] [1 2 2 5] [1 2 3 3]
;; [nil 2 nil 3] [nil 2 nil 5] [nil 4 nil 4]

  (let [tree1 (tree 10)
        _ (doseq [x [#js [1 0 1]
                     #js [1 2 3]
                     #js [1 3 1]
                     #js [1 4 4]
                     ]]
            (.assoc! tree1 x 0))
        tree2 (tree 10)
        _ (doseq [x [#js [1 1]
                     #js [1 3]
                     #js [1 4]]]
            (.assoc! tree2 x 0))
        itr1 (magic-iterator tree1)
        itr2 (magic-iterator tree2 #js [0 nil 1])
        join-itr (join-iterator #js [itr1 itr2])
        ]
    ;(.seek itr2 #js [0 0 0])
    ;(.key itr2)
    (println tree1)
    (println tree2)

    (all-join-results join-itr)
    )

  (let [tree1 (tree 10)
        _ (doseq [x [#js [1 0 1]
                     #js [1 2 3]
                     #js [1 3 1]
                     #js [1 4 4]
                     #js [2 2 3]
                     ]]
            (.assoc! tree1 x 0))
        tree2 (tree 10)
        _ (doseq [x [#js [2 3]
                     #js [4 4]]]
            (.assoc! tree2 x 0))
        itr1 (magic-iterator tree1)
        itr2 (magic-iterator tree2 #js [nil 0 1])
        join-itr (join-iterator #js [itr1 itr2])
        ]
    (all-join-results join-itr)
    )

  (let [tree1 (tree 10)
        _ (doseq [x [#js [1 0 1]
                     #js [1 2 3]
                     #js [1 3 1]
                     #js [1 4 4]
                     #js [2 2 3]
                     ]]
            (.assoc! tree1 x 0))
        tree2 (tree 10)
        _ (doseq [x [#js [2 3]
                     #js [4 4]]]
            (.assoc! tree2 x 0))
        tree3 (tree 10)
        _ (doseq [x [#js [1 1]
                     #js [1 3]
                     #js [1 4]]]
            (.assoc! tree3 x 0))
        itr1 (magic-iterator tree1)
        itr2 (magic-iterator tree2 #js [nil 0 1])
        itr3 (magic-iterator tree3 #js [0 nil 1])
        join-itr (join-iterator #js [itr1 itr2 itr3])
        ]
    (all-join-results join-itr)
    )
  (let [tree1 (tree 10)
        _ (doseq [x [#js [1  1 3]
                     #js [1  3 5]
                     #js [1  3 3]
                     ]]
            (.assoc! tree1 x 0))
        tree2 (tree 10)
        _ (doseq [x [#js [3]
                     #js [6]
                     #js [4]
                     ]]
            (.assoc! tree2 x 0))
        itr1 (magic-iterator tree1)
        itr2 (magic-iterator tree2 #js [nil 1 nil])
        join-itr (join-iterator #js [itr1 itr2])
        ]

    (.next itr2)
    (.iterator.key itr2)
    )
  (let [tree1 (tree 10)
        _ (doseq [x [#js [1  3 3]
                     #js [1  5 5]
                     #js [2  3 3]
                     ]]
            (.assoc! tree1 x 0))
        tree2 (tree 10)
        _ (doseq [x [#js [3]
                     #js [6]
                     #js [4]
                     ]]
            (.assoc! tree2 x 0))
        itr1 (magic-iterator tree1)
        itr2 (magic-iterator tree2 #js [nil 0 nil])
        join-itr (join-iterator #js [itr1 itr2])
        ]

    (all-join-results join-itr)
    )

  (let [tree1 (tree 10)
        _ (doseq [x [#js [1 2 1 3]
                     #js [1 2 2 5]
                     #js [1 2 3 3]
                     ]]
            (.assoc! tree1 x 0))
        tree2 (tree 10)
        _ (doseq [x [#js [2 3]
                     #js [2 6]
                     #js [4 4]
                     ]]
            (.assoc! tree2 x 0))
        itr1 (magic-iterator tree1)
        itr2 (magic-iterator tree2 #js [nil 0 nil 1])
        join-itr (join-iterator #js [itr1 itr2])
        ]

    (all-join-results join-itr)
    )


  )

