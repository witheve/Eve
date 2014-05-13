(ns aurora.join
  (:require [aurora.btree :refer [tree iterator least key-lt key-lte key-gt key-gte key-compare key=]])
  (:require-macros [aurora.macros :refer [typeof ainto]]))

(defn gt [a b]
  (and (not (identical? a b))
       (or (and (identical? (typeof a) (typeof b))
                (> a b))
           (> (typeof a) (typeof b)))))

(deftype MagicIterator [iterator map nil-ixs map-len ^:mutable cur-key ^:mutable cur-seek ^:mutable prev-seek ^:mutable marked-nodes ^:mutable marked-ixs ^:mutable end?]
  Object
  (mark [this i]
        (aset marked-nodes i (.-node iterator))
        (aset marked-ixs i (.-ix iterator)))

  (rewind [this i]
          (set! (.-node iterator) (aget marked-nodes i))
          (set! (.-ix iterator) (aget marked-ixs i))
          (set! (.-end? iterator) false)
          (set! end? false)
          (.set-key this)
          ;(println "rewinding: " i (.-cur-key this))
          )

  (key [this]
       (when (identical? end? false)
         (.-cur-key this)))

  (val [this]
       (.val iterator))

  (next [this]
        (.next iterator)
        (set! end? (.-end? iterator))
        (.set-key this))

  (make-min [this]
            (when cur-key
              ;;fill the unknown values with least
              (dotimes [ix (alength nil-ixs)]
                (aset cur-key (aget nil-ixs ix) least))
              cur-key))

  (set-key [this]
           (if-let [found (.key iterator)]
             (dotimes [ix map-len]
               (let [map-ix (aget map ix)]
                   (if-not (nil? map-ix)
                     (aset cur-key ix (aget found map-ix))
                     (aset cur-key ix (aget prev-seek ix)))))
             (set! end? true)))

  (seek-and-mark [this ix key]
                 (let [prev-key (- ix 1)
                       key-value (aget key prev-key)
                       cur-value (aget cur-key prev-key)]
                   ;;when the value previous to the placeholder has increased
                   ;;we need to seek to the first value that matches it and
                   ;;store that
                   (when (gt key-value cur-value)
                     (dotimes [x (alength cur-seek)]
                       (aset cur-seek x false))
                     (aset cur-seek (aget map prev-key) key-value)
                     ;(println "        storing seek: " cur-seek)
                     (.seek iterator cur-seek)
                     ;(println "        STORING: " (.key iterator))
                     (.set-key this))
                   (.mark this cur)))

  (check-rewind [this key]
                (let [len (alength nil-ixs)]
                  (loop [ix 0]
                    (if (< ix len)
                      (let [cur (aget nil-ixs ix)
                            rewind? (not (identical? (aget key cur) (aget prev-seek cur)))]
                        (cond
                         ;; we can't store anything if we're at the root value, so just rewind if we need
                         (and (identical? cur 0) rewind?) (.rewind this cur)
                         ;; check if we need to store based on a new value before our placeholder
                         (> cur 0) (let [store? (not (identical? (aget key (- cur 1)) (aget prev-seek (- cur 1))))]
                                     (if store?
                                       (.seek-and-mark this cur key)
                                       ;;if we need to rewind and we're not looking at the last index
                                       ;;because it doesn't make sense to rewind if there's no value to be rewound
                                       (if (and rewind? (not (== (+ cur 1) map-len)))
                                         (.rewind this cur)
                                         (recur (+ 1 ix)))))
                         :else (recur (+ 1 ix)))))))
                )
  (seek [this key]
        ;;see if our placeholders have changed such that we need to rewind
        (.check-rewind this key)
        (ainto prev-seek key)
        (when (key-lt cur-key key)
          (loop [ix 0]
            (when (< ix map-len)
              (let [map-ix (aget map ix)]
                (when-not (== map-ix nil)
                  (aset cur-seek map-ix (aget key ix))))
              (recur (+ 1 ix))))
          (.seek iterator cur-seek))
        (.set-key this)
        ))

(deftype MagicIteratorWrapper [iterator map ^:mutable end?]
  Object
  (key [this]
       (.key iterator))

  (val [this]
       (.val iterator))
  (make-min [this]
            (.key this))
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
     (.make-min magic)
     (when (identical? (.-end? magic) false)
       (ainto (.-prev-seek magic) (.key magic)))
     magic)))

(deftype JoinIterator [iterators ^:mutable cur-key ^:mutable next-key ^:mutable end? len tuple-len]
  Object
  (make-min [this]
            (.key this))

  (key [this]
       (when (identical? end? false)
         cur-key))

  (iters-next [this]
              ;;try next on the last iterator
              (let [last (aget iterators (- len 1))]
                (.next last)
                (if-not (.-end? last)
                  (ainto next-key (.key last))
                  ;;otherwise walk up and get the min next value
                  (loop [ix (- len 2)]
                    (when (>= ix 0)
                      (let [cur (aget iterators ix)]
                        (.next cur)
                        (if (.-end? cur)
                          (recur (- ix 1))
                          (ainto next-key (.make-min cur)))))))))

  (seek-join [this]
             ;;while we haven't found a match
             (loop []
               ;;seek each iterator
               (loop [ix 0]
                 (if (< ix len)
                   (let [cur (aget iterators ix)
                         cur-key (.key cur)]
                     (.seek cur next-key)
                     (if-not (.-end? cur)
                       (do
                         (ainto next-key (.key cur))
                         (recur (+ 1 ix)))
                       (set! end? true)))))
               (when (identical? end? false)
                 (let [root-key (.key (aget iterators 0))
                       last-key (.key (aget iterators (- len 1)))]
                   ;;when the first and last keys are the same, we have a match
                   (if (key= root-key last-key)
                     (do
                       (set! cur-key (.slice last-key 0))
                       (.iters-next this))
                     ;;otherwise recur
                     (do
                       (ainto next-key last-key)
                       (recur))
                     )))))

  (next [this]
        (.seek-join this))

  (seek [this key]
        (when (key-lt cur-key key)
          (ainto next-key key)
          (.seek-join this))))

(defn join-iterator [iterators]
  ;(println iterators)
  (let [len (alength iterators)
        results (array)
        root (aget iterators 0)
        tuple-len (alength (.-map root))
        next-key (array)]
    (if (or (== tuple-len 0)
            (not (.key root))
            (== 0 (alength (.key root))))
      (do
        (.next root)
        root)
      (let [itr (JoinIterator. iterators (array) next-key false len tuple-len)]
        (dotimes [ix tuple-len]
          (aset next-key ix false))
        (.seek-join itr)
        itr
        ))))

(defn all-join-results [join-itr]
  (let [results (array)]
    (while (and (not (.-end? join-itr)))
      (.push results (.key join-itr))
      (.next join-itr))
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
                (.assoc! tree1 #js [i i i] (* 2 i))))
          tree2 (tree 10)
          _ (dotimes [i 100000]
              (let [i (+ i 100000)]
                (.assoc! tree2 #js [i i i] (* 2 i))))
          tree3 (tree 10)
          _ (dotimes [i 100000]
              (let [i (+ i 50000)]
                (.assoc! tree3 #js [i i i] (* 2 i))))
          ]
      (time
       (dotimes [i 100]
         (let [itr1 (magic-iterator tree1 #js [0 1 2])
               itr2 (magic-iterator tree2 #js [0 1 2])
               itr3 (magic-iterator tree3 #js [0 1 2])
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
        _ (doseq [x [#js [0 "-1" "1"]
                     ]]
            (.assoc! tree1 x 0))
        itr1 (magic-iterator tree1 #js [0 1 2 nil nil nil])
        itr2 (magic-iterator tree1 #js [nil nil nil 0 1 2])
        _ (.clear js/console)
        join-itr (join-iterator #js [itr1 itr2])
        ]
     (assert
      (= (map vec (all-join-results join-itr))
         (map vec #js [#js [0 "-1" "1" 0 "-1" "1"]])))
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


