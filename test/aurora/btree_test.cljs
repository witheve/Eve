(ns aurora.btree-test
  (:require [aurora.btree :refer [tree]]
            [aurora.join :refer [magic-iterator join-iterator all-join-results constant-filter]]
            [cemerick.cljs.test :refer [run-all-tests]])
  (:require-macros [aurora.macros :refer [apush apush* lt lte gt gte set!! dofrom]]
                   [cemerick.cljs.test :refer [deftest is]]
                   [cemerick.double-check.clojure-test :refer [defspec]]))


(defspec least-prop-test
  1000
  (aurora.btree/least-prop 1))

(defspec least-prop-test
  1000
  (aurora.btree/least-prop 2))

(defspec greatest-prop-test
  1000
  (aurora.btree/greatest-prop 1))

(defspec greatest-prop-test
  1000
  (aurora.btree/greatest-prop 2))

(defspec equality-prop-test
  1000
  (aurora.btree/equality-prop 1))

(defspec equality-prop-test
  1000
  (aurora.btree/equality-prop 2))

(defspec reflexive-prop-test
  1000
  (aurora.btree/reflexive-prop 1))

(defspec reflexive-prop-test
  1000
  (aurora.btree/reflexive-prop 2))

(defspec transitive-prop-test
  1000
  (aurora.btree/transitive-prop 1))

(defspec transitive-prop-test
  1000
  (aurora.btree/transitive-prop 2))

(defspec anti-symmetric-prop-test
  1000
  (aurora.btree/anti-symmetric-prop 1))

(defspec anti-symmetric-prop-test
  1000
  (aurora.btree/anti-symmetric-prop 2))

(defspec total-prop-test
  5000
  (aurora.btree/total-prop 1))

(defspec building-assoc-test
  5000
  (aurora.btree/building-prop aurora.btree/gen-assoc 1))

(defspec building-action-test
  5000
  (aurora.btree/building-prop aurora.btree/gen-action 1))

(defspec lookup-action-test
  5000
  (aurora.btree/lookup-prop aurora.btree/gen-action 1))

(defspec range-action-test
  5000
  (aurora.btree/range-prop 1))

(defspec iterator-prop-test
  5000
  (aurora.btree/iterator-prop 1))

(defspec self-join-prop-test
  5000
  (aurora.btree/self-join-prop 1))

(defspec self-join-prop-test
  5000
  (aurora.btree/self-join-prop 2))

(defspec self-join-prop-test
  5000
  (aurora.btree/self-join-prop 3))

(defspec product-join-prop-test
  5000
  (aurora.btree/product-join-prop 1))

(defspec product-join-prop-test
  5000
  (aurora.btree/product-join-prop 2))

(defspec product-join-prop-test
  5000
  (aurora.btree/product-join-prop 3))

;;; MAGIC!


(defspec magic-self-join-prop-test-1
  100
  (aurora.btree/magic-self-join-prop 1))

(defspec magic-self-join-prop-test-2
  100
  (aurora.btree/magic-self-join-prop 2))

(defspec magic-self-join-prop-test-3
  100
  (aurora.btree/magic-self-join-prop 3))

(defspec magic-product-join-prop-test-1
  100
  (aurora.btree/magic-product-join-prop 1))

(defspec magic-product-join-prop-test-2
  100
  (aurora.btree/magic-product-join-prop 2))

(defspec magic-product-join-prop-test-3
  100
  (aurora.btree/magic-product-join-prop 3))

(deftest join-3-2
  (println "testing: join-3-2")
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
    (is
     (= (map vec (all-join-results join-itr))
        (map vec #js [#js [0 1 6] #js [1 1 7] #js [1 2 7] #js [1 3 3] ])))
    ))

(deftest join-3-2-again
  (println "testing: join-3-2-again")
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

    (is
     (= (map vec (all-join-results join-itr))
        (map vec #js [#js [1 0 1] #js [1 2 3] #js [1 3 1] #js [1 4 4]])))
    ))

(deftest join-3-2-again2
  (println "testing: join-3-2-again2")
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
    (is
     (= (map vec (all-join-results join-itr))
        (map vec #js [#js [1 2 3] #js [1 4 4] #js [2 2 3] ])))
    ))

(deftest join-3-2-2
  (println "testing: join-3-2-2")
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

    (is
     (= (map vec (all-join-results join-itr))
        (map vec #js [#js [1 2 3] #js [1 4 4] ])))
    ))

(deftest join-product
  (println "testing: join-product")
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
        join-itr (join-iterator #js [itr1 itr2])
        ]
    (is
     (= (map vec (all-join-results join-itr))
        (map vec #js [#js [-3 -3] #js [-3 "3"]  #js ["3" -3] #js ["3" "3"] ])))
    ))

(deftest self-join
  (println "testing: self-join")
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
    (is
     (= (map vec (all-join-results join-itr))
        (map vec #js [#js [4] ])))
    ))

(deftest join-product-2
  (println "testing: join-product-2")
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
    (is
     (= (map vec (all-join-results join-itr))
        (map vec #js [#js [1 3] #js [1 4] #js [1 6] #js [2 3] #js [2 4] #js [2 6] #js [4 3] #js [4 4] #js [4 6] ])))
    ))

(deftest join-4-2-offest
  (println "testing: join-4-2-offset")
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
    (is
     (= (map vec (all-join-results join-itr))
        (map vec #js [#js [1 2 1 3] #js [1 2 3 3] ])))
    ))

(deftest join-join
  (println "testing: join-join")
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
    (is
     (= (map vec (all-join-results join-itr2))
        (map vec #js [#js [4] #js [9] ])))
    ))

(deftest one-itr-join
  (println "testing: one-itr-join")
  (let [tree1 (tree 10)
        _ (doseq [x [#js [1 "get books" "active"]
                     #js [2 "buy milk" "active"]
                     #js [3 "learn spanish" "completed"]
                     ]]
            (.assoc! tree1 x 0))
        itr1 (magic-iterator tree1 #js [0 1 2])
        join-itr (join-iterator #js [itr1])
        ]
    (is
     (= (map vec (all-join-results join-itr))
        (map vec #js [#js [1 "get books" "active"] #js [2 "buy milk" "active"] #js [3 "learn spanish" "completed"]])))

    ))

  (deftest simple-filter
    (println "testing: simple-filter")
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
      (is
       (= (map vec (all-join-results join-itr))
          (map vec #js [#js [3 "learn spanish" "completed"]])))

      ))


  (deftest todomvc-filter
    (println "testing: todomvc-filter")
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
      (is
       (= (map vec (all-join-results join-itr))
          (map vec #js [#js [1 "get books" "active" "editing"] #js [2 "buy milk" "active" "editing"] #js [4 "learn something" "active" "editing"]])))

      ))


(comment
  (run-all-tests)

  )
