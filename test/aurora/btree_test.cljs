(ns aurora.btree-test
  (:require aurora.btree
            [cemerick.cljs.test :refer [run-all-tests]])
  (:require-macros [aurora.macros :refer [apush apush* lt lte gt gte set!! dofrom]]
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

(defspec iterator-prop-test
  5000
  (aurora.btree/iterator-prop 1))

(defspec intersection-prop-test
  500
  (aurora.btree/intersection-prop 1))

(defspec trie-tree-prop-test
  5000
  (aurora.btree/trie-tree-prop 1))

(defspec trie-tree-prop-test
  5000
  (aurora.btree/trie-tree-prop 2))

(defspec trie-tree-prop-test
  5000
  (aurora.btree/trie-tree-prop 3))

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

(comment
  (run-all-tests)

  )
