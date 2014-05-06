(ns aurora.btree-test
  (:require aurora.btree
            [cemerick.cljs.test :refer [run-all-tests]])
  (:require-macros [aurora.macros :refer [apush apush* lt lte gt gte set!! dofrom]]
                   [cemerick.double-check.clojure-test :refer [defspec]]))


(defspec least-prop-test
  1000
  aurora.btree/least-prop)

(defspec greatest-prop-test
  1000
  aurora.btree/greatest-prop)

(defspec equality-prop-test
  1000
  aurora.btree/equality-prop)

(defspec reflexive-prop-test
  1000
  aurora.btree/reflexive-prop)

(defspec transitive-prop-test
  1000
  aurora.btree/transitive-prop)

(defspec anti-symmetric-prop-test
  1000
  aurora.btree/anti-symmetric-prop)

(defspec total-prop-test
  100
  aurora.btree/total-prop)

(defspec building-assoc-test
  100
  (aurora.btree/building-prop aurora.btree/gen-assoc))

(defspec building-action-test
  100
  (aurora.btree/building-prop aurora.btree/gen-action))

(defspec lookup-action-test
  100
  (aurora.btree/lookup-prop aurora.btree/gen-action))

(defspec iterator-prop-test
  100
  aurora.btree/iterator-prop)

(defspec intersection-prop-test
  50
  aurora.btree/intersection-prop)

(comment
  (run-all-tests)

  )
