(ns aurora.dumbjoin
  (:require [aurora.btree :refer [tree iterator]]
            [aurora.join :refer [constant-filter]]))

(defn check-next [itrs cur-search results]
  (let [[itr map] (first itrs)
        len (alength map)
        itrs (next itrs)]
    (.reset itr)
    (while (not (.-end? itr))
      (println itr map)
      (let [filled (aclone cur-search)
            cur-key (.key itr)
            valid? (loop [ix 0]
                     (if-not (< ix len)
                       true
                       (let [mapped-k (aget map ix)
                             cur-val (aget cur-key ix)
                             cur-search-val (aget cur-search mapped-k)]
                         (aset filled mapped-k cur-val)
                         (when (or (= :u cur-search-val)
                                   (== cur-search-val cur-val))
                           (recur (inc ix))))))]
        (println cur-search cur-key valid? filled)
        (if valid?
          (if itrs
            (check-next itrs filled results)
            (.push results filled)))
        (.next itr)))))

(defn join [itrs len]
  (let [results (array)
        cur (array)]
    (dotimes [ix len]
      (aset cur ix :u))
    (check-next itrs cur results)
    results))

(def all-join-results identity)

(comment

  (let [tree1 (tree 10)
         _ (.assoc! tree1 #js ["a" "b"] 0)
         _ (.assoc! tree1 #js ["b" "c"] 0)
        tree2 (tree 10)
        _ (.assoc! tree2 #js ["b" "d"] 0)
        _ (.assoc! tree2 #js ["c" "b"] 0)
        itr1 (iterator tree1)
        itr2 (iterator tree2)
         results (join [[itr1 #js [0 2]] [itr2 #js [1 2]]] 3)
        ]
     (vec results)
     ;["a" "c" "b"]
    )

  (let [tree (tree 10)
        _ (dotimes [i 2]
            (let [i (+ i 0)]
              (.assoc! tree #js [i i] (* 2 i))))
        results (join [[(iterator tree) #js [0 3]]
                       [(iterator tree) #js [1 4]]
                       [(iterator tree) #js [2 5]]]
                      6)]
    (assert
     (= (map vec results)
        (map vec #js [#js [0 0 0 0 0 0] #js [0 0 1 0 0 1] #js [0 1 0 0 1 0] #js [0 1 1 0 1 1] #js [1 0 0 1 0 0] #js [1 0 1 1 0 1] #js [1 1 0 1 1 0] #js [1 1 1 1 1 1]])))
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
        itr1 [(iterator tree1) #js [0 1 2]]
        itr2 [(iterator tree2) #js [0 2]]
        results (join [itr1 itr2] 3)
        ]
    (assert
     (= (map vec results)
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
        itr1 [(iterator tree1) #js [0 1 2]]
        itr2 [(iterator tree2) #js [0 2]]
        results (join [itr1 itr2] 3)
        ]

    (assert
     (= (map vec results)
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
        itr1 [(iterator tree1) #js [0 1 2]]
        itr2 [(iterator tree2) #js [1 2]]
        results (join [itr1 itr2] 3)
        ]
    (assert
     (= (map vec results)
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
        itr1 [(iterator tree1) #js [0 1 2]]
        itr2 [(iterator tree2) #js [1 2]]
        itr3 [(iterator tree3) #js [0 2]]
        results (join [itr1 itr2 itr3] 3)
        ]
    (.clear js/console)
    (assert
     (= (map vec results)
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
        itr1 [(iterator tree1) #js [0]]
        itr2 [(iterator tree2) #js [1]]
        _ (.clear js/console)
        results (join [itr1 itr2] 2)
        ]
    (assert
     (= (map vec results)
        (map vec #js [#js [-3 -3] #js [-3 "3"]  #js ["3" -3] #js ["3" "3"] ])))
    )


    (let [tree1 (tree 10)
        _ (doseq [x [#js ["1" "-5" "-5"]
                     #js [1 -6 "-6"]
                     #js ["-8" 2 "1"]
                     ]]
            (.assoc! tree1 x 0))
        _ (.clear js/console)
          itr1 [(iterator tree1) #js [0 1 2]]
          itr2 [(iterator tree1) #js [3 4 5]]
        results (join #js [itr1 itr2] 6)
        ]
;;     (assert
;;      (= (map vec (all-join-results join-itr))
;;         (map vec #js [#js [-3 -3] #js [-3 "3"]  #js ["3" -3] #js ["3" "3"] ])))

      results
    )

  (let [tree1 (tree 10)
        _ (dotimes [i 10]
            (.assoc! tree1 #js [(js/Math.sin i) (js/Math.cos i) (js/Math.tan i)] i))
        _ (println tree1)
        itr1 [(iterator tree1) #js [0 1 2]]
        itr2 [(iterator tree1) #js [0 1 2]]
        _ (.clear js/console)
        results (join #js [itr1 itr2] 3)
        ]
    (assert
     (= (alength results)
        10
        ))
    )


  (let [tree1 (tree 10)
        _ (doseq [x [#js [0 "-1" "1"]
                     ]]
            (.assoc! tree1 x 0))
        itr1 [(iterator tree1) #js [0 1 2]]
        itr2 [(iterator tree1) #js [3 4 5]]
        _ (.clear js/console)
        results (join #js [itr1 itr2] 6)
        ]
     (assert
      (= (map vec results)
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
        itr1 [(iterator tree1) #js [0]]
        itr2 [(iterator tree2) #js [0]]
        itr3 [(iterator tree1) #js [0]]
        results (join #js [itr1 itr2 itr3] 1)
        ]
    (assert
     (= (map vec results)
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
        itr1 [(iterator tree1) #js [0]]
        itr2 [(iterator tree2) #js [0]]
        results (join #js [itr1 itr2] 1)
        ]
    (assert
     (= (map vec results)
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
        itr1 [(iterator tree1) #js [0]]
        itr2 [(iterator tree2) #js [1]]
        results (join #js [itr1 itr2] 2)
        ]
    (.clear js/console)
    (assert
     (= (map vec results)
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
        itr1 [(iterator tree1) #js [0 1 2 3]]
        itr2 [(iterator tree2) #js [1 3]]
        join-itr (join #js [itr1 itr2] 4)
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
        itr1 [(iterator tree1) #js [0 1 2]]
        join-itr (join #js [itr1] 3)
        ]
    (assert
      (= (map vec (all-join-results join-itr))
         (map vec #js [#js [1 "get books" "active"] #js [2 "buy milk" "active"] #js [3 "learn spanish" "completed"]])))

    )

  (let [tree1 (tree 10)
        _ (.assoc! tree1 #js ["a" "b"] 0)
        _ (.assoc! tree1 #js ["b" "c"] 0)
        _ (.assoc! tree1 #js ["c" "d"] 0)
        tree2 (tree 10)
        _ (.assoc! tree2 #js ["b" "a"])
        _ (.assoc! tree2 #js ["c" "b"])
        _ (.assoc! tree2 #js ["d" "c"])
        itr1 [(iterator tree1) #js [0 2]]
        itr2 [(iterator tree2) #js [1 2]]
        join-itr (join #js [itr1 itr2] 3)
        ]
     (map vec (all-join-results join-itr))
    )

  (let [tree1 (tree 10)
        _ (.assoc! tree1 #js ["a" "b"] 0)
        _ (.assoc! tree1 #js ["b" "c"] 0)
        _ (.assoc! tree1 #js ["c" "d"] 0)
        _ (.assoc! tree1 #js ["d" "b"] 0)
        tree2 (tree 10)
        _ (.assoc! tree2 #js ["b" "a"])
        _ (.assoc! tree2 #js ["c" "b"])
        _ (.assoc! tree2 #js ["d" "c"])
        _ (.assoc! tree2 #js ["b" "d"])
        itr1 [(iterator tree1) #js [0 2]]
        itr2 [(iterator tree2) #js [1 2]]
        join-itr (join #js [itr1 itr2] 3)
        ]
     (map vec (all-join-results join-itr)))





  )

