(ns aurora.join
  (:require [aurora.btree :refer [tree iterator least greatest key-lt key-lte key-gt key-gte key-compare key= iterator->keys gen-key gen-action gen-next gen-movement apply-to-tree]]
            [cemerick.double-check :as dc]
            [cemerick.double-check.generators :as gen]
            [cemerick.double-check.properties :as prop :include-macros true])
  (:require-macros [aurora.macros :refer [typeof ainto]]))

(defn gt [a b]
  (and (not (identical? a b))
       (or (and (identical? (typeof a) (typeof b))
                (> a b))
           (> (typeof a) (typeof b)))))

(deftype MagicIterator [iterator map ^:mutable nil-ixs ^:mutable rewindable ^:mutable map-len ^:mutable cur-key ^:mutable cur-seek ^:mutable prev-seek ^:mutable marked-nodes ^:mutable marked-ixs ^:mutable end?]
  Object
  (reset [this i]
         (.reset iterator)

         ;; TODO some of this can be done on construction only
         (set! nil-ixs (array))
         (set! rewindable (array))
         (set! map-len (alength map))
         (set! cur-key (array))
         (set! cur-seek (.slice (or (.key iterator) (array)) 0))
         (set! prev-seek (array))
         (set! marked-nodes (js-obj 0 (.-node iterator)))
         (set! marked-ixs (js-obj 0 0))
         (set! end? false)

         (loop [ix 0
                potential (array)]
           (when (< ix map-len)
             (if (identical? nil (aget map ix))
               (do
                 (.push nil-ixs ix)
                 (.push potential ix)
                 (aset marked-nodes ix (.-node iterator))
                 (aset marked-ixs ix (.-ix iterator))
                 (recur (+ ix 1) potential))
               (do
                 (dotimes [x (alength potential)]
                   (.push rewindable (aget potential x)))
                 (recur (+ ix 1) (array))))))

         (.set-key this)
         (.make-min this)
         (when (false? end?)
           (ainto prev-seek (.key this))))

  (mark [this i]
        (aset marked-nodes i (.-node iterator))
        (aset marked-ixs i (.-ix iterator)))

  (rewind [this i]
          (set! (.-node iterator) (aget marked-nodes i))
          (set! (.-ix iterator) (aget marked-ixs i))
          (set! (.-end? iterator) false)
          (set! end? false)
          (.set-key this)
          )

  (key [this]
       (when (identical? end? false)
         (.-cur-key this)))

  (val [this]
       (.val iterator))

  (next [this]
        (.next iterator)
        (set! end? (.-end? iterator))
        (.set-key this)
        (false? end?))

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
                (let [len (alength rewindable)]
                  (loop [ix 0]
                    (if (< ix len)
                      (let [cur (aget rewindable ix)
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

(defn magic-iterator [tree map]
   (let [magic (MagicIterator. (iterator tree) map)]
     (.reset magic)
     magic))

(deftype JoinIterator [iterators ^:mutable cur-key ^:mutable next-key ^:mutable end? ^:mutable len ^:mutable tuple-len]
  Object
  (reset [this]
         (dotimes [i (alength iterators)]
           (.reset (aget iterators i)))

         (set! cur-key (array))
         (set! next-key (array))
         (set! end? false)
         (set! len (alength iterators))

         (if (true? (.-end? (aget iterators 0)))
           (set! end? true)
           (do
             (set! tuple-len (alength (.key (aget iterators 0))))
             (dotimes [ix tuple-len]
               (aset next-key ix false))
             (.seek-join this))))

  (make-min [this]
            (.key this))

  (key [this]
       (when (identical? end? false)
         cur-key))

  (iters-next [this]
              (loop [ix (- len 1)]
                (when (>= ix 0)
                  (let [cur (aget iterators ix)]
                    (.next cur)
                    (if (.-end? cur)
                      (recur (- ix 1))
                      (ainto next-key (.make-min cur)))))))

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
                     (let [root-key (.key (aget iterators 0))]
                       ;;when the first and last keys are the same, we have a match
                       (if (key= root-key next-key)
                         (do
                           (set! cur-key (.slice next-key 0))
                           (.iters-next this))
                         ;;otherwise recur
                         (recur))))))

  (next [this]
        (.seek-join this)
        (false? end?))

  (seek [this key]
        (when (key-lt cur-key key)
          (ainto next-key key)
          (.seek-join this))
        (key= cur-key key)))

(defn join-iterator [iterators]
  (let [itr (JoinIterator. iterators)]
    (.reset itr)
    itr))

(defn all-join-results [join-itr]
  (let [results (array)]
    (while (and (not (.-end? join-itr)))
      (.push results (.key join-itr))
      (.next join-itr))
    results))

(deftype Infinirator [^:mutable end? func max-func ^:mutable cur-key map]
  Object
  (reset [this])

  (key [this]
       (when (identical? end? false)
         cur-key))

  (val [this]
       nil)

  (next [this]
        (set! end? true)
        )
  (seek [this key]
        (set! end? false)
        (ainto cur-key key)
        (func cur-key key)
        (when (key-gt key cur-key)
          (max-func cur-key))
        ))

(defn infinirator [size func initial-func max-func]
  (let [cur-key (array)]
    (dotimes [x size]
      (.push cur-key least))
    (initial-func cur-key)
    (Infinirator. false func max-func cur-key size)))

(defn constant-filter [size i v]
  (infinirator size
                (fn [cur key]
                  (aset cur i v))
                (fn [cur]
                  (aset cur i v))
                (fn [cur]
                  (aset cur i greatest))))

(defn context [indexes]
  (let [update-indexes #js {}
        do-update (fn [index content]
                    (let [ix (aget update-indexes index)
                          ix (if (nil? ix)
                               (let [neue (tree 10)]
                                 (aset update-indexes index neue)
                                 neue)
                               ix)]
                      (when (false? (.assoc! ix content nil))
                        (set! (.-dirty? ix) true))
                      ix
                      ))]
    #js {:update-indexes update-indexes
         :remember! #(do-update % %2)
         :forget! #(do-update (str % "-rem") %2)
         :pretend! #(.assoc! (aget indexes %) %2 nil)}))

(defn transform [ctx itr func]
  (while (and (not (.-end? itr)))
    (func (.key itr) (aget ctx "remember!") (aget ctx "forget!") (aget ctx "pretend!"))
    (.next itr))
  ctx)

(defn pretend-tree [x]
  (let [t (tree x)]
    (aset t "pretend?" true)
    t))

(defn reconcile [env]
  (let [indexes (aget env "indexes")
        ctx (aget env "ctx")
        keys (js/Object.keys indexes)
        len (alength keys)
        updates (aget ctx "update-indexes")]
    (loop [ix 0]
      (when (< ix len)
        (let [cur-index-key (aget keys ix)
              cur-index (aget indexes cur-index-key)
              rem (aget updates (str cur-index-key "-rem"))
              add (aget updates cur-index-key)]
          (when rem
            (let [itr (iterator rem)]
              (while (not (.-end? itr))
                (when (.dissoc! cur-index (.key itr))
                  (set! (.-dirty? cur-index) true))
                (.next itr))))
          (when add
            (let [itr (iterator add)]
              (while (not (.-end? itr))
                (when-not (.assoc! cur-index (.key itr) nil)
                  (set! (.-dirty? cur-index) true))
                (.next itr))))
          (recur (+ ix 1))))
      )
    (aset env ctx (context indexes))
    env))

(defn check-dirty [indexes keys ^:boolean check-pretend?]
  (let [len (alength keys)]
    (loop [ix 0]
      (when (< ix len)
        (let [key (aget keys ix)
              index (aget indexes key)]
          (if-not (nil? (.-dirty? index))
            (if check-pretend?
              true
              (if (true? (aget index "pretend?"))
                (recur (+ ix 1))
                true))
            (recur (+ ix 1))))))))

(defn set-dirty [indexes keys v]
  (dotimes [x (alength keys)]
    (let [key (aget keys x)
          index (aget indexes key)]
      (set! (.-dirty? index) v))))

(defn clear-pretends [indexes keys]
  (dotimes [x (alength keys)]
    (let [key (aget keys x)
          index (aget indexes key)]
      (when (aget index "pretend?")
        (aset indexes key (pretend-tree 20))))))

(defn fixpoint-tick [env func]
  (func env)
  (reconcile env)
  (let [indexes (aget env "indexes")
        keys (js/Object.keys indexes)]
    (loop [ix 0]
      (when (and (check-dirty indexes keys)
                 (< ix 3))

        (set-dirty indexes keys nil)
        (clear-pretends indexes keys)
        (func env)
        (reconcile env)
        (recur (+ ix 1))))))

(defn fixpoint-inner [env func]
  (func env)
  (let [ctx (aget env "ctx")
        indexes (aget ctx "update-indexes")
        keys (js/Object.keys indexes)]
    (loop [ix 0]
      (when (and (check-dirty indexes keys true)
                 (< ix 10))
        (set-dirty indexes keys nil true)
        (func env)
        (recur (+ ix 1))))))

;; TESTS

(defn magic-run-product-join-prop [min-keys key-len actions]
  (let [tree (apply-to-tree (tree min-keys key-len) actions)
        itr1 (iterator->keys (iterator tree))
        iterator-results #js []
        _ (dotimes [i (alength itr1)]
            (dotimes [j (alength itr1)]
              (.push iterator-results (.concat (aget itr1 i) (aget itr1 j)))))
        iterator-a (js/aurora.join.magic-iterator tree (let [arr (array)]
                                                         (dotimes [x key-len]
                                                           (.push arr x))
                                                         (dotimes [x key-len]
                                                           (.push arr nil))
                                                         arr
                                                         ))
        iterator-b (js/aurora.join.magic-iterator tree (let [arr (array)]
                                                         (dotimes [x key-len]
                                                           (.push arr nil))
                                                         (dotimes [x key-len]
                                                           (.push arr x))
                                                         arr
                                                         ))
        join-itr (js/aurora.join.join-iterator #js [iterator-a iterator-b])
        join-results (js/aurora.join.all-join-results join-itr)]
    (= (map vec iterator-results) (map vec join-results))))

(defn magic-product-join-prop [key-len]
  (prop/for-all [min-keys gen/s-pos-int
                 actions (gen/vector (gen-action key-len))]
                (magic-run-product-join-prop min-keys key-len actions)))

(defn magic-run-self-join-prop [min-keys key-len actions movements]
  (let [tree (apply-to-tree (tree min-keys key-len) actions)
        iterator-results (iterator->keys (iterator tree))

        iterator-a (js/aurora.join.magic-iterator tree (let [arr (array)]
                                                         (dotimes [x key-len]
                                                           (.push arr x))
                                                         arr
                                                         ))
        iterator-b (js/aurora.join.magic-iterator tree (let [arr (array)]
                                                         (dotimes [x key-len]
                                                           (.push arr x))
                                                         arr
                                                         ))
        join-itr (js/aurora.join.join-iterator #js [iterator-a iterator-b])
        join-results (iterator->keys join-itr)]
    (= (map vec iterator-results) (map vec join-results))))

(defn magic-self-join-prop [key-len]
  (prop/for-all [min-keys gen/s-pos-int
                 actions (gen/vector (gen-action key-len))
                 movements (gen/vector (gen-next key-len))] ;; TODO use gen-movement once Treeterator supports seek
                (magic-run-self-join-prop min-keys key-len actions movements)))

(comment
  (dc/quick-check 10000 (magic-self-join-prop 1))
  (dc/quick-check 10000 (magic-self-join-prop 2))
  (dc/quick-check 10000 (magic-self-join-prop 3))
  (dc/quick-check 10000 (magic-product-join-prop 1))
  (dc/quick-check 10000 (magic-product-join-prop 2))
  (dc/quick-check 10000 (magic-product-join-prop 3))

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
        itr1 (magic-iterator tree1 #js [0 1 2])
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
        itr1 (magic-iterator tree1 #js [0 1 2])
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
        itr1 (magic-iterator tree1 #js [0 1 2])
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
        itr1 (magic-iterator tree1 #js [0 1 2])
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
        _ (doseq [x [#js ["3" "4"]
                     #js [-3 -4]
                     ]]
            (.assoc! tree1 x 0))
        tree2 (tree 10)
        _ (doseq [x [#js ["3" "4"]
                     #js [-3 -4]
                     ]]
            (.assoc! tree2 x 0))
        itr1 (magic-iterator tree1 #js [0 1 nil nil])
        itr2 (magic-iterator tree2 #js [nil nil 0 1])
        _ (.clear js/console)
        join-itr (join-iterator #js [itr1 itr2])
        ]
;;     (assert
;;      (= (map vec (all-join-results join-itr))
;;         (map vec #js [#js [-3 -3] #js [-3 "3"]  #js ["3" -3] #js ["3" "3"] ])))

      (all-join-results join-itr)
    )


    (let [tree1 (tree 10)
        _ (doseq [x [#js ["1" "-5" "-5"]
                     #js [1 -6 "-6"]
                     #js ["-8" 2 "1"]
                     ]]
            (.assoc! tree1 x 0))
        _ (.clear js/console)
        itr1 (magic-iterator tree1 #js [0 1 2 nil nil nil])
        itr2 (magic-iterator tree1 #js [nil nil nil 0 1 2])
        join-itr (join-iterator #js [itr1 itr2])
        ]
;;     (assert
;;      (= (map vec (all-join-results join-itr))
;;         (map vec #js [#js [-3 -3] #js [-3 "3"]  #js ["3" -3] #js ["3" "3"] ])))

      (alength (all-join-results join-itr))
    )

  (let [tree1 (tree 10)
        _ (dotimes [i 10]
            (.assoc! tree1 #js [(js/Math.sin i) (js/Math.cos i) (js/Math.tan i)] i))
        _ (println tree1)
        itr1 (magic-iterator tree1 #js [0 1 2])
        itr2 (magic-iterator tree1 #js [0 1 2])
        _ (.clear js/console)
        join-itr (join-iterator #js [itr1 itr2])
        ]
    (assert
     (= (alength (all-join-results join-itr))
        10
        ))
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
                     #js [7]
                     #js [9]
                     ]]
            (.assoc! tree1 x 0))
        tree2 (tree 10)
        _ (doseq [x [#js [3]
                     #js [6]
                     #js [4]
                     #js [8]
                     #js [9]
                     ]]
            (.assoc! tree2 x 0))
        itr1 (magic-iterator tree1 #js [0])
        itr2 (magic-iterator tree2 #js [0])
        itr3 (magic-iterator tree1 #js [0])
        join-itr (join-iterator #js [itr1 itr2])
        join-itr2 (join-iterator #js [join-itr itr3])
        ]
    (assert
     (= (map vec (all-join-results join-itr2))
        (map vec #js [#js [4] #js [9] ])))
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
        itr1 (magic-iterator tree1 #js [0])
        itr2 (magic-iterator tree2 #js [0])
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
        itr1 (magic-iterator tree1 #js [0 1 2 3])
        itr2 (magic-iterator tree2 #js [nil 0 nil 1])
        join-itr (join-iterator #js [itr1 itr2])
        ]
    (assert
     (= (map vec (all-join-results join-itr))
        (map vec #js [#js [1 2 1 3] #js [1 2 3 3] ])))
    )



  (let [tree1 (tree 10)
        _ (doseq [x [#js [1 "get books" "active"]
                     #js [2 "buy milk" "active"]
                     #js [3 "learn spanish" "completed"]
                     ]]
            (.assoc! tree1 x 0))
        itr1 (magic-iterator tree1 #js [0 1 2])
        join-itr (join-iterator #js [itr1])
        ]
    (assert
      (= (map vec (all-join-results join-itr))
         (map vec #js [#js [1 "get books" "active"] #js [2 "buy milk" "active"] #js [3 "learn spanish" "completed"]])))

    )

    (let [tree1 (tree 10)
        _ (doseq [x [#js [1 "get books" "active"]
                     #js [2 "buy milk" "active"]
                     #js [3 "learn spanish" "completed"]
                     ]]
            (.assoc! tree1 x 0))
        itr1 (magic-iterator tree1 #js [0 1 2])
          filter (constant-filter 3 2 "completed")
        join-itr (join-iterator #js [itr1 filter])
        ]
     (assert
      (= (map vec (all-join-results join-itr))
         (map vec #js [#js [3 "learn spanish" "completed"]])))

    )


    (let [tree1 (tree 10)
        _ (doseq [x [#js [1 "get books" "active"]
                     #js [2 "buy milk" "active"]
                     #js [3 "learn spanish" "completed"]
                     #js [4 "learn something" "active"]
                     ]]
            (.assoc! tree1 x 0))
        tree2 (tree 10)
        _ (doseq [x [#js [1 "editing"]
                     #js [2 "editing"]
                     #js [3 "editing"]
                     #js [4 "editing"]
                     ]]
            (.assoc! tree2 x 0))
        itr1 (magic-iterator tree1 #js [0 1 2 nil])
        itr2 (magic-iterator tree2 #js [0 nil nil 1])
          filter (constant-filter 4 2 "active")
        join-itr (join-iterator #js [itr1 itr2 filter])
        ]
     (assert
      (= (map vec (all-join-results join-itr))
         (map vec #js [#js [1 "get books" "active" "editing"] #js [2 "buy milk" "active" "editing"] #js [4 "learn something" "active" "editing"]])))

    )

  (time (let [tree1 (tree 10)
             _ (dotimes [x 200]
                 (.assoc! tree1 #js [x (str "foo" x) "active"] x))
             tree2 (tree 10)
             _ (dotimes [x 200]
                 (.assoc! tree2 #js [x "editing"] x))
             tree3 (tree 10)
             _ (dotimes [x 200]
                 (.assoc! tree3 #js [x "asdf"] x))
             itr1 (magic-iterator tree1 #js [0 1 2 nil nil])
             itr2 (magic-iterator tree2 #js [0 nil nil 1 nil])
             itr3 (magic-iterator tree3 #js [0 nil nil nil 1])
             filter (constant-filter 5 2 "active")
             join-itr (join-iterator #js [itr1 itr2 itr3 filter])
             ]
         (transform join-itr (fn [cur remember! pretend! forget!]
                               (remember! #js [(aget cur 0) (aget cur 1) "completed"])
                               ))


         ))

)


