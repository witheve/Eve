(ns aurora.join
  (:require [aurora.btree :refer [tree iterator key-lt key-lte key-gt key-gte key-compare]])
  (:require-macros [aurora.macros :refer [typeof ainto]]))

(defn nilless-lt [a b]
  (if (== a nil)
    false
    (if (== b nil)
      true
      (or (and (identical? (typeof a) (typeof b))
               (< a b))
          (< (typeof a) (typeof b))))))

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
  [as bs nil-ixs map-len]
  (let [len (alength nil-ixs)]
    (loop [ix 0]
      (if (< ix len)
        (let [cur (aget nil-ixs ix)
              rewind? (not= (aget as cur) (aget bs cur))]
          (cond
           (and (identical? cur 0) rewind?) #js [0 false rewind?]
           (> cur 0) (let [store? (not= (aget as (- cur 1)) (aget bs (- cur 1)))]
                       (if store?
                         #js [cur store? false]
                         (if (and rewind? (not (== (+ cur 1) map-len)))
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

(defn reverse-fill-with! [as fill val]
  (dotimes [ix (alength as)]
    (aset fill ix (or (aget as ix) val)))
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

(deftype MagicIterator [iterator map nil-ixs map-len ^:mutable cur-key ^:mutable cur-seek ^:mutable prev-seek ^:mutable marked-nodes ^:mutable marked-ixs ^:mutable end?]
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
        (set! end? (.-end? iterator))
        (.set-key this))
  (set-key [this ]
           (if-let [found (.key iterator)]
             (loop [ix 0]
               (when (< ix map-len)
                 (let [map-ix (aget map ix)]
                   (if-not (nil? map-ix)
                     (aset cur-key ix (aget found map-ix))
                     (aset cur-key ix nil)))
                 (recur (+ 1 ix))))))
  (seek [this key]
        ;(println "SEEK KEY: " key)
        (let [ros (rewind-or-store key prev-seek nil-ixs map-len)
              ros-ix (aget ros 0)]
          ;(println "        ros:" ros key prev-seek)
          (when (identical? (aget ros 2) true)
            ;(println "        REWINDING")
            (.rewind this (aget ros 0))
            ;(println "        REWOUND TO: " (.-cur-key this)))
          (when (identical? (aget ros 1) true)
            (let [key-ros-ix (aget key ros-ix)
                  adjusted-ros-ix (aget map (- ros-ix 1))
                  cur-ros-ix (aget (.-cur-key this) adjusted-ros-ix)]
              (when (and (identical? -1 (nilless-key-compare (.-cur-key this) key))
                         (lt key-ros-ix cur-ros-ix))
                (dotimes [x (alength cur-seek)]
                  (aset cur-seek x false))
                (aset cur-seek adjusted-ros-ix key-ros-ix)
                ;(println "        storing seek: " cur-seek)
                (.seek iterator cur-seek)
                ;(println "        STORING: " (.key iterator)
                )
                (.set-key this)))
            (.mark this ros-ix))
          (when (identical? -1 (nilless-key-compare (.-cur-key this) key))
            (loop [ix 0]
              (when (< ix map-len)
                (let [map-ix (aget map ix)]
                  (when-not (== map-ix nil)
                    (aset cur-seek map-ix (aget key ix))))
                (recur (+ 1 ix))))
            (.seek iterator cur-seek)
            (.set-key this))
          (ainto prev-seek key)
          )
        ))

(deftype MagicIteratorWrapper [iterator map ^:mutable end?]
  Object
  (key [this]
       (.key iterator))
  (val [this]
       (.val iterator))
  (next [this]
        (.next iterator)
        (set! end? (.-end? iterator)))
  (seek [this key]
        (when (and (not end?)
                   (key-lt (.key iterator) key))
          (.seek iterator key)
          (set! end? (.-end? iterator)))))

(defn magic-iterator
  ([tree] (let [itr (iterator tree)]
            (MagicIteratorWrapper. itr (or (.key itr) #js []) false)))
  ([tree map]
   (let [nil-ixs (array)
         itr (iterator tree)
         marked-nodes (js-obj 0 (.-node itr))
         marked-ixs (js-obj 0 0)
         magic (MagicIterator. itr map nil-ixs (alength map) (array) (.slice (or (.key itr) (array)) 0) (array) marked-nodes marked-ixs false)]
     (dotimes [ix (alength map)]
       (when (identical? nil (aget map ix))
         (.push nil-ixs ix)
         (aset marked-nodes ix (.-node itr))
         (aset marked-ixs ix (.-ix itr))))
     (.set-key magic)
     (ainto (.-prev-seek magic) (.key magic))
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

(defn iters-next [iterators len min-fill]
  (let [last (aget iterators (- len 1))]
    (.next last)
    (if-not (.-end? last)
      (reverse-fill! (.key last) min-fill)
      (loop [ix (- len 2)]
        (when (>= ix 0)
          (let [cur (aget iterators ix)]
            (.next cur)
            (if (.-end? cur)
              (recur (- ix 1))
              (reverse-fill-with! (.key cur) min-fill false))))))))

(defn find-greatest [iterators keys len min-fill]
  ;(println "GREATEST: " keys min-fill)
  (loop [ix 1
         greatest (aget keys 0)
         found? true]
    (if (>= ix len)
      (if found?
        (let [greatest (fill! (.slice greatest 0) min-fill)]
          (iters-next iterators len min-fill)
          #js [greatest min-fill])
        #js [nil (reverse-fill! greatest min-fill)])
      (let [comped (filled-key-compare greatest (aget keys ix) min-fill)
            comped-v (or comped greatest)]
        ;(println "g: " comped (and found? (not comped)) min-fill)
        (recur (+ 1 ix) comped-v (and found? (not comped)))))))



(defn seek-all [iterators len okey]
  (loop [ix 0]
    (if (< ix len)
      (let [cur (aget iterators ix)
            cur-key (.key cur)]
        ;(println "searching for: " okey)
        ;(println "    iterator " ix ": " cur-key)
        (.seek cur okey)
        ;(println "    post iterator " ix ": " (.key cur))
        (when-not (.-iterator.end? cur)
          (reverse-fill! (.key cur) okey)
          (recur (+ 1 ix))))
      (do
        ;(println "    final search key: " okey)
        true))))

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
          ;(println "MIN FILL: " min-fill)
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
        (if end?
          (set! cur-key nil)
          (let [val (join-with-start iterators next-key len tuple-len keys min-fill)]
            ;(println val)
            (when (identical? (aget val 1) nil)
              (set! end? true))
            (set! cur-key (aget val 0))
            (aset val 0 nil)
            (ainto next-key val))))
  (seek [this key]
        (when (key-lt cur-key key)
          (aset next-key 1 key)
          (.next this))))

(defn join-iterator [iterators]
  ;(println iterators)
  (let [len (alength iterators)
        results (array)
        keys (array)
        min-fill (array)
        root (aget iterators 0)
        tuple-len (alength (.-map root))]
    (if (or (== tuple-len 0)
            (not (.key root))
            (== 0 (alength (.key root))))
      (do
        (.next root)
        root)
      (let [key-and-next (join iterators len tuple-len keys min-fill)]
        (JoinIterator. iterators (aget key-and-next 0) #js [nil (aget key-and-next 1)] (identical? (aget key-and-next 1) nil)  len tuple-len keys min-fill)))))

(defn all-join-results [join-itr]
  (let [results (array)]
    (while (and (not (.-end? join-itr)))
      (.push results (.key join-itr))
      (.next join-itr))
    (when-not (or (== nil (.key join-itr))
                  (== 0 (alength (.key join-itr))))
      (.push results (.key join-itr)))
    results))

(comment

  (comment
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
          ]
      (time
       (dotimes [i 100]
         (let [itr1 (magic-iterator tree1 #js [0 1 2])
               itr2 (magic-iterator tree2 #js [0 nil 1])
               itr3 (magic-iterator tree3 #js [nil 0 1])
               join-itr (join-iterator #js [itr1 itr2 itr3])]
           (all-join-results join-itr))))))

  (let [tree1 (tree 10)
          _ (dotimes [i 100000]
              (let [i (+ i 0)]
                (.assoc! tree1 #js [i] (* 2 i))))
          tree2 (tree 10)
          _ (dotimes [i 100000]
              (let [i (+ i 100000)]
                (.assoc! tree2 #js [i] (* 2 i))))
          tree3 (tree 10)
          _ (dotimes [i 100000]
              (let [i (+ i 50000)]
                (.assoc! tree3 #js [i] (* 2 i))))
          ]
      (time
       (dotimes [i 100]
         (let [itr1 (magic-iterator tree1 #js [0])
               itr2 (magic-iterator tree2 #js [0])
               itr3 (magic-iterator tree3 #js [0])
               join-itr (join-iterator #js [itr1 itr2 itr3])]
           (all-join-results join-itr)))))


  (let [tree (tree 10)
        _ (dotimes [i 2]
            (let [i (+ i 0)]
              (.assoc! tree #js [i i] (* 2 i))))
        j (time (join-iterator #js [(magic-iterator tree #js [0 nil nil 1 nil nil])
                                    (magic-iterator tree #js [nil 0 nil nil 1 nil])
                                    (magic-iterator tree #js [nil nil 0 nil nil 1])]))
        ]
    (assert
     (= (map vec (time (all-join-results j)))
        (map vec #js [#js [0 0 0 0 0 0] #js [0 0 1 0 0 1] #js [0 1 0 0 1 0] #js [0 1 1 0 1 1] #js [1 0 0 1 0 0] #js [1 0 1 1 0 1] #js [1 1 0 1 1 0] #js [1 1 1 1 1 1]])))
  )

  (let [tree (tree 10)
        _ (dotimes [i 10]
            (let [i (+ i 0)]
              (.assoc! tree #js [i i] (* 2 i))))
        j (time (join-iterator #js [(magic-iterator tree #js [0 nil nil nil nil 1])
                                    (magic-iterator tree #js [nil 0 nil nil 1 nil])
                                    (magic-iterator tree #js [nil nil 0 1 nil nil])]))
        ]
    (time (all-join-results j))
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
    (.clear js/console)
    (assert
     (= (map vec (all-join-results join-itr))
        (map vec #js [#js [0 1 6] #js [1 1 7] #js [1 2 7] #js [1 3 3] ])))
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

    (assert
     (= (map vec (all-join-results join-itr))
        (map vec #js [#js [1 0 1] #js [1 2 3] #js [1 3 1] #js [1 4 4]])))
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
    (assert
     (= (map vec (all-join-results join-itr))
        (map vec #js [#js [1 2 3] #js [1 4 4] #js [2 2 3] ])))
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
    (.clear js/console)
    (assert
     (= (map vec (all-join-results join-itr))
        (map vec #js [#js [1 2 3] #js [1 4 4] ])))
    )

  (let [tree1 (tree 10)
        _ (doseq [x [#js ["3"]
                     #js [-3]
                     ]]
            (.assoc! tree1 x 0))
        tree2 (tree 10)
        _ (doseq [x [#js ["3"]
                     #js [-3]
                     ]]
            (.assoc! tree2 x 0))
        itr1 (magic-iterator tree1 #js [0 nil])
        itr2 (magic-iterator tree2 #js [nil 0])
        _ (.clear js/console)
        join-itr (join-iterator #js [itr1 itr2])
        ]
    (assert
     (= (map vec (all-join-results join-itr))
        (map vec #js [#js [-3 -3] #js [-3 "3"]  #js ["3" -3] #js ["3" "3"] ])))
    )


  (let [tree1 (tree 10)
        _ (doseq [x [#js [1]
                     #js [4]
                     #js [2]
                     ]]
            (.assoc! tree1 x 0))
        tree2 (tree 10)
        _ (doseq [x [#js [3]
                     #js [6]
                     #js [4]
                     ]]
            (.assoc! tree2 x 0))
        itr1 (magic-iterator tree1)
        itr2 (magic-iterator tree2)
        join-itr (join-iterator #js [itr1 itr2])
        ]
    (assert
     (= (map vec (all-join-results join-itr))
        (map vec #js [#js [4] ])))
    )

  (let [tree1 (tree 10)
        _ (doseq [x [#js [1]
                     #js [4]
                     #js [2]
                     ]]
            (.assoc! tree1 x 0))
        tree2 (tree 10)
        _ (doseq [x [#js [3]
                     #js [6]
                     #js [4]
                     ]]
            (.assoc! tree2 x 0))
        itr1 (magic-iterator tree1 #js [0 nil])
        itr2 (magic-iterator tree2 #js [nil 0])
        join-itr (join-iterator #js [itr1 itr2])
        ]
    (.clear js/console)
    (assert
     (= (map vec (all-join-results join-itr))
        (map vec #js [#js [1 3] #js [1 4] #js [1 6] #js [2 3] #js [2 4] #js [2 6] #js [4 3] #js [4 4] #js [4 6] ])))
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
    (assert
     (= (map vec (all-join-results join-itr))
        (map vec #js [#js [1 2 1 3] #js [1 2 3 3] ])))
    )


  )


